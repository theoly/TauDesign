import type { Screen } from '../types/project';
import { injectMobileChrome, normalizeMobileNavigation, type MobileNavigationPolicy } from './mobileNavigation';
import { resolveImportedViewport } from './importViewport';

export interface ScreenDocumentOptions extends MobileNavigationPolicy {
  tokensCss: string;
  baseCss: string;
  screenOverrides: string;
  editorCss?: string;
  title?: string;
  /** Native/PNG export only. Source page reset and body attributes stay intact. */
  width?: number;
  bgColor?: string;
  includeMobileChrome?: boolean;
  /** Stable viewport for an imported page rendered in an expanding canvas. */
  viewportHeight?: number;
  viewportWidth?: number;
  /** Static image exports must not capture an offscreen entrance animation at its start. */
  staticImage?: boolean;
}

/** Imported CSS keeps its own variable namespace, even when only one category is unified. */
export function projectCssForScreen(screen: Pick<Screen, 'metadata'>, css: string): string {
  return screen.metadata?.importedHtml
    ? css.replace(/--(color|font|space|radius|shadow|blur|mini)-/g, '--td-import-$1-')
    : css;
}

export function runtimeStyle(doc: Document, name: string): HTMLStyleElement | null {
  return doc.querySelector(`style[data-taudesign-runtime="${name}"]`);
}

/** Share exactly the same cascade and document structure in canvas, preview and export. */
export function buildScreenDocument(screen: Screen, options: ScreenDocumentOptions): string {
  const normalized = normalizeMobileNavigation(screen.htmlContent || '<body></body>', options);
  const doc = new DOMParser().parseFromString(normalized.html, 'text/html');
  const imported = !!screen.metadata?.importedHtml;
  // Runtime slots are owned by the editor, never by source document IDs/attributes.
  doc.querySelectorAll('[data-taudesign-runtime]').forEach(el => el.removeAttribute('data-taudesign-runtime'));
  const csp = doc.createElement('meta');
  csp.httpEquiv = 'Content-Security-Policy';
  csp.content = "script-src 'none'; object-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'";
  doc.head.prepend(csp);
  if (!doc.head.querySelector('meta[charset]')) {
    const charset = doc.createElement('meta'); charset.setAttribute('charset', 'UTF-8'); doc.head.prepend(charset);
  }
  if (!doc.head.querySelector('meta[name="viewport"]')) {
    const viewport = doc.createElement('meta'); viewport.name = 'viewport'; viewport.content = 'width=device-width, initial-scale=1.0'; doc.head.append(viewport);
  }
  if (options.title !== undefined || !doc.title) doc.title = options.title ?? screen.name;
  const style = (name: string, css: string) => {
    const el = doc.createElement('style');
    el.id = name; el.setAttribute('data-taudesign-runtime', name);
    // CSS is raw text in HTML; prevent a supplied stylesheet from terminating its element.
    el.textContent = css.replace(/<\/style/gi, '<\\/style');
    return el;
  };
  if (imported) {
    // Older WKWebView gives buttons UA align-items:flex-start, unlike Chromium's
    // normal/stretch. A first, lowest-priority layer restores the CSS initial
    // value without defeating any authored alignment (including layered CSS).
    doc.head.prepend(style('import-compat', '@layer taudesign-import-compat { :where(button) { align-items: normal; } }'));
  }
  const base = style('base-css', imported ? '' : options.baseCss);
  doc.head.insertBefore(base, doc.head.firstChild?.nextSibling ?? null);
  if (options.editorCss !== undefined) doc.head.append(style('editor-chrome', options.editorCss));
  doc.head.append(style('scoped-css', screen.scopedCss ?? ''));
  doc.head.append(style('tokens', projectCssForScreen(screen, options.tokensCss)));
  doc.head.append(style('overrides', projectCssForScreen(screen, options.screenOverrides)));
  doc.head.append(style('frame-fill', imported ? '' : 'html { background-color: var(--color-bg, #f8fafc); }'));
  if (options.width !== undefined) {
    const reset = imported
      ? `html { width: ${options.width}px; }`
      : `html, body { margin: 0; padding: 0; background-color: ${options.bgColor ?? 'var(--color-bg)'}; } html { width: ${options.width}px; } * { box-sizing: border-box; }`;
    // Export reset precedes all authored styles, including body/head styles.
    doc.head.insertBefore(style('reset', reset), base);
  }
  const viewport = options.viewportHeight;
  if (viewport !== undefined) {
    const chromeHeight = options.includeMobileChrome && options.deviceProfile === 'mobile' ? (options.useCustomNavigation ? 44 : 92) : 0;
    resolveImportedViewport(doc, Math.max(1, viewport - chromeHeight), options.viewportWidth ?? options.width);
    const marker = style('viewport', ''); marker.setAttribute('data-viewport-height', String(viewport)); doc.head.append(marker);
  }
  if (imported && options.staticImage) doc.head.append(style('image-resting', '*,::before,::after{animation:none!important;transition:none!important}'));
  if (options.includeMobileChrome) {
    injectMobileChrome(doc, options, screen.metadata?.navigationTitle ?? screen.metadata?.importedHtml?.navigationTitle ?? normalized.title ?? screen.name, viewport !== undefined);
    const chromeStyle = doc.querySelector('style[data-taudesign-mobile-chrome]');
    if (chromeStyle?.textContent) chromeStyle.textContent = projectCssForScreen(screen, chromeStyle.textContent);
  }
  return '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;
}
