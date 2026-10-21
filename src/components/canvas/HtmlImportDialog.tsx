import { resolveProjectViewport } from '../../utils/referenceDevice';
import { prepareHtmlImportRuntime } from '../../services/import/htmlImportRuntime';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FileCode, FolderOpen, Loader2, X } from 'lucide-react';
import { useProjectStore } from '../../stores/useProjectStore';
import type { Asset, Screen } from '../../types/project';
import type { HtmlImportAnalysis, HtmlImportCategory, HtmlImportMode } from '../../types/htmlImport';
import { analyzeHtmlImport, convertHtmlImport } from '../../services/import/htmlImport';
import { prepareImportResources, persistImportResources, resolveImportedResources, type ImportResourceFile, type PreparedImportResources } from '../../services/import/importResources';
import { createProjectStorage } from '../../services/storage/projectStorage';
import { compileTokensToCss } from '../../utils/cssCompiler';
import { applyBrandColor } from '../../utils/colorHarmony';
import { buildScreenDocument } from '../../utils/screenDocument';
import { measureImportedFrame, observeImportedFrame } from '../../utils/importViewport';
import { DesignSystemVisualPreview } from '../theme/DesignSystemVisualPreview';
import { MobileNavigationOption } from '../theme/MobileNavigationOption';

const CATEGORIES: { id: HtmlImportCategory; name: string }[] = [
  { id: 'colors', name: '颜色' }, { id: 'typography', name: '字体与字号' },
  { id: 'spacing', name: '间距' }, { id: 'radius', name: '圆角' }, { id: 'shadows', name: '阴影' }
];
const MODES: { id: HtmlImportMode; name: string; desc: string }[] = [
  { id: 'preserve', name: '保留原貌', desc: '保留静态页面布局与样式，整理资源和可编辑节点。' },
  { id: 'unify', name: '项目统一', desc: '可识别样式映射至项目 Token，复杂样式保留并列出。' },
  { id: 'selective', name: '选择性统一', desc: '仅统一勾选的类别，保留布局、内容和其他样式。' }
];
const inputClass = 'w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-2 text-xs text-slate-200 focus:border-blue-500 focus:outline-none';
const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);

function PreviewFrame({ html, title, width, viewportHeight }: { html: string; title: string; width: number; viewportHeight: number }) {
  const container = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.4);
  const [height, setHeight] = useState(viewportHeight);
  const heightCleanup = useRef<(() => void) | null>(null);
  useEffect(() => () => heightCleanup.current?.(), []);
  useEffect(() => {
    const update = () => setScale(Math.min(1, (container.current?.clientWidth || width * 0.4) / width));
    update();
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(update);
    if (container.current) observer?.observe(container.current);
    return () => observer?.disconnect();
  }, [width]);
  return <div ref={container} className="h-[420px] overflow-auto rounded-lg bg-white">
    <div style={{ height: height * scale, position: 'relative' }}>
      <iframe title={title} srcDoc={html} className="absolute left-0 top-0 border-0 origin-top-left pointer-events-none" tabIndex={-1}
        style={{ width, height, transform: `scale(${scale})` }}
        onLoad={event => {
          heightCleanup.current?.();
          const iframe = event.currentTarget;
          const update = () => setHeight(measureImportedFrame(iframe));
          update(); heightCleanup.current = observeImportedFrame(iframe, update);
        }} />
    </div>
  </div>;
}

