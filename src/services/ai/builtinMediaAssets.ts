import {createProjectStorage} from '../storage/projectStorage';
import {pageCreationContext} from './pageCreationValidation';
import {useProjectStore} from '../../stores/useProjectStore';
import type {Asset} from '../../types/project';
export const BUILTIN_MEDIA_ICON_NAMES=['arrow-left','arrow-right','bell','calendar','check','chevron-down','chevron-right','clock','heart','house','info','mail','map-pin','menu','message-circle','plus','search','settings','shield-check','user','users','x'] as const;
/** Bundled vectors are resource preparation, not HTML produced by a model or a remote upload. */
export async function prepareBuiltinMediaAssets(signal?:AbortSignal):Promise<void>{
 const state=useProjectStore.getState(),context=pageCreationContext(state),storage=createProjectStorage(state.id,state.folderPath),assets:Asset[]=[];
 const guard=()=>{if(signal?.aborted)throw new DOMException('素材准备已取消','AbortError');if(pageCreationContext(useProjectStore.getState())!==context)throw Error('工程已变化，未登记新素材。');};
 try{
  guard();const {importedLucideSvg}=await import('../import/importLucideIcons');
  for(const name of BUILTIN_MEDIA_ICON_NAMES){
  guard();const svg=importedLucideSvg(name);if(!svg)throw Error(`内置图标缺少${name}`);
  const bytes=new TextEncoder().encode(svg),hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
  const relPath=`assets/icons/${hash}.svg`,id=`builtin-icon-${hash.slice(0,24)}`;
  let data='';for(const b of bytes)data+=String.fromCharCode(b);const base64=btoa(data);
  if(await storage.exists(relPath)){if(await storage.readBinary(relPath)!==base64)throw Error(`图标资源${name}已被修改，未覆盖原文件。`);}else{await storage.ensureDir('assets/icons');await storage.writeBinary(relPath,base64);}
  if(!Object.values(state.assets).some(a=>a.relPath===relPath))assets.push({id,name:`图标 · ${name}`,type:'svg_icon',mimeType:'image/svg+xml',source:'builtin',relPath,refCount:0});
 }
 guard();if(assets.length)useProjectStore.getState().registerPreparedAssets(assets,state.id,context);
 }catch(error){
  // Immutable hashed files may already be referenced by another window/process. Failed
  // preparation leaves unregistered files for reuse/GC, never deletes another owner's asset.
  throw error;
 }
}
