import type {ComponentDefinition,SlotDef} from '../types/project';
import {parseHtmlCopy} from './htmlDocument';
import {htmlIsComplete} from './htmlCompleteness';
import {inspectText,setDirectText} from './textNode';
import {checkGenerationSourceSafety} from '../services/ai/generationQuality';

const imageContent=new Set(['src','srcset','alt','data-asset-id']);
export const hasTemplateContract=(c:ComponentDefinition)=>c.templateContract!==undefined;
function assertNoEmbeddedImages(root:Element):void {
 const remaining=[root];
 while(remaining.length){
  const element=remaining.pop()!;
  remaining.push(...Array.from(element.children));
  if(element.localName==='template')remaining.push(...Array.from((element as HTMLTemplateElement).content.children));
  if(Array.from(element.attributes).some(a=>/data:image\//i.test(a.value))||(element.localName==='style'&&/data:image\//i.test(element.textContent??'')))throw Error('组件图片须引用工程资源或图片URL，不能内嵌data:image图片正文。');
 }
}
export function componentSlotElements(root:Element,slots:SlotDef[]):Map<string,Element> {
 const found=new Map<string,Element>(),used:Element[]=[];
 for(const slot of slots){
  if(!slot||Object.keys(slot).some(k=>!['slotName','selector','type','defaultContent'].includes(k))||typeof slot.slotName!=='string'||!/^[a-zA-Z][\w-]{0,63}$/.test(slot.slotName)||found.has(slot.slotName)||
   !['text','image','node'].includes(slot.type)||typeof slot.defaultContent!=='string'||slot.defaultContent.length>10000||
   ![':scope',`[data-slot="${slot.slotName}"]`,`[data-slot='${slot.slotName}']`].includes(slot.selector))throw Error('插槽名称须唯一，选择器须为 :scope 或同名 [data-slot="名称"]。');
  const matches=slot.selector===':scope'?[root]:[...(root.matches(slot.selector)?[root]:[]),...Array.from(root.querySelectorAll(slot.selector))];
  if(matches.length!==1)throw Error(`插槽 ${slot.slotName} 必须恰好匹配一个节点。`);
  const el=matches[0];
  if(el.closest('template')||['template','script','style'].includes(el.localName)||used.some(n=>n.contains(el)||el.contains(n)))throw Error(`插槽 ${slot.slotName} 不可重叠、嵌套或放在惰性模板中。`);
  if(slot.type==='text'&&!inspectText(el).editable)throw Error(`文本插槽 ${slot.slotName} 必须是纯文本叶节点。`);
  if(slot.type==='image'&&el.localName!=='img')throw Error(`图片插槽 ${slot.slotName} 必须指向 img。`);
  if(slot.type==='node'&&['img','input','br','hr','area','source','video','audio','iframe','svg'].includes(el.localName))throw Error(`节点插槽 ${slot.slotName} 必须指向普通内容容器。`);
  used.push(el);found.set(slot.slotName,el);
 }
 return found;
}
/** An explicit contract is opt-in; malformed presence cannot silently degrade to legacy mode. */
export function compileComponentTemplate(component:ComponentDefinition):{root:Element;slots:Map<string,Element>} {
 const contract=component.templateContract;
 if(!contract||contract.version!==1||Object.keys(contract).some(k=>k!=='version'))throw Error('组件模板合同版本无效。');
 if(typeof component.templateHtml!=='string'||component.templateHtml.length>100000||!htmlIsComplete(component.templateHtml)||!checkGenerationSourceSafety(component.templateHtml).passed)throw Error('严格组件模板不完整、不安全或超过100000字符。');
 const {doc}=parseHtmlCopy(component.templateHtml),root=doc.body.firstElementChild;
 if(!root||doc.body.children.length!==1||doc.head.children.length||Array.from(doc.body.childNodes).some(n=>n.nodeType===3&&n.nodeValue?.trim()))throw Error('严格组件模板必须只有一个根元素。');
 if(component.slotDefs!==undefined&&(!Array.isArray(component.slotDefs)||component.slotDefs.length>20))throw Error('每个严格组件最多20个插槽。');
 assertNoEmbeddedImages(root);
 return {root,slots:componentSlotElements(root,component.slotDefs??[])};
}
function shape(root:Element,slots:Map<string,Element>,defs:SlotDef[]):unknown {
 const types=new Map(defs.map(s=>[slots.get(s.slotName)!,s.type]));
 const visit=(node:Node):unknown=>{
  if(node.nodeType===3){const text=node.parentElement?.matches('pre,textarea,style')?node.nodeValue:node.nodeValue?.trim();return text?['text',text]:null;}
  if(node.nodeType!==1)return null;
  const el=node as Element,type=types.get(el);
  const attrs=Array.from(el.attributes).filter(a=>a.name!=='data-nid'&&a.name!=='data-component-instance'&&!(el===root&&['data-component-id','data-component-version'].includes(a.name))&&!(type==='image'&&imageContent.has(a.name)))
   .map(a=>[a.name,a.name==='class'?a.value.split(/\s+/).filter(Boolean).sort().join(' '):a.name==='style'?(el as HTMLElement).style.cssText:a.value]).sort(([a],[b])=>a.localeCompare(b));
  const children=type==='text'||type==='node'?['slot',type]:Array.from(el.localName==='template'?(el as HTMLTemplateElement).content.childNodes:el.childNodes).map(visit).filter(n=>n!==null);
  return [el.namespaceURI,el.localName,attrs,children];
 };
 return visit(root);
}
export function assertComponentInstance(instance:Element,component:ComponentDefinition):void {
 assertNoEmbeddedImages(instance);
 const compiled=compileComponentTemplate(component),defs=component.slotDefs??[],actual=componentSlotElements(instance,defs);
 if(JSON.stringify(shape(instance,actual,defs))!==JSON.stringify(shape(compiled.root,compiled.slots,defs)))throw Error('固定模板区域的结构、文案或属性不一致；仅可修改已声明插槽的内容。');
}
/** Preserve slots by semantic name, never by leaf-node order. Work on private DOM copies only. */
export function projectSlottedComponent(component:ComponentDefinition,instance:Element):Element {
 const {root,slots}=compileComponentTemplate(component),old=componentSlotElements(instance,component.slotDefs??[]);
 for(const slot of component.slotDefs??[]){
  const from=old.get(slot.slotName)!,to=slots.get(slot.slotName)!;
  if(slot.type==='text'){
   const inspection=inspectText(from);if(!inspection.editable)throw Error(`文本插槽 ${slot.slotName} 不可安全读取。`);
   // Preserve authored whitespace as well as text; the inspection authorizes direct text nodes only.
   setDirectText(to,Array.from(from.childNodes).filter(n=>n.nodeType===3).map(n=>n.nodeValue??'').join(''));
  }
  else if(slot.type==='image')for(const attr of imageContent){const value=from.getAttribute(attr);if(value===null)to.removeAttribute(attr);else to.setAttribute(attr,value);}
  else to.replaceChildren(...Array.from(from.childNodes).map(child=>child.cloneNode(true)));
 }
 if(!checkGenerationSourceSafety(root.outerHTML).passed)throw Error('插槽内容不安全，未同步此实例。');
 assertComponentInstance(root,component);return root;
}
