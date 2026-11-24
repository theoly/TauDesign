import React from 'react';
import {useT} from '../../stores/useLocaleStore';
import type {TaskBudgetSnapshot} from '../../services/ai/taskBudget';
import {isTaskBudgetSnapshot} from '../../services/ai/taskBudget';
import {TaskBudgetCard} from './TaskBudgetCard';
import type {HistoricalTaskCost} from '../../services/storage/designTaskRepository';
/** Historical and new ledgers are reported separately, never merged into execution authority. */
export function RecoveryBudgetCard({origin,history,previous,current}:{origin:string;history?:HistoricalTaskCost[];previous?:TaskBudgetSnapshot;current?:TaskBudgetSnapshot}){
 const t=useT();
 const rows=history??[{taskId:origin,budget:previous}],known=rows.flatMap(row=>isTaskBudgetSnapshot(row.budget)?[row.budget]:[]),unknown=rows.length-known.length,next=isTaskBudgetSnapshot(current)?current:undefined;
 const sum=(field:'requests'|'reportedInputTokens'|'reportedOutputTokens'|'estimatedInputTokens'|'estimatedOutputTokens'|'unreportedOutputCaps')=>[...known,...(next?[next]:[])].reduce((total,budget)=>total+(budget[field]??0),0);
 return <section aria-label={t('chat.recBudgetAria')} className="rounded-lg border border-slate-700 p-3 text-xs leading-relaxed text-slate-400">
  <p className="break-all">{t('chat.recBudgetOrigin',{origin})}</p>
  {rows.map(row=><details key={row.taskId} className="mt-2"><summary className="break-all">{t('chat.recBudgetHistTask',{id:row.taskId})}</summary>{isTaskBudgetSnapshot(row.budget)?<TaskBudgetCard value={row.budget} label={t('chat.recBudgetHistLabel')}/>:<p>{t('chat.recBudgetUnknownOne')}</p>}</details>)}
  {unknown>0&&<p className="mt-2">{t('chat.recBudgetUnknownCount',{count:unknown})}</p>}
  {known.length>0&&<dl className="mt-2 space-y-1"><div>{t('chat.recBudgetRequests',{next:next?t('chat.recBudgetNextSuffix'):'',count:sum('requests')})}</div><div>{t('chat.recBudgetReported',{input:sum('reportedInputTokens'),output:sum('reportedOutputTokens')})}</div><div>{t('chat.recBudgetEstimated',{input:sum('estimatedInputTokens'),output:sum('estimatedOutputTokens')})}</div><div>{t('chat.recBudgetUnreported',{caps:sum('unreportedOutputCaps')})}</div></dl>}
  <p className="mt-2">{t('chat.recBudgetFooter')}</p>
 </section>;
}
