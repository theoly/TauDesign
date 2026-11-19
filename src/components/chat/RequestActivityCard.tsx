import React,{useEffect,useState} from 'react';
import type {RequestActivity} from '../../services/ai/requestActivity';
import {finishReasonLabel,requestStageLabel} from '../../utils/userFacingMessage';
import {useT} from '../../stores/useLocaleStore';
import type {MessageKey} from '../../i18n';

const statusKeys:Record<RequestActivity['status'],MessageKey>={
  idle:'chat.activityIdle',
  waiting:'chat.activityWaiting',
  receiving:'chat.activityReceiving',
  returned:'chat.activityReturned',
  failed:'chat.activityFailed',
  cancelled:'chat.activityCancelled',
};

export function RequestActivityCard({activity,running}:{activity?:RequestActivity;running?:boolean}){
  const t=useT();
  const [now,setNow]=useState(Date.now());
  const ticking=Boolean(running&&activity?.active);
  useEffect(()=>{setNow(Date.now());if(!ticking)return;const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[ticking,activity?.startedAt]);
  if(!activity)return null;
  const end=ticking?now:activity.lastActivityAt??activity.startedAt,seconds=(at:number)=>Math.max(0,Math.floor((end-at)/1000));
  const status=t(statusKeys[activity.status]);
  return <details aria-label={t('chat.activityAria')} className="rounded-lg border border-slate-800 bg-slate-950/60 px-2 py-1.5 text-[11px] leading-4 text-slate-400">
    <summary className="cursor-pointer text-slate-300">{t('chat.activitySummary',{status,requests:activity.requests,seconds:seconds(activity.startedAt)})}{activity.active>0?t('chat.activityActiveSuffix',{count:activity.active}):''}</summary>
    <div className="mt-2 space-y-1 break-words">
    <p className="text-slate-300">{t('chat.activityDetailLine',{status,requests:activity.requests,active:activity.active})}</p>
    {activity.networkAttempts!==undefined&&<p>{t('chat.activityNetwork',{count:activity.networkAttempts})}{activity.lastFinishReason&&activity.status!=='cancelled'&&!activity.active?` · ${finishReasonLabel(activity.lastFinishReason)}`:''}</p>}
    {activity.model&&<p className="break-all">{t('chat.activityModel',{model:activity.model})}</p>}
    {(activity.stageId||activity.effectiveOutputTokens!==undefined)&&<p>{requestStageLabel(activity.stageId)}{activity.effectiveOutputTokens!==undefined?t('chat.activityMaxOutput',{count:activity.effectiveOutputTokens.toLocaleString()}):''}</p>}
    {activity.lastTextChars!==undefined&&<p>{t('chat.activityRecentReply',{text:activity.lastTextChars,reasoning:activity.lastReasoningChars??0})}</p>}
    <p>{t('chat.activityTotals',{text:activity.textChars.toLocaleString(),reasoning:activity.reasoningChars.toLocaleString(),json:activity.jsonChars.toLocaleString()})}</p>
    <p>{t('chat.activityElapsed',{seconds:seconds(activity.startedAt)})}{ticking&&activity.lastActivityAt!==undefined?t('chat.activityLastUpdate',{seconds:seconds(activity.lastActivityAt)}):''}</p>
    <p className="text-slate-500">{t('chat.activityFooter')}</p>
    <details data-technical-details><summary className="cursor-pointer text-slate-500">{t('chat.activityTechDetails')}</summary><div className="mt-1 space-y-1 break-all text-slate-500">
      {activity.providerId&&<p>{t('chat.activityProviderId',{id:activity.providerId})}</p>}{activity.stageId&&<p>{t('chat.activityStageId',{id:activity.stageId})}</p>}
      {activity.lastFinishReason&&<p>{t('chat.activityRawFinish',{reason:activity.lastFinishReason})}</p>}{activity.httpStatus!==undefined&&<p>HTTP {activity.httpStatus}</p>}
    </div></details>
    </div>
  </details>;
}
