import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {DesignTaskRecords} from '../src/components/chat/DesignTaskRecords';
import {afterEach,beforeEach,expect,test} from 'bun:test';
import {useProjectStore} from '../src/stores/useProjectStore';
import {useHistoryStore} from '../src/stores/useHistoryStore';
import {createProjectStorage} from '../src/services/storage/projectStorage';
import {saveDesignTask,readDesignTask,listDesignTaskIndex,settleDesignTaskPublication,settleDesignTaskDelivery,claimDesignTaskRecovery,removeDesignTask} from '../src/services/storage/designTaskRepository';
import {DeliveryRepository} from '../src/services/storage/deliveryRepository';
import {buildDesignTaskContract} from '../src/services/ai/designWorkflow';
import {pageCreationContext} from '../src/services/ai/pageCreationValidation';
import {saveStagedCandidate,loadStagedCandidate} from '../src/services/storage/candidateRepository';
import {prepareTaskRecovery} from '../src/services/ai/designTaskRecovery';
import {stageResourceReport} from './helpers/renderResourceProof';
const before='<main data-nid="root"><button data-nid="action">提交</button></main>',after='<main data-nid="root"><button data-nid="action">确认提交</button></main>';
let prior:ReturnType<typeof useProjectStore.getState>,history:ReturnType<typeof useHistoryStore.getState>;
beforeEach(()=>{prior=useProjectStore.getState();history=useHistoryStore.getState();useProjectStore.getState().initNewProject({name:'任务交付',deviceProfile:'pc',createSpecimen:false});useProjectStore.getState().addScreen({name:'提交页',htmlContent:before},'page');useHistoryStore.getState().restore(null);});
afterEach(()=>{useProjectStore.getState().discardStagedChange();useProjectStore.setState(prior,true);useHistoryStore.setState(history,true);});
async function setup(){
 const state=useProjectStore.getState(),storage=createProjectStorage(state.id),request='将提交按钮文案改为确认提交',contract=buildDesignTaskContract({intent:'modify_screen',request,target:state.screens.page,deviceProfile:'pc',frameWidth:1440,designSystem:state.designSystem});
 const saved=await saveDesignTask(storage,{version:1,id:contract.taskId,projectId:state.id,createdAt:Date.now(),updatedAt:Date.now(),state:'draft',request,contextFingerprint:pageCreationContext(state),binding:{providerId:'test',model:'m',endpointIdentity:'test'},contract},[{stepId:'page-body',html:after,complete:true}]);
 state.stageScreenChange('page',after,'提交页',request,contract);await stageResourceReport();expect((await readDesignTask(storage,state.id,contract.taskId))?.task.state).toBe('draft');expect(await state.adoptStagedChange()).toBe(true);
 const repository=new DeliveryRepository(storage,state.id),record=(await repository.listForScreen('page')).records[0];expect(record.status).toBe('applied');return {state,storage,saved,repository,record};
}
test('only matching applied delivery completes a saved task; undo retains the historical completion event',async()=>{
 const f=await setup();await expect(f.repository.finish(f.record,'aborted')).rejects.toThrow('提交事实');
 const unadopted={...f.record,id:'delivery-unapplied-'+crypto.randomUUID(),publicationId:undefined,status:'prepared' as const,preview:undefined};await f.repository.prepare(unadopted);await expect(settleDesignTaskDelivery(f.storage,f.state.id,'page',unadopted.id)).rejects.toThrow('已应用');expect((await readDesignTask(f.storage,f.state.id,f.saved.id))?.task.state).toBe('draft');
 await f.repository.finish(f.record,'applied');expect(await settleDesignTaskDelivery(f.storage,f.state.id,'page',f.record.id)).toBe(true);const task=(await readDesignTask(f.storage,f.state.id,f.saved.id))!.task;expect(task.state).toBe('completed');expect(task.delivery).toMatchObject({id:f.record.id,screenId:'page',resultFingerprint:f.record.resultFingerprint});expect(await settleDesignTaskDelivery(f.storage,f.state.id,'page',f.record.id)).toBe(true);
 useHistoryStore.getState().undo();expect(useProjectStore.getState().screens.page.htmlContent).toBe(before);expect((await readDesignTask(f.storage,f.state.id,f.saved.id))?.task.state).toBe('completed');
});
test('a changed body or recovery claim prevents completion; deleted task is not recreated',async()=>{
 const f=await setup();await saveDesignTask(f.storage,f.saved,[{stepId:'page-body',html:'<main>different</main>',complete:true}]);await expect(settleDesignTaskDelivery(f.storage,f.state.id,'page',f.record.id)).rejects.toThrow('不一致');
 const current=await saveDesignTask(f.storage,f.saved,[{stepId:'page-body',html:after,complete:true}]);await expect(claimDesignTaskRecovery(f.storage,current,'design-new-recovery')).rejects.toThrow('已保存交付');
 // A historical claim from before this guard must also prevent bookkeeping revival.
 await f.storage.createTextExclusive!(`tasks/${current.id}/recovery-claim.json`,JSON.stringify({version:1,originTaskId:current.id,newTaskId:'design-new-recovery',createdAt:Date.now()}),await f.storage.taskManifestIdentity!(current.id));await expect(settleDesignTaskDelivery(f.storage,f.state.id,'page',f.record.id)).rejects.toThrow('接替');
 await removeDesignTask(f.storage,f.state.id,f.saved.id);expect(await settleDesignTaskDelivery(f.storage,f.state.id,'page',f.record.id)).toBe(false);expect(await f.storage.exists(`tasks/${f.saved.id}/manifest.json`)).toBe(false);expect(useProjectStore.getState().screens.page.htmlContent).toContain('确认提交');
});
test('completion IO failure preserves the old draft and the already adopted page',async()=>{
 const f=await setup();f.storage.publishTaskManifest=async()=>{throw Error('disk full');};
 await expect(settleDesignTaskDelivery(f.storage,f.state.id,'page',f.record.id)).rejects.toThrow('disk full');expect((await readDesignTask(f.storage,f.state.id,f.saved.id))?.task.state).toBe('draft');expect(useProjectStore.getState().screens.page.htmlContent).toContain('确认提交');
});

