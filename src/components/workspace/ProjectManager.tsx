import { ReferenceDeviceOption } from '../theme/ReferenceDeviceOption';
import { defaultReferenceDevice, REFERENCE_DEVICES } from '../../utils/referenceDevice';
import React, { useEffect, useMemo, useState } from 'react';
import { BrandMark } from '../common/BrandMark';
import { LanguageMenu } from '../common/LanguageMenu';
import { useWorkspaceStore } from '../../stores/useWorkspaceStore';
import { themePresets } from '../../utils/themePresets';
import {
  DEFAULT_STYLE_DNA,
  SHAPE_OPTIONS,
  type Domain,
  type Shape,
} from '../../utils/styleDna';
import { localizedPresetLabel } from '../../utils/themePresetLabels';
import { ProjectMeta } from '../../utils/projectRegistry';
import { folderDisplayName, isDesktopRuntime, pickProjectFolder } from '../../services/storage/folderPicker';
import { DesignSystemVisualPreview } from '../theme/DesignSystemVisualPreview';
import { useProjectStore } from '../../stores/useProjectStore';
import { CustomDesignSystemBuilder } from './CustomDesignSystemBuilder';
import { DEFAULT_CUSTOM_DESIGN_SYSTEM, generateCustomDesignSystems } from '../../utils/customDesignSystem';
import type { DesignSystem } from '../../types/designSystem';
import { t as tStatic } from '../../i18n';
import { getUiLocale, useT } from '../../stores/useLocaleStore';
import {
  AlertTriangle,
  Check,
  FolderOpen,
  Laptop,
  MoreHorizontal,
  Plus,
  HardDriveDownload,
  Search,
  Smartphone,
  Sparkles,
  Trash2,
  X
} from 'lucide-react';

/** 
 * 工程卡片封面呈现 (BR-01 / T-PCI-04):
 * 1. 显式指定封面: 高保真渲染 coverImage 图片；
 * 2. 未指定且有页面: 取第一个画框上部核心视口渲染为部分截图封面；
 * 3. 无页面或空白: 使用优雅微质感与工程名字作为封面展示。
 */
