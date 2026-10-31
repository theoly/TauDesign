import type {DesignTaskContract} from './designWorkflow';
import {guidancePacketIssue} from './designKnowledge/receipt';
import {resolveWorkflowValidation} from './workflowValidation';
import type {ContinuationCheckpoint} from './generationContinuation';
import type {SectionedCheckpoint} from './sectionedGeneration';

/** Exact in-memory proof held by the original ledger; self-recomputed file hashes do not authorize recovery. */
export function continuationProof(contract:DesignTaskContract,checkpoint?:ContinuationCheckpoint,sections?:SectionedCheckpoint):string {
 const {modificationReview,...authoritative}=contract;
 return JSON.stringify([authoritative,checkpoint,sections]);
}

// Compare every authoritative field. Transport receipts and reviewed-choice provenance
// do not grant permission; current source identities and authorization must still match.
function scope(contract:DesignTaskContract):string {
 const {taskId,designGuidance,modificationReview,...rest}=contract;
 const copy={...rest,referenceImage:rest.referenceImage?{name:rest.referenceImage.name,fingerprint:rest.referenceImage.fingerprint,region:rest.referenceImage.region}:undefined};
 const canonical=(v:unknown):unknown=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?
  Object.fromEntries(Object.entries(v).filter(([,value])=>value!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([key,value])=>[key,canonical(value)])):v;
 return JSON.stringify(canonical(copy));
}

/** Restore a task, never rebuild its selected rules from today's catalog. */
export function inheritContinuationTask(current:DesignTaskContract,previous:DesignTaskContract):DesignTaskContract {
 if(!previous||typeof previous.taskId!=='string'||!previous.taskId||previous.taskId.length>200||scope(current)!==scope(previous))throw Error('续写任务的目标、授权、来源或设计约束已变化，请重新生成。');
 const validation=resolveWorkflowValidation(previous,previous.operation==='create'?'create':'candidate',{preflight:true});
 if(!validation.ok)throw Error(validation.message);
 if(previous.designGuidance?.protocol!==undefined&&previous.designGuidance.protocol!=='html')throw Error('续写任务不能复用其它输出协议的设计规则。');
 const issue=guidancePacketIssue(previous,false);if(issue)throw Error(issue);
 return structuredClone(previous);
}
