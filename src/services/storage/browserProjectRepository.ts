import {readLegacyProject,projectCacheKey,listProjects} from '../../utils/projectRegistry';
import {createProjectStorage} from './projectStorage';
import {ProjectRepository,type ProjectDocument} from './projectRepository';
import {historyKey,historyCacheKey,readHistoryArchive} from './historyRepository';

/** Legacy keys are only an import source. Once a managed root exists they never win a read. */
export async function openBrowserProject(id:string):Promise<ProjectDocument|null>{
 const storage=createProjectStorage(id),repository=new ProjectRepository(storage);
 const loaded=await repository.load();if(loaded)return loaded;
 const before=await storage.readManagedSnapshot!();
 if(before.files['project.json']!==undefined)return repository.load();
 if(localStorage.getItem(projectCacheKey(id))!==null||listProjects().some(project=>project.id===id&&project.storageVersion))throw Error('受管工程文件缺失，未从旧缓存重建；请恢复原工程。');
 const raw=readLegacyProject(id);if(!raw)return null;
 const doc=JSON.parse(raw) as ProjectDocument;
 if(doc.id!==id)throw Error('旧工程身份不匹配，原数据保留。');
 const historyRaw=localStorage.getItem(historyKey(id)),history=await readHistoryArchive(storage,id,historyRaw);
 if(historyRaw&&!history)throw Error('旧工程历史损坏或不兼容，原数据保留；请先恢复历史。');
 await repository.save(doc,{...(history?{history}:{}),beforePublish:()=>{
  if(readLegacyProject(id)!==raw||localStorage.getItem(historyKey(id))!==historyRaw)throw Error('迁入期间旧工程或历史已变化，请重新打开。');
 }});
 return repository.load();
}

/** Compatibility preview cache only; no reader may use it to refresh an authoring baseline. */
export function cacheBrowserProject(document:ProjectDocument,historyRaw?:string|null){
 try{localStorage.setItem(projectCacheKey(document.id),JSON.stringify(document));}catch{console.warn('[project] 兼容预览缓存未更新；受管工程已保存。');}
 if(historyRaw!==undefined)try{if(historyRaw===null)localStorage.removeItem(historyCacheKey(document.id));else localStorage.setItem(historyCacheKey(document.id),historyRaw);}catch{console.warn('[project] 兼容历史缓存未更新；受管工程已保存。');}
}

/** Keep a durable root tombstone so surviving legacy backups cannot resurrect a deleted project. */
export async function deleteBrowserProject(id:string){
 const storage=createProjectStorage(id),snapshot=await storage.readManagedSnapshot!();
 const changes=Object.keys(snapshot.files).filter(path=>path!=='project.json').map(path=>({path,contents:null as string|null}));
 changes.push({path:'project.json',contents:JSON.stringify({id,deleted:true,deletedAt:Date.now()})});
 await storage.publishManagedSnapshot!(snapshot.identity,changes);
}
