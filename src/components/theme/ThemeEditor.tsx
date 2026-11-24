import { ColorRoleEditor } from './ColorRoleEditor';
import React, { useState } from 'react';
import { useProjectStore } from '../../stores/useProjectStore';
import { useT } from '../../stores/useLocaleStore';
import { themePresets } from '../../utils/themePresets';
import { getBaseCss } from '../../styles/baseCss';
import { StylePicker } from './StylePicker';
import { DesignSystemVisualPreview } from './DesignSystemVisualPreview';
import { Bookmark, Check, ChevronDown, Code, FileText, Moon, Palette, Plus, Search, Sparkles, Sun } from 'lucide-react';
import rawBaseCss from '../../styles/base.css?raw';
import { resolveDesignProse } from '../../services/ai/engine/context/designProseProvider';
import { applyBrandColor, COLOR_SCHEMES } from '../../utils/colorHarmony';
import { DesignLibraryImportPanel } from './DesignLibraryImportPanel';
import {PageStyleExtractionDialog} from './PageStyleExtractionDialog';
import {ThemeBackgroundEditor} from './ThemeBackgroundEditor';

interface ThemeEditorProps {
  onClose: () => void;
}

type RadiusLabelKey =
  | 'theme.radiusSharp'
  | 'theme.radiusStandard'
  | 'theme.radiusRounded'
  | 'theme.radiusXL';

const RADIUS_PRESETS: Array<{ labelKey: RadiusLabelKey; value: {
  none: string; sm: string; md: string; lg: string; xl: string; full: string;
} }> = [
  { labelKey: 'theme.radiusSharp', value: { none: '0px', sm: '2px', md: '4px', lg: '6px', xl: '8px', full: '9999px' } },
  { labelKey: 'theme.radiusStandard', value: { none: '0px', sm: '4px', md: '8px', lg: '12px', xl: '16px', full: '9999px' } },
  { labelKey: 'theme.radiusRounded', value: { none: '0px', sm: '6px', md: '12px', lg: '16px', xl: '24px', full: '9999px' } },
  { labelKey: 'theme.radiusXL', value: { none: '0px', sm: '8px', md: '14px', lg: '20px', xl: '28px', full: '9999px' } },
];

