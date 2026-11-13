import {normalizeFieldLabel,referenceFieldLabelAliases} from './referenceFieldNames';
import {sourceFieldLabelText,associatedField} from './explicitFieldContent';
/** Derived from explicit user requirements; never amend the stored image observation. */
export function referenceFieldMode(label:string,request:string):'input'|'readonly'{
 label=normalizeFieldLabel(label);
 const names=referenceFieldLabelAliases(label).map(normalizeFieldLabel);
 const clauses=request.split(/[。；;\n]/);
 const mentions=(clause:string)=>clause.split(/[、，,：:（()）\s]/).some(part=>names.includes(normalizeFieldLabel(part))||names.includes(normalizeFieldLabel(part.replace(/(?:字段)?(?:为|设为|改为)?(?:只读|readonly)$/i,'').replace(/(?:等|[一二三四五六七八九十\d]+行|字段|四项)$/,''))));
 return clauses.some(clause=>mentions(clause)&&/(?:只读|readonly)/i.test(clause)&&!/(?:不要|不得|不能|取消|移除|去掉|不再|非).{0,8}(?:只读|readonly)/i.test(clause)&&!/(?:改为|改成|设为|变为).{0,5}(?:可编辑|可输入)/.test(clause))?'readonly':'input';
}
export function readonlyFieldLabels(doc:Document):string[]{
 return Array.from(doc.querySelectorAll('dt')).flatMap(dt=>{
  const parent=dt.parentElement,dd=dt.nextElementSibling;
  if(!parent||!dd||dd.localName!=='dd'||!dt.closest('dl')||dd.parentElement!==parent||dt.querySelector('input,select,textarea,button,a[href],[contenteditable]')||dd.querySelector('input,select,textarea,button,a[href],[contenteditable]')||!dd.textContent?.trim())return [];
  const label=sourceFieldLabelText(dt),value=sourceFieldLabelText(dd);
  return !label.uncertain&&!value.uncertain&&value.text.trim()?[label.text]:[];
 });
}

export function nativeReferenceLabels(doc:Document,request:string):string[]{
 return Array.from(doc.querySelectorAll('label')).flatMap(label=>{
  const field=associatedField(label);if(!field)return [];
  const text=sourceFieldLabelText(label);
  if(text.uncertain)return [];
  const validReadonly=field.hasAttribute('readonly')&&(field.localName==='textarea'||field.localName==='input'&&['text','search','url','tel','email','password','number','date','month','week','time','datetime-local'].includes(field.getAttribute('type')??'text'));
  if(referenceFieldMode(text.text,request)==='readonly'&&!validReadonly&&!field.hasAttribute('disabled'))return [];
  return [text.text];
 });
}
