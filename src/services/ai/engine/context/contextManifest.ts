import {contentFingerprint} from '../../designWorkflow';
export interface ContextSourceRecord {id:string;kind:'request'|'target'|'reference'|'document'|'knowledge'|'history';required:boolean;status:'full'|'summary'|'omitted';sourceFingerprint:string;injectedFingerprint?:string;sourceBytes:number;injectedBytes:number;reason?:string}
export interface ContextManifest {version:1;fingerprint:string;sources:ContextSourceRecord[];messagesFingerprint:string}
const bytes=(value:string)=>new TextEncoder().encode(value).length;
/** Explicit source accounting, independent of provider token estimates. No media body or credential. */
export function contextSource(id:string,kind:ContextSourceRecord['kind'],source:string,injected:string|undefined,required=false,reason?:string):ContextSourceRecord {
 return {id,kind,required,status:injected===undefined?'omitted':reason?'summary':'full',sourceFingerprint:contentFingerprint(source),...(injected!==undefined?{injectedFingerprint:contentFingerprint(injected)}:{}),sourceBytes:bytes(source),injectedBytes:bytes(injected??''),...(reason?{reason}:{})};
}
export function makeContextManifest(sources:ContextSourceRecord[],messages:ReadonlyArray<{role:string;content:string;imageUrl?:string}>):ContextManifest {
 if(sources.some(s=>s.required&&s.status!=='full'))throw Error('必需来源未完整纳入上下文，不能从摘要重建目标。');
 // Image metadata has its own receipt; hash only, never put encoded bytes in this manifest.
 const messagesFingerprint=contentFingerprint(JSON.stringify(messages.map(m=>({role:m.role,content:m.content,...(m.imageUrl?{imageFingerprint:contentFingerprint(m.imageUrl)}:{})}))));
 return {version:1,sources,messagesFingerprint,fingerprint:contentFingerprint(JSON.stringify([sources,messagesFingerprint]))};
}
export function validContextManifest(value:unknown):value is ContextManifest {
 try{const v=value as ContextManifest;if(!v||v.version!==1||typeof v.messagesFingerprint!=='string'||!Array.isArray(v.sources)||v.sources.length>256)return false;
  if(v.sources.some(s=>!s||typeof s.id!=='string'||s.id.length>1000||!['request','target','reference','document','knowledge','history'].includes(s.kind)||typeof s.required!=='boolean'||!['full','summary','omitted'].includes(s.status)||s.required&&s.status!=='full'||typeof s.sourceFingerprint!=='string'||s.injectedFingerprint!==undefined&&typeof s.injectedFingerprint!=='string'||![s.sourceBytes,s.injectedBytes].every(n=>Number.isSafeInteger(n)&&n>=0)))return false;
  return v.fingerprint===contentFingerprint(JSON.stringify([v.sources,v.messagesFingerprint]));
 }catch{return false;}
}