test('a committed candidate sidecar is never restored twice; bytes and historical facts survive Undo',async()=>{
 const f=await setup();await saveStagedCandidate(f.state.id,undefined,f.record.candidate);
 const path='candidates/current.json',raw=await f.storage.readText(path);
 expect(await loadStagedCandidate(f.state.id)).toBeNull();expect(await f.storage.readText(path)).toBe(raw);
 useHistoryStore.getState().undo();await useProjectStore.getState().saveProjectChecked();
 expect(await loadStagedCandidate(f.state.id)).toBeNull();expect(await f.storage.readText(path)).toBe(raw);
 // Reused IDs do not conceal an independently changed draft or user request.
 await saveStagedCandidate(f.state.id,undefined,{...f.record.candidate,modificationRequest:'新的独立修改'});
 expect((await loadStagedCandidate(f.state.id))?.modificationRequest).toBe('新的独立修改');
 await saveStagedCandidate(f.state.id,undefined,{...f.record.candidate,newHtml:'<main>不同的完整候选</main>'});
 expect((await loadStagedCandidate(f.state.id))?.newHtml).toBe('<main>不同的完整候选</main>');
});
test('publication reads are strictly read-only; explicit settlement persists history without reviving execution',async()=>{
 const f=await setup(),path=`tasks/${f.saved.id}/manifest.json`,raw=await f.storage.readText(path),beforeHistory=structuredClone(useHistoryStore.getState().past),pages=JSON.stringify(useProjectStore.getState().screens);
 const saved=(await readDesignTask(f.storage,f.state.id,f.saved.id))!;expect(saved.task.state).toBe('draft');expect(saved.publication).toMatchObject({id:f.record.id,kind:'candidate',screenIds:['page']});
 expect((await listDesignTaskIndex(f.storage,f.state.id)).tasks).toHaveLength(0);const index=await listDesignTaskIndex(f.storage,f.state.id,true);expect(index.tasks[0].state).toBe('draft');expect(index.publications[f.saved.id]?.id).toBe(f.record.id);expect(await f.storage.readText(path)).toBe(raw);
 await expect(prepareTaskRecovery(f.storage,f.saved.id,useProjectStore.getState(),{id:'test'} as any,'m')).rejects.toThrow('已保存');
 await expect(settleDesignTaskPublication(f.storage,f.state.id,f.saved.id,()=>false)).rejects.toThrow('已变化');expect(await f.storage.readText(path)).toBe(raw);
 expect(await settleDesignTaskPublication(f.storage,f.state.id,f.saved.id)).toBe(true);const completed=(await readDesignTask(f.storage,f.state.id,f.saved.id))!;
 expect(completed.task.state).toBe('completed');expect(completed.task.budget).toEqual(saved.task.budget);expect(completed.task.recovery).toEqual(saved.task.recovery);expect(completed.task.contract).toEqual(saved.task.contract);
 expect(JSON.stringify(useProjectStore.getState().screens)).toBe(pages);expect(useHistoryStore.getState().past).toEqual(beforeHistory);
});
test('publication status synchronization refuses a changed artifact, failed IO and concurrent cleanup',async()=>{
 const f=await setup(),path=`tasks/${f.saved.id}/manifest.json`,raw=await f.storage.readText(path),publish=f.storage.publishTaskManifest!.bind(f.storage);
 f.storage.publishTaskManifest=async()=>{throw Error('synthetic bookkeeping disk full');};await expect(settleDesignTaskPublication(f.storage,f.state.id,f.saved.id)).rejects.toThrow('disk full');expect(await f.storage.readText(path)).toBe(raw);
 f.storage.publishTaskManifest=async(id,expected,contents)=>{await f.storage.deleteDesignTask!(id,expected);return publish(id,expected,contents);};
 await expect(settleDesignTaskPublication(f.storage,f.state.id,f.saved.id)).rejects.toThrow();expect(await f.storage.exists(path)).toBe(false);expect(useProjectStore.getState().screens.page.htmlContent).toContain('确认提交');
});

