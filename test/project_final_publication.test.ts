import {afterEach,beforeEach,expect,spyOn,test} from 'bun:test';
import {useProjectStore,waitForProjectSave} from '../src/stores/useProjectStore';
import {useHistoryStore} from '../src/stores/useHistoryStore';
import {useWorkspaceStore} from '../src/stores/useWorkspaceStore';
import {getProjectPublication,installProjectPublication} from '../src/services/storage/projectPublication';
import {LocalStorageStorage,createProjectStorage} from '../src/services/storage/projectStorage';
import {ProjectRepository} from '../src/services/storage/projectRepository';
import {DeliveryRepository,type DeliveryMode} from '../src/services/storage/deliveryRepository';
import {RestyleDeliveryRepository} from '../src/services/storage/restyleDeliveryRepository';
import {suspendHistoryPersistence,resumeHistoryPersistence} from '../src/services/storage/historyPersistence';
import {PageRenderCheck} from '../src/services/ai/pageRenderCheck';
import {acceptRestyleResult} from '../src/services/ai/restyleService';
import {restyleContextKey} from '../src/services/ai/restyleBatch';
import {readPublicationCommits,matchesPublicationCommit} from '../src/services/storage/projectPublicationRecord';
import {neutralModernTheme} from '../src/utils/themePresets';
import {contentFingerprint} from '../src/services/ai/designWorkflow';
import {resourceRenderReport} from './helpers/renderResourceProof';

const original='<main data-nid="root0001" class="p-4"><button data-nid="action01" class="btn btn-primary">提交资料</button></main>';
const candidate=original.replace('p-4','p-6');
const clean={status:'complete' as const,findings:[],inspected:2};
const historySnapshot=()=>{const {past,future,checkpoints}=useHistoryStore.getState();return structuredClone({past,future,checkpoints});};
let prior:ReturnType<typeof useProjectStore.getState>,priorHistory:ReturnType<typeof useHistoryStore.getState>;
const restores:Array<()=>void>=[],releases:Array<()=>void>=[],operations:Array<Promise<unknown>>=[];
beforeEach(async()=>{
 prior=useProjectStore.getState();priorHistory=useHistoryStore.getState();suspendHistoryPersistence();
 useProjectStore.getState().initNewProject({name:'最终提交故障夹具',deviceProfile:'mobile',designSystem:neutralModernTheme,createSpecimen:false});
 useProjectStore.getState().addScreen({name:'资料页',htmlContent:original,position:{x:0,y:0}},'page');
 await useProjectStore.getState().saveProjectChecked();
});
afterEach(async()=>{
 while(releases.length)releases.pop()!();await Promise.allSettled(operations.splice(0));while(restores.length)restores.pop()!();
 expect(getProjectPublication()).toBeNull();useProjectStore.setState(prior,true);useHistoryStore.setState(priorHistory,true);resumeHistoryPersistence();
});
function stage(){const store=useProjectStore.getState();store.stageScreenChange('page',candidate,'候选','增大页面留白');store.setStagedRenderQuality(store.getStagedRenderContextKey(),clean);}
async function wait<T>(promise:Promise<T>):Promise<T>{let timer:ReturnType<typeof setTimeout>;try{return await Promise.race([promise,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('Expected publication phase did not start: '+useProjectStore.getState().stagedAdoptionError)),3000);})]);}finally{clearTimeout(timer!);}}
function holdPublication(fault:'none'|'before'|'after'|'unknown'='none'){
 const scope=createProjectStorage(useProjectStore.getState().id).scopeKey,publish=LocalStorageStorage.prototype.publishManagedSnapshot,read=LocalStorageStorage.prototype.readManagedSnapshot;
 let release!:()=>void,entered!:()=>void,writes=0,unavailable=false;const gate=new Promise<void>(resolve=>release=resolve),entry=new Promise<void>(resolve=>entered=resolve);releases.push(()=>release());
 const reads=spyOn(LocalStorageStorage.prototype,'readManagedSnapshot').mockImplementation(async function(){if(this.scopeKey===scope&&unavailable)throw Error('synthetic confirmation unavailable');return read.call(this);});
 const writer=spyOn(LocalStorageStorage.prototype,'publishManagedSnapshot').mockImplementation(async function(expected,changes,resources){
  if(this.scopeKey!==scope)return publish.call(this,expected,changes,resources);
  writes++;entered();await gate;if(fault==='before')throw Error('synthetic publication disk full');
  const identity=await publish.call(this,expected,changes,resources);if(fault==='after'||fault==='unknown'){unavailable=fault==='unknown';throw Error('synthetic acknowledgement lost');}return identity;
 });
 restores.push(()=>writer.mockRestore(),()=>reads.mockRestore());return {entered:entry,release,writes:()=>writes,allowReads:()=>{unavailable=false;},read,publish};
}

