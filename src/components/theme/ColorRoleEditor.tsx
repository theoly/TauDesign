import React, { useState } from 'react';
import type { ColorBinding, DesignSystemTokens } from '../../types/designSystem';
import { COLOR_ROLES, CORE_COLOR_ROLES, colorRoleKeys, type ColorRole } from '../../types/colorRoles';
import { checkColorContrast, normalizeHex, resolveThemeColors, withColorBinding, type ContrastCheck, type ColorIssue } from '../../utils/semanticColors';
import { applyBrandColor, contrastRatio, readableColor } from '../../utils/colorHarmony';
import { useT } from '../../stores/useLocaleStore';

interface Props {
  tokens: DesignSystemTokens;
  mode: 'light' | 'dark';
  onChange: (tokens: DesignSystemTokens) => void;
}

const GROUP_SLUG: Record<string, 'brand' | 'action' | 'background' | 'text' | 'border' | 'disabled' | 'state' | 'inverse'> = {
  '品牌': 'brand',
  '操作': 'action',
  '背景': 'background',
  '文字': 'text',
  '边框': 'border',
  '禁用': 'disabled',
  '状态': 'state',
  '反色': 'inverse',
};

function ColorField({ value, label, onApply, t }: { value: string; label: string; onApply: (hex: string) => boolean; t: ReturnType<typeof useT> }) {
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState('');
  const apply = () => {
    const normalized = normalizeHex(draft);
    if (!normalized) { setError(t('theme.colorRoleHexInvalid')); return; }
    if (normalized !== value && !onApply(normalized)) return;
    setDraft(normalized); setError('');
  };
  return <div className="space-y-1">
    <div className="flex items-center gap-2">
      <input type="color" aria-label={t('theme.colorRolePickAria', { label })} value={normalizeHex(draft) ?? value} onChange={e => {
        const next = e.target.value;
        if (onApply(next)) { setDraft(next); setError(''); }
      }} className="h-7 w-8 bg-transparent cursor-pointer" />
      <input aria-label={t('theme.colorRoleValueAria', { label })} value={draft} onChange={e => { setDraft(e.target.value); setError(''); }}
        onBlur={apply} onKeyDown={e => { if (e.key === 'Enter') apply(); }} aria-invalid={!!error}
        className="w-24 rounded border border-slate-700 bg-slate-900 px-2 py-1 font-mono text-slate-200" />
    </div>
    {error && <p role="alert" className="text-amber-300">{error}</p>}
  </div>;
}

function translateIssueMessage(t: ReturnType<typeof useT>, roleLabel: (role: ColorRole) => string, issue: ColorIssue): string {
  const { role, message } = issue;
  if (message.includes('循环')) return t('theme.colorRoleErrCycle', { role: roleLabel(role) });
  if (message.includes('自定义颜色无效')) return t('theme.colorRoleErrInvalidCustom', { role: roleLabel(role) });
  if (message.includes('来源无效')) return t('theme.colorRoleErrInvalidSource', { role: roleLabel(role) });
  if (message.includes('不存在的角色')) return t('theme.colorRoleErrUnknownRole', { role });
  return message;
}

function translateBindingError(t: ReturnType<typeof useT>, roleLabel: (role: ColorRole) => string, message: string): string {
  if (!message.includes('；')) return translateIssueMessage(t, roleLabel, { role: 'primary', message });
  return message.split('；').map(part => translateIssueMessage(t, roleLabel, { role: 'primary', message: part })).join('；');
}

function translateSourceString(
  t: ReturnType<typeof useT>,
  roleLabel: (role: ColorRole) => string,
  role: ColorRole,
  source: string,
  binding?: ColorBinding,
): string {
  if (source.includes('无效配置')) return t('theme.colorRoleSourceInvalidFallback');
  if (binding?.source === 'custom' || source === '自定义') return t('theme.colorRoleSourceCustom');
  if (binding?.source === 'alias' || source.startsWith('跟随 ')) {
    const aliasRole = binding?.source === 'alias' ? binding.role : role;
    return t('theme.colorRoleSourceAlias', { role: roleLabel(aliasRole) });
  }
  if (role === 'onPrimary' && source.includes('主按钮背景')) return t('theme.colorRoleSourceAutoOnPrimary');
  let out = t('theme.colorRoleSourceAuto');
  if (source.includes('已修正对比度')) out += t('theme.colorRoleSourceContrastAdjusted');
  if (source.includes('展示叠加')) out += t('theme.colorRoleSourceBorderOverlay');
  return out;
}

