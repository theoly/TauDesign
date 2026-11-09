import type {ProjectStorage,TaskArchiveFile} from './projectStorage';
const idPattern='design-[a-z0-9-]{1,110}',namePattern='[a-zA-Z0-9][a-zA-Z0-9_.-]*\\.(?:json|jsonl|html|txt)';
const filePattern=new RegExp(`^tasks/(${idPattern})/((?:artifacts/)?${namePattern})$`),deletedPattern=new RegExp(`^tasks/\\.locks/(${idPattern})\\.deleted$`);
export function taskArchiveLocation(path:string):{id:string;path?:string;deleted?:boolean}|undefined{const file=filePattern.exec(path);if(file&&file[2].split('/').at(-1)!.length<=200)return {id:file[1],path:file[2]};const deleted=deletedPattern.exec(path);if(deleted)return {id:deleted[1],deleted:true};}
export const taskArchiveDirectory=(path:string)=>path==='tasks/.locks'||new RegExp(`^tasks/${idPattern}(?:/artifacts)?$`).test(path);
export const isTaskFolder=(path:string)=>new RegExp(`^tasks/${idPattern}$`).test(path);
export const privateTaskRuntimePath=(path:string)=>path==='tasks/.locks/project.lock'||path==='tasks/.imports'||path.startsWith('tasks/.imports/');
/** Bounded native reads also preserve a UTF-8 BOM. Invalid bytes are an explicit failure, never normalized away. */
export async function readTaskArchiveText(storage:ProjectStorage,path:string,maxBytes:number):Promise<string|null>{
 let text:string|null;
 if(storage.kind==='folder'&&storage.readBinaryLimited){const raw=await storage.readBinaryLimited(path,maxBytes);if(raw===null)return null;const bytes=Uint8Array.from(atob(raw),char=>char.charCodeAt(0));try{text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);}catch{throw Error(`任务归档不是有效UTF-8，保留源文件未迁移：${path}`);}}
 else text=await storage.readText(path);
 if(text!==null){const bytes=new TextEncoder().encode(text);if(bytes.length>maxBytes)throw Error(`任务归档超过迁移额度：${path}`);if(new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes)!==text)throw Error(`任务归档含不可无损复制的字符：${path}`);}
 return text;
}
export async function importTaskArchives(target:ProjectStorage,entries:Array<{path:string;value:string}>,directories:string[],check:()=>void){
 const records=new Map<string,{files:TaskArchiveFile[];deleted?:string;directory:boolean}>();
 for(const id of directories)records.set(id,{files:[],directory:true});
 for(const entry of entries){const at=taskArchiveLocation(entry.path);if(!at)continue;const record=records.get(at.id)??{files:[],directory:false};if(at.deleted)record.deleted=entry.value;else{record.directory=true;record.files.push({path:at.path!,contents:entry.value});}records.set(at.id,record);}
 if(records.size&&!target.importTaskArchive)throw Error('目标存储尚不支持任务归档事务，未绕过清单保护写入。');
 for(const [id,record] of records){check();await target.importTaskArchive!(id,record.files,record.deleted,record.directory);check();for(const file of record.files){if(await readTaskArchiveText(target,`tasks/${id}/${file.path}`,24*1024*1024)!==file.contents)throw Error(`任务归档读回不一致：${id}/${file.path}`);check();}if(record.deleted!==undefined&&await readTaskArchiveText(target,`tasks/.locks/${id}.deleted`,2048)!==record.deleted)throw Error(`删除标记读回不一致：${id}`);}
}
