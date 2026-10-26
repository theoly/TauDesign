import type {
  HtmlImportAnalysis, HtmlImportCategory, HtmlImportOptions, HtmlImportResource,
  HtmlImportResult, HtmlImportStyleSummary,
} from '../../types/htmlImport';
import { defaultTheme } from '../../utils/themePresets';
import { buildPrimaryRamp } from '../../utils/colorHarmony';
import { normalizeMobileNavigation } from '../../utils/mobileNavigation';
import { buildHtmlImportContract } from '../ai/designWorkflow';
import { htmlImportExecutionRecord } from '../ai/designExecutionRecord';
import {
  colorChroma, colorLightness, cssUrls, imageSrcsetCandidates, opaqueColor, pixelValue, rgbChannels,
  transformDeclarations, transformStyleSheet, unsafeCss, unsafeUrl, type ImportDeclaration, type ImportUrlContext,
} from './htmlImportCss';

const categories: HtmlImportCategory[] = ['colors', 'typography', 'spacing', 'radius', 'shadows'];
const activeTags = new Set(['script', 'iframe', 'frame', 'frameset', 'base', 'object', 'embed', 'applet', 'portal', 'animate', 'animatetransform', 'animatemotion', 'set', 'mpath']);
const urlAttributes = new Set(['href', 'src', 'xlink:href', 'action', 'formaction', 'poster', 'background', 'data', 'cite']);
const serialize = (doc: Document) => '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;
const unique = (values: string[]) => [...new Set(values)];

function elements(root: ParentNode): Element[] {
  const all: Element[] = [];
  for (const element of Array.from(root.querySelectorAll('*'))) {
    all.push(element);
    if (element.localName === 'template') all.push(...elements((element as HTMLTemplateElement).content));
  }
  return all;
}

function hash(value: string): string {
  let result = 2166136261;
  for (let i = 0; i < value.length; i++) { result ^= value.charCodeAt(i); result = Math.imul(result, 16777619); }
  return (result >>> 0).toString(16).padStart(8, '0');
}

function attributeUrlContext(element: Element, attribute: string): ImportUrlContext | undefined {
  const tag = element.localName.toLowerCase();
  if (attribute === 'background' || attribute === 'poster') return 'image';
  if (attribute === 'href' && tag === 'a' && element.hasAttribute('download')) return 'image';
  if (attribute === 'src' && (tag === 'img' || tag === 'input' && element.getAttribute('type')?.toLowerCase() === 'image')) return 'image';
  if (['href', 'xlink:href'].includes(attribute) && (tag === 'image' || tag === 'link' && /(?:^|\s)icon(?:\s|$)/i.test(element.getAttribute('rel') || ''))) return 'image';
  if (attribute === 'src' && ['audio', 'video', 'source'].includes(tag)) return 'media';
  return undefined;
}

function cssUrlContext(declaration: ImportDeclaration): ImportUrlContext | undefined {
  if (/^background(?:-image)?$/.test(declaration.property)) return 'image';
  if (declaration.property === 'src' && /^@font-face\b/i.test(declaration.selector)) return 'font';
  return undefined;
}

