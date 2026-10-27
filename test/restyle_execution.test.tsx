import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { RestylePanel } from '../src/components/theme/RestylePanel';
import { useProjectStore } from '../src/stores/useProjectStore';
import { useHistoryStore } from '../src/stores/useHistoryStore';
import { useAIConfigStore } from '../src/stores/useAIConfigStore';
import { neutralModernTheme } from '../src/utils/themePresets';
import { finalizeModelHtml } from '../src/services/ai/modelHtmlResult';
import { executeRestyleTarget } from '../src/services/ai/restyleExecutor';
import { executeRestyleBatch, restyleContextKey } from '../src/services/ai/restyleBatch';
import { acceptRestyleResult, summarizeOutcomes, type RestyleTarget, type RestyleOutcome } from '../src/services/ai/restyleService';
import { buildRestyleContract } from '../src/services/ai/designWorkflow';
import { PipelineExecutor } from '../src/services/ai/engine/pipeline/executor';
import { DefaultAIEngineCore } from '../src/services/ai/engine/core/aiEngineCore';
import { PageRenderCheck } from '../src/services/ai/pageRenderCheck';
import type { AIEngineCore, StreamTextOptions } from '../src/services/ai/engine/core/types';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
const provider={id:'test-restyle',name:'Test',protocol:'openai_compatible' as const,baseUrl:'https://example.test/v1',apiKey:'test',isEnabled:true};
const html=(id:string)=>`<main data-nid="${id}" class="p-4"><p data-nid="${id}-text">页面${id}</p></main>`;
const pause=()=>new Promise(resolve=>setTimeout(resolve,0));
const stream=(text:string,reason='stop')=>({textStream:(async function*(){yield text;})(),reasoningStream:(async function*(){})(),textPromise:Promise.resolve(text),reasoningPromise:Promise.resolve(undefined),usagePromise:Promise.resolve(undefined),finishReasonPromise:Promise.resolve(reason),abort(){}});
const core=(text:string):AIEngineCore=>({streamText:()=>stream(text),generateObject:async()=>{throw new Error('unused');}});
const target:RestyleTarget={kind:'screen',id:'a',name:'A',html:html('a')};
const options=(t=target)=>({target:t,contract:buildRestyleContract({scope:'batch',target:t,deviceProfile:'pc',frameWidth:1440,designSystem:neutralModernTheme}),
  quality:{deviceProfile:'pc' as const,designSystem:neutralModernTheme},request:{provider,model:'test',messages:[{role:'user' as const,content:'润色'}],maxTokens:16384}});

