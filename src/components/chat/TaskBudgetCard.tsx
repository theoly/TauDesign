import React from 'react';
import {isTaskBudgetSnapshot} from '../../services/ai/taskBudget';
export function TaskBudgetCard({value,label='本轮'}:{value:unknown;label?:string}) {
  if(value===undefined)return null;
  if(!isTaskBudgetSnapshot(value))return <p role="status" className="my-2 text-xs text-amber-300">预算记录不可用，请以本次执行结果为准。</p>;
  return <details className="my-1 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-[11px] leading-4 text-slate-400" aria-label={`${label}预算记录`}>
    <summary className="cursor-pointer">{label}预算 · 请求 {value.requests}/{value.limits.maxRequests} · {value.cancelled?'已停止':value.closed?'已结束':'阶段记录'}</summary>
    <dl className="mt-2 space-y-1 break-words">
      <div><dt className="inline">累计申请输出：</dt><dd className="inline">{value.requestedOutputTokens.toLocaleString()} / {value.limits.maxRequestedOutputTokens.toLocaleString()} Token</dd></div>
      <div><dt className="inline">已报告输入 / 输出：</dt><dd className="inline">{value.reportedInputTokens.toLocaleString()} / {value.reportedOutputTokens.toLocaleString()} Token</dd></div>
      {(value.estimatedInputTokens||value.estimatedOutputTokens)?<div><dt className="inline">估算输入 / 输出：</dt><dd className="inline">{(value.estimatedInputTokens??0).toLocaleString()} / {(value.estimatedOutputTokens??0).toLocaleString()} Token（非厂商账单）</dd></div>:null}
      {value.unreportedOutputCaps>0&&<div><dt className="inline">未报告用量的申请上限：</dt><dd className="inline">{value.unreportedOutputCaps.toLocaleString()} Token</dd></div>}
    </dl>
    <p className="mt-2">申请额度用于限制后续请求，不等于实际消耗或费用；未区分来源的旧记录可能包含估算，新记录的估算单列。这里是应用级调用数；带任务存档的执行可在任务记录中查看。</p>
    {value.exhausted&&<p className="mt-1 text-amber-300">额度已用尽；已完成结果仍须通过原有检查，后续请求不会自动追加额度。</p>}
  </details>;
}
