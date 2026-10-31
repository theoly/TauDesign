import {expect,test} from 'bun:test';
import {observeRequestActivity,type RequestActivity} from '../src/services/ai/requestActivity';
import {DefaultAIEngineCore} from '../src/services/ai/engine/core/aiEngineCore';
import {MockTransport} from '../src/services/ai/engine/transport/mockTransport';
import {TaskBudget,withTaskBudget} from '../src/services/ai/taskBudget';
import {PipelineExecutor} from '../src/services/ai/engine/pipeline/executor';
import type {AIEngineCore,StreamTextResult} from '../src/services/ai/engine/core/types';
const provider={id:'local-fixture',name:'本地',protocol:'openai_compatible' as const,baseUrl:'https://invalid.test',apiKey:'ACTIVITY_SECRET'};
const options={provider,model:'fixture',messages:[{role:'user' as const,content:'PRIVATE_PROMPT'}]};
const pause=()=>new Promise(resolve=>setTimeout(resolve,0));
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(r=>resolve=r);return {promise,resolve};}
function delayed(){const text=deferred<string>(),reasoning=deferred<string|undefined>();let calls=0;
 const result:StreamTextResult={textStream:(async function*(){yield await text.promise;})(),reasoningStream:(async function*(){const r=await reasoning.promise;if(r)yield r;})(),
  textPromise:text.promise,reasoningPromise:reasoning.promise,usagePromise:Promise.resolve(undefined),finishReasonPromise:Promise.resolve('stop'),abort(){}};
 const core:AIEngineCore={async generateObject<T>(){calls++;return await text.promise as T;},streamText(){calls++;return result;}};
 return {core,text,reasoning,calls:()=>calls};}

