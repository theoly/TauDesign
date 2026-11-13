import type {Asset, ProjectSettings} from '../../types/project';
import type {DesignSystem} from '../../types/designSystem';
import type {ProjectStorage} from '../storage/projectStorage';
import {SvgMediaExternalizer} from '../import/svgMediaExternalizer';
import {assertPassiveSvgResource} from '../import/importResources';
import {assertExternalMedia, inspectExternalMedia} from './externalMedia';
import {checkGenerationSourceSafety, qualitySummary} from './generationQuality';
import {parseHtmlCopy} from '../../utils/htmlDocument';

export type PrepareGeneratedHtml = (html:string)=>Promise<string>;
const assetPath=/^assets\/images\/([a-f0-9]{64})\.svg$/;
const hashBytes=async(bytes:Uint8Array)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new Uint8Array(bytes).buffer)),n=>n.toString(16).padStart(2,'0')).join('');
const decode=(text:string)=>Uint8Array.from(atob(text),ch=>ch.charCodeAt(0));

export function assertGeneratedAssetMetadata(assets:Asset[]):void{
 if(assets.length>256||new Set(assets.map(a=>a.id)).size!==assets.length)throw Error('生成媒体数量或身份无效。');
 for(const asset of assets){const match=assetPath.exec(asset.relPath);if(!match||asset.id!==`generated-svg-${match[1]}`||asset.type!=='image'||asset.mimeType!=='image/svg+xml'||asset.source!=='ai_generated'||
  Object.keys(asset).some(key=>!['id','name','relPath','type','mimeType','source','refCount'].includes(key))||typeof asset.name!=='string'||asset.name.length>120||!Number.isSafeInteger(asset.refCount)||asset.refCount<0)throw Error('生成媒体身份或路径无效。');}
}

/** File identity is checked again at publication, never trusted from model JSON or draft metadata. */
export async function verifyGeneratedMediaAssets(storage:ProjectStorage,assets:Asset[],guard:()=>void=()=>{}):Promise<void>{
 assertGeneratedAssetMetadata(assets);
 let total=0;
 for(const asset of assets){
  guard();const match=assetPath.exec(asset.relPath)!;
  const binary=await storage.readBinary(asset.relPath);guard();
  if(!binary||binary.length>14*1024*1024)throw Error('生成媒体文件缺失或过大。');
  const bytes=decode(binary);total+=bytes.length;if(total>30*1024*1024)throw Error('生成媒体总量超过30MiB。');
  if(await hashBytes(bytes)!==match[1])throw Error('生成媒体内容与SHA-256路径不匹配。');
  assertPassiveSvgResource(new TextDecoder().decode(bytes));guard();
 }
}

/** Preparation writes immutable files only. Asset metadata joins the ordinary publication/History gate. */
export function createGeneratedMediaProcessor(input:{storage:ProjectStorage;settings:ProjectSettings;designSystem:DesignSystem;assets?:Asset[];signal?:AbortSignal;isCurrent?:()=>boolean;onProgress?:(message:string)=>void}){
 input={...input,settings:structuredClone(input.settings),designSystem:structuredClone(input.designSystem)};
 const guard=()=>{if(input.signal?.aborted)throw new DOMException('媒体处理已取消','AbortError');if(input.isCurrent?.()===false)throw Error('媒体处理期间工程已变化。');};
 const known=new Set(input.assets?.map(a=>a.relPath)??[]);
 const prepared=new Map<string,number>();
 const prepare:PrepareGeneratedHtml=async html=>{
  guard();
  // Read-only detection precedes DOMParser: some host parsers discard active SVG subtrees.
  if(/<\s*(?:script|foreignObject|iframe|object|embed|animate(?:Transform|Motion)?|set)\b/i.test(html))throw Error('生成媒体包含活动内容，未创建素材。');
  const issues=inspectExternalMedia(html).violations;
  if(!issues.length)return html;
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
   guard();const bytes=decode(binary.base64),match=assetPath.exec(binary.relPath);
   if(!match||await hashBytes(bytes)!==match[1])throw Error('生成媒体哈希无效。');
   assertPassiveSvgResource(new TextDecoder().decode(bytes));
   if(await input.storage.exists(binary.relPath)){
    if(await input.storage.readBinary(binary.relPath)!==binary.base64)throw Error('同名媒体文件内容冲突，未覆盖原文件。');
   }else{guard();await input.storage.ensureDir('assets/images');guard();await input.storage.writeBinary(binary.relPath,binary.base64);}
  }
  guard();input.onProgress?.(`已准备${result.resources.binaries.length}个独立媒体文件，继续检查页面…`);
  return /^\s*(?:<!doctype|<html[\s>])/i.test(html)?result.screen.htmlContent:parseHtmlCopy(result.screen.htmlContent).doc.body.innerHTML;
 };
 const collect=async(html:string):Promise<Asset[]>=>{
  guard();assertExternalMedia(html);const paths=[...new Set(inspectExternalMedia(html).references.map(ref=>ref.url.split(/[?#]/)[0]).filter(path=>assetPath.test(path)&&!known.has(path)))];
  const assets:Asset[]=paths.map((relPath,index)=>({id:`generated-svg-${assetPath.exec(relPath)![1]}`,name:`生成图形 ${index+1}`,relPath,type:'image',mimeType:'image/svg+xml',source:'ai_generated',refCount:1}));
  await verifyGeneratedMediaAssets(input.storage,assets,guard);return assets;
 };
 return {prepare,collect};
}
