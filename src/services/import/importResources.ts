import type { ProjectStorage } from '../storage/projectStorage';
import { cssUrls, decodeCss, transformDeclarations, transformStyleSheet, unsafeCss } from './htmlImportCss';

export interface ImportResourceFile { path: string; file: File }
export interface ImportResourceReport { url: string; status: 'resolved' | 'missing' | 'remote'; kind: string }
export interface ImportBinary { relPath: string; base64: string; mimeType: string; name: string }
export interface PreparedImportResources {
  html: string;
  resources: ImportResourceReport[];
  /** Ephemeral upload payload. Never store this object in project metadata or history. */
  binaries: ImportBinary[];
  warnings: string[];
}

const MiB = 1024 * 1024;
const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
  avif: 'image/avif', svg: 'image/svg+xml', ico: 'image/x-icon', bmp: 'image/bmp',
  woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf',
};
const FONT_EXT = new Set(['woff', 'woff2', 'ttf', 'otf']);
const EXT_BY_MIME = Object.fromEntries(Object.entries(MIME_BY_EXT).map(([ext, mime]) => [mime, ext]));
EXT_BY_MIME['image/jpeg'] = 'jpg';
const utf8 = new TextEncoder();

function extension(path: string): string { return path.split('.').pop()?.toLowerCase() ?? ''; }
function directory(path: string): string { return path.slice(0, Math.max(0, path.lastIndexOf('/'))); }
function isRemote(url: string): boolean { return /^(?:https?:)?\/\//i.test(url); }

/** Normalize only bundle-relative paths; never make an escaping path appear valid. */
function normalizePath(path: string): string | null {
  let decoded: string;
  try { decoded = decodeURIComponent(path).replace(/\\/g, '/'); } catch { return null; }
  if (/^(?:\/|[a-z][a-z\d+.-]*:)/i.test(decoded) || /[\u0000-\u001f]/.test(decoded)) return null;
  const parts: string[] = [];
  for (const part of decoded.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') { if (!parts.length) return null; parts.pop(); }
    else parts.push(part);
  }
  return parts.join('/');
}

function splitSuffix(url: string): { path: string; suffix: string } {
  const i = url.search(/[?#]/);
  return i < 0 ? { path: url, suffix: '' } : { path: url.slice(0, i), suffix: url.slice(i) };
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function documentHtml(doc: Document): string { return `<!DOCTYPE html>\n${doc.documentElement.outerHTML}`; }

/** querySelectorAll deliberately stops at template boundaries. Import/export must not. */
function resourceElements(root: ParentNode): Element[] {
  const elements: Element[] = [];
  for (const element of root.querySelectorAll('*')) {
    elements.push(element);
    if (element.localName.toLowerCase() === 'template') elements.push(...resourceElements((element as HTMLTemplateElement).content));
  }
  return elements;
}

function sanitizeSvgCss(css: string, inline = false): string {
  // Imports are active dependencies, whereas ordinary SVG class rules are static
  // presentation and must survive sanitization (otherwise icons become black).
  let withoutImports = ''; let cursor = 0;
  for (const ref of cssReferences(css)) {
    if (ref.kind !== 'import') continue;
    withoutImports += css.slice(cursor, ref.start); cursor = ref.end;
  }
  withoutImports += css.slice(cursor);
  const visitor = (declaration: { value: string }) => unsafeCss(declaration.value) || /\b(?:image|(?:-webkit-)?image-set)\s*\(/i.test(decodeCss(declaration.value)) ||
    cssUrls(declaration.value).some((url) => !url.trim().startsWith('#')) ? null : undefined;
  const sanitized = inline ? transformDeclarations(withoutImports, '', false, visitor) : transformStyleSheet(withoutImports, visitor);
  // Unknown at-rules and escaped import keywords do not pass through declaration
  // visitors. Reject such remaining active CSS rather than retaining a fetch.
  if (unsafeCss(sanitized) || cssUrls(sanitized).some((url) => !url.trim().startsWith('#')) || /@import\b/i.test(decodeCss(sanitized))) return '';
  return sanitized;
}

/** SVG assets have their own document and do not inherit the main HTML sanitizer. */
function sanitizeSvg(bytes: Uint8Array): Uint8Array {
  const doc = new DOMParser().parseFromString(new TextDecoder().decode(bytes), 'image/svg+xml');
  if (doc.querySelector('parsererror') || doc.documentElement.localName !== 'svg') throw new Error('非法 SVG 资源');
  for (const node of [...doc.querySelectorAll('*')]) {
    if (['script', 'foreignobject', 'iframe', 'object', 'embed', 'animate', 'animatetransform', 'animatemotion', 'set'].includes(node.localName.toLowerCase())) {
      node.remove(); continue;
    }
    if (node.localName.toLowerCase() === 'style') node.textContent = sanitizeSvgCss(node.textContent ?? '');
    for (const attr of [...node.attributes]) {
      const name = attr.name.toLowerCase();
      if (name === 'style') {
        const safeStyle = sanitizeSvgCss(attr.value, true);
        if (safeStyle.trim()) node.setAttribute(attr.name, safeStyle); else node.removeAttribute(attr.name);
        continue;
      }
      const decodedValue = cssUnescape(attr.value);
      if (name.startsWith('on') || name === 'xml:base' || name === 'src' || name === 'srcdoc' ||
        ((name === 'href' || name.endsWith(':href')) && !attr.value.trim().startsWith('#')) ||
        /(?:javascript|vbscript|data|https?|file):|\/\//i.test(decodedValue) && name !== 'xmlns' && !name.startsWith('xmlns:') ||
        /expression\s*\(|-moz-binding|behavior\s*:/i.test(decodedValue) ||
        cssReferences(decodedValue).some((ref) => !ref.url.trim().startsWith('#'))) node.removeAttribute(attr.name);
    }
  }
  return utf8.encode(new XMLSerializer().serializeToString(doc.documentElement));
}

interface CssReference { start: number; end: number; url: string; kind: 'url' | 'import'; media?: string }

function cssUnescape(text: string): string {
  return text.replace(/\\(?:([\da-f]{1,6})\s?|([^\r\n\f]))/gi, (_match, hex: string | undefined, escaped: string | undefined) =>
    hex ? String.fromCodePoint(Math.min(parseInt(hex, 16), 0x10ffff) || 0xfffd) : escaped ?? '');
}
function cssQuote(text: string): string { return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n\f]/g, '')}"`; }
function stringEnd(css: string, start: number): number {
  const quote = css[start];
  for (let i = start + 1; i < css.length; i++) {
    if (css[i] === '\\') { i++; continue; }
    if (css[i] === quote) return i + 1;
  }
  return css.length;
}
function skipCssTrivia(css: string, start: number): number {
  let pos = start;
  while (pos < css.length) {
    if (/\s/.test(css[pos])) { pos++; continue; }
    if (css.startsWith('/*', pos)) { const end = css.indexOf('*/', pos + 2); pos = end < 0 ? css.length : end + 2; continue; }
    break;
  }
  return pos;
}
function urlToken(css: string, start: number): { end: number; url: string } | null {
  const match = /^url\s*\(/i.exec(css.slice(start));
  if (!match) return null;
  let pos = skipCssTrivia(css, start + match[0].length);
  let value: string;
  if (css[pos] === '"' || css[pos] === "'") {
    const end = stringEnd(css, pos);
    value = css.slice(pos + 1, end - 1); pos = end;
  } else {
    const begin = pos;
    while (pos < css.length && css[pos] !== ')') { if (css[pos] === '\\') pos++; pos++; }
    value = css.slice(begin, pos).trim();
  }
  pos = skipCssTrivia(css, pos);
  return css[pos] === ')' ? { end: pos + 1, url: cssUnescape(value) } : null;
}

/** Scan CSS tokens, skipping comments and strings so textual url(...) is not rewritten. */
function cssReferences(css: string): CssReference[] {
  const refs: CssReference[] = [];
  for (let i = 0; i < css.length;) {
    if (css.startsWith('/*', i)) { const end = css.indexOf('*/', i + 2); i = end < 0 ? css.length : end + 2; continue; }
    if (css[i] === '"' || css[i] === "'") { i = stringEnd(css, i); continue; }
    if (/^@import\b/i.test(css.slice(i))) {
      const start = i;
      i += 7;
      i = skipCssTrivia(css, i);
      let url: string | undefined;
      const token = urlToken(css, i);
      if (token) { url = token.url; i = token.end; }
      else if (css[i] === '"' || css[i] === "'") { const end = stringEnd(css, i); url = cssUnescape(css.slice(i + 1, end - 1)); i = end; }
      if (url === undefined) continue;
      const mediaStart = i;
      let depth = 0;
      while (i < css.length) {
        if (css[i] === '"' || css[i] === "'") { i = stringEnd(css, i); continue; }
        if (css[i] === '(') depth++;
        if (css[i] === ')') depth--;
        if (css[i] === ';' && depth === 0) break;
        i++;
      }
      refs.push({ start, end: css[i] === ';' ? i + 1 : i, url, kind: 'import', media: css.slice(mediaStart, i).trim() });
      if (css[i] === ';') i++;
      continue;
    }
    if ((i === 0 || !/[\w-]/.test(css[i - 1])) && /^url\s*\(/i.test(css.slice(i))) {
      const token = urlToken(css, i);
      if (token) { refs.push({ start: i, end: token.end, url: token.url, kind: 'url' }); i = token.end; continue; }
    }
    i++;
  }
  return refs;
}

async function rewriteCss(css: string, replace: (ref: CssReference) => Promise<string>): Promise<string> {
  const refs = cssReferences(css);
  let out = ''; let cursor = 0;
  for (const ref of refs) { out += css.slice(cursor, ref.start) + await replace(ref); cursor = ref.end; }
  return out + css.slice(cursor);
}

/** Replace an asset at CSS URL tokens without changing textual content or imports. */
export function replaceCssResourceUrl(css: string, from: string, to: string): string {
  let out = ''; let cursor = 0;
  for (const ref of cssReferences(css)) {
    if (ref.kind !== 'url') continue;
    const { path, suffix } = splitSuffix(ref.url);
    if (ref.url !== from && path !== from) continue;
    const retainedSuffix = ref.url !== from && !/[?#]/.test(to) ? suffix : '';
    out += css.slice(cursor, ref.start) + `url(${cssQuote(to + retainedSuffix)})`;
    cursor = ref.end;
  }
  return out + css.slice(cursor);
}

/** The srcset candidate grammar permits commas inside a data URL. */
async function rewriteSrcset(value: string, resolve: (url: string) => Promise<string>): Promise<string> {
  const candidates: string[] = [];
  let pos = 0;
  while (pos < value.length) {
    while (pos < value.length && /[\s,]/.test(value[pos])) pos++;
    const start = pos;
    const data = value.slice(pos, pos + 5).toLowerCase() === 'data:';
    while (pos < value.length && !/\s/.test(value[pos]) && (data || value[pos] !== ',')) pos++;
    let url = value.slice(start, pos);
    let descriptor = '';
    if (url.endsWith(',')) url = url.slice(0, -1);
    else { const descriptorStart = pos; while (pos < value.length && value[pos] !== ',') pos++; descriptor = value.slice(descriptorStart, pos).trim(); }
    if (url) candidates.push(`${await resolve(url)}${descriptor ? ` ${descriptor}` : ''}`);
    if (value[pos] === ',') pos++;
  }
  return candidates.join(', ');
}

const URL_ATTRIBUTES = new Set(['href', 'xlink:href', 'src', 'poster', 'background', 'cite', 'longdesc', 'manifest', 'action', 'formaction', 'data', 'codebase', 'archive', 'profile', 'ping', 'usemap', 'lowsrc', 'dynsrc']);

async function rewriteHtmlLocations(doc: Document, resolve: (url: string, kind: string) => Promise<string>, css: (text: string, element: Element) => Promise<string>, rejectUnhandledData = false): Promise<void> {
  for (const el of resourceElements(doc)) {
    const tag = el.localName.toLowerCase();
    const attributes: string[] = [];
    if (['img', 'source', 'video', 'audio', 'track', 'input'].includes(tag)) attributes.push('src');
    if (tag === 'video') attributes.push('poster');
    if (el.hasAttribute('background')) attributes.push('background');
    if (['image', 'use'].includes(tag)) attributes.push('href', 'xlink:href');
    if (tag === 'a' && (el.hasAttribute('download') || /^data:/i.test(el.getAttribute('href') ?? '') || importAssetPath(splitSuffix(el.getAttribute('href') ?? '').path))) attributes.push('href');
    if (tag === 'link' && /(?:^|\s)(?:icon|apple-touch-icon)(?:\s|$)/i.test(el.getAttribute('rel') ?? '')) attributes.push('href');
    for (const attr of attributes) {
      const value = el.getAttribute(attr);
      if (value) el.setAttribute(attr, await resolve(value, tag === 'source' ? 'source' : 'image'));
    }
    for (const attr of ['srcset', 'imagesrcset']) if (el.hasAttribute(attr)) el.setAttribute(attr, await rewriteSrcset(el.getAttribute(attr)!, (url) => resolve(url, 'image')));
    if (rejectUnhandledData) {
      for (const attr of [...el.attributes]) {
        if (URL_ATTRIBUTES.has(attr.name.toLowerCase()) && !attributes.includes(attr.name.toLowerCase()) && /data:/i.test(attr.value)) {
          throw new Error(`不支持的内嵌资源位置: ${tag}[${attr.name}]`);
        }
      }
    }
    if (el.hasAttribute('style')) el.setAttribute('style', await css(el.getAttribute('style')!, el));
    // Style elements contain only CSS text, never business text or child HTML elements.
    if (tag === 'style') el.textContent = await css(el.textContent ?? '', el);
  }
}

export async function prepareImportResources(html: string, htmlFilePath: string, files: ImportResourceFile[], options: { expandedRuntime?: boolean } = {}): Promise<PreparedImportResources> {
  const maxHtmlMiB = options.expandedRuntime ? 6 : 2;
  if (utf8.encode(html).length > maxHtmlMiB * MiB) throw new Error(`HTML 超过 ${maxHtmlMiB} MiB 限制`);
  if (files.length > 256) throw new Error('本地资源最多 256 个文件');
  const htmlPath = normalizePath(htmlFilePath);
  if (!htmlPath) throw new Error(`非法 HTML 路径: ${htmlFilePath}`);
  const result: PreparedImportResources = { html: '', resources: [], binaries: [], warnings: [] };
  const bundle = new Map<string, File[]>();
  let suppliedSize = 0;
  for (const entry of files) {
    const path = normalizePath(entry.path);
    if (!path) throw new Error(`非法资源路径: ${entry.path}`);
    if (entry.file.size > 10 * MiB) throw new Error(`资源 ${path} 超过 10 MiB 限制`);
    suppliedSize += entry.file.size;
    if (suppliedSize > 30 * MiB) throw new Error('资源总大小超过 30 MiB 限制');
    bundle.set(path, [...bundle.get(path) ?? [], entry.file]);
  }
  let dataSize = 0;
  let expandedCssSize = 0;
  const binaryCache = new Map<string, string>();
  const resolvedCache = new Map<string, Promise<string>>();
  const reports = new Set<string>();
  function report(url: string, status: ImportResourceReport['status'], kind: string, warning?: string) {
    if (/^data:/i.test(url) && url.includes(',')) {
      const label = `${url.slice(0, url.search(/[;,]/)).slice(0, 80)} [内嵌资源]`;
      if (warning) warning = warning.split(url).join(label);
      url = label;
    }
    const key = `${kind}:${status}:${url}`;
    if (!reports.has(key)) { result.resources.push({ url, status, kind }); reports.add(key); if (warning) result.warnings.push(warning); }
  }
  function localFile(url: string, base: string, kind: string): { path: string; file: File; suffix: string } | null {
    const { path, suffix } = splitSuffix(url);
    const normalized = normalizePath(`${directory(base) ? `${directory(base)}/` : ''}${path}`);
    if (!normalized || /^(?:\/|[a-z][a-z\d+.-]*:)/i.test(path)) {
      report(url, 'missing', kind, `资源路径越界或不受支持: ${url}`); return null;
    }
    const matches = bundle.get(normalized);
    if (matches?.length === 1) return { path: normalized, file: matches[0], suffix };
    const basename = normalized.split('/').pop();
    const similarlyNamed = [...bundle.keys()].filter((name) => name.split('/').pop() === basename);
    report(url, 'missing', kind, matches?.length || similarlyNamed.length > 1 ? `资源路径有歧义（多个同名文件），请提供准确相对路径: ${url}` : `缺失本地资源: ${url}（相对 ${base}）`);
    return null;
  }
  async function addBinary(bytes: Uint8Array, mimeType: string, name: string, ext: string): Promise<string> {
    if (bytes.byteLength > 10 * MiB) throw new Error(`资源 ${name} 超过 10 MiB 限制`);
    if (mimeType === 'image/svg+xml') bytes = sanitizeSvg(bytes);
    const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes).buffer))].map((b) => b.toString(16).padStart(2, '0')).join('');
    const relPath = `${FONT_EXT.has(ext) ? 'assets/imports/fonts' : 'assets/images'}/${hash}.${ext}`;
    if (!binaryCache.has(relPath)) { result.binaries.push({ relPath, base64: toBase64(bytes), mimeType, name }); binaryCache.set(relPath, relPath); }
    return relPath;
  }
  async function assetUncached(url: string, base: string, kind: string): Promise<string> {
    if (!url || url.startsWith('#')) return url;
    if (importAssetPath(splitSuffix(url).path) && binaryCache.has(splitSuffix(url).path)) return url;
    if (isRemote(url)) { report(url, 'remote', kind, `远程资源未下载: ${url}`); return url; }
    if (/^data:/i.test(url)) {
      const comma = url.indexOf(',');
      const header = url.slice(5, comma);
      const mime = header.split(';')[0].toLowerCase();
      const ext = EXT_BY_MIME[mime];
      if (comma < 0 || !ext) throw new Error(`不支持的内嵌资源类型: ${mime || 'unknown'}`);
      let bytes: Uint8Array;
      try { bytes = /;base64(?:;|$)/i.test(header) ? fromBase64(url.slice(comma + 1)) : utf8.encode(decodeURIComponent(url.slice(comma + 1))); }
      catch { throw new Error(`内嵌资源编码无效: ${mime}`); }
      dataSize += bytes.length;
      if (suppliedSize + dataSize > 30 * MiB) throw new Error('资源总大小超过 30 MiB 限制');
      const path = await addBinary(bytes, mime, `embedded.${ext}`, ext);
      // Keep large data bodies out of reports and project metadata as well.
      report(`data:${mime} [内嵌资源]`, 'resolved', kind);
      return path;
    }
    const found = localFile(url, base, kind);
    if (!found) return url;
    const ext = extension(found.path);
    const mime = MIME_BY_EXT[ext];
    if (!mime) { report(url, 'missing', kind, `不支持的资源格式: ${url}`); return url; }
    const path = await addBinary(new Uint8Array(await found.file.arrayBuffer()), mime, found.file.name, ext);
    report(url, 'resolved', FONT_EXT.has(ext) ? 'font' : kind);
    return path + (found.suffix.startsWith('#') ? found.suffix : '');
  }
  function asset(url: string, base: string, kind: string): Promise<string> {
    const key = `${base}\n${kind}\n${url}`;
    let pending = resolvedCache.get(key);
    if (!pending) { pending = assetUncached(url, base, kind); resolvedCache.set(key, pending); }
    return pending;
  }
  async function stylesheet(css: string, base: string, stack: string[]): Promise<string> {
    // A style text node is raw HTML text when serialized. A closing delimiter in a
    // supplied file must never introduce nodes after the main document sanitizer.
    if (/<\/style[\s/>]/i.test(css)) throw new Error(`样式含不安全的 style 结束标记: ${base}`);
    expandedCssSize += utf8.encode(css).length;
    if (expandedCssSize > 30 * MiB) throw new Error('样式展开总大小超过 30 MiB 限制');
    return rewriteCss(css, async (ref) => {
      if (ref.kind === 'url') return `url(${cssQuote(await asset(ref.url, base, 'css'))})`;
      if (isRemote(ref.url)) { report(ref.url, 'remote', 'stylesheet', `远程样式未下载: ${ref.url}`); return ''; }
      if (/\b(?:layer|supports)\b/i.test(ref.media ?? '')) { result.warnings.push(`未展开 @import 的 layer/supports 条件: ${ref.url} ${ref.media}`); report(ref.url, 'missing', 'stylesheet'); return ''; }
      const found = localFile(ref.url, base, 'stylesheet');
      if (!found) return '';
      if (stack.includes(found.path) || stack.length >= 16) { report(ref.url, 'missing', 'stylesheet', `样式引用循环或超过 16 层: ${found.path}`); return ''; }
      const nested = await stylesheet(await found.file.text(), found.path, [...stack, found.path]);
      report(ref.url, 'resolved', 'stylesheet');
      return ref.media ? `@media ${ref.media}{\n${nested}\n}` : nested;
    });
  }
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const preparedStyles = new WeakSet<Element>();
  // Replacing each link in place preserves the style/link cascade order.
  for (const link of resourceElements(doc).filter((el) => el.matches('link[rel~="stylesheet"]'))) {
    const url = link.getAttribute('href');
    if (!url) continue;
    if (isRemote(url)) { report(url, 'remote', 'stylesheet', `远程样式未下载: ${url}`); link.remove(); continue; }
    const found = localFile(url, htmlPath, 'stylesheet');
    if (!found) { link.remove(); continue; }
    const style = doc.createElement('style');
    for (const attr of ['media', 'title', 'disabled']) if (link.hasAttribute(attr)) style.setAttribute(attr, link.getAttribute(attr)!);
    style.setAttribute('data-import-stylesheet', found.path);
    style.textContent = await stylesheet(await found.file.text(), found.path, [found.path]);
    preparedStyles.add(style);
    link.replaceWith(style);
    report(url, 'resolved', 'stylesheet');
  }
  await rewriteHtmlLocations(doc, (url, kind) => asset(url, htmlPath, kind),
    (css, element) => preparedStyles.has(element) ? Promise.resolve(css) : stylesheet(css, htmlPath, []), true);
  result.html = documentHtml(doc);
  return result;
}

/** Complete all asset writes before the caller commits a screen that references them. */
export async function persistImportResources(result: PreparedImportResources, storage: ProjectStorage): Promise<void> {
  const written = new Set<string>();
  for (const binary of result.binaries) {
    if (!importAssetPath(binary.relPath)) throw new Error(`非法导入资产路径: ${binary.relPath}`);
    if (written.has(binary.relPath)) continue;
    written.add(binary.relPath);
    if (await storage.exists(binary.relPath)) continue;
    await storage.ensureDir(directory(binary.relPath));
    try { await storage.writeBinary(binary.relPath, binary.base64); }
    catch (error) { throw new Error(`导入资源写入失败 (${binary.name}): ${error instanceof Error ? error.message : String(error)}`); }
  }
}

function importAssetPath(url: string): boolean {
  return /^assets\/(?:images|imports\/fonts)\/[a-f0-9]{64}\.(?:png|jpe?g|gif|webp|avif|svg|ico|bmp|woff2?|ttf|otf)$/.test(url);
}

/** Materialize only parsed URL locations. Stored HTML/CSS and user text stay relative. */
export async function resolveImportedResources(html: string, scopedCss: string | undefined, storage: ProjectStorage): Promise<{ htmlContent: string; scopedCss?: string }> {
  const cache = new Map<string, Promise<string | null>>();
  async function resolve(url: string): Promise<string> {
    const { path, suffix } = splitSuffix(url);
    if (!importAssetPath(path)) return url;
    let pending = cache.get(path);
    if (!pending) {
      pending = storage.readBinary(path).catch((error) => {
        throw new Error(`导入资源读取失败 (${path}): ${error instanceof Error ? error.message : String(error)}`);
      });
      cache.set(path, pending);
    }
    const base64 = await pending;
    if (base64 === null) throw new Error(`导入资源缺失: ${path}`);
    return `data:${MIME_BY_EXT[extension(path)]};base64,${base64}${suffix.startsWith('#') ? suffix : ''}`;
  }
  const css = (text: string) => rewriteCss(text, async (ref) => ref.kind === 'url' ? `url(${cssQuote(await resolve(ref.url))})` : text.slice(ref.start, ref.end));
  const doc = new DOMParser().parseFromString(html, 'text/html');
  await rewriteHtmlLocations(doc, resolve, css);
  return { htmlContent: documentHtml(doc), ...(scopedCss === undefined ? {} : { scopedCss: await css(scopedCss) }) };
}
