import {test,expect} from 'bun:test';
import {preparePageTaskPlan,pageTaskPlanIssue,PageTaskPlanFormatError,validatePageTaskPlan} from '../src/services/ai/pageTaskPlan';
import {buildDesignTaskContract} from '../src/services/ai/designWorkflow';
import {DefaultAIEngineCore} from '../src/services/ai/engine/core/aiEngineCore';
import {MockTransport} from '../src/services/ai/engine/transport/mockTransport';
import {TaskBudget} from '../src/services/ai/taskBudget';
const provider={id:'format-only',name:'Synthetic',protocol:'openai_compatible' as const,baseUrl:'https://invalid.test',apiKey:'not-for-archive',isEnabled:true};
const raw=()=>({goal:'展示注册表单',actor:'示例会员',completion:['查看字段和操作'],features:[{id:'f1',title:'注册表单',change:'add',basis:'user',sourceIds:['user:request'],information:[{label:'手机号码',kind:'input'}],interactions:[{label:'注册并继续',precondition:'查看表单',outcome:'静态展示操作意图，不真实提交',targetScreenId:''}],states:[]}],questions:[]});
const contract=()=>buildDesignTaskContract({intent:'create_screen',request:'设计静态会员注册页，示例内容，无需真实提交',deviceProfile:'mobile',frameWidth:390});
async function execute(values:unknown[],limits={maxRequests:4,maxRequestedOutputTokens:34568},current=()=>true){
 const transport=new MockTransport(),calls:any[]=[],core=new DefaultAIEngineCore({id:'capture',stream(request,event){calls.push(request);return transport.stream(request,event);}});
 for(const value of values)transport.queueResponse(typeof value==='string'?value:JSON.stringify(value),1);
 const budget=new TaskBudget({...limits,maxDurationMs:10000,maxRequestDurationMs:10000});
 try{return {snapshot:await preparePageTaskPlan(core,{contract:contract(),provider,model:'synthetic',budget,isCurrent:current}),calls,budget:budget.snapshot()};}
 catch(error){return {error,calls,budget:budget.snapshot()};}finally{budget.close();}
}
test('missing questions is diagnosed and corrected once with the same finite parent ledger',async()=>{
 const bad:any=raw();delete bad.questions;const result=await execute([bad,raw()]);
 expect(result.error).toBeUndefined();expect(result.calls).toHaveLength(2);expect(result.budget.requests).toBe(2);expect(result.budget.requestedOutputTokens).toBe(6144);
 expect(result.snapshot?.request.formatRepair).toMatchObject({attempts:2});expect(result.snapshot?.request.formatRepair?.firstIssue).toContain('questions');
 expect(result.calls[1].messages.at(-1).content).toContain('不得通过清空questions或删除功能');expect(result.calls[1].generationOptions.maxTokens).toBe(3072);
 expect(pageTaskPlanIssue({...contract(),pageTaskPlan:result.snapshot})).toBeUndefined();expect(JSON.stringify(result.snapshot)).not.toContain(provider.apiKey);
});
test('format correction preserves a real critical question rather than silently defaulting it to empty',async()=>{
 const bad:any=raw();delete bad.questions;const fixed=raw();fixed.questions=['提供的实际收费有冲突，必须确认'];
 const result=await execute([bad,fixed]);expect(result.snapshot?.plan.questions).toEqual(fixed.questions);
});
test('truncated/unsafe authority never becomes a format-repair permission',async()=>{
 for(const kind of ['source','target','remove'] as const){const bad=raw();
  if(kind==='source')bad.features[0].sourceIds=['forged-document'];if(kind==='target')bad.features[0].interactions[0].targetScreenId='other';if(kind==='remove')bad.features[0].change='remove';
  const result=await execute([bad,raw()]);expect(result.error).toBeDefined();expect(result.calls).toHaveLength(1);
 }
});
test('two invalid outputs stop; an exhausted parent never receives an additional call',async()=>{
 const bad:any=raw();delete bad.questions;
 const twice=await execute([bad,bad,raw()]);expect(twice.error).toBeInstanceOf(PageTaskPlanFormatError);expect(twice.calls).toHaveLength(2);
 const capped=await execute([bad,raw()],{maxRequests:1,maxRequestedOutputTokens:3072});expect(capped.error).toBeDefined();expect(capped.calls).toHaveLength(1);
});
test('a stale context cannot use a correction and corrupt repair metadata cannot restore',async()=>{
 let checks=0;const stale=await execute(['bad-json',raw()],undefined,()=>++checks<2);expect(stale.calls).toHaveLength(1);expect(stale.error).toBeDefined();
 const bad:any=raw();delete bad.questions;const result=await execute([bad,raw()]);result.snapshot!.request.formatRepair!.attempts=3 as any;
 expect(pageTaskPlanIssue({...contract(),pageTaskPlan:result.snapshot})).toBeDefined();
});
test('long page grouping limit and static-only inference policy are explicit in the actual prompt',async()=>{
 const result=await execute([raw()]),system=result.calls[0].messages[0].content;
 expect(system).toContain('1～8个功能组');expect(system).toContain('不因缺少这些展示细节');expect(system).toContain('有关键问题仍照实返回');expect(system).toContain('不得编造真实价格');
 const tooMany=raw();tooMany.features=Array.from({length:9},(_,i)=>({...tooMany.features[0],id:'f'+(i+1)}));
 expect(()=>validatePageTaskPlan(tooMany,contract())).toThrow('features');
});
