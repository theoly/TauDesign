import type {ProjectStorage} from './projectStorage';

export interface RenderResourceFile {relPath:string;sha256:string}
export function validRenderResourceFiles(value:unknown):value is RenderResourceFile[] {
  return Array.isArray(value)&&value.length<=4096&&value.every(f=>f&&typeof f.relPath==='string'&&
    /^assets\/(images|icons|imports)\//.test(f.relPath)&&!f.relPath.split('/').includes('..')&&
    typeof f.sha256==='string'&&/^[a-f0-9]{64}$/.test(f.sha256))&&new Set(value.map(f=>f.relPath)).size===value.length;
}
export function mergeRenderResourceFiles(groups:readonly (readonly RenderResourceFile[])[]):RenderResourceFile[] {
  const merged=new Map<string,RenderResourceFile>();
  for(const group of groups)for(const file of group){
    const prior=merged.get(file.relPath);
    if(prior&&prior.sha256!==file.sha256)throw Error(`资源 ${file.relPath} 在渲染期间发生变化，请刷新预览并复验。`);
    merged.set(file.relPath,file);
  }
  return [...merged.values()].sort((a,b)=>a.relPath.localeCompare(b.relPath));
}
export function renderResourceIssue(recorded:RenderResourceFile[]|undefined,current:RenderResourceFile[]):string|undefined {
  if(recorded===undefined&&!current.length)return; // Old reports for pages without local resources.
  if(!validRenderResourceFiles(recorded)||!validRenderResourceFiles(current)||
    JSON.stringify(mergeRenderResourceFiles([recorded]))!==JSON.stringify(mergeRenderResourceFiles([current])))
    return '页面资源内容已变化或缺少实际渲染摘要，请刷新预览并复验后再采纳。';
}

/** One read per path. The exact bytes materialized into a document also produce its proof. */
export function createRenderResourceSnapshot(source:ProjectStorage) {
  const pending=new Map<string,Promise<string|null>>(),files=new Map<string,RenderResourceFile>();
  const storage=Object.create(source) as ProjectStorage;
  storage.readBinary=path=>{
    let read=pending.get(path);
    if(!read){
      read=(async()=>{
        const base64=await source.readBinary(path);if(base64===null)return null;
        const bytes=Uint8Array.from(atob(base64),c=>c.charCodeAt(0));
        const digest=await crypto.subtle.digest('SHA-256',bytes.buffer);
        files.set(path,{relPath:path,sha256:[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('')});
        return base64;
      })();pending.set(path,read);
    }
    return read;
  };
  return {storage,async files(){await Promise.allSettled(pending.values());return mergeRenderResourceFiles([[...files.values()]]);}};
}
