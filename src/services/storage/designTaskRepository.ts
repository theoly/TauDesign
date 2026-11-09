import {htmlIsComplete} from '../../utils/htmlCompleteness';
import type {ProjectStorage} from './projectStorage';
import type {DesignTaskContract} from '../ai/designWorkflow';
import {isTaskBudgetSnapshot,type TaskBudgetSnapshot} from '../ai/taskBudget';
import {isTaskContractShape} from '../ai/taskContractShape';
import type {SectionedCheckpoint} from '../ai/sectionedGeneration';
import {checkGenerationSourceSafety} from '../ai/generationQuality';
import {assertExternalMedia,embeddedMediaIssue} from '../ai/externalMedia';
import {validateGenerationTree,type GenerationTree} from '../ai/generationGraph';
import {validTaskRequestTrace,type TaskRequestTrace} from '../ai/taskRequestTrace';
import {DeliveryRepository} from './deliveryRepository';
import {candidateAuthorizationBinding} from '../ai/candidateInputBinding';
import {sameRecordedHtml} from '../ai/taskProvenance';
import {validTreeTaskCheckpoint,checkTreeLeafArtifact,type TreeTaskCheckpoint} from '../ai/treeTaskCheckpoint';
import {readPublicationCommits,matchesPublicationCommit} from './projectPublicationRecord';

export interface TaskPublication {id:string;kind:'candidate'|'batch';at:number;screenIds:string[]}

