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
for(const bodyFailure of [false,true])test(`${bodyFailure?'body failure':'deadline'} exits bounded consumption even when a stream or metadata ignores cancellation`,async()=>{
 let release!:()=>void,aborts=0;const gate=new Promise<void>(resolve=>release=resolve),observed:string[]=[];
 const core:AIEngineCore={async generateObject(){throw Error('unused');},streamText(){return {
  textStream:(async function*(){await gate;yield 'LATE_BODY';})(),reasoningStream:(async function*(){})(),
  textPromise:bodyFailure?Promise.reject(Error('body failed')):gate.then(()=>'LATE_BODY'),
  reasoningPromise:bodyFailure?gate.then(()=>undefined):Promise.resolve(undefined),usagePromise:bodyFailure?gate.then(()=>undefined):Promise.resolve({inputTokens:2,outputTokens:3}),finishReasonPromise:Promise.resolve('stop'),abort(){aborts++;}
 };}};
 const budget=new TaskBudget({maxRequests:1,maxRequestedOutputTokens:2048,maxDurationMs:1000,maxRequestDurationMs:20});
 try{
  const result=await streamWithContinuation(withTaskBudget(core,budget),{...options,maxTokens:2048},{allowContinuation:false,onText:text=>observed.push(text)});
  expect(result.errorMessage).toContain(bodyFailure?'body failed':'超过时限');expect(aborts).toBeGreaterThan(0);expect(budget.snapshot()).toMatchObject({requests:1,requestedOutputTokens:2048,reservedOutputTokens:0});
  const count=observed.length;release();await new Promise(resolve=>setTimeout(resolve,2));expect(observed).toHaveLength(count);expect(result.rawResponse).not.toContain('LATE_BODY');
 }finally{release();budget.close();}
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

for(const kind of ['stream','json'] as const)for(const scope of ['parent','request'] as const)for(const timing of ['before','at','after'] as const)
test(`${kind} ${timing==='before'?'accepts before':'rejects '+timing} ${scope} deadline without a timer turn`,async()=>{
 let now=0,finish!:(value:string)=>void;
 const pending=new Promise<string>(resolve=>finish=resolve),f=fake(pending),calls:StreamTextOptions[]=[];
 f.core.generateObject=async<T>(_schema,request)=>{calls.push(request);await pending;return {ok:true} as T;};
 const ledger=new TaskBudget({...limits,maxDurationMs:100,maxRequestDurationMs:scope==='parent'?100:20},()=>now),core=withTaskBudget(f.core,ledger);
 // The parent expires after 20ms here, earlier than this request's independent 100ms cap.
 now=scope==='parent'?80:0;
 const result=kind==='stream'?core.streamText(options).textPromise:core.generateObject({},options);
 const settled=result.then(value=>({status:'resolved' as const,value}),error=>({status:'rejected' as const,error}));
 // Attach handlers, advance the injected clock, then resolve in the same event-loop turn.
 now=(scope==='parent'?100:20)+(timing==='before'?-1:timing==='at'?0:1);finish('late');
 const outcome=await settled;
 expect(outcome.status).toBe(timing==='before'?'resolved':'rejected');
 if(outcome.status==='rejected')expect(String(outcome.error)).toContain('超过时限');
 else expect(outcome.value).toEqual(kind==='stream'?'late':{ok:true});
 expect((kind==='stream'?f.calls:calls)[0].signal?.aborted).toBe(timing!=='before');
 expect(ledger.snapshot()).toMatchObject({cancelled:timing!=='before',requests:1,requestedOutputTokens:4,reservedOutputTokens:0});
 if(timing!=='before')expect(()=>core.streamText(options)).toThrow('超过时限');
});

for(const scope of ['parent','request'] as const)test(`${scope} expiry cancels a parallel child and keeps both charges after late success`,async()=>{
 let now=0,finishA!:(value:string)=>void,finishB!:(value:string)=>void;
 const a=new Promise<string>(resolve=>finishA=resolve),b=new Promise<string>(resolve=>finishB=resolve),f=fake();let index=0,aborts=0;
 f.core.streamText=request=>{const result=fake(index++===0?a:b).core.streamText(request);f.calls.push(request);return {...result,abort(){aborts++;}};};
 const ledger=new TaskBudget({...limits,maxDurationMs:100,maxRequestDurationMs:scope==='parent'?100:20},()=>now),core=withTaskBudget(f.core,ledger);
 now=scope==='parent'?80:0;const first=core.streamText(options).textPromise;
 now+=10;const second=core.streamText(options).textPromise,settled=Promise.allSettled([first,second]);
 now=scope==='parent'?100:20;finishA('late A');
 const outcomes=await settled;
 expect(outcomes.every(result=>result.status==='rejected'&&String(result.reason).includes('超过时限'))).toBe(true);
 expect(f.calls.every(request=>request.signal?.aborted)).toBe(true);expect(aborts).toBeGreaterThanOrEqual(2);
 expect(ledger.snapshot()).toMatchObject({requests:2,requestedOutputTokens:8,reservedOutputTokens:0,cancelled:true});
 finishB('late B');await Promise.resolve();expect(ledger.snapshot().requestedOutputTokens).toBe(8);
 expect(()=>core.streamText(options)).toThrow('超过时限');expect(f.calls).toHaveLength(2);
});

test('non-model windows allow a completed request that exactly spent its quotas',async()=>{
 const budget=new TaskBudget({...limits,maxRequests:1,maxRequestedOutputTokens:4});budget.reserve(4).settle();
 expect(budget.canReserve(4)).toBe(false);expect(()=>budget.assertActive()).not.toThrow();
 expect(await budget.run(async signal=>{expect(signal).toBe(budget.signal);return 'ready';})).toBe('ready');
 expect(budget.snapshot()).toMatchObject({requests:1,requestedOutputTokens:4,exhausted:true,cancelled:false});budget.close();expect(budget.snapshot().cancelled).toBe(false);
});
test('non-model window rejects a late result at its monotonic deadline without a timer turn',async()=>{
 let now=0;const budget=new TaskBudget({...limits,maxDurationMs:100,maxRequestDurationMs:100},()=>now);
 const result=await budget.run(async()=>{now=100;return 'late';}).then(()=>({ok:true,error:''}),error=>({ok:false,error:String(error)}));
 expect(result).toMatchObject({ok:false});expect(result.error).toContain('总时限');expect(budget.snapshot()).toMatchObject({requests:0,cancelled:true});budget.close();
});
test('parent timer exits an uncooperative non-model await without waiting for its late result',async()=>{
 let release!:(value:string)=>void,signal!:AbortSignal;const gate=new Promise<string>(resolve=>release=resolve),budget=new TaskBudget({...limits,maxDurationMs:20,maxRequestDurationMs:20});
 const result=await budget.run(current=>{signal=current;return gate;}).then(()=>false,error=>String(error).includes('总时限'));
 expect(result).toBe(true);expect(signal.aborted).toBe(true);expect(budget.snapshot()).toMatchObject({requests:0,reservedOutputTokens:0,cancelled:true});release('late');await Promise.resolve();budget.close();
});
test('closing a task interrupts a non-model window even when no tokens are reserved',async()=>{
 let release!:(value:string)=>void;const gate=new Promise<string>(resolve=>release=resolve),budget=new TaskBudget(limits);
 const pending=budget.run(()=>gate).then(()=>false,error=>String(error).includes('已结束'));budget.close();
 expect(await pending).toBe(true);expect(budget.snapshot()).toMatchObject({closed:true,cancelled:true,requests:0});release('late');
});
test('external cancellation interrupts all parallel windows of the same parent',async()=>{
 let release!:(value:string)=>void;const gate=new Promise<string>(resolve=>release=resolve),budget=new TaskBudget(limits),external=new AbortController();
 const results=Promise.allSettled([budget.run(()=>gate,external.signal),budget.run(()=>gate)]);external.abort();
 expect((await results).every(r=>r.status==='rejected')).toBe(true);expect(budget.signal.aborted).toBe(true);expect(budget.snapshot().requests).toBe(0);release('late');budget.close();
});
test('completed nested windows remove external listeners and leave caller-owned budget open',async()=>{
 const budget=new TaskBudget(limits),external=new AbortController();
 expect(await budget.run(()=>budget.run(async()=>42),external.signal)).toBe(42);external.abort();
 expect(budget.snapshot()).toMatchObject({closed:false,cancelled:false,requests:0});budget.close();expect(budget.snapshot().cancelled).toBe(false);
});
test('pre-cancelled or expired windows never start work',async()=>{
 let now=0,calls=0;const budget=new TaskBudget({...limits,maxDurationMs:100,maxRequestDurationMs:100},()=>now);now=100;
 await budget.run(async()=>++calls).catch(()=>{});expect(calls).toBe(0);expect(budget.signal.aborted).toBe(true);
 const other=new TaskBudget(limits),external=new AbortController();external.abort();await other.run(async()=>++calls,external.signal).catch(()=>{});expect(calls).toBe(0);budget.close();other.close();
});
test('failed windows release their deadline listener without closing the caller budget',async()=>{
 const budget=new TaskBudget(limits),external=new AbortController();const error=await budget.run(async()=>{throw Error('file failed');},external.signal).catch(error=>String(error));
 expect(error).toContain('file failed');external.abort();expect(budget.canReserve(4)).toBe(true);budget.close();expect(budget.snapshot().cancelled).toBe(false);
});
