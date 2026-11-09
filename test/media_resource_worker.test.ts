import {test,expect} from 'bun:test';
function environment(source:string){
 const handlers=new Map<string,(event:any)=>void>(),items=new Map<string,Response>(),owners=new Set(['client-a','client-b']);
 const url=(p:any)=>typeof p==='string'?new URL(p,'https://example.test').href:p.url;
 const cache={async keys(){return [...items.keys()].map(p=>new Request(p));},async match(p:any){return items.get(url(p))?.clone();},async delete(p:any){return items.delete(url(p));},async put(p:any,response:Response){items.set(url(p),response.clone());}};
 const self={location:{origin:'https://example.test'},clients:{async claim(){},async matchAll(){return [...owners].map(id=>({id}));}},skipWaiting(){},addEventListener(type:string,handler:(event:any)=>void){handlers.set(type,handler);}};
 new Function('self','caches','Response',source)(self,{async open(){return cache;}},Response);
 const message=async(data:any,owner='client-a')=>{let waiting!:Promise<void>,reply:any;handlers.get('message')!({data,source:{id:owner},ports:[{postMessage(value:any){reply=value;}}],waitUntil(p:Promise<void>){waiting=p;}});await waiting;return reply;};
 return {items,owners,message,async fetch(path:string,init?:RequestInit){let response!:Promise<Response>;handlers.get('fetch')!({request:new Request('https://example.test'+path,init),respondWith(p:Promise<Response>){response=p;}});return response;}};
}
const path='/__aidesign_media/11111111-1111-4111-a111-111111111111';
test('independent media worker serves immutable bytes and reclaims closed owners without touching live sessions',async()=>{
 const env=environment(await Bun.file(new URL('../public/media-resource-worker.js',import.meta.url)).text());
 const data={type:'register',paths:[path],mime:'image/png',bytes:new TextEncoder().encode('image-bytes').buffer};
 expect(await env.message(data)).toEqual({ok:true});const response=await env.fetch(path);
 expect(response.status).toBe(200);expect(await response.text()).toBe('image-bytes');expect(response.headers.get('content-type')).toBe('image/png');expect(response.headers.get('content-security-policy')).toContain("default-src 'none'");
 expect((await env.message(data)).error).toContain('immutable');
 expect((await env.message({...data,paths:[path.replace('11111111','22222222')],mime:'text/html'})).ok).toBe(false);
 env.owners.delete('client-a');await env.message({type:'register',paths:[path.replace('11111111','33333333')],mime:'image/png',bytes:new TextEncoder().encode('other').buffer},'client-b');
 expect((await env.fetch(path)).status).toBe(404);expect(env.items.size).toBe(1);
});
test('concurrent registration cannot replace another task resource or bypass serialized mutation checks',async()=>{
 const env=environment(await Bun.file(new URL('../public/media-resource-worker.js',import.meta.url)).text());
 const replies=await Promise.all(Array.from({length:6},()=>env.message({type:'register',paths:[path],mime:'image/png',bytes:new Uint8Array([1]).buffer})));
 expect(replies.filter(r=>r.ok)).toHaveLength(1);expect(env.items.size).toBe(1);
 await env.message({type:'release',paths:[path]});expect((await env.fetch(path)).status).toBe(404);
});
test('video ranges, HEAD and release ownership agree with immutable native media semantics',async()=>{
 const env=environment(await Bun.file(new URL('../public/media-resource-worker.js',import.meta.url)).text());
 await env.message({type:'register',paths:[path],mime:'video/mp4',bytes:new TextEncoder().encode('0123456789').buffer});
 for(const [range,expected] of [['bytes=2-4','234'],['bytes=-3','789'],['bytes=8-','89'],['bytes=8-999','89']]){
  const response=await env.fetch(path,{headers:{Range:range}});expect(response.status).toBe(206);expect(await response.text()).toBe(expected);expect(response.headers.get('Content-Length')).toBe(String(expected.length));expect(response.headers.get('X-TauDesign-Owner')).toBeNull();
 }
 for(const range of ['bytes=10-','bytes=4-2','bytes=-0','bytes=1-2,4-5','bytes=999999999999999999999999999-'])expect((await env.fetch(path,{headers:{Range:range}})).status).toBe(416);
 const head=await env.fetch(path,{method:'HEAD'});expect(await head.text()).toBe('');expect(head.headers.get('Content-Length')).toBe('10');expect((await env.fetch(path,{method:'POST'})).status).toBe(405);
 expect((await env.message({type:'release',paths:[path]},'client-b')).ok).toBe(false);expect((await env.fetch(path)).status).toBe(200);
});
