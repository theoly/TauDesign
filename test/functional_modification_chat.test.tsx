import {beforeEach,afterEach,expect,test} from 'bun:test';
import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {useAIEngineChat} from '../src/services/ai/engine/react/useAIEngineChat';
import {PipelineExecutor} from '../src/services/ai/engine/pipeline/executor';
import {useProjectStore} from '../src/stores/useProjectStore';
import {useHistoryStore} from '../src/stores/useHistoryStore';
import {useAIConfigStore,defaultBindings,defaultProviders} from '../src/stores/useAIConfigStore';
import {defaultTheme} from '../src/utils/themePresets';
import type {AIEngineCore,StreamTextOptions} from '../src/services/ai/engine/core/types';
import {chatPageTaskPlan} from './fixtures/pageTaskPlan';
import {ChatDrawer} from '../src/components/chat/ChatDrawer';
const execute=PipelineExecutor.execute;
let root:Root,host:HTMLDivElement,engine:ReturnType<typeof useAIEngineChat>,calls:string[],plannerInput:StreamTextOptions|undefined,oldAct:unknown;
let originalProject:ReturnType<typeof useProjectStore.getState>,originalHistory:ReturnType<typeof useHistoryStore.getState>,originalConfig:ReturnType<typeof useAIConfigStore.getState>;
const original='<main data-nid="root0001"><h1 data-nid="head0001">会员资料</h1></main>';
const Harness=()=>{engine=useAIEngineChat();return null;};
beforeEach(async()=>{
 originalProject=useProjectStore.getState();originalHistory=useHistoryStore.getState();originalConfig=useAIConfigStore.getState();oldAct=(globalThis as any).IS_REACT_ACT_ENVIRONMENT;(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
 localStorage.clear();useHistoryStore.getState().restore(null);useProjectStore.getState().initNewProject({name:'功能修改',deviceProfile:'mobile',designSystem:defaultTheme,createSpecimen:false});
 useProjectStore.getState().addScreen({name:'会员资料',htmlContent:original},'page');useAIConfigStore.setState({providers:defaultProviders.map(p=>({...p,apiKey:'fixture'})),bindings:defaultBindings});calls=[];plannerInput=undefined;
 const core:AIEngineCore={async generateObject<T>(_schema,options){calls.push('plan');plannerInput=options;return {...chatPageTaskPlan,features:chatPageTaskPlan.features.map(f=>({...f,title:'邮箱',information:[{label:'邮箱',kind:'input'}],interactions:[{label:'保存资料',precondition:'邮箱已填写',outcome:'显示结果',targetScreenId:''}]}))} as T;},
 streamText(options){calls.push('html');const functional=options.messages.some(m=>m.content.includes('PAGE TASK PLAN'));const html=functional?'<main data-nid="root0001"><h1 data-nid="head0001">会员资料</h1><label>邮箱<input class="input"/></label><button class="btn btn-primary">保存资料</button></main>':'<main data-nid="root0001"><h1 data-nid="head0001" class="font-semibold">会员资料</h1></main>';
 const text=`<artifact title="会员资料">${html}</artifact>`;return {textStream:(async function*(){yield text;})(),reasoningStream:(async function*(){})(),textPromise:Promise.resolve(text),reasoningPromise:Promise.resolve(undefined),usagePromise:Promise.resolve(undefined),abort(){}};}};
 PipelineExecutor.execute=options=>execute({...options,engineCore:core});host=document.createElement('div');document.body.append(host);root=createRoot(host);await act(async()=>{root.render(<Harness/>);});
});
afterEach(()=>{act(()=>root.unmount());host.remove();PipelineExecutor.execute=execute;useProjectStore.setState(originalProject,true);useHistoryStore.setState(originalHistory,true);useAIConfigStore.setState(originalConfig,true);(globalThis as any).IS_REACT_ACT_ENVIRONMENT=oldAct;});
test('explicit page functionality plans before HTML and stages a copy without selectable reanalysis',async()=>{
 await act(async()=>{await engine.sendMessage('修改当前页面，增加邮箱输入框和保存按钮',undefined,{referencedScreenId:'page'});});
 expect(calls).toEqual(['plan','html']);expect(plannerInput?.messages.at(-1)?.content).toContain(original.replaceAll('"','\\"'));
 const candidate=useProjectStore.getState().stagedScreen;expect(candidate).not.toBeNull();expect(candidate?.workflowContract?.pageTaskPlan).toBeDefined();expect(candidate?.newHtml).toContain('保存资料');
 expect(useProjectStore.getState().screens.page.htmlContent).toBe(original);expect(engine.messages.some(m=>m.modificationReview)).toBe(false);
});
test('explicit page visual detail skips business planning and preserves existing modification behavior',async()=>{
 await act(async()=>{await engine.sendMessage('修改当前页面，把标题字体加粗',undefined,{referencedScreenId:'page'});});
 expect(calls).toEqual(['html']);expect(useProjectStore.getState().stagedScreen?.workflowContract?.pageTaskPlan).toBeUndefined();expect(useProjectStore.getState().screens.page.htmlContent).toBe(original);
});
test('successful functionality turn restores its own read-only plan even after the current page changes',async()=>{
 await act(async()=>{await engine.sendMessage('修改当前页面，增加邮箱输入框和保存按钮',undefined,{referencedScreenId:'page'});});
 const turns=await useProjectStore.getState().getConversationStore().loadRecent();
 expect(turns).toHaveLength(1);const saved=turns[0].assistant.pageTaskHistory!;expect(saved.contract.pageTaskPlan).toBeDefined();
 await act(async()=>{root.unmount();});
 useProjectStore.getState().updateScreenHtml('page','<main>后来彻底调整的页面</main>');
 root=createRoot(host);await act(async()=>{root.render(<Harness/>);await new Promise(r=>setTimeout(r,20));});
 const restored=engine.messages.find(m=>m.historicalPageTask)!;
 expect(restored.historicalPageTask?.contract.pageTaskPlan).toEqual(saved.contract.pageTaskPlan);
 expect(restored.workflowContract).toBeUndefined();expect(restored.htmlOutput).toBeUndefined();
 expect(restored.originalDecision).toBeUndefined();expect(restored.continuationAvailable).toBeUndefined();
 expect(restored.historicalPageTaskNotice).toContain('仅供回溯');expect(calls).toEqual(['plan','html']);
 await act(async()=>root.unmount());root=createRoot(host);
 await act(async()=>{root.render(<ChatDrawer/>);await new Promise(r=>setTimeout(r,20));});
 expect(host.textContent).toContain('功能与交互规划');expect(host.textContent).toContain('历史功能规划，仅供回溯');
 expect(host.textContent).not.toContain('需求覆盖线索');
});
test('invalid history keeps its text without borrowing a candidate plan or exposing recovery actions',async()=>{
 const store=useProjectStore.getState().getConversationStore();
 await store.appendTurn({turnId:'invalid',ts:Date.now(),user:{text:'旧请求'},assistant:{text:'这一轮的历史正文',pageTaskHistory:{version:1,contract:{} as any}}});
 await act(async()=>root.unmount());root=createRoot(host);
 await act(async()=>{root.render(<Harness/>);await new Promise(r=>setTimeout(r,20));});
 const restored=engine.messages.find(m=>m.id==='ast_invalid')!;
 expect(restored.text).toBe('这一轮的历史正文');expect(restored.historicalPageTask).toBeUndefined();
 expect(restored.historicalPageTaskNotice).toContain('记录无效');expect(restored.workflowContract).toBeUndefined();expect(calls).toEqual([]);
});
