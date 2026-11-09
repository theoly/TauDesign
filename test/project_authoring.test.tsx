import {afterEach,expect,spyOn,test} from 'bun:test';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {ProjectRepository,type ProjectDocument} from '../src/services/storage/projectRepository';
import {createProjectAuthoringSession} from '../src/services/storage/projectAuthoring';
import {LocalStorageStorage,createProjectStorage} from '../src/services/storage/projectStorage';
import {useProjectStore,waitForProjectSave} from '../src/stores/useProjectStore';
import {useHistoryStore} from '../src/stores/useHistoryStore';
import {neutralModernTheme} from '../src/utils/themePresets';
import {Header} from '../src/components/layout/Header';
import {listProjects,upsertMeta} from '../src/utils/projectRegistry';
import {suspendHistoryPersistence,resumeHistoryPersistence} from '../src/services/storage/historyPersistence';
const fresh=()=>new LocalStorageStorage('author-'+crypto.randomUUID());
const document=(id='author-'+crypto.randomUUID()):ProjectDocument=>({id,name:'原工程',schemaVersion:1,settings:{deviceProfile:'pc',frameWidth:1440,colorMode:'light',lodBudget:12},designSystem:structuredClone(neutralModernTheme) as any,screens:{page:{id:'page',name:'资料页',htmlContent:'<main data-nid="root" class="container-max"><h1>原文</h1></main>',scopedCss:'h1{color:var(--color-primary)}',position:{x:0,y:0}}},assets:{},components:{},overrides:{},projectDocuments:{requirements:{id:'requirements',title:'需求',source:'manual',content:'完整需求',enabled:true,createdAt:1,updatedAt:1}}});
const restore:Array<()=>void>=[];afterEach(()=>{while(restore.length)restore.pop()!();resumeHistoryPersistence();});
test('repository prepares once and publishes one complete delta, without ordinary file writes',async()=>{
 const storage=fresh(),repo=new ProjectRepository(storage),publish=spyOn(storage,'publishManagedSnapshot'),ordinary=spyOn(storage,'writeTextAtomic');await repo.save(document());expect(publish).toHaveBeenCalledTimes(1);expect(ordinary).not.toHaveBeenCalled();const changes=publish.mock.calls[0][1];for(const path of ['project.json','screens/page.html','screens/page.css','documents/requirements.md','base.css','DESIGN.md'])expect(changes.some(row=>row.path===path)).toBe(true);expect((await repo.load())?.projectDocuments?.requirements.content).toBe('完整需求');
});
test('an independent author cannot overwrite a newer full project, even after an audit read',async()=>{
 const storage=fresh(),seed=new ProjectRepository(storage);await seed.save(document());const a=new ProjectRepository(storage),b=new ProjectRepository(storage),first=(await a.load())!,second=(await b.load())!;
 const sessionA=createProjectAuthoringSession(storage,first),sessionB=createProjectAuthoringSession(storage,second);second.name='另一窗口';second.screens.page.htmlContent='<main>另一窗口原文</main>';await new ProjectRepository(storage,sessionB).save(second);const winner=await storage.readManagedSnapshot();
 await a.load();first.name='旧窗口';await expect(new ProjectRepository(storage,sessionA).save(first)).rejects.toThrow('其它实例');expect(await storage.readManagedSnapshot()).toEqual(winner);await expect(new ProjectRepository(storage,sessionA).save(first)).rejects.toThrow('其它实例');expect(await storage.readManagedSnapshot()).toEqual(winner);
});
test('one author spans repository instances and queued snapshots; an unrelated creation never inherits that authority',async()=>{
 const storage=fresh(),first=document(),second=structuredClone(first),repo=new ProjectRepository(storage);second.name='最后快照';const a=repo.save(first);first.name='调用之后的修改';const b=new ProjectRepository(storage,repo.getAuthoringSession()).save(second);await Promise.all([a,b]);expect((await repo.load())?.name).toBe('最后快照');await expect(new ProjectRepository(storage).save(structuredClone(second))).rejects.toThrow('目标已有工程');
});
test('publish or preparation failure preserves all old files and does not grant a new baseline',async()=>{
 const storage=fresh(),repo=new ProjectRepository(storage),doc=document();await repo.save(doc);const before=await storage.readManagedSnapshot(),publish=spyOn(storage,'publishManagedSnapshot').mockRejectedValueOnce(Error('synthetic disk full'));doc.name='暂未保存';doc.projectDocuments!.requirements.content='新需求';await expect(repo.save(doc)).rejects.toThrow('disk full');expect(await storage.readManagedSnapshot()).toEqual(before);await repo.save(doc);expect((await repo.load())?.name).toBe('暂未保存');publish.mockRestore();
 const stable=await storage.readManagedSnapshot();doc.projectDocuments!.requirements.id='../outside';await expect(repo.save(doc)).rejects.toThrow();expect(await storage.readManagedSnapshot()).toEqual(stable);
});
test('clearing scoped CSS removes its file atomically instead of restoring stale CSS on reopen',async()=>{
 const storage=fresh(),repo=new ProjectRepository(storage),doc=document();await repo.save(doc);delete doc.screens.page.scopedCss;await repo.save(doc);expect(await storage.readText('screens/page.css')).toBeNull();expect((await repo.load())?.screens.page.scopedCss).toBeUndefined();
});
test('a load uses one complete snapshot rather than mixing live individual reads',async()=>{
 const storage=fresh(),repo=new ProjectRepository(storage);await repo.save(document());const direct=spyOn(storage,'readText').mockRejectedValue(Error('must not mix live reads'));expect((await repo.load())?.screens.page.htmlContent).toContain('原文');expect(direct).not.toHaveBeenCalled();direct.mockRestore();
});
async function workspace(){
 const prior=useProjectStore.getState(),history=useHistoryStore.getState(),oldAct=(globalThis as any).IS_REACT_ACT_ENVIRONMENT;
 restore.push(()=>{useProjectStore.setState(prior,true);useHistoryStore.setState(history,true);(globalThis as any).IS_REACT_ACT_ENVIRONMENT=oldAct;});(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;suspendHistoryPersistence();const doc=document(),storage=createProjectStorage(doc.id) as LocalStorageStorage,repo=new ProjectRepository(storage);await repo.save(doc);const loaded=(await repo.load())!;expect(useProjectStore.getState().loadProjectDocument(loaded,'/synthetic/'+doc.id)).toBe(true);useHistoryStore.getState().clear();return {storage,repo,loaded,folder:'/synthetic/'+doc.id};
}
test('the real store retains unsaved edits, exposes the save issue, and never publishes stale registry metadata',async()=>{
 const f=await workspace(),external=(await f.repo.load())!,writer=new ProjectRepository(f.storage);external.name='已保存的另一窗口';await writer.save(external);upsertMeta({id:external.id,name:external.name,deviceProfile:'pc',frameWidth:1440,createdAt:1,updatedAt:1,screenCount:1,folderPath:f.folder});const actual=await f.storage.readManagedSnapshot();
 useProjectStore.getState().setName('窗口中的未保存修改');await expect(useProjectStore.getState().saveProjectChecked()).rejects.toThrow('其它实例');expect(useProjectStore.getState().name).toBe('窗口中的未保存修改');expect(useProjectStore.getState().projectSaveStatus).toBe('failed');expect(await f.storage.readManagedSnapshot()).toEqual(actual);expect(listProjects().find(item=>item.id===external.id)?.name).toBe(external.name);
 const host=globalThis.document.createElement('div');globalThis.document.body.append(host);const root=createRoot(host);try{await act(async()=>root.render(<Header onOpenExport={()=>{}} onOpenSettings={()=>{}}/>));expect(host.textContent).toContain('保存未确认');act(()=>{host.querySelector('details')!.open=true;});expect(host.querySelector('[role="alert"]')?.textContent).toContain('当前设计仍保留在窗口');}finally{act(()=>root.unmount());host.remove();}
});
test('missing bodies remain readable but cannot be saved as a smaller recovered project',async()=>{
 const f=await workspace(),root=await f.storage.readText('project.json');await f.storage.remove('screens/page.html');const partial=(await f.repo.load())!;expect(partial.screens).toEqual({});expect(useProjectStore.getState().loadProjectDocument(partial,f.folder)).toBe(true);expect(useProjectStore.getState().projectSaveStatus).toBe('readonly');useProjectStore.getState().setName('只在窗口');await expect(useProjectStore.getState().saveProjectChecked()).rejects.toThrow('缺失');expect(await f.storage.readText('project.json')).toBe(root);
});
test('store saves preserve creation, explicit order and unknown legacy root metadata',async()=>{
 const f=await workspace(),original=JSON.parse((await f.storage.readText('project.json'))!);original.createdAt=1;original.screenOrder=['page'];original.vendorExtension={source:'legacy',version:3};await f.storage.writeTextAtomic('project.json',JSON.stringify(original));const loaded=(await f.repo.load())!;expect(useProjectStore.getState().loadProjectDocument(loaded,f.folder)).toBe(true);useProjectStore.getState().setName('新的工程名');await useProjectStore.getState().saveProjectChecked();const saved=JSON.parse((await f.storage.readText('project.json'))!);expect(saved.createdAt).toBe(1);expect(saved.screenOrder).toEqual(['page']);expect(saved.vendorExtension).toEqual(original.vendorExtension);
});
for(const kind of ['future-version','broken-order'])test(`${kind} remains visible without being rewritten as current schema`,async()=>{
 const f=await workspace(),original=JSON.parse((await f.storage.readText('project.json'))!);if(kind==='future-version')original.schemaVersion=999;else original.screenOrder='not-an-array';const raw=JSON.stringify(original);await f.storage.writeTextAtomic('project.json',raw);const loaded=(await f.repo.load())!;expect(useProjectStore.getState().loadProjectDocument(loaded,f.folder)).toBe(true);expect(useProjectStore.getState().screenOrder).toEqual(['page']);expect(useProjectStore.getState().projectSaveStatus).toBe('readonly');await expect(useProjectStore.getState().saveProjectChecked()).rejects.toThrow(kind==='future-version'?'版本':'排序');expect(await f.storage.readText('project.json')).toBe(raw);
});
test('author handles cannot be serialized, reused for another folder, or silently installed from an untagged document',async()=>{
 const f=await workspace(),session=useProjectStore.getState().projectAuthoringSession!;await useProjectStore.getState().saveProjectChecked();const raw=await f.storage.readText('project.json');expect(raw).not.toContain('projectAuthoringSession');expect(raw).not.toContain('projectSaveStatus');await expect(new ProjectRepository(f.storage,JSON.parse(JSON.stringify(session))).save(f.loaded)).rejects.toThrow('会话无效');await expect(new ProjectRepository(fresh(),session).save(f.loaded)).rejects.toThrow('目录已变化');
 const before=useProjectStore.getState();expect(useProjectStore.getState().loadProjectDocument(structuredClone(f.loaded),f.folder)).toBe(false);expect(useProjectStore.getState()).toBe(before);
});
test('initial folder save and later autosaves share the creation handle without duplicate model work',async()=>{
 const prior=useProjectStore.getState(),history=useHistoryStore.getState();restore.push(()=>{useProjectStore.setState(prior,true);useHistoryStore.setState(history,true);});suspendHistoryPersistence();const id=useProjectStore.getState().initNewProject({name:'首次工程',deviceProfile:'pc',folderPath:'/synthetic/new-'+crypto.randomUUID(),createSpecimen:false});useProjectStore.getState().addScreen({name:'新页',htmlContent:'<main>完整新页</main>'},'new');await waitForProjectSave(id,useProjectStore.getState().folderPath);expect(useProjectStore.getState().projectSaveStatus).toBe('saved');expect((await new ProjectRepository(createProjectStorage(id)).load())?.screens.new.htmlContent).toBe(useProjectStore.getState().screens.new.htmlContent);
});
