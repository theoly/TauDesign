import {requestSchema} from './helpers/modelSchema';
import {expect,test} from 'bun:test';
import {PipelineExecutor} from '../src/services/ai/engine/pipeline/executor';
import {DefaultAIEngineCore} from '../src/services/ai/engine/core/aiEngineCore';
import {MockTransport} from '../src/services/ai/engine/transport/mockTransport';
import {defaultProviders} from '../src/stores/useAIConfigStore';
import {techBlueTheme} from '../src/utils/themePresets';
import {resolveWorkflowValidation} from '../src/services/ai/workflowValidation';
import {TaskBudget} from '../src/services/ai/taskBudget';
import type {ExecutePipelineOptions} from '../src/services/ai/engine/pipeline/executor';
import {guidancePacketIssue} from '../src/services/ai/designKnowledge/receipt';
const plan={goal:'选择时间并预约',actor:'预约用户',completion:['展示确认结果'],features:[{id:'f1',title:'预约',change:'add',basis:'user',sourceIds:['user:request'],
 information:[{label:'预约时间',kind:'input'}],interactions:[{label:'确认预约',precondition:'已选择时间',outcome:'显示结果',targetScreenId:''}],states:[{name:'待选择',condition:'未选时间',feedback:'请选择时间'}]}],questions:[]};
function fixture(){const transport=new MockTransport();const provider={...defaultProviders[0],protocol:'openai_compatible' as const,baseUrl:'http://mock'};
 const requests:any[]=[];const core=new DefaultAIEngineCore({id:'capture',stream:(request,event)=>{requests.push(request);return transport.stream(request,event);}});
 return {transport,requests,options:{input:{rawPrompt:'新建预约页面，选择预约时间并确认预约',activeScreenId:null},provider,model:'mock',engineCore:core,screens:{},
  deviceProfile:'mobile' as const,frameWidth:390,designSystem:techBlueTheme,baseSystemPrompt:'baseline',pageTaskPlanning:{}}};}
test('functional planning runs before HTML and the same frozen snapshot is bound to the contract and final messages',async()=>{
 const {transport,requests,options}=fixture();transport.queueResponse(JSON.stringify(plan));transport.queueResponse('<artifact type="screen" title="预约"><main class="p-4"><label>预约时间<input/></label><button class="btn btn-primary">确认预约</button></main></artifact>');
 const result=await PipelineExecutor.execute(options);
 expect(result.status).not.toBe('error');expect(requests).toHaveLength(2);
 expect(requestSchema(requests[0]).properties.features).toBeDefined();expect(requests[1].body.response_format).toBeUndefined();
 expect(requests[1].body.messages[0].content).toContain('PAGE TASK PLAN');expect(requests[1].body.messages[0].content).toContain('已选择时间');
 expect(result.workflowContract?.pageTaskPlan?.plan.goal).toBe(plan.goal);expect(result.taskBudget?.requests).toBe(2);
 expect(resolveWorkflowValidation(result.workflowContract,'create').ok).toBe(true);
 const corrupt=structuredClone(result.workflowContract!);corrupt.pageTaskPlan!.plan.features[0].sourceIds=['missing'];
 expect(resolveWorkflowValidation(corrupt,'create').ok).toBe(false);
});
test('planning questions stop before generating a page and remain inspectable',async()=>{
 const {transport,requests,options}=fixture();transport.queueResponse(JSON.stringify({...plan,questions:['预约是否需要审核？']}));
 const result=await PipelineExecutor.execute(options);
 expect(result.status).toBe('error');expect(result.errorMessage).toContain('预约是否需要审核');expect(requests).toHaveLength(1);
 expect(result.workflowContract?.pageTaskPlan?.plan.questions).toHaveLength(1);
 expect(resolveWorkflowValidation(result.workflowContract,'create').ok).toBe(false);
});
test('saved plan replays without an extra planning request, and changed request refuses replay',async()=>{
 const first=fixture();first.transport.queueResponse(JSON.stringify(plan));first.transport.queueResponse('<artifact><main>预约</main></artifact>');
 const output=await PipelineExecutor.execute(first.options),snapshot=output.workflowContract?.pageTaskPlan;
 expect(snapshot).toBeDefined();
 const second=fixture();second.transport.queueResponse('<artifact><main>预约</main></artifact>');
 const replay=await PipelineExecutor.execute({...second.options,pageTaskPlanning:{snapshot}});
 expect(replay.status).not.toBe('error');expect(second.requests).toHaveLength(1);
 const changed=fixture();const denied=await PipelineExecutor.execute({...changed.options,input:{...changed.options.input,rawPrompt:'新建充值页面'},pageTaskPlanning:{snapshot}});
 expect(denied.status).toBe('error');expect(changed.requests).toHaveLength(0);
});

