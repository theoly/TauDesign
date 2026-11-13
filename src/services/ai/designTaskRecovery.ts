import {readBusinessDuties} from './businessInventoryOwnership';
import type {AIProviderConfig} from '../../types/provider';
import type {ProjectStorage} from '../storage/projectStorage';
import {readDesignTask,claimDesignTaskRecovery,type SavedDesignTask,type HistoricalTaskCost} from '../storage/designTaskRepository';
import {AttachmentStore} from '../storage/attachmentStore';
import {pageCreationContext,type PageCreationState} from './pageCreationValidation';
import {taskProvenanceIssue} from './taskProvenance';
import {modelConfigurationFingerprint} from './modelConfiguration';
import {referenceImageIdentity} from './workflowSources';
import {contentFingerprint,type DesignTaskContract} from './designWorkflow';
import {parsePageComposition} from './pageComposition';
import {compileSectionPlan} from './pageTaskGeneration';
import type {TextReference} from './textFileContext';
import type {ImageAttachment} from '../../types/referenceImage';
import {validReferenceRegion} from '../../types/referenceImage';
import {parseSectionPlan,sameSectionPlanScope,type SectionPlan} from './sectionedGeneration';
import {buildPageRedesignSource} from './pageRedesignSource';
import {validPageWriteStrategy,type PageWriteStrategy} from './generationStrategy';
import {pageTaskPlanIssue} from './pageTaskPlan';
import type {TaskDraftUpdate} from './designTaskJournal';

