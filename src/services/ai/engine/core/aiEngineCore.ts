import { AITransport, StreamEvent } from '../transport/types';
import { AIEngineCore, StreamTextOptions, StreamTextResult, TokenUsage } from './types';
import { prepareModelRequest } from './protocolAdapter';

function hasCompleteArtifact(raw: string): boolean {
  const lower = raw.toLowerCase();
  const start = lower.indexOf('<artifact');
  if (start < 0) return false;
  const openingEnd = lower.indexOf('>', start);
  return openingEnd >= 0 && lower.indexOf('</artifact>', openingEnd + 1) >= 0;
}

export class DefaultAIEngineCore implements AIEngineCore {
  constructor(private transport: AITransport) {}

  public setTransport(transport: AITransport) {
    this.transport = transport;
  }

  public getTransport(): AITransport {
    return this.transport;
  }

  public streamText(options: StreamTextOptions): StreamTextResult {
    const { transportRequest, estimatedInputChars } = prepareModelRequest(options);

    let rawAccumulated = '';
    let finalUsage: TokenUsage | undefined;
    let isInsideThink = false;

    // Async queues for textStream and reasoningStream
    const textQueue: string[] = [];
    const reasoningQueue: string[] = [];
    let textResolvers: Array<() => void> = [];
    let reasoningResolvers: Array<() => void> = [];
    let isStreamDone = false;
    let streamError: Error | null = null;
    let recoverableStreamError = false;

    const notifyText = (chunk: string) => {
      textQueue.push(chunk);
      const res = textResolvers.shift();
      if (res) res();
    };

    const notifyReasoning = (chunk: string) => {
      reasoningQueue.push(chunk);
      const res = reasoningResolvers.shift();
      if (res) res();
    };

    const finishQueues = () => {
      isStreamDone = true;
      textResolvers.forEach((res) => res());
      reasoningResolvers.forEach((res) => res());
      textResolvers = [];
      reasoningResolvers = [];
    };

    let resolveText: (val: string) => void;
    let rejectText: (err: any) => void;
    const textPromise = new Promise<string>((res, rej) => {
      resolveText = res;
      rejectText = rej;
    });

    let resolveReasoning: (val: string | undefined) => void;
    const reasoningPromise = new Promise<string | undefined>((res) => {
      resolveReasoning = res;
    });

    let resolveUsage: (val: TokenUsage | undefined) => void;
    const usagePromise = new Promise<TokenUsage | undefined>((res) => {
      resolveUsage = res;
    });

    let resolveRecovery: (val: string | undefined) => void;
    const recoveryPromise = new Promise<string | undefined>((res) => {
      resolveRecovery = res;
    });

    const handleEvent = (ev: StreamEvent) => {
      if (ev.type === 'Delta') {
        const deltaText = ev.text;
        rawAccumulated += deltaText;

        // Process thinking vs content
        let remaining = deltaText;
        while (remaining.length > 0) {
          if (!isInsideThink) {
            const thinkStart = remaining.indexOf('<think>');
            if (thinkStart !== -1) {
              if (thinkStart > 0) {
                notifyText(remaining.slice(0, thinkStart));
              }
              isInsideThink = true;
              remaining = remaining.slice(thinkStart + 7);
            } else {
              notifyText(remaining);
              remaining = '';
            }
          } else {
            const thinkEnd = remaining.indexOf('</think>');
            if (thinkEnd !== -1) {
              if (thinkEnd > 0) {
                notifyReasoning(remaining.slice(0, thinkEnd));
              }
              isInsideThink = false;
              remaining = remaining.slice(thinkEnd + 8);
            } else {
              notifyReasoning(remaining);
              remaining = '';
            }
          }
        }
      } else if (ev.type === 'Usage') {
        finalUsage = {
          inputTokens: ev.input_tokens,
          outputTokens: ev.output_tokens
        };
      } else if (ev.type === 'Done') {
        finishQueues();
      } else if (ev.type === 'Error') {
        streamError = new Error(`[${ev.kind}] ${ev.message}`);
        recoverableStreamError = ev.kind === 'network_error' || ev.kind === 'timeout';
        finishQueues();
      }
    };

    const { abort, promise: transportPromise } = this.transport.stream(transportRequest, handleEvent);

    if (options.signal) {
      if (options.signal.aborted) {
        abort();
      } else {
        options.signal.addEventListener('abort', () => abort(), { once: true });
      }
    }

    const completeWithText = (recoveryMessage?: string) => {
      // Final extraction of text & reasoning
      const thinkMatch = rawAccumulated.match(/<think>([\s\S]*?)(?:<\/think>|$)/i);
      const reasoning = thinkMatch ? thinkMatch[1].trim() : undefined;
      const cleanText = rawAccumulated.replace(/<think>[\s\S]*?(?:<\/think>|$)/i, '').trim();

      if (!finalUsage && rawAccumulated.length > 0) {
        finalUsage = {
          inputTokens: Math.max(1, Math.round(estimatedInputChars / 3.5)),
          outputTokens: Math.max(1, Math.round(rawAccumulated.replace(/<\/?think>/g, '').length / 3.5))
        };
      }

      resolveText(cleanText);
      resolveReasoning(reasoning);
      resolveUsage(finalUsage);
      resolveRecovery(recoveryMessage);
    };

    transportPromise
      .then(() => {
        finishQueues();
        if (streamError) {
          if (recoverableStreamError && hasCompleteArtifact(rawAccumulated)) {
            completeWithText(streamError.message);
          } else {
            rejectText(streamError);
            resolveReasoning(undefined);
            resolveUsage(finalUsage);
            resolveRecovery(undefined);
          }
          return;
        }

        completeWithText();
      })
      .catch((err) => {
        finishQueues();
        if (hasCompleteArtifact(rawAccumulated)) {
          completeWithText(err instanceof Error ? err.message : String(err));
        } else {
          rejectText(err);
          resolveReasoning(undefined);
          resolveUsage(finalUsage);
          resolveRecovery(undefined);
        }
      });

    const createAsyncIterable = (queue: string[], resolvers: Array<() => void>): AsyncIterable<string> => ({
      [Symbol.asyncIterator]() {
        return {
          async next() {
            while (queue.length === 0) {
              if (isStreamDone) {
                return { done: true, value: undefined };
              }
              await new Promise<void>((r) => resolvers.push(r));
            }
            return { done: false, value: queue.shift()! };
          }
        };
      }
    });

    return {
      textStream: createAsyncIterable(textQueue, textResolvers),
      reasoningStream: createAsyncIterable(reasoningQueue, reasoningResolvers),
      textPromise,
      reasoningPromise,
      usagePromise,
      recoveryPromise,
      abort
    };
  }

  public async generateObject<T>(
    schema: Record<string, unknown>,
    options: Omit<StreamTextOptions, 'jsonSchema'>
  ): Promise<T> {
    const res = this.streamText({ ...options, jsonSchema: schema });
    const raw = await res.textPromise;
    // Extract JSON block if surrounded by markdown codeblock
    const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const textToParse = jsonMatch ? jsonMatch[1].trim() : raw.trim();
    return JSON.parse(textToParse) as T;
  }
}
