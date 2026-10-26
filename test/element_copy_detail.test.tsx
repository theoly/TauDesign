import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { applyLocalCopyEdits } from '../src/services/ai/localCopyModification';
import { requiresModificationReview } from '../src/services/ai/modificationEntry';
import { useAIEngineChat } from '../src/services/ai/engine/react/useAIEngineChat';
import { DefaultAIEngineCore } from '../src/services/ai/engine/core';
import { PipelineExecutor } from '../src/services/ai/engine/pipeline/executor';
import { useProjectStore } from '../src/stores/useProjectStore';
import { passStagedRenderCheck } from './helpers/stagedQuality';
import { useAIConfigStore, defaultProviders, defaultBindings } from '../src/stores/useAIConfigStore';
import { useHistoryStore } from '../src/stores/useHistoryStore';

const original = '<!doctype html><html lang="zh"><head><title>原页</title></head><body><main data-nid="root"><a data-nid="notice" class="tap-target" href="/m/messages" aria-label="消息" style="position:relative;width:44px;height:44px"><svg data-nid="bell" class="icon" viewBox="0 0 24 24" style="width:24px;height:24px"><path data-nid="shape" d="M3 3h18"/></svg><span data-nid="count" class="badge" style="position:absolute;right:0;top:0;font-size:12px;padding:2px">3</span></a><aside data-nid="other"><p>保持合同规则与业务说明。</p></aside></main></body></html>';
const operations = [
  {nid:'notice',type:'add_classes',value:'notification-control'},
  {nid:'notice',type:'remove_styles',value:'width;height'},
  {nid:'bell',type:'set_styles',value:'width:28px;height:28px;min-width:28px;min-height:28px'},
  {nid:'count',type:'add_classes',value:'badge-count text-primary'},
  {nid:'count',type:'remove_classes',value:'badge'},
  {nid:'count',type:'remove_styles',value:'position;right;top'},
  {nid:'count',type:'set_styles',value:'font-size:10px;min-height:14px;padding:2px 3px'}
];
const options = {device:'mobile' as const, scopeNid:'notice'};
const parse=(html:string)=>new DOMParser().parseFromString(html,'text/html');
describe('明确引用元素的局部style修改',()=>{
 test('增大/缩小属于具体要求，不需要再次分析',()=>{
  for(const request of ['增大图标，缩小badge','放大图标，减小角标字号','缩小badge']) expect(requiresModificationReview(request)).toBe(false);
 });
 test('在副本修改inline尺寸，完整文档/链接/文本/SVG结构/其他节点保留',()=>{
  const result=applyLocalCopyEdits(original,operations,options);
  const before=parse(original),after=parse(result.html);
  expect(after.doctype?.name).toBe('html');expect(after.head.isEqualNode(before.head)).toBe(true);
  expect(after.querySelector('a')?.getAttribute('href')).toBe('/m/messages');expect(after.querySelector('a')?.getAttribute('aria-label')).toBe('消息');
  expect((after.querySelector('svg') as unknown as HTMLElement).style.width).toBe('28px');
  expect((after.querySelector('[data-nid="count"]') as HTMLElement).style.fontSize).toBe('10px');
  for(const nid of ['shape','other'])expect(after.querySelector(`[data-nid="${nid}"]`)!.isEqualNode(before.querySelector(`[data-nid="${nid}"]`))).toBe(true);
  expect(after.body.textContent).toBe(before.body.textContent);expect(result.qualityReport.passed).toBe(true);
 });
 test('无明确范围不允许style操作，范围外/真实手动覆盖仍拒绝',()=>{
  expect(()=>applyLocalCopyEdits(original,[operations[2]],{device:'mobile'})).toThrow();
  expect(()=>applyLocalCopyEdits(original,[{nid:'other',type:'set_styles',value:'padding:8px'}],options)).toThrow('范围');
  expect(()=>applyLocalCopyEdits(original,[operations[2]],{...options,protectedNids:['bell']})).toThrow('手动');
 });
 test('危险/未知CSS、无效值、相互冲突操作均不返回结果',()=>{
  for(const value of ['width:expression(alert(1))','width:url(https://x)','background:url(https://x)','width:28px!important','width:not-a-size','font-size:0px','font-size:0rem','font-size:0%','font-size:calc(0px)','width:0rem','height:0%','width:calc(0px)','max-width:0px','width:28px;onload:bad','--outside:1px']){
   expect(()=>applyLocalCopyEdits(original,[{nid:'bell',type:'set_styles',value}],options)).toThrow();
  }
  expect(()=>applyLocalCopyEdits(original,[operations[2],{nid:'bell',type:'remove_styles',value:'width'}],options)).toThrow('冲突');
 });
});

