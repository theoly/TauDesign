export const LOCALES = ['zh-CN', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
/** Catalog / `t()` default when a locale argument is omitted. */
export const DEFAULT_LOCALE: Locale = 'zh-CN';
/** When system language is missing or neither Chinese nor English. */
export const SYSTEM_FALLBACK_LOCALE: Locale = 'en';
export const LOCALE_STORAGE_KEY = 'tau.locale';

export type MessageTree = { [key: string]: string | MessageTree };

export function isLocale(value: unknown): value is Locale {
  return value === 'zh-CN' || value === 'en';
}

/**
 * Map a BCP-47 tag to a supported UI locale.
 * Chinese family → zh-CN; English family → en; anything else → en.
 */
export function detectSystemLocale(tag?: string | null): Locale {
  const raw = (tag ?? '').trim().toLowerCase();
  if (!raw) return SYSTEM_FALLBACK_LOCALE;
  if (raw === 'zh' || raw.startsWith('zh-')) return 'zh-CN';
  if (raw === 'en' || raw.startsWith('en-')) return 'en';
  return SYSTEM_FALLBACK_LOCALE;
}

/** Read navigator language when available (browser / Tauri webview). */
export function readNavigatorLanguage(): string | undefined {
  if (typeof navigator === 'undefined') return undefined;
  return navigator.language || navigator.languages?.[0];
}
