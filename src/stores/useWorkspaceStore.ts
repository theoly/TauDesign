import { create } from 'zustand';
import { DesignSystem } from '../types/designSystem';
import {
  ProjectMeta,
  listProjects,
  migrateLegacyProject,
  projectExists,
  projectKey,
  readProject,
  removeMeta,
  upsertMeta
} from '../utils/projectRegistry';
import { createProjectStorage } from '../services/storage/projectStorage';
import { ProjectRepository, migrateProjectToFolder } from '../services/storage/projectRepository';
import { folderDisplayName, isDesktopRuntime, pickProjectFolder } from '../services/storage/folderPicker';
import { useProjectStore } from './useProjectStore';
import { useHistoryStore } from './useHistoryStore';
import { HistoryRepository, readHistoryLocal } from '../services/storage/historyRepository';
import {
  flushHistorySave,
  loadHistoryForProject,
  resumeHistoryPersistence,
  suspendHistoryPersistence
} from '../services/storage/historyPersistence';

/** 应用视图路由 (PRD §3.0 / D21)：启动先进工程管理页，选定工程后才进工作空间 */
export type AppView = 'manager' | 'workspace';

/**
 * 撤销栈与 checkpoint 都是工程作用域的。切换工程时必须一并清空，
 * 否则撤销会把上一个工程的 patch 应用到当前工程上。
 *
 * 清空前先挂起落盘 (BR-HIS-04)：否则「旧栈已清空、新工程尚未载入」的中间态
 * 会被写进某一方的归档文件，把历史抹平。挂起由 `loadHistoryForProject` 解除。
 */
function resetHistory(): void {
  suspendHistoryPersistence();
  useHistoryStore.getState().restore(null);
}

export interface OpenLocalFolderResult {
  ok: boolean;
  message: string;
  notProject?: boolean;
  folderPath?: string;
}

interface WorkspaceState {
  view: AppView;
  projects: ProjectMeta[];
  activeProjectId: string | null;
  /** 数据已丢失但仍在列表中的工程 id，卡片需置灰 */
  missingIds: string[];

  refresh: () => void;
  createProject: (name: string, deviceProfile: 'pc' | 'mobile', designSystem: DesignSystem, initialDecisions?: string[], folderPath?: string, referenceDeviceId?: string) => void;
  openProject: (id: string) => boolean;
  backToManager: () => void;
  renameProject: (id: string, name: string) => void;
  removeFromList: (id: string) => void;
  deleteProject: (id: string) => void;

  /** 打开任意本地 *.aidesign 工程文件夹 (T-AE-43 / PRD §3.0.1) */
  openLocalFolder: () => Promise<OpenLocalFolderResult>;
  /** 把仍在 localStorage 的工程迁移至文件夹 (T-AE-42) */
  migrateProject: (id: string) => Promise<{ ok: boolean; message: string }>;
  /** 上次异常退出的检测结果 (T-AE-44 / PRD §3.8.5) */
  uncleanShutdownAt: number | null;
  dismissRecovery: () => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  view: 'manager',
  projects: [],
  activeProjectId: null,
  missingIds: [],
  uncleanShutdownAt: null,

  dismissRecovery: () => set({ uncleanShutdownAt: null }),

  /**
   * 打开本地工程文件夹 (T-AE-43)。
   * 目录结构不完整时给出明确标记与引导信息，支持无缝衔接新建工程。
   */
  openLocalFolder: async () => {
    if (!isDesktopRuntime()) {
      return { ok: false, message: '当前为浏览器环境，打开本地文件夹需在桌面应用中使用' };
    }
    const folderPath = await pickProjectFolder();
    if (!folderPath) return { ok: false, message: '已取消' };

    const storage = createProjectStorage('external', folderPath);
    const repo = new ProjectRepository(storage);
    if (!(await repo.isValidProjectFolder())) {
      return {
        ok: false,
        notProject: true,
        folderPath,
        message: `所选文件夹缺少 project.json，不是有效的工程目录：${folderPath}`
      };
    }

    const doc = await repo.load();
    if (!doc) return { ok: false, message: 'project.json 解析失败，工程可能已损坏' };

    // 崩溃恢复检测：上次打开留下的 lock 仍在，说明异常退出 (T-AE-44)
    const uncleanAt = await repo.detectUncleanShutdown();
    await repo.acquireLock();

    resetHistory();
    const ok = useProjectStore.getState().loadProjectDocument(doc, folderPath);
    if (!ok) {
      resumeHistoryPersistence();
      return { ok: false, message: '工程载入失败' };
    }
    // 恢复该工程上次会话遗留的撤销/重做栈 (BR-HIS-02)
    await loadHistoryForProject(doc.id, folderPath);

    upsertMeta({
      id: doc.id,
      name: doc.name || folderDisplayName(folderPath),
      deviceProfile: (doc.settings as { deviceProfile?: 'pc' | 'mobile' }).deviceProfile ?? 'pc',
      frameWidth: (doc.settings as { frameWidth?: number }).frameWidth ?? 1440,
      createdAt: doc.createdAt ?? Date.now(),
      updatedAt: doc.savedAt ?? Date.now(),
      screenCount: Object.keys(doc.screens ?? {}).length,
      folderPath
    });
    get().refresh();
    set({ activeProjectId: doc.id, view: 'workspace', uncleanShutdownAt: uncleanAt });
    return { ok: true, message: `已打开 ${folderDisplayName(folderPath)}` };
  },

