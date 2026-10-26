import React from 'react';
import {useProjectStore} from '../../stores/useProjectStore';
import {useWorkspaceStore} from '../../stores/useWorkspaceStore';
export function LibraryEditingBanner(){
 const id=useProjectStore(s=>s.id),workspace=useWorkspaceStore(),session=workspace.sourceEditing;
 if(!session||session.source.id!==id)return null;
 return <section aria-label="源库编辑状态" className="flex flex-wrap items-center justify-between gap-2 border-b border-violet-800 bg-violet-950/50 px-4 py-2 text-xs text-violet-200">
  <div><p>正在编辑源库「{session.source.name}」</p><p className="mt-1 text-[11px] text-violet-300/70">修改保存到源工程；「{session.returnTo.name}」的缓存和页面保持原版本，返回后可确认更新。</p>{workspace.sourceTransitionError&&<p role="alert" className="mt-1 text-amber-300">{workspace.sourceTransitionError}</p>}</div>
  <button type="button" disabled={Boolean(workspace.sourceTransition)} onClick={()=>void workspace.returnFromLibrarySource()} className="rounded border border-violet-700 px-3 py-1.5 disabled:opacity-40">{workspace.sourceTransition==='returning'?'正在保存并返回…':`保存并返回「${session.returnTo.name}」`}</button>
 </section>;
}