function sanitize(doc: Document, warnings: string[]): void {
  let removed = 0;
  for (const element of elements(doc)) {
    const tag = element.localName.toLowerCase();
    if (activeTags.has(tag) || (tag === 'meta' && element.hasAttribute('http-equiv'))
      || (tag === 'link' && !/^(?:stylesheet|icon|shortcut icon)$/i.test(element.getAttribute('rel') || ''))) {
      element.remove(); removed++; continue;
    }
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      if (name.startsWith('on') || ['srcdoc', 'autofocus', 'is', 'ping'].includes(name)
        || (urlAttributes.has(name) && unsafeUrl(attribute.value, attributeUrlContext(element, name)))) {
        element.removeAttribute(attribute.name); removed++;
      }
      if (['srcset', 'imagesrcset'].includes(name)) {
        const candidates = imageSrcsetCandidates(attribute.value);
        const safe = candidates.filter(candidate => !unsafeUrl(candidate.url, 'image'));
        if (safe.length !== candidates.length) removed += candidates.length - safe.length;
        if (safe.length) element.setAttribute(attribute.name, safe.map(candidate => candidate.url + (candidate.descriptor ? ` ${candidate.descriptor}` : '')).join(', '));
        else element.removeAttribute(attribute.name);
      }
    }
    if (element.hasAttribute('style')) {
      element.setAttribute('style', transformDeclarations(element.getAttribute('style')!, '<inline>', false, declaration => {
        if (unsafeCss(`${declaration.property}:${declaration.value}`, cssUrlContext(declaration))) { removed++; return null; }
      }));
    }
    if (tag === 'style') element.textContent = transformStyleSheet(element.textContent || '', declaration => {
      if (unsafeCss(`${declaration.property}:${declaration.value}`, cssUrlContext(declaration))) { removed++; return null; }
    }, description => { if (description.startsWith('已移除')) removed++; else warnings.push(description); });
  }
  if (removed) warnings.push(`已移除 ${removed} 项脚本、事件、活动嵌入或危险 URL；依赖 JavaScript 的动态内容不会执行。`);
  const all = elements(doc), used = new Set<string>();
  let repaired = 0;
  for (let index = 0; index < all.length; index++) {
    const element = all[index], original = element.getAttribute('data-nid');
    // Preserve aliases across resource resolution followed by re-analysis.
    if (original !== null && !element.hasAttribute('data-import-source-nid') && !element.hasAttribute('data-import-generated-nid')) element.setAttribute('data-import-source-nid', original);
    if (original && /^[a-z0-9]{8}$/.test(original) && !used.has(original)) { used.add(original); continue; }
    let attempt = 0, id: string;
    do { id = hash(`${index}:${element.localName}:${attempt++}`); } while (used.has(id));
    element.setAttribute('data-nid', id); element.setAttribute('data-import-generated-nid', ''); used.add(id);
    if (original) repaired++;
  }
  for (const style of all.filter(element => element.localName === 'style')) style.textContent = transformStyleSheet(style.textContent || '', () => undefined, undefined, false, true);
  if (repaired) warnings.push(`已修复 ${repaired} 个重复或非法节点标识，源选择器通过独立属性保留。`);
}

function declaredStyles(doc: Document): ImportDeclaration[] {
  const declarations: ImportDeclaration[] = [];
  for (const element of elements(doc)) if (element.localName === 'style') transformStyleSheet(element.textContent || '', declaration => { declarations.push(declaration); });
  return declarations;
}

function specificity(selector: string): number {
  return (selector.match(/#[\w-]+/g)?.length || 0) * 10000
    + (selector.match(/\.[\w-]+|\[[^\]]+\]|:[\w-]+/g)?.length || 0) * 100
    + (selector.match(/(?:^|[\s>+~,])\s*[a-z][\w-]*/gi)?.length || 0);
}

/** Conservative declared cascade for inference; never reported as computed CSS. */
function declaredValue(element: Element, properties: string[], declarations: ImportDeclaration[]): string | undefined {
  let value: string | undefined, priority = -1;
  for (const declaration of declarations) {
    if (declaration.conditional || !properties.includes(declaration.property) || declaration.selector.startsWith('@')) continue;
    try {
      for (const selector of declaration.selector.split(',')) {
        if (!element.matches(selector.trim())) continue;
        const score = specificity(selector) + (declaration.important ? 1000000 : 0);
        if (score >= priority) { value = declaration.value; priority = score; }
      }
    } catch { /* Unsupported selectors remain in the source. */ }
  }
  if (element.hasAttribute('style')) transformDeclarations(element.getAttribute('style')!, '<inline>', false, declaration => {
    if (!properties.includes(declaration.property)) return;
    const score = 100000 + (declaration.important ? 1000000 : 0);
    if (score >= priority) { value = declaration.value; priority = score; }
  });
  return value;
}

function resolvedValue(element: Element, properties: string[], declarations: ImportDeclaration[], depth = 0): string | undefined {
  const value = declaredValue(element, properties, declarations);
  if (!value || depth > 8) return value;
  const variable = /^var\(\s*(--[\w-]+)\s*(?:,\s*(.+))?\)$/.exec(value);
  if (!variable) return value;
  let current: Element | null = element;
  while (current) {
    const result = resolvedValue(current, [variable[1]], declarations, depth + 1);
    if (result) return result;
    current = current.parentElement;
  }
  return variable[2];
}

function staticSelector(selector: string): boolean {
  // A selector's runtime state must not decide which variable value gets frozen.
  // Attribute values may contain colons, so remove their bodies before checking.
  return !/[:\\]/.test(selector.replace(/\[[^\]]*\]/g, '').replace(/:root\b/g, '')) && !selector.trim().startsWith('@');
}

