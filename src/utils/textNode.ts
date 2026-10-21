import { parseHtmlCopy } from './htmlDocument';

/**
 * 文本节点取值与写回的唯一入口 (doc/issues.md ISSUE-002/003/004)
 *
 * 检查器面板与画框内双击行内编辑两条路径此前各自实现，行为不一致：
 * 前者用 innerText + 正则替换 HTML，会拼接后代文本并产出非法结构；
 * 后者用 DOMParser 且带子元素守卫，是正确的。此处统一为一份实现。
 *
 * 规则（doc/issues.md ISSUE-003 修复方案）：
 *   1. 只认「直接子文本节点」，不拼接后代文本
 *   2. 含子元素 / 多段直接文本 / 空元素 → 不可编辑，字段置灰
 *   3. 写回只改文本节点的 nodeValue，绝不触碰子元素
 */

/** 无内容模型的元素，不可能承载文本 */
const VOID_ELEMENTS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr'
]);

export type TextUneditableReason = 'void-element' | 'has-children' | 'multiple-text-nodes';

export interface TextNodeInfo {
  /** 直接子文本节点的内容（已 trim）。不可编辑时为可供展示的只读值 */
  text: string;
  /** 是否允许在检查器 / 行内编辑中修改 */
  editable: boolean;
  reason?: TextUneditableReason;
}

/** 取元素的直接子文本节点（忽略纯空白节点——格式化过的 HTML 到处都是） */
function directTextNodes(el: Element): Text[] {
  const out: Text[] = [];
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === 3 && (node.nodeValue ?? '').trim() !== '') {
      out.push(node as Text);
    }
  }
  return out;
}

/**
 * 判定元素的文本可编辑性并取值。
 *
 * 不使用 innerText：它依赖布局，元素未渲染完成（LOD 升级瞬间、画框刚挂载、
 * 流式生成刚结束）时会返回空串，导致文本字段整块消失 (ISSUE-002)。
 */
export function inspectText(el: Element): TextNodeInfo {
  const tag = el.tagName.toLowerCase();
  if (VOID_ELEMENTS.has(tag)) {
    return { text: '', editable: false, reason: 'void-element' };
  }

  const texts = directTextNodes(el);
  const joined = texts.map((n) => n.nodeValue ?? '').join('').trim();

  // 含子元素时展示直接文本但不允许编辑——整体替换会连同子元素的 nid、
  // 样式覆盖、组件绑定一并抹掉 (ISSUE-003)
  if (el.children.length > 0) {
    return { text: joined, editable: false, reason: 'has-children' };
  }
  if (texts.length > 1) {
    return { text: joined, editable: false, reason: 'multiple-text-nodes' };
  }
  // texts.length 为 0 时也可编辑：空元素允许补写文案
  return { text: joined, editable: true };
}

/** 面板上给用户看的禁用原因 */
export function uneditableHint(reason: TextUneditableReason): string {
  switch (reason) {
    case 'void-element':
      return '此元素不能包含文本';
    case 'has-children':
      return '此元素包含子元素，请选中具体的文本节点编辑';
    case 'multiple-text-nodes':
      return '此元素含多段文本，请在画框内直接编辑';
  }
}

/**
 * 就地写入文本，只改文本节点，不触碰子元素。
 * @returns 是否实际发生了修改
 */
export function setDirectText(el: Element, next: string): boolean {
  const info = inspectText(el);
  if (!info.editable || info.text === next) return false;

  const texts = directTextNodes(el);
  if (texts.length === 1) {
    texts[0].nodeValue = next;
  } else {
    // 空元素补写文案：清掉可能存在的纯空白节点后追加
    el.textContent = '';
    el.appendChild(el.ownerDocument.createTextNode(next));
  }
  return true;
}

/**
 * 在 HTML 字符串中按 nid 写回文本，返回新的 HTML；不适用或无变化时返回 null。
 *
 * 此前检查器用正则匹配 `(<开标签>)(内容)(<\/任意闭合标签>)`，对
 * `<div data-nid><span>A</span>B</div>` 会在第一个 </span> 处截断，
 * 产出标签错配的非法 HTML；对 <img data-nid> 则完全不匹配、静默丢弃
 * 用户的编辑 (ISSUE-004)。改用 DOMParser。
 */
export function setTextByNid(html: string, nid: string, next: string): string | null {
  if (typeof DOMParser === 'undefined') return null;
  const copy = parseHtmlCopy(html);
  const doc = copy.doc;
  const el = doc.querySelector(`[data-nid="${CSS_escape(nid)}"]`);
  if (!el) return null;
  if (!setDirectText(el, next)) return null;
  return copy.serialize();
}

/** nid 由 NidEngine 生成（base36），理论上无需转义；仍做一层防护避免选择器注入 */
function CSS_escape(v: string): string {
  return v.replace(/["\\]/g, '\\$&');
}
