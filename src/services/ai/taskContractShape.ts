import {validPageWriteStrategy} from './generationStrategy';
import {validContextManifest} from './engine/context/contextManifest';
import {validRegionSubdivision} from './regionSubdivision';
import type {DesignTaskContract} from './designWorkflow';

const object=(v:unknown):v is Record<string,unknown>=>Boolean(v&&typeof v==='object'&&!Array.isArray(v));
const text=(v:unknown)=>typeof v==='string';
const member=(v:unknown,values:readonly string[])=>typeof v==='string'&&values.includes(v);
const strings=(v:unknown)=>Array.isArray(v)&&v.every(text);
const optional=(v:unknown,check:(v:unknown)=>boolean)=>v===undefined||check(v);
const named=(v:unknown)=>object(v)&&text(v.id)&&text(v.name);
/** Data shape only. Current authorization and frozen provenance are checked separately. */
export function isTaskContractShape(value:unknown):value is DesignTaskContract {
 try{
  const c=value;
  return object(c)&&c.version===1&&typeof c.taskId==='string'&&Boolean(c.taskId.trim())&&text(c.request)&&text(c.workflowId)&&
   member(c.operation,['answer','theme-proposal','create','analyze','modify','import','restyle'])&&
   member(c.strategy,['no-canvas-mutation','new-page','review-first','candidate-copy','preserve-source','normalize-tokens','normalize-selected-tokens','validated-batch'])&&
   object(c.device)&&member(c.device.profile,['pc','mobile'])&&typeof c.device.frameWidth==='number'&&Number.isFinite(c.device.frameWidth)&&c.device.frameWidth>0&&optional(c.device.referenceDevice,text)&&
   strings(c.acceptance)&&strings(c.allowedChanges)&&strings(c.protectedNids)&&Array.isArray(c.knowledgeSources)&&c.knowledgeSources.every(s=>object(s)&&
    member(s.kind,['project-context','document','page','text-reference','decision','design-system','component','reference-image','design-library'])&&text(s.id)&&text(s.fingerprint)&&optional(s.stale,v=>typeof v==='boolean'))&&
   optional(c.target,v=>named(v)&&object(v)&&text(v.baselineFingerprint))&&
   optional(c.designSystem,v=>named(v)&&object(v)&&optional(v.tokenVersion,n=>typeof n==='number'&&Number.isFinite(n))&&optional(v.tokenFingerprint,text))&&
   optional(c.designSystemOrigin,v=>object(v)&&member(v.kind,['project','html_import','project_override'])&&
    ['sourceId','sourceName','sourceFingerprint','tokenFingerprint'].every(k=>optional(v[k],text))&&optional(v.tokenVersion,n=>typeof n==='number'&&Number.isFinite(n)))&&
   ['sourceName','referencePageId','elementNid','knowledgeFingerprint'].every(k=>optional(c[k],text))&&
   optional(c.wholePageRedesign,v=>object(v)&&Object.keys(v).length===3&&v.version===1&&text(v.sourceFingerprint)&&text(v.inventoryFingerprint))&&
   optional(c.regionSubdivision,validRegionSubdivision)&&optional(c.contextManifest,validContextManifest)&&optional(c.pageWriteStrategy,validPageWriteStrategy)&&optional(c.generationMode,v=>v==='sections')&&optional(c.projectPages,strings)&&optional(c.projectPageCount,v=>typeof v==='number'&&Number.isFinite(v)&&v>=0)&&
   ['referenceImage','librarySource','multiPage','pageTaskPlan','designGuidance','modificationReview'].every(k=>optional(c[k],object))&&
   optional(c.validationPlan,v=>object(v)&&v.version===1&&text(v.workflowId)&&text(v.fingerprint)&&strings(v.stages));
 }catch{return false;}
}
