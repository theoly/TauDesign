import React,{useEffect,useRef,useState} from 'react';
import {useProjectStore} from '../../stores/useProjectStore';
import {useAIConfigStore} from '../../stores/useAIConfigStore';
import {createAIEngineCore} from '../../services/ai/engine/core';
import {isPageRepairRecord} from '../../services/ai/pageRepairRecord';
import {createSingleRequestBudget} from '../../services/ai/taskBudgetPolicy';
import {RepairGuidanceSource} from '../chat/DesignGuidanceCard';
import {observeRequestActivity,type RequestActivity} from '../../services/ai/requestActivity';
import {continuationBindingKey} from '../../services/ai/generationContinuation';
import {RequestActivityCard} from '../chat/RequestActivityCard';

export function RepairReceipt({value}:{value:unknown}) {
 if(!isPageRepairRecord(value))return value===undefined?null:<p className="text-amber-300">修复记录损坏；不能据此重试或跳过检查。</p>;
 return <details className="space-y-2 border-t border-slate-800 pt-2">
  <summary className="cursor-pointer text-slate-300">一次修复记录 · {value.status==='repaired'?'复验通过':value.status==='cancelled'?'已取消':'未应用'}</summary>
  <p className="text-slate-400">{value.message}</p>
  <p className="break-all text-slate-500">{value.beforeHtmlFingerprint} → {value.afterHtmlFingerprint??'无结果'} · 请求 {value.requestFingerprint}</p>
  {value.usage&&<p className="text-slate-500">额外用量{value.usageEstimated?'（估算）':''}：输入 {value.usage.inputTokens} / 输出 {value.usage.outputTokens} Token</p>}
  <RepairGuidanceSource trace={value.guidance}/>
  {value.operations.map((op,i)=><p key={i} className="break-all text-slate-500">{op.nid} · {op.type} · {op.value}</p>)}
  <p className="text-slate-500">记录用于回溯，采纳前仍执行当前检查。</p>
 </details>;
}
export function CandidateRepairControl() {
 const state=useProjectStore(),config=useAIConfigStore();
 const controller=useRef<AbortController|null>(null),mounted=useRef(true),[error,setError]=useState(''),[activity,setActivity]=useState<RequestActivity>();
 const contextKey=JSON.stringify([state.id,state.folderPath,state.stagedScreen?.candidateId,state.getStagedRenderContextKey()]);
 const binding=config.getActiveProviderForRole('code')??config.getActiveProviderForRole('chat');
 const modelKey=binding?continuationBindingKey({provider:binding.provider,model:binding.modelId}):null;
 const previous=useRef({contextKey,modelKey}),activityContext=useRef<string>();
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;const job=controller.current;controller.current=null;job?.abort();};},[]);
 useEffect(()=>{
  const old=previous.current;previous.current={contextKey,modelKey};if(old.contextKey===contextKey&&old.modelKey===modelKey)return;
  const job=controller.current;controller.current=null;job?.abort();setActivity(undefined);setError(job&&old.modelKey!==modelKey?'模型已变化，旧修复已取消。':'');
 },[contextKey,modelKey]);
 const eligibility=state.getStagedRepairEligibility(),busy=Boolean(state.stagedRepairStatus);
 useEffect(()=>{if(!busy){const job=controller.current;controller.current=null;job?.abort();}},[busy]);
 const start=async()=>{
  const live=useProjectStore.getState();if(controller.current||live.stagedRepairStatus||!live.getStagedRepairEligibility().allowed)return;
  setError('');const binding=useAIConfigStore.getState().getActiveProviderForRole('code')??useAIConfigStore.getState().getActiveProviderForRole('chat');
  if(!binding){setError('请先在 Provider 配置中选择代码模型。');return;}
  const job=new AbortController();controller.current=job;
  const expectedModel=continuationBindingKey({provider:binding.provider,model:binding.modelId});
  const current=()=>{const s=useProjectStore.getState(),latest=useAIConfigStore.getState().getActiveProviderForRole('code')??useAIConfigStore.getState().getActiveProviderForRole('chat');return mounted.current&&controller.current===job&&!job.signal.aborted&&contextKey===JSON.stringify([s.id,s.folderPath,s.stagedScreen?.candidateId,s.getStagedRenderContextKey()])&&Boolean(latest&&continuationBindingKey({provider:latest.provider,model:latest.modelId})===expectedModel);};
  const budget=createSingleRequestBudget(1800);
  activityContext.current=contextKey;
  const observer=observeRequestActivity(createAIEngineCore(),value=>{if(current())setActivity(value);},current);
  try{await useProjectStore.getState().repairStagedCandidate({core:observer.core,taskBudget:budget,provider:binding.provider,model:binding.modelId},job.signal,current);}
  catch(error){if(current())setError(error instanceof Error?error.message:'修复请求失败。');}
  finally{observer.stop();budget.close();if(controller.current===job)controller.current=null;}
 };
 return <section aria-label="候选受控修复" className="space-y-2 border-t border-slate-800 pt-3">
  <button type="button" disabled={busy||!eligibility.allowed} onClick={()=>void start()} className="rounded-lg bg-blue-600 px-3 py-1.5 text-white disabled:bg-slate-800 disabled:text-slate-500">{busy?(state.stagedRepairStatus==='verifying'?'正在完整复验…':'正在修复…'):'修复一次并重新检查'}</button>
  {busy?<button type="button" onClick={()=>useProjectStore.getState().cancelStagedRepair()} className="ml-2 text-slate-300">取消修复</button>:<p className="text-slate-500">{eligibility.message}</p>}
  {activityContext.current===contextKey&&<RequestActivityCard activity={activity} running={busy}/>}
  {(error||state.stagedRepairError)&&<p role="alert" className="text-amber-300">{error||state.stagedRepairError}</p>}
  {state.stagedValidationEvidence?.repair===undefined&&<RepairReceipt value={state.stagedScreen?.repair}/>}
 </section>;
}
