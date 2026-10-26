import {DeliveryRepository} from './deliveryRepository';
import {RestyleDeliveryRepository} from './restyleDeliveryRepository';
import type {ProjectStorage} from './projectStorage';
import {resolveImportedResources} from '../import/importResources';
import {resolveProjectViewport} from '../../utils/referenceDevice';
import {compileTokensToCss} from '../../utils/cssCompiler';
import {getBaseCss} from '../../styles/baseCss';
import {buildExportRenderDocument} from '../../utils/pngExporter';
import {resolveThemeColors} from '../../utils/semanticColors';
import {bytesToBase64} from '../../utils/exportSaver';
import {inspectPreviewPng} from './pagePreview';

export interface VisualOwner {projectId:string;kind:'single'|'restyle';eventId:string;screenId:string}
export interface VisualTask {schemaVersion:1;owner:VisualOwner;name:string;width:number;height:number;scope:'first-screen';document:string;documentHash:string;fingerprint:string}
export interface VisualEnvironment {browser:'chromium'|'webkit'|'firefox';version:string;platform:string;machine:string;fontHash:string}
export interface PixelImage {width:number;height:number;pixels:Uint8ClampedArray}
export interface VisualMetrics {sizeMatches:boolean;changedPixels:number;totalPixels:number;ratio:number}
interface ImageRef {relPath:string;sha256:string}
export interface VisualEvidence {schemaVersion:1;id:string;owner:VisualOwner;taskFingerprint:string;documentHash:string;width:number;height:number;
 capturedAt:number;importedAt:number;environment:VisualEnvironment;status:'passed'|'failed'|'initialized';threshold:number;channelThreshold:number;
 metrics:VisualMetrics;reportHash:string;images:Record<'reference'|'actual'|'diff',ImageRef>}
export interface VisualResult {schemaVersion:1;taskFingerprint:string;documentHash:string;environment:VisualEnvironment;capturedAt:number;
 status:VisualEvidence['status'];threshold:number;channelThreshold:number;metrics:VisualMetrics;
 images:Record<'reference'|'actual'|'diff',{file:string;sha256:string}>}