describe('shared model HTML terminal validation',()=>{
  test('errors, cancelled streams, unsafe raw HTML and unclosed artifacts never become normalized candidates',()=>{
    const response={rawResponse:`<artifact>${target.html}</artifact>`,continuationCount:0,warnings:[]};
    expect(finalizeModelHtml({...response,errorMessage:'network down'})).toMatchObject({status:'error',message:'network down'});
    const controller=new AbortController();controller.abort();expect(finalizeModelHtml(response,{signal:controller.signal}).status).toBe('error');
    expect(finalizeModelHtml({...response,rawResponse:'<artifact><main>截断',finishReason:'length'})).toMatchObject({status:'rejected_by_quality',qualityReport:{passed:false}});
    const unsafe=finalizeModelHtml({...response,rawResponse:'<artifact><main onclick="alert(1)">危险</main></artifact>'});
    expect(unsafe.status).toBe('rejected_by_quality');expect(unsafe.html).toBeUndefined();
  });
  test('main pipeline and restyle share navigation normalization and terminal quality while preserving their contracts',async()=>{
    const response=`<artifact identifier="a" title="A">${target.html}</artifact>`;
    const main=await PipelineExecutor.execute({engineCore:core(response),provider,model:'test',screens:{},deviceProfile:'pc',frameWidth:1440,baseSystemPrompt:'test',designSystem:neutralModernTheme,
      input:{rawPrompt:'创建页面',activeScreenId:null,decision:{intent:'create_screen',targetScreenId:null}}});
    const restyle=await executeRestyleTarget(core(response),options());
    expect(main.status).toBe('applied');expect(restyle.status).toBe('applied');
    expect(main.extractedHtml).toBe(restyle.html);expect(main.executionRecord?.completeHtml).toBe(restyle.executionRecord?.completeHtml);
    expect(restyle.workflowContract?.workflowId).toBe('restyle-batch');expect(main.workflowContract?.workflowId).toBe('create-page');
    expect(restyle.executionRecord?.rawResponse).toBe(response);
  });
  test('uncommon complete raw fragments stay compatible; strict restyle structure rejection remains separate from generic quality',async()=>{
    const article={...target,html:'<article data-nid="a"><p data-nid="p">保留</p></article>'};
    const valid=await executeRestyleTarget(core(article.html),options(article));expect(valid.status).toBe('applied');
    const removed=await executeRestyleTarget(core('<article data-nid="a"></article>'),options(article));
    expect(removed.status).toBe('skipped_structure');expect(removed.executionRecord?.completeHtml).toBeUndefined();
    const broken=await executeRestyleTarget(core('```html\n<article>不完整'),options(article));
    expect(broken.status).toBe('failed');expect(broken.executionRecord?.rawResponse).toContain('不完整');
  });
  test('cancellation stops a noncooperative model wait without accepting later complete output',async()=>{
    const controller=new AbortController();let resolve!:(value:string)=>void;
    const pendingCore:AIEngineCore={...core(''),streamText:()=>({...stream(''),textPromise:new Promise(r=>{resolve=r;})})};
    const pending=executeRestyleTarget(pendingCore,{...options(),request:{...options().request,signal:controller.signal}});
    controller.abort();const result=await pending;expect(result.status).toBe('failed');expect(result.executionRecord?.errorMessage).toContain('取消');
    resolve(target.html);await pause();expect(result.html).toBeUndefined();
  });
});

