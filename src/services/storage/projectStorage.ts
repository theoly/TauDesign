/**
 * 工程存储层抽象 (A2 / T-AE-30)。
 *
 * 存在两套实现：
 *   - `TauriFolderStorage` —— PRD D1/§3.8.2 指定的工程文件夹，经 Rust 侧 project_fs 命令；
 *   - `LocalStorageStorage` —— 浏览器回退（`bun test` / `vite dev` 无 Tauri 运行时时使用）。
 *
 * 之所以先抽象而非直接改写调用点：ISSUE-008 的介质迁移与会话存档是两件事，
 * 上层不该知道自己写的是文件还是 localStorage。
 */

import { invoke as tauriInvoke, isTauri } from '@tauri-apps/api/core';
import { isDesktopRuntime } from './folderPicker';
import {isManagedProjectPath,projectTransactionPath,validateProjectFileChanges,PROJECT_TRANSACTION_STATE,type ManagedProjectSnapshot,type ProjectFileChange} from './managedProjectSnapshot';
import {readBrowserProject,publishBrowserProject} from './browserProjectSnapshot';
import {browserResourceFileStore,initializeBrowserResources,isBrowserResourcePath} from './browserResourceStore';
import {validatePublicationResources,type RenderResourceFile} from './renderResourceSnapshot';

export interface TaskArchiveFile {path:string;contents:string}
export function validateTaskArchive(files:TaskArchiveFile[],deletedMarker?:string,directory=true){
 if(files.length>5000||!directory&&(files.length>0||deletedMarker===undefined)||new Set(files.map(file=>file.path)).size!==files.length)throw Error('任务归档文件数量或身份无效。');let total=0;
 for(const file of files){if(!/^(?:artifacts\/)?[a-zA-Z0-9][a-zA-Z0-9_.-]{0,199}\.(?:json|jsonl|html|txt)$/.test(file.path)||file.path.split('/').at(-1)!.length>200||typeof file.contents!=='string')throw Error('任务归档路径或内容无效。');const size=new TextEncoder().encode(file.contents).length;total+=size;if(size>24*1024*1024||total>128*1024*1024)throw Error('任务归档超过迁移额度。');}
 if(deletedMarker!==undefined&&(typeof deletedMarker!=='string'||!deletedMarker.length||new TextEncoder().encode(deletedMarker).length>2048))throw Error('删除记录超过迁移额度或内容为空。');
}

export interface ProjectStorage {
  readonly kind: 'folder' | 'localStorage';
  /** Stable persistence scope for coordinating instances that write the same conversation files. */
  readonly scopeKey?:string;
  readManagedSnapshot?():Promise<ManagedProjectSnapshot>;
  publishManagedSnapshot?(expected:string,changes:ProjectFileChange[],resources?:RenderResourceFile[]):Promise<string>;
  ensureDir(rel: string): Promise<void>;
  createTextExclusive?(rel:string,contents:string,expectedManifest?:string|null):Promise<boolean>;
  taskManifestIdentity?(id:string):Promise<string|null>;
  publishTaskManifest?(id:string,expected:string|null,contents:string):Promise<void>;
  deleteDesignTask?(id:string,expected:string|null):Promise<void>;
  importTaskArchive?(id:string,files:TaskArchiveFile[],deletedMarker?:string,directory?:boolean):Promise<void>;
  exists(rel: string): Promise<boolean>;
  readText(rel: string): Promise<string | null>;
  readTextLimited?(rel:string,maxBytes:number):Promise<string|null>;
  /** 原子写入：临时文件 + 重命名，崩溃时保持上一个完整版本 */
  writeTextAtomic(rel: string, contents: string): Promise<void>;
  /** JSONL 追加：不读不改已有内容 */
  appendLine(rel: string, line: string): Promise<void>;
  /** 读取最后 N 行 */
  readTailLines(rel: string, limit: number): Promise<string[]>;
  readAllLines(rel: string): Promise<string[]>;
  writeBinary(rel: string, base64Data: string): Promise<void>;
  readBinary(rel: string): Promise<string | null>;
  /** Bounds decoded bytes before allocation on native files. */
  readBinaryLimited?(rel:string,maxBytes:number):Promise<string|null>;
  listDir(rel: string): Promise<string[]>;
  remove(rel: string): Promise<void>;
}