test('frozen planning cannot be replayed under another model or a stale execution',async()=>{
 const first=fixture();first.transport.queueResponse(JSON.stringify(plan));first.transport.queueResponse('<artifact><main>预约</main></artifact>');
 const original=await PipelineExecutor.execute(first.options),snapshot=original.workflowContract?.pageTaskPlan;
 const changed=fixture();const denied=await PipelineExecutor.execute({...changed.options,model:'different',pageTaskPlanning:{snapshot}});
 expect(denied.status).toBe('error');expect(denied.errorMessage).toContain('模型已变化');expect(changed.requests).toHaveLength(0);
 const stale=fixture();const stopped=await PipelineExecutor.execute({...stale.options,pageTaskPlanning:{snapshot},isCurrent:()=>false});
 expect(stopped.status).toBe('error');expect(stale.requests).toHaveLength(0);
});

test('rejected draft saves original plan and repairs it without replanning or losing provenance',async()=>{
 const {saveQualityDraft,loadQualityDrafts}=await import('../src/services/storage/qualityDraftRepository');
 const {draftRepairTargets}=await import('../src/services/ai/qualityDraft');
 const f=fixture();f.transport.queueResponse(JSON.stringify(plan));f.transport.queueResponse('<artifact title="预约"><main class="p-4"><button class="btn btn-primary"><img class="icon" src="https://example.com/fixture-icon.svg" alt=""/><span></span></button></main></artifact>');
 const original=await PipelineExecutor.execute(f.options);expect(original.status).toBe('rejected_by_quality');
 const draft=original.failedDraft!;expect(draft.pageTaskSource?.pageTaskPlan).toEqual(original.workflowContract?.pageTaskPlan);
 const saved={version:1 as const,id:`draft-${crypto.randomUUID()}`,projectId:`project-${crypto.randomUUID()}`,createdAt:Date.now(),draft,request:f.options.input.rawPrompt,projectContext:'context',status:'blocked' as const,
  decision:{action:'create_screen' as const,targetScreenId:null,styleReferenceScreenId:null,elementNid:null,referenceSource:null,reason:'明确新建'}};
 await saveQualityDraft(saved);const reopened=(await loadQualityDrafts(saved.projectId))[0];expect(reopened.draft.pageTaskSource).toEqual(draft.pageTaskSource);
 const labels=draftRepairTargets(reopened.draft).map(t=>({nid:t.nid,text:'确认预约'}));
 const repaired=await PipelineExecutor.execute({...f.options,pageTaskPlanning:{snapshot:reopened.draft.pageTaskSource!.pageTaskPlan},qualityRepair:{draft:reopened.draft,labels}});
 expect(repaired.status).toBe('applied');expect(f.requests).toHaveLength(2);expect(repaired.usage).toEqual({inputTokens:0,outputTokens:0});
 expect(repaired.executionRecord?.draftRepair?.historicalPageTaskSource).toEqual(draft.pageTaskSource);
 const bad=structuredClone(saved);bad.draft.pageTaskSource!.pageTaskPlan!.plan.goal='另一个目标';await expect(saveQualityDraft(bad)).rejects.toThrow('草稿无效');
 const wrongRequest=structuredClone(saved);wrongRequest.request='新的需求';await expect(saveQualityDraft(wrongRequest)).rejects.toThrow('草稿无效');
});

test('uploaded requirements reach the planner as attributed data and invalidate replay when changed',async()=>{
 const f=fixture();f.transport.queueResponse(JSON.stringify({...plan,features:plan.features.map(feature=>({...feature,basis:'document',sourceIds:['预约规则.md']}))}));f.transport.queueResponse('<artifact><main>预约</main></artifact>');
 const textReferences=[{name:'预约规则.md',source:'upload' as const,content:'只展示可预约时间，确认后展示预约结果。'}];
 const result=await PipelineExecutor.execute({...f.options,input:{...f.options.input,textReferences}});
 expect(result.status).not.toBe('error');expect(f.requests[0].body.messages.at(-1).content).toContain(textReferences[0].content);
 expect(result.workflowContract?.pageTaskPlan?.plan.features[0].basis).toBe('document');
 const stale=fixture();const denied=await PipelineExecutor.execute({...stale.options,input:{...stale.options.input,textReferences:[{...textReferences[0],content:'需要管理员审批'}]},pageTaskPlanning:{snapshot:result.workflowContract!.pageTaskPlan}});
 expect(denied.status).toBe('error');expect(stale.requests).toHaveLength(0);
});

