import {changedManagedSnapshot,isManagedProjectPath,managedSnapshot} from '../../src/services/storage/managedProjectSnapshot';
/** Browser filesystem fixture only: actual native locking/crash semantics are tested separately. */
export async function fileSnapshotCommand(command:string,params:{root:string;expected?:string;changes?:Array<{path:string;contents:string|null}>},prefix:string):Promise<{handled:boolean;value?:unknown}>{
 if(!['project_managed_snapshot','project_publish_snapshot'].includes(command))return {handled:false};
 return navigator.locks.request('fixture-files:'+params.root,async()=>{
  const files=Object.fromEntries(Object.keys(localStorage).filter(key=>key.startsWith(prefix)&&isManagedProjectPath(key.slice(prefix.length))).map(key=>[key.slice(prefix.length),localStorage.getItem(key)!]));
  const before=await managedSnapshot(files);
  if(command==='project_managed_snapshot')return {handled:true,value:before};
  if(params.expected!==before.identity)throw Error('工程文件已变化，请重新打开后再保存。');
  const next=await changedManagedSnapshot(before,params.changes!);
  for(const change of params.changes!)if(change.contents===null)localStorage.removeItem(prefix+change.path);else localStorage.setItem(prefix+change.path,change.contents);
  return {handled:true,value:next.identity};
 });
}
