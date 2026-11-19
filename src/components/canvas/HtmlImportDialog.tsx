import {createMediaResourceSession} from '../../services/storage/mediaResourceSession';
import { resolveProjectViewport } from '../../utils/referenceDevice';
import { prepareHtmlImportRuntime } from '../../services/import/htmlImportRuntime';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FileCode, FolderOpen, Loader2, X } from 'lucide-react';
import { useProjectStore } from '../../stores/useProjectStore';
import { useT } from '../../stores/useLocaleStore';
import type { MessageKey } from '../../i18n';
import type { Screen } from '../../types/project';
import type { HtmlImportAnalysis, HtmlImportCategory, HtmlImportMode } from '../../types/htmlImport';
import { analyzeHtmlImport, convertHtmlImport } from '../../services/import/htmlImport';
import { prepareImportResources, resolveImportedResources,importResourceAssets, type ImportResourceFile, type PreparedImportResources } from '../../services/import/importResources';
import { createProjectStorage } from '../../services/storage/projectStorage';
import {importPreviewFingerprint} from '../../services/ai/pageCreationValidation';
import { compileTokensToCss } from '../../utils/cssCompiler';
import { applyBrandColor } from '../../utils/colorHarmony';
import { buildScreenDocument } from '../../utils/screenDocument';
import { measureImportedFrame, observeImportedFrame } from '../../utils/importViewport';
import { DesignSystemVisualPreview } from '../theme/DesignSystemVisualPreview';
import { MobileNavigationOption } from '../theme/MobileNavigationOption';
import {ExtractedStyleChoices} from '../theme/ExtractedStyleChoices';
import {extractPageStyle,mergeExtractedStyle,type StyleSelection} from '../../services/import/pageStyleExtraction';
import {styleApplicationKey} from '../../services/import/styleApplication';
import {SvgMediaExternalizer} from '../../services/import/svgMediaExternalizer';

type Translate = (key: MessageKey | string, params?: Record<string, string | number>) => string;

function importCategories(t: Translate): { id: HtmlImportCategory; name: string }[] {
  return [
    { id: 'colors', name: t('importHtml.catColors') },
    { id: 'typography', name: t('importHtml.catTypography') },
    { id: 'spacing', name: t('importHtml.catSpacing') },
    { id: 'radius', name: t('importHtml.catRadius') },
    { id: 'shadows', name: t('importHtml.catShadows') },
  ];
}

function importModes(t: Translate): { id: HtmlImportMode; name: string; desc: string }[] {
  return [
    { id: 'preserve', name: t('importHtml.modePreserve'), desc: t('importHtml.modePreserveDesc') },
    { id: 'unify', name: t('importHtml.modeUnify'), desc: t('importHtml.modeUnifyDesc') },
    { id: 'selective', name: t('importHtml.modeSelective'), desc: t('importHtml.modeSelectiveDesc') },
  ];
}

const inputClass = 'w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-2 text-xs text-slate-200 focus:border-blue-500 focus:outline-none';
const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);

function PreviewFrame({ html, title, width, viewportHeight, previewKey, onReady }: { html: string; title: string; width: number; viewportHeight: number; previewKey?:string; onReady?:()=>void }) {
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
          if(previewKey&&iframe.contentDocument?.querySelector('meta[name="taudesign-import-preview"]')?.getAttribute('content')===previewKey)onReady?.();
        }} />
    </div>
  </div>;
}

