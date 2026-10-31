import {expect,test} from 'bun:test';
import {PipelineExecutor} from '../src/services/ai/engine/pipeline/executor';
import {DefaultAIEngineCore} from '../src/services/ai/engine/core/aiEngineCore';
import {MockTransport} from '../src/services/ai/engine/transport/mockTransport';
import {preparePageTaskPlan} from '../src/services/ai/pageTaskPlan';
import {buildDesignTaskContract,contentFingerprint} from '../src/services/ai/designWorkflow';
import {referenceImageIdentity,inspectReferenceInput,recordReferenceInput} from '../src/services/ai/workflowSources';
import {capturePageTaskHistory} from '../src/services/ai/pageTaskHistory';
import {TaskBudget} from '../src/services/ai/taskBudget';
import {techBlueTheme} from '../src/utils/themePresets';
import {chatPageTaskPlan} from './fixtures/pageTaskPlan';
const attachment={name:'资料参考.png',dataUrl:'data:image/png;base64,YQ==',region:{sourceFingerprint:'abcdef01',sourceWidth:100,sourceHeight:100,x:0,y:0,width:50,height:50}};
const original='<main data-nid="root0001"><h1 data-nid="title001">资料</h1><button data-nid="view0001" type="button" class="btn btn-primary">查看详情</button></main>';
const response='<artifact identifier="page" type="screen" title="资料页"><main data-nid="root0001"><h1 data-nid="title001">资料</h1><button data-nid="view0001" type="button" class="btn btn-primary">查看详情</button><label>邮箱<input class="input"/></label><button class="btn btn-primary">保存</button></main></artifact>';
const plan={...chatPageTaskPlan,goal:'查看资料并补充邮箱',features:[{...chatPageTaskPlan.features[0],change:'retain',basis:'page',sourceIds:['page']},{...chatPageTaskPlan.features[0],id:'f2',title:'邮箱',basis:'image',sourceIds:[`image:${referenceImageIdentity(attachment).fingerprint}`],information:[{label:'邮箱',kind:'input'}],interactions:[{label:'保存',precondition:'已填写邮箱',outcome:'显示校验反馈',targetScreenId:''}]}]};
function fixture(){
 const transport=new MockTransport(),requests:any[]=[];
 const core=new DefaultAIEngineCore({id:'capture',stream:(request,event)=>{requests.push(request);return transport.stream(request,event);}});
 const options={input:{rawPrompt:'参照附图修改资料页，增加邮箱输入框和保存后的校验反馈',activeScreenId:'page',attachment:structuredClone(attachment),decision:{intent:'modify_screen' as const,targetScreenId:'page',styleReferenceScreenId:null,elementNid:null,reason:'明确修改'}},
  provider:{id:'fixture',name:'fixture',protocol:'openai_compatible' as const,baseUrl:'http://mock',apiKey:'REFERENCE_MODIFY_SECRET'},model:'fixture-vision',engineCore:core,
  screens:{page:{id:'page',name:'资料页',htmlContent:original},other:{id:'other',name:'其它页',htmlContent:'<main>OTHER_PRIVATE_PAGE</main>'}},
  knowledgeSources:[{kind:'page' as const,id:'page',fingerprint:contentFingerprint(original)}],deviceProfile:'mobile' as const,frameWidth:390,designSystem:techBlueTheme,baseSystemPrompt:'baseline',pageTaskPlanning:{}};
 return {transport,requests,core,options};
}
const images=(request:any)=>request.body.messages.flatMap((m:any)=>Array.isArray(m.content)?m.content.filter((c:any)=>c.type==='image_url').map((c:any)=>c.image_url.url):[]);
test('whole-page reference functionality plans against the exact old page and actual image before staging',async()=>{
 const f=fixture();f.transport.queueResponse(JSON.stringify(plan));f.transport.queueResponse(response);
 const result=await PipelineExecutor.execute(f.options);expect([result.status,result.errorMessage]).toEqual(['staged_side_by_side',undefined]);expect(f.requests).toHaveLength(2);
 const input=JSON.parse(f.requests[0].body.messages.at(-1).content.find((c:any)=>c.type==='text').text);
 expect(input.baselineHtml).toBe(original);expect(input.target.id).toBe('page');expect(input.allowedChanges).toEqual(['screen:page']);expect(input.operation).toBe('modify');expect(input.regions).toBeUndefined();
 expect(JSON.stringify(f.requests[0].body.messages)).not.toContain('OTHER_PRIVATE_PAGE');
 for(const r of f.requests)expect(images(r)).toEqual([attachment.dataUrl]);expect(f.requests[1].body.messages[0].content).toContain('PAGE TASK PLAN');
 expect(f.options.screens.page.htmlContent).toBe(original);expect(f.options.screens.other.htmlContent).toContain('OTHER_PRIVATE_PAGE');
 const contract=result.workflowContract!;expect(contract.referenceImage?.region).toEqual(attachment.region);expect(contract.pageTaskPlan?.request.imageFingerprint).toBe(referenceImageIdentity(attachment).fingerprint);expect(inspectReferenceInput(contract).status).toBe('passed');
 expect(result.taskBudget).toMatchObject({requests:2,requestedOutputTokens:11264,closed:true});
 const history=capturePageTaskHistory(contract,f.options.input.rawPrompt);expect(history?.contract.pageTaskPlan?.plan.features[0].change).toBe('retain');expect(history?.contract.pageTaskPlan?.plan.features[1].basis).toBe('image');
 for(const value of [attachment.dataUrl,'REFERENCE_MODIFY_SECRET',original])expect(JSON.stringify(history)).not.toContain(value);
});
test('only unique full-screen authorization can use a reference without explicit region roots',async()=>{
 const f=fixture();
 const contract=buildDesignTaskContract({intent:'modify_screen',request:f.options.input.rawPrompt,target:{id:'page',name:'资料页',htmlContent:original},deviceProfile:'mobile',frameWidth:390,referenceImage:referenceImageIdentity(attachment)});
 for(const allowedChanges of [[],['element:title001'],['screen:other'],['screen:page','screen:other']]){
  const budget=new TaskBudget({maxRequests:1,maxRequestedOutputTokens:3072,maxDurationMs:900000,maxRequestDurationMs:900000});
  try{await expect(preparePageTaskPlan(f.core,{contract:{...contract,allowedChanges},provider:f.options.provider,model:f.options.model,budget,baselineHtml:original,attachment,isCurrent:()=>true})).rejects.toThrow('授权范围');}finally{budget.close();}
 }
 expect(f.requests).toHaveLength(0);
});
test('frozen whole-page image plans reject new pixels, crop, model, request, baseline and text sources before HTML',async()=>{
 const first=fixture();first.transport.queueResponse(JSON.stringify(plan));first.transport.queueResponse(response);const result=await PipelineExecutor.execute(first.options);
 const snapshot=result.workflowContract!.pageTaskPlan;
 const replay=fixture();replay.transport.queueResponse(response);expect((await PipelineExecutor.execute({...replay.options,pageTaskPlanning:{snapshot}})).status).toBe('staged_side_by_side');expect(replay.requests).toHaveLength(1);
 const base=fixture().options;
 for(const change of [
  {input:{...base.input,attachment:{...attachment,dataUrl:'data:image/png;base64,Yg=='}}},
  {input:{...base.input,attachment:{...attachment,region:{...attachment.region,x:10}}}},
  {input:{...base.input,attachment:undefined}}, {model:'another-vision'},
  {input:{...base.input,rawPrompt:base.input.rawPrompt+'增加权限功能'}},
  {screens:{...base.screens,page:{...base.screens.page,htmlContent:original+'<p>后续资料</p>'}}},
  {input:{...base.input,textReferences:[{name:'规则.md',content:'需要审批',source:'upload' as const}]}}
 ]){
  const f=fixture();const denied=await PipelineExecutor.execute({...f.options,...change,pageTaskPlanning:{snapshot}});expect(denied.status).toBe('error');expect(f.requests).toHaveLength(0);
 }
});
test('questions, truncation, cancellation and staleness never produce a partial whole-page candidate',async()=>{
 for(const mode of ['question','length','cancel','stale']){
  const f=fixture(),controller=new AbortController();let current=true;
  if(mode==='length')f.transport.enqueueScenario({events:[{type:'Delta',text:JSON.stringify(plan)},{type:'Done',finish_reason:'length'}]});
  else f.transport.queueResponse(JSON.stringify(mode==='question'?{...plan,questions:['邮箱是否公开？']}:plan));
  const core={streamText:f.core.streamText.bind(f.core),async generateObject<T>(...args:Parameters<typeof f.core.generateObject>){const p=await f.core.generateObject<T>(...args);if(mode==='cancel')controller.abort();if(mode==='stale')current=false;return p;}};
  const result=await PipelineExecutor.execute({...f.options,engineCore:core,signal:controller.signal,isCurrent:()=>current});expect(result.status).toBe('error');expect(result.extractedHtml).toBeUndefined();expect(f.requests).toHaveLength(1);
 }
});
test('borrowed output budget is neither expanded nor replaced after the planning request',async()=>{
 const f=fixture();f.transport.queueResponse(JSON.stringify(plan));const budget=new TaskBudget({maxRequests:1,maxRequestedOutputTokens:3072,maxDurationMs:900000,maxRequestDurationMs:900000});
 try{const result=await PipelineExecutor.execute({...f.options,taskBudget:budget});expect(result.status).toBe('error');expect(result.extractedHtml).toBeUndefined();expect(f.requests).toHaveLength(1);expect(budget.snapshot()).toMatchObject({requests:1,requestedOutputTokens:3072,closed:false});}finally{budget.close();}
});
test('whole-page continuation retains reference planning and sends no second planner request',async()=>{
 const f=fixture();f.transport.queueResponse(JSON.stringify(plan));f.transport.enqueueScenario({events:[{type:'Delta',text:response.slice(0,-'</main></artifact>'.length)},{type:'Done',finish_reason:'length'}]});
 const core=new DefaultAIEngineCore({id:'capture',stream:(request,event)=>{f.requests.push(request);const marker=JSON.stringify(request.body.messages).match(/TAUDESIGN_CONTINUE_[\w-]+/)?.[0];if(marker)f.transport.queueResponse(marker+'\n</main></artifact>');return f.transport.stream(request,event);}});
 const result=await PipelineExecutor.execute({...f.options,engineCore:core});expect(result.status).toBe('staged_side_by_side');expect(f.requests).toHaveLength(3);expect(f.requests.filter(r=>r.body.response_format)).toHaveLength(1);expect(result.executionRecord?.continuationCount).toBe(1);for(const r of f.requests)expect(images(r)).toEqual([attachment.dataUrl]);expect(inspectReferenceInput(result.workflowContract!).status).toBe('passed');
});
test('saved failed whole-page image drafts repair labels without replanning or losing original input evidence',async()=>{
 const {saveQualityDraft,loadQualityDrafts}=await import('../src/services/storage/qualityDraftRepository');const {draftRepairTargets}=await import('../src/services/ai/qualityDraft');
 const f=fixture();f.transport.queueResponse(JSON.stringify(plan));f.transport.queueResponse(response.replace('>保存</button>','><svg class="icon"><path d="M1 1L2 2"/></svg><span></span></button>'));
 const result=await PipelineExecutor.execute(f.options);expect(result.status).toBe('rejected_by_quality');const draft=result.failedDraft!;
 const saved={version:1 as const,id:`draft-${crypto.randomUUID()}`,projectId:`project-${crypto.randomUUID()}`,createdAt:Date.now(),draft,request:f.options.input.rawPrompt,projectContext:'context',status:'blocked' as const,
 decision:{action:'modify_screen' as const,targetScreenId:'page',styleReferenceScreenId:null,elementNid:null,referenceSource:'toggle' as const,reason:'明确整页修改'}};
 await saveQualityDraft(saved);const reopened=(await loadQualityDrafts(saved.projectId))[0];expect(JSON.stringify(reopened)).not.toContain(attachment.dataUrl);
 const repaired=await PipelineExecutor.execute({...f.options,pageTaskPlanning:{snapshot:reopened.draft.pageTaskSource!.pageTaskPlan},qualityRepair:{draft:reopened.draft,labels:draftRepairTargets(reopened.draft).map(t=>({nid:t.nid,text:'保存'}))}});
 expect(repaired.status).toBe('staged_side_by_side');expect(f.requests).toHaveLength(2);expect(repaired.workflowContract?.referenceImage?.inputReceipt?.reusedFromTaskId).toBe(draft.sourceTaskId);expect(repaired.executionRecord?.draftRepair?.historicalPageTaskSource?.pageTaskPlan).toEqual(draft.pageTaskSource?.pageTaskPlan);
 const bad=structuredClone(reopened.draft);delete bad.referenceImage!.inputReceipt;
 expect((await PipelineExecutor.execute({...f.options,pageTaskPlanning:{snapshot:bad.pageTaskSource!.pageTaskPlan},qualityRepair:{draft:bad,labels:[]}})).status).toBe('error');expect(f.requests).toHaveLength(2);
});
test('planned page reference receipt rejects a missing or different current-turn image',async()=>{
 const f=fixture();f.transport.queueResponse(JSON.stringify(plan));f.transport.queueResponse(response);const output=await PipelineExecutor.execute(f.options);const contract=structuredClone(output.workflowContract!);
 expect(recordReferenceInput(contract,[{role:'user',content:contract.request}],'fixture','fixture-vision')).toContain('未进入');
 expect(recordReferenceInput(contract,[{role:'user',content:contract.request,imageUrl:'data:image/png;base64,Yg=='}],'fixture','fixture-vision')).toContain('不匹配');
 expect(contract.target?.baselineFingerprint).toBe(contentFingerprint(original));
});
