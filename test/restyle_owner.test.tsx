import {beforeEach,afterEach,expect,spyOn,test} from 'bun:test';
import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {RestylePanel} from '../src/components/theme/RestylePanel';
import * as Executor from '../src/services/ai/restyleExecutor';
import * as Review from '../src/services/ai/modificationReview';
import {acceptRestyleResult,type RestyleOutcome} from '../src/services/ai/restyleService';
import {useProjectStore} from '../src/stores/useProjectStore';
import {useHistoryStore} from '../src/stores/useHistoryStore';
import {useAIConfigStore,defaultProviders,defaultBindings} from '../src/stores/useAIConfigStore';
import {PageRenderCheck} from '../src/services/ai/pageRenderCheck';

const html=(id:string)=>`<main data-nid="${id}root001" class="card p-4"><h1 data-nid="${id}title01">${id}资料</h1><button data-nid="${id}button1" class="btn btn-primary">查看详情</button></main>`;
const deferred=<T,>()=>{let resolve!:(value:T)=>void;const promise=new Promise<T>(r=>resolve=r);return {promise,resolve};};
const pause=()=>new Promise(resolve=>setTimeout(resolve,0));
const realAnalyze=Review.analyzeScreenModification;
let host:HTMLDivElement,root:Root,closed:number,previousAct:unknown;
let prior:ReturnType<typeof useProjectStore.getState>,history:ReturnType<typeof useHistoryStore.getState>,config:ReturnType<typeof useAIConfigStore.getState>;
let execute:ReturnType<typeof spyOn>,analyze:ReturnType<typeof spyOn>,renderCheck:ReturnType<typeof spyOn>;
type Options=Parameters<typeof Executor.executeRestyleTarget>[1];
let calls:Array<{options:Options;pending:ReturnType<typeof deferred<RestyleOutcome>>}>,analyses:Array<{options:Parameters<typeof Review.analyzeScreenModification>[1];pending:ReturnType<typeof deferred<Review.ModificationAnalysis>>}>;
const button=(text:string)=>[...host.querySelectorAll('button')].find(b=>b.textContent===text)!;
async function click(text:string){expect(button(text)).toBeDefined();await act(async()=>{button(text).click();await pause();});}
async function mount(scope='all'){await act(async()=>{root.render(<RestylePanel scope={scope} onClose={()=>closed++}/>);await pause();});if(scope==='all')await act(async()=>{for(const box of host.querySelectorAll<HTMLInputElement>('input[type=checkbox]'))if(!box.checked)box.click();});}
const progress=(i:number,name=`operation-${i}`)=>calls[i].options.onProgress?.({phase:'waiting',provider:name,model:'fixture',targetName:calls[i].options.target.name,elapsedMs:100,idleMs:0,textChars:i+1,reasoningChars:0,continuationCount:0});
function result(i:number){const o=calls[i].options;return acceptRestyleResult(o.target,o.target.html.replace('p-4','p-6'),o.quality,o.contract);}
async function finish(i:number,value=result(i)){await act(async()=>{calls[i].pending.resolve(value);await pause();});}
beforeEach(()=>{
 previousAct=(globalThis as any).IS_REACT_ACT_ENVIRONMENT;(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;prior=useProjectStore.getState();history=useHistoryStore.getState();config=useAIConfigStore.getState();
 useHistoryStore.getState().restore(null);useProjectStore.getState().initNewProject({name:'重塑owner',deviceProfile:'pc',createSpecimen:false});for(const id of ['a','b'])useProjectStore.getState().addScreen({name:id,htmlContent:html(id)},id);
 useAIConfigStore.setState({providers:defaultProviders.map(p=>({...p,apiKey:'RESTYLE_SYNTHETIC_SECRET'})),bindings:defaultBindings,autoReferenceDesignRules:false});calls=[];analyses=[];closed=0;
 execute=spyOn(Executor,'executeRestyleTarget').mockImplementation((_core,options)=>{const pending=deferred<RestyleOutcome>();calls.push({options,pending});progress(calls.length-1);return pending.promise;});
 analyze=spyOn(Review,'analyzeScreenModification').mockImplementation((_core,options)=>{const pending=deferred<Review.ModificationAnalysis>();analyses.push({options,pending});return pending.promise;});
 renderCheck=spyOn(PageRenderCheck,'inspect').mockResolvedValue({status:'complete',findings:[],inspected:3});host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(async()=>{await act(async()=>{root.unmount();for(const c of calls)c.pending.resolve({target:c.options.target,status:'failed',message:'测试清理'});for(const a of analyses)a.pending.resolve({summary:'测试清理',items:[]});await pause();});host.remove();execute.mockRestore();analyze.mockRestore();renderCheck.mockRestore();useProjectStore.setState(prior,true);useHistoryStore.setState(history,true);useAIConfigStore.setState(config,true);(globalThis as any).IS_REACT_ACT_ENVIRONMENT=previousAct;});

test('Stop immediately admits a new trial and old progress, final result and finally cannot change its owner',async()=>{
 await mount();await click('试跑单个目标');expect(calls).toHaveLength(1);const signal=calls[0].options.request.signal!;
 await click('停止重塑');expect(signal.aborted).toBe(true);await click('试跑单个目标');expect(calls).toHaveLength(2);
 expect(calls[1].options.request.signal).not.toBe(signal);expect(calls[1].options.request.signal?.aborted).toBe(false);
 await act(async()=>{progress(0,'STALE_PROGRESS');await pause();});expect(host.textContent).not.toContain('STALE_PROGRESS');expect(host.textContent).toContain('operation-1');
 await finish(0);expect(button('停止重塑')).toBeDefined();expect(button('试跑单个目标').disabled).toBe(true);expect(host.textContent).not.toContain('试跑结果：');expect(useProjectStore.getState().screens.a.htmlContent).toBe(html('a'));
 await finish(1);expect(host.textContent).toContain('试跑结果：a');expect(button('停止重塑')).toBeUndefined();
});
test('completed trial callbacks cannot replace a later retry summary',async()=>{
 await mount();await click('试跑单个目标');await finish(0);await click('重新试跑');await click('试跑单个目标');expect(calls).toHaveLength(2);
 await act(async()=>{progress(0,'COMPLETED_OLD_PROGRESS');await pause();});expect(host.textContent).not.toContain('COMPLETED_OLD_PROGRESS');expect(host.textContent).toContain('operation-1');
});
test('close invalidates callbacks even if the parent has not yet unmounted the panel',async()=>{
 await mount();await click('试跑单个目标');await act(async()=>{(host.querySelector('[aria-label="停止并关闭重塑"]') as HTMLButtonElement).click();await pause();});expect(closed).toBe(1);expect(calls[0].options.request.signal?.aborted).toBe(true);
 await act(async()=>{progress(0,'CLOSED_LATE_PROGRESS');await pause();});await finish(0);expect(host.textContent).not.toContain('CLOSED_LATE_PROGRESS');expect(host.textContent).not.toContain('试跑结果：');
});
test('a stopped single-page analysis can retry immediately and old analysis cannot finish the new one',async()=>{
 await mount('a');await click('分析原页面');expect(analyses).toHaveLength(1);await click('停止重塑');await click('重新分析');expect(analyses).toHaveLength(2);expect(analyses[0].options.signal?.aborted).toBe(true);
 await act(async()=>{analyses[0].pending.resolve({summary:'OLD_ANALYSIS',items:[]});await pause();});expect(host.textContent).not.toContain('OLD_ANALYSIS');expect(button('停止重塑')).toBeDefined();
 await act(async()=>{analyses[1].pending.resolve({summary:'新分析',items:[]});await pause();});expect(host.textContent).toContain('新分析');expect(button('停止重塑')).toBeUndefined();
});
test('changing models while a trial is pending refuses its ready result',async()=>{
 await mount();await click('试跑单个目标');act(()=>useAIConfigStore.getState().setRoleBinding('code',{role:'code',providerId:'prov-openai',modelId:'gpt-4o'}));await finish(0);
 expect(host.textContent).not.toContain('试跑结果：');expect(host.textContent).toContain('模型');expect(useProjectStore.getState().screens.a.htmlContent).toBe(html('a'));expect(useProjectStore.getState().stagedScreen).toBeNull();
});
test('switching projects cancels the old operation and suppresses its progress and ready result',async()=>{
 await mount();await click('试跑单个目标');await act(async()=>{useProjectStore.getState().initNewProject({name:'后续工程',deviceProfile:'pc',createSpecimen:false});useProjectStore.getState().addScreen({name:'后续页',htmlContent:html('c')},'c');await pause();});
 expect(calls[0].options.request.signal?.aborted).toBe(true);await act(async()=>{progress(0,'PREVIOUS_PROJECT');await pause();});await finish(0);expect(host.textContent).not.toContain('PREVIOUS_PROJECT');expect(host.textContent).not.toContain('试跑结果：a');expect(Object.keys(useProjectStore.getState().screens)).toEqual(['c']);
});
test('changing the single-page target cancels its old analysis without clearing the replacement task',async()=>{
 await mount('a');await click('分析原页面');expect(analyses).toHaveLength(1);await mount('b');expect(analyses[0].options.signal?.aborted).toBe(true);
 await click('分析原页面');expect(analyses).toHaveLength(2);expect(analyses[1].options.name).toBe('b');
 await act(async()=>{analyses[0].pending.resolve({summary:'PREVIOUS_TARGET_ANALYSIS',items:[]});await pause();});expect(host.textContent).not.toContain('PREVIOUS_TARGET_ANALYSIS');expect(button('停止重塑')).toBeDefined();
 await act(async()=>{analyses[1].pending.resolve({summary:'b的分析',items:[]});await pause();});expect(host.textContent).toContain('b的分析');expect(useProjectStore.getState().stagedScreen).toBeNull();
});
test('the final restyle write rechecks the caller owner after asynchronous rendering',async()=>{
 const state=useProjectStore.getState(),target=state.buildRestylePlan().queue[0],outcome=acceptRestyleResult(target,target.html.replace('p-4','p-6'));
 const report=deferred<Awaited<ReturnType<typeof PageRenderCheck.inspect>>>();renderCheck.mockImplementationOnce(()=>report.promise);let current=true;
 const before=useHistoryStore.getState().past.length,pending=state.applyRestyleOutcome(outcome,undefined,()=>current);await pause();expect(renderCheck).toHaveBeenCalledTimes(1);current=false;report.resolve({status:'complete',findings:[],inspected:3});const applied=await pending;
 expect(applied.applied).toBe(false);expect(useProjectStore.getState().screens.a.htmlContent).toBe(html('a'));expect(useHistoryStore.getState().past.length).toBe(before);
});
test('a model change during batch render rejects the first write and does not request remaining targets',async()=>{
 await mount();await click('试跑单个目标');await finish(0);const report=deferred<Awaited<ReturnType<typeof PageRenderCheck.inspect>>>();renderCheck.mockImplementationOnce(()=>report.promise);const before=useHistoryStore.getState().past.length;
 await click('确认效果，批量执行剩余 1 项');expect(renderCheck).toHaveBeenCalledTimes(1);
 await act(async()=>{useAIConfigStore.getState().setRoleBinding('code',{role:'code',providerId:'prov-openai',modelId:'gpt-4o'});await pause();report.resolve({status:'complete',findings:[],inspected:3});await pause();});
 expect(calls).toHaveLength(1);expect(useProjectStore.getState().screens.a.htmlContent).toBe(html('a'));expect(useHistoryStore.getState().past.length).toBe(before);expect(button('停止重塑')).toBeUndefined();expect(host.textContent).toContain('模型');
});
test('a stopped batch never borrows a new trial signal and its final cleanup cannot clear the new busy state',async()=>{
 await mount();await click('试跑单个目标');await finish(0);await click('确认效果，批量执行剩余 1 项');
 for(let i=0;i<30&&calls.length<2;i++)await act(async()=>{await new Promise(resolve=>setTimeout(resolve,2));});expect(calls).toHaveLength(2);const signal=calls[1].options.request.signal!,before=useHistoryStore.getState().past.length;expect(useProjectStore.getState().screens.a.htmlContent).toContain('p-6');
 await click('停止重塑');expect(signal.aborted).toBe(true);await click('试跑单个目标');expect(calls).toHaveLength(3);expect(calls[2].options.request.signal).not.toBe(signal);
 await act(async()=>{progress(1,'OLD_BATCH');calls[1].pending.resolve(result(1));await pause();});expect(host.textContent).not.toContain('OLD_BATCH');expect(button('停止重塑')).toBeDefined();expect(button('试跑单个目标').disabled).toBe(true);expect(useProjectStore.getState().screens.b.htmlContent).toBe(html('b'));expect(useHistoryStore.getState().past.length).toBe(before);expect(calls).toHaveLength(3);
 await finish(2);
});
async function readySingle(local=false){
 await mount('a');await click('分析原页面');const raw={summary:'卡片间距可优化',items:[{title:'卡片层级',reason:'卡片层级不足',change:local?'按钮文字加粗':'增加卡片内边距',scope:local?'local':'page',operations:local?[{nid:'abutton1',type:'add_classes',value:'font-semibold'}]:[]}]};
 const analysis=await realAnalyze({async generateObject<T>(){return raw as T;},streamText(){throw Error('分析不应生成HTML');}},analyses[0].options);
 await act(async()=>{analyses[0].pending.resolve(analysis);await pause();});await act(async()=>{(host.querySelector('[data-testid="modification-review"] input[type=checkbox]') as HTMLInputElement).click();await pause();});
}
for(const change of ['cancel','model'] as const)test(`${change} during a confirmed single-page polish refuses the late candidate`,async()=>{
 await readySingle();await click('按所选内容生成新版');expect(calls).toHaveLength(1);
 if(change==='cancel')await click('停止重塑');else await act(async()=>{useAIConfigStore.getState().setRoleBinding('code',{role:'code',providerId:'prov-openai',modelId:'gpt-4o'});await pause();});
 await finish(0);expect(useProjectStore.getState().stagedScreen).toBeNull();expect(useProjectStore.getState().screens.a.htmlContent).toBe(html('a'));expect(closed).toBe(0);expect(calls[0].options.request.signal?.aborted).toBe(true);
});
test('confirmed deterministic polish stages only the authorized class with no model generation',async()=>{
 await readySingle(true);const before=useHistoryStore.getState().past.length;await click('按所选内容生成新版');expect(calls).toHaveLength(0);expect(useProjectStore.getState().stagedScreen?.newHtml).toContain('font-semibold');expect(useProjectStore.getState().screens.a.htmlContent).toBe(html('a'));expect(useHistoryStore.getState().past.length).toBe(before);expect(closed).toBe(1);
});
