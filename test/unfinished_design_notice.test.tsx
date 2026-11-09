import {afterEach,beforeEach,expect,test} from 'bun:test';
import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {UnfinishedDesignNotice} from '../src/components/chat/UnfinishedDesignNotice';
import {useProjectStore} from '../src/stores/useProjectStore';
import {useHistoryStore} from '../src/stores/useHistoryStore';
import {createProjectStorage,LocalStorageStorage} from '../src/services/storage/projectStorage';
import {saveDesignTask} from '../src/services/storage/designTaskRepository';
import {buildDesignTaskContract} from '../src/services/ai/designWorkflow';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
let prior:ReturnType<typeof useProjectStore.getState>,history:ReturnType<typeof useHistoryStore.getState>,host:HTMLDivElement,root:Root;
const list=LocalStorageStorage.prototype.listDir,pause=()=>new Promise(done=>setTimeout(done,0));
beforeEach(()=>{prior=useProjectStore.getState();history=useHistoryStore.getState();useProjectStore.getState().initNewProject({name:'提示测试',deviceProfile:'mobile',createSpecimen:false});useProjectStore.setState({id:'notice-'+crypto.randomUUID()});useHistoryStore.getState().restore(null);host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(()=>{act(()=>root.unmount());host.remove();LocalStorageStorage.prototype.listDir=list;useProjectStore.setState(prior,true);useHistoryStore.setState(history,true);});
async function seed(){const state=useProjectStore.getState(),storage=createProjectStorage(state.id),contract=buildDesignTaskContract({intent:'create_screen',request:'未完成资料页',deviceProfile:'mobile',frameWidth:390});await saveDesignTask(storage,{version:1,id:contract.taskId,projectId:state.id,createdAt:1,updatedAt:1,state:'blocked',request:contract.request,contextFingerprint:'old',binding:{providerId:'test',model:'m',endpointIdentity:'test'},contract},[]);localStorage.setItem(`aidesign:fs:${state.id}:tasks/design-bad/manifest.json`,'SYNTHETIC_SECRET');return storage;}
test('project-open notice reports actual pending and broken records without changing pages, history or files',async()=>{
 const storage=await seed(),raw=await storage.listDir('tasks'),pages=JSON.stringify(useProjectStore.getState().screens),past=useHistoryStore.getState().past.length;let opens=0;
 await act(async()=>{root.render(<UnfinishedDesignNotice onOpen={()=>opens++}/>);await pause();});expect(host.textContent).toContain('1 项未完成设计、1 项无法读取');expect(host.textContent).not.toContain('SYNTHETIC_SECRET');act(()=>Array.from(host.querySelectorAll('button')).find(b=>b.textContent==='查看任务记录')!.click());expect(opens).toBe(1);expect(JSON.stringify(useProjectStore.getState().screens)).toBe(pages);expect(useHistoryStore.getState().past).toHaveLength(past);expect(await storage.listDir('tasks')).toEqual(raw);
 act(()=>host.querySelector<HTMLButtonElement>('[aria-label="关闭未完成设计提示"]')!.click());expect(host.textContent).toBe('');
});
test('late scan from an old project is discarded after a project switch',async()=>{
 const storage=await seed();let release!:()=>void,entered!:()=>void;const started=new Promise<void>(done=>entered=done);LocalStorageStorage.prototype.listDir=async function(path){if(this.scopeKey===storage.scopeKey&&path==='tasks'){entered();await new Promise<void>(done=>release=done);}return list.call(this,path);};
 act(()=>root.render(<UnfinishedDesignNotice onOpen={()=>{}}/>));await started;act(()=>useProjectStore.setState({id:'empty-'+crypto.randomUUID()}));await act(async()=>{release();await pause();});expect(host.textContent).toBe('');
});

test('a superseded failed source remains in history but no longer prompts as unfinished after its replacement completes',async()=>{
 const {readDesignTask,listDesignTaskIndex,claimDesignTaskRecovery}=await import('../src/services/storage/designTaskRepository'),storage=await seed(),state=useProjectStore.getState();
 localStorage.removeItem(`aidesign:fs:${state.id}:tasks/design-bad/manifest.json`);const prior=(await listDesignTaskIndex(storage,state.id,true)).tasks[0],childId='design-replacement-'+crypto.randomUUID(),contract={...structuredClone(prior.contract),taskId:childId};
 await saveDesignTask(storage,{...prior,id:childId,originTaskId:prior.id,state:'completed',contract},[]);expect(await claimDesignTaskRecovery(storage,prior,childId)).toBe(true);
 const saved=await readDesignTask(storage,state.id,prior.id);expect(saved?.task.state).toBe('blocked');expect(saved?.recoveryClaim?.newTaskId).toBe(childId);expect((await listDesignTaskIndex(storage,state.id)).tasks).toHaveLength(0);expect((await listDesignTaskIndex(storage,state.id,true)).tasks).toHaveLength(2);
 await act(async()=>{root.render(<UnfinishedDesignNotice onOpen={()=>{}}/>);await pause();});expect(host.textContent).toBe('');expect(useHistoryStore.getState().past).toHaveLength(0);
});
