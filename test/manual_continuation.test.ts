import {expect,test} from 'bun:test';
import {PipelineExecutor,type ExecutePipelineOptions} from '../src/services/ai/engine/pipeline/executor';
import {DefaultAIEngineCore} from '../src/services/ai/engine/core/aiEngineCore';
import {MockTransport} from '../src/services/ai/engine/transport/mockTransport';
import {TaskBudget} from '../src/services/ai/taskBudget';
import {techBlueTheme} from '../src/utils/themePresets';
import {guidancePacketIssue} from '../src/services/ai/designKnowledge/receipt';
import {continuationContextKey} from '../src/services/ai/generationContinuation';
const provider={id:'manual-fixture',name:'本地夹具',protocol:'openai_compatible' as const,baseUrl:'http://mock',apiKey:'MANUAL_SYNTHETIC_SECRET',isEnabled:true};
function fixture(device:'pc'|'mobile'='pc',guided=true){
 let time=0;const requests:any[]=[],transport=new MockTransport();
 const budget=new TaskBudget({maxRequests:4,maxRequestedOutputTokens:32768,maxDurationMs:900000,maxRequestDurationMs:900000},()=>time);
 const core=new DefaultAIEngineCore({id:'local',stream:(request,event)=>{
  requests.push(request.body);const marker=request.body!.messages.at(-1).content.match(/TAUDESIGN_CONTINUE_[\w-]+/)?.[0];
  const text=requests.length===1?`<artifact title="正文"><main class="${device==='pc'?'container-max':'p-4'}"><h1>正文</h1>`:requests.length<4?'<p>长正文的完整内容</p>':'<button class="btn btn-primary">查看详情</button></main></artifact>';
  transport.enqueueScenario({events:[{type:'Delta',text:(marker?marker+'\n':'')+text},{type:'Done',finish_reason:requests.length<4?'length':'stop'}]});return transport.stream(request,event);
 }});
 const options:ExecutePipelineOptions={input:{rawPrompt:'新建长正文页面',activeScreenId:null},provider,model:'fixture',engineCore:core,taskBudget:budget,screens:{},deviceProfile:device,frameWidth:device==='pc'?1440:390,baseSystemPrompt:'baseline',designSystem:techBlueTheme,...(guided?{contextualGuidance:{features:['long-copy']}}:{})};
 return {options,budget,requests,expire:()=>{time=900001;}};
}
for(const device of ['pc','mobile'] as const)test(`${device} manual continuation freezes task/rules and appends receipts using the same exact allowance`,async()=>{
 const f=fixture(device);try{
  const first=await PipelineExecutor.execute(f.options),original=structuredClone(first.workflowContract!);expect(first.continuationCheckpoint).toBeDefined();expect(f.budget.snapshot()).toMatchObject({requests:3,requestedOutputTokens:24576,closed:false});
  const next=await PipelineExecutor.execute({...f.options,resume:first.continuationCheckpoint,resumeContract:first.workflowContract,contextualGuidance:{features:['badge']},conversationHistory:[{role:'assistant',content:'达到上限，请继续'}]});
  expect(next.status).toBe('applied');expect(f.requests).toHaveLength(4);expect(next.taskBudget).toMatchObject({requests:4,requestedOutputTokens:32768,closed:false});
  expect(next.workflowContract!.taskId).toBe(original.taskId);expect(next.workflowContract!.designGuidance!.selection).toEqual(original.designGuidance!.selection);
  expect(next.workflowContract!.designGuidance!.requests).toHaveLength(4);expect(next.workflowContract!.designGuidance!.requests.every(r=>r.parentTaskId===original.taskId&&r.status==='completed')).toBe(true);
  expect(f.requests[3].messages[0].content).toBe(f.requests[0].messages[0].content);expect(f.requests[3].messages.at(-2).content).toBe(first.continuationCheckpoint!.prefix);
  expect(guidancePacketIssue(next.workflowContract!)).toBeUndefined();expect(first.workflowContract).toEqual(original);expect(JSON.stringify(next.workflowContract)).not.toContain(provider.apiKey);
 }finally{f.budget.close();}
});
test('changed authorization, theme, input or checkpoint fails before another actual request or budget reservation',async()=>{
 const f=fixture();try{
  const first=await PipelineExecutor.execute(f.options),before=f.budget.snapshot();
  for(const changed of [
   {input:{...f.options.input,rawPrompt:'新建另一页'}},
   {frameWidth:1500},
   {knowledgeFingerprint:'changed'},
   {protectedNids:['new-protection']},
   {designSystem:{...techBlueTheme,name:'changed theme'}},
   {resumeContract:{...first.workflowContract!,allowedChanges:['screen:other']}},
   {resume:{...first.continuationCheckpoint!,prefix:'tampered prefix'}},
   {model:'different-model'}
  ]){
   const next=await PipelineExecutor.execute({...f.options,resume:first.continuationCheckpoint,resumeContract:first.workflowContract,...changed});expect(next.status).toBe('error');expect(f.requests).toHaveLength(3);expect(f.budget.snapshot()).toEqual(before);
  }
 }finally{f.budget.close();}
});
test('a missing parent/contract, closed or expired parent cannot restart an old checkpoint with fresh quota',async()=>{
 const f=fixture();const first=await PipelineExecutor.execute(f.options);
 for(const change of [{taskBudget:undefined},{resumeContract:undefined}]){
  const next=await PipelineExecutor.execute({...f.options,resume:first.continuationCheckpoint,resumeContract:first.workflowContract,...change});expect(next.errorMessage).toContain('缺少原任务');expect(f.requests).toHaveLength(3);
 }
 const replacement=new TaskBudget(f.budget.snapshot().limits);
 const reset=await PipelineExecutor.execute({...f.options,taskBudget:replacement,resume:first.continuationCheckpoint,resumeContract:first.workflowContract});expect(reset.errorMessage).toContain('不是原任务父预算');expect(replacement.snapshot().requests).toBe(0);replacement.close();
 f.expire();const expired=await PipelineExecutor.execute({...f.options,resume:first.continuationCheckpoint,resumeContract:first.workflowContract});expect(expired.errorMessage).toContain('超过时限');expect(f.requests).toHaveLength(3);f.budget.close();
 expect((await PipelineExecutor.execute({...f.options,resume:first.continuationCheckpoint,resumeContract:first.workflowContract})).status).toBe('error');expect(f.requests).toHaveLength(3);
});
test('resuming a legacy task does not add new rules even when current caller opts in',async()=>{
 const f=fixture('pc',false);try{
  const first=await PipelineExecutor.execute(f.options);expect(first.workflowContract?.designGuidance).toBeUndefined();
  const next=await PipelineExecutor.execute({...f.options,contextualGuidance:{features:['long-copy']},resume:first.continuationCheckpoint,resumeContract:first.workflowContract});
  expect(next.status).toBe('applied');expect(next.workflowContract?.taskId).toBe(first.workflowContract?.taskId);expect(next.workflowContract?.designGuidance).toBeUndefined();expect(f.requests[3].messages[0].content).not.toContain('[LY-04@1]');
 }finally{f.budget.close();}
});
for(const guided of [true,false])test(`section continuation keeps completed parts, budget and frozen guidance eligibility (${guided}) without repeating the plan`,async()=>{
 const f=fixture('pc',guided),transport=new MockTransport(),requests:any[]=[];
 const core=new DefaultAIEngineCore({id:'section-local',stream:(r,event)=>{
  requests.push(r.body);const n=requests.length;
  transport.queueResponse(n===1?JSON.stringify({title:'正文',shellHtml:'<main class="container-max p-4"><section data-design-slot="section-1"></section><section data-design-slot="section-2"></section></main>',sections:[{id:'section-1',name:'说明',requirements:'保留第一块正文'},{id:'section-2',name:'操作',requirements:'保留操作'}]}):n===3?'<artifact><style>.unsafe{}</style><p>拒绝本区块</p></artifact>':n===2?'<artifact><p>第一块正文</p></artifact>':'<artifact><button class="btn btn-primary">查看详情</button></artifact>');
  return transport.stream(r,event);
 }});
 try{
  const options={...f.options,engineCore:core,sectioned:{}};
  const first=await PipelineExecutor.execute(options);expect(first.sectionedCheckpoint?.completed).toHaveLength(1);expect(requests).toHaveLength(3);
  const next=await PipelineExecutor.execute({...options,sectioned:{resume:first.sectionedCheckpoint},resumeContract:first.workflowContract,contextualGuidance:{features:['badge']}});
  expect(next.status).toBe('applied');expect(requests).toHaveLength(4);expect(requests[3].response_format).toBeUndefined();expect(requests[3].messages.at(-1).content).toContain('section-2');
  expect(next.extractedHtml).toContain('第一块正文');expect(next.extractedHtml).not.toContain('拒绝本区块');expect(next.taskBudget).toMatchObject({requests:4,requestedOutputTokens:16384});
  expect(next.workflowContract!.taskId).toBe(first.workflowContract!.taskId);
  if(guided)expect(next.workflowContract!.designGuidance!.requests).toHaveLength(4);else expect(next.workflowContract!.designGuidance).toBeUndefined();
  expect(requests[3].messages[0].content.includes('[LY-04@1]')).toBe(guided);expect(guidancePacketIssue(next.workflowContract!)).toBeUndefined();
 }finally{f.budget.close();}
});
test('canReserve is a read-only probe that respects prior charges, cancellation and the original total clock',()=>{
 let now=0;const b=new TaskBudget({maxRequests:2,maxRequestedOutputTokens:10,maxDurationMs:100,maxRequestDurationMs:100},()=>now),before=b.snapshot();
 expect(b.canReserve(10)).toBe(true);expect(b.canReserve(11)).toBe(false);expect(b.canReserve(0)).toBe(false);expect(b.snapshot()).toEqual(before);
 b.reserve(6).settle({inputTokens:0,outputTokens:1});expect(b.canReserve(5)).toBe(false);expect(b.canReserve(4)).toBe(true);now=101;expect(b.canReserve(4)).toBe(false);expect(b.snapshot().requests).toBe(1);
 b.cancel();expect(b.canReserve(1)).toBe(false);b.close();expect(b.snapshot()).toMatchObject({requests:1,requestedOutputTokens:6,cancelled:true,closed:true});
});
test('self-recomputed checkpoint hashes and edited rule metadata cannot replace the parent-held exact proof',async()=>{
 const f=fixture();try{
  const first=await PipelineExecutor.execute(f.options),checkpoint=structuredClone(first.continuationCheckpoint!);
  checkpoint.messages[0].content+=' altered system input';checkpoint.messagesFingerprint=continuationContextKey(checkpoint.messages);
  const forged=await PipelineExecutor.execute({...f.options,resume:checkpoint,resumeContract:first.workflowContract});expect(forged.status).toBe('error');expect(forged.errorMessage).toContain('检查点或任务已变化');
  const contract=structuredClone(first.workflowContract!);contract.designGuidance!.selection.queryFingerprint='aaaaaaaa';
  expect((await PipelineExecutor.execute({...f.options,resume:first.continuationCheckpoint,resumeContract:contract})).status).toBe('error');expect(f.requests).toHaveLength(3);
 }finally{f.budget.close();}
});
test('simultaneous replay consumes a checkpoint only once without dispatching a second recovery',async()=>{
 const f=fixture();try{
  const first=await PipelineExecutor.execute(f.options),options={...f.options,resume:first.continuationCheckpoint,resumeContract:first.workflowContract};
  const results=await Promise.all([PipelineExecutor.execute(options),PipelineExecutor.execute(options)]);
  expect(results.filter(r=>r.status==='applied')).toHaveLength(1);expect(results.filter(r=>r.status==='error')).toHaveLength(1);expect(f.requests).toHaveLength(4);expect(f.budget.snapshot().requests).toBe(4);
 }finally{f.budget.close();}
});
test('cancelling the paused parent cannot be bypassed with the retained task and checkpoint',async()=>{
 const f=fixture();try{
  const first=await PipelineExecutor.execute(f.options);f.budget.cancel('用户停止原任务');
  const result=await PipelineExecutor.execute({...f.options,resume:first.continuationCheckpoint,resumeContract:first.workflowContract});expect(result.status).toBe('error');expect(f.requests).toHaveLength(3);expect(f.budget.snapshot().cancelled).toBe(true);
 }finally{f.budget.close();}
});
