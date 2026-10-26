import {migrateProjectToFolder,type MigrationResult} from './projectRepository';
import type {ProjectStorage} from './projectStorage';

interface BundleEntry {path:string;binary:boolean;value:string}
export interface BundleMigrationResult extends MigrationResult {archiveFiles:number;warnings:string[]}
const roots=['candidates','drafts','deliveries','conversations','assets/images','assets/icons','assets/imports/fonts'];
const maxFiles=5000,maxBytes=128*1024*1024,maxFileBytes=24*1024*1024;
const textPath=(path:string)=>path==='candidates/current.json'||path==='conversations/index.json'||
 /^drafts\/draft-[a-z0-9-]+\.json$/.test(path)||
 /^conversations\/\d{4}-(?:0[1-9]|1[0-2])\.jsonl$/.test(path)||
 /^deliveries\/(?:screen-[a-f0-9]{8}\/delivery|restyle\/restyle|visual\/visual)-[a-z0-9-]+\.json$/.test(path);
const binaryPath=(path:string)=>/^assets\/(?:images|icons|imports\/fonts)\/[a-zA-Z0-9_-][a-zA-Z0-9_.-]*\.(?:png|jpe?g|webp|gif|avif|svg|ico|bmp|woff2?|ttf|otf)$/.test(path);
const subdirectory=(path:string)=>['deliveries/restyle','deliveries/visual'].includes(path)||/^deliveries\/screen-[a-f0-9]{8}$/.test(path);

/** LocalStorage lists descendants; native storage lists direct children. Accept both without trusting paths. */
async function inventory(source:ProjectStorage,check:()=>void):Promise<string[]> {
 const files=new Set<string>();
 const walk=async(directory:string)=>{
  check();const names=await source.listDir(directory);check();
  if(names.length>maxFiles)throw Error('附属档案超过5000个文件，请先拆分工程。');
  for(const name of names){
   const path=`${directory}/${name}`;
   if(!name||name.split('/').some(part=>!part||part==='.'||part==='..')||name.includes('\\'))throw Error(`附属档案路径不安全：${path}`);
   if(textPath(path)||binaryPath(path))files.add(path);
   else if(subdirectory(path))await walk(path);
   else throw Error(`不支持的附属档案路径：${path}`);
   if(files.size>maxFiles)throw Error('附属档案超过5000个文件，请先拆分工程。');
  }
 };
 for(const root of roots)await walk(root);
 return [...files].sort();
}
function references(value:unknown,paths:Set<string>):void {
 if(!value||typeof value!=='object')return;
 for(const [key,item] of Object.entries(value)){
  if(key==='relPath'&&typeof item==='string'&&item.startsWith('assets/'))paths.add(item);
  if(key==='attachments'&&Array.isArray(item))for(const path of item)if(typeof path==='string')paths.add(path);
  references(item,paths);
 }
}

