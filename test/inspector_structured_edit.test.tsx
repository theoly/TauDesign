import {beforeEach,afterEach,expect,spyOn,test} from 'bun:test';
import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {PropertyInspector} from '../src/components/inspector/PropertyInspector';
import {useProjectStore} from '../src/stores/useProjectStore';
import {useHistoryStore} from '../src/stores/useHistoryStore';
import {useAIConfigStore,defaultProviders,defaultBindings} from '../src/stores/useAIConfigStore';
import {DefaultAIEngineCore} from '../src/services/ai/engine/core';
import {chatPageTaskPlan} from './fixtures/pageTaskPlan';
const html='<main data-nid="root0001"><section data-nid="outer001"><section data-nid="inner001"><button data-nid="target01" class="btn btn-primary">继续</button></section><p data-nid="keep0001">保留业务说明</p></section></main>';
const answer={requiresPageRewrite:false,reason:'',operations:[{nid:'target01',type:'add_classes',value:'font-semibold'}]};
let host:HTMLDivElement,root:Root,project:ReturnType<typeof useProjectStore.getState>,history:ReturnType<typeof useHistoryStore.getState>,config:ReturnType<typeof useAIConfigStore.getState>,spy:ReturnType<typeof spyOn>;
let priorAct:unknown;
beforeEach(()=>{
  priorAct=(globalThis as any).IS_REACT_ACT_ENVIRONMENT;(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
  project=useProjectStore.getState();history=useHistoryStore.getState();config=useAIConfigStore.getState();
  useProjectStore.getState().initNewProject({name:'检查器',deviceProfile:'mobile',createSpecimen:false});
  useProjectStore.getState().addScreen({name:'页面',htmlContent:html},'page');useProjectStore.getState().selectNodeByNid('page','target01');
  useAIConfigStore.setState({providers:defaultProviders.map(p=>({...p,apiKey:'test'})),bindings:defaultBindings});
  spy=spyOn(DefaultAIEngineCore.prototype,'generateObject').mockResolvedValue(answer);
  host=document.createElement('div');document.body.append(host);root=createRoot(host);act(()=>root.render(<PropertyInspector/>));
});
afterEach(()=>{
  act(()=>root.unmount());host.remove();spy.mockRestore();
  useProjectStore.setState(project,true);useHistoryStore.setState(history,true);useAIConfigStore.setState(config,true);
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT=priorAct;
});
async function start(double=false,request='文字加粗'){
  const input=host.querySelector('input[placeholder*="选中元素"]') as HTMLInputElement;
  act(()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,request);input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));});
  await act(async()=>{const button=host.querySelector('[aria-label="生成局部微调候选"]')!;button.dispatchEvent(new MouseEvent('click',{bubbles:true}));if(double)button.dispatchEvent(new MouseEvent('click',{bubbles:true}));await Promise.resolve();});
}
test('inspector uses one scoped structured request, preserving original nested HTML and History until adoption',async()=>{
  const past=useHistoryStore.getState().past.length;
  await start(true);
  expect(spy).toHaveBeenCalledTimes(1);const state=useProjectStore.getState();
  expect(state.screens.page.htmlContent).toBe(html);expect(useHistoryStore.getState().past.length).toBe(past);
  expect(state.stagedScreen?.newHtml).toContain('font-semibold');expect(state.stagedScreen?.newHtml).toContain('保留业务说明');
  expect(state.stagedScreen?.workflowContract?.allowedChanges).toEqual(['element:target01']);
  expect(host.textContent).toContain('请比较后采纳');
});
test('inspector forwards the application opt-in using the selected button semantics and the original finite protocol',async()=>{
 act(()=>useAIConfigStore.getState().setAutoReferenceDesignRules(true));await start(false,'主按钮文字加粗');
 const c=useProjectStore.getState().stagedScreen!;expect(c).toBeTruthy();expect(spy).toHaveBeenCalledTimes(1);
 expect(c.workflowContract!.designGuidance!.protocol).toBe('finite-json');expect(c.workflowContract!.designGuidance!.selection.selected.map(s=>s.rule.id)).toContain('TY-06');expect(c.workflowContract!.designGuidance!.requests[0]).toMatchObject({status:'completed',outputProtocol:'json-object'});
 expect(useProjectStore.getState().screens.page.htmlContent).toBe(html);
});
test('request failure cannot apply a partial response to the original page',async()=>{
  spy.mockRejectedValue(Error('模型请求失败'));await start();
  expect(useProjectStore.getState().screens.page.htmlContent).toBe(html);expect(useProjectStore.getState().stagedScreen).toBeNull();
  expect(host.textContent).toContain('模型请求失败');
});
test('switching selected element cancels the old request and ignores late operations',async()=>{
  let release!:(value:unknown)=>void;spy.mockImplementation(()=>new Promise(resolve=>{release=resolve;}));
  await start();expect(spy).toHaveBeenCalledTimes(1);
  await act(async()=>{useProjectStore.getState().selectNodeByNid('page','keep0001');release(answer);await Promise.resolve();});
  expect(useProjectStore.getState().stagedScreen).toBeNull();expect(useProjectStore.getState().screens.page.htmlContent).toBe(html);
});
test('inspector functional additions use the selected container subtree and retain outside content',async()=>{
 act(()=>useProjectStore.getState().selectNodeByNid('page','inner001'));
 spy.mockImplementation(async schema=>(schema.properties as any)?.features?chatPageTaskPlan:{nid:'inner001',html:'<section data-nid="inner001"><label>邮箱<input class="input"/></label><button data-nid="target01" class="btn btn-primary">继续</button></section>'});
 await start(false,'增加邮箱输入框');expect(spy).toHaveBeenCalledTimes(2);
 const state=useProjectStore.getState();expect(state.screens.page.htmlContent).toBe(html);expect(state.stagedScreen?.newHtml).toContain('邮箱');expect(state.stagedScreen?.newHtml).toContain('保留业务说明');expect(state.stagedScreen?.workflowContract?.elementNid).toBe('inner001');expect(state.stagedScreen?.executionRecord?.localEdit?.structural).toBe(true);expect(host.textContent).toContain('请比较后采纳');
});