type Invoke = <T>(cmd: string, args: Record<string, unknown>) => Promise<T>;

function getInvoke(): Invoke | null {
  if (!isDesktopRuntime()) return null;
  try {
    if (isTauri()) {
      return tauriInvoke as Invoke;
    }
  } catch {
    // 环境缺少 window.__TAURI_INTERNALS__ 时安全捕获
  }
  const w = globalThis as unknown as {
    __TAURI_INTERNALS__?: { invoke?: Invoke };
    __TAURI__?: { core?: { invoke?: Invoke } };
  };
  if (w.__TAURI__?.core?.invoke) {
    return w.__TAURI__.core.invoke;
  }
  if (w.__TAURI_INTERNALS__?.invoke) {
    return (cmd, args) => w.__TAURI_INTERNALS__!.invoke!(cmd, args);
  }
  return tauriInvoke as Invoke;
}

/** 工程文件夹实现（Tauri 运行时） */
export class TauriFolderStorage implements ProjectStorage {
  readonly kind = 'folder' as const;
  get scopeKey(){return `folder:${this.root}`;}

  private readonly invoke:Invoke;
  constructor(private readonly root: string, invoke: Invoke) {
    this.invoke=async<T>(command:string,args:Record<string,unknown>):Promise<T>=>{
      try{return await invoke<T>(command,args);}
      catch(error){
        // Tauri rejects Result::Err(String) as a string. Preserve its actual
        // filesystem/resource reason for the shared Error-based delivery UI.
        if(error instanceof Error)throw error;
        throw Error(typeof error==='string'?error:'原生文件操作失败，请检查工程目录与权限。');
      }
    };
  }

  readManagedSnapshot(){return this.invoke<ManagedProjectSnapshot>('project_managed_snapshot',{root:this.root});}
  publishManagedSnapshot(expected:string,changes:ProjectFileChange[],resources:RenderResourceFile[]=[]){validateProjectFileChanges(changes);validatePublicationResources(resources);return this.invoke<string>(resources.length?'project_publish_snapshot_checked':'project_publish_snapshot',{root:this.root,expected,changes,...(resources.length?{resources}:{})});}

  createTextExclusive(rel:string,contents:string,expectedManifest?:string|null){return this.invoke<boolean>('project_create_text_exclusive',{root:this.root,rel,contents,expected:expectedManifest??null});}
  taskManifestIdentity(id:string){return this.invoke<string|null>('project_task_manifest_identity',{root:this.root,id});}
  publishTaskManifest(id:string,expected:string|null,contents:string){return this.invoke<void>('project_publish_task_manifest',{root:this.root,id,expected,contents});}
  deleteDesignTask(id:string,expected:string|null){return this.invoke<void>('project_delete_design_task',{root:this.root,id,expected});}
  importTaskArchive(id:string,files:TaskArchiveFile[],deletedMarker?:string,directory=true){validateTaskArchive(files,deletedMarker,directory);return this.invoke<void>('project_import_task_archive',{root:this.root,id,files,deletedMarker:deletedMarker??null,directory});}
  ensureDir(rel: string) { return this.invoke<void>('project_ensure_dir', { root: this.root, rel }); }
  exists(rel: string) { return this.invoke<boolean>('project_exists', { root: this.root, rel }); }
  readText(rel: string) { return this.invoke<string | null>('project_read_text', { root: this.root, rel }); }
  readTextLimited(rel:string,maxBytes:number){return this.invoke<string|null>('project_read_text_limited',{root:this.root,rel,maxBytes});}
  writeTextAtomic(rel: string, contents: string) {
    return this.invoke<void>('project_write_text_atomic', { root: this.root, rel, contents });
  }
  appendLine(rel: string, line: string) {
    return this.invoke<void>('project_append_line', { root: this.root, rel, line });
  }
  readTailLines(rel: string, limit: number) {
    return this.invoke<string[]>('project_read_tail_lines', { root: this.root, rel, limit });
  }
  readAllLines(rel: string) { return this.invoke<string[]>('project_read_all_lines', { root: this.root, rel }); }
  writeBinary(rel: string, base64Data: string) {
    return this.invoke<void>('project_write_binary', { root: this.root, rel, base64Data });
  }
  readBinary(rel: string) {
    return this.invoke<string | null>('project_read_binary', { root: this.root, rel });
  }
  readBinaryLimited(rel:string,maxBytes:number){return this.invoke<string|null>('project_read_binary_limited',{root:this.root,rel,maxBytes});}
  listDir(rel: string) { return this.invoke<string[]>('project_list_dir', { root: this.root, rel }); }
  remove(rel: string) { return this.invoke<void>('project_delete', { root: this.root, rel }); }
}

