import type { QualityFinding } from './generationQuality';

const ACTIONS = 'button,a[href],[role="button"],input[type="submit"],input[type="button"]';
function hidden(el: Element): boolean {
  for (let cur: Element | null = el; cur; cur = cur.parentElement) {
    const style = (cur as HTMLElement).style;
    if (cur.hasAttribute('hidden') || cur.classList.contains('hidden') || style?.display === 'none' || style?.visibility === 'hidden' || style?.visibility === 'collapse') return true;
  }
  return false;
}
function label(el: Element): string {
  if (el.tagName.toLowerCase() === 'input') return (el.getAttribute('value') ?? (el.getAttribute('type')?.toLowerCase() === 'submit' ? 'Submit' : '')).trim();
  const parts: string[] = [];
  const visit = (node: Node) => {
    if (node.nodeType === 3) parts.push(node.textContent ?? '');
    else if (node.nodeType === 1) {
      const element = node as Element;
      if (element.matches('svg,script,style,template') || hidden(element)) return;
      element.childNodes.forEach(visit);
    }
  };
  el.childNodes.forEach(visit);
  return parts.join('').replace(/\s+/g, ' ').trim();
}
function primary(el: Element): boolean {
  return el.matches('.btn-primary,[type="submit"],[data-action="primary"]')
    || [...el.classList].some(c => /(?:^|[-_])(primary|cta|submit)(?:$|[-_])/.test(c))
    || /^(提交|确认支付|立即支付|付款)/.test(label(el));
}
function accessible(el: Element): boolean {
  return Boolean(el.getAttribute('aria-label')?.trim() || el.getAttribute('title')?.trim()
    || Array.from(el.querySelectorAll('img[alt],svg title')).some(node => (node.getAttribute('alt') || node.textContent)?.trim()));
}
function authorizedRemoval(el: Element, request: string): boolean {
  const text = label(el), nid = el.getAttribute('data-nid');
  // 结构重排只授权布局，不能作为删除操作的依据；删除必须命中该操作的可读名称/身份。
  const clauses = request.split(/[\n。；;]/);
  return clauses.some(clause => {
    const match = /(?:删除|移除|去掉)\s*(.{1,100})/.exec(clause);
    if (!match || /不|禁止|无需|无须|勿|避免/.test(clause.slice(Math.max(0, match.index - 8), match.index))) return false;
    const target = match[1].split(/[,，]|保留|但|不要|不可|不得/)[0];
    return Boolean((text && target.includes(text)) || (nid && target.includes(`nid="${nid}"`))
      || (primary(el) && /主(?:操作)?按钮|主\s*CTA|提交按钮/i.test(target)));
  });
}

/** 独立于DOM结构改写授权的操作完整性检查，始终在离线副本上运行。 */
export function inspectActionIntegrity(doc: Document, original?: Document, request = ''): QualityFinding[] {
  const findings: QualityFinding[] = [];
  const actions = Array.from(doc.querySelectorAll(ACTIONS));
  const add = (el: Element, code: string, message: string, actual: string, severity: 'error' | 'warning' = 'error') => {
    findings.push({ code, severity, nid: el.getAttribute('data-nid') || undefined, message, actual: actual.slice(0, 300), expected: '保留可见、非空且可识别的操作文案；删除操作需明确授权' });
  };
  const consumed = new Set<Element>();
  const originals = Array.from(original?.querySelectorAll(ACTIONS) ?? []);
  const reservedNids = new Set(originals.map(el => el.getAttribute('data-nid')).filter(Boolean));
  for (const before of originals) {
    if (hidden(before) || !label(before)) continue;
    const oldLabel = label(before), nid = before.getAttribute('data-nid');
    let next = nid ? actions.find(el => !consumed.has(el) && el.getAttribute('data-nid') === nid) : undefined;
    const available = (el: Element) => !consumed.has(el) && !hidden(el)
      && (!el.getAttribute('data-nid') || !reservedNids.has(el.getAttribute('data-nid')) || el.getAttribute('data-nid') === nid);
    if (!next) next = actions.find(el => available(el) && label(el) === oldLabel);
    // 允许重排后重建一个仍有可见文案的主按钮，不能把只剩“暂存”的页误当主操作保留。
    if (!next && primary(before)) next = actions.find(el => available(el) && primary(el) && !originals.some(other => other !== before && label(other) && label(other) === label(el) && label(other) !== oldLabel));
    if (next) consumed.add(next);
    if (authorizedRemoval(before, request)) continue;
    if (!next) {
      add(before, 'action_removed', primary(before) ? '修改结果丢失了原页面主操作。' : '修改结果未找到原操作，请核对是否在确认范围内。', oldLabel, primary(before) ? 'error' : 'warning');
    } else if (hidden(next) || !label(next)) {
      add(next, 'action_label_lost', '修改结果清空或隐藏了原操作的可见文案。', `原操作：${oldLabel}；当前文案：${label(next) || '空/不可见'}`);
    } else if (label(next) !== oldLabel) {
      add(next, 'action_label_changed', '操作文案发生变化，请核对是否符合已确认要求。', `${oldLabel} → ${label(next)}`, 'warning');
    }
  }
  for (const action of actions) {
    if (hidden(action) || !primary(action) || label(action) || accessible(action)) continue;
    if (!findings.some(f => f.code === 'action_label_lost' && f.nid === (action.getAttribute('data-nid') || undefined))) {
      add(action, 'action_label_missing', '主操作按钮没有可识别的操作文案。', '空按钮');
    }
  }
  return findings;
}
