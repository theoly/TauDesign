import {chatPageTaskPlan} from './fixtures/pageTaskPlan';
import {stubPageCreationRender} from './helpers/pageCreation';
stubPageCreationRender();
import {test,expect} from 'bun:test';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {ChatDrawer} from '../src/components/chat/ChatDrawer';
import {useProjectStore} from '../src/stores/useProjectStore';
import {useHistoryStore} from '../src/stores/useHistoryStore';
import {useAIConfigStore,defaultProviders,defaultBindings} from '../src/stores/useAIConfigStore';
import {defaultTheme} from '../src/utils/themePresets';
import {PipelineExecutor} from '../src/services/ai/engine/pipeline/executor';
import type {AIEngineCore,StreamTextOptions} from '../src/services/ai/engine/core/types';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;

test('chat name-reference passes current source styles and creates a separate page with source unchanged',async()=>{
 localStorage.clear();useHistoryStore.getState().restore(null);
 const store=useProjectStore.getState();store.initNewProject({name:'Named refs',deviceProfile:'pc',designSystem:defaultTheme,createSpecimen:false});
 store.addScreen({name:'订单管理',htmlContent:'<main data-nid="root1"><h1>原订单标题</h1><button data-nid="submit">保存订单</button></main>',scopedCss:'.source-only{border-radius:19px}'},'original');
 store.setOverride('original','submit',{'border-radius':'31px'},true);
 const before=JSON.stringify({screen:useProjectStore.getState().screens.original,override:useProjectStore.getState().overrides['original:submit']});
 useAIConfigStore.setState({providers:defaultProviders.map(p=>p.id==='prov-deepseek'?{...p,apiKey:'sk-test'}:p),bindings:defaultBindings});
 const calls:StreamTextOptions[]=[];const answer='<artifact identifier="screen_new" type="screen" title="订单详情"><main class="container-max"><h1>订单详情</h1><button class="btn-primary">确认订单</button></main></artifact>';
 const core:AIEngineCore={streamText(o){calls.push(o);return{textStream:(async function*(){yield answer;})(),reasoningStream:(async function*(){})(),textPromise:Promise.resolve(answer),reasoningPromise:Promise.resolve(undefined),usagePromise:Promise.resolve(undefined),abort(){}};},async generateObject<T>(){return structuredClone(chatPageTaskPlan) as T;}};
 const execute=PipelineExecutor.execute;PipelineExecutor.execute=o=>execute({...o,engineCore:core});
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 try{act(()=>root.render(<ChatDrawer/>));const textarea=host.querySelector('textarea')!;act(()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(textarea,'参考订单管理，创建一个订单详情页');textarea.dispatchEvent(new Event('input',{bubbles:true}));});
 await act(async()=>{(host.querySelector('button[title*="发送设计诉求"]') as HTMLButtonElement).click();});
 expect(calls).toHaveLength(1);const actual=calls[0].messages.map(m=>m.content).join('\n');expect(actual).toContain('31px');expect(actual).toContain('.source-only');expect(actual).toContain('保存订单');
 expect(Object.keys(useProjectStore.getState().screens)).toHaveLength(2);expect(JSON.stringify({screen:useProjectStore.getState().screens.original,override:useProjectStore.getState().overrides['original:submit']})).toBe(before);expect(host.textContent).toContain('引用画框:');expect(host.textContent).toContain('@订单管理');
 }finally{PipelineExecutor.execute=execute;act(()=>root.unmount());host.remove();}
});
