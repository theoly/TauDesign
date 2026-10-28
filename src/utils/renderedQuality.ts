import type { QualityFinding } from '../services/ai/generationQuality';
import { hasAccessibleActionName } from '../services/ai/actionIntegrity';
import { contrastRatio } from './colorHarmony';
import { inspectText } from './textNode';

export interface RenderedQualityReport {
  status: 'pending' | 'complete' | 'incomplete' | 'unavailable';
  findings: QualityFinding[];
  inspected: number;
  reason?: string;
}
const tolerance = 2;
type Color = [number, number, number, number];
function color(value: string): Color | null {
  if (value === 'transparent') return [0, 0, 0, 0];
  const match = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/.exec(value);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3]), match[4] === undefined ? 1 : Number(match[4])] : null;
}
function composite(front: Color, back: Color): Color {
  const alpha = front[3] + back[3] * (1 - front[3]);
  if (!alpha) return [0, 0, 0, 0];
  return [0, 1, 2].map(i => (front[i] * front[3] + back[i] * back[3] * (1 - front[3])) / alpha).concat(alpha) as Color;
}
const asHex = (c: Color) => '#' + c.slice(0, 3).map(v => Math.round(v).toString(16).padStart(2, '0')).join('');

/** 只读取真实渲染几何；无布局的DOM环境返回unavailable，不伪装验收通过。 */
export function inspectRenderedQuality(doc: Document, options: { maxNodes?: number; resourcesReady?: boolean } = {}): RenderedQualityReport {
  const win = doc.defaultView;
  const width = doc.documentElement.clientWidth;
  if (!win || width <= 0 || !doc.body || doc.body.getBoundingClientRect().width <= 0) {
    return { status: 'unavailable', findings: [], inspected: 0, reason: '画框尚无可测量尺寸' };
  }
  const styles = new Map<Element, CSSStyleDeclaration>();
  const css = (el: Element) => { let s = styles.get(el); if (!s) { s = win.getComputedStyle(el); styles.set(el, s); } return s; };
  const visible = (el: Element) => {
    for (let cur: Element | null = el; cur; cur = cur.parentElement) {
      const s = css(cur);
      if (cur.hasAttribute('hidden') || s.display === 'none' || ['hidden', 'collapse'].includes(s.visibility) || Number(s.opacity || 1) === 0) return false;
    }
    const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0;
  };
  const hasComplexTransform = (el: Element) => {
    for (let cur: Element | null = el; cur; cur = cur.parentElement) {
      const style = css(cur), transform = style.transform;
      if (['scale', 'rotate', 'perspective'].some(property => {
        const value = style.getPropertyValue(property); return value && value !== 'none';
      })) return true;
      if (style.zoom && style.zoom !== 'normal' && Number(style.zoom) !== 1) return true;
      if (!transform || transform === 'none') continue;
      const matrix = /^matrix\(([^)]+)\)$/.exec(transform)?.[1].split(',').map(Number);
      // Range/DOMRect是变换后的坐标，client尺寸未变换；只接受不改变尺寸的平移。
      if (!matrix || matrix.length !== 6 || matrix[0] !== 1 || matrix[1] !== 0 || matrix[2] !== 0 || matrix[3] !== 1) return true;
    }
    return false;
  };
  const findings: QualityFinding[] = [];
  const seen = new Set<string>();
  const elementIds = new Map<Element, number>();
  const add = (el: Element, code: string, message: string, actual: string, expected: string, severity: QualityFinding['severity'] = 'warning') => {
    const nid = el.getAttribute('data-nid') || el.closest('[data-nid]')?.getAttribute('data-nid') || undefined;
    if (!elementIds.has(el)) elementIds.set(el, elementIds.size);
    const key = `${code}:${nid || elementIds.get(el)}`;
    if (seen.has(key)) return;
    seen.add(key); findings.push({ code, severity, nid, message, actual, expected });
  };
  const scrollAncestor = (el: Element) => {
    for (let cur = el.parentElement; cur && cur !== doc.body; cur = cur.parentElement) {
      if (['auto', 'scroll'].includes(css(cur).overflowX)) return true;
    }
    return false;
  };
  const clippedDecoration = (el: Element, rect: DOMRect) => {
    // Only empty non-semantic leaves qualify. Never mask clipped labels, media or actions.
    if (!el.matches('div,span,i,b') || el.children.length || el.textContent?.trim()
      || ['role', 'aria-label', 'title', 'tabindex'].some(attr => el.hasAttribute(attr)) || css(el).position === 'fixed') return false;
    let left = rect.left, right = rect.right, clipped = false;
    let containingBlock = css(el).position !== 'absolute';
    for (let cur = el.parentElement; cur && cur !== doc.body; cur = cur.parentElement) {
      if (hasComplexTransform(cur)) return false;
      const style = css(cur);
      if (style.position && style.position !== 'static') containingBlock = true;
      // An absolutely positioned descendant escapes an overflow ancestor below its containing block.
      if (!containingBlock || !['hidden', 'clip'].includes(style.overflowX)) continue;
      const box = cur.getBoundingClientRect(), clipLeft = box.left + (cur.clientLeft || 0);
      left = Math.max(left, clipLeft); right = Math.min(right, clipLeft + cur.clientWidth); clipped = true;
    }
    return clipped && (right <= left || (left >= -tolerance && right <= width + tolerance));
  };
  const lineCount = (el: Element) => {
    const lines: Array<{ top: number; bottom: number }> = [];
    const walker = doc.createTreeWalker(el, 4);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      if (!node.textContent?.trim() || !node.parentElement || node.parentElement.closest('svg') || !visible(node.parentElement)) continue;
      const range = doc.createRange(); range.selectNodeContents(node);
      for (const rect of Array.from(range.getClientRects())) {
        if (!rect.width || !rect.height) continue;
        const line = lines.find(l => Math.min(l.bottom, rect.bottom) - Math.max(l.top, rect.top) > Math.min(l.bottom - l.top, rect.height) * 0.5);
        if (line) { line.top = Math.min(line.top, rect.top); line.bottom = Math.max(line.bottom, rect.bottom); }
        else lines.push({ top: rect.top, bottom: rect.bottom });
      }
    }
    return lines.length;
  };
  const contrast = (el: Element) => {
    const foreground = color(css(el).color);
    if (!foreground || !foreground[3]) return;
    const chain: Element[] = [];
    for (let cur: Element | null = el; cur; cur = cur.parentElement) chain.unshift(cur);
    let background: Color = [0, 0, 0, 0];
    for (const cur of chain) {
      const s = css(cur);
      // 渐变、图片、混合或透明组无法由单点CSS颜色可靠推断，跳过而非猜底色。
      if ((s.backgroundImage && s.backgroundImage !== 'none') || Number(s.opacity || 1) < 1 || (s.mixBlendMode && s.mixBlendMode !== 'normal')) return;
      const fill = color(s.backgroundColor); if (!fill) return;
      background = composite(fill, background);
    }
    if (background[3] < 0.999) return;
    const s = css(el), size = parseFloat(s.fontSize), bold = Number(s.fontWeight) >= 700 || s.fontWeight === 'bold';
    const minimum = size >= 24 || (bold && size >= 18.667) ? 3 : 4.5;
    const ratio = contrastRatio(asHex(composite(foreground, background)), asHex(background));
    if (ratio + 0.01 < minimum) add(el, 'render_contrast', '文字与实际纯色背景的对比度不足。', `${ratio.toFixed(2)}:1`, `至少${minimum}:1，使用更清晰的语义文字色`);
  };
  const actionSelector = 'button, a[href], [role="button"], input[type="submit"], input[type="button"]';
  // Hidden containers represent inactive UI; a visible container's broken control must still be measured.
  const hiddenContainer = (el: Element) => {
    for (let cur = el.parentElement; cur; cur = cur.parentElement) {
      const s = css(cur);
      if (cur.hasAttribute('hidden') || s.display === 'none' || ['hidden', 'collapse'].includes(s.visibility) || Number(s.opacity || 1) === 0 || s.contentVisibility === 'hidden') return true;
    }
    return false;
  };
  const paintedLabel = (el: Element, text: boolean) => {
    if (!visible(el)) return false;
    if (!text) return true;
    const s = css(el);
    if (parseFloat(s.fontSize) === 0) return false;
    // Text fill overrides color in WebKit, including intentional opaque fill over transparent color.
    const fill = s.getPropertyValue('-webkit-text-fill-color');
    const foreground = color(fill && fill !== 'currentcolor' && fill !== 'currentColor' ? fill : s.color);
    return !foreground || foreground[3] > 0;
  };
  const inspectAction = (el: Element) => {
    const s = css(el);
    const disabledFieldset = (() => {
      for (let fieldset = el.parentElement; fieldset; fieldset = fieldset.parentElement) {
        if (!fieldset.matches('fieldset[disabled]')) continue;
        const legend = Array.from(fieldset.children).find(child => child.tagName === 'LEGEND');
        if (!legend?.contains(el)) return true;
      }
      return false;
    })();
    if (el.hasAttribute('hidden') || s.display === 'none' || hiddenContainer(el) || el.matches(':disabled') || el.hasAttribute('disabled') || disabledFieldset || el.getAttribute('aria-disabled') === 'true') return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      add(el, 'render_action_zero_size', '操作控件的实际宽度或高度为零。', `${rect.width}×${rect.height}px`, '保留可见且可点击的操作区域', 'error');
      return;
    }
    let hasLabel = false;
    if (el.matches('input')) {
      const value = (el as HTMLInputElement).value || (el.getAttribute('type')?.toLowerCase() === 'submit' && !el.hasAttribute('value') ? 'Submit' : '');
      hasLabel = Boolean(value.trim()) && paintedLabel(el, true);
    } else {
      const walker = doc.createTreeWalker(el, 4);
      let node: Node | null;
      while ((node = walker.nextNode())) {
        const parent = node.parentElement;
        if (!node.textContent?.trim() || !parent || parent.closest('svg, script, style') || !paintedLabel(parent, true)) continue;
        const range = doc.createRange(); range.selectNodeContents(node);
        if (Array.from(range.getClientRects()).some(r => r.width > 0 && r.height > 0)) { hasLabel = true; break; }
      }
      if (!hasLabel) {
        const named = hasAccessibleActionName(el);
        hasLabel = Array.from(el.querySelectorAll('svg, img, .icon')).some(icon => {
          if (!paintedLabel(icon, false)) return false;
          return named || Boolean(icon.getAttribute('alt')?.trim() || icon.querySelector('title')?.textContent?.trim());
        });
      }
    }
    if (!hasLabel) add(el, 'render_action_invisible_label', '操作控件缺少可见文案或有名称的可见图标。', '文字为空、隐藏、透明、字号为零或无可见尺寸', '恢复可见操作文案，或提供有可访问名称的可见图标', 'error');
  };
  const inspectCompressedBody = (el: Element) => {
    if (inspectText(el).text.replace(/\s/g, '').length < 20 || el.closest('button,a,input,textarea,select,svg,table,pre,code,[role="table"],[role="grid"]') || hasComplexTransform(el)) return;
    const s = css(el), parent = el.parentElement;
    if (!parent || !['flex', 'inline-flex'].includes(css(parent).display) || !['row', 'row-reverse', ''].includes(css(parent).flexDirection)) return;
    for (let cur: Element | null = el; cur; cur = cur.parentElement) {
      const style = css(cur);
      if (style.writingMode && style.writingMode !== 'horizontal-tb' || style.textOverflow === 'ellipsis' || Number(style.getPropertyValue('-webkit-line-clamp')) > 0) return;
    }
    const r = el.getBoundingClientRect(), p = parent.getBoundingClientRect(), font = parseFloat(s.fontSize);
    const contentWidth = r.width - (parseFloat(s.paddingLeft) || 0) - (parseFloat(s.paddingRight) || 0);
    const parentWidth = p.width - (parseFloat(css(parent).paddingLeft) || 0) - (parseFloat(css(parent).paddingRight) || 0);
    if (!(font > 0 && contentWidth > 0 && parentWidth > 0) || contentWidth / parentWidth > 0.45 || contentWidth / font > 10) return;
    const crowded = Array.from(parent.children).some(peer => {
      if (peer === el || !visible(peer) || ['absolute','fixed'].includes(css(peer).position) || !(peer.matches(actionSelector) || peer.querySelector(actionSelector))) return false;
      const box = peer.getBoundingClientRect();
      return box.width >= parentWidth * 0.45 && Math.min(r.bottom, box.bottom) - Math.max(r.top, box.top) > tolerance
        && Math.min(r.right, box.right) - Math.max(r.left, box.left) <= tolerance;
    });
    if (!crowded) return;
    const lines = lineCount(el);
    if (lines < 4) return;
    const severe = contentWidth / font <= 6 && contentWidth / parentWidth <= 0.4 && lines >= 5;
    add(el, 'render_compressed_body', '操作区把长正文挤成了窄列。',
      `正文宽${Math.round(contentWidth)}px（${(contentWidth/font).toFixed(1)}em），${lines}行，占容器${Math.round(contentWidth/parentWidth*100)}%`,
      '将长正文与标签/操作组纵向排列，操作组空间不足整体换行；保留字号、文案和自然高度', severe ? 'error' : 'warning');
  };
  const nodes = Array.from(doc.body.querySelectorAll(`[data-nid], p, .btn, .badge, .badge-soft, .badge-count, .badge-dot, .tag, .icon-box, .avatar, .text-nowrap, ${actionSelector}`));
  const maxNodes = options.maxNodes ?? 1500;
  let inspected = 0;
  if (doc.body.scrollWidth > width + tolerance && !['auto', 'scroll'].includes(css(doc.body).overflowX)) {
    add(doc.body.firstElementChild || doc.body, 'render_page_overflow', '页面内容超出了画框宽度。', `${doc.body.scrollWidth}px > ${width}px`, '在当前设备宽度内布局，长文本列使用min-w-0');
  }
  for (const el of nodes.slice(0, maxNodes)) {
    if (el.matches(actionSelector)) inspectAction(el);
    if (!visible(el)) continue;
    inspected++;
    inspectCompressedBody(el);
    const s = css(el), rect = el.getBoundingClientRect();
    if (el.matches('.badge, .badge-soft, .badge-count, .badge-dot, .tag')
      && (el.matches('.badge-count, .badge-dot') || ['absolute', 'fixed'].includes(s.position)) && !hasComplexTransform(el)) {
      const host = el.parentElement?.closest('button, a[href], [role="button"], .notification-control, .icon-box, .card') || el.parentElement;
      if (host && !hasComplexTransform(host)) {
        const overlaps = (other: DOMRect | DOMRectReadOnly) =>
          Math.min(rect.right, other.right) - Math.max(rect.left, other.left) > tolerance
          && Math.min(rect.bottom, other.bottom) - Math.max(rect.top, other.top) > tolerance;
        const icons = Array.from(host.querySelectorAll('svg, .icon, img')).filter(icon => !el.contains(icon) && visible(icon) && !hasComplexTransform(icon));
        let overlap = icons.some(icon => overlaps(icon.getBoundingClientRect()));
        const walker = doc.createTreeWalker(host, 4);
        let node: Node | null, checked = 0;
        while (!overlap && (node = walker.nextNode()) && checked++ < 200) {
          const parent = node.parentElement;
          if (!node.textContent?.trim() || !parent || el.contains(node) || parent.closest('svg, script, style') || !visible(parent)) continue;
          const range = doc.createRange(); range.selectNodeContents(node);
          overlap = Array.from(range.getClientRects()).some(overlaps);
        }
        if (overlap) add(el, 'render_badge_overlap', '徽标可能遮挡主图标或内容。', '徽标与图标/文字的可见矩形重叠', '为角标留独立位置，使用notification-control；卡片标签预留内容区域');
        if (el.matches('.badge-count, .badge-dot') && host.matches('button, a[href], [role="button"], .notification-control, .icon-box')
          && icons.some(icon => rect.height > icon.getBoundingClientRect().height + tolerance)) {
          add(el, 'render_badge_oversized', '通知徽标高度超过主图标，视觉层级过强。', `${Math.round(rect.height)}px`, '计数使用xs字号与紧凑内边距，普通通知采用浅底，紧急事项才用危险色');
        }
      }
    }
    if ((rect.right > width + tolerance || rect.left < -tolerance) && !scrollAncestor(el) && !['auto', 'scroll'].includes(s.overflowX) && !clippedDecoration(el, rect)) {
      add(el, 'render_horizontal_overflow', '组件超出了画框左右边界。', `${Math.round(rect.left)}–${Math.round(rect.right)}px`, '保留完整内容，调整容器宽度或让组件组整体换行');
    }
    const html = el as HTMLElement;
    const explicitWrap = html.style?.whiteSpace === 'normal';
    if (el.matches('.btn, .badge, .badge-soft, .tag, .text-nowrap') && !explicitWrap && lineCount(el) > 1) {
      add(el, 'render_unexpected_wrap', '按钮或短标签在实际渲染中分成了多行。', '多行文字', '为完整单行文案留足空间，父组可整体换行');
    }
    const declaredTruncation = s.textOverflow === 'ellipsis' || Number(s.getPropertyValue('-webkit-line-clamp')) > 0;
    const hasText = Array.from(el.childNodes).some(n => n.nodeType === 3 && n.textContent?.trim());
    const labelText = hasText || (el.matches('.btn, .badge, .badge-soft, .tag') && Boolean(el.textContent?.trim()));
    if (!declaredTruncation && labelText && ((['hidden', 'clip'].includes(s.overflowX) && html.scrollWidth > html.clientWidth + tolerance) || (['hidden', 'clip'].includes(s.overflowY) && html.scrollHeight > html.clientHeight + tolerance))) {
      add(el, 'render_clipped_text', '组件中的文字存在被裁切的情况。', '内容尺寸超出可见区域', '增大容器或按业务场景允许换行');
    }
    if (hasText && !declaredTruncation && !hasComplexTransform(el)) {
      const textRects = Array.from(el.childNodes).filter(node => node.nodeType === 3 && node.textContent?.trim()).flatMap(node => {
        const range = doc.createRange(); range.selectNodeContents(node);
        return Array.from(range.getClientRects()).filter(r => r.width > 0 && r.height > 0);
      });
      for (let ancestor = el.parentElement; ancestor; ancestor = ancestor.parentElement) {
        const style = css(ancestor);
        if (style.textOverflow === 'ellipsis' || Number(style.getPropertyValue('-webkit-line-clamp')) > 0) break;
        const clipsX = ['hidden', 'clip'].includes(style.overflowX);
        const clipsY = ['hidden', 'clip'].includes(style.overflowY);
        if (!clipsX && !clipsY) continue;
        const box = ancestor.getBoundingClientRect();
        const left = box.left + (ancestor.clientLeft || 0), top = box.top + (ancestor.clientTop || 0);
        const right = left + ancestor.clientWidth, bottom = top + ancestor.clientHeight;
        if (textRects.some(r => (clipsX && (r.left < left - tolerance || r.right > right + tolerance)) || (clipsY && (r.top < top - tolerance || r.bottom > bottom + tolerance)))) {
          add(el, 'render_clipped_text', '嵌套文字被祖先容器裁切。', '文字超出祖先可见区域', '调整祖先高度/宽度，或按场景允许内容换行');
          break;
        }
      }
    }
    if (el.matches('.icon-box, .avatar, .btn') && el.children.length === 1 && !hasText) {
      const icon = el.firstElementChild;
      if (icon?.matches('svg.icon') && visible(icon)) {
        const r = icon.getBoundingClientRect();
        const distance = Math.hypot((r.left + r.right - rect.left - rect.right) / 2, (r.top + r.bottom - rect.top - rect.bottom) / 2);
        if (distance > Math.max(2, Math.min(rect.width, rect.height) * 0.08)) add(el, 'render_icon_off_center', '单图标控件的图标盒子未居中。', `偏离${distance.toFixed(1)}px`, '使用items-center/justify-center并检查不对称内边距；不自动补偿光学位置');
      }
    }
    if (el.matches('button, a[href], [role="button"]') && typeof doc.elementFromPoint === 'function') {
      const x = (rect.left + rect.right) / 2, y = (rect.top + rect.bottom) / 2;
      if (x >= 0 && x <= width && y >= 0 && y <= doc.documentElement.clientHeight) {
        const top = doc.elementFromPoint(x, y);
        if (top && top !== el && !el.contains(top) && !top.contains(el)) add(el, 'render_occluded_control', '操作控件的中心被其他元素遮挡。', top.tagName.toLowerCase(), '检查吸底栏、浮层与内容间距；此项仅检测中心点');
      }
    }
    if (hasText) contrast(el);
  }
  const budgetExceeded = nodes.length > maxNodes;
  const resourcesReady = options.resourcesReady !== false;
  return { status: budgetExceeded || !resourcesReady ? 'incomplete' : 'complete', findings, inspected,
    reason: budgetExceeded ? `页面节点较多，仅检查了前${maxNodes}个相关节点` : !resourcesReady ? '字体或图片尚未就绪，结果可能继续变化' : undefined };
}

