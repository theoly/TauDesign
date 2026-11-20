import React,{useEffect,useRef,useState} from 'react';
import {useProjectStore} from '../../stores/useProjectStore';
import {useHistoryStore} from '../../stores/useHistoryStore';
import {useT} from '../../stores/useLocaleStore';
import {assetsWithEmbeddedSvgCache,prepareAssetMetadataMigration,assetMetadataMigrationCurrent,type PreparedAssetMetadataMigration} from '../../services/import/assetMetadataMigration';
/** Explicit metadata-only migration; artwork and page markup stay owned by their independent files. */
export function AssetMetadataMigrationPanel(){
 const t=useT();
 const state=useProjectStore(),archiveError=useHistoryStore(s=>s.archiveError),assets=assetsWithEmbeddedSvgCache(state);
 const [selected,setSelected]=useState<string[]>([]),[prepared,setPrepared]=useState<PreparedAssetMetadataMigration>(),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const lock=useRef(false),alive=useRef(true),controller=useRef<AbortController>();useEffect(()=>{alive.current=true;return()=>{alive.current=false;controller.current?.abort();};},[]);
 const prepare=async()=>{if(lock.current||!selected.length)return;lock.current=true;setBusy(true);setError('');setNotice('');setPrepared(undefined);const source=useProjectStore.getState(),identity=JSON.stringify([source.id,source.folderPath,source.assets,source.designLibraryBinding]);controller.current=new AbortController();try{
  const handle=await prepareAssetMetadataMigration(source,selected,{signal:controller.current.signal,isCurrent:()=>alive.current&&JSON.stringify([useProjectStore.getState().id,useProjectStore.getState().folderPath,useProjectStore.getState().assets,useProjectStore.getState().designLibraryBinding])===identity});if(alive.current)setPrepared(handle);
 }catch(error){if(alive.current)setError(error instanceof Error?error.message:t('settings.iconCacheInspectFailed'));}finally{lock.current=false;if(alive.current)setBusy(false);}};
 const apply=async()=>{if(lock.current||!prepared)return;lock.current=true;setBusy(true);setError('');controller.current=new AbortController();try{await useProjectStore.getState().applyAssetMetadataMigration(prepared,controller.current.signal);if(alive.current){setPrepared(undefined);setSelected([]);setNotice(t('settings.iconCacheDone'));}}catch(error){if(alive.current)setError(error instanceof Error?error.message:t('settings.iconCacheApplyFailed'));}finally{lock.current=false;if(alive.current)setBusy(false);}};
 return <section aria-label={t('settings.iconCacheAria')} className="space-y-3 rounded-xl border border-slate-800 bg-slate-950 p-4">
  <h3 className="text-xs font-semibold text-slate-200">{t('settings.iconCacheTitle')}</h3>
  <p className="text-xs leading-relaxed text-slate-400">{t('settings.iconCacheHint')}</p>
  {!assets.length?<p className="text-xs text-slate-400">{t('settings.iconCacheEmpty')}</p>:<div className="max-h-40 space-y-2 overflow-auto">{assets.map(asset=><label key={asset.id} className="flex items-start gap-2 text-xs text-slate-300"><input type="checkbox" disabled={busy} checked={selected.includes(asset.id)} onChange={event=>{setSelected(ids=>event.target.checked?[...ids,asset.id]:ids.filter(id=>id!==asset.id));setPrepared(undefined);}}/><span className="break-all">{asset.name} · {asset.relPath}</span></label>)}</div>}
  {!!assets.length&&<button type="button" disabled={busy||!selected.length||Boolean(archiveError)} onClick={()=>void prepare()} className="rounded-lg bg-slate-800 px-3 py-2 text-xs text-slate-200 disabled:opacity-50">{t('settings.iconCacheInspect')}</button>}
  {busy&&<button type="button" onClick={()=>controller.current?.abort()} className="ml-3 text-xs text-slate-400">{t('settings.iconCacheStop')}</button>}
  {prepared&&<div className="space-y-2 rounded-lg border border-slate-700 p-3 text-xs text-slate-300">{prepared.rows.map(row=><p key={row.id} className="break-words">{t(row.matchesFile?'settings.iconCacheMatch':'settings.iconCacheDiffer',{name:row.name,bytes:row.cacheBytes.toLocaleString()})}</p>)}<button type="button" disabled={busy||Boolean(archiveError)||!assetMetadataMigrationCurrent(prepared,state)} onClick={()=>void apply()} className="rounded-lg bg-blue-600 px-3 py-2 text-xs text-white disabled:opacity-50">{t('settings.iconCacheApply')}</button></div>}
  {(error||archiveError)&&<p role="alert" className="text-xs text-red-300">{error||archiveError}</p>}{notice&&<p role="status" className="text-xs text-emerald-300">{notice}</p>}
 </section>;
}
