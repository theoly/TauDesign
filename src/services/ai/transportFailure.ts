import type {StreamEvent,ErrorKind} from '../../types/provider';
/** Diagnostics may be persisted; a gateway error is not permission to echo credentials or image bytes. */
export function safeModelDiagnostic(message:string,apiKey=''):string {
 let text=message;
 for(const key of new Set([apiKey.trim(),apiKey.trim().replace(/^Bearer\s+/i,'')].filter(Boolean))){text=text.split(key).join('[凭据已隐藏]');text=text.split(encodeURIComponent(key)).join('[凭据已隐藏]');}
 if(/<\/?(?:svg|path|circle|rect|polyline|polygon|ellipse|image)\b/i.test(text))return '模型错误诊断含媒体代码，已省略正文；请查看错误类型、HTTP状态与调用记录。';
 return text.replace(/data:[a-z0-9.+\/-]+(?:;[a-z0-9=.+-]+)*,[^\s"'<>]*/gi,'[内嵌媒体已省略]').slice(0,4000);
}
export function httpFailure(status:number,message:string,retryAfterMs?:number):Extract<StreamEvent,{type:'Error'}>{
 const kind:ErrorKind=status===401||status===403?'auth_failed':status===402?'payment_required':status===429?'rate_limited':status===404?'not_found':'network_error';
 return {type:'Error',kind,http_status:status,message:`HTTP 错误 ${status}: ${message}`,...(Number.isFinite(retryAfterMs)&&retryAfterMs!>=0?{retry_after_ms:retryAfterMs}:{})};
}
/** Missing response bytes do not prove a request was not processed or billed. */
export function retryEligibility(error:Extract<StreamEvent,{type:'Error'}>,options:{cancelled:boolean;stale:boolean;remainingMs:number;attempts:number;verifiedRemoteResume:boolean}):{allowed:boolean;reason:string}{
 if(options.cancelled||options.stale||options.remainingMs<=0)return {allowed:false,reason:'任务已取消、过期或超过时限。'};
 if(['auth_failed','payment_required','not_found','invalid_response'].includes(error.kind))return {allowed:false,reason:'该错误不能通过重放生成请求修复。'};
 if(!options.verifiedRemoteResume)return {allowed:false,reason:'服务端没有经验证的幂等/恢复合同，不自动重放生成POST。'};
 if(options.attempts>=2)return {allowed:false,reason:'已达到一次受控重试上限。'};
 if((error.retry_after_ms??0)>=options.remainingMs)return {allowed:false,reason:'服务端等待时间超过任务剩余时限。'};
 return {allowed:true,reason:'可在原父预算内进行一次经验证的恢复尝试。'};
}
