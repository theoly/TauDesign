import React, { useEffect, useState } from 'react';
import type { Screen } from '../../types/project';
import { useT } from '../../stores/useLocaleStore';

type Field = 'pageGroup' | 'stateLabel' | 'audienceRole';

/** These labels describe static variants for design context; they do not enable runtime behavior. */
export function ScreenDesignRoleEditor({ screen, onCommit }: {
  screen: Screen;
  onCommit: (patch: Partial<Record<Field, string>>) => void;
}) {
  const t = useT();
  const fields: Array<{ key: Field; label: string; placeholder: string }> = [
    { key: 'pageGroup', label: t('inspector.designRolePageGroup'), placeholder: t('inspector.designRolePageGroupPlaceholder') },
    { key: 'stateLabel', label: t('inspector.designRoleState'), placeholder: t('inspector.designRoleStatePlaceholder') },
    { key: 'audienceRole', label: t('inspector.designRoleAudience'), placeholder: t('inspector.designRoleAudiencePlaceholder') },
  ];
  const [draft, setDraft] = useState<Record<Field, string>>({ pageGroup: '', stateLabel: '', audienceRole: '' });
  useEffect(() => setDraft({
    pageGroup: screen.metadata?.pageGroup ?? '', stateLabel: screen.metadata?.stateLabel ?? '', audienceRole: screen.metadata?.audienceRole ?? ''
  }), [screen.id, screen.metadata?.pageGroup, screen.metadata?.stateLabel, screen.metadata?.audienceRole]);

  return <section aria-label={t('inspector.designRole')} className="w-full rounded-xl border border-slate-800 bg-slate-950 p-3 text-left space-y-2">
    <div className="text-xs font-semibold text-slate-300">{t('inspector.designRole')}</div>
    <p className="text-[10px] leading-relaxed text-slate-500">{t('inspector.designRoleHint')}</p>
    {fields.map(({ key, label, placeholder }) => <label key={key} className="block text-[11px] text-slate-400">
      {label}
      <input aria-label={label} value={draft[key]} maxLength={60} placeholder={placeholder}
        onChange={event => setDraft(previous => ({ ...previous, [key]: event.target.value }))}
        onBlur={() => {
          if (fields.some(field => draft[field.key].trim() !== (screen.metadata?.[field.key] ?? ''))) onCommit(draft);
        }}
        onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }}
        className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-blue-500" />
    </label>)}
    {screen.metadata?.basedOnScreenId && <p className="text-[10px] text-slate-500">{t('inspector.designRoleBasedOn', {id: screen.metadata.basedOnScreenId})}</p>}
  </section>;
}
