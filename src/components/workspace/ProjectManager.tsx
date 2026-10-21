import { ReferenceDeviceOption } from '../theme/ReferenceDeviceOption';
import { defaultReferenceDevice, REFERENCE_DEVICES } from '../../utils/referenceDevice';
import React, { useEffect, useMemo, useState } from 'react';
import { BrandMark } from '../common/BrandMark';
import { useWorkspaceStore } from '../../stores/useWorkspaceStore';
import { themePresets } from '../../utils/themePresets';
import {
  DEFAULT_STYLE_DNA,
  DOMAIN_OPTIONS,
  PERSONALITY_OPTIONS,
  SHAPE_OPTIONS,
  resolveStyleDna,
  type Domain,
  type Shape,
  type StyleDnaAnswers
} from '../../utils/styleDna';
import { ProjectMeta } from '../../utils/projectRegistry';
import { folderDisplayName, isDesktopRuntime, pickProjectFolder } from '../../services/storage/folderPicker';
import { DesignSystemVisualPreview } from '../theme/DesignSystemVisualPreview';
import { useProjectStore } from '../../stores/useProjectStore';
import { CustomDesignSystemBuilder } from './CustomDesignSystemBuilder';
import { DEFAULT_CUSTOM_DESIGN_SYSTEM, generateCustomDesignSystems } from '../../utils/customDesignSystem';
import type { DesignSystem } from '../../types/designSystem';
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
      <div className="w-full h-full relative overflow-hidden bg-slate-950 flex items-center justify-center" data-testid="project-custom-cover">
        <img
          src={meta.coverImage}
          alt={`${meta.name} 封面`}
          className="w-full h-full object-contain select-none pointer-events-none transition-transform duration-300 group-hover:scale-105"
        />
        <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded bg-slate-900/80 backdrop-blur-sm border border-slate-700/50 text-[10px] text-blue-400 font-medium flex items-center gap-1 shadow select-none pointer-events-none z-10">
          <Sparkles className="w-2.5 h-2.5" />
          <span>自定义封面</span>
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
        <div className="w-full h-full relative overflow-hidden bg-gradient-to-b from-slate-900/80 via-slate-950 to-slate-950 flex items-center justify-center" data-testid="project-screen-cover">
          <div className="absolute w-32 h-32 bg-blue-500/5 rounded-full blur-xl pointer-events-none" />
          <div
            className="relative rounded-[12px] border border-slate-700/70 shadow-2xl bg-black overflow-hidden pointer-events-none flex-shrink-0"
            style={{ width: `${phoneW}px`, height: `${phoneH}px` }}
          >
            <iframe
              title={`${meta.name} 预览`}
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
      <div className="w-full h-full relative overflow-hidden bg-slate-950 flex items-start justify-center" data-testid="project-screen-cover">
        <iframe
          title={`${meta.name} 预览`}
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
      className="w-full h-full flex flex-col items-center justify-center p-4 bg-gradient-to-br from-slate-900 via-slate-850 to-slate-950 border-b border-slate-800/80 select-none relative overflow-hidden group-hover:from-slate-850 group-hover:to-slate-900 transition-colors"
      data-testid="project-name-cover"
    >
      {/* 水印与背景微质感 */}
      <div className="absolute -right-2 -bottom-4 text-7xl font-black text-slate-800/20 select-none pointer-events-none font-mono">
        {(meta.name || 'P').slice(0, 2).toUpperCase()}
      </div>
      <div className="w-9 h-9 rounded-xl bg-slate-800/90 border border-slate-700/70 shadow-inner flex items-center justify-center text-slate-300 mb-2 z-10 group-hover:border-blue-500/40 group-hover:text-blue-400 transition">
        {meta.deviceProfile === 'pc' ? (
          <Laptop className="w-4 h-4" />
        ) : (
          <Smartphone className="w-4 h-4" />
        )}
      </div>
      <div className="text-xs font-bold text-slate-200 text-center max-w-[200px] truncate z-10 tracking-tight" title={meta.name}>
        {meta.name}
      </div>
      <div className="text-[10px] text-slate-500 mt-1 z-10 flex items-center gap-1">
        <span>{meta.deviceProfile === 'pc' ? 'PC 1440' : '移动端 390'}</span>
        <span>·</span>
        <span>空白画板</span>
      </div>
    </div>
  );
};

