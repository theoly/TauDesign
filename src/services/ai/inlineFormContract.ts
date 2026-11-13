import {inspectText} from '../../utils/textNode';
import {associatedField,sourceFieldLabelText} from './explicitFieldContent';
import {referenceFieldLabelAliases,normalizeFieldLabel} from './referenceFieldNames';
import type {QualityFinding} from './generationQuality';
import type {ActionTextObservation} from './explicitActionContent';

export interface InlineFormContract {title:string;fields:string[]}
const negated=/(?:不要|不能|不得|禁止|无需|不改|勿|是否|可否|例如|示例|\b(?:not|never)\b)/i;
const norm=(s:string)=>s.replace(/\s+/g,'').trim();
function userLines(request:string):string[]{
 const lines:string[]=[];let fence:string|undefined;
 for(const raw of request.split(/\n/)){const line=raw.trim(),mark=/^(`{3,}|~{3,})/.exec(line)?.[1];if(mark){if(!fence)fence=mark[0];else if(mark[0]===fence)fence=undefined;continue;}if(!fence&&!line.startsWith('>'))lines.push(raw);}
 return lines;
}
/** Narrow declarations from the user's request only; plans and image observations cannot grant conversion. */
export function inlineFormContracts(request:string):InlineFormContract[]{
 const result:InlineFormContract[]=[];
 for(const line of userLines(request)){
  if(negated.test(line))continue;
  const title=/^\s*(?:\d+[.、]\s*)?(?:将|把)?([^：:\n]{1,24}?)(?:任务|区块)(?:改为|改成)内联[^：:\n]{0,16}表单(?:区|区块)?[：:]/.exec(line)?.[1]?.trim();
  const list=/(?:字段行列表[（(]([^()（）]+)[）)]|下方新增([^。\n]+?)等条件行)/.exec(line);
  if(!title||!list)continue;
  const fields=(list[1]??list[2]).split(/[、，,]/).map(s=>s.trim());
  if(fields.length<2||fields.length>12||fields.some(s=>!s||s.length>20)||new Set(fields).size!==fields.length)continue;
  const existing=result.find(c=>c.title===title);
  if(existing&&JSON.stringify(existing.fields)!==JSON.stringify(fields))throw Error('同一任务存在冲突的内联字段清单。');
  if(!existing)result.push({title,fields});
 }
 return result;
}
export function requestedProgressSummary(request:string):string|undefined {
 const values:string[]=[];
 for(const line of userLines(request).flatMap(line=>line.split(/[。；;]/))){
  if(negated.test(line)||!/(?:进度摘要条|完成度摘要条).{0,20}(?:改为|改成|替换为)/.test(line))continue;
  const matches=[...line.matchAll(/[“「"]((?:已填|已完成)\s*(\d+)\s*\/\s*(\d+))[”」"]/g)];
  if(matches.length!==1)continue;
  const match=matches[0];if(Number(match[3])<1||Number(match[2])>Number(match[3]))throw Error('进度摘要的新计数无效，请确认分子和分母。');
  values.push(match[1].trim());
 }
 if(new Set(values.map(norm)).size>1)throw Error('进度摘要存在多个冲突的新计数。');
 return values[0];
}
export function renderExplicitUiRequirements(request:string):string{
 const forms=inlineFormContracts(request),progress=requestedProgressSummary(request);
 if(!forms.length&&!progress)return '';
 return '\n### 用户明确的UI完成条件（程序派生，不扩大范围）\n'+JSON.stringify({inlineForms:forms,...(progress?{progressSummary:progress}:{})})+'\n内联字段须在同名分组内使用可填写的input/select/textarea和唯一关联label；不能只画字段按钮、箭头或旁文。明确只读字段使用独立只读展示合同。规划须覆盖所有明确字段，超过每组容量时可拆同任务子组，不得漏项。替换旧入口后不用保留失效的去完成提示，但必须完整实现对应表单；原控件属性、无关原文仍保留。只在当前分区负责的功能落实，不在其它分区重复生成全部表单。';
}
function visibleSource(el:Element):boolean {
 for(let cur:Element|null=el;cur;cur=cur.parentElement){const s=(cur as HTMLElement).style;if(cur.hasAttribute('hidden')||cur.getAttribute('aria-hidden')==='true'||cur.classList.contains('hidden')||cur.classList.contains('sr-only')||s?.display==='none'||['hidden','collapse'].includes(s?.visibility)||s?.opacity==='0')return false;}
 return true;
}
function labelsFor(contract:InlineFormContract,field:string){
 const names=referenceFieldLabelAliases(field);
 if(contract.title==='择偶要求'&&['年龄','身高'].includes(field))names.push(field+'区间');
 return names.map(normalizeFieldLabel);
}
function groupsFor(doc:Document,title:string):Element[]{
 const headings=Array.from(doc.body.querySelectorAll('h1,h2,h3,h4,legend,span,strong,div')).filter(el=>inspectText(el).text.trim()===title&&visibleSource(el));
 return [...new Set(headings.map(el=>el.closest('.card,fieldset,article,section,[role="group"]')).filter((el):el is Element=>Boolean(el)))];
}
function fieldRows(group:Element,contract:InlineFormContract,field:string){
 return Array.from(group.querySelectorAll('label')).flatMap(label=>{
  const control=associatedField(label),name=normalizeFieldLabel(sourceFieldLabelText(label).text);
  return control&&group.contains(control)&&!control.hasAttribute('disabled')&&!control.hasAttribute('readonly')&&visibleSource(label)&&visibleSource(control)&&labelsFor(contract,field).includes(name)?[{label,control}]:[];
 });
}
/** Same-group native controls must actually replace the old entry, not an unrelated form elsewhere. */
export function inspectInlineForms(doc:Document,request:string,observe?:(el:Element)=>ActionTextObservation):QualityFinding[]{
 let contracts:InlineFormContract[];try{contracts=inlineFormContracts(request);}catch(error){return [{code:'inline_form_contract_invalid',severity:'error',message:String(error instanceof Error?error.message:error),actual:'字段清单冲突',expected:'明确的唯一字段清单'}];}
 return contracts.flatMap(contract=>{
  const groups=groupsFor(doc,contract.title),eligible=groups.filter(group=>contract.fields.every(field=>fieldRows(group,contract,field).length===1)),complete=eligible.filter(group=>!eligible.some(other=>other!==group&&group.contains(other)));
  if(complete.length!==1)return [{code:'inline_form_incomplete',severity:'error' as const,message:`“${contract.title}”尚未形成唯一完整的内联表单。`,actual:complete.length>1?'存在多个符合条件的分组':'缺少同组有效label及可填写的原生控件',expected:contract.fields.join('、')}];
  if(!observe)return [];
  return contract.fields.flatMap(field=>{
   const row=fieldRows(complete[0],contract,field)[0],observed=observe(row.label),control=row.control as HTMLElement,view=doc.defaultView;
   const rect=control.getBoundingClientRect();let controlVisible=rect.width>0&&rect.height>0;
   for(let cur:Element|null=control;cur&&view;cur=cur.parentElement){const s=view.getComputedStyle(cur);if(s.display==='none'||['hidden','collapse'].includes(s.visibility)||Number(s.opacity||1)===0)controlVisible=false;}
   return controlVisible&&!observed.uncertain&&labelsFor(contract,field).includes(normalizeFieldLabel(observed.text))?[]:[{code:'inline_form_unverified',severity:'error' as const,nid:row.label.getAttribute('data-nid')??undefined,message:`“${contract.title}”的“${field}”标签或控件未完整可见。`,actual:'隐藏、裁切、零尺寸或无法可靠测量',expected:'同组可见完整标签与可填写原生控件'}];
  });
 });
}
/** Only one exactly named old entry, with a completely realized replacement form, is superseded. */
export function replacedInlineActions(baseline:Document,result:Document,request:string):Set<Element>{
 const replaced=new Set<Element>();
 if(inspectInlineForms(result,request).length)return replaced;
 for(const contract of inlineFormContracts(request)){
  const buttons=Array.from(baseline.querySelectorAll('button,a[href],[role="button"]')).filter(button=>Array.from(button.querySelectorAll('*')).some(el=>inspectText(el).text.trim()===contract.title));
  if(buttons.length!==1)continue;
  replaced.add(buttons[0]);
 }
 return replaced;
}
export function replacedInlineEntryNids(baseline:Document,result:Document,request:string):Set<string>{
 const replaced=new Set<string>();
 for(const button of replacedInlineActions(baseline,result,request))for(const el of Array.from(button.querySelectorAll('[data-nid]')))if(/^(?:去完成|去填写|去设置)$/.test(inspectText(el).text.trim()))replaced.add(el.getAttribute('data-nid')!);
 return replaced;
}
export function inspectProgressSummary(doc:Document,request:string,observe?:(el:Element)=>ActionTextObservation):QualityFinding[]{
 let desired:string|undefined;try{desired=requestedProgressSummary(request);}catch(error){return [{code:'progress_summary_invalid',severity:'error',message:String(error instanceof Error?error.message:error),actual:'新计数无效或冲突',expected:'明确且有效的新进度计数'}];}
 if(!desired)return [];
 const matches=Array.from(doc.body.querySelectorAll('*')).filter(el=>inspectText(el).text.trim()===desired&&visibleSource(el));
 const observed=matches.map(el=>observe?observe(el):{text:desired});
 return observed.some(value=>!value.uncertain&&norm(value.text)===norm(desired!))?[]:[{code:'progress_summary_not_applied',severity:'error',message:'用户明确指定的进度计数未完整呈现。',actual:'缺失、隐藏或无法可靠测量',expected:desired}];
}
