import { expect, test } from 'bun:test';
import { executeRestyleTarget, type RestyleProgress } from '../src/services/ai/restyleExecutor';
import type { AIEngineCore } from '../src/services/ai/engine/core/types';
const never = new Promise<any>(()=>{});
const target = {kind:'screen' as const,id:'s',name:'Page',html:'<div data-nid="aaaaaaaa">Hello</div>'};
const request = {provider:{id:'p',name:'Provider',protocol:'openai_compatible',baseUrl:'https://example.com',apiKey:'SECRET'},model:'model',messages:[]} as any;
const contract = {} as any;
test('idle timeout releases hanging metadata and aborts transport',async()=>{
 let aborted=false; const events:RestyleProgress[]=[];
 const core={streamText:()=>({textStream:(async function*(){yield 'abc';})(),reasoningStream:(async function*(){yield 'private reasoning';})(),textPromise:Promise.resolve('abc'),reasoningPromise:never,usagePromise:never,abort:()=>{aborted=true;}})} as unknown as AIEngineCore;
 const outcome=await executeRestyleTarget(core,{target,request,contract,quality:{},onProgress:p=>events.push(p),idleTimeoutMs:15,totalTimeoutMs:100});
 expect(aborted).toBe(true);expect(outcome.status).toBe('failed');expect(outcome.message).toContain('无活动');
 expect(events.some(e=>e.textChars===3&&e.reasoningChars===17)).toBe(true);
 expect(JSON.stringify(events)).not.toContain('private reasoning');expect(JSON.stringify(events)).not.toContain('SECRET');
});
test('cancelled request exits despite stalled transport',async()=>{
 const controller=new AbortController();let aborted=false;
 const core={streamText:()=>({textStream:(async function*(){await never;})(),reasoningStream:(async function*(){})(),textPromise:never,reasoningPromise:never,usagePromise:never,abort:()=>{aborted=true;}})} as unknown as AIEngineCore;
 const pending=executeRestyleTarget(core,{target,request:{...request,signal:controller.signal},contract,quality:{}});
 controller.abort();const result=await pending;expect(result.status).toBe('failed');expect(result.message).toContain('取消');expect(aborted).toBe(true);
});
test('total deadline stops active streams and ignores late output',async()=>{
 let release!:()=>void,aborted=false;const events:RestyleProgress[]=[];
 const gate=new Promise<void>(resolve=>{release=resolve;});
 const core={streamText:()=>({textStream:(async function*(){yield 'a';await gate;yield 'late secret';})(),reasoningStream:(async function*(){})(),textPromise:never,reasoningPromise:never,usagePromise:never,abort:()=>{aborted=true;}})} as unknown as AIEngineCore;
 const result=await executeRestyleTarget(core,{target,request,contract,quality:{},onProgress:p=>events.push(p),totalTimeoutMs:10,idleTimeoutMs:100});
 expect(result.message).toContain('总时限');expect(aborted).toBe(true);const count=events.length;release();await new Promise(r=>setTimeout(r,1));expect(events.length).toBe(count);expect(result.html).toBeUndefined();
});
test('completed stream announces validation and exact public counters',async()=>{
 const events:RestyleProgress[]=[];const html=target.html;
 const core={streamText:()=>({textStream:(async function*(){yield html;})(),reasoningStream:(async function*(){})(),textPromise:Promise.resolve(html),reasoningPromise:Promise.resolve(undefined),usagePromise:Promise.resolve(undefined),abort:()=>{}})} as unknown as AIEngineCore;
 const result=await executeRestyleTarget(core,{target,request,contract,quality:{},onProgress:p=>events.push(p)});
 expect(result.status).toBe('applied');expect(events.map(p=>p.phase)).toContain('waiting');expect(events.map(p=>p.phase)).toContain('validating');expect(events.at(-1)?.phase).toBe('complete');expect(events.at(-1)?.textChars).toBe(html.length);
});
test('continuation chunks report activity as they arrive',async()=>{
 let calls=0;const events:RestyleProgress[]=[];
 const prefix='<artifact type="screen"><div data-nid="aaaaaaaa">';
 const core={streamText:(options:any)=>{calls++;const html=calls===1?prefix:'Hello</div></artifact>';
 return {textStream:(async function*(){yield html;})(),reasoningStream:(async function*(){})(),textPromise:Promise.resolve(html),reasoningPromise:Promise.resolve(undefined),usagePromise:Promise.resolve(undefined),finishReasonPromise:Promise.resolve(calls===1?'length':'stop'),abort:()=>{}};}} as unknown as AIEngineCore;
 await executeRestyleTarget(core,{target,request:{...request,provider:{...request.provider,baseUrl:'https://x.cn-beijing.maas.aliyuncs.com/compatible-mode/v1'},model:'qwen-plus'},contract,quality:{},onProgress:p=>events.push(p)});
 expect(calls).toBe(2);expect(events.some(p=>p.phase==='continuing'&&p.continuationCount===1)).toBe(true);expect(events.at(-1)?.textChars).toBe(prefix.length+'Hello</div></artifact>'.length);
});
test('transport errors report the actual failed stage, retry guidance and an execution record',async()=>{
 const events:RestyleProgress[]=[];
 const core={streamText:()=>({textStream:(async function*(){})(),reasoningStream:(async function*(){})(),textPromise:Promise.reject(new Error('network offline')),reasoningPromise:Promise.resolve(undefined),usagePromise:Promise.resolve(undefined),abort:()=>{}})} as unknown as AIEngineCore;
 const result=await executeRestyleTarget(core,{target,request,contract,quality:{},onProgress:p=>events.push(p)});
 expect(result.message).toContain('等待模型');expect(result.message).toContain('可重试');expect(result.executionRecord?.errorMessage).toContain('network offline');expect(events.map(e=>e.phase)).not.toContain('validating');
});
