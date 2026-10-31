import React,{useEffect,useState} from 'react';
import type {RequestActivity} from '../../services/ai/requestActivity';

const labels:Record<RequestActivity['status'],string>={idle:'尚未调用模型',waiting:'等待调用返回',receiving:'正在接收结果',returned:'调用已返回',failed:'调用失败',cancelled:'调用已停止'};
export function RequestActivityCard({activity,running}:{activity?:RequestActivity;running?:boolean}){
  const [now,setNow]=useState(Date.now());
  const ticking=Boolean(running&&activity?.active);
  useEffect(()=>{setNow(Date.now());if(!ticking)return;const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[ticking,activity?.startedAt]);
  if(!activity)return null;
  const end=ticking?now:activity.lastActivityAt??activity.startedAt,seconds=(at:number)=>Math.max(0,Math.floor((end-at)/1000));
  return <section aria-label="应用调用摘要" className="space-y-1 rounded-lg border border-slate-800 bg-slate-950/60 p-2 text-[11px] text-slate-400">
    <p className="text-slate-300">{labels[activity.status]} · 调用尝试 {activity.requests} 次 · 进行中 {activity.active} 次</p>
    {activity.model&&<p className="break-all">最近调用：{activity.providerId} / {activity.model}</p>}
    <p>已观察正文 {activity.textChars.toLocaleString()} 字符 · 推理 {activity.reasoningChars.toLocaleString()} 字符 · JSON 结果 {activity.jsonChars.toLocaleString()} 字符</p>
    <p>调用观察耗时 {seconds(activity.startedAt)} 秒{ticking&&activity.lastActivityAt!==undefined?` · 最近应用活动 ${seconds(activity.lastActivityAt)} 秒前`:''}</p>
    <p className="text-slate-500">应用调用与接收记录，不代表 Provider 接收确认或页面验收通过。</p>
  </section>;
}