/**
 * localStorage 写满时抛出。
 *
 * **必须被上层捕获**：会话写失败绝不能连带拖垮工程主体的保存——
 * ISSUE-008 记录的数据丢失级风险正源于此前没有任何捕获。
 */
export class QuotaExceededError extends Error {
  constructor(public readonly rel: string) {
    super(`存储配额已满，无法写入 ${rel}`);
    this.name = 'QuotaExceededError';
  }
}

/** 浏览器回退实现 */
export class LocalStorageStorage implements ProjectStorage {
  readonly kind = 'localStorage' as const;
  get scopeKey(){return `localStorage:${this.prefix}`;}

  constructor(private readonly prefix: string) {}

  private key(rel: string) { return `${this.prefix}:${rel}`; }
  private legacyResources(){return Object.fromEntries(Object.keys(localStorage).filter(key=>key.startsWith(this.key('assets/'))).map(key=>[key.slice(this.key('').length),localStorage.getItem(key)!]));}
  private resources(){return initializeBrowserResources(this.scopeKey,()=>this.legacyResources());}
  private resourcePath(rel:string){const path=this.canonical(rel);if(path==='assets'||path.startsWith('assets/')){if(path!=='assets'&&!isBrowserResourcePath(path))throw Error('工程资源路径无效。');return path;}return undefined;}
  private async resourceRead(rel:string){await this.resources();return (await browserResourceFileStore.read(this.scopeKey,rel))?.value??null;}
  private async resourceWrite(rel:string,change:(previous:string|null)=>string|null){if(!isBrowserResourcePath(rel))throw Error('不能向资源根目录写入文件。');await this.resources();return browserResourceFileStore.update(this.scopeKey,rel,change);}
  private legacyManagedFiles(){
    if(localStorage.getItem(this.key(PROJECT_TRANSACTION_STATE))!==null)throw Error('工程有待核对的旧事务资料，未覆盖原数据。');
    return Object.fromEntries(Object.keys(localStorage).filter(key=>key.startsWith(this.key(''))&&isManagedProjectPath(key.slice(this.key('').length))).map(key=>[key.slice(this.key('').length),localStorage.getItem(key)!]));
  }
  private managed(){return readBrowserProject(this.scopeKey,()=>this.legacyManagedFiles());}
  private async projectLock<T>(run:()=>Promise<T>):Promise<T>{if(!navigator.locks)throw Error('当前浏览器没有跨实例排他锁，不能安全发布工程。');return navigator.locks.request('design-project:'+this.key('project'),run);}
  private async managedRead<T>(rel:string,run:(files?:Record<string,string>)=>Promise<T>):Promise<T>{
    if(!projectTransactionPath(rel)&&this.canonical(rel)!=='')return run();
    return run((await this.managed()).files);
  }
  private canonical(rel:string){return rel.split('/').filter(part=>part&&part!=='.').join('/');}
  private writeManaged(rel:string,contents:string|null|((previous:string|null)=>string)){
    return this.projectLock(async()=>{const before=await this.managed(),path=this.canonical(rel);let changes:ProjectFileChange[];
      if(isManagedProjectPath(path))changes=[{path,contents:typeof contents==='function'?contents(before.files[path]??null):contents}];
      else if(contents===null)changes=Object.keys(before.files).filter(key=>key.startsWith(path+'/')).map(path=>({path,contents:null}));
      else throw Error('不能向工程目录写入文件正文。');
      if(changes.length)await publishBrowserProject(this.scopeKey,()=>this.legacyManagedFiles(),before.identity,changes);
    });
  }
  readManagedSnapshot(){return this.projectLock(()=>this.managed());}
  publishManagedSnapshot(expected:string,changes:ProjectFileChange[],resources:RenderResourceFile[]=[]){validatePublicationResources(resources);return this.projectLock(()=>publishBrowserProject(this.scopeKey,()=>this.legacyManagedFiles(),expected,changes,{files:resources,legacy:()=>this.legacyResources()}));}
  private taskPath(rel:string):{id:string;tail:string}|undefined{
    if(!rel.startsWith('tasks/'))return;const [,id,...parts]=rel.split('/');
    if(id==='.locks'||!/^design-[a-z0-9-]{1,110}$/.test(id))throw Error('任务目录或锁记录不能通过普通入口修改。');return {id,tail:parts.join('/')};
  }
  private async taskLock<T>(id:string,run:()=>Promise<T>):Promise<T>{
    if(!/^design-[a-z0-9-]{1,110}$/.test(id))throw Error('任务标识无效。');
    if(!navigator.locks)throw Error('当前浏览器没有跨实例排他锁，不能安全写入任务。');
    return navigator.locks.request('design-tasks:'+this.key('tasks'),run);
  }
  private assertTaskLive(id:string,allowClaim=false){
    if(localStorage.getItem(this.key(`tasks/.locks/${id}.deleted`))!==null)throw Error('任务已被清理，拒绝迟到写入。');
    if(!allowClaim&&localStorage.getItem(this.key(`tasks/${id}/recovery-claim.json`))!==null)throw Error('任务已被新恢复任务接替，拒绝旧产物写入。');
    const prefix=this.key('tasks/'),names=new Set(Object.keys(localStorage).filter(key=>key.startsWith(prefix)).map(key=>key.slice(prefix.length).split('/')[0]).filter(name=>/^design-[a-z0-9-]{1,110}$/.test(name)));
    if(!names.has(id)&&names.size>=40)throw Error('设计任务存档已达40项，请清理历史记录。');
  }
  private async mutate<T>(rel:string,run:()=>Promise<T>):Promise<T>{
    if(projectTransactionPath(rel))throw Error('受管工程文件必须通过条件发布入口写入。');
    const task=this.taskPath(rel);if(!task)return run();
    if(!task.tail||['manifest.json','recovery-claim.json'].includes(task.tail))throw Error('任务清单或目录必须通过原子任务事务修改。');
    return this.taskLock(task.id,async()=>{this.assertTaskLive(task.id,task.tail==='attempts.jsonl');return run();});
  }
  async taskManifestIdentity(id:string):Promise<string|null>{
    if(!/^design-[a-z0-9-]{1,110}$/.test(id))throw Error('任务标识无效。');const raw=await this.readText(`tasks/${id}/manifest.json`);if(raw===null)return null;
    const bytes=new TextEncoder().encode(raw);if(bytes.length>64*1024*1024)throw Error('任务清单超过身份检查额度。');return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
  }
  async publishTaskManifest(id:string,expected:string|null,contents:string){
    return this.taskLock(id,async()=>{this.assertTaskLive(id);if(await this.taskManifestIdentity(id)!==expected)throw Error('任务清单已由其它实例更新，未覆盖新记录。');
      const value=JSON.parse(contents);if(value.id!==id||value.version!==1||typeof value.projectId!=='string'||new TextEncoder().encode(contents).length>800000)throw Error('任务清单身份或大小无效。');
      const old=await this.readText(`tasks/${id}/manifest.json`);if(old&&JSON.parse(old).state==='completed'&&old!==contents)throw Error('已完成任务不能被旧执行覆盖。');
      this.setItem(`tasks/${id}/manifest.json`,contents);
    });
  }
  async deleteDesignTask(id:string,expected:string|null){
    return this.taskLock(id,async()=>{if(await this.taskManifestIdentity(id)!==expected)throw Error('任务清单已变化，未删除新记录。');
      this.setItem(`tasks/.locks/${id}.deleted`,'{"version":1,"deleted":true}');
      localStorage.removeItem(this.key(`tasks/${id}`));const prefix=this.key(`tasks/${id}/`);for(const key of Object.keys(localStorage))if(key.startsWith(prefix))localStorage.removeItem(key);
    });
  }

