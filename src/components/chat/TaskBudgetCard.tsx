import React from 'react';
import {isTaskBudgetSnapshot} from '../../services/ai/taskBudget';
import {useT} from '../../stores/useLocaleStore';
export function TaskBudgetCard({value,label}:{value:unknown;label?:string}) {
  const t=useT();
  const resolvedLabel=label??t('chat.budgetDefaultLabel');
  if(value===undefined)return null;
  if(!isTaskBudgetSnapshot(value))return <p role="status" className="my-2 text-xs text-amber-300">{t('chat.budgetUnavailable')}</p>;
  const state=value.cancelled?t('chat.budgetStateStopped'):value.closed?t('chat.budgetStateClosed'):t('chat.budgetStateRecording');
  return <details className="my-1 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-[11px] leading-4 text-slate-400" aria-label={`${resolvedLabel}预算记录`}>
    <summary className="cursor-pointer">{t('chat.budgetSummary',{label:resolvedLabel,used:value.requests,max:value.limits.maxRequests,state})}</summary>
    <dl className="mt-2 space-y-1 break-words">
      <div><dt className="inline">{t('chat.budgetAllocated')}</dt><dd className="inline">{value.requestedOutputTokens.toLocaleString()} / {value.limits.maxRequestedOutputTokens.toLocaleString()} {t('chat.budgetUnits')}</dd></div>
      <div><dt className="inline">{t('chat.budgetReported')}</dt><dd className="inline">{value.reportedInputTokens.toLocaleString()} / {value.reportedOutputTokens.toLocaleString()} {t('chat.budgetUnits')}</dd></div>
      {(value.estimatedInputTokens||value.estimatedOutputTokens)?<div><dt className="inline">{t('chat.budgetEstimated')}</dt><dd className="inline">{(value.estimatedInputTokens??0).toLocaleString()} / {(value.estimatedOutputTokens??0).toLocaleString()} {t('chat.budgetEstimatedNote')}</dd></div>:null}
      {value.unreportedOutputCaps>0&&<div><dt className="inline">{t('chat.budgetUnreported')}</dt><dd className="inline">{value.unreportedOutputCaps.toLocaleString()} {t('chat.budgetUnits')}</dd></div>}
    </dl>
    <p className="mt-2">{t('chat.budgetFootnote')}</p>
    {value.exhausted&&<p className="mt-1 text-amber-300">{t('chat.budgetExhausted')}</p>}
  </details>;
}
