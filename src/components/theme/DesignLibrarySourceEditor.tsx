import React,{useEffect,useRef,useState} from 'react';
import {useProjectStore} from '../../stores/useProjectStore';
import {useWorkspaceStore} from '../../stores/useWorkspaceStore';
import {useT} from '../../stores/useLocaleStore';
import {isDesktopRuntime,pickProjectFolder} from '../../services/storage/folderPicker';
import {createProjectStorage} from '../../services/storage/projectStorage';
import {prepareLibrarySourceEdit,sourceEditContext,type LibrarySourcePreview} from '../../services/ai/designLibrarySource';

export function DesignLibrarySourceEditor({disabled=false}:{disabled?:boolean}){
 const t=useT();
 const project=useProjectStore(),workspace=useWorkspaceStore();
 const [preview,setPreview]=useState<LibrarySourcePreview|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const controller=useRef<AbortController|null>(null),mounted=useRef(true),locked=useRef(false),context=useRef('');
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;controller.current?.abort();};},[]);
 const stale=Boolean(preview&&context.current!==sourceEditContext(project));
 const choose=async()=>{
  if(locked.current)return;locked.current=true;setBusy(true);setPreview(null);setMessage(t('library.sourceEditChecking'));
  const job=new AbortController();controller.current=job;
  const origin=useProjectStore.getState(),key=sourceEditContext(origin),navigation=useWorkspaceStore.getState().navigationRevision;
  const current=()=>mounted.current&&controller.current===job&&!job.signal.aborted&&sourceEditContext(useProjectStore.getState())===key&&useWorkspaceStore.getState().navigationRevision===navigation;
  try{
   const folder=await pickProjectFolder(t('library.sourceEditPickTitle'));
   if(!current())throw Error(t('library.sourceEditErrChanged'));
   if(!folder){setMessage(t('library.sourceEditNoFolder'));return;}
   const result=await prepareLibrarySourceEdit(createProjectStorage('library-source-editor',folder),folder,origin,{isCurrent:current,signal:job.signal});
   if(current()){context.current=key;setPreview(result);setMessage(t('library.sourceEditReady'));}
  }catch(error){if(mounted.current)setMessage(error instanceof Error?error.message:t('library.sourceEditReadFailed'));}
  finally{locked.current=false;if(mounted.current)setBusy(false);if(controller.current===job)controller.current=null;}
 };
 const enter=async()=>{
  if(!preview||locked.current||stale)return;locked.current=true;setBusy(true);setMessage(t('library.sourceEditSaving'));
  const job=new AbortController();controller.current=job;
  try{const ok=await useWorkspaceStore.getState().enterLibrarySource(preview,job.signal);if(mounted.current){setPreview(null);setMessage(ok?t('library.sourceEditEntered'):useWorkspaceStore.getState().sourceTransitionError??t('library.sourceEditNotEntered'));}}
  finally{locked.current=false;if(mounted.current)setBusy(false);if(controller.current===job)controller.current=null;}
 };
 if(!project.designLibraryBinding)return null;
 return <div className="space-y-2 border-t border-slate-800 pt-2" aria-label={t('library.sourceEditAria')}>
  <p className="text-slate-500">{t('library.sourceEditHint')}</p>
  <button type="button" disabled={disabled||busy||!isDesktopRuntime()||Boolean(workspace.sourceEditing||workspace.sourceTransition)} onClick={()=>void choose()} className="rounded border border-slate-700 px-2 py-1 text-slate-300 disabled:opacity-40">{t('library.sourceEditChoose')}</button>
  {preview&&<div className="space-y-2 rounded border border-slate-700 p-2" aria-label={t('library.sourceEditPreviewAria')}>
   <p className="font-medium text-slate-200">{preview.sourceName} · Token v{preview.sourceTokenVersion}</p>
   <p className="text-slate-400">{t('library.sourceEditStats',{components:preview.componentCount,pages:preview.pageCount,change:preview.changed?t('library.sourceEditChanged'):t('library.sourceEditUnchanged')})}</p>
   <p className="break-all text-slate-500">{t('library.sourceEditFingerprint',{fingerprint:preview.sourceFingerprint})}</p>
   <p className="text-slate-400">{t('library.sourceEditSaveHint')}</p>
   {preview.upstreamReadOnly&&<p className="text-amber-300">{t('library.sourceEditUpstreamReadonly')}</p>}
   {stale&&<p role="alert" className="text-amber-300">{t('library.sourceEditStale')}</p>}
   <button type="button" disabled={busy||disabled||stale} onClick={()=>void enter()} className="rounded bg-blue-600 px-2 py-1 text-white disabled:opacity-40">{t('library.sourceEditConfirm')}</button>
  </div>}
  {(busy||preview)&&<button type="button" onClick={()=>{controller.current?.abort();setPreview(null);setMessage(t('library.sourceEditCancelled'));}} className="text-slate-400">{t('library.sourceEditCancel')}</button>}
  {message&&<p role="status" className="break-words text-slate-400">{message}</p>}
 </div>;
}
