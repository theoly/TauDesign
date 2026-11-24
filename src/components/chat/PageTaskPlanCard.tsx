import React from 'react';
import {useT} from '../../stores/useLocaleStore';
import type {DesignTaskContract} from '../../services/ai/designWorkflow';
import {pageTaskPlanIssue} from '../../services/ai/pageTaskPlan';
import type {PageTaskPlan} from '../../services/ai/pageTaskPlan';
export function PageTaskPlanCard({contract}:{contract?:DesignTaskContract}) {
  const t=useT();
  // hasOwn alone is insufficient: contracts may carry pageTaskPlan:undefined after restore/partial clone.
  if(!contract?.pageTaskPlan)return null;
  const issue=pageTaskPlanIssue(contract);
  if(issue)return <p role="status" className="my-2 text-xs text-amber-300">{t('chat.taskPlanUnavailable',{issue})}</p>;
  const snapshot=contract.pageTaskPlan;
  if(!snapshot?.plan)return <p role="status" className="my-2 text-xs text-amber-300">{t('chat.taskPlanMissingBody')}</p>;
  const plan=snapshot.plan;
  return <details aria-label={t('chat.taskPlanAria')} className="my-1 space-y-1.5 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-[11px] leading-4 text-slate-300">
    <summary className="cursor-pointer">{t('chat.taskPlanSummary',{count:plan.features.length})}</summary>
    {snapshot.request?.planSource&&<p className="text-slate-500">{t('chat.taskPlanMultiPageHint')}</p>}
    <PageTaskPlanContent plan={plan}/>
  </details>;
}
/** Escaped read-only content shared by confirmed multi-page previews. */
export function PageTaskPlanContent({plan}:{plan:PageTaskPlan}) {
 const t=useT();
 const changes={
  retain:t('chat.taskPlanChangeRetain'),
  add:t('chat.taskPlanChangeAdd'),
  update:t('chat.taskPlanChangeUpdate'),
  remove:t('chat.taskPlanChangeRemove'),
 };
 const origins={
  user:t('chat.taskPlanOriginUser'),
  document:t('chat.taskPlanOriginDoc'),
  page:t('chat.taskPlanOriginPage'),
  image:t('chat.taskPlanOriginImage'),
  inference:t('chat.taskPlanOriginInference'),
 };
 return <>
    <p className="break-words">{t('chat.taskPlanGoal',{goal:plan.goal})}</p><p>{t('chat.taskPlanActor',{actor:plan.actor})}</p>
    {plan.features.map(feature=><div key={feature.id} className="space-y-1 break-words border-t border-slate-800 pt-2">
      <p>{changes[feature.change]} · {feature.title}</p>
      <p className="text-slate-500">{t('chat.taskPlanBasis',{origin:origins[feature.basis]})}</p>
      {feature.information.map((info,i)=><p key={`i${i}`} className="text-slate-400">{info.kind==='input'?t('chat.taskPlanInfoInput'):t('chat.taskPlanInfoDisplay')}：{info.label}</p>)}
      {feature.interactions.map((a,i)=><p key={`a${i}`} className="text-slate-400">{t('chat.taskPlanInteraction',{label:a.label,precondition:a.precondition,outcome:a.outcome})}</p>)}
      {feature.states.map((s,i)=><p key={`s${i}`} className="text-slate-400">{t('chat.taskPlanState',{name:s.name,condition:s.condition,feedback:s.feedback})}</p>)}
    </div>)}
    <p className="break-words text-slate-400">{t('chat.taskPlanCompletion',{items:plan.completion.join('；')})}</p>
    {plan.questions.length>0&&<p role="status" className="break-words text-amber-300">{t('chat.taskPlanQuestions',{items:plan.questions.join('；')})}</p>}
    <p className="text-slate-500">{t('chat.taskPlanFooterDisclaimer')}</p>
  </>;
}
