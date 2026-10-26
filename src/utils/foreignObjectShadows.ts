/** WebKit may omit CSS box-shadow when an SVG image contains foreignObject.
 * Work only on the export copy, and only where SourceAlpha represents an opaque box. */
const SVG = 'http://www.w3.org/2000/svg';
export interface BoxShadow { color: string; x: number; y: number; blur: number; spread: number }
export function parseOuterShadows(value: string): BoxShadow[] | null {
  if (!value || value === 'none') return [];
  const parts: string[] = []; let depth = 0, start = 0;
  for (let i = 0; i < value.length; i++) {
    if (value[i] === '(') depth++;
    if (value[i] === ')') depth--;
    if (depth < 0) return null;
    if (value[i] === ',' && depth === 0) { parts.push(value.slice(start, i)); start = i + 1; }
  }
  if (depth !== 0) return null;
  parts.push(value.slice(start));
  if (parts.length > 8) return null;
  const shadows: BoxShadow[] = [];
  for (const part of parts) {
    if (/\binset\b/.test(part)) return null;
    const color = part.match(/(?:rgba?|hsla?|color)\([^)]*\)|#[\da-f]{3,8}\b|\btransparent\b|\b[a-z]+\b/i);
    if (!color) return null;
    const rest = (part.slice(0, color.index) + part.slice(color.index! + color[0].length)).trim();
    const lengths = rest.split(/\s+/);
    if (lengths.length < 2 || lengths.length > 4 || lengths.some(v => !/^-?(?:\d+(?:\.\d*)?|\.\d+)(?:px)?$/.test(v))) return null;
    const [x, y, blur = 0, spread = 0] = lengths.map(parseFloat);
    if ([x, y, blur, spread].some(v => !Number.isFinite(v) || Math.abs(v) > 512) || blur < 0) return null;
    shadows.push({ color: color[0], x, y, blur, spread });
  }
  return shadows;
}

export function createBoxShadowFilter(doc: Document, id: string, shadows: BoxShadow[], width: number, height: number): SVGElement {
  const node = (name: string, attributes: Record<string, string | number>) => {
    const el = doc.createElementNS(SVG, name);
    for (const [key, value] of Object.entries(attributes)) el.setAttribute(key, String(value));
    return el;
  };
  const pad = Math.max(2, ...shadows.map(s => Math.max(Math.abs(s.x), Math.abs(s.y)) + Math.abs(s.spread) + s.blur * 2 + 2));
  const filter = node('filter', { id, x: `${-pad / width * 100}%`, y: `${-pad / height * 100}%`, width: `${100 + 2 * pad / width * 100}%`, height: `${100 + 2 * pad / height * 100}%`, 'color-interpolation-filters': 'sRGB' });
  const outputs: string[] = [];
  shadows.forEach((shadow, i) => {
    let alpha = 'SourceAlpha';
    if (shadow.spread) {
      alpha = `spread${i}`;
      filter.append(node('feMorphology', { in: 'SourceAlpha', operator: shadow.spread > 0 ? 'dilate' : 'erode', radius: Math.abs(shadow.spread), result: alpha }));
    }
    if (shadow.blur) { filter.append(node('feGaussianBlur', { in: alpha, stdDeviation: shadow.blur / 2, result: `blur${i}` })); alpha = `blur${i}`; }
    filter.append(node('feOffset', { in: alpha, dx: shadow.x, dy: shadow.y, result: `offset${i}` }));
    filter.append(node('feFlood', { 'flood-color': shadow.color, result: `color${i}` }));
    filter.append(node('feComposite', { in: `color${i}`, in2: `offset${i}`, operator: 'in', result: `shadow${i}` }));
    outputs.unshift(`shadow${i}`); // CSS's first shadow is painted on top of subsequent shadows.
  });
  const merge = node('feMerge', {});
  for (const output of [...outputs, 'SourceGraphic']) merge.append(node('feMergeNode', { in: output }));
  filter.append(merge); return filter;
}

