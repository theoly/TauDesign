import type {Asset} from '../../types/project';

export const BUILTIN_MEDIA_ICON_NAMES=['arrow-left','arrow-right','bell','calendar','check','chevron-down','chevron-right','clock','heart','house','info','mail','map-pin','menu','message-circle','plus','search','settings','shield-check','user','users','x'] as const;

const HASHED_ICON = /^assets\/icons\/[a-f0-9]{64}\.svg$/;
const BUILTIN_NAME_SET = new Set<string>(BUILTIN_MEDIA_ICON_NAMES);

/** Map Lucide-style friendly paths (assets/icons/map-pin.svg) to registered hashed builtin files. */
export function builtinIconAliasMap(assets: ReadonlyArray<Pick<Asset, 'name' | 'relPath'>>): Map<string, string> {
  const byName = new Map<string, string>();
  for (const asset of assets) {
    const match = /^图标 · (.+)$/.exec(asset.name);
    if (!match || !HASHED_ICON.test(asset.relPath) || !BUILTIN_NAME_SET.has(match[1])) continue;
    byName.set(match[1], asset.relPath);
  }
  const aliases = new Map<string, string>();
  for (const name of BUILTIN_MEDIA_ICON_NAMES) {
    const hashed = byName.get(name);
    if (hashed) aliases.set(`assets/icons/${name}.svg`, hashed);
  }
  return aliases;
}

function resolveAlias(url: string, aliases: Map<string, string>): string {
  const trimmed = url.trim();
  if (!trimmed) return url;
  const [path, suffix = ''] = trimmed.replace(/^\.\//, '').split(/(?=[?#])/);
  const hashed = aliases.get(path);
  return hashed ? `${hashed}${suffix}` : url;
}

function rewriteCssUrls(css: string, aliases: Map<string, string>): string {
  return css.replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi, (full, quote: string, raw: string) => {
    const next = resolveAlias(raw, aliases);
    return next === raw ? full : `url(${quote}${next}${quote})`;
  });
}

/**
 * Models often invent Lucide filenames (map-pin.svg) instead of the hashed paths listed in the
 * media inventory. Remap only known builtin names onto already-registered assets — never invent files.
 */
export function rewriteBuiltinIconAliases(
  html: string,
  assets: ReadonlyArray<Pick<Asset, 'name' | 'relPath'>>,
  scopedCss = ''
): { html: string; scopedCss: string; rewritten: string[] } {
  const aliases = builtinIconAliasMap(assets);
  if (!aliases.size) return { html, scopedCss, rewritten: [] };
  const rewritten = new Set<string>();
  const mapUrl = (url: string) => {
    const next = resolveAlias(url, aliases);
    const from = url.trim().replace(/^\.\//, '').split(/[?#]/)[0];
    const to = next.trim().replace(/^\.\//, '').split(/[?#]/)[0];
    if (from !== to) rewritten.add(`${from}→${to}`);
    return next;
  };
  const doc = new DOMParser().parseFromString(html, 'text/html');
  for (const el of Array.from(doc.querySelectorAll('[src], [poster], [href], [srcset], [data-icon-src]'))) {
    for (const attr of ['src', 'poster', 'href', 'data-icon-src'] as const) {
      if (!el.hasAttribute(attr)) continue;
      const value = el.getAttribute(attr)!;
      const next = mapUrl(value);
      if (next !== value) el.setAttribute(attr, next);
    }
    if (el.hasAttribute('srcset')) {
      const srcset = el.getAttribute('srcset')!;
      const next = srcset.split(',').map(item => {
        const trimmed = item.trim();
        if (!trimmed) return item;
        const [url, ...rest] = trimmed.split(/\s+/);
        return [mapUrl(url), ...rest].join(' ');
      }).join(', ');
      if (next !== srcset) el.setAttribute('srcset', next);
    }
  }
  for (const el of Array.from(doc.querySelectorAll('[style]'))) {
    const style = el.getAttribute('style') ?? '';
    const next = rewriteCssUrls(style, aliases);
    if (next !== style) {
      for (const match of style.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/gi)) mapUrl(match[2]);
      el.setAttribute('style', next);
    }
  }
  for (const el of Array.from(doc.querySelectorAll('style'))) {
    const css = el.textContent ?? '';
    const next = rewriteCssUrls(css, aliases);
    if (next !== css) {
      for (const match of css.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/gi)) mapUrl(match[2]);
      el.textContent = next;
    }
  }
  const nextScoped = rewriteCssUrls(scopedCss, aliases);
  if (nextScoped !== scopedCss) {
    for (const match of scopedCss.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/gi)) mapUrl(match[2]);
  }
  return { html: doc.body.innerHTML, scopedCss: nextScoped, rewritten: [...rewritten] };
}
