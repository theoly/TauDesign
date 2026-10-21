/** Scan CSS boundaries while retaining unknown rules, duplicate declarations,
 * formatting and cascade order. Read editable declarations through CSSOM. */
export interface ImportDeclaration {
  property: string; value: string; selector: string; conditional: boolean; important: boolean;
}

function delimiter(text: string, start: number, targets: string): number {
  let quote = '', parens = 0, brackets = 0;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (ch === '\\') { i++; continue; }
    if (quote) { if (ch === quote) quote = ''; continue; }
    if (ch === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      if (end < 0) return -1;
      i = end + 1; continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (!parens && !brackets && targets.includes(ch)) return i;
    if (ch === '(') parens++;
    if (ch === ')') parens--;
    if (ch === '[') brackets++;
    if (ch === ']') brackets--;
  }
  return -1;
}

export function decodeCss(value: string): string {
  return value.replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\\([\da-f]{1,6})\s?|\\([^\r\n])|\\\r?\n/gi, (_all, hex: string, char: string) => {
      if (!hex) return char || '';
      const point = parseInt(hex, 16);
      return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : '\ufffd';
    });
}

export type ImportUrlContext = 'image' | 'font' | 'media';

export function unsafeUrl(value: string, context?: ImportUrlContext): boolean {
  const clean = decodeCss(value).replace(/[\u0000-\u0020\u007f-\u009f]/g, '').toLowerCase();
  if (!clean || clean.startsWith('#')) return false;
  if (clean.startsWith('data:')) {
    // SVG is retained only as image input to the resource pipeline, which
    // sanitizes its document and externalizes it before preview/persistence.
    if (context === 'image') return !/^data:image\/(?:png|jpe?g|gif|webp|avif|bmp|svg\+xml|x-icon|vnd.microsoft.icon)[;,]/.test(clean);
    if (context === 'font') return !/^data:(?:font\/[a-z0-9.+-]+|application\/(?:font-woff|vnd.ms-fontobject|x-font-[a-z0-9-]+))[;,]/.test(clean);
    if (context === 'media') return !/^data:(?:audio|video)\/[a-z0-9.+-]+[;,]/.test(clean);
    return true;
  }
  const scheme = /^([a-z][a-z\d+.-]*):/.exec(clean)?.[1];
  return !!scheme && !['http', 'https', 'file', 'mailto', 'tel', 'asset', 'tauri', 'blob'].includes(scheme);
}

export function cssUrls(value: string): string[] {
  const urls: string[] = [];
  const pattern = /url\(\s*(?:"([^"\n]*)"|'([^'\n]*)'|([^\s)]*))\s*\)/gi;
  for (const match of decodeCss(value).matchAll(pattern)) urls.push(match[1] ?? match[2] ?? match[3]);
  return urls;
}

