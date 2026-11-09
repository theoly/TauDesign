import {test,expect} from 'bun:test';
import {AIService} from '../src/services/ai/aiService';
import {AIServiceTransport} from '../src/services/ai/engine/transport/aiServiceTransport';
import {prepareModelRequest} from '../src/services/ai/engine/core/protocolAdapter';
import type {AIProviderConfig,ProviderProtocol} from '../src/types/provider';

const schema={type:'object',properties:{ok:{type:'boolean'}},required:['ok'],additionalProperties:false};
for(const protocol of ['openai_compatible','anthropic','gemini','ollama_native'] as ProviderProtocol[]){
 test(`actual ${protocol} wire body is identical for core and direct service; schema and cap survive`,async()=>{
  const provider:AIProviderConfig={id:'codec-test',name:'test',protocol,baseUrl:'https://example.test/v1',apiKey:'test-key',isEnabled:true};
  const messages=[{role:'system' as const,content:'Return the requested structure.'},{role:'user' as const,content:'test'}];
  const fetched:Array<{url:string;body:any}>=[];const original=globalThis.fetch;
  globalThis.fetch=(async(url:any,init:any)=>{fetched.push({url:String(url),body:JSON.parse(init.body)});return new Response(protocol==='ollama_native'?'{"message":{"content":"{}"},"done":true}\n':'data: {"choices":[{"delta":{"content":"{}"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n');}) as typeof fetch;
  try{
   await AIService.stream(provider,'test-model',messages,()=>{},undefined,{jsonSchema:schema,maxTokens:3072,temperature:0.1}).promise;
   await new AIServiceTransport().stream(prepareModelRequest({provider,model:'test-model',messages,jsonSchema:schema,maxTokens:3072,temperature:0.1}).transportRequest,()=>{}).promise;
   expect(fetched).toHaveLength(2);expect(fetched[0]).toEqual(fetched[1]);
   const b=fetched[0].body;expect(b.max_tokens??b.generationConfig?.maxOutputTokens??b.options?.num_predict).toBe(3072);
   if(protocol==='anthropic')expect(b.tools[0].input_schema).toEqual(schema);
   if(protocol==='gemini')expect(b.generationConfig.responseSchema).toEqual(schema);
   if(protocol==='openai_compatible')expect(b).not.toHaveProperty('response_format');
   expect(JSON.stringify(b)).toContain('Return the requested structure.');
  }finally{globalThis.fetch=original;}
 });
}
