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
