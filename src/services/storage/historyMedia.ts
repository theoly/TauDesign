import type {ProjectStorage} from './projectStorage';

const encoder=new TextEncoder();
const FILE_LIMIT=10*1024*1024,BATCH_LIMIT=30*1024*1024,STRING_LIMIT=4096;
type Resource={path:string;sha256:string;kind:'svg'|'base64'|'percent'|'utf8';prefix?:string;encoding?:'component'|'uri'|'literal';unpadded?:boolean};
type MediaString={path:(string|number)[];parts:(string|Resource)[]};
export interface HistoryMediaDocument {schemaVersion:2|3;projectId:string;savedAt:number;past:unknown[];future:unknown[];checkpoints:unknown[];mediaStrings:MediaString[]}
export class HistoryMediaError extends Error {}
const base64=(bytes:Uint8Array)=>{let text='';for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(text);};
const digest=async(bytes:Uint8Array)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes.buffer as ArrayBuffer)),b=>b.toString(16).padStart(2,'0')).join('');
const bytes=(value:string)=>Uint8Array.from(atob(value),c=>c.charCodeAt(0));

/** Read token boundaries without normalizing the original HTML: undo must be byte-for-byte. */
function svgEnd(text:string,start:number):number {
 let depth=0;
 for(let i=start;i<text.length;i++){
  if(text.startsWith('<!--',i)){const end=text.indexOf('-->',i+4);if(end<0)throw Error('历史SVG注释未闭合，无法无损归档。');i=end+2;continue;}
  if(text[i]!=='<')continue;
  let end=i+1,quote='';for(;end<text.length;end++){const c=text[end];if(quote){if(c===quote)quote='';}else if(c==='"'||c==="'")quote=c;else if(c==='>')break;}
  if(end===text.length)throw Error('历史SVG未闭合，无法无损归档。');
  const token=text.slice(i,end+1);
  if(/^<svg(?:\s|>|\/)/i.test(token)){depth++;if(/\/\s*>$/.test(token))depth--;}
  else if(/^<\/svg\s*>/i.test(token))depth--;
  if(depth===0)return end+1;i=end;
 }
 throw Error('历史SVG未闭合，无法无损归档。');
}
const mimeExtension:Record<string,string>={'image/png':'png','image/jpeg':'jpg','image/gif':'gif','image/webp':'webp','image/svg+xml':'svg','image/avif':'avif','image/x-icon':'ico','image/bmp':'bmp','audio/mpeg':'mp3','audio/ogg':'ogg','audio/wav':'wav','video/mp4':'mp4','video/webm':'webm','text/vtt':'vtt','font/woff':'woff','font/woff2':'woff2','font/ttf':'ttf','font/otf':'otf'};

