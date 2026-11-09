import {embeddedMediaIssue} from '../../externalMedia';
import {transformDeclarations,transformStyleSheet} from '../../../import/htmlImportCss';
import {contentFingerprint} from '../../designWorkflow';
/** A read-only text projection. Original resources remain on disk; this is never a saved page. */
export function projectReferenceMedia(doc:Document):{omitted:number;css:(source:string)=>string} {
 let omitted=0;
 const visitor=(declaration:{value:string})=>{if(embeddedMediaIssue('<main></main>',declaration.value)){omitted++;return null;}};
 const css=(source:string)=>transformStyleSheet(source,visitor);
 const nodes=Array.from(doc.querySelectorAll('*'));for(let i=0;i<nodes.length;i++)if(nodes[i].localName==='template')nodes.push(...Array.from((nodes[i] as HTMLTemplateElement).content.querySelectorAll('*')));
 for(const svg of nodes.filter(el=>el.localName==='svg')){
  if(!svg.parentNode||svg.parentElement?.closest('svg'))continue;
  const image=doc.createElement('img');for(const name of ['class','data-nid','width','height','style','role','aria-label'])if(svg.hasAttribute(name))image.setAttribute(name,svg.getAttribute(name)!);
  image.setAttribute('data-reference-media','svg-omitted');image.setAttribute('data-source-fingerprint',contentFingerprint(svg.outerHTML));image.setAttribute('alt',svg.getAttribute('aria-label')??svg.querySelector('title')?.textContent??'来源SVG图形（未随文本传输）');svg.replaceWith(image);nodes.push(image);omitted++;
 }
 for(const el of nodes){
  if(el.localName==='style'){el.textContent=css(el.textContent??'');continue;}
  for(const attribute of Array.from(el.attributes)){
   if(attribute.name==='style'){el.setAttribute('style',transformDeclarations(attribute.value,'',false,visitor));continue;}
   if(embeddedMediaIssue(`<${el.localName} ${attribute.name}="${attribute.value.replaceAll('"','&quot;')}">`)){el.removeAttribute(attribute.name);el.setAttribute('data-reference-media','encoded-source-omitted');omitted++;}
  }
 }
 return {get omitted(){return omitted;},css};
}
