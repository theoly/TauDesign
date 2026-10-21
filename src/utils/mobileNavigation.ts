import { parseHtmlCopy } from './htmlDocument';
import { inspectText } from './textNode';
import type { Screen } from '../types/project';

export interface MobileNavigationPolicy { deviceProfile?: 'pc' | 'mobile'; useCustomNavigation?: boolean }
const navToken = /^(?:appbar|nav[-_]?bar|navigation[-_]?bar|custom[-_]?nav|uni-navbar|van-nav-bar|weui-navigation-bar)$/i;
const statusToken = /^(?:(?:ios|system)[-_]?)?status[-_]?bar$/i;
const titleSelector = '.appbar-title,.nav-title,.navbar-title,.navigation-title,.title,h1,h2,[data-navigation-title]';
const trimText = (el: Element | null) => el ? (inspectText(el).text || Array.from(el.children).filter(child => child.localName !== 'svg').map(child => inspectText(child).text).join(' ')).trim() : '';
const backControl = (el: Element) => /^(?:返回|后退|关闭|back|close|menu|更多|more|‹|〈|←|×|···|\.{3}|…)?$/i.test(el.getAttribute('aria-label') || el.getAttribute('title') || trimText(el));

function navigationTitle(el: Element): Element | null {
  const known = el.querySelector(titleSelector);
  if (known) return known;
  // Common imported mobile headers use a centered plain div rather than a heading.
  return Array.from(el.querySelectorAll('.text-center,[style*="text-align"]')).find(candidate =>
    candidate.children.length === 0 && !candidate.matches('button,a,input') && !!trimText(candidate)
    && trimText(candidate).length <= 40 && (candidate.classList.contains('text-center') || (candidate as HTMLElement).style.textAlign === 'center')) ?? null;
}

/** Only leading screen-level chrome is eligible. Business sections/cards are never inferred as navigation. */
function leading(el: Element, body: HTMLElement): boolean {
  let node: Element | null = el;
  for (let depth = 0; node && node !== body && depth < 8; depth++, node = node.parentElement) {
    if (node !== el && (node.matches('article,form,dialog') || node.classList.contains('card') || node.classList.contains('panel'))) return false;
    for (let prev = node.previousElementSibling; prev; prev = prev.previousElementSibling) {
      if (!prev.matches('style,link,script,meta') && !Array.from(prev.classList).some(token => statusToken.test(token))) return false;
    }
    if (node.parentElement === body) return true;
  }
  return false;
}

