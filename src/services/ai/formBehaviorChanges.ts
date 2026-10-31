import {parseHtmlCopy} from '../../utils/htmlDocument';
import type {DesignTaskContract} from './designWorkflow';
import {extractCleanUserPrompt} from './chatReferencePrompt';
/** Native static form-state changes only. This is request authorization, never model output. */
export interface FormRuleChange {clause:string;rule:'required'|'readonly'|'disabled'|'multiple';enabled:boolean}
const protectedClause=/不要|无需|无须|禁止|不得|保留|保持|不改|不调整|\b(?:do not|don't|without|keep|preserve)\b/i;
export function formRuleChanges(request:string):FormRuleChange[]{
 const result:FormRuleChange[]=[];
 const userRequest=extractCleanUserPrompt(request).replace(/```[\s\S]*?```|`[^`]*`/g,'');
 for(const clause of userRequest.split(/[，,。；;\n]|并(?:且)?|同时|以及|\band\b/i)){
  const instruction=clause.replace(/“[^”]*”|「[^」]*」|"[^"]*"|'[^']*'/g,'');
  if(protectedClause.test(instruction)||/文案|文本内容|label text|wording|caption/i.test(instruction))continue;
  const explicitState=/(?:设(?:置)?(?:为|成)?|改(?:为|成)|调整(?:为|成)|变(?:为|成)).{0,8}(?:必填|选填|可选|非必填|强制填写|只读|可编辑|不可编辑|可用|不可用|禁用)\s*$|\b(?:make|set|change).{0,45}\b(?:required|optional|read[ -]?only|editable|enabled|disabled)\s*$/i.test(instruction);
  if(/文字|字体|字号|颜色|配色|背景|阴影|边框|间距|color|background|shadow|spacing/i.test(instruction)&&!explicitState)continue;
  const change=/(?:设(?:置)?(?:为|成)?|改(?:为|成)|调整(?:为|成)|变(?:为|成)|切换(?:为|成)|取消|允许|启用|禁用|make|set|change|switch|convert|enable|disable)/i.test(instruction);
  if(!change)continue;
  const add=(rule:FormRuleChange['rule'],enabled:boolean)=>result.push({clause,rule,enabled});
  if(/取消(?:必填|强制填写)|(?:设(?:置)?(?:为|成)?|改(?:为|成)|调整(?:为|成)|变(?:为|成)).{0,8}(?:可选|选填|非必填)|\b(?:make|set|change).{0,45}\boptional\s*$/i.test(instruction))add('required',false);
  else if(/(?:设(?:置)?(?:为|成)?|改(?:为|成)|调整(?:为|成)|变(?:为|成)).{0,8}(?:必填|强制填写)|\b(?:make|set|change).{0,45}\brequired\s*$/i.test(instruction))add('required',true);
  if(!/不可编辑/.test(instruction)&&/取消只读|允许.{0,8}编辑|(?:设(?:置)?(?:为|成)?|改(?:为|成)|调整(?:为|成)|变(?:为|成)).{0,8}可编辑|\b(?:make|set|change).{0,45}\beditable\s*$/i.test(instruction))add('readonly',false);
  else if(/(?:设(?:置)?(?:为|成)?|改(?:为|成)|调整(?:为|成)|变(?:为|成)).{0,8}(?:只读|不可编辑)|\b(?:make|set|change).{0,45}\bread[ -]?only\s*$/i.test(instruction))add('readonly',true);
  if(!/不可用/.test(instruction)&&/取消禁用|启用|(?:设(?:置)?(?:为|成)?|改(?:为|成)|调整(?:为|成)|变(?:为|成)).{0,8}可用|\benable\b|\b(?:make|set|change).{0,45}\benabled\s*$/i.test(instruction))add('disabled',false);
  else if(/禁用|(?:设(?:置)?(?:为|成)?|改(?:为|成)|调整(?:为|成)|变(?:为|成)).{0,8}不可用|\bdisable\b|\b(?:make|set|change).{0,45}\bdisabled\s*$/i.test(instruction))add('disabled',true);
  if(/单选.{0,30}(?:改为|改成|调整为|变为|变成|切换为).{0,8}多选|(?:改为|改成|调整为|切换为).{0,6}多选|\b(?:change|switch|convert).{0,45}\bto\s+(?:a\s+)?(?:multi[ -]?select|multiple selection)\b/i.test(instruction))add('multiple',true);
  else if(/多选.{0,30}(?:改为|改成|调整为|变为|变成|切换为).{0,8}单选|(?:改为|改成|调整为|切换为).{0,6}单选|\b(?:change|switch|convert).{0,45}\bto\s+(?:a\s+)?(?:single[ -]?select|single selection)\b/i.test(instruction))add('multiple',false);
 }
 return result;
}
export interface FormAttributeChange {nid:string;attribute:'required'|'readonly'|'disabled'|'multiple'|'type'|'role'|'aria-required'|'aria-readonly'|'aria-disabled'|'aria-multiselectable';value:string|null}
const normalize=(s:string)=>s.replace(/\s+/g,'').replace(/[：:*＊]/g,'').trim().toLowerCase();
function labelText(label:Element):string {
 const copy=label.cloneNode(true) as Element;
 for(const control of Array.from(copy.querySelectorAll('input,select,textarea,button')))control.remove();
 return copy.textContent??'';
}
function labels(control:Element,root:Element):string[]{
 const id=control.getAttribute('id');
 const associated=Array.from(root.querySelectorAll('label')).filter(el=>id&&el.getAttribute('for')===id);
 const enclosing=control.closest('label'),group=control.closest('fieldset,[role="group"],[role="radiogroup"]');
 return [...associated.map(labelText),...(enclosing?[labelText(enclosing)]:[]),...(control.tagName==='BUTTON'?[control.textContent??'']:[]),
  ...(group?Array.from(group.querySelectorAll('legend')).map(el=>el.textContent??''):[]),
  ...['aria-label','placeholder','name','id'].map(a=>control.getAttribute(a)??'')].map(normalize).filter(Boolean);
}
/** Computed against the old authorized subtree. An unrecognized/ambiguous target never opens all fields. */
export function authorizedFormChanges(root:Element|Element[],request:string):FormAttributeChange[]{
 const rules=formRuleChanges(request);if(!rules.length)return [];
 const roots=Array.isArray(root)?root:[root];
 const nodes=[...new Set(roots.flatMap(el=>[el,...Array.from(el.querySelectorAll('*'))]))],changes=new Map<string,FormAttributeChange>();
 for(const rule of rules){
  const selector=rule.rule==='disabled'?'input,textarea,select,button':rule.rule==='readonly'?'input:not([type="radio"]):not([type="checkbox"]):not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="hidden"]),textarea':rule.rule==='multiple'?'select,input[type="radio"],input[type="checkbox"]':'input:not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="hidden"]),textarea,select';
  const eligible=nodes.filter(el=>(rule.rule==='multiple'?el.tagName==='SELECT'||(el.tagName==='INPUT'&&['radio','checkbox'].includes((el.getAttribute('type')??'').toLowerCase())):el.matches(selector))&&!(el.tagName==='INPUT'&&(rule.rule==='readonly'?['radio','checkbox','button','submit','reset','hidden','file','range','color']:rule.rule==='required'?['range','color']:[]).includes((el.getAttribute('type')??'text').toLowerCase()))),normalized=normalize(rule.clause);
  let targets:Element[]=[];
  if(/全部(?:字段|控件|选项)|所有(?:字段|控件|选项)|\ball (?:fields|controls|options)\b/i.test(rule.clause))targets=eligible;
  else{
   const ranked=eligible.map(el=>({el,score:Math.max(0,...labels(el,roots.find(r=>r.contains(el))!).filter(label=>normalized.includes(label)).map(label=>label.length))}));
   const best=Math.max(0,...ranked.map(r=>r.score));
   if(best)targets=ranked.filter(r=>r.score===best).map(r=>r.el);
   else if(eligible.length===1){
    const subject=rule.clause.replace(/(?:把|将|让|请|给|它|这个|该|此|当前|选中的|所选|输入框|字段|控件|按钮|表单|设置|设为|设成|改为|改成|调整为|调整成|切换为|切换成|变为|变成|取消|允许|启用|禁用|必填|选填|可选|非必填|强制填写|只读|可编辑|不可用|可用|单选|多选|可|为|成)/g,'')
      .replace(/\b(?:this|the|selected|current|input|field|control|button|set|make|change|switch|convert|from|to|required|optional|read[ -]?only|editable|enable|enabled|disable|disabled|single[ -]?select|multi[ -]?select|single|multiple|selection)\b/gi,'');
    if(!normalize(subject))targets=eligible;
   }
  }
  if(!targets.length)throw Error('功能规则调整无法定位可用控件，请明确字段或选择其完整容器。');
  // A named radio/checkbox set is one semantic target; all other equal matches are ambiguous.
  if(targets.length>1&&!/全部(?:字段|控件|选项)|所有(?:字段|控件|选项)|\ball (?:fields|controls|options)\b/i.test(rule.clause)&&
   !(rule.rule==='multiple'&&targets.every(el=>el.matches('input'))&&new Set(targets.map(el=>el.getAttribute('name'))).size===1&&targets[0].getAttribute('name')))throw Error('功能规则对应多个控件，请明确单个目标或明确全部控件。');
  for(const target of targets){
   const nid=target.getAttribute('data-nid');if(!nid||Array.from(target.ownerDocument.querySelectorAll('[data-nid]')).filter(el=>el.getAttribute('data-nid')===nid).length!==1)throw Error('功能规则目标缺少唯一稳定节点身份，请重新选择。');
   let attribute:FormAttributeChange['attribute']=rule.rule,value:string|null=rule.enabled?'':null;
   if(rule.rule==='multiple'&&target.tagName==='INPUT'){
    const name=target.getAttribute('name');if(!name)throw Error('选择组缺少稳定分组名称，不能安全转换单选与多选。');
    const group=Array.from(target.ownerDocument.querySelectorAll('input')).filter(el=>el.getAttribute('name')===name&&el.getAttribute('form')===target.getAttribute('form')&&el.closest('form')===target.closest('form')&&['radio','checkbox'].includes((el.getAttribute('type')??'').toLowerCase()));
    if(group.some(el=>!nodes.includes(el)))throw Error('本次范围只包含部分选择组，请选择完整组；不会扩大修改范围。');
    if(!rule.enabled&&group.filter(el=>el.hasAttribute('checked')||el.getAttribute('aria-checked')==='true').length>1)throw Error('多选组原有多项选中，请先明确并保留一个默认项，再改为单选；不会自动丢弃选择。');
    // Matching a group's label authorizes its whole set inside the exact root.
    for(const member of group)if(!targets.includes(member))targets.push(member);
    attribute='type';value=rule.enabled?'checkbox':'radio';
   }
   const key=`${nid}:${attribute}`,previous=changes.get(key);
   if(previous&&previous.value!==value)throw Error('同一控件的功能规则互相冲突，请明确最终状态。');
   changes.set(key,{nid,attribute,value});
   if(attribute==='type'&&['radio','checkbox'].includes(target.getAttribute('role')??''))changes.set(`${nid}:role`,{nid,attribute:'role',value});
   const aria=rule.rule==='multiple'?'aria-multiselectable':`aria-${rule.rule}`;
   if(attribute!=='type'&&target.hasAttribute(aria))changes.set(`${nid}:${aria}`,{nid,attribute:aria as FormAttributeChange['attribute'],value:rule.enabled?'true':'false'});
  }
 }
 return [...changes.values()].sort((a,b)=>nodes.findIndex(el=>el.getAttribute('data-nid')===a.nid)-nodes.findIndex(el=>el.getAttribute('data-nid')===b.nid));
}
/** Boolean HTML attributes may serialize as empty or their own name, but not a different state. */
export function matchesFormAttribute(el:Element,change:FormAttributeChange):boolean{
 if(change.value===null)return !el.hasAttribute(change.attribute);
 return change.attribute==='type'||change.attribute==='role'||change.attribute.startsWith('aria-')?el.getAttribute(change.attribute)?.toLowerCase()===change.value:el.hasAttribute(change.attribute)&&['',change.attribute].includes(el.getAttribute(change.attribute)!.toLowerCase());
}
export function formRuleScope(contract?:Pick<DesignTaskContract,'elementNid'|'allowedChanges'>):string[]|undefined {
 if(contract?.elementNid)return [contract.elementNid];
 if(Array.isArray(contract?.allowedChanges)&&contract.allowedChanges.length&&contract.allowedChanges.every(s=>typeof s==='string'&&s.startsWith('element:')))return contract.allowedChanges.map(s=>s.slice(8));
}
/** Recomputed from the actual baseline and request, including when an old candidate is adopted. */
export function inspectFormRuleChanges(baseline:string,html:string,request:string,rootNids?:string[]):Array<{nid?:string;message:string;actual:string;expected:string}> {
 if(!formRuleChanges(request).length)return [];
 try{
  const before=parseHtmlCopy(baseline).doc,after=parseHtmlCopy(html).doc;
  const roots=rootNids?rootNids.map(nid=>{
   const found=Array.from(before.querySelectorAll('[data-nid]')).filter(el=>el.getAttribute('data-nid')===nid);
   if(found.length!==1)throw Error('本次控件规则范围不存在或标识不唯一。');return found[0];
  }):[before.body];
  return authorizedFormChanges(roots,request).flatMap(change=>{
   const old=Array.from(before.querySelectorAll('[data-nid]')).find(el=>el.getAttribute('data-nid')===change.nid)!;
   const found=Array.from(after.querySelectorAll('[data-nid]')).filter(el=>el.getAttribute('data-nid')===change.nid);
   return found.length===1&&found[0].tagName===old.tagName&&matchesFormAttribute(found[0],change)?[]:[{nid:change.nid,
    message:'本次明确要求的原生控件规则尚未落实，请保留目标身份并修改对应状态。',actual:found.length===1?`${found[0].tagName}.${change.attribute}=${found[0].getAttribute(change.attribute)}`:'目标节点缺失或重复',
    expected:change.value===null?`移除${change.attribute}`:`${change.attribute}=${change.value||'启用'}`}];
  });
 }catch(error){return [{message:error instanceof Error?error.message:'无法定位本次控件规则。',actual:'目标不明确或范围不可用',expected:'明确字段或完整选择组，不扩大授权范围'}];}
}
