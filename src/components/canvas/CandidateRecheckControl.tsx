import React from 'react';
import {useProjectStore} from '../../stores/useProjectStore';
import {useT} from '../../stores/useLocaleStore';

export function CandidateRecheckControl(){
  const t=useT();
  const staged=useProjectStore(s=>s.stagedScreen),busy=useProjectStore(s=>s.stagedAdoptionStatus==='saving'||!!s.stagedRepairStatus);
  if(!staged)return null;
  return <button type="button" disabled={busy} onClick={()=>useProjectStore.getState().refreshStagedRender()}
    title={t('chat.recheckPreviewTitle')}
    className="rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-50">
    {t('chat.recheckPreview')}
  </button>;
}
