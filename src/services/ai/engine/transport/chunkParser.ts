import { StreamEvent } from './types';

export class SSEChunkParser {
  private buffer = '';
  private currentEvent = 'message';
  private isInsideThinkTag = false;

  constructor(private onEvent: (ev: StreamEvent) => void) {}

  public feed(chunk: string) {
    this.buffer += chunk;

    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Check Ollama raw JSON lines
      if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        try {
          const parsed = JSON.parse(trimmed);
          if (parsed.message?.content) {
            this.onEvent({ type: 'Delta', text: parsed.message.content });
          }
          if (parsed.done) {
            this.onEvent({ type: 'Done', finish_reason: parsed.done_reason || 'stop' });
          }
          continue;
        } catch {
          // not json
        }
      }

      if (trimmed.startsWith('event:')) {
        this.currentEvent = trimmed.slice(6).trim();
        continue;
      }

      let dataStr = '';
      if (trimmed.startsWith('data:')) {
        dataStr = trimmed.slice(5).trim();
      } else {
        continue;
      }

      if (dataStr === '[DONE]') {
        if (this.isInsideThinkTag) {
          this.isInsideThinkTag = false;
          this.onEvent({ type: 'Delta', text: '\n</think>\n\n' });
        }
        this.onEvent({ type: 'Done', finish_reason: 'stop' });
        continue;
      }

      try {
        const data = JSON.parse(dataStr);

        if (data.error || this.currentEvent === 'error' || data.type === 'error') {
          const errorText = data.error?.message || data.message || JSON.stringify(data);
          this.onEvent({
            type: 'Error',
            kind: 'invalid_response',
            message: `API 错误: ${errorText}`
          });
          return;
        }

        // OpenAI reasoning_content
        const reasoningDelta =
          data.choices?.[0]?.delta?.reasoning_content ??
          data.choices?.[0]?.delta?.reasoning ??
          (data.type === 'content_block_delta' && data.delta?.type === 'thinking_delta' ? data.delta.thinking : null);

        if (reasoningDelta) {
          if (!this.isInsideThinkTag) {
            this.isInsideThinkTag = true;
            this.onEvent({ type: 'Delta', text: '<think>\n' + reasoningDelta });
          } else {
            this.onEvent({ type: 'Delta', text: reasoningDelta });
          }
        }

        // Standard content delta
        const delta =
          data.choices?.[0]?.delta?.content ??
          data.choices?.[0]?.text ??
          data.delta?.text ??
          (data.type === 'content_block_delta' && data.delta?.type === 'text_delta' ? data.delta.text : null) ??
          data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (delta) {
          if (this.isInsideThinkTag) {
            this.isInsideThinkTag = false;
            this.onEvent({ type: 'Delta', text: '\n</think>\n\n' + delta });
          } else {
            this.onEvent({ type: 'Delta', text: delta });
          }
        }

        // Usage event
        const inTok = data.usage?.prompt_tokens ?? data.usage?.input_tokens;
        const outTok = data.usage?.completion_tokens ?? data.usage?.output_tokens;
        if (typeof inTok === 'number' && typeof outTok === 'number') {
          this.onEvent({ type: 'Usage', input_tokens: inTok, output_tokens: outTok });
        }

        // Finish reason
        const finishReason =
          data.choices?.[0]?.finish_reason ??
          data.candidates?.[0]?.finishReason ??
          data.delta?.stop_reason ?? data.stop_reason ??
          (data.type === 'message_stop' ? 'stop' : null);

        if (finishReason) {
          if (this.isInsideThinkTag) {
            this.isInsideThinkTag = false;
            this.onEvent({ type: 'Delta', text: '\n</think>\n\n' });
          }
          this.onEvent({ type: 'Done', finish_reason: finishReason });
        }
      } catch {
        // partial chunk parse error
      }
    }
  }

  public finish() {
    if (this.isInsideThinkTag) {
      this.isInsideThinkTag = false;
      this.onEvent({ type: 'Delta', text: '\n</think>\n\n' });
    }
  }
}
