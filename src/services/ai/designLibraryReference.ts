import type {Asset,ComponentDefinition,DesignLibraryBinding} from '../../types/project';
import type {ProjectStorage} from '../storage/projectStorage';
import {isSafeProjectAssetPath,type ProjectAssetIssue} from './projectAssetIntegrity';
import type {DesignSystem} from '../../types/designSystem';
import {designTokenFingerprint} from '../../utils/designSystemIdentity';
import {contentFingerprint} from './designWorkflow';

type BindingState={designLibraryBinding?:DesignLibraryBinding};
export const libraryReadOnlyMessage='当前使用固定版本只读设计库参考，请先在主题设置中转为项目副本后再修改。';
export function isLibraryReference(state:BindingState):boolean{return state.designLibraryBinding?.mode==='pinned_reference';}
export function libraryMemberLocked(state:BindingState,kind:'components'|'assets',id:string):boolean{
  if(!isLibraryReference(state))return false;
  const members=state.designLibraryBinding?.referenceSnapshot?.[kind];
  // A damaged cache must never silently unlock its members.
  return !members||typeof members!=='object'||Array.isArray(members)||Object.prototype.hasOwnProperty.call(members,id);
}
export function assertLibraryEditable(state:BindingState,kind?:'components'|'assets',id?:string):void{
  if(isLibraryReference(state)&&(!kind||!id||libraryMemberLocked(state,kind,id)))throw new Error(libraryReadOnlyMessage);
}
function canonical(value:unknown):unknown{
  if(Array.isArray(value))return value.map(canonical);
  return value&&typeof value==='object'?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,canonical(v)])):value;
}
export function libraryComponentFingerprint(c:ComponentDefinition):string{
  return contentFingerprint(JSON.stringify(canonical([c.id,c.name,c.description,c.templateHtml,c.slotDefs,c.version??1,c.origin,...(c.templateContract!==undefined?[c.templateContract]:[])])));
}
export function libraryAssetFingerprint(a:Asset):string{
  const {refCount:_count,...definition}=a;
  return contentFingerprint(JSON.stringify(canonical(definition)));
}
export function buildLibraryReferenceSnapshot(ds:DesignSystem,components:Record<string,ComponentDefinition>,assets:Record<string,Asset>,previous?:DesignLibraryBinding['referenceSnapshot'],files:Array<{relPath:string;base64Data:string}>=[]):NonNullable<DesignLibraryBinding['referenceSnapshot']>{
  return {version:1,files:{...previous?.files,...Object.fromEntries(files.map(f=>[f.relPath,contentFingerprint(f.base64Data)]))},designSystemId:ds.id,designSystemName:ds.name,tokenFingerprint:designTokenFingerprint(ds.tokens),
    components:{...previous?.components,...Object.fromEntries(Object.entries(components).map(([id,c])=>[id,libraryComponentFingerprint(c)]))},
    assets:{...previous?.assets,...Object.fromEntries(Object.entries(assets).map(([id,a])=>[id,libraryAssetFingerprint(a)]))}};
}
/** Diagnostic computed from the actual cache, never the model's self-reported checks. */
export function libraryReferenceIssue(state:BindingState&{designSystem:DesignSystem;components:Record<string,ComponentDefinition>;assets?:Record<string,Asset>}):string|undefined{
  if(!isLibraryReference(state))return;
  const snapshot=state.designLibraryBinding?.referenceSnapshot;
  const record=(v:unknown):v is Record<string,string>=>Boolean(v&&typeof v==='object'&&!Array.isArray(v)&&Object.entries(v).every(([id,hash])=>id&&typeof hash==='string'&&hash));
  if(!snapshot||snapshot.version!==1||!record(snapshot.components)||!record(snapshot.assets)||!record(snapshot.files)||Object.keys(snapshot.files).some(path=>!isSafeProjectAssetPath(path))||typeof snapshot.tokenFingerprint!=='string')return '只读设计库参考快照缺失或无效，请先转为项目副本，再重新导入来源。';
  if(snapshot.designSystemId!==state.designSystem.id||snapshot.designSystemName!==state.designSystem.name||snapshot.tokenFingerprint!==designTokenFingerprint(state.designSystem.tokens))return '只读设计库 Token 与固定版本不一致，请先转为项目副本，再重新导入来源。';
  for(const [id,hash] of Object.entries(snapshot.components))if(!state.components[id]||libraryComponentFingerprint(state.components[id])!==hash)return `只读设计库组件 ${id} 与固定版本不一致。`;
  for(const [id,hash] of Object.entries(snapshot.assets))if(!state.assets?.[id]||!snapshot.files[state.assets[id].relPath]||libraryAssetFingerprint(state.assets[id])!==hash)return `只读设计库资源 ${id} 与固定版本不一致。`;
}

/** Check real cache bytes, including retained resources from previous pinned versions. */
export async function verifyLibraryReferenceFiles(storage:Pick<ProjectStorage,'readBinary'>,state:BindingState):Promise<ProjectAssetIssue[]>{
  if(!isLibraryReference(state))return [];
  const files=state.designLibraryBinding?.referenceSnapshot?.files;
  if(!files||typeof files!=='object'||Array.isArray(files))return [{code:'asset_check_unavailable',entityId:'design-library',message:'只读设计库缺少资源内容快照。'}];
  const issues:ProjectAssetIssue[]=[];
  for(const [path,hash] of Object.entries(files)){
    try{
      if(!isSafeProjectAssetPath(path)||typeof hash!=='string')throw new Error();
      const bytes=await storage.readBinary(path);
      if(bytes===null||contentFingerprint(bytes)!==hash)issues.push({code:'asset_check_unavailable',entityId:path,message:`只读设计库资源 ${path} 与固定版本内容不一致或文件缺失。`});
    }catch{issues.push({code:'asset_check_unavailable',entityId:path,message:`无法核对只读设计库资源 ${path}。`});}
  }
  return issues;
}
