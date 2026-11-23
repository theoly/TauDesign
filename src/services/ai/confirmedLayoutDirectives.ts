/**
 * Apply explicit confirmed rating-layout edits the model often drops.
 * Mobile .tap-target is 44px, .btn-sm padding beats a lone .p-0, and
 * justify-between / grid-5 / flex-1 keep hearts spread even after a gap change.
 */
const NID = /\b([a-z][a-z0-9]{7})\b/g;
const GAP_SWAP = /gap-(\d+)\s*(?:改为|改成|替换为)\s*gap-(\d+)/;
const GAP_TARGET = /(?:按|用|为|保持)\s*gap-(\d+)|gap-(\d+)\s*(?:紧凑|排列)/;
const REMOVE_TAP = /(?:移除|去掉|删除)[^。\n]{0,40}tap-target|tap-target\s*类?\s*(?:移除|去掉|删除)/;
const RATING = /星形|星级|心形|红心|heart|icon-mask/i;
const TIGHTEN = /收紧|紧凑|更紧/;
const SPREAD = ['justify-between', 'justify-around', 'justify-evenly', 'justify-center', 'grid-4', 'grid-5', 'grid-6', 'flex-1', 'flex-auto'];

function clauseNids(clause: string): string[] {
  const detail = clause.split(/目标区块\s*:/)[0] ?? clause;
  const named = [...detail.matchAll(NID)].map((match) => match[1]);
  const ids = named.length ? named : [...clause.matchAll(NID)].map((match) => match[1]);
  return [...new Set(ids)];
}

function isBareIconButton(el: Element): boolean {
  return el.matches('button, a, [role="button"]')
    && Boolean(el.querySelector('.icon-mask, svg'))
    && (el.textContent ?? '').replace(/\s/g, '').length <= 2;
}

function gapValue(clause: string): string | null {
  const swapped = GAP_SWAP.exec(clause);
  if (swapped && Number(swapped[2]) <= 8) return `gap-${swapped[2]}`;
  const packed = GAP_TARGET.exec(clause);
  const size = packed ? Number(packed[1] ?? packed[2]) : NaN;
  if (size <= 8) return `gap-${size}`;
  if (RATING.test(clause) && TIGHTEN.test(clause)) return 'gap-1';
  return null;
}

export function applyConfirmedLayoutDirectives(html: string, request: string, protectedNids: string[] = []): string {
  if (!request || (!GAP_SWAP.test(request) && !REMOVE_TAP.test(request) && !(RATING.test(request) && TIGHTEN.test(request)))) return html;
  const full = /^\s*(?:<!doctype|<html)\b/i.test(html.trim());
  const doc = new DOMParser().parseFromString(full ? html : `<body>${html}</body>`, 'text/html');
  const byNid = new Map<string, Element>();
  for (const el of Array.from(doc.body.querySelectorAll('[data-nid]'))) {
    const nid = el.getAttribute('data-nid');
    if (!nid) continue;
    if (byNid.has(nid)) byNid.delete(nid);
    else byNid.set(nid, el);
  }
  const blocked = new Set(protectedNids);
  const protectedTree = (el: Element) => {
    let node: Element | null = el;
    while (node) {
      const nid = node.getAttribute('data-nid');
      if (nid && blocked.has(nid)) return true;
      node = node.parentElement;
    }
    return false;
  };
  let changed = false;
  const touch = (el: Element, edit: () => void) => {
    if (protectedTree(el)) return;
    const before = el.className;
    edit();
    if (el.className !== before) changed = true;
  };
  const shrinkButton = (el: Element, removeTap: boolean) => {
    touch(el, () => {
      if (removeTap) el.classList.remove('tap-target');
      el.classList.add('p-0', 'px-0');
      el.classList.remove('flex-1', 'flex-auto');
    });
  };
  const setGap = (el: Element, gap: string) => {
    touch(el, () => {
      for (const cls of [...el.classList]) if (/^gap-\d+$/.test(cls) && cls !== gap) el.classList.remove(cls);
      el.classList.add(gap);
    });
  };
  const packRow = (el: Element, gap: string, removeTap: boolean) => {
    const icons = iconHosts(el);
    if (icons.length < 4 || protectedTree(el)) return;
    for (const host of icons) {
      shrinkButton(host.icon, removeTap);
      if (host.child !== host.icon) touch(host.child, () => host.child.classList.remove('flex-1', 'flex-auto'));
    }
    touch(el, () => {
      for (const cls of SPREAD) el.classList.remove(cls);
      if (!el.classList.contains('row') && !el.classList.contains('col')) el.classList.add('row');
      el.classList.add('justify-start');
    });
    setGap(el, gap);
  };
  const hostedIcon = (el: Element): Element | null => {
    if (isBareIconButton(el)) return el;
    if (el.children.length > 2) return null;
    const icons = Array.from(el.querySelectorAll('button, a, [role="button"]')).filter(isBareIconButton);
    return icons.length === 1 ? icons[0] : null;
  };
  const iconHosts = (el: Element) => Array.from(el.children).flatMap((child) => {
    const icon = hostedIcon(child);
    return icon ? [{ child, icon }] : [];
  });
  const rowsUnder = (root: Element) => [root, ...Array.from(root.querySelectorAll('*'))].filter((el) => iconHosts(el).length >= 4);
  for (const clause of request.split(/\n+/)) {
    const named = clauseNids(clause);
    const present = named.flatMap((nid) => {
      const el = byNid.get(nid);
      return el ? [el] : [];
    });
    const swapped = GAP_SWAP.exec(clause);
    const gap = gapValue(clause);
    const removeTap = REMOVE_TAP.test(clause);
    const rating = RATING.test(clause) && (removeTap || TIGHTEN.test(clause) || Boolean(gap));
    if (swapped && Number(swapped[2]) <= 8 && present.length) {
      const from = `gap-${swapped[1]}`;
      const to = `gap-${swapped[2]}`;
      for (const el of present) if (el.classList.contains(from)) setGap(el, to);
    }
    const scopes = present.length ? present : rating ? [doc.body] : [];
    if (!scopes.length) {
      if (swapped && named.length) {
        for (const el of Array.from(doc.body.querySelectorAll(`.gap-${swapped[1]}`))) {
          const icons = Array.from(el.children).filter(isBareIconButton);
          if (icons.length < 3) continue;
          setGap(el, `gap-${swapped[2]}`);
          if (removeTap) for (const icon of icons) shrinkButton(icon, true);
        }
      }
      continue;
    }
    for (const scope of scopes) {
      if (removeTap && present.length) {
        const buttons = [scope, ...Array.from(scope.querySelectorAll('button, a, [role="button"]'))].filter((el) =>
          el.classList.contains('tap-target') && isBareIconButton(el)
        );
        for (const el of buttons) shrinkButton(el, true);
      }
      if (!rating && !removeTap) continue;
      for (const row of rowsUnder(scope)) packRow(row, gap ?? 'gap-1', removeTap || rating);
    }
  }
  if (!changed) return html;
  return full
    ? `${doc.doctype ? new XMLSerializer().serializeToString(doc.doctype) : ''}${doc.documentElement.outerHTML}`
    : doc.body.innerHTML;
}
