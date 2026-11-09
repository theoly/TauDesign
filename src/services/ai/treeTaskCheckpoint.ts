import type {DesignTaskContract} from './designWorkflow';
import {contentFingerprint} from './designWorkflow';
import {isMultiPageDelivery,multiPagePlanFingerprint,type MultiPageDelivery,type MultiPagePlan} from './multiPageContract';
import type {SharedGenerationPlan} from './multiPageTree';
import {taskProvenanceIssue} from './taskProvenance';
/** Historical inputs only. A file never grants a new dispatch or delivery authority. HTML lives in hashed artifacts. */
export interface TreeTaskCheckpoint {
 version:1;delivery:MultiPageDelivery;concurrency:1|2;sharedPlan?:SharedGenerationPlan;
 leafSources:Array<{nodeId:string;pageId:string;contract:DesignTaskContract;htmlFingerprint:string}>;
}
export function treeCheckpointPlan(checkpoint:TreeTaskCheckpoint,contextFingerprint:string):MultiPagePlan{
 const d=checkpoint.delivery;
 return {version:1,...(d.kind?{kind:d.kind}:{}),id:d.planId,request:d.request,summary:d.summary,contextFingerprint,originalPageCount:d.originalPageCount,
  pages:d.pages.map(({screenId:_screenId,...page})=>page),planning:d.planning};
}
export function validTreeTaskCheckpoint(value:unknown,contextFingerprint:string,request:string):value is TreeTaskCheckpoint{
 try{
  const v=value as TreeTaskCheckpoint;
  if(!v||Object.keys(v).some(key=>!['version','delivery','concurrency','sharedPlan','leafSources'].includes(key))||v.version!==1||![1,2].includes(v.concurrency)||!isMultiPageDelivery(v.delivery)||v.delivery.request!==request||multiPagePlanFingerprint(treeCheckpointPlan(v,contextFingerprint))!==v.delivery.planFingerprint||!Array.isArray(v.leafSources)||v.leafSources.length>8||new Set(v.leafSources.map(row=>row.nodeId)).size!==v.leafSources.length||new Set(v.leafSources.map(row=>row.pageId)).size!==v.leafSources.length||JSON.stringify(v).length>600000)return false;
  if(v.sharedPlan!==undefined){const plan=v.sharedPlan;if(!plan||Object.keys(plan).sort().join(',')!=='groups,leaves,rootRequirements,version'||plan.version!==1||typeof plan.rootRequirements!=='string'||!plan.rootRequirements.trim()||plan.rootRequirements.length>2000||!Array.isArray(plan.groups)||plan.groups.length>6||plan.groups.some(g=>!g||Object.keys(g).sort().join(',')!=='id,parentId,requirements'||!/^branch-[a-z0-9-]{1,30}$/.test(g.id)||typeof g.parentId!=='string'||typeof g.requirements!=='string'||!g.requirements.trim()||g.requirements.length>2000)||!Array.isArray(plan.leaves)||plan.leaves.length!==v.delivery.pages.length||plan.leaves.some(leaf=>!leaf||Object.keys(leaf).sort().join(',')!=='pageId,parentId'||typeof leaf.parentId!=='string'||!v.delivery.pages.some(page=>page.id===leaf.pageId))||new Set(plan.leaves.map(leaf=>leaf.pageId)).size!==plan.leaves.length)return false;}
  return v.leafSources.every(row=>{
   const index=v.delivery.pages.findIndex(p=>p.id===row.pageId),scope=row.contract?.multiPage,page=v.delivery.pages[index];
   return row&&Object.keys(row).sort().join(',')==='contract,htmlFingerprint,nodeId,pageId'&&/^page-[1-8]$/.test(row.nodeId)&&index>=0&&row.contract.operation==='create'&&!row.contract.target&&!row.contract.elementNid&&!taskProvenanceIssue(row.contract)&&/^[a-f0-9]{8}$/.test(row.htmlFingerprint)&&scope?.planId===v.delivery.planId&&scope.planFingerprint===v.delivery.planFingerprint&&scope.itemId===page.id&&scope.screenId===page.screenId&&scope.name===page.name&&scope.index===index&&scope.total===v.delivery.pages.length;
  });
 }catch{return false;}
}
export function checkTreeLeafArtifact(checkpoint:TreeTaskCheckpoint,nodeId:string,html:string):void{
 const source=checkpoint.leafSources.find(row=>row.nodeId===nodeId);if(!source||source.htmlFingerprint!==contentFingerprint(html))throw Error('完整叶子缺少与实际产物匹配的原任务来源，不能复用。');
}
