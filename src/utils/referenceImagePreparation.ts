import type {ImageAttachment} from '../types/referenceImage';
import {base64ToUint8Array} from './md5';

export const REFERENCE_TRANSFORM_VERSION=1;
export async function sha256(bytes:Uint8Array):Promise<string>{
 return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new Uint8Array(bytes).buffer))].map(n=>n.toString(16).padStart(2,'0')).join('');
}
export function referenceBytes(dataUrl:string):{bytes:Uint8Array;mime:string;ext:string}{
 const match=/^data:(image\/(?:png|jpe?g|webp|gif));base64,([a-z0-9+/]+={0,2})$/i.exec(dataUrl);
 if(!match||dataUrl.length>32*1024*1024)throw Error('参考图格式无效或超过32MiB传输限制。');
 const bytes=base64ToUint8Array(match[2]);if(!bytes.length)throw Error('参考图片为空。');
 return {bytes,mime:match[1].toLowerCase(),ext:match[1].split('/')[1].replace('jpeg','jpg')};
}
/** Header-only allocation guard, before the browser decodes potentially enormous bitmaps. */
export function referenceDimensions(bytes:Uint8Array):{width:number;height:number}{
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let width=0,height=0;
 if(bytes.length>=24&&v.getUint32(0)===0x89504e47&&v.getUint32(4)===0x0d0a1a0a){width=v.getUint32(16);height=v.getUint32(20);}
 else if(bytes.length>=10&&String.fromCharCode(...bytes.slice(0,3))==='GIF'){width=v.getUint16(6,true);height=v.getUint16(8,true);}
 else if(bytes.length>=30&&String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP'){
  const tag=String.fromCharCode(...bytes.slice(12,16));
  if(tag==='VP8X'){width=1+bytes[24]+(bytes[25]<<8)+(bytes[26]<<16);height=1+bytes[27]+(bytes[28]<<8)+(bytes[29]<<16);}
  if(tag==='VP8 '&&bytes[23]===0x9d&&bytes[24]===0x01&&bytes[25]===0x2a){width=v.getUint16(26,true)&0x3fff;height=v.getUint16(28,true)&0x3fff;}
  if(tag==='VP8L'&&bytes[20]===0x2f){const bits=v.getUint32(21,true);width=1+(bits&0x3fff);height=1+((bits>>>14)&0x3fff);}
 }else if(bytes.length>4&&v.getUint16(0)===0xffd8){
  let i=2;while(i+4<=bytes.length){if(bytes[i++]!==0xff)break;while(bytes[i]===0xff)i++;const marker=bytes[i++];if(marker===0xd9||marker===0xda)break;if(marker===0x01||marker>=0xd0&&marker<=0xd7)continue;
   const n=v.getUint16(i);if(n<2||i+n>bytes.length)break;
   if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)&&n>=7){height=v.getUint16(i+3);width=v.getUint16(i+5);break;}i+=n;
  }
 }
 if(!width||!height||width>32768||height>32768||width*height>16_000_000)throw Error('参考图无法读取尺寸或超过1600万像素，请先裁剪参考区域。');
 return {width,height};
}
export interface PreparedReferencePart {dataUrl:string;sha256:string;mime:string;width:number;height:number;rect:{x:number;y:number;width:number;height:number};overview?:boolean}
export interface PreparedReferenceImage {version:1;sourceSha256:string;width:number;height:number;parts:PreparedReferencePart[]}
/** Original bytes never change. Text screenshots retain full resolution in <=3 bounded detail tiles. */
export async function prepareReferenceImage(source:ImageAttachment,signal?:AbortSignal):Promise<PreparedReferenceImage>{
 const guard=()=>{if(signal?.aborted)throw new DOMException('图片处理已取消','AbortError');};guard();
 const {bytes,mime}=referenceBytes(source.dataUrl);const header=referenceDimensions(bytes);if(Math.max(header.width,header.height)>3072&&(Math.ceil((Math.max(header.width,header.height)-64)/1984)>3||Math.min(header.width,header.height)>3072))throw Error('长图需要超过3个细节片段，请先选择本次参考区域；未缩小文字或遗漏剩余区域。');const sourceSha256=await sha256(bytes);guard();
 const image=new Image();
 await new Promise<void>((resolve,reject)=>{
  const clean=()=>{image.onload=null;image.onerror=null;signal?.removeEventListener('abort',abort);};
  const abort=()=>{clean();image.src='';reject(new DOMException('图片处理已取消','AbortError'));};
  image.onload=()=>{clean();resolve();};image.onerror=()=>{clean();reject(Error('参考图片解码失败。'));};signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted){abort();return;}image.src=source.dataUrl;
 });try{guard();
 const width=image.naturalWidth,height=image.naturalHeight;
 if(!width||!height||width*height>16_000_000)throw Error('参考图尺寸无效，请选择较小区域。');
 const parts:PreparedReferencePart[]=[];
 const append=async(dataUrl:string,w:number,h:number,rect:PreparedReferencePart['rect'],overview=false)=>{const data=referenceBytes(dataUrl);parts.push({dataUrl,sha256:await sha256(data.bytes),mime:data.mime,width:w,height:h,rect,...(overview?{overview:true}:{})});guard();};
 const draw=(rect:PreparedReferencePart['rect'],w:number,h:number,type:string)=>{const c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d');if(!ctx)throw Error('当前环境无法准备图片发送副本。');ctx.drawImage(image,rect.x,rect.y,rect.width,rect.height,0,0,w,h);const value=c.toDataURL(type,0.9);c.width=0;c.height=0;return value;};
 const rect={x:0,y:0,width,height};
 if(height>3072||width>3072){
  const horizontal=width>height,span=horizontal?width:height,tile=2048,overlap=64,count=Math.ceil((span-overlap)/(tile-overlap));
  if(count>3||(horizontal?height:width)>3072)throw Error('长图需要超过3个细节片段，请先选择本次参考区域；未缩小文字或遗漏剩余区域。');
  const ratio=Math.min(1,1024/Math.max(width,height));await append(draw(rect,Math.max(1,Math.round(width*ratio)),Math.max(1,Math.round(height*ratio)),'image/png'),Math.max(1,Math.round(width*ratio)),Math.max(1,Math.round(height*ratio)),rect,true);
  for(let i=0;i<count;i++){guard();const start=i*(tile-overlap),size=Math.min(tile,span-start),r=horizontal?{x:start,y:0,width:size,height}:{x:0,y:start,width,height:size};await append(draw(r,r.width,r.height,'image/png'),r.width,r.height,r);}
 }else{
  // Avoid lossy downscaling of text. Re-encoding large photographs strips metadata, only if smaller.
  let dataUrl=mime==='image/gif'?draw(rect,width,height,'image/png'):source.dataUrl;
  if((mime==='image/jpeg'||mime==='image/jpg')&&bytes.length>1024*1024){const candidate=draw(rect,width,height,'image/jpeg');if(referenceBytes(candidate).bytes.length<bytes.length)dataUrl=candidate;}
  await append(dataUrl,width,height,rect);
 }
 return {version:1,sourceSha256,width,height,parts};
 }finally{image.src='';}
}