/** 宿主监听现有iframe，取消时移除全部监听；不改变srcdoc或工程数据。 */
export function observeRenderedQuality(iframe: HTMLIFrameElement, publish: (report: RenderedQualityReport) => void) {
  let stopped = false, revision = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let resourceTimer: ReturnType<typeof setTimeout> | undefined;
  let disposeDoc = () => {};
  const reportPending = () => publish({ status: 'pending', findings: [], inspected: 0, reason: '等待画框、字体和图片稳定' });
  const bind = () => {
    disposeDoc(); clearTimeout(timer); clearTimeout(resourceTimer); revision++;
    const doc = iframe.contentDocument;
    if (!doc?.body) { publish({ status: 'unavailable', findings: [], inspected: 0, reason: '画框文档尚未就绪' }); return; }
    let cancelWait = () => {};
    const schedule = () => {
      const ticket = ++revision;
      cancelWait();
      clearTimeout(timer); clearTimeout(resourceTimer);
      reportPending();
      timer = setTimeout(async () => {
        const images = Array.from(doc.querySelectorAll<HTMLImageElement>('img')).filter(img => !img.complete);
        let removeImageListeners = () => {};
        const imagesReady = new Promise<void>(resolve => {
          if (!images.length) { resolve(); return; }
          const listeners = images.map(img => {
            const finish = () => { if (images.every(image => image.complete)) resolve(); };
            img.addEventListener('load', finish); img.addEventListener('error', finish);
            return () => { img.removeEventListener('load', finish); img.removeEventListener('error', finish); };
          });
          removeImageListeners = () => listeners.forEach(remove => remove());
        });
        let timedOut = false;
        let releaseWait = () => {};
        await Promise.race([
          Promise.all([imagesReady, doc.fonts?.ready]).catch(() => { timedOut = true; }),
          new Promise<void>(resolve => {
            releaseWait = resolve;
            resourceTimer = setTimeout(() => { timedOut = true; resolve(); }, 1500);
            cancelWait = () => { clearTimeout(resourceTimer); removeImageListeners(); releaseWait(); };
          })
        ]);
        removeImageListeners();
        if (stopped || ticket !== revision || iframe.contentDocument !== doc) return;
        clearTimeout(resourceTimer);
        const ready = !timedOut && Array.from(doc.querySelectorAll<HTMLImageElement>('img')).every(img => img.complete && img.naturalWidth > 0) && (!doc.fonts || doc.fonts.status === 'loaded');
        try { publish(inspectRenderedQuality(doc, { resourcesReady: ready })); }
        catch { publish({ status: 'unavailable', findings: [], inspected: 0, reason: '当前画框暂不能完成几何测量' }); }
      }, 100);
    };
    const mutation = typeof MutationObserver !== 'undefined' ? new MutationObserver(changes => {
      const meaningful = changes.some(change => {
        if (change.type !== 'attributes' || change.attributeName !== 'class') return true;
        const clean = (value: string) => value.split(/\s+/).filter(c => c && !c.startsWith('aidesign-')).sort().join(' ');
        return clean(change.oldValue || '') !== clean((change.target as Element).getAttribute('class') || '');
      });
      if (meaningful) schedule();
    }) : null;
    mutation?.observe(doc.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeOldValue: true, attributeFilter: ['style', 'class', 'src', 'hidden', 'disabled', 'aria-disabled', 'aria-label', 'title', 'alt', 'value', 'type', 'href', 'role'] });
    const resize = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null;
    resize?.observe(doc.body);
    doc.addEventListener('load', schedule, true); doc.addEventListener('error', schedule, true);
    doc.fonts?.addEventListener('loadingdone', schedule);
    disposeDoc = () => { cancelWait(); mutation?.disconnect(); resize?.disconnect(); doc.removeEventListener('load', schedule, true); doc.removeEventListener('error', schedule, true); doc.fonts?.removeEventListener('loadingdone', schedule); };
    schedule();
  };
  iframe.addEventListener('load', bind); bind();
  return () => { stopped = true; revision++; clearTimeout(timer); clearTimeout(resourceTimer); disposeDoc(); iframe.removeEventListener('load', bind); };
}
