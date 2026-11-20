import {AssetMetadataMigrationPanel} from './AssetMetadataMigrationPanel';
import React,{useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {useProjectStore} from '../../stores/useProjectStore';
import {useHistoryStore} from '../../stores/useHistoryStore';
import {useT} from '../../stores/useLocaleStore';
import {screensWithEmbeddedMedia,prepareMediaMigration,mediaMigrationCurrent,mediaMigrationSourceKey,createMediaMigrationPreview,type PreparedMediaMigration} from '../../services/import/mediaMigration';
import {resolveProjectViewport} from '../../utils/referenceDevice';

function MigrationPreview({prepared,index,onReady}:{prepared:PreparedMediaMigration;index:number;onReady:(ready:boolean)=>void}){
 const t=useT();
 const state=useProjectStore(),[preview,setPreview]=useState<{before:string;after:string}>(),[error,setError]=useState('');
 const ids=useMemo(()=>prepared.pages.map(page=>page.original.id),[prepared]),sourceKey=mediaMigrationSourceKey(state,ids),current=mediaMigrationCurrent(prepared,state);
 useEffect(()=>{
  let active=true,release:(()=>Promise<void>)|undefined;setPreview(undefined);setError('');onReady(false);
  if(current)void createMediaMigrationPreview(prepared,index,useProjectStore.getState()).then(result=>{if(!active){void result.dispose();return;}release=result.dispose;setPreview({before:result.before,after:result.after});onReady(true);}).catch(error=>{if(active)setError(error instanceof Error?error.message:String(error));});
  return ()=>{active=false;if(release)void release();};
 },[prepared,index,sourceKey,current,onReady]);
 if(!current)return <p className="text-xs text-amber-300">{t('settings.mediaConvertStale')}</p>;
 if(error)return <p role="alert" className="text-xs text-red-300">{error}</p>;
 if(!preview)return <p role="status" className="text-xs text-slate-400">{t('settings.mediaConvertPreviewLoading')}</p>;
 const viewport=resolveProjectViewport(state.settings);
 return <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">{(['before','after'] as const).map(kind=><div key={kind} className="min-w-0">
  <p className="mb-2 text-xs text-slate-300">{kind==='before'?t('settings.mediaConvertBefore'):t('settings.mediaConvertAfter')}</p>
  <div className="max-w-full overflow-auto rounded-lg border border-slate-700 bg-white">
   <iframe title={t(kind==='before'?'settings.mediaConvertIframeBefore':'settings.mediaConvertIframeAfter',{name:prepared.pages[index].original.name})} srcDoc={preview[kind]} style={{display:'block',border:0,width:viewport.width,height:Math.min(600,viewport.height)}} />
  </div>
 </div>)}</div>;
}

