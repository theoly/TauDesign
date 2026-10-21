import { NidEngine } from './nidEngine';
import { parseHtmlCopy } from './htmlDocument';

export interface PatchElementResult {
  success: boolean;
  html: string;
  error?: string;
  replacedTagName?: string;
}

/**
 * 局部元素外科手术式补丁引擎 (Canvas Tools / KISS 原则)
 *
 * 仅安全替换目标 `data-nid` 对应的节点或其内部内容，
 * 严格保留画框内所有其他节点的所有属性、文本与 data-nid，绝不破坏页面其余状态。
 */
export function patchElementByNid(
  originalHtml: string,
  nid: string,
  patchHtml: string
): PatchElementResult {
  if (!originalHtml || !nid || !patchHtml) {
    return { success: false, html: originalHtml, error: '参数不完整' };
  }

  if (typeof DOMParser === 'undefined') {
    return { success: false, html: originalHtml, error: 'DOMParser 在当前运行环境不可用' };
  }

  try {
    const copy = parseHtmlCopy(originalHtml);
    const doc = copy.doc;

    // 转义转义符防止选择器注入
    const safeNid = nid.replace(/["\\]/g, '\\$&');
    const targetEl = doc.querySelector(`[data-nid="${safeNid}"]`);

    if (!targetEl) {
      return {
        success: false,
        html: originalHtml,
        error: `未在目标页面中找到 data-nid="${nid}" 的节点`
      };
    }

    const replacedTagName = targetEl.tagName.toLowerCase();
    const trimmedPatch = patchHtml.trim();

    // 检查 patchHtml 是否包含外层标签（即完整的元素替换）
    const tempContainer = doc.createElement('div');
    tempContainer.innerHTML = trimmedPatch;

    const firstElement = tempContainer.firstElementChild;
    const isFullElementReplacement =
      firstElement &&
      tempContainer.children.length === 1 &&
      tempContainer.childNodes.length === 1;

    if (isFullElementReplacement && firstElement) {
      // 保证根元素保留原稳定 nid
      if (!firstElement.getAttribute('data-nid')) {
        firstElement.setAttribute('data-nid', nid);
      }
      // 为新节点内部所有可能缺失 nid 的子节点注入稳定 nid
      const enrichedHtml = NidEngine.injectNids(firstElement.outerHTML);
      const enrichedFragment = doc.createElement('div');
      enrichedFragment.innerHTML = enrichedHtml;
      const finalElement = enrichedFragment.firstElementChild || firstElement;

      targetEl.replaceWith(finalElement);
    } else {
      // 传入的是内部子内容：替换 innerHTML 并补全缺失的 nid
      const enrichedInner = NidEngine.injectNids(trimmedPatch);
      targetEl.innerHTML = enrichedInner;
    }

    return {
      success: true,
      html: copy.serialize(),
      replacedTagName
    };
  } catch (err: any) {
    return {
      success: false,
      html: originalHtml,
      error: err?.message || 'DOM 局部补丁解析执行异常'
    };
  }
}

export interface DeleteElementResult {
  success: boolean;
  html: string;
  deletedNids: string[];
  deletedTagName?: string;
  error?: string;
}

/**
 * 级联删除指定 `data-nid` 节点及其全部后代节点 (Descendants)
 *
 * 1. 彻底解决正则非贪婪匹配同名嵌套标签提前终止导致子节点残留的缺陷；
 * 2. 递归提取目标节点及其所有子节点的 data-nid 清单，供上层清理孤儿 overrides；
 * 3. 保护根容器与非法节点。
 */
export function deleteElementByNid(
  originalHtml: string,
  nid: string
): DeleteElementResult {
  if (!originalHtml || !nid) {
    return { success: false, html: originalHtml, deletedNids: [], error: '参数不完整' };
  }

  if (typeof DOMParser === 'undefined') {
    return { success: false, html: originalHtml, deletedNids: [], error: 'DOMParser 在当前运行环境不可用' };
  }

  try {
    const copy = parseHtmlCopy(originalHtml);
    const doc = copy.doc;

    const safeNid = nid.replace(/["\\]/g, '\\$&');
    const targetEl = doc.querySelector(`[data-nid="${safeNid}"]`);

    if (!targetEl) {
      return {
        success: false,
        html: originalHtml,
        deletedNids: [],
        error: `未在目标页面中找到 data-nid="${nid}" 的节点`
      };
    }

    const tagName = targetEl.tagName.toLowerCase();
    if (tagName === 'body' || tagName === 'html') {
      return {
        success: false,
        html: originalHtml,
        deletedNids: [],
        error: '禁止删除页面根沙箱容器'
      };
    }

    // 递归收集目标节点及其所有子孙节点的 data-nid
    const deletedNids: string[] = [];
    const collectNids = (el: Element) => {
      const elNid = el.getAttribute('data-nid');
      if (elNid && !deletedNids.includes(elNid)) {
        deletedNids.push(elNid);
      }
      for (const child of Array.from(el.children)) {
        collectNids(child);
      }
    };
    collectNids(targetEl);

    // 原生安全级联删除整棵子树
    targetEl.remove();

    return {
      success: true,
      html: copy.serialize(),
      deletedNids,
      deletedTagName: tagName
    };
  } catch (err: any) {
    return {
      success: false,
      html: originalHtml,
      deletedNids: [],
      error: err?.message || 'DOM 节点级联删除异常'
    };
  }
}

export interface DuplicateElementResult {
  success: boolean;
  html: string;
  newNid?: string;
  error?: string;
}

/**
 * 安全复制指定节点及其全部子树，并为克隆树中所有节点重新注入稳定唯一的 data-nid
 */
export function duplicateElementByNid(
  originalHtml: string,
  nid: string
): DuplicateElementResult {
  if (!originalHtml || !nid) {
    return { success: false, html: originalHtml, error: '参数不完整' };
  }

  if (typeof DOMParser === 'undefined') {
    return { success: false, html: originalHtml, error: 'DOMParser 在当前运行环境不可用' };
  }

  try {
    const copy = parseHtmlCopy(originalHtml);
    const doc = copy.doc;

    const safeNid = nid.replace(/["\\]/g, '\\$&');
    const targetEl = doc.querySelector(`[data-nid="${safeNid}"]`);

    if (!targetEl) {
      return { success: false, html: originalHtml, error: `未找到节点 #${nid}` };
    }

    const clone = targetEl.cloneNode(true) as Element;
    const newRootNid = NidEngine.generateNid();
    clone.setAttribute('data-nid', newRootNid);
    for (const child of Array.from(clone.querySelectorAll('[data-nid]'))) {
      child.setAttribute('data-nid', NidEngine.generateNid());
    }

    targetEl.after(clone);

    return { success: true, html: copy.serialize(), newNid: newRootNid };
  } catch (err: any) {
    return { success: false, html: originalHtml, error: err?.message || '节点复制异常' };
  }
}

export interface WrapElementResult {
  success: boolean;
  html: string;
  containerNid?: string;
  error?: string;
}

/**
 * 将指定节点安全包裹进新的容器节点中，不破坏内部任何属性和结构
 */
export function wrapElementByNid(
  originalHtml: string,
  nid: string,
  containerType: 'row' | 'col' | 'card'
): WrapElementResult {
  if (!originalHtml || !nid) {
    return { success: false, html: originalHtml, error: '参数不完整' };
  }

  if (typeof DOMParser === 'undefined') {
    return { success: false, html: originalHtml, error: 'DOMParser 在当前运行环境不可用' };
  }

  try {
    const copy = parseHtmlCopy(originalHtml);
    const doc = copy.doc;

    const safeNid = nid.replace(/["\\]/g, '\\$&');
    const targetEl = doc.querySelector(`[data-nid="${safeNid}"]`);

    if (!targetEl) {
      return { success: false, html: originalHtml, error: `未找到节点 #${nid}` };
    }

    const containerNid = NidEngine.generateNid();
    const wrapper = doc.createElement('div');
    wrapper.setAttribute('data-nid', containerNid);
    wrapper.className = `${containerType} gap-3 p-4 r-md`;

    targetEl.replaceWith(wrapper);
    wrapper.appendChild(targetEl);

    return { success: true, html: copy.serialize(), containerNid };
  } catch (err: any) {
    return { success: false, html: originalHtml, error: err?.message || '容器包裹异常' };
  }
}

