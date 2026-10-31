import {chatPageTaskPlan} from './fixtures/pageTaskPlan';
import {afterEach,beforeEach,expect,test} from 'bun:test';
import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {ChatDrawer} from '../src/components/chat/ChatDrawer';
import {useProjectStore} from '../src/stores/useProjectStore';
import {useHistoryStore} from '../src/stores/useHistoryStore';
import {useAIConfigStore,defaultProviders,defaultBindings} from '../src/stores/useAIConfigStore';
import {DefaultAIEngineCore} from '../src/services/ai/engine/core/aiEngineCore';
import type {StreamTextOptions} from '../src/services/ai/engine/core/types';
import {PageRenderCheck} from '../src/services/ai/pageRenderCheck';
const stream=DefaultAIEngineCore.prototype.streamText,inspect=PageRenderCheck.inspect;
const prior=useProjectStore.getState(),history=useHistoryStore.getState(),config=useAIConfigStore.getState();
let host:HTMLDivElement,root:Root,previousAct:unknown,calls:StreamTextOptions[],bad:boolean;
const button=(text:string)=>[...host.querySelectorAll('button')].find(b=>b.textContent===text)!;
const delay=()=>new Promise(r=>setTimeout(r,70));
async function send(text='新建一个会员中心页面'){
 await act(async()=>{const input=host.querySelector('textarea')!;Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(input,text);input.dispatchEvent(new Event('input',{bubbles:true}));});
 await act(async()=>{(host.querySelector('button[title*="发送设计诉求"]') as HTMLButtonElement).click();await delay();});
}
beforeEach(()=>{
 previousAct=(globalThis as any).IS_REACT_ACT_ENVIRONMENT;(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;localStorage.clear();useHistoryStore.getState().restore(null);
 useProjectStore.getState().initNewProject({name:'同页分区',deviceProfile:'pc',createSpecimen:false});useAIConfigStore.setState({providers:defaultProviders.map(p=>({...p,apiKey:'fixture'})),bindings:defaultBindings});calls=[];bad=false;
 DefaultAIEngineCore.prototype.streamText=function(o){calls.push(o);const planning=Boolean((o.jsonSchema?.properties as any)?.features);const step=calls.filter(c=>!(c.jsonSchema?.properties as any)?.features).length;const text=planning?JSON.stringify(chatPageTaskPlan):o.jsonSchema?JSON.stringify({title:'会员中心',shellHtml:'<main class="container-max col gap-4 p-4"><section data-design-slot="section-1"></section><section data-design-slot="section-2"></section></main>',sections:[{id:'section-1',name:'推荐',requirements:'推荐会员'},{id:'section-2',name:'权益',requirements:'会员权益'}]}):bad&&step===3?'<artifact><style>.bad{}</style><p>不可接收</p></artifact>':`<artifact><article class="card p-4"><h2>${step===2?'推荐会员':'会员权益'}</h2><button class="btn btn-primary">查看详情</button></article></artifact>`;
  return {textStream:(async function*(){yield text;})(),reasoningStream:(async function*(){})(),textPromise:Promise.resolve(text),reasoningPromise:Promise.resolve(undefined),usagePromise:Promise.resolve({inputTokens:2,outputTokens:3}),finishReasonPromise:Promise.resolve('stop'),abort(){}};
 };
 PageRenderCheck.inspect=async()=>({status:'complete',findings:[],inspected:5});host=document.createElement('div');document.body.append(host);root=createRoot(host);act(()=>root.render(<ChatDrawer/>));
 act(()=>(host.querySelector('[aria-label="分区生成同一页"]') as HTMLInputElement).click());
});
afterEach(()=>{act(()=>root.unmount());host.remove();DefaultAIEngineCore.prototype.streamText=stream;PageRenderCheck.inspect=inspect;useProjectStore.setState(prior,true);useHistoryStore.setState(history,true);useAIConfigStore.setState(config,true);(globalThis as any).IS_REACT_ACT_ENVIRONMENT=previousAct;});
test('聊天选择分区只生成一个完整页面并支持撤销重做',async()=>{
 await send();expect(calls).toHaveLength(4);const pages=Object.values(useProjectStore.getState().screens);expect(pages).toHaveLength(1);expect(pages[0].htmlContent).toContain('推荐会员');expect(pages[0].htmlContent).toContain('会员权益');expect(pages[0].htmlContent).not.toContain('data-design-slot');expect(pages[0].metadata?.creationEvidence?.workflow.status).toBe('ready');expect(pages[0].metadata?.creationEvidence?.contract.pageTaskPlan).toBeDefined();
 act(()=>useHistoryStore.getState().undo());expect(Object.keys(useProjectStore.getState().screens)).toHaveLength(0);act(()=>useHistoryStore.getState().redo());expect(Object.keys(useProjectStore.getState().screens)).toHaveLength(1);
});
test('区块失败保持原工程，继续只请求未完成区块，不再规划',async()=>{
 bad=true;await send();expect(calls).toHaveLength(4);expect(Object.keys(useProjectStore.getState().screens)).toHaveLength(0);expect(button('继续区块设计')).toBeDefined();
 await act(async()=>{button('继续区块设计').click();await delay();});expect(calls).toHaveLength(5);expect(calls[4].jsonSchema).toBeUndefined();expect(calls[4].messages.at(-1)?.content).toContain('section-2');expect(Object.keys(useProjectStore.getState().screens)).toHaveLength(1);
});
test('同页分区不能悄悄改成多页或覆盖已有页',async()=>{
 await send('创建两个页面');expect(calls).toHaveLength(0);expect(host.textContent).toContain('多页或多方案请关闭分区选项');expect(Object.keys(useProjectStore.getState().screens)).toHaveLength(0);
});
