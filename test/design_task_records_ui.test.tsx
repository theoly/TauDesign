import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {test,expect} from 'bun:test';
import {DesignTaskRecords} from '../src/components/chat/DesignTaskRecords';
import {DesignTaskJournal} from '../src/services/ai/designTaskJournal';
import {createProjectStorage} from '../src/services/storage/projectStorage';
import {readDesignTask} from '../src/services/storage/designTaskRepository';
import {buildDesignTaskContract} from '../src/services/ai/designWorkflow';
import {useProjectStore} from '../src/stores/useProjectStore';
import {useHistoryStore} from '../src/stores/useHistoryStore';
import {safeModelDiagnostic} from '../src/services/ai/transportFailure';

async function waitForRecords(host:HTMLElement){
 const deadline=Date.now()+3000;
 do{await new Promise(resolve=>setTimeout(resolve,1));}while(host.textContent?.includes('正在读取或保存任务记录…')&&Date.now()<deadline);
 expect(host.textContent).not.toContain('正在读取或保存任务记录…');
}

test('saved records reopen as read-only code; explicit cleanup deletes owned artifacts and preserves project pages',async()=>{
 const old=useProjectStore.getState(),history=useHistoryStore.getState(),oldAct=(globalThis as any).IS_REACT_ACT_ENVIRONMENT;(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
 useProjectStore.getState().initNewProject({name:'记录测试',deviceProfile:'mobile',createSpecimen:false});const state=useProjectStore.getState(),storage=createProjectStorage(state.id,state.folderPath);
 const contract=buildDesignTaskContract({intent:'create_screen',request:'新建会员资料页',deviceProfile:'mobile',frameWidth:390});
 const journal=new DesignTaskJournal({storage,projectId:state.id,contextFingerprint:'source',provider:{id:'test',name:'test',baseUrl:'https://example.test',protocol:'openai_compatible',apiKey:'',isEnabled:true},model:'m',isCurrent:()=>true});
 await journal.update({phase:'started',contract});await journal.update({phase:'result',contract,result:{html:'<main><h1>会员资料</h1></main>',error:'下一步尚未完成'}});
 const projectBefore=JSON.stringify(useProjectStore.getState().screens),host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 const settle=()=>waitForRecords(host);
 const button=(text:string)=>Array.from(host.querySelectorAll('button')).find(b=>b.textContent?.includes(text))!;
 try{
  await act(async()=>{root.render(<DesignTaskRecords running={false} onClose={()=>{}}/>);await settle();});
  expect(host.textContent).toContain('新建会员资料页');expect(host.textContent).toContain('不会自动修改画布');
  await act(async()=>{button('新建会员资料页').click();await settle();});expect(host.querySelector('pre')?.textContent).toContain('<h1>会员资料</h1>');expect(host.querySelector('h1')).toBeNull();expect(host.textContent).toContain('下一步尚未完成');
  act(()=>button('清理此记录').click());expect(await readDesignTask(storage,state.id,contract.taskId)).toBeDefined();
  await act(async()=>{button('确认清理记录').click();await settle();});for(let i=0;i<100&&!host.textContent?.includes('任务存档已清理');i++)await act(async()=>{await new Promise(resolve=>setTimeout(resolve,5));});expect(host.textContent).toContain('任务存档已清理');expect(await readDesignTask(storage,state.id,contract.taskId)).toBeUndefined();expect(await storage.listDir('tasks/'+contract.taskId)).toEqual([]);expect(JSON.stringify(useProjectStore.getState().screens)).toBe(projectBefore);
 }finally{act(()=>root.unmount());host.remove();useProjectStore.setState(old,true);useHistoryStore.setState(history,true);(globalThis as any).IS_REACT_ACT_ENVIRONMENT=oldAct;}
});
test('provider diagnostics cannot persist an echoed configured credential or encoded media',()=>{
 const message=safeModelDiagnostic('key=SYNTHETIC_SECRET and data:image/png;base64,YQ==','SYNTHETIC_SECRET');expect(message).not.toContain('SYNTHETIC_SECRET');expect(message).not.toContain('data:image');expect(message).not.toContain('YQ==');expect(message).toContain('已省略');
});
test('broken task UI exposes no corrupt payload and requires explicit confirmation before scoped cleanup',async()=>{
 const old=useProjectStore.getState(),history=useHistoryStore.getState(),oldAct=(globalThis as any).IS_REACT_ACT_ENVIRONMENT;(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
 useProjectStore.getState().initNewProject({name:'损坏记录测试',deviceProfile:'mobile',createSpecimen:false});useProjectStore.setState({id:'broken-record-test-'+crypto.randomUUID()});const state=useProjectStore.getState(),storage=createProjectStorage(state.id);
 localStorage.setItem(`aidesign:fs:${state.id}:tasks/design-broken/manifest.json`,'{"request":"SYNTHETIC_SECRET <svg><path d=payload');await storage.writeTextAtomic('tasks/design-broken/artifacts/raw.html','fragment');await storage.writeTextAtomic('screens/kept.html','page');await storage.writeBinary('assets/images/kept.png','YQ==');
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host),settle=()=>waitForRecords(host),button=(text:string)=>Array.from(host.querySelectorAll('button')).find(b=>b.textContent?.includes(text))!;
 try{
  await act(async()=>{root.render(<DesignTaskRecords running={false} onRecover={async()=>{throw Error('broken tasks cannot recover');}} onClose={()=>{}}/>);await settle();});expect(host.textContent).toContain('无法读取的任务');expect(host.textContent).not.toContain('SYNTHETIC_SECRET');
  act(()=>button('无法读取的任务').click());expect(host.querySelector('pre')).toBeNull();expect(host.textContent).not.toContain('恢复草稿（新任务）');act(()=>button('清理损坏记录').click());expect(await storage.exists('tasks/design-broken/manifest.json')).toBe(true);
  await act(async()=>{button('确认清理损坏记录').click();await settle();});expect(await storage.listDir('tasks/design-broken')).toEqual([]);expect(await storage.readText('screens/kept.html')).toBe('page');expect(await storage.readBinary('assets/images/kept.png')).toBe('YQ==');expect(host.textContent).toContain('损坏任务目录已清理');
 }finally{act(()=>root.unmount());host.remove();useProjectStore.setState(old,true);useHistoryStore.setState(history,true);(globalThis as any).IS_REACT_ACT_ENVIRONMENT=oldAct;}
});

test('recovery first prepares exact scope without execution, shows all historical ledgers and only starts after explicit confirmation',async()=>{
 const old=useProjectStore.getState(),oldAct=(globalThis as any).IS_REACT_ACT_ENVIRONMENT;(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
 useProjectStore.getState().initNewProject({name:'恢复预览',deviceProfile:'mobile',createSpecimen:false});const state=useProjectStore.getState(),storage=createProjectStorage(state.id,state.folderPath),contract=buildDesignTaskContract({intent:'create_screen',request:'新建历史账本测试页面',deviceProfile:'mobile',frameWidth:390});
 const journal=new DesignTaskJournal({storage,projectId:state.id,contextFingerprint:'source',provider:{id:'test',name:'test',baseUrl:'https://example.test',protocol:'openai_compatible',apiKey:'',isEnabled:true},model:'m',isCurrent:()=>true});await journal.update({phase:'started',contract});
 const {TaskBudget}=await import('../src/services/ai/taskBudget'),ledger=new TaskBudget({maxRequests:14,maxRequestedOutputTokens:34568,maxDurationMs:900000,maxRequestDurationMs:900000}),budget=ledger.snapshot();ledger.close();budget.requests=4;budget.requestedOutputTokens=4096;budget.unreportedOutputCaps=4096;
 const handle={id:'preview-only',originTaskId:contract.taskId,request:contract.request,kind:'create' as const,reusableRegions:1,history:[{taskId:'design-root-history',budget},{taskId:contract.taskId}]};
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host),settle=()=>waitForRecords(host),button=(text:string)=>Array.from(host.querySelectorAll('button')).find(b=>b.textContent===text)!;let prepared=0,started=0,closed=0;
 try{
  await act(async()=>{root.render(<DesignTaskRecords running={false} onClose={()=>{closed++;}} onPrepareRecovery={async()=>{prepared++;return handle;}} onRecoverPrepared={async chosen=>{expect(chosen).toBe(handle);started++;}}/>);await settle();});
  await act(async()=>{Array.from(host.querySelectorAll('nav button')).find(b=>b.textContent?.includes(contract.request))!.click();await settle();});
  await act(async()=>{button('恢复草稿（新任务）').click();await settle();});expect(prepared).toBe(1);expect(started).toBe(0);expect(host.textContent).toContain('实际可复用 1 个完整区域');expect(host.textContent).toContain('历史已记录请求：4 次');expect(host.textContent).toContain('另有 1 项历史用量未知');expect(host.textContent).toContain('不是实际账单');
  await act(async()=>{button('取消').click();await settle();});expect(started).toBe(0);expect(closed).toBe(0);
  await act(async()=>{button('恢复草稿（新任务）').click();await settle();});await act(async()=>{button('确认新预算并恢复').click();await settle();});expect(prepared).toBe(2);expect(started).toBe(1);expect(closed).toBe(1);
 }finally{act(()=>root.unmount());host.remove();useProjectStore.setState(old,true);(globalThis as any).IS_REACT_ACT_ENVIRONMENT=oldAct;}
});
