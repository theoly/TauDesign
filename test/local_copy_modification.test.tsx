import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { applyLocalCopyEdits } from '../src/services/ai/localCopyModification';
import { analyzeScreenModification, getLocalModificationPlan } from '../src/services/ai/modificationReview';
import { DefaultAIEngineCore } from '../src/services/ai/engine/core';
import { PipelineExecutor } from '../src/services/ai/engine/pipeline/executor';
import { useAIEngineChat } from '../src/services/ai/engine/react/useAIEngineChat';
import { ModificationReviewCard } from '../src/components/chat/ModificationReviewCard';
import { RestylePanel } from '../src/components/theme/RestylePanel';
import { InfiniteCanvas } from '../src/components/canvas/InfiniteCanvas';
import { useProjectStore } from '../src/stores/useProjectStore';
import { useAIConfigStore, defaultProviders, defaultBindings } from '../src/stores/useAIConfigStore';
import { useHistoryStore } from '../src/stores/useHistoryStore';
import { defaultTheme } from '../src/utils/themePresets';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const original = `<main data-nid="root" class="col"><h1 data-nid="title" class="text-sm">原标题</h1><button data-nid="action" class="btn btn-ghost custom-button" data-component-id="shared"><svg data-nid="icon" viewBox="0 0 24 24"><path d="M1 1h8"/></svg><span data-nid="label">原文案</span></button><section data-nid="untouched" style="padding:var(--space-4)">${Array.from({length:15},(_,i)=>`<p data-nid="other-${i}">保留内容${i}</p>`).join('')}</section></main>`;
const rawAnalysis = { summary: '小范围优化', items: [
  { title: '突出标题', reason: '标题过小', change: '使用较大标题', scope: 'local', operations: [
    { nid: 'title', type: 'remove_classes', value: 'text-sm' }, { nid: 'title', type: 'add_classes', value: 'text-xl font-bold' }
  ] },
  { title: '修改按钮文案', reason: '文案需更新', change: '使用新文案', scope: 'local', operations: [{ nid:'label', type:'set_text', value:'新文案' }] }
] };
const options = { device: 'mobile' as const };
const parse = (html:string) => new DOMParser().parseFromString(html, 'text/html');

