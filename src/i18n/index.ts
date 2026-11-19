import { en } from './messages/en';
import { zhCN, type MessageSchema } from './messages/zh-CN';
import { DEFAULT_LOCALE, type Locale, type MessageTree } from './types';

export type { Locale, MessageSchema };
export {
  DEFAULT_LOCALE,
  LOCALES,
  LOCALE_STORAGE_KEY,
  SYSTEM_FALLBACK_LOCALE,
  detectSystemLocale,
  isLocale,
  readNavigatorLanguage,
} from './types';

const catalogs: Record<Locale, MessageTree> = {
  'zh-CN': zhCN,
  en,
};

type Join<K, P> = K extends string | number
  ? P extends string | number
    ? `${K}${'' extends P ? '' : '.'}${P}`
    : never
  : never;

type Leaves<T> = T extends string
  ? ''
  : {
      [K in keyof T & string]: Join<K, Leaves<T[K]>>;
    }[keyof T & string];

export type MessageKey = Leaves<MessageSchema>;

function lookup(tree: MessageTree, path: string): string | undefined {
  const parts = path.split('.');
  let node: string | MessageTree | undefined = tree;
  for (const part of parts) {
    if (!node || typeof node === 'string') return undefined;
    node = node[part];
  }
  return typeof node === 'string' ? node : undefined;
}

function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => {
    const value = params[name];
    return value === undefined || value === null ? `{${name}}` : String(value);
  });
}

/** Translate a dotted key for the given locale; falls back to zh-CN, then the key. */
export function t(
  key: MessageKey | string,
  params?: Record<string, string | number>,
  locale: Locale = DEFAULT_LOCALE,
): string {
  const primary = lookup(catalogs[locale], key);
  const fallback = locale === 'zh-CN' ? undefined : lookup(catalogs['zh-CN'], key);
  return interpolate(primary ?? fallback ?? key, params);
}

export function htmlLang(locale: Locale): string {
  return locale === 'en' ? 'en' : 'zh-CN';
}

/** Prompt fragment describing the required copy language for generated screens. */
export function contentLanguageLabel(locale: Locale): string {
  return locale === 'en'
    ? t('ai.contentLanguageEn', undefined, 'en')
    : t('ai.contentLanguageZh', undefined, 'zh-CN');
}

export function contentLanguageDirective(locale: Locale): string {
  // Keep ≤1 short line — create prompts are budgeted ≤12k chars.
  return locale === 'en'
    ? 'LANG: English UI copy; ban Lorem/"Title 1".'
    : 'LANG: 中文；禁 Lorem/标题1。';
}
