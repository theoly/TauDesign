import React from 'react';
import {isTaskBudgetSnapshot} from '../../services/ai/taskBudget';
export function TaskBudgetCard({value,label='本轮'}:{value:unknown;label?:string}) {
  if(value===undefined)return null;
  if(!isTaskBudgetSnapshot(value))return <p role="status" className="my-2 text-xs text-amber-300">用量记录不可用，请以本次执行结果为准。</p>;
  return <details className="my-1 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-[11px] leading-4 text-slate-400" aria-label={`${label}预算记录`}>
    <summary className="cursor-pointer">{label}用量 · 请求 {value.requests}/{value.limits.maxRequests} · {value.cancelled?'已停止':value.closed?'已结束':'阶段记录'}</summary>
    <dl className="mt-2 space-y-1 break-words">
      <div><dt className="inline">已分配的回复额度：</dt><dd className="inline">{value.requestedOutputTokens.toLocaleString()} / {value.limits.maxRequestedOutputTokens.toLocaleString()} 个用量单位</dd></div>
      <div><dt className="inline">服务报告的输入 / 回复用量：</dt><dd className="inline">{value.reportedInputTokens.toLocaleString()} / {value.reportedOutputTokens.toLocaleString()} 个用量单位</dd></div>
      {(value.estimatedInputTokens||value.estimatedOutputTokens)?<div><dt className="inline">估算的输入 / 回复用量：</dt><dd className="inline">{(value.estimatedInputTokens??0).toLocaleString()} / {(value.estimatedOutputTokens??0).toLocaleString()} 个用量单位（非厂商账单）</dd></div>:null}
      {value.unreportedOutputCaps>0&&<div><dt className="inline">尚未收到用量报告的回复额度：</dt><dd className="inline">{value.unreportedOutputCaps.toLocaleString()} 个用量单位</dd></div>}
    </dl>
    <p className="mt-2">回复额度用于限制后续请求，不等于实际消耗或费用。用量单位（Token）由 AI 服务计量，也不等同于字符数。旧记录可能含估算，新记录会单独列出；请求明细可在任务记录中查看。</p>
    {value.exhausted&&<p className="mt-1 text-amber-300">本轮额度已用尽，系统不会继续请求。已生成的内容仍需通过页面检查后才能使用。</p>}
  </details>;
}
