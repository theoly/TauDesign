import React,{useMemo} from 'react';
import {useT} from '../../stores/useLocaleStore';
import type {DesignTaskContract} from '../../services/ai/designWorkflow';
import {inspectPageTaskCoverage} from '../../services/ai/pageTaskCoverage';
export function PageTaskCoverageCard({contract,html}:{contract?:DesignTaskContract;html?:string}) {
 const t=useT();
 const labels={
  input:t('chat.covKindInput'),
  display:t('chat.covKindDisplay'),
  interaction:t('chat.covKindInteraction'),
  state:t('chat.covKindState'),
 };
 const statuses={
  'source-indication':t('chat.covStatusSource'),
  'not-located':t('chat.covStatusNotLocated'),
  'scenario-only':t('chat.covStatusScenario'),
 };
 const report=useMemo(()=>html?inspectPageTaskCoverage(contract,html):undefined,[contract,html]);
 if(!report)return null;
 if(report.status==='unavailable')return <p role="status" className="my-2 text-xs text-amber-300">{t('chat.covUnavailable',{message:report.message})}</p>;
 return <details aria-label={t('chat.covAria')} className="my-2 space-y-2 rounded-lg border border-slate-700 bg-slate-900 p-3 text-xs text-slate-300">
  <summary className="cursor-pointer">{t('chat.covSummary',{count:report.unlocatedCount})}</summary>
  <p className="text-slate-400">{t('chat.covIntro')}</p>
  {report.items.map((item,i)=><p key={i} className={`break-words ${item.status==='not-located'?'text-amber-300':'text-slate-400'}`}>
    {item.featureTitle} · {labels[item.kind]}：{item.label} — {statuses[item.status]}
  </p>)}
  <p className="break-words text-slate-500">{t('chat.covCompletion',{items:report.completion.join('；')})}</p>
 </details>;
}
