import React from 'react';
import type {DesignTaskContract} from '../../services/ai/designWorkflow';
import {pageTaskPlanIssue} from '../../services/ai/pageTaskPlan';
import type {PageTaskPlan} from '../../services/ai/pageTaskPlan';
const changes={retain:'保留',add:'新增',update:'调整',remove:'删除'};
const origins={user:'本次要求',document:'文档资料',page:'已有页面',image:'参考图观察',inference:'AI 推断'};
export function PageTaskPlanCard({contract}:{contract?:DesignTaskContract}) {
  if(!contract||!Object.hasOwn(contract,'pageTaskPlan'))return null;
  const issue=pageTaskPlanIssue(contract);
  if(issue)return <p role="status" className="my-2 text-xs text-amber-300">业务规划记录不可用：{issue}</p>;
  const plan=contract.pageTaskPlan!.plan;
  return <details aria-label="功能与交互规划" className="my-2 space-y-2 rounded-lg border border-slate-700 bg-slate-900 p-3 text-xs text-slate-300">
    <summary className="cursor-pointer">功能与交互规划 · {plan.features.length} 项功能</summary>
    {contract.pageTaskPlan!.request.planSource&&<p className="text-slate-500">规划来自已确认的多页计划；本页生成复用该规划，未增加规划请求。</p>}
    <PageTaskPlanContent plan={plan}/>
  </details>;
}
/** Escaped read-only content shared by confirmed multi-page previews. */
export function PageTaskPlanContent({plan}:{plan:PageTaskPlan}) {
 return <>
    <p className="break-words">用户任务：{plan.goal}</p><p>使用者：{plan.actor}</p>
    {plan.features.map(feature=><div key={feature.id} className="space-y-1 break-words border-t border-slate-800 pt-2">
      <p>{changes[feature.change]} · {feature.title}</p>
      <p className="text-slate-500">规划归属：{origins[feature.basis]}；具体业务含义仍需核对。</p>
      {feature.information.map((info,i)=><p key={`i${i}`} className="text-slate-400">{info.kind==='input'?'需要输入':'需要展示'}：{info.label}</p>)}
      {feature.interactions.map((a,i)=><p key={`a${i}`} className="text-slate-400">操作：{a.label}；前提：{a.precondition}；反馈：{a.outcome}</p>)}
      {feature.states.map((s,i)=><p key={`s${i}`} className="text-slate-400">状态：{s.name}；条件：{s.condition}；反馈：{s.feedback}</p>)}
    </div>)}
    <p className="break-words text-slate-400">完成条件：{plan.completion.join('；')}</p>
    {plan.questions.length>0&&<p role="status" className="break-words text-amber-300">待确认：{plan.questions.join('；')}</p>}
    <p className="text-slate-500">这是设计输入，不表示业务功能、后台或交互运行已经验收。</p>
  </>;
}
