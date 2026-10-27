/**
 * DOM 结构守卫 (A3 / T-AE-26, T-AE-27)。
 *
 * Polish 与 Restyle 的承诺是「保持 DOM 结构与业务文案不变，只改视觉表达」。
 * 光在 Prompt 里请求模型照做是不够的——模型完全可能顺手删掉一个它认为多余的
 * 容器，或者把三条列表项缩成两条。那样用户丢的是**内容**，而不只是样式。
 *
 * 因此结果必须**强制校验**：节点增删不为 0 就整体拒绝，不落盘、不打 Checkpoint。
 * 这是 plan.md §6 中「前后 DOM diff 节点增删为 0」这条验收标准的执行者。
 */

export interface StructureDiff {
  ok: boolean;
  beforeCount: number;
  afterCount: number;
  /** 新增的标签路径，如 "div>section>p" */
  added: string[];
  /** 丢失的标签路径 */
  removed: string[];
  /** 文案被改动的节点数（Polish 不应改文案） */
  textChanged: number;
  reason?: string;
}

interface NodeSig {
  path: string;
  text: string;
}

function collect(html: string): NodeSig[] | null {
  if (typeof DOMParser === 'undefined') return null;
  const doc = new DOMParser().parseFromString(`<div id="__root">${html}</div>`, 'text/html');
  const root = doc.getElementById('__root');
  if (!root) return null;

  const out: NodeSig[] = [];
  const walk = (el: Element, path: string) => {
    // 用同级**位置序号**而非按标签分别计数：后者对调换同级不同标签的顺序
    // 完全无感（h2 与 p 互换后 path 不变），而顺序变化对阅读次序是实质改动
    const children = Array.from(el.children);
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      const tag = child.tagName.toLowerCase();
      const childPath = `${path}>${i}:${tag}`;
      // 只取直接子文本，避免父节点重复计入后代文本
      const ownText = ['style','script'].includes(tag)?'':Array.from(child.childNodes)
        .filter((n) => n.nodeType === 3)
        .map((n) => n.textContent ?? '')
        .join('')
        .replace(/\s+/g, ' ')
        .trim();
      out.push({ path: childPath, text: ownText });
      walk(child, childPath);
    }
  };
  walk(root, '');
  return out;
}

/**
 * 比对改写前后的结构。
 *
 * `<svg>` 子树被整体忽略——补图标正是 Polish 的合法动作之一，
 * 若把 path 数据也算进结构变化，任何一次补图标都会被判失败。
 */
export function compareStructure(before: string, after: string): StructureDiff {
  // 整体**移除** svg 子树而非替换为空标签：补图标是 Polish 的合法动作，
  // 若留下一个空 <svg> 占位，任何一次补图标都会被算成新增节点而误判失败
  const stripSvg = (h: string) => h.replace(/<svg\b[\s\S]*?<\/svg>/gi, '');

  const a = collect(stripSvg(before));
  const b = collect(stripSvg(after));
  if (!a || !b) {
    return { ok: true, beforeCount: 0, afterCount: 0, added: [], removed: [], textChanged: 0, reason: '无 DOM 环境，跳过校验' };
  }

  const aPaths = new Map(a.map((n) => [n.path, n.text]));
  const bPaths = new Map(b.map((n) => [n.path, n.text]));

  const removed = [...aPaths.keys()].filter((p) => !bPaths.has(p));
  const added = [...bPaths.keys()].filter((p) => !aPaths.has(p));

  let textChanged = 0;
  for (const [p, text] of aPaths) {
    const next = bPaths.get(p);
    if (next !== undefined && next !== text) textChanged++;
  }

  const ok = added.length === 0 && removed.length === 0;
  return {
    ok,
    beforeCount: a.length,
    afterCount: b.length,
    added: added.slice(0, 10),
    removed: removed.slice(0, 10),
    textChanged,
    reason: ok
      ? undefined
      : `结构被改动：新增 ${added.length} 个节点、丢失 ${removed.length} 个节点。` +
        `Polish / Restyle 只应改变视觉表达，不得增删业务节点。`
  };
}

/** 文案是否被改动——Polish 承诺保留业务文案 */
export function hasTextDrift(diff: StructureDiff): boolean {
  return diff.textChanged > 0;
}