  async importTaskArchive(id:string,files:TaskArchiveFile[],deletedMarker?:string,directory=true){
    validateTaskArchive(files,deletedMarker,directory);
    return this.taskLock(id,async()=>{
      if(localStorage.getItem(this.key(`tasks/.locks/${id}.deleted`))!==null)throw Error('目标已有删除标记，未覆盖。');
      if(directory)this.assertTaskLive(id,true);
      const prefix=this.key(`tasks/${id}/`);if(localStorage.getItem(this.key(`tasks/${id}`))!==null||Object.keys(localStorage).some(key=>key.startsWith(prefix)))throw Error('目标已有任务目录，未覆盖。');
      const entries=[...files].sort((a,b)=>Number(a.path==='manifest.json')-Number(b.path==='manifest.json')),written:Array<{path:string;value:string}>=[];
      try{
        // Keep the authority manifest last; an interrupted import is never a complete task.
        if(deletedMarker!==undefined){const path=`tasks/.locks/${id}.deleted`;this.setItem(path,deletedMarker);written.push({path,value:deletedMarker});}
        if(directory&&!files.length){const path=`tasks/${id}`;this.setItem(path,'');written.push({path,value:''});}
        for(const file of entries){const path=`tasks/${id}/${file.path}`;this.setItem(path,file.contents);written.push({path,value:file.contents});}
      }catch(error){for(const file of written)if(localStorage.getItem(this.key(file.path))===file.value)localStorage.removeItem(this.key(file.path));throw error;}
    });
  }

