import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {draftExecutionIssue} from '../src/services/ai/draftExecutionSource';
import {HistoricalDraftSource} from '../src/components/chat/HistoricalDraftSource';
import {useProjectStore} from '../src/stores/useProjectStore';
import {useHistoryStore} from '../src/stores/useHistoryStore';
import {PageRenderCheck} from '../src/services/ai/pageRenderCheck';
import {CanvasToolExecutor} from '../src/services/tools/canvasToolExecutor';
import {isPageCreationEvidence} from '../src/services/ai/pageCreationValidation';
import {expect,test} from 'bun:test';
import {PipelineExecutor} from '../src/services/ai/engine/pipeline/executor';
import {draftRepairTargets} from '../src/services/ai/qualityDraft';
import {DefaultAIEngineCore} from '../src/services/ai/engine/core/aiEngineCore';
import {MockTransport} from '../src/services/ai/engine/transport/mockTransport';
import {techBlueTheme} from '../src/utils/themePresets';
import {TaskBudget,withTaskBudget} from '../src/services/ai/taskBudget';
import {generateSectionedPage} from '../src/services/ai/sectionedGeneration';
import {saveQualityDraft,loadQualityDrafts} from '../src/services/storage/qualityDraftRepository';
import type {AIEngineCore} from '../src/services/ai/engine/core/types';
import {executeRestyleTarget} from '../src/services/ai/restyleExecutor';
import {buildRestyleContract} from '../src/services/ai/designWorkflow';
const provider={id:'pilot',name:'mock',protocol:'openai_compatible' as const,baseUrl:'http://mock',apiKey:''};
function setup(){
  let calls=0;const transport=new MockTransport();
  transport.queueResponse('<artifact title="正文页"><main class="container-max p-4"><h1>说明</h1><button class="btn btn-primary"><svg class="icon"><path d="M1 1L2 2"/></svg><span></span></button></main></artifact>');
  const original=new DefaultAIEngineCore(transport),core:AIEngineCore={generateObject:original.generateObject.bind(original),streamText:o=>{calls++;return original.streamText(o);}};
  const options={input:{rawPrompt:'新建长正文说明页',activeScreenId:null,decision:{intent:'create_screen' as const,targetScreenId:null,reason:'明确新建'}},provider,model:'test',engineCore:core,screens:{},
    deviceProfile:'pc' as const,frameWidth:1440,baseSystemPrompt:'设计页面',designSystem:techBlueTheme,contextualGuidance:{}};
  return {options,calls:()=>calls};
}
test('guided rejected draft reuses frozen evidence for local repair without sending a new request',async()=>{
  const f=setup(),first=await PipelineExecutor.execute(f.options);
  expect(first.status).toBe('rejected_by_quality');const draft=first.failedDraft!;
  expect(draft.guidanceSource?.designGuidance?.selection.selected[0].rule.id).toBe('LY-04');
  const labels=draftRepairTargets(draft).map(t=>({nid:t.nid,text:'继续查看'}));
  // The current setting may be absent; original source must still be recoverable.
  const repaired=await PipelineExecutor.execute({...f.options,contextualGuidance:undefined,qualityRepair:{draft,labels}});
  expect(repaired.status).toBe('applied');expect(f.calls()).toBe(1);expect(repaired.usage).toEqual({inputTokens:0,outputTokens:0});
  expect(repaired.workflowContract?.designGuidance).toBeUndefined();
  expect(repaired.executionRecord?.draftRepair?.historicalGuidanceSource).toEqual(draft.guidanceSource);
  expect(repaired.executionRecord?.source).toBe('local-edit');
  const stale=await PipelineExecutor.execute({...f.options,frameWidth:1500,qualityRepair:{draft,labels}});
  expect(stale.status).toBe('error');expect(f.calls()).toBe(1);
});
test('guided draft storage preserves provenance and rejects mismatched or tampered source',async()=>{
  const f=setup(),first=await PipelineExecutor.execute(f.options),id=`project-${crypto.randomUUID()}`;
  const saved={version:1 as const,id:`draft-${crypto.randomUUID()}`,projectId:id,createdAt:Date.now(),draft:first.failedDraft!,request:f.options.input.rawPrompt,projectContext:'context',
    decision:{action:'create_screen' as const,targetScreenId:null,styleReferenceScreenId:null,elementNid:null,referenceSource:null,reason:'test'},status:'blocked' as const};
  await saveQualityDraft(saved);expect((await loadQualityDrafts(id))[0].draft.guidanceSource).toEqual(first.workflowContract);
  const bad=structuredClone(saved);bad.draft.guidanceSource!.allowedChanges=['screen:elsewhere'];
  await expect(saveQualityDraft(bad)).rejects.toThrow('草稿无效');
});
test('section planning and all section bodies consume one shared parent budget',async()=>{
  let calls=0;
  const core:AIEngineCore={async generateObject(){throw Error('unused');},streamText(){
    calls++;const text=calls===1?JSON.stringify({title:'说明',shellHtml:'<main><section data-design-slot="section-1"></section><section data-design-slot="section-2"></section></main>',sections:[{id:'section-1',name:'一',requirements:'第一部分'},{id:'section-2',name:'二',requirements:'第二部分'}]}):'<artifact><p>第一部分内容</p></artifact>';
    return {textPromise:Promise.resolve(text),textStream:(async function*(){})(),reasoningStream:(async function*(){})(),reasoningPromise:Promise.resolve(undefined),usagePromise:Promise.resolve({inputTokens:1,outputTokens:1}),finishReasonPromise:Promise.resolve('stop'),abort(){}};
  }};
  const ledger=new TaskBudget({maxRequests:16,maxRequestedOutputTokens:8192,maxDurationMs:10000,maxRequestDurationMs:10000});
  const result=await generateSectionedPage(withTaskBudget(core,ledger),{provider,model:'test',messages:[{role:'user',content:'设计同一页'}]},'context');
  expect(calls).toBe(2);expect(result.errorMessage).toContain('预算已耗尽');expect(result.rawResponse).toBe('');
  expect(result.sectionedCheckpoint?.completed).toHaveLength(1);expect(ledger.snapshot().requestedOutputTokens).toBe(8192);
});
test('finite restyle patch groups share their parent allowance and never apply partial groups',async()=>{
  let calls=0;const source=`<main data-nid="root0001">${Array.from({length:30},(_,i)=>`<p data-nid="node${i.toString().padStart(4,'0')}">${'正文'.repeat(500)}</p>`).join('')}</main>`;
  const core:AIEngineCore={async generateObject(){throw Error('unused');},streamText(){calls++;return {textPromise:Promise.resolve('{"operations":[]}'),textStream:(async function*(){})(),reasoningStream:(async function*(){})(),reasoningPromise:Promise.resolve(undefined),usagePromise:Promise.resolve(undefined),finishReasonPromise:Promise.resolve('stop'),abort(){}};}};
  const target={id:'screen',kind:'screen' as const,name:'长页',html:source};
  const ledger=new TaskBudget({maxRequests:1,maxRequestedOutputTokens:2048,maxDurationMs:10000,maxRequestDurationMs:10000});
  const contract=buildRestyleContract({scope:'single',target,deviceProfile:'pc',frameWidth:1440,designSystem:techBlueTheme});
  const result=await executeRestyleTarget(core,{target,contract,request:{provider,model:'test',messages:[]},quality:{designSystem:techBlueTheme,deviceProfile:'pc'},taskBudget:ledger});
  expect(calls).toBe(1);expect(result.status).toBe('failed');expect(result.html).toBeUndefined();expect(target.html).toBe(source);
  expect(result.message).toContain('预算已耗尽');expect(ledger.snapshot().requestedOutputTokens).toBe(2048);
});