(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
describe('引用元素直接副本路径',()=>{
 let host:HTMLDivElement,root:Root,id:string,engine:ReturnType<typeof useAIEngineChat>;
 let objects:ReturnType<typeof spyOn>,pipeline:ReturnType<typeof spyOn>;
 const Harness=()=>{engine=useAIEngineChat();return null;};
 const send=()=>engine.sendMessage('[引用元素 nid="notice" 画框="外勤" 标签=<a>]\n元素片段:\n<a>原片段</a>\n\n增大图标，缩小badge',undefined,{referencedScreenId:id});
 beforeEach(async()=>{
  localStorage.clear();useProjectStore.getState().initNewProject({name:'元素细节',deviceProfile:'mobile',createSpecimen:false});
  id=useProjectStore.getState().addScreen({name:'外勤',htmlContent:original});
  useAIConfigStore.setState({providers:defaultProviders.map(p=>({...p,apiKey:'test'})),bindings:defaultBindings});
  objects=spyOn(DefaultAIEngineCore.prototype,'generateObject').mockResolvedValue({requiresPageRewrite:false,reason:'',operations});
  pipeline=spyOn(PipelineExecutor,'execute').mockResolvedValue({status:'no_html',rawResponse:''});
  host=document.createElement('div');document.body.append(host);root=createRoot(host);await act(async()=>root.render(<Harness/>));
 });
 afterEach(()=>{act(()=>root.unmount());host.remove();objects.mockRestore();pipeline.mockRestore();});
 test('一次受限操作请求，不出分析卡或整页请求，采纳前原页不变且可Undo',async()=>{
  const before=useProjectStore.getState().screens[id].htmlContent;
  await act(async()=>{await send();});
  expect(objects).toHaveBeenCalledTimes(1);expect(pipeline).not.toHaveBeenCalled();
  const request=objects.mock.calls[0][1],context=JSON.parse(request.messages[1].content);
  expect(context.targetNid).toBe('notice');expect(context.html).toContain('/m/messages');expect(context.html).not.toContain('保持合同规则');
  expect(request.messages[0].content).toContain('JSON Schema');expect(request.messages[0].content).toContain('右上');
  expect(engine.messages.some(m=>m.modificationReview)).toBe(false);
  expect(useProjectStore.getState().screens[id].htmlContent).toBe(before);expect(useProjectStore.getState().stagedScreen?.newHtml).toContain('28px');
  expect(useProjectStore.getState().stagedScreen?.executionRecord).toMatchObject({
    source: 'local-edit', continuationCount: 0, localEdit: { mode: 'element', operationCount: operations.length, targetNids: ['notice', 'bell', 'count'] }
  });
  expect(useProjectStore.getState().stagedScreen?.executionRecord?.completeHtml).toBe(useProjectStore.getState().stagedScreen?.newHtml);
  expect(useProjectStore.getState().stagedScreen?.executionRecord?.qualityReport?.passed).toBe(true);
  passStagedRenderCheck();await act(async ()=>{ await useProjectStore.getState().adoptStagedChange(); });expect(useProjectStore.getState().screens[id].htmlContent).toContain('28px');
  act(()=>useHistoryStore.getState().undo());expect(useProjectStore.getState().screens[id].htmlContent).toBe(before);
 });
 test('模型越界或无法局部完成时停止，不退回整页或分析列表',async()=>{
  objects.mockResolvedValue({requiresPageRewrite:false,operations:[{nid:'other',type:'set_styles',value:'padding:8px'}]});
  await act(async()=>{await send();});expect(pipeline).not.toHaveBeenCalled();expect(useProjectStore.getState().stagedScreen).toBeNull();
  expect(engine.messages.at(-1)?.isError).toBe(true);expect(engine.messages.some(m=>m.modificationReview)).toBe(false);
 });
 test('仅改尺寸不能借set_text篡改未读数量',async()=>{
  objects.mockResolvedValue({requiresPageRewrite:false,operations:[{nid:'count',type:'set_text',value:'2'}]});
  await act(async()=>{await send();});expect(useProjectStore.getState().stagedScreen).toBeNull();
  expect(engine.messages.at(-1)?.isError).toBe(true);expect(pipeline).not.toHaveBeenCalled();
 });
 test('元素引用已经给出目标，“放大一点”仍直接改副本',async()=>{
  await act(async()=>{await engine.sendMessage('放大一点',undefined,{referencedScreenId:id,referencedElement:{nid:'notice',tagName:'a',screenName:'外勤'}});});
  expect(objects).toHaveBeenCalledTimes(1);expect(pipeline).not.toHaveBeenCalled();
  expect(JSON.parse(objects.mock.calls[0][1].messages[1].content).targetNid).toBe('notice');
  expect(engine.messages.some(m=>m.modificationReview)).toBe(false);expect(useProjectStore.getState().stagedScreen?.newHtml).toContain('28px');
 });
 test('失效元素引用不能退回整页或误改另一个节点',async()=>{
  await act(async()=>{await engine.sendMessage('增大图标',undefined,{referencedScreenId:id,referencedElement:{nid:'deleted',tagName:'a',screenName:'外勤'}});});
  expect(objects).not.toHaveBeenCalled();expect(pipeline).not.toHaveBeenCalled();expect(useProjectStore.getState().stagedScreen).toBeNull();
  expect(engine.messages.at(-1)?.text).toContain('引用元素');
 });
 test('原页变化或取消丢弃迟到结果',async()=>{
  let resolve!:(value:any)=>void;objects.mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));let pending!:Promise<void>;
  await act(async()=>{pending=send();});
  act(()=>useProjectStore.getState().updateScreenHtml(id,original.replace('保持合同规则','人工更新合同规则')));
  await act(async()=>{resolve({requiresPageRewrite:false,operations});await pending;});
  expect(useProjectStore.getState().stagedScreen).toBeNull();expect(engine.messages.at(-1)?.text).toContain('变化');
  objects.mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));await act(async()=>{pending=send();});act(()=>engine.abort());
  await act(async()=>{resolve({requiresPageRewrite:false,operations});await pending;});expect(useProjectStore.getState().stagedScreen).toBeNull();expect(pipeline).not.toHaveBeenCalled();
 });
});
