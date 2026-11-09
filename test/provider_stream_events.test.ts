import {test,expect} from 'bun:test';
import {ProviderStreamParser} from '../src/services/ai/providerStreamParser';
import {DefaultAIEngineCore} from '../src/services/ai/engine/core/aiEngineCore';
import type {AIProviderConfig,StreamEvent} from '../src/types/provider';
const provider:AIProviderConfig={id:'stream',name:'test',protocol:'openai_compatible',baseUrl:'https://example.test/v1',apiKey:'',isEnabled:true};
test('arbitrary character boundaries, multiline SSE and usage after finish retain typed reasoning and limit',()=>{
 const events:StreamEvent[]=[];const parser=new ProviderStreamParser(provider,e=>events.push(e));
 const data=': heartbeat\r\n\r\ndata: {"choices":[{"delta":{"reasoning_content":"推理"}}]}\r\n\r\ndata: {"choices":\n'+'data: [{"delta":{"content":"正文 😀"},"finish_reason":"length"}]}\n\ndata: {"usage":{"prompt_tokens":11,"completion_tokens":22}}\n\ndata: [DONE]\n\n';
 for(const char of data)parser.feed(char);parser.finish();
 expect(events.filter(e=>e.type==='ReasoningDelta')).toEqual([{type:'ReasoningDelta',text:'推理'}]);
 expect(events.find(e=>e.type==='Delta')).toEqual({type:'Delta',text:'正文 😀'});
 expect(events.some(e=>e.type==='Error')).toBe(false);expect(events.find(e=>e.type==='Usage')).toMatchObject({input_tokens:11,output_tokens:22,source:'provider'});
});
test('typed text containing literal think tags is not deleted; transport EOF is unknown',async()=>{
 const core=new DefaultAIEngineCore({id:'typed',stream(_r,onEvent){onEvent({type:'RequestStarted',eventProtocol:'typed',requestId:'r',attemptId:'a',at:0});onEvent({type:'ReasoningDelta',text:'private reasoning'});onEvent({type:'Delta',text:'<div><think>literal content</think></div>'});onEvent({type:'TransportClosed',at:1});return {abort(){},promise:Promise.resolve()};}});
 const result=core.streamText({provider,model:'test',messages:[]});expect(await result.textPromise).toBe('<div><think>literal content</think></div>');expect(await result.reasoningPromise).toBe('private reasoning');expect(await result.finishReasonPromise).toBe('unknown');expect((await result.usagePromise)?.source).toBe('estimated');
});
test('invalid complete event is a failure, not silent EOF; Ollama tail JSON is processed',()=>{
 const events:StreamEvent[]=[];const parser=new ProviderStreamParser(provider,e=>events.push(e));parser.feed('data: {invalid}\n\n');parser.finish();expect(events[0].type).toBe('Error');expect(events.some(e=>e.type==='Done')).toBe(false);
 const native:StreamEvent[]=[];const p=new ProviderStreamParser({...provider,protocol:'ollama_native'},e=>native.push(e));p.feed('{"message":{"content":"ok"},"done":true,"done_reason":"length"}');p.finish();expect(native.at(-1)).toEqual({type:'Done',finish_reason:'length'});
});
test('Anthropic declared JSON tool is distinct from arbitrary tool calls',()=>{
 const run=(structured:boolean)=>{const events:StreamEvent[]=[];const parser=new ProviderStreamParser({...provider,protocol:'anthropic'},e=>events.push(e),structured);for(const d of [{type:'content_block_start',content_block:{type:'tool_use',name:'output_json'}},{type:'content_block_delta',delta:{type:'input_json_delta',partial_json:'{"ok":true}'}},{type:'message_delta',delta:{stop_reason:'tool_use'}}])parser.feed('data: '+JSON.stringify(d)+'\n\n');parser.finish();return events;};
 expect(run(true)).toContainEqual({type:'Delta',text:'{"ok":true}'});expect(run(true).at(-1)).toEqual({type:'Done',finish_reason:'stop'});expect(run(false).at(-1)).toEqual({type:'Done',finish_reason:'tool_use'});
});
