import {explicitUserTextDeclarations,sourceLiteralText,type ContentTask,type ExplicitActionText,type ActionTextObservation} from './explicitActionContent';
import type {QualityFinding} from './generationQuality';
import {assessedFinding} from './findingPolicy';

export const explicitFieldLabels=(task:ContentTask|string|undefined)=>explicitUserTextDeclarations(task,'field-label');
const normalize=(text:string)=>text.normalize('NFC').replace(/\s+/g,' ').trim();
const labelable=(el:Element)=>el.matches('select,textarea')||el.matches('input')&&!['hidden','button','submit','reset','image'].includes((el.getAttribute('type')??'text').toLowerCase());
/** Native label association only. Duplicate IDs or ambiguous implicit fields never establish a target. */
function associatedField(label:Element):Element|undefined{
 const id=label.getAttribute('for');
 if(id!==null){const matches=Array.from(label.ownerDocument.querySelectorAll('[id]')).filter(el=>el.getAttribute('id')===id);return id&&matches.length===1&&labelable(matches[0])?matches[0]:undefined;}
 const fields=Array.from(label.querySelectorAll('input,select,textarea')).filter(labelable);
 return fields.length===1?fields[0]:undefined;
}
export const sourceFieldLabelText=(el:Element):ActionTextObservation=>sourceLiteralText(el,true);
export function inspectExplicitFieldLabels(doc:Document,requirements:ExplicitActionText[],observe=sourceFieldLabelText):QualityFinding[]{
 return requirements.flatMap(requirement=>{
  const scope=requirement.nid?Array.from(doc.querySelectorAll('[data-nid]')).filter(el=>el.getAttribute('data-nid')===requirement.nid):undefined;
  const labels=Array.from(doc.querySelectorAll('label')).filter(label=>associatedField(label)&&(!scope||scope.length===1&&(scope[0]===label||scope[0].contains(label))));
  const observed=labels.map(el=>({el,...observe(el)}));
  if(observed.some(item=>!item.uncertain&&normalize(item.text)===normalize(requirement.text)))return [];
  const uncertain=observed.some(item=>item.uncertain),source=labels.filter(el=>normalize(sourceFieldLabelText(el).text)===normalize(requirement.text));
  return [assessedFinding(uncertain?'required-field-label-support':'required-field-label',uncertain?'unverified':'failed',{
   code:uncertain?'required_field_label_unverified':'required_field_label_missing',
   nid:(source.length===1?source[0].getAttribute('data-nid'):undefined)??requirement.nid??labels[0]?.getAttribute('data-nid')??undefined,
   message:uncertain?'指定字段标签原文的可见性尚未验证。':'指定字段标签原文未在有效关联的标签上完整呈现。',
   actual:uncertain?'存在当前检查不支持的变换、裁切或文字测量':`要求“${requirement.text}”；${labels.length?'未找到完整匹配的字段标签':'指定范围内没有有效关联的原生label'}`,
   expected:`在本次授权范围内用有效关联的原生label展示“${requirement.text}”；不能用占位符、旁文或无障碍名称替代`,
  })];
 });
}
