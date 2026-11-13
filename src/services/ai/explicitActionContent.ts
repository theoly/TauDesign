import type {DesignTaskContract} from './designWorkflow';
import type {QualityFinding} from './generationQuality';
import {assessedFinding} from './findingPolicy';

export type ContentTask = Pick<DesignTaskContract,'request'|'elementNid'|'multiPage'>&Partial<Pick<DesignTaskContract,'referenceImage'|'pageTaskPlan'|'businessTextReview'>>;
export interface ExplicitActionText {text:string;nid?:string}
export const actionTextSelector='button,a[href],[role="button"],input[type="submit"],input[type="button"]';
const normalize=(text:string)=>text.normalize('NFC').replace(/\s+/g,' ').trim();

/** Intentionally narrow user sentence syntax. Never parse plans/documents for new requirements. */
export function explicitUserTextDeclarations(task:ContentTask|string|undefined,subject:'action'|'field-label'):ExplicitActionText[] {
  if(!task || (typeof task!=='string'&&task.multiPage))return [];
  const request=typeof task==='string'?task:task.request;
  if(typeof request!=='string')return [];
  const result:ExplicitActionText[]=[];
  let fence:string|undefined,contextOnly=false;
  let paragraph:ExplicitActionText[]=[];
  const flush=()=>{if(!contextOnly)for(const item of paragraph)if(!result.some(existing=>normalize(existing.text)===normalize(item.text)))result.push(item);paragraph=[];contextOnly=false;};
  for(const raw of request.split(/\r?\n/)){
    const line=raw.trim(),mark=/^(`{3,}|~{3,})/.exec(line)?.[1];
    if(!line){if(!fence)flush();continue;}
    if(mark){if(!fence)fence=mark[0];else if(mark[0]===fence)fence=undefined;continue;}
    if(fence||line.startsWith('>'))continue;
    if(/^(?:例如|示例|举例|引用(?:内容)?|参考(?:文档|资料)|文档(?:内容)?|(?:请)?不要|不得|禁止|是否|可否|假设|如果).*[:：]$/.test(line)||/^(?:以上|以下|这些|这个)?(?:仅为示例|只是举例)/.test(line)){contextOnly=true;paragraph=[];continue;}
    if(contextOnly)continue;
    const match=(subject==='action'?/^(?:(?:[-*]|\d+[.)、．])\s*)?(?:请)?(?:将|把)?(?:(?:主|提交|保存|确认|底部主|底部)?按钮|主?CTA)文案(?:必须为|改为|改成|修改为|设置为|设为|缩短为)\s*[:：]?\s*(?:“([^”\n]{1,240})”|「([^」\n]{1,240})」|‘([^’\n]{1,240})’|"([^"\n]{1,240})"|'([^'\n]{1,240})')\s*[。.;；！!]?$/:/^(?:(?:[-*]|\d+[.)、．])\s*)?(?:请)?(?:将|把)?(?:字段标签|输入框标签)(?:文案)?(?:必须为|改为|改成|修改为|设置为|设为|缩短为)\s*[:：]?\s*(?:“([^”\n]{1,240})”|「([^」\n]{1,240})」|‘([^’\n]{1,240})’|"([^"\n]{1,240})"|'([^'\n]{1,240})')\s*[。.;；！!]?$/).exec(line);
    if(!match)continue;
    const text=match.slice(1).find(value=>value!==undefined)!;
    if(!normalize(text))continue;
    paragraph.push({text,...(typeof task!=='string'&&task.elementNid?{nid:task.elementNid}:{})});
  }
  flush();
  return result;
}

export function explicitActionTexts(task:ContentTask|string|undefined):ExplicitActionText[]{return explicitUserTextDeclarations(task,'action');}

function sourceVisible(el:Element):boolean {
  for(let cur:Element|null=el;cur;cur=cur.parentElement){
    const style=(cur as HTMLElement).style;
    if(cur.hasAttribute('hidden')||style?.display==='none'||['hidden','collapse'].includes(style?.visibility)||style?.opacity==='0')return false;
  }
  return true;
}
export interface ActionTextObservation {text:string;uncertain?:boolean}
/** Direct text nodes only; no aria/title/placeholder borrowing or DOM mutation. */
export function sourceLiteralText(el:Element,fieldLabel=false):ActionTextObservation {
  if(!sourceVisible(el))return {text:''};
  if(el.matches('input'))return {text:el.getAttribute('value')??''};
  const walker=el.ownerDocument.createTreeWalker(el,4);const parts:string[]=[];let node:Node|null;
  while((node=walker.nextNode())){
    const parent=node.parentElement;
    if(parent&&!parent.closest('svg,script,style,template,noscript')&&(!fieldLabel||!parent.closest('input,select,textarea,button,[aria-hidden="true"]'))&&sourceVisible(parent))parts.push(node.nodeValue??'');
  }
  return {text:parts.join('')};
}

export function sourceActionText(el:Element):ActionTextObservation{return sourceLiteralText(el);}

function actionCandidates(doc:Document,requirement:ExplicitActionText):Element[]{
  const scope=requirement.nid?Array.from(doc.querySelectorAll('[data-nid]')).filter(el=>el.getAttribute('data-nid')===requirement.nid):undefined;
  return Array.from(doc.querySelectorAll(actionTextSelector)).filter(action=>!scope||scope.length===1&&(scope[0]===action||scope[0].contains(action)));
}
export function sourceActionTargets(doc:Document,requirement:ExplicitActionText):Element[]{
  return actionCandidates(doc,requirement).filter(action=>normalize(sourceActionText(action).text)===normalize(requirement.text));
}

/** Existence of literal action text only; not primary-action selection or business correctness. */
export function inspectExplicitActionTexts(doc:Document,requirements:ExplicitActionText[],observe=sourceActionText):QualityFinding[] {
  return requirements.flatMap(requirement=>{
    const eligible=actionCandidates(doc,requirement);
    const observed=eligible.map(el=>({el,...observe(el)}));
    if(observed.some(value=>!value.uncertain&&normalize(value.text)===normalize(requirement.text)))return [];
    const uncertain=observed.some(value=>value.uncertain);
    const sourceTargets=sourceActionTargets(doc,requirement);
    const sourceNid=sourceTargets.length===1?sourceTargets[0].getAttribute('data-nid'):undefined;
    return [assessedFinding(uncertain?'required-action-text-support':'required-action-text',uncertain?'unverified':'failed',{
      code:uncertain?'required_action_text_unverified':'required_action_text_missing',
      nid:sourceNid??requirement.nid??observed[0]?.el.getAttribute('data-nid')??undefined,
      message:uncertain?'指定按钮原文的可见性尚未验证。':'指定按钮原文未在操作控件上完整呈现。',
      actual:uncertain?'存在当前检查不支持的变换、裁切或文字测量':`要求“${requirement.text}”；${eligible.length?'未找到完整匹配的操作文案':'指定范围内没有可核对的操作控件'}`,
      expected:`在本次授权范围内完整展示“${requirement.text}”；不能用旁文、隐藏文字或无障碍名称替代`,
    })];
  });
}