const ProjectThumbnail: React.FC<{ meta: ProjectMeta }> = ({ meta }) => {
  const t = useT();
  const isMobile = meta.deviceProfile === 'mobile' || (meta.frameWidth && meta.frameWidth <= 500);

  const srcDoc = useMemo(() => {
    if (!meta.previewHtml) return null;
    // Imported thumbnails already include their original document, styles and CSP.
    if (/^\s*(?:<!doctype\s+html\b|<html\b)/i.test(meta.previewHtml)) return meta.previewHtml;
    return `<!doctype html><html><head><meta charset="utf-8">
<style>${meta.previewCss || ''}
  html,body{margin:0;padding:0;background:var(--color-bg,#fff);overflow:hidden;}
</style></head><body>${meta.previewHtml}</body></html>`;
  }, [meta.previewHtml, meta.previewCss]);

  // 1. 优先展示显式设置的工程封面 (保持等比完整呈现，杜绝局部畸变放大)
  if (meta.coverImage) {
    return (
      <div className="w-full h-full relative overflow-hidden bg-host-sunken flex items-center justify-center" data-testid="project-custom-cover">
        <img
          src={meta.coverImage}
          alt={t('workspace.coverAlt', { name: meta.name })}
          className="w-full h-full object-contain select-none pointer-events-none transition-transform duration-300 group-hover:scale-105"
        />
        <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded bg-host-dialog/85 backdrop-blur-sm border border-host-border text-[10px] text-host-brand font-medium flex items-center gap-1 shadow select-none pointer-events-none z-10">
          <Sparkles className="w-2.5 h-2.5" />
          <span>{t('workspace.customCover')}</span>
        </div>
      </div>
    );
  }

  // 2. 未指定封面但有页面时：自适应设备档位呈现完整微缩视图
  if (srcDoc && (meta.screenCount > 0 || meta.previewHtml)) {
    if (isMobile) {
      // 移动端：居中呈现精美手机壳体微缩视图，全屏排版一览无余，杜绝局部盲目放大
      const phoneH = 132;
      const phoneScale = phoneH / (meta.referenceViewportHeight ?? 760); // ~0.1737
      const phoneW = Math.round(meta.frameWidth * phoneScale); // ~68px
      return (
        <div className="w-full h-full relative overflow-hidden bg-host-sunken flex items-center justify-center" data-testid="project-screen-cover">
          <div className="absolute w-32 h-32 bg-host-accent-subtle rounded-full blur-xl pointer-events-none" />
          <div
            className="relative rounded-[12px] border border-host-border-strong shadow-2xl bg-black overflow-hidden pointer-events-none flex-shrink-0"
            style={{ width: `${phoneW}px`, height: `${phoneH}px` }}
          >
            <iframe
              title={t('workspace.previewTitle', { name: meta.name })}
              sandbox="allow-same-origin"
              srcDoc={srcDoc}
              tabIndex={-1}
              aria-hidden
              className="border-0 pointer-events-none origin-top-left"
              style={{
                width: `${meta.frameWidth}px`,
                height: `${meta.referenceViewportHeight ?? 760}px`,
                transform: `scale(${phoneScale})`
              }}
            />
          </div>
        </div>
      );
    }

    // PC 桌面端：等比微缩呈现完整横向首屏布局
    const pcScale = 0.25;
    return (
      <div className="w-full h-full relative overflow-hidden bg-host-sunken flex items-start justify-center" data-testid="project-screen-cover">
        <iframe
          title={t('workspace.previewTitle', { name: meta.name })}
          sandbox="allow-same-origin"
          srcDoc={srcDoc}
          tabIndex={-1}
          aria-hidden
          className="border-0 pointer-events-none origin-top"
          style={{
            width: `${meta.frameWidth}px`,
            height: `${meta.referenceViewportHeight ?? 600}px`,
            transform: `scale(${pcScale})`
          }}
        />
      </div>
    );
  }

  // 3. 无页面时：使用空白微质感结合工程名字作为封面 (优雅降级，告别简陋的单行暂无预览)
  return (
    <div
      className="w-full h-full flex flex-col items-center justify-center p-4 bg-host-sunken border-b border-host-border select-none relative overflow-hidden group-hover:bg-host-chrome transition-colors"
      data-testid="project-name-cover"
    >
      {/* 水印与背景微质感 */}
      <div className="absolute -right-2 -bottom-4 text-7xl font-black text-host-tertiary/20 select-none pointer-events-none font-mono">
        {(meta.name || 'P').slice(0, 2).toUpperCase()}
      </div>
      <div className="w-9 h-9 rounded-xl bg-host-elevated border border-host-border shadow-inner flex items-center justify-center text-host-secondary mb-2 z-10 group-hover:border-host-accent/40 group-hover:text-host-brand transition">
        {meta.deviceProfile === 'pc' ? (
          <Laptop className="w-4 h-4" />
        ) : (
          <Smartphone className="w-4 h-4" />
        )}
      </div>
      <div className="text-xs font-bold text-host-primary text-center max-w-[200px] truncate z-10 tracking-tight" title={meta.name}>
        {meta.name}
      </div>
      <div className="text-[10px] text-host-tertiary mt-1 z-10 flex items-center gap-1">
        <span>{meta.deviceProfile === 'pc' ? t('workspace.devicePc1440') : t('workspace.deviceMobile390')}</span>
        <span>·</span>
        <span>{t('workspace.blankBoard')}</span>
      </div>
    </div>
  );
};

