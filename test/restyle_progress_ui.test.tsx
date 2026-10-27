import {expect,test,spyOn,beforeEach,afterEach} from 'bun:test';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import * as engine from '../src/services/ai/engine/core';
import {useAIConfigStore} from '../src/stores/useAIConfigStore';
import {RestylePanel} from '../src/components/theme/RestylePanel';
import {useProjectStore} from '../src/stores/useProjectStore';
let priorAct:unknown;
beforeEach(()=>{priorAct=(globalThis as any).IS_REACT_ACT_ENVIRONMENT;(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;});
afterEach(()=>{(globalThis as any).IS_REACT_ACT_ENVIRONMENT=priorAct;});
test('batch preflight skips token-bound pages and permits explicit selection',async()=>{
 const prior=useProjectStore.getState();const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 try{prior.initNewProject({name:'Preflight',deviceProfile:'pc',createSpecimen:false});useProjectStore.getState().addScreen({name:'Page',htmlContent:'<main data-nid="aaaaaaaa" class="card">Hello</main>',position:{x:0,y:0}},'s');
 await act(async()=>root.render(<RestylePanel scope="all" onClose={()=>{}}/>));
 expect(host.textContent).toContain('未发现必须重塑项');
 const checkbox=host.querySelector('input[type="checkbox"]') as HTMLInputElement;expect(checkbox.checked).toBe(false);
 expect(Array.from(host.querySelectorAll('button')).find(b=>b.textContent?.includes('试跑单个目标'))?.disabled).toBe(true);
 await act(async()=>checkbox.click());
 expect(Array.from(host.querySelectorAll('button')).find(b=>b.textContent?.includes('试跑单个目标'))?.disabled).toBe(false);
 }finally{act(()=>root.unmount());host.remove();useProjectStore.setState(prior,true);}
});

test('controlled stalled stream shows counters and stop releases busy without applying',async()=>{
 const prior=useProjectStore.getState(),config=useAIConfigStore.getState();const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 const never=new Promise<any>(()=>{});let aborted=false;
 const create=spyOn(engine,'createAIEngineCore').mockReturnValue({generateObject:async()=>{throw Error('unused');},streamText:()=>({
 textStream:(async function*(){yield 'abc';await never;})(),reasoningStream:(async function*(){yield 'hidden thoughts';})(),textPromise:never,reasoningPromise:never,usagePromise:never,abort:()=>{aborted=true;}
 })} as any);
 try{
 prior.initNewProject({name:'Stall fixture',deviceProfile:'pc',createSpecimen:false});useProjectStore.getState().addScreen({name:'Page',htmlContent:'<main data-nid="aaaaaaaa" class="card">Hello</main>',position:{x:0,y:0}},'s');
 const before=useProjectStore.getState().screens.s.htmlContent;
 useAIConfigStore.setState({getActiveProviderForRole:()=>({provider:{id:'fixture',name:'Controlled provider',apiKey:'DO_NOT_SHOW',baseUrl:'https://invalid.test',protocol:'openai_compatible',isEnabled:true,defaultModel:'fixture-model'},modelId:'fixture-model'})});
 await act(async()=>root.render(<RestylePanel scope="all" onClose={()=>{}}/>));
 await act(async()=>(host.querySelector('input[type="checkbox"]') as HTMLInputElement).click());
 await act(async()=>{Array.from(host.querySelectorAll('button')).find(b=>b.textContent?.includes('试跑单个目标'))!.click();await new Promise(r=>setTimeout(r,5));});
 expect(host.textContent).toContain('Controlled provider / fixture-model');expect(host.textContent).toContain('正文 3 字符');expect(host.textContent).toContain('推理 15 字符');expect(host.textContent).not.toContain('hidden thoughts');expect(host.textContent).not.toContain('DO_NOT_SHOW');
 await act(async()=>{Array.from(host.querySelectorAll('button')).find(b=>b.textContent==='停止重塑')!.click();await new Promise(r=>setTimeout(r,0));});
 expect(aborted).toBe(true);expect(host.textContent).toContain('重塑已停止');expect(useProjectStore.getState().screens.s.htmlContent).toBe(before);
 expect(Array.from(host.querySelectorAll('button')).find(b=>b.textContent?.includes('试跑单个目标'))?.disabled).toBe(false);
 }finally{act(()=>root.unmount());host.remove();create.mockRestore();useProjectStore.setState(prior,true);useAIConfigStore.setState(config,true);}
});

test('single imported-page estimate uses CSS variable groups rather than ineffective native classes',async()=>{
 const prior=useProjectStore.getState(),host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 try{
  prior.initNewProject({name:'Large imported single',deviceProfile:'pc',createSpecimen:false});
  const variables=Array.from({length:13},(_,i)=>`--c${i}:#ff6600;`).join('');
  useProjectStore.getState().addScreen({name:'Imported',htmlContent:`<style>:root{${variables}}/*${'keep '.repeat(5000)}*/</style><main data-nid="root0001">内容</main>`,metadata:{importedHtml:{fileName:'sample.html',mode:'preserve',categories:[],changes:[],retained:[],version:1}},position:{x:0,y:0}},'s');
  await act(async()=>root.render(<RestylePanel scope="s" onClose={()=>{}}/>));
  expect(host.textContent).toContain('预计 3 次 AI 调用');
 }finally{act(()=>root.unmount());host.remove();useProjectStore.setState(prior,true);}
});
