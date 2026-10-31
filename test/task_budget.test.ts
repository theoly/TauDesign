import {expect,test} from 'bun:test';
import {TaskBudget,withTaskBudget} from '../src/services/ai/taskBudget';
import {streamWithContinuation} from '../src/services/ai/boundedContinuation';
import type {AIEngineCore,StreamTextOptions} from '../src/services/ai/engine/core/types';
const provider={id:'budget',name:'fixture',protocol:'openai_compatible' as const,baseUrl:'http://mock',apiKey:''};
const options={provider,model:'fixture',maxTokens:4,messages:[{role:'user' as const,content:'生成页面'}]};
const limits={maxRequests:3,maxRequestedOutputTokens:12,maxDurationMs:10000,maxRequestDurationMs:10000};
function fake(text=Promise.resolve('done'),reported=true){
  const calls:StreamTextOptions[]=[];
  const core:AIEngineCore={streamText(o){calls.push(o);return {textPromise:text,textStream:(async function*(){})(),reasoningStream:(async function*(){})(),
    reasoningPromise:Promise.resolve(undefined),usagePromise:Promise.resolve(reported?{inputTokens:3,outputTokens:1}:undefined),finishReasonPromise:Promise.resolve('stop'),abort(){}};},
    async generateObject<T>(_s,o){calls.push(o);return {ok:true} as T;}};
  return {core,calls};
}
test('parallel children reserve before dispatch and cannot spend each others output quota',async()=>{
  let finish!:(s:string)=>void;const f=fake(new Promise(resolve=>{finish=resolve;}),false),ledger=new TaskBudget({...limits,maxRequestedOutputTokens:8});
  const core=withTaskBudget(f.core,ledger),a=core.streamText(options),b=core.streamText(options);
  expect(ledger.snapshot().reservedOutputTokens).toBe(8);
  expect(()=>core.streamText(options)).toThrow('预算已耗尽');expect(f.calls).toHaveLength(2);
  finish('done');await Promise.all([a.textPromise,b.textPromise]);
  expect(ledger.snapshot()).toMatchObject({requests:2,requestedOutputTokens:8,reservedOutputTokens:0,unreportedOutputCaps:8});
  expect(()=>core.streamText(options)).toThrow('预算已耗尽');
});
test('low reported usage does not refill requested output allowance',async()=>{
  const f=fake(),ledger=new TaskBudget({...limits,maxRequestedOutputTokens:4}),core=withTaskBudget(f.core,ledger);
  await core.streamText(options).textPromise;
  expect(ledger.snapshot()).toMatchObject({requestedOutputTokens:4,reportedOutputTokens:1,reportedInputTokens:3,reservedOutputTokens:0});
  expect(()=>core.streamText(options)).toThrow();expect(f.calls).toHaveLength(1);
});
test('transport failures keep a conservative charge and release pending reservations',()=>{
  const ledger=new TaskBudget(limits),f=fake();f.core.streamText=()=>{throw Error('network');};
  expect(()=>withTaskBudget(f.core,ledger).streamText(options)).toThrow('network');
  expect(ledger.snapshot()).toMatchObject({requests:1,requestedOutputTokens:4,reservedOutputTokens:0,unreportedOutputCaps:4});
});
test('metadata failure aborts an active transport and releases its reservation',async()=>{
  let aborted=false;const f=fake();f.core.streamText=()=>({textPromise:Promise.resolve('text'),reasoningPromise:Promise.reject(Error('metadata failed')),usagePromise:Promise.resolve(undefined),
    textStream:(async function*(){})(),reasoningStream:(async function*(){})(),abort(){aborted=true;}});
  const ledger=new TaskBudget(limits);
  await expect(withTaskBudget(f.core,ledger).streamText(options).textPromise).rejects.toThrow('metadata failed');
  expect(aborted).toBe(true);expect(ledger.snapshot().reservedOutputTokens).toBe(0);
});
test('JSON generation uses the same parent allowance and existing parser',async()=>{
  const f=fake(),ledger=new TaskBudget({...limits,maxRequests:1}),core=withTaskBudget(f.core,ledger);
  expect(await core.generateObject({type:'object'},options)).toEqual({ok:true});
  await expect(core.generateObject({},options)).rejects.toThrow('预算已耗尽');expect(f.calls).toHaveLength(1);
});
test('parent deadline interrupts stalled text and metadata without waiting for transport cooperation',async()=>{
  const f=fake(new Promise(()=>{}));
  f.core.streamText=()=>({textPromise:new Promise(()=>{}),reasoningPromise:new Promise(()=>{}),usagePromise:new Promise(()=>{}),textStream:(async function*(){})(),reasoningStream:(async function*(){})(),abort(){}});
  const ledger=new TaskBudget({...limits,maxDurationMs:20,maxRequestDurationMs:20});
  const result=await streamWithContinuation(withTaskBudget(f.core,ledger),options);
  expect(result.errorMessage).toContain('时限');expect(ledger.snapshot().cancelled).toBe(true);expect(ledger.snapshot().reservedOutputTokens).toBe(0);
});
test('continuation shares the parent call cap instead of resetting a child allowance',async()=>{
  const f=fake();f.core.streamText=o=>{f.calls.push(o);return {textPromise:Promise.resolve('<artifact><main>未完成'),textStream:(async function*(){})(),reasoningStream:(async function*(){})(),reasoningPromise:Promise.resolve(undefined),usagePromise:Promise.resolve(undefined),finishReasonPromise:Promise.resolve('length'),abort(){}};};
  const ledger=new TaskBudget({...limits,maxRequests:1});
  const result=await streamWithContinuation(withTaskBudget(f.core,ledger),options,{budget:{maxRequestedTokens:8,continuationTokens:4,autoContinuations:1}});
  expect(result.errorMessage).toContain('预算已耗尽');expect(f.calls).toHaveLength(1);expect(result.rawResponse).toContain('未完成');
});
test('cancelled parent rejects late results and any subsequent child',async()=>{
  let finish!:(s:string)=>void;const f=fake(new Promise(resolve=>{finish=resolve;})),ledger=new TaskBudget(limits),core=withTaskBudget(f.core,ledger);
  const result=core.streamText(options);ledger.cancel('用户取消');await expect(result.textPromise).rejects.toThrow('用户取消');
  finish('late');await Promise.resolve();expect(()=>core.streamText(options)).toThrow('用户取消');expect(ledger.snapshot().reservedOutputTokens).toBe(0);
});
test('limits are copied, invalid requests do not dispatch, and total deadline spans sequential children',()=>{
  let now=0;const config={...limits},ledger=new TaskBudget(config,()=>now);config.maxRequests=100;
  expect(ledger.snapshot().limits.maxRequests).toBe(3);
  expect(()=>ledger.reserve(NaN)).toThrow();expect(ledger.snapshot().requests).toBe(0);
  now=10001;expect(()=>ledger.reserve(4)).toThrow('总时限');
  expect(()=>new TaskBudget({...limits,maxRequestDurationMs:10001})).toThrow();
  expect(()=>new TaskBudget({maxRequests:1,maxDurationMs:1,maxRequestDurationMs:1,other:1} as any)).toThrow();
});
