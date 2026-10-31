import {isQualityReport} from '../ai/evidenceSchema';
import { createProjectStorage } from './projectStorage';
import type { FailedPageDraft, DraftLabel } from '../ai/qualityDraft';
import {draftGuidanceIssue} from '../ai/qualityDraft';
import type { PipelineInput } from '../ai/engine/pipeline/types';
import type { GenerationTarget } from '../ai/generationTargetResolver';
import { checkGenerationSourceSafety } from '../ai/generationQuality';
import { contentFingerprint } from '../ai/designWorkflow';
import {validReferenceRegion,type ReferenceRegion} from '../../types/referenceImage';

export interface SavedQualityDraft {
  version: 1; id: string; projectId: string; createdAt: number;
  draft: FailedPageDraft; request: string; projectContext: string; decision: GenerationTarget;
  textReferences?: PipelineInput['textReferences'];
  attachment?: { name: string; relPath: string; region?: ReferenceRegion };
  aiAttempted?: boolean; suggestions?: DraftLabel[];
  status: 'blocked' | 'resolved';
}
const queues = new Map<string, Promise<unknown>>();
const validId = (id: string) => /^draft-[a-z0-9-]{1,90}$/.test(id);
const rel = (id: string) => { if (!validId(id)) throw Error('草稿标识无效'); return `drafts/${id}.json`; };
function valid(value: SavedQualityDraft, projectId: string): boolean {
  return Boolean(value?.version===1 && value.projectId===projectId && validId(value.id) && typeof value.request==='string'
    && value.request.length<=100_000 && Number.isFinite(value.createdAt)
    && typeof value.projectContext==='string' && ['blocked','resolved'].includes(value.status)
    && value.decision && ['create_screen','modify_screen','patch_element'].includes(value.decision.action) && typeof value.decision.reason==='string'
    && ['targetScreenId','styleReferenceScreenId','elementNid'].every(key=>(value.decision as unknown as Record<string,unknown>)[key]===null||typeof (value.decision as unknown as Record<string,unknown>)[key]==='string')
    && typeof value.draft?.html==='string' && value.draft.html.length<=500_000 && value.draft.fingerprint===contentFingerprint(value.draft.html)
    && (!value.draft.pageTaskSource||value.draft.pageTaskSource.request===value.request)
    && !draftGuidanceIssue(value.draft,'history') && (!value.draft.guidanceSource||value.draft.guidanceSource.request===value.request)
    && typeof value.draft.contextKey==='string' && typeof value.draft.bindingKey==='string' && isQualityReport(value.draft.quality)
    && (value.draft.title===undefined||typeof value.draft.title==='string')
    && (value.suggestions===undefined||(Array.isArray(value.suggestions)&&value.suggestions.length<=8&&value.suggestions.every(l=>l&&typeof l.nid==='string'&&typeof l.text==='string'&&l.text.length<=160)))
    && (value.textReferences===undefined||(Array.isArray(value.textReferences)&&value.textReferences.every(r=>r&&typeof r.name==='string'&&typeof r.content==='string')))
    && !/data:image\/[^;,]+;base64,/i.test(JSON.stringify(value))
    && (!value.attachment || /^assets\/images\/[a-f0-9]+\.(png|jpe?g|webp|gif|svg)$/.test(value.attachment.relPath))
    && (!value.attachment?.region||validReferenceRegion(value.attachment.region))
    && checkGenerationSourceSafety(value.draft.html).passed);
}
function enqueue<T>(projectId: string, folderPath: string|undefined, action:()=>Promise<T>):Promise<T> {
  const key=JSON.stringify([projectId,folderPath]);
  const result=(queues.get(key)??Promise.resolve()).catch(()=>{}).then(action);
  queues.set(key,result);void result.finally(()=>{if(queues.get(key)===result)queues.delete(key);}).catch(()=>{});return result;
}
export function saveQualityDraft(value: SavedQualityDraft, folderPath?: string):Promise<void> {
  const copy=structuredClone(value);
  return enqueue(copy.projectId,folderPath,async()=>{
    if(!valid(copy,copy.projectId))throw Error('草稿无效、不安全或含未落盘的图片，无法保存。');
    const storage=createProjectStorage(copy.projectId,folderPath),path=rel(copy.id);
    const old=await storage.readText(path);
    if(old){try{const previous=JSON.parse(old);if(previous.aiAttempted)copy.aiAttempted=true;if(previous.status==='resolved')copy.status='resolved';}catch{/* corrupt old file cannot authorize a pass */}}
    const raw=JSON.stringify(copy);if(raw.length>900_000)throw Error('草稿资料超过保存上限。');
    await storage.ensureDir('drafts');await storage.writeTextAtomic(path,raw);
  });
}
export async function loadQualityDrafts(projectId:string,folderPath?:string):Promise<SavedQualityDraft[]> {
  const storage=createProjectStorage(projectId,folderPath),values:SavedQualityDraft[]=[];
  await queues.get(JSON.stringify([projectId,folderPath]))?.catch(()=>{});
  for(const file of (await storage.listDir('drafts')).filter(file=>/^draft-[a-z0-9-]+\.json$/.test(file)).sort().reverse().slice(0,40)){
    try{const raw=await storage.readText(`drafts/${file}`);if(!raw||raw.length>900_000)continue;const value=JSON.parse(raw);if(valid(value,projectId)&&value.status==='blocked')values.push(value);}catch{/* damaged independent draft does not affect project or chat */}
  }
  return values.sort((a,b)=>a.createdAt-b.createdAt).slice(-10);
}
/** Persist the one-attempt marker before asking a model; cancellation/failure cannot reset it. */
export function claimDraftSuggestion(value:SavedQualityDraft,folderPath?:string):Promise<boolean> {
  return enqueue(value.projectId,folderPath,async()=>{
    const storage=createProjectStorage(value.projectId,folderPath),path=rel(value.id),raw=await storage.readText(path);
    if(!raw)throw Error('草稿尚未保存，不能请求AI建议。');
    const current=JSON.parse(raw) as SavedQualityDraft;
    if(!valid(current,value.projectId)||draftGuidanceIssue(current.draft)||current.status!=='blocked'||current.aiAttempted)return false;
    current.aiAttempted=true;await storage.writeTextAtomic(path,JSON.stringify(current));return true;
  });
}