interface ShadowSupport { css: boolean | null; filter: boolean | null }
const probes = new WeakMap<Document, Map<number, Promise<ShadowSupport>>>();
function shadowSupport(scale: number): Promise<ShadowSupport> {
  let cached = probes.get(document); if (!cached) { cached = new Map(); probes.set(document, cached); }
  const previous = cached.get(scale); if (previous) return previous;
  const probe = (async (): Promise<ShadowSupport> => {
    const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d');
    if (!ctx?.getImageData) return { css: null, filter: null };
    canvas.width = 300 * scale; canvas.height = 220 * scale;
    const paint = (svg: string) => new Promise<boolean | null>(resolve => {
      const img = new Image(); let done = false;
      const finish = (value: boolean | null) => { if (done) return; done = true; clearTimeout(timer); resolve(value); };
      const timer = setTimeout(() => finish(null), 2000);
      img.onload = () => {
        if (done) return;
        try {
          ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, 0, 0);
          const center = ctx.getImageData(100 * scale, 100 * scale, 1, 1).data;
          const shadow = ctx.getImageData(130 * scale, 155 * scale, 1, 1).data;
          finish(center[3] === 255 && center[0] < 20 && shadow[3] === 255 ? shadow[0] < 240 : null);
        } catch { finish(null); }
      };
      img.onerror = () => finish(null);
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    });
    const source = `<svg xmlns="http://www.w3.org/2000/svg" width="${300 * scale}" height="${220 * scale}"><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml" style="width:300px;height:220px;background:white;transform:scale(${scale});transform-origin:0 0"><html xmlns="http://www.w3.org/1999/xhtml"><head><style>html,body{margin:0;padding:0;background:white}</style></head><body><div data-shadow-probe="box" style="position:absolute;left:60px;top:55px;width:150px;height:85px;border-radius:18px;background:black;box-shadow:0 12px 22px 2px rgba(0,0,0,.4)"></div></body></html></div></foreignObject></svg>`;
    const css = await paint(source);
    if (css !== false) return { css, filter: null };
    // Test the actual HTML -> SVG filter path too: system WKWebView and the
    // bundled test WebKit can support different image-painting features.
    const xml = new DOMParser().parseFromString(source, 'image/svg+xml');
    const defs = xml.createElementNS(SVG, 'defs'); xml.documentElement.prepend(defs);
    defs.append(createBoxShadowFilter(xml, 'probe-filter', [{ color: 'rgba(0,0,0,.4)', x: 0, y: 12 * scale, blur: 22 * scale, spread: 2 * scale }], 150 * scale, 85 * scale));
    const target = xml.querySelector('[data-shadow-probe]') as HTMLElement;
    target.style.setProperty('box-shadow', 'none'); target.style.setProperty('filter', 'url(#probe-filter)');
    if (scale > 1) {
      const container = xml.querySelector('foreignObject')!.firstElementChild as HTMLElement;
      container.style.removeProperty('transform'); container.style.setProperty('zoom', String(scale));
    }
    return { css, filter: await paint(new XMLSerializer().serializeToString(xml)) };
  })().catch((): ShadowSupport => ({ css: null, filter: null }));
  cached.set(scale, probe); return probe;
}
function opaque(color: string): boolean {
  if (!color || color === 'transparent') return false;
  const alpha = color.match(/^rgba\(.+,\s*([\d.]+)\s*\)$/i) ?? color.match(/\/\s*([\d.]+)\s*\)$/);
  return !alpha || Number(alpha[1]) === 1;
}

