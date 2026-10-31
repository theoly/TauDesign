import {resourceRenderReport,stageResourceReport} from './helpers/renderResourceProof';
import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test';
import { useProjectStore } from '../src/stores/useProjectStore';
import { useHistoryStore } from '../src/stores/useHistoryStore';
import { neutralModernTheme } from '../src/utils/themePresets';
import { acceptRestyleResult } from '../src/services/ai/restyleService';
import { PageRenderCheck } from '../src/services/ai/pageRenderCheck';
import { createProjectStorage } from '../src/services/storage/projectStorage';
import { restyleContextKey } from '../src/services/ai/restyleBatch';
import {buildRestyleContract} from '../src/services/ai/designWorkflow';

let prior:ReturnType<typeof useProjectStore.getState>,history:ReturnType<typeof useHistoryStore.getState>;
let render:ReturnType<typeof spyOn>;
const source='<main data-nid="page" class="p-4"><button data-nid="button" class="btn btn-primary">提交</button></main>';
const ready={status:'complete' as const,findings:[],inspected:2};
beforeEach(()=>{
  prior=useProjectStore.getState();history=useHistoryStore.getState();
  useProjectStore.getState().initNewProject({name:'核验工程',deviceProfile:'mobile',designSystem:neutralModernTheme,createSpecimen:false});
  useProjectStore.getState().addScreen({name:'页面',htmlContent:source,position:{x:0,y:0}},'a');
  render=spyOn(PageRenderCheck,'inspect').mockImplementation((request,storage)=>resourceRenderReport(request,storage,ready));
});
afterEach(()=>{render.mockRestore();useProjectStore.setState(prior,true);useHistoryStore.setState(history,true);});
const outcome=()=>acceptRestyleResult({kind:'screen',id:'a',name:'页面',html:source},source.replace('p-4','p-6'));

test('the public application action cannot bypass the asynchronous render gate',async()=>{
  render.mockResolvedValue({status:'unavailable',findings:[],inspected:0,reason:'没有真实布局'});
  const result=await useProjectStore.getState().applyRestyleOutcome(outcome());
  expect(result).toMatchObject({applied:false});expect(useProjectStore.getState().screens.a.htmlContent).toBe(source);
});
for(const damage of ['workflow','plan','baseline'] as const)test(`batch rejects ${damage} mismatch before rendering or applying`,async()=>{
  const value=outcome();value.workflowContract=buildRestyleContract({scope:'batch',target:value.target,deviceProfile:'mobile',frameWidth:390});
  if(damage==='workflow')(value.workflowContract as any).workflowId='invented';
  if(damage==='plan')value.workflowContract.validationPlan!.stages=[];
  if(damage==='baseline')value.workflowContract.target!.baselineFingerprint='changed';
  const result=await useProjectStore.getState().applyRestyleOutcome(value);expect(result.applied).toBe(false);expect(render).not.toHaveBeenCalled();
});

