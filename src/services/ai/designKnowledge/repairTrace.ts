import type {DesignTaskContract} from '../designWorkflow';
import type {RuleSelection} from './types';
import {guidancePacketIssue,type GuidanceRequestReceipt} from './receipt';
import {renderRule,ruleFingerprint} from './selector';
import {renderTokenGuidance} from './tokenWindow';

/** The original selection lives in the task contract; repair stores only its identity and actual use. */
export interface RepairGuidanceTrace {
 version:1;parentTaskId:string;parentBindingFingerprint:string;parentSelectionFingerprint:string;
 injectedRuleIds:string[];omittedRuleIds:string[];requests:GuidanceRequestReceipt[];
}
export function isRepairGuidanceTrace(value:unknown,completed=false):value is RepairGuidanceTrace {
 try {
  const r=value as RepairGuidanceTrace,hash=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{8}$/.test(v);
  const ids=(v:unknown):v is string[]=>Array.isArray(v)&&v.length<=3&&v.every(id=>typeof id==='string'&&id.length>0&&id.length<=100)&&new Set(v).size===v.length;
  return Boolean(r&&r.version===1&&typeof r.parentTaskId==='string'&&r.parentTaskId&&hash(r.parentBindingFingerprint)&&hash(r.parentSelectionFingerprint)&&
   ids(r.injectedRuleIds)&&ids(r.omittedRuleIds)&&!r.injectedRuleIds.some(id=>r.omittedRuleIds.includes(id))&&
   Array.isArray(r.requests)&&r.requests.length<=1&&(!completed||r.requests.length===1)&&r.requests.every(request=>
    request&&request.requestId===`${r.parentTaskId}:style-repair:request-1`&&request.parentTaskId===r.parentTaskId&&
    typeof request.providerId==='string'&&request.providerId&&typeof request.model==='string'&&request.model&&hash(request.messageFingerprint)&&
    request.outputProtocol==='stream-text'&&['assembled','dispatched','completed','failed','cancelled'].includes(request.status)&&
    (!completed||request.status==='completed')&&request.supersededByRequestId===undefined&&ids(request.injectedRuleIds)&&
    JSON.stringify(request.injectedRuleIds)===JSON.stringify(r.injectedRuleIds)));
 }catch{return false;}
}
export function repairGuidanceIssue(trace:RepairGuidanceTrace|undefined,task:DesignTaskContract,completed=false):string|undefined {
 if(!trace)return undefined; // Legacy repair records have no provenance; never synthesize it.
 if(!isRepairGuidanceTrace(trace,completed))return '修复规则调用记录无效。';
 const parent=task.designGuidance;
 if(!parent||guidancePacketIssue(task)||trace.parentTaskId!==task.taskId||trace.parentBindingFingerprint!==parent.bindingFingerprint||
  trace.parentSelectionFingerprint!==ruleFingerprint(parent.selection))return '修复来源与原冻结任务不一致。';
 const ids=parent.selection.selected.map(s=>s.rule.id);
 if(ids.length!==trace.injectedRuleIds.length+trace.omittedRuleIds.length||
  [...trace.injectedRuleIds,...trace.omittedRuleIds].some(id=>!ids.includes(id)))return '修复规则超出原冻结选择。';
 return undefined;
}
/** Fit whole rules from the frozen order into existing generated-CSS whitespace. No new lookup. */
export function frozenRepairGuidance<T extends {tokens:string}>(task:DesignTaskContract,payload:T):{selection:RuleSelection;payload:T;suffix:string;trace:RepairGuidanceTrace}|undefined {
 if(!task.designGuidance)return undefined;
 const issue=guidancePacketIssue(task);if(issue)throw Error(issue);
 const parent=task.designGuidance,selection=structuredClone(parent.selection),omitted:string[]=[];
 selection.selected=[];selection.body='';
 for(const item of parent.selection.selected){
  const next={...selection,selected:[...selection.selected,item],body:selection.body+renderRule(item.rule),fallback:'none' as const};
  try{renderTokenGuidance(payload,next);Object.assign(selection,next);}catch{omitted.push(item.rule.id);}
 }
 selection.omitted.push(...omitted.map(id=>({id,reason:'budget' as const})));
 if(!selection.selected.length&&parent.selection.selected.length)selection.fallback='budget';
 const adapted=renderTokenGuidance(payload,selection);
 return {selection,...adapted,trace:{version:1,parentTaskId:task.taskId,parentBindingFingerprint:parent.bindingFingerprint,
  parentSelectionFingerprint:ruleFingerprint(parent.selection),injectedRuleIds:selection.selected.map(s=>s.rule.id),omittedRuleIds:omitted,requests:[]}};
}
