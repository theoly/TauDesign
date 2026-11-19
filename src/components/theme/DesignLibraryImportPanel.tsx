import {DesignLibrarySourceEditor} from './DesignLibrarySourceEditor';
import React,{useEffect,useRef,useState} from 'react';
import {useProjectStore} from '../../stores/useProjectStore';
import {useT} from '../../stores/useLocaleStore';
import {isDesktopRuntime,pickProjectFolder} from '../../services/storage/folderPicker';
import {createProjectStorage} from '../../services/storage/projectStorage';
import {applyDesignLibraryImport,designLibraryImportContext,isDesignLibraryImportEvidence,prepareDesignLibraryImport,type DesignLibraryImportPreview} from '../../services/ai/designLibraryImport';
import type {DesignLibraryBinding} from '../../types/project';
import {libraryReferenceIssue} from '../../services/ai/designLibraryReference';
import {DesignSystemVisualPreview} from './DesignSystemVisualPreview';

export function DesignLibraryImportPanel(){
  const t=useT();
  const project=useProjectStore(),[preview,setPreview]=useState<DesignLibraryImportPreview|null>(null);
  const [busy,setBusy]=useState(false),[status,setStatus]=useState('');
  const [mode,setMode]=useState<DesignLibraryBinding['mode']>('project_copy');
  const reference=project.designLibraryBinding?.mode==='pinned_reference';
  const effectiveMode=reference?'pinned_reference':mode;
  const referenceIssue=libraryReferenceIssue(project);
  const controllerRef=useRef<AbortController|null>(null),busyRef=useRef(false),mounted=useRef(true),previewContext=useRef('');
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;controllerRef.current?.abort();};},[]);
  const stale=Boolean(preview&&previewContext.current!==designLibraryImportContext(project));
  const choose=async()=>{
    if(busyRef.current)return;
    busyRef.current=true;setBusy(true);setPreview(null);setStatus(t('library.statusChoosing'));
    const controller=new AbortController();controllerRef.current=controller;
    const initial=useProjectStore.getState(),context=designLibraryImportContext(initial);
    const isCurrent=()=>mounted.current&&controllerRef.current===controller&&designLibraryImportContext(useProjectStore.getState())===context;
    try{
      const folder=await pickProjectFolder(t('library.pickFolderTitle'));
      if(controller.signal.aborted||!isCurrent())throw new Error(t('library.errTargetChanged'));
      if(!folder){setStatus(t('library.statusNoFolder'));return;}
      if(folder===initial.folderPath)throw new Error(t('library.errSelfSource'));
      setStatus(t('library.statusAnalyzing'));
      const result=await prepareDesignLibraryImport(createProjectStorage('design-library-source',folder),initial,{signal:controller.signal,isCurrent,mode:effectiveMode});
      if(!isCurrent()||controller.signal.aborted)return;
      previewContext.current=context;setPreview(result);setStatus(t('library.statusReady'));
    }catch(error){if(mounted.current)setStatus(error instanceof Error?error.message:t('library.errAnalyzeFailed'));}
    finally{busyRef.current=false;if(mounted.current)setBusy(false);if(controllerRef.current===controller)controllerRef.current=null;}
  };
  const confirm=async()=>{
    if(!preview||stale||busyRef.current)return;
    busyRef.current=true;setBusy(true);setStatus(t('library.statusImporting'));
    const controller=new AbortController();controllerRef.current=controller;
    try{
      const result=await applyDesignLibraryImport(preview,{getState:()=>useProjectStore.getState(),
        commit:copy=>useProjectStore.getState().applyDesignLibraryCopy(copy),signal:controller.signal,isCurrent:()=>mounted.current});
      if(mounted.current){setStatus(result.message);setPreview(null);}
    }finally{busyRef.current=false;if(mounted.current)setBusy(false);if(controllerRef.current===controller)controllerRef.current=null;}
  };
  const cancel=()=>{controllerRef.current?.abort();setPreview(null);setStatus(busy?t('library.statusCancelling'):t('library.statusCancelled'));};
  const binding=project.designLibraryBinding;
  const primaryAction=busy?t('library.busyProcessing'):preview?t('library.reselect'):reference?t('library.checkUpdate'):effectiveMode==='pinned_reference'?t('library.importPinned'):t('library.importCopy');
  return <section aria-label={t('library.sectionAria')} className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-2 text-[11px]">
    <div className="font-semibold text-slate-200 text-xs">{t('library.title')}</div>
    <p className="text-slate-500">{t('library.intro')}</p>
    <fieldset disabled={busy||reference} className="space-y-1 disabled:opacity-60" aria-label={t('library.modeAria')}>
      <label className="flex items-center gap-2"><input type="radio" name="library-mode" checked={effectiveMode==='project_copy'} onChange={()=>{setMode('project_copy');setPreview(null);}}/>{t('library.modeCopy')}</label>
      <label className="flex items-center gap-2"><input type="radio" name="library-mode" checked={effectiveMode==='pinned_reference'} onChange={()=>{setMode('pinned_reference');setPreview(null);}}/>{t('library.modePinned')}</label>
    </fieldset>
    {reference&&<div className="text-amber-200 space-y-1"><p>{t('library.referenceReadonlyHint')}</p>
      <button type="button" disabled={busy} onClick={()=>{project.detachDesignLibraryReference();setMode('project_copy');setPreview(null);setStatus(t('library.convertedToCopy'));}} className="rounded border border-slate-700 px-2 py-1 disabled:opacity-40">{t('library.convertToCopy')}</button></div>}
    {referenceIssue&&<p role="alert" className="text-red-300">{referenceIssue}</p>}
    {binding&&<div className="space-y-1 text-blue-300"><p>{t('library.currentSource',{name:binding.sourceName,version:binding.sourceTokenVersion})}</p><p className="break-all">{t('library.sourceVersion',{fingerprint:binding.sourceFingerprint})}</p>
      {binding.importEvidence&&(isDesignLibraryImportEvidence(binding.importEvidence)&&binding.importEvidence.sourceFingerprint===binding.sourceFingerprint?<details className="text-slate-500">
        <summary className="cursor-pointer">{t('library.viewLastCheck')}</summary>
        <p>{t('library.lastCheckSummary',{time:new Date(binding.importEvidence.checkedAt).toLocaleString(),count:binding.importEvidence.files.length})}</p>
        <p className="break-all">{t('library.lastCheckFingerprints',{preview:binding.importEvidence.previewFingerprint,target:binding.importEvidence.targetContextFingerprint})}</p>
        {binding.importEvidence.files.map(file=><p key={file.relPath} className="break-all">{file.relPath} · {file.fingerprint}</p>)}
      </details>:<p className="text-amber-300">{t('library.incompleteEvidence')}</p>)}</div>}
    <button type="button" disabled={!isDesktopRuntime()||busy} onClick={()=>void choose()} className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-200 disabled:opacity-40 hover:bg-slate-700">{primaryAction}</button>
    {preview&&<div aria-label={t('library.previewAria')} className="space-y-2 rounded-lg border border-slate-700 p-2">
      <p className="font-medium text-slate-200">{preview.source.sourceName} · {preview.source.sourceDeviceProfile} · Token v{preview.source.sourceTokenVersion}</p>
      <p className="break-all text-slate-500">{t('library.sourceVersion',{fingerprint:preview.source.sourceFingerprint})}</p>
      <p className="text-slate-400">{t('library.previewStats',{theme:preview.themeChanged?t('library.themeReplace'):t('library.themeSame'),addComponents:preview.components.filter(c=>c.action==='add').length,replaceComponents:preview.components.filter(c=>c.action==='replace').length,addAssets:preview.assets.filter(a=>a.action==='add').length})}</p>
      {preview.components.some(c=>c.action==='replace')&&<p className="text-amber-300">{t('library.replaceWarning')}</p>}
      <details><summary className="cursor-pointer text-slate-400">{t('library.viewManifest')}</summary><ul className="max-h-40 overflow-auto text-slate-500">
        {preview.components.map(c=><li key={c.id}>{c.action==='add'?t('library.addComponent',{name:c.name}):t('library.replaceComponent',{name:c.name})}</li>)}
        {preview.assets.map(a=><li key={a.id} className="break-all">{a.action==='add'?t('library.addAsset',{name:a.name,path:a.relPath}):t('library.reuseAsset',{name:a.name,path:a.relPath})}</li>)}</ul></details>
      <details><summary className="cursor-pointer text-slate-400">{t('library.previewTheme')}</summary><DesignSystemVisualPreview theme={preview.theme} device={preview.source.sourceDeviceProfile} compact/></details>
      {preview.conflicts.map((message,index)=><p key={index} role="alert" className="text-red-300">{message}</p>)}
      {stale&&<p role="alert" className="text-amber-300">{t('library.staleTarget')}</p>}
      <button type="button" disabled={busy||stale||Boolean(preview.conflicts.length)} onClick={()=>void confirm()} className="rounded-lg bg-blue-600 px-3 py-1.5 text-white disabled:opacity-40">{preview.source.mode==='pinned_reference'?t('library.confirmPinned'):t('library.confirmCopy')}</button>
      <button type="button" onClick={cancel} className="ml-2 text-slate-400">{t('library.cancelImport')}</button>
    </div>}
    {busy&&!preview&&<button type="button" onClick={cancel} className="text-slate-400">{t('library.cancelImport')}</button>}
    <DesignLibrarySourceEditor disabled={busy||Boolean(preview)}/>
    {status&&<p role="status" className="text-slate-400 whitespace-pre-wrap break-words">{status}</p>}
  </section>;
}