/** Independent binary media + JSON references. No page or History state is modified. */
export async function prepareHistoryMedia(document:{projectId:string;savedAt:number;past:unknown[];future:unknown[];checkpoints:unknown[]},storage:ProjectStorage):Promise<string>{
 const copy=structuredClone(document),mediaStrings:MediaString[]=[],outputs=new Map<string,{data:string;bytes:number}>();let total=0;
 const resource=async(payload:Uint8Array,extension:string,kind:Resource['kind'],extra:Partial<Resource>={}):Promise<Resource>=>{
  if(!payload.byteLength||payload.byteLength>FILE_LIMIT)throw Error('历史媒体超过单文件10MiB限制或内容为空。');
  const sha256=await digest(payload),path=`assets/history/${sha256}.${extension}`;
  if(!outputs.has(path)){total+=payload.byteLength;if(total>BATCH_LIMIT||outputs.size>=4096)throw Error('历史媒体超过30MiB或4096文件归档限制。');outputs.set(path,{data:base64(payload),bytes:payload.byteLength});}
  return {path,sha256,kind,...extra};
 };
 const split=async(text:string):Promise<(string|Resource)[]|null>=>{
  const parts:(string|Resource)[]=[];let cursor=0;
  const beforePaths=new Set(outputs.keys()),beforeTotal=total;
  const opaque=async()=>{
   const payload=encoder.encode(text);if(new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(payload)!==text)throw Error('历史文本无法无损UTF-8归档。');
   for(const path of outputs.keys())if(!beforePaths.has(path))outputs.delete(path);total=beforeTotal;
   return [await resource(payload,'txt','utf8')];
  };
  // This scanner extracts media tokens only; it never rewrites page HTML or DOM.
  for(let i=0;i<text.length;i++){
   if(text[i]==='<'&&/^<svg(?:\s|>|\/)/i.test(text.slice(i,i+8))){
    let end:number;try{end=svgEnd(text,i);}catch{return opaque();}parts.push(text.slice(cursor,i),await resource(encoder.encode(text.slice(i,end)),'svg','svg'));i=end-1;cursor=end;
   }else if(text.slice(i,i+5).toLowerCase()==='data:'){
    const comma=text.indexOf(',',i+5);if(comma<0||comma-i>256)continue;
    const header=text.slice(i,comma+1),type=header.slice(5).split(/[;,]/)[0].toLowerCase(),extension=mimeExtension[type];
    if(!extension){if(type.includes('/'))throw Error('历史包含尚不支持的媒体类型，未内联写入归档。');continue;}
    const isBase64=/;base64,$/i.test(header),delimiter=['"',"'"].includes(text[i-1])?text[i-1]:undefined;let end=comma+1;
    while(end<text.length&&(isBase64?/[a-z0-9+/=]/i.test(text[end]):!/[\s<>)]/.test(text[end])&&(delimiter?text[end]!==delimiter:!/["']/.test(text[end]))))end++;
    const payload=text.slice(comma+1,end);let decoded:Uint8Array,extra:Partial<Resource>={prefix:header};
    try{
     if(!payload)throw Error();
     if(isBase64){decoded=bytes(payload);const normal=base64(decoded);if(payload!==normal&&payload!==normal.replace(/=+$/,''))throw Error();extra.unpadded=payload!==normal;}
     else {const value=decodeURIComponent(payload);decoded=encoder.encode(value);const encoding=encodeURIComponent(value)===payload?'component':encodeURI(value)===payload?'uri':value===payload?'literal':undefined;if(!encoding)throw Error();extra.encoding=encoding;}
    }catch{throw Error('历史媒体编码不是可精确还原的规范格式，请保留原工程并先处理该资源。');}
    parts.push(text.slice(cursor,i),await resource(decoded,extension,isBase64?'base64':'percent',extra));i=end-1;cursor=end;
   }
  }
  if(!parts.length)return null;parts.push(text.slice(cursor));return parts;
 };
 let nodes=0;
 const visit=async(value:unknown,path:(string|number)[],parent?:Record<string|number,unknown>,key?:string|number,depth=0):Promise<void>=>{
  if(++nodes>1000000||depth>100)throw Error('历史结构超过安全归档限制。');
  if(typeof value==='string'){
   const parts=await split(value);if(!parts)return;
   if(mediaStrings.length>=STRING_LIMIT||!parent||key===undefined)throw Error('历史媒体字符串超过归档限制。');
   mediaStrings.push({path,parts});parent[key]='';
  }else if(value&&typeof value==='object')for(const [childKey,child] of Object.entries(value)){
   if(['__proto__','constructor','prototype'].includes(childKey))throw Error('历史结构包含保留键。');
   const next=Array.isArray(value)?Number(childKey):childKey;await visit(child,[...path,next],value as Record<string|number,unknown>,next,depth+1);
  }
 };
 await visit(copy,[]);
 if(!mediaStrings.length)return JSON.stringify({schemaVersion:1,...copy});
 const schemaVersion=mediaStrings.some(item=>item.parts.some(part=>typeof part==='object'&&part.kind==='utf8'))?3:2;
 const encoded=JSON.stringify({schemaVersion,...copy,mediaStrings});
 // Persist all immutable files before publishing the History manifest. Never replace different bytes.
 for(const [path,file] of outputs){
  const existing=storage.readBinaryLimited?await storage.readBinaryLimited(path,FILE_LIMIT):await storage.readBinary(path);
  if(existing!==null&&existing!==file.data)throw Error('历史媒体内容寻址文件已被替换，归档未发布。');
  if(existing===null){await storage.ensureDir('assets/history');await storage.writeBinary(path,file.data);}
  const written=storage.readBinaryLimited?await storage.readBinaryLimited(path,FILE_LIMIT):await storage.readBinary(path);
  if(written!==file.data)throw Error('历史媒体文件写入不完整，归档未发布。');
 }
 return encoded;
}

/** Only the loaded in-memory undo stack is hydrated, never a generated page or stored JSON. */
export async function hydrateHistoryMedia(raw:string,projectId:string,storage:ProjectStorage):Promise<string>{
 const document=JSON.parse(raw) as HistoryMediaDocument;
 if(document.schemaVersion!==2&&document.schemaVersion!==3)return raw;
 if(document.projectId!==projectId)throw Error('历史媒体不属于当前工程。');
 if(!Array.isArray(document.mediaStrings)||document.mediaStrings.length>STRING_LIMIT)throw Error('历史媒体清单无效。');
 const files=new Map<string,Uint8Array>(),seen=new Set<string>();let total=0;
 for(const item of document.mediaStrings){
  if(!item||!Array.isArray(item.path)||item.path.length<2||item.path.length>100||!['past','future','checkpoints'].includes(String(item.path[0]))||!Array.isArray(item.parts)||item.parts.length>8192)throw Error('历史媒体字符串路径无效。');
  const identity=JSON.stringify(item.path);if(seen.has(identity))throw Error('历史媒体字符串路径重复。');seen.add(identity);
  let parent:unknown=document;
  for(const key of item.path.slice(0,-1)){
   if((typeof key!=='string'&&typeof key!=='number')||['__proto__','constructor','prototype'].includes(String(key))||!parent||typeof parent!=='object'||!Object.hasOwn(parent,key))throw Error('历史媒体字符串路径不存在。');
   parent=(parent as Record<string|number,unknown>)[key];
  }
  const last=item.path.at(-1)!;
  if(['__proto__','constructor','prototype'].includes(String(last))||!parent||typeof parent!=='object'||!Object.hasOwn(parent,last)||(parent as Record<string|number,unknown>)[last]!=='')throw Error('历史媒体目标不是待恢复字符串。');
  let value='';
  for(const part of item.parts){
   if(typeof part==='string'){value+=part;continue;}
   if(!part||typeof part.path!=='string'||!/^assets\/history\/([a-f0-9]{64})\.(?:png|jpg|gif|webp|svg|avif|ico|bmp|mp3|ogg|wav|mp4|webm|vtt|woff2?|ttf|otf|txt)$/.test(part.path)||part.path.split('/').at(-1)!.split('.')[0]!==part.sha256||!['svg','base64','percent','utf8'].includes(part.kind))throw Error('历史媒体文件身份无效。');
   if(part.kind==='utf8'?(document.schemaVersion!==3||!part.path.endsWith('.txt')||Object.keys(part).sort().join(',')!=='kind,path,sha256'):part.path.endsWith('.txt'))throw Error('历史文本描述与格式版本不匹配。');
   let payload=files.get(part.path);
   if(!payload){const data=storage.readBinaryLimited?await storage.readBinaryLimited(part.path,FILE_LIMIT):await storage.readBinary(part.path);if(data===null)throw Error('历史媒体文件缺失。');payload=bytes(data);total+=payload.byteLength;if(payload.length>FILE_LIMIT||total>BATCH_LIMIT||await digest(payload)!==part.sha256)throw Error('历史媒体超额或字节已变化。');files.set(part.path,payload);}
   if(part.kind==='svg'||part.kind==='utf8')value+=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(payload);
   else{
    if(typeof part.prefix!=='string'||part.prefix.length>256||!/^data:[a-z0-9.+/-]+(?:;[a-z0-9=.+-]+)*,$/i.test(part.prefix))throw Error('历史媒体编码头无效。');
    if(part.kind==='base64'){if(!/;base64,$/i.test(part.prefix)||typeof part.unpadded!=='boolean')throw Error('历史base64编码头无效。');const encoded=base64(payload);value+=part.prefix+(part.unpadded?encoded.replace(/=+$/,''):encoded);}
    else{if(/;base64,$/i.test(part.prefix)||!['component','uri','literal'].includes(part.encoding??''))throw Error('历史百分号编码类型无效。');const text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(payload);value+=part.prefix+(part.encoding==='component'?encodeURIComponent(text):part.encoding==='uri'?encodeURI(text):text);}
   }
   if(value.length>64*1024*1024)throw Error('历史字符串恢复超过安全限制。');
  }
  (parent as Record<string|number,unknown>)[last]=value;
 }
 const {mediaStrings:_,...rest}=document;return JSON.stringify({...rest,schemaVersion:1});
}

export async function checkedHydrateHistoryMedia(raw:string,projectId:string,storage:ProjectStorage):Promise<string>{
 try{return await hydrateHistoryMedia(raw,projectId,storage);}catch(error){throw new HistoryMediaError(`历史媒体恢复失败：${error instanceof Error?error.message:String(error)}`);}
}
