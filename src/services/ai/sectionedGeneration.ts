import type {PrepareGeneratedHtml} from './generatedMedia';
import type {PageComposition} from './pageComposition';
import {sumTokenUsage} from './tokenUsage';
import {assertExternalMedia,embeddedMediaIssue} from './externalMedia';
import type {AIEngineCore,EngineMessage,StreamTextOptions,TokenUsage} from './engine/core/types';
import {streamWithContinuation,type ContinuationResult} from './boundedContinuation';
import {continuationBindingKey,isOutputLimit,type ContinuationCheckpoint} from './generationContinuation';
import {safeJsonParse,structuredOutputIssue} from './structuredOutput';
import {checkGenerationSourceSafety} from './generationQuality';
import {htmlIsComplete, repairHtmlSnippet} from '../../utils/htmlCompleteness';
import {parseHtmlCopy} from '../../utils/htmlDocument';
import {NidEngine} from '../../utils/nidEngine';
import {contentFingerprint} from './designWorkflow';
import {extractArtifact} from './engine/pipeline/interceptors/streamTransform';

export interface SectionPlan {version?:2;composition?:PageComposition;title:string;shellHtml:string;sections:Array<{id:string;name:string;requirements:string}>}
export interface SectionRequestRecord {stage:string;rawResponse:string;responseFingerprint?:string;responseOmitted?:string;finishReason?:string;requestedOutputTokens:number;usage?:TokenUsage}
export interface SectionedEvidence {plan:SectionPlan;requests:SectionRequestRecord[];completed:number;total:number;requestedOutputTokens:number;batchRequestedOutputTokens:number}
export interface SectionedCheckpoint {
  version:1;contextKey:string;bindingKey:string;plan:SectionPlan;
  completed:Array<{id:string;html:string}>;active?:ContinuationCheckpoint;requests:SectionRequestRecord[];fingerprint:string;
}
export interface SectionedResult extends ContinuationResult {sectionedCheckpoint?:SectionedCheckpoint;sectioned?:SectionedEvidence}
/** Runtime-generated nids differ across processes; program layout and declared duties must not. */
export function sameSectionPlanScope(a:SectionPlan,b:SectionPlan):boolean{
 if(JSON.stringify([a.version,a.composition,a.title,a.sections])!==JSON.stringify([b.version,b.composition,b.title,b.sections]))return false;
 const left=parseHtmlCopy(a.shellHtml).doc,right=parseHtmlCopy(b.shellHtml).doc;
 for(const doc of [left,right])for(const node of Array.from(doc.querySelectorAll('[data-nid]')))node.removeAttribute('data-nid');
 return left.documentElement.isEqualNode(right.documentElement);
}
const schema={type:'object',additionalProperties:false,required:['title','shellHtml','sections'],properties:{title:{type:'string',maxLength:100},shellHtml:{type:'string',maxLength:16000},sections:{type:'array',minItems:2,maxItems:6,items:{type:'object',additionalProperties:false,required:['id','name','requirements'],properties:{id:{type:'string'},name:{type:'string',maxLength:60},requirements:{type:'string',maxLength:1200}}}}}};
const slotTags=new Set(['SECTION','DIV','MAIN','HEADER','FOOTER','ASIDE','ARTICLE']);
const inlineImage=(text:string)=>/data:image\/[^;,]+;base64,/i.test(text);

