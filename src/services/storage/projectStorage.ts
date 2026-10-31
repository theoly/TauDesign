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

export interface ProjectStorage {
  readonly kind: 'folder' | 'localStorage';
  /** Stable persistence scope for coordinating instances that write the same conversation files. */
  readonly scopeKey?:string;
  ensureDir(rel: string): Promise<void>;
  exists(rel: string): Promise<boolean>;
  readText(rel: string): Promise<string | null>;
  /** 原子写入：临时文件 + 重命名，崩溃时保持上一个完整版本 */
  writeTextAtomic(rel: string, contents: string): Promise<void>;
  /** JSONL 追加：不读不改已有内容 */
  appendLine(rel: string, line: string): Promise<void>;
  /** 读取最后 N 行 */
  readTailLines(rel: string, limit: number): Promise<string[]>;
  readAllLines(rel: string): Promise<string[]>;
  writeBinary(rel: string, base64Data: string): Promise<void>;
  readBinary(rel: string): Promise<string | null>;
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

  constructor(private readonly root: string, private readonly invoke: Invoke) {}

  ensureDir(rel: string) { return this.invoke<void>('project_ensure_dir', { root: this.root, rel }); }
  exists(rel: string) { return this.invoke<boolean>('project_exists', { root: this.root, rel }); }
  readText(rel: string) { return this.invoke<string | null>('project_read_text', { root: this.root, rel }); }
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

  async ensureDir() { /* localStorage 无目录概念 */ }
  async exists(rel: string) { return localStorage.getItem(this.key(rel)) !== null; }
  async readText(rel: string) { return localStorage.getItem(this.key(rel)); }
  async writeTextAtomic(rel: string, contents: string) { this.setItem(rel, contents); }

  async appendLine(rel: string, line: string) {
    const prev = localStorage.getItem(this.key(rel)) ?? '';
    const sanitized = line.replace(/\r?\n/g, '\\n');
    this.setItem(rel, prev ? `${prev}\n${sanitized}` : sanitized);
  }

  async readAllLines(rel: string) {
    const raw = localStorage.getItem(this.key(rel));
    return raw ? raw.split('\n').filter((l) => l.trim()) : [];
  }

  async readTailLines(rel: string, limit: number) {
    const all = await this.readAllLines(rel);
    return all.slice(Math.max(0, all.length - limit));
  }

  async writeBinary(rel: string, base64Data: string) { this.setItem(rel, base64Data); }

  async readBinary(rel: string): Promise<string | null> {
    return localStorage.getItem(this.key(rel));
  }

  async listDir(rel: string) {
    const p = `${this.prefix}:${rel.replace(/\/$/, '')}/`;
    return Object.keys(localStorage)
      .filter((k) => k.startsWith(p))
      .map((k) => k.slice(p.length))
      .sort();
  }

  async remove(rel: string) { localStorage.removeItem(this.key(rel)); }
}

/** 按运行环境选择实现：有 Tauri 且带 folderPath 走文件夹，否则回退 localStorage */
export function createProjectStorage(projectId: string, folderPath?: string): ProjectStorage {
  const invoke = getInvoke();
  if (invoke && folderPath) return new TauriFolderStorage(folderPath, invoke);
  return new LocalStorageStorage(`aidesign:fs:${projectId}`);
}