export interface HistoricalTaskCost {taskId:string;budget?:TaskBudgetSnapshot}
export interface SavedDesignTask {
 version:1;id:string;projectId:string;createdAt:number;updatedAt:number;
 state:'draft'|'blocked'|'completed'|'cancelled';request:string;contextFingerprint:string;
 binding:{providerId:string;model:string;endpointIdentity:string;configurationFingerprint?:string};contract:DesignTaskContract;
 budget?:TaskBudgetSnapshot;originTaskId?:string;
 recovery?:{version:1;kind:'create'|'redesign'|'tree';sourceFingerprint:string;reusedStepIds:string[];previousBudget?:TaskBudgetSnapshot;ancestors?:HistoricalTaskCost[]};
 delivery?:{id:string;screenId:string;resultFingerprint:string;completedAt:number};
 inputs?:{textFiles:Array<{name:string;stepId:string;source?:'upload'|'paste'|'path';sourcePath?:string}>;attachment?:{name:string;relPath:string;region?:import('../../types/referenceImage').ReferenceRegion}};
 artifacts:Array<{stepId:string;path:string;sha256:string;complete:boolean}>;
 sectionPlan?:SectionedCheckpoint['plan'];
 generationTree?:{version:1;path:string;sha256:string};
 treeCheckpoint?:TreeTaskCheckpoint;
 error?:string;
}
const validId=(id:string)=>/^design-[a-z0-9-]{1,110}$/.test(id);
const dir=(id:string)=>{if(!validId(id))throw Error('任务标识无效。');return `tasks/${id}`;};
/** Browser storage lists descendants; native storage lists direct children. Normalize in this repository. */
async function taskFolders(storage:ProjectStorage){return [...new Set((await storage.listDir('tasks')).map(name=>name.split('/')[0]).filter(validId))];}
const binaryPayload=(text:string)=>/data:(?:image|audio|video|font|application\/octet-stream)[^\s"']*[,;]/i.test(text);
const queues=new Map<string,Promise<unknown>>();
async function serialized<T>(storage:ProjectStorage,action:()=>Promise<T>):Promise<T>{
 const key=storage.scopeKey??storage;const queueKey=typeof key==='string'?key:'memory';
 const run=(queues.get(queueKey)??Promise.resolve()).catch(()=>{}).then(action);queues.set(queueKey,run);
 try{return await run;}finally{if(queues.get(queueKey)===run)queues.delete(queueKey);}
}
async function sha256(value:string){const bytes=new TextEncoder().encode(value);return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');}
async function boundedText(storage:ProjectStorage,path:string,maxBytes:number){if(storage.readTextLimited)return storage.readTextLimited(path,maxBytes);const text=await storage.readText(path);if(text!==null&&new TextEncoder().encode(text).length>maxBytes)throw Error('任务文件超过读取配额。');return text;}
function valid(value:SavedDesignTask,projectId:string):boolean{
 return !!value&&Object.keys(value).every(k=>['version','id','projectId','createdAt','updatedAt','state','request','contextFingerprint','binding','contract','budget','originTaskId','artifacts','sectionPlan','generationTree','treeCheckpoint','error','inputs','delivery','recovery'].includes(k))&&value.version===1&&validId(value.id)&&value.projectId===projectId&&['draft','blocked','completed','cancelled'].includes(value.state)&&
  Number.isSafeInteger(value.createdAt)&&value.createdAt>=0&&Number.isSafeInteger(value.updatedAt)&&value.updatedAt>=value.createdAt&&(value.originTaskId===undefined||validId(value.originTaskId)&&value.originTaskId!==value.id)&&typeof value.request==='string'&&value.request.length<=100000&&typeof value.contextFingerprint==='string'&&
  (value.delivery===undefined||value.state==='completed'&&Object.keys(value.delivery).sort().join(',')==='completedAt,id,resultFingerprint,screenId'&&/^delivery-[a-z0-9-]+$/.test(value.delivery.id)&&typeof value.delivery.screenId==='string'&&value.delivery.screenId.length<=200&&/^[a-f0-9]{8}$/.test(value.delivery.resultFingerprint)&&Number.isSafeInteger(value.delivery.completedAt)&&value.delivery.completedAt>=value.createdAt)&&
  (value.recovery===undefined||Boolean(value.originTaskId&&value.recovery&&Object.keys(value.recovery).every(key=>['version','kind','sourceFingerprint','reusedStepIds','previousBudget','ancestors'].includes(key))&&value.recovery.version===1&&['create','redesign','tree'].includes(value.recovery.kind)&&/^[a-f0-9]{8}$/.test(value.recovery.sourceFingerprint)&&Array.isArray(value.recovery.reusedStepIds)&&value.recovery.reusedStepIds.length<=64&&new Set(value.recovery.reusedStepIds).size===value.recovery.reusedStepIds.length&&value.recovery.reusedStepIds.every(id=>/^[a-z0-9-]{1,80}$/.test(id))&&(value.recovery.previousBudget===undefined||isTaskBudgetSnapshot(value.recovery.previousBudget))&&(value.recovery.ancestors===undefined||value.recovery.previousBudget===undefined&&Array.isArray(value.recovery.ancestors)&&value.recovery.ancestors.length>0&&value.recovery.ancestors.length<=32&&new Set(value.recovery.ancestors.map(row=>row.taskId)).size===value.recovery.ancestors.length&&value.recovery.ancestors.at(-1)?.taskId===value.originTaskId&&value.recovery.ancestors.every(row=>row&&Object.keys(row).every(key=>['taskId','budget'].includes(key))&&validId(row.taskId)&&row.taskId!==value.id&&(row.budget===undefined||isTaskBudgetSnapshot(row.budget))))))&&
  (value.treeCheckpoint===undefined||validTreeTaskCheckpoint(value.treeCheckpoint,value.contextFingerprint,value.request))&&
  !!value.binding&&Object.keys(value.binding).every(k=>['providerId','model','endpointIdentity','configurationFingerprint'].includes(k))&&(value.binding.configurationFingerprint===undefined||/^[a-f0-9]{64}$/.test(value.binding.configurationFingerprint))&&['providerId','model','endpointIdentity'].every(k=>typeof value.binding[k as keyof typeof value.binding]==='string')&&
  isTaskContractShape(value.contract)&&(value.generationTree===undefined||value.generationTree.version===1&&/^[a-f0-9]{64}$/.test(value.generationTree.sha256)&&value.generationTree.path===`${dir(value.id)}/generation-tree-${value.generationTree.sha256}.json`)&&(value.budget===undefined||isTaskBudgetSnapshot(value.budget))&&value.contract?.version===1&&value.contract.taskId===value.id&&value.contract.request===value.request&&
  Array.isArray(value.artifacts)&&value.artifacts.length<=32&&new Set(value.artifacts.map(a=>a.stepId)).size===value.artifacts.length&&
  value.artifacts.every(a=>/^[a-z0-9-]{1,80}$/.test(a.stepId)&&a.path===`${dir(value.id)}/artifacts/${a.stepId}-${a.sha256}.html`&&/^[a-f0-9]{64}$/.test(a.sha256)&&typeof a.complete==='boolean')&&
  (value.inputs===undefined||Boolean(value.inputs&&Array.isArray(value.inputs.textFiles)&&value.inputs.textFiles.length<=16&&value.inputs.textFiles.every(f=>typeof f.name==='string'&&f.name.length<=500&&/^input-text-\d+$/.test(f.stepId)&&value.artifacts.some(a=>a.stepId===f.stepId))&&(!value.inputs.attachment||typeof value.inputs.attachment.name==='string'&&/^assets\/images\/[a-f0-9]+\.(?:png|jpe?g|gif|webp)$/.test(value.inputs.attachment.relPath))))&&!binaryPayload(JSON.stringify(value));
}
/** Artifacts are immutable content-addressed files. Only the final atomic manifest publishes them. */
export async function saveDesignTask(storage:ProjectStorage,input:Omit<SavedDesignTask,'artifacts'>,parts:Array<{stepId:string;html:string;complete:boolean}>,tree?:GenerationTree):Promise<SavedDesignTask>{
 return serialized(storage,async()=>{
  const expected=storage.taskManifestIdentity?await storage.taskManifestIdentity(input.id):undefined;
  if(parts.length>32||new Set(parts.map(p=>p.stepId)).size!==parts.length)throw Error('任务产物数量或身份无效。');
  const artifacts:SavedDesignTask['artifacts']=[];let bytes=0;
  for(const part of parts){
   if(!/^[a-z0-9-]{1,80}$/.test(part.stepId)||typeof part.html!=='string'||binaryPayload(part.html)||embeddedMediaIssue(part.html))throw Error('任务产物含禁止的媒体正文或非法身份。');
   bytes+=new TextEncoder().encode(part.html).length;if(bytes>4*1024*1024)throw Error('任务草稿超过4MiB配额。');
   if(part.complete){if(!part.html.trim()||!htmlIsComplete(part.html))throw Error('标记完整的产物实际尚未结束。');if(!checkGenerationSourceSafety(part.html).passed)throw Error('完整产物源安全检查失败。');assertExternalMedia(part.html);}
   const hash=await sha256(part.html);artifacts.push({stepId:part.stepId,path:`${dir(input.id)}/artifacts/${part.stepId}-${hash}.html`,sha256:hash,complete:part.complete});
  }
  let treeJson:string|undefined;
  const task:SavedDesignTask={...structuredClone(input),artifacts};
  if(tree){const copy=structuredClone(tree);if(copy.taskId!==input.id)throw Error('生成树不属于当前任务。');validateGenerationTree(copy);
   const visit=(node:GenerationTree['root'])=>{const artifact=artifacts.find(a=>a.stepId===node.id);if(node.status==='generated'&&(!artifact||!artifact.complete))throw Error('生成树缺少已验证父产物。');if(artifact)node.output=artifact.path.slice(dir(input.id).length+1);node.children.forEach(visit);};visit(copy.root);
   treeJson=JSON.stringify(copy);if(new TextEncoder().encode(treeJson).length>100000)throw Error('生成树超过100KiB额度。');const hash=await sha256(treeJson);task.generationTree={version:1,path:`${dir(input.id)}/generation-tree-${hash}.json`,sha256:hash};
  }
  if(!valid(task,input.projectId)||new TextEncoder().encode(JSON.stringify(task)).length>800000)throw Error('任务清单无效或过大。');
  const folders=await taskFolders(storage);
  if(!folders.includes(task.id)&&folders.length>=40)throw Error('设计任务存档已达40项，请在任务记录中清理历史任务。');
  await storage.ensureDir(`${dir(task.id)}/artifacts`);
  for(let i=0;i<parts.length;i++)await storage.writeTextAtomic(artifacts[i].path,parts[i].html);
  if(treeJson)await storage.writeTextAtomic(task.generationTree!.path,treeJson);
  if(storage.publishTaskManifest)await storage.publishTaskManifest(task.id,expected??null,JSON.stringify(task));else await storage.writeTextAtomic(`${dir(task.id)}/manifest.json`,JSON.stringify(task));
  const keep=new Set(artifacts.map(a=>a.path));
  for(const name of (await storage.listDir(`${dir(task.id)}/artifacts`)).slice(0,128)){const path=`${dir(task.id)}/artifacts/${name}`;if(/^[a-z0-9-]{1,80}-[a-f0-9]{64}\.html$/.test(name)&&!keep.has(path))await storage.remove(path).catch(()=>{});}
  return task;
 });
}
async function readRecoveryClaim(storage:ProjectStorage,id:string):Promise<{newTaskId:string;createdAt:number}|undefined>{
 try{const raw=await boundedText(storage,`${dir(id)}/recovery-claim.json`,2048);if(!raw)return;const value=JSON.parse(raw);
  if(Object.keys(value).sort().join(',')==='createdAt,newTaskId,originTaskId,version'&&value.version===1&&value.originTaskId===id&&validId(value.newTaskId)&&value.newTaskId!==id&&Number.isSafeInteger(value.createdAt)&&value.createdAt>=0)return {newTaskId:value.newTaskId,createdAt:value.createdAt};
 }catch{/* A damaged claim never supplies a destination identity or permission. */}
}
export async function readDesignTask(storage:ProjectStorage,projectId:string,id:string):Promise<{task:SavedDesignTask;parts:Array<{stepId:string;html:string;complete:boolean}>;tree?:GenerationTree;publication?:TaskPublication;deletionPending?:boolean;recoveryClaim?:{newTaskId:string;createdAt:number}}|undefined>{
 try{const raw=await boundedText(storage,`${dir(id)}/manifest.json`,800000);if(!raw||raw.length>800000)return;const task=JSON.parse(raw) as SavedDesignTask;if(task.id!==id||!valid(task,projectId))return;
  const parts:Array<{stepId:string;html:string;complete:boolean}>=[];let bytes=0;
  for(const artifact of task.artifacts){const html=await boundedText(storage,artifact.path,Math.max(1,4*1024*1024-bytes));if(html===null||binaryPayload(html)||embeddedMediaIssue(html)||await sha256(html)!==artifact.sha256)return;bytes+=new TextEncoder().encode(html).length;if(bytes>4*1024*1024)return;
   if(artifact.complete){if(!html.trim()||!htmlIsComplete(html))return;if(!checkGenerationSourceSafety(html).passed)return;assertExternalMedia(html);}parts.push({stepId:artifact.stepId,html,complete:artifact.complete});}
  let tree:GenerationTree|undefined;
  if(task.generationTree){const text=await boundedText(storage,task.generationTree.path,100000);if(!text||await sha256(text)!==task.generationTree.sha256)return;tree=JSON.parse(text);if(tree!.taskId!==id)return;validateGenerationTree(tree!);
   const visit=(node:GenerationTree['root']):boolean=>{
    if(node.status==='generated'&&!task.artifacts.some(a=>a.stepId===node.id&&a.complete&&a.path===`${dir(id)}/${node.output}`))return false;
    if(task.treeCheckpoint&&node.kind==='page-leaf'&&node.status==='generated'){const part=parts.find(p=>p.stepId===node.id);if(!part)return false;checkTreeLeafArtifact(task.treeCheckpoint,node.id,part.html);}
    return node.children.every(visit);
   };if(!visit(tree!.root))return;
  }
  const recoveryClaim=await readRecoveryClaim(storage,id),deletionPending=await storage.exists(`tasks/.locks/${id}.deleted`);
  // Historical facts do not amend the manifest, reset a ledger, or grant execution.
  const publication=deletionPending?undefined:await taskPublication(storage,projectId,task,parts,tree).catch(()=>undefined);
  return {task,parts,...(publication?{publication}:{}),...(deletionPending?{deletionPending:true}:{}),...(tree?{tree}:{}),...(recoveryClaim?{recoveryClaim}:{})};
 }catch{return;}
}
export async function listDesignTasks(storage:ProjectStorage,projectId:string,includeCompleted=false):Promise<SavedDesignTask[]>{
 return (await listDesignTaskIndex(storage,projectId,includeCompleted)).tasks;
}
export interface DesignTaskIndex {tasks:SavedDesignTask[];invalid:Array<{id:string;message:string}>;hasMore:boolean;publications:Record<string,TaskPublication>}
/** Directory identities and fixed diagnostics only; never surface damaged JSON or a Provider echo. */
export async function listDesignTaskIndex(storage:ProjectStorage,projectId:string,includeCompleted=false):Promise<DesignTaskIndex>{
 const names=(await taskFolders(storage)).sort().reverse(),tasks:SavedDesignTask[]=[],invalid:DesignTaskIndex['invalid']=[],publications:Record<string,TaskPublication>={};
 for(const id of names.slice(0,100)){
  const saved=await readDesignTask(storage,projectId,id);
  if(!saved){invalid.push({id,message:'此任务缺失、格式不受支持、超出读取额度或文件完整性校验失败；不能恢复。'});continue;}
  if(saved.publication)publications[id]=saved.publication;
  if(includeCompleted||saved.task.state!=='completed'&&!saved.publication&&!saved.recoveryClaim&&!saved.deletionPending)tasks.push(saved.task);
 }
 const ordered=tasks.sort((a,b)=>b.updatedAt-a.updatedAt);return {tasks:ordered.slice(0,40),invalid,hasMore:names.length>100||ordered.length>40,publications};
}
function taskMatchesDelivery(task:SavedDesignTask,parts:Array<{stepId:string;html:string;complete:boolean}>,record:NonNullable<Awaited<ReturnType<DeliveryRepository['get']>>>){
 const contract=record.candidate.workflowContract,body=parts.find(part=>part.stepId==='page-body'&&part.complete);
 return task.contract.operation==='modify'&&Boolean(contract)&&candidateAuthorizationBinding(task.contract)===candidateAuthorizationBinding(contract)&&task.contextFingerprint===record.candidate.inputContextFingerprint&&Boolean(body&&sameRecordedHtml(body.html,record.after.htmlContent));
}
async function taskPublication(storage:ProjectStorage,projectId:string,task:SavedDesignTask,parts:Array<{stepId:string;html:string;complete:boolean}>,tree?:GenerationTree):Promise<TaskPublication|undefined>{
 if(!task.treeCheckpoint&&task.contract.operation!=='modify')return;
 const commits=await readPublicationCommits(storage,projectId);
 if(task.treeCheckpoint&&tree){
  const checkpoint=task.treeCheckpoint,pages=checkpoint.delivery.pages;
  const complete=(node:GenerationTree['root']):boolean=>node.status==='generated'&&node.children.every(complete);
  if(!complete(tree.root)||checkpoint.leafSources.length!==pages.length)return;
  const screens=[];
  for(const page of pages){const source=checkpoint.leafSources.find(row=>row.pageId===page.id),part=parts.find(row=>row.stepId===source?.nodeId&&row.complete);if(!source||!part)return;checkTreeLeafArtifact(checkpoint,source.nodeId,part.html);screens.push({id:page.screenId,htmlContent:part.html});}
  const commit=commits.find(row=>row.id===checkpoint.delivery.planId);
  if(commit&&await matchesPublicationCommit(commit,{id:checkpoint.delivery.planId,kind:'batch',screens}))return {id:commit.id,kind:'batch',at:commit.at,screenIds:pages.map(page=>page.screenId)};
 }else if(task.contract.operation==='modify'){
  const repository=new DeliveryRepository(storage,projectId);
  for(const commit of commits.filter(row=>row.kind==='candidate'&&row.screens.length===1).reverse()){
   const record=await repository.get(commit.screens[0].id,commit.id);
   if(record?.publicationId===commit.id&&record.candidate.workflowContract?.taskId===task.id&&taskMatchesDelivery(task,parts,record)&&await matchesPublicationCommit(commit,{id:record.id,kind:'candidate',screens:[record.after]}))return {id:commit.id,kind:'candidate',at:commit.at,screenIds:[record.after.id]};
  }
 }
}
/** Explicit historical bookkeeping only; reads/scans never call this mutation. */
export async function settleDesignTaskPublication(storage:ProjectStorage,projectId:string,id:string,isCurrent=()=>true):Promise<boolean>{
 const check=()=>{if(!isCurrent())throw Error('工程或任务选择已变化，未同步旧任务状态。');};check();
 const saved=await readDesignTask(storage,projectId,id);check();
 if(!saved||saved.deletionPending||saved.recoveryClaim||!saved.publication)throw Error('任务缺少完整的已保存交付事实，或已清理/被接替，未同步状态。');
 if(saved.publication.kind==='candidate')return settleDesignTaskDelivery(storage,projectId,saved.publication.screenIds[0],saved.publication.id,isCurrent);
 return serialized(storage,async()=>{
  check();const expected=storage.taskManifestIdentity?await storage.taskManifestIdentity(id):undefined;
  const current=await readDesignTask(storage,projectId,id);check();
  if(!current||current.deletionPending||current.recoveryClaim||!current.publication||current.publication.id!==saved.publication!.id)throw Error('任务或交付来源已变化，未同步历史。');
  if(current.task.state==='completed')return true;
  const completed={...current.task,state:'completed' as const,updatedAt:Math.max(Date.now(),current.task.updatedAt)};
  if(!valid(completed,projectId))throw Error('任务完成记录无效。');check();
  if(!storage.publishTaskManifest)throw Error('当前存储不能安全同步任务状态。');await storage.publishTaskManifest(id,expected??null,JSON.stringify(completed));return true;
 });
}
/** Historical settlement only. It neither adopts a candidate nor restores execution permission. */
export async function settleDesignTaskDelivery(storage:ProjectStorage,projectId:string,screenId:string,deliveryId:string,isCurrent=()=>true):Promise<boolean>{
 return serialized(storage,async()=>{
  if(!isCurrent())throw Error('工程或任务选择已变化，未同步历史。');
  const record=await new DeliveryRepository(storage,projectId).get(screenId,deliveryId),contract=record?.candidate.workflowContract;
  if(!record||record.status!=='applied'||!contract)throw Error('任务完成需要已应用的真实交付档案。');
  const path=`${dir(contract.taskId)}/manifest.json`;
  const expected=storage.taskManifestIdentity?await storage.taskManifestIdentity(contract.taskId):undefined;
  if(!await storage.exists(path))return false; // A cleaned or non-journal task is never recreated.
  const saved=await readDesignTask(storage,projectId,contract.taskId);
  if(saved?.deletionPending)throw Error('任务已清理，未改写残留历史记录。');
  if(!saved)throw Error('任务草稿损坏，已采纳页面保持不变，未标记任务完成。');
  if(saved.task.state==='completed'){
   if(saved.task.delivery?.id===deliveryId)return true;
   throw Error('该任务已有其它完成记录，未改写历史。');
  }
  if(await storage.exists(`${dir(contract.taskId)}/recovery-claim.json`))throw Error('任务已被恢复任务接替，未改写旧任务状态。');
  if(!taskMatchesDelivery(saved.task,saved.parts,record))throw Error('任务来源或完整产物与实际交付不一致，未标记完成。');
  const {error:_error,...prior}=saved.task;
  const completed:SavedDesignTask={...prior,state:'completed',updatedAt:Date.now(),delivery:{id:record.id,screenId,resultFingerprint:record.resultFingerprint,completedAt:record.completedAt??Date.now()}};
  if(!valid(completed,projectId))throw Error('任务完成记录无效。');
  // Recheck after awaited reads; do not revive a manifest removed by cleanup.
  if(!await storage.exists(path)||await storage.exists(`${dir(contract.taskId)}/recovery-claim.json`))throw Error('任务已清理或被新恢复任务接替，未改写旧记录。');
  if(!isCurrent())throw Error('工程或任务选择已变化，未同步历史。');
  if(storage.publishTaskManifest)await storage.publishTaskManifest(contract.taskId,expected??null,JSON.stringify(completed));else await storage.writeTextAtomic(path,JSON.stringify(completed));return true;
 });
}
export async function readDesignTaskTraces(storage:ProjectStorage,projectId:string,id:string):Promise<{traces:TaskRequestTrace[];ignoredRows:number;lateBudget?:TaskBudgetSnapshot}>{
 if(!await readDesignTask(storage,projectId,id))throw Error('任务来源无效。');
 const raw=await boundedText(storage,`${dir(id)}/attempts.jsonl`,512*1024);const traces:TaskRequestTrace[]=[];let ignoredRows=0,lateBudget:TaskBudgetSnapshot|undefined;
 for(const line of (raw??'').split('\n').filter(Boolean).slice(-512))try{const value=JSON.parse(line);if(validTaskRequestTrace(value)&&value.taskId===id)traces.push(value);else if(value.version===1&&value.kind==='superseded-settlement'&&Object.keys(value).sort().join(',')==='at,budget,kind,version'&&Number.isSafeInteger(value.at)&&value.at>=0&&isTaskBudgetSnapshot(value.budget))lateBudget=value.budget;else ignoredRows++;}catch{ignoredRows++;}
 return {traces,ignoredRows,...(lateBudget?{lateBudget}:{})};
}
/** A new explicit user task claims an old draft once. Reading a manifest never grants old task authority. */
export async function claimDesignTaskRecovery(storage:ProjectStorage,source:SavedDesignTask,newTaskId:string):Promise<boolean>{
 if(!validId(newTaskId)||newTaskId===source.id)throw Error('恢复必须创建新任务。');
 if(!storage.createTextExclusive)throw Error('当前存储不支持跨实例恢复占用，不能安全启动恢复。');
 const expected=storage.taskManifestIdentity?await storage.taskManifestIdentity(source.id):undefined;
 const current=await readDesignTask(storage,source.projectId,source.id);if(!current||current.deletionPending||current.publication||JSON.stringify(current.task)!==JSON.stringify(source))throw Error('恢复来源任务已变化或已保存交付，未占用新任务。');
 return storage.createTextExclusive(`${dir(source.id)}/recovery-claim.json`,JSON.stringify({version:1,originTaskId:source.id,newTaskId,createdAt:Date.now()}),expected);
}
export async function removeDesignTask(storage:ProjectStorage,projectId:string,id:string):Promise<void>{
 return serialized(storage,async()=>{const expected=storage.taskManifestIdentity?await storage.taskManifestIdentity(id):undefined;const saved=await readDesignTask(storage,projectId,id);if(!saved)throw Error('任务已损坏或不属于当前工程。');
  await removeTaskDirectory(storage,id,()=>true,expected);
 });
}
async function removeTaskDirectory(storage:ProjectStorage,id:string,isCurrent:()=>boolean=()=>true,expected?:string|null){
 const path=dir(id),guard=()=>{if(!isCurrent())throw Error('工程或选择已变化，停止任务清理。');};guard();
 if(storage.deleteDesignTask){await storage.deleteDesignTask(id,expected??null);return;}
 if(storage.kind==='localStorage')for(const name of await storage.listDir(path)){
  guard();if(name&&name.split('/').every(p=>p&&p!=='.'&&p!=='..'&&!p.includes('\\')))await storage.remove(`${path}/${name}`);
 }
 guard();await storage.remove(path);
}
/** Explicit cleanup of a broken directory, never a way to recover or execute its contents. */
export async function removeCorruptDesignTask(storage:ProjectStorage,projectId:string,id:string,isCurrent:()=>boolean=()=>true):Promise<void>{
 return serialized(storage,async()=>{
  dir(id);if(!isCurrent())throw Error('工程或选择已变化，未清理旧记录。');
  const expected=storage.taskManifestIdentity?await storage.taskManifestIdentity(id):undefined;
  if(!(await taskFolders(storage)).includes(id))throw Error('任务目录不存在，请刷新列表。');
  if(await readDesignTask(storage,projectId,id))throw Error('记录已恢复有效，请刷新列表后按普通任务检查和清理。');
  await removeTaskDirectory(storage,id,isCurrent,expected);
 });
}
