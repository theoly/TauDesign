import React from 'react';
import type {DesignTaskContract} from '../../services/ai/designWorkflow';
import {guidancePacketIssue} from '../../services/ai/designKnowledge/receipt';
import {taskRuleSafetyIssue} from '../../services/ai/designKnowledge/safety';
import {isRepairGuidanceTrace,type RepairGuidanceTrace} from '../../services/ai/designKnowledge/repairTrace';
const fallback={none:'已选择适用指导','excluded-workflow':'当前操作不需要额外的设计指导','unknown-target':'目标信息较少，使用通用设计指导','no-match':'未匹配专项规则，沿用通用指导',budget:'可用空间不足，沿用通用指导'};
const states={assembled:'已准备',dispatched:'等待 AI 回复',completed:'已收到回复',failed:'请求失败',cancelled:'已取消'};
export function RepairGuidanceSource({trace}:{trace?:RepairGuidanceTrace}) {
 if(trace===undefined)return null;
 if(!isRepairGuidanceTrace(trace))return <p className="text-amber-300">修复设计规则来源不可用。</p>;
 const attempted=trace.requests.filter(r=>r.status!=='assembled');
 const recordedIds=[...new Set(attempted.flatMap(r=>r.injectedRuleIds))];
 return <div className="space-y-1 text-slate-500" aria-label="修复设计规则来源">
  <p>沿用原任务已确定的设计规则；本次准备 {trace.injectedRuleIds.join('、')||'0 条'}，因空间省略 {trace.omittedRuleIds.join('、')||'0 条'}。</p>
  {attempted.length?<p>请求中包含 {recordedIds.join('、')||'0 条规则'}。</p>:<p>尚未记录实际请求，暂不能确认这些指导是否已发送给 AI。</p>}
  <p>修复请求尝试 {attempted.length} 次{trace.requests.map(r=>` · ${states[r.status]}`).join('')}；不保证 AI 服务已收到或按要求完成修复，仍需检查结果。</p>
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
    <details><summary className="cursor-pointer text-slate-400">请求记录 · {packet.requests.length} 条</summary>
      {packet.requests.length?packet.requests.map(r=><p key={r.requestId} className="mt-1 break-all text-slate-500">{r.model} · {states[r.status]}{r.supersededByRequestId?'（由后续格式纠正替代）':''} · {r.status==='assembled'?'已准备的输入':'请求中提供'} {r.injectedRuleIds.length} 条规则</p>):<p className="mt-1 text-slate-500">尚未记录实际请求。</p>}
    </details>
    <p className="text-slate-500">这些记录用于核对准备或发送的设计指导，不保证 AI 服务已收到、按要求执行或检查通过。</p>
  </details>;
}
