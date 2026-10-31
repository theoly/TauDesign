import {withMultiPageTasks} from './fixtures/multiPageTask';
import {chatPageTaskPlan} from './fixtures/pageTaskPlan';
import {afterEach,beforeEach,expect,test} from 'bun:test';
import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {ChatDrawer} from '../src/components/chat/ChatDrawer';
import {useProjectStore} from '../src/stores/useProjectStore';
import {useHistoryStore} from '../src/stores/useHistoryStore';
import {useAIConfigStore,defaultProviders,defaultBindings} from '../src/stores/useAIConfigStore';
import {defaultTheme} from '../src/utils/themePresets';
import {PipelineExecutor} from '../src/services/ai/engine/pipeline/executor';
import {PageRenderCheck} from '../src/services/ai/pageRenderCheck';
import {DefaultAIEngineCore} from '../src/services/ai/engine/core/aiEngineCore';
import type {AIEngineCore,StreamTextOptions} from '../src/services/ai/engine/core/types';
const execute=PipelineExecutor.execute,inspect=PageRenderCheck.inspect,generate=DefaultAIEngineCore.prototype.generateObject;
const prior=useProjectStore.getState(),history=useHistoryStore.getState(),config=useAIConfigStore.getState();
let previousAct:unknown,root:Root,host:HTMLDivElement,calls:StreamTextOptions[],plans:number,functionPlans:number,omitHtml:boolean,pauseEarly:boolean,ledgers:any[];
beforeEach(()=>{
 previousAct=(globalThis as any).IS_REACT_ACT_ENVIRONMENT;(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
 localStorage.clear();useHistoryStore.getState().restore(null);
 useProjectStore.getState().initNewProject({name:'长页面恢复',deviceProfile:'pc',designSystem:defaultTheme,createSpecimen:false});
 useProjectStore.getState().addScreen({name:'旧页面',htmlContent:'<main data-nid="old">旧内容</main>'},'old');
 useAIConfigStore.setState({providers:defaultProviders.map(p=>p.id==='prov-deepseek'?{...p,apiKey:'fixture'}:p),bindings:defaultBindings});
 calls=[];plans=0;functionPlans=0;omitHtml=false;pauseEarly=false;ledgers=[];
 const core:AIEngineCore={streamText(o){calls.push(o);const marker=o.messages.at(-1)?.content.match(/TAUDESIGN_CONTINUE_[\w-]+/)?.[0];
  const complete=calls.length>=(pauseEarly?3:4);
  const fragment=omitHtml?'尚未输出页面代码':calls.length===1?'<artifact type="screen" title="爱情魔方"><main class="container-max"><h1>爱情魔方</h1>':!complete?'<section class="card p-4">会员资料</section>':'<button class="btn btn-primary">开始匹配</button></main></artifact>';
  const text=pauseEarly&&calls.length===2?'missing expected continuation marker':(marker?marker+'\n':'')+fragment;
  return {textStream:(async function*(){yield text;})(),reasoningStream:(async function*(){})(),textPromise:Promise.resolve(text),reasoningPromise:Promise.resolve(undefined),usagePromise:Promise.resolve({inputTokens:2,outputTokens:3}),finishReasonPromise:Promise.resolve(complete?'stop':'length'),abort(){}};
 },async generateObject<T>(){functionPlans++;return structuredClone(chatPageTaskPlan) as T;}};
 PipelineExecutor.execute=o=>{ledgers.push(o.taskBudget);return execute({...o,engineCore:core});};PageRenderCheck.inspect=async()=>({status:'complete',findings:[],inspected:5});
 DefaultAIEngineCore.prototype.generateObject=async()=>{plans++;return withMultiPageTasks({summary:'首页内容拆分',pages:[{name:'发现首页',requirements:['展示推荐会员'],links:['会员资料']},{name:'会员资料',requirements:['展示个人资料'],links:[]}]}) as any;};
 host=document.createElement('div');document.body.append(host);root=createRoot(host);act(()=>root.render(<ChatDrawer/>));
});
afterEach(()=>{act(()=>root.unmount());host.remove();PipelineExecutor.execute=execute;PageRenderCheck.inspect=inspect;DefaultAIEngineCore.prototype.generateObject=generate;useProjectStore.setState(prior,true);useHistoryStore.setState(history,true);useAIConfigStore.setState(config,true);(globalThis as any).IS_REACT_ACT_ENVIRONMENT=previousAct;});
const button=(text:string)=>Array.from(host.querySelectorAll('button')).find(b=>b.textContent===text)!;
async function send(){const input=host.querySelector('textarea')!;await act(async()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(input,'为爱情魔方设计一个简单大气的主页');input.dispatchEvent(new Event('input',{bubbles:true}));});
 await act(async()=>{(host.querySelector('button[title*="发送设计诉求"]') as HTMLButtonElement).click();await new Promise(r=>setTimeout(r,35));});}