describe('旧页面副本的受限局部操作', () => {
  test('仅改选中节点，结构、SVG、组件标识及其他区域不变', () => {
    const result=applyLocalCopyEdits(original,[...rawAnalysis.items[0].operations,...rawAnalysis.items[1].operations],options);
    const before=parse(original), after=parse(result.html);
    expect(after.querySelector('[data-nid="title"]')?.getAttribute('class')).toBe('text-xl font-bold');
    expect(after.querySelector('[data-nid="label"]')?.textContent).toBe('新文案');
    for(const nid of ['icon','untouched']) expect(before.querySelector(`[data-nid="${nid}"]`)!.isEqualNode(after.querySelector(`[data-nid="${nid}"]`))).toBe(true);
    expect(after.querySelector('button')?.getAttribute('data-component-id')).toBe('shared');
    expect(Array.from(after.querySelectorAll('[data-nid]')).map(e=>e.getAttribute('data-nid'))).toEqual(Array.from(before.querySelectorAll('[data-nid]')).map(e=>e.getAttribute('data-nid')));
  });
  test('完整文档保留DOCTYPE、head样式和html属性', () => {
    const full=`<!doctype html><html lang="zh"><head><meta charset="UTF-8"><style>.kept{color:var(--color-primary)}</style></head><body>${original}</body></html>`;
    const result=applyLocalCopyEdits(full,rawAnalysis.items[0].operations,options);
    expect(result.html.toLowerCase().startsWith('<!doctype html>')).toBe(true);
    expect(parse(result.html).head.isEqualNode(parse(full).head)).toBe(true);
    expect(parse(result.html).documentElement.lang).toBe('zh');
  });
  test('纯文本安全写入，拒绝容器文本抹平与任意HTML操作', () => {
    const html=applyLocalCopyEdits(original,[{nid:'label',type:'set_text',value:'<img src=x>'}],options).html;
    expect(parse(html).querySelector('[data-nid="label"]')?.textContent).toBe('<img src=x>');
    expect(parse(html).querySelector('img')).toBeNull();
    expect(()=>applyLocalCopyEdits(original,[{nid:'action',type:'set_text',value:'不允许'}],options)).toThrow('纯文本');
    expect(()=>applyLocalCopyEdits(original,[{nid:'label',type:'set_text',value:'不允许'}],{...options,allowText:false})).toThrow();
    expect(()=>applyLocalCopyEdits(original,[{nid:'title',type:'replace_html',value:'<h1>新</h1>'}],options)).toThrow('格式');
  });
  test('拒绝越界、重复nid、未知类、自定义类删除与手动覆盖冲突', () => {
    const op={nid:'title',type:'add_classes',value:'font-bold'};
    expect(()=>applyLocalCopyEdits(original,[op],{...options,allowedNids:['label']})).toThrow('超出');
    expect(()=>applyLocalCopyEdits(original+'<p data-nid="title">重复</p>',[op],options)).toThrow('不唯一');
    expect(()=>applyLocalCopyEdits(original,[{...op,value:'invented-class'}],options)).toThrow('白名单');
    expect(()=>applyLocalCopyEdits(original,[{nid:'action',type:'remove_classes',value:'custom-button'}],options)).toThrow('自定义类');
    expect(()=>applyLocalCopyEdits(original,[op],{...options,protectedNids:['title']})).toThrow('手动样式');
  });
  test('拒绝大范围与冲突操作，未发生变化不产生候选', () => {
    expect(()=>applyLocalCopyEdits(original,[{nid:'root',type:'add_classes',value:'gap-4'}],options)).toThrow('范围较大');
    expect(()=>applyLocalCopyEdits(original,Array.from({length:4},(_,i)=>({nid:`other-${i}`,type:'add_classes',value:'font-bold'})),options)).toThrow('范围较大');
    expect(()=>applyLocalCopyEdits(original,Array.from({length:13},()=>({nid:'title',type:'add_classes',value:'font-bold'})),options)).toThrow('1–12');
    expect(()=>applyLocalCopyEdits(original,[{nid:'title',type:'add_classes',value:'text-xl'},{nid:'title',type:'remove_classes',value:'text-xl'}],options)).toThrow('冲突');
    expect(()=>applyLocalCopyEdits(original,[{nid:'title',type:'add_classes',value:'text-sm'}],options)).toThrow('无需');
  });
});

