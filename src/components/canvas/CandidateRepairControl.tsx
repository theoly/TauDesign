import {UserFacingNotice} from '../common/UserFacingNotice';
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
import {useT} from '../../stores/useLocaleStore';

export function RepairReceipt({value}:{value:unknown}) {
 const t=useT();
 if(!isPageRepairRecord(value))return value===undefined?null:<p className="text-amber-300">{t('repair.receiptCorrupt')}</p>;
 const statusLabel=value.status==='repaired'?t('repair.statusRepaired'):value.status==='cancelled'?t('repair.statusCancelled'):t('repair.statusNotApplied');
 return <details className="space-y-2 border-t border-slate-800 pt-2">
  <summary className="cursor-pointer text-slate-300">{t('repair.receiptSummary',{status:statusLabel})}</summary>
  <div className="text-slate-400"><UserFacingNotice message={value.message??''}/></div>
  <details data-technical-details><summary className="cursor-pointer text-slate-500">{t('repair.technicalDetails')}</summary><p className="break-all text-slate-500">{t('repair.technicalLine',{before:value.beforeHtmlFingerprint,after:value.afterHtmlFingerprint??t('repair.noResult'),request:value.requestFingerprint})}</p>{value.operations.map((op,i)=><p key={i} className="break-all text-slate-500">{op.nid} · {op.type} · {op.value}</p>)}</details>
  {value.usage&&<p className="text-slate-500">{t('repair.usageLine',{estimated:value.usageEstimated?t('repair.usageEstimated'):'',input:value.usage.inputTokens,output:value.usage.outputTokens})}</p>}
  <RepairGuidanceSource trace={value.guidance}/>
  <p className="text-slate-500">{t('repair.receiptFooter')}</p>
 </details>;
}
export function CandidateRepairControl() {
 const t=useT();
 const state=useProjectStore(),config=useAIConfigStore();
 const controller=useRef<AbortController|null>(null),mounted=useRef(true),[error,setError]=useState(''),[activity,setActivity]=useState<RequestActivity>();
 const contextKey=JSON.stringify([state.id,state.folderPath,state.stagedScreen?.candidateId,state.getStagedRenderContextKey()]);
 const binding=config.getActiveProviderForRole('code')??config.getActiveProviderForRole('chat');
 const modelKey=binding?continuationBindingKey({provider:binding.provider,model:binding.modelId}):null;
 const previous=useRef({contextKey,modelKey}),activityContext=useRef<string>();
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;const job=controller.current;controller.current=null;job?.abort();};},[]);
 useEffect(()=>{
  const old=previous.current;previous.current={contextKey,modelKey};if(old.contextKey===contextKey&&old.modelKey===modelKey)return;
  const job=controller.current;controller.current=null;job?.abort();setActivity(undefined);setError(job&&old.modelKey!==modelKey?t('repair.errModelChanged'):'');
 },[contextKey,modelKey,t]);
 const eligibility=state.getStagedRepairEligibility(),busy=Boolean(state.stagedRepairStatus);
 useEffect(()=>{if(!busy){const job=controller.current;controller.current=null;job?.abort();}},[busy]);
 const start=async()=>{
  const live=useProjectStore.getState();if(controller.current||live.stagedRepairStatus||!live.getStagedRepairEligibility().allowed)return;
  setError('');const binding=useAIConfigStore.getState().getActiveProviderForRole('code')??useAIConfigStore.getState().getActiveProviderForRole('chat');
  if(!binding){setError(t('repair.errSelectModel'));return;}
  const job=new AbortController();controller.current=job;
  const expectedModel=continuationBindingKey({provider:binding.provider,model:binding.modelId});
  const current=()=>{const s=useProjectStore.getState(),latest=useAIConfigStore.getState().getActiveProviderForRole('code')??useAIConfigStore.getState().getActiveProviderForRole('chat');return mounted.current&&controller.current===job&&!job.signal.aborted&&contextKey===JSON.stringify([s.id,s.folderPath,s.stagedScreen?.candidateId,s.getStagedRenderContextKey()])&&Boolean(latest&&continuationBindingKey({provider:latest.provider,model:latest.modelId})===expectedModel);};
  const budget=createSingleRequestBudget(1800);
  activityContext.current=contextKey;
  const observer=observeRequestActivity(createAIEngineCore(),value=>{if(current())setActivity(value);},current);
  try{await useProjectStore.getState().repairStagedCandidate({core:observer.core,taskBudget:budget,provider:binding.provider,model:binding.modelId},job.signal,current);}
  catch(error){if(current())setError(error instanceof Error?error.message:t('repair.errRequestFailed'));}
  finally{observer.stop();budget.close();if(controller.current===job)controller.current=null;}
 };
 return <section aria-label={t('repair.sectionAria')} className="space-y-2 border-t border-slate-800 pt-3">
  <button type="button" disabled={busy||!eligibility.allowed} onClick={()=>void start()} className="rounded-lg bg-blue-600 px-3 py-1.5 text-white disabled:bg-slate-800 disabled:text-slate-500">{busy?(state.stagedRepairStatus==='verifying'?t('repair.verifying'):t('repair.repairing')):t('repair.fixOnce')}</button>
  {busy?<button type="button" onClick={()=>useProjectStore.getState().cancelStagedRepair()} className="ml-2 text-slate-300">{t('repair.cancel')}</button>:<div className="text-slate-500"><UserFacingNotice message={eligibility.message}/></div>}
  {activityContext.current===contextKey&&<RequestActivityCard activity={activity} running={busy}/>}
  {(error||state.stagedRepairError)&&<div role="alert" className="text-amber-300"><UserFacingNotice message={error||state.stagedRepairError||''}/></div>}
  {state.stagedValidationEvidence?.repair===undefined&&<RepairReceipt value={state.stagedScreen?.repair}/>}
 </section>;
}
