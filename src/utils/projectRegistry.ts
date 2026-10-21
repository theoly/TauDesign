/**
 * 工程注册表 (PRD §3.0.1 / D21)
 *
 * 此前全局只有一份工程，存在单一 localStorage key 下。引入工程管理页后，
 * 每个工程独立存储，另维护一份轻量元信息列表供管理页渲染卡片——
 * 列表只存元信息，不存工程正文，避免打开管理页时把全部工程解析一遍。
 *
 * 两个 store 都依赖本模块，放在 utils 层以避免 store 之间的循环引用。
 */

export const WORKSPACE_KEY = 'ai_designer_workspace_v1';
export const LEGACY_PROJECT_KEY = 'ai_designer_project_autosave_v1';

export const projectKey = (id: string) => `ai_designer_project_${id}`;

export interface ProjectMeta {
  id: string;
  name: string;
  deviceProfile: 'pc' | 'mobile';
  frameWidth: number;
  referenceViewportHeight?: number;
  createdAt: number;
  updatedAt: number;
  screenCount: number;
  /** 首个画框的 HTML，用于管理页卡片缩略图 */
  previewHtml?: string;
  /** 该工程的 Token CSS，保证缩略图配色与工程一致 */
  previewCss?: string;
  /**
   * 工程文件夹绝对路径 (T-AE-42/43)。
   *
   * 注册表本身保留在 localStorage——它只是「最近打开」列表，体量小且天然属于
   * 应用级偏好而非工程数据。**工程正文**则落在该路径指向的文件夹里。
   * 未设置时表示该工程仍是尚未迁移的 localStorage 工程。
   */
  folderPath?: string;
  /** 自定义工程封面图片 DataURL */
  coverImage?: string;
}

/** 工程是否已迁移至文件夹 */
export const isFolderProject = (meta: ProjectMeta): boolean => Boolean(meta.folderPath);

function safeRead<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function listProjects(): ProjectMeta[] {
  return safeRead<ProjectMeta[]>(WORKSPACE_KEY, []).sort((a, b) => b.updatedAt - a.updatedAt);
}

export function upsertMeta(meta: ProjectMeta): void {
  const all = safeRead<ProjectMeta[]>(WORKSPACE_KEY, []);
  const idx = all.findIndex((p) => p.id === meta.id);
  if (idx >= 0) all[idx] = meta;
  else all.push(meta);
  try {
    localStorage.setItem(WORKSPACE_KEY, JSON.stringify(all));
  } catch (e) {
    console.warn('Workspace registry write failed', e);
  }
}

/** 仅移出列表，不删除工程数据 */
export function removeMeta(id: string): void {
  const all = safeRead<ProjectMeta[]>(WORKSPACE_KEY, []).filter((p) => p.id !== id);
  try {
    localStorage.setItem(WORKSPACE_KEY, JSON.stringify(all));
  } catch (e) {
    console.warn('Workspace registry write failed', e);
  }
}

export function readProject(id: string): string | null {
  try {
    return localStorage.getItem(projectKey(id));
  } catch {
    return null;
  }
}

export function writeProject(id: string, json: string): void {
  try {
    localStorage.setItem(projectKey(id), json);
  } catch (e) {
    console.warn('Project write failed', e);
  }
}

/** 彻底删除：工程数据 + 列表条目 */
export function deleteProjectData(id: string): void {
  try {
    localStorage.removeItem(projectKey(id));
  } catch (e) {
    console.warn('Project delete failed', e);
  }
  removeMeta(id);
}

/** 工程数据是否仍然存在——列表有条目但数据丢失时，卡片需置灰 */
export function projectExists(id: string): boolean {
  return readProject(id) !== null;
}

/**
 * 把旧版单工程存档迁移为注册表中的一条工程，避免升级后用户看到空列表。
 * 只在注册表为空且旧 key 存在时执行一次。
 */
export function migrateLegacyProject(): ProjectMeta | null {
  if (listProjects().length > 0) return null;
  const legacy = safeRead<any>(LEGACY_PROJECT_KEY, null);
  if (!legacy) return null;

  const id = legacy.id && legacy.id !== 'proj_default' ? legacy.id : `proj_${Date.now().toString(36)}`;
  const screens = legacy.screens || {};
  const firstScreen = Object.values(screens)[0] as { htmlContent?: string } | undefined;

  const meta: ProjectMeta = {
    id,
    name: legacy.name || '未命名工程',
    deviceProfile: legacy.settings?.deviceProfile || 'pc',
    frameWidth: legacy.settings?.frameWidth || 1440,
    createdAt: legacy.savedAt || Date.now(),
    updatedAt: legacy.savedAt || Date.now(),
    screenCount: Object.keys(screens).length,
    previewHtml: firstScreen?.htmlContent
  };

  writeProject(id, JSON.stringify({ ...legacy, id }));
  upsertMeta(meta);
  try {
    localStorage.removeItem(LEGACY_PROJECT_KEY);
  } catch {
    /* 迁移已完成，旧 key 残留无害 */
  }
  return meta;
}
