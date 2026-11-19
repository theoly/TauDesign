import React from 'react';
import { LOCALES, type Locale } from '../../i18n';
import { useLocaleStore, useT } from '../../stores/useLocaleStore';

const LABELS: Record<Locale, 'settings.languageZh' | 'settings.languageEn'> = {
  'zh-CN': 'settings.languageZh',
  en: 'settings.languageEn',
};

export function LanguageSwitcher() {
  const t = useT();
  const locale = useLocaleStore((s) => s.locale);
  const setLocale = useLocaleStore((s) => s.setLocale);

  return (
    <section aria-label={t('settings.language')} className="rounded-xl border border-slate-800 bg-slate-950 p-4 space-y-3">
      <div>
        <h3 className="text-xs font-semibold text-slate-200">{t('settings.language')}</h3>
        <p className="mt-1 text-xs text-slate-400">{t('settings.languageHint')}</p>
      </div>
      <div role="group" className="flex flex-wrap gap-2">
        {LOCALES.map((code) => {
          const active = code === locale;
          return (
            <button
              key={code}
              type="button"
              data-testid={`locale-${code}`}
              aria-pressed={active}
              onClick={() => setLocale(code)}
              className={`rounded-lg px-3 py-2 text-xs transition ${
                active
                  ? 'bg-blue-600 text-white'
                  : 'border border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700'
              }`}
            >
              {t(LABELS[code])}
            </button>
          );
        })}
      </div>
    </section>
  );
}
