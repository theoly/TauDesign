import type {DesignTaskContract} from './designWorkflow';

const object=(v:unknown):v is Record<string,unknown>=>Boolean(v&&typeof v==='object'&&!Array.isArray(v));
const text=(v:unknown)=>typeof v==='string';
const strings=(v:unknown)=>Array.isArray(v)&&v.every(text);
const optional=(v:unknown,check:(v:unknown)=>boolean)=>v===undefined||check(v);
const named=(v:unknown)=>object(v)&&text(v.id)&&text(v.name);
/** Data shape only. Current authorization and frozen provenance are checked separately. */
export function isTaskContractShape(value:unknown):value is DesignTaskContract {
 try{
  const c=value;
  return object(c)&&c.version===1&&typeof c.taskId==='string'&&Boolean(c.taskId.trim())&&text(c.request)&&text(c.workflowId)&&
   ['answer','theme-proposal','create','analyze','modify','import','restyle'].includes(String(c.operation))&&
   ['no-canvas-mutation','new-page','review-first','candidate-copy','preserve-source','normalize-tokens','normalize-selected-tokens','validated-batch'].includes(String(c.strategy))&&
   object(c.device)&&['pc','mobile'].includes(String(c.device.profile))&&typeof c.device.frameWidth==='number'&&Number.isFinite(c.device.frameWidth)&&c.device.frameWidth>0&&optional(c.device.referenceDevice,text)&&
   strings(c.acceptance)&&strings(c.allowedChanges)&&strings(c.protectedNids)&&Array.isArray(c.knowledgeSources)&&c.knowledgeSources.every(s=>object(s)&&
    ['project-context','document','page','text-reference','decision','design-system','component','reference-image','design-library'].includes(String(s.kind))&&text(s.id)&&text(s.fingerprint)&&optional(s.stale,v=>typeof v==='boolean'))&&
   optional(c.target,v=>named(v)&&object(v)&&text(v.baselineFingerprint))&&
   optional(c.designSystem,v=>named(v)&&object(v)&&optional(v.tokenVersion,n=>typeof n==='number'&&Number.isFinite(n))&&optional(v.tokenFingerprint,text))&&
   optional(c.designSystemOrigin,v=>object(v)&&['project','html_import','project_override'].includes(String(v.kind))&&
    ['sourceId','sourceName','sourceFingerprint','tokenFingerprint'].every(k=>optional(v[k],text))&&optional(v.tokenVersion,n=>typeof n==='number'&&Number.isFinite(n)))&&
   ['sourceName','referencePageId','elementNid','knowledgeFingerprint'].every(k=>optional(c[k],text))&&
   optional(c.generationMode,v=>v==='sections')&&optional(c.projectPages,strings)&&optional(c.projectPageCount,v=>typeof v==='number'&&Number.isFinite(v)&&v>=0)&&
   ['referenceImage','librarySource','multiPage','pageTaskPlan','designGuidance','modificationReview'].every(k=>optional(c[k],object))&&
   optional(c.validationPlan,v=>object(v)&&v.version===1&&text(v.workflowId)&&text(v.fingerprint)&&strings(v.stages));
 }catch{return false;}
}
