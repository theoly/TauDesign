import React from 'react';
import {useProjectStore} from '../../stores/useProjectStore';
import {useWorkspaceStore} from '../../stores/useWorkspaceStore';
import {useT} from '../../stores/useLocaleStore';
export function LibraryEditingBanner(){
 const t=useT();
 const id=useProjectStore(s=>s.id),workspace=useWorkspaceStore(),session=workspace.sourceEditing;
 if(!session||session.source.id!==id)return null;
 return <section aria-label={t('library.editingBannerAria')} className="flex flex-wrap items-center justify-between gap-2 border-b border-violet-800 bg-violet-950/50 px-4 py-2 text-xs text-violet-200">
  <div><p>{t('library.editingSource',{name:session.source.name})}</p><p className="mt-1 text-[11px] text-violet-300/70">{t('library.editingSourceHint',{returnTo:session.returnTo.name})}</p>{workspace.sourceTransitionError&&<p role="alert" className="mt-1 text-amber-300">{workspace.sourceTransitionError}</p>}</div>
  <button type="button" disabled={Boolean(workspace.sourceTransition)} onClick={()=>void workspace.returnFromLibrarySource()} className="rounded border border-violet-700 px-3 py-1.5 disabled:opacity-40">{workspace.sourceTransition==='returning'?t('library.savingAndReturn'):t('library.saveAndReturn',{returnTo:session.returnTo.name})}</button>
 </section>;
}
