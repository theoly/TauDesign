import {browserProjectDatabase} from './browserDatabase';
import {validatePublicationResources,isProjectResourcePath,type RenderResourceFile} from './renderResourceSnapshot';
export {validatePublicationResources} from './renderResourceSnapshot';

/** File wire contents remain independent of project JSON and page code. Null is a tombstone. */
export interface BrowserResourceRow {version:1;path:string;value:string|null}
export interface BrowserResourceExpectation {path:string;value:string}
export const isBrowserResourcePath=isProjectResourcePath;
function validRow(row:unknown,path:string):row is BrowserResourceRow{
 const r=row as BrowserResourceRow;return Boolean(r&&Object.keys(r).sort().join(',')==='path,value,version'&&r.version===1&&r.path===path&&isBrowserResourcePath(path)&&(r.value===null||typeof r.value==='string'));
}
export function browserResourceMatches(row:unknown,expected:BrowserResourceExpectation){return validRow(row,expected.path)&&row.value===expected.value;}
function checkedRow(row:unknown,path:string):BrowserResourceRow|null{if(row===undefined||row===null)return null;if(!validRow(row,path))throw Error('工程资源记录损坏，未用旧备份覆盖。');return row;}
const range=(scope:string)=>IDBKeyRange.bound([scope,''],[scope,'\uffff']);
/** IO methods permit controlled unit faults; real browser tests use actual IndexedDB. */
export const browserResourceFileStore={
 async initialized(scope:string):Promise<boolean>{
  const db=await browserProjectDatabase();return new Promise((resolve,reject)=>{const tx=db.transaction('resources','readonly'),request=tx.objectStore('resources').get([scope,'']);let value:unknown;
   request.onsuccess=()=>{value=request.result;};tx.oncomplete=()=>{if(value===undefined)resolve(false);else if(value&&typeof value==='object'&&Object.keys(value).sort().join(',')==='initialized,version'&&(value as any).version===1&&(value as any).initialized===true)resolve(true);else reject(Error('工程资源迁移记录损坏，原文件保留。'));};tx.onabort=()=>reject(Error('无法读取工程资源资料。'));tx.onerror=()=>{};});
 },
 async initialize(scope:string,files:Record<string,string>):Promise<void>{
  const db=await browserProjectDatabase();return new Promise((resolve,reject)=>{const tx=db.transaction('resources','readwrite'),store=tx.objectStore('resources'),request=store.get([scope,'']);let reason:string|undefined;
   request.onsuccess=()=>{if(request.result!==undefined)return;const existing=store.getAllKeys(range(scope));existing.onsuccess=()=>{if(existing.result.length){reason='资源表有孤立资料，未用旧备份覆盖。';return;}for(const [path,value]of Object.entries(files))store.put({version:1,path,value},[scope,path]);store.put({version:1,initialized:true},[scope,'']);};};
   tx.oncomplete=()=>reason?reject(Error(reason)):resolve();tx.onabort=()=>reject(Error('资源迁入失败，请检查浏览器存储空间；原文件保留。'));tx.onerror=()=>{};});
 },
 async read(scope:string,path:string):Promise<BrowserResourceRow|null>{
  const db=await browserProjectDatabase();return new Promise((resolve,reject)=>{const tx=db.transaction('resources','readonly'),request=tx.objectStore('resources').get([scope,path]);let value:unknown;
   request.onsuccess=()=>{value=request.result;};tx.oncomplete=()=>{try{resolve(checkedRow(value,path));}catch(error){reject(error);}};tx.onabort=()=>reject(Error('资源读取失败。'));tx.onerror=()=>{};});
 },
 async list(scope:string):Promise<BrowserResourceRow[]>{
  const db=await browserProjectDatabase();return new Promise((resolve,reject)=>{const tx=db.transaction('resources','readonly'),request=tx.objectStore('resources').getAll(range(scope));let values:any[]=[];
   request.onsuccess=()=>{values=request.result;};tx.oncomplete=()=>{try{resolve(values.filter(row=>row?.initialized!==true).map(row=>checkedRow(row,row?.path)!));}catch(error){reject(error);}};tx.onabort=()=>reject(Error('资源目录读取失败。'));tx.onerror=()=>{};});
 },
 async update(scope:string,path:string,change:(previous:string|null)=>string|null):Promise<void>{
  const db=await browserProjectDatabase();return new Promise((resolve,reject)=>{const tx=db.transaction('resources','readwrite'),store=tx.objectStore('resources'),request=store.get([scope,path]);let reason:unknown;
   request.onsuccess=()=>{try{const previous=checkedRow(request.result,path);const value=change(previous?.value??null);if(value!==null&&typeof value!=='string')throw Error('工程资源内容无效，原文件保留。');store.put({version:1,path,value},[scope,path]);}catch(error){reason=error;tx.abort();}};
   tx.oncomplete=()=>resolve();tx.onabort=()=>reject(reason??Error('资源写入失败，请检查浏览器存储空间；原文件保留。'));tx.onerror=()=>{};});
 },
 async remove(scope:string,prefix:string):Promise<void>{
  const db=await browserProjectDatabase();return new Promise((resolve,reject)=>{const tx=db.transaction('resources','readwrite'),store=tx.objectStore('resources'),request=store.getAll(range(scope));let reason:unknown;
   request.onsuccess=()=>{try{for(const row of request.result){if(row?.initialized===true)continue;const checked=checkedRow(row,row?.path)!;if(checked.path===prefix||checked.path.startsWith(prefix+'/'))store.put({...checked,value:null},[scope,checked.path]);}}catch(error){reason=error;tx.abort();}};
   tx.oncomplete=()=>resolve();tx.onabort=()=>reject(reason??Error('资源删除失败，原文件保留。'));tx.onerror=()=>{};});
 }
};
/** One-time import; later localStorage edits can never replace current resource files or tombstones. */
export async function initializeBrowserResources(scope:string,legacy:()=>Record<string,string>){
 if(await browserResourceFileStore.initialized(scope))return;
 const files=legacy();if(Object.keys(files).length>5000||Object.entries(files).some(([path,value])=>!isBrowserResourcePath(path)||typeof value!=='string'))throw Error('旧资源目录数量、路径或内容无效，未迁入；原文件保留。');
 await browserResourceFileStore.initialize(scope,files);
 if(!await browserResourceFileStore.initialized(scope))throw Error('资源迁入结果未确认，原文件保留。');
}
export async function expectedBrowserResources(scope:string,files:RenderResourceFile[]):Promise<BrowserResourceExpectation[]>{
 validatePublicationResources(files);const expected:BrowserResourceExpectation[]=[];let total=0;
 for(const file of files){const row=await browserResourceFileStore.read(scope,file.relPath);if(!row?.value)throw Error('页面资源文件不存在，请重新检查后再采纳。');
  if(row.value.length>Math.ceil(32*1024*1024/3)*4)throw Error('最终交付资源超过32MiB读取额度。');const bytes=Uint8Array.from(atob(row.value),c=>c.charCodeAt(0));total+=bytes.length;
  if(bytes.length>32*1024*1024||total>128*1024*1024)throw Error('最终交付资源超过单文件32MiB或总量128MiB读取额度。');
  const sha=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes.buffer)),v=>v.toString(16).padStart(2,'0')).join('');if(sha!==file.sha256)throw Error('页面资源内容已变化，请刷新预览并复验后再采纳。');expected.push({path:file.relPath,value:row.value});
 }return expected;
}
