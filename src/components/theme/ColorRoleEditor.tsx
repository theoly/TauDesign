import React, { useState } from 'react';
import type { ColorBinding, DesignSystemTokens } from '../../types/designSystem';
import { COLOR_ROLES, CORE_COLOR_ROLES, colorRoleKeys, type ColorRole } from '../../types/colorRoles';
import { checkColorContrast, normalizeHex, resolveThemeColors, withColorBinding } from '../../utils/semanticColors';
import { applyBrandColor, contrastRatio, readableColor } from '../../utils/colorHarmony';

interface Props {
  tokens: DesignSystemTokens;
  mode: 'light' | 'dark';
  onChange: (tokens: DesignSystemTokens) => void;
}

function ColorField({ value, label, onApply }: { value: string; label: string; onApply: (hex: string) => boolean }) {
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState('');
  const apply = () => {
    const normalized = normalizeHex(draft);
    if (!normalized) { setError('请输入 3 位或 6 位 Hex'); return; }
    if (normalized !== value && !onApply(normalized)) return;
    setDraft(normalized); setError('');
  };
  return <div className="space-y-1">
    <div className="flex items-center gap-2">
      <input type="color" aria-label={`${label}选色`} value={normalizeHex(draft) ?? value} onChange={e => {
        const next = e.target.value;
        if (onApply(next)) { setDraft(next); setError(''); }
      }} className="h-7 w-8 bg-transparent cursor-pointer" />
      <input aria-label={`${label}颜色值`} value={draft} onChange={e => { setDraft(e.target.value); setError(''); }}
        onBlur={apply} onKeyDown={e => { if (e.key === 'Enter') apply(); }} aria-invalid={!!error}
        className="w-24 rounded border border-slate-700 bg-slate-900 px-2 py-1 font-mono text-slate-200" />
    </div>
    {error && <p role="alert" className="text-amber-300">{error}</p>}
  </div>;
}