describe('restyle batch orchestration and application guards',()=>{
  let priorProject:ReturnType<typeof useProjectStore.getState>,priorHistory:ReturnType<typeof useHistoryStore.getState>;
  let root:Root|undefined,host:HTMLDivElement|undefined;
  let render:ReturnType<typeof spyOn>;
  beforeEach(()=>{
    render=spyOn(PageRenderCheck,'inspect').mockResolvedValue({status:'complete',findings:[],inspected:2});
    priorProject=useProjectStore.getState();priorHistory=useHistoryStore.getState();
    const store=useProjectStore.getState();store.initNewProject({name:'批量测试',deviceProfile:'pc',designSystem:neutralModernTheme,createSpecimen:false});
    for(const id of ['a','b','c'])store.addScreen({name:id,htmlContent:html(id),position:{x:0,y:0}},id);
  });
  afterEach(()=>{
    render.mockRestore();
    if(root)act(()=>root!.unmount());host?.remove();host=undefined;root=undefined;
    useProjectStore.setState(priorProject,true);useHistoryStore.setState(priorHistory,true);
  });
  const generate=async(t:RestyleTarget)=>acceptRestyleResult(t,t.html.replace('p-4','p-6'));
  function batchOptions(){
    const store=useProjectStore.getState(),plan=store.buildRestylePlan();
    return {plan,dryRun:acceptRestyleResult(plan.dryRun!,plan.dryRun!.html.replace('p-4','p-6')),
      confirmedContextKey:restyleContextKey(useProjectStore.getState()),getContextKey:()=>restyleContextKey(useProjectStore.getState()),
      resolveTarget:(t:RestyleTarget)=>{
        const s=useProjectStore.getState();const source=t.kind==='component'?s.components[t.id]?.templateHtml:s.screens[t.id]?.htmlContent;
        return source===undefined?null:{...t,html:source};
      },generate,apply:(outcome:RestyleOutcome)=>store.applyRestyleOutcome(outcome)};
  }
  test('reuses the confirmed trial and applies sequentially through History/checkpoints',async()=>{
    const o=batchOptions(),calls:string[]=[];const result=await executeRestyleBatch({...o,generate:async t=>{calls.push(t.id);return generate(t);}});
    expect(result.status).toBe('completed');expect(calls).toEqual(['b','c']);expect(summarizeOutcomes(result.outcomes).applied).toBe(3);
    expect(useProjectStore.getState().screens.a.htmlContent).toContain('p-6');expect(useProjectStore.getState().screens.c.htmlContent).toContain('p-6');
    useHistoryStore.getState().undo();expect(useProjectStore.getState().screens.c.htmlContent).toBe(html('c'));
  });
  test('component synchronization updates later page baselines without being mistaken for an external edit',async()=>{
    const store=useProjectStore.getState();
    useProjectStore.setState({components:{shared:{id:'shared',name:'共享组件',templateHtml:'<section data-nid="component-root" class="card p-4">共享内容</section>',createdAt:1,updatedAt:1}}});
    store.insertComponent('a','shared');
    const o=batchOptions(),baseline=o.plan.queue.find(t=>t.kind==='screen'&&t.id==='a')!.html;
    let current='';
    const result=await executeRestyleBatch({...o,generate:async t=>{if(t.id==='a')current=t.html;return generate(t);}});
    expect(result.status).toBe('completed');expect(current).not.toBe(baseline);expect(current).toContain('card p-6');
    expect(result.outcomes.every(outcome=>outcome.status==='applied')).toBe(true);
  });
  for(const change of ['edit','project','cancel'] as const)test(`stops after ${change} during a later model request; no stale overwrite or subsequent request`,async()=>{
    const store=useProjectStore.getState(),o=batchOptions(),controller=new AbortController();let release!:(result:RestyleOutcome)=>void;let waiting!:RestyleTarget;let calls=0;
    const pending=executeRestyleBatch({...o,signal:controller.signal,generate:async t=>{calls++;waiting=t;return new Promise(resolve=>{release=resolve;});}});
    await pause();expect(store.screens.a.htmlContent).toBe(html('a'));expect(useProjectStore.getState().screens.a.htmlContent).toContain('p-6');
    if(change==='edit')store.updateScreenHtml('b','<main>人工修改</main>','人工修改');
    if(change==='project')store.initNewProject({name:'新工程',deviceProfile:'pc',createSpecimen:false});
    if(change==='cancel')controller.abort();
    release(await generate(waiting));const result=await pending;
    expect(result.status).toBe(change==='cancel'?'cancelled':'stale');expect(calls).toBe(1);expect(result.outcomes).toHaveLength(1);
    if(change==='edit')expect(useProjectStore.getState().screens.b.htmlContent).toContain('人工修改');
    if(change==='project')expect(useProjectStore.getState().screenOrder).toHaveLength(0);
  });
  test('dry-run context or queue mismatch is rejected before application and model work',async()=>{
    const o=batchOptions();let called=0;
    const stale=await executeRestyleBatch({...o,confirmedContextKey:'stale',generate:async t=>{called++;return generate(t);}});
    expect(stale.status).toBe('stale');expect(called).toBe(0);
    const mismatch=await executeRestyleBatch({...o,dryRun:{...o.dryRun,target:{...o.dryRun.target,id:'another'}}});
    expect(mismatch.status).toBe('stale');expect(useProjectStore.getState().screens.a.htmlContent).toBe(html('a'));
  });
  test('only actual apply success counts; per-item errors and conflict are reported and busy work continues safely',async()=>{
    const o=batchOptions();let applies=0;
    const result=await executeRestyleBatch({...o,apply:()=>{applies++;return false;},generate:async t=>{
      if(t.id==='b')throw new Error('network offline');return generate(t);
    }});
    expect(result.status).toBe('completed');expect(applies).toBe(2);
    expect(summarizeOutcomes(result.outcomes)).toMatchObject({applied:0,conflicts:2,failed:1});
    expect(useProjectStore.getState().screens.c.htmlContent).toBe(html('c'));
  });
  test('awaits application gates before counting success or starting the next target',async()=>{
    const o=batchOptions(),events:string[]=[];
    const pending=executeRestyleBatch({...o,apply:async(outcome)=>{
      events.push(`checking:${outcome.target.id}`);await pause();
      events.push(`blocked:${outcome.target.id}`);return {applied:false,message:'当前 iframe 无法完成检查'};
    },generate:async t=>{events.push(`generate:${t.id}`);return generate(t);}});
    const result=await pending;
    expect(summarizeOutcomes(result.outcomes)).toMatchObject({applied:0,conflicts:3});
    expect(result.outcomes[0].message).toContain('iframe');
    expect(events.indexOf('blocked:a')).toBeLessThan(events.indexOf('generate:b'));
    expect(useProjectStore.getState().screens.a.htmlContent).toBe(html('a'));
  });
  test('store refuses forged applied outcomes, missing entities and stale baselines without adding checkpoints',async()=>{
    const store=useProjectStore.getState(),count=useHistoryStore.getState().checkpoints.length,past=useHistoryStore.getState().past.length;
    for(const value of [target.html+'<script>alert(1)</script>','<main data-nid="a"></main>'])expect((await store.applyRestyleOutcome({target,status:'applied',html:value})).applied).toBe(false);
    expect((await store.applyRestyleOutcome({target:{...target,html:'old'},status:'applied',html:target.html})).applied).toBe(false);
    expect((await store.applyRestyleOutcome({target:{...target,id:'deleted'},status:'applied',html:target.html})).applied).toBe(false);
    expect(useHistoryStore.getState().checkpoints).toHaveLength(count);expect(useHistoryStore.getState().past).toHaveLength(past);
  });
  test('newly protected nodes and changed style/context identity invalidate old work',async()=>{
    const store=useProjectStore.getState(),key=restyleContextKey(store);
    store.setOverride('a','a',{color:'var(--color-primary)'});
    expect(restyleContextKey(useProjectStore.getState())).not.toBe(key);
    const count=useHistoryStore.getState().past.length;
    expect((await store.applyRestyleOutcome({target,status:'applied',html:target.html.replace('p-4','p-6')})).applied).toBe(false);
    expect(useHistoryStore.getState().past).toHaveLength(count);
  });
  test('panel prevents duplicate trials and refuses confirmation if the project changed after trial',async()=>{
    const binding=spyOn(useAIConfigStore.getState(),'getActiveProviderForRole').mockReturnValue({provider,modelId:'test'});
    let release!:(text:string)=>void;let calls=0;
    const streamSpy=spyOn(DefaultAIEngineCore.prototype,'streamText').mockImplementation(()=>{calls++;return {...stream(''),textPromise:new Promise(resolve=>{release=resolve;})};});
    try{
      host=document.createElement('div');document.body.append(host);root=createRoot(host);
      await act(async()=>{root!.render(<RestylePanel scope="all" onClose={()=>{}}/>);});
      // Token-bound pages default to no model work; explicitly select the trial target.
      await act(async()=>{(host!.querySelector('input[type="checkbox"]') as HTMLInputElement).click();});
      const find=(text:string)=>Array.from(host!.querySelectorAll('button')).find(b=>b.textContent?.includes(text))!;
      await act(async()=>{const button=find('试跑单个目标');button.click();button.click();});expect(calls).toBe(1);
      await act(async()=>{release(`<artifact>${html('a').replace('p-4','p-6')}</artifact>`);await pause();});
      act(()=>useProjectStore.getState().updateScreenHtml('a','<main>人工修改</main>','人工修改'));
      await act(async()=>{find('确认效果')?.click();await pause();});
      expect(calls).toBe(1);expect(host.textContent).toContain('重新试跑');expect(useProjectStore.getState().screens.a.htmlContent).toContain('人工修改');
    }finally{streamSpy.mockRestore();binding.mockRestore();}
  });
});
