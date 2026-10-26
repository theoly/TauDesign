import { expect, test } from 'bun:test';
import { streamWithContinuation, supportsNativeContinuation } from '../src/services/ai/boundedContinuation';
import { prepareModelRequest } from '../src/services/ai/engine/core/protocolAdapter';
import type { AIEngineCore, StreamTextOptions } from '../src/services/ai/engine/core/types';
const provider = { id:'q',name:'Q',protocol:'openai_compatible' as const,baseUrl:'https://workspace.cn-beijing.maas.aliyuncs.com/compatible-mode/v1',apiKey:'',isEnabled:true };
const prefix='<artifact><div>hello';
function engine(outputs: Array<[string,string]>) {
 const calls:StreamTextOptions[]=[];
 const core:AIEngineCore={streamText(o){calls.push(o); const [text,reason]=outputs.shift()!; return {textStream:(async function*(){yield text;})(),reasoningStream:(async function*(){yield 'r';})(),textPromise:Promise.resolve(text),reasoningPromise:Promise.resolve('r'),usagePromise:Promise.resolve({inputTokens:2,outputTokens:3}),finishReasonPromise:Promise.resolve(reason),abort(){}};},async generateObject(){throw Error('unused');}};
 return {core,calls};
}
const options={provider,model:'qwen-plus',messages:[{role:'user' as const,content:'page'}],maxTokens:8192};
test('native suffix uses exact full prefix and aggregates usage/reasoning once',async()=>{
 const {core,calls}=engine([[prefix,'length'],[' world</div></artifact>','stop']]);const deltas:string[]=[];
 const result=await streamWithContinuation(core,options,{onText:t=>deltas.push(t)});
 expect(result.rawResponse).toBe(prefix+' world</div></artifact>'); expect(deltas.join('')).toBe(result.rawResponse);
 expect(calls[1].messages.at(-1)).toEqual({role:'assistant',content:prefix,partial:true});
 expect(result.usage).toEqual({inputTokens:4,outputTokens:6});expect(result.reasoningText).toBe('rr');expect(result.recoveredStreamError).toBeUndefined();expect(result.warnings.some(w=>w.includes('续写'))).toBe(true);
 expect(result.continuationCount).toBe(1);expect(result.finishReason).toBe('stop');
 const body=prepareModelRequest(calls[1]).transportRequest.body as any;expect(body.messages.at(-1).partial).toBe(true);expect(body.enable_thinking).toBe(false);
 expect((prepareModelRequest(options).transportRequest.body as any).messages[0].partial).toBeUndefined();
});
test('native capability remains narrow; natural stop and complete output never continue',async()=>{
 expect(supportsNativeContinuation({...provider,baseUrl:'https://proxy.example/v1'},'qwen-plus')).toBe(false);
 expect(supportsNativeContinuation(provider,'qwen3.8-flash')).toBe(false);
 for(const [model,text,reason] of [['qwen-plus',prefix,'stop'],['qwen-plus','<artifact><div>ok</div></artifact>','length']]){
 const {core,calls}=engine([[text,reason]]);await streamWithContinuation(core,{...options,model});expect(calls).toHaveLength(1);
 }
});
test('bounded count/budget and repeated prefix stop without heuristic splicing',async()=>{
 const {core,calls}=engine([[prefix,'length'],[' x','length'],[' y','length']]);await streamWithContinuation(core,{...options,maxTokens:16384});expect(calls).toHaveLength(3);expect(calls.reduce((n,c)=>n+c.maxTokens!,0)).toBe(32768);
 const e=engine([[prefix,'length'],[prefix,'length']]);expect((await streamWithContinuation(e.core,options)).errorMessage).toContain('重复');expect(e.calls).toHaveLength(2);
});
test('empty progress, cancellation and transport failure stop recovery',async()=>{
 const empty=engine([[prefix,'length'],['','length']]);expect((await streamWithContinuation(empty.core,options)).errorMessage).toContain('进展');expect(empty.calls).toHaveLength(2);
 const aborted=engine([[prefix,'length']]);const controller=new AbortController();controller.abort();expect((await streamWithContinuation(aborted.core,{...options,signal:controller.signal})).errorMessage).toContain('取消');expect(aborted.calls).toHaveLength(0);
 const failed=engine([[prefix,'length']]);failed.core.streamText=()=>{throw Error('network');};expect((await streamWithContinuation(failed.core,options)).errorMessage).toContain('network');expect(failed.calls).toHaveLength(0);
});