test('budget exhaustion preserves original and stops manual continuation instead of creating a fresh allowance',async()=>{
 await send();expect(calls).toHaveLength(3);expect(Object.keys(useProjectStore.getState().screens)).toEqual(['old']);expect(button('继续未完成设计')).toBeUndefined();expect(button('从头重新生成')).toBeDefined();
 expect(host.textContent).toContain('原任务剩余额度或时限不足以继续');expect(ledgers[0].snapshot()).toMatchObject({requests:4,closed:true});
});
test('explicit continue reuses remaining parent allowance and full prefix, creates only one page, and cannot double-send',async()=>{
 pauseEarly=true;await send();expect(calls).toHaveLength(2);expect(button('继续未完成设计')).toBeDefined();expect(ledgers[0].snapshot().closed).toBe(false);
 const resume=button('继续未完成设计');await act(async()=>{resume.click();resume.click();await new Promise(r=>setTimeout(r,40));});
 expect(calls).toHaveLength(3);expect(calls[2].messages.at(-2)?.content).toContain('<h1>爱情魔方</h1>');expect(plans).toBe(0);expect(functionPlans).toBe(1);expect(ledgers[0]).toBe(ledgers[1]);
 expect(ledgers[0].snapshot()).toMatchObject({requests:4,closed:true});
 const pages=Object.values(useProjectStore.getState().screens);expect(pages).toHaveLength(2);const created=pages.find(p=>p.id!=='old')!;
 expect(created.htmlContent).toContain('开始匹配');expect(created.htmlContent).not.toContain('TAUDESIGN_CONTINUE');expect(created.metadata?.creationEvidence?.workflow.status).toBe('ready');expect(useProjectStore.getState().screens.old.htmlContent).toContain('旧内容');
});
test('authoring context change rejects checkpoint without another model request',async()=>{
 pauseEarly=true;await send();act(()=>useProjectStore.getState().addDecision('新的设计规则','global'));
 await act(async()=>{button('继续未完成设计').click();await new Promise(r=>setTimeout(r,10));});
 expect(calls).toHaveLength(2);expect(host.textContent).toContain('旧片段不能继续使用');expect(Object.keys(useProjectStore.getState().screens)).toEqual(['old']);expect(ledgers[0].snapshot().closed).toBe(true);
});
test('split action only plans editable pages; no generation or History until user confirms',async()=>{
 await send();const before=useHistoryStore.getState().past.length;
 await act(async()=>{button('拆分为多页设计').click();await new Promise(r=>setTimeout(r,20));});
 expect(plans).toBe(1);expect(calls).toHaveLength(3);expect(host.querySelector('[data-testid="multi-page-plan"]')?.textContent).toContain('发现首页');
 expect(host.textContent).toContain('确认计划并生成 2 页');expect(Object.keys(useProjectStore.getState().screens)).toEqual(['old']);expect(useHistoryStore.getState().past.length).toBe(before);
});
test('model configuration change rejects continuation instead of sending old context to another model',async()=>{
 pauseEarly=true;await send();act(()=>useAIConfigStore.setState({bindings:{...defaultBindings,code:{...defaultBindings.code,modelId:'other-model'}}}));
 await act(async()=>{button('继续未完成设计').click();await new Promise(r=>setTimeout(r,10));});
 expect(calls).toHaveLength(2);expect(host.textContent).toContain('Provider或模型已变化');expect(ledgers[0].snapshot().closed).toBe(true);
});
test('limit without HTML is an actionable failure, never a false successful page',async()=>{
 omitHtml=true;await send();expect(calls).toHaveLength(1);expect(Object.keys(useProjectStore.getState().screens)).toEqual(['old']);
 expect(host.textContent).toContain('尚未收到可续写的 HTML');expect(host.textContent).not.toContain('已根据指示生成高保真设计');expect(button('拆分为多页设计')).toBeDefined();expect(button('继续未完成设计')).toBeUndefined();
});
test('switching projects closes a paused parent and cannot carry its checkpoint into the new project',async()=>{
 pauseEarly=true;await send();expect(ledgers[0].snapshot().closed).toBe(false);
 await act(async()=>{useProjectStore.getState().initNewProject({name:'另一工程',deviceProfile:'pc',createSpecimen:false});await new Promise(r=>setTimeout(r,20));});
 expect(ledgers[0].snapshot().closed).toBe(true);expect(calls).toHaveLength(2);expect(button('继续未完成设计')).toBeUndefined();
});
test('unmount closes paused memory-only task; reopening does not invent executable recovery',async()=>{
 pauseEarly=true;await send();expect(ledgers[0].snapshot().closed).toBe(false);
 act(()=>root.unmount());expect(ledgers[0].snapshot().closed).toBe(true);
 root=createRoot(host);await act(async()=>{root.render(<ChatDrawer/>);await new Promise(r=>setTimeout(r,20));});
 expect(calls).toHaveLength(2);expect(button('继续未完成设计')).toBeUndefined();
});
