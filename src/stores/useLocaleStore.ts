import { useCallback } from 'react';
import { create } from 'zustand';
import {
  LOCALE_STORAGE_KEY,
  SYSTEM_FALLBACK_LOCALE,
  detectSystemLocale,
  htmlLang,
  isLocale,
  readNavigatorLanguage,
  type Locale,
  t,
  type MessageKey,
} from '../i18n';

/** Prefer saved preference; otherwise follow system language (unsupported → en). */
export function resolveInitialLocale(
  stored: string | null | undefined = readStoredRaw(),
  systemTag: string | undefined = readNavigatorLanguage(),
): Locale {
  if (isLocale(stored)) return stored;
  return detectSystemLocale(systemTag);
}

function readStoredRaw(): string | null {
  try {
    return localStorage.getItem(LOCALE_STORAGE_KEY);
  } catch {
    return null;
  }
}

function persistLocale(locale: Locale): void {
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    /* ignore quota / private mode */
  }
}

function syncDocumentLang(locale: Locale): void {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = htmlLang(locale);
}

interface LocaleState {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

export const useLocaleStore = create<LocaleState>((set) => {
  const initial =
    typeof localStorage === 'undefined' ? SYSTEM_FALLBACK_LOCALE : resolveInitialLocale();
  syncDocumentLang(initial);
  return {
    locale: initial,
    setLocale: (locale) => {
      persistLocale(locale);
      syncDocumentLang(locale);
      set({ locale });
    },
  };
});

/** Hook: translate with the live UI locale (stable identity until locale changes). */
export function useT() {
  // Subscribe so locale switches re-render; read getState at call time so SSR/static
  // markup (happy-dom) cannot stick to the module-init snapshot while tests reset locale.
  const locale = useLocaleStore((s) => s.locale);
  return useCallback(
    (key: MessageKey | string, params?: Record<string, string | number>) =>
      t(key, params, useLocaleStore.getState().locale),
    [locale],
  );
}

/** Non-React helper for services (AI pipeline, etc.). */
export function getUiLocale(): Locale {
  return useLocaleStore.getState().locale;
}
