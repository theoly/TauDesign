/**
 * 健壮提取模型响应中的 JSON 文本，剥离外层解释性文字、Markdown 标记及换行符 (BR-CFR-04)
 */
export function extractJsonPayload(raw: string): string {
  if (typeof raw !== 'string') return '';
  const trimmed = raw.trim();

  // 1. 如果包含 Markdown 代码块 ```json ... ``` 或 ``` ... ```，提取代码块内部内容
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (codeBlockMatch) {
    const candidate = codeBlockMatch[1].trim();
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return candidate.slice(start, end + 1);
    }
    const arrStart = candidate.indexOf('[');
    const arrEnd = candidate.lastIndexOf(']');
    if (arrStart >= 0 && arrEnd > arrStart) {
      return candidate.slice(arrStart, arrEnd + 1);
    }
    return candidate;
  }

  // 2. 无代码块但外层有说明文字（如 "Layout:\n{...}" 或 "这是布局计划：\n{...}"）
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) {
    return trimmed.slice(start, end + 1);
  }

  // 3. 数组形式 JSON
  const arrStart = trimmed.indexOf('[');
  const arrEnd = trimmed.lastIndexOf(']');
  if (arrStart >= 0 && arrEnd > arrStart) {
    return trimmed.slice(arrStart, arrEnd + 1);
  }

  return trimmed;
}

/**
 * 带有 JSON 提取容灾的安全解析函数
 */
export function safeJsonParse<T = unknown>(raw: string): T {
  const payload = extractJsonPayload(raw);
  return JSON.parse(payload) as T;
}

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