test('idle observation and waiting do not invent phases, body, reasoning or a Provider acknowledgement',async()=>{
 const f=delayed(),events:RequestActivity[]=[],monitor=observeRequestActivity(f.core,a=>events.push(a));
 expect(events[0]).toMatchObject({status:'idle',requests:0,active:0,textChars:0,reasoningChars:0,jsonChars:0});
 const stream=monitor.core.streamText(options);await pause();
 expect(events.at(-1)).toMatchObject({status:'waiting',requests:1,active:1,textChars:0,reasoningChars:0});
 f.text.resolve('内容');f.reasoning.resolve(undefined);await stream.textPromise;
 expect(events.at(-1)).toMatchObject({status:'returned',requests:1,active:0,textChars:2});
 const json=JSON.stringify(events);expect(json).not.toContain('ACTIVITY_SECRET');expect(json).not.toContain('PRIVATE_PROMPT');monitor.stop();
});
test('real core text and reasoning streams are preserved and counted once even when promises settle first',async()=>{
 const transport=new MockTransport();transport.queueResponse('<think>比较布局</think>完整正文');
 const monitor=observeRequestActivity(new DefaultAIEngineCore(transport),()=>{}),stream=monitor.core.streamText(options);
 expect(await stream.textPromise).toBe('完整正文');
 let text='',reasoning='';for await(const chunk of stream.textStream)text+=chunk;for await(const chunk of stream.reasoningStream)reasoning+=chunk;
 expect(text).toBe('完整正文');expect(reasoning).toBe('比较布局');
 expect(monitor.snapshot()).toMatchObject({requests:1,active:0,textChars:4,reasoningChars:4,status:'returned'});monitor.stop();
});
test('JSON calls expose waiting then measured result characters, without fabricating stream observations',async()=>{
 const transport=new MockTransport();transport.queueResponse('{"ok":true}');const events:RequestActivity[]=[],monitor=observeRequestActivity(new DefaultAIEngineCore(transport),a=>events.push(a));
 expect(await monitor.core.generateObject({},options)).toEqual({ok:true});
 expect(events.some(e=>e.status==='waiting'&&e.jsonChars===0)).toBe(true);
 expect(monitor.snapshot()).toMatchObject({requests:1,active:0,jsonChars:JSON.stringify({ok:true}).length,textChars:0,reasoningChars:0,status:'returned'});monitor.stop();
});
test('quota rejection before the actual core makes no call and no request activity',async()=>{
 const f=delayed(),monitor=observeRequestActivity(f.core,()=>{}),budget=new TaskBudget({maxRequests:1,maxRequestedOutputTokens:1,maxDurationMs:10000,maxRequestDurationMs:10000});
 expect(()=>withTaskBudget(monitor.core,budget).streamText({...options,maxTokens:2})).toThrow('预算');
 expect(f.calls()).toBe(0);expect(monitor.snapshot().requests).toBe(0);budget.close();monitor.stop();
});
test('cancelled calls stay cancelled and do not publish late completion, while stream data remains untouched',async()=>{
 const f=delayed(),events:RequestActivity[]=[],controller=new AbortController(),monitor=observeRequestActivity(f.core,a=>events.push(a));
 const stream=monitor.core.streamText({...options,signal:controller.signal});controller.abort();
 expect(events.at(-1)).toMatchObject({status:'cancelled',active:0});const count=events.length;
 f.text.resolve('迟到内容');f.reasoning.resolve('迟到推理');await stream.textPromise;
 expect(events).toHaveLength(count);expect(events.at(-1)?.textChars).toBe(0);monitor.stop();
});
test('observer disposal and stale ownership suppress callbacks without aborting or adding requests',async()=>{
 const f=delayed(),events:RequestActivity[]=[];let current=true;const monitor=observeRequestActivity(f.core,a=>events.push(a),()=>current);
 const stream=monitor.core.streamText(options);current=false;const count=events.length;monitor.stop();f.text.resolve('结果');f.reasoning.resolve(undefined);
 expect(await stream.textPromise).toBe('结果');expect(events).toHaveLength(count);expect(f.calls()).toBe(1);
});
test('synchronous core failure records a failed attempt without a successful return',()=>{
 const f=delayed();f.core.streamText=()=>{throw Error('本地失败');};const monitor=observeRequestActivity(f.core,()=>{});
 expect(()=>monitor.core.streamText(options)).toThrow('本地失败');expect(monitor.snapshot()).toMatchObject({requests:1,active:0,status:'failed'});monitor.stop();
});
test('a later controlled repair continues settled activity totals without mutating the completed pipeline snapshot',async()=>{
 const transport=new MockTransport(),core=new DefaultAIEngineCore(transport),first=observeRequestActivity(core,()=>{});
 transport.queueResponse('{"answer":"规划"}');await first.core.generateObject({type:'object'},options);transport.queueResponse('页面');await first.core.streamText(options).textPromise;
 const original=first.snapshot();first.stop();const events:RequestActivity[]=[],repair=observeRequestActivity(core,a=>events.push(a),()=>true,original);
 transport.queueResponse('修复');await repair.core.streamText(options).textPromise;
 expect(repair.snapshot()).toMatchObject({requests:3,active:0,status:'returned',startedAt:original.startedAt,textChars:original.textChars+2,jsonChars:original.jsonChars});expect(original.requests).toBe(2);expect(events[0]).toEqual(original);repair.stop();
});
test('activity continuation rejects an unfinished snapshot without adding a core call',()=>{
 const f=delayed(),first=observeRequestActivity(f.core,()=>{});first.core.streamText(options);
 expect(()=>observeRequestActivity(f.core,()=>{},()=>true,first.snapshot())).toThrow('已经结算');expect(f.calls()).toBe(1);first.stop();f.text.resolve('迟到');f.reasoning.resolve(undefined);
});
test('pipeline reports only entered phases and real application calls for an ordinary question',async()=>{
 const transport=new MockTransport();transport.queueResponse('这是答复。');const phases:string[]=[],events:RequestActivity[]=[];
 const output=await PipelineExecutor.execute({input:{rawPrompt:'什么是布局？',activeScreenId:null,decision:{intent:'question',targetScreenId:null,reason:'问答'}},
  provider,model:'fixture',engineCore:new DefaultAIEngineCore(transport),screens:{},deviceProfile:'pc',frameWidth:1440,baseSystemPrompt:'问答',onPhase:p=>phases.push(p),onActivity:a=>events.push(a)});
 expect(output.status).toBe('answered_question');expect(phases).toEqual(['preparing','assembling','generating','validating']);
 expect(events.at(-1)).toMatchObject({requests:1,status:'returned',textChars:'这是答复。'.length});
 expect(phases).not.toContain('planning');expect(phases).not.toContain('rendering');
});
