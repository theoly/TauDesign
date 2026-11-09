import {managedSnapshot,changedManagedSnapshot,validateProjectFileChanges,type ManagedProjectSnapshot,type ProjectFileChange} from './managedProjectSnapshot';
import {browserProjectDatabase as database} from './browserDatabase';
import {browserResourceMatches,initializeBrowserResources,expectedBrowserResources,type BrowserResourceExpectation} from './browserResourceStore';
import type {RenderResourceFile} from './renderResourceSnapshot';
type BrowserProjectRecord=ManagedProjectSnapshot&{scopeVersion?:2};
/** Only this browser fallback backend changes. Desktop remains the on-disk .aidesign bundle.
 * Methods are separate so unit tests can inject IO faults; real browser tests use IndexedDB. */
export const browserProjectSnapshotStore={
 async read(scope:string):Promise<BrowserProjectRecord|null>{
  const db=await database();return new Promise((resolve,reject)=>{const tx=db.transaction('projects','readonly'),request=tx.objectStore('projects').get(scope);let value:BrowserProjectRecord|null=null;request.onsuccess=()=>{value=request.result??null;};tx.oncomplete=()=>resolve(value);tx.onabort=()=>reject(Error('读取工程事务失败，旧数据保留。'));tx.onerror=()=>{};});
 },
 async compareExchange(scope:string,expected:ManagedProjectSnapshot|null,next:BrowserProjectRecord,resources:BrowserResourceExpectation[]=[]):Promise<boolean>{
  const db=await database();return new Promise((resolve,reject)=>{const tx=db.transaction(resources.length?['projects','resources']:['projects'],'readwrite'),store=tx.objectStore('projects'),request=store.get(scope);let accepted=false,projectReady=false,remaining=resources.length,resourceChanged=false,old:any;
   const publish=()=>{if(!projectReady||remaining)return;if(resourceChanged)return;if(old?.identity!==(expected?.identity??undefined)||old&&JSON.stringify(old.files)!==JSON.stringify(expected!.files))return;store.put(next,scope);accepted=true;};
   request.onsuccess=()=>{old=request.result??null;projectReady=true;publish();};
   for(const file of resources){const read=tx.objectStore('resources').get([scope,file.path]);read.onsuccess=()=>{if(!browserResourceMatches(read.result,file))resourceChanged=true;remaining--;publish();};}
   tx.oncomplete=()=>resourceChanged?reject(Error('页面资源内容已变化，请刷新预览并复验后再采纳。')):resolve(accepted);tx.onabort=()=>reject(Error('工程原子保存失败，请检查浏览器存储空间；原版本保持。'));tx.onerror=()=>{};
  });
 }
};
export async function readBrowserProject(scope:string,legacy:()=>Record<string,string>):Promise<ManagedProjectSnapshot>{
 const current=await browserProjectSnapshotStore.read(scope);
 if(current){
  const keys=Object.keys(current).sort().join(',');
  if(!current.files||!(keys==='files,identity'||keys==='files,identity,scopeVersion'&&current.scopeVersion===2))throw Error('工程事务记录损坏，未覆盖原数据。');
  const verified=await managedSnapshot(current.files);if(verified.identity!==current.identity)throw Error('工程事务记录完整性校验失败，未覆盖原数据。');
  if(current.scopeVersion===2)return verified;
  // Before History joined this transaction it lived in ordinary file keys. Import it once,
  // preserving the database pages. The version prevents a later deletion from reviving backups.
  const history=legacy()['history.json'],upgraded=history!==undefined&&verified.files['history.json']===undefined?await managedSnapshot({...verified.files,'history.json':history}):verified;
  if(await browserProjectSnapshotStore.compareExchange(scope,current,{...upgraded,scopeVersion:2}))return upgraded;
  return readBrowserProject(scope,legacy);
 }
 const initial=await managedSnapshot(legacy());
 if(await browserProjectSnapshotStore.compareExchange(scope,null,{...initial,scopeVersion:2}))return initial;
 return readBrowserProject(scope,legacy);
}
export async function publishBrowserProject(scope:string,legacy:()=>Record<string,string>,expected:string,changes:ProjectFileChange[],dependencies?:{files:RenderResourceFile[];legacy:()=>Record<string,string>}):Promise<string>{
 if(!/^[a-f0-9]{64}$/.test(expected))throw Error('工程基线身份无效。');validateProjectFileChanges(changes);const before=await readBrowserProject(scope,legacy);if(before.identity!==expected)throw Error('工程已由其它实例或外部编辑更新，未覆盖；请重新打开并核对。');
 let resources:BrowserResourceExpectation[]=[];
 if(dependencies?.files.length){await initializeBrowserResources(scope,dependencies.legacy);resources=await expectedBrowserResources(scope,dependencies.files);}
 const next=await changedManagedSnapshot(before,changes);if(!await browserProjectSnapshotStore.compareExchange(scope,before,{...next,scopeVersion:2},resources))throw Error('工程已由其它实例更新，未覆盖本次结果。');return next.identity;
}
