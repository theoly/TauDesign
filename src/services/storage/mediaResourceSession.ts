import {convertFileSrc,invoke,isTauri} from '@tauri-apps/api/core';
let workerReady:Promise<ServiceWorker>|undefined;
async function browserWorker():Promise<ServiceWorker>{
 if(!navigator.serviceWorker)throw Error('当前浏览器不支持独立媒体预览服务；没有回退为页面内嵌图片。');
 workerReady??=(async()=>{
  await navigator.serviceWorker.register('/media-resource-worker.js',{scope:'/'});await navigator.serviceWorker.ready;
  if(!navigator.serviceWorker.controller)await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>{navigator.serviceWorker.removeEventListener('controllerchange',changed);reject(Error('独立媒体服务未接管页面，请刷新后重试。'));},8000);const changed=()=>{if(navigator.serviceWorker.controller){clearTimeout(timer);navigator.serviceWorker.removeEventListener('controllerchange',changed);resolve();}};navigator.serviceWorker.addEventListener('controllerchange',changed);});
  return navigator.serviceWorker.controller!;
 })();try{return await workerReady;}catch(error){workerReady=undefined;throw error;}
}
async function send(worker:ServiceWorker,data:unknown,transfer:Transferable[]=[]){
 return new Promise<void>((resolve,reject)=>{const channel=new MessageChannel(),timer=setTimeout(()=>{channel.port1.close();reject(Error('独立媒体服务超时。'));},10000);channel.port1.onmessage=e=>{clearTimeout(timer);channel.port1.close();e.data?.ok?resolve():reject(Error(e.data?.error??'媒体服务失败'));};worker.postMessage(data,[channel.port2,...transfer]);});
}
function newMediaResourceSession(){
 const tokens:string[]=[],pending=new Map<string,Promise<string>>();let closed=false;
 const native=isTauri();
 const register=async(base64:string,mime:string)=>{
  if(closed)throw Error('媒体预览会话已关闭。');const token=crypto.randomUUID();
  if(native){await invoke('register_media_resource',{token,mime,base64Data:base64});tokens.push(token);if(closed){await invoke('release_media_resources',{tokens:[token]});throw Error('媒体预览会话已关闭。');}return convertFileSrc(token,'aidesign-media');}
  const worker=await browserWorker(),bytes=Uint8Array.from(atob(base64),c=>c.charCodeAt(0));
  await send(worker,{type:'register',paths:['/__aidesign_media/'+token],mime,bytes:bytes.buffer},[bytes.buffer]);tokens.push(token);
  if(closed){await send(worker,{type:'release',paths:['/__aidesign_media/'+token]});throw Error('媒体预览会话已关闭。');}
  return new URL('/__aidesign_media/'+token,location.origin).href;
 };
 return {url(path:string,base64:string,mime:string):Promise<string>{let value=pending.get(path);if(!value){value=register(base64,mime);pending.set(path,value);}return value;},
 async close(){closed=true;await Promise.allSettled(pending.values());if(!tokens.length)return;if(native)await invoke('release_media_resources',{tokens});else await send(await browserWorker(),{type:'release',paths:tokens.map(t=>'/__aidesign_media/'+t)});tokens.length=0;}};
}
/** Platform boundary; UI tests replace the transport, never the page/media separation policy. */
export const MediaResourceSessions={create:newMediaResourceSession};
export function createMediaResourceSession(){return MediaResourceSessions.create();}
