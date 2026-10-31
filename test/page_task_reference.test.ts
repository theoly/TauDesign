import {expect,test} from 'bun:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {PipelineExecutor} from '../src/services/ai/engine/pipeline/executor';
import {DefaultAIEngineCore} from '../src/services/ai/engine/core/aiEngineCore';
import {MockTransport} from '../src/services/ai/engine/transport/mockTransport';
import {preparePageTaskPlan,pageTaskPlanIssue} from '../src/services/ai/pageTaskPlan';
import {buildDesignTaskContract} from '../src/services/ai/designWorkflow';
import {referenceImageIdentity} from '../src/services/ai/workflowSources';
import {capturePageTaskHistory} from '../src/services/ai/pageTaskHistory';
import {PageTaskPlanCard} from '../src/components/chat/PageTaskPlanCard';
import {TaskBudget} from '../src/services/ai/taskBudget';
import {techBlueTheme} from '../src/utils/themePresets';
import {chatPageTaskPlan} from './fixtures/pageTaskPlan';
const attachment={name:'预约.png',dataUrl:'data:image/png;base64,YQ==',region:{sourceFingerprint:'abcdef01',sourceWidth:100,sourceHeight:100,x:0,y:0,width:50,height:50}};
const imageId=`image:${referenceImageIdentity(attachment).fingerprint}`;
const plan={...chatPageTaskPlan,features:chatPageTaskPlan.features.map(f=>({...f,basis:'image',sourceIds:[imageId]}))};
const html='<artifact type="screen" title="预约"><main class="p-4"><h1>资料</h1><button class="btn btn-primary">查看详情</button></main></artifact>';
function fixture(){
 const transport=new MockTransport(),requests:any[]=[];
 const core=new DefaultAIEngineCore({id:'capture',stream:(request,event)=>{requests.push(request);return transport.stream(request,event);}});
 const options={input:{rawPrompt:'根据参考图片新建一个预约页面',activeScreenId:null,attachment:structuredClone(attachment)},
  provider:{id:'fixture',name:'fixture',protocol:'openai_compatible' as const,baseUrl:'http://mock',apiKey:'IMAGE_SECRET'},model:'fixture-vision',engineCore:core,screens:{},
  deviceProfile:'mobile' as const,frameWidth:390,designSystem:techBlueTheme,baseSystemPrompt:'baseline',pageTaskPlanning:{}};
 return {transport,requests,core,options};
}
const imageUrls=(request:any)=>request.body.messages.flatMap((m:any)=>Array.isArray(m.content)?m.content.filter((c:any)=>c.type==='image_url').map((c:any)=>c.image_url.url):[]);
test('actual reference pixels enter JSON planning before HTML; image attribution and history remain bounded metadata',async()=>{
 const f=fixture();f.transport.queueResponse(JSON.stringify(plan));f.transport.queueResponse(html);
 const output=await PipelineExecutor.execute(f.options);expect(output.status).toBe('applied');expect(f.requests).toHaveLength(2);
 expect(f.requests[0].body.response_format.type).toBe('json_schema');expect(f.requests[1].body.response_format).toBeUndefined();
 for(const request of f.requests)expect(imageUrls(request)).toEqual([attachment.dataUrl]);
 expect(JSON.stringify(f.requests[0].body.messages)).toContain('sourceFingerprint');
 expect(f.requests[0].body.messages[0].content).toContain('WECHAT');
 expect(f.requests[1].body.messages[0].content).toContain('PAGE TASK PLAN');
 expect(output.workflowContract?.pageTaskPlan?.request.imageFingerprint).toBe(referenceImageIdentity(attachment).fingerprint);
 expect(output.workflowContract?.referenceImage?.inputReceipt?.model).toBe('fixture-vision');expect(output.taskBudget?.requests).toBe(2);
 const history=capturePageTaskHistory(output.workflowContract,f.options.input.rawPrompt)!;expect(history).toBeDefined();
 expect(history.contract.pageTaskPlan?.plan.features[0].basis).toBe('image');
 for(const value of [attachment.dataUrl,'IMAGE_SECRET'])expect(JSON.stringify(history)).not.toContain(value);
 expect(renderToStaticMarkup(React.createElement(PageTaskPlanCard,{contract:history.contract}))).toContain('参考图观察');
});
test('missing/wrong pixels, wrong crop and a text-only model stop before the planning request',async()=>{
 const f=fixture(),contract=buildDesignTaskContract({intent:'create_screen',request:f.options.input.rawPrompt,deviceProfile:'mobile',frameWidth:390,referenceImage:referenceImageIdentity(attachment)});
 for(const change of [{attachment:undefined},{attachment:{...attachment,dataUrl:'data:image/png;base64,Yg=='}},
  {attachment:{...attachment,region:{...attachment.region,x:10}}},{model:'plain-text'}]){
  const budget=new TaskBudget({maxRequests:1,maxRequestedOutputTokens:3072,maxDurationMs:900000,maxRequestDurationMs:900000});
  try{await expect(preparePageTaskPlan(f.core,{contract,provider:f.options.provider,model:f.options.model,budget,attachment,isCurrent:()=>true,...change})).rejects.toThrow();}
  finally{budget.close();}
 }
 expect(f.requests).toHaveLength(0);
});
test('custom mobile navigation policy reaches image planning while system chrome remains excluded',async()=>{
 const f=fixture();f.transport.queueResponse(JSON.stringify(plan));f.transport.queueResponse(html);
 expect((await PipelineExecutor.execute({...f.options,useCustomNavigation:true})).status).toBe('applied');
 expect(f.requests[0].body.messages[0].content).toContain('CUSTOM MOBILE NAVIGATION ENABLED');
 expect(f.requests[0].body.messages[0].content).toContain('系统时间/信号/Wi-Fi/电量状态栏');
});
test('frozen reference planning replays without a planner; changed image/crop/model cannot reuse it',async()=>{
 const first=fixture();first.transport.queueResponse(JSON.stringify(plan));first.transport.queueResponse(html);
 const result=await PipelineExecutor.execute(first.options),snapshot=result.workflowContract!.pageTaskPlan;
 const replay=fixture();replay.transport.queueResponse(html);
 expect((await PipelineExecutor.execute({...replay.options,pageTaskPlanning:{snapshot}})).status).toBe('applied');expect(replay.requests).toHaveLength(1);
 for(const change of [{input:{...replay.options.input,attachment:{...attachment,dataUrl:'data:image/png;base64,Yg=='}}},
  {input:{...replay.options.input,attachment:{...attachment,region:{...attachment.region,x:10}}}},{model:'different-vision'}]){
  const denied=fixture();expect((await PipelineExecutor.execute({...denied.options,...change,pageTaskPlanning:{snapshot}})).status).toBe('error');expect(denied.requests).toHaveLength(0);
 }
 const corrupt=structuredClone(result.workflowContract!);delete corrupt.pageTaskPlan!.request.imageFingerprint;
 expect(pageTaskPlanIssue(corrupt)).toBeDefined();
});
test('unresolved image facts or a stale execution stop before HTML, and binary echoes are rejected',async()=>{
 const f=fixture();f.transport.queueResponse(JSON.stringify({...plan,questions:['请确认预约权限']}));
 const pending=await PipelineExecutor.execute(f.options);expect(pending.status).toBe('error');expect(pending.errorMessage).toContain('预约权限');expect(f.requests).toHaveLength(1);
 const stale=fixture();stale.transport.queueResponse(JSON.stringify(plan));let current=true;
 const core={streamText:stale.core.streamText.bind(stale.core),async generateObject<T>(...args:Parameters<typeof stale.core.generateObject>){const result=await stale.core.generateObject<T>(...args);current=false;return result;}};
 expect((await PipelineExecutor.execute({...stale.options,engineCore:core,isCurrent:()=>current})).status).toBe('error');expect(stale.requests).toHaveLength(1);
 const echo=fixture();echo.transport.queueResponse(JSON.stringify({...plan,goal:attachment.dataUrl}));expect((await PipelineExecutor.execute(echo.options)).status).toBe('error');expect(echo.requests).toHaveLength(1);
});
test('output continuation preserves the image and frozen plan without another JSON request',async()=>{
 const f=fixture();f.transport.queueResponse(JSON.stringify(plan));f.transport.enqueueScenario({events:[{type:'Delta',text:'<artifact title="预约"><main class="p-4"><p>资料'},{type:'Done',finish_reason:'length'}]});
 const core=new DefaultAIEngineCore({id:'capture',stream:(request,event)=>{
  f.requests.push(request);const marker=JSON.stringify(request.body.messages).match(/TAUDESIGN_CONTINUE_[\w-]+/)?.[0];
  if(marker)f.transport.queueResponse(marker+'\n</p><button class="btn btn-primary">查看详情</button></main></artifact>');
  return f.transport.stream(request,event);
 }});
 const output=await PipelineExecutor.execute({...f.options,engineCore:core});expect(output.status).toBe('applied');
 expect(f.requests).toHaveLength(3);expect(f.requests.filter(r=>r.body.response_format)).toHaveLength(1);expect(output.executionRecord?.continuationCount).toBe(1);
 for(const r of f.requests)expect(imageUrls(r)).toEqual([attachment.dataUrl]);expect(output.workflowContract?.pageTaskPlan?.plan.features[0].basis).toBe('image');
});
test('reference failed drafts save and repair with original image plan but no additional model request',async()=>{
 const {saveQualityDraft,loadQualityDrafts}=await import('../src/services/storage/qualityDraftRepository');const {draftRepairTargets}=await import('../src/services/ai/qualityDraft');
 const f=fixture();f.transport.queueResponse(JSON.stringify(plan));f.transport.queueResponse('<artifact title="预约"><main class="p-4"><button class="btn btn-primary"><svg class="icon"><path d="M1 1L2 2"/></svg><span></span></button></main></artifact>');
 const output=await PipelineExecutor.execute(f.options);expect(output.status).toBe('rejected_by_quality');const draft=output.failedDraft!;
 const saved={version:1 as const,id:`draft-${crypto.randomUUID()}`,projectId:`project-${crypto.randomUUID()}`,createdAt:Date.now(),draft,request:f.options.input.rawPrompt,projectContext:'context',status:'blocked' as const,
  decision:{action:'create_screen' as const,targetScreenId:null,styleReferenceScreenId:null,elementNid:null,referenceSource:null,reason:'明确新建'}};
 await saveQualityDraft(saved);const reopened=(await loadQualityDrafts(saved.projectId))[0];expect(JSON.stringify(reopened)).not.toContain(attachment.dataUrl);
 const labels=draftRepairTargets(reopened.draft).map(t=>({nid:t.nid,text:'查看详情'}));
 const repaired=await PipelineExecutor.execute({...f.options,pageTaskPlanning:{snapshot:reopened.draft.pageTaskSource!.pageTaskPlan},qualityRepair:{draft:reopened.draft,labels}});
 expect(repaired.status).toBe('applied');expect(f.requests).toHaveLength(2);expect(repaired.executionRecord?.draftRepair?.historicalPageTaskSource?.pageTaskPlan).toEqual(draft.pageTaskSource?.pageTaskPlan);
});
test('reference single-page sections consume one functional plan before shell/parts in the same budget',async()=>{
 const f=fixture();f.transport.queueResponse(JSON.stringify(plan));f.transport.queueResponse(JSON.stringify({title:'预约',shellHtml:'<main class="p-4"><section data-design-slot="section-1"></section><section data-design-slot="section-2"></section></main>',sections:[{id:'section-1',name:'资料',requirements:'显示资料'},{id:'section-2',name:'操作',requirements:'显示查看操作'}]}));
 f.transport.queueResponse('<artifact><p>资料</p></artifact>');f.transport.queueResponse('<artifact><button class="btn btn-primary">查看详情</button></artifact>');
 const output=await PipelineExecutor.execute({...f.options,sectioned:{}});expect(output.status).toBe('applied');expect(f.requests).toHaveLength(4);expect(output.taskBudget?.requests).toBe(4);
 expect(output.workflowContract?.pageTaskPlan?.request.imageFingerprint).toBe(referenceImageIdentity(attachment).fingerprint);
 for(const r of f.requests)expect(imageUrls(r)).toEqual([attachment.dataUrl]);
});
