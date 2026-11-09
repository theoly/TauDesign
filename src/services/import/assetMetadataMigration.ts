import type {Asset} from '../../types/project';
import type {PageCreationState} from '../ai/pageCreationValidation';
import {contentFingerprint} from '../ai/designWorkflow';
import {assertLibraryEditable} from '../ai/designLibraryReference';
import {isSafeProjectAssetPath} from '../ai/projectAssetIntegrity';
import {createProjectStorage,type ProjectStorage} from '../storage/projectStorage';
import {assertPassiveSvgResource} from './importResources';
export interface PreparedAssetMetadataMigration {id:string;rows:Array<{id:string;name:string;relPath:string;cacheBytes:number;matchesFile:boolean}>}
type State=Pick<PageCreationState,'id'|'folderPath'|'assets'|'designLibraryBinding'>;
interface Entry {key:string;storage:ProjectStorage;before:Asset[];after:Asset[];files:Array<{path:string;hash:string}>;original:PreparedAssetMetadataMigration;state:'ready'|'consumed'|'used'}
const entries=new WeakMap<PreparedAssetMetadataMigration,Entry>(),limit=10*1024*1024;
const key=(state:State,ids:string[])=>contentFingerprint(JSON.stringify([state.id,state.folderPath,state.designLibraryBinding,ids.map(id=>state.assets[id])]));
const hash=async(bytes:Uint8Array)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes.buffer as ArrayBuffer)),b=>b.toString(16).padStart(2,'0')).join('');
export const assetsWithEmbeddedSvgCache=(state:State)=>Object.values(state.assets).filter(asset=>asset.rawSvg!==undefined);
async function file(storage:ProjectStorage,path:string){const value=storage.readBinaryLimited?await storage.readBinaryLimited(path,limit):await storage.readBinary(path);if(value===null)throw Error(`独立资源文件缺失，保留原缓存，请先恢复资源：${path}`);let bytes:Uint8Array;try{bytes=Uint8Array.from(atob(value),c=>c.charCodeAt(0));}catch{throw Error('独立SVG文件编码无效。');}if(!bytes.length||bytes.length>limit)throw Error('独立SVG为空或超过10MiB。');assertPassiveSvgResource(new TextDecoder('utf-8',{fatal:true}).decode(bytes));return {bytes,hash:await hash(bytes)};}
function guard(handle:PreparedAssetMetadataMigration,state:State,signal?:AbortSignal){const entry=entries.get(handle);if(!entry||entry.state==='used'||signal?.aborted||JSON.stringify(handle)!==JSON.stringify(entry.original)||key(state,entry.before.map(a=>a.id))!==entry.key)throw Error('资源缓存整理已停止、来源变化或选择无效。');for(const asset of entry.before)assertLibraryEditable(state,'assets',asset.id);return entry;}
/** Read-only. The existing independent file is authoritative; neither file nor page is rewritten. */
export async function prepareAssetMetadataMigration(state:State,ids:string[],options:{signal?:AbortSignal;isCurrent:()=>boolean}):Promise<PreparedAssetMetadataMigration>{
 if(!ids.length||ids.length>100||new Set(ids).size!==ids.length)throw Error('请选择1–100个含旧SVG缓存的资源。');
 const source=structuredClone({id:state.id,folderPath:state.folderPath,assets:state.assets,designLibraryBinding:state.designLibraryBinding}),storage=createProjectStorage(source.id,source.folderPath),before:Asset[]=[],after:Asset[]=[],files:Entry['files']=[],rows:PreparedAssetMetadataMigration['rows']=[];let total=0;
 const current=()=>{if(options.signal?.aborted||!options.isCurrent())throw Error('资源缓存整理已停止或工程变化。');};current();
 for(const id of ids){const asset=source.assets[id];if(!asset||typeof asset.rawSvg!=='string'||asset.mimeType!=='image/svg+xml'||!isSafeProjectAssetPath(asset.relPath)||!asset.relPath.endsWith('.svg'))throw Error('所选资源不含可整理的SVG缓存或独立路径无效。');assertLibraryEditable(source,'assets',id);
  const cache=new TextEncoder().encode(asset.rawSvg);total+=cache.byteLength;if(cache.byteLength>limit||total>30*1024*1024)throw Error('旧SVG缓存超过单个10MiB或批次30MiB。');assertPassiveSvgResource(asset.rawSvg);
  const actual=await file(storage,asset.relPath);current();total+=actual.bytes.byteLength;if(total>30*1024*1024)throw Error('资源整理读取超过批次30MiB。');const {rawSvg:_cache,...clean}=asset;
  before.push(asset);after.push(clean);files.push({path:asset.relPath,hash:actual.hash});rows.push({id,name:asset.name,relPath:asset.relPath,cacheBytes:cache.byteLength,matchesFile:await hash(cache)===actual.hash});current();
 }
 const handle=Object.freeze({id:crypto.randomUUID(),rows});entries.set(handle,{key:key(source,ids),storage,before,after,files,original:structuredClone(handle),state:'ready'});return handle;
}
export function assetMetadataMigrationCurrent(handle:PreparedAssetMetadataMigration,state:State){try{return guard(handle,state).state==='ready';}catch{return false;}}
export async function consumeAssetMetadataMigration(handle:PreparedAssetMetadataMigration,getState:()=>State,signal?:AbortSignal){const entry=guard(handle,getState(),signal);if(entry.state!=='ready')throw Error('资源缓存整理已使用。');entry.state='consumed';try{await verifyAssetMetadataFiles(handle,getState,signal);return {before:structuredClone(entry.before),after:structuredClone(entry.after)};}catch(error){entry.state='used';throw error;}}
export async function verifyAssetMetadataFiles(handle:PreparedAssetMetadataMigration,getState:()=>State,signal?:AbortSignal){const entry=guard(handle,getState(),signal);for(const previous of entry.files){const next=await file(entry.storage,previous.path);guard(handle,getState(),signal);if(next.hash!==previous.hash)throw Error('整理期间独立SVG字节已变化，未移除缓存。');}}
export function claimAssetMetadataMigration(handle:PreparedAssetMetadataMigration,state:State,signal?:AbortSignal){const entry=guard(handle,state,signal);if(entry.state!=='consumed')throw Error('资源缓存尚未完成检查。');entry.state='used';}