/** No host/source DOM modifications. Unsupported cases remain authored and get an explicit warning. */
export async function prepareForeignObjectShadows(svgText: string, width: number, height: number, warn?: (text: string) => void, scale: 1 | 2 | 3 = 1): Promise<string> {
  const supported = await shadowSupport(scale);
  if (supported.css) return svgText;
  if (supported.css === null) { warn?.('无法确认兼容渲染的阴影能力，阴影效果可能与画布不同。'); return svgText; }
  const xml = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  const container = xml.querySelector('foreignObject')?.firstElementChild as HTMLElement | null;
  if (!container || xml.querySelector('parsererror')) throw Error('阴影兼容处理无法解析导出SVG。');
  const key = `data-export-shadow-${Math.random().toString(36).slice(2)}`;
  const elements = Array.from(container.querySelectorAll('*')).filter(el => el.namespaceURI === 'http://www.w3.org/1999/xhtml');
  elements.forEach((el, i) => el.setAttribute(key, String(i)));
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true'); iframe.tabIndex = -1;
  iframe.style.cssText = `position:fixed;left:-100000px;top:0;width:${width}px;height:${height}px;border:0;opacity:0;pointer-events:none;`;
  try {
    const content = Array.from(container.children).find(el => el.localName === 'html');
    const html = content ? new XMLSerializer().serializeToString(content) : `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:;"></head><body style="margin:0">${container.innerHTML}</body></html>`;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('阴影兼容布局测量超时。')), 8000);
      iframe.onload = () => { clearTimeout(timer); resolve(); }; iframe.srcdoc = html; document.body.append(iframe);
    });
    const doc = iframe.contentDocument!, view = iframe.contentWindow!;
    if (!doc?.body) throw Error('阴影兼容测量文档不可用。');
    await Promise.race([doc.fonts?.ready, new Promise(resolve => setTimeout(resolve, 1500))]);
    const defs = xml.createElementNS(SVG, 'defs'); xml.documentElement.prepend(defs);
    let skipped = 0, converted = 0;
    const density = Number(container.style.transform.match(/^scale\(([123])\)$/)?.[1] ?? 1);
    const paintedPseudos = (el: Element) => ['::before', '::after'].map(pseudo => view.getComputedStyle(el, pseudo))
      .filter(css => css.content && css.content !== 'none' && css.content !== 'normal' && css.display !== 'none' && css.visibility !== 'hidden' && css.opacity !== '0');
    for (let i = 0; i < elements.length; i++) {
      const target = elements[i] as HTMLElement, actual = doc.querySelector(`[${key}="${i}"]`);
      if (!actual) continue;
      const style = view.getComputedStyle(actual), shadow = style.boxShadow;
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      const pseudos = paintedPseudos(actual);
      if (!shadow || shadow === 'none') {
        if (pseudos.some(css => css.boxShadow && css.boxShadow !== 'none')) skipped++;
        continue;
      }
      const rect = actual.getBoundingClientRect(); if (rect.width <= 0 || rect.height <= 0) continue;
      const parsed = parseOuterShadows(shadow), children = Array.from(actual.querySelectorAll('*'));
      const boundedChildren = children.every(child => { const css = view.getComputedStyle(child), r = child.getBoundingClientRect();
        return css.position !== 'fixed' && !(css.position === 'absolute' && style.position === 'static') && (css.zIndex === 'auto' || css.zIndex === '0')
          && (style.overflow === 'hidden' || r.width === 0 || r.height === 0 || (r.left >= rect.left - .5 && r.right <= rect.right + .5 && r.top >= rect.top - .5 && r.bottom <= rect.bottom + .5 && (!css.boxShadow || css.boxShadow === 'none') && (!css.filter || css.filter === 'none') && paintedPseudos(child).length === 0)); });
      if (supported.filter !== true || !parsed?.length || converted >= 300 || !opaque(style.backgroundColor) || pseudos.length > 0 || style.backgroundClip !== 'border-box' || !boundedChildren || style.filter !== 'none' || style.transform !== 'none'
        || ['clip-path', 'mask-image', '-webkit-mask-image', 'border-image-source'].some(property => { const value = style.getPropertyValue(property); return value && value !== 'none'; })
        || style.opacity !== '1' || style.mixBlendMode !== 'normal' || (style.backdropFilter && style.backdropFilter !== 'none') || (style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0)
        || ['html', 'body', 'input', 'select', 'textarea', 'img', 'video', 'canvas'].includes(actual.localName)) { skipped++; continue; }
      const id = `export-shadow-${key.slice(19)}-${converted++}`;
      defs.append(createBoxShadowFilter(xml, id, parsed.map(s => ({ ...s, x: s.x * density, y: s.y * density, blur: s.blur * density, spread: s.spread * density })), rect.width * density, rect.height * density));
      target.style.setProperty('box-shadow', 'none', 'important'); target.style.setProperty('filter', `url(#${id})`, 'important');
    }
    if (converted) {
      // WebKit rasterizes filtered HTML before an ancestor CSS transform. Zoom keeps
      // the filter and SourceGraphic at export density instead of enlarging a 1x layer.
      if (density > 1) { container.style.setProperty('zoom', String(density)); container.style.removeProperty('transform'); }
    }
    if (!converted) defs.remove();
    if (skipped) warn?.(supported.filter !== true
      ? `当前兼容渲染器无法可靠绘制${skipped}个节点的阴影；建议使用原生PNG或HTML导出。`
      : `当前兼容渲染器有${skipped}个透明、内阴影或复杂层级节点无法无损补偿阴影；建议使用原生PNG或HTML导出。`);
    for (const el of elements) el.removeAttribute(key);
    return new XMLSerializer().serializeToString(xml);
  } finally { iframe.remove(); }
}
