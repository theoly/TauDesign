import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {beforeEach,afterEach,expect,spyOn,test} from 'bun:test';
import {useAIEngineChat} from '../src/services/ai/engine/react/useAIEngineChat';
import {PipelineExecutor} from '../src/services/ai/engine/pipeline/executor';
import {DefaultAIEngineCore} from '../src/services/ai/engine/core/aiEngineCore';
import {buildDesignTaskContract} from '../src/services/ai/designWorkflow';
import {useProjectStore} from '../src/stores/useProjectStore';
import {useHistoryStore} from '../src/stores/useHistoryStore';
import {useAIConfigStore,defaultProviders,defaultBindings} from '../src/stores/useAIConfigStore';
import {ChatDrawer} from '../src/components/chat/ChatDrawer';
import {LocalStorageStorage} from '../src/services/storage/projectStorage';
let prior:ReturnType<typeof useProjectStore.getState>,history:ReturnType<typeof useHistoryStore.getState>,config:ReturnType<typeof useAIConfigStore.getState>,root:Root,host:HTMLDivElement,engine:ReturnType<typeof useAIEngineChat>,pipeline:ReturnType<typeof spyOn>,objects:ReturnType<typeof spyOn>,oldAct:unknown;
function Harness(){engine=useAIEngineChat();return null;}
async function until(predicate:()=>boolean){const end=Date.now()+3000;while(!predicate()){if(Date.now()>end)throw Error('History did not settle');await act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));});}}
beforeEach(async()=>{
 prior=useProjectStore.getState();history=useHistoryStore.getState();config=useAIConfigStore.getState();oldAct=(globalThis as any).IS_REACT_ACT_ENVIRONMENT;(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
 useProjectStore.getState().initNewProject({name:'失败会话回归',deviceProfile:'mobile',createSpecimen:false});useAIConfigStore.setState({providers:defaultProviders.map(p=>({...p,apiKey:'SYNTHETIC_CHAT_SECRET'})),bindings:defaultBindings,autoReferenceDesignRules:false});
 pipeline=spyOn(PipelineExecutor,'execute').mockImplementation(async o=>({status:'error',rawResponse:'',errorMessage:'合成图片证据请求失败',workflowContract:buildDesignTaskContract({intent:'create_screen',request:o.input.rawPrompt,deviceProfile:'mobile',frameWidth:390})}));
 objects=spyOn(DefaultAIEngineCore.prototype,'generateObject').mockRejectedValue(Error('合成模型失败'));
 host=document.createElement('div');document.body.append(host);root=createRoot(host);await act(async()=>root.render(<Harness/>));
});
afterEach(()=>{act(()=>root.unmount());host.remove();pipeline.mockRestore();objects.mockRestore();useProjectStore.setState(prior,true);useHistoryStore.setState(history,true);useAIConfigStore.setState(config,true);(globalThis as any).IS_REACT_ACT_ENVIRONMENT=oldAct;});
test('zero-request generation failure and its explicit retry both persist as distinct immutable attempts',async()=>{
 const request='新建一个简单资料页面';await act(async()=>{await engine.sendMessage(request);});await until(()=>engine.messages.some(m=>m.failureHistoryState==='saved'));
 let rows=await useProjectStore.getState().getConversationStore().loadRecent();expect(rows).toHaveLength(1);expect(rows[0].user.text).toBe(request);expect(rows[0].assistant.failure?.status).toBe('failed');expect(rows[0].assistant.failure?.requests).toBe(0);
 const failure=engine.messages.find(m=>m.isError)!;await act(async()=>{await engine.retryTurn(failure.id);});await until(()=>engine.messages.filter(m=>m.failureHistoryState==='saved').length===2);
 rows=await useProjectStore.getState().getConversationStore().loadRecent();expect(rows).toHaveLength(2);expect(new Set(rows.map(r=>r.turnId)).size).toBe(2);expect(rows.every(r=>r.assistant.text.includes('失败'))).toBe(true);
});
for(const kind of ['analysis','multi','element'] as const)test(`${kind} failure is archived even though it never enters the normal success persistence branch`,async()=>{
 const page=useProjectStore.getState().addScreen({name:'资料',htmlContent:'<main data-nid="page"><button data-nid="button">保存</button></main>'},'page');
 const request=kind==='multi'?'新建登录页和注册页两个页面':kind==='analysis'?'优化页面':'将按钮文字改为提交';
 await act(async()=>{await engine.sendMessage(request,undefined,kind==='multi'?undefined:{referencedScreenId:page,...(kind==='element'?{referencedElement:{nid:'button',tagName:'button',screenName:'资料'}}:{})});});
 await until(()=>engine.messages.some(m=>m.failureHistoryState==='saved'));const rows=await useProjectStore.getState().getConversationStore().loadRecent();expect(rows).toHaveLength(1);expect(rows[0].user.text).toBe(request);expect(rows[0].assistant.failure?.message).toContain('失败');expect(useProjectStore.getState().screens[page].htmlContent).toContain('保存');
});
test('reopened failed history stays failed; reuse only fills the composer and does not call the model or grant adoption',async()=>{
 const request='新建一个简单资料页面';await act(async()=>{await engine.sendMessage(request);});await until(()=>engine.messages.some(m=>m.failureHistoryState==='saved'));
 act(()=>root.unmount());root=createRoot(host);await act(async()=>root.render(<Harness/>));await until(()=>engine.messages.some(m=>m.historicalFailure));
 const restored=engine.messages.find(m=>m.historicalFailure)!;expect(restored.isError).toBe(true);expect(restored.originalUserPrompt).toBeUndefined();expect(restored.workflowContract).toBeUndefined();expect(restored.text).toContain('失败');
 await act(async()=>root.render(<ChatDrawer/>));await until(()=>host.textContent?.includes('重新使用该需求')??false);
 act(()=>Array.from(host.querySelectorAll('button')).find(b=>b.textContent==='重新使用该需求')!.click());expect(host.querySelector('textarea')!.value).toBe(request);expect(pipeline).toHaveBeenCalledTimes(1);expect(useProjectStore.getState().stagedScreen).toBeNull();expect(await useProjectStore.getState().getConversationStore().loadRecent()).toHaveLength(1);
});
test('confirmed region failure stores the actual authorized scope and original review request',async()=>{
 const original='<main data-nid="root"><section data-nid="region"><h1 data-nid="title">标题</h1></section><section>'+Array.from({length:12},(_,i)=>`<p>保留${i}</p>`).join('')+'</section></main>';
 const id=useProjectStore.getState().addScreen({name:'区块页面',htmlContent:original});
 objects.mockResolvedValueOnce({summary:'结构优化',items:[{title:'调整标题区',reason:'标题区域布局拥挤',change:'重新排列标题区',scope:'region',targetNids:['region'],operations:[]}]});
 await act(async()=>{await engine.sendMessage('优化页面',undefined,{referencedScreenId:id});});
 const review=engine.messages.find(m=>m.modificationReview?.status==='ready')!;
 await act(async()=>{await engine.confirmModification(review.id,['suggestion-1'],'保留标题文案','region');});
 await until(()=>engine.messages.some(m=>m.failureHistoryState==='saved'));
 const [row]=await useProjectStore.getState().getConversationStore().loadRecent();
 expect(row.user.reviewRequest).toBe('优化页面');expect(row.user.text).toContain('保留标题文案');expect(row.user.text).toContain('重新排列标题区');expect(row.assistant.failure?.message).toContain('修改未执行');expect(row.assistant.failure?.requests).toBe(1);
 expect(useProjectStore.getState().screens[id].htmlContent).toBe(original);expect(useProjectStore.getState().stagedScreen).toBeNull();
 // A later configuration-preflight failure must not deduplicate against this old task.
 act(()=>useAIConfigStore.setState({providers:defaultProviders.map(p=>({...p,apiKey:''}))}));
 await act(async()=>{await engine.confirmModification(review.id,['suggestion-1'],'保留标题文案','region');});
 await until(()=>engine.messages.find(m=>m.id===review.id)?.failureHistoryState==='saved');
 const rows=await useProjectStore.getState().getConversationStore().loadRecent();expect(rows).toHaveLength(2);expect(rows[0].assistant.failure?.taskId).not.toBe(rows[1].assistant.failure?.taskId);expect(rows[1].assistant.failure?.message).toContain('Provider');
});
test('a pending failure write keeps the old project scope and cannot overwrite a newly opened project UI',async()=>{
 const oldStore=useProjectStore.getState().getConversationStore(),original=LocalStorageStorage.prototype.appendLine;let release!:()=>void;const spy=spyOn(LocalStorageStorage.prototype,'appendLine').mockImplementation(async function(path,line){if(path.startsWith('conversations/'))await new Promise<void>(resolve=>release=resolve);return original.call(this,path,line);});
 try{await act(async()=>{await engine.sendMessage('新建一个资料页面');});await until(()=>!!release);act(()=>useProjectStore.getState().initNewProject({name:'新工程',deviceProfile:'mobile',createSpecimen:false}));release();await until(()=>engine.messages.length===1);
  expect(await useProjectStore.getState().getConversationStore().loadRecent()).toHaveLength(0);expect(await oldStore.loadRecent()).toHaveLength(1);
 }finally{spy.mockRestore();}
});
test('a stopped in-flight attempt is saved as cancelled without applying a late result',async()=>{
 let resolve!:(value:any)=>void;pipeline.mockImplementationOnce(()=>new Promise(r=>resolve=r));let pending!:Promise<void>;
 await act(async()=>{pending=engine.sendMessage('新建一个资料页面');});
 act(()=>engine.abort());await act(async()=>{resolve({status:'error',rawResponse:'',errorMessage:'已停止'});await pending;});
 await until(()=>engine.messages.some(m=>m.failureHistoryState==='saved'));
 const [row]=await useProjectStore.getState().getConversationStore().loadRecent();expect(row.assistant.failure?.status).toBe('cancelled');expect(useProjectStore.getState().stagedScreen).toBeNull();
});