test('task UI discloses a persisted delivery and explicitly synchronizes its marker instead of offering recovery',async()=>{
 const f=await setup(),previousAct=(globalThis as any).IS_REACT_ACT_ENVIRONMENT; (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host),path=`tasks/${f.saved.id}/manifest.json`,raw=await f.storage.readText(path),history=structuredClone(useHistoryStore.getState().past);let recovery=0;
 const button=(label:string)=>Array.from(host.querySelectorAll('button')).find(row=>row.textContent?.includes(label));
 const wait=async()=>{const deadline=Date.now()+3000;do{await act(async()=>{await new Promise(resolve=>setTimeout(resolve,1));});}while(host.textContent?.includes('正在读取或保存任务记录…')&&Date.now()<deadline);expect(host.textContent).not.toContain('正在读取或保存任务记录…');};
 try{
  act(()=>{root.render(React.createElement(DesignTaskRecords,{running:false,onClose(){},onRecover:async()=>{recovery++;}}));});await wait();
  expect(host.textContent).toContain('设计已保存 · 待同步记录');expect(await f.storage.readText(path)).toBe(raw);
  act(()=>{button(f.saved.request)!.click();});await wait();expect(button('恢复草稿（新任务）')).toBeUndefined();expect(button('同步已保存的交付状态')).toBeDefined();
  act(()=>{button('同步已保存的交付状态')!.click();});await wait();expect(host.textContent).toContain('历史已完成');expect(host.textContent).toContain('已同步历史交付状态');expect(recovery).toBe(0);expect((await readDesignTask(f.storage,f.state.id,f.saved.id))?.task.state).toBe('completed');expect(useHistoryStore.getState().past).toEqual(history);
 }finally{act(()=>root.unmount());host.remove();(globalThis as any).IS_REACT_ACT_ENVIRONMENT=previousAct;}
});