/** Strip source system chrome from a copy, never business content or the stored original by side effect. */
export function normalizeMobileNavigation(html: string, policy: MobileNavigationPolicy): { html: string; title?: string; removedNids: string[] } {
  if (policy.deviceProfile !== 'mobile') return { html, removedNids: [] };
  const copy = parseHtmlCopy(html), doc = copy.doc;
  let changed = false, title: string | undefined;
  const removedNids: string[] = [];
  const remove = (el: Element) => {
    for (const node of [el, ...el.querySelectorAll('[data-nid]')]) { const nid = node.getAttribute('data-nid'); if (nid) removedNids.push(nid); }
    el.remove(); changed = true;
  };
  doc.querySelectorAll('[data-taudesign-mobile-chrome]').forEach(remove);
  for (const el of Array.from(doc.body.querySelectorAll('*'))) {
    if (!doc.body.contains(el) || !leading(el, doc.body)) continue;
    const tokens = [...Array.from(el.classList), el.id];
    const status = tokens.some(token => statusToken.test(token)) && (/\b\d{1,2}:\d{2}\b|wi-?fi|电量|信号|battery/i.test(el.textContent || '') || !!el.querySelector('[aria-label*="电量"],[aria-label*="信号"],[aria-label*="Wi-Fi"],[aria-label*="battery"]'));
    if (status) { remove(el); continue; }
    const titleEl = navigationTitle(el);
    const semanticNav = el.matches('header,nav,[role="navigation"]') && !!titleEl
      && (Array.from(el.querySelectorAll('button,a,[role="button"]')).some(control => !!(control.getAttribute('aria-label') || control.getAttribute('title') || trimText(control)) && backControl(control)) || !!el.querySelector('.appbar-capsule'));
    if (tokens.some(token => navToken.test(token)) && el.classList.contains('safe-top')) { el.classList.remove('safe-top'); changed = true; }
    if (policy.useCustomNavigation || !(tokens.some(token => navToken.test(token)) || semanticNav)) continue;
    title ||= trimText(titleEl) || (el.children.length === 0 ? trimText(el) : undefined);
    const actions = Array.from(el.querySelectorAll('button,a,[role="button"]')).filter(action => !action.closest('.appbar-capsule') && !backControl(action));
    const businessFields = !!el.querySelector('input,select,textarea,[role="tablist"],.tabs,.filters,.search,article,section,form,.card');
    const mixed = businessFields || actions.length > 0;
    if (!mixed) { remove(el); continue; }
    const navOnlyTitle = titleEl && (titleEl.matches('.appbar-title,.nav-title,.navbar-title,.navigation-title,[data-navigation-title]')
      || titleEl.children.length === 0 && (titleEl.classList.contains('text-center') || (titleEl as HTMLElement).style.textAlign === 'center'));
    if (!businessFields && actions.length && navOnlyTitle) {
      // Keep real actions (history, share, etc.), while removing source navigation rows and empty safe-area spacers.
      const fragment = doc.createDocumentFragment();
      actions.filter(action => !actions.some(parent => parent !== action && parent.contains(action))).forEach(action => fragment.append(action));
      for (const child of Array.from(el.children)) remove(child);
      el.replaceChildren(fragment); el.removeAttribute('class');
      el.setAttribute('data-import-navigation-actions', '');
      const style = (el as HTMLElement).style;
      style.position = 'relative'; style.top = 'auto'; style.height = 'auto'; style.minHeight = '0';
      style.display = 'flex'; style.justifyContent = 'flex-end'; style.alignItems = 'center'; style.gap = '8px'; style.padding = '4px 16px';
      changed = true; continue;
    }
    // A source navbar containing a search/action row must not take those business controls with it.
    for (const child of Array.from(el.querySelectorAll(`${titleSelector},.appbar-capsule,button,a,[role="button"]`))) {
      if (!el.contains(child)) continue;
      if (child === titleEl && child.matches('.appbar-title,.nav-title,.navbar-title,.navigation-title,[data-navigation-title]') || child.matches('.appbar-capsule') || child.matches('button,a,[role="button"]') && backControl(child)) remove(child);
    }
    tokens.filter(token => el.classList.contains(token) && navToken.test(token)).forEach(token => el.classList.remove(token));
    const style = (el as HTMLElement).style;
    for (const property of ['position', 'top', 'height', 'min-height']) style?.removeProperty(property);
    changed = true;
  }
  // Safe-top belongs to the renderer, including legacy pages without explicit chrome.
  for (const el of [doc.body, doc.body.firstElementChild]) if (el?.classList.contains('safe-top')) { el.classList.remove('safe-top'); changed = true; }
  return { html: changed ? copy.serialize() : html, title: title?.slice(0, 80), removedNids };
}

export function normalizeScreenNavigation(screen: Screen, policy: MobileNavigationPolicy): Screen {
  const result = normalizeMobileNavigation(screen.htmlContent, policy);
  return result.html === screen.htmlContent && !result.title ? screen : {
    ...screen, htmlContent: result.html,
    ...(result.title ? { metadata: { ...screen.metadata, navigationTitle: result.title } } : {})
  };
}

export function mobileNavigationPrompt(policy: MobileNavigationPolicy): string {
  if (policy.deviceProfile !== 'mobile') return '';
  return policy.useCustomNavigation
    ? 'CUSTOM MOBILE NAVIGATION ENABLED / 使用自定义导航栏：参考图和原HTML中的自定义导航需要参与设计与修改，保留页面业务导航、标题与操作；系统时间/信号/Wi-Fi/电量状态栏由预览外壳提供，不得写入HTML。'
    : 'WECHAT NATIVE NAVIGATION / 使用自定义导航栏：关闭。忽略参考图、导入HTML和原页面顶部系统状态栏及应用导航栏，不复刻时间、信号、电量、返回标题行或微信胶囊。页面产物只输出业务内容，不包含.status-bar/.appbar，不预留顶部44/48/92px或safe-top；微信顶部栏仅由无限画布和图片导出外壳展示，HTML导出不包含。保留业务标题、搜索、筛选、标签和操作，禁止把业务Hero或卡片标题误作导航删除。';
}

