import type {WorkflowValidationReport} from './workflowValidation';
import type {DesignTaskContract} from './designWorkflow';
import {contentFingerprint} from './designWorkflow';
import type {Screen} from '../../types/project';
export interface MultiPageItem {id:string;name:string;requirements:string;links:string[]}
export interface MultiPagePlan {version:1;kind?:'variants';id:string;request:string;summary:string;contextFingerprint:string;originalPageCount:number;pages:MultiPageItem[];planning:{attempts:number;checkedAt:number;contract?:DesignTaskContract;evidence?:WorkflowValidationReport}}
export interface MultiPageScope {version:1;kind?:'variants';planId:string;planFingerprint:string;itemId:string;screenId:string;name:string;index:number;total:number;originalPageCount:number;pageIds:string[];requiredTargetIds:string[]}
export interface MultiPageDelivery {version:1;kind?:'variants';planId:string;planFingerprint:string;confirmedAt:number;request:string;summary:string;originalPageCount:number;pages:Array<MultiPageItem&{screenId:string}>;planning:MultiPagePlan['planning']}
export interface MultiPageProgress {itemId:string;name:string;status:'pending'|'generating'|'checked'|'applied'|'failed';message?:string}
export interface MultiPageReview {status:'planning'|'ready'|'running'|'complete'|'blocked'|'cancelled';plan?:MultiPagePlan;progress?:MultiPageProgress[];message:string}

/** Explicit alternatives for one page, not a theme question or an element edit. */
export function requiresPageVariantPlan(request:string):boolean{
 const t=request.trim();
 if(/\[引用元素\]|\[引用节点\]/.test(t)||/(?:不要|不用|无需|不必|别)\s*(?:再)?(?:生成|创建|设计|制作|做)[^，。；\n]{0,12}(?:方案|版本)/.test(t))return false;
 if(!/(?:页面|画框|\S页|@|\b(?:page|screen)\b)/i.test(t)||!/(?:生成|创建|设计|制作|给|做|来|\b(?:create|generate|design|build)\b)/i.test(t))return false;
 const choices=/(?:多个|多种|多套|不同|[0-9一二两三四五六七八九十百千万亿]+\s*(?:个|种|套))\s*(?:不同的?)?(?:设计)?方案|(?:多个|不同|[0-9一二两三四五六七八九十百千万亿]+\s*个)\s*(?:设计)?版本|(?:[0-9]+|multiple|several)\s+(?:(?:design|page)\s+)?(?:variants|alternatives|versions|options)\b/gi;
 return Array.from(t.matchAll(choices)).some(match=>{
  const prefix=t.slice(0,match.index).split(/[，,。；;\n]/).at(-1)??'';
  const verbs=Array.from(prefix.matchAll(/生成|创建|设计|制作|给|做|来|展示|包含|列出|提供|选择|切换|\b(?:create|generate|design|build|show|include|display)\b/gi));
  const last=verbs.at(-1)?.[0];
  return Boolean(last&&!/展示|包含|列出|提供|选择|切换|show|include|display/i.test(last));
 });
}
export function requestedVariantCount(request:string):number|undefined{
 const match=request.match(/([0-9]+|[一二两三四五六七八九十百千万亿]+)\s*(?:个|种|套)\s*(?:不同的?)?(?:设计)?(?:方案|版本)|\b([0-9]+)\s+(?:(?:design|page)\s+)?(?:variants|alternatives|versions|options)\b/i);
 return match?requestedPageCount(`${match[1]??match[2]}页`):undefined;
}
export function validateVariantItems(value:unknown):asserts value is MultiPageItem[]{
 validateMultiPageItems(value,2);
 if(value.length>4||value.some(p=>p.links.length))throw Error('同页比较应有2～4个方案，方案之间不能设置业务页面关联。');
}

