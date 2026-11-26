import type {Asset, ProjectSettings} from '../../types/project';
import type {DesignSystem} from '../../types/designSystem';
import type {ProjectStorage} from '../storage/projectStorage';
import {SvgMediaExternalizer} from '../import/svgMediaExternalizer';
import {assertPassiveSvgResource} from '../import/importResources';
import {assertExternalMedia, inspectExternalMedia} from './externalMedia';
import {checkGenerationSourceSafety, qualitySummary} from './generationQuality';
import {parseHtmlCopy} from '../../utils/htmlDocument';
import {candidateLucideIconNames, rewriteAssetPathMap} from './builtinIconAliases';
import {referencedProjectAssetPaths} from './projectAssetIntegrity';

export type PrepareGeneratedHtml = (html:string)=>Promise<string>;
const generatedImagePath=/^assets\/images\/([a-f0-9]{64})\.svg$/;
const hashedIconPath=/^assets\/icons\/([a-f0-9]{64})\.svg$/;
const friendlyIconPath=/^assets\/icons\/([a-zA-Z0-9_.-]+)\.svg$/;
const hashBytes=async(bytes:Uint8Array)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new Uint8Array(bytes).buffer)),n=>n.toString(16).padStart(2,'0')).join('');
const decode=(text:string)=>Uint8Array.from(atob(text),ch=>ch.charCodeAt(0));
const encodeBase64=(bytes:Uint8Array)=>{let data='';for(const b of bytes)data+=String.fromCharCode(b);return btoa(data);};

function hashedAssetMetaMatch(asset:Asset):RegExpExecArray|null{
 if(asset.mimeType!=='image/svg+xml')return null;
 const imgMatch=generatedImagePath.exec(asset.relPath);
 if(imgMatch){
  if(asset.id!==`generated-svg-${imgMatch[1]}`||asset.type!=='image'||asset.source!=='ai_generated')return null;
  return imgMatch;
 }
 const iconMatch=hashedIconPath.exec(asset.relPath);
 if(iconMatch){
  if(asset.id!==`builtin-icon-${iconMatch[1].slice(0,24)}`||asset.type!=='svg_icon'||asset.source!=='builtin')return null;
  return iconMatch;
 }
 return null;
}

export function assertGeneratedAssetMetadata(assets:Asset[]):void{
 if(assets.length>256||new Set(assets.map(a=>a.id)).size!==assets.length)throw Error('生成媒体数量或身份无效。');
 for(const asset of assets){
  if(!hashedAssetMetaMatch(asset)||
   Object.keys(asset).some(key=>!['id','name','relPath','type','mimeType','source','refCount'].includes(key))||
   typeof asset.name!=='string'||asset.name.length>120||!Number.isSafeInteger(asset.refCount)||asset.refCount<0){
   throw Error('生成媒体身份或路径无效。');
  }
 }
}

/** File identity is checked again at publication, never trusted from model JSON or draft metadata. */
export async function verifyGeneratedMediaAssets(storage:ProjectStorage,assets:Asset[],guard:()=>void=()=>{}):Promise<void>{
 assertGeneratedAssetMetadata(assets);
 let total=0;
 for(const asset of assets){
  guard();const match=hashedAssetMetaMatch(asset)!;
  const binary=await storage.readBinary(asset.relPath);guard();
  if(!binary||binary.length>14*1024*1024)throw Error('生成媒体文件缺失或过大。');
  const bytes=decode(binary);total+=bytes.length;if(total>30*1024*1024)throw Error('生成媒体总量超过30MiB。');
  if(await hashBytes(bytes)!==match[1])throw Error('生成媒体内容与SHA-256路径不匹配。');
  assertPassiveSvgResource(new TextDecoder().decode(bytes));guard();
 }
}