/** Runtime-only visual shell. No NIDs, controls, scripts or persisted content. */
export function injectMobileChrome(doc: Document, policy: MobileNavigationPolicy, title: string, stableViewport = false): void {
  doc.querySelectorAll('[data-taudesign-mobile-chrome]').forEach(el => el.remove());
  if (policy.deviceProfile !== 'mobile') return;
  const height = policy.useCustomNavigation ? 44 : 92;
  const shell = doc.createElement('div'); shell.setAttribute('data-taudesign-mobile-chrome', 'header'); shell.className = 'td-mini-chrome'; shell.setAttribute('aria-hidden', 'true');
  shell.innerHTML = '<div class="td-mini-status"><span>9:41</span><span class="td-mini-indicators"><svg viewBox="0 0 24 24"><path d="M3 20v-4m6 4v-8m6 8V8m6 12V4"/></svg><svg viewBox="0 0 24 24"><path d="M2 8a16 16 0 0 1 20 0M5 12a11 11 0 0 1 14 0M9 16a5 5 0 0 1 6 0"/><circle cx="12" cy="20" r="1"/></svg><svg viewBox="0 0 26 24"><rect x="2" y="6" width="19" height="12" rx="3"/><path d="M24 10v4M6 10h11v4H6z"/></svg></span></div>';
  if (!policy.useCustomNavigation) {
    const nav = doc.createElement('div'); nav.className = 'td-mini-navigation';
    nav.innerHTML = '<span class="td-mini-back">‹</span><span class="td-mini-title"></span><span class="td-mini-capsule"><span class="td-mini-more">···</span><span class="td-mini-home">⦿</span></span>';
    nav.querySelector('.td-mini-title')!.append(doc.createTextNode(title)); shell.append(nav);
  }
  const css = doc.createElement('style'); css.setAttribute('data-taudesign-mobile-chrome', 'styles');
  css.textContent = `body{border-top:${height}px solid transparent!important}
${stableViewport ? '' : `body > .min-h-screen,body > main > .min-h-screen{min-height:calc(100vh - ${height}px)!important}
body > .min-h-dvh,body > main > .min-h-dvh{min-height:calc(100dvh - ${height}px)!important}
body > .h-screen,body > main > .h-screen{height:calc(100vh - ${height}px)!important}
body > .h-dvh,body > main > .h-dvh{height:calc(100dvh - ${height}px)!important}`}
.td-mini-chrome,.td-mini-chrome *{box-sizing:border-box!important;margin:0!important;padding:0!important;border:0 solid transparent!important;font-family:var(--font-sans,system-ui)!important;color:var(--color-text-primary,#171717)!important;line-height:1!important;letter-spacing:normal!important;text-decoration:none!important;box-shadow:none!important;flex-shrink:0!important}
.td-mini-chrome{position:fixed!important;top:0!important;left:0!important;right:0!important;width:100%!important;height:${height}px!important;z-index:2147483000!important;background:var(--color-surface,#fff)!important;display:block!important;user-select:none!important}
.td-mini-status{height:44px!important;display:flex!important;align-items:center!important;justify-content:space-between!important;padding:0 24px!important;font-size:13px!important;font-weight:600!important}
.td-mini-indicators{display:flex!important;gap:4px!important;align-items:center!important}.td-mini-chrome svg{display:block!important;width:16px!important;height:16px!important;fill:none!important;stroke:currentColor!important;stroke-width:2!important}.td-mini-chrome svg:last-child{width:22px!important}
.td-mini-navigation{position:relative!important;display:flex!important;align-items:center!important;justify-content:space-between!important;width:100%!important;height:48px!important;padding:0 8px 0 16px!important}
.td-mini-back{font-size:28px!important;display:block!important;width:32px!important}.td-mini-title{position:absolute!important;left:50%!important;top:50%!important;transform:translate(-50%,-50%)!important;max-width:calc(100% - 210px)!important;overflow:hidden!important;white-space:nowrap!important;text-overflow:ellipsis!important;font-size:16px!important;font-weight:600!important;text-align:center!important}
.td-mini-capsule{display:flex!important;align-items:center!important;width:86px!important;height:32px!important;border:1px solid var(--color-border,#ddd)!important;border-radius:999px!important;background:var(--color-surface,#fff)!important}.td-mini-capsule>span{display:flex!important;align-items:center!important;justify-content:center!important;flex:1 1 0!important;height:100%!important;font-size:21px!important}.td-mini-more{border-right:1px solid var(--color-border,#ddd)!important;font-weight:700!important}.td-mini-home{font-size:20px!important}`;
  doc.head.append(css); doc.body.prepend(shell);
}
