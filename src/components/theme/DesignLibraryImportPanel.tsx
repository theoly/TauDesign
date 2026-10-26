import {DesignLibrarySourceEditor} from './DesignLibrarySourceEditor';
import React,{useEffect,useRef,useState} from 'react';
import {useProjectStore} from '../../stores/useProjectStore';
import {isDesktopRuntime,pickProjectFolder} from '../../services/storage/folderPicker';
import {createProjectStorage} from '../../services/storage/projectStorage';
import {applyDesignLibraryImport,designLibraryImportContext,isDesignLibraryImportEvidence,prepareDesignLibraryImport,type DesignLibraryImportPreview} from '../../services/ai/designLibraryImport';
import type {DesignLibraryBinding} from '../../types/project';
import {libraryReferenceIssue} from '../../services/ai/designLibraryReference';
import {DesignSystemVisualPreview} from './DesignSystemVisualPreview';

export function DesignLibraryImportPanel(){
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
    busyRef.current=true;setBusy(true);setPreview(null);setStatus('正在选择来源工程…');
    const controller=new AbortController();controllerRef.current=controller;
    const initial=useProjectStore.getState(),context=designLibraryImportContext(initial);
    const isCurrent=()=>mounted.current&&controllerRef.current===controller&&designLibraryImportContext(useProjectStore.getState())===context;
    try{
      const folder=await pickProjectFolder('选择作为设计库来源的 .aidesign 工程');
      if(controller.signal.aborted||!isCurrent())throw new Error('目标工程已变化或导入已取消，请重新选择。');
      if(!folder){setStatus('未选择来源工程。');return;}
      if(folder===initial.folderPath)throw new Error('不能将当前工程作为自己的设计库来源。');
      setStatus('正在只读分析来源工程，尚未导入…');
      const result=await prepareDesignLibraryImport(createProjectStorage('design-library-source',folder),initial,{signal:controller.signal,isCurrent,mode:effectiveMode});
      if(!isCurrent()||controller.signal.aborted)return;
      previewContext.current=context;setPreview(result);setStatus('分析完成，请检查影响范围后确认。');
    }catch(error){if(mounted.current)setStatus(error instanceof Error?error.message:'设计库分析失败。');}
    finally{busyRef.current=false;if(mounted.current)setBusy(false);if(controllerRef.current===controller)controllerRef.current=null;}
  };
  const confirm=async()=>{
    if(!preview||stale||busyRef.current)return;
    busyRef.current=true;setBusy(true);setStatus('正在重新核对来源并导入…');
    const controller=new AbortController();controllerRef.current=controller;
    try{
      const result=await applyDesignLibraryImport(preview,{getState:()=>useProjectStore.getState(),
        commit:copy=>useProjectStore.getState().applyDesignLibraryCopy(copy),signal:controller.signal,isCurrent:()=>mounted.current});
      if(mounted.current){setStatus(result.message);setPreview(null);}
    }finally{busyRef.current=false;if(mounted.current)setBusy(false);if(controllerRef.current===controller)controllerRef.current=null;}
  };
  const cancel=()=>{controllerRef.current?.abort();setPreview(null);setStatus(busy?'正在取消本次导入…':'本次导入已取消。');};
  const binding=project.designLibraryBinding;
  return <section aria-label="设计库来源与使用方式" className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-2 text-[11px]">
    <div className="font-semibold text-slate-200 text-xs">设计库来源与使用方式</div>
    <p className="text-slate-500">从另一 .aidesign 工程复制 Token、组件及其引用的本地资源；来源工程只读。先预览，确认后导入。</p>
    <fieldset disabled={busy||reference} className="space-y-1 disabled:opacity-60" aria-label="设计库使用方式">
      <label className="flex items-center gap-2"><input type="radio" name="library-mode" checked={effectiveMode==='project_copy'} onChange={()=>{setMode('project_copy');setPreview(null);}}/>项目副本，可自由修改</label>
      <label className="flex items-center gap-2"><input type="radio" name="library-mode" checked={effectiveMode==='pinned_reference'} onChange={()=>{setMode('pinned_reference');setPreview(null);}}/>固定版本只读参考</label>
    </fieldset>
    {reference&&<div className="text-amber-200 space-y-1"><p>Token、库组件定义与资源只读；本地缓存可离线使用。更新需重新选择同一来源并确认，已有页面实例不会自动改写。</p>
      <button type="button" disabled={busy} onClick={()=>{project.detachDesignLibraryReference();setMode('project_copy');setPreview(null);setStatus('已转为项目副本，可自由编辑；支持撤销。');}} className="rounded border border-slate-700 px-2 py-1 disabled:opacity-40">转为项目副本</button></div>}
    {referenceIssue&&<p role="alert" className="text-red-300">{referenceIssue}</p>}
    {binding&&<div className="space-y-1 text-blue-300"><p>当前来源：{binding.sourceName} · Token v{binding.sourceTokenVersion}</p><p className="break-all">来源版本：{binding.sourceFingerprint}</p>
      {binding.importEvidence&&(isDesignLibraryImportEvidence(binding.importEvidence)&&binding.importEvidence.sourceFingerprint===binding.sourceFingerprint?<details className="text-slate-500">
        <summary className="cursor-pointer">查看上次导入检查</summary>
        <p>{new Date(binding.importEvidence.checkedAt).toLocaleString()} · 导入时核对了 {binding.importEvidence.files.length} 个资源文件；历史记录不表示来源始终未变。</p>
        <p className="break-all">预览 {binding.importEvidence.previewFingerprint} · 目标上下文 {binding.importEvidence.targetContextFingerprint}</p>
        {binding.importEvidence.files.map(file=><p key={file.relPath} className="break-all">{file.relPath} · {file.fingerprint}</p>)}
      </details>:<p className="text-amber-300">导入检查记录不完整，仍可重新选择并分析来源。</p>)}</div>}
    <button type="button" disabled={!isDesktopRuntime()||busy} onClick={()=>void choose()} className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-200 disabled:opacity-40 hover:bg-slate-700">{busy?'正在处理…':preview?'重新选择设计库':reference?'检查并更新参考':effectiveMode==='pinned_reference'?'从其他工程导入只读参考':'从其他工程导入副本'}</button>
    {preview&&<div aria-label="设计库导入预览" className="space-y-2 rounded-lg border border-slate-700 p-2">
      <p className="font-medium text-slate-200">{preview.source.sourceName} · {preview.source.sourceDeviceProfile} · Token v{preview.source.sourceTokenVersion}</p>
      <p className="break-all text-slate-500">来源版本：{preview.source.sourceFingerprint}</p>
      <p className="text-slate-400">{preview.themeChanged?'将替换当前项目主题':'主题 Token 相同'}；新增 {preview.components.filter(c=>c.action==='add').length} 个组件，替换 {preview.components.filter(c=>c.action==='replace').length} 个组件；新增 {preview.assets.filter(a=>a.action==='add').length} 个资源。</p>
      {preview.components.some(c=>c.action==='replace')&&<p className="text-amber-300">已有同源组件定义将被替换，包含项目内的自定义修改；现有页面实例不会自动重写。旧定义和旧图会保留供原页面使用。</p>}
      <details><summary className="cursor-pointer text-slate-400">查看组件与资源清单</summary><ul className="max-h-40 overflow-auto text-slate-500">
        {preview.components.map(c=><li key={c.id}>{c.action==='add'?'新增':'替换'}组件：{c.name}</li>)}
        {preview.assets.map(a=><li key={a.id} className="break-all">{a.action==='add'?'新增':'复用'}资源：{a.name} · {a.relPath}</li>)}</ul></details>
      <details><summary className="cursor-pointer text-slate-400">预览来源主题</summary><DesignSystemVisualPreview theme={preview.theme} device={preview.source.sourceDeviceProfile} compact/></details>
      {preview.conflicts.map((message,index)=><p key={index} role="alert" className="text-red-300">{message}</p>)}
      {stale&&<p role="alert" className="text-amber-300">目标工程或设计内容已变化，请重新选择并分析。</p>}
      <button type="button" disabled={busy||stale||Boolean(preview.conflicts.length)} onClick={()=>void confirm()} className="rounded-lg bg-blue-600 px-3 py-1.5 text-white disabled:opacity-40">{preview.source.mode==='pinned_reference'?'确认固定版本参考':'确认导入项目副本'}</button>
      <button type="button" onClick={cancel} className="ml-2 text-slate-400">取消导入</button>
    </div>}
    {busy&&!preview&&<button type="button" onClick={cancel} className="text-slate-400">取消导入</button>}
    <DesignLibrarySourceEditor disabled={busy||Boolean(preview)}/>
    {status&&<p role="status" className="text-slate-400 whitespace-pre-wrap break-words">{status}</p>}
  </section>;
}