  private setItem(rel: string, value: string) {
    try {
      localStorage.setItem(this.key(rel), value);
    } catch (e) {
      const name = (e as { name?: string })?.name ?? '';
      if (name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED') {
        throw new QuotaExceededError(rel);
      }
      throw e;
    }
  }

  async ensureDir(rel='') { projectTransactionPath(rel); /* localStorage 无目录概念 */ }
  async exists(rel: string) { const resource=this.resourcePath(rel);if(resource){await this.resources();return (await browserResourceFileStore.list(this.scopeKey)).some(row=>row.value!==null&&(row.path===resource||row.path.startsWith(resource+'/')));}return this.managedRead(rel,async files=>files?Object.prototype.hasOwnProperty.call(files,this.canonical(rel))||Object.keys(files).some(path=>path.startsWith(this.canonical(rel)+'/')):localStorage.getItem(this.key(rel)) !== null); }
  async createTextExclusive(rel:string,contents:string,expectedManifest?:string|null){
    const match=/^tasks\/(design-[a-z0-9-]{1,110})\/recovery-claim\.json$/.exec(rel);let claim:any;
    try{claim=JSON.parse(contents);}catch{throw Error('恢复占用内容无效。');}
    if(!match||new TextEncoder().encode(contents).length>2048||claim?.version!==1||claim.originTaskId!==match[1]||!/^design-[a-z0-9-]{1,110}$/.test(claim.newTaskId)||claim.newTaskId===claim.originTaskId||!Number.isSafeInteger(claim.createdAt)||claim.createdAt<0)throw Error('恢复占用路径或内容无效。');
    return this.taskLock(match[1],async()=>{this.assertTaskLive(match[1],true);if(await this.taskManifestIdentity(match[1])!==(expectedManifest??null))throw Error('恢复来源清单已变化。');if(localStorage.getItem(this.key(rel))!==null)return false;this.setItem(rel,contents);return true;});
  }
  async readText(rel: string) { const resource=this.resourcePath(rel);if(resource)return this.resourceRead(resource);return this.managedRead(rel,async files=>files?files[this.canonical(rel)]??null:localStorage.getItem(this.key(rel))); }
  async readTextLimited(rel:string,maxBytes:number){const text=await this.readText(rel);if(!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>4*1024*1024)throw Error('文本读取额度无效。');if(text!==null&&new TextEncoder().encode(text).length>maxBytes)throw Error('文本文件超过读取额度。');return text;}
  async writeTextAtomic(rel: string, contents: string) { if(projectTransactionPath(rel))return this.writeManaged(rel,contents);const resource=this.resourcePath(rel);if(resource)return this.resourceWrite(resource,()=>contents);return this.mutate(rel,async()=>this.setItem(rel, contents)); }

