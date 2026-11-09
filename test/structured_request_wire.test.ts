import {test,expect,afterEach} from 'bun:test';
import {prepareModelRequest} from '../src/services/ai/engine/core/protocolAdapter';
import {AIServiceTransport} from '../src/services/ai/engine/transport/aiServiceTransport';
import {DefaultAIEngineCore} from '../src/services/ai/engine/core/aiEngineCore';
import type {ProviderProtocol} from '../src/types/provider';
import {artifactThinkingOptions} from '../src/services/ai/structuredRequestPolicy';
const original=globalThis.fetch;
afterEach(()=>{globalThis.fetch=original;});
const schema={type:'object',properties:{label:{type:'string'}},required:['label'],additionalProperties:false};
const provider=(protocol:ProviderProtocol,baseUrl='https://proxy.invalid/v1')=>({id:'synthetic-wire',name:'No network',protocol,baseUrl,apiKey:'synthetic-not-archived',isEnabled:true});
const messages=[{role:'system' as const,content:'Only return the given JSON Schema.'},{role:'user' as const,content:'静态合成需求'}];
function capture(){const bodies:any[]=[];globalThis.fetch=(async(_url,options)=>{bodies.push(JSON.parse(String(options?.body)));return new Response('',{status:200});}) as typeof fetch;return bodies;}
test('machine HTML can opt out of verified hybrid thinking while ordinary text remains unchanged',async()=>{
 const bodies=capture(),p=provider('openai_compatible','https://api.deepseek.com/v1');
 for(const opts of [artifactThinkingOptions(p,'deepseek-flash'),{}])await new AIServiceTransport().stream(prepareModelRequest({provider:p,model:'deepseek-flash',messages,maxTokens:4096,...opts}).transportRequest,()=>{}).promise;
 expect(bodies[0].thinking).toEqual({type:'disabled'});expect(bodies[0]).not.toHaveProperty('response_format');expect(bodies[1]).not.toHaveProperty('thinking');
 expect(artifactThinkingOptions(provider('openai_compatible'),'deepseek-flash')).toEqual({});
});
for(const protocol of ['openai_compatible','anthropic','gemini','ollama_native'] as const)test(`${protocol}: structured schema survives real AIService outbound serialization`,async()=>{
 const bodies=capture(),input=structuredClone(messages),request=prepareModelRequest({provider:provider(protocol),model:'synthetic',messages:input,jsonSchema:schema,maxTokens:3072,temperature:0});
 await new AIServiceTransport().stream(request.transportRequest,()=>{}).promise;expect(bodies).toHaveLength(1);
 const text=protocol==='anthropic'?bodies[0].system:protocol==='gemini'?bodies[0].contents[0].parts[0].text:bodies[0].messages[0].content;
 expect(text).toContain(JSON.stringify(schema));expect(input).toEqual(messages);
 expect(text.split('[TAUDESIGN_JSON_SCHEMA]').length-1).toBe(1);
 if(protocol==='openai_compatible')expect(bodies[0]).not.toHaveProperty('thinking');
 if(protocol==='gemini')expect(bodies[0].generationConfig).toMatchObject({maxOutputTokens:3072,responseMimeType:'application/json'});
 if(protocol==='ollama_native')expect(bodies[0].format).toBe('json');
});
for(const endpoint of ['https://api.deepseek.com.evil.invalid/v1','http://api.deepseek.com/v1','https://api.deepseek.com:444/v1','https://user@api.deepseek.com/v1','https://api.deepseek.com/v1?x=1','https://proxy.invalid/v1'])test(`vendor options do not escape the verified DeepSeek endpoint: ${endpoint}`,async()=>{
 const bodies=capture(),request=prepareModelRequest({provider:provider('openai_compatible',endpoint),model:'deepseek-flash',messages,jsonSchema:schema,maxTokens:3072});
 await new AIServiceTransport().stream(request.transportRequest,()=>{}).promise;expect(bodies[0]).not.toHaveProperty('thinking');expect(bodies[0]).not.toHaveProperty('response_format');expect(bodies[0].messages[0].content).toContain(JSON.stringify(schema));
});
test('unknown model on an official endpoint does not inherit a guessed thinking capability',async()=>{
 const bodies=capture(),request=prepareModelRequest({provider:provider('openai_compatible','https://api.deepseek.com/v1'),model:'unknown-model',messages,jsonSchema:schema,maxTokens:3072});
 await new AIServiceTransport().stream(request.transportRequest,()=>{}).promise;expect(bodies[0]).not.toHaveProperty('thinking');
});
test('official DeepSeek structured requests use JSON Object and bounded non-thinking without changing text requests',async()=>{
 const bodies=capture(),p=provider('openai_compatible','https://api.deepseek.com/v1');
 for(const jsonSchema of [schema,undefined])await new AIServiceTransport().stream(prepareModelRequest({provider:p,model:'deepseek-flash',messages,jsonSchema,maxTokens:3072}).transportRequest,()=>{}).promise;
 expect(bodies[0]).toMatchObject({response_format:{type:'json_object'},thinking:{type:'disabled'},max_tokens:3072});expect(bodies[1]).not.toHaveProperty('thinking');expect(bodies[1]).not.toHaveProperty('response_format');
});
test('actual default core/AIService path parses one schema-constrained JSON response with original budget',async()=>{
 let calls=0,body:any;globalThis.fetch=(async(_url,options)=>{calls++;body=JSON.parse(String(options?.body));return new Response('data: '+JSON.stringify({choices:[{delta:{content:'{"label":"保存"}'},finish_reason:'stop'}]})+'\n\ndata: [DONE]\n\n',{status:200});}) as typeof fetch;
 const value=await new DefaultAIEngineCore(new AIServiceTransport()).generateObject(schema,{provider:provider('openai_compatible','https://api.openai.com/v1'),model:'synthetic',messages,maxTokens:3072});
 expect(value).toEqual({label:'保存'});expect(calls).toBe(1);expect(body.max_tokens).toBe(3072);expect(body.response_format.json_schema.schema).toEqual(schema);
});
test('desktop Rust proxy receives schema and official JSON mode too',async()=>{
 const before=(window as any).__TAURI_INTERNALS__,tauri=(globalThis as any).isTauri;let body:any;
 (window as any).__TAURI_INTERNALS__={transformCallback:()=>1,unregisterCallback(){},invoke:(cmd:string,args:any)=>{if(cmd!=='proxy_stream_request')throw Error(cmd);body=JSON.parse(args.body);args.channel.onmessage({type:'Done'});return Promise.resolve();}};(globalThis as any).isTauri=true;
 try{const request=prepareModelRequest({provider:provider('openai_compatible','https://api.deepseek.com'),model:'deepseek-flash',messages,jsonSchema:schema,maxTokens:3072});await new AIServiceTransport().stream(request.transportRequest,()=>{}).promise;
 expect(body.messages[0].content).toContain(JSON.stringify(schema));expect(body.response_format.type).toBe('json_object');expect(body.thinking.type).toBe('disabled');}
 finally{(window as any).__TAURI_INTERNALS__=before;(globalThis as any).isTauri=tauri;}
});
