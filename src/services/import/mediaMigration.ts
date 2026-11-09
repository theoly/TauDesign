import type {Asset,Screen,StyleOverride} from '../../types/project';
import type {PageCreationState} from '../ai/pageCreationValidation';
import {contentFingerprint} from '../ai/designWorkflow';
import {renderEvidenceIdentity} from '../ai/evidenceIdentity';
import {inspectExternalMedia,assertExternalMedia} from '../ai/externalMedia';
import {checkGenerationSourceSafety,qualitySummary} from '../ai/generationQuality';
import {PageRenderCheck} from '../ai/pageRenderCheck';
import {isPassedRender} from '../ai/evidenceSchema';
import type {RenderedQualityReport} from '../../utils/renderedQuality';
import {parseHtmlCopy} from '../../utils/htmlDocument';
import {designTokenFingerprint} from '../../utils/designSystemIdentity';
import {createProjectStorage,type ProjectStorage} from '../storage/projectStorage';
import {createRenderResourceSnapshot,renderResourceIssue,type RenderResourceFile} from '../storage/renderResourceSnapshot';
import {readProjectRenderResources,inspectProjectAssetReferences,isSafeProjectAssetPath} from '../ai/projectAssetIntegrity';
import {prepareImportResources,persistImportResources,importResourceAssets,type ImportResourceFile,type PreparedImportResources} from './importResources';
import {transformStyleSheet} from './htmlImportCss';
import {SvgMediaExternalizer} from './svgMediaExternalizer';
import {createMediaResourceSession} from '../storage/mediaResourceSession';
import {resolveImportedResources} from './importResources';
import {buildScreenDocument} from '../../utils/screenDocument';
import {getBaseCss} from '../../styles/baseCss';
import {compileTokensToCss} from '../../utils/cssCompiler';
import {resolveProjectViewport} from '../../utils/referenceDevice';

