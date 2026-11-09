import { ProjectStorage } from './projectStorage';
import { Checkpoint, HistoryEntry } from '../../types/history';
import {createProjectStorage} from './projectStorage';
import {prepareHistoryMedia,checkedHydrateHistoryMedia} from './historyMedia';

/**
 * 撤销/重做历史的工程级归档 (BR-HIS-01 / doc/feature/history-persistence/spec.md)
 *
 * 历史此前是纯内存态，关闭工程即丢失。归档单独成文（而非塞进 project.json）：
 * 历史体量与工程正文不在一个量级，且损坏时应当可以单独丢弃而不牵连工程数据。
 */

export const HISTORY_SCHEMA_VERSION = 1;
export const HISTORY_FILE = 'history.json';
export const historyKey = (projectId: string) => `ai_designer_history_${projectId}`;
export const historyCacheKey=(projectId:string)=>`ai_designer_history_cache_${projectId}`;
const cachedHistory=(id:string)=>localStorage.getItem(historyCacheKey(id))??localStorage.getItem(historyKey(id));

/** 文件夹工程的归档预算；历史存磁盘，可以宽松些 */
export const FOLDER_HISTORY_BUDGET = 8 * 1024 * 1024;
/** localStorage 工程的归档预算；整个域共享 ~5MB，必须克制 */
export const LOCAL_HISTORY_BUDGET = 1024 * 1024;

export interface HistorySnapshot {
  past: HistoryEntry[];
  future: HistoryEntry[];
  checkpoints: Checkpoint[];
}

export interface PersistedHistory extends HistorySnapshot {
  schemaVersion: number;
  projectId: string;
  savedAt: number;
}

const EMPTY: HistorySnapshot = { past: [], future: [], checkpoints: [] };

/**
 * 按字节预算裁剪归档 (BR-HIS-05)。
 * 丢弃顺序：最旧的 past → 最旧的还原点 → 最旧的 future；最近 1 条 past 始终保留，
 * 保证「至少还能撤销一步」这一最低承诺。
 */
export function trimHistoryForPersist(snapshot: HistorySnapshot, budgetBytes: number): HistorySnapshot {
  let past = [...snapshot.past];
  let future = [...snapshot.future];
  let checkpoints = [...snapshot.checkpoints];

  const size = () => JSON.stringify({ past, future, checkpoints }).length;

  while (size() > budgetBytes && past.length > 1) past = past.slice(1);
  while (size() > budgetBytes && checkpoints.length > 0) checkpoints = checkpoints.slice(0, -1);
  while (size() > budgetBytes && future.length > 0) future = future.slice(0, -1);

  return { past, future, checkpoints };
}

export function serializeHistory(
  projectId: string,
  snapshot: HistorySnapshot,
  budgetBytes: number
): string {
  const trimmed = trimHistoryForPersist(snapshot, budgetBytes);
  const doc: PersistedHistory = {
    schemaVersion: HISTORY_SCHEMA_VERSION,
    projectId,
    savedAt: Date.now(),
    ...trimmed
  };
  return JSON.stringify(doc);
}

/**
 * 解析归档。工程 id 或 schema 版本不符一律丢弃 (BR-HIS-03)——
 * 把 A 工程的 patch 回放到 B 工程上，破坏性远大于「历史丢了」。
 */
export function parseHistory(raw: string | null, projectId: string): HistorySnapshot | null {
  if (!raw) return null;
  try {
    const doc = JSON.parse(raw) as Partial<PersistedHistory>;
    if (doc.schemaVersion !== HISTORY_SCHEMA_VERSION) return null;
    if (doc.projectId !== projectId) return null;
    return {
      past: Array.isArray(doc.past) ? doc.past : [],
      future: Array.isArray(doc.future) ? doc.future : [],
      checkpoints: Array.isArray(doc.checkpoints) ? doc.checkpoints : []
    };
  } catch {
    return null;
  }
}

export const emptyHistorySnapshot = (): HistorySnapshot => ({ ...EMPTY, past: [], future: [], checkpoints: [] });

// ── localStorage 工程通道 ────────────────────────────────────────────────

export function readHistoryLocal(projectId: string): HistorySnapshot | null {
  try {
    return parseHistory(cachedHistory(projectId), projectId);
  } catch {
    return null;
  }
}

/** Encoded-media archives need asynchronous verified file reads before they become undo patches. */
export async function readHistoryLocalChecked(projectId:string):Promise<HistorySnapshot|null>{
 const raw=cachedHistory(projectId);if(!raw)return null;
 return parseHistory(await checkedHydrateHistoryMedia(raw,projectId,createProjectStorage(projectId)),projectId);
}
export function localHistoryRequiresFiles(projectId:string):boolean{
 try{return [2,3].includes(JSON.parse(cachedHistory(projectId)??'null')?.schemaVersion);}catch{return false;}
}

