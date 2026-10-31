import {afterEach,beforeEach,expect,test} from 'bun:test';
import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {ChatDrawer} from '../src/components/chat/ChatDrawer';
import {useProjectStore} from '../src/stores/useProjectStore';
import {useHistoryStore} from '../src/stores/useHistoryStore';
import {useAIConfigStore,defaultProviders,defaultBindings} from '../src/stores/useAIConfigStore';
import {neutralModernTheme} from '../src/utils/themePresets';
import {AIService} from '../src/services/ai/aiService';
import {PipelineExecutor,type ExecutePipelineOptions} from '../src/services/ai/engine/pipeline/executor';
import type {PipelineOutput} from '../src/services/ai/engine/pipeline/types';
import type {StreamEvent} from '../src/types/provider';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
let prior:ReturnType<typeof useProjectStore.getState>,history:ReturnType<typeof useHistoryStore.getState>,config:ReturnType<typeof useAIConfigStore.getState>;
let host:HTMLDivElement,root:Root,emit:(event:StreamEvent)=>void,resolveTransport:()=>void,abortCount:number;
const originalStream=AIService.stream,originalExecute=PipelineExecutor.execute;
const pause=(ms=0)=>new Promise(resolve=>setTimeout(resolve,ms));
beforeEach(async()=>{
 prior=useProjectStore.getState();history=useHistoryStore.getState();config=useAIConfigStore.getState();
 useProjectStore.getState().initNewProject({name:'真实进度',deviceProfile:'pc',designSystem:neutralModernTheme,createSpecimen:false});
 useAIConfigStore.setState({providers:defaultProviders.map(p=>p.id==='prov-deepseek'?{...p,apiKey:'PROGRESS_SECRET'}:p),bindings:defaultBindings});
 abortCount=0;AIService.stream=(_provider,_model,_messages,onEvent)=>{emit=onEvent;return {abort(){abortCount++;},promise:new Promise<void>(resolve=>resolveTransport=resolve)};};
 host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);
 await act(async()=>{root.render(<ChatDrawer/>);await pause();});
});
afterEach(()=>{
 act(()=>root.unmount());host.remove();AIService.stream=originalStream;PipelineExecutor.execute=originalExecute;
 useProjectStore.setState(prior,true);useHistoryStore.setState(history,true);useAIConfigStore.setState(config,true);
});
async function send(text='什么是布局？'){
 await act(async()=>{const input=host.querySelector('textarea')!;Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(input,text);input.dispatchEvent(new Event('input',{bubbles:true}));});
 await act(async()=>{(host.querySelector('button[title*="发送设计诉求"]') as HTMLButtonElement).click();await pause();});
}
function finish(text='这是答复。'){emit({type:'Delta',text});emit({type:'Done',finish_reason:'stop'});resolveTransport();}

test('waiting beyond old timers never invents later steps, and real text/reasoning update the summary',async()=>{
 await send();await act(async()=>{await pause(1300);});
 expect(host.textContent).toContain('等待调用返回');expect(host.textContent).toContain('调用尝试 1 次');
 expect(host.textContent).toContain('调用模型生成结果');expect(host.textContent).not.toContain('检查返回内容与源码');
 expect(host.textContent).not.toContain('构建组件语义树');expect(host.textContent).not.toContain('PROGRESS_SECRET');
 expect(host.textContent).not.toContain('流式编写页面代码');
 await act(async()=>{finish('<think>比较布局</think>这是答复。');await pause(10);});
 const card=host.querySelector('[aria-label="应用调用摘要"]')!;
 expect(card.textContent).toContain('调用已返回');expect(card.textContent).toContain('进行中 0 次');
 expect(card.textContent).toContain('正文 5 字符');expect(card.textContent).toContain('推理 4 字符');
 expect(Object.keys(useProjectStore.getState().screens)).toHaveLength(0);
});
test('stop preserves cancelled state and rejects late text, reasoning and completion',async()=>{
 await send();const button=host.querySelector('button[title*="立即停止"]') as HTMLButtonElement;expect(button).not.toBeNull();
 await act(async()=>{button.click();await pause();});expect(abortCount).toBeGreaterThan(0);
 expect(host.textContent).toContain('调用已停止');expect(host.textContent).toContain('进行中 0 次');
 await act(async()=>{finish('<think>迟到推理</think>迟到正文');await pause(10);});
 expect(host.textContent).not.toContain('迟到正文');expect(host.textContent).not.toContain('迟到推理');expect(host.textContent).toContain('已中止');
});
test('old task completion after switching projects cannot unlock or overwrite the new task',async()=>{
 const calls:Array<{options:ExecutePipelineOptions;resolve:(output:PipelineOutput)=>void}>=[];
 PipelineExecutor.execute=options=>new Promise(resolve=>{
  calls.push({options,resolve});options.onPhase?.('generating');options.onActivity?.({startedAt:Date.now(),requests:1,active:1,textChars:0,reasoningChars:0,jsonChars:0,status:'waiting',model:`task-${calls.length}`});
 });
 await send();expect(calls).toHaveLength(1);
 await act(async()=>{useProjectStore.getState().initNewProject({name:'另一工程',deviceProfile:'pc',designSystem:neutralModernTheme,createSpecimen:false});await pause(10);});
 await send('什么是卡片？');expect(calls).toHaveLength(2);
 await act(async()=>{
  calls[0].options.onStreamDelta?.('OLD_RESPONSE');calls[0].options.onReasoningDelta?.('OLD_REASONING');calls[0].options.onPhase?.('rendering');
  calls[0].options.onActivity?.({startedAt:1,requests:99,active:0,textChars:999,reasoningChars:0,jsonChars:0,status:'returned',model:'OLD_MODEL'});
  calls[0].resolve({status:'answered_question',rawResponse:'OLD_RESPONSE'});await pause(10);
 });
 expect(host.querySelector('button[title*="立即停止"]')).not.toBeNull();
 expect(host.textContent).toContain('task-2');expect(host.textContent).not.toContain('OLD_MODEL');expect(host.textContent).not.toContain('OLD_RESPONSE');
 expect(host.textContent).not.toContain('OLD_REASONING');expect(host.textContent).not.toContain('检查实际渲染与交付条件');
 await act(async()=>{calls[1].options.onActivity?.({startedAt:Date.now(),lastActivityAt:Date.now(),requests:1,active:0,textChars:4,reasoningChars:0,jsonChars:0,status:'returned',model:'task-2'});
  calls[1].resolve({status:'answered_question',rawResponse:'新的答复。'});await pause(10);});
 expect(host.querySelector('button[title*="立即停止"]')).toBeNull();expect(host.textContent).toContain('新的答复。');
});
