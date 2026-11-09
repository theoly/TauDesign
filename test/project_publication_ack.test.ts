import {expect,spyOn,test} from 'bun:test';
import {ProjectRepository,ProjectPublicationUnconfirmedError,type ProjectDocument} from '../src/services/storage/projectRepository';
import {LocalStorageStorage,createProjectStorage} from '../src/services/storage/projectStorage';
import {createProjectAuthoringSession,projectAuthoringNotice} from '../src/services/storage/projectAuthoring';
import {neutralModernTheme} from '../src/utils/themePresets';
import {useProjectStore,waitForProjectSave} from '../src/stores/useProjectStore';
import {useHistoryStore} from '../src/stores/useHistoryStore';
import {suspendHistoryPersistence,resumeHistoryPersistence} from '../src/services/storage/historyPersistence';

async function fixture(){
 const storage=new LocalStorageStorage('publication-ack-'+crypto.randomUUID());
 const doc:ProjectDocument={id:'synthetic',name:'原版本',settings:{deviceProfile:'pc',frameWidth:1440,colorMode:'light'},designSystem:structuredClone(neutralModernTheme) as any,screenOrder:['page'],screens:{page:{id:'page',name:'正文',htmlContent:'<main>原完整正文</main>',position:{x:0,y:0}}}};
 await new ProjectRepository(storage).save(doc);const loaded=(await new ProjectRepository(storage).load())!,author=createProjectAuthoringSession(storage,loaded),repo=new ProjectRepository(storage,author),before=await storage.readManagedSnapshot();
 loaded.screens.page.htmlContent='<main>新完整正文</main>';return {storage,doc:loaded,author,repo,before};
}
const history={past:[{id:'paired',label:'与新正文同次提交',timestamp:1,patches:[],inversePatches:[]}],future:[],checkpoints:[]};

