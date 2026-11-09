import type {AIProviderConfig} from '../../types/provider';
import type {ProjectStorage} from '../storage/projectStorage';
import {readDesignTask,claimDesignTaskRecovery,type SavedDesignTask,type HistoricalTaskCost} from '../storage/designTaskRepository';
import {pageCreationContext,type PageCreationState} from './pageCreationValidation';
import {modelConfigurationFingerprint} from './modelConfiguration';
import {taskProvenanceIssue} from './taskProvenance';
import {contentFingerprint,type DesignTaskContract} from './designWorkflow';
import {compileMultiPageTree,verifyTreeInheritance,validateSharedTreeFragment} from './multiPageTree';
import type {GenerationTree,GenerationNode} from './generationGraph';
import {restoreTaskRecoveryInputs} from './designTaskRecovery';
import type {TreeTaskCheckpoint} from './treeTaskCheckpoint';
import {parseHtmlCopy} from '../../utils/htmlDocument';
import {checkTreeLeafArtifact} from './treeTaskCheckpoint';

export interface PreparedTreeTaskRecovery {id:string;kind:'tree';originTaskId:string;request:string;parents:number;leaves:number;total:number;history:HistoricalTaskCost[];concurrency:1|2;pageNames:string[]}
export interface TreeTaskRecoveryData {source:SavedDesignTask;tree:GenerationTree;checkpoint:TreeTaskCheckpoint;completed:Array<{id:string;html:string}>;history:HistoricalTaskCost[];inputs:Awaited<ReturnType<typeof restoreTaskRecoveryInputs>>}
const handles=new WeakMap<PreparedTreeTaskRecovery,{data:TreeTaskRecoveryData;sourceFingerprint:string;claimed:boolean}>();
const normalizedTree=(tree:GenerationTree)=>{const copy=structuredClone(tree);copy.taskId='design-tree-scope';const visit=(node:GenerationNode)=>{node.status='planned';node.output=`artifacts/${node.id}.html`;node.children.forEach(visit);};visit(copy.root);return JSON.stringify(copy);};
/** Read-only preparation. Current physical resources and all leaf render gates are checked again when executing. */
export async function prepareTreeTaskRecovery(storage:ProjectStorage,id:string,state:PageCreationState,provider:AIProviderConfig,model:string):Promise<PreparedTreeTaskRecovery>{
 const saved=await readDesignTask(storage,state.id,id);if(!saved)throw Error('生成树任务缺失或文件校验失败。');const source=saved.task,checkpoint=source.treeCheckpoint;
 if(saved.deletionPending)throw Error('该任务已删除，残留资料仅供核对，不能恢复。');
 if(saved.publication)throw Error('此生成树的全部页面已保存，请核对交付历史并同步完成状态，不重复恢复。');
 if(await storage.exists(`tasks/${id}/recovery-claim.json`))throw Error('此生成树已由其它恢复任务接替。');
 if(source.state==='completed'||!saved.tree||!checkpoint?.sharedPlan||source.contract.operation!=='create'||source.contract.target||source.contract.elementNid||source.contract.multiPage||source.contract.allowedChanges.join(',')!=='new-screen')throw Error('旧生成树缺少完整确认计划/来源，或已完成；仅供查看，请重新发起。');
 if(source.contextFingerprint!==pageCreationContext(state))throw Error('工程、主题、页面或文档已变化，生成树不能复用。');
 if(source.binding.providerId!==provider.id||source.binding.model!==model||source.binding.configurationFingerprint!==await modelConfigurationFingerprint(provider,model))throw Error('原生成树的模型配置已变化。');
 const issue=taskProvenanceIssue(source.contract,false);if(issue)throw Error(issue);
 if(checkpoint.delivery.pages.some(page=>state.screens[page.screenId]))throw Error('计划目标页面ID已存在，不能覆盖现有页面。');
 const compiled=compileMultiPageTree(checkpoint.sharedPlan,id,checkpoint.delivery.pages.map(page=>page.id));
 if(normalizedTree(compiled.tree)!==normalizedTree(saved.tree))throw Error('共享生成树与冻结的依赖计划不一致。');
 let parents=0,leaves=0;const completed:TreeTaskRecoveryData['completed']=[];
 const inspect=(node:GenerationNode,parent?:{node:GenerationNode;html:string})=>{
  const part=saved.parts.find(part=>part.stepId===node.id&&part.complete);
  const reusable=node.status==='generated'||Boolean(part&&source.recovery?.reusedStepIds.includes(node.id));
  if(reusable){
   if(!part||node.id!=='root'&&!parent)throw Error('完成节点缺少产物或未完成祖先。');
   if(node.kind==='page-leaf'){
    leaves++;checkTreeLeafArtifact(checkpoint,node.id,part.html);if(!parent)throw Error('完整页面缺少共享祖先。');const slot=parseHtmlCopy(parent.html).doc.querySelector('[data-generation-slot]')?.getAttribute('data-generation-slot');if(!slot)throw Error('祖先插槽缺失。');verifyTreeInheritance(parent.html,slot,part.html);
   }else {parents++;validateSharedTreeFragment(part.html,`content-${node.id}`,state.designSystem,state.settings.deviceProfile);
    if(parent){const slot=parseHtmlCopy(parent.html).doc.querySelector('[data-generation-slot]')?.getAttribute('data-generation-slot');if(!slot)throw Error('共享分支祖先插槽缺失。');verifyTreeInheritance(parent.html,slot,part.html);}
   }
   completed.push({id:node.id,html:part.html});
  }else if(part)throw Error('完整产物与树状态不一致，不能猜测恢复位置。');
  node.children.forEach(child=>inspect(child,part?{node,html:part.html}:undefined));
 };inspect(saved.tree.root);
 const history:HistoricalTaskCost[]=structuredClone(source.recovery?.ancestors??(source.originTaskId?[{taskId:source.originTaskId,...(source.recovery?.previousBudget?{budget:source.recovery.previousBudget}:{})}]:[]));
 // Original planning is a separate real ledger and must not vanish from cumulative cost.
 const planning=checkpoint.delivery.planning;if(!source.originTaskId&&planning.contract&&planning.budget)history.push({taskId:planning.contract.taskId,budget:structuredClone(planning.budget)});
 history.push({taskId:source.id,...(source.budget?{budget:structuredClone(source.budget)}:{})});
 if(history.length>32||new Set(history.map(row=>row.taskId)).size!==history.length)throw Error('恢复成本链超出32项或身份重复，请重新发起。');
 const inputs=await restoreTaskRecoveryInputs(storage,saved),data={source,tree:saved.tree,checkpoint,completed,history,inputs};
 const handle=Object.freeze({id:crypto.randomUUID(),kind:'tree' as const,originTaskId:id,request:source.request,parents,leaves,total:checkpoint.delivery.pages.length+checkpoint.sharedPlan.groups.length+1,history:structuredClone(history),concurrency:checkpoint.concurrency,pageNames:checkpoint.delivery.pages.map(page=>page.name)});
 handles.set(handle,{data:structuredClone(data),sourceFingerprint:contentFingerprint(JSON.stringify(source)),claimed:false});return handle;
}
export function treeRecoveryData(handle:PreparedTreeTaskRecovery):TreeTaskRecoveryData {const entry=handles.get(handle);if(!entry||entry.claimed)throw Error('生成树恢复选择已使用或无效。');return structuredClone(entry.data);}
export function treeRecoveryMetadata(handle:PreparedTreeTaskRecovery):NonNullable<SavedDesignTask['recovery']>{const entry=handles.get(handle);if(!entry||entry.claimed)throw Error('生成树恢复选择已失效。');return {version:1,kind:'tree',sourceFingerprint:entry.sourceFingerprint,reusedStepIds:entry.data.completed.map(part=>part.id),ancestors:structuredClone(entry.data.history)};}
/** The independent replacement checkpoint is durable before claiming the original source. */
export async function claimPreparedTreeRecovery(storage:ProjectStorage,handle:PreparedTreeTaskRecovery,contract:DesignTaskContract):Promise<void>{
 const entry=handles.get(handle);if(!entry||entry.claimed||contract.taskId===handle.originTaskId)throw Error('生成树恢复需要新的任务合同。');
 const comparable=(value:DesignTaskContract)=>{const copy=structuredClone(value);copy.taskId='design-tree-scope';return JSON.stringify(copy);};
 if(comparable(contract)!==comparable(entry.data.source.contract))throw Error('恢复不能更改原生成树范围。');
 const source=await readDesignTask(storage,entry.data.source.projectId,handle.originTaskId),child=await readDesignTask(storage,entry.data.source.projectId,contract.taskId);
 if(!source||contentFingerprint(JSON.stringify(source.task))!==entry.sourceFingerprint||!child||child.task.originTaskId!==handle.originTaskId||JSON.stringify(child.task.treeCheckpoint)!==JSON.stringify(entry.data.checkpoint)||JSON.stringify(child.task.recovery)!==JSON.stringify(treeRecoveryMetadata(handle))||!child.tree||normalizedTree(child.tree)!==normalizedTree(entry.data.tree)||entry.data.completed.some(part=>!child.parts.some(copy=>copy.stepId===part.id&&copy.complete&&copy.html===part.html)))throw Error('新生成树尚未独立保存全部适用节点、确认计划和历史用量，未发送请求。');
 entry.claimed=true;if(!await claimDesignTaskRecovery(storage,source.task,contract.taskId))throw Error('原生成树已被其它任务占用。');
}
