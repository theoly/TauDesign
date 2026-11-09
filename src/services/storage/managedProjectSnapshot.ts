/** Existing project files remain authoritative. This is a compare-and-publish IO contract,
 * not an execution/adoption permission. Desktop files and browser fallback use the same shape. */
export interface ManagedProjectSnapshot {identity:string;files:Record<string,string>}
export interface ProjectFileChange {path:string;contents:string|null}
export const PROJECT_TRANSACTION_STATE='.project-state/pending.json';
const maxFiles=5000,maxFile=24*1024*1024,maxTotal=128*1024*1024;
const encoder=new TextEncoder(),decoder=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true});
const hash=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value))),n=>n.toString(16).padStart(2,'0')).join('');
export const isManagedProjectPath=(path:string)=>['project.json','base.css','DESIGN.md','history.json'].includes(path)||/^(?:screens\/[a-zA-Z0-9][a-zA-Z0-9_.-]*\.(?:html|css|manifest\.json)|documents\/[a-zA-Z0-9][a-zA-Z0-9_.-]*\.md)$/.test(path)&&path.split('/')[1].length<=240;
export function projectTransactionPath(rel:string):boolean{
 if(rel.includes('\\')||rel.split('/').includes('..'))throw Error('工程事务路径越界或含反斜杠。');
 const path=rel.split('/').filter(part=>part&&part!=='.').join('/');
 if(path==='.project-state'||path.startsWith('.project-state/'))throw Error('工程事务资料只能通过条件发布入口管理。');
 return isManagedProjectPath(path)||['screens','documents'].includes(path);
}
function validText(value:string){const bytes=encoder.encode(value);if(bytes.length>maxFile||decoder.decode(bytes)!==value)throw Error('工程文件超过24MiB或含不能无损保存的字符。');return bytes.length;}
export function validateProjectFileChanges(changes:ProjectFileChange[]){
 if(!Array.isArray(changes)||!changes.length||changes.length>maxFiles)throw Error('工程发布文件数量无效。');let total=0;const paths=new Set<string>();
 for(const change of changes){if(!change||Object.keys(change).sort().join(',')!=='contents,path'||typeof change.path!=='string'||!isManagedProjectPath(change.path)||paths.has(change.path)||change.contents!==null&&typeof change.contents!=='string')throw Error('工程发布路径、字段或内容无效。');paths.add(change.path);if(change.contents!==null)total+=validText(change.contents);if(total>maxTotal)throw Error('工程发布超过128MiB额度。');}
}
export async function managedSnapshot(files:Record<string,string>):Promise<ManagedProjectSnapshot>{
 let total=0;const rows=Object.entries(files).sort(([a],[b])=>a<b?-1:a>b?1:0);if(rows.length>maxFiles)throw Error('工程快照超过5000个文件。');
 for(const[path,text]of rows){if(!isManagedProjectPath(path)||typeof text!=='string')throw Error('工程快照路径或内容无效。');total+=validText(text);if(total>maxTotal)throw Error('工程快照超过128MiB。');}
 const fingerprints=await Promise.all(rows.map(async([path,text])=>path+'\0'+await hash(text)+'\n'));
 return {identity:await hash(fingerprints.join('')),files:Object.fromEntries(rows)};
}
export async function changedManagedSnapshot(before:ManagedProjectSnapshot,changes:ProjectFileChange[]){
 validateProjectFileChanges(changes);const next={...before.files};for(const row of changes)if(row.contents===null)delete next[row.path];else next[row.path]=row.contents;return managedSnapshot(next);
}
