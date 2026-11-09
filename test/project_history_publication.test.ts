import {afterEach,expect,spyOn,test} from 'bun:test';
import {ProjectRepository,type ProjectDocument} from '../src/services/storage/projectRepository';
import {createProjectAuthoringSession} from '../src/services/storage/projectAuthoring';
import {createProjectStorage,LocalStorageStorage} from '../src/services/storage/projectStorage';
import {readHistoryArchive,type HistorySnapshot} from '../src/services/storage/historyRepository';
import {flushHistorySaveChecked,loadHistoryForProject,resumeHistoryPersistence,suspendHistoryPersistence} from '../src/services/storage/historyPersistence';
import {useProjectStore,waitForProjectSave} from '../src/stores/useProjectStore';
import {useHistoryStore} from '../src/stores/useHistoryStore';
import {neutralModernTheme} from '../src/utils/themePresets';

const empty=():HistorySnapshot=>({past:[],future:[],checkpoints:[]});
const history=(id:string):HistorySnapshot=>({...empty(),past:[{id,label:id,timestamp:1,patches:[],inversePatches:[]}]});
const makeDoc=(id:string):ProjectDocument=>({id,name:'原工程',createdAt:1,schemaVersion:1,settings:{deviceProfile:'pc',frameWidth:1440,colorMode:'light'},designSystem:structuredClone(neutralModernTheme) as any,screenOrder:['page'],screens:{page:{id:'page',name:'页面',htmlContent:'<main data-nid="root">完整原文</main>',position:{x:0,y:0}}}});
const restores:Array<()=>void>=[];
afterEach(()=>{while(restores.length)restores.pop()!();resumeHistoryPersistence();});
async function workspace(){
 const prior=useProjectStore.getState(),past=useHistoryStore.getState();restores.push(()=>{suspendHistoryPersistence();useProjectStore.setState(prior,true);useHistoryStore.setState(past,true);});suspendHistoryPersistence();
 const id='history-publication-'+crypto.randomUUID(),folder='/synthetic/'+id,storage=createProjectStorage(id) as LocalStorageStorage,repo=new ProjectRepository(storage),doc=makeDoc(id);await repo.save(doc,{history:history('opened')});expect(useProjectStore.getState().loadProjectDocument((await repo.load())!,folder)).toBe(true);return {id,folder,storage,repo};
}
test('page, project index and History publish together; preparation and publication failures leave all unchanged',async()=>{
 const storage=new LocalStorageStorage('history-atomic-'+crypto.randomUUID()),repo=new ProjectRepository(storage),doc=makeDoc('synthetic');await repo.save(doc,{history:history('old')});const before=await storage.readManagedSnapshot();
 doc.screens.page.htmlContent='<main>新版正文</main>';const publish=spyOn(storage,'publishManagedSnapshot').mockRejectedValueOnce(Error('synthetic no space'));
 await expect(repo.save(doc,{history:history('new')})).rejects.toThrow('no space');expect(await storage.readManagedSnapshot()).toEqual(before);publish.mockRestore();
 const observed=spyOn(storage,'publishManagedSnapshot');await repo.save(doc,{history:history('new')});expect(observed).toHaveBeenCalledTimes(1);expect(observed.mock.calls[0][1].map(row=>row.path)).toEqual(expect.arrayContaining(['project.json','screens/page.html','history.json']));
 expect((await readHistoryArchive(storage,doc.id,await storage.readText('history.json')))?.past[0].id).toBe('new');expect((await repo.load())?.screens.page.htmlContent).toBe('<main>新版正文</main>');
 const stable=await storage.readManagedSnapshot();await expect(repo.save(doc,{history:empty(),beforePublish(){throw Error('context changed');}})).rejects.toThrow('context changed');expect(await storage.readManagedSnapshot()).toEqual(stable);
});
test('History-only external writes invalidate the same author baseline',async()=>{
 const storage=new LocalStorageStorage('history-baseline-'+crypto.randomUUID()),repo=new ProjectRepository(storage),doc=makeDoc('synthetic');await repo.save(doc,{history:history('old')});const loaded=(await repo.load())!,author=createProjectAuthoringSession(storage,loaded);await storage.writeTextAtomic('history.json',JSON.stringify({schemaVersion:1,projectId:doc.id,savedAt:1,...history('external')}));const winner=await storage.readManagedSnapshot();await expect(new ProjectRepository(storage,author).save(loaded,{history:empty()})).rejects.toThrow('其它实例');expect(await storage.readManagedSnapshot()).toEqual(winner);
});
test('actual autosave captures corresponding History; flush uses author authority and stale flush cannot replace winner',async()=>{
 const f=await workspace();useHistoryStore.getState().commit('当前操作',[],[]);useProjectStore.getState().setName('窗口一');await waitForProjectSave(f.id,f.folder);expect((await readHistoryArchive(f.storage,f.id,await f.storage.readText('history.json')))?.past.at(-1)?.label).toBe('当前操作');
 const foreign=(await f.repo.load())!;foreign.name='另一作者';await new ProjectRepository(f.storage,createProjectAuthoringSession(f.storage,foreign)).save(foreign,{history:history('winner')});const winner=await f.storage.readManagedSnapshot();
 resumeHistoryPersistence();await expect(flushHistorySaveChecked(f.id,f.folder)).rejects.toThrow('其它实例');expect(await f.storage.readManagedSnapshot()).toEqual(winner);expect(useHistoryStore.getState().past.at(-1)?.label).toBe('当前操作');expect(useProjectStore.getState().projectSaveStatus).toBe('failed');
});
test('explicit open restores History from its page snapshot even if another author replaces live History before restore',async()=>{
 const f=await workspace();expect(useHistoryStore.getState().past[0].id).toBe('opened');const foreign=(await f.repo.load())!;foreign.name='另一版本';await new ProjectRepository(f.storage,createProjectAuthoringSession(f.storage,foreign)).save(foreign,{history:history('foreign')});
 expect(await loadHistoryForProject(f.id,f.folder)).toBe(true);expect(useHistoryStore.getState().past[0].id).toBe('opened');expect(useProjectStore.getState().name).toBe('原工程');await expect(useProjectStore.getState().saveProjectChecked()).rejects.toThrow('其它实例');
});
test('Undo/Redo saves page and corresponding stacks together and reopens at the same state',async()=>{
 const f=await workspace();useProjectStore.getState().updateScreen('page',{htmlContent:'<main data-nid="root">已修改正文</main>'},'修改正文');await waitForProjectSave(f.id,f.folder);useHistoryStore.getState().undo();await waitForProjectSave(f.id,f.folder);let restored=(await f.repo.load())!,snap=await readHistoryArchive(f.storage,f.id,await f.storage.readText('history.json'));expect(restored.screens.page.htmlContent).toContain('完整原文');expect(snap!.future).toHaveLength(1);
 useHistoryStore.getState().redo();await waitForProjectSave(f.id,f.folder);restored=(await f.repo.load())!;snap=await readHistoryArchive(f.storage,f.id,await f.storage.readText('history.json'));expect(restored.screens.page.htmlContent).toContain('已修改正文');expect(snap!.future).toHaveLength(0);expect(useProjectStore.getState().loadProjectDocument(restored,f.folder)).toBe(true);expect(useHistoryStore.getState().past).toEqual(snap!.past);
});
for(const kind of ['corrupt','future','foreign'])test(`${kind} History is readable only as a preserved project, never overwritten by autosave`,async()=>{
 const f=await workspace(),raw=kind==='corrupt'?'{broken':JSON.stringify({schemaVersion:kind==='future'?99:1,projectId:kind==='foreign'?'different':f.id,...empty()});await f.storage.writeTextAtomic('history.json',raw);const doc=(await f.repo.load())!;expect(useProjectStore.getState().loadProjectDocument(doc,f.folder)).toBe(true);expect(useProjectStore.getState().projectSaveStatus).toBe('readonly');await expect(useProjectStore.getState().saveProjectChecked()).rejects.toThrow('历史');expect(await f.storage.readText('history.json')).toBe(raw);
});
test('incomplete original requirements and skipped invalid document IDs cannot be saved as a smaller recovery',async()=>{
 const f=await workspace();for(const documents of [{bad:{id:'bad',title:'需求',source:'manual',enabled:true,createdAt:1,updatedAt:1,contentFile:'documents/bad.md',originalFile:'documents/bad.original.md'}},{'../unsafe':{id:'../unsafe'}}]){
 const root=JSON.parse((await f.storage.readText('project.json'))!);root.projectDocuments=documents;await f.storage.writeTextAtomic('documents/bad.md','正文仍在');await f.storage.writeTextAtomic('project.json',JSON.stringify(root));const before=await f.storage.readManagedSnapshot();const recovered=(await f.repo.load())!;expect(useProjectStore.getState().loadProjectDocument(recovered,f.folder)).toBe(true);expect(useProjectStore.getState().projectSaveStatus).toBe('readonly');await expect(useProjectStore.getState().saveProjectChecked()).rejects.toThrow();expect(await f.storage.readManagedSnapshot()).toEqual(before);
 }
});
test('media-bearing History blocks early autosave, restores independent files, and preserves the archive if a file later disappears',async()=>{
 const f=await workspace(),doc=(await f.repo.load())!,snap=history('media'),svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M1 1h2"/></svg>';snap.past[0].patches=[{op:'replace',path:['screens','page'],value:{...doc.screens.page,htmlContent:svg}}];
 await new ProjectRepository(f.storage,createProjectAuthoringSession(f.storage,doc)).save(doc,{history:snap});const before=await f.storage.readManagedSnapshot();expect(before.files['history.json']).not.toContain('<path');expect(JSON.parse(before.files['history.json']).schemaVersion).toBe(2);
 expect(useProjectStore.getState().loadProjectDocument((await f.repo.load())!,f.folder)).toBe(true);await expect(useProjectStore.getState().saveProjectChecked()).rejects.toThrow('正在恢复');expect(await f.storage.readManagedSnapshot()).toEqual(before);
 expect(await loadHistoryForProject(f.id,f.folder)).toBe(true);expect((useHistoryStore.getState().past[0].patches[0].value as any).htmlContent).toBe(svg);await useProjectStore.getState().saveProjectChecked();
 const current=await f.storage.readManagedSnapshot(),media=JSON.parse(current.files['history.json']).mediaStrings[0].parts.find((part:unknown)=>typeof part==='object');await f.storage.remove(media.path);expect(useProjectStore.getState().loadProjectDocument((await f.repo.load())!,f.folder)).toBe(true);expect(await loadHistoryForProject(f.id,f.folder)).toBe(false);await expect(useProjectStore.getState().saveProjectChecked()).rejects.toThrow('缺失');expect(await f.storage.readManagedSnapshot()).toEqual(current);
});
