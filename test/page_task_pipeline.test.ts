import {expect,test} from 'bun:test';
import {PipelineExecutor} from '../src/services/ai/engine/pipeline/executor';
import {DefaultAIEngineCore} from '../src/services/ai/engine/core/aiEngineCore';
import {MockTransport} from '../src/services/ai/engine/transport/mockTransport';
import {defaultProviders} from '../src/stores/useAIConfigStore';
import {techBlueTheme} from '../src/utils/themePresets';
import {resolveWorkflowValidation} from '../src/services/ai/workflowValidation';
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
 expect(requests[0].body.response_format.type).toBe('json_schema');expect(requests[1].body.response_format).toBeUndefined();
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
 const f=fixture();f.transport.queueResponse(JSON.stringify(plan));f.transport.queueResponse('<artifact title="预约"><main class="p-4"><button class="btn btn-primary"><svg class="icon"><path d="M1 1L2 2"/></svg><span></span></button></main></artifact>');
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
