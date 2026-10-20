import { type ProjectDocumentEntry, validateProjectDocument, MAX_PROJECT_DOCUMENTS } from '../types/projectDocument';
import { create } from 'zustand';
import { DesignSystem } from '../types/designSystem';
import { QuickPromptItem } from '../types/quickPrompt';
import { ScreenAuditReport } from '../utils/tokenLint';
import {
  Asset,
  AssetId,
  ComponentDefinition,
  ComponentId,
  Decision,
  DecisionId,
  ProjectSettings,
  Screen,
  ScreenId,
  StyleOverride
} from '../types/project';
import { defaultTheme, neutralModernTheme, techBlueTheme } from '../utils/themePresets';
import { NidEngine } from '../utils/nidEngine';
import { buildStyleSpecimenHtml } from '../utils/styleSpecimen';
import { createProjectStorage } from '../services/storage/projectStorage';
import { ConversationStore } from '../services/storage/conversationStore';
import { AttachmentStore } from '../services/storage/attachmentStore';
import { ProjectRepository } from '../services/storage/projectRepository';
import {
  planRestyle,
  type RestyleOutcome,
  type RestylePlan,
  type RestyleTarget
} from '../services/ai/restyleService';
import { inspectText, TextUneditableReason } from '../utils/textNode';
import { compileTokensToCss } from '../utils/cssCompiler';
import {
  ProjectMeta,
  deleteProjectData,
  projectKey,
  readProject,
  upsertMeta,
  writeProject
} from '../utils/projectRegistry';
import { useHistoryStore, setApplyPatchesHandler } from './useHistoryStore';
import { deleteHistoryArchive, scheduleHistorySave } from '../services/storage/historyPersistence';
import { Patch } from '../types/history';
import {
  calculateNewScreenPosition,
  arrangeScreensGrid,
  ScreenShiftInstruction,
  SnapGuides,
  resolveVerticalGrowthPushRight,
  CANVAS_LAYOUT_CONSTANTS
} from '../utils/canvasLayout';
import { deleteElementByNid } from '../utils/domPatcher';
import { checkGenerationQuality } from '../services/ai/generationQuality';
import type { RenderedQualityReport } from '../utils/renderedQuality';

/** 新建工程时的空白起始画框 (PRD §3.0.1) */
const blankScreenHtml = (name: string) => `<div class="p-8" style="min-height: 800px; background: var(--color-bg);">
  <div class="card p-6 r-lg shadow-md col gap-4" style="background: var(--color-surface);">
    <h2 class="text-2xl font-bold">${name}</h2>
    <p class="text-sm text-secondary">空白画框。在左侧对话面板描述你的需求，或直接用检查器排版。</p>
    <div class="row gap-3 mt-2">
      <button class="btn btn-primary r-md">主要操作</button>
      <button class="btn btn-ghost r-md">次要操作</button>
    </div>
  </div>
</div>`;

/** 换肤时被 L4 覆盖挡住的节点 (T-AE-22) */
export interface ThemeConflict {
  key: string;
  nid: string;
  screenId: string;
  screenName: string;
  declarations: string[];
  escaped: boolean;
}

/**
 * 新画框的落位：排在现有画框最右侧之外一个画框宽度 + 间距 (ISSUE-017)。
 *
 * 此前 `addBlankScreen` 按 `screenOrder.length * 40` 递增、`duplicateScreen`
 * 固定偏移 80px，而画框宽 390 (mobile) ~ 1440 (pc) px——新画框几乎完整压在
 * 旧画框之上，被压住的画框既看不见也点不到。AI 生成画框走的正是这套右侧
 * 平铺规则 (ISSUE-013)，此处与之对齐。
 */
const nextFramePosition = (
  state: {
    screenOrder: ScreenId[];
    screens: Record<ScreenId, Screen>;
    settings: ProjectSettings;
    activeScreenId?: ScreenId | null;
  },
  options?: { referencedScreenId?: string; anchorScreenId?: string }
): { x: number; y: number } => {
  const result = calculateNewScreenPosition(state.screens, state.screenOrder, {
    frameWidth: state.settings.frameWidth,
    viewportGuideHeight: state.settings.viewportGuideHeight,
    referencedScreenId: options?.referencedScreenId,
    anchorScreenId: options?.anchorScreenId ?? state.activeScreenId
  });
  return result.position;
};

export interface PanToScreenOptions {
  scale?: number;
  offsetY?: number;
  offsetX?: number;
  center?: boolean;
  viewportWidth?: number;
}

export interface ComputedBoxModel {
  width: number;
  height: number;
  top: number;
  left: number;
  padding: { top: number; right: number; bottom: number; left: number };
  margin: { top: number; right: number; bottom: number; left: number };
}

export interface ComputedLayoutInfo {
  display: string;
  flexDirection?: string;
  alignItems?: string;
  justifyContent?: string;
  flexWrap?: string;
  gap?: string;
  rowGap?: string;
  columnGap?: string;

  // 几何属性 (doc/feature/inspector-geometry-tabs)：
  // 采集浏览器实际生效值，未设置 L4 覆盖时作为输入框占位提示 (BR-INS-06)
  position?: string;
  top?: string;
  right?: string;
  bottom?: string;
  left?: string;
  zIndex?: string;
  width?: string;
  height?: string;
  borderRadius?: string;
  borderTopLeftRadius?: string;
  borderTopRightRadius?: string;
  borderBottomRightRadius?: string;
  borderBottomLeftRadius?: string;
}

export interface SelectedNodeInfo {
  screenId: string;
  nid: string;
  tagName: string;
  /** 直接子文本节点的内容；不可编辑时仅供展示 (doc/issues.md ISSUE-002/003) */
  textContent: string;
  /** 文本是否允许在检查器中修改 */
  textEditable?: boolean;
  textReason?: TextUneditableReason;
  classNames: string[];
  parentChain?: { nid: string; tagName: string; className?: string }[];
  componentId?: string;
  componentInstanceId?: string;
  computedBox: ComputedBoxModel;
  computedLayout?: ComputedLayoutInfo;
}

/** Add to Chat 功能：被引用进对话框的节点引用 (spec: doc/feature/element-add-to-chat/spec.md) */
export interface NodeReference {
  screenId: string;
  screenName: string;
  nid: string;
  tagName: string;
  /** 被引用元素的 outerHTML 截断至 300 字符，供 AI 理解上下文 */
  htmlSnippet: string;
}

interface ProjectState {
  id: string;
  name: string;
  /** 工程文件夹绝对路径 (T-AE-40)。未设置时存储层回退 localStorage */
  folderPath?: string;
  createdAt: number;
  settings: ProjectSettings;
  designSystem: DesignSystem;

  // D16 Flat Record Store
  screens: Record<ScreenId, Screen>;
  screenOrder: ScreenId[];
  overrides: Record<string, StyleOverride>; // `${screenId}:${nid}` -> StyleOverride
  decisions: Record<DecisionId, Decision>;
  components: Record<ComponentId, ComponentDefinition>;
  assets: Record<AssetId, Asset>;
  projectDocuments: Record<string, ProjectDocumentEntry>;
  upsertProjectDocument: (doc: ProjectDocumentEntry) => void;
  removeProjectDocument: (id: string) => void;

  /**
   * 侧边栏折叠面板的展开状态 (PRD §3.0.3)。key 按视图命名空间，如 `assets.images`。
   * 随工程持久化——不同工程的侧栏使用习惯不同，按工程记忆比全局记忆更贴合。
   * 缺失的 key 回落到组件的 defaultOpen，因此新增面板无需数据迁移。
   */
  panelStates: Record<string, boolean>;

  // Runtime Viewport & Selection State
  activeScreenId: ScreenId | null;
  selectedNid: string | null;
  hoveredNid: string | null;
  selectedNode: SelectedNodeInfo | null;
  viewportTransform: { x: number; y: number; scale: number };

  /** 拖拽对齐网格参考线与吸附状态 (BR-ALIGN-03) */
  activeSnapGuides: SnapGuides | null;
  setSnapGuides: (guides: SnapGuides | null) => void;
  clearSnapGuides: () => void;

  // Temporary Artboard for Side-by-Side adoption (D17 / §3.2.9)
  stagedScreen: {
    targetScreenId: ScreenId;
    newHtml: string;
    screenName: string;
    modificationRequest?: string;
  } | null;
  /** 仅当前候选的渲染证据；不进入历史或存盘。 */
  stagedRenderQuality: { key: string; report: RenderedQualityReport } | null;
  stagedRenderRevision: number;
  getStagedRenderContextKey: () => string;
  setStagedRenderQuality: (key: string, report: RenderedQualityReport) => void;

  /** Add to Chat 功能：待注入对话框的节点引用（单次，发送后清除）*/
  pendingNodeRef: NodeReference | null;

  /** 一键评测报告推送（供属性面板推入对话，消费后清除） */
  pendingAuditReport: ScreenAuditReport | null;
  postAuditReport: (report: ScreenAuditReport) => void;
  clearPendingAuditReport: () => void;

  /** 自定义工程封面图片 DataURL */
  coverImage: string | null;
  setCoverImage: (cover: string | null) => void;

  /** 当前工程专属快捷输入短语列表 (scope: project) */
  quickPrompts: QuickPromptItem[];
  addProjectQuickPrompt: (prompt: { title: string; content: string }) => QuickPromptItem;
  updateProjectQuickPrompt: (id: string, updates: { title?: string; content?: string }) => void;
  deleteProjectQuickPrompt: (id: string) => void;