function assignIds(doc:Document,used=new Set<string>()):void {
  for(const el of Array.from(doc.body.querySelectorAll('*'))){
    if(['STYLE','META','LINK','TITLE'].includes(el.tagName))continue;
    let nid=el.getAttribute('data-nid');
    if(nid&&used.has(nid))throw Error('区块节点标识与公共骨架或其它区块冲突。');
    if(!nid){do{nid=NidEngine.generateNid();}while(used.has(nid));el.setAttribute('data-nid',nid);}
    used.add(nid);
  }
}
export function parseSectionPlan(value:unknown):SectionPlan {
  const plan=value as SectionPlan;
  if(!plan||typeof plan!=='object'||Object.keys(plan).some(k=>!['version','composition','title','shellHtml','sections'].includes(k))||(plan.version!==undefined&&plan.version!==2)||typeof plan.title!=='string'||!plan.title.trim()||plan.title.length>100
    ||typeof plan.shellHtml!=='string'||!plan.shellHtml.trim()||plan.shellHtml.length>16000||!Array.isArray(plan.sections)||plan.sections.length<(plan.version===2?1:2)||plan.sections.length>(plan.version===2?3:6))throw Error('分区计划格式无效，需2～6个区块与完整公共骨架。');
  const ids=new Set<string>();
  for(const item of plan.sections){
    if(!item||Object.keys(item).some(k=>!['id','name','requirements'].includes(k))||!/^section-[1-6]$/.test(item.id)||ids.has(item.id)||typeof item.name!=='string'||!item.name.trim()||item.name.length>60||typeof item.requirements!=='string'||!item.requirements.trim()||item.requirements.length>(plan.version===2?12000:1200))throw Error('分区标识、名称或要求无效。');
    ids.add(item.id);
  }
  if(!htmlIsComplete(plan.shellHtml)||!checkGenerationSourceSafety(plan.shellHtml).passed||inlineImage(plan.shellHtml))throw Error('公共骨架未完整、不安全或含未落盘的图片。');
  if(plan.version===2)assertExternalMedia(plan.shellHtml);
  const copy=parseHtmlCopy(plan.shellHtml),slots=Array.from(copy.doc.querySelectorAll('[data-design-slot]'));
  if(slots.length!==ids.size||slots.some(el=>!ids.has(el.getAttribute('data-design-slot')!)||!copy.doc.body.contains(el)||!slotTags.has(el.tagName)||el.children.length>0||Boolean(el.textContent?.trim())
    ||el.parentElement?.closest('[data-design-slot]')||slots.filter(other=>other.getAttribute('data-design-slot')===el.getAttribute('data-design-slot')).length!==1))throw Error('骨架插槽必须唯一、空白且不嵌套，并与区块逐项对应。');
  assignIds(copy.doc);
  if(copy.serialize().length>16000)throw Error('公共骨架过大，请缩小共享内容。');
  return {...(plan.version===2?{version:2 as const,...(plan.composition?{composition:structuredClone(plan.composition)}:{})}:{}),title:plan.title.trim(),shellHtml:copy.serialize(),sections:plan.sections.map(s=>({...s,name:s.name.trim(),requirements:s.requirements.trim()}))};
}

/** Each section is checked before insertion; no regular expression rewrites or sibling HTML regeneration. */
export function mergeSectionParts(plan:SectionPlan,parts:Array<{id:string;html:string}>,requireComplete=true):string {
  if(requireComplete&&parts.length!==plan.sections.length)throw Error('尚有未完成区块，不能交付半页。');
  const copy=parseHtmlCopy(plan.shellHtml),used=new Set(Array.from(copy.doc.querySelectorAll('[data-nid]')).map(el=>el.getAttribute('data-nid')!)),seen=new Set<string>();
  for(const part of parts){
    if(seen.has(part.id)||!plan.sections.some(s=>s.id===part.id)||!part.html?.trim()||part.html.length>120000||!htmlIsComplete(part.html)||!checkGenerationSourceSafety(part.html).passed||inlineImage(part.html))throw Error('区块无效、重复、破损、不安全或含未落盘的图片。');
    if(plan.version===2)assertExternalMedia(part.html);
    seen.add(part.id);
    if(/^\s*(?:<!doctype|<html(?:\s|>))/i.test(part.html))throw Error('区块不能重新开始完整页面。');
    const fragment=parseHtmlCopy(part.html);
    if(fragment.doc.querySelector('style,link,head > *,[data-design-slot]')||Array.from(fragment.doc.querySelectorAll('title')).some(el=>el.namespaceURI!=='http://www.w3.org/2000/svg'))throw Error('区块不得重定义全局样式或声明其它插槽。');
    assignIds(fragment.doc,used);
    const slot=Array.from(copy.doc.querySelectorAll('[data-design-slot]')).find(el=>el.getAttribute('data-design-slot')===part.id);
    if(!slot)throw Error('区块对应插槽不存在。');
    slot.replaceChildren(...Array.from(fragment.doc.body.childNodes));
  }
  if(requireComplete)for(const el of Array.from(copy.doc.querySelectorAll('[data-design-slot]')))el.removeAttribute('data-design-slot');
  return copy.serialize();
}
const checkpointFingerprint=(value:Omit<SectionedCheckpoint,'fingerprint'>)=>contentFingerprint(JSON.stringify(value));

