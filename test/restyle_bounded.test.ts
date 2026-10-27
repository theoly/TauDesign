import {expect,test} from 'bun:test';
import {prepareModelRequest} from '../src/services/ai/engine/core/protocolAdapter';
import {restyleThinkingOptions} from '../src/services/ai/thinkingPolicy';
const provider={id:'ali',name:'Ali',protocol:'openai_compatible' as const,baseUrl:'https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1',apiKey:'test',isEnabled:true};
test('restyle-only thinking switch survives both request body and legacy proxy options',()=>{
 const policy=restyleThinkingOptions(provider,'qwen3.8-flash');expect(policy).toEqual({enableThinking:false});
 const r=prepareModelRequest({provider,model:'qwen3.8-flash',messages:[],...policy});expect((r.transportRequest.body as any).enable_thinking).toBe(false);expect(r.transportRequest.generationOptions?.enableThinking).toBe(false);
 expect(prepareModelRequest({provider,model:'qwen3.8-flash',messages:[]}).transportRequest.body).not.toHaveProperty('enable_thinking');
 expect(restyleThinkingOptions({...provider,baseUrl:'https://proxy.test/v1'},'qwen3.8-flash')).toEqual({});expect(restyleThinkingOptions(provider,'deepseek-reasoner')).toEqual({});
 expect(restyleThinkingOptions(provider,'qwen3.7-max-2026-05-17')).toEqual({});expect(restyleThinkingOptions(provider,'qwen3.8-flash-2099-01-01')).toEqual({});
});
test('an unclosed explicit HTML fence can continue even when its first root is header',async()=>{
 const {streamWithContinuation}=await import('../src/services/ai/boundedContinuation');let calls=0;
 const core={streamText:(r:any)=>{calls++;const marker=r.messages.at(-1).content.match(/TAUDESIGN_CONTINUE_[\w-]+/)?.[0];const text=calls===1?'```html\n<header data-nid="head0001">标题':marker+'\n</header>\n```';return {textStream:(async function*(){yield text;})(),reasoningStream:(async function*(){})(),textPromise:Promise.resolve(text),reasoningPromise:Promise.resolve(undefined),usagePromise:Promise.resolve(undefined),finishReasonPromise:Promise.resolve(calls===1?'length':'stop'),abort(){}};}} as any;
 const result=await streamWithContinuation(core,{provider,model:'qwen3.8-flash',messages:[{role:'user',content:'重塑'}]});expect(calls).toBe(2);expect(result.errorMessage).toBeUndefined();expect(result.rawResponse).toContain('</header>\n```');
});

test('legacy AIService transport serializes task-scoped thinking flag and keeps other endpoints unchanged',async()=>{
 const {AIServiceTransport}=await import('../src/services/ai/engine/transport/aiServiceTransport');
 const original=globalThis.fetch,bodies:any[]=[];
 globalThis.fetch=(async(_url,options)=>{bodies.push(JSON.parse(String(options?.body)));return new Response('',{status:200});}) as typeof fetch;
 try{
  for(const endpoint of [provider,{...provider,baseUrl:'https://proxy.test/v1'}]){
   const {transportRequest}=prepareModelRequest({provider:endpoint,model:'qwen3.8-flash',messages:[],enableThinking:false,maxTokens:2048});
   await new AIServiceTransport().stream(transportRequest,()=>{}).promise;
  }
  expect(bodies[0]).toMatchObject({enable_thinking:false,max_tokens:2048});expect(bodies[1]).not.toHaveProperty('enable_thinking');
 }finally{globalThis.fetch=original;}
});

test('official Qwen task option reaches desktop Rust IPC payload in both transport paths',async()=>{
 const {AIService}=await import('../src/services/ai/aiService');
 const {TauriRustTransport}=await import('../src/services/ai/engine/transport/tauriTransport');
 const prior=(window as any).__TAURI_INTERNALS__,tauri=(globalThis as any).isTauri;
 const sent:any[]=[];
 (window as any).__TAURI_INTERNALS__={transformCallback:()=>1,unregisterCallback(){},invoke:(command:string,args:any)=>{
  if(command!=='proxy_stream_request')return Promise.reject(Error(command));
  sent.push(JSON.parse(args.body));args.channel.onmessage({type:'Done'});return Promise.resolve();
 }};
 (globalThis as any).isTauri=true;
 try{
  const {transportRequest}=prepareModelRequest({provider,model:'qwen3.8-flash',messages:[],enableThinking:false,maxTokens:2048});
  await new TauriRustTransport().stream(transportRequest,()=>{}).promise;
  await AIService.stream(provider,'qwen3.8-flash',[],()=>{},1000,{enableThinking:false,maxTokens:2048}).promise;
  expect(sent).toHaveLength(2);for(const body of sent)expect(body).toMatchObject({enable_thinking:false,max_tokens:2048});
 }finally{(window as any).__TAURI_INTERNALS__=prior;(globalThis as any).isTauri=tauri;}
});
