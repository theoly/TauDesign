import {afterEach,beforeEach,expect,spyOn,test} from 'bun:test';
import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {useAIEngineChat} from '../src/services/ai/engine/react/useAIEngineChat';
import {DefaultAIEngineCore} from '../src/services/ai/engine/core';
import {PipelineExecutor} from '../src/services/ai/engine/pipeline/executor';
import {PageRenderCheck} from '../src/services/ai/pageRenderCheck';
import {useProjectStore} from '../src/stores/useProjectStore';
import {useHistoryStore} from '../src/stores/useHistoryStore';
import {useAIConfigStore,defaultProviders,defaultBindings} from '../src/stores/useAIConfigStore';
import {withMultiPageTasks,multiPageTask} from './fixtures/multiPageTask';
import {ConversationStore} from '../src/services/storage/conversationStore';
import * as Structured from '../src/services/ai/structuredEditExecutor';
import type {StreamTextOptions,StreamTextResult} from '../src/services/ai/engine/core/types';

const source='<main data-nid="root0001" class="p-4"><section data-nid="region01"><h2 data-nid="title001">资料</h2><button data-nid="button01" class="btn btn-primary">查看详情</button></section><aside data-nid="outside1">'+Array.from({length:24},(_,i)=>`<p data-nid="keep${i}">保留外部${i}</p>`).join('')+'</aside></main>';
const analysis={summary:'主次层级可优化',items:[{title:'主按钮加粗',reason:'操作层级不足',change:'主按钮文字加粗',scope:'local',operations:[{nid:'button01',type:'add_classes',value:'font-semibold'}]}]};
const finite={requiresPageRewrite:false,reason:'仅修改授权按钮',operations:[{nid:'button01',type:'add_classes',value:'font-semibold'}]};
const batch=withMultiPageTasks({summary:'两页资料',pages:[{name:'资料一',requirements:['展示资料一'],links:[]},{name:'资料二',requirements:['展示资料二'],links:[]}]});
const reference={referencedScreenId:'page'},element={...reference,referencedElement:{nid:'button01',tagName:'button',screenName:'资料页'}};
const defer=<T,>()=>{let resolve!:(value:T)=>void;const promise=new Promise<T>(r=>resolve=r);return {promise,resolve};};
const pause=()=>new Promise(resolve=>setTimeout(resolve,0));
let root:Root,host:HTMLDivElement,engine:ReturnType<typeof useAIEngineChat>,mounted:boolean,oldAct:unknown;
let project:ReturnType<typeof useProjectStore.getState>,history:ReturnType<typeof useHistoryStore.getState>,config:ReturnType<typeof useAIConfigStore.getState>;
let objects:ReturnType<typeof spyOn>,streams:ReturnType<typeof spyOn>,renderCheck:ReturnType<typeof spyOn>,pipeline:ReturnType<typeof spyOn>|undefined;
let calls:Array<{schema:Record<string,any>;options:Omit<StreamTextOptions,'jsonSchema'>;resolve:(value:any)=>void}>,htmlCalls:Array<{options:StreamTextOptions;resolve:(value:string)=>void}>,aborts:number;
function Harness(){engine=useAIEngineChat();return null;}
async function begin(text:string,options?:Parameters<typeof engine.sendMessage>[2]){let pending!:Promise<void>;await act(async()=>{pending=engine.sendMessage(text,undefined,options);await pause();});return {pending};}
const message=()=>engine.messages.at(-1)!;
async function answer(index:number,value:unknown,pending?:Promise<void>){await act(async()=>{calls[index].resolve(value);if(pending)await pending;else await pause();});}
beforeEach(async()=>{
 project=useProjectStore.getState();history=useHistoryStore.getState();config=useAIConfigStore.getState();oldAct=(globalThis as any).IS_REACT_ACT_ENVIRONMENT;(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
 useHistoryStore.getState().restore(null);useProjectStore.getState().initNewProject({name:'独立入口生命周期',deviceProfile:'mobile',createSpecimen:false});useProjectStore.getState().addScreen({name:'资料页',htmlContent:source},'page');
 useAIConfigStore.setState({providers:defaultProviders.map(p=>({...p,apiKey:'SYNTHETIC_ENTRY_SECRET'})),bindings:defaultBindings,autoReferenceDesignRules:false});calls=[];htmlCalls=[];aborts=0;pipeline=undefined;
 objects=spyOn(DefaultAIEngineCore.prototype,'generateObject').mockImplementation((schema,options)=>new Promise(resolve=>calls.push({schema,options,resolve})));
 streams=spyOn(DefaultAIEngineCore.prototype,'streamText').mockImplementation(options=>{
  const pending=defer<string>();htmlCalls.push({options,resolve:pending.resolve});
  return {textStream:(async function*(){yield await pending.promise;})(),reasoningStream:(async function*(){})(),textPromise:pending.promise,reasoningPromise:Promise.resolve(undefined),usagePromise:Promise.resolve({inputTokens:10,outputTokens:20}),finishReasonPromise:Promise.resolve('stop'),abort(){aborts++;}} satisfies StreamTextResult;
 });
 renderCheck=spyOn(PageRenderCheck,'inspect').mockResolvedValue({status:'complete',findings:[],inspected:5});
 host=document.createElement('div');document.body.append(host);root=createRoot(host);mounted=true;await act(async()=>{root.render(<Harness/>);await pause();});
});
afterEach(()=>{if(mounted)act(()=>root.unmount());host.remove();objects.mockRestore();streams.mockRestore();renderCheck.mockRestore();pipeline?.mockRestore();useProjectStore.setState(project,true);useHistoryStore.setState(history,true);useAIConfigStore.setState(config,true);(globalThis as any).IS_REACT_ACT_ENVIRONMENT=oldAct;});

test('analysis reports a real pending JSON call then ready with no generation or candidate',async()=>{
 const {pending}=await begin('优化当前页面',reference);expect(calls).toHaveLength(1);
 expect(engine.isGenerating).toBe(true);expect(message().isGenerating).toBe(true);expect(message().executionActivity).toMatchObject({requests:1,active:1,status:'waiting',jsonChars:0,textChars:0});
 expect(message().executionEvents?.map(e=>e.phase)).toEqual(['analyzing']);
 await answer(0,analysis,pending);expect(engine.isGenerating).toBe(false);expect(message().isGenerating).toBe(false);expect(message().modificationReview?.status).toBe('ready');
 expect(message().executionActivity).toMatchObject({requests:1,active:0,status:'returned'});expect(message().executionActivity!.jsonChars).toBeGreaterThan(0);expect(message().executionEvents?.at(-1)?.phase).toBe('review-ready');expect(htmlCalls).toHaveLength(0);expect(useProjectStore.getState().stagedScreen).toBeNull();
});
test('stopping analysis immediately admits a new task and its old finally cannot clear the new owner',async()=>{
 const first=await begin('优化当前页面',reference),firstId=message().id;expect(calls).toHaveLength(1);
 act(()=>engine.abort());expect(engine.isGenerating).toBe(false);expect(message().executionActivity).toMatchObject({status:'cancelled',active:0});
 const second=await begin('优化当前页面',reference),secondId=message().id;expect(calls).toHaveLength(2);expect(secondId).not.toBe(firstId);
 await answer(0,analysis,first.pending);expect(engine.isGenerating).toBe(true);expect(message().id).toBe(secondId);expect(message().executionActivity).toMatchObject({requests:1,active:1,status:'waiting'});
 expect(engine.messages.find(m=>m.id===firstId)?.modificationReview?.status).toBe('cancelled');
 await answer(1,analysis,second.pending);expect(message().modificationReview?.status).toBe('ready');expect(engine.isGenerating).toBe(false);
});
test('stale analysis closes its active observation without accepting JSON or issuing a correction',async()=>{
 const {pending}=await begin('优化当前页面',reference);expect(calls).toHaveLength(1);
 act(()=>useProjectStore.getState().updateScreenHtml('page','<main>手动修改后的原页</main>'));
 await answer(0,{invalid:true},pending);expect(calls).toHaveLength(1);expect(engine.isGenerating).toBe(false);expect(message().modificationReview?.status).toBe('error');expect(message().modificationReview?.summary).toContain('已变化');expect(message().executionActivity?.active).toBe(0);expect(message().executionEvents?.some(e=>e.phase==='review-ready')).toBe(false);
});
test('unmount aborts the live analysis and a late malformed result cannot trigger corrective work',async()=>{
 const {pending}=await begin('优化当前页面',reference);expect(calls).toHaveLength(1);const signal=calls[0].options.signal!;
 act(()=>root.unmount());mounted=false;expect(signal.aborted).toBe(true);calls[0].resolve({invalid:true});await pending;expect(calls).toHaveLength(1);expect(htmlCalls).toHaveLength(0);expect(useProjectStore.getState().stagedScreen).toBeNull();
});
test('precise element details expose one finite JSON request and a candidate instead of selectable analysis',async()=>{
 const {pending}=await begin('主按钮文字加粗',element);expect(calls).toHaveLength(1);expect(calls[0].schema.properties.requiresPageRewrite).toBeDefined();expect(message().executionActivity).toMatchObject({requests:1,active:1,status:'waiting'});expect(engine.messages.some(m=>m.modificationReview)).toBe(false);
 await answer(0,finite,pending);expect(engine.isGenerating).toBe(false);expect(message().executionActivity).toMatchObject({requests:1,active:0,status:'returned'});expect(message().executionEvents?.at(-1)?.phase).toBe('candidate');expect(useProjectStore.getState().stagedScreen?.newHtml).toContain('font-semibold');expect(useProjectStore.getState().screens.page.htmlContent).toBe(source);expect(htmlCalls).toHaveLength(0);
});
for(const changed of ['page','model'] as const)test(`${changed} changes while element JSON is pending close activity and refuse delivery`,async()=>{
 const {pending}=await begin('主按钮文字加粗',element);expect(calls).toHaveLength(1);expect(message().executionActivity?.active).toBe(1);
 act(()=>{if(changed==='page')useProjectStore.getState().updateScreenHtml('page',source.replace('查看详情','新的详情'));else useAIConfigStore.getState().setRoleBinding('code',{role:'code',providerId:'prov-openai',modelId:'gpt-4o'});});
 await answer(0,finite,pending);expect(engine.isGenerating).toBe(false);expect(message().isError).toBe(true);expect(message().executionActivity?.active).toBe(0);expect(useProjectStore.getState().stagedScreen).toBeNull();expect(calls).toHaveLength(1);
});
test('cancelled element details cannot stage late content or unlock a new element task',async()=>{
 const first=await begin('主按钮文字加粗',element);expect(calls).toHaveLength(1);act(()=>engine.abort());
 const second=await begin('主按钮文字加粗',element),secondId=message().id;expect(calls).toHaveLength(2);
 await answer(0,finite,first.pending);expect(engine.isGenerating).toBe(true);expect(message().id).toBe(secondId);expect(message().executionActivity?.active).toBe(1);expect(useProjectStore.getState().stagedScreen).toBeNull();
 await answer(1,finite,second.pending);expect(useProjectStore.getState().stagedScreen).not.toBeNull();expect(engine.isGenerating).toBe(false);
});
test('zero-call confirmed edits preserve the analysis summary and release UI before original-project history append',async()=>{
 const analysisTask=await begin('优化当前页面',reference);await answer(0,analysis,analysisTask.pending);const review=message(),beforeActivity=review.executionActivity;
 const originalStore=useProjectStore.getState().getConversationStore(),save=defer<void>(),realAppend=ConversationStore.prototype.appendTurn;
 const append=spyOn(ConversationStore.prototype,'appendTurn').mockImplementation(function(this:ConversationStore,turn){return save.promise.then(()=>realAppend.call(this,turn));});
 let editing!:Promise<void>;try{
  await act(async()=>{editing=engine.confirmModification(review.id,[review.modificationReview!.items[0].id],'','local');await pause();});
  expect(append).toHaveBeenCalledTimes(1);expect(engine.isGenerating).toBe(false);expect(engine.messages.find(m=>m.id===review.id)?.executionActivity).toEqual(beforeActivity);
  expect(message().executionActivity).toMatchObject({requests:0,active:0,status:'idle'});expect(message().executionEvents?.at(-1)?.phase).toBe('candidate');expect(calls).toHaveLength(1);expect(useProjectStore.getState().stagedScreen).not.toBeNull();
  await act(async()=>{useProjectStore.getState().initNewProject({name:'新工程',deviceProfile:'mobile',createSpecimen:false});await pause();});
  const nextStore=useProjectStore.getState().getConversationStore();
  await act(async()=>{save.resolve();await editing;});expect(append).toHaveBeenCalledTimes(1);expect(await nextStore.loadRecent()).toEqual([]);expect((await originalStore.loadRecent()).at(-1)?.user.reviewRequest).toBe('优化当前页面');expect(Object.keys(useProjectStore.getState().screens)).toHaveLength(0);
 }finally{save.resolve();await editing;append.mockRestore();}
});
test('confirmed region execution keeps its one JSON call separate from analysis provenance',async()=>{
 const preparing=await begin('优化当前页面',reference);await answer(0,{summary:'区块层级可优化',items:[{title:'区块间距',reason:'内部元素拥挤',change:'仅调整区块布局与间距',scope:'region',targetNids:['region01'],operations:[]}]},preparing.pending);const review=message(),before=review.executionActivity;
 let pending!:Promise<void>;await act(async()=>{pending=engine.confirmModification(review.id,[review.modificationReview!.items[0].id],'','region');await pause();});expect(calls).toHaveLength(2);expect(message().executionActivity).toMatchObject({requests:1,active:1,status:'waiting'});
 await answer(1,{nid:'region01',html:'<section data-nid="region01" class="col gap-4"><h2 data-nid="title001">资料</h2><button data-nid="button01" class="btn btn-primary">查看详情</button></section>'},pending);
 expect(engine.isGenerating).toBe(false);expect(useProjectStore.getState().stagedScreen).not.toBeNull();expect(message().executionActivity).toMatchObject({requests:1,active:0,status:'returned'});expect(engine.messages.find(m=>m.id===review.id)?.executionActivity).toEqual(before);expect(message().executionEvents?.at(-1)?.phase).toBe('candidate');expect(htmlCalls).toHaveLength(0);
});
for(const lateStatus of ['cancelled','ready'] as const)test(`a late ${lateStatus} confirmed edit cannot replace the state of a retry using the same review message`,async()=>{
 const preparing=await begin('优化当前页面',reference);await answer(0,analysis,preparing.pending);const review=message();
 const executions:Array<{options:Structured.StructuredEditOptions;result:ReturnType<typeof defer<Structured.StructuredEditResult>>}>=[];
 const realExecute=Structured.executeStructuredEdit,execute=spyOn(Structured,'executeStructuredEdit').mockImplementation((_core,options)=>{const result=defer<Structured.StructuredEditResult>();executions.push({options,result});options.onActivity?.({startedAt:Date.now(),requests:1,active:1,textChars:0,reasoningChars:0,jsonChars:0,status:'waiting'});return result.promise;});
 let first!:Promise<void>,second!:Promise<void>;
 try{
  await act(async()=>{first=engine.confirmModification(review.id,[review.modificationReview!.items[0].id],'保留配色','local');await pause();});expect(executions).toHaveLength(1);
  const valid=lateStatus==='ready'?await realExecute(undefined,{...executions[0].options,signal:undefined,isCurrent:()=>true,onActivity:undefined,onPhase:undefined,local:{...executions[0].options.local!,supplement:false}}):undefined;
  if(valid)expect(valid.status).toBe('ready');
  act(()=>engine.abort());await act(async()=>{second=engine.confirmModification(review.id,[review.modificationReview!.items[0].id],'保留配色','local');await pause();});expect(executions).toHaveLength(2);
  await act(async()=>{executions[0].result.resolve(valid??{status:'cancelled',message:'旧局部执行已取消'});await first;});
  expect(useProjectStore.getState().stagedScreen).toBeNull();
  const current=engine.messages.find(m=>m.id===review.id)!;expect(engine.isGenerating).toBe(true);expect(current.isStopped).toBe(false);expect(current.isError).toBe(false);expect(current.modificationReview?.status).toBe('submitted');expect(current.modificationReview?.summary).not.toContain('旧局部');expect(current.executionActivity).toMatchObject({active:1,status:'waiting'});
 }finally{await act(async()=>{for(const e of executions)e.result.resolve({status:'cancelled',message:'清理测试'});await first;await second;});execute.mockRestore();}
});
async function prepareBatch(){const task=await begin('生成资料一、资料二两个页面');expect(calls).toHaveLength(1);expect(message().executionActivity).toMatchObject({requests:1,active:1,status:'waiting'});await answer(0,batch,task.pending);expect(message().pagePlan?.status).toBe('ready');return message();}
function generated(index:number){const match=htmlCalls[index].options.messages[0].content.match(/confirmedMultiPageScope=(.*); output exactly this page/)!;const scope=JSON.parse(match[1]);return `<artifact title="${scope.name}"><main class="p-4"><h1>${scope.name}</h1><p>展示${scope.name}</p><button class="btn btn-primary">提交</button></main></artifact>`;}
test('multi-page planning and generation have separate summaries and one batch History action',async()=>{
 const review=await prepareBatch();expect(review.executionActivity).toMatchObject({requests:1,active:0,status:'returned'});const before=useHistoryStore.getState().past.length;
 let pending!:Promise<void>;await act(async()=>{pending=engine.confirmPagePlan(review.id,review.pagePlan!.plan!.pages);await pause();});expect(htmlCalls).toHaveLength(1);expect(message().executionActivity).toMatchObject({requests:1,active:1,status:'waiting'});
 await act(async()=>{htmlCalls[0].resolve(generated(0));await pause();});expect(htmlCalls).toHaveLength(2);expect(message().executionActivity).toMatchObject({requests:2,active:1});
 await act(async()=>{htmlCalls[1].resolve(generated(1));await pending;});expect(message().pagePlan?.status).toBe('complete');expect(engine.isGenerating).toBe(false);expect(message().executionActivity).toMatchObject({requests:2,active:0,status:'returned'});expect(message().executionEvents?.at(-1)?.phase).toBe('created');expect(Object.keys(useProjectStore.getState().screens)).toHaveLength(3);expect(useHistoryStore.getState().past.length).toBe(before+1);
});
test('Stop targets an older active page plan rather than the last assistant and late output cannot unlock its successor',async()=>{
 const review=await prepareBatch();pipeline=spyOn(PipelineExecutor,'execute').mockResolvedValueOnce({status:'answered_question',rawResponse:'独立问答'});
 await act(async()=>{await engine.sendMessage('什么是布局？');});const unrelated=message().id;pipeline.mockRestore();pipeline=undefined;
 let pending!:Promise<void>;await act(async()=>{pending=engine.confirmPagePlan(review.id,review.pagePlan!.plan!.pages);await pause();});expect(htmlCalls).toHaveLength(1);
 act(()=>engine.abort());expect(engine.isGenerating).toBe(false);expect(engine.messages.find(m=>m.id===review.id)?.isStopped).toBe(true);expect(engine.messages.find(m=>m.id===unrelated)?.isStopped).not.toBe(true);
 const next=await begin('优化当前页面',reference),nextId=message().id;expect(calls).toHaveLength(2);
 await act(async()=>{htmlCalls[0].resolve(generated(0));await pending;});expect(engine.isGenerating).toBe(true);expect(message().id).toBe(nextId);expect(message().executionActivity?.active).toBe(1);expect(Object.keys(useProjectStore.getState().screens)).toHaveLength(1);expect(engine.messages.find(m=>m.id===review.id)?.pagePlan?.status).toBe('cancelled');
 await answer(1,analysis,next.pending);
});
test('switching projects during multi-page generation suppresses old output without releasing the new analysis',async()=>{
 const review=await prepareBatch();let pending!:Promise<void>;await act(async()=>{pending=engine.confirmPagePlan(review.id,review.pagePlan!.plan!.pages);await pause();});expect(htmlCalls).toHaveLength(1);
 await act(async()=>{useProjectStore.getState().initNewProject({name:'后续工程',deviceProfile:'mobile',createSpecimen:false});useProjectStore.getState().addScreen({name:'资料页',htmlContent:source},'page');await pause();});
 const next=await begin('优化当前页面',reference),nextId=message().id;expect(calls).toHaveLength(2);
 await act(async()=>{htmlCalls[0].resolve(generated(0));await pending;});expect(engine.isGenerating).toBe(true);expect(message().id).toBe(nextId);expect(message().executionActivity?.active).toBe(1);expect(Object.keys(useProjectStore.getState().screens)).toEqual(['page']);expect(engine.messages.some(m=>m.id===review.id)).toBe(false);
 await answer(1,analysis,next.pending);
});
async function unappliedPage(){
 renderCheck.mockResolvedValue({status:'unavailable',findings:[],inspected:0,reason:'首次渲染尚未就绪'});
 const task=await begin('新建资料页');expect(calls).toHaveLength(1);await answer(0,multiPageTask('资料页',['资料']));expect(htmlCalls).toHaveLength(1);
 await act(async()=>{htmlCalls[0].resolve('<artifact title="资料页"><main class="p-4"><h1>资料页</h1><p>资料</p><button class="btn btn-primary">提交</button></main></artifact>');await task.pending;});
 expect(message().isError).toBe(true);expect(message().htmlOutput).toBeDefined();expect(Object.keys(useProjectStore.getState().screens)).toEqual(['page']);return message();
}
test('remount observes real rendering with zero model calls, blocks duplicate clicks and clears obsolete failure text',async()=>{
 const target=await unappliedPage(),before=useHistoryStore.getState().past.length,render=defer<Awaited<ReturnType<typeof PageRenderCheck.inspect>>>();renderCheck.mockImplementationOnce(()=>render.promise);const renderCount=renderCheck.mock.calls.length;
 let pending!:Promise<void>;await act(async()=>{pending=engine.mountMessageHtml(target.id);await pause();});expect(renderCheck.mock.calls.length).toBe(renderCount+1);expect(engine.isGenerating).toBe(true);expect(message().executionActivity).toMatchObject({requests:0,active:0,status:'idle'});expect(message().executionEvents?.map(e=>e.phase)).toEqual(['rendering']);
 await act(async()=>{await engine.mountMessageHtml(target.id);});expect(renderCheck.mock.calls.length).toBe(renderCount+1);expect(calls).toHaveLength(1);expect(htmlCalls).toHaveLength(1);
 await act(async()=>{render.resolve({status:'complete',findings:[],inspected:5});await pending;});expect(engine.isGenerating).toBe(false);expect(message().toolAction).toBe('created');expect(message().isError).toBe(false);expect(message().executionEvents?.at(-1)?.phase).toBe('created');expect(message().text).not.toContain('本次结果未应用');expect(Object.keys(useProjectStore.getState().screens)).toHaveLength(2);expect(useHistoryStore.getState().past.length).toBe(before+1);
});
test('cancelled remount cannot create a page or clear a new element task when its renderer returns late',async()=>{
 const target=await unappliedPage(),render=defer<Awaited<ReturnType<typeof PageRenderCheck.inspect>>>();renderCheck.mockImplementationOnce(()=>render.promise);
 let pending!:Promise<void>;await act(async()=>{pending=engine.mountMessageHtml(target.id);await pause();});expect(engine.isGenerating).toBe(true);act(()=>engine.abort());
 const next=await begin('主按钮文字加粗',element),nextId=message().id;expect(calls).toHaveLength(2);await act(async()=>{render.resolve({status:'complete',findings:[],inspected:5});await pending;});
 expect(engine.isGenerating).toBe(true);expect(message().id).toBe(nextId);expect(message().executionActivity?.active).toBe(1);expect(Object.keys(useProjectStore.getState().screens)).toEqual(['page']);expect(engine.messages.find(m=>m.id===target.id)?.isStopped).toBe(true);
 await answer(1,finite,next.pending);
});
test('project changes while remount is rendering refuse application and close the zero-call task',async()=>{
 const target=await unappliedPage(),render=defer<Awaited<ReturnType<typeof PageRenderCheck.inspect>>>();renderCheck.mockImplementationOnce(()=>render.promise);
 let pending!:Promise<void>;await act(async()=>{pending=engine.mountMessageHtml(target.id);await pause();});act(()=>useProjectStore.getState().addDecision('新的项目要求','global'));
 await act(async()=>{render.resolve({status:'complete',findings:[],inspected:5});await pending;});expect(engine.isGenerating).toBe(false);expect(message().isError).toBe(true);expect(message().executionActivity).toMatchObject({requests:0,active:0});expect(message().executionEvents?.some(e=>e.phase==='created')).toBe(false);expect(Object.keys(useProjectStore.getState().screens)).toEqual(['page']);expect(calls).toHaveLength(1);expect(htmlCalls).toHaveLength(1);
});
for(const stop of [false,true])test(`page variants ${stop?'stopped':'completed'} keep separate planning activity and atomic batch delivery`,async()=>{
 const task=await begin('给当前页面做两个方案');expect(calls).toHaveLength(1);expect(message().executionActivity).toMatchObject({requests:1,active:1});
 await answer(0,withMultiPageTasks({summary:'两种资料页布局',pages:[{name:'资料方案一',requirements:['展示资料方案一'],links:[]},{name:'资料方案二',requirements:['展示资料方案二'],links:[]}]}),task.pending);
 const review=message();expect(review.pagePlan?.plan?.kind).toBe('variants');expect(review.executionActivity).toMatchObject({requests:1,active:0,status:'returned'});const before=useHistoryStore.getState().past.length;
 let pending!:Promise<void>;await act(async()=>{pending=engine.confirmPagePlan(review.id,review.pagePlan!.plan!.pages);await pause();});expect(htmlCalls).toHaveLength(1);expect(message().executionActivity).toMatchObject({requests:1,active:1});
 await act(async()=>{htmlCalls[0].resolve(generated(0));await pause();});expect(htmlCalls).toHaveLength(2);expect(message().executionActivity).toMatchObject({requests:2,active:1});expect(Object.keys(useProjectStore.getState().screens)).toHaveLength(1);
 if(stop)act(()=>engine.abort());await act(async()=>{htmlCalls[1].resolve(generated(1));await pending;});
 expect(engine.isGenerating).toBe(false);expect(message().executionActivity).toMatchObject({requests:2,active:0,status:stop?'cancelled':'returned'});expect(calls).toHaveLength(1);expect(useProjectStore.getState().screens.page.htmlContent).toBe(source);
 const variants=Object.values(useProjectStore.getState().screens).filter(s=>s.id!=='page');expect(variants).toHaveLength(stop?0:2);expect(useHistoryStore.getState().past.length).toBe(before+(stop?0:1));
 if(!stop){expect(variants.every(s=>s.metadata?.multiPageDelivery?.kind==='variants')).toBe(true);expect(variants[0].position.y).toBe(variants[1].position.y);expect(variants[1].position.x).toBeGreaterThan(variants[0].position.x);}
});