export interface PreparedTaskRecovery {id:string;originTaskId:string;request:string;kind:'create'|'redesign';reusableRegions:number;history:HistoricalTaskCost[];previousBudget?:SavedDesignTask['budget'];}
export type PreparedDesignRecovery=PreparedTaskRecovery|import('./treeTaskRecovery').PreparedTreeTaskRecovery;
export interface RecoveryData {source:SavedDesignTask;kind:PreparedTaskRecovery['kind'];history:HistoricalTaskCost[];strategy?:PageWriteStrategy;attachment?:ImageAttachment;textReferences:TextReference[];regions?:{plan:SectionPlan;completed:Array<{id:string;html:string}>}}
const handles=new WeakMap<PreparedTaskRecovery,{data:RecoveryData;sourceFingerprint:string;claimed:boolean;ownerTaskId?:string}>();
/** Restore independent input bytes without silently dropping missing text or images. */
export async function restoreTaskRecoveryInputs(storage:ProjectStorage,saved:NonNullable<Awaited<ReturnType<typeof readDesignTask>>>){
 const source=saved.task;
 const textReferences:TextReference[]=[];
 for(const file of source.inputs?.textFiles??[]){
  const content=saved.parts.find(p=>p.stepId===file.stepId)?.html;
  if(content===undefined||!file.source||!['upload','paste','path'].includes(file.source)||!source.contract.knowledgeSources.some(s=>s.kind==='text-reference'&&s.id===(file.sourcePath??file.name)&&s.fingerprint===contentFingerprint(content)))throw Error('原文本来源不完整或已变化，未在恢复时省略。');
  textReferences.push({name:file.name,source:file.source,content,...(file.sourcePath?{path:file.sourcePath}:{})});
 }
 if(source.contract.knowledgeSources.filter(s=>s.kind==='text-reference').length!==textReferences.length)throw Error('原参考文本未完整保存，请重新提供文本后生成。');
 let attachment:ImageAttachment|undefined;
 if(source.inputs?.attachment){const file=source.inputs.attachment;if(file.region&&!validReferenceRegion(file.region))throw Error('原图片选区身份无效。');const dataUrl=await new AttachmentStore(storage).readDataUrl(file.relPath);if(!dataUrl)throw Error('独立参考图片缺失，未启动恢复。');attachment={name:file.name,dataUrl,...(file.region?{region:structuredClone(file.region)}:{})};if(referenceImageIdentity(attachment).fingerprint!==source.contract.referenceImage?.fingerprint)throw Error('独立参考图片字节已变化。');}
 if(Boolean(attachment)!==Boolean(source.contract.referenceImage))throw Error('原参考图片资料不完整，不能忽略图片继续。');
 return {attachment,textReferences};
}
/** Reading files is never authorization to resume the former task or its ledger. */
export async function prepareTaskRecovery(storage:ProjectStorage,id:string,state:PageCreationState,provider:AIProviderConfig,model:string):Promise<PreparedTaskRecovery>{
 const saved=await readDesignTask(storage,state.id,id);if(!saved)throw Error('任务缺失或文件校验失败，只能查看，未启动恢复。');
 if(saved.deletionPending)throw Error('该任务已删除，残留资料仅供核对，不能恢复。');
 if(saved.publication)throw Error('此任务的设计已保存，请核对交付历史并同步完成状态，不重复恢复。');
 if(await storage.exists(`tasks/${id}/recovery-claim.json`))throw Error('此任务已被另一恢复任务接替，请查看新任务记录。');
 const source=saved.task;
 const redesign=source.contract.operation==='modify'&&Boolean(source.contract.wholePageRedesign)&&Boolean(source.contract.target)&&source.contract.allowedChanges.join(',')===`screen:${source.contract.target!.id}`;
 const create=source.contract.operation==='create'&&!source.contract.target&&source.contract.allowedChanges.join(',')==='new-screen';
 if(source.state==='completed'||source.generationTree||!create&&!redesign||source.contract.elementNid||source.contract.multiPage)throw Error('此记录不能通过单页新任务恢复；请从原修改或多页流程重新发起。');
 if(source.sectionPlan&&(source.sectionPlan as {version:unknown}).version===1)throw Error('旧V1分区草稿仅供查看；请明确以新任务重新规划，不能自动跨版本续写。');
 if(source.contextFingerprint!==pageCreationContext(state))throw Error('原页面、主题、文档、L4或资源已变化，不能复用旧草稿；请按当前工程重新生成。');
 if(source.binding.providerId!==provider.id||source.binding.model!==model||!source.binding.configurationFingerprint||source.binding.configurationFingerprint!==await modelConfigurationFingerprint(provider,model))throw Error('模型配置已变化或旧记录缺少配置身份，不能自动复用；请重新生成。');
 const provenance=taskProvenanceIssue(source.contract,false);if(provenance)throw Error(provenance);
 if(redesign){
  const target=state.screens[source.contract.target!.id];if(!target||contentFingerprint(target.htmlContent)!==source.contract.target!.baselineFingerprint)throw Error('原目标页面已变化，不能恢复整页修改。');
  const inventory=buildPageRedesignSource(target.htmlContent,{deviceProfile:state.settings.deviceProfile,useCustomNavigation:state.settings.useCustomNavigation,protectedNids:source.contract.protectedNids});
  if(source.contract.wholePageRedesign!.sourceFingerprint!==inventory.sourceFingerprint||source.contract.wholePageRedesign!.inventoryFingerprint!==contentFingerprint(JSON.stringify(inventory)))throw Error('原业务/保护清单与当前目标不匹配，不能恢复整页权限。');
 }
 const strategy=source.contract.pageWriteStrategy;if(strategy&&!validPageWriteStrategy(strategy))throw Error('原任务写入模式无效，未选择替代策略。');
 const {attachment,textReferences}=await restoreTaskRecoveryInputs(storage,saved);
 let regions:RecoveryData['regions'];
 const plan=source.sectionPlan,task=source.contract.pageTaskPlan?.plan;
 if(plan?.version===2&&plan.composition&&task){
  parsePageComposition(plan.composition,task,state.settings.deviceProfile);
  const business=redesign?readBusinessDuties(buildPageRedesignSource(state.screens[source.contract.target!.id].htmlContent,{deviceProfile:state.settings.deviceProfile,useCustomNavigation:state.settings.useCustomNavigation,protectedNids:source.contract.protectedNids}),plan):undefined;
  const reference=source.contract.referenceImage?.evidence&&plan.sections.some(section=>JSON.parse(section.requirements).referenceFields!==undefined)?{evidence:source.contract.referenceImage.evidence,request:source.request}:undefined;
  const fresh=compileSectionPlan(task,state.settings.deviceProfile,plan.title,plan.composition,reference,business);
  if(!sameSectionPlanScope(fresh,parseSectionPlan(plan)))throw Error('原分区职责或程序布局与功能合同不一致。');
  const completed=plan.sections.flatMap(section=>{const part=saved.parts.find(p=>p.stepId===section.id&&p.complete);return part?[{id:section.id,html:part.html}]:[];});
  if(completed.some((part,i)=>part.id!==plan.sections[i].id))throw Error('原完成区块不是连续前缀，不能猜测恢复位置。');
  // A failed fully assembled page needs a new complete generation/repair, not a fake zero-call pass.
  if(completed.length&&completed.length<plan.sections.length)regions={plan:parseSectionPlan(plan),completed};
 }
 const history:HistoricalTaskCost[]=structuredClone(source.recovery?.ancestors??(source.originTaskId?[{taskId:source.originTaskId,...(source.recovery?.previousBudget?{budget:source.recovery.previousBudget}:{})}]:[]));
 history.push({taskId:source.id,...(source.budget?{budget:structuredClone(source.budget)}:{})});
 if(history.length>32||new Set(history.map(row=>row.taskId)).size!==history.length)throw Error('恢复链超出32项或包含重复身份；请重新发起任务，旧账本保留。');
 const kind=redesign?'redesign' as const:'create' as const,data:RecoveryData={source,kind,history,strategy,attachment,textReferences,regions},handle=Object.freeze({id:crypto.randomUUID(),originTaskId:id,request:source.request,kind,reusableRegions:regions?.completed.length??0,history:structuredClone(history),previousBudget:source.budget});
 handles.set(handle,{data,sourceFingerprint:contentFingerprint(JSON.stringify(source)),claimed:false});return handle;
}
export function recoveryData(handle:PreparedTaskRecovery):RecoveryData {const entry=handles.get(handle);if(!entry||entry.claimed)throw Error('恢复选择已使用或无效。');return structuredClone(entry.data);}
/** Copy all reusable inputs into the new durable task before claiming its source. */
export function prepareRecoveryDraft(handle:PreparedTaskRecovery,update:TaskDraftUpdate):TaskDraftUpdate{
 const entry=handles.get(handle);if(!entry||entry.claimed&&entry.ownerTaskId!==update.contract.taskId)throw Error('恢复检查点不属于当前恢复任务。');const data=entry.data,copy=structuredClone(update);
 if(copy.contract.taskId===data.source.id||copy.contract.request!==data.source.request)throw Error('恢复检查点必须属于新的同范围任务。');
 if(data.strategy){copy.contract.pageWriteStrategy=structuredClone(data.strategy);if(data.strategy.mode==='SectionedPatch')copy.contract.generationMode='sections';}
 if(data.source.contract.pageTaskPlan){copy.contract.pageTaskPlan=structuredClone(data.source.contract.pageTaskPlan);const issue=pageTaskPlanIssue(copy.contract);if(issue)throw Error(issue);}
 if(data.regions){
  if(copy.plan&&!sameSectionPlanScope(copy.plan,data.regions.plan))throw Error('恢复目标计划已变化，不能重写原完成区域。');copy.plan=structuredClone(data.regions.plan);
  for(const part of data.regions.completed){const next=copy.completed?.find(next=>next.id===part.id);if(next&&next.html!==part.html)throw Error('恢复任务改写了只读完成区域。');}
  copy.completed=[...structuredClone(data.regions.completed),...(copy.completed??[]).filter(part=>!data.regions!.completed.some(old=>old.id===part.id))];
 }
 return copy;
}
/** Called only AFTER the fresh task manifest is durable, BEFORE its first model request. */
export async function claimPreparedRecovery(storage:ProjectStorage,handle:PreparedTaskRecovery,newContract:DesignTaskContract):Promise<void>{
 const entry=handles.get(handle);if(!entry||entry.claimed||newContract.taskId===handle.originTaskId||newContract.request!==entry.data.source.request)throw Error('恢复需要新的、明确的任务合同。');
 const original=entry.data.source.contract;
 if(entry.data.kind==='create'?newContract.operation!=='create'||Boolean(newContract.target)||newContract.allowedChanges.join(',')!=='new-screen':newContract.operation!=='modify'||newContract.elementNid||JSON.stringify(newContract.target)!==JSON.stringify(original.target)||JSON.stringify(newContract.wholePageRedesign)!==JSON.stringify(original.wholePageRedesign)||newContract.allowedChanges.join(',')!==original.allowedChanges.join(','))throw Error('恢复范围与原任务不一致，不能扩大为其它修改。');
 const current=await readDesignTask(storage,entry.data.source.projectId,handle.originTaskId),child=await readDesignTask(storage,entry.data.source.projectId,newContract.taskId);
 if(!current||contentFingerprint(JSON.stringify(current.task))!==entry.sourceFingerprint||!child||child.task.originTaskId!==handle.originTaskId)throw Error('原任务变化或新恢复任务尚未持久化，未发送请求。');
 if(entry.data.strategy&&JSON.stringify(child.task.contract.pageWriteStrategy)!==JSON.stringify(entry.data.strategy)||entry.data.regions?.completed.some(part=>!child.parts.some(copy=>copy.stepId===part.id&&copy.complete&&copy.html===part.html)))throw Error('适用完整区块或冻结模式尚未独立保存到新任务，未占用原记录。');
 const expectedRecovery={version:1,kind:entry.data.kind,sourceFingerprint:entry.sourceFingerprint,reusedStepIds:entry.data.regions?.completed.map(part=>part.id)??[],ancestors:entry.data.history};
 if(JSON.stringify(child.task.recovery)!==JSON.stringify(expectedRecovery))throw Error('新任务尚未完整保存恢复来源及历史用量，未占用原记录。');
 entry.claimed=true;entry.ownerTaskId=newContract.taskId;if(!await claimDesignTaskRecovery(storage,current.task,newContract.taskId))throw Error('此草稿已由另一个恢复任务占用，未重复调用模型。');
}
