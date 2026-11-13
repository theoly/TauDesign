import {modelConfigurationFingerprint} from './modelConfiguration';
import {safeModelDiagnostic} from './transportFailure';
import type {DesignTaskContract} from './designWorkflow';
import {isTaskBudgetSnapshot,type TaskBudgetSnapshot} from './taskBudget';
import type {SectionPlan} from './sectionedGeneration';
import type {ProjectStorage} from '../storage/projectStorage';
import type {AIProviderConfig} from '../../types/provider';
import type {ImageAttachment} from '../../types/referenceImage';
import type {TextReference} from './textFileContext';
import {endpointIdentity} from './modelCapabilities';
import {AttachmentStore} from '../storage/attachmentStore';
import {saveDesignTask,readDesignTask,type SavedDesignTask} from '../storage/designTaskRepository';
import {embeddedMediaIssue} from './externalMedia';
import {htmlIsComplete} from '../../utils/htmlCompleteness';
import {withTaskRequestTrace,validTaskRequestTrace,type TaskRequestTrace} from './taskRequestTrace';
import type {AIEngineCore} from './engine/core/types';

export interface TaskDraftUpdate {
 phase:'started'|'regions'|'result';contract:DesignTaskContract;budget?:TaskBudgetSnapshot;
 plan?:SectionPlan;completed?:Array<{id:string;html:string}>;prefix?:string;
 result?:{html?:string;error?:string;cancelled?:boolean};
}
type Part={stepId:string;html:string;complete:boolean};
/** Local draft bookkeeping only. A journal never grants execution, candidate adoption or an old budget. */
export class DesignTaskJournal {
 private task?:Omit<SavedDesignTask,'artifacts'>;
 private parts:Part[]=[];
 private queue:Promise<unknown>=Promise.resolve();
 private traces:TaskRequestTrace[]=[];
 private traceCount=0;private traceError?:Error;
 constructor(private readonly input:{storage:ProjectStorage;projectId:string;contextFingerprint:string;provider:AIProviderConfig;model:string;attachment?:ImageAttachment;textReferences?:TextReference[];originTaskId?:string;recovery?:SavedDesignTask['recovery'];isCurrent:()=>boolean}){}
 wrapCore(core:AIEngineCore):AIEngineCore{return withTaskRequestTrace(core,trace=>{if(!validTaskRequestTrace(trace)||++this.traceCount>256){this.traceError=Error('调用记录无效或超过256项配额。');return;}this.traces.push(trace);});}
 private async flushTraces(){
  if(!this.task)return;
  if(this.traceError)throw this.traceError;
  const path=`tasks/${this.task.id}/attempts.jsonl`,pending=this.traces.splice(0);
  if(!pending.length)return;const old=this.input.storage.readTextLimited?await this.input.storage.readTextLimited(path,512*1024):await this.input.storage.readText(path);
  if(new TextEncoder().encode((old??'')+pending.map(row=>JSON.stringify(row)).join('\n')).length>512*1024)throw Error('调用记录超过512KiB配额。');
  for(const trace of pending){if(trace.taskId!==this.task.id)throw Error('调用记录与当前任务身份不匹配。');await this.input.storage.appendLine(path,JSON.stringify(trace));}
 }
 update(update:TaskDraftUpdate):Promise<void>{
  const copy=structuredClone(update),run=this.queue.then(()=>this.write(copy));this.queue=run;return run;
 }
 private async write(update:TaskDraftUpdate){
  if(!this.input.isCurrent())throw Error('工程或任务已变化，未保存旧任务草稿。');
  if(update.budget!==undefined&&!isTaskBudgetSnapshot(update.budget))throw Error('任务预算记录无效，未保存草稿或迟到结算。');
  if(!this.task){
   const old=await readDesignTask(this.input.storage,this.input.projectId,update.contract.taskId);
   if(old){if(old.task.contextFingerprint!==this.input.contextFingerprint||old.task.state==='completed')throw Error('任务存档来源不匹配或已经完成。');this.task=old.task;this.parts=old.parts;}
   else{
    const textFiles=structuredClone(this.input.textReferences??[]);if(textFiles.length>16)throw Error('恢复草稿最多保存16份文本来源，请缩小任务。');
    const files=textFiles.map((f,i)=>({name:f.name,source:f.source,stepId:`input-text-${i+1}`,...(f.path?{sourcePath:f.path}:{})}));
    this.parts=textFiles.map((f,i)=>({stepId:files[i].stepId,html:f.content,complete:false}));
    let attachment:NonNullable<SavedDesignTask['inputs']>['attachment'];
    if(this.input.attachment){const asset=await new AttachmentStore(this.input.storage).saveReference(this.input.attachment.name,this.input.attachment.dataUrl);if(!asset)throw Error('参考图片未能独立落盘，未开始页面生成。');attachment={name:this.input.attachment.name,relPath:asset.relPath,...(this.input.attachment.region?{region:structuredClone(this.input.attachment.region)}:{})};}
    this.task={version:1,id:update.contract.taskId,projectId:this.input.projectId,createdAt:Date.now(),updatedAt:Date.now(),state:'draft',request:update.contract.request,contextFingerprint:this.input.contextFingerprint,
     binding:{providerId:this.input.provider.id,model:this.input.model,endpointIdentity:endpointIdentity(this.input.provider),configurationFingerprint:await modelConfigurationFingerprint(this.input.provider,this.input.model)},contract:update.contract,
     inputs:{textFiles:files,...(attachment?{attachment}:{})},...(this.input.originTaskId?{originTaskId:this.input.originTaskId}:{}),...(this.input.recovery?{recovery:structuredClone(this.input.recovery)}:{})};
   }
  }
  if(this.task.id!==update.contract.taskId||this.task.request!==update.contract.request)throw Error('任务存档不能切换到另一个任务。');
  await this.flushTraces();
  const takeover=await this.input.storage.readText(`tasks/${this.task.id}/recovery-claim.json`);
  if(takeover!==null){
   // A source owner may settle its late cost, but may not publish another old body/candidate.
   if(update.budget)await this.input.storage.appendLine(`tasks/${this.task.id}/attempts.jsonl`,JSON.stringify({version:1,at:Date.now(),kind:'superseded-settlement',budget:update.budget}));
   throw Error('旧任务已被新恢复任务接替，停止旧执行，未提交旧结果。');
  }
  this.task.contract=update.contract;this.task.budget=update.budget;this.task.updatedAt=Date.now();
  if(update.plan)this.task.sectionPlan=structuredClone(update.plan);
  const put=(part:Part)=>{this.parts=this.parts.filter(p=>p.stepId!==part.stepId);this.parts.push(part);};
  for(const part of update.completed??[])put({stepId:part.id,html:part.html,complete:true});
  if(update.prefix&&!embeddedMediaIssue(update.prefix))put({stepId:'active-prefix',html:update.prefix,complete:false});
  else if(update.completed)this.parts=this.parts.filter(p=>p.stepId!=='active-prefix');
  if(update.result){
   const {html,error,cancelled}=update.result;
   if(html&&!embeddedMediaIssue(html))put({stepId:'page-body',html,complete:htmlIsComplete(html)});
   this.task.state=cancelled?'cancelled':error?'blocked':'draft';
   if(error)this.task.error=safeModelDiagnostic(error,this.input.provider.apiKey).slice(0,2000);else delete this.task.error;
  }
  if(!this.input.isCurrent())throw Error('任务来源已变化，未公布恢复草稿。');
  await saveDesignTask(this.input.storage,this.task,this.parts);
 }
 async markDelivered(budget?:TaskBudgetSnapshot){
  if(budget!==undefined&&!isTaskBudgetSnapshot(budget))throw Error('任务预算记录无效，未登记完成。');
  await this.queue;if(!this.task)return;
  await this.flushTraces();
  // The owner invokes this only after its ordinary delivery/History gate, never from a loaded file.
  this.task={...this.task,state:'completed',...(budget?{budget}:{}),updatedAt:Date.now()};await saveDesignTask(this.input.storage,this.task,this.parts);
 }
 get taskId(){return this.task?.id;}
}