export function unsafeCss(value: string, context?: ImportUrlContext): boolean {
  const decoded = decodeCss(value).replace(/[\u0000-\u0020\u007f-\u009f]/g, '').toLowerCase();
  return /expression\(|(?:javascript|vbscript):|-moz-binding|behavior:/.test(decoded) || cssUrls(value).some(url => unsafeUrl(url, context));
}

/** Commas in data URL payloads belong to the URL, not a candidate separator. */
export function imageSrcsetCandidates(value: string): Array<{ url: string; descriptor: string }> {
  const candidates: Array<{ url: string; descriptor: string }> = [];
  let pos = 0;
  while (pos < value.length) {
    while (pos < value.length && /[\s,]/.test(value[pos])) pos++;
    const start = pos, data = value.slice(pos, pos + 5).toLowerCase() === 'data:';
    while (pos < value.length && !/\s/.test(value[pos]) && (data || value[pos] !== ',')) pos++;
    let url = value.slice(start, pos), descriptor = '';
    if (url.endsWith(',')) url = url.slice(0, -1);
    else {
      const descriptorStart = pos;
      while (pos < value.length && value[pos] !== ',') pos++;
      descriptor = value.slice(descriptorStart, pos).trim();
    }
    if (url) candidates.push({ url, descriptor });
    if (value[pos] === ',') pos++;
  }
  return candidates;
}

export function transformDeclarations(source: string, selector: string, conditional: boolean,
  visitor: (declaration: ImportDeclaration) => string | null | void): string {
  let result = '', offset = 0;
  while (offset < source.length) {
    const semicolon = delimiter(source, offset, ';');
    const end = semicolon < 0 ? source.length : semicolon;
    const original = source.slice(offset, end), colon = delimiter(original, 0, ':');
    let output = original;
    if (colon >= 0) {
      const rawProperty = original.slice(0, colon).replace(/\/\*[\s\S]*?\*\//g, '').trim();
      const property = rawProperty.startsWith('--') ? rawProperty : rawProperty.toLowerCase();
      const raw = original.slice(colon + 1).trim();
      const style = document.createElement('span').style;
      style.setProperty(property, raw.replace(/\s*!important\s*$/i, ''), /!important\s*$/i.test(raw) ? 'important' : '');
      // Preserve declarations unsupported by this runtime instead of dropping them.
      const value = style.getPropertyValue(property) || raw.replace(/\s*!important\s*$/i, '');
      const important = style.getPropertyPriority(property) === 'important' || /!important\s*$/i.test(raw);
      const next = visitor({ property, value, selector, conditional, important });
      if (next === null) output = '';
      else if (next !== undefined) output = `${original.slice(0, colon + 1)}${next}${important ? ' !important' : ''}`;
    }
    result += output + (semicolon < 0 ? '' : ';');
    offset = end + 1;
  }
  return result;
}

export function transformStyleSheet(source: string,
  visitor: (declaration: ImportDeclaration) => string | null | void,
  onUnsupported?: (description: string) => void, conditional = false, rewriteNid = false): string {
  let result = '', offset = 0;
  while (offset < source.length) {
    const opening = delimiter(source, offset, '{;');
    if (opening < 0) { result += source.slice(offset); break; }
    const header = source.slice(offset, opening);
    if (source[opening] === ';') {
      if (unsafeCss(header)) onUnsupported?.('已移除危险 CSS 规则');
      else result += header + ';';
      offset = opening + 1; continue;
    }
    let cursor = opening + 1, level = 1;
    while (level > 0) {
      const next = delimiter(source, cursor, '{}');
      if (next < 0) { cursor = source.length; break; }
      level += source[next] === '{' ? 1 : -1;
      cursor = next + 1;
    }
    const closed = level === 0, content = source.slice(opening + 1, closed ? cursor - 1 : cursor);
    const cleanedHeader = header.replace(/\/\*[\s\S]*?\*\//g, '').trim();
    let body = content;
    if (/^@(?:media|supports|container|layer|scope|document|(?:-webkit-)?keyframes)\b/i.test(cleanedHeader)) {
      body = transformStyleSheet(content, visitor, onUnsupported, true, rewriteNid);
    } else if (!cleanedHeader.startsWith('@') || /^@(?:font-face|page)\b/i.test(cleanedHeader)) {
      body = transformDeclarations(content, cleanedHeader, conditional, visitor);
    } else {
      onUnsupported?.(`保留暂不支持的 CSS 规则：${cleanedHeader}`);
      if (unsafeCss(content)) { onUnsupported?.('已移除危险 CSS 规则'); offset = cursor; continue; }
    }
    const nextHeader = rewriteNid ? header.replace(/\[\s*data-nid(?=\s*(?:[~|^$*]?=|\]))/gi, '[data-import-source-nid') : header;
    result += nextHeader + '{' + body + (closed ? '}' : '');
    offset = cursor;
  }
  return result;
}

const namedColors: Record<string, string> = {
  black: '#000000', white: '#ffffff', red: '#ff0000', blue: '#0000ff', green: '#008000',
  yellow: '#ffff00', purple: '#800080', orange: '#ffa500', pink: '#ffc0cb', gray: '#808080',
  grey: '#808080', silver: '#c0c0c0', navy: '#000080', teal: '#008080', aqua: '#00ffff',
  cyan: '#00ffff', lime: '#00ff00', maroon: '#800000', olive: '#808000', fuchsia: '#ff00ff',
  magenta: '#ff00ff', rebeccapurple: '#663399', darkgray: '#a9a9a9', darkgrey: '#a9a9a9',
  lightgray: '#d3d3d3', lightgrey: '#d3d3d3', whitesmoke: '#f5f5f5', ivory: '#fffff0',
  coral: '#ff7f50', tomato: '#ff6347',
};

/** Unresolved or translucent colors remain in the source. All returned colors are hex. */
export function opaqueColor(input: string): string | undefined {
  const value = input.trim().toLowerCase();
  if (namedColors[value]) return namedColors[value];
  const hex = /^#([\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.exec(value)?.[1];
  if (hex) {
    const full = hex.length <= 4 ? hex.split('').map(ch => ch + ch).join('') : hex;
    if (full.length === 8 && full.slice(6) !== 'ff') return undefined;
    return '#' + full.slice(0, 6);
  }
  const rgb = /^rgba?\(([^)]+)\)$/.exec(value)?.[1];
  if (rgb) {
    const parts = rgb.split(/\s*[,/]\s*|\s+/).filter(Boolean);
    if (parts.length < 3 || parts.length > 4 || (parts[3] !== undefined && parts[3] !== '1' && parts[3] !== '100%')) return undefined;
    const values = parts.slice(0, 3).map(part => part.endsWith('%') ? Number(part.slice(0, -1)) * 2.55 : Number(part));
    if (values.some(number => !Number.isFinite(number) || number < 0 || number > 255.00001)) return undefined;
    return '#' + values.map(number => Math.round(number).toString(16).padStart(2, '0')).join('');
  }
  const hsl = /^hsla?\(([^)]+)\)$/.exec(value)?.[1];
  if (hsl) {
    const parts = hsl.split(/\s*[,/]\s*|\s+/).filter(Boolean);
    if (parts.length < 3 || parts.length > 4 || !parts[1].endsWith('%') || !parts[2].endsWith('%') || (parts[3] && parts[3] !== '1' && parts[3] !== '100%')) return undefined;
    const h = ((parseFloat(parts[0]) % 360) + 360) % 360 / 360, s = parseFloat(parts[1]) / 100, l = parseFloat(parts[2]) / 100;
    if (![h, s, l].every(Number.isFinite) || s < 0 || s > 1 || l < 0 || l > 1) return undefined;
    const a = s * Math.min(l, 1 - l);
    const channel = (n: number) => { const k = (n + h * 12) % 12; return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
    return '#' + [0, 8, 4].map(n => Math.round(channel(n) * 255).toString(16).padStart(2, '0')).join('');
  }
  return undefined;
}

export const rgbChannels = (hex: string) => [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16));
export const colorLightness = (hex: string) => { const [r, g, b] = rgbChannels(hex); return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; };
export const colorChroma = (hex: string) => { const values = rgbChannels(hex); return (Math.max(...values) - Math.min(...values)) / 255; };
export function pixelValue(value: string): number | undefined {
  if (/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)px$/i.test(value.trim()) || /^[+-]?0(?:\.0+)?$/.test(value.trim())) return parseFloat(value);
  return undefined;
}
