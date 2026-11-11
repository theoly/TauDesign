import {afterEach,expect,spyOn,test} from 'bun:test';
import {openBrowserProject,deleteBrowserProject} from '../src/services/storage/browserProjectRepository';
import {ProjectRepository} from '../src/services/storage/projectRepository';
import {createProjectStorage} from '../src/services/storage/projectStorage';
import {useProjectStore,waitForProjectSave} from '../src/stores/useProjectStore';
import {useHistoryStore} from '../src/stores/useHistoryStore';
import {neutralModernTheme} from '../src/utils/themePresets';
import {projectKey,projectCacheKey,readProject,writeProject} from '../src/utils/projectRegistry';
import {historyKey} from '../src/services/storage/historyRepository';
import {resumeHistoryPersistence,suspendHistoryPersistence,flushHistorySaveChecked} from '../src/services/storage/historyPersistence';
import {pageCreationContext} from '../src/services/ai/pageCreationValidation';
const restores:Array<()=>void>=[];afterEach(()=>{while(restores.length)restores.pop()!();resumeHistoryPersistence();});
async function workspace(){const state=useProjectStore.getState(),history=useHistoryStore.getState();restores.push(()=>{suspendHistoryPersistence();useProjectStore.setState(state,true);useHistoryStore.setState(history,true);});suspendHistoryPersistence();const id=useProjectStore.getState().initNewProject({name:'浏览器主工程',deviceProfile:'pc',createSpecimen:false});useProjectStore.getState().addScreen({name:'资料',htmlContent:'<main data-nid="root">完整原文</main>'},'page');await waitForProjectSave(id);return {id,storage:createProjectStorage(id)};}
const legacy=()=>{const id='legacy-browser-'+crypto.randomUUID(),doc={id,name:'旧工程',settings:{deviceProfile:'pc',frameWidth:1440,colorMode:'light'},designSystem:neutralModernTheme,screens:{page:{id:'page',name:'原页',position:{x:0,y:0},htmlContent:'<main>旧原文</main>'}},assets:{},components:{}};const raw=JSON.stringify(doc),history=JSON.stringify({schemaVersion:1,projectId:id,past:[{id:'old-history',label:'旧操作',timestamp:1,patches:[],inversePatches:[]}],future:[],checkpoints:[]});writeProject(id,raw);localStorage.setItem(historyKey(id),history);return {id,doc,raw,history,storage:createProjectStorage(id)};};
test('ordinary browser autosave has an author session and old instances cannot overwrite a foreign project or History',async()=>{
 const f=await workspace();expect(useProjectStore.getState().projectAuthoringSession).not.toBeNull();const repo=new ProjectRepository(f.storage),foreign=(await repo.load())!;foreign.name='另一窗口';await new ProjectRepository(f.storage).save(foreign);const winner=await f.storage.readManagedSnapshot!();await repo.load();useProjectStore.getState().setName('本地未保存');await expect(waitForProjectSave(f.id)).rejects.toThrow('其它实例');resumeHistoryPersistence();await expect(flushHistorySaveChecked(f.id)).rejects.toThrow('其它实例');expect(await f.storage.readManagedSnapshot!()).toEqual(winner);expect(useProjectStore.getState().name).toBe('本地未保存');expect(useProjectStore.getState().projectSaveStatus).toBe('failed');
 localStorage.setItem(projectCacheKey(f.id),JSON.stringify({...foreign,name:'过期缓存'}));expect(await useProjectStore.getState().loadProjectById(f.id)).toBe(true);expect(useProjectStore.getState().name).toBe('另一窗口');
});
test('legacy project and History migrate once, keep exact original keys, and subsequent opens ignore edited backups',async()=>{
 const f=legacy(),doc=await openBrowserProject(f.id);expect(doc!.screens.page.htmlContent).toBe(f.doc.screens.page.htmlContent);expect(await f.storage.readText('history.json')).toContain('old-history');expect(localStorage.getItem(projectKey(f.id))).toBe(f.raw);expect(localStorage.getItem(historyKey(f.id))).toBe(f.history);
 localStorage.setItem(projectKey(f.id),JSON.stringify({...f.doc,name:'过期旧键'}));localStorage.setItem(historyKey(f.id),'{bad old backup');expect((await openBrowserProject(f.id))!.name).toBe('旧工程');
});
test('legacy source edits during publication or database failure preserve the old keys and install no partial root',async()=>{
 const f=legacy(),{browserProjectSnapshotStore}=await import('../src/services/storage/browserProjectSnapshot');await f.storage.readManagedSnapshot!();
 const origExchange=(browserProjectSnapshotStore.compareExchange as any).getMockImplementation();
 (browserProjectSnapshotStore.compareExchange as any).mockImplementation(async(scope:string,...args:any[])=>{
  if(scope.includes(f.id))throw Error('synthetic database quota');
  return origExchange?origExchange(scope,...args):true;
 });
 try{
  await expect(openBrowserProject(f.id)).rejects.toThrow('quota');expect((await f.storage.readManagedSnapshot!()).files['project.json']).toBeUndefined();expect(localStorage.getItem(projectKey(f.id))).toBe(f.raw);expect(localStorage.getItem(historyKey(f.id))).toBe(f.history);
 }finally{if(origExchange)(browserProjectSnapshotStore.compareExchange as any).mockImplementation(origExchange);}
 const changed=legacy(),original=ProjectRepository.prototype.save,newRaw=JSON.stringify({...changed.doc,name:'来源已修改'}),save=spyOn(ProjectRepository.prototype,'save').mockImplementation(function(doc,options){localStorage.setItem(projectKey(changed.id),newRaw);return original.call(this,doc,options);});
 try{await expect(openBrowserProject(changed.id)).rejects.toThrow('已变化');expect((await changed.storage.readManagedSnapshot!()).files['project.json']).toBeUndefined();expect(localStorage.getItem(projectKey(changed.id))).toBe(newRaw);expect(localStorage.getItem(historyKey(changed.id))).toBe(changed.history);}finally{save.mockRestore();}
});
test('deleted primary roots do not resurrect from surviving original or cache keys and stale autosave is rejected',async()=>{
 const f=await workspace(),backup=readProject(f.id)!;await deleteBrowserProject(f.id);writeProject(f.id,backup);expect(await openBrowserProject(f.id)).toBeNull();useProjectStore.getState().setName('迟到写入');await expect(waitForProjectSave(f.id)).rejects.toThrow('其它实例');expect(await openBrowserProject(f.id)).toBeNull();
});
test('a missing managed root does not automatically adopt the preview cache as a new original',async()=>{
 const f=await workspace();await f.storage.remove('project.json');await expect(openBrowserProject(f.id)).rejects.toThrow('缓存重建');
});
test('saving and explicitly reopening a page with absent metadata preserves its exact creation context',async()=>{
 const f=await workspace(),before=pageCreationContext(useProjectStore.getState());expect(useProjectStore.getState().screens.page.metadata).toBeUndefined();
 await useProjectStore.getState().saveProjectChecked();expect(await useProjectStore.getState().loadProjectById(f.id)).toBe(true);
 expect(useProjectStore.getState().screens.page.metadata).toBeUndefined();expect(pageCreationContext(useProjectStore.getState())).toBe(before);
});
