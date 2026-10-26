import type {DesignSystem} from '../../types/designSystem';
import type {DesignLibraryBinding} from '../../types/project';
import {createProjectStorage,type ProjectStorage} from '../storage/projectStorage';
import {contentFingerprint} from './designWorkflow';
import {pageCreationContext,type PageCreationState} from './pageCreationValidation';
import {designTokenFingerprint} from '../../utils/designSystemIdentity';
import {assertDesignLibraryCopyCompatible,readDesignLibraryCopy,type DesignLibraryCopy} from './designLibraryCopy';
import {buildLibraryReferenceSnapshot,isLibraryReference,libraryReferenceIssue,verifyLibraryReferenceFiles} from './designLibraryReference';
import {isSafeProjectAssetPath} from './projectAssetIntegrity';

export type LibraryImportState=PageCreationState;
export interface DesignLibraryImportPreview {
  version:1;fingerprint:string;
  source:DesignLibraryBinding;
  theme:DesignSystem;themeChanged:boolean;
  components:Array<{id:string;name:string;action:'add'|'replace'}>;
  assets:Array<{id:string;name:string;relPath:string;action:'add'|'reuse';fingerprint:string}>;
  conflicts:string[];
}
interface Entry {
  context:string;source:Pick<ProjectStorage,'readText'|'readBinary'>;target:ProjectStorage;
  copy:DesignLibraryCopy;fingerprint:string;status:'prepared'|'applying'|'applied'|'failed';
}
const prepared=new WeakMap<DesignLibraryImportPreview,Entry>();
export function isDesignLibraryImportEvidence(value:unknown):value is NonNullable<DesignLibraryBinding['importEvidence']> {
  const e=value as DesignLibraryBinding['importEvidence'];
  return Boolean(e&&e.version===1&&Number.isFinite(e.checkedAt)&&e.checkedAt>=0&&
    ['sourceFingerprint','previewFingerprint','targetContextFingerprint'].every(key=>typeof e[key as keyof typeof e]==='string')&&
    Array.isArray(e.files)&&e.files.length<=100&&e.files.every(file=>file&&typeof file.relPath==='string'&&isSafeProjectAssetPath(file.relPath)&&typeof file.fingerprint==='string')&&
    new Set(e.files.map(file=>file.relPath)).size===e.files.length);
}
export function designLibraryImportContext(state:LibraryImportState):string {
  return contentFingerprint(JSON.stringify([state.id,state.folderPath,pageCreationContext(state),state.designLibraryBinding]));
}
function previewFingerprint(preview:Omit<DesignLibraryImportPreview,'fingerprint'>|DesignLibraryImportPreview):string {
  const {fingerprint:_ignored,...data}=preview as DesignLibraryImportPreview;
  return contentFingerprint(JSON.stringify(data));
}
function guard(signal:AbortSignal|undefined,isCurrent:(()=>boolean)|undefined):void {
  if(signal?.aborted)throw new Error('设计库导入已取消。');
  if(isCurrent&&!isCurrent())throw new Error('目标工程或设计内容已变化，请重新分析设计库。');
}
/** Read-only preparation. Binary payloads and source paths stay in the private transient session. */
export async function prepareDesignLibraryImport(source:Pick<ProjectStorage,'readText'|'readBinary'>,state:LibraryImportState,
  options:{signal?:AbortSignal;isCurrent?:()=>boolean;targetStorage?:ProjectStorage;mode?:DesignLibraryBinding['mode']}={}):Promise<DesignLibraryImportPreview> {
  const {signal,isCurrent,targetStorage}=options;
  const check=()=>guard(signal,isCurrent);
  check();
  state=structuredClone({id:state.id,folderPath:state.folderPath,settings:state.settings,designSystem:state.designSystem,
    designSystemOrigin:state.designSystemOrigin,designLibraryBinding:state.designLibraryBinding,components:state.components,assets:state.assets,
    screens:state.screens,overrides:state.overrides,decisions:state.decisions,projectDocuments:state.projectDocuments});
  const context=designLibraryImportContext(state);
  const copy=await readDesignLibraryCopy(source,check,options.mode??'project_copy');check();
  const conflicts:string[]=[];
  try{assertDesignLibraryCopyCompatible(copy,state);const issue=libraryReferenceIssue(state);if(issue)throw new Error(issue);}catch(error){conflicts.push(error instanceof Error?error.message:'设计库与当前工程冲突。');}
  const preview:DesignLibraryImportPreview={version:1,fingerprint:'',source:structuredClone(copy.binding),theme:structuredClone(copy.designSystem),
    themeChanged:state.designSystem.id!==copy.designSystem.id||designTokenFingerprint(state.designSystem.tokens)!==designTokenFingerprint(copy.designSystem.tokens),
    components:Object.values(copy.components).map(c=>({id:c.id,name:c.name,action:state.components[c.id]?'replace':'add'})),
    assets:Object.values(copy.assets).map(a=>({id:a.id,name:a.name,relPath:a.relPath,action:state.assets[a.id]?'reuse':'add',
      fingerprint:contentFingerprint(copy.assetFiles.find(file=>file.relPath===a.relPath)!.base64Data)})),conflicts};
  preview.fingerprint=previewFingerprint(preview);
  prepared.set(preview,{context,source,target:targetStorage??createProjectStorage(state.id,state.folderPath),
    copy:structuredClone(copy),fingerprint:preview.fingerprint,status:'prepared'});
  return preview;
}
/** Compare all library identity, including resource bytes, not the source's unrelated save timestamp/pages. */
async function recheckSource(entry:Entry,check:()=>void):Promise<void> {
  check();const source=await readDesignLibraryCopy(entry.source,check,entry.copy.binding.mode);check();
  if(source.binding.sourceFingerprint!==entry.copy.binding.sourceFingerprint)throw new Error('来源设计库已变化，请重新分析并确认预览。');
}
/** One-shot application with a fixed destination and a synchronous History commit after all asynchronous checks. */
export async function applyDesignLibraryImport(preview:DesignLibraryImportPreview,options:{
  getState:()=>LibraryImportState;commit:(copy:DesignLibraryCopy)=>void;signal?:AbortSignal;isCurrent?:()=>boolean;
}):Promise<{status:'applied'|'blocked';message:string;binding?:DesignLibraryBinding}> {
  const entry=prepared.get(preview);
  if(!entry||entry.status!=='prepared')return {status:'blocked',message:'预览已使用、正在提交或已过期，请重新分析设计库。'};
  entry.status='applying';
  let wroteFiles=false;
  const check=()=>{guard(options.signal,options.isCurrent);if(designLibraryImportContext(options.getState())!==entry.context)throw new Error('目标工程或设计内容已变化，请重新分析设计库。');};
  try{
    check();
    if(preview.version!==1||previewFingerprint(preview)!==entry.fingerprint||preview.fingerprint!==entry.fingerprint)throw new Error('设计库预览已被修改，请重新分析。');
    if(preview.conflicts.length)throw new Error(preview.conflicts[0]);
    const copy=structuredClone(entry.copy);
    assertDesignLibraryCopyCompatible(copy,options.getState());
    await recheckSource(entry,check);
    // Inspect existing target files before writing any new one.
    for(const file of copy.assetFiles){
      const existing=await entry.target.readBinary(file.relPath);check();
      if(existing!==null&&existing!==file.base64Data)throw new Error(`目标工程资源文件冲突：${file.relPath}`);
    }
    for(const file of copy.assetFiles){
      check();const existing=await entry.target.readBinary(file.relPath);check();
      if(existing!==null){if(existing!==file.base64Data)throw new Error(`目标工程资源文件冲突：${file.relPath}`);continue;}
      await entry.target.ensureDir(file.relPath.substring(0,file.relPath.lastIndexOf('/')));check();
      wroteFiles=true;await entry.target.writeBinary(file.relPath,file.base64Data);check();
    }
    await recheckSource(entry,check);
    for(const file of copy.assetFiles){if(await entry.target.readBinary(file.relPath)!==file.base64Data)throw new Error(`目标资源内容未完整写入：${file.relPath}`);check();}
    const referenceIssues=await verifyLibraryReferenceFiles(entry.target,options.getState());check();
    if(referenceIssues.length)throw new Error(referenceIssues[0].message);
    check();assertDesignLibraryCopyCompatible(copy,options.getState());
    copy.binding.importEvidence={version:1,checkedAt:Date.now(),sourceFingerprint:copy.binding.sourceFingerprint,
      previewFingerprint:entry.fingerprint,targetContextFingerprint:entry.context,
      files:copy.assetFiles.map(file=>({relPath:file.relPath,fingerprint:contentFingerprint(file.base64Data)}))};
    if(copy.binding.mode==='pinned_reference')copy.binding.referenceSnapshot=buildLibraryReferenceSnapshot(copy.designSystem,copy.components,copy.assets,
      isLibraryReference(options.getState())?options.getState().designLibraryBinding?.referenceSnapshot:undefined,copy.assetFiles);
    // No awaits between the last target guard and the History action.
    options.commit(copy);entry.status='applied';
    return {status:'applied',message:`已导入「${copy.binding.sourceName}」的${copy.binding.mode==='pinned_reference'?'固定版本只读参考':'项目副本'}，可通过撤销恢复。`,binding:structuredClone(copy.binding)};
  }catch(error){
    entry.status='failed';
    return {status:'blocked',message:(error instanceof Error?error.message:'设计库导入失败。')+
      (wroteFiles?' 部分资源可能已写入目标工程但未登记，未自动删除以免影响正在复用的文件。':'')};
  }
}
