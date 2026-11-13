/** Volatile, content-free diagnostics. Nothing is persisted or sent automatically. */
export interface MediaDiagnosticContext {screenId?:string;usage?:'preview'|'export';scope?:'screen'|'style'|'transport'}
type Stage='session'|'resource-read'|'worker-start'|'worker-control'|'register'|'release'|'retry'|'resolve'|'close';
type Status='started'|'completed'|'failed'|'canceled'|'retrying';
type Category='transport'|'permission'|'rejected'|'read'|'unknown';
interface Details {attempt?:number;error?:unknown;category?:Category;native?:boolean;workerState?:string;controllerState?:string}
interface Entry {sequence:number;elapsedMs:number;sessionId:string;screenId?:string;usage?:'preview'|'export';scope?:'screen'|'style'|'transport';stage:Stage;status:Status;attempt?:number;error?:{name:string;causes:string[]};category?:Category;native?:boolean;workerState?:string;controllerState?:string}
const limit=200,startedAt=Date.now(),documentId=crypto.randomUUID();
const entries:Entry[]=[];let sequence=0;
const names=new Set(['Error','TypeError','NetworkError','AbortError','InvalidStateError','SecurityError','NotAllowedError','QuotaExceededError','TimeoutError','MediaTransportError']);
const states=new Set(['installing','installed','activating','activated','redundant','missing']);
const errorName=(error:unknown):string=>{try{const value=(error as {name?:unknown})?.name;return typeof value==='string'&&names.has(value)?value:'UnknownError';}catch{return 'UnknownError';}};
function errorSummary(error:unknown){
 const causes:string[]=[];let current=error;
 for(let level=0;level<2;level++){
  try{current=(current as {cause?:unknown})?.cause;}catch{break;}
  if(current===undefined||current===null)break;causes.push(errorName(current));
 }
 return {name:errorName(error),causes};
}
export function createMediaDiagnostic(context:MediaDiagnosticContext={}){
 const sessionId=crypto.randomUUID();
 // Screen identity is an internal identifier, never a title, path or arbitrary error string.
 const screenId=typeof context.screenId==='string'&&/^(?:screen-[a-z0-9]{1,16}(?:-[a-z0-9]{1,8})?|[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12})$/i.test(context.screenId)?context.screenId:undefined;
 const usage=context.usage==='preview'||context.usage==='export'?context.usage:undefined;
 const scope=['screen','style','transport'].includes(context.scope??'')?context.scope:undefined;
 return (stage:Stage,status:Status,details:Details={})=>{
  if(!['session','resource-read','worker-start','worker-control','register','release','retry','resolve','close'].includes(stage)||!['started','completed','failed','canceled','retrying'].includes(status))return;
  const row:Entry={sequence:++sequence,elapsedMs:Math.max(0,Date.now()-startedAt),sessionId,screenId,usage,scope,stage,status};
  if(Number.isInteger(details.attempt)&&details.attempt!>=1&&details.attempt!<=2)row.attempt=details.attempt;
  if(details.error!==undefined)row.error=errorSummary(details.error);
  if(['transport','permission','rejected','read','unknown'].includes(details.category??''))row.category=details.category;
  if(typeof details.native==='boolean')row.native=details.native;
  if(states.has(details.workerState??''))row.workerState=details.workerState;
  if(states.has(details.controllerState??''))row.controllerState=details.controllerState;
  entries.push(row);if(entries.length>limit)entries.shift();
 };
}
/** Return an isolated copy. A caller cannot mutate the in-memory record via export. */
export function mediaDiagnosticsSnapshot(){
 return {schemaVersion:1,documentId,capacity:limit,droppedEvents:Math.max(0,sequence-entries.length),events:entries.map(row=>({...row,...(row.error?{error:{name:row.error.name,causes:[...row.error.causes]}}:{})}))};
}
