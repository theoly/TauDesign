import type {DesignTaskContract} from './designWorkflow';
import {pageTaskPlanIssue} from './pageTaskPlan';
import {extractCleanUserPrompt,parseReferencedElement} from './chatReferencePrompt';
import {isTaskContractShape} from './taskContractShape';

/** Conversation provenance only. Never restore this into an executable task. */
export interface PageTaskHistory {version:1;contract:DesignTaskContract}

export function readPageTaskHistory(value:unknown,request:string):PageTaskHistory|undefined {
  try {
    if(!value||typeof value!=='object'||Array.isArray(value))return;
    const record=value as PageTaskHistory;
    if(Object.keys(record).length!==2||record.version!==1||!record.contract||JSON.stringify(record).length>80000)return;
    const c=record.contract;if(!isTaskContractShape(c))return;
    const ref=/^\[引用元素\s+nid="/.test(request)?parseReferencedElement(request):null;
    const sameRequest=c.request===request||Boolean(ref&&ref.nid===c.elementNid&&(!ref.screenName||ref.screenName===c.target?.name)&&extractCleanUserPrompt(request)===c.request);
    if(c.version!==1||typeof c.taskId!=='string'||!c.taskId||!sameRequest||!c.pageTaskPlan||
      !Array.isArray(c.knowledgeSources)||!Array.isArray(c.allowedChanges)||!Array.isArray(c.protectedNids)||
      !c.device||!['mobile','pc'].includes(c.device.profile)||!Number.isFinite(c.device.frameWidth)||pageTaskPlanIssue(c))return;
    return structuredClone(record);
  }catch{return;}
}

export function capturePageTaskHistory(contract:DesignTaskContract|undefined,request:string):PageTaskHistory|undefined {
  if(!contract?.pageTaskPlan)return;
  // Select the contract fields used to bind/display the plan. No HTML, rule packets,
  // execution receipts, credentials or arbitrary fields from callers enter JSONL.
  const {version,taskId,workflowId,operation,strategy,target,elementNid,device,designSystem,designSystemOrigin,
    librarySource,referenceImage,allowedChanges,protectedNids,knowledgeSources,knowledgeFingerprint,multiPage,pageTaskPlan}=contract;
  const snapshot:DesignTaskContract={version,taskId,request:contract.request,workflowId,operation,strategy,
    device,acceptance:[],allowedChanges,protectedNids,knowledgeSources,
    ...(target?{target}:{}),...(elementNid?{elementNid}:{}),...(designSystem?{designSystem}:{}),
    ...(designSystemOrigin?{designSystemOrigin}:{}),...(librarySource?{librarySource}:{}),
    ...(referenceImage?{referenceImage:{name:referenceImage.name,fingerprint:referenceImage.fingerprint,
      ...(referenceImage.region?{region:referenceImage.region}:{})}}:{}),
    ...(knowledgeFingerprint?{knowledgeFingerprint}:{}),...(multiPage?{multiPage}:{}),pageTaskPlan};
  return readPageTaskHistory({version:1,contract:snapshot},request);
}
