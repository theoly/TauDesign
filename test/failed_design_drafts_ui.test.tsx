import {chatPageTaskPlan} from './fixtures/pageTaskPlan';
import {afterEach,beforeEach,expect,spyOn,test} from 'bun:test';
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
import * as DraftRepository from '../src/services/storage/qualityDraftRepository';
const stream=DefaultAIEngineCore.prototype.streamText,inspect=PageRenderCheck.inspect;
const prior=useProjectStore.getState(),history=useHistoryStore.getState(),config=useAIConfigStore.getState();
let host:HTMLDivElement,root:Root,previousAct:unknown,calls:StreamTextOptions[],renderBlocked:boolean,holdSuggestion:boolean,releaseSuggestion:(text?:string)=>void;
const button=(label:string)=>[...host.querySelectorAll('button')].find(b=>b.textContent===label)!;
const drain=()=>new Promise(r=>setTimeout(r,65));
const fill=async(el:HTMLInputElement|HTMLTextAreaElement,value:string)=>act(async()=>{Object.getOwnPropertyDescriptor(el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value')!.set!.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));});
async function send(){await fill(host.querySelector('textarea')!,'新建一个会员中心页面');await act(async()=>{(host.querySelector('button[title*="发送设计诉求"]') as HTMLButtonElement).click();await drain();});}
const card=()=>host.querySelector('[aria-label="未通过验收的页面草稿"]')!;
beforeEach(()=>{
 previousAct=(globalThis as any).IS_REACT_ACT_ENVIRONMENT;(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;localStorage.clear();useHistoryStore.getState().restore(null);
 useProjectStore.getState().initNewProject({name:'草稿测试',deviceProfile:'pc',createSpecimen:false});
 useAIConfigStore.setState({providers:defaultProviders.map(p=>p.id==='prov-deepseek'?{...p,apiKey:'fixture'}:p),bindings:defaultBindings});
 calls=[];renderBlocked=false;holdSuggestion=false;
 DefaultAIEngineCore.prototype.streamText=function(o){calls.push(o);const planning=Boolean((o.jsonSchema?.properties as any)?.features);const targets=o.jsonSchema&&!planning?JSON.parse(o.messages.at(-1)!.content).targets:undefined;
  const text=planning?JSON.stringify(chatPageTaskPlan):targets?JSON.stringify({labels:targets.map((t:any)=>({nid:t.nid,text:'查看权益'}))}):'<artifact title="会员中心"><main class="container-max relative"><h1 class="text-xl">会员中心</h1><button class="btn btn-primary absolute"><svg class="icon" viewBox="0 0 24 24"><path d="M1 1L2 2"/></svg><span></span></button></main></artifact>';
  if(targets&&holdSuggestion){let resolve!:(text:string)=>void;const pending=new Promise<string>(r=>resolve=r);releaseSuggestion=value=>resolve(value??text);return {textStream:(async function*(){yield await pending;})(),reasoningStream:(async function*(){})(),textPromise:pending,reasoningPromise:Promise.resolve(undefined),usagePromise:Promise.resolve({inputTokens:11,outputTokens:7}),finishReasonPromise:Promise.resolve('stop'),abort(){}};}
  return {textStream:(async function*(){yield text;})(),reasoningStream:(async function*(){})(),textPromise:Promise.resolve(text),reasoningPromise:Promise.resolve(undefined),usagePromise:Promise.resolve({inputTokens:11,outputTokens:7}),finishReasonPromise:Promise.resolve('stop'),abort(){}};
 };
 PageRenderCheck.inspect=async()=>renderBlocked?{status:'complete',findings:[{code:'render_page_overflow',severity:'error',message:'故意的渲染失败',actual:'overflow',expected:'fit'}],inspected:5}:{status:'complete',findings:[],inspected:5};
 host=document.createElement('div');document.body.append(host);root=createRoot(host);act(()=>root.render(<ChatDrawer/>));
});
afterEach(()=>{act(()=>root.unmount());host.remove();DefaultAIEngineCore.prototype.streamText=stream;PageRenderCheck.inspect=inspect;useProjectStore.setState(prior,true);useHistoryStore.setState(history,true);useAIConfigStore.setState(config,true);(globalThis as any).IS_REACT_ACT_ENVIRONMENT=previousAct;});

test('失败保存且不可采纳；AI建议不自动改页，确认后只改文本并过实际创建管道',async()=>{
 await send();expect(calls).toHaveLength(2);expect(card().textContent).toContain('失败草稿已保存');expect(Object.keys(useProjectStore.getState().screens)).toHaveLength(0);expect(useProjectStore.getState().stagedScreen).toBeNull();
 const before=useHistoryStore.getState().past.length;
 await act(async()=>{button('AI建议文案（限一次）').click();button('AI建议文案（限一次）').click();await drain();});
 expect(calls).toHaveLength(3);expect(Object.keys(useProjectStore.getState().screens)).toHaveLength(0);expect(useHistoryStore.getState().past.length).toBe(before);
 expect((card().querySelector('input') as HTMLInputElement).value).toBe('查看权益');
 await act(async()=>{button('确认文案并定点修复').click();await drain();});
 expect(calls).toHaveLength(3);const pages=Object.values(useProjectStore.getState().screens);expect(pages).toHaveLength(1);expect(pages[0].htmlContent).toContain('查看权益');expect(pages[0].htmlContent).toContain('relative');expect(pages[0].metadata?.creationEvidence?.workflow.status).toBe('ready');
 expect(await loadQualityDrafts(useProjectStore.getState().id)).toHaveLength(0);expect(pages[0].metadata?.creationEvidence?.contract.pageTaskPlan).toBeDefined();expect(calls.filter(c=>(c.jsonSchema?.properties as any)?.features)).toHaveLength(1);
});
test('重新挂载恢复失败草稿，手填修复无需模型；上下文变化拒绝旧草稿',async()=>{
 await send();await act(async()=>{root.unmount();root=createRoot(host);root.render(<ChatDrawer/>);await drain();});
 expect(card()).toBeDefined();expect(card().textContent).toContain('草稿');
 await fill(card().querySelector('input')!,'查看权益');act(()=>useProjectStore.getState().addDecision('改用新规范','global'));
 await act(async()=>{button('确认文案并定点修复').click();await drain();});
 expect(calls).toHaveLength(2);expect(Object.keys(useProjectStore.getState().screens)).toHaveLength(0);expect(card().textContent).toContain('已变化');
});
test('定点文案通过仍不能跳过真实渲染失败',async()=>{
 await send();await fill(card().querySelector('input')!,'查看权益');renderBlocked=true;
 await act(async()=>{button('确认文案并定点修复').click();await drain();});
 expect(calls).toHaveLength(2);expect(Object.keys(useProjectStore.getState().screens)).toHaveLength(0);expect(host.textContent).toContain('故意的渲染失败');
 expect(await loadQualityDrafts(useProjectStore.getState().id)).toHaveLength(1);
});

test('重开后手填修复继承原功能规划，零新增模型请求',async()=>{
 await send();const saved=await loadQualityDrafts(useProjectStore.getState().id);expect(saved[0].draft.pageTaskSource?.pageTaskPlan).toBeDefined();
 await act(async()=>{root.unmount();root=createRoot(host);root.render(<ChatDrawer/>);await drain();});
 await fill(card().querySelector('input')!,'查看权益');await act(async()=>{button('确认文案并定点修复').click();await drain();});
 expect(calls).toHaveLength(2);const page=Object.values(useProjectStore.getState().screens)[0];expect(page).toBeDefined();expect(page.metadata?.creationEvidence?.contract.pageTaskPlan).toEqual(saved[0].draft.pageTaskSource?.pageTaskPlan);
});
test('建议真实等待只计一次，返回不创建页面；一次标记先落盘并在重开后保留',async()=>{
 await send();holdSuggestion=true;await act(async()=>{button('AI建议文案（限一次）').click();await drain();});expect(calls).toHaveLength(3);
 const pending=host.querySelector('[aria-label="应用调用摘要"]')!;expect(pending.textContent).toContain('等待调用返回');expect(pending.textContent).toContain('调用尝试 1 次');expect(pending.textContent).toContain('进行中 1 次');
 expect((await loadQualityDrafts(useProjectStore.getState().id))[0].aiAttempted).toBe(true);expect(button('AI建议文案（限一次）').disabled).toBe(true);
 await act(async()=>{releaseSuggestion();await drain();});expect(pending.textContent).toContain('调用已返回');expect(pending.textContent).toContain('进行中 0 次');expect((card().querySelector('input') as HTMLInputElement).value).toBe('查看权益');expect(Object.keys(useProjectStore.getState().screens)).toHaveLength(0);
 await act(async()=>{root.unmount();root=createRoot(host);root.render(<ChatDrawer/>);await drain();});expect(button('AI建议文案（限一次）').disabled).toBe(true);expect(calls).toHaveLength(3);
});
for(const changed of ['cancel','model','project'] as const)test(`${changed} during pending suggestion refuses late labels without resetting the persisted attempt`,async()=>{
 await send();const originalId=useProjectStore.getState().id;holdSuggestion=true;await act(async()=>{button('AI建议文案（限一次）').click();await drain();});expect(calls).toHaveLength(3);expect(host.textContent).toContain('进行中 1 次');
 await act(async()=>{
  if(changed==='cancel')(host.querySelector('button[title*="立即停止"]') as HTMLButtonElement).click();
  else if(changed==='model')useAIConfigStore.getState().setRoleBinding('code',{role:'code',providerId:'prov-openai',modelId:'gpt-4o'});
  else useProjectStore.getState().initNewProject({name:'后续工程',deviceProfile:'pc',createSpecimen:false});
  await drain();
 });
 await act(async()=>{releaseSuggestion();await drain();});expect(calls).toHaveLength(3);expect(host.querySelector('button[title*="立即停止"]')).toBeNull();expect(Object.keys(useProjectStore.getState().screens)).toHaveLength(0);
 const saved=(await loadQualityDrafts(originalId))[0];expect(saved.aiAttempted).toBe(true);expect(saved.suggestions).toBeUndefined();
 if(changed!=='project'){expect((card().querySelector('input') as HTMLInputElement).value).toBe('');expect(host.textContent).toContain('进行中 0 次');expect(button('AI建议文案（限一次）').disabled).toBe(true);}
 else expect(await loadQualityDrafts(useProjectStore.getState().id)).toEqual([]);
});
test('stopped suggestion cannot restore a draft already resolved by zero-request manual repair',async()=>{
 await send();const id=useProjectStore.getState().id;holdSuggestion=true;await act(async()=>{button('AI建议文案（限一次）').click();await drain();});expect(calls).toHaveLength(3);
 await act(async()=>{(host.querySelector('button[title*="立即停止"]') as HTMLButtonElement).click();await drain();});
 await fill(card().querySelector('input')!,'手填权益');await act(async()=>{button('确认文案并定点修复').click();await drain();});expect(Object.keys(useProjectStore.getState().screens)).toHaveLength(1);expect(await loadQualityDrafts(id)).toEqual([]);
 await act(async()=>{releaseSuggestion();await drain();});expect(calls).toHaveLength(3);expect(await loadQualityDrafts(id)).toEqual([]);expect(Object.values(useProjectStore.getState().screens)[0].htmlContent).toContain('手填权益');expect(host.textContent).not.toContain('建议已填入');
});
test('a delayed suggestion save cannot resurrect a draft resolved by a newer manual repair',async()=>{
 await send();const id=useProjectStore.getState().id,realSave=DraftRepository.saveQualityDraft;let release!:()=>void,delayed=0;
 const waiting=new Promise<void>(resolve=>release=resolve),save=spyOn(DraftRepository,'saveQualityDraft').mockImplementation(async(value,folder)=>{
  if(value.status==='blocked'&&value.suggestions?.length){delayed++;await waiting;}return realSave(value,folder);
 });
 try{
  await act(async()=>{button('AI建议文案（限一次）').click();await drain();});expect(delayed).toBe(1);expect(calls).toHaveLength(3);
  await act(async()=>{(host.querySelector('button[title*="立即停止"]') as HTMLButtonElement).click();await drain();});await fill(card().querySelector('input')!,'手动确认');
  await act(async()=>{button('确认文案并定点修复').click();await drain();});expect(await loadQualityDrafts(id)).toEqual([]);expect(card().textContent).toContain('原失败草稿 · 已完成修复');
  await act(async()=>{release();await drain();});expect(await loadQualityDrafts(id)).toEqual([]);expect(card().textContent).toContain('原失败草稿 · 已完成修复');expect(Object.values(useProjectStore.getState().screens)[0].htmlContent).toContain('手动确认');expect(calls).toHaveLength(3);
 }finally{release();save.mockRestore();}
});
test('cancelling while suggestions are saving removes late labels from both the UI and reopened draft',async()=>{
 await send();const id=useProjectStore.getState().id,realSave=DraftRepository.saveQualityDraft;let release!:()=>void,delayed=0;
 const waiting=new Promise<void>(resolve=>release=resolve),save=spyOn(DraftRepository,'saveQualityDraft').mockImplementation(async(value,folder)=>{if(value.suggestions?.length){delayed++;await waiting;}return realSave(value,folder);});
 try{
  await act(async()=>{button('AI建议文案（限一次）').click();await drain();});expect(delayed).toBe(1);
  await act(async()=>{(host.querySelector('button[title*="立即停止"]') as HTMLButtonElement).click();await drain();release();await drain();});
  const saved=(await loadQualityDrafts(id))[0];expect(saved.aiAttempted).toBe(true);expect(saved.suggestions).toBeUndefined();expect((card().querySelector('input') as HTMLInputElement).value).toBe('');
  await act(async()=>{root.unmount();root=createRoot(host);root.render(<ChatDrawer/>);await drain();});expect((card().querySelector('input') as HTMLInputElement).value).toBe('');expect(button('AI建议文案（限一次）').disabled).toBe(true);expect(calls).toHaveLength(3);
 }finally{release();save.mockRestore();}
});
for(const change of ['cancel-repair','model'] as const)test(`${change} during the persisted suggestion claim cannot dispatch or overwrite a newer result`,async()=>{
 await send();const id=useProjectStore.getState().id,realClaim=DraftRepository.claimDraftSuggestion;let release!:()=>void,claimed=false;
 const waiting=new Promise<void>(resolve=>release=resolve),claim=spyOn(DraftRepository,'claimDraftSuggestion').mockImplementation(async(value,folder)=>{const result=await realClaim(value,folder);claimed=true;await waiting;return result;});
 try{
  await act(async()=>{button('AI建议文案（限一次）').click();await drain();});expect(claimed).toBe(true);expect(calls).toHaveLength(2);
  if(change==='cancel-repair'){
   await act(async()=>{(host.querySelector('button[title*="立即停止"]') as HTMLButtonElement).click();await drain();});await fill(card().querySelector('input')!,'手动确认');await act(async()=>{button('确认文案并定点修复').click();await drain();});
  }else act(()=>useAIConfigStore.getState().setRoleBinding('code',{role:'code',providerId:'prov-openai',modelId:'gpt-4o'}));
  await act(async()=>{release();await drain();});expect(calls).toHaveLength(2);
  if(change==='cancel-repair'){expect(await loadQualityDrafts(id)).toEqual([]);expect(card().textContent).toContain('原失败草稿 · 已完成修复');}
  else {expect((await loadQualityDrafts(id))[0].aiAttempted).toBe(true);expect(button('AI建议文案（限一次）').disabled).toBe(true);}
 }finally{release();claim.mockRestore();}
});