  // Actions
  setName: (name: string) => void;
  setDeviceProfile: (profile: 'pc' | 'mobile') => void;
  setColorMode: (mode: 'light' | 'dark') => void;
  toggleColorMode: () => void;
  setShowViewportGuide: (show: boolean) => void;
  setPanelOpen: (key: string, open: boolean) => void;
  setDesignSystem: (ds: DesignSystem) => void;
  /** 换肤前扫描会被 L4 覆盖挡住的节点 (T-AE-22) */
  scanThemeConflicts: () => ThemeConflict[];
  /** 清除指定 L4 覆盖，使其跟随新主题；escaped 覆盖需显式允许 (T-AE-22) */
  clearOverridesForTheme: (keys: string[], includeEscaped?: boolean) => number;

  // Screen CRUD
  addScreen: (
    screen: (Omit<Screen, 'id' | 'position'> & { position?: { x: number; y: number } }) | Screen,
    customId?: string,
    options?: { referencedScreenId?: string; anchorScreenId?: string; autoPan?: boolean }
  ) => ScreenId;
  /** 画框是否为风格样张页（doc/aesthetic/spec.md §6.6.7） */
  isSpecimen: (id: ScreenId) => boolean;
  /** 某画框中被 L4 手动覆盖的 nid —— Polish/Restyle 不应改动它们 (T-AE-26) */
  getProtectedNids: (screenId: ScreenId) => string[];
  /** 组装 Restyle 的执行队列，组件优先 (T-AE-28) */
  buildRestylePlan: (screenIds?: ScreenId[]) => RestylePlan;
  /** 落地一次通过结构校验的改写 (T-AE-26/27) */
  applyRestyleOutcome: (outcome: RestyleOutcome) => boolean;

  /** 当前工程的会话存档 (T-AE-31)。会话不进 project.json，独立分片存储 */
  getConversationStore: () => ConversationStore;
  getAttachmentStore: () => AttachmentStore;
  /** 删除样张后重新生成一份（§6.6.7 生命周期） */
  regenerateSpecimen: () => ScreenId;
  /** 一键创建空白业务画框 (纯净画布引导 / 用户主动添加) */
  addBlankScreen: (name?: string) => ScreenId;
  updateScreen: (id: ScreenId, updates: Partial<Screen>, historyLabel?: string) => void;
  updateScreenPositions: (
    positions: Record<ScreenId, { x: number; y: number }>,
    historyLabel?: string,
    originalPositions?: Record<ScreenId, { x: number; y: number }>
  ) => void;
  updateScreenHtml: (id: ScreenId, htmlContent: string, historyLabel?: string) => void;
  /** 级联删除指定节点及其全部子孙节点，同步清除对应样式覆盖 (ISSUE-021) */
  deleteNode: (screenId: ScreenId, nid: string) => boolean;
  removeScreen: (id: ScreenId) => void;
  renameScreen: (id: ScreenId, name: string) => void;
  duplicateScreen: (id: ScreenId) => ScreenId | null;
  arrangeScreens: () => void;
  reorderScreens: (newOrder: ScreenId[]) => void;
  setActiveScreen: (id: ScreenId | null) => void;
  /** 平移画布视口以聚焦目标画框 (BR-NAV-01 / spec: doc/feature/new-screen-auto-focus/spec.md) */
  panToScreen: (screenId: ScreenId, options?: PanToScreenOptions) => void;
  selectNodeByNid: (screenId: ScreenId, nid: string) => void;

  // Overrides (L4)
  setOverride: (screenId: ScreenId, nid: string, declarations: Record<string, string>, escaped?: boolean, historyLabel?: string) => void;
  clearNodeOverrides: (screenId: ScreenId, nid: string) => void;
  clearScreenOverrides: (screenId: ScreenId) => void;

  // Decisions (D20)
  /**
   * @param source 省略时记为用户手动创建。AI 从对话中提取、经用户确认的约定
   *   必须传 `{ kind: 'auto_extracted', conversationId }`，否则无法区分来源、
   *   也无法跳回产生它的那轮对话 (ISSUE-010)。
   */
  addDecision: (
    text: string,
    scope?: 'global' | 'screen',
    screenId?: string,
    source?: { kind: 'auto_extracted' | 'manual'; conversationId?: string }
  ) => void;
  removeDecision: (id: DecisionId) => void;
  toggleDecision: (id: DecisionId) => void;

  // Components (D6 / PRD §3.7)
  createComponent: (name: string, templateHtml: string, description?: string) => ComponentId;
  extractComponentFromNode: (screenId: ScreenId, nid: string, name: string) => ComponentId | null;
  updateComponent: (id: ComponentId, updates: Partial<ComponentDefinition>) => void;
  deleteComponent: (id: ComponentId) => void;
  insertComponent: (screenId: ScreenId, componentId: ComponentId) => void;
  detachComponentInstance: (screenId: ScreenId, nid: string) => void;
  syncComponentInstances: (componentId: ComponentId, force?: boolean) => { syncedCount: number; skippedConflictCount: number; details: string[] };

  // Assets (PRD §3.4.1)
  addAsset: (asset: Asset) => void;
  removeAsset: (id: AssetId) => void;
  replaceAssetGlobally: (oldAssetId: string, newAssetUrl: string) => number;
  cleanupUnusedAssets: () => number;

  // Selection & Viewport
  selectNode: (info: SelectedNodeInfo | null) => void;
  setHoveredNid: (nid: string | null) => void;
  setViewportTransform: (transform: { x: number; y: number; scale: number }) => void;

  /** Add to Chat 功能：设置/清除待引用节点 */
  setPendingNodeRef: (ref: NodeReference) => void;
  clearPendingNodeRef: () => void;

  // Side-by-Side Staging (D17)
  stageScreenChange: (targetScreenId: ScreenId, newHtml: string, screenName: string, modificationRequest?: string) => void;
  adoptStagedChange: () => void;
  discardStagedChange: () => void;
  keepBothScreens: () => void;

  // Persistence & Recovery (T-02, T-03, T-04)
  saveProject: () => void;
  loadProject: (jsonString: string) => void;
  initNewProject: (opts: { name: string; deviceProfile: 'pc' | 'mobile'; designSystem: DesignSystem; initialDecisions?: string[]; folderPath?: string; createSpecimen?: boolean }) => string;
  loadProjectById: (id: string) => boolean;
  /** 从文件夹读回的工程文档载入 (T-AE-43) */
  loadProjectDocument: (doc: unknown, folderPath: string) => boolean;
  deleteProject: (id: string) => void;
  hasRecoverySession: () => boolean;
  recoverSession: () => void;
  applyPatches: (patches: Patch[]) => void;
}


// Initial Demo Screens
const initialScreen1: Screen = {
  id: 'screen-1',
  name: '登录注册页 (Login)',
  position: { x: 100, y: 120 },
  htmlContent: NidEngine.injectNids(`<div class="row items-center justify-center p-8" style="min-height: 800px; background: var(--color-bg);">
  <div class="card p-8 r-xl shadow-lg col gap-4" style="width: 440px; background: var(--color-surface);">
    <div class="col gap-1 text-center">
      <div class="logo r-md bg-primary row items-center justify-center mx-auto" style="width: 48px; height: 48px; margin: 0 auto 12px auto;">
        <svg class="icon" width="24" height="24" viewBox="0 0 24 24" stroke="currentColor"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      </div>
      <h2 class="text-2xl font-bold">欢迎使用 StudioMetrics</h2>
      <p class="text-sm text-secondary">请输入您的企业账号以开启 AI 原生设计工作台</p>
    </div>
    <div class="col gap-3 mt-4">
      <div class="col gap-1">
        <label class="text-sm font-medium">工作邮箱</label>
        <input class="input" type="email" placeholder="name@company.com" value="alex.designer@company.com" />
      </div>
      <div class="col gap-1">
        <div class="row justify-between items-center">
          <label class="text-sm font-medium">访问密钥</label>
          <a href="#" class="text-xs text-primary" style="text-decoration: none;">忘记密钥？</a>
        </div>
        <input class="input" type="password" value="••••••••••••" />
      </div>
      <button class="btn btn-primary r-md mt-2 w-full text-center">
        <span>登入系统</span>
      </button>
    </div>
  </div>
</div>`)
};

const initialScreen2: Screen = {
  id: 'screen-2',
  name: '核心仪表盘 (Dashboard)',
  position: { x: 1660, y: 120 },
  htmlContent: NidEngine.injectNids(`<div class="col gap-4 p-6" style="min-height: 800px; background: var(--color-bg);">
  <div class="row items-center justify-between pb-4 border-b">
    <div class="col">
      <h1 class="text-2xl font-bold">商业效能监控大屏</h1>
      <p class="text-sm text-muted">实时汇聚多端 API 吞吐指标与集群运行水线</p>
    </div>
    <div class="row items-center gap-3">
      <button class="btn btn-ghost r-md">导出图表</button>
      <button class="btn btn-primary r-md">新建分析卡片</button>
    </div>
  </div>
  <div class="grid-3 gap-4 mt-2">
    <div class="card p-5 r-lg shadow-sm col gap-2">
      <span class="text-sm text-muted">今日总调用</span>
      <h2 class="text-3xl font-bold">2,481,200</h2>
      <span class="text-xs text-success">↑ 18.5% 较昨日提升</span>
    </div>
    <div class="card p-5 r-lg shadow-sm col gap-2">
      <span class="text-sm text-muted">平均响应延时</span>
      <h2 class="text-3xl font-bold">42 ms</h2>
      <span class="text-xs text-success">正常水位区间</span>
    </div>
    <div class="card p-5 r-lg shadow-sm col gap-2">
      <span class="text-sm text-muted">系统健康度</span>
      <h2 class="text-3xl font-bold text-success">99.99%</h2>
      <span class="text-xs text-muted">无未决关键告警</span>
    </div>
  </div>
</div>`)
};

