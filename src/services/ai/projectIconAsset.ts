import {validateIconSvg} from './iconSvgGeneration';
import {pageCreationContext} from './pageCreationValidation';
import {createProjectStorage} from '../storage/projectStorage';
import {useProjectStore} from '../../stores/useProjectStore';
import type {Asset} from '../../types/project';

/** SVG generation is a media operation. Only the independent file reference enters page code. */
export async function saveProjectIcon(fragment:string,name:string,source:'builtin'|'ai_generated',signal?:AbortSignal):Promise<{asset:Asset;reference:string}>{
 const shapes=validateIconSvg(fragment),state=useProjectStore.getState(),context=pageCreationContext(state),storage=createProjectStorage(state.id,state.folderPath);
 const guard=()=>{if(signal?.aborted)throw new DOMException('图标保存已取消','AbortError');const current=useProjectStore.getState();if(current.id!==state.id||current.folderPath!==state.folderPath||pageCreationContext(current)!==context)throw Error('工程已变化，未登记图标。');};
 guard();
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${shapes}</svg>`;
 const bytes=new TextEncoder().encode(svg),hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join(''),relPath=`assets/icons/${hash}.svg`;
 const base64=btoa(Array.from(bytes,b=>String.fromCharCode(b)).join(''));guard();
 if(await storage.exists(relPath)){if(await storage.readBinary(relPath)!==base64)throw Error('同名图标文件内容不匹配，未覆盖旧资源。');}
 else {await storage.ensureDir('assets/icons');guard();await storage.writeBinary(relPath,base64);}
 guard();const existing=Object.values(useProjectStore.getState().assets).find(a=>a.relPath===relPath);
 const asset=existing??{id:`icon-${hash.slice(0,32)}`,name:name.trim().slice(0,120)||'图标',type:'svg_icon' as const,mimeType:'image/svg+xml',relPath,source,refCount:0};
 if(!existing)useProjectStore.getState().addAsset(asset);
 const doc=new DOMParser().parseFromString('<svg class="icon" role="img" viewBox="0 0 24 24"></svg>','text/html'),el=doc.querySelector('svg')!;
 el.setAttribute('aria-label',asset.name);el.setAttribute('data-asset-id',asset.id);
 el.setAttribute('style',`background-color:currentColor;mask:url("${relPath}") center/contain no-repeat;-webkit-mask:url("${relPath}") center/contain no-repeat`);
 return {asset,reference:el.outerHTML};
}