test('a lost acknowledgement after actual publication verifies the entire result, returns a receipt and never replays the write',async()=>{
 const f=await fixture(),publish=f.storage.publishManagedSnapshot.bind(f.storage),spy=spyOn(f.storage,'publishManagedSnapshot').mockImplementation(async(expected,changes,resources)=>{await publish(expected,changes,resources);throw Error('IPC response lost');});
 try{
  const receipt=await f.repo.save(f.doc,{history});expect(receipt.confirmation).toBe('verified-after-ack-loss');expect(receipt.beforeIdentity).toBe(f.before.identity);expect(receipt.identity).toBe((await f.storage.readManagedSnapshot()).identity);expect(spy).toHaveBeenCalledTimes(1);expect(Object.isFrozen(receipt)).toBe(true);
  const root=(await f.repo.load())!;expect(root.screens.page.htmlContent).toBe(f.doc.screens.page.htmlContent);expect(await f.storage.readText('history.json')).toContain('与新正文同次提交');expect(projectAuthoringNotice(f.author)).toBeUndefined();
  spy.mockRestore();root.name='同一已确认作者继续';await f.repo.save(root);expect((await f.repo.load())!.name).toBe('同一已确认作者继续');
 }finally{spy.mockRestore();}
});
test('failure before a commit and exact original readback preserves the original error, page, History and author baseline',async()=>{
 const f=await fixture(),spy=spyOn(f.storage,'publishManagedSnapshot').mockRejectedValueOnce(Error('synthetic disk full'));
 try{await expect(f.repo.save(f.doc,{history})).rejects.toThrow('disk full');expect(await f.storage.readManagedSnapshot()).toEqual(f.before);expect(projectAuthoringNotice(f.author)).toBeUndefined();expect(spy).toHaveBeenCalledTimes(1);await f.repo.save(f.doc,{history});expect((await f.repo.load())!.screens.page.htmlContent).toContain('新完整正文');}finally{spy.mockRestore();}
});
for(const fault of ['read-failure','third-version','forged-read-identity'] as const)test(`ambiguous ${fault} freezes only this author, keeps files and requires explicit reopen`,async()=>{
 const f=await fixture(),publish=f.storage.publishManagedSnapshot.bind(f.storage),read=f.storage.readManagedSnapshot.bind(f.storage);let broken=false;
 const reads=spyOn(f.storage,'readManagedSnapshot').mockImplementation(async()=>{const snapshot=await read();if(!broken)return snapshot;if(fault==='read-failure')throw Error('IPC read unavailable');if(fault==='forged-read-identity')return {...snapshot,identity:'0'.repeat(64)};return snapshot;});
 const writes=spyOn(f.storage,'publishManagedSnapshot').mockImplementation(async(expected,changes,resources)=>{await publish(expected,changes,resources);if(fault==='third-version')await f.storage.writeTextAtomic('screens/page.html','<main>另一个实际版本</main>');broken=true;throw Error('IPC acknowledgement unavailable');});
 try{
  let error:unknown;try{await f.repo.save(f.doc,{history});}catch(cause){error=cause;}
  expect(error).toBeInstanceOf(ProjectPublicationUnconfirmedError);expect((error as Error).message).toContain('尚未确认');expect((error as Error).message).not.toContain('未应用');expect(projectAuthoringNotice(f.author)).toBe((error as Error).message);expect(writes).toHaveBeenCalledTimes(1);
  const actual=await read();expect(actual.files['screens/page.html']).toBe(fault==='third-version'?'<main>另一个实际版本</main>':f.doc.screens.page.htmlContent);expect(actual.files['history.json']).toContain('与新正文同次提交');
  broken=false;await f.repo.load();await expect(f.repo.save(f.doc)).rejects.toThrow('尚未确认');expect(writes).toHaveBeenCalledTimes(1);expect(await read()).toEqual(actual);
  reads.mockRestore();writes.mockRestore();const opened=(await new ProjectRepository(f.storage).load())!,newAuthor=createProjectAuthoringSession(f.storage,opened);opened.name='显式重开核对后';await new ProjectRepository(f.storage,newAuthor).save(opened);expect((await new ProjectRepository(f.storage).load())!.name).toBe('显式重开核对后');
 }finally{reads.mockRestore();writes.mockRestore();}
});
test('wrong response identity cannot grant a baseline unless all stored files independently match the expected result',async()=>{
 const f=await fixture(),publish=f.storage.publishManagedSnapshot.bind(f.storage),spy=spyOn(f.storage,'publishManagedSnapshot').mockImplementation(async(expected,changes,resources)=>{await publish(expected,changes,resources);return '0'.repeat(64);});
 try{const receipt=await f.repo.save(f.doc,{history});expect(receipt.confirmation).toBe('verified-after-ack-loss');expect(receipt.identity).toBe((await f.storage.readManagedSnapshot()).identity);expect(receipt.identity).not.toBe('0'.repeat(64));expect(spy).toHaveBeenCalledTimes(1);}finally{spy.mockRestore();}
});
test('ordinary store exposes an unconfirmed write as readonly, retains local edits, and resumes only after explicit source reopen',async()=>{
 const prior=useProjectStore.getState(),historyState=useHistoryStore.getState();suspendHistoryPersistence();let readSpy:ReturnType<typeof spyOn>|undefined,writeSpy:ReturnType<typeof spyOn>|undefined;
 try{
  const id=useProjectStore.getState().initNewProject({name:'确认故障',deviceProfile:'pc',createSpecimen:false});await waitForProjectSave(id);const storage=createProjectStorage(id),scope=storage.scopeKey;
  const read=LocalStorageStorage.prototype.readManagedSnapshot,publish=LocalStorageStorage.prototype.publishManagedSnapshot;let unavailable=false,writes=0;
  readSpy=spyOn(LocalStorageStorage.prototype,'readManagedSnapshot').mockImplementation(async function(){if(this.scopeKey===scope&&unavailable)throw Error('synthetic read connection lost');return read.call(this);});
  writeSpy=spyOn(LocalStorageStorage.prototype,'publishManagedSnapshot').mockImplementation(async function(expected,changes,resources){const result=await publish.call(this,expected,changes,resources);if(this.scopeKey===scope){writes++;unavailable=true;throw Error('synthetic acknowledgement lost');}return result;});
  useProjectStore.getState().setName('当前窗口修改仍保留');await expect(waitForProjectSave(id)).rejects.toBeInstanceOf(ProjectPublicationUnconfirmedError);
  expect(useProjectStore.getState().name).toBe('当前窗口修改仍保留');expect(useProjectStore.getState().projectSaveStatus).toBe('readonly');expect(useProjectStore.getState().projectSaveError).toContain('尚未确认');expect(JSON.parse((await read.call(storage)).files['project.json']).name).toBe('当前窗口修改仍保留');
  unavailable=false;await new ProjectRepository(storage).load();await expect(useProjectStore.getState().saveProjectChecked()).rejects.toThrow('尚未确认');expect(writes).toBe(1);
  readSpy.mockRestore();writeSpy.mockRestore();expect(await useProjectStore.getState().loadProjectById(id)).toBe(true);expect(useProjectStore.getState().projectSaveStatus).not.toBe('readonly');useProjectStore.getState().setName('核对后继续');await waitForProjectSave(id);expect(useProjectStore.getState().projectSaveStatus).toBe('saved');
 }finally{readSpy?.mockRestore();writeSpy?.mockRestore();useProjectStore.setState(prior,true);useHistoryStore.setState(historyState,true);resumeHistoryPersistence();}
});
