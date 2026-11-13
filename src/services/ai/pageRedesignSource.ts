import {compileBusinessTextEdits} from './businessTextEdits';
import {inspectBusinessTextReview,type BusinessTextReview} from './businessTextReview';
import {replacedInlineEntryNids} from './inlineFormContract';
import {parseHtmlCopy} from '../../utils/htmlDocument';
import {normalizeMobileNavigation} from '../../utils/mobileNavigation';
import {inspectExternalMedia,assertExternalMedia} from './externalMedia';
import {contentFingerprint} from './designWorkflow';
import type {QualityFinding} from './generationQuality';
import {authorizedFormChanges,matchesFormAttribute} from './formBehaviorChanges';
import {actionLabel,authorizedRemoval} from './actionIntegrity';
export {explicitlyRequestsPageRedesign} from './pageRedesignIntent';

export interface PageRedesignSource {
 version:1;sourceFingerprint:string;projection:'complete-business-inventory';
 texts:Array<{nid?:string;text:string;tag:string}>;
 controls:Array<{tag:string;nid?:string;label?:string;ownerSelect?:{nid?:string;name?:string};attributes:Record<string,string>}>;
 protectedNodes:Array<{nid:string;tag:string;attributes:Record<string,string>}>;
 sourceStyles:{stylesheets:string[];inline:Array<{nid?:string;tag:string;style:string}>};
 media:Array<{nid?:string;tag:string;attribute:string;url:string}>;
 notice:string;
}
type Policy={deviceProfile:'pc'|'mobile';useCustomNavigation?:boolean;protectedNids?:string[]};
const semantic='input,select,option,textarea,button,a[href],label,form,output,img,video,audio,source,track,th,td,progress,meter,[role]';
const normalized=(value:string)=>value.replace(/\s+/g,'').trim();
function allElements(root:ParentNode):Element[]{const nodes=Array.from(root.querySelectorAll('*'));for(let index=0;index<nodes.length;index++){const el=nodes[index];if(el.localName==='template')nodes.push(...Array.from((el as HTMLTemplateElement).content.querySelectorAll('*')));}return nodes;}
/** Complete business data, not a text-stripped DOM skeleton. The original layout never leaves local ownership. */
export function buildPageRedesignSource(html:string,policy:Policy):PageRedesignSource{
 assertExternalMedia(html);
 const parsed=parseHtmlCopy(normalizeMobileNavigation(html,policy).html),texts:PageRedesignSource['texts']=[],controls:PageRedesignSource['controls']=[],stylesheets=Array.from(parsed.doc.head.querySelectorAll('style')).map(el=>el.textContent??''),inline:PageRedesignSource['sourceStyles']['inline']=[];
 const labels=allElements(parsed.doc).filter(el=>el.localName==='label');
 let count=0;
 const visit=(root:Node)=>{
  if(++count>50000)throw Error('原页节点超过业务清单处理上限，请拆分页面；未截断业务内容。');
  if(root.nodeType===3){const parent=root.parentElement,text=root.nodeValue??'';if(parent&&text.trim())texts.push({nid:parent.closest('[data-nid]')?.getAttribute('data-nid')??undefined,text,tag:parent.localName});return;}
  if(root.nodeType!==1&&root.nodeType!==11)return;
  if(root.nodeType===1){
   const el=root as Element;if(el.localName==='script')return;if(el.localName==='style'){stylesheets.push(el.textContent??'');return;}
   if(el.hasAttribute('style'))inline.push({nid:el.getAttribute('data-nid')??undefined,tag:el.localName,style:el.getAttribute('style')!});
   if(el.matches(semantic)||Array.from(el.attributes).some(a=>(a.name.startsWith('data-')&&a.name!=='data-nid')||a.name.startsWith('aria-'))){
    const select=el.localName==='option'?el.closest('select'):null;
    const label=el.getAttribute('aria-label')??(el.id?labels.find(label=>label.getAttribute('for')===el.id)?.textContent:undefined)??el.closest('label')?.textContent??(el.localName==='option'?el.textContent:undefined)??el.getAttribute('placeholder')??undefined;
    controls.push({tag:el.localName,nid:el.getAttribute('data-nid')??undefined,...(label?{label:label.trim()}:{}),...(select?{ownerSelect:{nid:select.getAttribute('data-nid')??undefined,name:select.getAttribute('name')??undefined}}:{}),attributes:Object.fromEntries(Array.from(el.attributes).filter(a=>!['class','style','data-nid'].includes(a.name)).map(a=>[a.name,a.value]))});
   }
   if(el.localName==='template'){visit((el as HTMLTemplateElement).content);return;}
  }
  root.childNodes.forEach(visit);
 };
 visit(parsed.doc.body);
 const protectedNodes=(policy.protectedNids??[]).map(nid=>{
  const nodes=allElements(parsed.doc).filter(el=>el.getAttribute('data-nid')===nid);if(nodes.length!==1)throw Error('原页保护节点缺失或重复，不能规划整页重设计。');const el=nodes[0];return {nid,tag:el.localName,attributes:Object.fromEntries(Array.from(el.attributes).map(a=>[a.name,a.value]))};
 });
 return {version:1,sourceFingerprint:contentFingerprint(html),projection:'complete-business-inventory',texts,controls,protectedNodes,media:inspectExternalMedia(parsed.serialize()).references,
  sourceStyles:{stylesheets,inline},
  notice:'这是程序完整提取的业务文本、控件属性、素材和保护属性清单；旧布局已投影省略，不是原DOM，不授予额外修改权限。文字不截断。可重排全页可见布局，保留全部未获明确变更授权的业务内容/表单规则和业务图片；来源CSS/L4仍是独立只读依赖。原惰性template由程序从基线保留，不在新主体重复输出。'};
}
function permitted(text:string,nid:string|undefined,request:string,removalOnly=false):boolean{
 return request.split(/[。；;\n]/).some(clause=>{
  if(!/(?:改为|改成|替换|改写|修改.*(?:文字|文案|文本)|删除|移除|去掉|\b(?:replace|rewrite|remove|delete)\b)/i.test(clause)||/(?:不要|不能|不得|禁止|无需|不改|勿|\b(?:not|never)\b)/i.test(clause))return false;
  if(removalOnly&&!/(?:删除|移除|去掉|\b(?:remove|delete)\b)/i.test(clause))return false;
  if(/边框|阴影|圆角|间距|内边距|外边距|颜色|字号|字重|行高|padding|margin|border|shadow/i.test(clause)&&!/文字|文案|文本|标题|label|text/i.test(clause))return false;
  return (text.length>1&&clause.includes(text))||Boolean(nid&&clause.includes(`nid="${nid}"`));
 });
}
function permitsAttribute(control:PageRedesignSource['controls'][number],rule:string,request:string):boolean{
 const names=[control.label,control.attributes.name,control.attributes.id].filter((value):value is string=>Boolean(value&&value.length>1));
 const aliases:Record<string,RegExp>={value:/默认值|预填|取值|文本值|\bvalue\b/i,pattern:/正则|校验规则|\bpattern\b/i,min:/最小|下限|范围|\bmin\b/i,max:/最大|上限|范围|\bmax\b/i,minlength:/最短|最小长度|长度范围|\bminlength\b/i,maxlength:/最长|最大长度|长度限制|\bmaxlength\b/i,step:/步长|步进|\bstep\b/i,name:/字段名|提交键|\bname\b/i,checked:/默认选中|默认项|取消选中|\bchecked\b/i,selected:/默认选中|默认项|取消选中|\bselected\b/i};
 return Boolean(aliases[rule]&&request.split(/[。；;\n]/).some(clause=>!/(?:不要|不能|不得|禁止|无需|不改|勿|\b(?:not|never)\b)/i.test(clause)&&/(?:设置|设为|改为|改成|调整|取消|删除|移除|默认|\b(?:set|change|update|remove)\b)/i.test(clause)&&aliases[rule].test(clause)&&(names.some(name=>clause.includes(name))||Boolean(control.nid&&clause.includes(`nid="${control.nid}"`)))));
}
/** Reflow is authorized independently of business deletion. Does not claim visual/semantic perfection. */
export function inspectRedesignContent(source:PageRedesignSource,html:string,request:string,baselineHtml?:string,review?:BusinessTextReview):QualityFinding[]{
 const {doc}=parseHtmlCopy(html);for(const el of Array.from(doc.querySelectorAll('script,style')))el.remove();
 const inventory=buildPageRedesignSource(html,{deviceProfile:'pc',useCustomNavigation:true}),visible=normalized([...inventory.texts.map(t=>t.text),...inventory.controls.flatMap(c=>Object.entries(c.attributes).filter(([key])=>['value','alt','aria-label','title','placeholder'].includes(key)).map(([,value])=>value))].join(' '));
 const findings:QualityFinding[]=[];
 const reviewed=new Set<string>();
 if(review){
  try{if(!baselineHtml)throw Error('文案确认缺少原页面基线。');const issues=inspectBusinessTextReview(source,baselineHtml,html,review);findings.push(...issues);for(const c of review.changes)if(!issues.some(f=>f.nid===c.targetNid))reviewed.add(c.sourceNid);}
  catch(error){findings.push({code:'redesign_text_review_invalid',severity:'error',message:error instanceof Error?error.message:'文案确认无效。',actual:'原文或确认来源不匹配',expected:'重新核对具体原文与目标节点'});}
 }
 const consumed=new Set<Element>();
 const changes=baselineHtml?authorizedFormChanges(parseHtmlCopy(baselineHtml).doc.body,request):[];
 const rules=['required','readonly','disabled','multiple','type','min','max','minlength','maxlength','step','pattern','checked','selected','name','value','aria-required','aria-readonly','aria-disabled','aria-multiselectable'];
 for(const control of source.controls.filter(row=>['input','textarea','select','option'].includes(row.tag))){
  const candidates=allElements(doc).filter(el=>el.localName===control.tag&&!consumed.has(el));
  const labelMatches=control.label?candidates.filter(el=>el.getAttribute('aria-label')&&normalized(el.getAttribute('aria-label')!)===normalized(control.label!)&&(el.getAttribute('type')??'text')===(control.attributes.type??'text')&&Object.entries(control.attributes).every(([key,value])=>el.getAttribute(key)===value)):[];
  const uniqueSource=control.label&&source.controls.filter(row=>row.tag===control.tag&&row.label&&normalized(row.label)===normalized(control.label!)&&(row.attributes.type??'text')===(control.attributes.type??'text')).length===1;
  const next=(control.nid?candidates.find(el=>el.getAttribute('data-nid')===control.nid):undefined)??(control.attributes.id?candidates.find(el=>el.id===control.attributes.id):undefined)??candidates.find(el=>control.attributes.name&&el.getAttribute('name')===control.attributes.name&&(!['radio','checkbox'].includes(control.attributes.type)||el.getAttribute('value')===control.attributes.value))??(control.tag==='option'?candidates.find(el=>(control.attributes.value!==undefined?el.getAttribute('value')===control.attributes.value:normalized(el.textContent??'')===normalized(control.label??''))&&(!control.ownerSelect?.nid&&!control.ownerSelect?.name||control.ownerSelect.nid&&el.closest('select')?.getAttribute('data-nid')===control.ownerSelect.nid||control.ownerSelect.name&&el.closest('select')?.getAttribute('name')===control.ownerSelect.name)):undefined)??(!control.nid&&!control.attributes.id&&!control.attributes.name?candidates.find(el=>Object.entries(control.attributes).every(([key,value])=>el.getAttribute(key)===value)):undefined)??(uniqueSource&&labelMatches.length===1?labelMatches[0]:undefined);
  if(!next){if(![control.label,control.attributes.name,control.attributes.id].some(name=>name&&permitted(name,control.nid,request,true)))findings.push({code:'redesign_control_missing',severity:'error',nid:control.nid,message:'整页重设计遗漏了原有表单控件。',actual:control.tag,expected:'保留表单控件或明确授权功能删除'});continue;}
  consumed.add(next);
  for(const rule of rules){
   const old=control.attributes[rule]??null,current=next.getAttribute(rule),approved=changes.find(change=>change.nid===control.nid&&change.attribute===rule);
   const boolean=['required','readonly','disabled','multiple','checked','selected'].includes(rule);
   const equivalent=boolean?(old!==null)===(current!==null):rule==='type'?(old??'text')===(current??'text'):rule==='value'?(old??'')===(current??''):old===current;
   if(approved?matchesFormAttribute(next,approved):equivalent||permitsAttribute(control,rule,request))continue;
   findings.push({code:'redesign_form_rule_changed',severity:'error',nid:control.nid,message:'整页重设计改动了未经授权的表单规则或预填信息。',actual:rule,expected:'保留原规则，功能调整按明确请求授权'});
  }
 }
 const baseline=baselineHtml?parseHtmlCopy(baselineHtml).doc:undefined;
 const replacedEntries=baseline?replacedInlineEntryNids(baseline,doc,request):new Set<string>();
 const primarySelector='button.btn-primary,button[data-action="primary"],button[type="submit"],input[type="submit"]';
 const oldPrimary=baseline?Array.from(baseline.querySelectorAll(primarySelector)).filter(el=>!authorizedRemoval(el,request)):[];
 const newPrimary=Array.from(doc.querySelectorAll(primarySelector));
 const approvedPrimaryLabel=request.split(/[。；;\n]/).flatMap(clause=>{
  if(/不要|不能|不得|禁止|不改|勿|never|\bnot\b/i.test(clause))return [];
  const match=/(?:主按钮|主操作按钮|主CTA)(?:的)?(?:文案|文字)(?:设置|设为|改为|改成|修改为|替换为)[“「"]([^”」"]{1,160})[”」"]/.exec(clause);
  return match?[match[1]]:[];
 });
 const explicitEdits=compileBusinessTextEdits(source.texts,request);
 const editApplied=(edit:typeof explicitEdits[number])=>{const nodes=Array.from(doc.querySelectorAll('[data-nid]')).filter(el=>el.getAttribute('data-nid')===edit.nid);return nodes.length===1?normalized(nodes[0].textContent??'')===normalized(edit.after):nodes.length===0&&visible.includes(normalized(edit.after));};
 for(const edit of explicitEdits){if(!editApplied(edit))findings.push({code:'redesign_text_change_missing',severity:'error',nid:edit.nid,message:'未落实用户明确确认的新业务文案。',actual:edit.before,expected:edit.after});}
 for(const item of source.texts){if(item.nid&&(reviewed.has(item.nid)||replacedEntries.has(item.nid))||explicitEdits.some(edit=>edit.nid===item.nid&&editApplied(edit)))continue;if(!normalized(item.text)||visible.includes(normalized(item.text))||permitted(item.text.trim(),item.nid,request))continue;
  const originalNode=item.nid&&baseline?Array.from(baseline.querySelectorAll('[data-nid]')).find(el=>el.getAttribute('data-nid')===item.nid):undefined;
  if(oldPrimary.length===1&&newPrimary.length===1&&originalNode&&oldPrimary[0].contains(originalNode)&&approvedPrimaryLabel.length===1&&actionLabel(newPrimary[0])===approvedPrimaryLabel[0])continue;
  findings.push({code:'redesign_content_missing',severity:'error',nid:item.nid,message:'整页重设计遗漏了未经授权删除或改写的原业务文案。',actual:item.text.slice(0,200),expected:'保留完整业务信息；文字变更必须有明确授权'});
 }
 const refs=new Set(inspectExternalMedia(html).references.map(ref=>ref.url));
 for(const media of source.media.filter(m=>['img','video','audio','source','track'].includes(m.tag))){
  const control=source.controls.find(control=>media.nid&&control.nid===media.nid||Object.values(control.attributes).includes(media.url)),label=control?.attributes.alt??control?.label??media.url;
  if(refs.has(media.url)||permitted(label,media.nid,request,true))continue;
  findings.push({code:'redesign_media_missing',severity:'error',nid:media.nid,message:'整页重设计遗漏了原业务媒体资源。',actual:media.attribute,expected:'保留独立业务媒体引用，删除需明确授权'});
 }
 return findings;
}
/** Public infrastructure and document attributes belong to the copied baseline, not a generated fragment. */
export function mergeRedesignBody(baseline:string,bodyHtml:string):string{
 const source=parseHtmlCopy(baseline),body=parseHtmlCopy(bodyHtml);
 if(body.doc.querySelector('style,link,script,base,meta'))throw Error('重设计主体不能重写原页head或共享样式。');
 if(body.doc.querySelector('template'))throw Error('整页主体不能用惰性template隐藏业务内容；原模板由程序保留。');
 const retained=Array.from(source.doc.body.querySelectorAll('style,link[rel="stylesheet"],template'));
 source.doc.body.replaceChildren(...retained,...Array.from(body.doc.body.childNodes));return source.serialize();
}