/** Only explicit multi-page creation. Single-page requests may mention many read-only reference pages. */
export function requiresMultiPagePlan(request:string):boolean{
 const t=request.trim();
 if(!/(?:新建|创建|生成|设计|制作|做|\b(?:create|generate|design|build)\b)/i.test(t))return false;
 if(/(?:新建|创建|生成|设计|做)(?:一个|一张|1个|1张|单个)[^，。；\n]{0,12}页|\b(?:one|single|1)\s+(?:new\s+)?(?:page|screen)\b/i.test(t))return false;
 return /多(?:个)?页面|多画框|[百千万亿]\s*(?:个|张)?(?:页面|画框|页)|(?:[2-9]|\d{2,}|[二两三四五六七八九十])\s*(?:个|张)?(?:新)?(?:页面|画框|页)|(?:整套|全套|一套)[^。\n]{0,14}(?:页面|设计)|(?:页面|页)\s*[、和及与]\s*[^。！\n]{0,20}(?:页面|页)|\b(?:multiple|several|[2-9]|\d{2,})\s+(?:new\s+)?(?:pages|screens)\b|\b(?:create|design|generate|build)\b[^.\n]{0,120}\b(?:pages|screens)\b/i.test(t);
}
export function requestedPageCount(request:string):number|undefined{
 const match=request.match(/([0-9]+|[一二两三四五六七八九十百千万亿]+)\s*(?:(?:个|张)?(?:新)?(?:页面|画框|页)|(?:new\s+)?(?:pages|screens)\b)/i);
 if(!match)return;
 if(/[百千万亿]/.test(match[1]))return Infinity;
 const number=Number(match[1]);if(Number.isFinite(number))return number;
 const units:Record<string,number>={一:1,二:2,两:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9};
 const parts=match[1].split('十');return parts.length===1?units[match[1]]:((parts[0]?units[parts[0]]:1)*10+(parts[1]?units[parts[1]]:0));
}
export function validateMultiPageItems(value:unknown,min=1):asserts value is MultiPageItem[]{
 if(!Array.isArray(value)||value.length<min||value.length>8)throw Error(`页面计划应包含 ${min}～8 个页面，请拆分更大的任务。`);
 const ids=new Set<string>(),names=new Set<string>();
 for(const page of value){
  if(!page||typeof page.id!=='string'||!/^[-\w]{1,100}$/.test(page.id)||ids.has(page.id)||typeof page.name!=='string'||!page.name.trim()||page.name.length>20||names.has(page.name.trim())||typeof page.requirements!=='string'||!page.requirements.trim()||page.requirements.length>1600||!Array.isArray(page.links)||page.links.some((id:unknown)=>typeof id!=='string')||new Set(page.links).size!==page.links.length)throw Error('页面名称需唯一且不超过20字，要求不能为空或过长，页面ID/关联必须有效。');
  ids.add(page.id);names.add(page.name.trim());
 }
 for(const page of value)if(page.links.some((id:string)=>!ids.has(id)||id===page.id))throw Error(`「${page.name}」关联了不存在的页面或自身，请重新选择关联。`);
}
export const multiPagePlanFingerprint=(plan:MultiPagePlan)=>contentFingerprint(JSON.stringify(plan));
export function validMultiPageScope(value:unknown):value is MultiPageScope{
 const v=value as MultiPageScope|undefined;
 return Boolean(v&&v.version===1&&(v.kind===undefined||v.kind==='variants')&&(v.kind!=='variants'||(v.total>=2&&v.total<=4&&v.originalPageCount<=4&&Array.isArray(v.requiredTargetIds)&&v.requiredTargetIds.length===0))&&typeof v.planId==='string'&&v.planId&&typeof v.planFingerprint==='string'&&/^[a-f0-9]{8}$/.test(v.planFingerprint)&&typeof v.itemId==='string'&&v.itemId&&typeof v.screenId==='string'&&v.screenId&&typeof v.name==='string'&&v.name.trim()&&v.name.length<=20&&Number.isInteger(v.total)&&v.total>=1&&v.total<=8&&Number.isInteger(v.index)&&v.index>=0&&v.index<v.total&&Number.isInteger(v.originalPageCount)&&v.originalPageCount>=2&&v.originalPageCount<=8&&v.total<=v.originalPageCount&&Array.isArray(v.pageIds)&&v.pageIds.length===v.total&&v.pageIds.every(id=>typeof id==='string'&&id)&&new Set(v.pageIds).size===v.total&&v.pageIds[v.index]===v.screenId&&Array.isArray(v.requiredTargetIds)&&new Set(v.requiredTargetIds).size===v.requiredTargetIds.length&&v.requiredTargetIds.every(id=>typeof id==='string'&&id!==v.screenId&&v.pageIds.includes(id)));
}
export function inspectMultiPageScope(contract:DesignTaskContract,screen:Screen,existingIds:string[]):string|undefined{
 const scope=contract.multiPage;
 if(!scope)return requiresPageVariantPlan(contract.request)?'多方案需求必须先确认方案计划，不能按普通单页交付。':requiresMultiPagePlan(contract.request)?'多页面需求必须先确认页面计划，不能按普通单页交付。':undefined;
 if(requiresPageVariantPlan(contract.request)&&scope.kind!=='variants')return '同页方案需求不能使用多业务页范围降级交付。';
 if(!validMultiPageScope(scope)||screen.id!==scope.screenId||screen.name!==scope.name||!contract.allowedChanges.includes(`planned-page:${scope.planId}:${scope.itemId}`))return '当前页与已确认多页面计划的身份或授权不一致。';
 const doc=new DOMParser().parseFromString(screen.htmlContent,'text/html'),targets=Array.from(doc.querySelectorAll('[data-target-screen-id]')).map(n=>n.getAttribute('data-target-screen-id')!);
 if(targets.some(id=>scope.pageIds.includes(id)&&!scope.requiredTargetIds.includes(id)))return '页面包含未在确认计划中选择的页面关联。';
 if(targets.some(id=>!scope.pageIds.includes(id)&&!existingIds.includes(id)))return '页面包含指向计划和当前工程之外的静态跳转。';
 if(scope.requiredTargetIds.some(id=>!targets.includes(id)))return '页面缺少已确认计划中的静态页面关联。';
}
export function isMultiPageDelivery(value:unknown):value is MultiPageDelivery{
 const d=value as MultiPageDelivery|undefined;
 try{
  if(!d||d.version!==1||(d.kind!==undefined&&d.kind!=='variants')||typeof d.planId!=='string'||!d.planId||typeof d.planFingerprint!=='string'||!/^[a-f0-9]{8}$/.test(d.planFingerprint)||typeof d.request!=='string'||!d.request.trim()||d.request.length>16000||typeof d.summary!=='string'||!d.summary.trim()||d.summary.length>500||!Number.isFinite(d.confirmedAt)||!d.planning||!Number.isFinite(d.planning.checkedAt)||![1,2].includes(d.planning.attempts)||!Number.isInteger(d.originalPageCount)||d.originalPageCount<2||d.originalPageCount>8)return false;
  if(d.kind==='variants'){validateVariantItems(d.pages);if(d.originalPageCount>4||d.planning.contract?.workflowId!=='plan-page-variants')return false;}else validateMultiPageItems(d.pages);
  return d.pages.length<=d.originalPageCount&&d.pages.every(p=>typeof p.screenId==='string'&&Boolean(p.screenId))&&new Set(d.pages.map(p=>p.screenId)).size===d.pages.length;
 }catch{return false;}
}
