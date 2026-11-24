import React from 'react';
import {useT} from '../../stores/useLocaleStore';
import type {DesignTaskContract} from '../../services/ai/designWorkflow';
import {guidancePacketIssue} from '../../services/ai/designKnowledge/receipt';
import {taskRuleSafetyIssue} from '../../services/ai/designKnowledge/safety';
import {isRepairGuidanceTrace,type RepairGuidanceTrace} from '../../services/ai/designKnowledge/repairTrace';
export function RepairGuidanceSource({trace}:{trace?:RepairGuidanceTrace}) {
 const t=useT();
 const states={
  assembled:t('chat.guideStateAssembled'),
  dispatched:t('chat.guideStateDispatched'),
  completed:t('chat.guideStateCompleted'),
  failed:t('chat.guideStateFailed'),
  cancelled:t('chat.guideStateCancelled'),
 };
 if(trace===undefined)return null;
 if(!isRepairGuidanceTrace(trace))return <p className="text-amber-300">{t('chat.guideRepairUnavailable')}</p>;
 const attempted=trace.requests.filter(r=>r.status!=='assembled');
 const recordedIds=[...new Set(attempted.flatMap(r=>r.injectedRuleIds))];
 return <div className="space-y-1 text-slate-500" aria-label={t('chat.guideRepairAria')}>
  <p>{t('chat.guideRepairSummary',{injected:trace.injectedRuleIds.join('、')||t('chat.guideRepairZero'),omitted:trace.omittedRuleIds.join('、')||t('chat.guideRepairZero')})}</p>
  {attempted.length?<p>{t('chat.guideRepairRecorded',{ids:recordedIds.join('、')||t('chat.guideRepairZeroRules')})}</p>:<p>{t('chat.guideRepairUnrecorded')}</p>}
  <p>{t('chat.guideRepairAttempts',{count:attempted.length,states:trace.requests.map(r=>` · ${states[r.status]}`).join('')})}</p>
 </div>;
}
export function DesignGuidanceCard({contract,historical=false}:{contract?:DesignTaskContract;historical?:boolean}) {
  const t=useT();
  const fallback={
    none:t('chat.guideFallbackNone'),
    'excluded-workflow':t('chat.guideFallbackExcluded'),
    'unknown-target':t('chat.guideFallbackUnknown'),
    'no-match':t('chat.guideFallbackNoMatch'),
    budget:t('chat.guideFallbackBudget'),
  };
  const states={
    assembled:t('chat.guideStateAssembled'),
    dispatched:t('chat.guideStateDispatched'),
    completed:t('chat.guideStateCompleted'),
    failed:t('chat.guideStateFailed'),
    cancelled:t('chat.guideStateCancelled'),
  };
  if(!contract||!Object.hasOwn(contract,'designGuidance'))return null;
  const invalid=guidancePacketIssue(contract,false,'history');
  if(invalid)return <p role="status" className="my-2 text-xs text-amber-300">{t('chat.guideUnavailable',{invalid})}</p>;
  const packet=contract.designGuidance!,selection=packet.selection;
  const label=historical?t('chat.guideLabelHistorical'):t('chat.guideLabelCurrent');
  const safety=taskRuleSafetyIssue(contract);
  return <details className="my-2 space-y-2 rounded-lg border border-slate-700 bg-slate-900 p-3 text-xs text-slate-300" aria-label={label}>
    <summary className="cursor-pointer">{t('chat.guideSummary',{label,count:selection.selected.length})}</summary>
    {safety&&<p role="status" className="text-amber-300">{safety}</p>}
    <p className="text-slate-400">{fallback[selection.fallback]}</p>
    {selection.selected.map(({rule,reason})=><div key={rule.id} className="space-y-1 break-words border-t border-slate-800 pt-2">
      <p>{rule.title} · v{rule.version}</p><p className="text-slate-400">{rule.guidance}</p>
      <p className="text-slate-500">{t('chat.guideMatchLine',{reason,title:rule.source.title,revision:rule.source.revision})}</p>
    </div>)}
    {selection.omitted.length>0&&<p className="text-slate-500">{t('chat.guideOmittedLine',{budget:selection.omitted.filter(s=>s.reason==='budget').length,limit:selection.omitted.filter(s=>s.reason==='limit').length})}</p>}
    <details><summary className="cursor-pointer text-slate-400">{t('chat.guideRequestsSummary',{count:packet.requests.length})}</summary>
      {packet.requests.length?packet.requests.map(r=><p key={r.requestId} className="mt-1 break-all text-slate-500">{t('chat.guideRequestRow',{model:r.model,state:states[r.status],superseded:r.supersededByRequestId?t('chat.guideSuperseded'):'',mode:r.status==='assembled'?t('chat.guideAssembledMode'):t('chat.guideSentMode'),count:r.injectedRuleIds.length})}</p>):<p className="mt-1 text-slate-500">{t('chat.guideNoRequests')}</p>}
    </details>
    <p className="text-slate-500">{t('chat.guideFooterNote')}</p>
  </details>;
}
