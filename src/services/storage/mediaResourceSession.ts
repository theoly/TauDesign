import {convertFileSrc,invoke,isTauri} from '@tauri-apps/api/core';
import {createMediaDiagnostic,type MediaDiagnosticContext} from './mediaDiagnostics';
type Diagnostic=ReturnType<typeof createMediaDiagnostic>;

/** Only transport failures may be retried; rejected bytes/permissions remain hard errors. */
class MediaTransportError extends Error {}
const workerWaitMs=8000,messageWaitMs=10000;
let workerReady:Promise<void>|undefined;
let workerContainer:ServiceWorkerContainer|undefined;
const transportError=(error:unknown)=>error instanceof MediaTransportError||error instanceof Error&&['TypeError','NetworkError','AbortError','InvalidStateError'].includes(error.name);
const errorCategory=(error:unknown)=>transportError(error)?'transport' as const:error instanceof Error&&['SecurityError','NotAllowedError'].includes(error.name)?'permission' as const:'unknown' as const;
function bounded<T>(operation:Promise<T>,ms:number,message:string):Promise<T>{
 return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new MediaTransportError(message)),ms);operation.then(value=>{clearTimeout(timer);resolve(value);},error=>{clearTimeout(timer);reject(error);});});
}
async function browserWorker(diagnostic:Diagnostic,attempt:number):Promise<ServiceWorker>{
 if(!navigator.serviceWorker)throw Error('当前浏览器不支持独立媒体预览服务；没有回退为页面内嵌图片。');
 const container=navigator.serviceWorker;
 if(workerContainer!==container){workerContainer=container;workerReady=undefined;}
 const pending=workerReady??=(async()=>{
  diagnostic('worker-start','started',{attempt});
  try{await bounded(container.register('/media-resource-worker.js',{scope:'/'}).then(()=>container.ready),workerWaitMs,'独立媒体服务启动超时，请重试。');diagnostic('worker-start','completed',{attempt});}
  catch(error){diagnostic('worker-start','failed',{attempt,error,category:errorCategory(error)});if(transportError(error))throw new MediaTransportError('独立媒体服务暂时无法启动，请重试。');throw error;}
  if(!container.controller||container.controller.state==='redundant')await new Promise<void>((resolve,reject)=>{
   const done=(error?:Error)=>{clearTimeout(timer);container.removeEventListener('controllerchange',changed);error?reject(error):resolve();};
   const changed=()=>{if(container.controller&&container.controller.state!=='redundant')done();};
   const timer=setTimeout(()=>done(new MediaTransportError('独立媒体服务未接管页面，请重试。')),workerWaitMs);
   container.addEventListener('controllerchange',changed);changed();
  });
 })();
 try{
  await pending;
  // A resolved readiness promise is not ownership of a controller: navigation or
  // an update may replace it. Every registration uses the current controller.
  const worker=container.controller;
  if(!worker||worker.state==='redundant')throw new MediaTransportError('独立媒体服务连接已失效，请重试。');
  diagnostic('worker-control','completed',{attempt,controllerState:worker.state});return worker;
 }catch(error){diagnostic('worker-control','failed',{attempt,error,category:errorCategory(error),controllerState:container.controller?.state??'missing'});if(workerReady===pending)workerReady=undefined;throw error;}
}
async function send(worker:ServiceWorker,data:unknown,transfer:Transferable[]=[],diagnostic?:Diagnostic,stage:'register'|'release'='register',attempt=1){
 return new Promise<void>((resolve,reject)=>{
  diagnostic?.(stage,'started',{attempt,workerState:worker.state});
  const channel=new MessageChannel();
  const finish=(error?:unknown,category:'transport'|'rejected'='transport')=>{clearTimeout(timer);channel.port1.close();diagnostic?.(stage,error?'failed':'completed',{attempt,error,category:error?category:undefined,workerState:worker.state});error?reject(error):resolve();};
  const timer=setTimeout(()=>finish(new MediaTransportError('独立媒体服务超时，请重试。')),messageWaitMs);
  channel.port1.onmessage=e=>finish(e.data?.ok?undefined:Error(e.data?.error??'媒体服务拒绝了资源。'),'rejected');
  channel.port1.onmessageerror=()=>finish(new MediaTransportError('独立媒体服务响应无效，请重试。'));
  try{worker.postMessage(data,[channel.port2,...transfer]);}
  catch(error){channel.port2.close();finish(transportError(error)?new MediaTransportError('独立媒体服务连接已失效，请重试。'):error);}
 });
}
function newMediaResourceSession(context:MediaDiagnosticContext={}){
 const diagnostic=createMediaDiagnostic({...context,scope:'transport'});
 const leases=new Map<string,ServiceWorker|undefined>(),pending=new Map<string,Promise<string>>();let closed=false,closing:Promise<void>|undefined;
 const native=isTauri();
 diagnostic('session','started',{native});
 const checkOpen=()=>{if(closed)throw Error('媒体预览会话已关闭。');};
 const release=async(token:string)=>{
  if(!leases.has(token))return;const worker=leases.get(token);
  if(native){diagnostic('release','started',{native});try{await invoke('release_media_resources',{tokens:[token]});diagnostic('release','completed',{native});}catch(error){diagnostic('release','failed',{native,error,category:'unknown'});throw error;}}
  else if(worker){
   const message={type:'release',paths:['/__aidesign_media/'+token]};
   try{await send(worker,message,[],diagnostic,'release');}catch(error){
    const current=navigator.serviceWorker?.controller;
    // Updated workers share the cache. Its owner check still limits release to
    // this document; do not register/start a new worker merely for cleanup.
    if(!(error instanceof MediaTransportError)||!current||current===worker||current.state==='redundant')throw error;
    await send(current,message,[],diagnostic,'release');
   }
  }
  leases.delete(token);
 };
 const register=async(base64:string,mime:string)=>{
  for(let attempt=0;attempt<2;attempt++){
   checkOpen();const token=crypto.randomUUID();let worker:ServiceWorker|undefined;
   try{
    if(native){diagnostic('register','started',{attempt:attempt+1,native});leases.set(token,undefined);await invoke('register_media_resource',{token,mime,base64Data:base64});diagnostic('register','completed',{attempt:attempt+1,native});}
    else{
     worker=await browserWorker(diagnostic,attempt+1);checkOpen();
     const bytes=Uint8Array.from(atob(base64),c=>c.charCodeAt(0));
     // Track before sending: a lost acknowledgement may still have stored bytes.
     leases.set(token,worker);
     await send(worker,{type:'register',paths:['/__aidesign_media/'+token],mime,bytes:bytes.buffer},[bytes.buffer],diagnostic,'register',attempt+1);
    }
    checkOpen();return native?convertFileSrc(token,'aidesign-media'):new URL('/__aidesign_media/'+token,location.origin).href;
   }catch(error){
    if(closed)diagnostic('register','canceled',{attempt:attempt+1,native});
    if(native)diagnostic('register','failed',{attempt:attempt+1,native,error,category:'unknown'});
    // Messages to one worker are ordered; release also removes a registration
    // whose acknowledgement arrived late. Cleanup remains document-owned and
    // never introduces an inline fallback URL.
    await release(token).catch(()=>{});
    if(closed||native||!(error instanceof MediaTransportError)||attempt===1)throw error;
    diagnostic('retry','retrying',{attempt:attempt+2,category:'transport'});
    workerReady=undefined;
   }
  }
  throw Error('独立媒体服务不可用。');
 };
 return {url(path:string,base64:string,mime:string):Promise<string>{
  if(closed)return Promise.reject(Error('媒体预览会话已关闭。'));
  let value=pending.get(path);if(!value){value=register(base64,mime);pending.set(path,value);const registered=value;void value.catch(()=>{if(pending.get(path)===registered)pending.delete(path);});}return value;
 },close(){
  if(closing)return closing;closed=true;
  diagnostic('close','started',{native});
  return closing=(async()=>{await Promise.allSettled(pending.values());const results=await Promise.allSettled([...leases.keys()].map(release));const failed=results.find(row=>row.status==='rejected');if(failed?.status==='rejected'){diagnostic('close','failed',{native,error:failed.reason,category:'unknown'});throw failed.reason;}diagnostic('close','completed',{native});})();
 }};
}
/** Platform boundary; UI tests replace the transport, never the page/media separation policy. */
export const MediaResourceSessions={create:newMediaResourceSession};
export function createMediaResourceSession(context?:MediaDiagnosticContext){return MediaResourceSessions.create(context);}
