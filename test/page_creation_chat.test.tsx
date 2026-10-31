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
import type {AIEngineCore} from '../src/services/ai/engine/core/types';
const execute=PipelineExecutor.execute,inspect=PageRenderCheck.inspect;
let previousAct:unknown;
let root:Root,host:HTMLDivElement,answer:string,requests:number,plannerRequests:number,plannerQuestions:string[];
beforeEach(()=>{
 previousAct=(globalThis as any).IS_REACT_ACT_ENVIRONMENT;(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
 localStorage.clear();useHistoryStore.getState().restore(null);
 useProjectStore.getState().initNewProject({name:'新建聊天',deviceProfile:'mobile',designSystem:defaultTheme,createSpecimen:false});
 useProjectStore.getState().addScreen({name:'保留原页',htmlContent:'<main data-nid="old">旧页面</main>'},'old');
 useAIConfigStore.setState({providers:defaultProviders.map(p=>p.id==='prov-deepseek'?{...p,apiKey:'test'}:p),bindings:defaultBindings});
 answer='<artifact identifier="new-page" type="screen" title="资料"><main><h1>新资料</h1><button class="btn btn-primary">保存资料</button></main></artifact>';requests=0;plannerRequests=0;plannerQuestions=[];
 const core:AIEngineCore={streamText(){requests++;return {textStream:(async function*(){yield answer;})(),reasoningStream:(async function*(){})(),textPromise:Promise.resolve(answer),reasoningPromise:Promise.resolve(undefined),usagePromise:Promise.resolve(undefined),abort(){}};},async generateObject<T>(){plannerRequests++;return {...chatPageTaskPlan,questions:plannerQuestions} as T;}};
 PipelineExecutor.execute=o=>execute({...o,engineCore:core});PageRenderCheck.inspect=async()=>({status:'complete',findings:[],inspected:3});
 host=document.createElement('div');document.body.append(host);root=createRoot(host);act(()=>root.render(<ChatDrawer/>));
});
afterEach(()=>{act(()=>root.unmount());host.remove();PipelineExecutor.execute=execute;PageRenderCheck.inspect=inspect;(globalThis as any).IS_REACT_ACT_ENVIRONMENT=previousAct;});
async function send(){const input=host.querySelector('textarea')!;await act(async()=>{
 Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(input,'新建一个资料页面');input.dispatchEvent(new Event('input',{bubbles:true}));});
 await act(async()=>{(host.querySelector('button[title*="发送设计诉求"]') as HTMLButtonElement).click();await new Promise(resolve=>setTimeout(resolve,20));});
}
test('new page render failure is shown as not applied and retains original page, without a fake success',async()=>{
 PageRenderCheck.inspect=async()=>({status:'unavailable',findings:[],inspected:0,reason:'测试渲染不可用'});
 const checkpoints=useHistoryStore.getState().checkpoints.length;await send();
 expect(requests).toBe(1);expect(Object.keys(useProjectStore.getState().screens)).toEqual(['old']);expect(useProjectStore.getState().stagedScreen).toBeNull();
 expect(host.textContent).toContain('本次结果未应用');expect(host.textContent).toContain('测试渲染不可用');expect(host.textContent).not.toContain('已根据指示生成高保真设计');
 expect(useHistoryStore.getState().checkpoints).toHaveLength(checkpoints);
});
test('new page success stores actual creation proof through the same chat application path',async()=>{
 await send();expect(requests).toBe(1);expect(Object.keys(useProjectStore.getState().screens)).toHaveLength(2);
 const page=Object.values(useProjectStore.getState().screens).find(s=>s.id!=='old')!;
 expect(page.metadata!.creationEvidence!.workflow.status).toBe('ready');expect(page.metadata!.creationEvidence!.contract.operation).toBe('create');
 expect(plannerRequests).toBe(1);expect(page.metadata!.creationEvidence!.contract.pageTaskPlan?.plan.goal).toBe(chatPageTaskPlan.goal);expect(host.textContent).toContain('功能与交互规划');
 expect(useProjectStore.getState().screens.old.htmlContent).toContain('旧页面');
});

test('ordinary creation stops at critical questions without HTML or History',async()=>{
 plannerQuestions=['请确认资料的可见权限'];const before=useHistoryStore.getState().checkpoints.length;await send();
 expect(plannerRequests).toBe(1);expect(requests).toBe(0);expect(host.textContent).toContain('请确认资料的可见权限');expect(host.textContent).toContain('0 tokens');expect(host.textContent).toContain('业务规划未返回用量');expect(Object.keys(useProjectStore.getState().screens)).toEqual(['old']);expect(useHistoryStore.getState().checkpoints).toHaveLength(before);
});

test('successful creation persists the original plan and reopens it without current-page coverage or new requests',async()=>{
 await send();const turns=await useProjectStore.getState().getConversationStore().loadRecent();
 expect(turns).toHaveLength(1);expect(turns[0].assistant.pageTaskHistory?.contract.pageTaskPlan?.plan.goal).toBe(chatPageTaskPlan.goal);
 act(()=>root.unmount());const page=Object.values(useProjectStore.getState().screens).find(s=>s.id!=='old')!;
 useProjectStore.getState().updateScreenHtml(page.id,'<main>后续编辑</main>');root=createRoot(host);
 await act(async()=>{root.render(<ChatDrawer/>);await new Promise(r=>setTimeout(r,20));});
 expect(host.textContent).toContain('历史功能规划，仅供回溯');expect(host.textContent).toContain('功能与交互规划');
 expect(host.textContent).not.toContain('需求覆盖线索');expect(requests).toBe(1);expect(plannerRequests).toBe(1);
});
