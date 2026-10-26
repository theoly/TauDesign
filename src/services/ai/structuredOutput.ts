/** A closed JSON object can still be a truncated subset of the intended operations. */
export function structuredOutputIssue(finishReason?: string, recoveredStreamError?: string): string | undefined {
  if (recoveredStreamError) return '结构化输出期间连接中断，未使用恢复出的部分结果，请重新发起请求。';
  // Older transports do not supply this metadata; do not manufacture a finish reason for them.
  if (finishReason === undefined) return undefined;
  if (typeof finishReason !== 'string') return '模型返回了无效的结构化输出结束状态，未应用结果。';
  if (!finishReason.trim()) return undefined;
  const reason = finishReason.trim().toLowerCase().replace(/[ -]/g, '_');
  if (['stop', 'end_turn', 'stop_sequence', 'eos', 'eos_token'].includes(reason)) return undefined;
  if (/^(?:length|max_(?:output_|completion_)?tokens|token_limit|model_length)$/.test(reason)) {
    return '结构化输出达到输出上限，未应用部分结果。请缩小修改范围或提高输出预算后重试。';
  }
  if (['content_filter', 'safety', 'recitation', 'blocklist', 'prohibited_content', 'spii', 'refusal'].includes(reason)) {
    return '模型过滤或拒绝了本次结构化输出，未应用结果。请调整请求后重试。';
  }
  return '模型未以可确认的正常状态结束结构化输出，未应用结果。请重新发起请求。';
}
