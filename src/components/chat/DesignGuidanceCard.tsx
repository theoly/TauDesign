import React from 'react';
import type {DesignTaskContract} from '../../services/ai/designWorkflow';
import {guidancePacketIssue} from '../../services/ai/designKnowledge/receipt';
import {taskRuleSafetyIssue} from '../../services/ai/designKnowledge/safety';
import {isRepairGuidanceTrace,type RepairGuidanceTrace} from '../../services/ai/designKnowledge/repairTrace';
const fallback={none:'已选择适用指导','excluded-workflow':'当前流程不注入专项规则','unknown-target':'目标语义不足，沿用通用指导','no-match':'未匹配专项规则，沿用通用指导',budget:'可用空间不足，沿用通用指导'};
const states={assembled:'已组装',dispatched:'调用中',completed:'返回完成',failed:'调用失败',cancelled:'已取消'};
export function RepairGuidanceSource({trace}:{trace?:RepairGuidanceTrace}) {
 if(trace===undefined)return null;
 if(!isRepairGuidanceTrace(trace))return <p className="text-amber-300">修复设计规则来源不可用。</p>;
 return <div className="space-y-1 text-slate-500" aria-label="修复设计规则来源">
  <p>沿用原任务 {trace.parentTaskId} 的冻结规则；实际注入 {trace.injectedRuleIds.join('、')||'0 条'}，因空间省略 {trace.omittedRuleIds.join('、')||'0 条'}。</p>
  <p>修复调用 {trace.requests.length} 次{trace.requests.map(r=>` · ${states[r.status]}`).join('')}；不表示模型遵从或页面复验通过。</p>
 </div>;
}
export function DesignGuidanceCard({contract,historical=false}:{contract?:DesignTaskContract;historical?:boolean}) {
  if(!contract||!Object.hasOwn(contract,'designGuidance'))return null;
  const invalid=guidancePacketIssue(contract,false,'history');
  if(invalid)return <p role="status" className="my-2 text-xs text-amber-300">设计依据记录不可用：{invalid}</p>;
  const packet=contract.designGuidance!,selection=packet.selection;
  const label=historical?'历史设计依据':'本次设计依据';
  const safety=taskRuleSafetyIssue(contract);
  return <details className="my-2 space-y-2 rounded-lg border border-slate-700 bg-slate-900 p-3 text-xs text-slate-300" aria-label={label}>
    <summary className="cursor-pointer">{label} · {selection.selected.length} 条规则</summary>
    {safety&&<p role="status" className="text-amber-300">{safety}</p>}
    <p className="text-slate-400">{fallback[selection.fallback]}</p>
    {selection.selected.map(({rule,reason})=><div key={rule.id} className="space-y-1 break-words border-t border-slate-800 pt-2">
      <p>{rule.title} · v{rule.version}</p><p className="text-slate-400">{rule.guidance}</p>
      <p className="text-slate-500">匹配依据：{reason}；来源：{rule.source.title}（{rule.source.revision}）</p>
    </div>)}
    {selection.omitted.length>0&&<p className="text-slate-500">{selection.omitted.filter(s=>s.reason==='budget').length} 条因预算省略，{selection.omitted.filter(s=>s.reason==='limit').length} 条因数量上限省略。</p>}
    <details><summary className="cursor-pointer text-slate-400">调用记录 · {packet.requests.length} 次</summary>
      {packet.requests.length?packet.requests.map(r=><p key={r.requestId} className="mt-1 break-all text-slate-500">{r.model} · {states[r.status]}{r.supersededByRequestId?'（由后续格式纠正替代）':''} · 实际进入请求 {r.injectedRuleIds.length} 条规则</p>):<p className="mt-1 text-slate-500">尚无实际调用记录。</p>}
    </details>
    <p className="text-slate-500">记录用于追溯输入；不表示 Provider 已确认收到、模型遵从规则或页面检查通过。</p>
  </details>;
}