function contrastLabel(t: ReturnType<typeof useT>, roleLabel: (role: ColorRole) => string, check: ContrastCheck): string {
  const { foreground: fg, background: bg } = check;
  if (fg === 'focusRing') return t('theme.colorRoleContrastFocusOn', { surface: roleLabel(bg) });
  if (fg === 'onPrimary') return t('theme.colorRoleContrastPrimaryBtn', { bg: roleLabel(bg) });
  if (fg === 'onDanger') return t('theme.colorRoleContrastDangerBtn', { bg: roleLabel(bg) });
  if (fg === 'primaryText' && bg === 'primaryLight') return t('theme.colorRoleContrastSecondaryBtn');
  if (fg === 'selectedText' && bg === 'selectedBg') return t('theme.colorRoleContrastSelected');
  if (fg === 'inverseText' && bg === 'inverseBg') return t('theme.colorRoleContrastInverse');
  if (fg === 'onAccent' && bg === 'accent') return t('theme.colorRoleContrastAccent');
  if (fg === 'accentText' && bg === 'accentLight') return t('theme.colorRoleContrastAccentLight');
  if (fg === 'controlBorder' && bg === 'surface') return t('theme.colorRoleContrastControlInner');
  if (fg === 'controlBorder' && bg === 'background') return t('theme.colorRoleContrastControlOuter');
  const stateText = fg.match(/^(success|warning|danger|info)Text$/);
  if (stateText && bg === `${stateText[1]}Light`) return t('theme.colorRoleContrastStateOnLight', { name: roleLabel(fg) });
  const onState = fg.match(/^on(Success|Warning|Danger|Info)$/);
  if (onState) {
    const state = onState[1].toLowerCase();
    if (bg === `${state}Fill`) return t('theme.colorRoleContrastStateOnFill', { name: roleLabel(`${state}Text` as ColorRole) });
  }
  return t('theme.colorRoleContrastPair', { fg: roleLabel(fg), bg: roleLabel(bg) });
}

