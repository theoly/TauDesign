import React, { useEffect, useRef } from 'react';
import { Languages } from 'lucide-react';
import { LOCALES, type Locale } from '../../i18n';
import { useLocaleStore, useT } from '../../stores/useLocaleStore';

const LABELS: Record<Locale, 'settings.languageZh' | 'settings.languageEn'> = {
  'zh-CN': 'settings.languageZh',
  en: 'settings.languageEn',
};

/** Compact language menu for Header / ProjectManager chrome. */
export function LanguageMenu({ className = '' }: { className?: string }) {
  const t = useT();
  const locale = useLocaleStore((s) => s.locale);
  const setLocale = useLocaleStore((s) => s.setLocale);
  const detailsRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (detailsRef.current && !detailsRef.current.contains(event.target as Node)) {
        detailsRef.current.open = false;
      }
    };
    const closeEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && detailsRef.current?.open) {
        detailsRef.current.open = false;
      }
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeEscape);
    };
  }, []);

  return (
    <details ref={detailsRef} className={`relative ${className}`.trim()}>
      <summary
        data-testid="language-menu-trigger"
        aria-label={t('settings.language')}
        title={t('settings.language')}
        className="flex list-none items-center gap-1.5 rounded-lg px-2 py-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-slate-200 cursor-pointer [&::-webkit-details-marker]:hidden"
      >
        <Languages className="h-4 w-4 shrink-0" />
        <span className="text-[11px] font-medium">{t(LABELS[locale])}</span>
      </summary>
      <div
        role="menu"
        aria-label={t('settings.language')}
        className="absolute right-0 z-50 mt-1 min-w-[9.5rem] overflow-hidden rounded-lg border border-slate-700 bg-slate-900 py-1 shadow-xl"
      >
        {LOCALES.map((code) => {
          const active = code === locale;
          return (
            <button
              key={code}
              type="button"
              role="menuitemradio"
              data-testid={`locale-menu-${code}`}
              aria-checked={active}
              onClick={() => {
                setLocale(code);
                if (detailsRef.current) detailsRef.current.open = false;
              }}
              className={`flex w-full items-center px-3 py-2 text-left text-xs transition ${
                active
                  ? 'bg-blue-600/20 text-blue-300'
                  : 'text-slate-200 hover:bg-slate-800'
              }`}
            >
              {t(LABELS[code])}
            </button>
          );
        })}
      </div>
    </details>
  );
}
