import type {EngineMessage} from './engine/core/types';
import type {ModelCapabilityProfile} from './modelCapabilities';
export interface CapacityReceipt {
 version:1;source:'conservative-estimate';inputTokens:number;outputTokens:number;reserveTokens:number;
 contextWindow?:number;conservativeCeiling?:number;fits:boolean;knownWindow:boolean;mediaEstimate:boolean;
 parts:Array<{kind:string;characters:number;estimatedTokens:number}>;
}
/** A local safety bound, not a claim about any unknown provider's real context window. */
export const UNKNOWN_CAPACITY_CEILING=32768;
/** Conservative text estimate; never claims to be a provider tokenizer or an invoice. */
export function estimateInputTokens(text:string):number{
 let ascii=0,nonAscii=0;for(const c of text){if(c.codePointAt(0)!<128)ascii++;else nonAscii+=c.length;}
 return Math.ceil(ascii/2)+nonAscii;
}
export function inspectModelCapacity(messages:ReadonlyArray<EngineMessage>,outputTokens:number,profile?:ModelCapabilityProfile,schema?:Record<string,unknown>):CapacityReceipt{
 const parts:CapacityReceipt['parts']=messages.map(m=>({kind:m.role,characters:m.content.length,estimatedTokens:estimateInputTokens(m.content)+16+(m.imageUrl?4096:0)}));
 // Schemas can be sent both as instructions and provider-native metadata; count both if present.
 if(schema){const text=JSON.stringify(schema);parts.push({kind:'native-schema',characters:text.length,estimatedTokens:estimateInputTokens(text)});}
 const inputTokens=parts.reduce((n,p)=>n+p.estimatedTokens,0),reserveTokens=Math.max(1024,Math.ceil((profile?.contextWindow??0)*0.1));
 return {version:1,source:'conservative-estimate',inputTokens,outputTokens,reserveTokens,contextWindow:profile?.contextWindow,...(!profile?.contextWindow?{conservativeCeiling:UNKNOWN_CAPACITY_CEILING}:{}),fits:inputTokens+outputTokens+reserveTokens<=(profile?.contextWindow??UNKNOWN_CAPACITY_CEILING),knownWindow:!!profile?.contextWindow,mediaEstimate:messages.some(m=>!!m.imageUrl),parts};
}
export function assertModelCapacity(receipt:CapacityReceipt){if(!receipt.fits)throw Error(`${receipt.knownWindow?'模型上下文容量不足':'模型窗口未知，输入超过本地保守容量边界'}：估计输入${receipt.inputTokens} + 输出${receipt.outputTokens} + 预留${receipt.reserveTokens} > ${receipt.knownWindow?'配置窗口'+receipt.contextWindow:'本地边界'+receipt.conservativeCeiling+'（非厂商窗口）'}。未发送请求；请缩小授权区域、分区设计或核对模型容量。`);}
