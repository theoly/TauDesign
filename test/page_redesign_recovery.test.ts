import {contentFingerprint} from '../src/services/ai/designWorkflow';
import {test,expect} from 'bun:test';
import {prepareTaskRecovery,recoveryData,prepareRecoveryDraft,claimPreparedRecovery} from '../src/services/ai/designTaskRecovery';
import {DesignTaskJournal} from '../src/services/ai/designTaskJournal';
import {LocalStorageStorage} from '../src/services/storage/projectStorage';
import {readDesignTask,removeDesignTask,saveDesignTask} from '../src/services/storage/designTaskRepository';
import {PipelineExecutor,type ExecutePipelineOptions} from '../src/services/ai/engine/pipeline/executor';
import {DefaultAIEngineCore} from '../src/services/ai/engine/core/aiEngineCore';
import {MockTransport} from '../src/services/ai/engine/transport/mockTransport';
import {createChatTaskBudget} from '../src/services/ai/taskBudgetPolicy';
import {defaultPageComposition} from '../src/services/ai/pageComposition';
import {pageCreationContext,type PageCreationState} from '../src/services/ai/pageCreationValidation';
import {neutralModernTheme} from '../src/utils/themePresets';
const provider={id:'redesign-recovery',name:'fixture',protocol:'openai_compatible' as const,baseUrl:'https://example.test/v1',apiKey:'synthetic-only',isEnabled:true};
const plan={goal:'资料管理',actor:'用户',completion:['查看全部业务信息'],questions:[],features:Array.from({length:7},(_,i)=>({id:`f${i+1}`,title:`功能${i+1}`,change:'retain' as const,basis:'user' as const,sourceIds:['user:request'],information:[{label:`完整内容${i+1}`,kind:'display' as const}],interactions:[],states:[]}))};
const control='<button data-nid="save" class="btn btn-primary">保存资料</button>';
const region=(numbers:number[])=>`<artifact><article>${numbers.map(n=>`<p>完整内容${n}</p>`).join('')}${numbers.includes(7)?control:''}</article></artifact>`;
async function fixture(){
 const id='redesign-recovery-'+crypto.randomUUID(),storage=new LocalStorageStorage(id),html='<!doctype html><html lang="zh-CN"><head><meta name="baseline" content="keep"></head><body class="original"><main data-nid="root"><div class="'+'legacy-layout-'.repeat(4000)+'"></div>'+Array.from({length:7},(_,i)=>`<p>完整内容${i+1}</p>`).join('')+control+'</main></body></html>';
 const state:PageCreationState={id,settings:{deviceProfile:'mobile',frameWidth:390,viewportGuideHeight:844,showViewportGuide:true,colorMode:'light',lodBudget:12},projectDocuments:{},screens:{source:{id:'source',name:'资料页',htmlContent:html} as any},assets:{},designSystem:neutralModernTheme,decisions:{},components:{},overrides:{}};
 const journal=new DesignTaskJournal({storage,projectId:id,contextFingerprint:pageCreationContext(state),provider,model:'test',isCurrent:()=>true}),budget=createChatTaskBudget(true),transport=new MockTransport();
 transport.queueResponse(JSON.stringify(plan),0);transport.queueResponse(JSON.stringify(defaultPageComposition(plan)),0);transport.queueResponse(region([1,2,3]),0);transport.enqueueScenario({events:[{type:'Error',kind:'network_error',message:'interrupted'}],delayMs:0});
 const options:Omit<ExecutePipelineOptions,'engineCore'>={input:{rawPrompt:'保留业务信息和保存按钮样式，重新设计整页',activeScreenId:'source',decision:{intent:'modify_screen',targetScreenId:'source',reason:'明确整页'}},screens:state.screens,provider,model:'test',deviceProfile:'mobile',frameWidth:390,baseSystemPrompt:'遵守项目Token。',designSystem:neutralModernTheme,pageTaskPlanning:{},writeStrategy:'auto',wholePageRedesign:true,protectedNids:['save']};
 const output=await PipelineExecutor.execute({...options,engineCore:new DefaultAIEngineCore(transport),taskBudget:budget,onTaskDraft:u=>journal.update(u)});budget.close();expect(output.errorMessage).toContain('interrupted');expect(output.sectionedCheckpoint?.completed).toHaveLength(1);return {id,storage,state,journal,options,html};
}
test('whole-page restore preserves original target and protected content, reuses exact region, and stages a new candidate on a fresh ledger',async()=>{
 const f=await fixture(),handle=await prepareTaskRecovery(f.storage,f.journal.taskId!,f.state,provider,'test'),data=recoveryData(handle);expect(handle.kind).toBe('redesign');expect(handle.reusableRegions).toBe(1);expect(handle.history.map(row=>row.budget?.requests)).toEqual([4]);
 const budget=createChatTaskBudget(true),journal=new DesignTaskJournal({storage:f.storage,projectId:f.id,contextFingerprint:pageCreationContext(f.state),provider,model:'test',originTaskId:handle.originTaskId,recovery:{version:1,kind:'redesign',sourceFingerprint:contentFingerprint(JSON.stringify(data.source)),reusedStepIds:['section-1'],ancestors:data.history},isCurrent:()=>true});
 const transport=new MockTransport();transport.queueResponse(region([4,5]),0);transport.queueResponse(region([6,7]),0);let claimed=false,calls=0;
 try{const result=await PipelineExecutor.execute({...f.options,engineCore:new DefaultAIEngineCore({id:'recovery',stream(request,event){calls++;return transport.stream(request,event);}}),taskBudget:budget,pageTaskPlanning:{snapshot:data.source.contract.pageTaskPlan},recoveryData:{regions:data.regions,strategy:data.strategy},onTaskDraft:async update=>{await journal.update(prepareRecoveryDraft(handle,update));if(!claimed){await claimPreparedRecovery(f.storage,handle,update.contract);claimed=true;}}});
 expect(result.status).toBe('staged_side_by_side');expect(result.errorMessage).toBeUndefined();expect(calls).toBe(2);expect(result.workflowContract?.operation).toBe('modify');expect(result.workflowContract?.target).toEqual(data.source.contract.target);expect(result.workflowContract?.wholePageRedesign).toEqual(data.source.contract.wholePageRedesign);expect(result.workflowContract?.taskId).not.toBe(handle.originTaskId);expect(result.extractedHtml).toContain('name="baseline"');expect(result.extractedHtml).toContain(control);expect(f.state.screens.source.htmlContent).toBe(f.html);expect(budget.snapshot().requests).toBe(2);expect((await readDesignTask(f.storage,f.id,journal.taskId!))?.task.state).toBe('draft');
 }finally{budget.close();}
});
test('second interruption retains independent region, plan and ancestor costs even after old task cleanup',async()=>{
 const f=await fixture(),first=await prepareTaskRecovery(f.storage,f.journal.taskId!,f.state,provider,'test'),data=recoveryData(first),budget=createChatTaskBudget(true),child=new DesignTaskJournal({storage:f.storage,projectId:f.id,contextFingerprint:pageCreationContext(f.state),provider,model:'test',originTaskId:first.originTaskId,recovery:{version:1,kind:'redesign',sourceFingerprint:contentFingerprint(JSON.stringify(data.source)),reusedStepIds:['section-1'],ancestors:data.history},isCurrent:()=>true});
 // The process can stop immediately after durable claim, before any request or later checkpoint.
 const contract=structuredClone(data.source.contract);contract.taskId='design-recovery-child-'+crypto.randomUUID();const update=prepareRecoveryDraft(first,{phase:'started',contract,budget:budget.snapshot()});await child.update(update);await claimPreparedRecovery(f.storage,first,contract);budget.close();
 await removeDesignTask(f.storage,f.id,first.originTaskId);expect(await readDesignTask(f.storage,f.id,first.originTaskId)).toBeUndefined();
 const second=await prepareTaskRecovery(f.storage,child.taskId!,f.state,provider,'test');expect(second.reusableRegions).toBe(1);expect(second.history.map(row=>row.taskId)).toEqual([first.originTaskId,child.taskId!]);expect(second.history.map(row=>row.budget?.requests)).toEqual([4,0]);expect(recoveryData(second).regions?.plan).toEqual(data.regions?.plan);expect(recoveryData(second).regions?.completed).toEqual(data.regions?.completed);
 const copy=recoveryData(second);copy.history[0].budget!.requests=0;second.history[0].budget!.requests=0;expect(recoveryData(second).history[0].budget!.requests).toBe(4);
});
test('restore refuses target/model/protection drift and local-edit elevation before any model call',async()=>{
 const f=await fixture(),id=f.journal.taskId!;
 await expect(prepareTaskRecovery(f.storage,id,{...f.state,screens:{source:{...f.state.screens.source,htmlContent:'<main>其它业务</main>'}}},provider,'test')).rejects.toThrow('已变化');
 await expect(prepareTaskRecovery(f.storage,id,f.state,{...provider,requestOutputCaps:{test:512}},'test')).rejects.toThrow('模型配置');
 const saved=(await readDesignTask(f.storage,f.id,id))!,input={...saved.task};input.contract=structuredClone(input.contract);input.contract.protectedNids=[];await saveDesignTask(f.storage,input,saved.parts);await expect(prepareTaskRecovery(f.storage,id,f.state,provider,'test')).rejects.toThrow(/规划|保护清单/);
 input.contract.wholePageRedesign=undefined;await saveDesignTask(f.storage,input,saved.parts);await expect(prepareTaskRecovery(f.storage,id,f.state,provider,'test')).rejects.toThrow('不能通过单页');
});
test('a source is not claimed until the new task durably contains each complete region',async()=>{
 const f=await fixture(),handle=await prepareTaskRecovery(f.storage,f.journal.taskId!,f.state,provider,'test'),data=recoveryData(handle),budget=createChatTaskBudget(true),journal=new DesignTaskJournal({storage:f.storage,projectId:f.id,contextFingerprint:pageCreationContext(f.state),provider,model:'test',originTaskId:handle.originTaskId,isCurrent:()=>true}),contract=structuredClone(data.source.contract);contract.taskId='design-unprepared-'+crypto.randomUUID();
 try{await journal.update({phase:'started',contract,budget:budget.snapshot()});await expect(claimPreparedRecovery(f.storage,handle,contract)).rejects.toThrow('尚未独立保存');expect(await f.storage.exists(`tasks/${handle.originTaskId}/recovery-claim.json`)).toBe(false);
 const update=prepareRecoveryDraft(handle,{phase:'started',contract,budget:budget.snapshot()});update.completed![0].html='<article>changed</article>';expect(()=>prepareRecoveryDraft(handle,update)).toThrow('只读完成区域');
 }finally{budget.close();}
});
