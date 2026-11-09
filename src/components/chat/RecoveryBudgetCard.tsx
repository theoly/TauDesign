import React from 'react';
import type {TaskBudgetSnapshot} from '../../services/ai/taskBudget';
import {isTaskBudgetSnapshot} from '../../services/ai/taskBudget';
import {TaskBudgetCard} from './TaskBudgetCard';
import type {HistoricalTaskCost} from '../../services/storage/designTaskRepository';
/** Historical and new ledgers are reported separately, never merged into execution authority. */
export function RecoveryBudgetCard({origin,history,previous,current}:{origin:string;history?:HistoricalTaskCost[];previous?:TaskBudgetSnapshot;current?:TaskBudgetSnapshot}){
 const rows=history??[{taskId:origin,budget:previous}],known=rows.flatMap(row=>isTaskBudgetSnapshot(row.budget)?[row.budget]:[]),unknown=rows.length-known.length,next=isTaskBudgetSnapshot(current)?current:undefined;
 const sum=(field:'requests'|'reportedInputTokens'|'reportedOutputTokens'|'estimatedInputTokens'|'estimatedOutputTokens'|'unreportedOutputCaps')=>[...known,...(next?[next]:[])].reduce((total,budget)=>total+(budget[field]??0),0);
 return <section aria-label="恢复任务累计用量" className="rounded-lg border border-slate-700 p-3 text-xs leading-relaxed text-slate-400">
  <p className="break-all">原任务：{origin}。历史预算不复活，本任务有独立新预算。</p>
  {rows.map(row=><details key={row.taskId} className="mt-2"><summary className="break-all">历史任务：{row.taskId}</summary>{isTaskBudgetSnapshot(row.budget)?<TaskBudgetCard value={row.budget} label="历史"/>:<p>历史用量未知，不能作为零消耗计算。</p>}</details>)}
  {unknown>0&&<p className="mt-2">另有 {unknown} 项历史用量未知；以下仅汇总已知记录，不代表全部消耗。</p>}
  {known.length>0&&<dl className="mt-2 space-y-1"><div>历史{next?' + 本次':''}已记录请求：{sum('requests')} 次</div><div>已报告输入 / 输出合计：{sum('reportedInputTokens')} / {sum('reportedOutputTokens')} Token</div><div>估算输入 / 输出合计：{sum('estimatedInputTokens')} / {sum('estimatedOutputTokens')} Token（非厂商账单）</div><div>未报告用量的申请上限合计：{sum('unreportedOutputCaps')} Token</div></dl>}
  <p className="mt-2">历史是恢复时快照，迟到结算仍可能增加；货币费用未知。申请上限和估算均不是实际账单。</p>
 </section>;
}
