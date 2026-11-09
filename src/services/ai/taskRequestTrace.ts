import type {AIEngineCore,StreamTextOptions,TransportReceipt,TokenUsage} from './engine/core/types';
import type {CapacityReceipt} from './modelCapacity';
export interface TaskRequestTrace {version:1;id:string;taskId:string;stepId:string;at:number;stage:'capacity'|'transport'|'settled'|'failed';providerId:string;model:string;
 childTaskId?:string;
 attempts?:number;connected?:boolean;closed?:boolean;httpStatus?:number;finishReason?:string;errorKind?:string;capacity?:Pick<CapacityReceipt,'inputTokens'|'outputTokens'|'reserveTokens'|'contextWindow'|'conservativeCeiling'|'fits'|'knownWindow'|'mediaEstimate'>;
 usage?:TokenUsage;costStatus:'unknown';}
const safe=(text:string)=>text.replace(/[^a-z0-9_.:/\-]/gi,'_').slice(0,160);
const usageFields=(value:TokenUsage|undefined):TokenUsage|undefined=>value&&[value.inputTokens,value.outputTokens].every(n=>Number.isSafeInteger(n)&&n>=0&&n<=1e9)?{inputTokens:value.inputTokens,outputTokens:value.outputTokens,source:value.source==='provider'||value.source==='estimated'?value.source:'unknown',...(Number.isSafeInteger(value.reasoningTokens)&&value.reasoningTokens!>=0?{reasoningTokens:value.reasoningTokens}:{})}:undefined;
/** Records metadata only, including a failed zero-HTTP capacity check. No prompts or reasoning. */
export function withTaskRequestTrace(core:AIEngineCore,record:(trace:TaskRequestTrace)=>void):AIEngineCore {
 const bind=(options:StreamTextOptions)=>{
  const base={version:1 as const,id:crypto.randomUUID(),taskId:options.provenance?.taskId??'',stepId:safe(options.provenance?.stepId??'request'),providerId:safe(options.provider.id),model:safe(options.model),costStatus:'unknown' as const};
  let usageSeen=false,lastTransport='';
  const publish=(fields:Omit<TaskRequestTrace,keyof typeof base|'at'>)=>{try{record({...base,...fields,at:Date.now()});}catch{/* write errors are surfaced by the owning journal checkpoint */}};
  const request:StreamTextOptions={...options,onCapacity(c){const {inputTokens,outputTokens,reserveTokens,contextWindow,conservativeCeiling,fits,knownWindow,mediaEstimate}=c;publish({stage:'capacity',capacity:{inputTokens,outputTokens,reserveTokens,contextWindow,conservativeCeiling,fits,knownWindow,mediaEstimate}});options.onCapacity?.(c);},
   onTransportEvidence(r:TransportReceipt){
    // Intermediate delta activity is UI-only. Persist actual connection/attempt/terminal changes.
    const fields={attempts:r.attemptIds.length,connected:r.connected,closed:r.closed,httpStatus:r.httpStatus,finishReason:r.finishReason?safe(r.finishReason):undefined,errorKind:r.errorKind?safe(r.errorKind):undefined};
    const key=JSON.stringify(fields);if(key!==lastTransport){lastTransport=key;publish({stage:'transport',...fields});}options.onTransportEvidence?.(r);
   },onUsage(usage){usageSeen=true;publish({stage:'settled',usage:usageFields(usage)});options.onUsage?.(usage);}};
  return {request,failed(){publish({stage:'failed'});},settle(usage?:TokenUsage){if(!usageSeen){usageSeen=true;publish({stage:'settled',usage:usageFields(usage)});}}};
 };
 return {streamText(options){const call=bind(options);try{const stream=core.streamText(call.request);void stream.usagePromise.then(usage=>call.settle(usage),()=>call.failed());void stream.textPromise.catch(()=>call.failed());return stream;}catch(error){call.failed();throw error;}},
  async generateObject<T>(schema:Record<string,unknown>,options:Omit<StreamTextOptions,'jsonSchema'>):Promise<T>{const call=bind(options);try{const result=await core.generateObject<T>(schema,call.request);call.settle();return result;}catch(error){call.failed();throw error;}}};
}
export function validTaskRequestTrace(value:unknown):value is TaskRequestTrace {
 const v=value as TaskRequestTrace|undefined,number=(n:unknown)=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=0&&n<=1e9;
 return Boolean(v&&Object.keys(v).every(k=>['version','id','taskId','childTaskId','stepId','at','stage','providerId','model','attempts','connected','closed','httpStatus','finishReason','errorKind','capacity','usage','costStatus'].includes(k))&&v.version===1&&typeof v.id==='string'&&v.id.length<=100&&/^design-[a-z0-9-]{1,110}$/.test(v.taskId)&&(v.childTaskId===undefined||/^design-[a-z0-9-]{1,110}$/.test(v.childTaskId))&&['stepId','providerId','model'].every(k=>typeof v[k as keyof TaskRequestTrace]==='string'&&(v[k as keyof TaskRequestTrace] as string).length<=160)&&['capacity','transport','settled','failed'].includes(v.stage)&&Number.isSafeInteger(v.at)&&v.at>=0&&v.costStatus==='unknown'&&
  (v.attempts===undefined||number(v.attempts))&&(v.httpStatus===undefined||Number.isInteger(v.httpStatus)&&v.httpStatus>=100&&v.httpStatus<=599)&&['connected','closed'].every(k=>v[k as keyof TaskRequestTrace]===undefined||typeof v[k as keyof TaskRequestTrace]==='boolean')&&['finishReason','errorKind'].every(k=>v[k as keyof TaskRequestTrace]===undefined||typeof v[k as keyof TaskRequestTrace]==='string'&&(v[k as keyof TaskRequestTrace] as string).length<=160)&&
  (v.capacity===undefined||v.capacity&&Object.keys(v.capacity).every(k=>['inputTokens','outputTokens','reserveTokens','contextWindow','conservativeCeiling','fits','knownWindow','mediaEstimate'].includes(k))&&[v.capacity.inputTokens,v.capacity.outputTokens,v.capacity.reserveTokens].every(number)&&[v.capacity.contextWindow,v.capacity.conservativeCeiling].every(n=>n===undefined||number(n))&&[v.capacity.fits,v.capacity.knownWindow,v.capacity.mediaEstimate].every(b=>typeof b==='boolean'))&&
  (v.usage===undefined||v.usage&&Object.keys(v.usage).every(k=>['inputTokens','outputTokens','source','reasoningTokens'].includes(k))&&number(v.usage.inputTokens)&&number(v.usage.outputTokens)&&['provider','estimated','unknown'].includes(v.usage.source??'')&&(v.usage.reasoningTokens===undefined||number(v.usage.reasoningTokens))));
}
