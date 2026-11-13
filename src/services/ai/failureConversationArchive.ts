import {ConversationStore,type ConversationTurn} from '../storage/conversationStore';
import type {ProjectStorage} from '../storage/projectStorage';
import {AttachmentStore} from '../storage/attachmentStore';
import {listDesignTasks} from '../storage/designTaskRepository';
import type {ConversationFailure} from '../storage/conversationFailure';
import type {DesignTaskContract} from './designWorkflow';
import type {TaskBudgetSnapshot} from './taskBudget';
import type {RequestActivity} from './requestActivity';
import type {ImageAttachment} from '../../types/referenceImage';
import type {TextReference} from './textFileContext';
import {capturePageTaskHistory} from './pageTaskHistory';
import {captureDesignGuidanceHistory} from './designKnowledge/history';
import {safeModelDiagnostic} from './transportFailure';
import {embeddedMediaIssue} from './externalMedia';

export interface FailureArchiveSource {
 storage:ProjectStorage;request:string;reviewRequest?:string;attachment?:ImageAttachment;textReferences?:TextReference[];
 reference?:ConversationTurn['user']['reference'];model?:string;apiKey?:string;startedAt:number;
}
export interface FailureArchiveResult {message:string;status:ConversationFailure['status'];contract?:DesignTaskContract;budget?:TaskBudgetSnapshot;activity?:RequestActivity;phase?:string}
const number=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
function metadata(source:Pick<FailureArchiveSource,'model'|'apiKey'>,result:FailureArchiveResult):ConversationFailure{
 const clean=(s:string)=>safeModelDiagnostic(s,source.apiKey).slice(0,200),activity=result.activity,budget=result.budget;
 const message=safeModelDiagnostic(result.message,source.apiKey).slice(0,4000)||'本次操作未完成。';
 const counts={requests:budget?.requests??activity?.requests??0,requestLimit:budget?.limits.maxRequests,effectiveOutputTokens:activity?.effectiveOutputTokens,httpStatus:activity?.httpStatus,inputTokens:budget?.reportedInputTokens,outputTokens:budget?.reportedOutputTokens};
 return {version:1,status:result.status,message:embeddedMediaIssue(message)?'失败诊断含内嵌媒体，原始媒体正文未存入对话。':message,
  ...(result.contract?.taskId?{taskId:clean(result.contract.taskId)}:{}),...(result.phase?{phase:clean(result.phase)}:{}),...(source.model?{model:clean(source.model)}:{}),...(activity?.lastFinishReason?{finishReason:clean(activity.lastFinishReason)}:{}),
  ...Object.fromEntries(Object.entries(counts).filter(([,v])=>number(v)))};
}
/** Exactly one immutable turn per actual task; source scope was frozen before its async work. */
export async function archiveFailedConversation(source:FailureArchiveSource,result:FailureArchiveResult):Promise<boolean>{
 try{const failure=metadata(source,result);let path:string|undefined;
  if(source.attachment){const saved=await new AttachmentStore(source.storage).saveReference(source.attachment.name,source.attachment.dataUrl);path=saved?.relPath;if(!path)failure.attachmentUnavailable=true;}
  return await new ConversationStore(source.storage).appendTurnIfAbsent({turnId:failure.taskId?`failed-task-${failure.taskId}`:`failed-attempt-${crypto.randomUUID()}`,ts:source.startedAt,
   user:{text:source.request,...(source.reviewRequest?{reviewRequest:source.reviewRequest}:{}),...(source.reference?{reference:source.reference}:{}),...(path?{attachments:[path]}:{}),textFiles:source.textReferences?.map(r=>r.path??r.name)},
   assistant:{text:failure.message,failure,model:failure.model,durationMs:Math.max(0,Date.now()-source.startedAt),pageTaskHistory:capturePageTaskHistory(result.contract,source.request),designGuidanceHistory:captureDesignGuidanceHistory(result.contract,source.request)}});
 }catch{return false;}
}
/** Bounded by the existing task index (latest 40 valid entries); never recreates execution authority. */
export async function backfillFailedConversations(storage:ProjectStorage,projectId:string):Promise<boolean>{
 try{const tasks=await listDesignTasks(storage,projectId);const store=new ConversationStore(storage);let readable=false;
  for(const task of tasks){if(!['blocked','cancelled'].includes(task.state)||!task.error)continue;
   const failure=metadata({model:task.binding.model},{message:task.error,status:task.state==='cancelled'?'cancelled':'failed',contract:task.contract,budget:task.budget});
   readable=await store.appendTurnIfAbsent({turnId:`failed-task-${task.id}`,ts:task.createdAt,user:{text:task.request,...(task.contract.target?{reference:{screen:{id:task.contract.target.id,name:task.contract.target.name}}}:{}),...(task.inputs?.attachment?{attachments:[task.inputs.attachment.relPath]}:{})},assistant:{text:failure.message,failure,model:failure.model,pageTaskHistory:capturePageTaskHistory(task.contract,task.request),designGuidanceHistory:captureDesignGuidanceHistory(task.contract,task.request)}})||readable;
  }
  return readable;
 }catch{/* Auxiliary history must not prevent the original conversation from opening. */return false;}
}