const NewProjectDialog: React.FC<{ initialFolderPath?: string; onClose: () => void }> = ({
  initialFolderPath,
  onClose
}) => {
  const t = useT();
  const { createProject } = useWorkspaceStore();
  const isDesktop = isDesktopRuntime();
  const [name, setName] = useState(() => (initialFolderPath ? folderDisplayName(initialFolderPath) : tStatic('workspace.untitledProject', undefined, getUiLocale())));
  const [folderPath, setFolderPath] = useState<string | undefined>(initialFolderPath);
  const [device, setDevice] = useState<'pc' | 'mobile'>('pc');
  const [useCustomNavigation, setUseCustomNavigation] = useState(false);
  const [referenceDeviceId, setReferenceDeviceId] = useState('pc-standard');
  const referenceDevice = REFERENCE_DEVICES.find(item => item.id === referenceDeviceId && item.deviceProfile === device) ?? defaultReferenceDevice(device);
  const [selectedPresetId, setSelectedPresetId] = useState<string>('neutral-modern');
  const [searchPreset, setSearchPreset] = useState('');
  const [shape, setShape] = useState<Shape>('standard');
  const [domain, setDomain] = useState<Domain>('none');
  const [designSystemMode, setDesignSystemMode] = useState<'preset' | 'custom'>('preset');
  const [customTheme, setCustomTheme] = useState<DesignSystem | null>(() =>
    generateCustomDesignSystems(DEFAULT_CUSTOM_DESIGN_SYSTEM, 0, getUiLocale())[0].theme,
  );

  const filteredPresets = useMemo(() => {
    const q = searchPreset.trim().toLowerCase();
    if (!q) return themePresets;
    return themePresets.filter((p) => {
      const label = localizedPresetLabel(p.id) ?? { name: p.name, description: p.description };
      return (
        label.name.toLowerCase().includes(q) ||
        label.description.toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q)
      );
    });
  }, [searchPreset, t]);

  const activePreset = useMemo(() => {
    return themePresets.find((p) => p.id === selectedPresetId) || themePresets[0];
  }, [selectedPresetId]);

  const currentTheme = useMemo(() => {
    if (designSystemMode === 'custom') return customTheme;
    const base = activePreset.theme;
    if (shape === 'standard') return base;
    const r =
      shape === 'sharp'
        ? { none: '0px', sm: '2px', md: '4px', lg: '6px', xl: '8px', full: '9999px' }
        : { none: '0px', sm: '8px', md: '14px', lg: '20px', xl: '28px', full: '9999px' };
    return {
      ...base,
      tokens: {
        ...base.tokens,
        radius: r
      }
    };
  }, [activePreset, shape, designSystemMode, customTheme]);

  const handlePickFolder = async () => {
    const picked = await pickProjectFolder(t('workspace.pickFolderTitle'));
    if (picked) {
      setFolderPath(picked);
      if (name === t('workspace.untitledProject') || !name.trim()) {
        setName(folderDisplayName(picked));
      }
    }
  };

  const submit = () => {
    if (!currentTheme) return;
    const trimmed = name.trim() || (folderPath ? folderDisplayName(folderPath) : t('workspace.untitledProject'));
    const decisions: string[] = [];
    if (domain !== 'none') {
      const dMap: Record<string, string[]> = {
        saas: ['信息密度优先：列表与表格优先于大卡片', '关键操作使用主色实心按钮'],
        commerce: ['商品图为视觉主体，图片比例保持一致', '主行动按钮必须醒目突出'],
        finance: ['数字一律右对齐并使用等宽字体', '涨跌用语义色表达'],
        tool: ['优先使用紧凑间距，单屏承载核心操作项']
      };
      if (dMap[domain]) decisions.push(...dMap[domain]);
    }
    createProject(trimmed, device, currentTheme, decisions, folderPath, referenceDevice.id);
    if (device === 'mobile' && useCustomNavigation) useProjectStore.getState().setUseCustomNavigation(true);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-5xl h-[85vh] bg-host-dialog border border-host-border-strong rounded-xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-host-border shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-host-accent-subtle border border-host-accent/30 flex items-center justify-center text-host-brand">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-bold text-host-primary text-sm">{t('workspace.newDialogTitle')}</h2>
              <p className="text-[11px] text-host-secondary">{t('workspace.newDialogSubtitle')}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-host-secondary hover:text-host-primary p-1" aria-label={t('common.close')}>
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Two-column body */}
        <div className="flex-1 flex min-h-0 overflow-hidden">
          {/* Left Column: Settings & Presets */}
          <div className="w-[410px] border-r border-host-border flex flex-col p-5 space-y-4 overflow-y-auto shrink-0 bg-host-chrome">
            {/* 1. Name */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-host-secondary uppercase tracking-wider">{t('workspace.projectName')}</label>
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
                className="w-full bg-host-sunken border border-host-border rounded-lg px-3 py-2 text-host-primary text-xs focus:outline-none focus:border-host-accent"
              />
            </div>

            {/* 2. Device */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-semibold text-host-secondary uppercase tracking-wider">{t('workspace.deviceProfile')}</label>
                <span className="text-[10px] text-host-warning">{t('workspace.deviceImmutable')}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { key: 'pc', icon: Laptop, title: t('workspace.devicePc'), desc: '1440px' },
                  { key: 'mobile', icon: Smartphone, title: t('workspace.deviceMobile'), desc: '390px' }
                ] as const).map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => { setDevice(opt.key); setReferenceDeviceId(`${opt.key}-standard`); }}
                    className={`flex items-center gap-2 p-2.5 rounded-xl border transition text-left ${
                      device === opt.key
                        ? 'border-host-accent bg-host-accent-subtle text-host-brand'
                        : 'border-host-border bg-host-sunken hover:border-host-border-strong text-host-secondary'
                    }`}
                  >
                    <opt.icon className="w-4 h-4 shrink-0" />
                    <div>
                      <div className="text-xs font-semibold text-host-primary">{opt.title}</div>
                      <div className="text-[10px] opacity-70">{opt.desc}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <ReferenceDeviceOption settings={{ deviceProfile: device, frameWidth: device === 'mobile' ? 390 : 1440, viewportGuideHeight: device === 'mobile' ? 844 : 900, referenceDevice, useCustomNavigation, showViewportGuide: true, colorMode: 'light', lodBudget: 12 }} onChange={setReferenceDeviceId} />
            {device === 'mobile' && <label className="flex items-center gap-2 text-xs text-host-primary"><input type="checkbox" aria-label={t('workspace.customNav')} checked={useCustomNavigation} onChange={event => setUseCustomNavigation(event.target.checked)} />{t('workspace.customNav')}<span className="text-[10px] text-host-tertiary">{t('workspace.customNavHint')}</span></label>}
            {/* 3. Folder Path (Desktop) */}
            {isDesktop && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-semibold text-host-secondary uppercase tracking-wider">
                    {t('workspace.projectFolder')}
                  </label>
                  {folderPath && (
                    <button
                      type="button"
                      onClick={() => setFolderPath(undefined)}
                      className="text-[10px] text-host-tertiary hover:text-host-primary underline transition"
                    >
                      {t('workspace.useBuiltinStorage')}
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <div
                    className="flex-1 bg-host-sunken border border-host-border rounded-lg px-3 py-2 text-host-primary text-xs truncate flex items-center gap-2"
                    title={folderPath || t('workspace.folderUnspecified')}
                  >
                    <FolderOpen className="w-3.5 h-3.5 text-host-tertiary shrink-0" />
                    <span className={`truncate ${folderPath ? 'text-host-primary font-mono text-[11px]' : 'text-host-tertiary italic'}`}>
                      {folderPath ? folderPath : t('workspace.defaultBuiltinStorage')}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handlePickFolder}
                    className="px-3 py-2 bg-host-elevated hover:bg-host-sunken border border-host-border text-host-primary font-medium rounded-lg text-xs transition shrink-0"
                  >
                    {folderPath ? t('workspace.changeFolder') : t('workspace.chooseFolder')}
                  </button>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-host-sunken border border-host-border" role="group" aria-label={t('workspace.designSystemSource')}>
              {([{ value: 'preset' as const, label: t('workspace.presetSource') }, { value: 'custom' as const, label: t('workspace.customSource') }]).map(option => (
                <button key={option.value} type="button" aria-pressed={designSystemMode === option.value} onClick={() => setDesignSystemMode(option.value)} className={`py-2 rounded-lg text-xs transition ${designSystemMode === option.value ? 'bg-host-elevated text-host-primary font-semibold' : 'text-host-secondary hover:text-host-primary'}`}>{option.label}</button>
              ))}
            </div>
            <div hidden={designSystemMode !== 'custom'}>
              <CustomDesignSystemBuilder onChange={setCustomTheme} />
            </div>

            {/* 4. Design System Presets Selector (OpenDesign style) */}
            <div hidden={designSystemMode !== 'preset'} className="space-y-2 pt-1 border-t border-host-border">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-semibold text-host-secondary uppercase tracking-wider">
                  {t('workspace.designSystemPresets')}
                </label>
                <span className="text-[10px] text-host-tertiary">{t('workspace.livePreviewHint')}</span>
              </div>

              {/* Search Presets */}
              <div className="relative">
                <Search className="w-3 h-3 text-host-tertiary absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  value={searchPreset}
                  onChange={(e) => setSearchPreset(e.target.value)}
                  placeholder={t('workspace.searchPresets')}
                  className="w-full bg-host-sunken border border-host-border rounded-lg pl-7 pr-3 py-1.5 text-xs text-host-primary focus:outline-none focus:border-host-accent"
                />
              </div>

              {/* Presets List */}
              <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-0.5">
                {filteredPresets.map((preset) => {
                  const isSelected = preset.id === selectedPresetId;
                  const isDefault = preset.id === 'neutral-modern';
                  const label = localizedPresetLabel(preset.id) ?? {
                    name: preset.name,
                    description: preset.description,
                  };
                  return (
                    <div
                      key={preset.id}
                      onClick={() => setSelectedPresetId(preset.id)}
                      className={`p-2.5 rounded-xl border transition cursor-pointer flex items-start gap-2.5 ${
                        isSelected
                          ? 'border-host-accent bg-host-accent-subtle ring-1 ring-host-accent/50'
                          : 'border-host-border bg-host-sunken hover:border-host-border-strong'
                      }`}
                    >
                      <span
                        className="w-3.5 h-3.5 rounded-full border border-white/20 shrink-0 mt-0.5"
                        style={{ backgroundColor: preset.primaryColor }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-semibold text-host-primary text-xs truncate">{label.name}</span>
                          {isDefault && (
                            <span className="px-1.5 py-0.2 bg-host-accent-subtle text-host-brand text-[9px] rounded font-medium">
                              {t('workspace.defaultBadge')}
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-host-secondary truncate mt-0.5">{label.description}</p>
                      </div>
                      {isSelected && <Check className="w-3.5 h-3.5 text-host-brand shrink-0 mt-0.5" />}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 5. Radius Tuning */}
            <div hidden={designSystemMode !== 'preset'} className="space-y-1.5 pt-1 border-t border-host-border">
              <label className="text-[11px] font-semibold text-host-secondary uppercase tracking-wider">{t('workspace.radiusTune')}</label>
              <div className="grid grid-cols-3 gap-1.5">
                {SHAPE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    title={t(
                      opt.value === 'sharp'
                        ? 'workspace.shapeSharpHint'
                        : opt.value === 'round'
                          ? 'workspace.shapeRoundHint'
                          : 'workspace.shapeStandardHint',
                    )}
                    onClick={() => setShape(opt.value)}
                    className={`py-1.5 px-2 rounded-lg border text-center transition text-xs ${
                      shape === opt.value
                        ? 'border-host-accent bg-host-accent-subtle text-host-brand font-medium'
                        : 'border-host-border bg-host-sunken text-host-secondary hover:border-host-border-strong'
                    }`}
                  >
                    {t(
                      opt.value === 'sharp'
                        ? 'workspace.shapeSharp'
                        : opt.value === 'round'
                          ? 'workspace.shapeRound'
                          : 'workspace.shapeStandard',
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Right Column: Visual Preview */}
          <div className="flex-1 flex flex-col min-w-0 bg-host-sunken overflow-hidden">
            {currentTheme ? <DesignSystemVisualPreview theme={currentTheme} device={device} /> : <div className="flex-1 flex items-center justify-center p-8 text-sm text-host-secondary">{t('workspace.customPreviewHint')}</div>}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-host-border shrink-0 bg-host-chrome">
          <div className="text-[11px] text-host-tertiary">
            {t('workspace.canvasCleanHint')}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-host-sunken hover:bg-host-elevated border border-host-border text-host-primary rounded-lg text-xs transition"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={submit}
              disabled={!currentTheme}
              className="px-5 py-2 bg-host-accent hover:bg-host-accent-hover text-host-on-accent font-medium rounded-lg text-xs shadow transition flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{t('workspace.createAndEnter')}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export const ProjectManager: React.FC = () => {
  const t = useT();
  const { projects, missingIds, refresh, openProject, renameProject, removeFromList, deleteProject, openLocalFolder, migrateProject,sourceTransitionError } =
    useWorkspaceStore();
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [uninitFolder, setUninitFolder] = useState<string | null>(null);
  const [targetInitFolder, setTargetInitFolder] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ProjectMeta | null>(null);

  useEffect(() => {
    refresh();
  }, []);

  const filtered = projects.filter((p) => p.name.toLowerCase().includes(search.trim().toLowerCase()));

  const fmtTime = (t: number) => {
    const d = new Date(t);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  return (
    <div className="w-screen h-screen bg-host-chrome text-host-primary overflow-y-auto" onClick={() => setMenuFor(null)}>
      <div className="max-w-5xl mx-auto px-8 py-12">
        <header className="flex items-center gap-3 mb-8">
          <BrandMark size={40} className="shadow rounded-xl" />
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-bold text-host-primary">{t('app.name')}</h1>
            <p className="text-xs text-host-tertiary">{t('workspace.tagline')}</p>
          </div>
          <LanguageMenu />
        </header>

        <div className="flex items-center gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-host-tertiary absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('workspace.searchProjects')}
              className="w-full bg-host-sunken border border-host-border rounded-lg pl-8 pr-3 py-2 text-xs text-host-primary focus:outline-none focus:border-host-accent"
            />
          </div>
          {/* T-AE-43: 打开任意本地 *.aidesign 工程文件夹 (PRD §3.0.1) */}
          <button
            onClick={async () => {
              setNotice(null);
              setUninitFolder(null);
              const r = await openLocalFolder();
              // '已取消' is a storage-layer protocol token, not UI copy
              if (!r.ok && r.message !== '已取消') {
                if (r.notProject && r.folderPath) {
                  setUninitFolder(r.folderPath);
                } else {
                  setNotice(r.message);
                }
              }
            }}
            className="flex items-center gap-1.5 px-3 py-2 bg-host-sunken hover:bg-host-elevated border border-host-border text-host-primary font-medium rounded-lg text-xs transition"
          >
            <FolderOpen className="w-3.5 h-3.5" />
            <span>{t('workspace.openLocalProject')}</span>
          </button>
          <button
            onClick={() => {
              setTargetInitFolder(null);
              setShowNew(true);
            }}
            className="flex items-center gap-1.5 px-4 py-2 bg-host-accent hover:bg-host-accent-hover text-host-on-accent font-medium rounded-lg text-xs shadow transition"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t('workspace.createProject')}</span>
          </button>
        </div>

        {uninitFolder && (
          <div className="mb-4 p-4 bg-host-elevated border border-host-border-strong rounded-xl text-xs text-host-primary flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-lg">
            <div className="space-y-1">
              <div className="flex items-center gap-2 font-semibold text-host-brand">
                <FolderOpen className="w-4 h-4 text-host-brand shrink-0" />
                <span>{t('workspace.uninitTitle')}</span>
              </div>
              <p className="text-[11px] text-host-secondary leading-relaxed">
                {t('workspace.uninitBodyPrefix')} <code className="px-1.5 py-0.5 bg-host-sunken rounded text-host-brand font-mono text-[10px]">{uninitFolder}</code> {t('workspace.uninitBodyMissing')} <code className="text-host-brand">project.json</code>{t('workspace.uninitBodySuffix')}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setUninitFolder(null)}
                className="px-3 py-1.5 bg-host-sunken hover:bg-host-elevated border border-host-border text-host-primary rounded-lg text-xs transition"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={() => {
                  const target = uninitFolder;
                  setUninitFolder(null);
                  setTargetInitFolder(target);
                  setShowNew(true);
                }}
                className="px-3 py-1.5 bg-host-accent hover:bg-host-accent-hover text-host-on-accent font-medium rounded-lg text-xs shadow transition flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{t('workspace.createInFolder')}</span>
              </button>
            </div>
          </div>
        )}

        {(notice||sourceTransitionError) && (
          <div className="mb-4 px-3 py-2 bg-host-elevated border border-host-border rounded-lg text-[11px] text-host-warning flex items-center justify-between gap-3">
            <span className="leading-relaxed">{notice??sourceTransitionError}</span>
            <button onClick={() => {setNotice(null);useWorkspaceStore.setState({sourceTransitionError:null});}} className="text-host-warning hover:opacity-80 shrink-0">
              {t('workspace.dismissNotice')}
            </button>
          </div>
        )}

        {projects.length === 0 ? (
          /* 空状态：首次启动给引导，而非一片空白 (PRD §3.0.1) */
          <div className="border border-dashed border-host-border-strong rounded-xl py-20 flex flex-col items-center text-center bg-host-sunken/40">
            <FolderOpen className="w-10 h-10 text-host-tertiary mb-4" />
            <h2 className="font-semibold text-host-primary text-sm">{t('workspace.emptyTitle')}</h2>
            <p className="text-xs text-host-secondary mt-1.5 max-w-xs leading-relaxed">
              {t('workspace.emptyHint')}
            </p>
            <button
              onClick={() => setShowNew(true)}
              className="mt-5 flex items-center gap-1.5 px-4 py-2 bg-host-accent hover:bg-host-accent-hover text-host-on-accent font-medium rounded-lg text-xs shadow"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{t('workspace.createFirstProject')}</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((p) => {
              const missing = missingIds.includes(p.id);
              return (
                <div
                  key={p.id}
                  className={`group relative bg-slate-900 !bg-host-elevated border rounded-xl transition ${
                    menuFor === p.id ? 'z-30' : ''
                  } ${
                    missing
                      ? 'border-host-border opacity-60'
                      : 'border-host-border hover:border-host-border-strong cursor-pointer'
                  }`}
                  onClick={() => !missing && openProject(p.id)}
                >
                  <div className="h-[150px] bg-host-sunken border-b border-host-border rounded-t-xl overflow-hidden relative">
                    {missing ? (
                      <div className="w-full h-full flex flex-col items-center justify-center gap-1.5 text-host-tertiary">
                        <AlertTriangle className="w-5 h-5 text-host-warning" />
                        <span className="text-[11px]">{t('workspace.dataLost')}</span>
                      </div>
                    ) : (
                      <ProjectThumbnail meta={p} />
                    )}
                  </div>

                  <div className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-semibold text-host-primary text-xs truncate" title={p.name}>
                        {p.name}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setMenuFor(menuFor === p.id ? null : p.id);
                        }}
                        className="text-host-tertiary hover:text-host-primary shrink-0 opacity-0 group-hover:opacity-100 transition"
                      >
                        <MoreHorizontal className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="flex items-center gap-2 mt-1.5 text-[10px] text-host-tertiary">
                      <span
                        className={`px-1.5 py-0.5 rounded font-medium ${
                          p.deviceProfile === 'pc'
                            ? 'bg-host-accent-subtle text-host-brand'
                            : 'bg-emerald-950/60 text-host-success'
                        }`}
                      >
                        {p.deviceProfile === 'pc' ? t('workspace.devicePc1440') : t('workspace.deviceMobile390')}
                      </span>
                      <span>{t('workspace.screenCount', { count: p.screenCount })}</span>
                      {/* T-AE-42: 未迁移的工程仍写 localStorage，受 ~5-10MB 配额限制 */}
                      {p.folderPath ? (
                        <span className="px-1.5 py-0.5 rounded bg-host-sunken text-host-secondary" title={p.folderPath}>
                          {t('workspace.folderBadge')}
                        </span>
                      ) : (
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            const r = await migrateProject(p.id);
                            // '已取消' is a storage-layer protocol token, not UI copy
                            if (r.message !== '已取消') setNotice(r.message);
                          }}
                          title={t('workspace.migrateTitle')}
                          className="px-1.5 py-0.5 rounded bg-amber-950/60 text-host-warning hover:bg-amber-900/60 flex items-center gap-1"
                        >
                          <HardDriveDownload className="w-2.5 h-2.5" />
                          {t('workspace.migrate')}
                        </button>
                      )}
                    </div>
                    <div className="text-[10px] text-host-tertiary mt-1">{fmtTime(p.updatedAt)}</div>
                  </div>

                  {menuFor === p.id && (
                    <div
                      className="absolute right-2 top-[160px] w-40 bg-host-dialog border border-host-border-strong rounded-lg shadow-2xl py-1 z-20 text-[11px]"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={() => {
                          const next = window.prompt(t('workspace.renamePrompt'), p.name);
                          if (next && next.trim())void renameProject(p.id,next.trim()).catch(error=>setNotice(error instanceof Error?error.message:t('workspace.renameFailed')));
                          setMenuFor(null);
                        }}
                        className="w-full text-left px-3 py-1.5 hover:bg-host-elevated text-host-primary"
                      >
                        {t('workspace.rename')}
                      </button>
                      <button
                        onClick={() => {
                          removeFromList(p.id);
                          setMenuFor(null);
                        }}
                        className="w-full text-left px-3 py-1.5 hover:bg-host-elevated text-host-secondary"
                        title={t('workspace.removeFromListTitle')}
                      >
                        {t('workspace.removeFromList')}
                      </button>
                      <button
                        onClick={() => {
                          setConfirmDelete(p);
                          setMenuFor(null);
                        }}
                        className="w-full text-left px-3 py-1.5 hover:bg-red-950/60 text-host-danger flex items-center gap-1.5"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>{t('workspace.deleteProject')}</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showNew && (
        <NewProjectDialog
          initialFolderPath={targetInitFolder ?? undefined}
          onClose={() => {
            setShowNew(false);
            setTargetInitFolder(null);
          }}
        />
      )}

      {/* 删除是不可恢复操作，必须二次确认并说明后果 (PRD §3.0.1) */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-host-dialog border border-host-border-strong rounded-xl shadow-2xl p-5 text-xs">
            <h3 className="font-bold text-host-primary text-sm flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-host-danger" />
              <span>{t('workspace.deleteProject')}</span>
            </h3>
            <p className="text-host-secondary mt-3 leading-relaxed">
              {t('workspace.deleteConfirmBody', { name: confirmDelete.name })}
              <span className="text-host-danger">{t('workspace.deleteIrreversible')}</span>
            </p>
            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => setConfirmDelete(null)}
                className="px-4 py-2 bg-host-sunken hover:bg-host-elevated border border-host-border text-host-primary rounded-lg"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={async () => {
                  try{await deleteProject(confirmDelete.id);setConfirmDelete(null);}
                  catch(error){setNotice(error instanceof Error?error.message:t('workspace.deleteFailed'));}
                }}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-medium rounded-lg"
              >
                {t('workspace.confirmDelete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