// Exercise the actual composed protocols, rather than validating isolated wrappers.
function childFixture(device:'mobile'|'pc',sections:boolean){
 const transport=new MockTransport(),requests:any[]=[];
 const limit=sections?19456:27648;
 const budget=new TaskBudget({maxRequests:sections?5:4,maxRequestedOutputTokens:limit,maxDurationMs:900000,maxRequestDurationMs:900000});
 const shell=`<main class="${device==='pc'?'container-max':'p-4'}"><section data-design-slot="section-1"></section><section data-design-slot="section-2"></section></main>`;
 const sectionPlan={title:'预约',shellHtml:shell,sections:[{id:'section-1',name:'选择预约时间',requirements:'展示预约时间输入'},{id:'section-2',name:'确认预约',requirements:'确认预约操作和请选择时间提示'}]};
 const core=new DefaultAIEngineCore({id:'functional-child-capture',stream:(request,event)=>{
  requests.push(request);const n=requests.length,marker=request.body.messages.at(-1).content.match(/TAUDESIGN_CONTINUE_[\w-]+/)?.[0];
  let text:string;
  if(n===1)text=JSON.stringify(plan);
  else if(sections)text=n===2?JSON.stringify(sectionPlan):n===3?'<artifact><label>预约时间<input/></label></artifact>':n===4?
   '<artifact><style>.forbidden{}</style><p>拒绝的区块</p></artifact>':'<artifact><button class="btn btn-primary">确认预约</button><p>请选择时间</p></artifact>';
  else text=n===2?`<artifact title="预约"><main class="${device==='pc'?'container-max':'p-4'}"><h1>预约时间</h1>`:
   n===3?'<label>预约时间<input/></label>':'<button class="btn btn-primary">确认预约</button><p>请选择时间</p></main></artifact>';
  transport.enqueueScenario({events:[{type:'Delta',text:(marker?marker+'\n':'')+text},{type:'Done',finish_reason:!sections&&n>1&&n<4?'length':'stop'}]});
  return transport.stream(request,event);
 }});
 const options:ExecutePipelineOptions={input:{rawPrompt:'新建预约页面，选择预约时间并确认预约',activeScreenId:null},
  provider:{...defaultProviders[0],id:'child-fixture',protocol:'openai_compatible',baseUrl:'http://mock',apiKey:'CHILD_SYNTHETIC_SECRET'},model:'mock',engineCore:core,
  screens:{},deviceProfile:device,frameWidth:device==='pc'?1440:390,designSystem:techBlueTheme,baseSystemPrompt:'baseline',pageTaskPlanning:{},
  contextualGuidance:{features:['long-copy']},taskBudget:budget,...(sections?{sectioned:{}}:{})};
 return {requests,budget,options,limit};
}
function assertFunctionalInputs(requests:any[],ruleBody:string){
 expect(requestSchema(requests[0]).properties.features).toBeDefined();
 expect(requests[0].body.messages[0].content).not.toContain('[LY-04@1]'); // factual planner is not a visual generation call
 for(const request of requests.slice(1)){
  const system=request.body.messages[0].content;
  expect(system).toContain('PAGE TASK PLAN');expect(system).toContain('预约时间');expect(system).toContain('确认预约');expect(system).toContain('已选择时间');
  expect(system).toContain(ruleBody);expect(system).toContain('[LY-04@1]');
 }
}
for(const device of ['mobile','pc'] as const){
 test(`${device} functional planning and automatic continuation retain one content contract and exact parent allowance`,async()=>{
  const f=childFixture(device,false);try{
   const result=await PipelineExecutor.execute(f.options),contract=result.workflowContract!;
   expect(result.status).toBe('applied');expect(f.requests).toHaveLength(4);expect(result.executionRecord?.continuationCount).toBe(2);
   expect(contract.pageTaskPlan?.plan).toEqual(plan);expect(contract.designGuidance?.requests).toHaveLength(3);
   assertFunctionalInputs(f.requests,contract.designGuidance!.selection.body);
   expect(f.requests.reduce((n,r)=>n+r.body.max_tokens,0)).toBe(f.limit);
   expect(f.budget.snapshot()).toMatchObject({requests:4,requestedOutputTokens:f.limit,reservedOutputTokens:0,exhausted:true,closed:false});
   expect(guidancePacketIssue(contract)).toBeUndefined();expect(resolveWorkflowValidation(contract,'create').ok).toBe(true);
   expect(result.extractedHtml).toContain('确认预约');expect(JSON.stringify(contract)).not.toContain('CHILD_SYNTHETIC_SECRET');
  }finally{f.budget.close();}
 });
 test(`${device} functional sections resume the original plan and rules without resetting their parent`,async()=>{
  const f=childFixture(device,true);try{
   const first=await PipelineExecutor.execute(f.options),original=structuredClone(first.workflowContract!);
   expect(first.status).toBe('error');expect(first.sectionedCheckpoint?.completed).toHaveLength(1);expect(f.requests).toHaveLength(4);
   const result=await PipelineExecutor.execute({...f.options,pageTaskPlanning:{snapshot:original.pageTaskPlan},resumeContract:first.workflowContract,
    sectioned:{resume:first.sectionedCheckpoint},contextualGuidance:{features:['badge']}});
   expect(result.status).toBe('applied');expect(f.requests).toHaveLength(5);expect(result.workflowContract!.taskId).toBe(original.taskId);
   expect(result.workflowContract!.pageTaskPlan).toEqual(original.pageTaskPlan);expect(result.workflowContract!.designGuidance!.selection).toEqual(original.designGuidance!.selection);
   expect(first.workflowContract).toEqual(original);expect(result.workflowContract!.designGuidance!.requests.map(r=>r.requestId)).toEqual([1,2,3,4].map(n=>`${original.taskId}:request-${n}`));
   assertFunctionalInputs(f.requests,original.designGuidance!.selection.body);
   expect(f.requests[4].body.response_format).toBeUndefined();expect(f.requests[4].body.messages.at(-1).content).toContain('section-2');
   expect(f.requests.reduce((n,r)=>n+r.body.max_tokens,0)).toBe(f.limit);
   expect(result.taskBudget).toMatchObject({requests:5,requestedOutputTokens:f.limit,exhausted:true,closed:false});
   expect(result.extractedHtml).toContain('预约时间');expect(result.extractedHtml).toContain('确认预约');expect(result.extractedHtml).not.toContain('拒绝的区块');
   expect(guidancePacketIssue(result.workflowContract!)).toBeUndefined();expect(resolveWorkflowValidation(result.workflowContract,'create').ok).toBe(true);
  }finally{f.budget.close();}
 });
 test(`${device} changed or missing functional snapshot cannot spend quota or consume a valid section checkpoint`,async()=>{
  const f=childFixture(device,true);try{
   const first=await PipelineExecutor.execute(f.options),before=f.budget.snapshot();
   const base={...f.options,resumeContract:first.workflowContract,sectioned:{resume:first.sectionedCheckpoint}};
   const changed=structuredClone(first.workflowContract!.pageTaskPlan!);changed.plan.goal='新增支付';
   const replacement=new TaskBudget(before.limits);try{
    for(const alteration of [{pageTaskPlanning:{}},{pageTaskPlanning:{snapshot:changed}},{pageTaskPlanning:{snapshot:first.workflowContract!.pageTaskPlan},taskBudget:replacement}]){
     const denied=await PipelineExecutor.execute({...base,...alteration});expect(denied.status).toBe('error');
     expect(f.requests).toHaveLength(4);expect(f.budget.snapshot()).toEqual(before);expect(replacement.snapshot().requests).toBe(0);
    }
   }finally{replacement.close();}
   const final=await PipelineExecutor.execute({...base,pageTaskPlanning:{snapshot:first.workflowContract!.pageTaskPlan}});
   expect(final.status).toBe('applied');expect(f.requests).toHaveLength(5);expect(final.workflowContract!.pageTaskPlan).toEqual(first.workflowContract!.pageTaskPlan);
  }finally{f.budget.close();}
 });
}