test('checked application renders exact proposed page and changes History only after success',async()=>{
  const store=useProjectStore.getState(),before=useHistoryStore.getState().past.length;
  const result=await store.applyRestyleOutcome(outcome());
  expect(result.applied).toBe(true);expect(result.validation?.pages[0].render).toMatchObject(ready);
  expect(render.mock.calls[0][0].screen.htmlContent).toBe(useProjectStore.getState().screens.a.htmlContent);
  expect(useHistoryStore.getState().past).toHaveLength(before+1);
  useHistoryStore.getState().undo();expect(useProjectStore.getState().screens.a.htmlContent).toBe(source);
});
test('successful restyle durably archives exact versions and actual evidence outside the project document',async()=>{
  const store=useProjectStore.getState();const proposed=outcome();
  proposed.executionRecord={source:'model',rawResponse:'RESTYLE_RAW_MARKER',completeHtml:proposed.html,continuationCount:0,warnings:[]};
  const result=await store.applyRestyleOutcome(proposed);
  expect(result.applied).toBe(true);
  const storage=createProjectStorage(store.id,store.folderPath),files=await storage.listDir('deliveries/restyle');
  expect(files).toHaveLength(1);
  const record=JSON.parse((await storage.readText(`deliveries/restyle/${files[0]}`))!);
  expect(record).toMatchObject({status:'applied',outcome:{executionRecord:{rawResponse:'RESTYLE_RAW_MARKER'}},
    pages:[{before:{id:'a',htmlContent:source},after:{id:'a',htmlContent:useProjectStore.getState().screens.a.htmlContent}}],
    validation:{status:'passed',pages:[{id:'a',render:ready,source:{passed:true},quality:{passed:true}}]}});
  useHistoryStore.getState().undo();
  expect(JSON.parse((await storage.readText(`deliveries/restyle/${files[0]}`))!).status).toBe('applied');
});
for(const status of ['incomplete','unavailable'] as const)test(`${status} iframe blocks with no checkpoint or page change`,async()=>{
  render.mockResolvedValue({status,findings:[],inspected:0,reason:'不能测量'});
  const before=useHistoryStore.getState();const result=await useProjectStore.getState().applyRestyleOutcome(outcome());
  expect(result.applied).toBe(false);expect(result.message).toContain('不能测量');
  expect(useProjectStore.getState().screens.a.htmlContent).toBe(source);
  expect(useHistoryStore.getState().past).toHaveLength(before.past.length);expect(useHistoryStore.getState().checkpoints).toHaveLength(before.checkpoints.length);
});
test('serious actual render findings block but warnings retain evidence and may pass',async()=>{
  const finding={code:'render_action_invisible_label',severity:'error' as const,message:'按钮不可见',actual:'空',expected:'可见'};
  render.mockResolvedValue({...ready,findings:[finding]});
  const rejected=await useProjectStore.getState().applyRestyleOutcome(outcome());expect(rejected.applied).toBe(false);expect(rejected.message).toContain('按钮不可见');
  render.mockResolvedValue({...ready,findings:[{...finding,severity:'warning'}]});
  const accepted=await useProjectStore.getState().applyRestyleOutcome(outcome());expect(accepted.applied).toBe(true);expect(accepted.validation?.pages[0].render?.findings).toHaveLength(1);
});
test('all retained local files are verified before rendering and no other staged candidate is replaced',async()=>{
  const store=useProjectStore.getState();const value='<main data-nid="page" class="p-4"><img data-nid="image" src="assets/images/missing.png"></main>';
  store.updateScreenHtml('a',value);store.addAsset({id:'image',name:'缺图',type:'image',relPath:'assets/images/missing.png',mimeType:'image/png',source:'upload',refCount:1});
  store.stageScreenChange('a',value,'另一个候选');const staged=useProjectStore.getState().stagedScreen;
  const result=await store.applyRestyleOutcome(acceptRestyleResult({kind:'screen',id:'a',name:'页面',html:value},value.replace('p-4','p-6')));
  expect(result.applied).toBe(false);expect(result.message).toContain('不存在');expect(render).not.toHaveBeenCalled();
  expect(useProjectStore.getState().stagedScreen).toBe(staged);
});
test('unregistered L4 backgrounds block before rendering; a file removed during rendering blocks again before apply',async()=>{
  const store=useProjectStore.getState();store.setOverride('a','button',{'background-image':'url(assets/images/retained.png)'});
  const blocked=await store.applyRestyleOutcome(outcome());expect(blocked.applied).toBe(false);expect(blocked.message).toContain('未登记');expect(render).not.toHaveBeenCalled();
  store.addAsset({id:'retained',name:'背景图',type:'image',relPath:'assets/images/retained.png',mimeType:'image/png',source:'upload',refCount:1});
  const storage=createProjectStorage(store.id,store.folderPath);await storage.writeBinary('assets/images/retained.png','YWJj');
  render.mockImplementation(async()=>{await storage.remove('assets/images/retained.png');return ready;});
  const result=await store.applyRestyleOutcome(outcome());expect(result.applied).toBe(false);expect(result.message).toContain('不存在');expect(render).toHaveBeenCalledTimes(1);
  expect(useProjectStore.getState().screens.a.htmlContent).toBe(source);
});
test('concurrent applications recheck context so only one result changes History',async()=>{
  const before=useHistoryStore.getState().past.length;
  const results=await Promise.all([useProjectStore.getState().applyRestyleOutcome(outcome()),useProjectStore.getState().applyRestyleOutcome(outcome())]);
  expect(results.filter(result=>result.applied)).toHaveLength(1);expect(useHistoryStore.getState().past).toHaveLength(before+1);
});
for(const change of ['edit','cancel','switch'] as const)test(`late ${change} during rendering cannot apply or checkpoint`,async()=>{
  let release!:(v:typeof ready)=>void;render.mockImplementation(()=>new Promise(resolve=>{release=resolve;}));
  const controller=new AbortController(),before=useHistoryStore.getState().checkpoints.length;
  const pending=useProjectStore.getState().applyRestyleOutcome(outcome(),controller.signal);
  for(let i=0;i<20&&!release;i++)await new Promise(r=>setTimeout(r,0));
  if(change==='edit')useProjectStore.getState().updateScreenHtml('a',source.replace('提交','手动修改'));
  if(change==='cancel')controller.abort();
  if(change==='switch')useProjectStore.getState().initNewProject({name:'另一个工程',deviceProfile:'mobile',createSpecimen:false});
  release(ready);const result=await pending;expect(result.applied).toBe(false);
  expect(useHistoryStore.getState().checkpoints).toHaveLength(before);
  if(change==='edit')expect(useProjectStore.getState().screens.a.htmlContent).toContain('手动修改');
  if(change==='cancel')expect(useProjectStore.getState().screens.a.htmlContent).toBe(source);
});
test('component projects real instance pages, protects L4, then applies the exact checked pages in one undo step',async()=>{
  const store=useProjectStore.getState();const comp=store.createComponent('操作','<section data-nid="comp" class="p-4"><button data-nid="action" class="btn">模板按钮</button></section>');
  store.insertComponent('a',comp);store.addScreen({name:'保护页',htmlContent:source,position:{x:0,y:0}},'b');store.insertComponent('b',comp);
  const parser=new DOMParser(),doc=parser.parseFromString(useProjectStore.getState().screens.b.htmlContent,'text/html');
  store.setOverride('b',doc.querySelector('[data-component-id]')!.getAttribute('data-nid')!,{color:'red'});
  const snapshot=useProjectStore.getState(),before=useHistoryStore.getState().past.length,key=restyleContextKey(snapshot);
  const target={kind:'component' as const,id:comp,name:'操作',html:snapshot.components[comp].templateHtml};
  const result=await store.applyRestyleOutcome(acceptRestyleResult(target,target.html.replace('p-4','p-6')));
  expect(result.applied).toBe(true);expect(result.validation?.pages.map(p=>p.id)).toContain('a');expect(result.validation?.pages.map(p=>p.id)).not.toContain('b');
  expect(useProjectStore.getState().screens.a.htmlContent).toBe(render.mock.calls.find(call=>call[0].screen.id==='a')![0].screen.htmlContent);
  expect(useProjectStore.getState().screens.b.htmlContent).toBe(snapshot.screens.b.htmlContent);expect(useHistoryStore.getState().past).toHaveLength(before+1);
  useHistoryStore.getState().undo();expect(restyleContextKey(useProjectStore.getState())).toBe(key);
});
test('failure on an affected component page rejects template and all instance changes',async()=>{
  const store=useProjectStore.getState(),comp=store.createComponent('操作','<section data-nid="comp" class="p-4">组件</section>');store.insertComponent('a',comp);
  const before=useProjectStore.getState(),target={kind:'component' as const,id:comp,name:'操作',html:before.components[comp].templateHtml};
  render.mockImplementation(async request=>request.screen.id==='a'?{status:'complete',inspected:1,findings:[{code:'render_action_zero_size',severity:'error',message:'实例错误',actual:'0',expected:'可见'}]}:ready);
  const result=await store.applyRestyleOutcome(acceptRestyleResult(target,target.html.replace('p-4','p-6')));
  expect(result.applied).toBe(false);expect(useProjectStore.getState().components).toBe(before.components);expect(useProjectStore.getState().screens).toBe(before.screens);
});

