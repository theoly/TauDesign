import type {ProjectStorage} from './projectStorage';

export const TASK_INDEX_PATH='tasks/index.json';
export const DESIGN_TASK_PAGE_SIZE=50;
/** Soft byte budgets for live task folders (tombstones excluded). */
export const DESIGN_TASK_BYTE_BUDGET={folder:2*1024*1024*1024,localStorage:8*1024*1024} as const;

export type DesignTaskIndexState='draft'|'blocked'|'completed'|'cancelled';
export interface DesignTaskIndexPublication {id:string;kind:'candidate'|'batch';at:number;screenIds:string[]}
export interface DesignTaskIndexEntry {
 id:string;state:DesignTaskIndexState;createdAt:number;updatedAt:number;
 requestPreview:string;errorPreview?:string;bytes:number;artifactCount:number;hasTree:boolean;
 publication?:DesignTaskIndexPublication;recoveryClaimed?:boolean;deletionPending?:boolean;originTaskId?:string;
}

export interface DesignTaskCatalog {
 version:1;updatedAt:number;totalBytes:number;
 entries:DesignTaskIndexEntry[];
 invalid:Array<{id:string;message:string}>;
}

const validId=(id:string)=>/^design-[a-z0-9-]{1,110}$/.test(id);
const preview=(text:string,max=240)=>text.length<=max?text:text.slice(0,max);
const invalidMessage='此任务缺失、格式不受支持、超出读取额度或文件完整性校验失败；不能恢复。';

export function taskByteBudget(kind:ProjectStorage['kind']):number{
 return kind==='folder'?DESIGN_TASK_BYTE_BUDGET.folder:DESIGN_TASK_BYTE_BUDGET.localStorage;
}

export function emptyCatalog():DesignTaskCatalog{
 return {version:1,updatedAt:0,totalBytes:0,entries:[],invalid:[]};
}

export function entryFromTask(task:{id:string;state:DesignTaskIndexState;createdAt:number;updatedAt:number;request:string;error?:string;artifacts:unknown[];generationTree?:unknown;originTaskId?:string},bytes:number,extra?:{publication?:DesignTaskIndexPublication;recoveryClaimed?:boolean;deletionPending?:boolean}):DesignTaskIndexEntry{
 return {
  id:task.id,state:task.state,createdAt:task.createdAt,updatedAt:task.updatedAt,
  requestPreview:preview(task.request),...(task.error?{errorPreview:preview(task.error,400)}:{}),
  bytes,artifactCount:task.artifacts.length,hasTree:Boolean(task.generationTree),
  ...(extra?.publication?{publication:extra.publication}:{}),
  ...(extra?.recoveryClaimed?{recoveryClaimed:true}:{}),
  ...(extra?.deletionPending?{deletionPending:true}:{}),
  ...(task.originTaskId?{originTaskId:task.originTaskId}:{}),
 };
}

export function parseCatalog(raw:string|null):DesignTaskCatalog|undefined{
 if(!raw)return;
 try{
  const value=JSON.parse(raw) as DesignTaskCatalog;
  if(!value||value.version!==1||!Number.isSafeInteger(value.updatedAt)||!Number.isSafeInteger(value.totalBytes)||value.totalBytes<0||!Array.isArray(value.entries)||!Array.isArray(value.invalid))return;
  if(value.entries.some(e=>!e||!validId(e.id)||!['draft','blocked','completed','cancelled'].includes(e.state)||!Number.isSafeInteger(e.updatedAt)||!Number.isSafeInteger(e.bytes)||e.bytes<0))return;
  if(value.invalid.some(row=>!row||!validId(row.id)||typeof row.message!=='string'))return;
  return value;
 }catch{return;}
}

export async function estimateTaskDirBytes(storage:ProjectStorage,id:string):Promise<number>{
 if(!validId(id))return 0;
 const root=`tasks/${id}`;
 let total=0;
 const names=await storage.listDir(root).catch(()=>[] as string[]);
 const paths=new Set<string>();
 for(const name of names.slice(0,512)){
  if(!name||name.includes('..')||name.includes('\\'))continue;
  const first=name.split('/')[0];
  if(name.includes('/'))paths.add(`${root}/${name}`);
  else{
   const child=`${root}/${name}`;
   const nested=await storage.listDir(child).catch(()=>[] as string[]);
   if(nested.length)for(const leaf of nested.slice(0,256)){if(leaf&&!leaf.includes('..'))paths.add(`${child}/${leaf}`);}
   else paths.add(child);
  }
 }
 // Always include common files even if listDir only returns directories.
 for(const rel of [`${root}/manifest.json`,`${root}/attempts.jsonl`,`${root}/recovery-claim.json`])paths.add(rel);
 for(const path of paths){
  const text=await storage.readText(path).catch(()=>null);
  if(text!==null)total+=new TextEncoder().encode(text).length;
 }
 return total;
}

