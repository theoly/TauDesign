import type {PageTaskPlan} from './pageTaskPlan';
export type PageWriteMode='SkeletonMainAtomic'|'SectionPlanThenWrite'|'SectionedPatch'|'DerivedCopyMutableOnly';
export interface PageWriteStrategy {
 version:2;mode:PageWriteMode;reason:string;majorSections:number;estimatedHtmlBytes:number;
 maxRegionPatches:3;mutableRegions:string[];requested:'auto'|'atomic'|'patch';
}
export const SECTIONED_HTML_BYTES=45*1024;
export function choosePageWriteStrategy(input:{plan?:PageTaskPlan;majorSections?:number;estimatedHtmlBytes:number;derived?:boolean;mutableRegions?:string[];stateBase?:boolean;atomicFits?:boolean;requested?:PageWriteStrategy['requested']}):PageWriteStrategy{
 const majorSections=input.majorSections??input.plan?.features.filter(f=>f.change!=='remove').length??0;
 if(!Number.isInteger(majorSections)||majorSections<0||!Number.isSafeInteger(input.estimatedHtmlBytes)||input.estimatedHtmlBytes<0)throw Error('页面规模估计无效。');
 const requested=input.requested??'auto',mutableRegions=[...new Set(input.mutableRegions??[])];let mode:PageWriteMode,reason:string;
 if(input.derived){if(!mutableRegions.length)throw Error('复制修改缺少明确mutableRegions，不能扩大授权。');mode='DerivedCopyMutableOnly';reason='先复制完整基线，仅修改已授权区域。';}
 else{
  const needsPatch=majorSections>=7||input.stateBase===true||input.estimatedHtmlBytes>SECTIONED_HTML_BYTES||input.atomicFits===false;
  if(requested==='atomic'&&needsPatch)throw Error('主体一次写入在当前规模/容量下不可执行；请选择分区补丁或调整需求，未静默改变生成方式。');
  if(requested==='patch'||needsPatch){mode='SectionedPatch';reason=requested==='patch'?'用户选择最多三个目标区域补丁。':majorSections>=7?'至少7个主要业务区块。':input.stateBase?'状态组基础页需要受控分区。':input.estimatedHtmlBytes>SECTIONED_HTML_BYTES?'预计HTML超过45KiB。':'预估主体超出当前单次输出容量。';}
  else{mode=majorSections>=4?'SectionPlanThenWrite':'SkeletonMainAtomic';reason=majorSections>=4?'4–6个主要区块，先规划再一次写入main。':'普通页面，程序基础设施后一次写入main。';}
 }
 return {version:2,mode,reason,majorSections,estimatedHtmlBytes:input.estimatedHtmlBytes,maxRegionPatches:3,mutableRegions,requested};
}
export interface OutputStep {id:string;minTokens:number;targetTokens:number;maxTokens:number;minRequests:number;weight:number}
/** Allocations reserve the not-yet-executed steps before assigning the current one. */
export function allocateOutputSteps(steps:readonly OutputStep[],remainingTokens:number,remainingRequests:number,reserveTokens=0):Array<{id:string;tokens:number}>{
 if(!steps.length||new Set(steps.map(s=>s.id)).size!==steps.length||!Number.isSafeInteger(remainingTokens)||!Number.isSafeInteger(remainingRequests)||reserveTokens<0)throw Error('执行图预算参数无效。');
 if(steps.some(s=>!s.id||![s.minTokens,s.targetTokens,s.maxTokens,s.minRequests,s.weight].every(Number.isSafeInteger)||s.minTokens<1||s.minTokens>s.targetTokens||s.targetTokens>s.maxTokens||s.minRequests<1||s.weight<1))throw Error('执行步骤预算无效。');
 const min=steps.reduce((n,s)=>n+s.minTokens,0),requests=steps.reduce((n,s)=>n+s.minRequests,0),available=remainingTokens-reserveTokens;
 if(min>available||requests>remainingRequests)throw Error('原父预算不足以完成必需步骤；未发送请求，未扩大额度。');
 const result=steps.map(s=>({id:s.id,tokens:s.minTokens}));let rest=available-min;
 // Fair weighted increments up to targets, then maxima. Never give one region all remaining tokens.
 for(const field of ['targetTokens','maxTokens'] as const){
  while(rest>0){const active=steps.map((s,i)=>({s,i})).filter(({s,i})=>result[i].tokens<s[field]);if(!active.length)break;
   const total=active.reduce((n,{s})=>n+s.weight,0),round=rest;let used=0;
   for(const {s,i} of active){const amount=Math.min(rest,s[field]-result[i].tokens,Math.max(1,Math.floor(round*s.weight/total)));result[i].tokens+=amount;rest-=amount;used+=amount;}
   if(!used)break;
  }
 }
 return result;
}
export function estimatePageHtmlBytes(request:string,plan?:PageTaskPlan):number{
 const required=new TextEncoder().encode(request).length;
 const features=plan?.features??[];
 // Deliberately an estimate, not a promise about the model's output size.
 return required+features.reduce((n,f)=>n+1000+f.information.length*250+f.interactions.length*350+f.states.length*200,0);
}

export function validPageWriteStrategy(value:unknown):value is PageWriteStrategy{
 const v=value as PageWriteStrategy|undefined;return !!v&&v.version===2&&['SkeletonMainAtomic','SectionPlanThenWrite','SectionedPatch','DerivedCopyMutableOnly'].includes(v.mode)&&typeof v.reason==='string'&&v.reason.length>0&&v.reason.length<1000&&Number.isSafeInteger(v.majorSections)&&v.majorSections>=0&&Number.isSafeInteger(v.estimatedHtmlBytes)&&v.estimatedHtmlBytes>=0&&v.maxRegionPatches===3&&Array.isArray(v.mutableRegions)&&v.mutableRegions.every(n=>typeof n==='string'&&n.length>0&&n.length<=200)&&new Set(v.mutableRegions).size===v.mutableRegions.length&&['auto','atomic','patch'].includes(v.requested)&&(v.mode!=='DerivedCopyMutableOnly'||v.mutableRegions.length>0);
}