  /**
   * 迁移至文件夹 (T-AE-42)。**零丢失是门禁**：
   * 读回逐画框比对通过后才更新注册表，失败时源数据原封不动。
   */
  migrateProject: async (id) => {
    if (!isDesktopRuntime()) {
      return { ok: false, message: '当前为浏览器环境，迁移需在桌面应用中执行' };
    }
    const sourceJson = readProject(id);
    if (!sourceJson) return { ok: false, message: '找不到该工程的数据' };

    const folderPath = await pickProjectFolder('选择工程的存放位置');
    if (!folderPath) return { ok: false, message: '已取消' };

    const storage = createProjectStorage(id, folderPath);
    const result = await migrateProjectToFolder(sourceJson, storage);
    if (!result.ok) {
      // 源数据未被触碰，可直接重试
      return { ok: false, message: `迁移未完成，原数据未改动：${result.error ?? '未知错误'}` };
    }

    // 历史归档随工程一并迁移，避免迁移后撤销栈凭空消失 (BR-HIS-01)
    const localHistory = readHistoryLocal(id);
    if (localHistory) {
      await new HistoryRepository(storage, id)
        .save(localHistory)
        .catch((e) => console.warn('[history] 迁移归档失败', e));
    }

    const meta = listProjects().find((p) => p.id === id);
    if (meta) upsertMeta({ ...meta, folderPath });
    get().refresh();
    return { ok: true, message: `已迁移 ${result.screenCount} 个画框至 ${folderDisplayName(folderPath)}（原数据保留，确认无误后可手动清理）` };
  },

  refresh: () => {
    migrateLegacyProject();
    const projects = listProjects();
    set({
      projects,
      // 文件夹工程（有 folderPath）的数据存在本地文件系统而非 localStorage，
      // projectExists 只检查 localStorage，不适用于文件夹工程。
      // 此处只将「无 folderPath 且 localStorage 中无数据」的工程标记为丢失，
      // 文件夹工程打开时才会真正验证数据完整性。
      missingIds: projects
        .filter((p) => !p.folderPath && !projectExists(p.id))
        .map((p) => p.id)
    });
  },

  createProject: (name, deviceProfile, designSystem, initialDecisions, folderPath, referenceDeviceId) => {
    resetHistory();
    const id = useProjectStore.getState().initNewProject({ name, deviceProfile, designSystem, initialDecisions, folderPath, referenceDeviceId });
    // 新工程以空栈起步，立即恢复落盘
    resumeHistoryPersistence();
    get().refresh();
    set({ activeProjectId: id, view: 'workspace' });
  },

  openProject: (id) => {
    const meta = listProjects().find((p) => p.id === id);

    // 文件夹工程走仓储层：数据不在 localStorage 里，projectExists 判不出来
    if (meta?.folderPath) {
      const folderPath = meta.folderPath;
      const repo = new ProjectRepository(createProjectStorage(id, folderPath));
      void (async () => {
        const doc = await repo.load();
        if (!doc) {
          get().refresh();
          return;
        }
        const uncleanAt = await repo.detectUncleanShutdown();
        await repo.acquireLock();
        resetHistory();
        if (useProjectStore.getState().loadProjectDocument(doc, folderPath)) {
          await loadHistoryForProject(id, folderPath);
          set({ activeProjectId: id, view: 'workspace', uncleanShutdownAt: uncleanAt });
        } else {
          resumeHistoryPersistence();
        }
      })();
      return true;
    }

    if (!projectExists(id)) {
      get().refresh();
      return false;
    }
    resetHistory();
    const ok = useProjectStore.getState().loadProjectById(id);
    if (ok) {
      void loadHistoryForProject(id);
      set({ activeProjectId: id, view: 'workspace' });
    } else {
      resumeHistoryPersistence();
    }
    return ok;
  },

  backToManager: () => {
    const { id, folderPath } = useProjectStore.getState();
    useProjectStore.getState().saveProject();
    // 正常关闭前把撤销栈同步落盘，下次打开可继续 undo/redo (BR-HIS-06)
    flushHistorySave(id, folderPath);
    // 正常关闭：释放 lock，下次打开就不会报异常退出 (T-AE-44)
    if (folderPath) {
      void new ProjectRepository(createProjectStorage(id, folderPath))
        .releaseLock()
        .catch(() => { /* lock 释放失败最多导致下次误报一次恢复提示，无害 */ });
    }
    get().refresh();
    set({ view: 'manager', uncleanShutdownAt: null });
  },

  renameProject: (id, name) => {
    if (get().activeProjectId === id) {
      useProjectStore.getState().setName(name);
    } else {
      // 非当前工程：直接改存档，避免为了改名而载入整个工程
      const raw = localStorage.getItem(projectKey(id));
      if (raw) {
        try {
          const data = JSON.parse(raw);
          data.name = name;
          localStorage.setItem(projectKey(id), JSON.stringify(data));
        } catch {
          /* 存档损坏，仅更新列表名 */
        }
      }
      const meta = get().projects.find((p) => p.id === id);
      if (meta) upsertMeta({ ...meta, name });
    }
    get().refresh();
  },

  removeFromList: (id) => {
    removeMeta(id);
    get().refresh();
  },

  deleteProject: (id) => {
    useProjectStore.getState().deleteProject(id);
    get().refresh();
  }
}));
