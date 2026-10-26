import { useHistoryStore } from '../../stores/useHistoryStore';
import { createProjectStorage } from './projectStorage';
import {
  HistoryRepository,
  HistorySnapshot,
  deleteHistoryLocal,
  readHistoryLocal,
  writeHistoryLocal,historyKey,serializeHistory,LOCAL_HISTORY_BUDGET
} from './historyRepository';

/**
 * 历史归档的落盘调度 (BR-HIS-04 / BR-HIS-06)
 *
 * 只认显式传入的工程标识，不反查工程 store——切换工程时「旧栈已清空、新工程尚未载入」
 * 的中间态一旦被写出去，就会把某一方的归档抹平，这是本模块存在的唯一理由。
 */

const SAVE_DEBOUNCE_MS = 400;

interface PersistTarget {
  projectId: string;
  folderPath?: string;
}

let timer: ReturnType<typeof setTimeout> | null = null;
let pending: PersistTarget | null = null;
/** 工程加载期间挂起一切落盘 (BR-HIS-04) */
let suspended = false;

function snapshot(): HistorySnapshot {
  const { past, future, checkpoints } = useHistoryStore.getState();
  return { past, future, checkpoints };
}

async function writeNow(target: PersistTarget,checked=false): Promise<void> {
  const snap = snapshot();
  if (target.folderPath) {
    const operation=new HistoryRepository(
      createProjectStorage(target.projectId, target.folderPath),
      target.projectId
    )
      .save(snap);
    if(checked)await operation;else await operation.catch((e)=>console.warn('[history] 归档写入失败',e));
    return;
  }
  if(checked)localStorage.setItem(historyKey(target.projectId),serializeHistory(target.projectId,snap,LOCAL_HISTORY_BUDGET));
  else writeHistoryLocal(target.projectId, snap);
}

function cancelPending(): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  pending = null;
}

/** 历史发生变化后调度一次防抖落盘 */
export function scheduleHistorySave(projectId: string, folderPath?: string): void {
  if (suspended || !projectId) return;
  pending = { projectId, folderPath };
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    const target = pending;
    pending = null;
    if (target && !suspended) void writeNow(target);
  }, SAVE_DEBOUNCE_MS);
}

/** 立即落盘（返回工程管理页、关闭应用前调用） */
export function flushHistorySave(projectId?: string, folderPath?: string): void {
  const target = projectId ? { projectId, folderPath } : pending;
  cancelPending();
  if (suspended || !target) return;
  void writeNow(target);
}

/** Awaited switch barrier; failures retain the current workspace and its in-memory History. */
export async function flushHistorySaveChecked(projectId:string,folderPath?:string):Promise<void>{
 if(suspended)throw Error('历史正在加载，请稍后再切换源库。');
 cancelPending();await writeNow({projectId,folderPath},true);
}

/** 进入工程加载流程：丢弃在途写入并挂起落盘 */
export function suspendHistoryPersistence(): void {
  cancelPending();
  suspended = true;
}

export function resumeHistoryPersistence(): void {
  suspended = false;
}

export function isHistoryPersistenceSuspended(): boolean {
  return suspended;
}

/**
 * 读取并恢复指定工程的历史归档 (BR-HIS-02)。
 * 恢复完成后自动解除挂起；读不到归档则以空栈启动。
 */
export async function loadHistoryForProject(projectId: string, folderPath?: string,isCurrent:()=>boolean=()=>true): Promise<boolean> {
  let snap: HistorySnapshot | null = null;
  try {
    snap = folderPath
      ? await new HistoryRepository(createProjectStorage(projectId, folderPath), projectId).load()
      : readHistoryLocal(projectId);
  } catch (e) {
    console.warn('[history] 归档读取失败，以空栈启动', e);
    snap = null;
  }

  if(!isCurrent())return false;
  useHistoryStore.getState().restore(snap);
  resumeHistoryPersistence();
  return Boolean(snap);
}

/** 删除工程时一并清理归档 (BR-HIS-07) */
export function deleteHistoryArchive(projectId: string, folderPath?: string): void {
  deleteHistoryLocal(projectId);
  if (folderPath) {
    void new HistoryRepository(createProjectStorage(projectId, folderPath), projectId)
      .remove()
      .catch(() => { /* 文件不存在或目录已删除，忽略 */ });
  }
}