const NewProjectDialog: React.FC<{ initialFolderPath?: string; onClose: () => void }> = ({
  initialFolderPath,
  onClose
}) => {
  const { createProject } = useWorkspaceStore();
  const isDesktop = isDesktopRuntime();
  const [name, setName] = useState(() => (initialFolderPath ? folderDisplayName(initialFolderPath) : '未命名工程'));
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
  const [customTheme, setCustomTheme] = useState<DesignSystem | null>(() => generateCustomDesignSystems(DEFAULT_CUSTOM_DESIGN_SYSTEM, 0)[0].theme);

  const filteredPresets = useMemo(() => {
    const q = searchPreset.trim().toLowerCase();
    if (!q) return themePresets;
    return themePresets.filter(
      (p) => p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q)
    );
  }, [searchPreset]);

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
    const picked = await pickProjectFolder('选择新工程的保存目录');
    if (picked) {
      setFolderPath(picked);
      if (name === '未命名工程' || !name.trim()) {
        setName(folderDisplayName(picked));
      }
    }
  };

  const submit = () => {
    if (!currentTheme) return;
    const trimmed = name.trim() || (folderPath ? folderDisplayName(folderPath) : '未命名工程');
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
      <div className="w-full max-w-5xl h-[85vh] bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-bold text-slate-100 text-sm">新建工程</h2>
              <p className="text-[11px] text-slate-400">配置工程属性与设计系统，工作区纯净无冗余样张</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 p-1">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Two-column body */}
        <div className="flex-1 flex min-h-0 overflow-hidden">
          {/* Left Column: Settings & Presets */}
          <div className="w-[410px] border-r border-slate-800 flex flex-col p-5 space-y-4 overflow-y-auto shrink-0 bg-slate-900/60">
            {/* 1. Name */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">工程名称</label>
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 text-xs focus:outline-none focus:border-blue-500"
              />
            </div>

            {/* 2. Device */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">设备档位</label>
                <span className="text-[10px] text-amber-500/80">设备档位在工程创建后不可更改</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { key: 'pc', icon: Laptop, title: 'PC 桌面', desc: '1440px' },
                  { key: 'mobile', icon: Smartphone, title: '移动端', desc: '390px' }
                ] as const).map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => { setDevice(opt.key); setReferenceDeviceId(`${opt.key}-standard`); }}
                    className={`flex items-center gap-2 p-2.5 rounded-xl border transition text-left ${
                      device === opt.key
                        ? 'border-blue-500 bg-blue-950/40 text-blue-300'
                        : 'border-slate-800 bg-slate-950 hover:border-slate-700 text-slate-400'
                    }`}
                  >
                    <opt.icon className="w-4 h-4 shrink-0" />
                    <div>
                      <div className="text-xs font-semibold text-slate-200">{opt.title}</div>
                      <div className="text-[10px] opacity-70">{opt.desc}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <ReferenceDeviceOption settings={{ deviceProfile: device, frameWidth: device === 'mobile' ? 390 : 1440, viewportGuideHeight: device === 'mobile' ? 844 : 900, referenceDevice, useCustomNavigation, showViewportGuide: true, colorMode: 'light', lodBudget: 12 }} onChange={setReferenceDeviceId} />
            {device === 'mobile' && <label className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" aria-label="使用自定义导航栏" checked={useCustomNavigation} onChange={event => setUseCustomNavigation(event.target.checked)} />使用自定义导航栏<span className="text-[10px] text-slate-500">默认使用微信顶部栏预览</span></label>}
            {/* 3. Folder Path (Desktop) */}
            {isDesktop && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    工程存放目录
                  </label>
                  {folderPath && (
                    <button
                      type="button"
                      onClick={() => setFolderPath(undefined)}
                      className="text-[10px] text-slate-500 hover:text-slate-300 underline transition"
                    >
                      使用内置存储
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <div
                    className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-300 text-xs truncate flex items-center gap-2"
                    title={folderPath || '未指定（保存至应用内置存储）'}
                  >
                    <FolderOpen className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    <span className={`truncate ${folderPath ? 'text-slate-200 font-mono text-[11px]' : 'text-slate-500 italic'}`}>
                      {folderPath ? folderPath : '默认内置存储'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handlePickFolder}
                    className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium rounded-lg text-xs transition shrink-0"
                  >
                    {folderPath ? '更换' : '选择'}
                  </button>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-slate-950 border border-slate-800" role="group" aria-label="设计系统来源">
              {([{ value: 'preset', label: '现有预设' }, { value: 'custom', label: '自定义生成' }] as const).map(option => (
                <button key={option.value} type="button" aria-pressed={designSystemMode === option.value} onClick={() => setDesignSystemMode(option.value)} className={`py-2 rounded-lg text-xs transition ${designSystemMode === option.value ? 'bg-slate-800 text-slate-100 font-semibold' : 'text-slate-400 hover:text-slate-200'}`}>{option.label}</button>
              ))}
            </div>
            <div hidden={designSystemMode !== 'custom'}>
              <CustomDesignSystemBuilder onChange={setCustomTheme} />
            </div>

            {/* 4. Design System Presets Selector (OpenDesign style) */}
            <div hidden={designSystemMode !== 'preset'} className="space-y-2 pt-1 border-t border-slate-800/80">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  设计系统预设
                </label>
                <span className="text-[10px] text-slate-500">点击右侧实时预览</span>
              </div>

              {/* Search Presets */}
              <div className="relative">
                <Search className="w-3 h-3 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  value={searchPreset}
                  onChange={(e) => setSearchPreset(e.target.value)}
                  placeholder="搜索设计系统 (如 Modern, Airbnb, Ant...)"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-7 pr-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Presets List */}
              <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-0.5">
                {filteredPresets.map((preset) => {
                  const isSelected = preset.id === selectedPresetId;
                  const isDefault = preset.id === 'neutral-modern';
                  return (
                    <div
                      key={preset.id}
                      onClick={() => setSelectedPresetId(preset.id)}
                      className={`p-2.5 rounded-xl border transition cursor-pointer flex items-start gap-2.5 ${
                        isSelected
                          ? 'border-blue-500 bg-blue-950/40 ring-1 ring-blue-500/50'
                          : 'border-slate-800/80 bg-slate-950/60 hover:border-slate-700 hover:bg-slate-950'
                      }`}
                    >
                      <span
                        className="w-3.5 h-3.5 rounded-full border border-white/20 shrink-0 mt-0.5"
                        style={{ backgroundColor: preset.primaryColor }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-semibold text-slate-200 text-xs truncate">{preset.name}</span>
                          {isDefault && (
                            <span className="px-1.5 py-0.2 bg-blue-500/20 text-blue-300 text-[9px] rounded font-medium">
                              默认
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-slate-400 truncate mt-0.5">{preset.description}</p>
                      </div>
                      {isSelected && <Check className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 5. Radius Tuning */}
            <div hidden={designSystemMode !== 'preset'} className="space-y-1.5 pt-1 border-t border-slate-800/80">
              <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">圆角微调</label>
              <div className="grid grid-cols-3 gap-1.5">
                {SHAPE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setShape(opt.value)}
                    className={`py-1.5 px-2 rounded-lg border text-center transition text-xs ${
                      shape === opt.value
                        ? 'border-blue-500 bg-blue-950/40 text-blue-300 font-medium'
                        : 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    {opt.label.split(' ')[0]}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Right Column: Visual Preview */}
          <div className="flex-1 flex flex-col min-w-0 bg-slate-950 overflow-hidden">
            {currentTheme ? <DesignSystemVisualPreview theme={currentTheme} device={device} /> : <div className="flex-1 flex items-center justify-center p-8 text-sm text-slate-400">请输入有效主色，以预览并创建自定义设计系统。</div>}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-800 shrink-0 bg-slate-900/90">
          <div className="text-[11px] text-slate-500">
            画布初始为纯净无画框状态，工作区仅存放真实业务交付物。
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs transition"
            >
              取消
            </button>
            <button
              onClick={submit}
              disabled={!currentTheme}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg text-xs shadow transition flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>创建并进入工程</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export const ProjectManager: React.FC = () => {
  const { projects, missingIds, refresh, openProject, renameProject, removeFromList, deleteProject, openLocalFolder, migrateProject } =
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
    <div className="w-screen h-screen bg-slate-950 text-slate-200 overflow-y-auto" onClick={() => setMenuFor(null)}>
      <div className="max-w-5xl mx-auto px-8 py-12">
        <header className="flex items-center gap-3 mb-8">
          <BrandMark size={40} className="shadow rounded-xl" />
          <div>
            <h1 className="text-lg font-bold text-slate-100">TauDesign</h1>
            <p className="text-xs text-slate-500">选择一个工程继续，或新建一个开始。</p>
          </div>
        </header>

        <div className="flex items-center gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索工程"
              className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-8 pr-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
            />
          </div>
          {/* T-AE-43: 打开任意本地 *.aidesign 工程文件夹 (PRD §3.0.1) */}
          <button
            onClick={async () => {
              setNotice(null);
              setUninitFolder(null);
              const r = await openLocalFolder();
              if (!r.ok && r.message !== '已取消') {
                if (r.notProject && r.folderPath) {
                  setUninitFolder(r.folderPath);
                } else {
                  setNotice(r.message);
                }
              }
            }}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium rounded-lg text-xs transition"
          >
            <FolderOpen className="w-3.5 h-3.5" />
            <span>打开本地工程</span>
          </button>
          <button
            onClick={() => {
              setTargetInitFolder(null);
              setShowNew(true);
            }}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg text-xs shadow transition"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>新建工程</span>
          </button>
        </div>

        {uninitFolder && (
          <div className="mb-4 p-4 bg-blue-950/40 border border-blue-800/60 rounded-xl text-xs text-blue-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-lg">
            <div className="space-y-1">
              <div className="flex items-center gap-2 font-semibold text-blue-300">
                <FolderOpen className="w-4 h-4 text-blue-400 shrink-0" />
                <span>所选文件夹尚未初始化为工程</span>
              </div>
              <p className="text-[11px] text-slate-300 leading-relaxed">
                目录 <code className="px-1.5 py-0.5 bg-slate-900 rounded text-blue-300 font-mono text-[10px]">{uninitFolder}</code> 中缺少 <code className="text-blue-300">project.json</code>。是否以此文件夹作为保存位置，直接新建工程？
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setUninitFolder(null)}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs transition"
              >
                取消
              </button>
              <button
                onClick={() => {
                  const target = uninitFolder;
                  setUninitFolder(null);
                  setTargetInitFolder(target);
                  setShowNew(true);
                }}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg text-xs shadow transition flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>在此文件夹新建工程</span>
              </button>
            </div>
          </div>
        )}

        {notice && (
          <div className="mb-4 px-3 py-2 bg-amber-950/40 border border-amber-800/50 rounded-lg text-[11px] text-amber-200 flex items-center justify-between gap-3">
            <span className="leading-relaxed">{notice}</span>
            <button onClick={() => setNotice(null)} className="text-amber-400 hover:text-amber-200 shrink-0">
              知道了
            </button>
          </div>
        )}

        {projects.length === 0 ? (
          /* 空状态：首次启动给引导，而非一片空白 (PRD §3.0.1) */
          <div className="border border-dashed border-slate-800 rounded-2xl py-20 flex flex-col items-center text-center">
            <FolderOpen className="w-10 h-10 text-slate-700 mb-4" />
            <h2 className="font-semibold text-slate-300 text-sm">还没有任何工程</h2>
            <p className="text-xs text-slate-500 mt-1.5 max-w-xs leading-relaxed">
              新建工程时选择设备档位与主题风格，随后即可用自然语言生成多页面设计。
            </p>
            <button
              onClick={() => setShowNew(true)}
              className="mt-5 flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg text-xs shadow"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>新建第一个工程</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((p) => {
              const missing = missingIds.includes(p.id);
              return (
                <div
                  key={p.id}
                  className={`group relative bg-slate-900 border rounded-xl overflow-hidden transition ${
                    missing
                      ? 'border-slate-800 opacity-60'
                      : 'border-slate-800 hover:border-blue-600/60 cursor-pointer'
                  }`}
                  onClick={() => !missing && openProject(p.id)}
                >
                  <div className="h-[150px] bg-slate-950 border-b border-slate-800 overflow-hidden relative">
                    {missing ? (
                      <div className="w-full h-full flex flex-col items-center justify-center gap-1.5 text-slate-600">
                        <AlertTriangle className="w-5 h-5 text-amber-600" />
                        <span className="text-[11px]">工程数据已丢失</span>
                      </div>
                    ) : (
                      <ProjectThumbnail meta={p} />
                    )}
                  </div>

                  <div className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-semibold text-slate-200 text-xs truncate" title={p.name}>
                        {p.name}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setMenuFor(menuFor === p.id ? null : p.id);
                        }}
                        className="text-slate-500 hover:text-slate-200 shrink-0 opacity-0 group-hover:opacity-100 transition"
                      >
                        <MoreHorizontal className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="flex items-center gap-2 mt-1.5 text-[10px] text-slate-500">
                      <span
                        className={`px-1.5 py-0.5 rounded font-medium ${
                          p.deviceProfile === 'pc'
                            ? 'bg-blue-950/60 text-blue-300'
                            : 'bg-emerald-950/60 text-emerald-300'
                        }`}
                      >
                        {p.deviceProfile === 'pc' ? 'PC 1440' : '移动端 390'}
                      </span>
                      <span>{p.screenCount} 个页面</span>
                      {/* T-AE-42: 未迁移的工程仍写 localStorage，受 ~5-10MB 配额限制 */}
                      {p.folderPath ? (
                        <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-400" title={p.folderPath}>
                          文件夹
                        </span>
                      ) : (
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            const r = await migrateProject(p.id);
                            if (r.message !== '已取消') setNotice(r.message);
                          }}
                          title="迁移到工程文件夹，摆脱浏览器存储配额限制"
                          className="px-1.5 py-0.5 rounded bg-amber-950/60 text-amber-300 hover:bg-amber-900/60 flex items-center gap-1"
                        >
                          <HardDriveDownload className="w-2.5 h-2.5" />
                          迁移
                        </button>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-600 mt-1">{fmtTime(p.updatedAt)}</div>
                  </div>

                  {menuFor === p.id && (
                    <div
                      className="absolute right-2 top-[160px] w-40 bg-slate-800 border border-slate-700 rounded-lg shadow-2xl py-1 z-20 text-[11px]"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={() => {
                          const next = window.prompt('重命名工程', p.name);
                          if (next && next.trim()) renameProject(p.id, next.trim());
                          setMenuFor(null);
                        }}
                        className="w-full text-left px-3 py-1.5 hover:bg-slate-700 text-slate-200"
                      >
                        重命名
                      </button>
                      <button
                        onClick={() => {
                          removeFromList(p.id);
                          setMenuFor(null);
                        }}
                        className="w-full text-left px-3 py-1.5 hover:bg-slate-700 text-slate-300"
                        title="仅移出列表，不删除工程数据"
                      >
                        从列表移除
                      </button>
                      <button
                        onClick={() => {
                          setConfirmDelete(p);
                          setMenuFor(null);
                        }}
                        className="w-full text-left px-3 py-1.5 hover:bg-red-950/60 text-red-400 flex items-center gap-1.5"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>删除工程</span>
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
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl p-5 text-xs">
            <h3 className="font-bold text-slate-100 text-sm flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400" />
              <span>删除工程</span>
            </h3>
            <p className="text-slate-400 mt-3 leading-relaxed">
              将永久删除「<span className="text-slate-200 font-medium">{confirmDelete.name}</span>」
              及其全部页面与资源，<span className="text-red-400">此操作不可恢复</span>。
            </p>
            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => setConfirmDelete(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg"
              >
                取消
              </button>
              <button
                onClick={() => {
                  deleteProject(confirmDelete.id);
                  setConfirmDelete(null);
                }}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-medium rounded-lg"
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
