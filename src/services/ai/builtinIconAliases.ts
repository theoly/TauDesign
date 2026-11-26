import type {Asset} from '../../types/project';
import {parseHtmlCopy} from '../../utils/htmlDocument';

export const BUILTIN_MEDIA_ICON_NAMES=['arrow-left','arrow-right','bell','calendar','check','chevron-down','chevron-right','clock','heart','house','info','mail','map-pin','menu','message-circle','plus','search','settings','shield-check','user','users','x'] as const;

const HASHED_ICON = /^assets\/icons\/[a-f0-9]{64}\.svg$/;
const GENERIC_ICON_STOP_WORDS = new Set([
  'icon', 'ic', 'img', 'svg', 'view', 'btn', 'button', 'tab', 'nav', 'menu',
  'item', 'card', 'bg', 'default', 'active', 'selected', 'primary', 'secondary',
  'dark', 'light', 'small', 'large', 'sm', 'md', 'lg', 'xl', 'new', 'old',
  'custom', 'app', 'ui', 'page', 'not', 'no', 'none', 'a', 'an', 'the',
  'missing', 'unknown', 'fake', 'test', 'builtin'
]);

/** Common Lucide v0/v1 renames and semantic UI icon aliases mapped onto verified lucide-react v0.475 names. */
export const LUCIDE_ICON_ALIAS_MAP: Readonly<Record<string, string>> = {
  grid: 'layout-grid',
  home: 'house',
  'alert-circle': 'circle-alert',
  'check-circle': 'circle-check',
  'check-circle-2': 'circle-check',
  'x-circle': 'circle-x',
  'help-circle': 'circle-help',
  'info-circle': 'info',
  edit: 'square-pen',
  'edit-2': 'pencil',
  'edit-3': 'pencil',
  'more-horizontal': 'ellipsis',
  'more-vertical': 'ellipsis-vertical',
  'bar-chart': 'chart-bar',
  'bar-chart-2': 'chart-bar',
  'bar-chart-3': 'chart-bar',
  'pie-chart': 'chart-pie',
  'line-chart': 'chart-line',
  sliders: 'sliders-horizontal',
  funnel: 'filter',
  fire: 'flame',
  chat: 'message-circle',
  comment: 'message-circle',
  notification: 'bell',
  notifications: 'bell',
  profile: 'user',
  account: 'user',
  gear: 'settings',
  cog: 'settings',
  close: 'x',
  add: 'plus',
  delete: 'trash-2',
  remove: 'trash-2',
  trash: 'trash-2',
  back: 'arrow-left',
  next: 'arrow-right',
  warning: 'triangle-alert',
  alert: 'triangle-alert',
  error: 'circle-alert',
  success: 'circle-check',
  location: 'map-pin',
  pin: 'map-pin',
  time: 'clock',
  email: 'mail',
  favorite: 'heart',
  like: 'thumbs-up',
  dislike: 'thumbs-down',
  food: 'utensils',
  eat: 'utensils',
  meal: 'utensils',
  restaurant: 'utensils',
  ai: 'sparkles',
  magic: 'sparkles',
  idea: 'lightbulb',
  tip: 'lightbulb',
  discover: 'compass',
  explore: 'compass',
  apps: 'layout-grid',
  category: 'layout-grid',
  categories: 'layout-grid',
  all: 'layout-grid',
  dashboard: 'layout-grid',
  document: 'file-text',
  doc: 'file-text',
  share: 'share-2',
  refresh: 'refresh-cw',
  reload: 'refresh-cw',
  cart: 'shopping-cart',
  bag: 'shopping-bag',
  pay: 'credit-card',
  card: 'credit-card',
  logout: 'log-out',
  login: 'log-in',
  vip: 'crown',
  medal: 'award',
  unlock: 'lock-open',
  decision: 'scale',
  balance: 'scale',
  dice: 'dices',
  wand: 'wand-sparkles',
  'magic-wand': 'wand-sparkles',
  coin: 'coins',
  money: 'coins',
  sort: 'arrow-up-down',
  'plus-circle': 'circle-plus',
  'minus-circle': 'circle-minus'
};

function toKebabCase(raw: string): string {
  return raw
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[_\s]+/g, '-')
    .toLowerCase()
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Normalize camelCase, snake_case, prefixes (ic-/icon-/lucide-) and style/size suffixes to a clean kebab stem. */
export function normalizeIconStem(rawStem: string): string {
  let stem = toKebabCase(rawStem);
  if (!stem) return '';
  let changed = true;
  while (changed) {
    const before = stem;
    stem = stem
      .replace(/^(?:ic|icon|lucide)-/, '')
      .replace(/-(?:icon|outline|solid|filled|fill|line|regular|light|bold|thin|16|20|24|32|48)$/, '');
    changed = stem !== before;
  }
  return stem;
}

