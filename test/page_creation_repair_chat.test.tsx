import {afterEach,beforeEach,expect,test} from 'bun:test';
import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {useAIEngineChat} from '../src/services/ai/engine/react/useAIEngineChat';
import {DefaultAIEngineCore} from '../src/services/ai/engine/core';
import {PageRenderCheck} from '../src/services/ai/pageRenderCheck';
import {useProjectStore} from '../src/stores/useProjectStore';
import {useHistoryStore} from '../src/stores/useHistoryStore';
import {useAIConfigStore,defaultProviders,defaultBindings} from '../src/stores/useAIConfigStore';
import {neutralModernTheme} from '../src/utils/themePresets';
const inspect=PageRenderCheck.inspect,stream=DefaultAIEngineCore.prototype.streamText;
let project:ReturnType<typeof useProjectStore.getState>,history:ReturnType<typeof useHistoryStore.getState>,config:ReturnType<typeof useAIConfigStore.getState>,previousAct:unknown;
let root:Root,host:HTMLDivElement,engine:ReturnType<typeof useAIEngineChat>,calls:number,answer:string;
const Harness=()=>{engine=useAIEngineChat();return null;};
beforeEach(async()=>{
 project=useProjectStore.getState();history=useHistoryStore.getState();config=useAIConfigStore.getState();previousAct=(globalThis as any).IS_REACT_ACT_ENVIRONMENT;(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
 useProjectStore.getState().initNewProject({name:'修复聊天',deviceProfile:'mobile',designSystem:neutralModernTheme,createSpecimen:false});useProjectStore.getState().addScreen({name:'原页',htmlContent:'<main>保留旧内容</main>'},'old');
 useAIConfigStore.setState({providers:defaultProviders.map(p=>({...p,apiKey:'fixture'})),bindings:defaultBindings});calls=0;answer=JSON.stringify({operations:[{nid:'save',type:'remove_styles',value:'font-size'}]});
 DefaultAIEngineCore.prototype.streamText=options=>{calls++;const text=options.jsonSchema?answer:'<artifact identifier="screen_new" type="screen" title="资料"><main data-nid="root" class="col gap-4 p-4"><h1>会员资料</h1><button data-nid="save" class="btn btn-primary" style="font-size:0px">保存资料</button></main></artifact>';
  return {textStream:(async function*(){yield text;})(),reasoningStream:(async function*(){})(),textPromise:Promise.resolve(text),reasoningPromise:Promise.resolve(undefined),usagePromise:Promise.resolve(options.jsonSchema?{inputTokens:123,outputTokens:45}:{inputTokens:100,outputTokens:200}),finishReasonPromise:Promise.resolve('stop'),abort(){}};
 };
 PageRenderCheck.inspect=async request=>({status:'complete',inspected:4,findings:request.screen.htmlContent.includes('font-size:0')?[{code:'render_action_invisible_label',severity:'error',nid:'save',message:'实际文字不可见',actual:'字号0',expected:'可见'}]:[]});
 host=document.createElement('div');document.body.append(host);root=createRoot(host);await act(async()=>root.render(<Harness/>));
});
afterEach(()=>{act(()=>root.unmount());host.remove();DefaultAIEngineCore.prototype.streamText=stream;PageRenderCheck.inspect=inspect;useProjectStore.setState(project,true);useHistoryStore.setState(history,true);useAIConfigStore.setState(config,true);(globalThis as any).IS_REACT_ACT_ENVIRONMENT=previousAct;});
test('实际聊天生成后受控修复，最终代码/会话为通过HTML，本轮用量包含两次请求',async()=>{
 await act(async()=>{await engine.sendMessage('新建一个会员资料页面');});
 expect(calls).toBe(2);const page=Object.values(useProjectStore.getState().screens).find(s=>s.id!=='old')!;expect(page).toBeDefined();expect(page.metadata!.creationEvidence!.repair!.status).toBe('repaired');
 const message=engine.messages.find(m=>m.screenId===page.id)!;expect(message.text).toContain('已完成一次控件样式修复');expect(message.htmlOutput).toBe(page.htmlContent);expect(message.usage).toMatchObject({promptTokens:223,completionTokens:245,totalTokens:468});
 const turns=await useProjectStore.getState().getConversationStore().loadRecent(1);expect(turns[0].assistant.text).not.toContain('font-size:0');expect(turns[0].assistant.text).toContain(page.htmlContent);expect(useProjectStore.getState().screens.old.htmlContent).toContain('保留旧内容');
});
test('修复失败不能发布成功消息，仍累计失败请求用量且不新增页面',async()=>{
 answer=JSON.stringify({operations:[{nid:'save',type:'set_text',value:'丢弃原文案'}]});await act(async()=>{await engine.sendMessage('新建一个会员资料页面');});
 expect(calls).toBe(2);expect(useProjectStore.getState().screenOrder).toEqual(['old']);const message=engine.messages.at(-1)!;expect(message.isError).toBe(true);expect(message.text).toContain('已尝试一次受控修复');expect(message.text).not.toContain('已根据指示生成高保真设计');expect(message.usage?.totalTokens).toBe(468);
});
