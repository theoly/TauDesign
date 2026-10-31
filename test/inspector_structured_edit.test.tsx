import {beforeEach,afterEach,expect,spyOn,test} from 'bun:test';
import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {PropertyInspector} from '../src/components/inspector/PropertyInspector';
import {useProjectStore} from '../src/stores/useProjectStore';
import {useHistoryStore} from '../src/stores/useHistoryStore';
import {useAIConfigStore,defaultProviders,defaultBindings} from '../src/stores/useAIConfigStore';
import {DefaultAIEngineCore} from '../src/services/ai/engine/core';
import {chatPageTaskPlan} from './fixtures/pageTaskPlan';
import * as Structured from '../src/services/ai/structuredEditExecutor';
import {TaskBudget} from '../src/services/ai/taskBudget';
const html='<main data-nid="root0001"><section data-nid="outer001"><section data-nid="inner001"><button data-nid="target01" class="btn btn-primary">继续</button></section><p data-nid="keep0001">保留业务说明</p></section></main>';
const answer={requiresPageRewrite:false,reason:'',operations:[{nid:'target01',type:'add_classes',value:'font-semibold'}]};
let host:HTMLDivElement,root:Root,project:ReturnType<typeof useProjectStore.getState>,history:ReturnType<typeof useHistoryStore.getState>,config:ReturnType<typeof useAIConfigStore.getState>,spy:ReturnType<typeof spyOn>;
let priorAct:unknown;
beforeEach(()=>{
  priorAct=(globalThis as any).IS_REACT_ACT_ENVIRONMENT;(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
  project=useProjectStore.getState();history=useHistoryStore.getState();config=useAIConfigStore.getState();
  useProjectStore.getState().initNewProject({name:'检查器',deviceProfile:'mobile',createSpecimen:false});
  useProjectStore.getState().addScreen({name:'页面',htmlContent:html},'page');useProjectStore.getState().selectNodeByNid('page','target01');
  useAIConfigStore.setState({providers:defaultProviders.map(p=>({...p,apiKey:'test'})),bindings:defaultBindings});
  spy=spyOn(DefaultAIEngineCore.prototype,'generateObject').mockResolvedValue(answer);
  host=document.createElement('div');document.body.append(host);root=createRoot(host);act(()=>root.render(<PropertyInspector/>));
});
afterEach(()=>{
  act(()=>root.unmount());host.remove();spy.mockRestore();
  useProjectStore.setState(project,true);useHistoryStore.setState(history,true);useAIConfigStore.setState(config,true);
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT=priorAct;
});
async function start(double=false,request='文字加粗'){
  const input=host.querySelector('input[placeholder*="选中元素"]') as HTMLInputElement;
  act(()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,request);input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));});
  await act(async()=>{const button=host.querySelector('[aria-label="生成局部微调候选"]')!;button.dispatchEvent(new MouseEvent('click',{bubbles:true}));if(double)button.dispatchEvent(new MouseEvent('click',{bubbles:true}));await Promise.resolve();});
}
test('inspector uses one scoped structured request, preserving original nested HTML and History until adoption',async()=>{
  const past=useHistoryStore.getState().past.length;
  await start(true);
  expect(spy).toHaveBeenCalledTimes(1);const state=useProjectStore.getState();
  expect(state.screens.page.htmlContent).toBe(html);expect(useHistoryStore.getState().past.length).toBe(past);
  expect(state.stagedScreen?.newHtml).toContain('font-semibold');expect(state.stagedScreen?.newHtml).toContain('保留业务说明');
  expect(state.stagedScreen?.workflowContract?.allowedChanges).toEqual(['element:target01']);
  expect(host.textContent).toContain('请比较后采纳');
});
test('inspector forwards the application opt-in using the selected button semantics and the original finite protocol',async()=>{
 act(()=>useAIConfigStore.getState().setAutoReferenceDesignRules(true));await start(false,'主按钮文字加粗');
 const c=useProjectStore.getState().stagedScreen!;expect(c).toBeTruthy();expect(spy).toHaveBeenCalledTimes(1);
 expect(c.workflowContract!.designGuidance!.protocol).toBe('finite-json');expect(c.workflowContract!.designGuidance!.selection.selected.map(s=>s.rule.id)).toContain('TY-06');expect(c.workflowContract!.designGuidance!.requests[0]).toMatchObject({status:'completed',outputProtocol:'json-object'});
 expect(useProjectStore.getState().screens.page.htmlContent).toBe(html);
});
test('request failure cannot apply a partial response to the original page',async()=>{
  spy.mockRejectedValue(Error('模型请求失败'));await start();
  expect(useProjectStore.getState().screens.page.htmlContent).toBe(html);expect(useProjectStore.getState().stagedScreen).toBeNull();
  expect(host.textContent).toContain('模型请求失败');
});
test('switching selected element cancels the old request and ignores late operations',async()=>{
  let release!:(value:unknown)=>void;spy.mockImplementation(()=>new Promise(resolve=>{release=resolve;}));
  await start();expect(spy).toHaveBeenCalledTimes(1);
  await act(async()=>{useProjectStore.getState().selectNodeByNid('page','keep0001');release(answer);await Promise.resolve();});
  expect(useProjectStore.getState().stagedScreen).toBeNull();expect(useProjectStore.getState().screens.page.htmlContent).toBe(html);
});
test('inspector functional additions use the selected container subtree and retain outside content',async()=>{
 act(()=>useProjectStore.getState().selectNodeByNid('page','inner001'));
 spy.mockImplementation(async schema=>(schema.properties as any)?.features?chatPageTaskPlan:{nid:'inner001',html:'<section data-nid="inner001"><label>邮箱<input class="input"/></label><button data-nid="target01" class="btn btn-primary">继续</button></section>'});
 await start(false,'增加邮箱输入框');expect(spy).toHaveBeenCalledTimes(2);
 const state=useProjectStore.getState();expect(state.screens.page.htmlContent).toBe(html);expect(state.stagedScreen?.newHtml).toContain('邮箱');expect(state.stagedScreen?.newHtml).toContain('保留业务说明');expect(state.stagedScreen?.workflowContract?.elementNid).toBe('inner001');expect(state.stagedScreen?.executionRecord?.localEdit?.structural).toBe(true);expect(host.textContent).toContain('请比较后采纳');
});
test('pending finite edits expose actual call activity and an explicit Stop without changing the page',async()=>{
 let release!:(value:unknown)=>void;spy.mockImplementation(()=>new Promise(resolve=>release=resolve));await start();expect(spy).toHaveBeenCalledTimes(1);
 const summary=host.querySelector('[aria-label="应用调用摘要"]');expect(summary).not.toBeNull();expect(summary!.textContent).toContain('等待调用返回');expect(summary!.textContent).toContain('调用尝试 1 次');expect(host.querySelector('[aria-label="停止局部微调"]')).not.toBeNull();
 await act(async()=>{release(answer);await new Promise(resolve=>setTimeout(resolve,5));});expect(summary!.textContent).toContain('调用已返回');expect(summary!.textContent).toContain('进行中 0 次');expect(useProjectStore.getState().screens.page.htmlContent).toBe(html);
});
test('Stop immediately admits another edit and a late old result cannot clear the new request',async()=>{
 const pending:Array<{resolve:(value:unknown)=>void}>=[];spy.mockImplementation(()=>new Promise(resolve=>pending.push({resolve})));await start();expect(pending).toHaveLength(1);
 await act(async()=>{(host.querySelector('[aria-label="停止局部微调"]') as HTMLButtonElement)?.click();});expect(host.querySelector('[aria-label="停止局部微调"]')).toBeNull();await start();expect(pending).toHaveLength(2);
 await act(async()=>{pending[0].resolve(answer);await new Promise(resolve=>setTimeout(resolve,5));});expect(useProjectStore.getState().stagedScreen).toBeNull();expect(host.querySelector('[aria-label="生成局部微调候选"]')?.getAttribute('disabled')).not.toBeNull();expect(host.textContent).toContain('进行中 1 次');
 await act(async()=>{pending[1].resolve(answer);await new Promise(resolve=>setTimeout(resolve,5));});expect(useProjectStore.getState().stagedScreen).not.toBeNull();
});
test('selection changes release an uncooperative old executor without letting its finally unlock the replacement',async()=>{
 const jobs:Array<{options:Structured.StructuredEditOptions;resolve:(value:Structured.StructuredEditResult)=>void}>=[];
 const mock=spyOn(Structured,'executeStructuredEdit').mockImplementation((_core,options)=>new Promise(resolve=>jobs.push({options,resolve})));
 try{
  await start();expect(jobs).toHaveLength(1);await act(async()=>{useProjectStore.getState().selectNodeByNid('page','keep0001');});expect(jobs[0].options.signal?.aborted).toBe(true);
  await start();expect(jobs).toHaveLength(2);await act(async()=>{jobs[0].resolve({status:'cancelled',message:'旧编辑取消'});await Promise.resolve();});expect(host.querySelector('[aria-label="生成局部微调候选"]')?.getAttribute('disabled')).not.toBeNull();
 }finally{await act(async()=>{for(const job of jobs)job.resolve({status:'cancelled',message:'测试清理'});await Promise.resolve();});mock.mockRestore();}
});
test('model changes abort a pending inspector call before its late response can create a candidate',async()=>{
 let release!:(value:unknown)=>void;spy.mockImplementation(()=>new Promise(resolve=>release=resolve));await start();expect(spy).toHaveBeenCalledTimes(1);const signal=spy.mock.calls[0][1].signal!;
 await act(async()=>{useAIConfigStore.getState().setRoleBinding('code',{role:'code',providerId:'prov-openai',modelId:'gpt-4o'});await Promise.resolve();});expect(signal.aborted).toBe(true);expect(host.querySelector('[aria-label="生成局部微调候选"]')?.getAttribute('disabled')).toBeNull();
 await act(async()=>{release(answer);await new Promise(resolve=>setTimeout(resolve,5));});expect(useProjectStore.getState().stagedScreen).toBeNull();expect(host.textContent).toContain('模型');
});
test('a changed baseline ends the inspector operation with a stale-result explanation rather than a generating notice',async()=>{
 let release!:(value:unknown)=>void;spy.mockImplementation(()=>new Promise(resolve=>release=resolve));await start();expect(spy).toHaveBeenCalledTimes(1);
 await act(async()=>{useProjectStore.getState().updateScreenHtml('page',html.replace('保留业务说明','新的业务说明'));release(answer);await new Promise(resolve=>setTimeout(resolve,5));});
 expect(useProjectStore.getState().stagedScreen).toBeNull();expect(host.textContent).not.toContain('正在生成所选元素的副本修改');expect(host.textContent).toContain('已变化');expect(host.textContent).toContain('进行中 0 次');
});
test('switching projects with the same screen and node IDs cannot let the old call affect the replacement',async()=>{
 const jobs:Array<{resolve:(value:unknown)=>void}>=[];spy.mockImplementation(()=>new Promise(resolve=>jobs.push({resolve})));await start();const signal=spy.mock.calls[0][1].signal!;
 await act(async()=>{useProjectStore.getState().initNewProject({name:'同节点新工程',deviceProfile:'mobile',createSpecimen:false});useProjectStore.getState().addScreen({name:'页面',htmlContent:html},'page');useProjectStore.getState().selectNodeByNid('page','target01');});expect(signal.aborted).toBe(true);
 await start();expect(jobs).toHaveLength(2);await act(async()=>{jobs[0].resolve(answer);await new Promise(resolve=>setTimeout(resolve,5));});expect(useProjectStore.getState().stagedScreen).toBeNull();expect(host.textContent).toContain('进行中 1 次');
 await act(async()=>{jobs[1].resolve(answer);await new Promise(resolve=>setTimeout(resolve,5));});expect(useProjectStore.getState().stagedScreen).not.toBeNull();
});
test('unmounting the inspector aborts its request and reopening cannot receive its late candidate',async()=>{
 const jobs:Array<{resolve:(value:unknown)=>void}>=[];spy.mockImplementation(()=>new Promise(resolve=>jobs.push({resolve})));await start();const signal=spy.mock.calls[0][1].signal!;
 await act(async()=>{root.unmount();root=createRoot(host);root.render(<PropertyInspector/>);});expect(signal.aborted).toBe(true);await start();expect(jobs).toHaveLength(2);
 await act(async()=>{jobs[0].resolve(answer);await new Promise(resolve=>setTimeout(resolve,5));});expect(useProjectStore.getState().stagedScreen).toBeNull();expect(host.textContent).toContain('进行中 1 次');
 await act(async()=>{jobs[1].resolve(answer);await new Promise(resolve=>setTimeout(resolve,5));});expect(useProjectStore.getState().stagedScreen).not.toBeNull();
});
test('an actual request deadline releases inspector UI and refuses a later response',async()=>{
 const budget=new TaskBudget({maxRequests:1,maxRequestedOutputTokens:2048,maxDurationMs:1000,maxRequestDurationMs:60}),realExecute=Structured.executeStructuredEdit;
 let release!:(value:unknown)=>void;spy.mockImplementation(()=>new Promise(resolve=>release=resolve));const execute=spyOn(Structured,'executeStructuredEdit').mockImplementation((core,options)=>realExecute(core,{...options,taskBudget:budget}));
 try{await start();expect(spy).toHaveBeenCalledTimes(1);await act(async()=>{await new Promise(resolve=>setTimeout(resolve,100));});expect(host.textContent).toContain('超过时限');expect(host.textContent).toContain('进行中 0 次');expect(host.querySelector('[aria-label="生成局部微调候选"]')?.getAttribute('disabled')).toBeNull();
  await act(async()=>{release(answer);await new Promise(resolve=>setTimeout(resolve,5));});expect(useProjectStore.getState().stagedScreen).toBeNull();expect(budget.snapshot().requests).toBe(1);
 }finally{release?.(answer);budget.close();execute.mockRestore();}
});
