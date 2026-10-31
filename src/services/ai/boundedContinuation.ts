import type { AIProviderConfig } from '../../types/provider';
import type { AIEngineCore, StreamTextOptions, TokenUsage } from './engine/core/types';
import { htmlIsComplete } from '../../utils/htmlCompleteness';
import { extractArtifact } from './engine/pipeline/interceptors/streamTransform';
import { contentFingerprint } from './designWorkflow';
import { isOutputLimit, portableContinuation, readContinuationSuffix, continuationBindingKey, continuationContextKey, type ContinuationCheckpoint } from './generationContinuation';

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
  continuationCount: number;
  recoveredStreamError?: string;
  warnings: string[];
  errorMessage?: string;
  checkpoint?: ContinuationCheckpoint;
  /** Present when a caller explicitly supplies a smaller batch budget. */
  requestedOutputTokens?: number;
}

export async function streamWithContinuation(core: AIEngineCore, options: StreamTextOptions,
  callbacks: { onText?: (text: string) => void; onReasoning?: (text: string) => void; allowContinuation?: boolean;
    resume?: ContinuationCheckpoint; contextKey?: string; onContinuation?: (attempt: number, mode: 'native' | 'portable') => void;
    budget?: {maxRequestedTokens?:number;autoContinuations?:number;continuationTokens?:number} } = {}): Promise<ContinuationResult> {
  const result: ContinuationResult = { rawResponse: '', warnings: [], continuationCount: 0 };
  const cap=(value:number|undefined,fallback:number,max:number)=>Number.isInteger(value)&&value!>=1?Math.min(value!,max):fallback;
  const totalBudget=cap(callbacks.budget?.maxRequestedTokens,32768,32768);
  const continuationBudget=cap(callbacks.budget?.continuationTokens,8192,8192);
  const autoCap=Number.isInteger(callbacks.budget?.autoContinuations)&&callbacks.budget!.autoContinuations!>=0?Math.min(callbacks.budget!.autoContinuations!,2):2;
  if(callbacks.budget)result.requestedOutputTokens=0;
  const contextKey = callbacks.contextKey ?? continuationContextKey(options.messages);
  const bindingKey = continuationBindingKey(options);
  const resume = callbacks.resume;
  if (resume && (resume.version !== 1 || resume.contextKey !== contextKey || resume.bindingKey !== bindingKey ||
    !resume.prefix || resume.prefix.length > 120000 || resume.prefixFingerprint !== contentFingerprint(resume.prefix) ||
    !Array.isArray(resume.messages) || resume.messagesFingerprint !== continuationContextKey(resume.messages) ||
    !Number.isInteger(resume.previousContinuations) || resume.previousContinuations < 0 || resume.previousContinuations > 1000)) {
    return { ...result, errorMessage: '续写检查点或工程/模型上下文已变化，请重新生成。' };
  }
  const originalMessages = resume ? structuredClone(resume.messages) : options.messages;
  if (resume) { result.rawResponse = resume.prefix; result.continuationCount = resume.previousContinuations; }
  const keepCheckpoint = () => {
    if (result.rawResponse && originalMessages.reduce((n,m)=>n+m.content.length,result.rawResponse.length) <= 120000) result.checkpoint = { version: 1, prefix: result.rawResponse,
      prefixFingerprint: contentFingerprint(result.rawResponse), contextKey, bindingKey, messages: structuredClone(originalMessages),
      messagesFingerprint: continuationContextKey(originalMessages), previousContinuations: result.continuationCount };
    return result;
  };
  const initialBudget = Math.min(options.maxTokens ?? 8192, totalBudget);
  let requestedTokens = 0;
  let continuations = 0;
  while (true) {
    if (options.signal?.aborted) return { ...result, errorMessage: '生成已取消' };
    const prefix = result.rawResponse;
    const continuing = continuations > 0 || Boolean(resume);
    const native = continuing && supportsNativeContinuation(options.provider, options.model);
    const portable = continuing && !native ? portableContinuation(originalMessages, prefix) : undefined;
    if (continuing && originalMessages.reduce((n,m)=>n+m.content.length, prefix.length) > 120000) {
      result.finishReason = 'length';
      if (continuations) result.continuationCount--;
      result.warnings.push('续写上下文已达到安全预算，不能继续同页；请拆分为多个页面或区块。');return result;
    }
    const maxTokens = continuing ? Math.min(continuationBudget, totalBudget - requestedTokens) : initialBudget;
    requestedTokens += maxTokens;
    if(callbacks.budget)result.requestedOutputTokens=requestedTokens;
    const request: StreamTextOptions = { ...options, maxTokens,
      messages: native ? [...originalMessages, { role: 'assistant', content: prefix, partial: true }] : portable?.messages ?? originalMessages };
    if (resume && continuations === 0) result.continuationCount++;
    if (continuing) callbacks.onContinuation?.(result.continuationCount, native ? 'native' : 'portable');
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
          consume(stream.textStream, text => { observedText += text; if (!continuing) callbacks.onText?.(text); }),
          consume(stream.reasoningStream, callbacks.onReasoning)
        ]);
        const complete = (async () => {
          // A fatal body failure (including the parent deadline) is authoritative.
          // Waiting for noncooperative iterators/metadata in finally would hide it.
          const text = await stream.textPromise;
          if (active) { suffix = text; textResolved = true; }
          await metadata;await consuming;
        })();
        if (options.signal?.aborted) abort();
        await Promise.race([complete, cancelled]);
      } finally {
        active = false;
        metadataActive = false;
        options.signal?.removeEventListener('abort', abort);
      }
      if (continuing && transportRecovery) throw new Error(`续写网络中断，已停止：${transportRecovery}`);
      if (options.signal?.aborted) throw new DOMException('生成已取消', 'AbortError');
      if (portable) suffix = readContinuationSuffix(suffix, portable.marker, prefix);
      if (continuing && (!suffix.trim() || suffix.trimStart().startsWith(prefix.trimStart()))) throw new Error(suffix.trim() ? '续写重复返回原始前缀，已停止。' : '续写没有进展，已停止。');
      result.rawResponse += suffix;
      if (continuing) {
        callbacks.onText?.(suffix);

      }
    } catch (error) {
      // Retain usage and prior bytes for diagnostics, but never turn a failed request into a candidate.
      if (!portable && (!textResolved || options.signal?.aborted)) result.rawResponse += textResolved ? suffix : observedText;
      result.errorMessage = error instanceof Error ? error.message : String(error);
      result.warnings.push(result.errorMessage);
      if (portable && !options.signal?.aborted) keepCheckpoint();
      return result;
    }
    const artifact = extractArtifact(result.rawResponse);
    const fence=/```html[ \t]*\r?\n([\s\S]*)$/i.exec(result.rawResponse);
    const unfinishedFence=!!fence&&!fence[1].includes('```')&&fence[1].trimStart().startsWith('<');
    const incomplete = artifact ? !artifact.isComplete || !htmlIsComplete(artifact.html) : unfinishedFence;
    if (callbacks.allowContinuation === false || !isOutputLimit(result.finishReason) || !incomplete || transportRecovery) return result;
    if (continuations >= autoCap || requestedTokens >= totalBudget || result.rawResponse.length > 120000) {
      result.warnings.push(`续写达到${autoCap}次或累计${totalBudget}请求输出Token上限；请拆分修改。`);
      return keepCheckpoint();
    }
    continuations++;
    result.continuationCount = (resume?.previousContinuations ?? 0) + continuations + (resume ? 1 : 0);
    result.warnings.push(`${supportsNativeContinuation(options.provider, options.model)?'原生':'分段'}续写第${result.continuationCount}次，累计请求输出预算${requestedTokens + Math.min(continuationBudget, totalBudget - requestedTokens)} tokens。`);
  }
}
