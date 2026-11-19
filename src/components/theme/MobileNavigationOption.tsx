import React from 'react';
import { useProjectStore } from '../../stores/useProjectStore';
import { useT } from '../../stores/useLocaleStore';

export const MobileNavigationOption: React.FC<{ disabled?: boolean; value?: boolean; onChange?: (value: boolean) => void }> = ({ disabled, value, onChange }) => {
  const t = useT();
  const settings = useProjectStore(state => state.settings);
  const setUseCustomNavigation = useProjectStore(state => state.setUseCustomNavigation);
  if (settings.deviceProfile !== 'mobile') return null;
  return <div className="rounded-lg border border-slate-700 p-3">
    <label className="flex items-center gap-2 text-xs text-slate-200"><input type="checkbox" aria-label={t('theme.mobileCustomNav')} checked={value ?? !!settings.useCustomNavigation} disabled={disabled} onChange={event => (onChange ?? setUseCustomNavigation)(event.target.checked)} />{t('theme.mobileCustomNav')}</label>
    <p className="mt-2 text-[11px] leading-relaxed text-slate-400">{t('theme.mobileCustomNavHint')}</p>
  </div>;
};