/** Copy historical bytes, never reinterpret stored evidence as a current delivery pass. */
export async function migrateProjectBundle(input:{sourceJson:string;source:ProjectStorage;target:ProjectStorage;historyRaw:string|null;
 checkCurrent:()=>void;readHistory:()=>string|null}):Promise<BundleMigrationResult>{
 const {sourceJson,source,target,checkCurrent:check}=input;
 const warnings:string[]=[],entries:BundleEntry[]=[];let bytes=0;
 const result=(error:string):BundleMigrationResult=>({ok:false,screenCount:0,backup:sourceJson,archiveFiles:entries.length,warnings,error});
 try{
  check();const doc=JSON.parse(sourceJson),paths=await inventory(source,check),required=new Set<string>();
  if(paths.includes('candidates/current.json'))warnings.push('候选原文已保留；迁移重开后工程位置校验可能使其过期，需重新生成，旧验收不解锁采纳。');
  if(!doc||typeof doc.id!=='string'||!doc.screens||!doc.settings)throw Error('源工程文档无效。');
  const inspect=(path:string,raw:string)=>{
   const lines=path.endsWith('.jsonl')?raw.split('\n').filter(line=>line.trim()):[raw];let bad=0;
   for(const line of lines){try{const parsed=JSON.parse(line);references(parsed,required);
    if(path==='conversations/index.json'&&Array.isArray(parsed?.shards))for(const shard of parsed.shards){
     if(typeof shard.shard!=='string'||!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(shard.shard))throw Error('bad shard');
     if(!paths.includes(`conversations/${shard.shard}.jsonl`))throw Error(`索引引用的会话分片缺失：${shard.shard}`);
    }
   }catch(error){if(error instanceof Error&&error.message.startsWith('索引引用'))throw error;bad++;}}
   if(bad)warnings.push(`${path} 含${bad}条损坏记录，已按原文保留，重开沿用容错读取。`);
  };
  for(const path of paths){
   check();const binary=binaryPath(path),value=await(binary?source.readBinary(path):source.readText(path));check();
   if(value===null||(binary&&!value))throw Error(`附属文件缺失或为空：${path}`);
   const size=binary?Math.ceil(value.length*3/4):new TextEncoder().encode(value).length;
   bytes+=size;if(size>maxFileBytes||bytes>maxBytes)throw Error('附属档案超过单文件24MiB或总量128MiB预算。');
   entries.push({path,binary,value});if(!binary)inspect(path,value);
  }
  if(input.historyRaw!==null){
   const raw=input.historyRaw,size=new TextEncoder().encode(raw).length;bytes+=size;
   if(size>maxFileBytes||bytes>maxBytes)throw Error('撤销历史超过迁移预算。');
   entries.push({path:'history.json',binary:false,value:raw});inspect('history.json',raw);
   if(entries.length>maxFiles)throw Error('附属档案超过5000个文件，请先拆分工程。');
  }
  for(const path of required){if(!binaryPath(path))throw Error(`归档资源路径不安全：${path}`);if(!paths.includes(path))throw Error(`归档引用的资源缺失：${path}`);}
  const conflicts=['project.json','base.css','DESIGN.md',...entries.map(entry=>entry.path),
   ...Object.keys(doc.screens).flatMap(id=>[`screens/${id}.html`,`screens/${id}.css`,`screens/${id}.manifest.json`])];
  for(const path of conflicts){check();if(await target.exists(path))throw Error(`目标已有文件，未覆盖：${path}；请选择空目录。`);}
  if((await target.listDir('documents')).length)throw Error('目标已有项目文档，请选择空目录。');
  for(const entry of entries){
   check();const slash=entry.path.lastIndexOf('/');if(slash>=0)await target.ensureDir(entry.path.slice(0,slash));
   if(entry.binary)await target.writeBinary(entry.path,entry.value);else await target.writeTextAtomic(entry.path,entry.value);
   check();const got=await(entry.binary?target.readBinary(entry.path):target.readText(entry.path));
   if(got!==entry.value)throw Error(`附属文件读回不一致：${entry.path}`);
  }
  check();const migrated=await migrateProjectToFolder(sourceJson,target,source);if(!migrated.ok)return {...migrated,archiveFiles:entries.length,warnings};check();
  if(JSON.stringify(await inventory(source,check))!==JSON.stringify(paths))throw Error('迁移期间源文件清单已变化，请重试。');
  for(const entry of entries){check();const raw=entry.path==='history.json'?input.readHistory():await(entry.binary?source.readBinary(entry.path):source.readText(entry.path));
   if(raw!==entry.value)throw Error(`迁移期间源文件已变化：${entry.path}`);}
  if(input.readHistory()!==input.historyRaw)throw Error('迁移期间源撤销历史已变化。');check();
  return {...migrated,archiveFiles:entries.length,warnings};
 }catch(error){return result(String(error instanceof Error?error.message:error));}
}
