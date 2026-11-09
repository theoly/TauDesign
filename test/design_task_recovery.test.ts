import {contentFingerprint} from '../src/services/ai/designWorkflow';
import {test,expect} from 'bun:test';
import {prepareTaskRecovery,recoveryData,prepareRecoveryDraft,claimPreparedRecovery} from '../src/services/ai/designTaskRecovery';
import {DesignTaskJournal} from '../src/services/ai/designTaskJournal';
import {LocalStorageStorage} from '../src/services/storage/projectStorage';
import {readDesignTask} from '../src/services/storage/designTaskRepository';
import {PipelineExecutor} from '../src/services/ai/engine/pipeline/executor';
import {DefaultAIEngineCore} from '../src/services/ai/engine/core/aiEngineCore';
import {MockTransport} from '../src/services/ai/engine/transport/mockTransport';
import {TaskBudget} from '../src/services/ai/taskBudget';
import {defaultPageComposition} from '../src/services/ai/pageComposition';
import {pageCreationContext,type PageCreationState} from '../src/services/ai/pageCreationValidation';
import {techBlueTheme} from '../src/utils/themePresets';

const provider={id:'recover',name:'fixture',protocol:'openai_compatible' as const,baseUrl:'https://example.test/v1',apiKey:'SYNTHETIC_RECOVERY_KEY',isEnabled:true};
const plan={goal:'工作台',actor:'用户',completion:['查看全部信息'],questions:[],features:Array.from({length:7},(_,i)=>({id:`f${i+1}`,title:`功能${i+1}`,change:'add' as const,basis:'user' as const,sourceIds:['user:request'],information:[{label:`完整内容${i+1}`,kind:'display' as const}],interactions:[],states:[]}))};
const ledger=()=>new TaskBudget({maxRequests:14,maxRequestedOutputTokens:34568,maxDurationMs:10000,maxRequestDurationMs:10000});
const region=(numbers:number[])=>`<artifact><article>${numbers.map(n=>`<p>完整内容${n}</p>`).join('')}</article></artifact>`;
async function fixture(){
 const id='recovery-'+crypto.randomUUID(),storage=new LocalStorageStorage(id),state:PageCreationState={id,settings:{deviceProfile:'mobile',frameWidth:390,viewportGuideHeight:844,showViewportGuide:true,colorMode:'light',lodBudget:12},projectDocuments:{},screens:{},assets:{},designSystem:techBlueTheme,decisions:{},components:{},overrides:{}};
 const context=pageCreationContext(state),journal=new DesignTaskJournal({storage,projectId:id,contextFingerprint:context,provider,model:'test',isCurrent:()=>true}),budget=ledger(),transport=new MockTransport();
 transport.queueResponse(JSON.stringify(plan),0);transport.queueResponse(JSON.stringify(defaultPageComposition(plan)),0);transport.queueResponse(region([1,2,3]),0);transport.enqueueScenario({events:[{type:'Error',kind:'network_error',message:'interrupted'}],delayMs:0});
 const options={input:{rawPrompt:'新建七项功能的工作台',activeScreenId:null},screens:{},provider,model:'test',deviceProfile:'mobile' as const,frameWidth:390,baseSystemPrompt:'遵守项目Token。',designSystem:techBlueTheme,pageTaskPlanning:{},writeStrategy:'auto' as const};
 const output=await PipelineExecutor.execute({...options,engineCore:new DefaultAIEngineCore(transport),taskBudget:budget,onTaskDraft:u=>journal.update(u)});budget.close();expect(output.errorMessage).toContain('interrupted');return {id,storage,state,journal,options,budget};
}
test('restart creates a new task and ledger, reuses only verified complete regions, and old owner cannot publish afterwards',async()=>{
 const f=await fixture(),handle=await prepareTaskRecovery(f.storage,f.journal.taskId!,f.state,provider,'test'),data=recoveryData(handle);expect(handle.reusableRegions).toBe(1);
 const oldId=handle.originTaskId,source=(await readDesignTask(f.storage,f.id,oldId))!,newBudget=ledger(),journal=new DesignTaskJournal({storage:f.storage,projectId:f.id,contextFingerprint:pageCreationContext(f.state),provider,model:'test',originTaskId:oldId,recovery:{version:1,kind:data.kind,sourceFingerprint:contentFingerprint(JSON.stringify(data.source)),reusedStepIds:data.regions?.completed.map(part=>part.id)??[],ancestors:data.history},isCurrent:()=>true});
 const descriptor=Object.getOwnPropertyDescriptor(navigator,'locks');let queue=Promise.resolve();Object.defineProperty(navigator,'locks',{configurable:true,value:{request(_name:string,work:()=>Promise<unknown>){const next=queue.then(work);queue=next.then(()=>{},()=>{});return next;}}});
 const transport=new MockTransport();transport.queueResponse(region([4,5]),0);transport.queueResponse(region([6,7]),0);let calls=0,claimed=false;
 try{
  const output=await PipelineExecutor.execute({...f.options,engineCore:new DefaultAIEngineCore({id:'count',stream(request,event){calls++;return transport.stream(request,event);}}),taskBudget:newBudget,pageTaskPlanning:{snapshot:data.source.contract.pageTaskPlan},recoveryData:{regions:data.regions,strategy:data.strategy},onTaskDraft:async update=>{await journal.update(prepareRecoveryDraft(handle,update));if(!claimed){await claimPreparedRecovery(f.storage,handle,update.contract);claimed=true;}}});
  expect(output.status).toBe('applied');expect(calls).toBe(2);expect(newBudget.snapshot().requests).toBe(2);expect(newBudget.hasTask(oldId)).toBe(false);expect(newBudget.hasTask(output.workflowContract!.taskId)).toBe(true);expect(output.workflowContract?.taskId).not.toBe(oldId);
  const child=await readDesignTask(f.storage,f.id,journal.taskId!);expect(child?.task.originTaskId).toBe(oldId);expect(child?.parts.find(p=>p.stepId==='section-1')?.html).toBe(source.parts.find(p=>p.stepId==='section-1')?.html);expect((await readDesignTask(f.storage,f.id,oldId))?.task.budget?.requests).toBe(4);
  await expect(f.journal.update({phase:'result',contract:source.task.contract,budget:f.budget.snapshot(),result:{html:'<main>late result</main>'}})).rejects.toThrow('接替');expect((await readDesignTask(f.storage,f.id,oldId))?.parts.some(p=>p.html.includes('late result'))).toBe(false);
  expect(await f.storage.readText(`tasks/${oldId}/attempts.jsonl`)).toContain('superseded-settlement');
 }finally{newBudget.close();if(descriptor)Object.defineProperty(navigator,'locks',descriptor);else delete (navigator as any).locks;}
});
test('source, model configuration, or physical artifact drift refuses recovery without contacting a model',async()=>{
 const f=await fixture(),id=f.journal.taskId!;
 await expect(prepareTaskRecovery(f.storage,id,{...f.state,overrides:{'p:x':{nid:'x',declarations:{color:'red'}}}},provider,'test')).rejects.toThrow('已变化');
 await expect(prepareTaskRecovery(f.storage,id,f.state,{...provider,requestOutputCaps:{test:1024}},'test')).rejects.toThrow('模型配置');
 const saved=(await readDesignTask(f.storage,f.id,id))!;await f.storage.writeTextAtomic(saved.task.artifacts.find(a=>a.stepId==='section-1')!.path,'<main>tampered</main>');await expect(prepareTaskRecovery(f.storage,id,f.state,provider,'test')).rejects.toThrow('文件校验失败');
});