/** Generate ordered deduplicated candidate Lucide icon names for a raw filename stem. */
export function candidateLucideIconNames(rawStem: string): string[] {
  const candidates: string[] = [];
  const push = (name: string | undefined) => {
    if (!name || candidates.includes(name)) return;
    candidates.push(name);
  };
  const pushWithAlias = (name: string | undefined) => {
    if (!name) return;
    push(name);
    push(LUCIDE_ICON_ALIAS_MAP[name]);
  };

  const rawKebab = toKebabCase(rawStem);
  const normalized = normalizeIconStem(rawStem);

  pushWithAlias(normalized);
  pushWithAlias(rawKebab);

  if (normalized.length > 3 && normalized.endsWith('s')) {
    pushWithAlias(normalized.slice(0, -1));
  }

  const tokens = normalized.split('-').filter(Boolean);
  if (tokens.length > 1) {
    for (let i = tokens.length - 1; i >= 0; i--) {
      const token = tokens[i];
      if (GENERIC_ICON_STOP_WORDS.has(token)) continue;
      pushWithAlias(token);
      if (token.length > 3 && token.endsWith('s')) {
        pushWithAlias(token.slice(0, -1));
      }
    }
  }

  return candidates;
}

/** Map friendly Lucide-style paths (assets/icons/map-pin.svg, grid.svg) to registered hashed builtin files. */
export function builtinIconAliasMap(assets: ReadonlyArray<Pick<Asset, 'name' | 'relPath'>>): Map<string, string> {
  const byName = new Map<string, string>();
  for (const asset of assets) {
    const match = /^图标 · (.+)$/.exec(asset.name);
    if (!match || !HASHED_ICON.test(asset.relPath)) continue;
    byName.set(match[1], asset.relPath);
  }
  const aliases = new Map<string, string>();
  for (const [name, hashed] of byName.entries()) {
    aliases.set(`assets/icons/${name}.svg`, hashed);
  }
  for (const [alias, target] of Object.entries(LUCIDE_ICON_ALIAS_MAP)) {
    const hashed = byName.get(target);
    if (hashed && !aliases.has(`assets/icons/${alias}.svg`)) {
      aliases.set(`assets/icons/${alias}.svg`, hashed);
    }
  }
  return aliases;
}

function resolveReplacement(url: string, replacements: Map<string, string>): string {
  const trimmed = url.trim();
  if (!trimmed) return url;
  const [path, suffix = ''] = trimmed.replace(/^\.\//, '').split(/(?=[?#])/);
  const target = replacements.get(path);
  return target ? `${target}${suffix}` : url;
}

function rewriteCssUrls(css: string, replacements: Map<string, string>): string {
  return css.replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi, (full, quote: string, raw: string) => {
    const next = resolveReplacement(raw, replacements);
    return next === raw ? full : `url(${quote}${next}${quote})`;
  });
}

/** Rewrite HTML attribute, CSS url(...) and scopedCss references using a path replacement map via DOM parsing. */
export function rewriteAssetPathMap(
  html: string,
  replacements: Map<string, string>,
  scopedCss = ''
): { html: string; scopedCss: string; rewritten: string[] } {
  if (!replacements.size) return { html, scopedCss, rewritten: [] };
  const rewritten = new Set<string>();
  const mapUrl = (url: string) => {
    const next = resolveReplacement(url, replacements);
    const from = url.trim().replace(/^\.\//, '').split(/[?#]/)[0];
    const to = next.trim().replace(/^\.\//, '').split(/[?#]/)[0];
    if (from !== to) rewritten.add(`${from}→${to}`);
    return next;
  };
  const copy = parseHtmlCopy(html);
  const { doc } = copy;
  for (const el of Array.from(doc.querySelectorAll('*'))) {
    for (const attr of ['src', 'poster', 'href', 'xlink:href', 'data-icon-src'] as const) {
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
    if (el.hasAttribute('style')) {
      const style = el.getAttribute('style') ?? '';
      const next = rewriteCssUrls(style, replacements);
      if (next !== style) {
        for (const match of style.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/gi)) mapUrl(match[2]);
        el.setAttribute('style', next);
      }
    }
    if (el.localName === 'style') {
      const css = el.textContent ?? '';
      const next = rewriteCssUrls(css, replacements);
      if (next !== css) {
        for (const match of css.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/gi)) mapUrl(match[2]);
        el.textContent = next;
      }
    }
  }
  const nextScoped = rewriteCssUrls(scopedCss, replacements);
  if (nextScoped !== scopedCss) {
    for (const match of scopedCss.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/gi)) mapUrl(match[2]);
  }
  return { html: copy.serialize(), scopedCss: nextScoped, rewritten: [...rewritten] };
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
  return rewriteAssetPathMap(html, aliases, scopedCss);
}
