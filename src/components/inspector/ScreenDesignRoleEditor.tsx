import React, { useEffect, useState } from 'react';
import type { Screen } from '../../types/project';

type Field = 'pageGroup' | 'stateLabel' | 'audienceRole';
const fields: Array<{ key: Field; label: string; placeholder: string }> = [
  { key: 'pageGroup', label: '页面分组', placeholder: '如：会员中心' },
  { key: 'stateLabel', label: '设计状态', placeholder: '如：空状态 / 成功' },
  { key: 'audienceRole', label: '适用角色', placeholder: '如：访客 / 会员' }
];

/** These labels describe static variants for design context; they do not enable runtime behavior. */
export function ScreenDesignRoleEditor({ screen, onCommit }: {
  screen: Screen;
  onCommit: (patch: Partial<Record<Field, string>>) => void;
}) {
  const [draft, setDraft] = useState<Record<Field, string>>({ pageGroup: '', stateLabel: '', audienceRole: '' });
  useEffect(() => setDraft({
    pageGroup: screen.metadata?.pageGroup ?? '', stateLabel: screen.metadata?.stateLabel ?? '', audienceRole: screen.metadata?.audienceRole ?? ''
  }), [screen.id, screen.metadata?.pageGroup, screen.metadata?.stateLabel, screen.metadata?.audienceRole]);

  return <section aria-label="页面设计分类" className="w-full rounded-xl border border-slate-800 bg-slate-950 p-3 text-left space-y-2">
    <div className="text-xs font-semibold text-slate-300">页面设计分类</div>
    <p className="text-[10px] leading-relaxed text-slate-500">用于页面一致性与候选关系分析；不控制运行时权限或状态。</p>
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
    {screen.metadata?.basedOnScreenId && <p className="text-[10px] text-slate-500">候选来源：{screen.metadata.basedOnScreenId}</p>}
  </section>;
}