export async function measureLiveTaskBytes(storage:ProjectStorage):Promise<number>{
 const names=[...new Set((await storage.listDir('tasks')).map(name=>name.split('/')[0]).filter(validId))];
 let total=0;
 for(const id of names)total+=await estimateTaskDirBytes(storage,id);
 return total;
}

export function sortEntries(entries:DesignTaskIndexEntry[]):DesignTaskIndexEntry[]{
 return [...entries].sort((a,b)=>b.updatedAt-a.updatedAt||(a.id<b.id?1:a.id>b.id?-1:0));
}

export function encodeCursor(entry:DesignTaskIndexEntry):string{
 return `${entry.updatedAt}:${entry.id}`;
}

export function decodeCursor(cursor:string|undefined):{updatedAt:number;id:string}|undefined{
 if(!cursor)return;
 const i=cursor.indexOf(':');if(i<=0)return;
 const updatedAt=Number(cursor.slice(0,i)),id=cursor.slice(i+1);
 if(!Number.isSafeInteger(updatedAt)||!validId(id))return;
 return {updatedAt,id};
}

export function pageEntries(entries:DesignTaskIndexEntry[],opts:{includeCompleted:boolean;limit:number;cursor?:string}):{page:DesignTaskIndexEntry[];hasMore:boolean;nextCursor?:string;totalMatching:number}{
 const filtered=entries.filter(e=>opts.includeCompleted||(e.state!=='completed'&&!e.publication&&!e.recoveryClaimed&&!e.deletionPending));
 const sorted=sortEntries(filtered);
 const mark=decodeCursor(opts.cursor);
 let start=0;
 if(mark){
  const at=sorted.findIndex(e=>e.id===mark.id&&e.updatedAt===mark.updatedAt);
  start=at>=0?at+1:sorted.findIndex(e=>e.updatedAt<mark.updatedAt||(e.updatedAt===mark.updatedAt&&e.id>mark.id));
  if(start<0)start=sorted.length;
 }
 const page=sorted.slice(start,start+opts.limit);
 const hasMore=start+page.length<sorted.length;
 return {page,hasMore,nextCursor:page.length?encodeCursor(page[page.length-1]):undefined,totalMatching:sorted.length};
}

export async function writeCatalog(storage:ProjectStorage,catalog:DesignTaskCatalog):Promise<void>{
 const next={...catalog,updatedAt:Date.now(),totalBytes:catalog.entries.reduce((sum,e)=>sum+e.bytes,0),entries:sortEntries(catalog.entries)};
 const body=JSON.stringify(next);
 if(new TextEncoder().encode(body).length>4*1024*1024)throw Error('任务索引超过写入额度。');
 await storage.writeTextAtomic(TASK_INDEX_PATH,body);
}

export async function readCatalog(storage:ProjectStorage):Promise<DesignTaskCatalog|undefined>{
 return parseCatalog(await storage.readText(TASK_INDEX_PATH));
}

export function upsertEntry(catalog:DesignTaskCatalog,entry:DesignTaskIndexEntry):DesignTaskCatalog{
 const entries=catalog.entries.filter(e=>e.id!==entry.id).concat(entry);
 const invalid=catalog.invalid.filter(row=>row.id!==entry.id);
 return {...catalog,entries:sortEntries(entries),invalid,totalBytes:entries.reduce((sum,e)=>sum+e.bytes,0),updatedAt:Date.now()};
}

export function removeEntry(catalog:DesignTaskCatalog,id:string):DesignTaskCatalog{
 const entries=catalog.entries.filter(e=>e.id!==id);
 const invalid=catalog.invalid.filter(row=>row.id!==id);
 return {...catalog,entries,invalid,totalBytes:entries.reduce((sum,e)=>sum+e.bytes,0),updatedAt:Date.now()};
}

export function markInvalid(catalog:DesignTaskCatalog,id:string,message=invalidMessage):DesignTaskCatalog{
 const entries=catalog.entries.filter(e=>e.id!==id);
 const invalid=[{id,message},...catalog.invalid.filter(row=>row.id!==id)];
 return {...catalog,entries,invalid,totalBytes:entries.reduce((sum,e)=>sum+e.bytes,0),updatedAt:Date.now()};
}

export {validId as isDesignTaskId,invalidMessage as designTaskInvalidMessage};
