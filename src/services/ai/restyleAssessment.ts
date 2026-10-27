import { parseHtmlCopy } from '../../utils/htmlDocument';
import { extractClassWhitelist } from '../../utils/cssCompiler';
import { getBaseCss, type DeviceProfile } from '../../styles/baseCss';
import type { RestylePlan, RestyleTarget } from './restyleService';
export const restyleTargetKey = (target: RestyleTarget) => `${target.kind}:${target.id}`;
export interface RestyleAssessment { recommended: boolean; selectable: boolean; reason: string }
/** Local theme-binding preflight only; this cannot assess visual quality. */
export function assessRestyleTarget(target: RestyleTarget, options: {scopedCss?: string; imported?: boolean; deviceProfile?: DeviceProfile} = {}): RestyleAssessment {
 const {doc}=parseHtmlCopy(target.html);
 const nodes=Array.from(doc.body.querySelectorAll('*')).filter(el=>!['STYLE','SCRIPT','META','LINK'].includes(el.tagName));
 const content=doc.body.textContent?.trim() || doc.body.querySelector('img,svg,video,canvas,input,button');
 if(!nodes.length||!content)return {recommended:false,selectable:false,reason:'无实际内容，跳过'};
 const protectedSet=new Set(target.protectedNids);
 if(nodes.every(el=>{let node:Element|null=el;while(node){if(protectedSet.has(node.getAttribute('data-nid')??''))return true;node=node.parentElement;}return false;}))return {recommended:false,selectable:false,reason:'全部节点受手动样式保护，跳过'};
 const whitelist=new Set(extractClassWhitelist(getBaseCss(options.deviceProfile??'pc')));
 const unknown=nodes.some(el=>(el.getAttribute('class')??'').split(/\s+/).filter(Boolean).some(c=>!whitelist.has(c)&&!c.startsWith('aidesign-')));
 const source=Boolean(options.scopedCss?.trim()||doc.querySelector('style,link[rel="stylesheet"]')||nodes.some(el=>el.hasAttribute('style')));
 if(options.imported||source||unknown)return {recommended:true,selectable:true,reason:[options.imported?'导入页面需核对主题绑定':'',source?'含来源或独立样式，需核对主题绑定':'',unknown?'含未知类名，需核对样式':''].filter(Boolean).join('；')};
 return {recommended:false,selectable:true,reason:'已跟随主题，未发现必须重塑项；仅静态预检，未评估视觉美感，可勾选强制重塑'};
}
export function selectRestylePlan(plan: RestylePlan, selected: string[]): RestylePlan {
 const keys=new Set(selected),queue=plan.queue.filter(t=>keys.has(restyleTargetKey(t)));
 return {...plan,queue,dryRun:queue[0]??null,estimatedCalls:queue.length,naiveCalls:queue.reduce((n,t)=>n+(t.kind==='component'?Math.max(1,t.reuseCount??1):1),0)};
}
