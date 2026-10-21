import { transformDeclarations, transformStyleSheet } from '../services/import/htmlImportCss';

/** Resolve dimension tokens only; quoted content, escaped tokens and URLs stay literal. */
function resolveValue(value: string, height: number, width?: number): string {
  let result = '', index = 0;
  while (index < value.length) {
    const start = index, ch = value[index];
    if (ch === '"' || ch === "'") {
      index++;
      while (index < value.length) { if (value[index] === '\\') index += 2; else if (value[index++] === ch) break; }
    } else if (value.startsWith('/*', index)) {
      const end = value.indexOf('*/', index + 2); index = end < 0 ? value.length : end + 2;
    } else if (/^url\(/i.test(value.slice(index))) {
      index += 4; let quote = '';
      while (index < value.length) {
        const char = value[index++];
        if (char === '\\') { index++; continue; }
        if (quote) { if (char === quote) quote = ''; }
        else if (char === '"' || char === "'") quote = char;
        else if (char === ')') break;
      }
    } else if (ch === '\\') index += 2;
    else {
      const match = /^(?:[+-]?(?:\d*\.\d+|\d+))(dvh|svh|lvh|vh|dvw|svw|lvw|vw|dvmin|svmin|lvmin|vmin|dvmax|svmax|lvmax|vmax)\b/i.exec(value.slice(index));
      if (match && (index === 0 || !/[\w.\\-]/.test(value[index - 1]))) {
        const unit = match[1].toLowerCase();
        const dimension = unit.endsWith('vh') ? height : width === undefined ? undefined
          : unit.endsWith('vmin') ? Math.min(width, height) : unit.endsWith('vmax') ? Math.max(width, height) : width;
        if (dimension === undefined) { result += match[0]; index += match[0].length; continue; }
        result += `${Number((parseFloat(match[0]) * dimension / 100).toFixed(6))}px`;
        index += match[0].length; continue;
      }
      index++;
    }
    result += value.slice(start, index);
  }
  return result;
}

export function resolveViewportCss(css: string, height: number, width?: number): string {
  return transformStyleSheet(css, declaration => {
    // The conservative scanner may surface an unsupported nested rule as a
    // declaration. Keep it verbatim rather than treating its selector as a value.
    if (/[{}]/.test(declaration.value)) return;
    const next = resolveValue(declaration.value, height, width);
    if (next !== declaration.value) return next;
  });
}

/** Rendering copy only. Freeze CSS viewport dimensions, never the page's content height. */
export function resolveImportedViewport(doc: Document, height: number, width?: number): void {
  for (const style of Array.from(doc.querySelectorAll('style'))) style.textContent = resolveViewportCss(style.textContent || '', height, width);
  for (const node of Array.from(doc.querySelectorAll('[style]'))) {
    node.setAttribute('style', transformDeclarations(node.getAttribute('style')!, '<inline>', false, declaration => {
      const next = resolveValue(declaration.value, height, width);
      if (next !== declaration.value) return next;
    }));
  }
}

export function importedViewportHeight(doc: Document): number | undefined {
  const value = Number(doc.querySelector('style[data-taudesign-runtime="viewport"]')?.getAttribute('data-viewport-height'));
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

/** Measure at a fresh viewport so a previously enlarged iframe cannot become its own minimum. */
export function measureImportedFrame(iframe: HTMLIFrameElement, minimum = 0): number {
  const doc = iframe.contentDocument, win = iframe.contentWindow;
  if (!doc?.body || !win) return minimum;
  const viewport = importedViewportHeight(doc);
  if (!viewport) return Math.max(minimum, doc.body.scrollHeight, doc.documentElement.scrollHeight);
  const previous = iframe.style.height;
  const resting = doc.createElement('style'); resting.setAttribute('data-taudesign-height-measure', '');
  resting.textContent = '*,::before,::after{animation:none!important;transition:none!important}';
  const animations: Array<{ animation: Animation; time: Animation['currentTime']; running: boolean }> = [];
  try {
    iframe.style.height = `${viewport}px`;
    if (typeof doc.getAnimations === 'function') {
      for (const animation of doc.getAnimations()) {
        const end = Number(animation.effect?.getComputedTiming().endTime);
        if (animation.playState === 'finished' || !Number.isFinite(end) || end <= 0) continue;
        animations.push({ animation, time: animation.currentTime, running: animation.playState === 'running' });
        animation.pause(); animation.currentTime = end;
      }
    } else doc.head.append(resting);
    const body = doc.body.getBoundingClientRect(), bodyStyle = win.getComputedStyle(doc.body);
    let extent = Math.max(body.bottom + (parseFloat(bodyStyle.marginBottom) || 0),
      body.top + doc.body.scrollHeight + (parseFloat(bodyStyle.borderBottomWidth) || 0));
    // Root scrollHeight includes the iframe viewport even for a very short document.
    if (doc.documentElement.scrollHeight > viewport + 1) extent = Math.max(extent, doc.documentElement.scrollHeight);
    for (const node of Array.from(doc.body.querySelectorAll('*'))) {
      if (node.closest('[data-taudesign-mobile-chrome]')) continue;
      if (win.getComputedStyle(node).position === 'fixed') extent = Math.max(extent, node.getBoundingClientRect().bottom);
    }
    return Math.ceil(Math.max(minimum, extent));
  } finally {
    for (const { animation, time, running } of animations) {
      animation.currentTime = time;
      if (running) animation.play();
    }
    resting.remove(); iframe.style.height = previous;
  }
}

/** Layout/resource changes can grow or shrink a frame without reloading its document. */
export function observeImportedFrame(iframe: HTMLIFrameElement, update: () => void): () => void {
  const doc = iframe.contentDocument;
  if (!doc?.body) return () => {};
  let scheduled = 0;
  const schedule = () => { if (!scheduled) scheduled = requestAnimationFrame(() => { scheduled = 0; update(); }); };
  const resize = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(schedule);
  resize?.observe(doc.body); resize?.observe(doc.documentElement);
  const styles = new MutationObserver(records => {
    const relevant = records.some(record => {
      const target = record.target.nodeType === 1 ? record.target as Element : record.target.parentElement;
      if (target?.closest('[data-taudesign-height-measure]')) return false;
      const nodes = [...Array.from(record.addedNodes), ...Array.from(record.removedNodes)];
      return !nodes.length || nodes.some(node => !(node.nodeType === 1 && (node as Element).hasAttribute('data-taudesign-height-measure')));
    });
    if (relevant) schedule();
  });
  styles.observe(doc.head, { childList: true, subtree: true, characterData: true });
  doc.addEventListener('load', schedule, true);
  return () => { resize?.disconnect(); styles.disconnect(); doc.removeEventListener('load', schedule, true); if (scheduled) cancelAnimationFrame(scheduled); };
}
