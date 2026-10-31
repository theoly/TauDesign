import React from 'react';
import {useProjectStore} from '../../stores/useProjectStore';

export function CandidateRecheckControl(){
  const staged=useProjectStore(s=>s.stagedScreen),busy=useProjectStore(s=>s.stagedAdoptionStatus==='saving'||!!s.stagedRepairStatus);
  if(!staged)return null;
  return <button type="button" disabled={busy} onClick={()=>useProjectStore.getState().refreshStagedRender()}
    title="重新读取当前资源并检查候选；不调用AI，也不更新任务授权"
    className="rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-50">
    刷新预览并复验
  </button>;
}
