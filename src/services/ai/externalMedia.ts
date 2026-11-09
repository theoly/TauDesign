import {parseHtmlCopy} from '../../utils/htmlDocument';
import {cssUrls,decodeCss,imageSrcsetCandidates} from '../import/htmlImportCss';
export interface MediaReference {nid?:string;tag:string;attribute:string;url:string;kind:'image'|'font'|'media'|'reference'}
export interface MediaViolation {code:'embedded_media'|'temporary_media'|'inline_media'|'invalid_media_reference';nid?:string;message:string;attribute:string}
const mediaAttributes=new Set(['src','srcset','poster','href','xlink:href','data','background']);
const mediaTags=new Set(['img','image','video','audio','source','track','object','embed','use']);
const clean=(value:string)=>decodeCss(value).replace(/[\u0000-\u0020\u007f-\u009f]/g,'');
/** CSS strings in image-set need not use url(); inspect every candidate, including custom properties. */
function cssStringReferences(value:string):string[]{
 const decoded=decodeCss(value),functions:string[]=[],urls:string[]=[];
 for(let i=0;i<decoded.length;i++){
  const ch=decoded[i];
  if(ch==='"'||ch==="'"){
   const start=++i;while(i<decoded.length&&decoded[i]!==ch)i++;
   const text=decoded.slice(start,i),parent=functions.at(-1);
   if(parent==='image-set'||parent==='-webkit-image-set'||parent==='image'||/^(?:data|blob):/i.test(clean(text)))urls.push(text);
  }else if(ch==='('){let end=i;while(end>0&&/\s/.test(decoded[end-1]))end--;let start=end;while(start>0&&/[\w-]/.test(decoded[start-1]))start--;const name=decoded.slice(start,end).toLowerCase();functions.push(name);
   if(name==='url'){const value=decoded.slice(i+1,decoded.indexOf(')',i+1)<0?undefined:decoded.indexOf(')',i+1)).trim();if(/^(?:data|blob):/i.test(clean(value)))urls.push(value);}
  }
  else if(ch===')')functions.pop();
 }
 return urls;
}
export function mediaReferenceIssue(url:string):MediaViolation['code']|undefined{
 let value=clean(url);for(let i=0;i<2;i++){try{const decoded=decodeURIComponent(value);if(decoded===value)break;value=decoded;}catch{break;}}
 if(/^data:/i.test(value))return 'embedded_media';
 if(/^blob:/i.test(value))return 'temporary_media';
 if(/^https:\/\//i.test(value)){try{const u=new URL(value);return u.username||u.password?'invalid_media_reference':undefined;}catch{return 'invalid_media_reference';}}
 if(/^assets\/[a-z0-9_/-]+[\w.\-/%]*(?:[?#][^\s]*)?$/i.test(value)&&!value.split(/[/?#]/).some(part=>part==='..')&&!value.includes('\\'))return;
 return 'invalid_media_reference';
}
/** Inspect actual resource positions, not prose containing the words base64 or data URL. */
export function inspectExternalMedia(html:string,extraCss=''):{references:MediaReference[];violations:MediaViolation[]}{
 const {doc}=parseHtmlCopy(html),references:MediaReference[]=[],violations:MediaViolation[]=[];
 const add=(el:Element,attribute:string,url:string,kind:MediaReference['kind']='reference')=>{
  if(!url.trim())return;
  const nid=el.getAttribute('data-nid')??undefined,code=mediaReferenceIssue(url);
  references.push({nid,tag:el.localName,attribute,url,kind});
  if(code)violations.push({code,nid,attribute,message:code==='embedded_media'?'页面媒体必须单独传输并引用独立文件，禁止data URL或base64嵌入。':code==='temporary_media'?'页面不能保存临时blob媒体地址，请先外置为独立资源。':'媒体必须引用受控assets文件或经批准的HTTPS链接。'});
 };
 const css=(el:Element,value:string,attribute:string)=>{for(const url of cssUrls(value)){if(!url.startsWith('#'))add(el,attribute,url,/font-face|font/i.test(attribute)?'font':'image');}
  for(const url of cssStringReferences(value))add(el,attribute,url,'image');
 };
 const nodes=Array.from(doc.querySelectorAll('*'));
 for(let i=0;i<nodes.length;i++){const el=nodes[i];if(el.localName==='template')nodes.push(...Array.from((el as HTMLTemplateElement).content.querySelectorAll('*')));}
 for(const el of nodes){
  const tag=el.localName.toLowerCase();
  if(tag==='svg'){
   if(Array.from(el.querySelectorAll('*')).some(child=>!['use','image','title','desc'].includes(child.localName)))violations.push({code:'inline_media',nid:el.getAttribute('data-nid')??undefined,attribute:'svg',message:'SVG媒体/图标须保存为独立文件并外部引用，页面不能内联图形内容。'});
  }
  for(const a of Array.from(el.attributes)){
   if(a.name==='style'){css(el,a.value,'style');continue;}
   if(a.name==='srcset'){for(const c of imageSrcsetCandidates(a.value))add(el,a.name,c.url,'image');continue;}
   if(mediaAttributes.has(a.name)&&(mediaTags.has(tag)||tag==='link'&&/icon|preload/i.test(el.getAttribute('rel')??'')))add(el,a.name,a.value,tag==='audio'||tag==='video'||tag==='source'||tag==='track'?'media':'image');
   else if(/^(?:data|blob):/i.test(clean(a.value)))add(el,a.name,a.value);
  }
  if(tag==='style')css(el,el.textContent??'','stylesheet');
 }
 if(extraCss)css(doc.body,extraCss,'scoped-css');
 // Encoded media is not allowed to hide in inert text, unknown classes or metadata either.
 // This is detection only; HTML is never regex-rewritten.
 if(/\bdata:[a-z0-9.+\/-]+(?:;[a-z0-9=.+-]+)*,[^\s"'<>)]/i.test(html+'\n'+extraCss)&&!violations.some(v=>v.code==='embedded_media'))violations.push({code:'embedded_media',attribute:'encoded-content',message:'页面正文或元数据中包含内嵌媒体编码，请使用独立资源引用。'});
 return {references,violations};
}
export function assertExternalMedia(html:string,css=''){const result=inspectExternalMedia(html,css);if(result.violations.length)throw Error(result.violations[0].message);return result.references;}
/** Partial drafts can have incomplete paths, but may not carry encoded or inline media payload either. */
export function embeddedMediaIssue(html:string,css=''):MediaViolation|undefined {
 const parsed=inspectExternalMedia(html,css).violations.find(v=>v.code!=='invalid_media_reference');if(parsed)return parsed;
 let inSvg=0;for(const token of html.matchAll(/<\/?[a-z][^>]*(?:>|$)/gi)){
  if(/^<svg\b/i.test(token[0]))inSvg++;else if(/^<\/svg\b/i.test(token[0]))inSvg=Math.max(0,inSvg-1);
  else if(inSvg&&/^<(?:path|circle|rect|line|polyline|polygon|ellipse|symbol|defs|linearGradient|radialGradient|text|tspan|filter|mask|clipPath|pattern)\b/i.test(token[0]))return {code:'inline_media',attribute:'svg',message:'未完成SVG图形内容不能保存为页面或恢复前缀，请使用独立资源引用。'};
 }
 // An unfinished start tag can be discarded completely by DOMParser. Inspect its attribute
 // values read-only as well; never repair/rewrite those bytes into a purported complete page.
 for(const token of html.matchAll(/<[a-z][^>]*(?:>|$)/gi))for(const match of token[0].matchAll(/\b([\w:-]+)\s*=\s*(?:"([^"]*)"?|'([^']*)'?|([^\s>]+))/g)){
  const value=(match[2]??match[3]??match[4]??'').replace(/&#(?:x([a-f\d]+)|(\d+));?/gi,(_m,hex,decimal)=>String.fromCodePoint(Math.min(0x10ffff,parseInt(hex??decimal,hex?16:10)))).replace(/&colon;/g,':').replace(/&Tab;/g,'\t').replace(/&NewLine;/g,'\n');
  const attribute=match[1].toLowerCase();
  if(attribute==='style'){
   const found=inspectExternalMedia('<main></main>',value).violations.find(v=>v.code!=='invalid_media_reference');if(found)return found;
  }
  const values=attribute==='srcset'?imageSrcsetCandidates(value).map(v=>v.url):[value];
  for(const url of values){const code=mediaReferenceIssue(url);if(code==='embedded_media'||code==='temporary_media')return {code,attribute:match[1],message:'未完成代码含内嵌或临时媒体，不能保存为恢复前缀或继续生成。'};}
 }
}
