const VOID = new Set('area base br col embed hr img input link meta param source track wbr'.split(' '));
const OPTIONAL = new Set('html head body p li dt dd rt rp optgroup option colgroup thead tbody tfoot tr td th'.split(' '));
const RAW_TEXT = new Set(['script', 'style', 'textarea', 'title']);

/** 检查原始HTML词法完整性；DOMParser会自动补尾，不能用于判断模型是否写完。只读，不替换HTML。 */
export function htmlIsComplete(html: string): boolean {
  const stack: string[] = [];
  const lower = html.toLowerCase();
  let position = 0;
  while (position < html.length) {
    const start = html.indexOf('<', position);
    if (start < 0) break;
    if (html.startsWith('<!--', start)) {
      const end = html.indexOf('-->', start + 4); if (end < 0) return false;
      position = end + 3; continue;
    }
    if (!/[a-z!/?]/i.test(html[start + 1] ?? '')) { position = start + 1; continue; }
    let end = start + 1, quote = '';
    for (; end < html.length; end++) {
      const char = html[end];
      if (quote) { if (char === quote) quote = ''; }
      else if (char === '"' || char === "'") quote = char;
      else if (char === '>') break;
    }
    if (end >= html.length || quote) return false;
    const token = html.slice(start + 1, end).trim();
    position = end + 1;
    if (token.startsWith('!') || token.startsWith('?')) continue;
    const match = /^(\/?)\s*([a-z][a-z0-9:_-]*)\b/i.exec(token);
    if (!match) return false;
    const tag = match[2].toLowerCase();
    if (match[1]) {
      const index = stack.lastIndexOf(tag);
      if (index < 0) { if (!OPTIONAL.has(tag)) return false; continue; }
      if (stack.slice(index + 1).some(open => !OPTIONAL.has(open))) return false;
      stack.length = index;
    } else if (!VOID.has(tag) && token.endsWith('/')) {
      // HTML中的textarea/div/button不能自闭合；浏览器会把后续内容吞进容器。
      if (tag !== 'svg' && tag !== 'math' && !stack.includes('svg') && !stack.includes('math')) return false;
    } else if (!VOID.has(tag)) {
      stack.push(tag);
      if (RAW_TEXT.has(tag)) {
        const close = lower.indexOf(`</${tag}`, position);
        if (close < 0) return false;
        position = close;
      }
    }
  }
  return stack.every(tag => OPTIONAL.has(tag));
}

/**
 * 安全修复 HTML 片段中的轻微语法缺陷：
 * 1. 将非 void 且非 svg/math 的自闭合标签（如 <i class="icon" />、<span .../>、<div .../>）转为合规的双标签；
 * 2. 在结构完整（无截断引号或未完标签）时补齐尾部未闭合的容器标签。
 */
export function repairHtmlSnippet(html: string): string {
  if (!html || typeof html !== 'string') return html;
  let text = html.trim();
  if (!text) return text;

  // 1. 将非 void 标签且不在 SVG 内部的自闭合标签转换为闭合双标签
  text = text.replace(/<([a-z][a-z0-9:_-]*)([^>]*?)\s*\/>/gi, (match, tagName: string, attrs: string) => {
    const lower = tagName.toLowerCase();
    if (
      VOID.has(lower) ||
      lower === 'path' ||
      lower === 'circle' ||
      lower === 'rect' ||
      lower === 'line' ||
      lower === 'polyline' ||
      lower === 'polygon' ||
      lower === 'ellipse' ||
      lower === 'use' ||
      lower === 'stop'
    ) {
      return match;
    }
    return `<${tagName}${attrs}></${tagName}>`;
  });

  if (htmlIsComplete(text)) return text;

  // 2. 检查是否有未闭合的标签堆栈，安全补全尾部闭合标签
  const stack: string[] = [];
  const lower = text.toLowerCase();
  let position = 0;
  let wellFormed = true;

  while (position < text.length) {
    const start = text.indexOf('<', position);
    if (start < 0) break;
    if (text.startsWith('<!--', start)) {
      const end = text.indexOf('-->', start + 4);
      if (end < 0) {
        wellFormed = false;
        break;
      }
      position = end + 3;
      continue;
    }
    if (!/[a-z!/?]/i.test(text[start + 1] ?? '')) {
      position = start + 1;
      continue;
    }
    let end = start + 1,
      quote = '';
    for (; end < text.length; end++) {
      const char = text[end];
      if (quote) {
        if (char === quote) quote = '';
      } else if (char === '"' || char === "'") quote = char;
      else if (char === '>') break;
    }
    if (end >= text.length || quote) {
      wellFormed = false;
      break;
    }
    const token = text.slice(start + 1, end).trim();
    position = end + 1;
    if (token.startsWith('!') || token.startsWith('?')) continue;
    const match = /^(\/?)\s*([a-z][a-z0-9:_-]*)\b/i.exec(token);
    if (!match) {
      wellFormed = false;
      break;
    }
    const tag = match[2].toLowerCase();
    if (match[1]) {
      const index = stack.lastIndexOf(tag);
      if (index >= 0) {
        stack.length = index;
      }
    } else if (!VOID.has(tag) && !token.endsWith('/')) {
      stack.push(tag);
      if (RAW_TEXT.has(tag)) {
        const close = lower.indexOf(`</${tag}`, position);
        if (close < 0) {
          wellFormed = false;
          break;
        }
        position = close;
      }
    }
  }

  if (wellFormed && stack.length > 0) {
    const closers = stack
      .filter((tag) => !OPTIONAL.has(tag))
      .reverse()
      .map((tag) => `</${tag}>`)
      .join('');
    const candidate = text + closers;
    if (htmlIsComplete(candidate)) {
      return candidate;
    }
  }

  return text;
}
