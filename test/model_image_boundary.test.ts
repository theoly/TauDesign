import {test,expect} from 'bun:test';
import {AIService} from '../src/services/ai/aiService';
import {AIServiceTransport} from '../src/services/ai/engine/transport/aiServiceTransport';
import {encodeModelRequest} from '../src/services/ai/modelRequestCodec';
import {endpointIdentity} from '../src/services/ai/modelCapabilities';
import {supportsVision} from '../src/services/ai/engine/core/multimodalGuard';
import type {AIProviderConfig,ProviderProtocol} from '../src/types/provider';

const image='data:image/png;base64,aW1hZ2U=';
const text='根据参考图设计资料页，保持项目风格。';
for(const protocol of ['openai_compatible','anthropic','gemini','ollama_native'] as ProviderProtocol[]) {
 test(`${protocol}: actual gateway and core keep image bytes only in the dedicated part`,async()=>{
  const provider:AIProviderConfig={id:'image-boundary-test',name:'test',protocol,baseUrl:'https://example.test/v1',isEnabled:true};
  const messages=[{role:'system' as const,content:'页面只引用独立资源文件。'},{role:'user' as const,content:text,imageUrl:image}];
  const original=globalThis.fetch,bodies:any[]=[];
  globalThis.fetch=(async(_url:any,init:any)=>{bodies.push(JSON.parse(init.body));return new Response(protocol==='ollama_native'?'{"message":{"content":"ok"},"done":true,"done_reason":"stop"}\n':'data: {"choices":[{"delta":{"content":"ok"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n');}) as typeof fetch;
  try {
   await AIService.stream(provider,'vision-test',messages,()=>{}).promise;
   await new AIServiceTransport().stream(encodeModelRequest({provider,model:'vision-test',messages}).transportRequest,()=>{}).promise;
   expect(bodies).toHaveLength(2);expect(bodies[0]).toEqual(bodies[1]);
   const body=bodies[0];
   if(protocol==='openai_compatible')expect(body.messages[1].content).toEqual([{type:'text',text},{type:'image_url',image_url:{url:image}}]);
   if(protocol==='anthropic')expect(body.messages[0].content).toEqual([{type:'text',text},{type:'image',source:{type:'base64',media_type:'image/png',data:'aW1hZ2U='}}]);
   if(protocol==='gemini')expect(body.contents[1].parts).toEqual([{text},{inlineData:{mimeType:'image/png',data:'aW1hZ2U='}}]);
   if(protocol==='ollama_native')expect(body.messages[1]).toEqual({role:'user',content:text,images:['aW1hZ2U=']});
   const promptTexts:string[]=[];
   const walk=(v:any)=>{if(!v||typeof v!=='object')return;for(const [key,value] of Object.entries(v)){if((key==='text'||key==='content'||key==='system')&&typeof value==='string')promptTexts.push(value);else walk(value);}};
   walk(body);expect(promptTexts).toContain(text);expect(promptTexts.every(t=>!t.includes('aW1hZ2U=')&&!t.includes('data:image/'))).toBe(true);
   expect(messages[1].content).toBe(text);
  }finally{globalThis.fetch=original;}
 });
}
test('image capability overrides heuristics; incompatible inputs are rejected before transport',()=>{
 const provider:AIProviderConfig={id:'custom',name:'test',protocol:'openai_compatible',baseUrl:'https://example.test',isEnabled:true};
 provider.modelCapabilities={model:{version:1,revision:'1',source:'user',endpointIdentity:endpointIdentity(provider),mediaInput:'unsupported'}};
 expect(supportsVision(provider,'model')).toBe(false);
 expect(()=>encodeModelRequest({provider,model:'model',messages:[{role:'user',content:text,imageUrl:image}]})).toThrow('不支持图片');
 provider.modelCapabilities.model.mediaInput='native-part';expect(supportsVision(provider,'model')).toBe(true);
 for(const url of ['blob:temp','data:image/png;base64,NOT!BASE64','data:image/svg+xml;base64,PHN2Zz4='])expect(()=>encodeModelRequest({provider,model:'model',messages:[{role:'user',content:text,imageUrl:url}]})).toThrow();
 for(const protocol of ['gemini','ollama_native'] as ProviderProtocol[])expect(()=>encodeModelRequest({provider:{...provider,protocol,modelCapabilities:undefined},model:'m',messages:[{role:'user',content:text,imageUrl:'https://example.test/photo.png'}]})).toThrow('不自动下载');
});