const hex=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const roles=['reference','actual','diff'] as const;
export async function visualHash(value:string|Uint8Array):Promise<string>{
 const bytes=typeof value==='string'?new TextEncoder().encode(value):new Uint8Array(value);
 return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes.buffer))].map(n=>n.toString(16).padStart(2,'0')).join('');
}
const binding=(task:Pick<VisualTask,'owner'|'width'|'height'|'documentHash'>)=>[1,task.owner.projectId,task.owner.kind,task.owner.eventId,task.owner.screenId,task.documentHash,task.width,task.height,'first-screen'];
export async function createVisualTask(storage:ProjectStorage,owner:VisualOwner):Promise<VisualTask>{
 const record=owner.kind==='single'?await new DeliveryRepository(storage,owner.projectId).get(owner.screenId,owner.eventId):
  owner.kind==='restyle'?await new RestyleDeliveryRepository(storage,owner.projectId).get(owner.eventId):null;
 if(!record||record.status!=='applied')throw Error('交付事件不存在或尚未应用，不能导出视觉任务。');
 const page='after' in record?record.after:record.pages.find(page=>page.after.id===owner.screenId)?.after;
 if(!page||page.id!==owner.screenId)throw Error('视觉任务页面不属于此交付。');
 const viewport=resolveProjectViewport(record.settings);if(viewport.width*viewport.height>6_000_000)throw Error('视觉任务设备超过600万像素。');
 const allowed=new Set(record.assets.map(asset=>asset.relPath));
 const resolved=await resolveImportedResources(page.htmlContent,page.scopedCss,storage,allowed);
 const css=Object.entries(record.overrides).filter(([key])=>key.startsWith(owner.screenId+':')).map(([,o])=>`[data-nid="${o.nid}"]{${Object.entries(o.declarations).filter(([,v])=>v!==null&&v!==undefined&&v!=='').map(([p,v])=>`${p}:${v.replace(/\s*!important\s*$/i,'')} !important`).join(';')}}`).join('\n');
 const override=(await resolveImportedResources('<body></body>',css,storage,allowed)).scopedCss??'';
 const document=buildExportRenderDocument({...page,...resolved,position:{x:0,y:0}},{tokensCss:compileTokensToCss(record.designSystem.tokens,record.settings.colorMode),
  baseCss:getBaseCss(record.settings.deviceProfile),screenOverrides:override,width:viewport.width,viewportHeight:viewport.height,
  deviceProfile:record.settings.deviceProfile,useCustomNavigation:record.settings.useCustomNavigation,bgColor:resolveThemeColors(record.designSystem.tokens,record.settings.colorMode).values.background});
 const task:VisualTask={schemaVersion:1,owner:{...owner},name:page.name,width:viewport.width,height:viewport.height,scope:'first-screen',document,documentHash:await visualHash(document),fingerprint:''};
 task.fingerprint=await visualHash(JSON.stringify(binding(task)));return task;
}
export function compareVisualPixels(reference:PixelImage,actual:PixelImage,channelThreshold=12):VisualMetrics{
 const width=Math.max(reference.width,actual.width),height=Math.max(reference.height,actual.height);let changed=0;
 if(!Number.isInteger(channelThreshold)||channelThreshold<0||channelThreshold>255||width*height>6_000_000)throw Error('像素复核参数超过上限。');
 for(const image of [reference,actual]){
  if(!Number.isInteger(image.width)||!Number.isInteger(image.height)||image.width<1||image.height<1||image.pixels.length!==image.width*image.height*4)throw Error('截图像素不完整。');
  for(let i=3;i<image.pixels.length;i+=4)if(image.pixels[i]!==255)throw Error('请使用不透明的PNG截图进行复核。');
 }
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const ai=(y*reference.width+x)*4,bi=(y*actual.width+x)*4,hasA=x<reference.width&&y<reference.height,hasB=x<actual.width&&y<actual.height;
  for(let channel=0;channel<3;channel++){const a=hasA?reference.pixels[ai+channel]:channel===1?0:255,b=hasB?actual.pixels[bi+channel]:channel===1?0:255;if(Math.abs(a-b)>channelThreshold){changed++;break;}}
 }
 return {sizeMatches:reference.width===actual.width&&reference.height===actual.height,changedPixels:changed,totalPixels:width*height,ratio:changed/(width*height)};
}
export async function decodeVisualPng(bytes:Uint8Array):Promise<PixelImage>{
 const expected=inspectPreviewPng(bytesToBase64(bytes)),image=new Image();
 image.src='data:image/png;base64,'+bytesToBase64(bytes);
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{await Promise.race([image.decode(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('视觉图片解码超时。')),8000);})]);}finally{clearTimeout(timer);}
 if(image.naturalWidth!==expected.width||image.naturalHeight!==expected.height)throw Error('PNG解码尺寸不符。');
 const canvas=document.createElement('canvas');canvas.width=expected.width;canvas.height=expected.height;
 const context=canvas.getContext('2d');if(!context)throw Error('当前环境无法复核像素。');context.drawImage(image,0,0);
 return {...expected,pixels:context.getImageData(0,0,expected.width,expected.height).data};
}
function environment(value:unknown):value is VisualEnvironment{
 const e=value as VisualEnvironment;return !!e&&['chromium','webkit','firefox'].includes(e.browser)&&hex(e.fontHash)&&
 [e.version,e.platform,e.machine].every(v=>typeof v==='string'&&v.length>0&&v.length<=100);
}
function validMetrics(value:unknown):value is VisualMetrics{
 const m=value as VisualMetrics;return !!m&&typeof m.sizeMatches==='boolean'&&Number.isInteger(m.changedPixels)&&Number.isInteger(m.totalPixels)&&m.totalPixels>0&&m.totalPixels<=6_000_000&&m.changedPixels>=0&&m.changedPixels<=m.totalPixels&&m.ratio===m.changedPixels/m.totalPixels;
}
export function parseVisualResult(raw:string):VisualResult{
 if(new TextEncoder().encode(raw).length>64*1024)throw Error('视觉报告超过64KiB。');
 let r:VisualResult;try{r=JSON.parse(raw) as VisualResult;}catch{throw Error('视觉报告JSON无法解析。');}
 if(!r||r.schemaVersion!==1||!hex(r.taskFingerprint)||!hex(r.documentHash)||!environment(r.environment)||!Number.isSafeInteger(r.capturedAt)||r.capturedAt<=0||
 !['passed','failed','initialized'].includes(r.status)||r.threshold!==.005||r.channelThreshold!==12||!validMetrics(r.metrics)||
 !roles.every(role=>r.images?.[role]?.file===role+'.png'&&hex(r.images[role].sha256)))throw Error('视觉报告格式或固定对比规则不正确。');
 const {browser,version,platform,machine,fontHash}=r.environment;
 return {schemaVersion:1,taskFingerprint:r.taskFingerprint,documentHash:r.documentHash,environment:{browser,version,platform,machine,fontHash},capturedAt:r.capturedAt,
  status:r.status,threshold:r.threshold,channelThreshold:r.channelThreshold,metrics:{sizeMatches:r.metrics.sizeMatches,changedPixels:r.metrics.changedPixels,totalPixels:r.metrics.totalPixels,ratio:r.metrics.ratio},images:Object.fromEntries(roles.map(role=>[role,{file:role+'.png',sha256:r.images[role].sha256}])) as VisualResult['images']};
}
const eventKey=(owner:VisualOwner)=>JSON.stringify([owner.projectId,owner.kind,owner.eventId,owner.screenId]);
const imagePath=(id:string,role:string)=>`assets/images/visual-evidence-${id}-${role}.png`;
const recordPath=(id:string)=>`deliveries/visual/${id}.json`;
const validId=(id:string)=>/^visual-[a-f0-9-]{36}$/.test(id);
function validEvidence(r:VisualEvidence):boolean{
 return !!r&&r.schemaVersion===1&&validId(r.id)&&!!r.owner&&['single','restyle'].includes(r.owner.kind)&&
 [r.owner.projectId,r.owner.eventId,r.owner.screenId].every(v=>typeof v==='string'&&v.length>0&&v.length<=200)&&
 hex(r.taskFingerprint)&&hex(r.documentHash)&&hex(r.reportHash)&&environment(r.environment)&&validMetrics(r.metrics)&&
 Number.isSafeInteger(r.width)&&Number.isSafeInteger(r.height)&&r.width>0&&r.height>0&&r.width*r.height<=6_000_000&&
 Number.isSafeInteger(r.importedAt)&&r.importedAt>0&&Number.isSafeInteger(r.capturedAt)&&r.capturedAt>0&&['passed','failed','initialized'].includes(r.status)&&
 r.threshold===.005&&r.channelThreshold===12&&(r.status==='initialized'?r.metrics.sizeMatches&&r.metrics.changedPixels===0&&r.images?.reference?.sha256===r.images?.actual?.sha256:r.status===(r.metrics.sizeMatches&&r.metrics.ratio<=.005?'passed':'failed'))&&roles.every(role=>r.images?.[role]?.relPath===imagePath(r.id,role)&&hex(r.images[role].sha256));
}
export async function listVisualEvidence(storage:ProjectStorage,owner:VisualOwner):Promise<{records:VisualEvidence[];invalidFiles:number}>{
 const files=(await storage.listDir('deliveries/visual')).filter(name=>/^visual-[a-f0-9-]{36}\.json$/.test(name));
 if(files.length>500)throw Error('视觉档案超过500份，请按工程目录归档后重试。');
 const records:VisualEvidence[]=[];let invalidFiles=0;
 for(const file of files){try{const raw=await storage.readText('deliveries/visual/'+file);if(!raw||raw.length>64*1024)throw Error('bad');const r=JSON.parse(raw) as VisualEvidence;
  if(!validEvidence(r)||file!==r.id+'.json')throw Error('bad');
  const external=parseVisualResult(JSON.stringify({...r,images:Object.fromEntries(roles.map(role=>[role,{file:role+'.png',sha256:r.images[role].sha256}]))}));
  if(await visualHash(JSON.stringify(external))!==r.reportHash||await visualHash(JSON.stringify(binding(r)))!==r.taskFingerprint)throw Error('bad');if(eventKey(r.owner)===eventKey(owner))records.push(r);
 }catch{invalidFiles++;}}
 return {records:records.sort((a,b)=>b.importedAt-a.importedAt),invalidFiles};
}
const imports=new Set<string>();
export async function importVisualEvidence(storage:ProjectStorage,owner:VisualOwner,raw:string,files:ReadonlyMap<string,Uint8Array>,options:{check:()=>void;decode?:typeof decodeVisualPng}):Promise<{record:VisualEvidence;duplicate:boolean}>{
 owner={...owner};const key=eventKey(owner);if(imports.has(key))throw Error('正在导入此交付的视觉报告。');imports.add(key);
 const created:string[]=[];let published=false;
 try{
  options.check();const result=parseVisualResult(raw);
  if(files.size!==3||!roles.every(role=>files.has(role+'.png')))throw Error('请选择reference.png、actual.png和diff.png三张图。');
  const snapshots=new Map<string,Uint8Array>();for(const role of roles){const bytes=files.get(role+'.png')!;if(bytes.length>8*1024*1024)throw Error('每张PNG最多8MiB。');snapshots.set(role+'.png',new Uint8Array(bytes));}
  const task=await createVisualTask(storage,owner);options.check();
  if(result.taskFingerprint!==task.fingerprint||result.documentHash!==task.documentHash)throw Error('报告与当前交付视觉任务不匹配，请重新导出任务。');
  const decoded={} as Record<typeof roles[number],PixelImage>;
  for(const role of roles){const bytes=snapshots.get(role+'.png')!;inspectPreviewPng(bytesToBase64(bytes));
   if(await visualHash(bytes)!==result.images[role].sha256)throw Error(`${role}.png 哈希不一致。`);options.check();decoded[role]=await(options.decode??decodeVisualPng)(bytes);options.check();}
  if(decoded.reference.width!==task.width||decoded.reference.height!==task.height)throw Error('基准尺寸与交付设备不一致。');
  if(decoded.diff.width!==Math.max(decoded.reference.width,decoded.actual.width)||decoded.diff.height!==Math.max(decoded.reference.height,decoded.actual.height))throw Error('差异图尺寸不正确。');
  const metrics=compareVisualPixels(decoded.reference,decoded.actual,result.channelThreshold);
  if(JSON.stringify(metrics)!==JSON.stringify(result.metrics))throw Error('报告指标与本机像素复核不一致。');
  const status=result.status==='initialized'?'initialized':metrics.sizeMatches&&metrics.ratio<=result.threshold?'passed':'failed';
  if(status!==result.status||(status==='initialized'&&(metrics.changedPixels!==0||!metrics.sizeMatches||result.images.reference.sha256!==result.images.actual.sha256)))throw Error('报告通过状态与本机复核不一致。');
  const reportHash=await visualHash(JSON.stringify(result)),previous=await listVisualEvidence(storage,owner);options.check();
  const duplicate=previous.records.find(record=>record.reportHash===reportHash);
  if(duplicate)return {record:duplicate,duplicate:true};
  const id='visual-'+crypto.randomUUID(),record:VisualEvidence={schemaVersion:1,id,owner:{...owner},taskFingerprint:task.fingerprint,documentHash:task.documentHash,width:task.width,height:task.height,
   capturedAt:result.capturedAt,importedAt:Date.now(),environment:result.environment,status,threshold:result.threshold,channelThreshold:result.channelThreshold,metrics,reportHash,
   images:Object.fromEntries(roles.map(role=>[role,{relPath:imagePath(id,role),sha256:result.images[role].sha256}])) as VisualEvidence['images']};
  for(const path of [recordPath(id),...roles.map(role=>record.images[role].relPath)]){options.check();if(await storage.exists(path))throw Error('视觉档案ID冲突，未覆盖已有记录。');}
  await storage.ensureDir('assets/images');await storage.ensureDir('deliveries/visual');
  for(const role of roles){options.check();const path=record.images[role].relPath;created.push(path);await storage.writeBinary(path,bytesToBase64(snapshots.get(role+'.png')!));
   if(await storage.readBinary(path)!==bytesToBase64(snapshots.get(role+'.png')!))throw Error('视觉图片写入读回不一致。');}
  options.check();if((await createVisualTask(storage,owner)).fingerprint!==task.fingerprint)throw Error('交付资源或渲染任务已变化，未关联报告。');options.check();
  const path=recordPath(id);created.push(path);await storage.writeTextAtomic(path,JSON.stringify(record));options.check();
  if(await storage.readText(path)!==JSON.stringify(record))throw Error('视觉报告写入读回不一致。');options.check();published=true;
  return {record,duplicate:false};
 }finally{imports.delete(key);if(!published)for(const path of created)await storage.remove(path).catch(error=>console.warn('[visual-evidence] 清理失败',error));}
}
export async function readVisualImage(storage:ProjectStorage,record:VisualEvidence,role:typeof roles[number]):Promise<string>{
 if(!validEvidence(record))throw Error('视觉档案格式不正确。');
 const base64=await storage.readBinary(record.images[role].relPath);if(!base64)throw Error('视觉图片缺失。');
 inspectPreviewPng(base64);const bytes=Uint8Array.from(atob(base64),c=>c.charCodeAt(0));
 if(await visualHash(bytes)!==record.images[role].sha256)throw Error('视觉图片内容已变化。');return 'data:image/png;base64,'+base64;
}