function collectReferencedAssetPaths(html:string,scopedCss=''):string[]{
 const paths=new Set(referencedProjectAssetPaths({id:'resolve',name:'',htmlContent:html,scopedCss,position:{x:0,y:0}}));
 const {doc}=parseHtmlCopy(html);
 for(const el of Array.from(doc.querySelectorAll('[data-icon-src]'))){
  const raw=el.getAttribute('data-icon-src');
  if(!raw)continue;
  const normalized=raw.trim().replace(/^\.\//,'').split(/[?#]/)[0];
  if(/^assets\/(?:images|icons|media|imports\/fonts)\//.test(normalized))paths.add(normalized);
 }
 return [...paths];
}

export async function resolveMissingBundledIcons(input:{
 html:string;scopedCss?:string;storage:ProjectStorage;assets:ReadonlyArray<Asset>;
 signal?:AbortSignal;isCurrent?:()=>boolean;onProgress?:(message:string)=>void;
}):Promise<{html:string;scopedCss:string;assets:Asset[];rewritten:string[]}>{
 const guard=()=>{
  if(input.signal?.aborted)throw new DOMException('媒体处理已取消','AbortError');
  if(input.isCurrent?.()===false)throw Error('媒体处理期间工程已变化。');
 };
 guard();
 const scopedCss=input.scopedCss??'';
 const registeredByPath=new Map<string,Asset>(input.assets.map(a=>[a.relPath,a]));
 const unregistered=collectReferencedAssetPaths(input.html,scopedCss).filter(path=>!registeredByPath.has(path));
 if(!unregistered.length)return {html:input.html,scopedCss,assets:[],rewritten:[]};

 const registeredByName=new Map<string,string>();
 for(const asset of input.assets){
  const match=/^图标 · (.+)$/.exec(asset.name);
  if(match&&hashedIconPath.test(asset.relPath))registeredByName.set(match[1],asset.relPath);
 }

 const replacements=new Map<string,string>();
 const newAssetsById=new Map<string,Asset>();
 let importedLucideSvg:((name:string)=>string|undefined)|undefined;

 for(const path of unregistered){
  guard();
  const iconHashMatch=hashedIconPath.exec(path);
  if(iconHashMatch){
   const binary=await input.storage.readBinary(path);
   guard();
   if(binary){
    if(binary.length>14*1024*1024)throw Error('图标资源文件过大。');
    const bytes=decode(binary);
    if(await hashBytes(bytes)!==iconHashMatch[1])throw Error(`图标资源 ${path} 与 SHA-256 路径不匹配。`);
    assertPassiveSvgResource(new TextDecoder().decode(bytes));
    const id=`builtin-icon-${iconHashMatch[1].slice(0,24)}`;
    if(!newAssetsById.has(id)){
     const asset:Asset={id,name:'图标 · 复用',relPath:path,type:'svg_icon',mimeType:'image/svg+xml',source:'builtin',refCount:0};
     newAssetsById.set(id,asset);
     registeredByPath.set(path,asset);
    }
   }
   continue;
  }

  const imageHashMatch=generatedImagePath.exec(path);
  if(imageHashMatch){
   const binary=await input.storage.readBinary(path);
   guard();
   if(binary){
    if(binary.length>14*1024*1024)throw Error('生成媒体文件过大。');
    const bytes=decode(binary);
    if(await hashBytes(bytes)!==imageHashMatch[1])throw Error(`生成媒体 ${path} 与 SHA-256 路径不匹配。`);
    assertPassiveSvgResource(new TextDecoder().decode(bytes));
    const id=`generated-svg-${imageHashMatch[1]}`;
    if(!newAssetsById.has(id)){
     const asset:Asset={id,name:'生成图形',relPath:path,type:'image',mimeType:'image/svg+xml',source:'ai_generated',refCount:1};
     newAssetsById.set(id,asset);
     registeredByPath.set(path,asset);
    }
   }
   continue;
  }

  const friendlyMatch=friendlyIconPath.exec(path);
  if(!friendlyMatch)continue;
  const stem=friendlyMatch[1];
  if(!stem||stem.includes('..'))continue;

  for(const candidate of candidateLucideIconNames(stem)){
   guard();
   const existingPath=registeredByName.get(candidate);
   if(existingPath){
    replacements.set(path,existingPath);
    break;
   }
   if(!importedLucideSvg){
    ({importedLucideSvg}=await import('../import/importLucideIcons'));
    guard();
   }
   const svg=importedLucideSvg(candidate);
   if(!svg)continue;
   assertPassiveSvgResource(svg);
   const bytes=new TextEncoder().encode(svg);
   const hash=await hashBytes(bytes);
   const base64=encodeBase64(bytes);
   const relPath=`assets/icons/${hash}.svg`;
   const id=`builtin-icon-${hash.slice(0,24)}`;

   if(registeredByPath.has(relPath)){
    registeredByName.set(candidate,relPath);
    replacements.set(path,relPath);
    break;
   }
   if(await input.storage.exists(relPath)){
    guard();
    if(await input.storage.readBinary(relPath)!==base64)throw Error(`图标资源 ${candidate} 内容冲突，未覆盖原文件。`);
   }else{
    guard();
    await input.storage.ensureDir('assets/icons');
    guard();
    await input.storage.writeBinary(relPath,base64);
   }
   const asset:Asset={id,name:`图标 · ${candidate}`,relPath,type:'svg_icon',mimeType:'image/svg+xml',source:'builtin',refCount:0};
   newAssetsById.set(id,asset);
   registeredByPath.set(relPath,asset);
   registeredByName.set(candidate,relPath);
   replacements.set(path,relPath);
   break;
  }
 }

 const newAssets=[...newAssetsById.values()];
 if(newAssets.length){
  input.onProgress?.(`已自动准备 ${newAssets.length} 个图标资源…`);
  await verifyGeneratedMediaAssets(input.storage,newAssets,guard);
 }
 if(!replacements.size){
  return {html:input.html,scopedCss,assets:newAssets,rewritten:[]};
 }
 const rewritten=rewriteAssetPathMap(input.html,replacements,scopedCss);
 return {html:rewritten.html,scopedCss:rewritten.scopedCss,assets:newAssets,rewritten:rewritten.rewritten};
}

export function mergeVerifiedAssets(primary:ReadonlyArray<Asset>|undefined,extra:ReadonlyArray<Asset>|undefined):Asset[]{
 const byId=new Map<string,Asset>();
 for(const asset of [...(primary??[]),...(extra??[])]){
  const prev=byId.get(asset.id);
  if(prev&&prev.relPath!==asset.relPath)throw Error('生成媒体身份冲突。');
  if(!prev)byId.set(asset.id,asset);
 }
 return [...byId.values()];
}

export async function prepareStagedMediaAssets(input:{
 html:string;scopedCss?:string;storage:ProjectStorage;assets:ReadonlyArray<Asset>;
 signal?:AbortSignal;isCurrent:()=>boolean;register:(assets:Asset[])=>void;
}):Promise<string>{
 const resolved=await resolveMissingBundledIcons(input);
 if(resolved.assets.length){
  const guard=()=>{
   if(input.signal?.aborted)throw new DOMException('媒体处理已取消','AbortError');
   if(!input.isCurrent())throw Error('工程已变化或媒体登记已取消。');
  };
  guard();
  await verifyGeneratedMediaAssets(input.storage,resolved.assets,guard);
  guard();
  input.register(resolved.assets);
 }
 return resolved.html;
}

/** Preparation writes immutable files only. Asset metadata joins the ordinary publication/History gate. */
export function createGeneratedMediaProcessor(input:{storage:ProjectStorage;settings:ProjectSettings;designSystem:DesignSystem;assets?:Asset[];signal?:AbortSignal;isCurrent?:()=>boolean;onProgress?:(message:string)=>void}){
 input={...input,settings:structuredClone(input.settings),designSystem:structuredClone(input.designSystem)};
 const guard=()=>{if(input.signal?.aborted)throw new DOMException('媒体处理已取消','AbortError');if(input.isCurrent?.()===false)throw Error('媒体处理期间工程已变化。');};
 const known=new Set(input.assets?.map(a=>a.relPath)??[]);
 const prepared=new Map<string,number>();
 const resolvedAssets=new Map<string,Asset>();
 const resolveResources=async(html:string):Promise<{html:string;rewritten:string[]}>=>{
  const resolved=await resolveMissingBundledIcons({
   html,
   storage:input.storage,
   assets:[...(input.assets??[]),...resolvedAssets.values()],
   signal:input.signal,
   isCurrent:input.isCurrent,
   onProgress:input.onProgress
  });
  for(const asset of resolved.assets)resolvedAssets.set(asset.relPath,asset);
  return {html:resolved.html,rewritten:resolved.rewritten};
 };
 const prepare:PrepareGeneratedHtml=async html=>{
  guard();
  // Read-only detection precedes DOMParser: some host parsers discard active SVG subtrees.
  if(/<\s*(?:script|foreignObject|iframe|object|embed|animate(?:Transform|Motion)?|set)\b/i.test(html))throw Error('生成媒体包含活动内容，未创建素材。');
  const issues=inspectExternalMedia(html).violations;
  if(!issues.length)return (await resolveResources(html)).html;
  const invalid=issues.find(issue=>issue.code!=='inline_media');if(invalid)throw Error(invalid.message);
  const safety=checkGenerationSourceSafety(html);if(!safety.passed)throw Error(qualitySummary(safety));
  const doc=parseHtmlCopy(html).doc;
  // Inspect before rendering; CSP is defense in depth, not a sanitizer for the asset compiler.
  for(const svg of Array.from(doc.querySelectorAll('svg')))assertPassiveSvgResource(new XMLSerializer().serializeToString(svg));
  if(Array.from(doc.querySelectorAll('template')).some(node=>(node as HTMLTemplateElement).content.querySelector('svg')))throw Error('模板内SVG尚不支持自动固化，请提供独立素材。');
  input.onProgress?.('正在将图表和图标处理为独立媒体文件…');
  const result=await SvgMediaExternalizer.prepare({screen:{id:'generated-media',name:'生成媒体',position:{x:0,y:0},htmlContent:html},...input});
  guard();assertExternalMedia(result.screen.htmlContent);
  for(const binary of result.resources.binaries)prepared.set(binary.relPath,Math.floor(binary.base64.length*3/4));
  if(prepared.size>256||[...prepared.values()].reduce((n,size)=>n+size,0)>30*1024*1024)throw Error('生成媒体超过256项或30MiB总量限制。');
  for(const binary of result.resources.binaries){
   guard();const bytes=decode(binary.base64),match=generatedImagePath.exec(binary.relPath);
   if(!match||await hashBytes(bytes)!==match[1])throw Error('生成媒体哈希无效。');
   assertPassiveSvgResource(new TextDecoder().decode(bytes));
   if(await input.storage.exists(binary.relPath)){
    if(await input.storage.readBinary(binary.relPath)!==binary.base64)throw Error('同名媒体文件内容冲突，未覆盖原文件。');
   }else{guard();await input.storage.ensureDir('assets/images');guard();await input.storage.writeBinary(binary.relPath,binary.base64);}
  }
  guard();input.onProgress?.(`已准备${result.resources.binaries.length}个独立媒体文件，继续检查页面…`);
  const nextHtml=/^\s*(?:<!doctype|<html[\s>])/i.test(html)?result.screen.htmlContent:parseHtmlCopy(result.screen.htmlContent).doc.body.innerHTML;
  return (await resolveResources(nextHtml)).html;
 };
 const collect=async(html:string):Promise<Asset[]>=>{
  guard();assertExternalMedia(html);
  const paths=[...new Set([
   ...inspectExternalMedia(html).references.map(ref=>ref.url.split(/[?#]/)[0]),
   ...collectReferencedAssetPaths(html)
  ].filter(path=>(generatedImagePath.test(path)||hashedIconPath.test(path))&&!known.has(path)))];
  let generatedCount=0;
  const assets:Asset[]=paths.map(relPath=>{
   const existing=resolvedAssets.get(relPath);
   if(existing)return existing;
   const imgMatch=generatedImagePath.exec(relPath);
   if(imgMatch)return {id:`generated-svg-${imgMatch[1]}`,name:`生成图形 ${++generatedCount}`,relPath,type:'image',mimeType:'image/svg+xml',source:'ai_generated',refCount:1};
   const iconMatch=hashedIconPath.exec(relPath)!;
   return {id:`builtin-icon-${iconMatch[1].slice(0,24)}`,name:'图标 · 复用',relPath,type:'svg_icon',mimeType:'image/svg+xml',source:'builtin',refCount:0};
  });
  await verifyGeneratedMediaAssets(input.storage,assets,guard);return assets;
 };
 return {prepare,collect,resolveResources};
}
