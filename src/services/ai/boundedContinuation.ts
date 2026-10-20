import type { AIProviderConfig } from '../../types/provider';
import type { AIEngineCore, StreamTextOptions, TokenUsage } from './engine/core/types';
import { htmlIsComplete } from '../../utils/htmlCompleteness';
import { extractArtifact } from './engine/pipeline/interceptors/streamTransform';

/** Deliberately narrower than the documented families; never infer proxy capabilities. */
export function supportsNativeContinuation(provider: AIProviderConfig, model: string): boolean {
  if (provider.protocol !== 'openai_compatible' || !['qwen-plus', 'qwen-max', 'qwen-flash', 'qwen-turbo', 'qwen3-coder-plus', 'qwen3-coder-flash'].includes(model)) return false;
  try {
    const url = new URL(provider.baseUrl.trim());
    return url.protocol === 'https:' && !url.username && !url.password && !url.port && !url.search && !url.hash
      && /^[a-z0-9-]+\.(cn-beijing|ap-southeast-1)\.maas\.aliyuncs\.com$/.test(url.hostname)
      && /^\/compatible-mode\/v1(?:\/chat\/completions)?\/?$/.test(url.pathname);
  } catch { return false; }
}

export interface ContinuationResult {
  rawResponse: string;
  reasoningText?: string;
  usage?: TokenUsage;
  finishReason?: string;
  recoveredStreamError?: string;
  warnings: string[];
  errorMessage?: string;
}

export async function streamWithContinuation(core: AIEngineCore, options: StreamTextOptions,
  callbacks: { onText?: (text: string) => void; onReasoning?: (text: string) => void; allowContinuation?: boolean } = {}): Promise<ContinuationResult> {
  const result: ContinuationResult = { rawResponse: '', warnings: [] };
  const initialBudget = Math.min(options.maxTokens ?? 8192, 32768);
  let requestedTokens = 0;
  let continuations = 0;
  while (true) {
    if (options.signal?.aborted) return { ...result, errorMessage: '生成已取消' };
    const prefix = result.rawResponse;
    const maxTokens = continuations ? Math.min(8192, 32768 - requestedTokens) : initialBudget;
    requestedTokens += maxTokens;
    const request: StreamTextOptions = { ...options, maxTokens,
      messages: continuations ? [...options.messages, { role: 'assistant', content: prefix, partial: true }] : options.messages };
    let suffix = '';
    let observedText = '';
    let textResolved = false;
    let transportRecovery: string | undefined;
    try {
      const stream = core.streamText(request);
      let active = true;
      let metadataActive = true;
      let rejectAbort!: (error: Error) => void;
      const cancelled = new Promise<never>((_resolve, reject) => { rejectAbort = reject; });
      const abort = () => {
        active = false;
        rejectAbort(new DOMException('生成已取消', 'AbortError'));
        try { stream.abort(); } catch { /* cancellation must not depend on transport cooperation */ }
      };
      options.signal?.addEventListener('abort', abort, { once: true });
      try {
        const consume = async (iterable: AsyncIterable<string>, cb?: (text: string) => void) => {
          try { for await (const chunk of iterable) { if (!active) break; cb?.(chunk); } } catch { /* textPromise is authoritative */ }
        };
        // Observe each metadata promise independently: cancellation must retain settled usage
        // without waiting for an unrelated reasoning/finish promise that may never resolve.
        const metadata = Promise.all([
          stream.reasoningPromise.then(reasoning => { if (metadataActive && reasoning) result.reasoningText = (result.reasoningText ?? '') + reasoning; }),
          stream.usagePromise.then(usage => { if (metadataActive && usage) result.usage = {
            inputTokens: (result.usage?.inputTokens ?? 0) + usage.inputTokens,
            outputTokens: (result.usage?.outputTokens ?? 0) + usage.outputTokens
          }; }),
          Promise.resolve(stream.recoveryPromise).then(recovery => { if (metadataActive && recovery) { result.recoveredStreamError = recovery; transportRecovery = recovery; } }),
          Promise.resolve(stream.finishReasonPromise).then(finish => { if (metadataActive) result.finishReason = finish; })
        ]);
        // Attach a handler immediately even while textPromise is still pending.
        void metadata.catch(() => {});
        const consuming = Promise.all([
          consume(stream.textStream, text => { observedText += text; if (!continuations) callbacks.onText?.(text); }),
          consume(stream.reasoningStream, callbacks.onReasoning)
        ]);
        const complete = (async () => {
          try {
            const text = await stream.textPromise;
            if (active) { suffix = text; textResolved = true; }
          } finally { await metadata; await consuming; }
        })();
        if (options.signal?.aborted) abort();
        await Promise.race([complete, cancelled]);
      } finally {
        active = false;
        metadataActive = false;
        options.signal?.removeEventListener('abort', abort);
      }
      if (continuations && transportRecovery) throw new Error(`续写网络中断，已停止：${transportRecovery}`);
      if (options.signal?.aborted) throw new DOMException('生成已取消', 'AbortError');
      if (continuations && (!suffix.trim() || suffix.trimStart().startsWith(prefix.trimStart()))) throw new Error(suffix.trim() ? '续写重复返回原始前缀，已停止。' : '续写没有进展，已停止。');
      result.rawResponse += suffix;
      if (continuations) {
        callbacks.onText?.(suffix);

      }
    } catch (error) {
      // Retain usage and prior bytes for diagnostics, but never turn a failed request into a candidate.
      if (!textResolved || options.signal?.aborted) result.rawResponse += textResolved ? suffix : observedText;
      result.errorMessage = error instanceof Error ? error.message : String(error);
      result.warnings.push(result.errorMessage);
      return result;
    }
    const artifact = extractArtifact(result.rawResponse);
    const incomplete = artifact && (!artifact.isComplete || !htmlIsComplete(artifact.html));
    if (callbacks.allowContinuation === false || result.finishReason !== 'length' || !incomplete || transportRecovery) return result;
    if (!supportsNativeContinuation(options.provider, options.model)) {
      result.warnings.push('此模型或端点未验证原生续写能力；请重试或拆分为局部/区块修改。');
      return result;
    }
    if (continuations >= 2 || requestedTokens >= 32768) {
      result.warnings.push('续写达到2次或累计32768请求输出Token上限；请拆分修改。');
      return result;
    }
    continuations++;
    result.warnings.push(`原生续写第${continuations}次，累计请求输出预算${requestedTokens + Math.min(8192, 32768 - requestedTokens)} tokens。`);
  }
}
