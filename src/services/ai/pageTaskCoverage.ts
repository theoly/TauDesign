import type {DesignTaskContract} from './designWorkflow';
import {contentFingerprint} from './designWorkflow';
import {pageTaskPlanIssue} from './pageTaskPlan';
import {parseHtmlCopy} from '../../utils/htmlDocument';
import {inspectText} from '../../utils/textNode';

export interface PageTaskCoverageItem {
  featureId:string;featureTitle:string;kind:'input'|'display'|'interaction'|'state';label:string;
  status:'source-indication'|'not-located'|'scenario-only';nids:string[];
}
export type PageTaskCoverageReport={status:'unavailable';message:string}|{
  status:'available';htmlFingerprint:string;planFingerprint:string;semanticStatus:'unverified';
  items:PageTaskCoverageItem[];unlocatedCount:number;completion:string[];
};
const excluded='script,style,template,noscript,svg,[hidden],[aria-hidden="true"],.hidden,input[type="hidden"]';
function sourceEligible(el:Element):boolean {
  if(el.closest(excluded))return false;
  for(let cur:Element|null=el;cur;cur=cur.parentElement){
    const style=(cur as HTMLElement).style;
    if(style?.display==='none'||['hidden','collapse'].includes(style?.visibility))return false;
  }
  return true;
}
const normalized=(text:string)=>text.normalize('NFKC').toLowerCase().replace(/\s+/g,'');
function sourceText(el:Element):string {
  return [el,...Array.from(el.querySelectorAll('*'))].filter(sourceEligible).map(node=>inspectText(node).text).join('');
}
function accessibleNames(el:Element,doc:Document):string[] {
  const ids=el.getAttribute('aria-labelledby')?.trim().split(/\s+/).filter(Boolean)??[];
  const references=ids.flatMap(id=>{const nodes=Array.from(doc.querySelectorAll('[id]')).filter(n=>n.id===id&&sourceEligible(n));return nodes.length===1?[sourceText(nodes[0])]:[];});
  return [sourceText(el),...references,...['aria-label','placeholder','title'].map(attr=>el.getAttribute(attr)??''),
    ...(el.matches('input[type="submit"],input[type="button"]')?[el.getAttribute('value')??'']:[])];
}
/** Recomputed diagnostics only. Source labels do not prove appearance, behavior or business correctness. */
export function inspectPageTaskCoverage(contract:DesignTaskContract|undefined,html:string):PageTaskCoverageReport|undefined {
  if(!contract?.pageTaskPlan)return;
  const issue=pageTaskPlanIssue(contract);if(issue)return {status:'unavailable',message:issue};
  if(!html.trim()||html.length>500_000)return {status:'unavailable',message:'页面源码为空或超过检查上限，尚无覆盖记录。'};
  const doc=parseHtmlCopy(html).doc,all=Array.from(doc.body.querySelectorAll('*'));
  if(all.length>10000)return {status:'unavailable',message:'页面节点超过检查上限，请按区块核对需求。'};
  const elements=all.filter(sourceEligible),items:PageTaskCoverageItem[]=[];
  const inputs=elements.filter(el=>el.matches('input:not([type="submit"]):not([type="button"]):not([type="reset"]),textarea,select,[contenteditable="true"]'));
  const actions=elements.filter(el=>el.matches('button,a[href],[role="button"],input[type="submit"],input[type="button"]'));
  const labels=new Map<string,string[]>();
  for(const label of elements.filter(el=>el.matches('label[for]'))){const id=label.getAttribute('for')!;labels.set(id,[...(labels.get(id)??[]),sourceText(label)]);}
  const inputNames=(el:Element)=>[...accessibleNames(el,doc),...(el.closest('label')?[sourceText(el.closest('label')!)]:[]),...(labels.get(el.id)??[])];
  const names=new Map(elements.map(el=>[el,inputs.includes(el)?inputNames(el):actions.includes(el)?accessibleNames(el,doc):[inspectText(el).text]]));
  for(const feature of contract.pageTaskPlan.plan.features){
    if(feature.change==='remove')continue;
    const locate=(kind:PageTaskCoverageItem['kind'],label:string)=>{
      const needle=normalized(label),pool=kind==='input'?inputs:kind==='interaction'?actions:elements;
      const found=pool.filter(el=>(kind==='display'?[inspectText(el).text]:names.get(el)!).some(name=>normalized(name).includes(needle)));
      items.push({featureId:feature.id,featureTitle:feature.title,kind,label,status:found.length?'source-indication':'not-located',
        nids:[...new Set(found.map(el=>el.getAttribute('data-nid')).filter((nid):nid is string=>Boolean(nid)))].slice(0,8)});
    };
    for(const info of feature.information)locate(info.kind,info.label);
    for(const action of feature.interactions)locate('interaction',action.label);
    for(const state of feature.states)items.push({featureId:feature.id,featureTitle:feature.title,kind:'state',label:`${state.name}：${state.condition} → ${state.feedback}`,status:'scenario-only',nids:[]});
  }
  return {status:'available',htmlFingerprint:contentFingerprint(html),planFingerprint:contract.pageTaskPlan.bindingFingerprint,semanticStatus:'unverified',items,
    unlocatedCount:items.filter(i=>i.status==='not-located').length,completion:[...contract.pageTaskPlan.plan.completion]};
}