export function ColorRoleEditor({ tokens, mode, onChange }: Props) {
  const t = useT();
  const [error, setError] = useState('');
  const [advanced, setAdvanced] = useState(false);
  const resolved = resolveThemeColors(tokens, mode);
  const checks = checkColorContrast(resolved);
  const failures = checks.filter(c => !c.passes);
  const bindingFor = (role: ColorRole) => tokens.colorRoles?.[mode]?.[role];
  const roleLabel = (role: ColorRole) => t(`theme.colorRoleRoles.${role}` as Parameters<typeof t>[0]);
  const groupLabel = (group: string) => {
    const slug = GROUP_SLUG[group];
    return slug ? t(`theme.colorRoleGroups.${slug}` as Parameters<typeof t>[0]) : group;
  };
  const update = (role: ColorRole, binding?: ColorBinding): boolean => {
    try { onChange(withColorBinding(tokens, mode, role, binding)); setError(''); return true; }
    catch (e) {
      setError(e instanceof Error ? translateBindingError(t, roleLabel, e.message) : t('theme.colorRoleInvalidConfig'));
      return false;
    }
  };
  const row = (role: ColorRole) => {
    const label = roleLabel(role);
    const binding = bindingFor(role);
    const value = resolved.values[role];
  const sourceLine = `${translateSourceString(t, roleLabel, role, resolved.sources[role], binding)} · --color-${COLOR_ROLES[role][1]}`;
    return <div key={role} data-color-role={role} className="space-y-2 border-t border-slate-800 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium text-slate-200">{label}</span>
        <select aria-label={t('theme.colorRoleSourceAria', { label })} value={binding?.source ?? 'auto'} onChange={e => {
          const source = e.target.value;
          update(role, source === 'auto' ? undefined : source === 'custom' ? { source, value } : { source: 'alias', role: role === 'textSecondary' ? 'textPrimary' : 'textSecondary' });
        }} className="rounded border border-slate-700 bg-slate-900 p-1 text-slate-200">
          <option value="auto">{t('theme.colorRoleBindingAuto')}</option><option value="alias">{t('theme.colorRoleBindingAlias')}</option><option value="custom">{t('theme.colorRoleBindingCustom')}</option>
        </select>
      </div>
      {binding?.source === 'alias' && <select aria-label={t('theme.colorRoleFollowRoleAria', { label })} value={binding.role}
        onChange={e => update(role, { source: 'alias', role: e.target.value as ColorRole })}
        className="w-full rounded border border-slate-700 bg-slate-900 p-1 text-slate-200">
        {colorRoleKeys.filter(k => k !== role).map(k => <option key={k} value={k}>{roleLabel(k)}</option>)}
      </select>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {binding?.source === 'custom'
          ? <ColorField key={`${mode}:${role}:${value}`} label={label} value={value} onApply={hex => update(role, { source: 'custom', value: hex })} t={t} />
          : <span className="flex items-center gap-2 font-mono text-slate-300"><span className="h-5 w-5 rounded border border-slate-600" style={{ background: value }} />{value}</span>}
        {binding && <button type="button" aria-label={t('theme.colorRoleResetAutoAria', { label })} onClick={() => update(role)} className="text-blue-300">{t('theme.colorRoleResetAuto')}</button>}
      </div>
      <p className="text-[11px] text-slate-400">{sourceLine}</p>
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
  const modeLabel = mode === 'light' ? t('theme.colorRoleModeLight') : t('theme.colorRoleModeDark');
  return <section className="rounded-xl border border-slate-800 bg-slate-950 p-4 space-y-3 text-xs" aria-label={t('theme.colorRoleSectionAria')}>
    <div className="flex items-center justify-between gap-2"><h3 className="font-semibold text-slate-200">{t('theme.colorRoleHeading', { mode: modeLabel })}</h3>
      <button type="button" onClick={warmOrange} className="rounded border border-slate-700 px-2 py-1 text-orange-200">{t('theme.colorRoleApplyWarmOrange')}</button>
    </div>
    <p className="text-slate-400 leading-relaxed">{t('theme.colorRoleIntro')}</p>
    {CORE_COLOR_ROLES.map(row)}
    <button type="button" aria-expanded={advanced} onClick={() => setAdvanced(!advanced)} className="w-full rounded bg-slate-800 py-2 text-slate-200">{advanced ? t('theme.colorRoleCollapseAdvanced') : t('theme.colorRoleExpandAdvanced')}</button>
    {advanced && [...new Set(colorRoleKeys.map(k => COLOR_ROLES[k][2]))].map(group => <div key={group}>
      <h4 className="pt-3 font-semibold text-blue-200">{groupLabel(group)}</h4>
      {colorRoleKeys.filter(k => COLOR_ROLES[k][2] === group && !CORE_COLOR_ROLES.includes(k)).map(row)}
    </div>)}
    {error && <p role="alert" className="text-amber-300">{error}</p>}
    {resolved.issues.map(i => <p role="alert" key={i.role} className="text-amber-300">{t('theme.colorRoleIssueLine', { message: translateIssueMessage(t, roleLabel, i) })}</p>)}
    <div className="rounded border border-slate-700 p-3 space-y-2" aria-label={t('theme.colorRoleContrastSectionAria')}>
      <p className={failures.length ? 'text-amber-300' : 'text-emerald-300'}>
        {(failures.length ? t('theme.colorRoleContrastNeedsWork', { count: failures.length }) : t('theme.colorRoleContrastPass')) + t('theme.colorRoleContrastMeta', { count: checks.length })}
      </p>
      <p className="text-slate-400">{t('theme.colorRoleContrastHint')}</p>
      {failures.map((c, i) => <p key={i} className="text-amber-200">{t('theme.colorRoleContrastRatio', { label: contrastLabel(t, roleLabel, c), ratio: c.ratio.toFixed(2), minimum: c.minimum })}</p>)}
      {canFix && <div className="space-y-2">
        <p className="text-slate-300">{t('theme.colorRoleSuggestKeepFg', { color: resolved.values.onPrimary, suggested: suggestedFill })}</p>
        <div className="flex gap-2"><span className="rounded px-3 py-2" style={{ background: resolved.values.primary, color: resolved.values.onPrimary }}>{t('theme.colorRoleSuggestCurrent')}</span><span className="rounded px-3 py-2" style={{ background: suggestedFill, color: resolved.values.onPrimary }}>{t('theme.colorRoleSuggestProposed')}</span></div>
        <button type="button" onClick={() => update('primary', { source: 'custom', value: suggestedFill })} className="rounded bg-slate-700 px-3 py-2 text-slate-100">{t('theme.colorRoleApplySuggestedBg')}</button>
      </div>}
      <details><summary className="cursor-pointer text-slate-300">{t('theme.colorRoleViewAllPairs')}</summary><div className="mt-2 max-h-52 overflow-auto space-y-1">
        {checks.map((c, i) => <p key={i} className={c.passes ? 'text-slate-400' : 'text-amber-200'}>{contrastLabel(t, roleLabel, c)}：{c.ratio.toFixed(2)}:1 {c.passes ? t('theme.colorRoleContrastPassShort') : t('theme.colorRoleContrastFailShort')}</p>)}
      </div></details>
    </div>
  </section>;
}