export async function prepareHistoryArchive(storage:ProjectStorage,projectId:string,snapshot:HistorySnapshot,budget=FOLDER_HISTORY_BUDGET):Promise<string>{
 return prepareHistoryMedia({projectId,savedAt:Date.now(),...trimHistoryForPersist(snapshot,budget)},storage);
}

/** Decode the history belonging to an already-read project snapshot. */
export async function readHistoryArchive(storage:ProjectStorage,projectId:string,raw:string|null):Promise<HistorySnapshot|null>{
 if(!raw)return null;
 let doc:unknown;try{doc=JSON.parse(raw);}catch{throw Error('工程历史记录损坏，原归档已保留。');}
 const value=doc as Partial<PersistedHistory>;
 if(!value||![1,2,3].includes(value.schemaVersion as number)||value.projectId!==projectId||!Array.isArray(value.past)||!Array.isArray(value.future)||!Array.isArray(value.checkpoints))throw Error('工程历史格式或身份不匹配，原归档已保留。');
 return parseHistory([2,3].includes(value.schemaVersion as number)?await checkedHydrateHistoryMedia(raw,projectId,storage):raw,projectId);
}

export async function writeHistoryLocalChecked(projectId:string,snapshot:HistorySnapshot):Promise<void>{
 const serialized=await prepareHistoryArchive(createProjectStorage(projectId),projectId,snapshot,LOCAL_HISTORY_BUDGET);
 localStorage.setItem(historyKey(projectId),serialized);
}

const localHistoryWrites=new Map<string,Promise<void>>();
/** Preserve event order when a binary-bearing save is still preparing its independent files. */
export function saveHistoryLocalOrdered(projectId:string,snapshot:HistorySnapshot):Promise<void>{
 const pending=localHistoryWrites.get(projectId),frozen=structuredClone({past:snapshot.past,future:snapshot.future,checkpoints:snapshot.checkpoints});
 const media=/data:|<svg(?:[\s/>]|\\[nrt])/i.test(JSON.stringify(frozen));
 if(!pending&&!media){localStorage.setItem(historyKey(projectId),serializeHistory(projectId,frozen,LOCAL_HISTORY_BUDGET));return Promise.resolve();}
 const operation=(pending??Promise.resolve()).catch(()=>{}).then(()=>writeHistoryLocalChecked(projectId,frozen));
 localHistoryWrites.set(projectId,operation);
 void operation.finally(()=>{if(localHistoryWrites.get(projectId)===operation)localHistoryWrites.delete(projectId);}).catch(()=>{});
 return operation;
}

export function writeHistoryLocal(projectId: string, snapshot: HistorySnapshot): void {
  try {
    void saveHistoryLocalOrdered(projectId,snapshot).catch(e=>console.warn('[history] 归档写入失败',e));
  } catch (e) {
    // 配额超限等写入失败只降级告警：历史丢失远不如中断用户编辑严重
    console.warn('[history] 归档写入失败', e);
  }
}

export function deleteHistoryLocal(projectId: string): void {
  try {
    localStorage.removeItem(historyKey(projectId));
    localStorage.removeItem(historyCacheKey(projectId));
  } catch {
    /* 残留归档无害，下次以 projectId 校验兜底 */
  }
}

// ── 文件夹工程通道 ──────────────────────────────────────────────────────

const historyWrites=new Map<string,Promise<void>>();
export class HistoryRepository {
  constructor(private readonly storage: ProjectStorage, private readonly projectId: string) {}

  async save(snapshot: HistorySnapshot): Promise<void> {
    const frozen=structuredClone({past:snapshot.past,future:snapshot.future,checkpoints:snapshot.checkpoints});
    const operation=(historyWrites.get(this.projectId)??Promise.resolve()).catch(()=>{}).then(async()=>{
      const serialized=await prepareHistoryArchive(this.storage,this.projectId,frozen);
      await this.storage.writeTextAtomic(HISTORY_FILE,serialized);
    });
    historyWrites.set(this.projectId,operation);
    try{await operation;}finally{if(historyWrites.get(this.projectId)===operation)historyWrites.delete(this.projectId);}
  }

  async load(): Promise<HistorySnapshot | null> {
    const raw = await this.storage.readText(HISTORY_FILE);
    if(!raw)return null;
    let schema:unknown;try{schema=JSON.parse(raw).schemaVersion;}catch{return null;}
    return parseHistory((schema===2||schema===3)?await checkedHydrateHistoryMedia(raw,this.projectId,this.storage):raw,this.projectId);
  }

  async remove(): Promise<void> {
    await this.storage.remove(HISTORY_FILE);
  }
}
