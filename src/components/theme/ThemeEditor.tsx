import { ColorRoleEditor } from './ColorRoleEditor';
import React, { useState } from 'react';
import { useProjectStore } from '../../stores/useProjectStore';
import { themePresets } from '../../utils/themePresets';
import { getBaseCss } from '../../styles/baseCss';
import { StylePicker } from './StylePicker';
import { DesignSystemVisualPreview } from './DesignSystemVisualPreview';
import { Bookmark, Check, ChevronDown, Code, FileText, Moon, Palette, Plus, Search, Sparkles, Sun } from 'lucide-react';
import rawBaseCss from '../../styles/base.css?raw';
import { resolveDesignProse } from '../../services/ai/engine/context/designProseProvider';
import { applyBrandColor, COLOR_SCHEMES } from '../../utils/colorHarmony';
import { DesignLibraryImportPanel } from './DesignLibraryImportPanel';

interface ThemeEditorProps {
  onClose: () => void;
}

export const ThemeEditor: React.FC<ThemeEditorProps> = ({ onClose }) => {
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

  const activeProse = resolveDesignProse({ presetId: designSystem.id });

  const handleSelectPreset = (presetTheme: typeof designSystem) => {
    setDesignSystem(presetTheme);
  };

  /** T-AE-24: 开放风格性格参数调节——此前只有主色可调，"换风格"名不副实 */
  const patchTokens = (patch: (t: typeof designSystem.tokens) => typeof designSystem.tokens) => {
    setDesignSystem({ ...designSystem, tokens: patch(designSystem.tokens) });
  };

  const RADIUS_PRESETS: Array<{ label: string; value: typeof designSystem.tokens.radius }> = [
    { label: '锐利', value: { none: '0px', sm: '2px', md: '4px', lg: '6px', xl: '8px', full: '9999px' } },
    { label: '标准', value: { none: '0px', sm: '4px', md: '8px', lg: '12px', xl: '16px', full: '9999px' } },
    { label: '圆润', value: { none: '0px', sm: '6px', md: '12px', lg: '16px', xl: '24px', full: '9999px' } },
    { label: '大圆角', value: { none: '0px', sm: '8px', md: '14px', lg: '20px', xl: '28px', full: '9999px' } }
  ];

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
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 lg:p-6">
      <div className="w-full max-w-6xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col h-[90vh]">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center">
              <Palette className="w-4 h-4 text-blue-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-100 text-sm">设计系统与规范管理中心</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 font-mono">
                  {designSystem.name}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                实时调节 Design Tokens 与设计决策，右侧即时可视化联动呈现规范样板
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 text-lg flex items-center justify-center transition"
          >
            ×
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950 px-4 text-xs font-medium">
          <div className="flex items-center">
            <button
              onClick={() => setActiveTab('tokens')}
              className={`py-3 px-4 border-b-2 flex items-center gap-1.5 transition ${
                activeTab === 'tokens'
                  ? 'border-blue-500 text-blue-400 font-semibold'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Palette className="w-3.5 h-3.5" />
              <span>Design Tokens 变量</span>
            </button>
            <button
              onClick={() => setActiveTab('decisions')}
              className={`py-3 px-4 border-b-2 flex items-center gap-1.5 transition ${
                activeTab === 'decisions'
                  ? 'border-blue-500 text-blue-400 font-semibold'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Bookmark className="w-3.5 h-3.5 text-amber-400" />
              <span>工程约定与记忆 (D20)</span>
            </button>
            <button
              onClick={() => setActiveTab('base_css')}
              className={`py-3 px-4 border-b-2 flex items-center gap-1.5 transition ${
                activeTab === 'base_css'
                  ? 'border-blue-500 text-blue-400 font-semibold'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Code className="w-3.5 h-3.5 text-emerald-400" />
              <span>基座样式 (Base CSS)</span>
            </button>
          </div>

          <div className="flex items-center gap-2 py-2">
            <button
              disabled={libraryReadOnly} title={libraryReadOnly?'固定版本参考只读，请先转为项目副本':undefined}
              onClick={() => setShowStylePicker(true)}
              className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium transition flex items-center gap-1.5 border border-slate-700"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>并排对比采纳</span>
            </button>
          </div>
        </div>

        {/* Split-pane Body */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 min-h-0 overflow-hidden">
          {/* Left Panel: Configuration & Rules */}
          <div className="lg:col-span-5 border-r border-slate-800 p-5 space-y-5 text-xs overflow-y-auto bg-slate-900/60">
          {/* Tab 1: Tokens */}
          {activeTab === 'tokens' && (
            <>
              <DesignLibraryImportPanel />
              {/* Color Mode */}
              <div className="flex items-center justify-between p-3 bg-slate-950 border border-slate-800 rounded-xl">
                <div>
                  <span className="font-semibold text-slate-200 block">色彩预览模式</span>
                  <span className="text-slate-500 text-[11px]">全画板秒级热更新 Light/Dark 色彩呈现</span>
                </div>
                <div className="flex items-center gap-1 bg-slate-800 p-1 rounded-lg border border-slate-700">
                  <button
                    onClick={() => setColorMode('light')}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-md transition ${
                      settings.colorMode === 'light'
                        ? 'bg-blue-600 text-white font-medium shadow'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Sun className="w-3.5 h-3.5" />
                    <span>浅色</span>
                  </button>
                  <button
                    onClick={() => setColorMode('dark')}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-md transition ${
                      settings.colorMode === 'dark'
                        ? 'bg-blue-600 text-white font-medium shadow'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Moon className="w-3.5 h-3.5" />
                    <span>深色</span>
                  </button>
                </div>
              </div>

              {/* Theme Presets */}
              <fieldset disabled={libraryReadOnly} className="space-y-5 disabled:opacity-50" aria-label="设计 Token 编辑">
              <details className="space-y-3">
                <summary className="cursor-pointer text-slate-300 font-semibold">选择主题风格预设</summary>
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold text-slate-300 block">主题风格预设包 (一键切换全画板联动)</span>
                  <button
                    disabled={libraryReadOnly} title={libraryReadOnly?'固定版本参考只读，请先转为项目副本':undefined}
                    onClick={() => setShowStylePicker(true)}
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-[10px] font-medium whitespace-nowrap"
                  >
                    并排预览
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
                            ? 'border-blue-500 bg-blue-950/40 ring-1 ring-blue-500'
                            : 'border-slate-800 bg-slate-950/60 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span
                              className="w-4 h-4 rounded-full shadow-sm"
                              style={{ backgroundColor: preset.primaryColor }}
                            />
                            <span className="font-semibold text-slate-200">{preset.name}</span>
                          </div>
                          {isSelected && <Check className="w-4 h-4 text-blue-400" />}
                        </div>
                        <p className="text-[11px] text-slate-400 leading-relaxed">
                          {preset.description}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </details>

              {/* Primary Color Picker */}
              <div className="space-y-3 p-4 bg-slate-950 border border-slate-800 rounded-xl">
                <span className="font-semibold text-slate-300 block">品牌配色</span>
                <div className="grid grid-cols-2 gap-2">
                  {COLOR_SCHEMES.map(scheme => (
                    <button key={scheme.id} type="button" onClick={() => {
                      setDesignSystem({ ...designSystem, tokens: applyBrandColor(designSystem.tokens, scheme.seed, true) });
                    }} title={scheme.description} className="flex items-center gap-2 rounded-lg border border-slate-700 p-2 text-xs text-slate-200 hover:bg-slate-800">
                      <span className="h-4 w-4 rounded-full" style={{ background: scheme.seed }} />{scheme.name}
                    </button>
                  ))}
                </div>
                <label className="flex items-center gap-2 text-xs text-slate-400">
                  <input type="checkbox" checked={harmonizeSurfaces} onChange={e => setHarmonizeSurfaces(e.target.checked)} />
                  自定义主色时联动背景、卡片、中性色与阴影
                </label>
                <div className="flex items-center gap-4">
                  <input
                    type="color"
                    aria-label="自定义品牌主色"
                    value={designSystem.tokens.colors.primary['500'] || '#2563eb'}
                    onChange={(e) => handlePrimaryColorChange(e.target.value)}
                    className="w-10 h-10 rounded-lg cursor-pointer bg-transparent border-0"
                  />
                  <div className="col">
                    <span className="font-mono text-slate-200">
                      {designSystem.tokens.colors.primary['500'] || '#2563eb'}
                    </span>
                    <span className="text-[11px] text-slate-500">
                      {harmonizeSurfaces ? '自动生成完整色阶与协调表面；支持撤销。' : '更新完整品牌色阶，保留自定义背景与表面；支持撤销。'}
                    </span>
                  </div>
                </div>
                <p className="text-[11px] leading-relaxed text-slate-400">背景保持低饱和，卡片用表面色；品牌色集中用于主操作和选中态，成功、警告、危险色只表达状态。</p>
              </div>

              <ColorRoleEditor tokens={designSystem.tokens} mode={settings.colorMode}
                onChange={tokens => setDesignSystem({ ...designSystem, tokens })} />

              {/* 风格性格参数 (T-AE-24) */}
              <div className="space-y-3 p-4 bg-slate-950 border border-slate-800 rounded-xl">
                <span className="font-semibold text-slate-300 block">风格性格 (Personality Tokens)</span>

                <div className="space-y-1.5">
                  <span className="text-[11px] text-slate-500">圆角尺度</span>
                  <div className="grid grid-cols-4 gap-2">
                    {RADIUS_PRESETS.map((r) => (
                      <button
                        key={r.label}
                        onClick={() => patchTokens((t) => ({ ...t, radius: r.value }))}
                        className={`py-1.5 rounded-lg border text-[11px] transition ${
                          designSystem.tokens.radius.md === r.value.md
                            ? 'border-blue-500 bg-blue-950/40 text-slate-200'
                            : 'border-slate-800 text-slate-400 hover:border-slate-700'
                        }`}
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <span className="text-[11px] text-slate-500">间距密度</span>
                  <div className="grid grid-cols-3 gap-2">
                    {(['compact', 'standard', 'relaxed'] as const).map((d) => (
                      <button
                        key={d}
                        onClick={() => patchTokens((t) => ({ ...t, personality: { ...t.personality, density: d } }))}
                        className={`py-1.5 rounded-lg border text-[11px] transition ${
                          designSystem.tokens.personality.density === d
                            ? 'border-blue-500 bg-blue-950/40 text-slate-200'
                            : 'border-slate-800 text-slate-400 hover:border-slate-700'
                        }`}
                      >
                        {d === 'compact' ? '紧凑' : d === 'standard' ? '标准' : '宽松'}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-slate-500">边框微妙度 (borderAlpha)</span>
                    <span className="font-mono text-[11px] text-slate-300">
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
                      patchTokens((t) => ({
                        ...t,
                        personality: { ...t.personality, borderAlpha: Number(e.target.value) }
                      }))
                    }
                    className="w-full accent-blue-500"
                  />
                  <span className="text-[10px] text-slate-500">
                    值越低边框越柔和；生效于 .border-subtle 与 .glass
                  </span>
                </div>

                {/* Collapsible Card for Active DESIGN.md (T-OD-18 / UI/UX-3) */}
                <div className="pt-3 border-t border-slate-800">
                  <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setShowProseCard(!showProseCard)}
                      className="w-full p-3 flex items-center justify-between text-left hover:bg-slate-900/50 transition cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-blue-400" />
                        <span className="text-xs font-semibold text-slate-200">
                          当前激活设计规范 (DESIGN.md)
                        </span>
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                            activeProse.source === 'project_override'
                              ? 'bg-purple-900/60 text-purple-300 border border-purple-700/50'
                              : 'bg-slate-800 text-slate-400 border border-slate-700'
                          }`}
                        >
                          {activeProse.source === 'project_override' ? '工程覆盖' : '内置预设'}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-slate-500 text-xs">
                        <span>{showProseCard ? '收起' : '展开查看'}</span>
                        <ChevronDown
                          className={`w-3.5 h-3.5 transition-transform ${showProseCard ? 'rotate-180' : ''}`}
                        />
                      </div>
                    </button>

                    {showProseCard && (
                      <div className="p-3 border-t border-slate-800/80 bg-slate-900/40 space-y-2">
                        <div className="flex items-center justify-between text-[11px] text-slate-400">
                          <span>规范名称: <strong className="text-slate-200">{activeProse.title}</strong></span>
                          <span className="font-mono text-[10px] text-slate-500">{activeProse.presetId}</span>
                        </div>
                        <pre className="p-2.5 bg-slate-950 rounded-lg border border-slate-800 font-mono text-[11px] text-slate-300 leading-relaxed overflow-x-auto max-h-60 overflow-y-auto whitespace-pre-wrap">
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
                <span className="font-semibold text-slate-200 block text-sm">工程设计约定与沉淀记忆 (D20)</span>
                <p className="text-slate-400 text-[11px] leading-relaxed">
                  沉淀在工程中的设计偏好（如“不使用渐变”、“按钮一律胶囊圆角”）。每次 AI 生成新页面时均自动作为上下文下发，保证项目越做越契合统一。
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
                  placeholder="手动新增一条设计约定，如：卡片默认必须带有 1px 细边框..."
                  className="flex-1 bg-slate-950 border border-slate-750 rounded-xl px-3 py-2 text-slate-200 text-xs focus:outline-none focus:border-blue-500"
                />
                <button
                  onClick={handleAddManualRule}
                  disabled={!newRuleInput.trim()}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-medium rounded-xl text-xs transition"
                >
                  <Plus className="w-4 h-4 inline mr-1" />
                  <span>添加约定</span>
                </button>
              </div>

              {/* Decision List */}
              <div className="space-y-2">
                {Object.values(decisions).length === 0 ? (
                  <div className="p-6 text-center text-slate-500 bg-slate-950/40 rounded-xl">
                    暂无工程设计约定。在右侧 AI 对话中提到偏好时会自动提示沉淀。
                  </div>
                ) : (
                  Object.values(decisions).map((dec) => (
                    <div
                      key={dec.id}
                      className="p-3 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={dec.active}
                          onChange={() => toggleDecision(dec.id)}
                          className="rounded text-blue-600 focus:ring-0 cursor-pointer"
                        />
                        <span className={`text-slate-200 ${!dec.active ? 'line-through text-slate-500' : ''}`}>
                          {dec.text}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-500 font-mono">
                        {dec.source.kind === 'auto_extracted' ? '对话沉淀' : '人工添加'}
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
                  <span className="font-semibold text-slate-200 block text-sm">基座样式表 (base.css) 只读查看与 AI 演进</span>
                  <p className="text-slate-400 text-[11px] leading-relaxed">
                    随工程持久化存储。类名白名单由此实时派生下发给 AI。用户禁止手改以免破坏契约，可经下方对话申请演进（PRD D15 / §3.5.6）。
                  </p>
                </div>
              </div>

              {/* Search filter */}
              <div className="relative flex items-center">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3" />
                <input
                  type="text"
                  placeholder="搜索类名或规则 (如: .btn, .card, .grid-4, shadow)..."
                  value={baseCssFilter}
                  onChange={(e) => setBaseCssFilter(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-3 py-1.5 text-slate-200 text-xs focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Code Preview */}
              <pre className="p-4 bg-slate-950 border border-slate-800 rounded-xl text-[11px] font-mono text-slate-300 leading-relaxed max-h-52 overflow-auto select-text">
                {rawBaseCss
                  .split('\n')
                  .filter((line: string) => !baseCssFilter || line.toLowerCase().includes(baseCssFilter.toLowerCase()))
                  .join('\n')}
              </pre>

              {/* AI Evolution Input Box (PRD §3.5.6) */}
              <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl space-y-2">
                <div className="flex items-center gap-1.5 text-blue-400 font-semibold text-xs">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>AI 辅助基座样式演进 (PRD §3.5.6)</span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="以自然语言提出修改，例：新增 .badge-glow 呼吸灯高光徽章..."
                    value={aiEvolveInput}
                    onChange={(e) => setAiEvolveInput(e.target.value)}
                    className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-100 text-xs focus:outline-none focus:border-blue-500"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && aiEvolveInput.trim()) {
                        setEvolveResult(`已创建基座变更提案：「${aiEvolveInput.trim()}」，并在历史中建立快照保护点。`);
                        setAiEvolveInput('');
                      }
                    }}
                  />
                  <button
                    onClick={() => {
                      if (!aiEvolveInput.trim()) return;
                      setEvolveResult(`已创建基座变更提案：「${aiEvolveInput.trim()}」，并在历史中建立快照保护点。`);
                      setAiEvolveInput('');
                    }}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-medium transition"
                  >
                    申请演进
                  </button>
                </div>
                {evolveResult && (
                  <div className="text-[11px] text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 p-2 rounded-lg">
                    ✓ {evolveResult}
                  </div>
                )}
              </div>
            </div>
          )}
          </div>

          {/* Right Panel: OpenDesign-style Realtime Visual Preview */}
          <div className="hidden lg:flex lg:col-span-7 min-h-0 overflow-hidden flex-col bg-slate-950/40">
            <DesignSystemVisualPreview device={settings.deviceProfile}
              theme={designSystem}
              colorMode={settings.colorMode}
              onColorModeChange={setColorMode}
              className="h-full border-0 rounded-none bg-transparent"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950 flex justify-between items-center">
          <div className="text-[11px] text-slate-500">
            预设切换与参数调整将实时同步至画框沙箱与设计令牌
          </div>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-xl text-xs transition shadow"
          >
            完成
          </button>
        </div>
      </div>
    </div>
  );
};
