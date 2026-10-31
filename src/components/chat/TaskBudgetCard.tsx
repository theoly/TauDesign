import React from 'react';
import {isTaskBudgetSnapshot} from '../../services/ai/taskBudget';
export function TaskBudgetCard({value}:{value:unknown}) {
  if(value===undefined)return null;
  if(!isTaskBudgetSnapshot(value))return <p role="status" className="my-2 text-xs text-amber-300">预算记录不可用，请以本次执行结果为准。</p>;
  return <details className="my-2 rounded-lg border border-slate-700 bg-slate-900 p-3 text-xs text-slate-400" aria-label="本轮预算记录">
    <summary className="cursor-pointer">本轮预算 · 请求 {value.requests}/{value.limits.maxRequests} · {value.cancelled?'已停止':value.closed?'已结束':'阶段记录'}</summary>
    <dl className="mt-2 space-y-1 break-words">
      <div><dt className="inline">累计申请输出：</dt><dd className="inline">{value.requestedOutputTokens.toLocaleString()} / {value.limits.maxRequestedOutputTokens.toLocaleString()} Token</dd></div>
      <div><dt className="inline">已报告输入 / 输出：</dt><dd className="inline">{value.reportedInputTokens.toLocaleString()} / {value.reportedOutputTokens.toLocaleString()} Token</dd></div>
      {value.unreportedOutputCaps>0&&<div><dt className="inline">未报告用量的申请上限：</dt><dd className="inline">{value.unreportedOutputCaps.toLocaleString()} Token</dd></div>}
    </dl>
    <p className="mt-2">申请额度用于限制后续请求，不等于实际消耗或费用；已报告用量可能包含估算。记录为应用级调用数，保留于当前会话。</p>
    {value.exhausted&&<p className="mt-1 text-amber-300">额度已用尽；已完成结果仍须通过原有检查，后续请求不会自动追加额度。</p>}
  </details>;
}