/** Explicit legacy conversion. Preparation and comparison never mutate project/History state. */
export function MediaMigrationPanel(){
 const t=useT();
 const state=useProjectStore(),archiveError=useHistoryStore(s=>s.archiveError);
 const pages=useMemo(()=>screensWithEmbeddedMedia(state),[state.screens,state.overrides]);
 const [selected,setSelected]=useState<string[]>([]),[prepared,setPrepared]=useState<PreparedMediaMigration>(),[index,setIndex]=useState(0);
 const [busy,setBusy]=useState<'preparing'|'applying'>(),[progress,setProgress]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [previewReady,setPreviewReady]=useState(false),onPreviewReady=useCallback((ready:boolean)=>setPreviewReady(ready),[]);
 const controller=useRef<AbortController>(),lock=useRef(false),alive=useRef(true);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;controller.current?.abort();};},[]);
 const current=prepared&&mediaMigrationCurrent(prepared,state);
 const prepare=async()=>{
  if(lock.current||!selected.length)return;lock.current=true;controller.current=new AbortController();setBusy('preparing');setError('');setNotice('');setPrepared(undefined);
  const source=useProjectStore.getState(),ids=selected.filter(id=>source.screens[id]),key=mediaMigrationSourceKey(source,ids),signal=controller.current.signal;
  try{
   const result=await prepareMediaMigration(source,ids,{signal,isCurrent:()=>alive.current&&mediaMigrationSourceKey(useProjectStore.getState(),ids)===key,onProgress:(done,total,name)=>{if(alive.current)setProgress(t('settings.mediaConvertProgressPage',{done,total,name}));}});
   if(alive.current&&!signal.aborted){setPrepared(result);setIndex(0);}
  }catch(error){if(alive.current)setError(error instanceof Error?error.message:String(error));}
  finally{lock.current=false;if(alive.current)setBusy(undefined);}
 };
 const apply=async()=>{
  if(lock.current||!prepared||!current||!previewReady)return;lock.current=true;controller.current=new AbortController();setBusy('applying');setError('');
  try{await useProjectStore.getState().applyMediaMigration(prepared,controller.current.signal);if(alive.current){setPrepared(undefined);setSelected([]);setNotice(t('settings.mediaConvertDone'));}}
  catch(error){if(alive.current)setError(error instanceof Error?error.message:String(error));}
  finally{lock.current=false;if(alive.current)setBusy(undefined);}
 };
 return <><AssetMetadataMigrationPanel/><section aria-label={t('settings.mediaConvertAria')} className="rounded-xl border border-slate-800 bg-slate-950 p-4 space-y-3">
  <h3 className="text-xs font-semibold text-slate-200">{t('settings.mediaConvertTitle')}</h3>
  <p className="text-xs leading-relaxed text-slate-400">{t('settings.mediaConvertHint')}</p>
  {archiveError&&<p role="alert" className="text-xs leading-relaxed text-red-300">{archiveError}</p>}
  {!pages.length?<p className="text-xs text-slate-400">{t('settings.mediaConvertEmpty')}</p>:<div className="max-h-48 overflow-y-auto space-y-2">{pages.map(page=><label key={page.id} className="flex items-start gap-2 text-xs text-slate-300">
   <input type="checkbox" checked={selected.includes(page.id)} disabled={Boolean(busy)} onChange={event=>{setSelected(ids=>event.target.checked?[...ids,page.id]:ids.filter(id=>id!==page.id));setPrepared(undefined);setError('');}} />
   <span className="min-w-0 break-words">{page.name}</span>
  </label>)}</div>}
  {pages.length>0&&<div className="flex flex-wrap gap-2">
   <button type="button" disabled={Boolean(busy)||!selected.length||Boolean(archiveError)} onClick={()=>void prepare()} className="rounded-lg bg-slate-800 px-3 py-2 text-xs text-slate-200 disabled:opacity-50">{busy==='preparing'?t('settings.mediaConvertPreparing'):t('settings.mediaConvertPrepare')}</button>
   {busy&&<button type="button" onClick={()=>controller.current?.abort()} className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300">{t('settings.mediaConvertStop')}</button>}
  </div>}
  {busy&&<p role="status" className="text-xs text-slate-400">{busy==='applying'?t('settings.mediaConvertProgressApplying'):progress||t('settings.mediaConvertProgressReading')}</p>}
  {error&&<p role="alert" className="text-xs leading-relaxed text-red-300">{error}</p>}
  {notice&&<p role="status" className="text-xs text-emerald-300">{notice}</p>}
  {prepared&&<div className="space-y-3">
   <div className="flex flex-wrap gap-2">{prepared.pages.map((page,i)=><button type="button" key={page.original.id} onClick={()=>setIndex(i)} aria-pressed={index===i} disabled={Boolean(busy)} className={`rounded-lg border px-3 py-2 text-xs ${index===i?'border-blue-500 text-blue-200':'border-slate-700 text-slate-300'}`}>{page.original.name}</button>)}</div>
   <p className="text-xs text-slate-400">{t('settings.mediaConvertSummary',{pages:prepared.pages.length,assets:prepared.assets.length})}</p>
   {prepared.warnings.map((warning,i)=><p key={i} className="text-xs leading-relaxed text-amber-200/80">{warning}</p>)}
   {prepared.pages[index]?.removedNids.length>0&&<p className="text-xs text-amber-200/80">{t('settings.mediaConvertRemovedNids',{count:prepared.pages[index].removedNids.length})}</p>}
   <MigrationPreview prepared={prepared} index={index} onReady={onPreviewReady}/>
   <button type="button" disabled={Boolean(busy)||!current||!previewReady||Boolean(archiveError)} onClick={()=>void apply()} className="rounded-lg bg-blue-600 px-3 py-2 text-xs text-white disabled:opacity-50">{busy==='applying'?t('settings.mediaConvertApplying'):t('settings.mediaConvertApply')}</button>
  </div>}
 </section></>;
}
