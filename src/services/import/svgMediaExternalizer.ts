import type {Screen,ProjectSettings} from '../../types/project';
import type {DesignSystem} from '../../types/designSystem';
import type {ProjectStorage} from '../storage/projectStorage';
import {prepareImportResources,resolveImportedResources,type PreparedImportResources} from './importResources';
import {transformStyleSheet} from './htmlImportCss';
import {createMediaResourceSession} from '../storage/mediaResourceSession';
import {parseHtmlCopy} from '../../utils/htmlDocument';
import {buildScreenDocument} from '../../utils/screenDocument';
import {compileTokensToCss} from '../../utils/cssCompiler';
import {getBaseCss} from '../../styles/baseCss';
import {resolveProjectViewport} from '../../utils/referenceDevice';
import {inspectExternalMedia} from '../ai/externalMedia';

const SVG='http://www.w3.org/2000/svg';
const shapeTags=new Set(['path','rect','circle','ellipse','line','polyline','polygon','text','tspan']);
const paintProperties=['fill','stroke','stroke-width','stroke-linecap','stroke-linejoin','stroke-miterlimit','fill-rule','clip-rule','opacity','fill-opacity','stroke-opacity','filter','clip-path','mask','visibility','font-family','font-size','font-weight','font-style','text-anchor','dominant-baseline','letter-spacing','stop-color','stop-opacity','flood-color','flood-opacity','lighting-color','color','paint-order','marker-start','marker-mid','marker-end','transform','transform-origin','d','x','y','cx','cy','r','rx','ry','width','height'];
const affected=new Set([...paintProperties,'background','background-color']);
const blank=(value:string)=>!value||value==='none'||value==='transparent'||/^rgba\([^)]*,\s*0(?:\.0+)?\s*\)$/.test(value)||/^rgba?\([^)]*\/\s*0(?:\.0+)?\s*\)$/.test(value);
const rawDocument=(doc:Document)=>'<!DOCTYPE html>\n'+doc.documentElement.outerHTML;
const binary=(text:string)=>{const bytes=new TextEncoder().encode(text);let value='';for(let i=0;i<bytes.length;i+=8192)value+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(value);};
function topSvgs(doc:Document):SVGSVGElement[]{const nodes:SVGSVGElement[]=[];const visit=(root:ParentNode)=>{nodes.push(...Array.from(root.querySelectorAll<SVGSVGElement>('svg')));for(const template of Array.from(root.querySelectorAll<HTMLTemplateElement>('template')))visit(template.content);};visit(doc);return nodes.filter(el=>!el.parentElement?.closest('svg')&&inspectExternalMedia(el.outerHTML).violations.some(v=>v.code==='inline_media'));}
function simpleMask(svg:SVGSVGElement,doc:Document,extraCss=''):string|undefined {
 if(!svg.hasAttribute('viewBox'))return;
 if(svg.querySelector('defs,style,use,image,foreignObject,text,tspan,filter,mask,clipPath,pattern,linearGradient,radialGradient')||svg.hasAttribute('filter')||svg.hasAttribute('mask')||svg.hasAttribute('clip-path'))return;
 const all=[svg,...Array.from(svg.querySelectorAll('*'))];let paints=new Set<string>();
 for(const el of all){
  const style=(el as SVGElement).style;
  for(const property of affected)if(style?.getPropertyValue(property)&&!(el===svg&&['width','height','opacity','transform','transform-origin','color'].includes(property)))return;
  if(shapeTags.has(el.localName))for(const name of el.localName==='line'?['stroke']:['fill','stroke']){
   let current:Element|null=el,value:string|null=null;while(current&&svg.contains(current)){value=current.getAttribute(name);if(value)break;current=current.parentElement;}
   value??=name==='fill'?'black':'none';if(/url\(|var\(|context-|inherit/i.test(value))return;if(!blank(value))paints.add(value);
  }
 }
 if(!paints.size)paints.add('currentColor');if(paints.size!==1)return;
 let cssAffected=false;
 for(const css of [...Array.from(doc.querySelectorAll('style')).map(style=>style.textContent??''),extraCss])transformStyleSheet(css,declaration=>{
  if(!affected.has(declaration.property))return;
  if(declaration.selector.trim().startsWith('@')||/^(?:font-|letter-spacing$|text-anchor$|dominant-baseline$)/.test(declaration.property))return;
  // Layout/color on the outer SVG still applies to the retained page wrapper.
  for(const node of all)try{if(node.matches(declaration.selector)&&!(node===svg&&['width','height','opacity','transform','transform-origin','color'].includes(declaration.property)))cssAffected=true;}catch{cssAffected=true;}
 });
 return cssAffected?undefined:[...paints][0];
}
function stripEditorIdentity(svg:Element):void {
 for(const el of [svg,...Array.from(svg.querySelectorAll('*'))]){
  for(const attr of Array.from(el.attributes))if(attr.name.startsWith('data-'))el.removeAttribute(attr.name);
 }
}
function resourceViewport(copy:SVGSVGElement,width?:string,height?:string):void {
 const numbers=(copy.getAttribute('viewBox')??'').trim().split(/[\s,]+/).map(Number);
 if(numbers.length===4&&numbers.every(Number.isFinite)&&numbers[2]>0&&numbers[3]>0){copy.setAttribute('width',String(numbers[2]));copy.setAttribute('height',String(numbers[3]));}
 else{const w=parseFloat(width??''),h=parseFloat(height??'');if(!Number.isFinite(w)||!Number.isFinite(h)||w<=0||h<=0)throw Error('SVG没有有效的viewBox或可测量尺寸，无法保真外置。');copy.setAttribute('viewBox',`0 0 ${w} ${h}`);copy.setAttribute('width',String(w));copy.setAttribute('height',String(h));}
 for(const property of ['width','height','min-width','min-height','max-width','max-height','opacity','transform','transform-origin'])copy.style.removeProperty(property);copy.removeAttribute('transform');
}
function snapshot(svg:SVGSVGElement,getStyle:(node:Element)=>CSSStyleDeclaration):{markup:string;paint?:string} {
 if(svg.querySelector('use,image,foreignObject'))throw Error('此SVG包含引用实例或外部图像，无法可靠固化；请先提供展开的独立静态SVG。');
 const copy=svg.cloneNode(true) as SVGSVGElement,source=[svg,...Array.from(svg.querySelectorAll('*'))],targets=[copy,...Array.from(copy.querySelectorAll('*'))],paints=new Set<string>();
 for(let i=0;i<source.length;i++){
  const style=getStyle(source[i]),target=targets[i] as SVGElement;
  for(const property of paintProperties){
   if(i===0&&['opacity','transform','transform-origin','width','height','x','y'].includes(property))continue;
   let value=style.getPropertyValue(property);if(!value)continue;
   if(/url\(/i.test(value))value=value.replace(/url\(\s*['"]?([^)'"\s]+)['"]?\s*\)/gi,(_all,url:string)=>{
    const hash=url.lastIndexOf('#'),id=hash>=0?url.slice(hash+1):'';
    if(!id||!Array.from(svg.querySelectorAll('[id]')).some(el=>el.id===id))throw Error('SVG依赖当前图形以外的绘图资源，不能删除依赖后导入。');return `url(#${id})`;
   });
   target.style.setProperty(property,value);
  }
  if(shapeTags.has(source[i].localName)&&style.visibility!=='hidden'&&style.opacity!=='0')for(const name of source[i].localName==='line'?['stroke']:['fill','stroke']){const value=style.getPropertyValue(name);if(!blank(value))paints.add(value);}
 }
 for(const property of Array.from(copy.style))if(!paintProperties.includes(property)||['opacity','transform','transform-origin','width','height','x','y'].includes(property))copy.style.removeProperty(property);
 copy.removeAttribute('class');copy.setAttribute('xmlns',SVG);copy.setAttribute('opacity','1');copy.removeAttribute('transform');
 const rootStyle=getStyle(svg);
 resourceViewport(copy,rootStyle.width,rootStyle.height);
 const background=rootStyle.getPropertyValue('background-color');stripEditorIdentity(copy);
 const paint=paints.size===1&&blank(background)&&![...paints][0].includes('url(')?[...paints][0]:undefined;
 return {markup:new XMLSerializer().serializeToString(copy),...(paint?{paint:paint===rootStyle.color?'currentColor':paint}:{})};
}
function replaceGraphic(svg:SVGSVGElement,path:string,paint?:string){
 const titles=Array.from(svg.children).filter(el=>['title','desc'].includes(el.localName)).map(el=>el.cloneNode(true));
 svg.replaceChildren(...titles);svg.setAttribute('data-external-media',paint?'mask':'image');
 if(paint){
  svg.style.setProperty('mask-image',`url("${path}")`,'important');svg.style.setProperty('-webkit-mask-image',`url("${path}")`,'important');
  for(const prefix of ['','-webkit-']){svg.style.setProperty(prefix+'mask-repeat','no-repeat','important');svg.style.setProperty(prefix+'mask-position','center','important');svg.style.setProperty(prefix+'mask-size',svg.getAttribute('preserveAspectRatio')==='none'?'100% 100%':'contain','important');}
  svg.style.setProperty('background-color',paint,'important');
 }else{
  const image=svg.ownerDocument.createElementNS(SVG,'image'),box=(svg.getAttribute('viewBox')??'').trim().split(/[\s,]+/).map(Number);image.setAttribute('href',path);image.setAttribute('width',box.length===4?String(box[2]):'100%');image.setAttribute('height',box.length===4?String(box[3]):'100%');image.setAttribute('x',box.length===4?String(box[0]):'0');image.setAttribute('y',box.length===4?String(box[1]):'0');image.setAttribute('preserveAspectRatio',svg.getAttribute('preserveAspectRatio')??'xMidYMid meet');svg.append(image);
  for(const property of ['filter','clip-path','mask']){svg.removeAttribute(property);svg.style.setProperty(property,'none','important');}
 }
}
async function renderSource(screen:Screen,settings:ProjectSettings,designSystem:DesignSystem,storage:ProjectStorage,options:{signal?:AbortSignal;sourceImport?:boolean;overridesCss?:string}):Promise<{doc:Document;dispose:()=>void}>{
 if(!document.documentElement.clientWidth)throw Error('此SVG需要实际渲染固化样式，请在应用的页面预览中完成媒体转换。');
 const session=createMediaResourceSession();let frame:HTMLIFrameElement|undefined,timer:ReturnType<typeof setTimeout>|undefined,abort:(()=>void)|undefined;
 const dispose=()=>{clearTimeout(timer);if(abort)options.signal?.removeEventListener('abort',abort);frame?.remove();void session.close().catch(()=>{});};
 try{
  const resolved=await resolveImportedResources(screen.htmlContent,screen.scopedCss,storage,new Set(),{referenceUrl:session.url}),overrides=await resolveImportedResources('<body></body>',options.overridesCss??'',storage,new Set(),{referenceUrl:session.url});
  if(options.signal?.aborted)throw Error('媒体转换已取消。');const viewport=resolveProjectViewport(settings),marker=crypto.randomUUID();
  // Capture every source SVG before the final navigation policy removes old source chrome.
  const html=buildScreenDocument({...screen,...resolved},{deviceProfile:settings.deviceProfile,useCustomNavigation:true,includeMobileChrome:false,baseCss:options.sourceImport?'':getBaseCss(settings.deviceProfile),tokensCss:options.sourceImport?'':compileTokensToCss(designSystem.tokens,settings.colorMode),screenOverrides:overrides.scopedCss??'',viewportWidth:viewport.width,viewportHeight:viewport.height,staticImage:true});
  const doc=new DOMParser().parseFromString(html,'text/html'),meta=doc.createElement('meta');meta.name='taudesign-media-conversion';meta.content=marker;doc.head.append(meta);
  frame=document.createElement('iframe');frame.setAttribute('aria-hidden','true');frame.tabIndex=-1;frame.title='媒体样式固化';frame.style.cssText=`position:fixed;left:-100000px;top:0;width:${viewport.width}px;height:${viewport.height}px;border:0;pointer-events:none`;
  const loaded=new Promise<Document>((resolve,reject)=>{
   abort=()=>reject(Error('媒体转换已取消。'));options.signal?.addEventListener('abort',abort,{once:true});timer=setTimeout(()=>reject(Error('SVG媒体样式固化超时。')),10000);
   frame!.onload=()=>{const content=frame?.contentDocument;if(content?.querySelector('meta[name="taudesign-media-conversion"]')?.getAttribute('content')!==marker)return;
    void Promise.resolve(content.fonts?.ready).then(()=>new Promise<void>(done=>frame?.contentWindow?.requestAnimationFrame(()=>done()))).then(()=>resolve(content),reject);
   };
  });frame.srcdoc=rawDocument(doc);document.body.append(frame);const content=await loaded;clearTimeout(timer);if(abort)options.signal?.removeEventListener('abort',abort);return {doc:content,dispose};
 }catch(error){dispose();throw error;}
}

export const SvgMediaExternalizer={
 /** Converts import input or an explicit page copy. It never mutates a store or writes files. */
 async prepare(input:{screen:Screen;settings:ProjectSettings;designSystem:DesignSystem;storage:ProjectStorage;signal?:AbortSignal;sourceImport?:boolean;overridesCss?:string;forceRendered?:boolean}):Promise<{screen:Screen;resources:PreparedImportResources;removedNids:string[]}>{
  const copy=parseHtmlCopy(input.screen.htmlContent),svgs=topSvgs(copy.doc),resources:PreparedImportResources={html:'',binaries:[],resources:[],warnings:[]},removedNids:string[]=[];
  if(svgs.length>256)throw Error('单页内嵌SVG超过256项，请分开转换。');let rendered:Awaited<ReturnType<typeof renderSource>>|undefined;
  const prepared:Screen={...input.screen,htmlContent:''};
  try{
   for(const [index,svg] of svgs.entries())svg.setAttribute('data-taudesign-svg-source',String(index));
   const extraCss=[input.screen.scopedCss??'',input.overridesCss??''].join('\n');
   const needRendering=input.forceRendered||svgs.some(svg=>!simpleMask(svg,copy.doc,extraCss));
   if(svgs.length&&needRendering)rendered=await renderSource({...input.screen,htmlContent:copy.serialize()},input.settings,input.designSystem,input.storage,input);
   for(const [index,svg] of svgs.entries()){
    if(input.signal?.aborted)throw Error('媒体转换已取消。');
    let result:{markup:string;paint?:string};
    if(rendered){const source=rendered.doc.querySelector<SVGSVGElement>(`svg[data-taudesign-svg-source="${index}"]`);if(!source)throw Error('SVG来源在固化时改变或丢失。');result=snapshot(source,node=>rendered!.doc.defaultView!.getComputedStyle(node));}
    else{const clone=svg.cloneNode(true) as SVGSVGElement;stripEditorIdentity(clone);clone.removeAttribute('opacity');resourceViewport(clone);result={markup:new XMLSerializer().serializeToString(clone),paint:simpleMask(svg,copy.doc,extraCss)};}
    const asset=await prepareImportResources(`<img src="data:image/svg+xml;base64,${binary(result.markup)}">`,'svg-resource.html',[]);
    const path=asset.binaries[0]?.relPath;if(!path)throw Error('SVG媒体资源没有完整生成。');
    removedNids.push(...Array.from(svg.querySelectorAll('[data-nid]')).map(el=>el.getAttribute('data-nid')!));replaceGraphic(svg,path,result.paint);svg.removeAttribute('data-taudesign-svg-source');
    for(const file of asset.binaries)if(!resources.binaries.some(old=>old.relPath===file.relPath))resources.binaries.push({...file,name:`SVG素材 ${index+1}`});
    resources.resources.push({url:path,status:'resolved',kind:'svg'});
   }
   prepared.htmlContent=copy.serialize();resources.html=prepared.htmlContent;if(svgs.length)resources.warnings.push(`已将${svgs.length}个内嵌SVG转为独立文件；内部图形不再作为页面节点编辑，原布局与外层节点保留。`);
   return {screen:prepared,resources,removedNids};
  }finally{rendered?.dispose();}
 }
};
