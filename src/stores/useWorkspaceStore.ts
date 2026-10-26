import {claimLibrarySourceEdit,readCompleteProject,sourceEditContext,type LibrarySourcePreview,type ProjectLocation} from '../services/ai/designLibrarySource';
import {saveStagedCandidate} from '../services/storage/candidateRepository';
import type {ProjectDocument} from '../services/storage/projectRepository';
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
import { ProjectRepository } from '../services/storage/projectRepository';
import {migrateProjectBundle} from '../services/storage/projectBundleMigration';
import { loadStagedCandidate } from '../services/storage/candidateRepository';
import { folderDisplayName, isDesktopRuntime, pickProjectFolder } from '../services/storage/folderPicker';
import { useProjectStore } from './useProjectStore';
import { useHistoryStore } from './useHistoryStore';
import { HistoryRepository, readHistoryLocal,historyKey } from '../services/storage/historyRepository';
import {
  flushHistorySave,flushHistorySaveChecked,
  loadHistoryForProject,
  resumeHistoryPersistence,
  suspendHistoryPersistence
} from '../services/storage/historyPersistence';

/** 应用视图路由 (PRD §3.0 / D21)：启动先进工程管理页，选定工程后才进工作空间 */
export type AppView = 'manager' | 'workspace';
let migrationBusy=false;

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

