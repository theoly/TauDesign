import React, { useEffect, useState } from 'react';
import { Check, RefreshCw } from 'lucide-react';
import type { DesignSystem } from '../../types/designSystem';
import {
  CUSTOM_STYLE_OPTIONS, DEFAULT_CUSTOM_DESIGN_SYSTEM, generateCustomDesignSystems,
  normalizeCustomPrimary, retainDesignSystemCandidates,
  type CustomDesignSystemCandidate, type CustomDesignSystemOptions
} from '../../utils/customDesignSystem';
import { useLocaleStore, useT } from '../../stores/useLocaleStore';

export const CustomDesignSystemBuilder: React.FC<{ onChange: (theme: DesignSystem | null) => void }> = ({ onChange }) => {
  const t = useT();
  const locale = useLocaleStore((s) => s.locale);
  const [options, setOptions] = useState<CustomDesignSystemOptions>(DEFAULT_CUSTOM_DESIGN_SYSTEM);
  const [seed, setSeed] = useState(0);
  const [candidates, setCandidates] = useState(() => generateCustomDesignSystems(DEFAULT_CUSTOM_DESIGN_SYSTEM, 0, locale));
  const [selectedId, setSelectedId] = useState(() => candidates[0].theme.id);
  const primary = normalizeCustomPrimary(options.primary);

  useEffect(() => {
    if (!normalizeCustomPrimary(options.primary)) {
      onChange(null);
      return;
    }
    const batch = generateCustomDesignSystems(options, seed, locale);
    setCandidates((previous) => retainDesignSystemCandidates(previous, batch, selectedId));
    const selected = batch.find((c) => c.theme.id === selectedId) ?? batch[0];
    setSelectedId(selected.theme.id);
    onChange(selected.theme);
    // Re-localize candidate copy when UI locale changes; avoid looping on onChange identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale]);

  const updateOptions = (patch: Partial<CustomDesignSystemOptions>) => {
    const next = { ...options, ...patch };
    setOptions(next);
    if (!normalizeCustomPrimary(next.primary)) {
      onChange(null);
      return;
    }
    const batch = generateCustomDesignSystems(next, seed, locale);
    setCandidates(previous => retainDesignSystemCandidates(previous, batch, batch[0].theme.id));
    setSelectedId(batch[0].theme.id);
    onChange(batch[0].theme);
  };

  const reroll = () => {
    if (!primary) return;
    const nextSeed = seed + 1;
    const batch = generateCustomDesignSystems(options, nextSeed, locale);
    setCandidates(previous => retainDesignSystemCandidates(previous, batch, selectedId));
    setSeed(nextSeed);
  };

  const select = (candidate: CustomDesignSystemCandidate) => {
    setOptions(candidate.options);
    setSelectedId(candidate.theme.id);
    onChange(candidate.theme);
  };

  return (
    <div className="space-y-3" data-testid="custom-design-system-builder">
      <div>
        <label htmlFor="custom-primary" className="block text-[11px] text-slate-400 font-medium mb-1.5">{t('workspace.customPrimary')}</label>
        <div className="flex gap-2">
          <input
            type="color" aria-label={t('workspace.customPrimaryPickAria')} value={primary ?? DEFAULT_CUSTOM_DESIGN_SYSTEM.primary}
            onChange={e => updateOptions({ primary: e.target.value })}
            className="h-8 w-10 rounded border border-slate-700 bg-slate-950 p-0.5 cursor-pointer"
          />
          <input
            id="custom-primary" aria-label={t('workspace.customPrimaryAria')} aria-invalid={!primary}
            aria-describedby={!primary ? 'custom-primary-error' : undefined}
            value={options.primary} onChange={e => updateOptions({ primary: e.target.value })}
            className="flex-1 min-w-0 bg-slate-950 border border-slate-700 rounded-lg px-2.5 text-xs font-mono text-slate-200 focus:outline-none focus:border-blue-500"
            placeholder="#42658c"
          />
        </div>
        {!primary && <p id="custom-primary-error" role="alert" className="text-[11px] text-amber-400 mt-1">{t('workspace.customPrimaryError')}</p>}
      </div>

      <fieldset>
        <legend className="text-[11px] text-slate-400 font-medium mb-1.5">{t('workspace.customStyleLegend')}</legend>
        <div className="grid grid-cols-3 gap-1.5">
          {CUSTOM_STYLE_OPTIONS.map(style => (
            <button
              key={style.value} type="button" aria-pressed={options.style === style.value}
              onClick={() => updateOptions({ style: style.value })}
              className={`rounded-lg border py-2 text-[11px] transition ${options.style === style.value ? 'bg-blue-950/40 border-blue-500 text-blue-300' : 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700'}`}
            >{t(style.labelKey)}</button>
          ))}
        </div>
      </fieldset>

      <div className="grid grid-cols-2 gap-2">
        <label className="text-[11px] text-slate-400 font-medium">{t('workspace.customDensity')}
          <select aria-label={t('workspace.customDensityAria')} value={options.density} onChange={e => updateOptions({ density: e.target.value as CustomDesignSystemOptions['density'] })} className="block mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-xs text-slate-200">
            <option value="compact">{t('workspace.customDensityCompact')}</option>
            <option value="standard">{t('workspace.customDensityStandard')}</option>
            <option value="relaxed">{t('workspace.customDensityRelaxed')}</option>
          </select>
        </label>
        <label className="text-[11px] text-slate-400 font-medium">{t('workspace.customRadius')}
          <select aria-label={t('workspace.customRadiusAria')} value={options.radius} onChange={e => updateOptions({ radius: e.target.value as CustomDesignSystemOptions['radius'] })} className="block mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-xs text-slate-200">
            <option value="sharp">{t('workspace.customRadiusSharp')}</option>
            <option value="standard">{t('workspace.customRadiusStandard')}</option>
            <option value="rounded">{t('workspace.customRadiusRounded')}</option>
          </select>
        </label>
      </div>

      <div className="flex items-center justify-between pt-1">
        <span className="text-[11px] text-slate-400">{t('workspace.customCandidates', { count: candidates.length })}</span>
        <button type="button" onClick={reroll} disabled={!primary} className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 disabled:opacity-40">
          <RefreshCw className="w-3 h-3" />{t('workspace.customReroll')}
        </button>
      </div>
      <p className="text-[10px] leading-relaxed text-slate-500">{t('workspace.customRerollHint')}</p>
      <div className="space-y-2 max-h-[300px] overflow-y-auto pr-0.5">
        {candidates.map(candidate => {
          const { theme } = candidate;
          const selected = selectedId === theme.id && !!primary;
          return (
            <button
              key={theme.id} type="button" data-candidate-id={theme.id} aria-pressed={selected}
              onClick={() => select(candidate)}
              className={`w-full rounded-xl p-2.5 border text-left transition ${selected ? 'border-blue-500 bg-blue-950/40 ring-1 ring-blue-500/40' : 'border-slate-800 bg-slate-950 hover:border-slate-700'}`}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-200">{theme.name}</span>
                {selected && <Check className="w-3.5 h-3.5 text-blue-400 shrink-0" />}
              </span>
              <span className="flex items-center gap-1.5 mt-2" aria-label={t('workspace.customSwatchAria')}>
                {[theme.tokens.colors.primary['500'], theme.tokens.colors.background.light, theme.tokens.colors.background.dark, theme.tokens.colors.surfaceAlt.light].map((color, index) => (
                  <span key={index} className="w-5 h-5 rounded border border-white/10" style={{ backgroundColor: color }} />
                ))}
                <span className="text-[10px] font-mono text-slate-500 ml-1">{candidate.options.primary}</span>
              </span>
              <span className="block mt-1.5 text-[10px] text-slate-400">{candidate.description}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
