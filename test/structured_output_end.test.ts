import {afterEach,expect,test} from 'bun:test';
import {DefaultAIEngineCore} from '../src/services/ai/engine/core/aiEngineCore';
import {MockTransport} from '../src/services/ai/engine/transport/mockTransport';
import {SSEChunkParser} from '../src/services/ai/engine/transport/chunkParser';
import {AIServiceTransport} from '../src/services/ai/engine/transport/aiServiceTransport';
import {structuredOutputIssue} from '../src/services/ai/structuredOutput';
import {useUsageStore} from '../src/stores/useUsageStore';
import type {StreamEvent,AIProviderConfig} from '../src/types/provider';
const provider:AIProviderConfig={id:'structured-end',name:'fixture',protocol:'openai_compatible',baseUrl:'https://fixture.invalid/v1',apiKey:'',isEnabled:true};
const options={provider,model:'fixture',messages:[{role:'user' as const,content:'Return JSON'}]};
const schema={type:'object',properties:{ok:{type:'boolean'}}};
const originalFetch=globalThis.fetch,usage=useUsageStore.getState();
afterEach(()=>{globalThis.fetch=originalFetch;useUsageStore.setState(usage,true);});
for(const reason of ['stop','STOP','end_turn','stop_sequence','eos_token',undefined])test(`normal ${reason??'missing metadata'} structured ending remains compatible`,async()=>{
 const events:StreamEvent[]=[{type:'Delta',text:'```json\n{"ok":true}\n```'}];if(reason)events.push({type:'Done',finish_reason:reason});
 const core=new DefaultAIEngineCore(new MockTransport([{events,delayMs:1}]));
 expect(await core.generateObject(schema,options)).toEqual({ok:true});
});
for(const reason of ['length','max_tokens','MAX_TOKENS','max_output_tokens','max-completion-tokens','content_filter','SAFETY','RECITATION','tool_calls','tool_use','unexpected_end'])test(`valid closed JSON with ${reason} is rejected before use`,async()=>{
 const core=new DefaultAIEngineCore(new MockTransport([{events:[{type:'Delta',text:'{"ok":true}'},{type:'Done',finish_reason:reason}],delayMs:1}]));
 await expect(core.generateObject(schema,options)).rejects.toThrow('结构化输出');
});
test('a later normal stop/end_turn cannot overwrite a limit or filter reason',async()=>{
 const events:StreamEvent[]=[{type:'Delta',text:'{"ok":true}'},{type:'Done',finish_reason:'max_tokens'},{type:'Done',finish_reason:'STOP'},{type:'Done',finish_reason:'end_turn'}];
 const core=new DefaultAIEngineCore({id:'multi-end',stream(_request,onEvent){events.forEach(onEvent);return {abort(){},promise:Promise.resolve()};}});
 await expect(core.generateObject(schema,options)).rejects.toThrow('输出上限');
});
test('network recovery of a closed artifact inside JSON cannot count as normal object completion',async()=>{
 const core=new DefaultAIEngineCore(new MockTransport([{events:[{type:'Delta',text:'{"html":"<artifact>complete</artifact>"}'},{type:'Error',kind:'network_error',message:'offline'}],delayMs:1}]));
 await expect(core.generateObject(schema,options)).rejects.toThrow('连接中断');
});
test('broken JSON with normal ending still fails rather than being completed by parser recovery',async()=>{
 const core=new DefaultAIEngineCore(new MockTransport([{events:[{type:'Delta',text:'{"ok":'},{type:'Done',finish_reason:'stop'}],delayMs:1}]));
 await expect(core.generateObject(schema,options)).rejects.toThrow();
});
for(const phase of ['text','metadata'] as const)test(`abort while waiting for ${phase} does not hang with a non-cooperating stream`,async()=>{
 const core=new DefaultAIEngineCore(new MockTransport()),controller=new AbortController();let release!:(value:string)=>void,aborts=0;
 const pending=new Promise<string>(resolve=>release=resolve);
 core.streamText=()=>({textStream:(async function*(){})(),reasoningStream:(async function*(){})(),textPromise:phase==='text'?pending:Promise.resolve('{"ok":true}'),reasoningPromise:Promise.resolve(undefined),usagePromise:Promise.resolve(undefined),finishReasonPromise:phase==='metadata'?pending:Promise.resolve('stop'),abort(){aborts++;}});
 const result=core.generateObject(schema,{...options,signal:controller.signal});controller.abort();
 await expect(Promise.race([result,new Promise((_,reject)=>setTimeout(()=>reject(Error('hang')),100))])).rejects.toThrow('取消');
 release(phase==='text'?'{"ok":true}':'stop');expect(aborts).toBe(1);
});
test('failure of optional metadata rejects safely even if the text never finishes',async()=>{
 const core=new DefaultAIEngineCore(new MockTransport());
 core.streamText=()=>({textStream:(async function*(){})(),reasoningStream:(async function*(){})(),textPromise:new Promise<string>(()=>{}),reasoningPromise:Promise.resolve(undefined),usagePromise:Promise.resolve(undefined),finishReasonPromise:Promise.reject(Error('metadata failed')),abort(){}});
 await expect(core.generateObject(schema,options)).rejects.toThrow('metadata failed');
 expect(structuredOutputIssue(1 as unknown as string)).toContain('无效');
});
const wires:{protocol:AIProviderConfig['protocol'];text:string;reason:string}[]=[
 {protocol:'openai_compatible',reason:'length',text:'data: '+JSON.stringify({choices:[{delta:{content:'{"ok":true}'},finish_reason:'length'}]})+'\n\ndata: [DONE]\n\n'},
 {protocol:'anthropic',reason:'max_tokens',text:'event: content_block_delta\ndata: '+JSON.stringify({type:'content_block_delta',delta:{type:'text_delta',text:'{"ok":true}'}})+'\n\nevent: message_delta\ndata: '+JSON.stringify({type:'message_delta',delta:{stop_reason:'max_tokens'}})+'\n\nevent: message_stop\ndata: {"type":"message_stop"}\n\n'},
 {protocol:'ollama_native',reason:'length',text:'{"message":{"content":"{\\"ok\\":true}"}}\n{"done":true,"done_reason":"length"}\n'},
 {protocol:'gemini',reason:'MAX_TOKENS',text:'data: '+JSON.stringify({candidates:[{content:{parts:[{text:'{"ok":true}'}]},finishReason:'MAX_TOKENS'}]})+'\n\n'},
];
for(const wire of wires)test(`${wire.protocol} preserves its finish status in both SSE fallback and actual AIService transport`,async()=>{
 const events:StreamEvent[]=[],parser=new SSEChunkParser(e=>events.push(e));
 for(let i=0;i<wire.text.length;i+=7)parser.feed(wire.text.slice(i,i+7));parser.finish();
 expect(events.some(e=>e.type==='Done'&&e.finish_reason===wire.reason)).toBe(true);
 let requests=0;globalThis.fetch=(async()=>{requests++;return new Response(new ReadableStream({start(controller){for(let i=0;i<wire.text.length;i+=11)controller.enqueue(new TextEncoder().encode(wire.text.slice(i,i+11)));controller.close();}}),{status:200});}) as typeof fetch;
 const core=new DefaultAIEngineCore(new AIServiceTransport());
 await expect(core.generateObject(schema,{...options,provider:{...provider,protocol:wire.protocol}})).rejects.toThrow('输出上限');
 expect(requests).toBe(1);
});