export interface LibraryEditingSession {source:ProjectLocation;returnTo:ProjectLocation}
interface WorkspaceState {
  navigationRevision:number;
  sourceEditing:LibraryEditingSession|null;
  sourceTransition:'entering'|'returning'|null;
  sourceTransitionError:string|null;
  enterLibrarySource:(preview:LibrarySourcePreview,signal?:AbortSignal)=>Promise<boolean>;
  returnFromLibrarySource:()=>Promise<boolean>;

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

async function saveWorkspaceChecked(check:()=>void):Promise<void>{
 check();const s=useProjectStore.getState();
 await s.saveProjectChecked();check();await flushHistorySaveChecked(s.id,s.folderPath);check();
 if(s.stagedScreen)await saveStagedCandidate(s.id,s.folderPath,{...s.stagedScreen,preview:s.stagedPreview?.report??s.stagedScreen.preview,
  validationEvidence:s.stagedValidationEvidence??s.stagedScreen.validationEvidence});
 else await loadStagedCandidate(s.id,s.folderPath); // Wait for queued discards before leaving.
 check();
}
async function readLocation(location:ProjectLocation,check:()=>void):Promise<ProjectDocument>{
 check();const doc=location.folderPath?await readCompleteProject(createProjectStorage(location.id,location.folderPath),check):JSON.parse(readProject(location.id)??'null');check();
 if(!doc||doc.id!==location.id||!doc.settings||!doc.designSystem||!doc.screens)throw Error('返回工程缺失或身份不匹配，未切换。');return doc;
}
async function prepareWorkspaceOpen(location:ProjectLocation,check:()=>void){
 const history=location.folderPath?await new HistoryRepository(createProjectStorage(location.id,location.folderPath),location.id).load():readHistoryLocal(location.id);check();
 const candidate=await loadStagedCandidate(location.id,location.folderPath);check();return {history,candidate};
}
function installWorkspaceDocument(doc:ProjectDocument,location:ProjectLocation,loaded:Awaited<ReturnType<typeof prepareWorkspaceOpen>>){
 const before=useProjectStore.getState(),history=useHistoryStore.getState();
 suspendHistoryPersistence();
 try{
  if(!useProjectStore.getState().loadProjectDocument(doc,location.folderPath))throw Error('工程载入失败。');
  useHistoryStore.getState().restore(loaded.history);resumeHistoryPersistence();
  if(loaded.candidate)useProjectStore.getState().restoreStagedCandidate(loaded.candidate,location.id);
 }catch(error){useProjectStore.setState(before,true);useHistoryStore.setState(history,true);resumeHistoryPersistence();throw error;}
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  navigationRevision:0,sourceEditing:null,sourceTransition:null,sourceTransitionError:null,
  view: 'manager',
  projects: [],
  activeProjectId: null,
  missingIds: [],
  uncleanShutdownAt: null,

  enterLibrarySource: async (preview,signal) => {
    if(get().sourceTransition||get().sourceEditing)return false;
    const origin=useProjectStore.getState(),context=sourceEditContext(origin),revision=get().navigationRevision+1;
    let committed=false,acquired=false,repo:ProjectRepository|undefined;
    const current=()=>get().navigationRevision===revision&&get().view==='workspace'&&sourceEditContext(useProjectStore.getState())===context&&!signal?.aborted;
    const check=()=>{if(!current())throw Error('当前工程已变化、导航已切换或源库编辑已取消。');};
    set({navigationRevision:revision,sourceTransition:'entering',sourceTransitionError:null});
    try{
      const claimed=claimLibrarySourceEdit(preview,origin);check();
      await claimed.read(check);await saveWorkspaceChecked(check);
      const doc=await claimed.read(check),source={id:doc.id,name:doc.name,folderPath:claimed.folderPath},returnTo={id:origin.id,name:origin.name,folderPath:origin.folderPath};
      const loaded=await prepareWorkspaceOpen(source,check);
      repo=new ProjectRepository(claimed.storage);const uncleanAt=await repo.detectUncleanShutdown();check();
      await repo.acquireLock();acquired=true;check();
      // Final read after all asynchronous preparation. No awaits between guard and installation.
      const finalDoc=await claimed.read(check);check();installWorkspaceDocument(finalDoc,source,loaded);
      set({sourceEditing:{source,returnTo},sourceTransition:null,activeProjectId:source.id,view:'workspace',uncleanShutdownAt:uncleanAt});committed=true;
      try{upsertMeta({id:doc.id,name:doc.name,deviceProfile:doc.settings.deviceProfile as 'pc'|'mobile',frameWidth:Number(doc.settings.frameWidth)||390,
        createdAt:doc.createdAt??Date.now(),updatedAt:doc.savedAt??Date.now(),screenCount:Object.keys(doc.screens).length,folderPath:claimed.folderPath});get().refresh();}catch(error){console.warn('[library-source] 已进入源库，工程列表更新失败',error);}
      if(origin.folderPath)void new ProjectRepository(createProjectStorage(origin.id,origin.folderPath)).releaseLock().catch(()=>{});
      return true;
    }catch(error){
      if(acquired&&!committed)await repo?.releaseLock().catch(()=>{});
      if(get().navigationRevision===revision)set({sourceTransition:null,sourceTransitionError:error instanceof Error?error.message:'进入源库失败。'});
      return false;
    }
  },
  returnFromLibrarySource: async () => {
    const session=get().sourceEditing,state=useProjectStore.getState();
    if(!session||get().sourceTransition||state.id!==session.source.id||state.folderPath!==session.source.folderPath)return false;
    const context=sourceEditContext(state),revision=get().navigationRevision+1;
    const check=()=>{if(get().navigationRevision!==revision||sourceEditContext(useProjectStore.getState())!==context)throw Error('源工程或导航已变化，未切换返回。');};
    let repo:ProjectRepository|undefined,acquired=false,committed=false;
    set({navigationRevision:revision,sourceTransition:'returning',sourceTransitionError:null});
    try{
      await readLocation(session.returnTo,check);await saveWorkspaceChecked(check);
      const doc=await readLocation(session.returnTo,check),loaded=await prepareWorkspaceOpen(session.returnTo,check);
      if(session.returnTo.folderPath){repo=new ProjectRepository(createProjectStorage(session.returnTo.id,session.returnTo.folderPath));await repo.acquireLock();acquired=true;check();}
      const finalDoc=await readLocation(session.returnTo,check);if(JSON.stringify(finalDoc)!==JSON.stringify(doc))throw Error('读取期间原工程已变化，请重试返回。');check();
      installWorkspaceDocument(finalDoc,session.returnTo,loaded);
      set({sourceEditing:null,sourceTransition:null,activeProjectId:session.returnTo.id,view:'workspace',uncleanShutdownAt:null});committed=true;try{get().refresh();}catch(error){console.warn('[library-source] 已返回，工程列表更新失败',error);}
      if(session.source.folderPath)void new ProjectRepository(createProjectStorage(session.source.id,session.source.folderPath)).releaseLock().catch(()=>{});
      return true;
    }catch(error){
      if(acquired&&!committed)await repo?.releaseLock().catch(()=>{});
      if(get().navigationRevision===revision)set({sourceTransition:null,sourceTransitionError:error instanceof Error?error.message:'返回工程失败。'});return false;
    }
  },

  dismissRecovery: () => set({ uncleanShutdownAt: null }),

  /**
   * 打开本地工程文件夹 (T-AE-43)。
   * 目录结构不完整时给出明确标记与引导信息，支持无缝衔接新建工程。
   */
  openLocalFolder: async () => {
    const revision=get().navigationRevision+1;set({navigationRevision:revision,sourceEditing:null,sourceTransition:null,sourceTransitionError:null});
    if (!isDesktopRuntime()) {
      return { ok: false, message: '当前为浏览器环境，打开本地文件夹需在桌面应用中使用' };
    }
    const folderPath = await pickProjectFolder();
    if(get().navigationRevision!==revision)return {ok:false,message:'导航已变化，未打开旧选择。'};
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

    if(get().navigationRevision!==revision)return {ok:false,message:'导航已变化，未载入工程。'};
    // 崩溃恢复检测：上次打开留下的 lock 仍在，说明异常退出 (T-AE-44)
    const uncleanAt = await repo.detectUncleanShutdown();
    await repo.acquireLock();

    if(get().navigationRevision!==revision)return {ok:false,message:'导航已变化，未载入工程。'};
    resetHistory();
    const ok = useProjectStore.getState().loadProjectDocument(doc, folderPath);
    if (!ok) {
      resumeHistoryPersistence();
      return { ok: false, message: '工程载入失败' };
    }
    // 恢复该工程上次会话遗留的撤销/重做栈 (BR-HIS-02)
    await loadHistoryForProject(doc.id, folderPath,()=>get().navigationRevision===revision);
    if(get().navigationRevision!==revision)return {ok:false,message:'导航已变化。'};
    const candidate = await loadStagedCandidate(doc.id, folderPath);
    if(get().navigationRevision!==revision)return {ok:false,message:'导航已变化。'};
    if (candidate) useProjectStore.getState().restoreStagedCandidate(candidate, doc.id);

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
    if(migrationBusy)return {ok:false,message:'已有工程迁移正在执行，请等待完成。'};
    if(listProjects().find(project=>project.id===id)?.folderPath)return {ok:false,message:'该工程已关联文件夹，无需迁移。'};
    migrationBusy=true;const revision=get().navigationRevision;
    const current=()=>{if(get().navigationRevision!==revision)throw Error('工作区已切换，迁移未发布。');};
    try{
      current();const state=useProjectStore.getState();
      if(state.id===id&&!state.folderPath){
        if(state.stagedRepairStatus==='repairing'||state.stagedRepairStatus==='verifying'||state.stagedAdoptionStatus==='saving')throw Error('候选仍在处理，请完成后迁移。');
        await saveWorkspaceChecked(current);
      }else await loadStagedCandidate(id); // Wait for pending candidate saves/discards.
      current();const sourceJson=readProject(id);if(!sourceJson)throw Error('找不到该工程的数据。');
      const check=()=>{current();if(readProject(id)!==sourceJson)throw Error('源工程已变化，迁移未发布。');};
      const folderPath=await pickProjectFolder('选择工程的存放位置');check();if(!folderPath)return {ok:false,message:'已取消'};
      const historyRaw=localStorage.getItem(historyKey(id));
      const result=await migrateProjectBundle({sourceJson,source:createProjectStorage(id),target:createProjectStorage(id,folderPath),historyRaw,
        readHistory:()=>localStorage.getItem(historyKey(id)),checkCurrent:check});check();
      if(!result.ok)throw Error(result.error??'未知错误');
      const meta=listProjects().find(project=>project.id===id);if(!meta)throw Error('源工程已从列表移除，迁移未发布。');
      upsertMeta({...meta,folderPath});
      if(listProjects().find(project=>project.id===id)?.folderPath!==folderPath)throw Error('工程列表位置保存失败，原数据保留。');
      if(useProjectStore.getState().id===id&&!useProjectStore.getState().folderPath)useProjectStore.setState({folderPath});
      try{get().refresh();}catch(error){console.warn('[migration] 位置已保存，列表刷新失败',error);}
      return {ok:true,message:`已迁移 ${result.screenCount} 个画框与 ${result.archiveFiles} 个附属文件至 ${folderDisplayName(folderPath)}（原数据保留）${result.warnings.length?'；'+result.warnings.join('；'):''}`};
    }catch(error){return {ok:false,message:`迁移未完成，原数据未改动：${String(error instanceof Error?error.message:error)}；目标可能有部分文件，请换空目录重试。`};}
    finally{migrationBusy=false;}
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
    const revision=get().navigationRevision+1;set({navigationRevision:revision,sourceEditing:null,sourceTransition:null,sourceTransitionError:null});
    resetHistory();
    const id = useProjectStore.getState().initNewProject({ name, deviceProfile, designSystem, initialDecisions, folderPath, referenceDeviceId });
    // 新工程以空栈起步，立即恢复落盘
    resumeHistoryPersistence();
    get().refresh();
    set({ activeProjectId: id, view: 'workspace' });
  },

  openProject: (id) => {
    const revision=get().navigationRevision+1;set({navigationRevision:revision,sourceEditing:null,sourceTransition:null,sourceTransitionError:null});
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
        if(get().navigationRevision!==revision)return;
        const uncleanAt = await repo.detectUncleanShutdown();
        await repo.acquireLock();
        if(get().navigationRevision!==revision)return;
        resetHistory();
        if (useProjectStore.getState().loadProjectDocument(doc, folderPath)) {
          await loadHistoryForProject(id, folderPath,()=>get().navigationRevision===revision);
          if(get().navigationRevision!==revision)return;
          const candidate = await loadStagedCandidate(id, folderPath);
          if(get().navigationRevision!==revision)return;
          if (get().navigationRevision===revision&&candidate) useProjectStore.getState().restoreStagedCandidate(candidate, id);
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
      void loadHistoryForProject(id,undefined,()=>get().navigationRevision===revision);
      void loadStagedCandidate(id).then(candidate => {
        if (get().navigationRevision===revision&&candidate) useProjectStore.getState().restoreStagedCandidate(candidate, id);
      }).catch(error => console.warn('[candidate] 恢复失败', error));
      set({ activeProjectId: id, view: 'workspace' });
    } else {
      resumeHistoryPersistence();
    }
    return ok;
  },

  backToManager: () => {
    const revision=get().navigationRevision+1;set({navigationRevision:revision,sourceEditing:null,sourceTransition:null,sourceTransitionError:null});
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