import {RestyleDeliveryRepository} from '../src/services/storage/restyleDeliveryRepository';
for(const stage of ['before','render','archive'] as const)test(`restyle actual font ${stage} failure blocks before applying`,async()=>{
 const font=`assets/imports/fonts/${'a'.repeat(64)}.woff2`,state=useProjectStore.getState(),storage=createProjectStorage(state.id);
 state.updateScreen('a',{scopedCss:`@font-face{font-family:Imported;src:url(${font})}`},'字体设置');
 if(stage!=='before')await storage.writeBinary(font,'dGVzdA==');
 if(stage==='render')render.mockImplementation(async()=>{await storage.remove(font);return ready;});
 const originalPrepare=RestyleDeliveryRepository.prototype.prepare;
 const prepare=spyOn(RestyleDeliveryRepository.prototype,'prepare').mockImplementation(async function(record){await originalPrepare.call(this,record);if(stage==='archive')await storage.remove(font);});
 const count=useHistoryStore.getState().past.length;
 try{const result=await state.applyRestyleOutcome(outcome());expect(result.applied).toBe(false);expect(result.message).toContain('不存在');expect(useProjectStore.getState().screens.a.htmlContent).toBe(source);expect(useHistoryStore.getState().past.length).toBe(count);if(stage==='archive')expect(result.validation?.files?.map(f=>f.relPath)).toContain(font);}finally{prepare.mockRestore();}
});

test('uninstantiated component template resources are rechecked after archive write',async()=>{
 const state=useProjectStore.getState(),font=`assets/imports/fonts/${'a'.repeat(64)}.woff2`,storage=createProjectStorage(state.id);
 await storage.writeBinary(font,'dGVzdA==');const id=state.createComponent('字体组件',`<style>@font-face{font-family:F;src:url(${font})}</style><section data-nid="comp" class="p-4">组件</section>`);
 const original=useProjectStore.getState().components[id].templateHtml,target={kind:'component' as const,id,name:'字体组件',html:original},before=useHistoryStore.getState().past.length;
 const actualPrepare=RestyleDeliveryRepository.prototype.prepare;let prepared=false;
 const prepare=spyOn(RestyleDeliveryRepository.prototype,'prepare').mockImplementation(async function(record){await actualPrepare.call(this,record);prepared=true;await storage.remove(font);});
 try{const result=await state.applyRestyleOutcome(acceptRestyleResult(target,original.replace('p-4','p-6')));expect(prepared).toBe(true);expect(result.applied).toBe(false);expect(result.message).toContain('不存在');expect(useProjectStore.getState().components[id].templateHtml).toBe(original);expect(useHistoryStore.getState().past.length).toBe(before);}finally{prepare.mockRestore();}
});
