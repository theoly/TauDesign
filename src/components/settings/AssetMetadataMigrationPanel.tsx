import React,{useEffect,useRef,useState} from 'react';
import {useProjectStore} from '../../stores/useProjectStore';
import {useHistoryStore} from '../../stores/useHistoryStore';
import {assetsWithEmbeddedSvgCache,prepareAssetMetadataMigration,assetMetadataMigrationCurrent,type PreparedAssetMetadataMigration} from '../../services/import/assetMetadataMigration';
/** Explicit metadata-only migration; artwork and page markup stay owned by their independent files. */
export function AssetMetadataMigrationPanel(){
 const state=useProjectStore(),archiveError=useHistoryStore(s=>s.archiveError),assets=assetsWithEmbeddedSvgCache(state);
 const [selected,setSelected]=useState<string[]>([]),[prepared,setPrepared]=useState<PreparedAssetMetadataMigration>(),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const lock=useRef(false),alive=useRef(true),controller=useRef<AbortController>();useEffect(()=>{alive.current=true;return()=>{alive.current=false;controller.current?.abort();};},[]);
 const prepare=async()=>{if(lock.current||!selected.length)return;lock.current=true;setBusy(true);setError('');setNotice('');setPrepared(undefined);const source=useProjectStore.getState(),identity=JSON.stringify([source.id,source.folderPath,source.assets,source.designLibraryBinding]);controller.current=new AbortController();try{
  const handle=await prepareAssetMetadataMigration(source,selected,{signal:controller.current.signal,isCurrent:()=>alive.current&&JSON.stringify([useProjectStore.getState().id,useProjectStore.getState().folderPath,useProjectStore.getState().assets,useProjectStore.getState().designLibraryBinding])===identity});if(alive.current)setPrepared(handle);
 }catch(error){if(alive.current)setError(error instanceof Error?error.message:'资源缓存检查失败。');}finally{lock.current=false;if(alive.current)setBusy(false);}};
 const apply=async()=>{if(lock.current||!prepared)return;lock.current=true;setBusy(true);setError('');controller.current=new AbortController();try{await useProjectStore.getState().applyAssetMetadataMigration(prepared,controller.current.signal);if(alive.current){setPrepared(undefined);setSelected([]);setNotice('所选旧缓存已整理；页面和独立资源文件保持原样，可撤销。');}}catch(error){if(alive.current)setError(error instanceof Error?error.message:'缓存整理未应用。');}finally{lock.current=false;if(alive.current)setBusy(false);}};
 return <section aria-label="旧SVG资源缓存整理" className="space-y-3 rounded-xl border border-slate-800 bg-slate-950 p-4">
  <h3 className="text-xs font-semibold text-slate-200">旧图标缓存整理</h3>
  <p className="text-xs leading-relaxed text-slate-400">检查资产登记中重复保存的 SVG 正文，再移除所选旧缓存；保留当前独立文件和页面引用。支持精确撤销，不调用 AI。固定版本参考库成员须先转为项目副本。</p>
  {!assets.length?<p className="text-xs text-slate-400">未检测到旧 SVG 缓存。</p>:<div className="max-h-40 space-y-2 overflow-auto">{assets.map(asset=><label key={asset.id} className="flex items-start gap-2 text-xs text-slate-300"><input type="checkbox" disabled={busy} checked={selected.includes(asset.id)} onChange={event=>{setSelected(ids=>event.target.checked?[...ids,asset.id]:ids.filter(id=>id!==asset.id));setPrepared(undefined);}}/><span className="break-all">{asset.name} · {asset.relPath}</span></label>)}</div>}
  {!!assets.length&&<button type="button" disabled={busy||!selected.length||Boolean(archiveError)} onClick={()=>void prepare()} className="rounded-lg bg-slate-800 px-3 py-2 text-xs text-slate-200 disabled:opacity-50">检查所选旧图标缓存</button>}
  {busy&&<button type="button" onClick={()=>controller.current?.abort()} className="ml-3 text-xs text-slate-400">停止整理</button>}
  {prepared&&<div className="space-y-2 rounded-lg border border-slate-700 p-3 text-xs text-slate-300">{prepared.rows.map(row=><p key={row.id} className="break-words">{row.name} · {row.cacheBytes.toLocaleString()} 字节缓存 · {row.matchesFile?'与独立文件相同':'缓存与独立文件不同：保留文件中的图案，只移除冗余缓存，原缓存可撤销恢复'}。</p>)}<button type="button" disabled={busy||Boolean(archiveError)||!assetMetadataMigrationCurrent(prepared,state)} onClick={()=>void apply()} className="rounded-lg bg-blue-600 px-3 py-2 text-xs text-white disabled:opacity-50">确认移除所选旧缓存</button></div>}
  {(error||archiveError)&&<p role="alert" className="text-xs text-red-300">{error||archiveError}</p>}{notice&&<p role="status" className="text-xs text-emerald-300">{notice}</p>}
 </section>;
}