export type MediaMigrationState=Omit<PageCreationState,'screens'|'overrides'> & {screens:Record<string,Screen>;overrides:Record<string,StyleOverride>};
export interface PreparedMediaMigration {id:string;pages:Array<{original:Screen;converted:Screen;removedNids:string[];render:{before:RenderedQualityReport;after:RenderedQualityReport}}>;assets:Asset[];warnings:string[]}
interface Entry {context:string;ids:string[];projectId:string;folderPath?:string;storage:ProjectStorage;resources:PreparedImportResources;overrides:Record<string,StyleOverride>;originalOverrides:Record<string,StyleOverride>;sourceFiles:RenderResourceFile[];renderFiles:RenderResourceFile[];renderIdentity:string;original:PreparedMediaMigration;state:'ready'|'applying'|'consumed'|'used'}
const prepared=new WeakMap<PreparedMediaMigration,Entry>();
const mime:Record<string,string>={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',webp:'image/webp',avif:'image/avif',svg:'image/svg+xml',ico:'image/x-icon',bmp:'image/bmp',woff:'font/woff',woff2:'font/woff2',ttf:'font/ttf',otf:'font/otf',mp3:'audio/mpeg',ogg:'audio/ogg',wav:'audio/wav',mp4:'video/mp4',webm:'video/webm',vtt:'text/vtt'};
const base64Bytes=(text:string)=>Uint8Array.from(atob(text),char=>char.charCodeAt(0));
function overrideCss(overrides:Record<string,StyleOverride>,id:string){return Object.entries(overrides).filter(([key])=>key.startsWith(id+':')).map(([,value])=>`[data-nid="${value.nid.replace(/["\\]/g,'\\$&')}"]{${Object.entries(value.declarations).map(([property,text])=>`${property}:${text.replace(/\s*!important\s*$/i,'')} !important;`).join('')}}`).join('\n');}
function context(state:MediaMigrationState,ids:string[]){return contentFingerprint(JSON.stringify([state.id,state.folderPath,state.settings,designTokenFingerprint(state.designSystem.tokens),state.designSystemOrigin,ids.map(id=>{const screen=state.screens[id];return screen?[screen.id,screen.name,screen.htmlContent,screen.scopedCss,screen.metadata]:null;}),Object.entries(state.overrides).filter(([key])=>ids.some(id=>key.startsWith(id+':'))),Object.values(state.assets).filter(asset=>ids.some(id=>{const screen=state.screens[id];return screen&&(screen.htmlContent+(screen.scopedCss??'')+overrideCss(state.overrides,id)).includes(asset.relPath)||screen?.htmlContent.includes(`data-asset-id="${asset.id}"`);}))]));}
export function mediaMigrationSourceKey(state:MediaMigrationState,ids:string[]):string{return context(state,ids);}
function boundedStorage(source:ProjectStorage):ProjectStorage{const copy=Object.create(source) as ProjectStorage;copy.readBinary=path=>source.readBinaryLimited?source.readBinaryLimited(path,10*1024*1024):source.readBinary(path);return copy;}
export function screensWithEmbeddedMedia(state:MediaMigrationState):Screen[]{return Object.values(state.screens).filter(screen=>inspectExternalMedia(screen.htmlContent,(screen.scopedCss??'')+'\n'+overrideCss(state.overrides,screen.id)).violations.some(v=>['embedded_media','temporary_media','inline_media'].includes(v.code)));}
const renderErrors=(report:RenderedQualityReport)=>new Set(report.findings.filter(f=>f.severity==='error').map(f=>JSON.stringify([f.code,f.nid,f.message])));
function validateRender(before:RenderedQualityReport,after:RenderedQualityReport){
 if(before.status!=='complete'||after.status!=='complete')throw Error(after.reason??before.reason??'媒体转换未取得完整的实际渲染证据。');
 const existing=renderErrors(before),newIssues=after.findings.filter(f=>f.severity==='error'&&!existing.has(JSON.stringify([f.code,f.nid,f.message])));if(newIssues.length)throw Error(newIssues[0].message);
}
async function verifyFiles(storage:ProjectStorage,files:RenderResourceFile[]){const snapshot=createRenderResourceSnapshot(boundedStorage(storage));for(const file of files)if(await snapshot.storage.readBinary(file.relPath)===null)throw Error(`转换来源文件已丢失：${file.relPath}`);const issue=renderResourceIssue(files,await snapshot.files());if(issue)throw Error(issue);}

/** Preparation is read-only: binary outputs remain in this private registry until explicit apply. */
export async function prepareMediaMigration(state:MediaMigrationState,screenIds:string[],options:{signal?:AbortSignal;isCurrent:()=>boolean;onProgress?:(done:number,total:number,name:string)=>void}):Promise<PreparedMediaMigration>{
 const source=structuredClone({id:state.id,folderPath:state.folderPath,settings:state.settings,designSystem:state.designSystem,designSystemOrigin:state.designSystemOrigin,designLibraryBinding:state.designLibraryBinding,assets:state.assets,screens:state.screens,overrides:state.overrides,components:state.components,decisions:state.decisions,projectDocuments:state.projectDocuments}),ids=[...screenIds];if(!ids.length||ids.length>40||new Set(ids).size!==ids.length||ids.some(id=>!source.screens[id]))throw Error('请选择1–40个当前工程的页面。');
 const frozen=context(source,ids),storage=boundedStorage(createProjectStorage(source.id,source.folderPath)),sourceSnapshot=createRenderResourceSnapshot(storage),renderIdentity=renderEvidenceIdentity(source.settings.deviceProfile);
 const guard=()=>{if(options.signal?.aborted||!options.isCurrent())throw Error('媒体转换已停止或工程发生变化。');if(renderEvidenceIdentity(source.settings.deviceProfile)!==renderIdentity)throw Error('渲染依赖发生变化，请重新准备媒体转换。');};
 const resources:PreparedImportResources={html:'',binaries:[],resources:[],warnings:[]},pages:PreparedMediaMigration['pages']=[],warnings:string[]=[],allOverrides=structuredClone(source.overrides),countedFiles=new Set<string>();let totalBytes=0;
 guard();
 for(const [index,id] of ids.entries()){
  guard();options.onProgress?.(index,ids.length,source.screens[id].name);const original=source.screens[id];
  const safe=checkGenerationSourceSafety(original.htmlContent,{deviceProfile:source.settings.deviceProfile,useCustomNavigation:source.settings.useCustomNavigation});if(!safe.passed)throw Error(qualitySummary(safe));
  const l4=overrideCss(source.overrides,id),references=inspectExternalMedia(original.htmlContent,(original.scopedCss??'')+'\n'+l4).references;
  const files:ImportResourceFile[]=[];for(const path of [...new Set(references.map(r=>r.url.split(/[?#]/)[0].replace(/^\.\//,'')).filter(url=>url.startsWith('assets/'))) ]){
   if(!isSafeProjectAssetPath(path))throw Error('媒体引用不是受控工程资源路径。');const extension=path.split('.').at(-1)!.toLowerCase(),type=mime[extension];if(!type)throw Error(`不支持的资源格式：${extension}`);
   const data=await sourceSnapshot.storage.readBinary(path);guard();if(data===null)throw Error(`转换来源文件不存在：${path}`);const bytes=base64Bytes(data);if(!countedFiles.has(path)){totalBytes+=bytes.byteLength;countedFiles.add(path);}if(bytes.byteLength>10*1024*1024||totalBytes>30*1024*1024)throw Error('媒体转换资源超过单文件10MiB或单批30MiB限制，请缩小范围。');
   files.push({path,file:new File([bytes],path.split('/').at(-1)!,{type})});
  }
  const document=parseHtmlCopy(original.htmlContent),marker=crypto.randomUUID();
  const extra=(kind:string,css:string)=>{const style=document.doc.createElement('style');style.setAttribute('data-media-layer',marker+'-'+kind);style.textContent=css;document.doc.head.append(style);};extra('scoped',original.scopedCss??'');extra('overrides',l4);
  const first=await prepareImportResources('<!DOCTYPE html>'+document.doc.documentElement.outerHTML,'migration.html',files,{expandedRuntime:true});guard();if(first.resources.some(r=>r.status==='missing'))throw Error('媒体资源缺失或无法解析，未删除资源继续转换。');
  const nextDoc=new DOMParser().parseFromString(first.html,'text/html');const scoped=nextDoc.querySelector(`style[data-media-layer="${marker}-scoped"]`)!,overrides=nextDoc.querySelector(`style[data-media-layer="${marker}-overrides"]`)!;
  const css=scoped.textContent??'',overrideText=overrides.textContent??'';scoped.remove();overrides.remove();
  const currentOverrides=Object.fromEntries(Object.entries(allOverrides).filter(([key])=>key.startsWith(id+':')));
  transformStyleSheet(overrideText,declaration=>{const match=/^\[data-nid="((?:\\.|[^"])*)"\]$/.exec(declaration.selector.trim());if(!match)return;const nid=match[1].replace(/\\(["\\])/g,'$1'),entry=currentOverrides[id+':'+nid];if(entry&&Object.hasOwn(entry.declarations,declaration.property))entry.declarations[declaration.property]=declaration.value;});
  let converted:Screen={...original,htmlContent:document.full?'<!DOCTYPE html>'+nextDoc.documentElement.outerHTML:nextDoc.body.innerHTML,scopedCss:css};
  const pending=new Map(first.binaries.map(file=>[file.relPath,file.base64])),memory=Object.create(sourceSnapshot.storage) as ProjectStorage;memory.readBinary=async path=>pending.get(path)??sourceSnapshot.storage.readBinary(path);
  const svg=await SvgMediaExternalizer.prepare({screen:converted,settings:source.settings,designSystem:source.designSystem,storage:memory,signal:options.signal,overridesCss:overrideCss(allOverrides,id)});guard();converted=svg.screen;
  for(const nid of svg.removedNids)delete allOverrides[id+':'+nid];
  for(const file of [...first.binaries,...svg.resources.binaries])if(!resources.binaries.some(existing=>existing.relPath===file.relPath))resources.binaries.push(file);
  if(resources.binaries.reduce((count,file)=>count+file.base64.length*.75,0)>30*1024*1024)throw Error('转换后资源总量超过30MiB，请缩小页面范围。');
  const additions=importResourceAssets(resources),registry=[...Object.values(source.assets),...additions.filter(asset=>!Object.values(source.assets).some(old=>old.relPath===asset.relPath))];
  if(additions.some(asset=>source.assets[asset.id]&&source.assets[asset.id].relPath!==asset.relPath))throw Error('独立媒体资产标识与已有素材冲突，未准备转换。');
  const rewritten=parseHtmlCopy(converted.htmlContent);for(const element of Array.from(rewritten.doc.querySelectorAll('[data-asset-id]'))){const url=inspectExternalMedia(element.outerHTML).references.find(ref=>ref.url.startsWith('assets/'))?.url.split(/[?#]/)[0],asset=registry.find(asset=>asset.relPath===url);if(asset)element.setAttribute('data-asset-id',asset.id);}converted={...converted,htmlContent:rewritten.serialize()};
  assertExternalMedia(converted.htmlContent,(converted.scopedCss??'')+'\n'+overrideCss(allOverrides,id));
  const memoryAll=Object.create(sourceSnapshot.storage) as ProjectStorage;memoryAll.readBinary=async path=>resources.binaries.find(file=>file.relPath===path)?.base64??sourceSnapshot.storage.readBinary(path);memoryAll.exists=async path=>resources.binaries.some(file=>file.relPath===path)||await storage.exists(path);
  const refs=inspectProjectAssetReferences([converted],registry);if(refs.length)throw Error(refs[0].message);
  const before=await PageRenderCheck.inspect({screen:original,settings:source.settings,designSystem:source.designSystem,assets:Object.values(source.assets),overrides:source.overrides},sourceSnapshot.storage,{signal:options.signal});guard();
  const after=await PageRenderCheck.inspect({screen:converted,settings:source.settings,designSystem:source.designSystem,assets:registry,overrides:allOverrides},memoryAll,{signal:options.signal});guard();validateRender(before,after);
  if(!isPassedRender(before))warnings.push(`${original.name}保留原有${renderErrors(before).size}项设计问题；本次仅验证媒体转换未新增阻断。`);
  warnings.push(...svg.resources.warnings);pages.push({original,converted,removedNids:svg.removedNids,render:{before,after}});
 }
 guard();const assets=importResourceAssets(resources).filter(asset=>!Object.values(source.assets).some(old=>old.relPath===asset.relPath)),virtual=Object.create(storage) as ProjectStorage;virtual.readBinary=async path=>resources.binaries.find(file=>file.relPath===path)?.base64??storage.readBinary(path);
 const checked=await readProjectRenderResources(virtual,pages.map(page=>page.converted),[...Object.values(source.assets),...assets],allOverrides);guard();if(checked.issues.length)throw Error(checked.issues[0].message);
 const handle:PreparedMediaMigration=Object.freeze({id:crypto.randomUUID(),pages:structuredClone(pages),assets:structuredClone(assets),warnings:[...warnings]});
 prepared.set(handle,{context:frozen,ids,projectId:source.id,folderPath:source.folderPath,storage,resources,overrides:allOverrides,originalOverrides:source.overrides,sourceFiles:await sourceSnapshot.files(),renderFiles:checked.resourceFiles,renderIdentity,original:structuredClone(handle),state:'ready'});options.onProgress?.(ids.length,ids.length,'已完成，等待应用');return handle;
}
/** Only a live prepared handle can publish. Physical bytes are rechecked before the History owner. */
export async function consumeMediaMigration(handle:PreparedMediaMigration,getState:()=>MediaMigrationState,signal?:AbortSignal):Promise<{screens:Screen[];assets:Asset[];overrides:Record<string,StyleOverride>}>{
 const entry=prepared.get(handle);if(!entry||entry.state!=='ready'||JSON.stringify(handle)!==JSON.stringify(entry.original))throw Error('媒体转换预览无效、已使用或被修改。');entry.state='applying';
 const guard=()=>{const state=getState();if(signal?.aborted||state.id!==entry.projectId||state.folderPath!==entry.folderPath||context(state,entry.ids)!==entry.context||renderEvidenceIdentity(state.settings.deviceProfile)!==entry.renderIdentity)throw Error('媒体转换来源或检查依赖发生变化，未应用。');return state;};
 try{
  guard();await verifyFiles(entry.storage,entry.sourceFiles);guard();await persistImportResources(entry.resources,entry.storage);guard();
  for(const file of entry.resources.binaries){if(await entry.storage.readBinary(file.relPath)!==file.base64)throw Error('独立媒体写入后内容与预览不一致，未应用。');guard();}
  const state=guard();if(entry.original.assets.some(asset=>state.assets[asset.id]&&state.assets[asset.id].relPath!==asset.relPath))throw Error('准备后新增素材与转换资产身份冲突。');const assets=[...Object.values(state.assets),...entry.original.assets],screens=entry.original.pages.map(page=>({...page.converted,position:state.screens[page.converted.id].position}));
  const current=await readProjectRenderResources(entry.storage,screens,assets,entry.overrides);guard();if(current.issues.length)throw Error(current.issues[0].message);const issue=renderResourceIssue(entry.renderFiles,current.resourceFiles);if(issue)throw Error(issue);await verifyFiles(entry.storage,entry.sourceFiles);guard();
  entry.state='consumed';return {screens,assets:entry.original.assets,overrides:Object.fromEntries([...Object.entries(state.overrides).filter(([key])=>!entry.ids.some(id=>key.startsWith(id+':'))),...Object.entries(entry.overrides).filter(([key])=>entry.ids.some(id=>key.startsWith(id+':')))])};
 }catch(error){entry.state='used';throw error;}
}
export function mediaMigrationCurrent(handle:PreparedMediaMigration,state:MediaMigrationState):boolean {const entry=prepared.get(handle);return Boolean(entry&&entry.state==='ready'&&state.id===entry.projectId&&state.folderPath===entry.folderPath&&context(state,entry.ids)===entry.context&&renderEvidenceIdentity(state.settings.deviceProfile)===entry.renderIdentity);}

/** Synchronous one-use barrier immediately before the History commit, after every awaited IO. */
export function claimMediaMigrationPublish(handle:PreparedMediaMigration,state:MediaMigrationState):void{
 const entry=prepared.get(handle);if(!entry||entry.state!=='consumed')throw Error('媒体转换尚未准备提交或已使用。');entry.state='used';
 if(context(state,entry.ids)!==entry.context||renderEvidenceIdentity(state.settings.deviceProfile)!==entry.renderIdentity||JSON.stringify(handle)!==JSON.stringify(entry.original)||entry.original.assets.some(asset=>state.assets[asset.id]&&state.assets[asset.id].relPath!==asset.relPath))throw Error('媒体转换在提交前已过期，原页面未修改。');
}

/** Disposable independent-resource preview. Pending media bytes never enter the returned documents. */
export async function createMediaMigrationPreview(handle:PreparedMediaMigration,index:number,state:MediaMigrationState):Promise<{before:string;after:string;dispose:()=>Promise<void>}>{
 if(!mediaMigrationCurrent(handle,state))throw Error('媒体转换预览已过期。');const entry=prepared.get(handle)!,page=entry.original.pages[index];if(!page)throw Error('媒体转换页面不存在。');
 const session=createMediaResourceSession(),viewport=resolveProjectViewport(state.settings),memory=Object.create(entry.storage) as ProjectStorage;
 memory.readBinary=async path=>entry.resources.binaries.find(file=>file.relPath===path)?.base64??entry.storage.readBinary(path);
 try{
  const build=async(screen:Screen,overrides:Record<string,StyleOverride>,storage:ProjectStorage)=>{
   const resolved=await resolveImportedResources(screen.htmlContent,screen.scopedCss,storage,new Set(),{referenceUrl:session.url}),css=await resolveImportedResources('<body></body>',overrideCss(overrides,screen.id),storage,new Set(),{referenceUrl:session.url});
   return buildScreenDocument({...screen,...resolved},{deviceProfile:state.settings.deviceProfile,useCustomNavigation:state.settings.useCustomNavigation,includeMobileChrome:true,baseCss:getBaseCss(state.settings.deviceProfile),tokensCss:compileTokensToCss(state.designSystem.tokens,state.settings.colorMode),screenOverrides:css.scopedCss??'',viewportWidth:viewport.width,viewportHeight:viewport.height});
  };
  const before=await build(page.original,entry.originalOverrides,entry.storage),after=await build(page.converted,entry.overrides,memory);
  if(!mediaMigrationCurrent(handle,state))throw Error('媒体转换预览已过期。');return {before,after,dispose:()=>session.close()};
 }catch(error){await session.close();throw error;}
}
