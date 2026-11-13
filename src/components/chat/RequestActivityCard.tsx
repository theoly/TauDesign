import React,{useEffect,useState} from 'react';
import type {RequestActivity} from '../../services/ai/requestActivity';
import {finishReasonLabel,requestStageLabel} from '../../utils/userFacingMessage';

const labels:Record<RequestActivity['status'],string>={idle:'尚未向 AI 发送请求',waiting:'等待 AI 回复',receiving:'正在接收 AI 回复',returned:'已收到 AI 回复',failed:'AI 请求失败',cancelled:'AI 请求已停止'};
export function RequestActivityCard({activity,running}:{activity?:RequestActivity;running?:boolean}){
  const [now,setNow]=useState(Date.now());
  const ticking=Boolean(running&&activity?.active);
  useEffect(()=>{setNow(Date.now());if(!ticking)return;const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[ticking,activity?.startedAt]);
  if(!activity)return null;
  const end=ticking?now:activity.lastActivityAt??activity.startedAt,seconds=(at:number)=>Math.max(0,Math.floor((end-at)/1000));
  return <details aria-label="应用调用摘要" className="rounded-lg border border-slate-800 bg-slate-950/60 px-2 py-1.5 text-[11px] leading-4 text-slate-400">
    <summary className="cursor-pointer text-slate-300">{labels[activity.status]} · {activity.requests} 次 · {seconds(activity.startedAt)} 秒{activity.active>0?` · ${activity.active} 进行中`:''}</summary>
    <div className="mt-2 space-y-1 break-words">
    <p className="text-slate-300">{labels[activity.status]} · 请求尝试 {activity.requests} 次 · 进行中 {activity.active} 次</p>
    {activity.networkAttempts!==undefined&&<p>网络发送 {activity.networkAttempts} 次{activity.lastFinishReason&&activity.status!=='cancelled'&&!activity.active?` · ${finishReasonLabel(activity.lastFinishReason)}`:''}</p>}
    {activity.model&&<p className="break-all">使用模型：{activity.model}</p>}
    {(activity.stageId||activity.effectiveOutputTokens!==undefined)&&<p>{requestStageLabel(activity.stageId)}{activity.effectiveOutputTokens!==undefined?` · 本步骤最多回复 ${activity.effectiveOutputTokens.toLocaleString()} 个用量单位`:''}</p>}
    {activity.lastTextChars!==undefined&&<p>最近回复：{activity.lastTextChars} 字符 · 思考文字 {activity.lastReasoningChars??0} 字符</p>}
    <p>累计接收：回复 {activity.textChars.toLocaleString()} 字符 · 思考 {activity.reasoningChars.toLocaleString()} 字符 · 其他结果 {activity.jsonChars.toLocaleString()} 字符</p>
    <p>已用时 {seconds(activity.startedAt)} 秒{ticking&&activity.lastActivityAt!==undefined?` · 最近更新 ${seconds(activity.lastActivityAt)} 秒前`:''}</p>
    <p className="text-slate-500">通信进度不代表页面已完成检查；本轮累计额度请查看用量记录。用量单位由 AI 服务计量，不等于字符数或费用。</p>
    <details data-technical-details><summary className="cursor-pointer text-slate-500">技术详情</summary><div className="mt-1 space-y-1 break-all text-slate-500">
      {activity.providerId&&<p>服务标识：{activity.providerId}</p>}{activity.stageId&&<p>步骤标识：{activity.stageId}</p>}
      {activity.lastFinishReason&&<p>原始结束状态：{activity.lastFinishReason}</p>}{activity.httpStatus!==undefined&&<p>HTTP {activity.httpStatus}</p>}
    </div></details>
    </div>
  </details>;
}
