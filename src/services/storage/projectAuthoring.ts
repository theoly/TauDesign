import type {ProjectStorage} from './projectStorage';
import type {ManagedProjectSnapshot} from './managedProjectSnapshot';

/** Process-local provenance only. Serialized handles have no authority after reopen. */
export interface ProjectAuthoringSession {readonly version:1}
interface Source {scope:string;projectId:string;identity:string;historyRaw:string|null;complete:boolean;readonlyReason?:string}
interface Author {scope:string;projectId?:string;identity?:string;historyRaw?:string|null;readonlyReason?:string}
const documents=new WeakMap<object,Source>(),authors=new WeakMap<ProjectAuthoringSession,Author>();
const scopes=new WeakMap<ProjectStorage,string>();
export function projectStorageScope(storage:ProjectStorage):string{
 if(storage.scopeKey)return storage.scopeKey;let scope=scopes.get(storage);if(!scope){scope='adapter:'+crypto.randomUUID();scopes.set(storage,scope);}return scope;
}
export function recordProjectDocumentSource(document:object,storage:ProjectStorage,projectId:string,snapshot:ManagedProjectSnapshot,complete:boolean,readonlyReason?:string){
 documents.set(document,{scope:projectStorageScope(storage),projectId,identity:snapshot.identity,historyRaw:snapshot.files['history.json']??null,complete,readonlyReason});
}
export function createProjectAuthoringSession(storage:ProjectStorage,document?:object):ProjectAuthoringSession{
 const scope=projectStorageScope(storage),source=document?documents.get(document):undefined;
 if(document&&(!source||source.scope!==scope||(document as {id?:unknown}).id!==source.projectId))throw Error('工程缺少与当前目录匹配的读取基线，请重新打开工程。');
 const handle=Object.freeze({version:1 as const});authors.set(handle,{scope,...(source?{projectId:source.projectId,identity:source.identity,historyRaw:source.historyRaw,...(!source.complete?{readonlyReason:source.readonlyReason??'工程有缺失的页面或需求正文，当前仅供恢复查看；请修复后重新打开，未覆盖原索引。'}:{})}:{})});return handle;
}
export function projectAuthor(storage:ProjectStorage,handle:ProjectAuthoringSession):Author{
 const author=authors.get(handle);if(!author||author.scope!==projectStorageScope(storage))throw Error('工程保存会话无效或目录已变化，请重新打开工程。');if(author.readonlyReason)throw Error(author.readonlyReason);return author;
}
export function projectAuthoringNotice(handle:ProjectAuthoringSession|null|undefined){return handle?authors.get(handle)?.readonlyReason:undefined;}
/** An ambiguous write is never a reason to adopt a later live version as this author's baseline. */
export function suspendProjectAuthoringSession(storage:ProjectStorage,handle:ProjectAuthoringSession,reason:string){
 const author=authors.get(handle);if(author&&author.scope===projectStorageScope(storage))author.readonlyReason=reason;
}
export function sourceForSave(document:object,storage:ProjectStorage):Source|undefined{const source=documents.get(document);return source?.scope===projectStorageScope(storage)?source:undefined;}
/** A read can narrow a matching author's permissions, never refresh its identity. */
export function restrictProjectAuthoringSession(storage:ProjectStorage,handle:ProjectAuthoringSession,document:object){
 const author=authors.get(handle),source=sourceForSave(document,storage);
 if(author&&source&&!source.complete&&author.identity===source.identity&&author.projectId===source.projectId)author.readonlyReason=source.readonlyReason??'工程有缺失的页面或需求正文，当前仅供恢复查看；请修复后重新打开，未覆盖原索引。';
}
/** The history paired with the explicitly opened project, never a later live-file read. */
export function projectAuthoringHistory(storage:ProjectStorage,handle:ProjectAuthoringSession):string|null{
 const author=authors.get(handle);if(!author||author.scope!==projectStorageScope(storage)||author.identity===undefined)throw Error('工程历史缺少打开时的来源，请重新打开工程。');return author.historyRaw??null;
}
export function projectDocumentHistory(storage:ProjectStorage,document:object):string|null{
 const source=sourceForSave(document,storage);if(!source)throw Error('工程文档缺少对应历史来源，请重新读取。');return source.historyRaw;
}
export function noteProjectCommit(storage:ProjectStorage,handle:ProjectAuthoringSession,projectId:string,identity:string,document:object,historyRaw:string|null){
 const author=projectAuthor(storage,handle);author.projectId=projectId;author.identity=identity;author.historyRaw=historyRaw;documents.set(document,{scope:author.scope,projectId,identity,historyRaw,complete:true});
}
