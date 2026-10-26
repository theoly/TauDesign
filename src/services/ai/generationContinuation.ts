import type { EngineMessage, StreamTextOptions } from './engine/core/types';
import { contentFingerprint } from './designWorkflow';

export const isOutputLimit = (reason?: string): boolean => /^(?:length|max[_ -](?:output[_ -]|completion[_ -])?tokens|token_limit|model_length)$/i.test(reason?.trim() ?? '');
export interface ContinuationCheckpoint {
  version: 1;
  prefix: string;
  prefixFingerprint: string;
  contextKey: string;
  bindingKey: string;
  messages: EngineMessage[];
  messagesFingerprint: string;
  previousContinuations: number;
}
export const continuationBindingKey = (options: Pick<StreamTextOptions, 'provider' | 'model'>) =>
  contentFingerprint(JSON.stringify([options.provider, options.model]));
export const continuationContextKey = (messages: EngineMessage[]) => contentFingerprint(JSON.stringify(messages));

export function portableContinuation(messages: EngineMessage[], prefix: string) {
  const marker = `TAUDESIGN_CONTINUE_${crypto.randomUUID()}`;
  return { marker, messages: [...messages, { role: 'assistant' as const, content: prefix }, { role: 'user' as const,
    content: `上一条页面代码因为输出预算耗尽而中断。这是同一个页面的后续片段，不是重新设计。
只接着已有代码最后一个字符输出剩余内容，保留全部已有结构、Token、文字、布局和样式；若停在标签、属性或文字中间，从该位置接完。不要重发已有内容，不要重新开始artifact/HTML/Markdown代码块，不要解释或总结，直接输出代码。优先完成所有尚未完成的功能模块，压缩装饰性重复代码，最终闭合原来的页面和artifact/代码围栏。
第一行必须逐字输出以下恢复标记（它不属于页面内容），换行后才是后续代码；不要输出结束标记：
${marker}
已有代码长度：${prefix.length}；指纹：${contentFingerprint(prefix)}；末尾仅供定位：${JSON.stringify(prefix.slice(-160))}` }] };
}

/** Strip only the protocol line; authored prefix/suffix bytes are never rewritten. */
export function readContinuationSuffix(response: string, marker: string, prefix: string): string {
  const start = response.indexOf(marker);
  const newline = response.indexOf('\n', Math.max(0, start));
  if (start < 0 || response.slice(0, start).trim() || newline < 0 || response.slice(start, newline).trim() !== marker) throw Error('续写恢复标记不匹配，已保留此前内容，未拼接不确定的结果。');
  const suffix = response.slice(newline + 1);
  if (!suffix.trim()) throw Error('续写没有进展，已停止。');
  if (suffix.trimStart().startsWith(prefix.trimStart()) || /<artifact(?:\s|>)/i.test(suffix) || /^(?:<!doctype|<html(?:\s|>)|```html)/i.test(suffix.trimStart())) {
    throw Error('续写重复开始页面，已保留此前内容，未拼接重复结果。');
  }
  // A substantial echoed boundary is a restart, not a suffix. Do not guess an overlap to remove.
  const tail = prefix.slice(-160);
  if (tail.length >= 48 && suffix.trimStart().startsWith(tail.trimStart())) throw Error('续写重复返回已生成的末尾，已停止。');
  return suffix;
}