/** Resolve simple variable usages only; source definitions are never rewritten. */
function simpleVariableResolver(doc: Document, declarations: ImportDeclaration[]) {
  const inlineDefinitions: ImportDeclaration[] = [];
  const source: string[] = [];
  for (const element of elements(doc)) {
    if (element.localName === 'style') source.push(element.textContent || '');
    if (element.hasAttribute('style')) {
      const css = element.getAttribute('style')!;
      source.push(css);
      transformDeclarations(css, '<inline>', false, declaration => {
        if (declaration.property.startsWith('--')) inlineDefinitions.push(declaration);
      });
    }
  }
  const allSource = source.join('\n');
  const registeredNames = new Set([...allSource.matchAll(/@property\s+(--[\w-]+)\s*\{/gi)].map(match => match[1]));
  const missingStyles = !!doc.querySelector('link[rel~="stylesheet"][href]') || /@import\b/i.test(allSource);
  const uncertain = new Map<string, boolean>();
  const variableIsUncertain = (name: string) => {
    if (uncertain.has(name)) return uncertain.get(name)!;
    const definitions = declarations.filter(declaration => declaration.property === name);
    const knownCount = definitions.length + inlineDefinitions.filter(declaration => declaration.property === name).length;
    // Unsupported nesting/registered properties may change scope or inheritance.
    const rawCount = [...allSource.matchAll(new RegExp(`${name}\\s*:`, 'g'))].length;
    const result = missingStyles || registeredNames.has(name) || rawCount !== knownCount || definitions.some(declaration => declaration.conditional || !staticSelector(declaration.selector));
    uncertain.set(name, result);
    return result;
  };
  return (declaration: ImportDeclaration, context?: Element): string | undefined => {
    const usage = /^var\(\s*(--[\w-]+)\s*(?:,\s*(.+))?\)$/.exec(declaration.value);
    if (!usage || /(?:var|env|attr|calc|min|max|clamp)\(/i.test(usage[2] || '') || variableIsUncertain(usage[1])) return;
    let targets: Element[];
    if (context) targets = [context];
    else {
      if (!staticSelector(declaration.selector)) return;
      try { targets = [...doc.querySelectorAll(declaration.selector)]; } catch { return; }
    }
    if (!targets.length) return;
    const values = new Set<string>();
    for (const target of targets) {
      let current: Element | null = target, value: string | undefined;
      while (current) {
        value = declaredValue(current, [usage[1]], declarations);
        if (value !== undefined) break;
        current = current.parentElement;
      }
      value ??= usage[2]?.trim();
      if (!value || /(?:var|env|attr|calc|min|max|clamp)\(/i.test(value) || /^(?:inherit|initial|unset|revert(?:-layer)?)$/i.test(value)) return;
      values.add(value.trim());
      // A shared rule cannot be rewritten from the first matching element alone.
      if (values.size > 1) return;
    }
    return [...values][0];
  };
}

function summarize(doc: Document, declarations: ImportDeclaration[]): HtmlImportStyleSummary {
  const summary: HtmlImportStyleSummary = { colors: [], fonts: [], fontSizes: [], spacing: [], radius: [], shadows: [], styleSheetCount: 0, inlineStyleCount: 0 };
  const all = [...declarations];
  for (const element of elements(doc)) {
    if (element.localName === 'style') summary.styleSheetCount++;
    if (element.hasAttribute('style')) {
      summary.inlineStyleCount++;
      transformDeclarations(element.getAttribute('style')!, '<inline>', false, declaration => { all.push(declaration); });
    }
  }
  for (const { property, value } of all) {
    const color = opaqueColor(value);
    if (color) summary.colors.push(color);
    if (property === 'font-family') summary.fonts.push(value);
    if (property === 'font-size') summary.fontSizes.push(value);
    if (/^(?:margin|padding|gap|row-gap|column-gap)(?:-|$)/.test(property)) summary.spacing.push(value);
    if (/^border.*radius$/.test(property)) summary.radius.push(value);
    if (property === 'box-shadow') summary.shadows.push(value);
  }
  for (const key of ['colors', 'fonts', 'fontSizes', 'spacing', 'radius', 'shadows'] as const) summary[key] = unique(summary[key]);
  return summary;
}

function resourceList(doc: Document): HtmlImportResource[] {
  const resources = new Map<string, HtmlImportResource>();
  const add = (url: string | null, type: HtmlImportResource['type']) => {
    if (!url || url.startsWith('#') || unsafeUrl(url, type === 'image' ? 'image' : type === 'font' ? 'font' : type === 'media' ? 'media' : undefined)) return;
    const status: HtmlImportResource['status'] = /^https?:|^\/\//i.test(url) ? 'external' : /^data:/i.test(url) ? 'embedded' : /^assets\//.test(url) ? 'local' : 'missing';
    resources.set(`${type}:${url}`, { url, type, status });
  };
  for (const element of elements(doc)) {
    const tag = element.localName;
    if (tag === 'link' && element.getAttribute('rel')?.toLowerCase() === 'stylesheet') add(element.getAttribute('href'), 'stylesheet');
    if (tag === 'link' && /(?:^|\s)icon(?:\s|$)/i.test(element.getAttribute('rel') || '')) add(element.getAttribute('href'), 'image');
    if (['img', 'image', 'input'].includes(tag)) {
      add(element.getAttribute('src') || element.getAttribute('href') || element.getAttribute('xlink:href'), 'image');
    }
    const srcset = element.getAttribute('srcset');
    if (srcset) for (const candidate of imageSrcsetCandidates(srcset)) add(candidate.url, 'image');
    if (['video', 'audio', 'source', 'track'].includes(tag)) add(element.getAttribute('src'), 'media');
    add(element.getAttribute('poster'), 'image');
    const source = tag === 'style' ? element.textContent || '' : element.getAttribute('style') || '';
    transformStyleSheet(tag === 'style' ? source : `x{${source}}`, declaration => {
      for (const url of cssUrls(declaration.value)) add(url, declaration.selector.toLowerCase().startsWith('@font-face') ? 'font' : 'image');
    });
    for (const match of source.matchAll(/@import\s+(?:url\(\s*(?:"([^"\n]*)"|'([^'\n]*)'|([^\s)]*))\s*\)|"([^"\n]*)"|'([^'\n]*)')/gi)) {
      add(match[1] ?? match[2] ?? match[3] ?? match[4] ?? match[5], 'stylesheet');
    }
  }
  return [...resources.values()];
}

/** expandedResources is for bundles whose raw HTML and files were already size-validated. */
export function analyzeHtmlImport(html: string, fileName: string, options?: { expandedResources?: boolean }): HtmlImportAnalysis {
  if (!html.trim()) throw new Error('HTML 文件为空，请选择包含页面内容的文件。');
  const maxMiB = options?.expandedResources ? 30 : 2;
  if (new TextEncoder().encode(html).byteLength > maxMiB * 1024 * 1024) throw new Error(`HTML 文件超过 ${maxMiB} MiB 限制。`);
  const doc = new DOMParser().parseFromString(html, 'text/html');
  if (!doc.documentElement || !doc.body) throw new Error('无法解析 HTML 文档。');
  const warnings: string[] = [];
  sanitize(doc, warnings);
  const declarations = declaredStyles(doc), styleSummary = summarize(doc, declarations), resources = resourceList(doc);
  if (resources.some(resource => ['external', 'missing'].includes(resource.status))) warnings.push('页面存在外部或尚未提供的本地资源；请补充资源后重新分析。');
  warnings.push('主题来自单页已声明样式的静态角色推断，并非浏览器计算样式；媒体查询、复杂选择器和动态布局需在预览中确认。');
  warnings.push('未提取或推断不确定的 Token（包括色阶、另一明暗模式、间距、密度与字号比例等）使用默认主题补全。');
  const suggestedTheme = structuredClone(defaultTheme);
  suggestedTheme.id = `import-${hash(fileName + html)}`;
  suggestedTheme.name = `${doc.title.trim() || fileName.replace(/\.html?$/i, '') || '导入页面'} · 提取风格`;
  const rootValue = (properties: string[]) => resolvedValue(doc.body, properties, declarations) || resolvedValue(doc.documentElement, properties, declarations);
  const background = opaqueColor(rootValue(['background', 'background-color']) || ''), foreground = opaqueColor(rootValue(['color']) || '');
  const suggestedColorMode = background && colorLightness(background) < 0.45 ? 'dark' : 'light';
  const tokens = suggestedTheme.tokens;
  if (background) tokens.colors.background[suggestedColorMode] = background;
  if (foreground) tokens.colors.textPrimary[suggestedColorMode] = foreground;
  let primary: string | undefined;
  const actions = Array.from(doc.querySelectorAll('button, [role="button"], input[type="submit"], input[type="button"], a[href]'));
  for (const action of actions) {
    const fill = opaqueColor(resolvedValue(action, ['background', 'background-color'], declarations) || '');
    const ink = opaqueColor(resolvedValue(action, ['color'], declarations) || '');
    const candidate = fill && colorChroma(fill) > 0.12 ? fill : ink && colorChroma(ink) > 0.12 ? ink : undefined;
    if (candidate) { primary = candidate; break; }
  }
  if (primary) tokens.colors.primary = buildPrimaryRamp(primary);
  else warnings.push('未发现可识别的操作元素主色，主色使用默认值；装饰色频次不作为主色依据。');
  const font = rootValue(['font-family']);
  if (font && !/var\(|inherit|initial|unset/.test(font)) tokens.typography.fontFamilySans = font;
  const size = pixelValue(rootValue(['font-size']) || '');
  if (size && size > 0) tokens.typography.sizes.md = size;
  const radius = actions.map(action => resolvedValue(action, ['border-radius'], declarations)).find(value => value && pixelValue(value) !== undefined) || styleSummary.radius.find(value => pixelValue(value) !== undefined);
  if (radius) tokens.radius.md = radius;
  const shadow = styleSummary.shadows.find(value => value !== 'none' && finiteShadow(value));
  if (shadow) tokens.shadows.card[suggestedColorMode] = shadow;
  const observedWidth = pixelValue(rootValue(['width', 'max-width']) || '');
  const detectedWidth = observedWidth && observedWidth > 0 && observedWidth < 10000 ? observedWidth : undefined;
  return { fileName, sanitizedHtml: serialize(doc), title: doc.title.trim() || fileName.replace(/\.html?$/i, '') || '导入页面', nodeCount: elements(doc.body).length,
    warnings: unique(warnings), resources, styleSummary, suggestedTheme, suggestedColorMode, ...(detectedWidth ? { detectedWidth } : {}) };
}

function nearest(value: number, entries: Array<[string, number]>): string {
  return entries.reduce((best, current) => Math.abs(current[1] - value) < Math.abs(best[1] - value) ? current : best)[0];
}

function finiteShadow(value: string): boolean {
  if (/var\(|calc\(|url\(|(?:^|\s)(?:inherit|initial|unset|revert)(?:\s|$)/i.test(value)) return false;
  const stripped = value.replace(/(?:rgba?|hsla?)\([^)]*\)|#[\da-f]{3,8}\b|\binset\b/gi, '').replace(/\b(?:black|white|gray|grey|red|blue|green)\b/gi, '');
  return /\d/.test(stripped) && /^[\d\s.,+\-px]*$/i.test(stripped);
}

function colorRole(property: string, color: string, declaration: ImportDeclaration, analysis: HtmlImportAnalysis): string {
  const primary = analysis.suggestedTheme.tokens.colors.primary['500'];
  const isText = ['color', 'fill', 'text-decoration-color'].includes(property), isBackground = ['background', 'background-color'].includes(property);
  const actionable = /(?:\bbutton\b|\binput\b|\brole\s*=\s*["']?button|[.#][\w-]*(?:btn|primary|action))/i.test(declaration.selector);
  const root = /(?:^|[,\s>+~])(?:body|html|:root)(?:$|[,\s.#[:])/i.test(declaration.selector);
  if (color === primary) return isText ? 'primary-text' : 'primary';
  if (colorChroma(color) > 0.16) {
    if (actionable && isBackground) return 'primary';
    const [r, g, b] = rgbChannels(color);
    if (g > r * 1.2 && g > b * 1.1) return isBackground ? 'success-light' : 'success';
    if (r > g * 1.5 && r > b * 1.3) return isBackground ? 'danger-light' : 'danger';
    if (r > b * 1.4 && g > b * 1.4) return isBackground ? 'warning-light' : 'warning';
    return isText ? 'accent-text' : isBackground ? 'accent-light' : 'accent';
  }
  if (/border|outline|stroke/.test(property)) return 'border';
  const light = colorLightness(color);
  if (isText) {
    if (actionable && light > 0.85) return 'on-primary';
    const strong = analysis.suggestedColorMode === 'dark' ? light > 0.65 : light < 0.3;
    return strong ? 'text-primary' : 'text-secondary';
  }
  return root ? 'bg' : light > 0.9 || light < 0.2 ? 'surface' : 'surface-alt';
}

function declarationCategory(property: string): HtmlImportCategory | undefined {
  if (/^(?:color|background(?:-color)?|(?:border(?:-(?:top|right|bottom|left))?|outline)(?:-color)?|fill|stroke|text-decoration-color)$/.test(property)) return 'colors';
  if (/^(?:font(?:-family|-size|-weight)?|line-height|letter-spacing)$/.test(property)) return 'typography';
  if (/^(?:margin|padding)(?:-(?:top|right|bottom|left|inline|block|inline-start|inline-end|block-start|block-end))?$/.test(property) || /^(?:gap|row-gap|column-gap)$/.test(property)) return 'spacing';
  if (/^border(?:-(?:top-left|top-right|bottom-left|bottom-right))?-radius$/.test(property)) return 'radius';
  if (property === 'box-shadow' || property === 'text-shadow') return 'shadows';
  return undefined;
}

export function convertHtmlImport(analysis: HtmlImportAnalysis, options: HtmlImportOptions): HtmlImportResult {
  const selected = options.mode === 'unify' ? [...categories] : options.mode === 'selective' ? categories.filter(category => options.categories?.includes(category)) : [];
  const changes: string[] = [], retained: string[] = [], doc = new DOMParser().parseFromString(analysis.sanitizedHtml, 'text/html'), tokens = options.designSystem.tokens;
  const resolveVariable = selected.length ? simpleVariableResolver(doc, declaredStyles(doc)) : () => undefined;
  const variable = (name: string) => `var(--td-import-${name})`;
  const map = (declaration: ImportDeclaration, context?: Element): string | undefined => {
    const { property } = declaration, category = declarationCategory(property);
    if (!category || !selected.includes(category)) return;
    const value = resolveVariable(declaration, context) ?? declaration.value;
    let next: string | undefined;
    if (category === 'colors') {
      const color = opaqueColor(value);
      if (color) next = variable(`color-${colorRole(property, color, declaration, analysis)}`);
      else if (/^(?:border(?:-(?:top|right|bottom|left))?|outline)$/.test(property)) {
        const match = /^(.*\s)(#[\da-f]{3,8}|[a-z]+|(?:rgb|hsl)a?\([^)]*\))$/i.exec(value), borderColor = match && opaqueColor(match[2]);
        if (match && borderColor) next = match[1] + variable(`color-${colorRole(property, borderColor, declaration, analysis)}`);
      }
    } else if (category === 'typography') {
      if (property === 'font-family' && !/var\(|(?:^|\s)(?:inherit|initial|unset|revert)(?:\s|$)/.test(value)) next = variable(/mono|courier|consolas/i.test(value) ? 'font-mono' : 'font-sans');
      if (property === 'font-size') {
        const size = pixelValue(value);
        if (size !== undefined && size > 0) next = variable('font-size-' + nearest(size, Object.entries(tokens.typography.sizes).filter(([key]) => ['xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl', '4xl'].includes(key))));
      }
    } else if (category === 'spacing') {
      const parts = value.trim().split(/\s+/);
      if (parts.length <= 4 && parts.every(part => pixelValue(part) !== undefined || part === 'auto')) next = parts.map(part => {
        if (part === 'auto') return part;
        const number = pixelValue(part)!, entry = nearest(Math.abs(number), Object.entries(tokens.spacing).filter(([key]) => ['0', '1', '2', '3', '4', '5', '6', '8'].includes(key)));
        return number < 0 ? `calc(-1 * ${variable('space-' + entry)})` : variable('space-' + entry);
      }).join(' ');
    } else if (category === 'radius') {
      const parts = value.trim().split(/\s+/);
      if (parts.length <= 4 && parts.every(part => pixelValue(part) !== undefined && pixelValue(part)! >= 0)) next = parts.map(part => variable('radius-' + nearest(pixelValue(part)!, Object.entries(tokens.radius).map(([key, radius]) => [key, pixelValue(radius) ?? 0])))).join(' ');
    } else if (category === 'shadows' && property === 'box-shadow' && finiteShadow(value)) {
      const largest = Math.max(0, ...[...value.matchAll(/([\d.]+)px\b/g)].map(match => Number(match[1])));
      next = variable('shadow-' + (largest >= 16 ? 'lg' : largest >= 6 ? 'md' : 'sm'));
    }
    if (next && next !== declaration.value) { changes.push(`${property}: ${declaration.value} → ${next}`); return next; }
    retained.push(`保留 ${property}: ${declaration.value}（复杂表达式、作用域不确定、透明色或尚无对应 Token）`);
  };
  if (selected.length) for (const element of elements(doc)) {
    if (element.localName === 'style') element.textContent = transformStyleSheet(element.textContent || '', map, description => retained.push(description));
    if (element.hasAttribute('style')) element.setAttribute('style', transformDeclarations(element.getAttribute('style')!, element.localName, false, declaration => map(declaration, element)));
    if (selected.includes('colors')) for (const attribute of ['fill', 'stroke', 'color', 'bgcolor']) {
      const value = element.getAttribute(attribute);
      if (!value) continue;
      const next = map({ property: attribute === 'bgcolor' ? 'background-color' : attribute, value, selector: element.localName, conditional: false, important: false }, element);
      if (next) element.setAttribute(attribute, next);
    }
  }
  if (options.mode === 'preserve') retained.push('保留源页面静态 DOM、样式、文案和布局；未统一到项目 Token。');
  const distinctChanges = unique(changes), distinctRetained = unique(retained);
  const navigation = normalizeMobileNavigation(serialize(doc), options);
  if (navigation.removedNids.length || navigation.title) distinctChanges.push(options.useCustomNavigation ? '系统状态栏由预览外壳提供，自定义导航保留。' : '顶部状态栏与导航栏由微信预览外壳提供，不写入页面HTML。');
  const frameWidth = options.frameWidth ?? (options.deviceProfile === 'mobile' ? 390 : 1440);
  const workflow = buildHtmlImportContract({ fileName: analysis.fileName, html: analysis.sanitizedHtml, mode: options.mode,
    categories: options.categories, deviceProfile: options.deviceProfile ?? 'pc', frameWidth,
    referenceDeviceName: options.referenceDeviceName, designSystem: options.designSystem });
  return { htmlContent: navigation.html, scopedCss: '', workflowContract:workflow, executionRecord: htmlImportExecutionRecord(navigation.html), changes: distinctChanges, retained: distinctRetained,
    metadata: { fileName: analysis.fileName, mode: options.mode, categories: selected, changes: distinctChanges, retained: distinctRetained, version: 1,
      workflow: { id: workflow.workflowId as 'import-html-preserve' | 'import-html-unify' | 'import-html-selective', contractVersion: workflow.version,
        strategy: workflow.strategy as 'preserve-source' | 'normalize-tokens' | 'normalize-selected-tokens',
        sourceFingerprint: workflow.target!.baselineFingerprint, designSystemId: options.designSystem.id, deviceProfile: options.deviceProfile ?? 'pc', frameWidth },
      ...(navigation.title ? { navigationTitle: navigation.title } : {}) } };
}