/** 所有采纳入口共用，聊天回调也不能绕过源检查和已有的当前渲染证据。 */
function canAdoptStagedScreen(state: ProjectState): boolean {
  const staged = state.stagedScreen;
  if (!staged || !state.screens[staged.targetScreenId]) return false;
  const source = checkGenerationQuality(staged.newHtml, {
    deviceProfile: state.settings.deviceProfile, designSystem: state.designSystem,
    baselineHtml: state.screens[staged.targetScreenId].htmlContent,
    protectedNids: state.getProtectedNids(staged.targetScreenId),
    modificationRequest: staged.modificationRequest
  });
  if (source.findings.some(f => f.severity === 'error')) return false;
  const rendered = state.stagedRenderQuality;
  return !rendered || (rendered.key === state.getStagedRenderContextKey()
    && rendered.report.status !== 'pending'
    && !rendered.report.findings.some(f => f.severity === 'error'));
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  id: 'proj_default',
  name: 'MyDesignStudio',
  createdAt: Date.now(),
  settings: {
    deviceProfile: 'pc',
    frameWidth: 1440,
    viewportGuideHeight: 900,
    showViewportGuide: true,
    colorMode: 'light',
    lodBudget: 12
  },
  designSystem: neutralModernTheme,

  screens: {
    'screen-1': initialScreen1,
    'screen-2': initialScreen2
  },
  screenOrder: ['screen-1', 'screen-2'],
  overrides: {},
  decisions: {
    'dec-1': {
      id: 'dec-1',
      text: '界面按钮统一使用规范圆角与纯正主色',
      scope: 'global',
      source: { kind: 'manual', createdAt: Date.now() },
      active: true
    }
  },
  components: {},
  assets: {},
  projectDocuments: {},
  panelStates: {},

  activeScreenId: 'screen-1',
  selectedNid: null,
  hoveredNid: null,
  selectedNode: null,
  viewportTransform: { x: 80, y: 80, scale: 0.7 },
  activeSnapGuides: null,
  stagedScreen: null,
  stagedRenderQuality: null,
  stagedRenderRevision: 0,
  pendingNodeRef: null,
  pendingAuditReport: null,
  coverImage: null,
  quickPrompts: [],

  setSnapGuides: (guides) => set({ activeSnapGuides: guides }),
  clearSnapGuides: () => set({ activeSnapGuides: null }),

  postAuditReport: (report) => set({ pendingAuditReport: report }),
  clearPendingAuditReport: () => set({ pendingAuditReport: null }),

  setCoverImage: (cover) => {
    set({ coverImage: cover });
    get().saveProject();
  },

  addProjectQuickPrompt: ({ title, content }) => {
    const newPrompt: QuickPromptItem = {
      id: `proj-qp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: title.trim(),
      content: content.trim(),
      scope: 'project',
      createdAt: Date.now()
    };
    set((state) => ({
      quickPrompts: [...state.quickPrompts, newPrompt]
    }));
    get().saveProject();
    return newPrompt;
  },

  updateProjectQuickPrompt: (id, updates) => {
    set((state) => ({
      quickPrompts: state.quickPrompts.map((p) => {
        if (p.id !== id) return p;
        return {
          ...p,
          ...(updates.title !== undefined ? { title: updates.title.trim() } : {}),
          ...(updates.content !== undefined ? { content: updates.content.trim() } : {})
        };
      })
    }));
    get().saveProject();
  },

  deleteProjectQuickPrompt: (id) => {
    set((state) => ({
      quickPrompts: state.quickPrompts.filter((p) => p.id !== id)
    }));
    get().saveProject();
  },

  setName: (name) => {
    set({ name });
    get().saveProject();
  },

  setDeviceProfile: (profile) => {
    const frameWidth = profile === 'pc' ? 1440 : 390;
    const viewportGuideHeight = profile === 'pc' ? 900 : 844;
    set((state) => ({
      settings: { ...state.settings, deviceProfile: profile, frameWidth, viewportGuideHeight }
    }));
    get().saveProject();
  },

  setPanelOpen: (key, open) => {
    set((state) => ({ panelStates: { ...state.panelStates, [key]: open } }));
    get().saveProject();
  },

  setColorMode: (mode) => {
    set((state) => ({
      settings: { ...state.settings, colorMode: mode }
    }));
    get().saveProject();
  },

  toggleColorMode: () => {
    const cur = get().settings.colorMode;
    get().setColorMode(cur === 'light' ? 'dark' : 'light');
  },


  setShowViewportGuide: (show) => {
    set((state) => ({
      settings: { ...state.settings, showViewportGuide: show }
    }));
  },

  /**
   * 扫描会挡住主题变更的 L4 手动覆盖 (T-AE-22)。
   *
   * ScreenFrame 把 overrides 编译为 `[data-nid]{ prop: val !important }`，
   * 优先级高于一切 Token 驱动的类——用户手调过的节点换主题后原地不动，
   * 成为风格孤岛。换肤前必须把这些节点摆到用户面前。
   */
  scanThemeConflicts: () => {
    const { overrides, screens } = get();
    return Object.entries(overrides).map(([key, ov]) => {
      const screenId = key.slice(0, key.indexOf(':'));
      return {
        key,
        nid: ov.nid,
        screenId,
        screenName: screens[screenId]?.name ?? '已删除画框',
        declarations: Object.keys(ov.declarations),
        // escaped 是用户显式声明的逃逸，默认保留、不纳入清除范围
        escaped: Boolean(ov.escaped)
      };
    });
  },

  clearOverridesForTheme: (keys, includeEscaped = false) => {
    const { overrides } = get();
    const target = keys.filter((k) => overrides[k] && (includeEscaped || !overrides[k].escaped));
    if (target.length === 0) return 0;

    const prev = target.map((k) => ({ key: k, value: overrides[k] }));
    const next = { ...overrides };
    for (const k of target) delete next[k];

    // 整批作为单条历史记录入栈，可一键撤销
    useHistoryStore.getState().commit(
      `清除 ${target.length} 条手动样式覆盖以跟随新主题`,
      target.map((k) => ({ op: 'remove' as const, path: ['overrides', k] })),
      prev.map((p) => ({ op: 'add' as const, path: ['overrides', p.key], value: p.value }))
    );
    set({ overrides: next });
    get().saveProject();
    return target.length;
  },

  setDesignSystem: (ds) => {
    const prevDs = get().designSystem;
    useHistoryStore.getState().commit(
      `切换主题为 ${ds.name}`,
      [{ op: 'replace', path: ['designSystem'], value: ds }],
      [{ op: 'replace', path: ['designSystem'], value: prevDs }]
    );
    set({ designSystem: ds });
    get().saveProject();
  },

  isSpecimen: (id) => get().screens[id]?.metadata?.kind === 'specimen',

  getProtectedNids: (screenId) => {
    const { overrides } = get();
    const prefix = `${screenId}:`;
    return Object.entries(overrides)
      .filter(([key]) => key.startsWith(prefix))
      .map(([, ov]) => ov.nid);
  },

  /**
   * 组装 Restyle 队列 (T-AE-28)。
   *
   * 组件排在页面之前：一个被 N 个页面复用的组件，重塑成本是 1 次调用而非 N 次，
   * 且只改组件定义再走既有的实例同步链路，避免同一组件在不同页面被改成不同样子。
   */
  buildRestylePlan: (screenIds) => {
    const { screens, screenOrder, components } = get();
    const ids = screenIds ?? screenOrder;

    const countReuse = (componentId: string) =>
      ids.reduce(
        (n, sid) => n + (screens[sid]?.htmlContent.split(`data-component-id="${componentId}"`).length - 1 || 0),
        0
      );

    const componentTargets: RestyleTarget[] = Object.values(components).map((c) => ({
      kind: 'component' as const,
      id: c.id,
      name: c.name,
      html: c.templateHtml,
      reuseCount: countReuse(c.id)
    }));

    const screenTargets: RestyleTarget[] = ids
      .map((sid) => screens[sid])
      .filter((sc): sc is NonNullable<typeof sc> => Boolean(sc))
      // 样张页是设计系统的投影，改它应该去改 Token (§6.6.7)
      .filter((sc) => sc.metadata?.kind !== 'specimen')
      .map((sc) => ({
        kind: 'screen' as const,
        id: sc.id,
        name: sc.name,
        html: sc.htmlContent,
        protectedNids: get().getProtectedNids(sc.id)
      }));

    return planRestyle(componentTargets, screenTargets);
  },

  applyRestyleOutcome: (outcome) => {
    if (outcome.status !== 'applied' || !outcome.html) return false;
    const { target, html } = outcome;

    if (target.kind === 'component') {
      get().updateComponent(target.id, { templateHtml: html });
      // 走既有实例同步链路下发；含 L4 覆盖的实例由该链路自动跳过保护
      get().syncComponentInstances(target.id);
      return true;
    }

    get().updateScreen(target.id, { htmlContent: html }, `风格重塑：${target.name}`);
    return true;
  },

  getConversationStore: () => {
    const { id, folderPath } = get();
    return new ConversationStore(createProjectStorage(id, folderPath));
  },

  getAttachmentStore: () => {
    const { id, folderPath } = get();
    return new AttachmentStore(createProjectStorage(id, folderPath));
  },

  /**
   * 重新生成风格样张页 (T-AE-14)。
   * 样张是设计系统的投影而非业务页，用户删除后应能一键恢复。
   */
  regenerateSpecimen: () => {
    const state = get();
    const existing = state.screenOrder.find((sid) => state.screens[sid]?.metadata?.kind === 'specimen');
    const html = NidEngine.injectNids(buildStyleSpecimenHtml(state.settings.deviceProfile));
    if (existing) {
      get().updateScreen(existing, { htmlContent: html }, '重新生成风格样张');
      return existing;
    }
    return get().addScreen({
      name: '🎨 风格样张',
      position: { x: 100, y: 120 },
      htmlContent: html,
      metadata: { kind: 'specimen' }
    });
  },

  addBlankScreen: (name?: string) => {
    const defaultName = name || `页面 ${get().screenOrder.length + 1}`;
    const html = NidEngine.injectNids(blankScreenHtml(defaultName));
    const id = get().addScreen({
      name: defaultName,
      htmlContent: html
    });
    get().panToScreen(id);
    return id;
  },

  addScreen: (screenData, customId, options) => {
    const id = customId || `screen-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const rawHtml = screenData.htmlContent || '<div class="p-8"><h1>新画板</h1></div>';
    const htmlContent = rawHtml.includes('data-nid=') ? rawHtml : NidEngine.injectNids(rawHtml);

    let position = screenData.position;
    let shiftedScreens: ScreenShiftInstruction[] = [];

    // 若未显式传入坐标，或指定了引用画框，由智能布局引擎计算
    if (!position || options?.referencedScreenId) {
      const layout = calculateNewScreenPosition(get().screens, get().screenOrder, {
        frameWidth: get().settings.frameWidth,
        viewportGuideHeight: get().settings.viewportGuideHeight,
        referencedScreenId: options?.referencedScreenId,
        anchorScreenId: options?.anchorScreenId ?? get().activeScreenId
      });
      position = layout.position;
      shiftedScreens = layout.shiftedScreens;
    }

    const screen: Screen = { ...screenData, id, position, htmlContent };
    const prevScreens = get().screens;
    const prevOrder = [...get().screenOrder];

    // 历史变更记录：新画框添加 + 序位 + 避让画框的位移 (BR-HIS-09)
    const forwardOps: Array<{ op: 'add' | 'replace'; path: string[]; value: any }> = [
      { op: 'add', path: ['screens', id], value: screen },
      { op: 'replace', path: ['screenOrder'], value: [...prevOrder, id] }
    ];
    const backwardOps: Array<{ op: 'remove' | 'replace'; path: string[]; value?: any }> = [
      { op: 'remove', path: ['screens', id] },
      { op: 'replace', path: ['screenOrder'], value: prevOrder }
    ];

    for (const shift of shiftedScreens) {
      if (prevScreens[shift.id]) {
        forwardOps.push({
          op: 'replace',
          path: ['screens', shift.id, 'position'],
          value: { ...prevScreens[shift.id].position, x: shift.newX }
        });
        backwardOps.push({
          op: 'replace',
          path: ['screens', shift.id, 'position'],
          value: prevScreens[shift.id].position
        });
      }
    }

    useHistoryStore.getState().commit(
      `新建画框: ${screen.name}`,
      forwardOps as any,
      backwardOps as any
    );

    set((state) => {
      const nextScreens = { ...state.screens, [id]: screen };
      for (const shift of shiftedScreens) {
        if (nextScreens[shift.id]) {
          nextScreens[shift.id] = {
            ...nextScreens[shift.id],
            position: { ...nextScreens[shift.id].position, x: shift.newX }
          };
        }
      }
      return {
        screens: nextScreens,
        screenOrder: [...state.screenOrder, id],
        activeScreenId: id
      };
    });
    get().saveProject();

    if (options?.autoPan) {
      get().panToScreen(id);
    }

    return id;
  },

  updateScreen: (id, updates, historyLabel) => {
    const prevScreen = get().screens[id];
    if (!prevScreen) return;
    const updated = { ...prevScreen, ...updates };

    if (historyLabel) {
      useHistoryStore.getState().commit(
        historyLabel,
        [{ op: 'replace', path: ['screens', id], value: updated }],
        [{ op: 'replace', path: ['screens', id], value: prevScreen }]
      );
    }

    set((state) => ({
      screens: { ...state.screens, [id]: updated }
    }));
    get().saveProject();

    // 如果画框高度发生增长，且具有有效坐标，检测是否侵入下方排画框并自动执行右移一列避让 (BR-ALIGN-06)
    if (
      updates.measuredHeight &&
      updates.measuredHeight > (prevScreen.measuredHeight || 0) &&
      updated.position
    ) {
      const growthResult = resolveVerticalGrowthPushRight({
        changedScreenId: id,
        newHeight: updates.measuredHeight,
        screens: get().screens,
        frameWidth: get().settings.frameWidth,
        gapX: CANVAS_LAYOUT_CONSTANTS.DEFAULT_GAP_X,
        gapY: CANVAS_LAYOUT_CONSTANTS.DEFAULT_GAP_Y
      });

      if (growthResult.shiftedScreens.length > 0) {
        const positions: Record<string, { x: number; y: number }> = {};
        for (const shift of growthResult.shiftedScreens) {
          const s = get().screens[shift.id];
          if (s && s.position) {
            positions[shift.id] = { x: shift.newX, y: s.position.y };
          }
        }
        get().updateScreenPositions(positions, '页面加长避让下排');
      }
    }
  },

  updateScreenPositions: (positions, historyLabel, originalPositions) => {
    const prevScreens = get().screens;
    const forwardOps: Array<{ op: 'replace'; path: string[]; value: any }> = [];
    const backwardOps: Array<{ op: 'replace'; path: string[]; value: any }> = [];
    const nextScreens = { ...prevScreens };

    for (const [id, pos] of Object.entries(positions)) {
      const prev = prevScreens[id];
      if (!prev || !prev.position) continue;

      const origPos = originalPositions?.[id] || prev.position;

      forwardOps.push({
        op: 'replace',
        path: ['screens', id, 'position'],
        value: pos
      });
      backwardOps.push({
        op: 'replace',
        path: ['screens', id, 'position'],
        value: origPos
      });

      nextScreens[id] = {
        ...prev,
        position: pos
      };
    }

    if (historyLabel && forwardOps.length > 0) {
      useHistoryStore.getState().commit(
        historyLabel,
        forwardOps as any,
        backwardOps as any
      );
    }

    set({ screens: nextScreens });
    get().saveProject();
  },

  updateScreenHtml: (id, htmlContent, historyLabel) => {
    const injected = htmlContent.includes('data-nid=') ? htmlContent : NidEngine.injectNids(htmlContent);
    get().updateScreen(id, { htmlContent: injected }, historyLabel || '修改页面内容');
  },

  deleteNode: (screenId, nid) => {
    const screen = get().screens[screenId];
    if (!screen || !nid) return false;

    const res = deleteElementByNid(screen.htmlContent, nid);
    if (!res.success) {
      console.warn(`[deleteNode] 失败: ${res.error}`);
      return false;
    }

    // 1. 清理被删除节点及其全部子孙节点的样式覆盖 (overrides)
    const prevOverrides = get().overrides;
    const nextOverrides = { ...prevOverrides };
    let hasOverrideChanged = false;
    for (const delNid of res.deletedNids) {
      const key = `${screenId}:${delNid}`;
      if (nextOverrides[key]) {
        delete nextOverrides[key];
        hasOverrideChanged = true;
      }
    }

    if (hasOverrideChanged) {
      set({ overrides: nextOverrides });
    }

    // 2. 若当前选中或悬停的节点在被删除的子树中，自动重置选区
    const curSelectedNid = get().selectedNid;
    const curHoveredNid = get().hoveredNid;
    const resetSelection: Partial<ProjectState> = {};
    if (curSelectedNid && res.deletedNids.includes(curSelectedNid)) {
      resetSelection.selectedNid = null;
      resetSelection.selectedNode = null;
    }
    if (curHoveredNid && res.deletedNids.includes(curHoveredNid)) {
      resetSelection.hoveredNid = null;
    }
    if (Object.keys(resetSelection).length > 0) {
      set(resetSelection as any);
    }

    // 3. 更新 HTML 并提交历史事务 (内部由 updateScreen 提交 Commit)
    get().updateScreenHtml(screenId, res.html, `删除元素及子树: #${nid}`);
    return true;
  },

  removeScreen: (id) => {
    const prevScreen = get().screens[id];
    if (!prevScreen) return;

    const prevOrder = [...get().screenOrder];
    useHistoryStore.getState().commit(
      `删除画框: ${prevScreen.name}`,
      [
        { op: 'remove', path: ['screens', id] },
        { op: 'replace', path: ['screenOrder'], value: prevOrder.filter((sid) => sid !== id) }
      ],
      [
        { op: 'add', path: ['screens', id], value: prevScreen },
        { op: 'replace', path: ['screenOrder'], value: prevOrder }
      ]
    );

    set((state) => {
      const nextScreens = { ...state.screens };
      delete nextScreens[id];
      const nextOrder = state.screenOrder.filter((sId) => sId !== id);
      return {
        screens: nextScreens,
        screenOrder: nextOrder,
        activeScreenId: state.activeScreenId === id ? (nextOrder[0] || null) : state.activeScreenId
      };
    });
    get().saveProject();
  },

  renameScreen: (id, name) => {
    get().updateScreen(id, { name }, `重命名画框: ${name}`);
  },

  duplicateScreen: (id) => {
    const s = get().screens[id];
    if (!s) return null;
    const newId = `screen-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const newScreen: Screen = {
      ...s,
      id: newId,
      name: `${s.name} (副本)`,
      htmlContent: NidEngine.injectNids(NidEngine.stripInternalAttributes(s.htmlContent))
    };
    get().addScreen(newScreen, newId, { referencedScreenId: id });
    get().panToScreen(newId);
    return newId;
  },

  arrangeScreens: () => {
    const state = get();
    const newPositions = arrangeScreensGrid(
      state.screens,
      state.screenOrder,
      state.settings.frameWidth,
      state.settings.viewportGuideHeight
    );
    const originalPositions: Record<ScreenId, { x: number; y: number }> = {};
    for (const id of Object.keys(newPositions)) {
      const cur = state.screens[id];
      if (cur?.position) originalPositions[id] = cur.position;
    }
    // 复用坐标批量更新链路，一并入栈 (BR-HIS-08)
    get().updateScreenPositions(newPositions, '一键整理画框排布', originalPositions);
  },

  reorderScreens: (newOrder) => {
    const prevOrder = [...get().screenOrder];
    useHistoryStore.getState().commit(
      '调整画框顺序',
      [{ op: 'replace', path: ['screenOrder'], value: [...newOrder] }],
      [{ op: 'replace', path: ['screenOrder'], value: prevOrder }]
    );
    set({ screenOrder: newOrder });
    get().saveProject();
  },

  setActiveScreen: (id) => {
    set({ activeScreenId: id, selectedNid: null, selectedNode: null });
  },

  panToScreen: (screenId, options) => {
    const screen = get().screens[screenId];
    if (!screen || !screen.position) return;

    set({ activeScreenId: screenId, selectedNid: null, selectedNode: null });

    const currentScale = get().viewportTransform.scale;
    const deviceProfile = get().settings.deviceProfile;
    const frameWidth = get().settings.frameWidth;

    let targetScale = options?.scale;
    if (targetScale === undefined) {
      if (deviceProfile === 'mobile') {
        targetScale = Math.min(Math.max(currentScale, 0.75), 1.0);
      } else {
        targetScale = Math.min(Math.max(currentScale, 0.5), 0.75);
      }
    }

    const containerW =
      options?.viewportWidth ??
      (typeof window !== 'undefined' ? Math.max(window.innerWidth - 320, 800) : 1000);

    let targetX: number;
    if (options?.center !== false) {
      targetX = Math.round(containerW / 2 - (screen.position.x + frameWidth / 2) * targetScale);
    } else {
      targetX = Math.round(-screen.position.x * targetScale + (options?.offsetX ?? 120));
    }

    const targetY = Math.round(-screen.position.y * targetScale + (options?.offsetY ?? 100));

    set({
      viewportTransform: {
        x: targetX,
        y: targetY,
        scale: targetScale
      }
    });
  },

  selectNodeByNid: (screenId, nid) => {
    const screen = get().screens[screenId];
    if (!screen) return;
    get().setActiveScreen(screenId);

    const parser = new DOMParser();
    const doc = parser.parseFromString(`<body>${screen.htmlContent}</body>`, 'text/html');
    const el = doc.querySelector(`[data-nid="${nid}"]`) as HTMLElement;
    if (!el) return;

    const compEl = el.closest('[data-component-id]') as HTMLElement | null;
    const componentId = compEl ? compEl.getAttribute('data-component-id') || undefined : undefined;
    const componentInstanceId = compEl ? compEl.getAttribute('data-component-instance') || undefined : undefined;

    const parentChain: { nid: string; tagName: string; className?: string }[] = [];
    let cur = el.parentElement;
    while (cur && cur !== doc.body) {
      const pNid = cur.getAttribute('data-nid');
      if (pNid) {
        const clsAttr = cur.getAttribute('class');
        const cls = clsAttr || (typeof cur.className === 'string' ? cur.className : (cur.className && typeof cur.className === 'object' && 'baseVal' in cur.className ? String((cur.className as any).baseVal) : ''));
        parentChain.unshift({
          nid: pNid,
          tagName: cur.tagName.toLowerCase(),
          className: cls
        });
      }
      cur = cur.parentElement;
    }

    // Inferred layout from class names
    const isFlex = el.classList.contains('row') || el.classList.contains('col');
    const isGrid = Array.from(el.classList).some((c) => c.startsWith('grid-'));
    const isCol = el.classList.contains('col');
    const isWrap = el.classList.contains('wrap');
    const gapClass = Array.from(el.classList).find((c) => c.startsWith('gap-'));
    const gapVal = gapClass ? `var(--space-${gapClass.replace('gap-', '')})` : '0px';

    get().selectNode({
      screenId,
      nid,
      tagName: el.tagName.toLowerCase(),
      ...(() => {
        const t = inspectText(el);
        return { textContent: t.text, textEditable: t.editable, textReason: t.reason };
      })(),
      classNames: Array.from(el.classList),
      parentChain,
      componentId,
      componentInstanceId,
      computedBox: {
        width: 120,
        height: 40,
        top: 0,
        left: 0,
        padding: { top: 0, right: 0, bottom: 0, left: 0 },
        margin: { top: 0, right: 0, bottom: 0, left: 0 }
      },
      computedLayout: {
        display: isFlex ? 'flex' : isGrid ? 'grid' : (['div', 'section', 'header', 'footer', 'nav', 'main', 'aside', 'article'].includes(el.tagName.toLowerCase()) ? 'block' : 'inline-block'),
        flexDirection: isCol ? 'column' : 'row',
        alignItems: 'stretch',
        justifyContent: 'flex-start',
        flexWrap: isWrap ? 'wrap' : 'nowrap',
        gap: gapVal
      }
    });
  },

  setOverride: (screenId, nid, declarations, escaped = false, historyLabel) => {
    const key = `${screenId}:${nid}`;
    const prevOverride = get().overrides[key];

    let mergedDeclarations: Record<string, string>;
    if (Object.keys(declarations).length === 0) {
      mergedDeclarations = {};
    } else {
      mergedDeclarations = { ...(prevOverride?.declarations || {}) };
      for (const [prop, val] of Object.entries(declarations)) {
        if (val === '' || val === undefined || val === null) {
          delete mergedDeclarations[prop];
        } else {
          mergedDeclarations[prop] = val;
        }
      }
    }

    const hasDeclarations = Object.keys(mergedDeclarations).length > 0;
    const newOverride: StyleOverride = {
      nid,
      declarations: mergedDeclarations,
      escaped
    };

    useHistoryStore.getState().commit(
      historyLabel || `修改样式属性: ${nid}`,
      hasDeclarations
        ? [{ op: 'replace', path: ['overrides', key], value: newOverride }]
        : [{ op: 'remove', path: ['overrides', key] }],
      prevOverride
        ? [{ op: 'replace', path: ['overrides', key], value: prevOverride }]
        : [{ op: 'remove', path: ['overrides', key] }]
    );

    set((state) => {
      const next = { ...state.overrides };
      if (hasDeclarations) {
        next[key] = newOverride;
      } else {
        delete next[key];
      }
      return { overrides: next };
    });
    get().saveProject();
  },

  clearNodeOverrides: (screenId, nid) => {
    const key = `${screenId}:${nid}`;
    const prevOverride = get().overrides[key];
    if (!prevOverride) return;

    useHistoryStore.getState().commit(
      `清除节点 #${nid} 手动样式覆盖`,
      [{ op: 'remove', path: ['overrides', key] }],
      [{ op: 'add', path: ['overrides', key], value: prevOverride }]
    );

    set((state) => {
      const next = { ...state.overrides };
      delete next[key];
      return { overrides: next };
    });
    get().saveProject();
  },

  clearScreenOverrides: (screenId) => {
    set((state) => {
      const next = { ...state.overrides };
      for (const k in next) {
        if (k.startsWith(`${screenId}:`)) delete next[k];
      }
      return { overrides: next };
    });
    get().saveProject();
  },

  addDecision: (text, scope = 'global', screenId, source) => {
    const id: DecisionId = `dec-${Date.now()}`;
    const dec: Decision = {
      id,
      text,
      scope,
      screenId,
      source: { kind: source?.kind ?? 'manual', conversationId: source?.conversationId, createdAt: Date.now() },
      active: true
    };
    useHistoryStore.getState().commit(
      `新增工程约定: ${text.slice(0, 16)}`,
      [{ op: 'add', path: ['decisions', id], value: dec }],
      [{ op: 'remove', path: ['decisions', id] }]
    );
    set((state) => ({
      decisions: { ...state.decisions, [id]: dec }
    }));
    get().saveProject();
  },

  removeDecision: (id) => {
    const prev = get().decisions[id];
    if (!prev) return;
    useHistoryStore.getState().commit(
      `删除工程约定: ${prev.text.slice(0, 16)}`,
      [{ op: 'remove', path: ['decisions', id] }],
      [{ op: 'add', path: ['decisions', id], value: prev }]
    );
    set((state) => {
      const next = { ...state.decisions };
      delete next[id];
      return { decisions: next };
    });
    get().saveProject();
  },

  toggleDecision: (id) => {
    const prev = get().decisions[id];
    if (!prev) return;
    const nextDec = { ...prev, active: !prev.active };
    useHistoryStore.getState().commit(
      `${nextDec.active ? '启用' : '停用'}工程约定: ${prev.text.slice(0, 16)}`,
      [{ op: 'replace', path: ['decisions', id], value: nextDec }],
      [{ op: 'replace', path: ['decisions', id], value: prev }]
    );
    set((state) => ({
      decisions: { ...state.decisions, [id]: nextDec }
    }));
    get().saveProject();
  },

  // Components (PRD §3.7)
  createComponent: (name, templateHtml, description) => {
    const id = `comp-${Math.random().toString(36).substring(2, 9)}`;
    const comp: ComponentDefinition = {
      id,
      name,
      description,
      templateHtml,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    useHistoryStore.getState().commit(
      `新建组件: ${name}`,
      [{ op: 'add', path: ['components', id], value: comp }],
      [{ op: 'remove', path: ['components', id] }]
    );
    set((state) => ({
      components: { ...state.components, [id]: comp }
    }));
    get().saveProject();
    return id;
  },

  extractComponentFromNode: (screenId, nid, name) => {
    const screen = get().screens[screenId];
    if (!screen) return null;

    try {
      let content = screen.htmlContent;
      if (!content.includes(`data-nid="${nid}"`)) {
        content = NidEngine.injectNids(content);
      }
      const parser = new DOMParser();
      let doc = parser.parseFromString(`<body>${content}</body>`, 'text/html');
      let el = doc.querySelector(`[data-nid="${nid}"]`) as HTMLElement;

      if (!el) {
        const curSel = get().selectedNode;
        if (curSel && curSel.tagName) {
          const candidates = Array.from(doc.querySelectorAll(curSel.tagName));
          const found = candidates.find(c => {
            const textMatch = curSel.textContent ? c.textContent?.includes(curSel.textContent.trim()) : true;
            const classMatch = curSel.classNames.length ? curSel.classNames.some(cls => c.classList.contains(cls)) : true;
            return textMatch && classMatch;
          });
          if (found) {
            el = found as HTMLElement;
            el.setAttribute('data-nid', nid);
          }
        }
      }

      if (!el) return null;

      const compId = `comp-${Math.random().toString(36).substring(2, 9)}`;
      const instId = `inst-${Math.random().toString(36).substring(2, 9)}`;

      // Create template copy
      const templateClone = el.cloneNode(true) as HTMLElement;
      templateClone.removeAttribute('data-component-instance');
      templateClone.setAttribute('data-component-id', compId);
      const templateHtml = templateClone.outerHTML;

      // Tag element in screen
      el.setAttribute('data-component-id', compId);
      el.setAttribute('data-component-instance', instId);

      const updatedHtml = doc.body.innerHTML;

      const comp: ComponentDefinition = {
        id: compId,
        name,
        templateHtml,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      set((state) => ({
        components: { ...state.components, [compId]: comp }
      }));

      get().updateScreenHtml(screenId, updatedHtml, `提取为组件: ${name}`);

      // Update selected node info with component attributes
      const curSel = get().selectedNode;
      if (curSel && curSel.nid === nid) {
        get().selectNode({ ...curSel, componentId: compId, componentInstanceId: instId });
      }

      return compId;
    } catch (e) {
      console.error('extractComponentFromNode error:', e);
      return null;
    }
  },

  updateComponent: (id, updates) => {
    const prev = get().components[id];
    if (!prev) return;
    const nextComp = { ...prev, ...updates, updatedAt: Date.now() };
    useHistoryStore.getState().commit(
      `修改组件: ${prev.name}`,
      [{ op: 'replace', path: ['components', id], value: nextComp }],
      [{ op: 'replace', path: ['components', id], value: prev }]
    );
    set((state) => ({
      components: { ...state.components, [id]: nextComp }
    }));
    get().saveProject();
  },

  deleteComponent: (id) => {
    const prev = get().components[id];
    if (!prev) return;
    useHistoryStore.getState().commit(
      `删除组件: ${prev.name}`,
      [{ op: 'remove', path: ['components', id] }],
      [{ op: 'add', path: ['components', id], value: prev }]
    );
    set((state) => {
      const next = { ...state.components };
      delete next[id];
      return { components: next };
    });
    get().saveProject();
  },

  insertComponent: (screenId, componentId) => {
    const comp = get().components[componentId];
    const screen = get().screens[screenId];
    if (!comp || !screen) return;

    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(`<body>${comp.templateHtml}</body>`, 'text/html');
      const el = doc.body.firstElementChild as HTMLElement;
      if (!el) return;

      const instId = `inst-${Math.random().toString(36).substring(2, 9)}`;
      el.setAttribute('data-component-id', componentId);
      el.setAttribute('data-component-instance', instId);

      const htmlWithNids = NidEngine.injectNids(el.outerHTML);

      const screenDoc = parser.parseFromString(`<body>${screen.htmlContent}</body>`, 'text/html');
      const rootContainer = screenDoc.body.firstElementChild || screenDoc.body;
      const tmpDiv = screenDoc.createElement('div');
      tmpDiv.innerHTML = htmlWithNids;
      if (tmpDiv.firstElementChild) {
        rootContainer.appendChild(tmpDiv.firstElementChild);
      }

      get().updateScreenHtml(screenId, screenDoc.body.innerHTML, `插入组件实例: ${comp.name}`);
    } catch (e) {
      console.error('insertComponent error:', e);
    }
  },

  detachComponentInstance: (screenId, nid) => {
    const screen = get().screens[screenId];
    if (!screen) return;

    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(`<body>${screen.htmlContent}</body>`, 'text/html');
      const el = doc.querySelector(`[data-nid="${nid}"]`);
      if (!el) return;

      const compRoot = el.closest('[data-component-id]') as HTMLElement;
      if (!compRoot) return;

      compRoot.removeAttribute('data-component-id');
      compRoot.removeAttribute('data-component-instance');

      get().updateScreenHtml(screenId, doc.body.innerHTML, '从组件分离实例');

      const curSel = get().selectedNode;
      if (curSel && curSel.nid === nid) {
        get().selectNode({ ...curSel, componentId: undefined, componentInstanceId: undefined });
      }
    } catch (e) {
      console.error('detachComponentInstance error:', e);
    }
  },

  syncComponentInstances: (componentId, force = false) => {
    const comp = get().components[componentId];
    if (!comp) return { syncedCount: 0, skippedConflictCount: 0, details: [] };

    const { screens, overrides } = get();
    let syncedCount = 0;
    let skippedConflictCount = 0;
    const details: string[] = [];

    const parser = new DOMParser();

    Object.values(screens).forEach((screen) => {
      const doc = parser.parseFromString(`<body>${screen.htmlContent}</body>`, 'text/html');
      const instances = doc.querySelectorAll(`[data-component-id="${componentId}"]`);
      if (instances.length === 0) return;

      let screenModified = false;

      instances.forEach((inst) => {
        const instEl = inst as HTMLElement;
        const instId = instEl.getAttribute('data-component-instance') || `inst-${Math.random().toString(36).substring(2, 9)}`;

        // Check L4 style overrides conflict
        const nidsInInstance: string[] = [];
        const rootNid = instEl.getAttribute('data-nid');
        if (rootNid) nidsInInstance.push(rootNid);
        instEl.querySelectorAll('[data-nid]').forEach((c) => {
          const cnid = c.getAttribute('data-nid');
          if (cnid) nidsInInstance.push(cnid);
        });

        const conflictingNids = nidsInInstance.filter((nid) => overrides[`${screen.id}:${nid}`]);
        const hasConflict = conflictingNids.length > 0;

        if (hasConflict && !force) {
          skippedConflictCount++;
          details.push(`画板「${screen.name}」中的实例存在 ${conflictingNids.length} 条手动样式覆盖 (L4)，已自动跳过保护`);
          return;
        }

        // Slot preservation: extract inner leaf texts and img src
        const leafTexts: string[] = [];
        const leafImages: string[] = [];
        instEl.querySelectorAll('*').forEach((child) => {
          if (child.tagName.toLowerCase() === 'img') {
            const src = (child as HTMLImageElement).getAttribute('src');
            if (src) leafImages.push(src);
          } else if (child.children.length === 0 && child.textContent?.trim()) {
            leafTexts.push(child.textContent.trim());
          }
        });

        // Parse clean template
        const tDoc = parser.parseFromString(`<body>${comp.templateHtml}</body>`, 'text/html');
        const newEl = tDoc.body.firstElementChild as HTMLElement;
        if (!newEl) return;

        newEl.setAttribute('data-component-id', componentId);
        newEl.setAttribute('data-component-instance', instId);
        if (rootNid) newEl.setAttribute('data-nid', rootNid);

        // Re-inject leaf texts
        let tIdx = 0;
        let imgIdx = 0;
        newEl.querySelectorAll('*').forEach((child) => {
          if (child.tagName.toLowerCase() === 'img' && imgIdx < leafImages.length) {
            child.setAttribute('src', leafImages[imgIdx++]);
          } else if (child.children.length === 0 && child.textContent?.trim() && tIdx < leafTexts.length) {
            child.textContent = leafTexts[tIdx++];
          }
        });

        // Ensure nids
        const withNids = NidEngine.injectNids(newEl.outerHTML);
        const tempHolder = doc.createElement('div');
        tempHolder.innerHTML = withNids;
        if (tempHolder.firstElementChild) {
          instEl.replaceWith(tempHolder.firstElementChild);
          screenModified = true;
          syncedCount++;
        }
      });

      if (screenModified) {
        get().updateScreenHtml(screen.id, doc.body.innerHTML, `同步组件实例: ${comp.name}`);
      }
    });

    return { syncedCount, skippedConflictCount, details };
  },

  upsertProjectDocument: (doc) => {
    validateProjectDocument(doc);
    const documents = get().projectDocuments;
    const previous = documents[doc.id];
    if (!previous && Object.keys(documents).length >= MAX_PROJECT_DOCUMENTS) throw new Error('最多保存 20 份项目文档');
    const next = {
      ...doc,
      title: doc.title.trim(),
      ...(previous?.originalContent !== undefined ? { originalContent: previous.originalContent } : {}),
      ...(doc.missing ? { enabled: false } : {})
    };
    useHistoryStore.getState().commit(
      `${previous ? '编辑' : '新增'}项目文档: ${next.title}`,
      [{ op: previous ? 'replace' : 'add', path: ['projectDocuments', doc.id], value: next }],
      [previous ? { op: 'replace', path: ['projectDocuments', doc.id], value: previous } : { op: 'remove', path: ['projectDocuments', doc.id] }]
    );
    set({ projectDocuments: { ...documents, [doc.id]: next } });
    get().saveProject();
  },

  removeProjectDocument: (id) => {
    const previous = get().projectDocuments[id];
    if (!previous) return;
    useHistoryStore.getState().commit(`删除项目文档: ${previous.title}`,
      [{ op: 'remove', path: ['projectDocuments', id] }],
      [{ op: 'add', path: ['projectDocuments', id], value: previous }]);
    const documents = { ...get().projectDocuments };
    delete documents[id];
    set({ projectDocuments: documents });
    get().saveProject();
  },

  // Assets (PRD §3.4.1 / BR-IMG-03 去重复用)
  addAsset: (asset) => {
    const curAssets = get().assets;
    const existingKey = Object.keys(curAssets).find(
      (id) => curAssets[id].relPath === asset.relPath || id === asset.id
    );

    if (existingKey) {
      // 已存在同一素材：仅增加引用计数，不作为可撤销的独立动作
      const existing = curAssets[existingKey];
      set((state) => ({
        assets: {
          ...state.assets,
          [existingKey]: { ...existing, refCount: (existing.refCount || 0) + 1 }
        }
      }));
      get().saveProject();
      return;
    }

    useHistoryStore.getState().commit(
      `新增素材: ${asset.name}`,
      [{ op: 'add', path: ['assets', asset.id], value: asset }],
      [{ op: 'remove', path: ['assets', asset.id] }]
    );
    set((state) => ({ assets: { ...state.assets, [asset.id]: asset } }));
    get().saveProject();
  },

  removeAsset: (id) => {
    const prev = get().assets[id];
    if (!prev) return;
    useHistoryStore.getState().commit(
      `删除素材: ${prev.name}`,
      [{ op: 'remove', path: ['assets', id] }],
      [{ op: 'add', path: ['assets', id], value: prev }]
    );
    set((state) => {
      const next = { ...state.assets };
      delete next[id];
      return { assets: next };
    });
    get().saveProject();
  },

  replaceAssetGlobally: (oldAssetId, newAssetUrl) => {
    const { screens } = get();
    let count = 0;
    const parser = new DOMParser();

    Object.values(screens).forEach((screen) => {
      const doc = parser.parseFromString(`<body>${screen.htmlContent}</body>`, 'text/html');
      let changed = false;

      // 1. Elements with data-asset-id
      doc.querySelectorAll(`[data-asset-id="${oldAssetId}"]`).forEach((el) => {
        if (el.tagName.toLowerCase() === 'img') {
          (el as HTMLImageElement).src = newAssetUrl;
        } else {
          (el as HTMLElement).style.backgroundImage = `url(${newAssetUrl})`;
        }
        changed = true;
        count++;
      });

      // 2. Images with matching src
      doc.querySelectorAll('img').forEach((img) => {
        const src = img.getAttribute('src');
        if (src === oldAssetId || (src && src.includes(oldAssetId))) {
          img.src = newAssetUrl;
          changed = true;
          count++;
        }
      });

      if (changed) {
        get().updateScreenHtml(screen.id, doc.body.innerHTML, `全局替换素材: ${oldAssetId}`);
      }
    });

    return count;
  },

  cleanupUnusedAssets: () => {
    const { screens, assets } = get();
    const allHtml = Object.values(screens).map((s) => s.htmlContent).join(' ');
    let cleaned = 0;
    const nextAssets = { ...assets };

    Object.keys(nextAssets).forEach((id) => {
      const asset = nextAssets[id];
      const isUsed = allHtml.includes(id) || (asset.relPath && allHtml.includes(asset.relPath));
      if (!isUsed) {
        delete nextAssets[id];
        cleaned++;
      }
    });

    if (cleaned > 0) {
      const removed = Object.keys(assets).filter((id) => !nextAssets[id]);
      useHistoryStore.getState().commit(
        `清理未使用素材 ${cleaned} 项`,
        removed.map((id) => ({ op: 'remove' as const, path: ['assets', id] })),
        removed.map((id) => ({ op: 'add' as const, path: ['assets', id], value: assets[id] }))
      );
      set({ assets: nextAssets });
      get().saveProject();
    }
    return cleaned;
  },

  selectNode: (info) => {
    set({
      selectedNode: info,
      selectedNid: info ? info.nid : null,
      activeScreenId: (info && info.screenId) ? info.screenId : get().activeScreenId
    });
  },

  setHoveredNid: (nid) => set({ hoveredNid: nid }),

  setViewportTransform: (transform) => set({ viewportTransform: transform }),

  setPendingNodeRef: (ref) => set({ pendingNodeRef: ref }),

  clearPendingNodeRef: () => set({ pendingNodeRef: null }),

  // Side-by-side adoption (D17)
  getStagedRenderContextKey: () => {
    const state = get(), staged = state.stagedScreen;
    if (!staged) return '';
    const target = state.screens[staged.targetScreenId];
    return JSON.stringify([state.id, state.stagedRenderRevision, staged, state.settings,
      state.designSystem.tokens, state.overrides, target?.htmlContent, target?.scopedCss]);
  },

  setStagedRenderQuality: (key, report) => {
    if (!get().stagedScreen || key !== get().getStagedRenderContextKey()) return;
    set({ stagedRenderQuality: { key, report } });
  },

  stageScreenChange: (targetScreenId, newHtml, screenName, modificationRequest) => {
    set({
      stagedScreen: { targetScreenId, newHtml, screenName, modificationRequest },
      stagedRenderQuality: null, stagedRenderRevision: get().stagedRenderRevision + 1
    });
  },

  adoptStagedChange: () => {
    const staged = get().stagedScreen;
    if (!staged || !canAdoptStagedScreen(get())) return;
    const target = get().screens[staged.targetScreenId];
    if (target) {
      useHistoryStore.getState().addCheckpoint(`采纳新版前备份: ${target.name}`, {
        screenId: target.id,
        htmlContent: target.htmlContent,
        scopedCss: target.scopedCss
      });
      get().updateScreenHtml(staged.targetScreenId, staged.newHtml, `采纳 AI 生成新版: ${staged.screenName}`);
    }
    set({ stagedScreen: null, stagedRenderQuality: null });
  },

  discardStagedChange: () => {
    set({ stagedScreen: null, stagedRenderQuality: null });
  },

  keepBothScreens: () => {
    const staged = get().stagedScreen;
    if (!staged || !canAdoptStagedScreen(get())) return;
    const newId = `screen-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    get().addScreen({
      name: `${staged.screenName} (AI 方案)`,
      htmlContent: staged.newHtml
    }, newId, { referencedScreenId: staged.targetScreenId });
    set({ stagedScreen: null, stagedRenderQuality: null });
  },

  saveProject: () => {
    const { id, name, settings, designSystem, screens, overrides, decisions, components, assets, panelStates, coverImage, quickPrompts, projectDocuments } =
      get();
    const data = {
      id,
      name,
      schemaVersion: 1,
      projectDocuments,
      savedAt: Date.now(),
      settings,
      designSystem,
      screens,
      overrides,
      decisions,
      components,
      assets,
      panelStates,
      coverImage: coverImage || undefined,
      quickPrompts: quickPrompts && quickPrompts.length > 0 ? quickPrompts : undefined
    };
    const { folderPath } = get();
    if (folderPath) {
      // 文件夹工程：画框正文外置为独立文件，project.json 原子写入 (T-AE-40)
      // 失败不抛出——保存失败不应让编辑操作整个崩掉，由标题栏状态提示
      void new ProjectRepository(createProjectStorage(id, folderPath))
        .save(data as never)
        .catch((e) => console.warn('[project] 文件夹保存失败', e));
    } else {
      writeProject(id, JSON.stringify(data));
    }

    // 历史归档随工程一起落盘 (BR-HIS-06)
    scheduleHistorySave(id, folderPath);

    // 同步注册表元信息，供工程管理页渲染卡片 (PRD §3.0.1)
    const firstScreenId = get().screenOrder[0];
    const firstScreen = firstScreenId ? screens[firstScreenId] : undefined;
    const meta: ProjectMeta = {
      id,
      name,
      deviceProfile: settings.deviceProfile,
      frameWidth: settings.frameWidth,
      createdAt: get().createdAt,
      updatedAt: data.savedAt,
      screenCount: Object.keys(screens).length,
      previewHtml: firstScreen?.htmlContent,
      previewCss: designSystem?.tokens ? compileTokensToCss(designSystem.tokens, settings.colorMode) : '',
      folderPath: get().folderPath,
      coverImage: coverImage || undefined
    };
    upsertMeta(meta);
  },

  /** 新建空白工程并切换为当前工程 (PRD §3.0.1)。默认纯净画布 (0 画框，保证工作区只有有效产物) */
  initNewProject: ({ name, deviceProfile, designSystem: ds, initialDecisions, folderPath, createSpecimen }) => {
    const id = `proj_${Date.now().toString(36)}`;
    const now = Date.now();
    const effectiveDs = ds || defaultTheme;
    let screens: Record<ScreenId, Screen> = {};
    let screenOrder: ScreenId[] = [];
    let activeScreenId: ScreenId | null = null;

    if (createSpecimen) {
      const screenId = `screen-${Date.now().toString(36)}`;
      screens = {
        [screenId]: {
          id: screenId,
          name: '🎨 风格样张',
          position: { x: 100, y: 120 },
          htmlContent: NidEngine.injectNids(buildStyleSpecimenHtml(deviceProfile)),
          metadata: { kind: 'specimen' }
        }
      };
      screenOrder = [screenId];
      activeScreenId = screenId;
    }

    set({
      id,
      name,
      folderPath,
      createdAt: now,
      settings: {
        deviceProfile,
        frameWidth: deviceProfile === 'pc' ? 1440 : 390,
        viewportGuideHeight: deviceProfile === 'pc' ? 900 : 844,
        showViewportGuide: true,
        colorMode: 'light',
        lodBudget: 12
      },
      designSystem: effectiveDs,
      screens,
      screenOrder,
      overrides: {},
      // T-AE-20: 三问中「行业语境」等不可量化的偏好落为工程约定，
      // 复用既有 Decision 结构与 Prompt 注入链路，不新增持久化结构
      decisions: Object.fromEntries(
        (initialDecisions ?? []).map((text, i) => {
          const id = `dec-init-${i}`;
          return [id, { id, text, scope: 'global' as const, source: { kind: 'auto_extracted' as const, createdAt: now }, active: true }];
        })
      ),
      components: {},
      assets: {},
      projectDocuments: {},
      panelStates: {},
      activeScreenId,
      selectedNid: null,
      hoveredNid: null,
      selectedNode: null,
      stagedScreen: null,
      stagedRenderQuality: null,
      pendingNodeRef: null,
      pendingAuditReport: null,
      coverImage: null,
      quickPrompts: [],
      viewportTransform: { x: 80, y: 80, scale: 0.7 }
    });
    get().saveProject();
    if (folderPath) {
      void new ProjectRepository(createProjectStorage(id, folderPath))
        .acquireLock()
        .catch(() => {});
    }
    return id;
  },

  /** 从注册表载入指定工程 */
  loadProjectById: (id) => {
    const raw = readProject(id);
    if (!raw) return false;
    get().loadProject(raw);
    return true;
  },

  loadProjectDocument: (doc, folderPath) => {
    try {
      get().loadProject(JSON.stringify(doc));
      // folderPath 决定此后会话与附件写文件夹而非 localStorage
      set({ folderPath });
      return true;
    } catch (e) {
      console.warn('[project] 文档载入失败', e);
      return false;
    }
  },

  deleteProject: (id) => {
    deleteProjectData(id);
    deleteHistoryArchive(id, get().id === id ? get().folderPath : undefined);
  },

  loadProject: (jsonString) => {
    try {
      const data = JSON.parse(jsonString);
      const order = data.screenOrder && data.screenOrder.length
        ? data.screenOrder.filter((sid: string) => data.screens?.[sid])
        : Object.keys(data.screens || {});
      set({
        id: data.id || get().id,
        createdAt: data.createdAt || data.savedAt || Date.now(),
        name: data.name || 'Untitled',
        settings: data.settings || get().settings,
        designSystem: data.designSystem || get().designSystem,
        screens: data.screens || {},
        screenOrder: order,
        activeScreenId: order[0] || null,
        selectedNid: null,
        hoveredNid: null,
        selectedNode: null,
        stagedScreen: null,
      stagedRenderQuality: null,
        overrides: data.overrides || {},
        decisions: data.decisions || {},
        components: data.components || {},
        assets: data.assets || {},
        projectDocuments: data.projectDocuments || {},
        panelStates: data.panelStates || {},
        coverImage: data.coverImage || null,
        quickPrompts: Array.isArray(data.quickPrompts) ? data.quickPrompts : []
      });
    } catch (e) {
      console.error('Invalid project JSON', e);
    }
  },

  hasRecoverySession: () => !!readProject(get().id),

  recoverSession: () => {
    const raw = readProject(get().id);
    if (raw) get().loadProject(raw);
  },

  applyPatches: (patches) => {
    set((state) => {
      const nextScreens = { ...state.screens };
      let nextScreenOrder = [...state.screenOrder];
      const nextOverrides = { ...state.overrides };
      let nextDesignSystem = state.designSystem;
      const nextDecisions = { ...state.decisions };
      const nextComponents = { ...state.components };
      const nextAssets = { ...state.assets };
      const nextProjectDocuments = { ...state.projectDocuments };
      // screenOrder 补丁优先于 screens 增删推导出的顺序 (BR-HIS-09)
      let orderOverride: ScreenId[] | null = null;

      for (const patch of patches) {
        const root = patch.path[0];
        const key = patch.path[1] as string;

        if (root === 'screens') {
          if (patch.op === 'remove') {
            delete nextScreens[key];
            nextScreenOrder = nextScreenOrder.filter((id) => id !== key);
          } else if (patch.path.length === 3 && patch.path[2] === 'position' && nextScreens[key]) {
            nextScreens[key] = {
              ...nextScreens[key],
              position: patch.value as { x: number; y: number }
            };
          } else if (patch.value) {
            nextScreens[key] = patch.value as Screen;
            if (!nextScreenOrder.includes(key)) {
              nextScreenOrder.push(key);
            }
          }
        } else if (root === 'overrides') {
          if (patch.op === 'remove') {
            delete nextOverrides[key];
          } else if (patch.value) {
            nextOverrides[key] = patch.value as StyleOverride;
          }
        } else if (root === 'designSystem') {
          if (patch.value) {
            nextDesignSystem = patch.value as DesignSystem;
          }
        } else if (root === 'decisions') {
          if (patch.op === 'remove') {
            delete nextDecisions[key];
          } else if (patch.value) {
            nextDecisions[key] = patch.value as Decision;
          }
        } else if (root === 'components') {
          if (patch.op === 'remove') {
            delete nextComponents[key];
          } else if (patch.value) {
            nextComponents[key] = patch.value as ComponentDefinition;
          }
        } else if (root === 'assets') {
          if (patch.op === 'remove') {
            delete nextAssets[key];
          } else if (patch.value) {
            nextAssets[key] = patch.value as Asset;
          }
        } else if (root === 'projectDocuments') {
          if (patch.op === 'remove') delete nextProjectDocuments[key];
          else if (patch.value) nextProjectDocuments[key] = patch.value as ProjectDocumentEntry;
        } else if (root === 'screenOrder') {
          if (Array.isArray(patch.value)) {
            orderOverride = [...(patch.value as ScreenId[])];
          }
        }
      }

      if (orderOverride) {
        // 只保留仍然存在的画框，避免顺序数组残留幽灵 id
        nextScreenOrder = orderOverride.filter((sid) => nextScreens[sid]);
        for (const sid of Object.keys(nextScreens)) {
          if (!nextScreenOrder.includes(sid)) nextScreenOrder.push(sid);
        }
      }

      return {
        screens: nextScreens,
        screenOrder: nextScreenOrder,
        overrides: nextOverrides,
        designSystem: nextDesignSystem,
        decisions: nextDecisions,
        components: nextComponents,
        assets: nextAssets,
        projectDocuments: nextProjectDocuments
      };
    });
    get().saveProject();
  }
}));

// Connect JSON Patch history undo/redo directly to project state (PRD §3.8.1 / D16)
setApplyPatchesHandler((patches) => {
  useProjectStore.getState().applyPatches(patches);
});

if (typeof window !== 'undefined') {
  (window as any).__projectStore = useProjectStore;
}