export const ThemeEditor: React.FC<ThemeEditorProps> = ({ onClose }) => {
  const t = useT();
  const {
    designSystem,
    designLibraryBinding,
    setDesignSystem,
    settings,
    setColorMode,
    decisions,
    addDecision,
    toggleDecision
  } = useProjectStore();

  const [activeTab, setActiveTab] = useState<'tokens' | 'decisions' | 'base_css'>('tokens');
  const [newRuleInput, setNewRuleInput] = useState('');
  const [baseCssFilter, setBaseCssFilter] = useState('');
  const [aiEvolveInput, setAiEvolveInput] = useState('');
  const libraryReadOnly=designLibraryBinding?.mode==='pinned_reference';
  const [showStylePicker, setShowStylePicker] = useState(false);
  const [evolveResult, setEvolveResult] = useState<string | null>(null);
  const [showProseCard, setShowProseCard] = useState(false);
  const [harmonizeSurfaces, setHarmonizeSurfaces] = useState(true);
  const [extracting,setExtracting]=useState(false);

  const activeProse = resolveDesignProse({ presetId: designSystem.id });

  const handleSelectPreset = (presetTheme: typeof designSystem) => {
    setDesignSystem(presetTheme);
  };

  /** T-AE-24: 开放风格性格参数调节——此前只有主色可调，"换风格"名不副实 */
  const patchTokens = (patch: (tokens: typeof designSystem.tokens) => typeof designSystem.tokens) => {
    setDesignSystem({ ...designSystem, tokens: patch(designSystem.tokens) });
  };

  const handlePrimaryColorChange = (newColorHex: string) => {
    setDesignSystem({ ...designSystem, tokens: applyBrandColor(designSystem.tokens, newColorHex, harmonizeSurfaces) });
  };

  const handleAddManualRule = () => {
    if (!newRuleInput.trim()) return;
    addDecision(newRuleInput.trim(), 'global');
    setNewRuleInput('');
  };

  // 只读展示唯一权威源本身 —— 此前展示的是一份手写"样例"，与真实生效的 CSS 不符 (T-AE-02)
  const baseCssSample = getBaseCss(settings.deviceProfile);

  if (showStylePicker) {
    return <StylePicker onClose={() => setShowStylePicker(false)} />;
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 lg:p-6">
      <div className="w-full max-w-6xl bg-host-chrome text-host-primary border border-host-border-strong rounded-xl shadow-2xl overflow-hidden flex flex-col h-[90vh]">
        {/* Header */}
        <div className="p-4 border-b border-host-border flex items-center justify-between bg-host-chrome">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-host-accent-subtle border border-host-accent/40 flex items-center justify-center">
              <Palette className="w-4 h-4 text-host-brand" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-host-primary text-sm">{t('theme.title')}</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-host-accent-subtle text-host-brand border border-host-accent/40 font-mono">
                  {designSystem.name}
                </span>
              </div>
              <p className="text-[11px] text-host-secondary">
                {t('theme.subtitle')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-host-elevated text-host-secondary hover:text-host-primary text-lg flex items-center justify-center transition"
          >
            ×
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center justify-between border-b border-host-border bg-host-sunken px-4 text-xs font-medium">
          <div className="flex items-center">
            <button
              onClick={() => setActiveTab('tokens')}
              className={`py-3 px-4 border-b-2 flex items-center gap-1.5 transition ${
                activeTab === 'tokens'
                  ? 'border-host-accent text-host-brand font-semibold'
                  : 'border-transparent text-host-secondary hover:text-host-primary'
              }`}
            >
              <Palette className="w-3.5 h-3.5" />
              <span>{t('theme.tabTokens')}</span>
            </button>
            <button
              onClick={() => setActiveTab('decisions')}
              className={`py-3 px-4 border-b-2 flex items-center gap-1.5 transition ${
                activeTab === 'decisions'
                  ? 'border-host-accent text-host-brand font-semibold'
                  : 'border-transparent text-host-secondary hover:text-host-primary'
              }`}
            >
              <Bookmark className="w-3.5 h-3.5 text-host-warning" />
              <span>{t('theme.tabDecisions')}</span>
            </button>
            <button
              onClick={() => setActiveTab('base_css')}
              className={`py-3 px-4 border-b-2 flex items-center gap-1.5 transition ${
                activeTab === 'base_css'
                  ? 'border-host-accent text-host-brand font-semibold'
                  : 'border-transparent text-host-secondary hover:text-host-primary'
              }`}
            >
              <Code className="w-3.5 h-3.5 text-host-success" />
              <span>{t('theme.tabBaseCss')}</span>
            </button>
          </div>

          <div className="flex items-center gap-2 py-2">
            <button
              disabled={libraryReadOnly} title={libraryReadOnly?t('theme.libraryReadonlyTitle'):undefined}
              onClick={() => setShowStylePicker(true)}
              className="px-2.5 py-1.5 bg-host-elevated hover:bg-host-dialog text-host-primary rounded-lg text-xs font-medium transition flex items-center gap-1.5 border border-host-border"
            >
              <Sparkles className="w-3.5 h-3.5 text-host-warning" />
              <span>{t('theme.styleCompare')}</span>
            </button>
          </div>
        </div>

        {/* Split-pane Body */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 min-h-0 overflow-hidden">
          {/* Left Panel: Configuration & Rules */}
          <div className="lg:col-span-5 border-r border-host-border p-5 space-y-5 text-xs overflow-y-auto bg-host-chrome">
          {/* Tab 1: Tokens */}
          {activeTab === 'tokens' && (
            <>
              <DesignLibraryImportPanel />
              {/* Color Mode */}
              <div className="flex items-center justify-between p-3 bg-host-sunken border border-host-border rounded-xl">
                <div>
                  <span className="font-semibold text-host-primary block">{t('theme.colorMode')}</span>
                  <span className="text-host-tertiary text-[11px]">{t('theme.colorModeHint')}</span>
                </div>
                <div className="flex items-center gap-1 bg-host-elevated p-1 rounded-lg border border-host-border">
                  <button
                    onClick={() => setColorMode('light')}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-md transition ${
                      settings.colorMode === 'light'
                        ? 'bg-host-accent text-host-on-accent font-medium shadow'
                        : 'text-host-secondary hover:text-host-primary'
                    }`}
                  >
                    <Sun className="w-3.5 h-3.5" />
                    <span>{t('theme.light')}</span>
                  </button>
                  <button
                    onClick={() => setColorMode('dark')}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-md transition ${
                      settings.colorMode === 'dark'
                        ? 'bg-host-accent text-host-on-accent font-medium shadow'
                        : 'text-host-secondary hover:text-host-primary'
                    }`}
                  >
                    <Moon className="w-3.5 h-3.5" />
                    <span>{t('theme.dark')}</span>
                  </button>
                </div>
              </div>

              {/* Theme Presets */}
              <button onClick={()=>setExtracting(true)} className="w-full rounded-lg border border-host-border bg-host-elevated hover:bg-host-dialog p-3 text-xs text-host-primary transition">{t('theme.extractStyle')}</button>
              {extracting&&<PageStyleExtractionDialog onClose={()=>setExtracting(false)}/>}
              <fieldset disabled={libraryReadOnly} className="space-y-5 disabled:opacity-50" aria-label={t('theme.tokenEditAria')}>
              <details className="space-y-3">
                <summary className="cursor-pointer text-host-primary font-semibold">{t('theme.presets')}</summary>
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold text-host-primary block">{t('theme.presetsTitle')}</span>
                  <button
                    disabled={libraryReadOnly} title={libraryReadOnly?t('theme.libraryReadonlyTitle'):undefined}
                    onClick={() => setShowStylePicker(true)}
                    className="px-2.5 py-1 bg-host-elevated hover:bg-host-dialog border border-host-border text-host-primary rounded-lg text-[10px] font-medium whitespace-nowrap"
                  >
                    {t('theme.sideBySidePreview')}
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {themePresets.map((preset) => {
                    const isSelected = designSystem.id === preset.theme.id;
                    return (
                      <button type="button" disabled={libraryReadOnly}
                        key={preset.id}
                        onClick={() => handleSelectPreset(preset.theme)}
                        className={`p-4 text-left rounded-xl border cursor-pointer transition flex flex-col gap-2 ${
                          isSelected
                            ? 'border-host-accent/50 bg-host-accent-subtle ring-1 ring-host-accent/50'
                            : 'border-host-border bg-host-sunken hover:border-host-border-strong'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span
                              className="w-4 h-4 rounded-full shadow-sm"
                              style={{ backgroundColor: preset.primaryColor }}
                            />
                            <span className="font-semibold text-host-primary">{preset.name}</span>
                          </div>
                          {isSelected && <Check className="w-4 h-4 text-host-brand" />}
                        </div>
                        <p className="text-[11px] text-host-secondary leading-relaxed">
                          {preset.description}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </details>

              {/* Primary Color Picker */}
              <div className="space-y-3 p-4 bg-host-sunken border border-host-border rounded-xl">
                <span className="font-semibold text-host-primary block">{t('theme.brandColors')}</span>
                <div className="grid grid-cols-2 gap-2">
                  {COLOR_SCHEMES.map(scheme => (
                    <button key={scheme.id} type="button" onClick={() => {
                      setDesignSystem({ ...designSystem, tokens: applyBrandColor(designSystem.tokens, scheme.seed, true) });
                    }} title={scheme.description} className="flex items-center gap-2 rounded-lg border border-host-border bg-host-elevated p-2 text-xs text-host-primary hover:bg-host-dialog">
                      <span className="h-4 w-4 rounded-full" style={{ background: scheme.seed }} />{scheme.name}
                    </button>
                  ))}
                </div>
                <label className="flex items-center gap-2 text-xs text-host-secondary">
                  <input type="checkbox" checked={harmonizeSurfaces} onChange={e => setHarmonizeSurfaces(e.target.checked)} />
                  {t('theme.harmonizeSurfacesLabel')}
                </label>
                <div className="flex items-center gap-4">
                  <input
                    type="color"
                    aria-label={t('theme.customBrandColorAria')}
                    value={designSystem.tokens.colors.primary['500'] || '#2563eb'}
                    onChange={(e) => handlePrimaryColorChange(e.target.value)}
                    className="w-10 h-10 rounded-lg cursor-pointer bg-transparent border-0"
                  />
                  <div className="col">
                    <span className="font-mono text-host-primary">
                      {designSystem.tokens.colors.primary['500'] || '#2563eb'}
                    </span>
                    <span className="text-[11px] text-host-tertiary">
                      {harmonizeSurfaces ? t('theme.harmonizeSurfacesHintOn') : t('theme.harmonizeSurfacesHintOff')}
                    </span>
                  </div>
                </div>
                <p className="text-[11px] leading-relaxed text-host-secondary">{t('theme.colorUsageGuide')}</p>
              </div>

              <ThemeBackgroundEditor/>
              <ColorRoleEditor tokens={designSystem.tokens} mode={settings.colorMode}
                onChange={tokens => setDesignSystem({ ...designSystem, tokens })} />

              {/* 风格性格参数 (T-AE-24) */}
              <div className="space-y-3 p-4 bg-host-sunken border border-host-border rounded-xl">
                <span className="font-semibold text-host-primary block">{t('theme.personality')}</span>

                <div className="space-y-1.5">
                  <span className="text-[11px] text-host-tertiary">{t('theme.radiusScale')}</span>
                  <div className="grid grid-cols-4 gap-2">
                    {RADIUS_PRESETS.map((r) => (
                      <button
                        key={r.labelKey}
                        onClick={() => patchTokens((tokens) => ({ ...tokens, radius: r.value }))}
                        className={`py-1.5 rounded-lg border text-[11px] transition ${
                          designSystem.tokens.radius.md === r.value.md
                            ? 'border-host-accent/50 bg-host-accent-subtle text-host-brand'
                            : 'border-host-border text-host-secondary hover:border-host-border-strong'
                        }`}
                      >
                        {t(r.labelKey)}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <span className="text-[11px] text-host-tertiary">{t('theme.density')}</span>
                  <div className="grid grid-cols-3 gap-2">
                    {(['compact', 'standard', 'relaxed'] as const).map((d) => (
                      <button
                        key={d}
                        onClick={() => patchTokens((tokens) => ({ ...tokens, personality: { ...tokens.personality, density: d } }))}
                        className={`py-1.5 rounded-lg border text-[11px] transition ${
                          designSystem.tokens.personality.density === d
                            ? 'border-host-accent/50 bg-host-accent-subtle text-host-brand'
                            : 'border-host-border text-host-secondary hover:border-host-border-strong'
                        }`}
                      >
                        {d === 'compact' ? t('theme.densityCompact') : d === 'standard' ? t('theme.densityStandard') : t('theme.densityRelaxed')}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-host-tertiary">{t('theme.borderAlpha')}</span>
                    <span className="font-mono text-[11px] text-host-primary">
                      {designSystem.tokens.personality.borderAlpha.toFixed(2)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.2}
                    max={1}
                    step={0.05}
                    value={designSystem.tokens.personality.borderAlpha}
                    onChange={(e) =>
                      patchTokens((tokens) => ({
                        ...tokens,
                        personality: { ...tokens.personality, borderAlpha: Number(e.target.value) }
                      }))
                    }
                    className="w-full accent-host-accent"
                  />
                  <span className="text-[10px] text-host-tertiary">
                    {t('theme.borderAlphaEffectHint')}
                  </span>
                </div>

                {/* Collapsible Card for Active DESIGN.md (T-OD-18 / UI/UX-3) */}
                <div className="pt-3 border-t border-host-border">
                  <div className="bg-host-sunken border border-host-border rounded-xl overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setShowProseCard(!showProseCard)}
                      className="w-full p-3 flex items-center justify-between text-left hover:bg-host-elevated transition cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-host-brand" />
                        <span className="text-xs font-semibold text-host-primary">
                          {t('theme.activeProseTitle')}
                        </span>
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                            activeProse.source === 'project_override'
                              ? 'bg-purple-900/60 text-purple-300 border border-purple-700/50'
                              : 'bg-host-elevated text-host-secondary border border-host-border'
                          }`}
                        >
                          {activeProse.source === 'project_override' ? t('theme.proseProjectOverride') : t('theme.proseBuiltinPreset')}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-host-tertiary text-xs">
                        <span>{showProseCard ? t('theme.proseCollapse') : t('theme.proseExpand')}</span>
                        <ChevronDown
                          className={`w-3.5 h-3.5 transition-transform ${showProseCard ? 'rotate-180' : ''}`}
                        />
                      </div>
                    </button>

                    {showProseCard && (
                      <div className="p-3 border-t border-host-border bg-host-chrome space-y-2">
                        <div className="flex items-center justify-between text-[11px] text-host-secondary">
                          <span>{t('theme.proseNameLabel')} <strong className="text-host-primary">{activeProse.title}</strong></span>
                          <span className="font-mono text-[10px] text-host-tertiary">{activeProse.presetId}</span>
                        </div>
                        <pre className="p-2.5 bg-host-sunken rounded-lg border border-host-border font-mono text-[11px] text-host-primary leading-relaxed overflow-x-auto max-h-60 overflow-y-auto whitespace-pre-wrap">
                          {activeProse.rulesMarkdown}
                        </pre>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              </fieldset>
            </>
          )}

          {/* Tab 2: Decisions & Rules (D20 / §3.2.8) */}
          {activeTab === 'decisions' && (
            <div className="space-y-4">
              <div className="space-y-1">
                <span className="font-semibold text-host-primary block text-sm">{t('theme.decisionsTitle')}</span>
                <p className="text-host-secondary text-[11px] leading-relaxed">
                  {t('theme.decisionsDescription')}
                </p>
              </div>

              {/* Add manual decision */}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newRuleInput}
                  onChange={(e) => setNewRuleInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddManualRule();
                  }}
                  placeholder={t('theme.decisionPlaceholder')}
                  className="flex-1 bg-host-sunken border border-host-border rounded-xl px-3 py-2 text-host-primary text-xs focus:outline-none focus:border-host-accent"
                />
                <button
                  onClick={handleAddManualRule}
                  disabled={!newRuleInput.trim()}
                  className="px-4 py-2 bg-host-accent hover:bg-host-accent-hover disabled:opacity-40 text-host-on-accent font-medium rounded-xl text-xs transition"
                >
                  <Plus className="w-4 h-4 inline mr-1" />
                  <span>{t('theme.addDecision')}</span>
                </button>
              </div>

              {/* Decision List */}
              <div className="space-y-2">
                {Object.values(decisions).length === 0 ? (
                  <div className="p-6 text-center text-host-tertiary bg-host-sunken border border-host-border rounded-xl">
                    {t('theme.editorDecisionsEmpty')}
                  </div>
                ) : (
                  Object.values(decisions).map((dec) => (
                    <div
                      key={dec.id}
                      className="p-3 bg-host-sunken border border-host-border rounded-xl flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={dec.active}
                          onChange={() => toggleDecision(dec.id)}
                          className="rounded text-host-brand focus:ring-0 cursor-pointer"
                        />
                        <span className={`text-host-primary ${!dec.active ? 'line-through text-host-tertiary' : ''}`}>
                          {dec.text}
                        </span>
                      </div>
                      <span className="text-[10px] text-host-tertiary font-mono">
                        {dec.source.kind === 'auto_extracted' ? t('theme.decisionAutoSource') : t('theme.decisionManualSource')}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Tab 3: Base CSS (PRD D15 / §2.3.1 / §3.5.6) */}
          {activeTab === 'base_css' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-semibold text-host-primary block text-sm">{t('theme.baseCssTitle')}</span>
                  <p className="text-host-secondary text-[11px] leading-relaxed">
                    {t('theme.baseCssDesc')}
                  </p>
                </div>
              </div>

              {/* Search filter */}
              <div className="relative flex items-center">
                <Search className="w-3.5 h-3.5 text-host-tertiary absolute left-3" />
                <input
                  type="text"
                  placeholder={t('theme.searchCssPlaceholder')}
                  value={baseCssFilter}
                  onChange={(e) => setBaseCssFilter(e.target.value)}
                  className="w-full bg-host-sunken border border-host-border rounded-xl pl-8 pr-3 py-1.5 text-host-primary text-xs focus:outline-none focus:border-host-accent"
                />
              </div>

              {/* Code Preview */}
              <pre className="p-4 bg-host-sunken border border-host-border rounded-xl text-[11px] font-mono text-host-primary leading-relaxed max-h-52 overflow-auto select-text">
                {rawBaseCss
                  .split('\n')
                  .filter((line: string) => !baseCssFilter || line.toLowerCase().includes(baseCssFilter.toLowerCase()))
                  .join('\n')}
              </pre>

              {/* AI Evolution Input Box (PRD §3.5.6) */}
              <div className="p-3 bg-host-sunken border border-host-border rounded-xl space-y-2">
                <div className="flex items-center gap-1.5 text-host-brand font-semibold text-xs">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{t('theme.aiEvolveTitle')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder={t('theme.aiEvolvePlaceholder')}
                    value={aiEvolveInput}
                    onChange={(e) => setAiEvolveInput(e.target.value)}
                    className="flex-1 bg-host-elevated border border-host-border rounded-lg px-3 py-1.5 text-host-primary text-xs focus:outline-none focus:border-host-accent"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && aiEvolveInput.trim()) {
                        setEvolveResult(t('theme.aiEvolveCreated', { text: aiEvolveInput.trim() }));
                        setAiEvolveInput('');
                      }
                    }}
                  />
                  <button
                    onClick={() => {
                      if (!aiEvolveInput.trim()) return;
                      setEvolveResult(t('theme.aiEvolveCreated', { text: aiEvolveInput.trim() }));
                      setAiEvolveInput('');
                    }}
                    className="px-3 py-1.5 bg-host-accent hover:bg-host-accent-hover text-host-on-accent rounded-lg text-xs font-medium transition"
                  >
                    {t('theme.aiEvolveBtn')}
                  </button>
                </div>
                {evolveResult && (
                  <div className="text-[11px] text-host-success bg-host-accent-subtle border border-host-accent/40 p-2 rounded-lg">
                    ✓ {evolveResult}
                  </div>
                )}
              </div>
            </div>
          )}
          </div>

          {/* Right Panel: OpenDesign-style Realtime Visual Preview */}
          <div className="hidden lg:flex lg:col-span-7 min-h-0 overflow-hidden flex-col bg-host-sunken">
            <DesignSystemVisualPreview device={settings.deviceProfile}
              theme={designSystem}
              colorMode={settings.colorMode}
              onColorModeChange={setColorMode}
              className="h-full border-0 rounded-none bg-transparent"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-host-border bg-host-sunken flex justify-between items-center">
          <div className="text-[11px] text-host-tertiary">
            {t('theme.footerLiveSyncHint')}
          </div>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-host-accent hover:bg-host-accent-hover text-host-on-accent font-medium rounded-xl text-xs transition shadow"
          >
            {t('common.done')}
          </button>
        </div>
      </div>
    </div>
  );
};
