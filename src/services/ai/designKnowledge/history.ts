import type {DesignTaskContract} from '../designWorkflow';
import {isTaskContractShape} from '../taskContractShape';
import {guidancePacketIssue} from './receipt';
import {pageTaskPlanIssue} from '../pageTaskPlan';
import {taskProvenanceIssue} from '../taskProvenance';
import {extractCleanUserPrompt,parseReferencedElement} from '../chatReferencePrompt';

/** Read-only provenance. Never assign this contract to an executable chat task. */
export interface DesignGuidanceHistory {version:1;contract:DesignTaskContract}
type Data=Record<string,unknown>;
const pick=(value:unknown,keys:string[]):Data=>Object.fromEntries(Object.entries(value as Data).filter(([key])=>keys.includes(key)));
function selectionPacket(value:NonNullable<DesignTaskContract['designGuidance']>) {
 const packet=pick(value,['version','bindingFingerprint','protocol','selection','requests']);
 const selection=pick(value.selection,['version','attempts','catalogFingerprint','queryFingerprint','selected','omitted','fallback','body']);
 selection.selected=value.selection.selected.map(s=>{
  const entry=pick(s,['rule','fingerprint','reason']),r=s.rule;
  entry.rule={...pick(r,['id','version','status','replacedBy','tier','title','aliases','scope','triggers','conflictsWith','guidance','examples','implementation','exceptions','validation','source','reviewedAt']),
   scope:pick(r.scope,['operations','devices','components']),examples:r.examples.map(e=>pick(e,['positive','negative'])),
   implementation:r.implementation.map(i=>pick(i,['mode','classes'])),validation:pick(r.validation,['kind','severity']),source:pick(r.source,['title','locator','revision','reuse'])};
  return entry;
 });
 selection.omitted=value.selection.omitted.map(s=>pick(s,['id','reason']));packet.selection=selection;
 packet.requests=value.requests.map(r=>pick(r,['requestId','parentTaskId','providerId','model','outputProtocol','messageFingerprint','injectedRuleIds','status','supersededByRequestId']));
 return packet;
}
const fields=['version','taskId','request','workflowId','operation','strategy','sourceName','target','referencePageId','elementNid','device','designSystem','designSystemOrigin',
 'librarySource','referenceImage','multiPage','allowedChanges','protectedNids','knowledgeSources','knowledgeFingerprint','generationMode','pageTaskPlan','designGuidance'];
/** Preserve field order: existing fingerprints deliberately bind the exact frozen data. */
function projectContract(c:DesignTaskContract):DesignTaskContract {
 const result=pick(c,fields);
 result.acceptance=[];
 result.device=pick(c.device,['profile','frameWidth','referenceDevice']);
 if(c.target)result.target=pick(c.target,['id','name','baselineFingerprint']);
 if(c.designSystem)result.designSystem=pick(c.designSystem,['id','name','tokenVersion','tokenFingerprint']);
 if(c.designSystemOrigin)result.designSystemOrigin=pick(c.designSystemOrigin,['kind','sourceId','sourceName','sourceFingerprint','tokenVersion','tokenFingerprint']);
 if(c.librarySource)result.librarySource=pick(c.librarySource,['mode','sourceProjectId','sourceFingerprint','sourceTokenVersion','bindingFingerprint']);
 if(c.referenceImage){result.referenceImage=pick(c.referenceImage,['name','fingerprint','region']);if(c.referenceImage.region)(result.referenceImage as Data).region=pick(c.referenceImage.region,['sourceFingerprint','sourceWidth','sourceHeight','x','y','width','height']);}
 if(c.multiPage)result.multiPage=pick(c.multiPage,['version','kind','planId','planFingerprint','itemId','screenId','name','index','total','originalPageCount','pageIds','requiredTargetIds']);
 result.knowledgeSources=c.knowledgeSources.map(s=>pick(s,['kind','id','fingerprint','stale']));
 if(c.designGuidance)result.designGuidance=selectionPacket(c.designGuidance);
 return result as unknown as DesignTaskContract;
}
export function readDesignGuidanceHistory(value:unknown,request:string):DesignGuidanceHistory|undefined {
 try{
  const record=value as DesignGuidanceHistory;
  if(!record||record.version!==1||Object.keys(record).length!==2||JSON.stringify(record).length>120000||!isTaskContractShape(record.contract)||!record.contract.designGuidance)return;
  const c=record.contract,ref=/^\[引用元素\s+nid="/.test(request)?parseReferencedElement(request):null;
  if(c.request!==request&&!(ref&&ref.nid===c.elementNid&&(!ref.screenName||ref.screenName===c.target?.name)&&extractCleanUserPrompt(request)===c.request))return;
  if(taskProvenanceIssue(c,false))return;
  const projected=projectContract(c);
  if(guidancePacketIssue(projected,false)||pageTaskPlanIssue(projected))return;
  return structuredClone({version:1,contract:projected});
 }catch{return;}
}
export function captureDesignGuidanceHistory(contract:DesignTaskContract|undefined,request:string):DesignGuidanceHistory|undefined {
 return readDesignGuidanceHistory(contract?.designGuidance?{version:1,contract}:undefined,request);
}