  async appendLine(rel: string, line: string) {
    if(projectTransactionPath(rel))return this.writeManaged(rel,previous=>{const sanitized=line.replace(/\r?\n/g,'\\n');return previous?`${previous}\n${sanitized}`:sanitized;});
    const resource=this.resourcePath(rel);if(resource)return this.resourceWrite(resource,previous=>{const sanitized=line.replace(/\r?\n/g,'\\n');return previous?`${previous}\n${sanitized}`:sanitized;});
    return this.mutate(rel,async()=>{
    const prev = localStorage.getItem(this.key(rel)) ?? '';
    const sanitized = line.replace(/\r?\n/g, '\\n');
    this.setItem(rel, prev ? `${prev}\n${sanitized}` : sanitized);
    });
  }

  async readAllLines(rel: string) {
    const raw = await this.readText(rel);
    return raw ? raw.split('\n').filter((l) => l.trim()) : [];
  }

  async readTailLines(rel: string, limit: number) {
    const all = await this.readAllLines(rel);
    return all.slice(Math.max(0, all.length - limit));
  }

  async writeBinary(rel: string, base64Data: string) { if(projectTransactionPath(rel))return this.writeManaged(rel,base64Data);const resource=this.resourcePath(rel);if(resource)return this.resourceWrite(resource,()=>base64Data);return this.mutate(rel,async()=>this.setItem(rel, base64Data)); }

  async readBinary(rel: string): Promise<string | null> {
    return this.readText(rel);
  }
  async readBinaryLimited(rel:string,maxBytes:number){
    if(!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>32*1024*1024)throw Error('二进制读取额度无效。');
    const value=await this.readBinary(rel);if(value!==null&&(value.length>Math.ceil(maxBytes/3)*4||atob(value).length>maxBytes))throw Error('媒体文件超过读取额度。');return value;
  }

  async listDir(rel: string) {
    const resource=this.resourcePath(rel);if(resource){await this.resources();return (await browserResourceFileStore.list(this.scopeKey)).filter(row=>row.value!==null&&row.path.startsWith(resource+'/')).map(row=>row.path.slice(resource.length+1)).sort();}
    return this.managedRead(rel,async files=>{
    const prefix=this.canonical(rel)?this.canonical(rel)+'/':'',p=this.key(prefix);
    const legacy=Object.keys(localStorage)
      .filter((k) => k.startsWith(p))
      .map((k) => k.slice(p.length))
      .filter(name=>(!files||!isManagedProjectPath(prefix+name))&&!isBrowserResourcePath(prefix+name));
    const resources=prefix?[]:(await this.resources(),(await browserResourceFileStore.list(this.scopeKey)).filter(row=>row.value!==null).map(row=>row.path));
    return [...new Set([...legacy,...resources,...Object.keys(files??{}).filter(path=>path.startsWith(prefix)).map(path=>path.slice(prefix.length))])].sort();});
  }

  async remove(rel: string) {if(rel==='tasks')throw Error('不能直接清理任务根目录。');if(projectTransactionPath(rel))return this.writeManaged(rel,null);const resource=this.resourcePath(rel);if(resource){await this.resources();return browserResourceFileStore.remove(this.scopeKey,resource);}return this.mutate(rel,async()=>localStorage.removeItem(this.key(rel))); }
}

/** 按运行环境选择实现：有 Tauri 且带 folderPath 走文件夹，否则回退 localStorage */
export function createProjectStorage(projectId: string, folderPath?: string): ProjectStorage {
  const invoke = getInvoke();
  if (invoke && folderPath) return new TauriFolderStorage(folderPath, invoke);
  return new LocalStorageStorage(`aidesign:fs:${projectId}`);
}