test('local label repair exposes historical rules without a new dispatch and retains them on actual page creation/undo',async()=>{
 const old=useProjectStore.getState(),history=useHistoryStore.getState(),inspect=PageRenderCheck.inspect;
 useProjectStore.getState().initNewProject({name:'草稿历史来源',deviceProfile:'pc',designSystem:techBlueTheme,createSpecimen:false});PageRenderCheck.inspect=async()=>({status:'complete',inspected:6,findings:[]});
 try{
  const f=setup(),first=await PipelineExecutor.execute(f.options),draft=first.failedDraft!,labels=draftRepairTargets(draft).map(t=>({nid:t.nid,text:'继续查看'}));
  const repaired=await PipelineExecutor.execute({...f.options,qualityRepair:{draft,labels}}),execution=repaired.executionRecord!;
  expect(draftExecutionIssue(execution,repaired.extractedHtml)).toBeUndefined();expect(f.calls()).toBe(1);expect(execution.draftRepair!.historicalGuidanceSource!.designGuidance!.requests).toHaveLength(1);
  const ui=renderToStaticMarkup(React.createElement(HistoricalDraftSource,{execution}));expect(ui).toContain('未调用模型');expect(ui).toContain('历史设计依据');expect(ui).toContain('不计作本次请求');
  const result=await CanvasToolExecutor.executeAsync({tool:'create_screen',params:{title:'正文',html:repaired.extractedHtml!,workflowContract:repaired.workflowContract,executionRecord:execution}});expect(result.success).toBe(true);
  const page=useProjectStore.getState().screens[result.screenId!],e=page.metadata!.creationEvidence!;expect(e.execution!.draftRepair).toEqual(execution.draftRepair);expect(isPageCreationEvidence(e)).toBe(true);expect(f.calls()).toBe(1);
  useHistoryStore.getState().undo();expect(useProjectStore.getState().screens[page.id]).toBeUndefined();useHistoryStore.getState().redo();expect(useProjectStore.getState().screens[page.id].metadata!.creationEvidence!.execution).toEqual(e.execution);
 }finally{PageRenderCheck.inspect=inspect;useProjectStore.setState(old,true);useHistoryStore.setState(history,true);}
});
for(const kind of ['parent','scope','receipt','dispatch','result','labels'] as const)test(`invalid ${kind} historical draft source cannot claim local repair`,async()=>{
 const f=setup(),first=await PipelineExecutor.execute(f.options),draft=first.failedDraft!,labels=draftRepairTargets(draft).map(t=>({nid:t.nid,text:'继续查看'}));
 const result=await PipelineExecutor.execute({...f.options,qualityRepair:{draft,labels}}),r=structuredClone(result.executionRecord!);
 if(kind==='parent')r.draftRepair!.sourceTaskId='foreign';if(kind==='scope')r.draftRepair!.historicalGuidanceSource!.allowedChanges=['screen:foreign'];if(kind==='receipt')r.draftRepair!.historicalGuidanceSource!.designGuidance!.requests[0].status='cancelled';
 if(kind==='dispatch')r.source='model';if(kind==='result')r.completeHtml='<main>其他结果</main>';if(kind==='labels')r.draftRepair!.confirmedLabels=[];
 expect(draftExecutionIssue(r,result.extractedHtml)).toBeDefined();if(kind!=='result')expect(renderToStaticMarkup(React.createElement(HistoricalDraftSource,{execution:r}))).toContain('历史来源不可用');expect(f.calls()).toBe(1);
});
test('explicit null creation contract fails closed instead of creating an unbound default contract',async()=>{
 const result=await CanvasToolExecutor.executeAsync({tool:'create_screen',params:{title:'不能替换坏合同',html:'<main>正文</main>',workflowContract:null as any}});expect(result.success).toBe(false);expect(result.error).toContain('合同结构损坏');
});
