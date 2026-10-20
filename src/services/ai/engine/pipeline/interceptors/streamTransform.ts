
export interface ExtractedArtifact {
  identifier?: string;
  type: 'screen' | 'deck' | 'dashboard' | 'unknown';
  title?: string;
  html: string;
  isFallback: boolean; // true 表示通过 markdown 代码块或原生标签降级提取
  isComplete: boolean; // true 表示闭合标签已完整到达，false 表示流式未闭合临时截取
  warnings?: string[];
}

function parseAttributes(attrString: string | undefined): { identifier?: string; type: ExtractedArtifact['type']; title?: string } {
  if (!attrString) return { type: 'screen' };

  const idMatch = attrString.match(/identifier=["']([^"']+)["']/i) || attrString.match(/id=["']([^"']+)["']/i);
  const titleMatch = attrString.match(/title=["']([^"']+)["']/i) || attrString.match(/name=["']([^"']+)["']/i);
  const typeMatch = attrString.match(/type=["']([^"']+)["']/i);

  let type: ExtractedArtifact['type'] = 'screen';
  if (typeMatch) {
    const rawType = typeMatch[1].toLowerCase();
    if (rawType === 'screen' || rawType === 'deck' || rawType === 'dashboard') {
      type = rawType;
    } else {
      type = 'unknown';
    }
  }

  return {
    identifier: idMatch ? idMatch[1].trim() : undefined,
    title: titleMatch ? titleMatch[1].trim() : undefined,
    type
  };
}

/**
 * 结构化提取器 (REQ-OD-01 / BR-01.2~1.5)
 * 优先提取 <artifact> 块，支持属性解析、流式未闭合容错与三级降级链
 */
export function extractArtifact(raw: string): ExtractedArtifact | undefined {
  if (!raw) return undefined;

  // 1. 优先提取完整 <artifact>...</artifact> 块
  const completeArtifactRegex = /<artifact(?:\s+([^>]*))?>([\s\S]*?)<\/artifact>/gi;
  const completeMatches = [...raw.matchAll(completeArtifactRegex)];

  if (completeMatches.length > 0) {
    const firstMatch = completeMatches[0];
    const attrs = parseAttributes(firstMatch[1]);
    const html = firstMatch[2].trim();

    const warnings: string[] = [];
    if (completeMatches.length > 1) {
      warnings.push('multiple_artifacts');
    }

    if (html) {
      return {
        identifier: attrs.identifier,
        type: attrs.type,
        title: attrs.title,
        html,
        isFallback: false,
        isComplete: true,
        warnings: warnings.length > 0 ? warnings : undefined
      };
    }
  }

  // 2. 流式未闭合 <artifact> 块容错提取 (In-flight Streaming)
  const unclosedArtifactRegex = /<artifact(?:\s+([^>]*))?>([\s\S]*)$/i;
  const unclosedMatch = raw.match(unclosedArtifactRegex);
  if (unclosedMatch && unclosedMatch[2].trim()) {
    const attrs = parseAttributes(unclosedMatch[1]);
    return {
      identifier: attrs.identifier,
      type: attrs.type,
      title: attrs.title,
      html: unclosedMatch[2].trim(),
      isFallback: false,
      isComplete: false
    };
  }

  // 3. 降级链一级: 精确 Markdown html 代码块 (```html ... ```)
  const codeBlockMatch = raw.match(/```html\s*([\s\S]*?)```/i);
  if (codeBlockMatch && codeBlockMatch[1].trim()) {
    return {
      type: 'screen',
      html: codeBlockMatch[1].trim(),
      isFallback: true,
      isComplete: true
    };
  }

  // 4. 降级链二级: 通用代码块且包含有效标签
  const genericMatch = raw.match(/```\s*([\s\S]*?)```/);
  if (
    genericMatch &&
    (genericMatch[1].includes('<div') ||
      genericMatch[1].includes('<main') ||
      genericMatch[1].includes('<section') ||
      genericMatch[1].includes('<form') ||
      genericMatch[1].includes('<!DOCTYPE') ||
      genericMatch[1].includes('<html'))
  ) {
    return {
      type: 'screen',
      html: genericMatch[1].trim(),
      isFallback: true,
      isComplete: true
    };
  }

  // 5. 降级链三级: 原生 HTML 标签探测
  const tagKeywords = ['<div', '<section', '<main', '<form', '<!DOCTYPE', '<html'];
  const validIndices = tagKeywords
    .map((k) => raw.indexOf(k))
    .filter((idx) => idx !== -1);

  if (validIndices.length > 0) {
    const startIdx = Math.min(...validIndices);
    const htmlSnippet = raw.slice(startIdx).trim();
    if (htmlSnippet) {
      return {
        type: 'screen',
        html: htmlSnippet,
        isFallback: true,
        // 未闭合Markdown围栏只能用于流式预览，不能标记成最终产物。
        isComplete: !raw.includes('```')
      };
    }
  }

  return undefined;
}

/**
 * 向后兼容既有调用方，直接返回 HTML 源码
 */
export function extractHtmlFromResponse(raw: string): string | undefined {
  return extractArtifact(raw)?.html;
}

/**
 * 设计取舍披露载荷 (doc/feature/deviation-note/spec.md BR-DN-03)
 * 仅在参考图与项目现状发生结构性/IA/已生效决策级冲突时，模型才被允许
 * 在 <artifact> 块外追加这一条结构化侧信道，四字段均为必填字符串。
 */
export interface DeviationNote {
  /** 冲突描述：参考图诉求 vs 项目现状 */
  conflict: string;
  /** 本次候选方案实际采用的选择及理由 */
  chosen: string;
  /** 另一个可选方案的描述 */
  alternative: string;
  /** 可直接作为下一轮用户输入发出的、具体到能让模型精准定点修改的指令 */
  alternativeInstruction: string;
}

const DEVIATION_NOTE_REQUIRED_KEYS: Array<keyof DeviationNote> = [
  'conflict',
  'chosen',
  'alternative',
  'alternativeInstruction'
];

/**
 * 结构化提取器 (BR-DN-03)
 * 与 extractArtifact 并列、互不影响；每轮至多一条，命中多条时只取第一条。
 * 畸形 JSON / 缺字段 / 未出现该标签一律静默返回 undefined，不得抛异常。
 */
export function extractDeviationNote(raw: string): DeviationNote | undefined {
  if (!raw) return undefined;

  const match = raw.match(/<deviation-note>([\s\S]*?)<\/deviation-note>/i);
  if (!match || !match[1].trim()) return undefined;

  try {
    const parsed = JSON.parse(match[1].trim());
    if (!parsed || typeof parsed !== 'object') return undefined;

    const isValid = DEVIATION_NOTE_REQUIRED_KEYS.every(
      (key) => typeof parsed[key] === 'string' && parsed[key].trim().length > 0
    );
    if (!isValid) return undefined;

    return {
      conflict: parsed.conflict.trim(),
      chosen: parsed.chosen.trim(),
      alternative: parsed.alternative.trim(),
      alternativeInstruction: parsed.alternativeInstruction.trim()
    };
  } catch {
    return undefined;
  }
}