export const HtmlImportDialog: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const t = useT();
  const modes = useMemo(() => importModes(t), [t]);
  const categoriesList = useMemo(() => importCategories(t), [t]);
  const { id: projectId, folderPath, settings, designSystem, designLibraryBinding, screens } = useProjectStore();
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
  const [preview, setPreview] = useState<{ key:string;original: string; result: string }>();
  const [previewReady,setPreviewReady]=useState('');
  const latestPreviewKey=useRef('');
  const confirmBusy=useRef(false);
  const importController=useRef<AbortController>();
  const [extract, setExtract] = useState(false);
  const [styleSelection,setStyleSelection]=useState<StyleSelection>({backgroundIds:[],fields:[]});
  const [primary, setPrimary] = useState('#2563eb');
  const [baseSize, setBaseSize] = useState(16);
  const [radius, setRadius] = useState(8);
  const [density, setDensity] = useState<'compact' | 'standard' | 'relaxed'>('standard');
  const [themeMode, setThemeMode] = useState<'light' | 'dark'>('light');
  const [previewMode, setPreviewMode] = useState<'light' | 'dark'>(settings.colorMode);
  const [previewTab, setPreviewTab] = useState<'pages' | 'theme'>('pages');
  const empty = !Object.values(screens).some(sc => sc.metadata?.kind !== 'specimen');
  const libraryReadOnly=designLibraryBinding?.mode==='pinned_reference';
  const useExtracted = empty && extract && !libraryReadOnly;
  const wrongProject = openingProject.current !== projectId;
  const invalidPrimary = useExtracted && !/^#[a-f\d]{6}$/i.test(primary);
  useEffect(() => { alive.current = true; return () => { alive.current = false;importController.current?.abort(); }; }, []);

  useEffect(() => {
    if (!file) return;
    let current = true;
    setLoading(true); setError(''); setData(undefined); setPreview(undefined);setStyleSelection({backgroundIds:[],fields:[]});
    (async () => {
      if (file.size > 2 * 1024 * 1024) throw new Error(t('importHtml.errHtmlTooLarge'));
      const runtime = await prepareHtmlImportRuntime(await file.text(), file.name);
      const first = analyzeHtmlImport(runtime.html, file.name, { expandedResources: true });
      const matching = files.filter(item => item.file.name === file.name && item.file.size === file.size);
      const path = file.webkitRelativePath || (matching.length === 1 ? matching[0].path : file.name);
      const prepared = await prepareImportResources(first.sanitizedHtml, path, files, { expandedRuntime: true });
      const resourceStorage=Object.create(createProjectStorage(openingProject.current,folderPath)) as ReturnType<typeof createProjectStorage>;
      const pending=new Map(prepared.binaries.map(binary=>[binary.relPath,binary.base64]));
      resourceStorage.readBinary=async rel=>pending.get(rel)??createProjectStorage(openingProject.current,folderPath).readBinary(rel);
      const svg=await SvgMediaExternalizer.prepare({screen:{id:'import-source',name:first.title,position:{x:0,y:0},htmlContent:prepared.html,metadata:{importedHtml:{version:1,fileName:file.name,mode:'preserve',categories:[],changes:[],retained:[]}}},settings,designSystem,storage:resourceStorage,sourceImport:true});
      prepared.html=svg.screen.htmlContent;
      for(const binary of svg.resources.binaries)if(!prepared.binaries.some(old=>old.relPath===binary.relPath))prepared.binaries.push(binary);
      if(prepared.binaries.reduce((size,binary)=>size+atob(binary.base64).length,0)>30*1024*1024)throw Error(t('importHtml.errMediaTooLarge'));
      prepared.resources.push(...svg.resources.resources);prepared.warnings.push(...svg.resources.warnings);
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
  }, [file, files, t]);

  const extractedTheme = useMemo(() => {
    if (!data || !/^#[a-f\d]{6}$/i.test(primary)) return undefined;
    const theme = structuredClone(data.analysis.suggestedTheme);
    theme.tokens = applyBrandColor(theme.tokens, primary, false);
    theme.tokens.typography.sizes.md = baseSize;
    theme.tokens.radius.md = `${radius}px`;
    theme.tokens.personality.density = density;
    return theme;
  }, [data, primary, baseSize, radius, density, invalidPrimary]);
  const detectedStyle=useMemo(()=>data?extractPageStyle({id:'import-source',name:data.analysis.title,htmlContent:data.analysis.sanitizedHtml,position:{x:0,y:0},metadata:{importedHtml:{fileName:data.analysis.fileName,mode:'preserve',version:1,categories:[],changes:[],retained:[]}}},designSystem,settings.colorMode,settings.deviceProfile,'html-import'):undefined,[data,designSystem,settings.colorMode,settings.deviceProfile]);
  const updateSelectedStyle=!libraryReadOnly&&styleSelection.backgroundIds.length+styleSelection.fields.length>0;
  const effectiveTheme = useMemo(()=>{
    const base=useExtracted&&extractedTheme?extractedTheme:designSystem;
    return updateSelectedStyle&&detectedStyle?mergeExtractedStyle(base,detectedStyle,styleSelection,settings.colorMode):base;
  },[useExtracted,extractedTheme,designSystem,updateSelectedStyle,detectedStyle,styleSelection,settings.colorMode]);
  const effectiveMode = useExtracted ? themeMode : settings.colorMode;
  const conversion = useMemo(() => {
    if (!data || invalidPrimary) return undefined;
    try { return { result: convertHtmlImport(data.analysis, { mode, categories, designSystem: effectiveTheme, colorMode: effectiveMode,
      deviceProfile: settings.deviceProfile, useCustomNavigation, frameWidth: settings.frameWidth, referenceDeviceName: settings.referenceDevice?.name }) }; }
    catch (cause) { return { error: errorMessage(cause) }; }
  }, [data, mode, categories, effectiveTheme, effectiveMode, invalidPrimary, settings.deviceProfile, settings.frameWidth, settings.referenceDevice?.name, useCustomNavigation]);

  const importSettings=useMemo(()=>({...settings,colorMode:effectiveMode,useCustomNavigation}),[settings,effectiveMode,useCustomNavigation]);
  const previewKey=conversion?.result?importPreviewFingerprint({name:name.trim()||data!.analysis.title,htmlContent:conversion.result.htmlContent,
    scopedCss:conversion.result.scopedCss,metadata:{importedHtml:conversion.result.metadata}},importSettings,effectiveTheme):'';
  latestPreviewKey.current=previewKey;
  useEffect(() => {
    const result = conversion?.result;
    if (!data || !result) { setPreview(undefined); return; }
    let current = true;const media=createMediaResourceSession();
    setPreview(undefined);setPreviewReady(''); setPreviewError('');
    const storage = createProjectStorage(openingProject.current, folderPath);
    const memoryStorage = Object.create(storage) as typeof storage;
    const binaries = new Map(data.prepared.binaries.map(binary => [binary.relPath, binary.base64]));
    memoryStorage.readBinary = async path => binaries.get(path) ?? storage.readBinary(path);
    const baseScreen: Screen = { id: 'import-preview', name, position: { x: 0, y: 0 }, htmlContent: result.htmlContent, scopedCss: result.scopedCss, metadata: { importedHtml: result.metadata } };
    const options = { tokensCss: compileTokensToCss(effectiveTheme.tokens, effectiveMode), baseCss: '', screenOverrides: '', viewportHeight: resolveProjectViewport(settings).height, viewportWidth: settings.frameWidth };
    Promise.all([
      resolveImportedResources(data.analysis.sanitizedHtml, '', memoryStorage,new Set(),{referenceUrl:media.url}),
      resolveImportedResources(result.htmlContent, result.scopedCss, memoryStorage,new Set(),{referenceUrl:media.url})
    ]).then(([original, converted]) => {
      const resultDocument=new DOMParser().parseFromString(buildScreenDocument({ ...baseScreen, ...converted }, { ...options, deviceProfile: settings.deviceProfile, useCustomNavigation, includeMobileChrome: true }),'text/html');
      resultDocument.querySelectorAll('meta[name="taudesign-import-preview"]').forEach(meta=>meta.remove());
      const marker=resultDocument.createElement('meta');marker.name='taudesign-import-preview';marker.content=previewKey;resultDocument.head.append(marker);
      if (current) setPreview({key:previewKey,
        original: buildScreenDocument({ ...baseScreen, ...original }, options),
        result: '<!DOCTYPE html>'+resultDocument.documentElement.outerHTML
      });
    }).catch(cause => { if (current) setPreviewError(errorMessage(cause)); });
    return () => { current = false;void media.close().catch(()=>{}); };
  }, [data, conversion, effectiveTheme, effectiveMode, folderPath, name, settings.deviceProfile, settings.viewportGuideHeight, settings.referenceDevice, useCustomNavigation,previewKey]);

  const addResources = (selected: FileList | null, folder = false) => {
    if (!selected) return;
    const incoming = Array.from(selected).map(resource => ({
      path: folder && resource.webkitRelativePath ? resource.webkitRelativePath.split('/').slice(1).join('/') : resource.name,
      file: resource
    }));
    setFiles(prev => [...new Map([...prev, ...incoming].map(item => [item.path, item])).values()]);
  };
  const confirm = async () => {
    if (!data || !conversion?.result?.workflowContract || !preview || preview.key!==previewKey || previewReady!==previewKey || loading || saving || confirmBusy.current || wrongProject || invalidPrimary || previewError) return;
    confirmBusy.current=true;setSaving(true);setError('');
    const controller=new AbortController();importController.current=controller;
    const currentProject=useProjectStore.getState(),result=conversion.result;
    const assets=importResourceAssets(data.prepared);
    try{
      await currentProject.importHtmlScreen({name:name.trim()||data.analysis.title,htmlContent:result.htmlContent,scopedCss:result.scopedCss,
        metadata:{importedHtml:result.metadata}}, {
        projectId:openingProject.current,assets,...(settings.deviceProfile==='mobile'?{useCustomNavigation}:{}),
        ...(useExtracted||updateSelectedStyle?{designSystem:effectiveTheme,colorMode:effectiveMode}:{}),
        ...(!empty&&updateSelectedStyle?{themeUpdate:{expectedKey:styleApplicationKey(currentProject),syncScreenIds:[]}}:{})
      },{contract:result.workflowContract!,preview:{version:1,fingerprint:preview.key},resources:data.prepared,signal:controller.signal,
        isCurrent:()=>alive.current&&latestPreviewKey.current===preview.key});
      if(alive.current)onClose();
    }catch(cause){if(alive.current)setError(errorMessage(cause));}
    finally{confirmBusy.current=false;if(importController.current===controller)importController.current=undefined;if(alive.current)setSaving(false);}
  };

  return <div role="dialog" aria-modal="true" aria-label={t('importHtml.dialogAria')} className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
    <div className="flex h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 text-slate-200 shadow-2xl">
      <div className="flex shrink-0 items-center justify-between border-b border-slate-800 px-5 py-4">
        <div><h2 className="flex items-center gap-2 text-sm font-semibold"><FileCode size={17} />{t('importHtml.title')}</h2><p className="mt-1 text-xs text-slate-400">{t('importHtml.hint')}</p></div>
        <button aria-label={t('importHtml.closeAria')} disabled={saving} onClick={onClose} className="p-1 text-slate-400 hover:text-white"><X size={18} /></button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-auto md:flex-row">
        <div className="w-full shrink-0 space-y-4 border-r border-slate-800 p-5 md:w-[350px] md:overflow-y-auto">
          <input ref={htmlInput} aria-label={t('importHtml.pickHtmlAria')} type="file" accept=".html,.htm,text/html" className="hidden" onChange={event => { setFile(event.target.files?.[0]); event.target.value = ''; }} />
          <input ref={resourceInput} aria-label={t('importHtml.pickResourcesAria')} type="file" multiple className="hidden" onChange={event => { addResources(event.target.files); event.target.value = ''; }} />
          <input ref={folderInput} aria-label={t('importHtml.pickFolderAria')} type="file" multiple {...({ webkitdirectory: '', directory: '' } as React.InputHTMLAttributes<HTMLInputElement>)} className="hidden" onChange={event => { addResources(event.target.files, true); event.target.value = ''; }} />
          <button onClick={() => htmlInput.current?.click()} disabled={saving} className="w-full rounded-lg border border-dashed border-slate-600 bg-slate-950 p-3 text-left text-xs hover:border-blue-400"><FileCode size={16} className="mb-2 text-blue-400" />{file?.name || t('importHtml.pickHtml')}<span className="mt-1 block text-slate-500">{t('importHtml.pickHtmlHint')}</span></button>
          <div className="flex flex-wrap gap-2 text-xs"><button onClick={() => resourceInput.current?.click()} disabled={!file || saving} className="rounded bg-slate-800 px-2 py-1.5 disabled:opacity-40">{t('importHtml.addResources')}</button><button onClick={() => folderInput.current?.click()} disabled={!file || saving} className="flex items-center gap-1 rounded bg-slate-800 px-2 py-1.5 disabled:opacity-40"><FolderOpen size={12} />{t('importHtml.pickResourceFolder')}</button>{files.length > 0 && <button onClick={() => setFiles([])} disabled={saving} className="text-slate-400">{t('importHtml.clearFiles', { count: files.length })}</button>}</div>
          <p className="text-[11px] leading-relaxed text-slate-500">{t('importHtml.resourceFolderHelp')}</p>
          {loading && <p className="flex items-center gap-2 text-xs text-blue-300"><Loader2 className="animate-spin" size={14} />{t('importHtml.analyzing')}</p>}
          {(error || wrongProject || invalidPrimary || conversion?.error || previewError) && <p role="alert" className="rounded-lg border border-red-800 bg-red-950/40 p-3 text-xs text-red-200">{wrongProject ? t('importHtml.errWrongProject') : invalidPrimary ? t('importHtml.errInvalidPrimary') : error || conversion?.error || previewError}</p>}
          {data && <>
            <label className="block space-y-1.5 text-xs text-slate-400">{t('importHtml.pageName')}<input aria-label={t('importHtml.pageNameAria')} value={name} onChange={event => setName(event.target.value)} className={inputClass} /></label>
            {detectedStyle&&<details className="rounded-lg border border-slate-700 p-3"><summary className="cursor-pointer text-xs font-medium">{t('importHtml.detectedStyleSummary')}</summary><p className="my-3 text-[11px] leading-relaxed text-slate-400">{t('importHtml.detectedStyleHint')}{libraryReadOnly?t('importHtml.libraryReadOnlyHint'):''}</p><ExtractedStyleChoices analysis={detectedStyle} selection={styleSelection} onChange={setStyleSelection} theme={designSystem} mode={settings.colorMode} disabled={libraryReadOnly||saving}/></details>}
            <fieldset className="space-y-2"><legend className="mb-2 text-xs font-semibold">{t('importHtml.modeLegend')}</legend>{modes.map(option => <label key={option.id} className={`block cursor-pointer rounded-lg border p-2.5 text-xs ${mode === option.id ? 'border-blue-500 bg-blue-950/30' : 'border-slate-700'}`}><span className="flex items-center gap-2"><input type="radio" name="html-import-mode" aria-label={option.name} checked={mode === option.id} onChange={() => setMode(option.id)} />{option.name}</span><span className="mt-1.5 block pl-5 text-[11px] leading-relaxed text-slate-400">{option.desc}</span></label>)}</fieldset>
            {mode === 'selective' && <div className="flex flex-wrap gap-3">{categoriesList.map(item => <label key={item.id} className="flex items-center gap-1.5 text-xs"><input aria-label={t('importHtml.unifyCategoryAria', { name: item.name })} type="checkbox" checked={categories.includes(item.id)} onChange={event => setCategories(prev => event.target.checked ? [...prev, item.id] : prev.filter(id => id !== item.id))} />{item.name}</label>)}</div>}
            <MobileNavigationOption disabled={saving} value={useCustomNavigation} onChange={setUseCustomNavigation} />
            {empty && <div className="space-y-3 rounded-lg border border-slate-700 p-3"><label className="flex items-center gap-2 text-xs font-medium"><input type="checkbox" aria-label={t('importHtml.extractTheme')} disabled={libraryReadOnly} title={libraryReadOnly?t('importHtml.libraryReadOnlyTitle'):undefined} checked={extract&&!libraryReadOnly} onChange={event => setExtract(event.target.checked)} />{t('importHtml.extractTheme')}</label><p className="text-[11px] leading-relaxed text-slate-400">{t('importHtml.extractThemeHint')}</p>{extract && !libraryReadOnly && <>
              <label className="block text-xs text-slate-400">{t('importHtml.extractPrimary')}<input aria-label={t('importHtml.extractPrimary')} value={primary} onChange={event => setPrimary(event.target.value)} className={`${inputClass} mt-1`} /></label>
              <div className="grid grid-cols-2 gap-2"><label className="text-xs text-slate-400">{t('importHtml.extractBaseSize')}<input aria-label={t('importHtml.extractBaseSizeAria')} type="number" min={12} max={24} value={baseSize} onChange={event => setBaseSize(Math.max(12, Math.min(24, Number(event.target.value) || 16)))} className={`${inputClass} mt-1`} /></label><label className="text-xs text-slate-400">{t('importHtml.extractRadius')}<input aria-label={t('importHtml.extractRadiusAria')} type="number" min={0} max={32} value={radius} onChange={event => setRadius(Math.max(0, Math.min(32, Number(event.target.value) || 0)))} className={`${inputClass} mt-1`} /></label></div>
              <select aria-label={t('importHtml.densityAria')} value={density} onChange={event => setDensity(event.target.value as typeof density)} className={inputClass}><option value="compact">{t('importHtml.densityCompact')}</option><option value="standard">{t('importHtml.densityStandard')}</option><option value="relaxed">{t('importHtml.densityRelaxed')}</option></select>
              <select aria-label={t('importHtml.themeModeAria')} value={themeMode} onChange={event => setThemeMode(event.target.value as typeof themeMode)} className={inputClass}><option value="light">{t('importHtml.themeLight')}</option><option value="dark">{t('importHtml.themeDark')}</option></select>
            </>}</div>}
          </>}
        </div>
        <div className="min-w-0 flex-1 space-y-4 p-5 md:overflow-y-auto">
          {!data ? <div className="flex min-h-80 items-center justify-center text-sm text-slate-500">{t('importHtml.emptyPreview')}</div> : <>
            <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="text-sm font-medium">{data.analysis.title}</h3><p className="mt-1 text-xs text-slate-400">{t('importHtml.analysisStats', { nodes: data.analysis.nodeCount, styles: data.analysis.styleSummary.styleSheetCount, resources: data.prepared.resources.filter(item => item.status === 'resolved').length })}</p></div><div className="flex gap-2 text-xs"><button onClick={() => setPreviewTab('pages')} className={`rounded px-3 py-1.5 ${previewTab === 'pages' ? 'bg-blue-600' : 'bg-slate-800'}`}>{t('importHtml.tabPages')}</button><button onClick={() => setPreviewTab('theme')} className={`rounded px-3 py-1.5 ${previewTab === 'theme' ? 'bg-blue-600' : 'bg-slate-800'}`}>{t('importHtml.tabTheme')}</button></div></div>
            <p className="text-xs text-slate-400">{t('importHtml.viewportHint', { width: settings.frameWidth, height: resolveProjectViewport(settings).height })}</p>
            {data.analysis.detectedWidth && Math.abs(data.analysis.detectedWidth - settings.frameWidth) > 50 && <p className="rounded-lg bg-amber-950/40 p-3 text-xs text-amber-200">{t('importHtml.widthMismatch', { detected: data.analysis.detectedWidth, frame: settings.frameWidth })}</p>}
            {previewTab === 'theme' ? <div className="h-[510px] overflow-hidden rounded-lg border border-slate-700"><DesignSystemVisualPreview theme={effectiveTheme} colorMode={useExtracted ? themeMode : previewMode} onColorModeChange={useExtracted ? setThemeMode : setPreviewMode} device={settings.deviceProfile} /></div> : preview ? <div className="grid grid-cols-1 gap-3 lg:grid-cols-2"><div><p className="mb-2 text-xs text-slate-400">{t('importHtml.originalPage')}</p><PreviewFrame html={preview.original} title={t('importHtml.originalPreviewTitle')} width={settings.frameWidth} viewportHeight={resolveProjectViewport(settings).height} /></div><div><p className="mb-2 text-xs text-slate-400">{t('importHtml.resultPage', { mode: modes.find(item => item.id === mode)?.name ?? '' })}</p><PreviewFrame key={preview.key} previewKey={preview.key} onReady={()=>{if(latestPreviewKey.current===preview.key)setPreviewReady(preview.key);}} html={preview.result} title={t('importHtml.resultPreviewTitle')} width={settings.frameWidth} viewportHeight={resolveProjectViewport(settings).height} /></div></div> : <p className="py-10 text-center text-xs text-slate-400">{t('importHtml.preparingPreview')}</p>}
            <div className="grid gap-3 lg:grid-cols-2"><div className="rounded-lg border border-slate-700 p-3 text-xs"><h4 className="mb-2 font-semibold">{t('importHtml.changesTitle')}</h4><ul className="space-y-1.5 text-slate-400">{(conversion?.result?.changes.length ? conversion.result.changes : [t('importHtml.changesFallback')]).map((item, i) => <li key={i}>{item}</li>)}</ul></div><div className="rounded-lg border border-slate-700 p-3 text-xs"><h4 className="mb-2 font-semibold">{t('importHtml.retainedTitle')}</h4><ul className="max-h-44 space-y-1.5 overflow-auto break-words text-slate-400">{[...data.warnings, ...conversion?.result?.retained ?? [], ...data.prepared.resources.filter(item => item.status !== 'resolved').map(item => `${item.status === 'missing' ? t('importHtml.resourceMissing') : t('importHtml.resourceRemote')}：${item.url}`)].map((item, i) => <li key={i}>{item}</li>)}</ul></div></div>
          </>}
        </div>
      </div>
      <div className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-800 px-5 py-3"><p className="text-[11px] text-slate-500">{data&&previewReady!==previewKey?t('importHtml.footerNeedPreview'):t('importHtml.footerUndoHint')}</p><div className="flex gap-2"><button disabled={saving} onClick={onClose} className="rounded-lg bg-slate-800 px-4 py-2 text-xs">{t('common.cancel')}</button><button onClick={confirm} disabled={!data || !preview || preview.key!==previewKey || previewReady!==previewKey || !!previewError || !!conversion?.error || invalidPrimary || loading || saving || wrongProject} className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white disabled:opacity-40">{saving ? t('importHtml.confirming') : t('importHtml.confirm')}</button></div></div>
    </div>
  </div>;
};