export const HtmlImportDialog: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { id: projectId, folderPath, settings, designSystem, screens } = useProjectStore();
  const openingProject = useRef(projectId);
  const alive = useRef(true);
  const htmlInput = useRef<HTMLInputElement>(null);
  const resourceInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File>();
  const [files, setFiles] = useState<ImportResourceFile[]>([]);
  const [data, setData] = useState<{ analysis: HtmlImportAnalysis; prepared: PreparedImportResources; warnings: string[] }>();
  const [name, setName] = useState('');
  const [mode, setMode] = useState<HtmlImportMode>('preserve');
  const [useCustomNavigation, setUseCustomNavigation] = useState(!!settings.useCustomNavigation);
  const [categories, setCategories] = useState<HtmlImportCategory[]>(['colors', 'typography']);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [previewError, setPreviewError] = useState('');
  const [preview, setPreview] = useState<{ original: string; result: string }>();
  const [extract, setExtract] = useState(false);
  const [primary, setPrimary] = useState('#2563eb');
  const [baseSize, setBaseSize] = useState(16);
  const [radius, setRadius] = useState(8);
  const [density, setDensity] = useState<'compact' | 'standard' | 'relaxed'>('standard');
  const [themeMode, setThemeMode] = useState<'light' | 'dark'>('light');
  const [previewMode, setPreviewMode] = useState<'light' | 'dark'>(settings.colorMode);
  const [previewTab, setPreviewTab] = useState<'pages' | 'theme'>('pages');
  const empty = !Object.values(screens).some(sc => sc.metadata?.kind !== 'specimen');
  const useExtracted = empty && extract;
  const wrongProject = openingProject.current !== projectId;
  const invalidPrimary = useExtracted && !/^#[a-f\d]{6}$/i.test(primary);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  useEffect(() => {
    if (!file) return;
    let current = true;
    setLoading(true); setError(''); setData(undefined); setPreview(undefined);
    (async () => {
      if (file.size > 2 * 1024 * 1024) throw new Error('HTML 文件不能超过 2 MiB');
      const runtime = await prepareHtmlImportRuntime(await file.text(), file.name);
      const first = analyzeHtmlImport(runtime.html, file.name, { expandedResources: true });
      const matching = files.filter(item => item.file.name === file.name && item.file.size === file.size);
      const path = file.webkitRelativePath || (matching.length === 1 ? matching[0].path : file.name);
      const prepared = await prepareImportResources(first.sanitizedHtml, path, files, { expandedRuntime: true });
      const analysis = analyzeHtmlImport(prepared.html, file.name, { expandedResources: true });
      if (!current) return;
      setData({ analysis, prepared, warnings: [...new Set([...runtime.warnings, ...first.warnings, ...prepared.warnings, ...analysis.warnings])] });
      setName(analysis.title);
      setPrimary(analysis.suggestedTheme.tokens.colors.primary['500']);
      setBaseSize(analysis.suggestedTheme.tokens.typography.sizes.md);
      setRadius(Math.min(32, parseFloat(analysis.suggestedTheme.tokens.radius.md) || 0));
      setDensity(analysis.suggestedTheme.tokens.personality.density);
      setThemeMode(analysis.suggestedColorMode);
    })().catch(cause => { if (current) setError(errorMessage(cause)); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [file, files]);

  const extractedTheme = useMemo(() => {
    if (!data || !/^#[a-f\d]{6}$/i.test(primary)) return undefined;
    const theme = structuredClone(data.analysis.suggestedTheme);
    theme.tokens = applyBrandColor(theme.tokens, primary, false);
    theme.tokens.typography.sizes.md = baseSize;
    theme.tokens.radius.md = `${radius}px`;
    theme.tokens.personality.density = density;
    return theme;
  }, [data, primary, baseSize, radius, density, invalidPrimary]);
  const effectiveTheme = useExtracted && extractedTheme ? extractedTheme : designSystem;
  const effectiveMode = useExtracted ? themeMode : settings.colorMode;
  const conversion = useMemo(() => {
    if (!data || invalidPrimary) return undefined;
    try { return { result: convertHtmlImport(data.analysis, { mode, categories, designSystem: effectiveTheme, colorMode: effectiveMode, deviceProfile: settings.deviceProfile, useCustomNavigation }) }; }
    catch (cause) { return { error: errorMessage(cause) }; }
  }, [data, mode, categories, effectiveTheme, effectiveMode, invalidPrimary, settings.deviceProfile, useCustomNavigation]);

  useEffect(() => {
    const result = conversion?.result;
    if (!data || !result) { setPreview(undefined); return; }
    let current = true;
    setPreview(undefined); setPreviewError('');
    const storage = createProjectStorage(openingProject.current, folderPath);
    const memoryStorage = Object.create(storage) as typeof storage;
    const binaries = new Map(data.prepared.binaries.map(binary => [binary.relPath, binary.base64]));
    memoryStorage.readBinary = async path => binaries.get(path) ?? storage.readBinary(path);
    const baseScreen: Screen = { id: 'import-preview', name, position: { x: 0, y: 0 }, htmlContent: result.htmlContent, scopedCss: result.scopedCss, metadata: { importedHtml: result.metadata } };
    const options = { tokensCss: compileTokensToCss(effectiveTheme.tokens, effectiveMode), baseCss: '', screenOverrides: '', viewportHeight: resolveProjectViewport(settings).height, viewportWidth: settings.frameWidth };
    Promise.all([
      resolveImportedResources(data.analysis.sanitizedHtml, '', memoryStorage),
      resolveImportedResources(result.htmlContent, result.scopedCss, memoryStorage)
    ]).then(([original, converted]) => {
      if (current) setPreview({
        original: buildScreenDocument({ ...baseScreen, ...original }, options),
        result: buildScreenDocument({ ...baseScreen, ...converted }, { ...options, deviceProfile: settings.deviceProfile, useCustomNavigation, includeMobileChrome: true })
      });
    }).catch(cause => { if (current) setPreviewError(errorMessage(cause)); });
    return () => { current = false; };
  }, [data, conversion, effectiveTheme, effectiveMode, folderPath, name, settings.deviceProfile, settings.viewportGuideHeight, settings.referenceDevice, useCustomNavigation]);

  const addResources = (selected: FileList | null, folder = false) => {
    if (!selected) return;
    const incoming = Array.from(selected).map(resource => ({
      path: folder && resource.webkitRelativePath ? resource.webkitRelativePath.split('/').slice(1).join('/') : resource.name,
      file: resource
    }));
    setFiles(prev => [...new Map([...prev, ...incoming].map(item => [item.path, item])).values()]);
  };
  const confirm = async () => {
    if (!data || !conversion?.result || !preview || loading || saving || wrongProject || invalidPrimary || previewError) return;
    setSaving(true); setError('');
    const currentProject = useProjectStore.getState();
    const source = data.prepared;
    try {
      if (currentProject.id !== openingProject.current) throw new Error('工程已切换，请重新导入');
      await persistImportResources(source, createProjectStorage(currentProject.id, currentProject.folderPath));
      if (!alive.current) return;
      const assets: Asset[] = source.binaries.filter(binary => binary.mimeType.startsWith('image/')).map(binary => ({
        id: `import_${binary.relPath.split('/').pop()!.split('.')[0]}`, name: binary.name, relPath: binary.relPath,
        type: 'image', mimeType: binary.mimeType, source: 'upload', refCount: 1
      }));
      currentProject.importHtmlScreen({ name: name.trim() || data.analysis.title, htmlContent: conversion.result.htmlContent, scopedCss: conversion.result.scopedCss,
        metadata: { importedHtml: conversion.result.metadata } }, {
        projectId: openingProject.current, assets, ...(settings.deviceProfile === 'mobile' ? { useCustomNavigation } : {}),
        ...(useExtracted && extractedTheme ? { designSystem: extractedTheme, colorMode: effectiveMode } : {})
      });
      onClose();
    } catch (cause) { if (alive.current) setError(errorMessage(cause)); }
    finally { if (alive.current) setSaving(false); }
  };

  return <div role="dialog" aria-modal="true" aria-label="导入 HTML 页面" className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
    <div className="flex h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 text-slate-200 shadow-2xl">
      <div className="flex shrink-0 items-center justify-between border-b border-slate-800 px-5 py-4">
        <div><h2 className="flex items-center gap-2 text-sm font-semibold"><FileCode size={17} />导入 HTML 页面</h2><p className="mt-1 text-xs text-slate-400">分析静态页面，预览转换结果，再加入当前项目。</p></div>
        <button aria-label="关闭导入" disabled={saving} onClick={onClose} className="p-1 text-slate-400 hover:text-white"><X size={18} /></button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-auto md:flex-row">
        <div className="w-full shrink-0 space-y-4 border-r border-slate-800 p-5 md:w-[350px] md:overflow-y-auto">
          <input ref={htmlInput} aria-label="选择 HTML 文件" type="file" accept=".html,.htm,text/html" className="hidden" onChange={event => { setFile(event.target.files?.[0]); event.target.value = ''; }} />
          <input ref={resourceInput} aria-label="补充资源文件" type="file" multiple className="hidden" onChange={event => { addResources(event.target.files); event.target.value = ''; }} />
          <input ref={folderInput} aria-label="补充资源文件夹" type="file" multiple {...({ webkitdirectory: '', directory: '' } as React.InputHTMLAttributes<HTMLInputElement>)} className="hidden" onChange={event => { addResources(event.target.files, true); event.target.value = ''; }} />
          <button onClick={() => htmlInput.current?.click()} disabled={saving} className="w-full rounded-lg border border-dashed border-slate-600 bg-slate-950 p-3 text-left text-xs hover:border-blue-400"><FileCode size={16} className="mb-2 text-blue-400" />{file?.name || '选择 HTML 文件'}<span className="mt-1 block text-slate-500">.html / .htm · 最大 2 MiB</span></button>
          <div className="flex flex-wrap gap-2 text-xs"><button onClick={() => resourceInput.current?.click()} disabled={!file || saving} className="rounded bg-slate-800 px-2 py-1.5 disabled:opacity-40">补充资源</button><button onClick={() => folderInput.current?.click()} disabled={!file || saving} className="flex items-center gap-1 rounded bg-slate-800 px-2 py-1.5 disabled:opacity-40"><FolderOpen size={12} />选择资源文件夹</button>{files.length > 0 && <button onClick={() => setFiles([])} disabled={saving} className="text-slate-400">清除 {files.length} 个文件</button>}</div>
          <p className="text-[11px] leading-relaxed text-slate-500">资源文件夹请选原 HTML 所在目录。依赖脚本生成的内容需先保存为渲染后的静态 HTML；远程样式请下载后补充。</p>
          {loading && <p className="flex items-center gap-2 text-xs text-blue-300"><Loader2 className="animate-spin" size={14} />正在分析页面与资源…</p>}
          {(error || wrongProject || invalidPrimary || conversion?.error || previewError) && <p role="alert" className="rounded-lg border border-red-800 bg-red-950/40 p-3 text-xs text-red-200">{wrongProject ? '工程已切换，请关闭后重新导入。' : invalidPrimary ? '请输入有效的六位主色，例如 #477568。' : error || conversion?.error || previewError}</p>}
          {data && <>
            <label className="block space-y-1.5 text-xs text-slate-400">页面名称<input aria-label="导入页面名称" value={name} onChange={event => setName(event.target.value)} className={inputClass} /></label>
            <fieldset className="space-y-2"><legend className="mb-2 text-xs font-semibold">导入方式</legend>{MODES.map(option => <label key={option.id} className={`block cursor-pointer rounded-lg border p-2.5 text-xs ${mode === option.id ? 'border-blue-500 bg-blue-950/30' : 'border-slate-700'}`}><span className="flex items-center gap-2"><input type="radio" name="html-import-mode" aria-label={option.name} checked={mode === option.id} onChange={() => setMode(option.id)} />{option.name}</span><span className="mt-1.5 block pl-5 text-[11px] leading-relaxed text-slate-400">{option.desc}</span></label>)}</fieldset>
            {mode === 'selective' && <div className="flex flex-wrap gap-3">{CATEGORIES.map(item => <label key={item.id} className="flex items-center gap-1.5 text-xs"><input aria-label={`统一${item.name}`} type="checkbox" checked={categories.includes(item.id)} onChange={event => setCategories(prev => event.target.checked ? [...prev, item.id] : prev.filter(id => id !== item.id))} />{item.name}</label>)}</div>}
            <MobileNavigationOption disabled={saving} value={useCustomNavigation} onChange={setUseCustomNavigation} />
            {empty && <div className="space-y-3 rounded-lg border border-slate-700 p-3"><label className="flex items-center gap-2 text-xs font-medium"><input type="checkbox" aria-label="以此页面建立项目风格" checked={extract} onChange={event => setExtract(event.target.checked)} />以此页面建立项目风格</label><p className="text-[11px] leading-relaxed text-slate-400">从页面声明样式归纳候选 Token，缺少的状态沿用默认值。当前导入页仅按所选方式调整，后续生成使用项目风格。</p>{extract && <>
              <label className="block text-xs text-slate-400">提取主色<input aria-label="提取主色" value={primary} onChange={event => setPrimary(event.target.value)} className={`${inputClass} mt-1`} /></label>
              <div className="grid grid-cols-2 gap-2"><label className="text-xs text-slate-400">正文大小<input aria-label="提取正文大小" type="number" min={12} max={24} value={baseSize} onChange={event => setBaseSize(Math.max(12, Math.min(24, Number(event.target.value) || 16)))} className={`${inputClass} mt-1`} /></label><label className="text-xs text-slate-400">基础圆角<input aria-label="提取基础圆角" type="number" min={0} max={32} value={radius} onChange={event => setRadius(Math.max(0, Math.min(32, Number(event.target.value) || 0)))} className={`${inputClass} mt-1`} /></label></div>
              <select aria-label="提取间距密度" value={density} onChange={event => setDensity(event.target.value as typeof density)} className={inputClass}><option value="compact">紧凑间距</option><option value="standard">标准间距</option><option value="relaxed">宽松间距</option></select>
              <select aria-label="提取明暗模式" value={themeMode} onChange={event => setThemeMode(event.target.value as typeof themeMode)} className={inputClass}><option value="light">浅色模式</option><option value="dark">深色模式</option></select>
            </>}</div>}
          </>}
        </div>
        <div className="min-w-0 flex-1 space-y-4 p-5 md:overflow-y-auto">
          {!data ? <div className="flex min-h-80 items-center justify-center text-sm text-slate-500">选择页面后展示分析、转换清单与对比预览。</div> : <>
            <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="text-sm font-medium">{data.analysis.title}</h3><p className="mt-1 text-xs text-slate-400">{data.analysis.nodeCount} 个节点 · {data.analysis.styleSummary.styleSheetCount} 组样式 · {data.prepared.resources.filter(item => item.status === 'resolved').length} 项资源已处理</p></div><div className="flex gap-2 text-xs"><button onClick={() => setPreviewTab('pages')} className={`rounded px-3 py-1.5 ${previewTab === 'pages' ? 'bg-blue-600' : 'bg-slate-800'}`}>页面对比</button><button onClick={() => setPreviewTab('theme')} className={`rounded px-3 py-1.5 ${previewTab === 'theme' ? 'bg-blue-600' : 'bg-slate-800'}`}>设计系统预览</button></div></div>
            <p className="text-xs text-slate-400">项目参考视口 {settings.frameWidth} × {resolveProjectViewport(settings).height} CSS px · 可在设计系统面板调整参考设备</p>
            {data.analysis.detectedWidth && Math.abs(data.analysis.detectedWidth - settings.frameWidth) > 50 && <p className="rounded-lg bg-amber-950/40 p-3 text-xs text-amber-200">页面声明宽度约 {data.analysis.detectedWidth}px，当前工程为 {settings.frameWidth}px；将按当前档位预览，不更改工程设备。</p>}
            {previewTab === 'theme' ? <div className="h-[510px] overflow-hidden rounded-lg border border-slate-700"><DesignSystemVisualPreview theme={effectiveTheme} colorMode={useExtracted ? themeMode : previewMode} onColorModeChange={useExtracted ? setThemeMode : setPreviewMode} device={settings.deviceProfile} /></div> : preview ? <div className="grid grid-cols-1 gap-3 lg:grid-cols-2"><div><p className="mb-2 text-xs text-slate-400">原始静态页面</p><PreviewFrame html={preview.original} title="原始页面预览" width={settings.frameWidth} viewportHeight={resolveProjectViewport(settings).height} /></div><div><p className="mb-2 text-xs text-slate-400">导入结果 · {MODES.find(item => item.id === mode)?.name}</p><PreviewFrame html={preview.result} title="导入结果预览" width={settings.frameWidth} viewportHeight={resolveProjectViewport(settings).height} /></div></div> : <p className="py-10 text-center text-xs text-slate-400">正在准备预览…</p>}
            <div className="grid gap-3 lg:grid-cols-2"><div className="rounded-lg border border-slate-700 p-3 text-xs"><h4 className="mb-2 font-semibold">转换清单</h4><ul className="space-y-1.5 text-slate-400">{(conversion?.result?.changes.length ? conversion.result.changes : ['保留来源布局、业务文案和原始样式值。']).map((item, i) => <li key={i}>{item}</li>)}</ul></div><div className="rounded-lg border border-slate-700 p-3 text-xs"><h4 className="mb-2 font-semibold">保留与待处理</h4><ul className="max-h-44 space-y-1.5 overflow-auto break-words text-slate-400">{[...data.warnings, ...conversion?.result?.retained ?? [], ...data.prepared.resources.filter(item => item.status !== 'resolved').map(item => `${item.status === 'missing' ? '缺少资源' : '远程依赖'}：${item.url}`)].map((item, i) => <li key={i}>{item}</li>)}</ul></div></div>
          </>}
        </div>
      </div>
      <div className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-800 px-5 py-3"><p className="text-[11px] text-slate-500">新增独立画框，导入与项目风格可一起撤销。</p><div className="flex gap-2"><button disabled={saving} onClick={onClose} className="rounded-lg bg-slate-800 px-4 py-2 text-xs">取消</button><button onClick={confirm} disabled={!data || !preview || !!previewError || !!conversion?.error || invalidPrimary || loading || saving || wrongProject} className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white disabled:opacity-40">{saving ? '正在导入…' : '确认导入'}</button></div></div>
    </div>
  </div>;
};