export function ColorRoleEditor({ tokens, mode, onChange }: Props) {
  const [error, setError] = useState('');
  const [advanced, setAdvanced] = useState(false);
  const resolved = resolveThemeColors(tokens, mode);
  const checks = checkColorContrast(resolved);
  const failures = checks.filter(c => !c.passes);
  const bindingFor = (role: ColorRole) => tokens.colorRoles?.[mode]?.[role];
  const update = (role: ColorRole, binding?: ColorBinding): boolean => {
    try { onChange(withColorBinding(tokens, mode, role, binding)); setError(''); return true; }
    catch (e) { setError(e instanceof Error ? e.message : '配置无效'); return false; }
  };
  const row = (role: ColorRole) => {
    const label = COLOR_ROLES[role][0];
    const binding = bindingFor(role);
    const value = resolved.values[role];
    return <div key={role} data-color-role={role} className="space-y-2 border-t border-slate-800 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium text-slate-200">{label}</span>
        <select aria-label={`${label}来源`} value={binding?.source ?? 'auto'} onChange={e => {
          const source = e.target.value;
          update(role, source === 'auto' ? undefined : source === 'custom' ? { source, value } : { source: 'alias', role: role === 'textSecondary' ? 'textPrimary' : 'textSecondary' });
        }} className="rounded border border-slate-700 bg-slate-900 p-1 text-slate-200">
          <option value="auto">自动生成</option><option value="alias">跟随角色</option><option value="custom">自定义</option>
        </select>
      </div>
      {binding?.source === 'alias' && <select aria-label={`${label}跟随角色`} value={binding.role}
        onChange={e => update(role, { source: 'alias', role: e.target.value as ColorRole })}
        className="w-full rounded border border-slate-700 bg-slate-900 p-1 text-slate-200">
        {colorRoleKeys.filter(k => k !== role).map(k => <option key={k} value={k}>{COLOR_ROLES[k][0]}</option>)}
      </select>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {binding?.source === 'custom'
          ? <ColorField key={`${mode}:${role}:${value}`} label={label} value={value} onApply={hex => update(role, { source: 'custom', value: hex })} />
          : <span className="flex items-center gap-2 font-mono text-slate-300"><span className="h-5 w-5 rounded border border-slate-600" style={{ background: value }} />{value}</span>}
        {binding && <button type="button" aria-label={`${label}恢复自动`} onClick={() => update(role)} className="text-blue-300">恢复自动</button>}
      </div>
      <p className="text-[11px] text-slate-400">{resolved.sources[role]} · --color-{COLOR_ROLES[role][1]}</p>
    </div>;
  };
  const suggestedFill = readableColor(resolved.values.primary, [resolved.values.onPrimary]);
  const canFix = contrastRatio(resolved.values.primary, resolved.values.onPrimary) < 4.5 && contrastRatio(suggestedFill, resolved.values.onPrimary) >= 4.5;
  const warmOrange = () => {
    let next = applyBrandColor(tokens, '#ff8a55', true);
    for (const m of ['light', 'dark'] as const) {
      next = withColorBinding(next, m, 'primary', { source: 'custom', value: '#b8441c' });
      next = withColorBinding(next, m, 'onPrimary', { source: 'custom', value: '#ffffff' });
    }
    onChange(next);
  };
  return <section className="rounded-xl border border-slate-800 bg-slate-950 p-4 space-y-3 text-xs" aria-label="语义配色配置">
    <div className="flex items-center justify-between gap-2"><h3 className="font-semibold text-slate-200">语义配色 · {mode === 'light' ? '浅色' : '深色'}</h3>
      <button type="button" onClick={warmOrange} className="rounded border border-slate-700 px-2 py-1 text-orange-200">应用暖橙白字方案</button>
    </div>
    <p className="text-slate-400 leading-relaxed">品牌色在上方设置；正文、品牌文字与按钮前景独立配置。自动值随依赖更新，自定义值保留。颜色值失焦或按 Enter 后应用，可撤销。</p>
    {CORE_COLOR_ROLES.map(row)}
    <button type="button" aria-expanded={advanced} onClick={() => setAdvanced(!advanced)} className="w-full rounded bg-slate-800 py-2 text-slate-200">{advanced ? '收起高级配色' : '展开高级配色'}</button>
    {advanced && [...new Set(colorRoleKeys.map(k => COLOR_ROLES[k][2]))].map(group => <div key={group}>
      <h4 className="pt-3 font-semibold text-blue-200">{group}</h4>
      {colorRoleKeys.filter(k => COLOR_ROLES[k][2] === group && !CORE_COLOR_ROLES.includes(k)).map(row)}
    </div>)}
    {error && <p role="alert" className="text-amber-300">{error}</p>}
    {resolved.issues.map(i => <p role="alert" key={i.role} className="text-amber-300">{i.message}；已回退自动值。请恢复该项自动配置。</p>)}
    <div className="rounded border border-slate-700 p-3 space-y-2" aria-label="配色对比检查">
      <p className={failures.length ? 'text-amber-300' : 'text-emerald-300'}>{failures.length ? `${failures.length} 组配色需要调整` : '标准配对对比度检查通过'} · {checks.length} 项</p>
      <p className="text-slate-400">文字 ≥4.5:1；焦点与必要控件边界 ≥3:1。禁用态不计入通过率。图片、渐变和局部覆盖需单独检查。</p>
      {failures.map((c, i) => <p key={i} className="text-amber-200">{c.label}：{c.ratio.toFixed(2)}:1，要求 {c.minimum}:1</p>)}
      {canFix && <div className="space-y-2">
        <p className="text-slate-300">保留按钮文字 {resolved.values.onPrimary}，建议背景 {suggestedFill}：</p>
        <div className="flex gap-2"><span className="rounded px-3 py-2" style={{ background: resolved.values.primary, color: resolved.values.onPrimary }}>当前</span><span className="rounded px-3 py-2" style={{ background: suggestedFill, color: resolved.values.onPrimary }}>建议</span></div>
        <button type="button" onClick={() => update('primary', { source: 'custom', value: suggestedFill })} className="rounded bg-slate-700 px-3 py-2 text-slate-100">应用建议背景</button>
      </div>}
      <details><summary className="cursor-pointer text-slate-300">查看全部配对</summary><div className="mt-2 max-h-52 overflow-auto space-y-1">
        {checks.map((c, i) => <p key={i} className={c.passes ? 'text-slate-400' : 'text-amber-200'}>{c.label}：{c.ratio.toFixed(2)}:1 {c.passes ? '通过' : '不足'}</p>)}
      </div></details>
    </div>
  </section>;
}
