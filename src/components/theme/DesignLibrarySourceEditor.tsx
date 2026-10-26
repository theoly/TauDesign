import React,{useEffect,useRef,useState} from 'react';
import {useProjectStore} from '../../stores/useProjectStore';
import {useWorkspaceStore} from '../../stores/useWorkspaceStore';
import {isDesktopRuntime,pickProjectFolder} from '../../services/storage/folderPicker';
import {createProjectStorage} from '../../services/storage/projectStorage';
import {prepareLibrarySourceEdit,sourceEditContext,type LibrarySourcePreview} from '../../services/ai/designLibrarySource';

export function DesignLibrarySourceEditor({disabled=false}:{disabled?:boolean}){
 const project=useProjectStore(),workspace=useWorkspaceStore();
 const [preview,setPreview]=useState<LibrarySourcePreview|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const controller=useRef<AbortController|null>(null),mounted=useRef(true),locked=useRef(false),context=useRef('');
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;controller.current?.abort();};},[]);
 const stale=Boolean(preview&&context.current!==sourceEditContext(project));
 const choose=async()=>{
  if(locked.current)return;locked.current=true;setBusy(true);setPreview(null);setMessage('正在只读核对来源工程…');
  const job=new AbortController();controller.current=job;
  const origin=useProjectStore.getState(),key=sourceEditContext(origin),navigation=useWorkspaceStore.getState().navigationRevision;
  const current=()=>mounted.current&&controller.current===job&&!job.signal.aborted&&sourceEditContext(useProjectStore.getState())===key&&useWorkspaceStore.getState().navigationRevision===navigation;
  try{
   const folder=await pickProjectFolder('重新选择需要编辑的设计库源工程');
   if(!current())throw Error('当前工程已变化或选择已取消。');
   if(!folder){setMessage('未选择来源工程。');return;}
   const result=await prepareLibrarySourceEdit(createProjectStorage('library-source-editor',folder),folder,origin,{isCurrent:current,signal:job.signal});
   if(current()){context.current=key;setPreview(result);setMessage('已核对来源，确认后进入源工程编辑。');}
  }catch(error){if(mounted.current)setMessage(error instanceof Error?error.message:'读取失败。');}
  finally{locked.current=false;if(mounted.current)setBusy(false);if(controller.current===job)controller.current=null;}
 };
 const enter=async()=>{
  if(!preview||locked.current||stale)return;locked.current=true;setBusy(true);setMessage('正在保存当前项目并重新核对来源…');
  const job=new AbortController();controller.current=job;
  try{const ok=await useWorkspaceStore.getState().enterLibrarySource(preview,job.signal);if(mounted.current){setPreview(null);setMessage(ok?'已进入源库编辑。':useWorkspaceStore.getState().sourceTransitionError??'未进入源库。');}}
  finally{locked.current=false;if(mounted.current)setBusy(false);if(controller.current===job)controller.current=null;}
 };
 if(!project.designLibraryBinding)return null;
 return <div className="space-y-2 border-t border-slate-800 pt-2" aria-label="编辑设计库源工程">
  <p className="text-slate-500">编辑源库会切换至来源工程；当前项目缓存与页面不自动更新。</p>
  <button type="button" disabled={disabled||busy||!isDesktopRuntime()||Boolean(workspace.sourceEditing||workspace.sourceTransition)} onClick={()=>void choose()} className="rounded border border-slate-700 px-2 py-1 text-slate-300 disabled:opacity-40">编辑源库：选择来源工程</button>
  {preview&&<div className="space-y-2 rounded border border-slate-700 p-2" aria-label="源库编辑预览">
   <p className="font-medium text-slate-200">{preview.sourceName} · Token v{preview.sourceTokenVersion}</p>
   <p className="text-slate-400">{preview.componentCount} 个组件 · {preview.pageCount} 个页面 · {preview.changed?'来源较已绑定版本有变化':'来源与已绑定版本一致'}</p>
   <p className="break-all text-slate-500">来源版本 {preview.sourceFingerprint}</p>
   <p className="text-slate-400">进入前保存当前工程、候选和撤销历史。源工程正常自动保存；返回后需预览确认更新引用。</p>
   {preview.upstreamReadOnly&&<p className="text-amber-300">来源工程自身使用只读参考，其原有保护继续生效。</p>}
   {stale&&<p role="alert" className="text-amber-300">当前项目已变化，请重新选择来源。</p>}
   <button type="button" disabled={busy||disabled||stale} onClick={()=>void enter()} className="rounded bg-blue-600 px-2 py-1 text-white disabled:opacity-40">确认进入源库编辑</button>
  </div>}
  {(busy||preview)&&<button type="button" onClick={()=>{controller.current?.abort();setPreview(null);setMessage('已取消源库编辑。');}} className="text-slate-400">取消源库编辑</button>}
  {message&&<p role="status" className="break-words text-slate-400">{message}</p>}
 </div>;
}
