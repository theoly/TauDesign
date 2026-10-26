import {afterEach,beforeEach,expect,test} from 'bun:test';
import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {ChatDrawer} from '../src/components/chat/ChatDrawer';
import {useProjectStore} from '../src/stores/useProjectStore';
import {useHistoryStore} from '../src/stores/useHistoryStore';
import {useAIConfigStore,defaultProviders,defaultBindings} from '../src/stores/useAIConfigStore';
import {PageRenderCheck} from '../src/services/ai/pageRenderCheck';
import {DefaultAIEngineCore} from '../src/services/ai/engine/core/aiEngineCore';
import type {StreamTextOptions} from '../src/services/ai/engine/core/types';
import {loadQualityDrafts} from '../src/services/storage/qualityDraftRepository';
const stream=DefaultAIEngineCore.prototype.streamText,inspect=PageRenderCheck.inspect;
const prior=useProjectStore.getState(),history=useHistoryStore.getState(),config=useAIConfigStore.getState();
let host:HTMLDivElement,root:Root,previousAct:unknown,calls:StreamTextOptions[],renderBlocked:boolean;
const button=(label:string)=>[...host.querySelectorAll('button')].find(b=>b.textContent===label)!;
const drain=()=>new Promise(r=>setTimeout(r,65));
const fill=async(el:HTMLInputElement|HTMLTextAreaElement,value:string)=>act(async()=>{Object.getOwnPropertyDescriptor(el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value')!.set!.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));});
async function send(){await fill(host.querySelector('textarea')!,'新建一个会员中心页面');await act(async()=>{(host.querySelector('button[title*="发送设计诉求"]') as HTMLButtonElement).click();await drain();});}
const card=()=>host.querySelector('[aria-label="未通过验收的页面草稿"]')!;
beforeEach(()=>{
 previousAct=(globalThis as any).IS_REACT_ACT_ENVIRONMENT;(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;localStorage.clear();useHistoryStore.getState().restore(null);
 useProjectStore.getState().initNewProject({name:'草稿测试',deviceProfile:'pc',createSpecimen:false});
 useAIConfigStore.setState({providers:defaultProviders.map(p=>p.id==='prov-deepseek'?{...p,apiKey:'fixture'}:p),bindings:defaultBindings});
 calls=[];renderBlocked=false;
 DefaultAIEngineCore.prototype.streamText=function(o){calls.push(o);const targets=o.jsonSchema?JSON.parse(o.messages.at(-1)!.content).targets:undefined;
  const text=targets?JSON.stringify({labels:targets.map((t:any)=>({nid:t.nid,text:'查看权益'}))}):'<artifact title="会员中心"><main class="container-max relative"><h1 class="text-xl">会员中心</h1><button class="btn btn-primary absolute"><svg class="icon" viewBox="0 0 24 24"><path d="M1 1L2 2"/></svg><span></span></button></main></artifact>';
  return {textStream:(async function*(){yield text;})(),reasoningStream:(async function*(){})(),textPromise:Promise.resolve(text),reasoningPromise:Promise.resolve(undefined),usagePromise:Promise.resolve({inputTokens:11,outputTokens:7}),finishReasonPromise:Promise.resolve('stop'),abort(){}};
 };
 PageRenderCheck.inspect=async()=>renderBlocked?{status:'complete',findings:[{code:'render_page_overflow',severity:'error',message:'故意的渲染失败',actual:'overflow',expected:'fit'}],inspected:5}:{status:'complete',findings:[],inspected:5};
 host=document.createElement('div');document.body.append(host);root=createRoot(host);act(()=>root.render(<ChatDrawer/>));
});
afterEach(()=>{act(()=>root.unmount());host.remove();DefaultAIEngineCore.prototype.streamText=stream;PageRenderCheck.inspect=inspect;useProjectStore.setState(prior,true);useHistoryStore.setState(history,true);useAIConfigStore.setState(config,true);(globalThis as any).IS_REACT_ACT_ENVIRONMENT=previousAct;});

test('失败保存且不可采纳；AI建议不自动改页，确认后只改文本并过实际创建管道',async()=>{
 await send();expect(calls).toHaveLength(1);expect(card().textContent).toContain('失败草稿已保存');expect(Object.keys(useProjectStore.getState().screens)).toHaveLength(0);expect(useProjectStore.getState().stagedScreen).toBeNull();
 const before=useHistoryStore.getState().past.length;
 await act(async()=>{button('AI建议文案（限一次）').click();button('AI建议文案（限一次）').click();await drain();});
 expect(calls).toHaveLength(2);expect(Object.keys(useProjectStore.getState().screens)).toHaveLength(0);expect(useHistoryStore.getState().past.length).toBe(before);
 expect((card().querySelector('input') as HTMLInputElement).value).toBe('查看权益');
 await act(async()=>{button('确认文案并定点修复').click();await drain();});
 expect(calls).toHaveLength(2);const pages=Object.values(useProjectStore.getState().screens);expect(pages).toHaveLength(1);expect(pages[0].htmlContent).toContain('查看权益');expect(pages[0].htmlContent).toContain('relative');expect(pages[0].metadata?.creationEvidence?.workflow.status).toBe('ready');
 expect(await loadQualityDrafts(useProjectStore.getState().id)).toHaveLength(0);
});
test('重新挂载恢复失败草稿，手填修复无需模型；上下文变化拒绝旧草稿',async()=>{
 await send();await act(async()=>{root.unmount();root=createRoot(host);root.render(<ChatDrawer/>);await drain();});
 expect(card()).toBeDefined();expect(card().textContent).toContain('草稿');
 await fill(card().querySelector('input')!,'查看权益');act(()=>useProjectStore.getState().addDecision('改用新规范','global'));
 await act(async()=>{button('确认文案并定点修复').click();await drain();});
 expect(calls).toHaveLength(1);expect(Object.keys(useProjectStore.getState().screens)).toHaveLength(0);expect(card().textContent).toContain('已变化');
});
test('定点文案通过仍不能跳过真实渲染失败',async()=>{
 await send();await fill(card().querySelector('input')!,'查看权益');renderBlocked=true;
 await act(async()=>{button('确认文案并定点修复').click();await drain();});
 expect(calls).toHaveLength(1);expect(Object.keys(useProjectStore.getState().screens)).toHaveLength(0);expect(host.textContent).toContain('故意的渲染失败');
 expect(await loadQualityDrafts(useProjectStore.getState().id)).toHaveLength(1);
});