import { DefaultAIEngineCore } from '../src/services/ai/engine/core/aiEngineCore';
import { AIService } from '../src/services/ai/aiService';
import { PipelineExecutor } from '../src/services/ai/engine/pipeline/executor';
test('real core preserves trailing prefix and leading suffix whitespace', async()=>{
 const sent:any[]=[];const fragments=['<artifact><div>hello  ',' world</div></artifact>'];
 const core=new DefaultAIEngineCore({id:'capture',stream(request,onEvent){sent.push(request);const text=fragments.shift()!;onEvent({type:'Delta',text});onEvent({type:'Done',finish_reason:sent.length===1?'length':'stop'});return {abort(){},promise:Promise.resolve()};}});
 const result=await streamWithContinuation(core,options);expect(result.rawResponse).toBe('<artifact><div>hello   world</div></artifact>');expect(sent[1].messages.at(-1).content).toBe('<artifact><div>hello  ');
});
test('AIService actual request body forwards native partial and omits it for ordinary/proxy requests', async()=>{
 const saved=globalThis.fetch;const bodies:any[]=[];
 globalThis.fetch=(async(_url:any,init:any)=>{bodies.push(JSON.parse(init.body));return new Response('data: [DONE]\n\n',{status:200});}) as typeof fetch;
 try {
  for(const [p,messages] of [[provider,[...options.messages,{role:'assistant',content:prefix,partial:true}]], [provider,options.messages], [{...provider,baseUrl:'https://proxy.example/v1'},[...options.messages,{role:'assistant',content:prefix,partial:true}]]] as const){
   await AIService.stream(p,'qwen-plus',messages as any,()=>{}).promise;
  }
  expect(bodies[0].messages.at(-1)).toEqual({role:'assistant',content:prefix,partial:true});expect(bodies[0].enable_thinking).toBe(false);
  expect(bodies[1].messages[0].partial).toBeUndefined();expect(bodies[1].enable_thinking).toBeUndefined();expect(bodies[2].messages.at(-1).partial).toBeUndefined();
 }finally{globalThis.fetch=saved;}
});
test('assembled continuation still passes source safety and action integrity gates',async()=>{
 const e=engine([['<artifact><main class="container-max"><h1>Title</h1>','length'],['<script>alert(1)</script></main></artifact>','stop']]);
 const result=await PipelineExecutor.execute({input:{rawPrompt:'创建页面'},provider,model:'qwen-plus',engineCore:e.core,screens:{},deviceProfile:'pc',frameWidth:1440,baseSystemPrompt:'test'});
 expect(e.calls).toHaveLength(2);expect(result.status).toBe('rejected_by_quality');expect(result.qualityReport?.passed).toBe(false);expect(result.warnings?.some(w=>w.includes('续写'))).toBe(true);expect(result.usage?.outputTokens).toBe(6);
 expect(result.workflowContract?.workflowId).toBe('create-page');
 expect(result.executionRecord).toMatchObject({source:'model',finishReason:'stop',continuationCount:1});
 expect(result.executionRecord?.completeHtml).toBeUndefined();
 expect(e.calls[0].messages.map(message=>message.content).join('\n')).toContain('DESIGN TASK CONTRACT');
});
test('transport failure after a prefix retains observed bytes and billed usage without another request',async()=>{
 let count=0;const core=new DefaultAIEngineCore({id:'failed',stream(_request,onEvent){count++;onEvent({type:'Delta',text:count===1?prefix:' world'});onEvent({type:'Usage',input_tokens:5,output_tokens:7});onEvent(count===1?{type:'Done',finish_reason:'length'}:{type:'Error',kind:'auth_failed',message:'denied'});return {abort(){},promise:Promise.resolve()};}});
 const result=await streamWithContinuation(core,options);expect(result.errorMessage).toContain('denied');expect(result.rawResponse).toBe(prefix+' world');expect(result.usage?.outputTokens).toBe(14);expect(count).toBe(2);
});
test('cancellation between requests stops before continuation',async()=>{
 const controller=new AbortController();const e=engine([[prefix,'length']]);
 const result=await streamWithContinuation(e.core,{...options,signal:controller.signal},{onText(){controller.abort();}});
 expect(result.errorMessage).toContain('取消');expect(e.calls).toHaveLength(1);expect(result.usage?.outputTokens).toBe(3);
});
test('continuation cannot remove protected original actions',async()=>{
 const original='<main class="container-max"><h1 data-nid="title001">Title</h1><button data-nid="button01" class="btn-primary">Save</button></main>';
 const e=engine([['<artifact><main class="container-max"><h1 data-nid="title001">New','length'],['</h1></main></artifact>','stop']]);
 const result=await PipelineExecutor.execute({input:{rawPrompt:'修改页面文案',activeScreenId:'s'},provider,model:'qwen-plus',engineCore:e.core,screens:{s:{id:'s',name:'Page',htmlContent:original}},deviceProfile:'pc',frameWidth:1440,baseSystemPrompt:'test'});
 expect(result.status).toBe('rejected_by_quality');expect(result.qualityReport?.findings.some(f=>f.code.includes('action'))).toBe(true);expect(result.changeSet).toBeUndefined();
 expect(result.workflowContract?.workflowId).toBe('edit-page-copy');
});
test('a recovered network failure during native continuation never triggers further recovery or a candidate',async()=>{
 const e=engine([[prefix,'length'],[' x','length'],[' y','length']]);const stream=e.core.streamText.bind(e.core);let count=0;e.core.streamText=o=>{const result=stream(o);count++;if(count===2)result.recoveryPromise=Promise.resolve('network disconnected');return result;};
 const result=await streamWithContinuation(e.core,options);expect(result.errorMessage).toContain('network disconnected');expect(e.calls).toHaveLength(2);
});
test('cancel returns promptly when transport and metadata never settle, ignores late callbacks',async()=>{
 const controller=new AbortController();let deliver!:(value:IteratorResult<string>)=>void;let aborts=0;const deltas:string[]=[];
 const never=new Promise<never>(()=>{});
 const core:AIEngineCore={streamText(){return {textStream:{[Symbol.asyncIterator](){let first=true;return {next(){if(first){first=false;return Promise.resolve({done:false as const,value:prefix});}return new Promise<IteratorResult<string>>(resolve=>{deliver=resolve;});}};}},reasoningStream:(async function*(){await never;})(),textPromise:never,reasoningPromise:never,usagePromise:Promise.resolve({inputTokens:5,outputTokens:7}),finishReasonPromise:never,recoveryPromise:never,abort(){aborts++;}};},async generateObject(){throw Error('unused');}};
 const pending=streamWithContinuation(core,{...options,signal:controller.signal},{onText:t=>deltas.push(t)});
 await new Promise(resolve=>setTimeout(resolve,5));controller.abort();
 const result=await Promise.race([pending,new Promise<never>((_,reject)=>setTimeout(()=>reject(Error('cancel hung')),100))]);
 expect(result.errorMessage).toContain('取消');expect(result.rawResponse).toBe(prefix);expect(result.usage).toEqual({inputTokens:5,outputTokens:7});expect(aborts).toBe(1);
 deliver({done:false,value:' late'});await new Promise(resolve=>setTimeout(resolve,5));expect(deltas.join('')).toBe(prefix);expect(result.rawResponse).toBe(prefix);
});
test('cancel also races metadata after text is already resolved',async()=>{
 const controller=new AbortController();const e=engine([[prefix,'length']]);const base=e.core.streamText.bind(e.core);e.core.streamText=o=>({...base(o),reasoningPromise:new Promise(()=>{}),usagePromise:new Promise(()=>{})});
 const pending=streamWithContinuation(e.core,{...options,signal:controller.signal});await new Promise(resolve=>setTimeout(resolve,5));controller.abort();
 const result=await Promise.race([pending,new Promise<never>((_,reject)=>setTimeout(()=>reject(Error('metadata hung')),100))]);expect(result.errorMessage).toContain('取消');expect(result.rawResponse).toBe(prefix);expect(e.calls).toHaveLength(1);
});
test('real core cancellation settles all promises and ignores late transport events',async()=>{
 for(const hasPrefix of [false,true]){
  const controller=new AbortController();let emit!:(ev:any)=>void;let finish!:()=>void;let aborts=0;
  const core=new DefaultAIEngineCore({id:'hung-native',stream(_request,onEvent){emit=onEvent;if(hasPrefix)onEvent({type:'Delta',text:prefix});return {abort(){aborts++;},promise:new Promise(resolve=>{finish=resolve;})};}});
  const stream=core.streamText({...options,signal:controller.signal});const outcome=stream.textPromise.then(()=> 'unexpected',error=>String(error));controller.abort();
  const result=await Promise.race([Promise.all([outcome,stream.reasoningPromise,stream.usagePromise,stream.finishReasonPromise,stream.recoveryPromise]),new Promise<never>((_,reject)=>setTimeout(()=>reject(Error('core abort hung')),100))]);
  expect(result[0]).toContain('取消');expect(aborts).toBe(1);emit({type:'Delta',text:'late'});emit({type:'Usage',input_tokens:100,output_tokens:200});finish();
  const chunks:string[]=[];for await(const chunk of stream.textStream)chunks.push(chunk);expect(chunks.join('')).toBe(hasPrefix?prefix:'');if(hasPrefix)expect((await stream.usagePromise)?.outputTokens).toBeGreaterThan(0);else expect(await stream.usagePromise).toBeUndefined();
 }
});
test('whitespace-prefixed restart is rejected by real pipeline without a candidate',async()=>{
 const e=engine([['<main><p>Hello</p>','length'],['\n<main><p>Hello</p></main></main>','stop']]);const result=await PipelineExecutor.execute({input:{rawPrompt:'创建页面'},provider,model:'qwen-plus',engineCore:e.core,screens:{},deviceProfile:'pc',frameWidth:1440,baseSystemPrompt:'test'});
 expect(result.status).toBe('error');expect(result.errorMessage).toContain('重复');expect(result.changeSet).toBeUndefined();
});
test('failed continuation without Usage event includes per-request estimates',async()=>{
 let calls=0;const core=new DefaultAIEngineCore({id:'usage-missing',stream(_request,onEvent){calls++;onEvent({type:'Delta',text:calls===1?prefix:' world'});onEvent(calls===1?{type:'Done',finish_reason:'length'}:{type:'Error',kind:'network_error',message:'offline'});return {abort(){},promise:Promise.resolve()};}});
 const result=await streamWithContinuation(core,options);expect(result.errorMessage).toContain('offline');expect(result.usage!.inputTokens).toBeGreaterThan(2);expect(result.usage!.outputTokens).toBeGreaterThan(Math.round(prefix.length/3.5));expect(calls).toBe(2);
});
test('core abort estimates already observed fragments even when usage settles during cancellation',async()=>{
 const controller=new AbortController();const core=new DefaultAIEngineCore({id:'cancel-usage',stream(_request,onEvent){onEvent({type:'Delta',text:prefix});return {abort(){},promise:new Promise(()=>{})};}});
 const result=await streamWithContinuation(core,{...options,signal:controller.signal},{onText(){controller.abort();}});expect(result.errorMessage).toContain('取消');expect(result.usage?.outputTokens).toBeGreaterThan(0);
});
