/* Independent same-origin media bytes for browser iframe previews, never data/blob URLs. */
const CACHE='taudesign-preview-media-v1',PREFIX='/__aidesign_media/';
let mutations=Promise.resolve();
const mimes=new Set(['image/png','image/jpeg','image/gif','image/webp','image/avif','image/bmp','image/svg+xml','image/x-icon','font/woff','font/woff2','font/ttf','font/otf','audio/mpeg','audio/ogg','audio/wav','video/mp4','video/webm','text/vtt']);
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('message',event=>{
 const reply=value=>event.ports[0]?.postMessage(value),d=event.data;
 if(!d||!Array.isArray(d.paths))return;
 const run=mutations.catch(()=>{}).then(async()=>{
  const cache=await caches.open(CACHE);
  const owner=event.source?.id;if(!owner)throw Error('Missing media session owner');
  const clients=new Set((await self.clients.matchAll({type:'window',includeUncontrolled:true})).map(client=>client.id));
  for(const key of await cache.keys()){const existing=await cache.match(key);if(!clients.has(existing?.headers.get('X-TauDesign-Owner')))await cache.delete(key);}

  if(d.paths.length>4096||d.paths.some(p=>typeof p!=='string'||!/^\/__aidesign_media\/[a-f0-9-]{36}$/.test(p)))throw Error('Invalid media paths');
  if(d.type==='release'){
   for(const path of d.paths){const existing=await cache.match(path);if(existing&&existing.headers.get('X-TauDesign-Owner')!==owner)throw Error('Cannot release another media owner');}
   await Promise.all(d.paths.map(p=>cache.delete(p)));reply({ok:true});return;
  }
  if(d.type!=='register'||d.paths.length!==1||!(d.bytes instanceof ArrayBuffer)||!d.bytes.byteLength||d.bytes.byteLength>32*1024*1024||!mimes.has(d.mime))throw Error('Invalid media bytes');
  if(await cache.match(d.paths[0]))throw Error('Media resources are immutable');
  const keys=await cache.keys();let total=d.bytes.byteLength;
  for(const key of keys){const r=await cache.match(key);total+=Number(r?.headers.get('content-length')||0);}
  if(keys.length>=4096||total>128*1024*1024)throw Error('Media cache quota exceeded');
  await cache.put(d.paths[0],new Response(d.bytes,{headers:{'X-TauDesign-Owner':owner,'Content-Type':d.mime,'Content-Length':String(d.bytes.byteLength),'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'"}}));reply({ok:true});
 });mutations=run;event.waitUntil(run.catch(error=>reply({ok:false,error:String(error)})));
});
self.addEventListener('fetch',event=>{const u=new URL(event.request.url);if(u.origin===self.location.origin&&u.pathname.startsWith(PREFIX))event.respondWith((async()=>{
 if(!['GET','HEAD'].includes(event.request.method))return new Response(null,{status:405,headers:{Allow:'GET, HEAD'}});
 const r=await(await caches.open(CACHE)).match(u.pathname);if(!r)return new Response('Media resource unavailable',{status:404});
 const headers=new Headers(r.headers);headers.set('Accept-Ranges','bytes');headers.delete('X-TauDesign-Owner');const total=Number(headers.get('Content-Length'));
 const raw=event.request.headers.get('Range');let start=0,end=total-1,status=200;
 if(raw){const match=/^bytes=(\d*)-(\d*)$/.exec(raw);let valid=Boolean(match&&(match[1]||match[2]));
  if(valid){const a=match[1]?Number(match[1]):undefined,b=match[2]?Number(match[2]):undefined;valid=(a===undefined||Number.isSafeInteger(a))&&(b===undefined||Number.isSafeInteger(b));
   if(a===undefined){valid=valid&&b>0;start=Math.max(0,total-b);}else{start=a;end=b===undefined?total-1:Math.min(b,total-1);}valid=valid&&start<total&&end>=start;
  }
  if(!valid){headers.set('Content-Range','bytes */'+total);headers.set('Content-Length','0');return new Response(null,{status:416,headers});}
  status=206;headers.set('Content-Range',`bytes ${start}-${end}/${total}`);headers.set('Content-Length',String(end-start+1));
 }
 const body=event.request.method==='HEAD'?null:status===206?(await r.arrayBuffer()).slice(start,end+1):r.body;
 return new Response(body,{status,headers});
})());});
