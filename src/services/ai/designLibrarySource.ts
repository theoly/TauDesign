import type {ProjectStorage} from '../storage/projectStorage';
import {ProjectRepository,type ProjectDocument} from '../storage/projectRepository';
import {readDesignLibraryCopy} from './designLibraryCopy';
import {designLibraryImportContext,type LibraryImportState} from './designLibraryImport';
import {contentFingerprint} from './designWorkflow';
import type {StagedCandidateData} from '../storage/candidateRepository';

export type SourceEditState=LibraryImportState&{name:string;stagedScreen?:StagedCandidateData|null;stagedRepairStatus?:string|null;stagedAdoptionStatus?:string|null};
export interface LibrarySourcePreview {
 version:1;sourceId:string;sourceName:string;sourceFingerprint:string;installedFingerprint:string;sourceTokenVersion:number;
 componentCount:number;pageCount:number;changed:boolean;upstreamReadOnly:boolean;fingerprint:string;
}
export interface ProjectLocation {id:string;name:string;folderPath?:string}
export function sourceEditContext(state:SourceEditState):string {
 return contentFingerprint(JSON.stringify([designLibraryImportContext(state),state.stagedScreen,state.stagedRepairStatus,state.stagedAdoptionStatus]));
}
function requireIdle(state:SourceEditState){if(state.stagedRepairStatus||state.stagedAdoptionStatus==='saving')throw Error('候选正在修复或采纳，请完成后再切换源库。');}
export async function readCompleteProject(storage:ProjectStorage,check:()=>void):Promise<ProjectDocument>{
 check();const raw=await storage.readText('project.json');check();
 if(!raw||raw.length>6_000_000)throw Error('来源工程清单缺失或超过6 MB。');
 let meta:ProjectDocument;try{meta=JSON.parse(raw);}catch{throw Error('工程清单格式无效。');}
 if(!meta||typeof meta.id!=='string'||!meta.id||typeof meta.name!=='string'||!meta.settings||!['pc','mobile'].includes(String(meta.settings.deviceProfile))||
  !meta.screens||Array.isArray(meta.screens)||typeof meta.screens!=='object'||!meta.designSystem||
  (meta.components!==undefined&&(!meta.components||typeof meta.components!=='object'||Array.isArray(meta.components)))||
  (meta.assets!==undefined&&(!meta.assets||typeof meta.assets!=='object'||Array.isArray(meta.assets))))throw Error('工程身份、设备或数据结构无效，不能进入源库编辑。');
 const doc=await new ProjectRepository(storage).load();check();
 if(!doc||Object.keys(meta.screens).some(id=>!doc.screens[id]||typeof doc.screens[id].htmlContent!=='string'))throw Error('工程存在缺失的页面正文，不能在部分恢复状态下编辑源库。');
 if(Object.keys(meta.projectDocuments??{}).some(id=>!doc.projectDocuments?.[id]||doc.projectDocuments[id].missing))throw Error('工程存在缺失的项目文档，请先修复后进入源库编辑。');
 if(await storage.readText('project.json')!==raw)throw Error('读取期间工程已变化，请重新选择。');check();return doc;
}
interface SourceEntry {context:string;fingerprint:string;folderPath:string;storage:ProjectStorage;documentFingerprint:string;used:boolean}
const sources=new WeakMap<LibrarySourcePreview,SourceEntry>();
const fingerprint=(preview:LibrarySourcePreview)=>{const {fingerprint:_ignored,...data}=preview;return contentFingerprint(JSON.stringify(data));};
async function readSource(storage:ProjectStorage,check:()=>void){
 const document=await readCompleteProject(storage,check),copy=await readDesignLibraryCopy(storage,check);
 const again=await readCompleteProject(storage,check);if(JSON.stringify(document)!==JSON.stringify(again))throw Error('读取期间来源工程已变化，请重新选择。');
 return {document,copy,documentFingerprint:contentFingerprint(JSON.stringify(document))};
}
/** Selecting and previewing a source never writes either project. The chosen path stays in a private session. */
export async function prepareLibrarySourceEdit(storage:ProjectStorage,folderPath:string,state:SourceEditState,options:{isCurrent:()=>boolean;signal?:AbortSignal}):Promise<LibrarySourcePreview>{
 requireIdle(state);const context=sourceEditContext(state),binding=structuredClone(state.designLibraryBinding);
 if(!binding)throw Error('当前工程尚未绑定设计库来源。');
 if(folderPath===state.folderPath)throw Error('不能把当前工程作为自己的源库。');
 const check=()=>{if(options.signal?.aborted||!options.isCurrent())throw Error('选择已取消或当前工程已变化，请重新选择来源。');};
 const result=await readSource(storage,check);check();
 if(result.document.id===state.id||result.document.id!==binding.sourceProjectId)throw Error('所选工程不是当前绑定的设计库来源。');
 if(result.copy.binding.sourceDeviceProfile!==state.settings.deviceProfile)throw Error('来源设备档位与当前工程不匹配。');
 const preview:LibrarySourcePreview={version:1,sourceId:result.document.id,sourceName:result.document.name,sourceFingerprint:result.copy.binding.sourceFingerprint,
 installedFingerprint:binding.sourceFingerprint,sourceTokenVersion:result.copy.binding.sourceTokenVersion,componentCount:Object.keys(result.copy.components).length,
 pageCount:Object.keys(result.document.screens).length,changed:result.copy.binding.sourceFingerprint!==binding.sourceFingerprint,
 upstreamReadOnly:result.document.designLibraryBinding?.mode==='pinned_reference',fingerprint:''};
 preview.fingerprint=fingerprint(preview);sources.set(preview,{context,fingerprint:preview.fingerprint,storage,folderPath,documentFingerprint:result.documentFingerprint,used:false});return preview;
}
/** One-shot capability bound to the exact preview, source bytes and current consumer context. */
export function claimLibrarySourceEdit(preview:LibrarySourcePreview,state:SourceEditState){
 requireIdle(state);const entry=sources.get(preview);
 if(!entry||entry.used)throw Error('源库预览已使用或已过期，请重新选择。');
 entry.used=true;
 if(entry.context!==sourceEditContext(state)||entry.fingerprint!==preview.fingerprint||entry.fingerprint!==fingerprint(preview))throw Error('源库预览被修改或已过期，请重新选择。');
 return {folderPath:entry.folderPath,storage:entry.storage,async read(check:()=>void){
  const result=await readSource(entry.storage,check);check();
  if(result.documentFingerprint!==entry.documentFingerprint||result.copy.binding.sourceFingerprint!==preview.sourceFingerprint)throw Error('来源工程已变化，请重新选择并确认。');
  return result.document;
 }};
}
