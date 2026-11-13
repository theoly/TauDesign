/** Read-only historical facts. No executable contract, checkpoint or Provider object. */
export interface ConversationFailure {
 version:1;status:'failed'|'rejected'|'cancelled';message:string;
 taskId?:string;phase?:string;model?:string;finishReason?:string;
 requests?:number;requestLimit?:number;effectiveOutputTokens?:number;httpStatus?:number;inputTokens?:number;outputTokens?:number;
 attachmentUnavailable?:boolean;
}
const strings=['taskId','phase','model','finishReason'] as const;
const numbers=['requests','requestLimit','effectiveOutputTokens','httpStatus','inputTokens','outputTokens'] as const;
export function validConversationFailure(value:unknown):value is ConversationFailure{
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const v=value as Record<string,unknown>;
 return Object.keys(v).every(k=>['version','status','message','attachmentUnavailable',...strings,...numbers].includes(k))&&v.version===1&&['failed','rejected','cancelled'].includes(String(v.status))&&typeof v.message==='string'&&!!v.message.trim()&&v.message.length<=4000&&
  strings.every(k=>v[k]===undefined||typeof v[k]==='string'&&(v[k] as string).length<=200)&&numbers.every(k=>v[k]===undefined||typeof v[k]==='number'&&Number.isSafeInteger(v[k])&&(v[k] as number)>=0)&&
  (v.attachmentUnavailable===undefined||typeof v.attachmentUnavailable==='boolean');
}