for(const mode of ['replace','keep-both','force-replace','confirm-structure-replace','confirm-structure-keep-both'] as DeliveryMode[])test(`${mode} keeps live page and History unchanged until one complete durable publication`,async()=>{
 const store=useProjectStore.getState();useProjectStore.setState({overrides:{'page:action01':{nid:'action01',declarations:{'font-weight':'600'}}}});await store.saveProjectChecked();stage();
 const before=historySnapshot(),ids=[...useProjectStore.getState().screenOrder],held=holdPublication(),pending=store.commitStagedDelivery(mode,mode.startsWith('confirm-')?store.getStagedRenderContextKey():undefined);operations.push(pending);
 await wait(held.entered);expect(getProjectPublication()).not.toBeNull();expect(useProjectStore.getState().screens.page.htmlContent).toBe(original);expect(useProjectStore.getState().screenOrder).toEqual(ids);expect(historySnapshot()).toEqual(before);
 expect(()=>installProjectPublication(getProjectPublication()!,()=>store.setName('借用状态提示的假句柄'))).toThrow('句柄');
 expect(()=>useProjectStore.getState().setName('迟到编辑')).toThrow('正在保存');expect(()=>useHistoryStore.getState().undo()).toThrow('正在保存');expect(()=>useHistoryStore.getState().commit('迟到操作',[],[])).toThrow('正在保存');expect(()=>useWorkspaceStore.getState().backToManager()).toThrow('正在保存');expect(()=>useProjectStore.getState().discardStagedChange()).toThrow('正在保存');
 useProjectStore.getState().updateScreen('page',{measuredHeight:2000});expect(useProjectStore.getState().screens.page.measuredHeight).not.toBe(2000);store.saveProject();await expect(store.saveProjectChecked()).rejects.toThrow('正在保存');
 held.release();expect(await pending).toBe(true);expect(held.writes()).toBe(1);expect(getProjectPublication()).toBeNull();expect(useProjectStore.getState().stagedScreen).toBeNull();
 const both=mode.endsWith('keep-both')||mode==='keep-both',resultId=both?useProjectStore.getState().screenOrder.at(-1)!:'page';
 expect(useProjectStore.getState().screens[resultId].htmlContent).toBe(candidate);expect(useProjectStore.getState().screenOrder).toHaveLength(ids.length+(both?1:0));expect(historySnapshot().past).toHaveLength(before.past.length+1);expect(historySnapshot().checkpoints).toHaveLength(before.checkpoints.length+(both?0:1));
 if(both){expect(useProjectStore.getState().screens.page.htmlContent).toBe(original);expect(useProjectStore.getState().overrides[`${resultId}:action01`]).toEqual(useProjectStore.getState().overrides['page:action01']);}
 const storage=createProjectStorage(store.id),saved=(await new ProjectRepository(storage).load())!,commits=await readPublicationCommits(storage,store.id),delivery=(await new DeliveryRepository(storage,store.id).listForScreen(resultId)).records[0];
 expect(saved.screens[resultId].htmlContent).toBe(candidate);expect(JSON.parse((await storage.readText('history.json'))!).past).toEqual(historySnapshot().past);expect(await matchesPublicationCommit(commits[0],{id:delivery.id,kind:'candidate',screens:[delivery.after]})).toBe(true);
 useHistoryStore.getState().undo();await waitForProjectSave(store.id);expect(useProjectStore.getState().screens.page.htmlContent).toBe(original);if(both)expect(useProjectStore.getState().screens[resultId]).toBeUndefined();
 expect((await new DeliveryRepository(storage,store.id).get(resultId,delivery.id))!.status).toBe('applied');useHistoryStore.getState().redo();await waitForProjectSave(store.id);expect(useProjectStore.getState().screens[resultId].htmlContent).toBe(candidate);
});
for(const mode of ['replace','keep-both','force-replace','confirm-structure-replace','confirm-structure-keep-both'] as DeliveryMode[])for(const change of ['replace','delete'] as const)test(`${mode} rejects resource ${change} at final storage handoff with no page or History changes`,async()=>{
 const store=useProjectStore.getState(),storage=createProjectStorage(store.id),path='assets/images/final-handoff.png';await storage.writeBinary(path,'AAEC/w==');store.addAsset({id:'handoff-photo',name:'资源',type:'image',mimeType:'image/png',source:'upload',relPath:path,refCount:1});
 const doc=new DOMParser().parseFromString(original,'text/html'),image=doc.createElement('img');image.setAttribute('src',path);image.setAttribute('alt','资源');image.setAttribute('data-nid','picture1');doc.querySelector('main')!.append(image);const baseline=doc.body.innerHTML;store.updateScreenHtml('page',baseline);await store.saveProjectChecked();
 doc.querySelector('main')!.classList.replace('p-4','p-6');const next=doc.body.innerHTML;store.stageScreenChange('page',next,'资源候选','增大页面留白');const {stageResourceReport}=await import('./helpers/renderResourceProof');await stageResourceReport();
 const deadline=Date.now()+3000;while(useProjectStore.getState().stagedAssetFiles?.status!=='passed'&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,1));expect(useProjectStore.getState().stagedAssetFiles?.status).toBe('passed');
 const history=historySnapshot(),before=await storage.readManagedSnapshot!(),held=holdPublication(),pending=store.commitStagedDelivery(mode,mode.startsWith('confirm-')?store.getStagedRenderContextKey():undefined);operations.push(pending);await wait(held.entered);
 if(change==='replace')await storage.writeBinary(path,'AAED/w==');else await storage.remove(path);held.release();expect(await pending).toBe(false);
 expect(await storage.readManagedSnapshot!()).toEqual(before);expect(historySnapshot()).toEqual(history);expect(useProjectStore.getState().screens.page.htmlContent).toBe(baseline);expect(useProjectStore.getState().stagedAdoptionError).toContain(change==='replace'?'已变化':'不存在');expect(await readPublicationCommits(storage,store.id)).toEqual([]);
 const list=await storage.listDir('deliveries');expect(list.length).toBeGreaterThan(0);
});
for(const change of ['replace','delete'] as const)test(`restyle rejects resource ${change} at storage handoff without installing its page or History`,async()=>{
 const store=useProjectStore.getState(),storage=createProjectStorage(store.id),path='assets/images/restyle-handoff.png';await storage.writeBinary(path,'AAEC/w==');store.addAsset({id:'restyle-photo',name:'资源',type:'image',mimeType:'image/png',source:'upload',relPath:path,refCount:1});
 const doc=new DOMParser().parseFromString(original,'text/html'),image=doc.createElement('img');image.setAttribute('src',path);image.setAttribute('alt','资源');image.setAttribute('data-nid','picture1');doc.querySelector('main')!.append(image);const baseline=doc.body.innerHTML;store.updateScreenHtml('page',baseline);await store.saveProjectChecked();doc.querySelector('main')!.classList.replace('p-4','p-6');const next=doc.body.innerHTML;
 const renderer=spyOn(PageRenderCheck,'inspect').mockImplementation((request,target)=>resourceRenderReport(request,target,clean));restores.push(()=>renderer.mockRestore());const before=await storage.readManagedSnapshot!(),history=historySnapshot(),held=holdPublication();
 const pending=store.applyRestyleOutcome(acceptRestyleResult({kind:'screen',id:'page',name:'资料页',html:baseline},next));operations.push(pending);await wait(held.entered);if(change==='replace')await storage.writeBinary(path,'AAED/w==');else await storage.remove(path);held.release();const result=await pending;
 expect(result.applied).toBe(false);expect(result.message).toContain(change==='replace'?'已变化':'不存在');expect(await storage.readManagedSnapshot!()).toEqual(before);expect(historySnapshot()).toEqual(history);expect(useProjectStore.getState().screens.page.htmlContent).toBe(baseline);expect(await readPublicationCommits(storage,store.id)).toEqual([]);
});
test('definite publication failure keeps page, checkpoints and stacks exact and leaves no applied commit fact',async()=>{
 stage();const store=useProjectStore.getState(),before=historySnapshot(),storage=createProjectStorage(store.id),disk=await storage.readManagedSnapshot!(),held=holdPublication('before'),pending=store.adoptStagedChange();operations.push(pending);await wait(held.entered);held.release();expect(await pending).toBe(false);
 expect(useProjectStore.getState().screens.page.htmlContent).toBe(original);expect(historySnapshot()).toEqual(before);expect(await storage.readManagedSnapshot!()).toEqual(disk);expect(await readPublicationCommits(storage,store.id)).toEqual([]);expect((await new DeliveryRepository(storage,store.id).listForScreen('page')).records[0].status).toBe('aborted');expect(useProjectStore.getState().stagedAdoptionError).toContain('disk full');
});
test('lost acknowledgement with exact committed readback installs once without replaying publication',async()=>{
 stage();const store=useProjectStore.getState(),before=historySnapshot(),held=holdPublication('after'),pending=store.adoptStagedChange();operations.push(pending);await wait(held.entered);held.release();expect(await pending).toBe(true);expect(held.writes()).toBe(1);expect(historySnapshot().past).toHaveLength(before.past.length+1);expect(useProjectStore.getState().screens.page.htmlContent).toBe(candidate);
});
test('unconfirmed committed write retains live baseline and frozen author; read-only archive reconciliation never rewrites prepared history',async()=>{
 stage();const store=useProjectStore.getState(),before=historySnapshot(),held=holdPublication('unknown'),pending=store.adoptStagedChange();operations.push(pending);await wait(held.entered);held.release();expect(await pending).toBe(false);held.allowReads();
 expect(useProjectStore.getState().screens.page.htmlContent).toBe(original);expect(historySnapshot()).toEqual(before);expect(useProjectStore.getState().projectSaveStatus).toBe('readonly');expect(useProjectStore.getState().stagedAdoptionError).toContain('尚未确认');expect(held.writes()).toBe(1);
 const storage=createProjectStorage(store.id),disk=await held.read.call(storage),delivery=(await new DeliveryRepository(storage,store.id).listForScreen('page')).records[0];expect(disk.files['screens/page.html']).toBe(candidate);expect(JSON.parse(disk.files['history.json']).past).toHaveLength(before.past.length+1);expect(delivery.status).toBe('applied');expect(delivery.reason).toContain('原子提交已确认');
 const raw=await storage.readText(`deliveries/screen-${contentFingerprint('page')}/${delivery.id}.json`);expect(JSON.parse(raw!).status).toBe('prepared');expect(await storage.readManagedSnapshot!()).toEqual(disk);
 expect(await store.loadProjectById(store.id)).toBe(true);expect(useProjectStore.getState().screens.page.htmlContent).toBe(candidate);expect(historySnapshot().past).toHaveLength(before.past.length+1);expect(await store.adoptStagedChange()).toBe(false);
});
test('another writer winning during final IO cannot be overwritten or produce a local page/History commit',async()=>{
 stage();const store=useProjectStore.getState(),before=historySnapshot(),held=holdPublication(),pending=store.adoptStagedChange();operations.push(pending);await wait(held.entered);
 const storage=createProjectStorage(store.id),disk=await held.read.call(storage),root=JSON.parse(disk.files['project.json']);root.name='另一实例赢家';await held.publish.call(storage,disk.identity,[{path:'project.json',contents:JSON.stringify(root)}]);const winner=await held.read.call(storage);
 held.release();expect(await pending).toBe(false);expect(await held.read.call(storage)).toEqual(winner);expect(historySnapshot()).toEqual(before);expect(useProjectStore.getState().screens.page.htmlContent).toBe(original);expect(useProjectStore.getState().projectSaveStatus).toBe('readonly');expect(await readPublicationCommits(storage,store.id)).toEqual([]);
});
test('restyle from an identical project reopened during archive preparation cannot acquire the new author session',async()=>{
 const store=useProjectStore.getState(),context=restyleContextKey(store),author=store.projectAuthoringSession,before=historySnapshot();let enter!:()=>void,release!:()=>void;
 const entered=new Promise<void>(resolve=>enter=resolve),gate=new Promise<void>(resolve=>release=resolve),originalPrepare=RestyleDeliveryRepository.prototype.prepare;
 const inspect=spyOn(PageRenderCheck,'inspect').mockImplementation((request,storage)=>resourceRenderReport(request,storage,clean)),prepare=spyOn(RestyleDeliveryRepository.prototype,'prepare').mockImplementation(async function(record){await originalPrepare.call(this,record);enter();await gate;});
 restores.push(()=>inspect.mockRestore(),()=>prepare.mockRestore());releases.push(()=>release());
 const outcome=acceptRestyleResult({kind:'screen',id:'page',name:'资料页',html:original},candidate),pending=store.applyRestyleOutcome(outcome);operations.push(pending);await wait(entered);
 expect(await store.loadProjectById(store.id)).toBe(true);expect(restyleContextKey(useProjectStore.getState())).toBe(context);expect(useProjectStore.getState().projectAuthoringSession).not.toBe(author);release();expect((await pending).applied).toBe(false);expect(historySnapshot()).toEqual(before);expect(useProjectStore.getState().screens.page.htmlContent).toBe(original);expect(await readPublicationCommits(createProjectStorage(store.id),store.id)).toEqual([]);
});
test('a view installation exception after durable candidate commit reports saved, never aborted or unapplied',async()=>{
 stage();const store=useProjectStore.getState(),before=historySnapshot(),restore=spyOn(useHistoryStore.getState(),'restore').mockImplementationOnce(()=>{throw Error('synthetic History view failure');});restores.push(()=>restore.mockRestore());
 expect(await store.adoptStagedChange()).toBe(true);expect(getProjectPublication()).toBeNull();expect(useProjectStore.getState().projectSaveStatus).toBe('readonly');expect(useProjectStore.getState().projectSaveError).toContain('设计已保存');expect(historySnapshot()).toEqual(before);expect(useProjectStore.getState().screens.page.htmlContent).toBe(original);
 const storage=createProjectStorage(store.id),disk=await storage.readManagedSnapshot!(),delivery=(await new DeliveryRepository(storage,store.id).listForScreen('page')).records[0];expect(disk.files['screens/page.html']).toBe(candidate);expect(JSON.parse(disk.files['history.json']).past).toHaveLength(before.past.length+1);expect(delivery.status).toBe('applied');expect(await store.adoptStagedChange()).toBe(false);
 restore.mockRestore();expect(await store.loadProjectById(store.id)).toBe(true);expect(useProjectStore.getState().screens.page.htmlContent).toBe(candidate);expect(historySnapshot().past).toHaveLength(before.past.length+1);
});
