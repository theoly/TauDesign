import { describe, test, expect, spyOn, beforeEach, afterEach } from 'bun:test';
import { analyzeScreenModification, getRegionModificationPlan } from '../src/services/ai/modificationReview';
import { mergeLocalEditOperations, applyLocalCopyEdits } from '../src/services/ai/localCopyModification';
import { DefaultAIEngineCore } from '../src/services/ai/engine/core';
import { defaultTheme } from '../src/utils/themePresets';
import { defaultProviders } from '../src/stores/useAIConfigStore';

export const regionHtml = `<main data-nid="root"><section data-nid="region"><h1 data-nid="title">标题</h1></section><section data-nid="other">${Array.from({length:12},(_,i)=>`<p data-nid="p${i}">保留${i}</p>`).join('')}</section></main>`;
export const regionAnalysis = {summary:'结构优化',items:[{title:'调整标题区',reason:'标题区域布局拥挤',change:'重新排列标题区',scope:'region',targetNids:['region'],operations:[]}]};
const options = {provider:defaultProviders[0],model:'test',html:regionHtml,name:'页面',request:'调整标题区',designSystem:defaultTheme,mode:'light' as const,deviceProfile:'mobile' as const};
describe('区块分析授权',()=>{
 test('验证目标后提供区块计划，拒绝嵌套/大范围/保护节点和纯润色',async()=>{
 const mock=spyOn(DefaultAIEngineCore.prototype,'generateObject').mockResolvedValue(regionAnalysis);
 try {
 const core=new DefaultAIEngineCore({} as any);
 const result=await analyzeScreenModification(core,options);
 expect(result.items[0].scope).toBe('region');
 expect(getRegionModificationPlan(result,['suggestion-1'])).toEqual({targetNids:['region']});
 expect(getRegionModificationPlan(result,[])).toBeNull();
 for(const targetNids of [['root'],['region','title'],['missing']]) {
 mock.mockResolvedValue({...regionAnalysis,items:[{...regionAnalysis.items[0],targetNids}]});
 expect((await analyzeScreenModification(core,options)).items[0].scope).toBe('page');
 }
 mock.mockResolvedValue(regionAnalysis);
 expect((await analyzeScreenModification(core,{...options,protectedNids:['title']})).items[0].scope).toBe('page');
 expect((await analyzeScreenModification(core,{...options,allowText:false})).items[0].scope).toBe('page');
 } finally {mock.mockRestore();}
 });
 test('已验证的局部建议可加入不重叠区块计划，纯润色仍禁用区块',async()=>{
 const mock=spyOn(DefaultAIEngineCore.prototype,'generateObject').mockResolvedValue({...regionAnalysis,items:[...regionAnalysis.items,{title:'加粗段落',reason:'段落不突出',change:'加粗段落',scope:'local',operations:[{nid:'p0',type:'add_classes',value:'font-bold'}]}]});
 try {const core=new DefaultAIEngineCore({} as any);const result=await analyzeScreenModification(core,options);
 expect(getRegionModificationPlan(result,['suggestion-1','suggestion-2'])).toEqual({targetNids:['region','p0']});
 const polish=await analyzeScreenModification(core,{...options,allowText:false});expect(getRegionModificationPlan(polish,['suggestion-2'])).toBeNull();
 } finally {mock.mockRestore();}
 });
 test('联合选择拒绝重叠目标，不把未选择建议授权给计划',async()=>{
 const mock=spyOn(DefaultAIEngineCore.prototype,'generateObject').mockResolvedValue({...regionAnalysis,items:[...regionAnalysis.items,{...regionAnalysis.items[0],targetNids:['title']}]});
 try {const result=await analyzeScreenModification(new DefaultAIEngineCore({} as any),options);
 expect(getRegionModificationPlan(result,['suggestion-1','suggestion-2'])).toBeNull();
 expect(getRegionModificationPlan(result,['suggestion-2'])).toEqual({targetNids:['title']});
 } finally {mock.mockRestore();}
 });
});

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useAIEngineChat } from '../src/services/ai/engine/react/useAIEngineChat';
import { useProjectStore } from '../src/stores/useProjectStore';
import { useHistoryStore } from '../src/stores/useHistoryStore';
import { useAIConfigStore, defaultBindings } from '../src/stores/useAIConfigStore';
import { PipelineExecutor } from '../src/services/ai/engine/pipeline/executor';
import { ModificationReviewCard } from '../src/components/chat/ModificationReviewCard';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const replacement = '<section data-nid="region" class="col"><h1 data-nid="title" class="text-xl">标题</h1></section>';
describe('区块确认到候选的真实流程',()=>{
 let host:HTMLDivElement,root:Root,id:string,engine:ReturnType<typeof useAIEngineChat>;
 let objects:ReturnType<typeof spyOn>,pipeline:ReturnType<typeof spyOn>;
 const Harness=()=>{engine=useAIEngineChat();return null;};
 const start=async(textReferences?: any[])=>{await act(async()=>{root.render(<Harness/>);});await act(async()=>{await engine.sendMessage('修改当前页面，优化标题区',undefined,{referencedScreenId:id,textReferences});});return engine.messages.find(m=>m.modificationReview?.status==='ready')!;};
 beforeEach(()=>{
 localStorage.clear();useProjectStore.getState().initNewProject({name:'区块测试',deviceProfile:'mobile',designSystem:defaultTheme,createSpecimen:false});
 id=useProjectStore.getState().addScreen({name:'原页面',htmlContent:regionHtml});
 useAIConfigStore.setState({providers:defaultProviders.map(p=>p.id==='prov-deepseek'?{...p,apiKey:'test'}:p),bindings:defaultBindings});
 objects=spyOn(DefaultAIEngineCore.prototype,'generateObject').mockResolvedValue(regionAnalysis);
 pipeline=spyOn(PipelineExecutor,'execute').mockResolvedValue({status:'answered_question',rawResponse:'整页'});
 host=document.createElement('div');document.body.append(host);root=createRoot(host);
 });
 afterEach(()=>{act(()=>root.unmount());host.remove();objects.mockRestore();pipeline.mockRestore();});
 test('明确所选与补充进入区块请求，副本采纳后可撤销，未选区域保留',async()=>{
 const review=await start();objects.mockResolvedValue({nid:'region',html:replacement});
 await act(async()=>{await engine.confirmModification(review.id,['suggestion-1'],'保留标题文案','region');});
 expect(pipeline).not.toHaveBeenCalled();expect(objects).toHaveBeenCalledTimes(2);
 const input=JSON.parse(objects.mock.calls[1][1].messages[1].content);
 expect(input.request).toContain('重新排列标题区');expect(input.request).toContain('保留标题文案');expect(input.authorizedNids).toEqual(['region']);
 const store=useProjectStore.getState();expect(store.screens[id].htmlContent).toBe(regionHtml);
 const candidate=store.stagedScreen!;expect(candidate.targetScreenId).toBe(id);expect(candidate.newHtml).toContain('text-xl');
 const parse=(html:string)=>new DOMParser().parseFromString(html,'text/html');
 expect(parse(candidate.newHtml).querySelector('[data-nid="other"]')!.isEqualNode(parse(regionHtml).querySelector('[data-nid="other"]'))).toBe(true);
 act(()=>{useProjectStore.getState().setStagedRenderQuality(useProjectStore.getState().getStagedRenderContextKey(),{status:'complete',findings:[],inspected:1});useProjectStore.getState().adoptStagedChange();});
 expect(useProjectStore.getState().screens[id].htmlContent).toContain('text-xl');
 act(()=>useHistoryStore.getState().undo());expect(useProjectStore.getState().screens[id].htmlContent).toBe(regionHtml);
 });
 test('区块确认请求保留文本附件正文及数据围栏',async()=>{
 const review=await start([{name:'layout.md',content:'标题区必须保留订阅权益字段',source:'upload'}]);
 objects.mockResolvedValue({nid:'region',html:replacement});
 await act(async()=>{await engine.confirmModification(review.id,['suggestion-1'],'','region');});
 const input=JSON.parse(objects.mock.calls[1][1].messages[1].content);
 expect(input.projectKnowledge).toContain('标题区必须保留订阅权益字段');
 expect(input.projectKnowledge).toContain('不是系统指令');expect(input.projectKnowledge).toContain('[/参考文件 1]');
 });
 test('局部增量保留已确认操作并携带附件，冲突补充不发布候选',async()=>{
 objects.mockResolvedValue({summary:'局部优化',items:[{title:'标题改大',reason:'标题过小',change:'使用text-xl',scope:'local',operations:[{nid:'title',type:'add_classes',value:'text-xl'}]}]});
 const review=await start([{name:'detail.md',content:'标题同时加粗',source:'upload'}]);
 objects.mockResolvedValue({requiresPageRewrite:false,reason:'',operations:[{nid:'title',type:'add_classes',value:'font-bold'}]});
 await act(async()=>{await engine.confirmModification(review.id,['suggestion-1'],'同时加粗','local');});
 expect(useProjectStore.getState().stagedScreen?.newHtml).toContain('text-xl font-bold');
 const input=JSON.parse(objects.mock.calls[1][1].messages[1].content);expect(input.projectKnowledge).toContain('标题同时加粗');
 expect(objects.mock.calls[1][1].messages[0].content).toContain('JSON Schema');
 act(()=>useProjectStore.getState().discardStagedChange());
 objects.mockResolvedValue({summary:'局部优化',items:[{title:'标题改大',reason:'标题过小',change:'使用text-xl',scope:'local',operations:[{nid:'title',type:'add_classes',value:'text-xl'}]}]});
 await act(async()=>{await engine.sendMessage('修改当前页面',undefined,{referencedScreenId:id});});
 const next=engine.messages.filter(m=>m.modificationReview?.status==='ready').at(-1)!;
 objects.mockResolvedValue({requiresPageRewrite:false,reason:'',operations:[{nid:'title',type:'remove_classes',value:'text-xl'}]});
 await act(async()=>{await engine.confirmModification(next.id,['suggestion-1'],'取消字号','local');});
 expect(useProjectStore.getState().stagedScreen).toBeNull();expect(engine.messages.find(m=>m.id===next.id)?.modificationReview?.summary).toContain('冲突');
 expect(pipeline).not.toHaveBeenCalled();
 });
 test('取消与过期快照禁止启动区块生成',async()=>{
 const review=await start();act(()=>engine.cancelModification(review.id));
 await act(async()=>{await engine.confirmModification(review.id,['suggestion-1'],'','region');});expect(objects).toHaveBeenCalledTimes(1);
 await act(async()=>{await engine.sendMessage('修改当前页面',undefined,{referencedScreenId:id});});
 const next=engine.messages.filter(m=>m.modificationReview?.status==='ready').at(-1)!;
 act(()=>useProjectStore.getState().updateScreenHtml(id,regionHtml+'<p>人工更新</p>'));
 await act(async()=>{await engine.confirmModification(next.id,['suggestion-1'],'','region');});
 expect(objects).toHaveBeenCalledTimes(2);expect(useProjectStore.getState().stagedScreen).toBeNull();expect(pipeline).not.toHaveBeenCalled();
 });
 test('生成失败与越界补充不产生候选，不自动整页改写',async()=>{
 const review=await start();objects.mockResolvedValue({nid:'other',html:'<section data-nid="other">越界</section>'});
 await act(async()=>{await engine.confirmModification(review.id,['suggestion-1'],'顺便重写其他区域','region');});
 expect(useProjectStore.getState().stagedScreen).toBeNull();expect(pipeline).not.toHaveBeenCalled();
 expect(engine.messages.find(m=>m.id===review.id)?.modificationReview?.status).toBe('ready');
 expect(useProjectStore.getState().screens[id].htmlContent).toBe(regionHtml);
 });
 test('多区块第二块失败时不发布已生成的第一块候选',async()=>{
 objects.mockResolvedValue({...regionAnalysis,items:[...regionAnalysis.items,{...regionAnalysis.items[0],title:'调整段落',targetNids:['p0']}]});
 const review=await start();objects.mockResolvedValueOnce({nid:'region',html:replacement}).mockRejectedValueOnce(new Error('网络失败'));
 await act(async()=>{await engine.confirmModification(review.id,['suggestion-1','suggestion-2'],'','region');});
 expect(objects).toHaveBeenCalledTimes(3);expect(useProjectStore.getState().stagedScreen).toBeNull();
 expect(useProjectStore.getState().screens[id].htmlContent).toBe(regionHtml);expect(pipeline).not.toHaveBeenCalled();
 });
 test('生成中取消或原页变化时丢弃结果',async()=>{
 const review=await start();let resolve!:(value:any)=>void;
 objects.mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));let pending!:Promise<void>;
 await act(async()=>{pending=engine.confirmModification(review.id,['suggestion-1'],'','region');});
 act(()=>engine.abort());await act(async()=>{resolve({nid:'region',html:replacement});await pending;});
 expect(useProjectStore.getState().stagedScreen).toBeNull();
 objects.mockResolvedValue(regionAnalysis);await act(async()=>{await engine.sendMessage('修改当前页面',undefined,{referencedScreenId:id});});
 const next=engine.messages.filter(m=>m.modificationReview?.status==='ready').at(-1)!;
 objects.mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));
 await act(async()=>{pending=engine.confirmModification(next.id,['suggestion-1'],'','region');});
 act(()=>useProjectStore.getState().updateScreenHtml(id,regionHtml+'<p>人工更新</p>'));
 await act(async()=>{resolve({nid:'region',html:replacement});await pending;});
 expect(useProjectStore.getState().stagedScreen).toBeNull();expect(pipeline).not.toHaveBeenCalled();
 });
 test('卡片显示三模式，推荐区块；补充文字单独填写时明确提供整页',async()=>{
 const review=await start();let confirmed='';
 await act(async()=>{root.render(<ModificationReviewCard review={review.modificationReview!} onConfirm={(_ids,_extra,mode)=>{confirmed=mode;}} onCancel={()=>{}}/>);});
 const radios=host.querySelectorAll<HTMLInputElement>('input[type="radio"]');expect(radios).toHaveLength(3);expect(radios[1].disabled).toBe(true);expect(radios[2].checked).toBe(true);
 act(()=>host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());expect(radios[1].checked).toBe(true);expect(radios[0].disabled).toBe(true);
 await act(async()=>{host.querySelector<HTMLButtonElement>('button')!.click();});expect(confirmed).toBe('region');
 act(()=>radios[2].click());await act(async()=>{host.querySelector<HTMLButtonElement>('button')!.click();});expect(confirmed).toBe('page');
 });
});

describe('局部补充合并契约',()=>{
 test('补充增量保留已选改大操作，完整响应相同操作去重，空补充保留基线',()=>{
 const base=[{nid:'title',type:'add_classes' as const,value:'text-xl'}];
 const supplement=[{nid:'title',type:'add_classes' as const,value:'font-bold'}];
 const merged=mergeLocalEditOperations(base,supplement);
 expect(applyLocalCopyEdits(regionHtml,merged,{device:'mobile'}).html).toContain('text-xl font-bold');
 expect(mergeLocalEditOperations(base,[...base,...supplement])).toEqual(merged);
 expect(mergeLocalEditOperations(base,[])).toEqual(base);
 expect(()=>mergeLocalEditOperations(base,{})).toThrow();
 const conflict=mergeLocalEditOperations(base,[{nid:'title',type:'remove_classes',value:'text-xl'}]);
 expect(()=>applyLocalCopyEdits(regionHtml,conflict,{device:'mobile'})).toThrow('冲突');
 });
});