describe('局部模式选择与实际接线', () => {
  let host:HTMLDivElement, root:Root, id:string, engine:ReturnType<typeof useAIEngineChat>;
  let objects:ReturnType<typeof spyOn>, pipeline:ReturnType<typeof spyOn>;
  const Harness=()=>{engine=useAIEngineChat();return null;};
  const render=async(node:React.ReactNode)=>{await act(async()=>{root.render(node);});};
  const start=async()=>{await render(<Harness/>);await act(async()=>{await engine.sendMessage('修改当前页面的标题',undefined,{referencedScreenId:id});});return engine.messages.find(m=>m.modificationReview?.status==='ready')!;};
  beforeEach(()=>{
    localStorage.clear();useProjectStore.getState().initNewProject({name:'局部测试',deviceProfile:'mobile',designSystem:defaultTheme,createSpecimen:false});
    id=useProjectStore.getState().addScreen({name:'原页面',htmlContent:original});
    useAIConfigStore.setState({providers:defaultProviders.map(p=>p.id==='prov-deepseek'?{...p,apiKey:'test'}:p),bindings:defaultBindings});
    objects=spyOn(DefaultAIEngineCore.prototype,'generateObject').mockResolvedValue(rawAnalysis);
    pipeline=spyOn(PipelineExecutor,'execute').mockResolvedValue({status:'answered_question',rawResponse:'整页模式'});
    host=document.createElement('div');document.body.append(host);root=createRoot(host);
  });
  afterEach(()=>{act(()=>root.unmount());host.remove();objects.mockRestore();pipeline.mockRestore();});
  test('分析验证局部指令与联合预算，非法局部建议不推荐',async()=>{
    const core=new DefaultAIEngineCore({} as any);
    const input={provider:defaultProviders[0],model:'test',html:original,name:'原页面',request:'优化',designSystem:defaultTheme,mode:'light' as const,deviceProfile:'mobile' as const};
    const result=await analyzeScreenModification(core,input);
    expect(result.items[0].scope).toBe('local');expect(getLocalModificationPlan(result,['suggestion-1','suggestion-2'])?.allowedNids).toEqual(['title','label']);
    objects.mockResolvedValue({summary:'不能局部',items:[{...rawAnalysis.items[0],operations:[{nid:'root',type:'add_classes',value:'gap-4'}]}]});
    const unsafe=await analyzeScreenModification(core,input);expect(unsafe.items[0].scope).toBe('page');expect(getLocalModificationPlan(unsafe,['suggestion-1'])).toBeNull();
  });
  test('确认无补充后直接修改副本，零二次模型调用；采纳才改原页并支持Undo',async()=>{
    const review=await start();const historyBefore=useHistoryStore.getState().past.length;
    await act(async()=>{await engine.confirmModification(review.id,['suggestion-1'],'','local');});
    expect(objects).toHaveBeenCalledTimes(1);expect(pipeline).not.toHaveBeenCalled();
    expect(useProjectStore.getState().screens[id].htmlContent).toBe(original);expect(useHistoryStore.getState().past.length).toBe(historyBefore);
    expect(useProjectStore.getState().stagedScreen?.newHtml).toContain('text-xl font-bold');
    act(()=>useProjectStore.getState().adoptStagedChange());expect(useProjectStore.getState().screens[id].htmlContent).not.toBe(original);
    act(()=>{useHistoryStore.getState().undo();});expect(useProjectStore.getState().screens[id].htmlContent).toBe(original);
  });
  test('补充文字额外调用受限操作模型，拒绝未授权节点且不进入整页兜底',async()=>{
    const review=await start();
    objects.mockResolvedValue({requiresPageRewrite:false,reason:'',operations:[{nid:'other-1',type:'set_text',value:'越界'}]});
    await act(async()=>{await engine.confirmModification(review.id,['suggestion-1'],'顺便修改其他区域','local');});
    expect(objects).toHaveBeenCalledTimes(2);expect(pipeline).not.toHaveBeenCalled();expect(useProjectStore.getState().stagedScreen).toBeNull();
    const card=engine.messages.find(m=>m.id===review.id)?.modificationReview;expect(card?.status).toBe('ready');expect(card?.summary).toContain('超出');
    expect(useProjectStore.getState().screens[id].htmlContent).toBe(original);
    const prompt=JSON.parse(objects.mock.calls[1][1].messages[1].content);expect(prompt.allowedNids).toEqual(['title']);expect(prompt.html).toBeUndefined();
  });
  test('补充要求可在授权范围执行，需要整页时停止并允许用户主动选择整页',async()=>{
    const review=await start();
    objects.mockResolvedValue({requiresPageRewrite:true,reason:'结构改造',operations:[]});
    await act(async()=>{await engine.confirmModification(review.id,['suggestion-1'],'重排结构','local');});
    expect(pipeline).not.toHaveBeenCalled();expect(useProjectStore.getState().stagedScreen).toBeNull();
    await act(async()=>{await engine.confirmModification(review.id,['suggestion-1'],'重排结构','page');});expect(pipeline).toHaveBeenCalledTimes(1);
  });
  test('补充要求返回合法局部操作时应用副本，过程中页面变化则拒绝',async()=>{
    const review=await start();
    objects.mockResolvedValue({requiresPageRewrite:false,reason:'',operations:[{nid:'title',type:'add_classes',value:'text-xl font-bold'}]});
    await act(async()=>{await engine.confirmModification(review.id,['suggestion-1'],'同时加粗','local');});
    expect(objects).toHaveBeenCalledTimes(2);expect(pipeline).not.toHaveBeenCalled();
    expect(useProjectStore.getState().stagedScreen?.newHtml).toContain('font-bold');
    expect(useProjectStore.getState().screens[id].htmlContent).toBe(original);
    act(()=>useProjectStore.getState().discardStagedChange());
    objects.mockResolvedValue(rawAnalysis);
    await act(async()=>{await engine.sendMessage('修改当前页面的标题',undefined,{referencedScreenId:id});});
    const next=engine.messages.filter(m=>m.modificationReview?.status==='ready').at(-1)!;
    let resolve!:(value:any)=>void;
    objects.mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));
    let pending!:Promise<void>;
    await act(async()=>{pending=engine.confirmModification(next.id,['suggestion-1'],'同时加粗','local');});
    act(()=>useProjectStore.getState().updateScreenHtml(id,original+'<p>人工更新</p>'));
    await act(async()=>{resolve({requiresPageRewrite:false,reason:'',operations:[{nid:'title',type:'add_classes',value:'font-bold'}]});await pending;});
    expect(useProjectStore.getState().stagedScreen).toBeNull();
    expect(useProjectStore.getState().screens[id].htmlContent).toContain('人工更新');
    expect(pipeline).not.toHaveBeenCalled();
  });
  test('选择后默认推荐局部，仍可明确选择整页',async()=>{
    const review=await start();let mode='';
    await render(<ModificationReviewCard review={review.modificationReview!} onConfirm={(_ids,_extra,m)=>{mode=m;}} onCancel={()=>{}}/>);
    act(()=>host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
    const radios=host.querySelectorAll<HTMLInputElement>('input[type="radio"]');expect(radios[0].checked).toBe(true);
    await act(async()=>{Array.from(host.querySelectorAll('button')).find(b=>b.textContent?.includes('按所选内容生成新版'))!.click();});expect(mode).toBe('local');
    act(()=>radios[1].click());await act(async()=>{Array.from(host.querySelectorAll('button')).find(b=>b.textContent?.includes('按所选内容生成新版'))!.click();});expect(mode).toBe('page');
  });
  test('单页润色局部确认也不再次生成完整HTML',async()=>{
    let closed=false;const stream=spyOn(DefaultAIEngineCore.prototype,'streamText');
    try{
      await render(<RestylePanel scope={id} onClose={()=>{closed=true;}}/>);
      await act(async()=>{Array.from(host.querySelectorAll('button')).find(b=>b.textContent?.includes('分析原页面'))!.click();});
      act(()=>host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
      await act(async()=>{Array.from(host.querySelectorAll('button')).find(b=>b.textContent?.includes('按所选内容生成新版'))!.click();});
      expect(closed).toBe(true);expect(stream).not.toHaveBeenCalled();expect(objects).toHaveBeenCalledTimes(1);
      expect(useProjectStore.getState().stagedScreen?.newHtml).toContain('text-xl font-bold');expect(useProjectStore.getState().screens[id].htmlContent).toBe(original);
    }finally{stream.mockRestore();}
  });
  test('副本比较预览继承原页的手动样式覆盖',async()=>{
    useProjectStore.getState().setOverride(id,'other-1',{color:'var(--color-danger)'});
    useProjectStore.getState().stageScreenChange(id,original,'副本');
    await render(<InfiniteCanvas/>);
    const frame=host.querySelector('[data-testid="screen-frame-staged-screen-preview"] iframe') as HTMLIFrameElement;
    expect(frame.srcdoc).toContain('[data-nid="other-1"] { color: var(--color-danger) !important; }');
  });
});
