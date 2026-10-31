import {expect,test} from 'bun:test';
import {TaskBudget,withTaskBudget} from '../src/services/ai/taskBudget';
import {createRestyleBudget,createPlanningBudget,createMultiPageBudget} from '../src/services/ai/taskBudgetPolicy';
import {executeRestyleBatch} from '../src/services/ai/restyleBatch';
import type {RestyleTarget,RestyleOutcome} from '../src/services/ai/restyleService';
import type {AIEngineCore} from '../src/services/ai/engine/core/types';
const provider={id:'fixture',name:'mock',protocol:'openai_compatible' as const,baseUrl:'http://mock',apiKey:''};
const target=(id:string):RestyleTarget=>({id,kind:'screen',name:id,html:`<main>${id}</main>`});
const outcome=(target:RestyleTarget):RestyleOutcome=>({target,status:'applied',html:target.html});
function fixture(){
  let calls=0;const queue=['trial','one','two'].map(target);
  const core:AIEngineCore={streamText(){throw Error('unused');},async generateObject<T>(){calls++;return {ok:true} as T;}};
  return {queue,core,calls:()=>calls,options:{plan:{queue,dryRun:queue[0],estimatedCalls:3,naiveCalls:3},dryRun:outcome(queue[0]),confirmedContextKey:'current',getContextKey:()=> 'current',resolveTarget:(t:RestyleTarget)=>t,apply:()=>true}};
}
test('confirmed restyle batch owns one ledger, skips trial regeneration and closes at completion',async()=>{
  const f=fixture(),seen:TaskBudget[]=[];
  const result=await executeRestyleBatch({...f.options,generate:async(t,budget)=>{seen.push(budget);await withTaskBudget(f.core,budget).generateObject({}, {provider,model:'test',messages:[],maxTokens:4});return outcome(t);}});
  expect(result.status).toBe('completed');expect(f.calls()).toBe(2);expect(seen[0]).toBe(seen[1]);
  expect(result.taskBudget).toMatchObject({requests:2,closed:true,cancelled:false,reservedOutputTokens:0});
  expect(()=>seen[0].reserve(4)).toThrow('已结束');
});
test('supplied parent remains owned by caller and exhaustion cannot be reset for next target',async()=>{
  const f=fixture(),parent=new TaskBudget({maxRequests:1,maxRequestedOutputTokens:4,maxDurationMs:1000,maxRequestDurationMs:1000});
  const result=await executeRestyleBatch({...f.options,taskBudget:parent,generate:async(t,budget)=>{expect(budget).toBe(parent);await withTaskBudget(f.core,budget).generateObject({}, {provider,model:'test',messages:[],maxTokens:4});return outcome(t);}});
  expect(f.calls()).toBe(1);expect(result.outcomes.map(o=>o.status)).toEqual(['applied','applied']);
  expect(result.status).toBe('cancelled');expect(result.remaining).toBe(1);
  expect(parent.snapshot().closed).toBe(false);expect(result.message).toContain('预算已耗尽');parent.close();
});
test('using the exact allowance still applies the completed final target',async()=>{
  const f=fixture(),parent=new TaskBudget({maxRequests:2,maxRequestedOutputTokens:8,maxDurationMs:1000,maxRequestDurationMs:1000});
  const result=await executeRestyleBatch({...f.options,taskBudget:parent,generate:async(t,budget)=>{await withTaskBudget(f.core,budget).generateObject({}, {provider,model:'test',messages:[],maxTokens:4});return outcome(t);}});
  expect(result.status).toBe('completed');expect(result.outcomes).toHaveLength(3);expect(result.remaining).toBe(0);
  expect(parent.snapshot().exhausted).toBe(true);parent.close();
});
test('cancelled batch with no dispatch closes its ledger and cannot leave an active owner',async()=>{
  const f=fixture(),controller=new AbortController();controller.abort();
  const result=await executeRestyleBatch({...f.options,signal:controller.signal,generate:async t=>{throw Error(t.id);}});
  expect(result.status).toBe('cancelled');expect(result.taskBudget).toMatchObject({requests:0,closed:true,cancelled:true});
});
test('planning retry and confirmed page counts have finite independent root allowances',()=>{
  const plan=createPlanningBudget();plan.reserve(4096).settle();plan.reserve(4096).settle();expect(()=>plan.reserve(4096)).toThrow();plan.close();
  const single=createMultiPageBudget(1),two=createMultiPageBudget(2);
  expect(two.snapshot().limits.maxRequestedOutputTokens).toBe(single.snapshot().limits.maxRequestedOutputTokens*2);
  expect(()=>createMultiPageBudget(9)).toThrow();
  const small=createRestyleBudget([{html:'short'}]),large=createRestyleBudget([{html:'x'.repeat(24001)}]);
  expect(small.snapshot().limits.maxRequests).toBe(3);expect(large.snapshot().limits.maxRequests).toBe(16);
  for(const budget of [single,two,small,large])budget.close();
});
