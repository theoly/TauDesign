import type {DesignTaskContract} from './designWorkflow';
import {isLegacyHistoryTheme} from './designKnowledge/legacyHistoryTheme';
type Data=Record<string,unknown>;
const pick=(value:unknown,keys:string[]):Data=>Object.fromEntries(Object.entries(value as Data).filter(([key])=>keys.includes(key)));
const fields=['version','taskId','request','workflowId','operation','strategy','sourceName','target','referencePageId','elementNid','device','designSystem','designSystemOrigin',
 'librarySource','referenceImage','multiPage','allowedChanges','protectedNids','knowledgeSources','knowledgeFingerprint','generationMode','pageTaskPlan'];
/** Preserve field order: existing fingerprints deliberately bind the exact frozen data. */
export function projectHistoryContract(c:DesignTaskContract):DesignTaskContract {
 const result=pick(c,fields);
 result.acceptance=[];
 result.device=pick(c.device,['profile','frameWidth','referenceDevice']);
 if(c.target)result.target=pick(c.target,['id','name','baselineFingerprint']);
 if(c.designSystem){
  if(Object.hasOwn(c.designSystem,'tokens')){
   if(!isLegacyHistoryTheme(c.designSystem))throw Error('旧主题来源包含无法安全投影的字段。');
   result.designSystem=structuredClone(c.designSystem);
  }else result.designSystem=pick(c.designSystem,['id','name','tokenVersion','tokenFingerprint']);
 }
 if(c.designSystemOrigin){
  const legacy=(c.designSystemOrigin as unknown as Data).updatedAt;
  if(legacy!==undefined&&(typeof legacy!=='number'||!Number.isFinite(legacy)))throw Error('旧主题来源时间无效。');
  result.designSystemOrigin=pick(c.designSystemOrigin,['kind','sourceId','sourceName','sourceFingerprint','tokenVersion','tokenFingerprint','updatedAt']);
 }
 if(c.librarySource)result.librarySource=pick(c.librarySource,['mode','sourceProjectId','sourceFingerprint','sourceTokenVersion','bindingFingerprint']);
 if(c.referenceImage){result.referenceImage=pick(c.referenceImage,['name','fingerprint','region']);if(c.referenceImage.region)(result.referenceImage as Data).region=pick(c.referenceImage.region,['sourceFingerprint','sourceWidth','sourceHeight','x','y','width','height']);}
 if(c.multiPage)result.multiPage=pick(c.multiPage,['version','kind','planId','planFingerprint','itemId','screenId','name','index','total','originalPageCount','pageIds','requiredTargetIds']);
 result.knowledgeSources=c.knowledgeSources.map(s=>pick(s,['kind','id','fingerprint','stale']));
 return result as unknown as DesignTaskContract;
}