export async function generateSectionedPage(core:AIEngineCore,options:StreamTextOptions,contextKey:string,callbacks:{prepareGeneratedHtml?:PrepareGeneratedHtml;preplanned?:SectionPlan;sectionTokenCaps?:Record<string,number>;remainingOutputTokens?:()=>number;reservedOutputTokens?:number;resume?:SectionedCheckpoint;isCurrent?:()=>boolean;onProgress?:(message:string)=>void;onRequest?:(messages:EngineMessage[])=>void;onCheckpoint?:(plan:SectionPlan,completed:Array<{id:string;html:string}>)=>Promise<void>;initialCompleted?:Array<{id:string;html:string}>}={}):Promise<SectionedResult> {
  const result:SectionedResult={rawResponse:'',warnings:[],continuationCount:0,usage:{inputTokens:0,outputTokens:0},requestedOutputTokens:0};
  const bindingKey=continuationBindingKey(options),resume=callbacks.resume;
  let plan:SectionPlan|undefined,completed:Array<{id:string;html:string}>=[],active:ContinuationCheckpoint|undefined;
  let requests:SectionRequestRecord[]=[],resumeAllowed=true;
  const guard=()=>{if(options.signal?.aborted)throw Error('分区设计已取消，未加入页面。');if(callbacks.isCurrent&&!callbacks.isCurrent())throw Error('工程或模型上下文已变化，分区设计已停止。');};
  const instruct=(instruction:string,stage:'plan'|'section'):EngineMessage[]=>{
    const messages=structuredClone(options.messages),last=messages[messages.length-1];
    if(!last||last.role!=='user')throw Error('分区设计缺少当前用户请求。');
    const format=`\n[本次受控分区阶段输出合同] ${stage==='plan'?'当前只输出JSON title/shellHtml/sections，不输出artifact或整页正文。':'当前只输出本区块HTML片段的artifact，不输出其它区块或完整页面。'}前文要求完整页面的输出格式仅适用于最终交付，由程序合并后复验。其它安全、设备、Token、授权和文案规则继续强制执行。`;
    const system=messages.find(m=>m.role==='system');if(system)system.content+=format;else messages.unshift({role:'system',content:format});
    last.content+=`\n\n[同页分区阶段要求]\n${instruction}`;
    if(messages.reduce((n,m)=>n+m.content.length,0)>120000)throw Error('分区上下文超过安全预算，请缩小需求。');
    return messages;
  };
  const record=(stage:string,r:ContinuationResult)=>{
    const omitted=embeddedMediaIssue(r.rawResponse)?'embedded-media':r.rawResponse.length>120000?'response-size-limit':undefined;
    requests.push({stage,rawResponse:omitted?'':r.rawResponse,responseFingerprint:contentFingerprint(r.rawResponse),...(omitted?{responseOmitted:omitted}:{}),finishReason:r.finishReason,requestedOutputTokens:r.requestedOutputTokens??0,usage:r.usage});
    result.requestedOutputTokens!+=r.requestedOutputTokens??0;
    if(r.usage)result.usage=sumTokenUsage(result.usage,r.usage);
    result.warnings.push(...r.warnings);if(r.reasoningText)result.reasoningText=(result.reasoningText??'')+r.reasoningText;
  };
  try {
    guard();
    if(resume){
      const {fingerprint,...payload}=resume;
      if(resume.version!==1||resume.contextKey!==contextKey||resume.bindingKey!==bindingKey||fingerprint!==checkpointFingerprint(payload)||!Array.isArray(resume.completed)||!Array.isArray(resume.requests)||JSON.stringify(resume).length>700000)throw Error('分区检查点无效或工程/模型已变化，请重新生成。');
      plan=parseSectionPlan(resume.plan);completed=structuredClone(resume.completed);active=resume.active;requests=structuredClone(resume.requests);
      if(completed.length>=plan.sections.length||completed.some((part,i)=>part.id!==plan!.sections[i].id))throw Error('分区检查点顺序无效。');
      mergeSectionParts(plan,completed,false);
    } else if(callbacks.preplanned){
      plan=parseSectionPlan(callbacks.preplanned);
    } else {
      callbacks.onProgress?.('正在安排页面的公共布局，并分为2～6个区域…');
      if(options.messages.reduce((n,m)=>n+m.content.length,0)>90000)throw Error('分区设计上下文过大，请缩小需求或引用范围。');
      const messages=instruct(`本次明确采用同一页分区生成，最终仍是一个页面。只返回JSON title/shellHtml/sections。先生成公共骨架、全局共享样式和2～6个区块职责；不要填区块正文。骨架使用当前项目基座类、Token，保持专业布局与共同视觉层级；可包含共用页头/侧栏等有明确业务文案的内容。每区块id为section-1至section-6中不同值，骨架用空的<section data-design-slot="对应id"></section>占位，不可嵌套或重复；requirements为该区块全部业务内容和UI要求。只规划原需求功能，不写工程说明、测试说明或假数据处理承诺。Schema:${JSON.stringify(schema)}`,'plan');
      callbacks.onRequest?.(messages);
      const response=await streamWithContinuation(core,{...options,messages,provenance:options.provenance?{...options.provenance,stepId:'section-plan'}:undefined,maxTokens:4096,jsonSchema:schema,temperature:0.2},{allowContinuation:false,budget:{maxRequestedTokens:4096,autoContinuations:0}});
      record('plan',response);guard();
      const issue=response.errorMessage||structuredOutputIssue(response.finishReason,response.recoveredStreamError);if(issue)throw Error(issue);
      plan=parseSectionPlan(safeJsonParse(response.rawResponse));
    }
    if(callbacks.initialCompleted){if(resume||plan.version!==2)throw Error('新恢复任务只能复用V2已验证区域，不能复活旧续写检查点。');completed=structuredClone(callbacks.initialCompleted);if(completed.length>=plan.sections.length||completed.some((part,i)=>part.id!==plan!.sections[i].id))throw Error('恢复区域顺序或范围无效。');mergeSectionParts(plan,completed,false);}
    await callbacks.onCheckpoint?.(structuredClone(plan),structuredClone(completed));
    guard();
    for(let index=completed.length;index<plan.sections.length;index++){
      guard();
      const section=plan.sections[index],remaining=Math.min(32768-result.requestedOutputTokens!,callbacks.remainingOutputTokens?.()??Infinity);
      if(remaining<=0)throw Error('本批已达到32768请求输出Token预算；已保留完成区块，可继续未完成部分。');
      const available=remaining-(callbacks.reservedOutputTokens??0),allocation=callbacks.sectionTokenCaps?.[section.id];
      const perSection=Math.min(4096,allocation??(callbacks.remainingOutputTokens?Math.floor(available/(plan.sections.length-index)):available));
      if(perSection<256)throw Error('父任务剩余输出额度不足，已保留完成区块，未扩大预算。');
      callbacks.onProgress?.(`正在生成区块 ${index+1}/${plan.sections.length}：${section.name}；已完成 ${completed.length} 块…`);
      const reference=parseHtmlCopy(plan.shellHtml);
      for(const node of Array.from(reference.doc.querySelectorAll('[data-design-slot],[data-nid]'))){node.removeAttribute('data-design-slot');node.removeAttribute('data-nid');}
      const messages=instruct(`只生成同一页面的本区块内容，以一个完整artifact包裹HTML片段，禁止解释。不要输出其它区块、公共骨架或全局style/link，不要输出data-design-slot或复制公共data-nid。区块id仅用于程序关联，不是需要输出的HTML属性。只使用项目基座和公共样式；保留本区块所有未经明确授权删除的业务文案、表单规则和操作控件，明确授权的文案变更按确认内容执行。用户要求在本页填写的字段应提供关联的可见label与input、select或textarea，不能仅用跳转按钮代替；明确只读的字段用dl/dt/dd逐项展示标签和值，或用关联label和readonly输入框，保留只读语义，不虚构可编辑状态。主操作须有可见名称；图标按钮应有可识别名称。禁止工程/调试说明进入UI。公共骨架参考副本已去内部定位属性，仅作布局/风格参考，不得重新输出：\n${reference.serialize()}\n当前区块：${JSON.stringify(section)}\n其它区块名称（不用生成）：${plan.sections.filter(s=>s.id!==section.id).map(s=>s.name).join('、')}`,'section');
      callbacks.onRequest?.(messages);
      const response=await streamWithContinuation(core,{...options,messages,provenance:options.provenance?{...options.provenance,stepId:section.id}:undefined,maxTokens:perSection,jsonSchema:undefined},{prepareGeneratedHtml:callbacks.prepareGeneratedHtml,resume:active,contextKey:`${contextKey}:${section.id}`,externalMediaOnly:plan.version===2,budget:{maxRequestedTokens:Math.min(8192,available,allocation??Infinity),continuationTokens:perSection,autoContinuations:1}});
      const previous=active?.previousContinuations??0;record(section.id,response);result.continuationCount+=Math.max(0,response.continuationCount-previous);active=response.checkpoint;guard();
      if(response.errorMessage)throw Error(response.errorMessage);
      const issue=structuredOutputIssue(response.finishReason,response.recoveredStreamError);
      if(issue){if(!isOutputLimit(response.finishReason))resumeAllowed=false;throw Error(issue);}
      let artifact=extractArtifact(response.rawResponse);
      let snippet=artifact?.html;
      if(!snippet&&response.rawResponse.trim()){
        const repairedRaw=repairHtmlSnippet(response.rawResponse);
        artifact=extractArtifact(repairedRaw);
        snippet=artifact?.html;
      }
      if(snippet&&!htmlIsComplete(snippet)){
        const repaired=repairHtmlSnippet(snippet);
        if(htmlIsComplete(repaired))snippet=repaired;
      }
      if(!snippet||!htmlIsComplete(snippet))throw Error('当前区块未完整返回；此前完成区块已保留，可继续。');
      if(plan.version===2)assertExternalMedia(snippet);
      const part={id:section.id,html:snippet};
      // Inspect before adding it to the checkpoint. Active/untrusted content is never accepted as a completed section.
      const projection=parseHtmlCopy(mergeSectionParts(plan,[...completed,part],false));
      part.html=Array.from(projection.doc.querySelectorAll('[data-design-slot]')).find(el=>el.getAttribute('data-design-slot')===section.id)!.innerHTML;
      completed.push(part);active=undefined;
      await callbacks.onCheckpoint?.(structuredClone(plan),structuredClone(completed));guard();
      if(plan.shellHtml.length+completed.reduce((n,p)=>n+p.html.length,0)>400000)throw Error('页面超过安全大小预算，请缩小页面职责。');
    }
    guard();const html=mergeSectionParts(plan,completed),title=plan.title.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');
    result.rawResponse=`<artifact type="screen" title="${title}">${html}</artifact>`;result.finishReason='stop';
    result.sectioned={plan,requests,completed:completed.length,total:plan.sections.length,requestedOutputTokens:requests.reduce((n,r)=>n+r.requestedOutputTokens,0),batchRequestedOutputTokens:result.requestedOutputTokens!};
    callbacks.onProgress?.('已合并为一个完整页面，正在检查内容和布局…');
    return result;
  } catch(error){
    result.errorMessage=String(error instanceof Error?error.message:error);result.warnings.push(result.errorMessage);
    if(plan)result.sectioned={plan,requests,completed:completed.length,total:plan.sections.length,requestedOutputTokens:requests.reduce((n,r)=>n+r.requestedOutputTokens,0),batchRequestedOutputTokens:result.requestedOutputTokens!};
    if(plan&&completed.length<plan.sections.length&&resumeAllowed&&!options.signal?.aborted&&(!callbacks.isCurrent||callbacks.isCurrent())){
      const payload:Omit<SectionedCheckpoint,'fingerprint'>={version:1,contextKey,bindingKey,plan,completed,active,requests};
      if(JSON.stringify(payload).length<=700000)result.sectionedCheckpoint={...structuredClone(payload),fingerprint:checkpointFingerprint(payload)};
    }
    return result;
  }
}
