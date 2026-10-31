import {draftExecutionIssue} from '../services/ai/draftExecutionSource';
import {mergeRenderResourceFiles,renderResourceIssue} from '../services/storage/renderResourceSnapshot';
import {taskRuleSafetyIssue} from '../services/ai/designKnowledge/safety';
import {taskInputBinding,renderEvidenceIdentity} from '../services/ai/evidenceIdentity';
import {isTaskContractShape} from '../services/ai/taskContractShape';
import {hasTemplateContract,compileComponentTemplate} from '../utils/componentTemplate';
import {candidateRepairEligibility,repairCandidate} from '../services/ai/candidateRepair';
import {isPageRepairRecord} from '../services/ai/pageRepairRecord';
import {repairGuidanceIssue} from '../services/ai/designKnowledge/repairTrace';
import type {PageRepairModel} from '../services/ai/controlledStyleRepair';
import type {PageRepairRecord} from '../services/ai/pageRepairRecord';
import {inspectDesignEntities,designEntitySummary} from '../services/ai/designEntityValidation';
import {consumeMultiPageBatch,type ReadyMultiPageBatch} from '../services/ai/multiPageService';
import {assertLibraryEditable,buildLibraryReferenceSnapshot,isLibraryReference,libraryMemberLocked,libraryReferenceIssue,verifyLibraryReferenceFiles} from '../services/ai/designLibraryReference';
import {pageCreationContext,prepareNewPage} from '../services/ai/pageCreationValidation';
import {persistImportResources,type PreparedImportResources} from '../services/import/importResources';
import type {HtmlImportPreviewReceipt} from '../types/htmlImport';
import { defaultReferenceDevice, REFERENCE_DEVICES, resolveProjectViewport, validReferenceDevice, normalizeReferenceSettings } from '../utils/referenceDevice';
import { collectNodePresentation, findScreenElement, mergeInspectorDeclarations, isEscapedInspectorValue, type InspectorSnapshot } from '../utils/inspectorStyle';
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
  DesignSystemOrigin,
  DesignLibraryBinding,
  Nid,
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
import { checkGenerationQuality, checkGenerationSourceSafety } from '../services/ai/generationQuality';
import {formRuleScope} from '../services/ai/formBehaviorChanges';
import type { RenderedQualityReport } from '../utils/renderedQuality';
import { buildScreenDocument } from '../utils/screenDocument';
import { getBaseCss } from '../styles/baseCss';
import { parseHtmlCopy } from '../utils/htmlDocument';
import { replaceCssResourceUrl } from '../services/import/importResources';
import { imageSrcsetCandidates } from '../services/import/htmlImportCss';
import { normalizeMobileNavigation, normalizeScreenNavigation } from '../utils/mobileNavigation';
import { designSystemOriginFor } from '../utils/designSystemIdentity';
import { nextScopedStyleAsset } from '../utils/styleAssetIdentity';
import { contentFingerprint, type DesignTaskContract } from '../services/ai/designWorkflow';
import { knowledgeFingerprint } from '../services/ai/projectKnowledge';
import { designTokenFingerprint } from '../utils/designSystemIdentity';
import { readProjectRenderResources, auditProjectAssets, inspectProjectAssetReferences, referencedProjectAssets, screenForAssetAudit, verifyProjectAssetFiles, type ProjectAssetAuditReport, type ProjectAssetIssue } from '../services/ai/projectAssetIntegrity';
import type { DesignExecutionRecord } from '../services/ai/designExecutionRecord';
import { assertDesignLibraryCopyCompatible, type DesignLibraryCopy } from '../services/ai/designLibraryCopy';
import { saveStagedCandidate, removeStagedCandidate, type StagedCandidateData } from '../services/storage/candidateRepository';
import { canConfirmCandidateStructure, type CandidateDeliveryReport, type CandidateValidationEvidence } from '../services/ai/candidateValidation';
import {backgroundScreenUpdates,styleApplicationKey} from '../services/import/styleApplication';
import { DeliveryRepository, type DeliveryMode, type DeliveryRecord } from '../services/storage/deliveryRepository';
import { DeliveryPreviewCapture } from '../services/storage/deliveryPreview';
import { PagePreviewCapture, type PagePreview } from '../services/storage/pagePreview';
import { candidatePreviewPath, validCandidateId } from '../services/storage/candidatePreview';
import { projectComponentSync } from '../utils/componentSync';
import { prepareCheckedRestyle } from '../services/ai/restyleValidation';
import { restyleContextKey, type RestyleApplicationResult } from '../services/ai/restyleBatch';
import { RestyleDeliveryRepository, type RestyleDeliveryRecord, type RestyleDeliveryReceipt } from '../services/storage/restyleDeliveryRepository';
import { buildRestyleDelivery, captureRestylePreviews, removeUnarchivedRestylePreviews } from '../services/storage/restyleDelivery';
import {resolveWorkflowValidation,evaluateWorkflowValidation,inspectWorkflowStructure} from '../services/ai/workflowValidation';

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

export type StagedDeliveryReport = CandidateDeliveryReport;

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

export interface HtmlImportApplication {
  contract:DesignTaskContract;preview:HtmlImportPreviewReceipt;resources?:PreparedImportResources;signal?:AbortSignal;isCurrent?:()=>boolean;
}
const pendingImports=new Set<string>();

export interface HtmlScreenImportSetup {
  projectId: string;
  designSystem?: DesignSystem;
  designSystemOrigin?: DesignSystemOrigin;
  colorMode?: 'light' | 'dark';
  assets?: Asset[];
  useCustomNavigation?: boolean;
  /** Explicit selective theme update in an existing project, bound to the reviewed context. */
  themeUpdate?: {expectedKey:string;syncScreenIds:string[]};
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
  inspector?: InspectorSnapshot;
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

// Runtime operation only: never serialized into the project or conversation.
let activeStagedRepairJob:{cancel:()=>void}|null=null;

interface ProjectState {
  id: string;
  name: string;
  /** 工程文件夹绝对路径 (T-AE-40)。未设置时存储层回退 localStorage */
  folderPath?: string;
  createdAt: number;
  settings: ProjectSettings;
  designSystem: DesignSystem;
  designSystemOrigin?: DesignSystemOrigin;
  designLibraryBinding?: DesignLibraryBinding;

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
  stagedScreen: StagedCandidateData | null;
  stagedCandidateSaveStatus: 'pending' | 'saved' | 'failed' | null;
  stagedRepairStatus: 'repairing' | 'verifying' | null;
  stagedRepairError: string | null;
  getStagedRepairEligibility: () => {allowed:boolean;message:string};
  repairStagedCandidate: (model:PageRepairModel,signal?:AbortSignal,isCurrent?:()=>boolean) => Promise<boolean>;
  cancelStagedRepair: () => void;
  stagedAdoptionStatus: 'saving' | 'failed' | null;
  stagedAdoptionError: string | null;
  stagedAdoptionAttempt: number;
  deliveryArchiveRevision: number;
  deliveryArchiveNotice: string | null;
  /** Live gates are never restored from disk; diagnostic copies can be archived separately. */
  stagedRenderQuality: { key: string; report: RenderedQualityReport } | null;
  stagedAssetFiles: { key: string; status: 'passed' | 'blocked'; issues: ProjectAssetIssue[] } | null;
  stagedProjectAssetAudit: { key: string; contextFingerprint: string; report: ProjectAssetAuditReport } | null;
  stagedValidationEvidence: CandidateValidationEvidence | null;
  stagedPreview: { key: string; attempt: string; pending: boolean; report?: PagePreview } | null;
  stagedAssetAuditRevision: number;
  stagedRenderRevision: number;
  getStagedRenderContextKey: () => string;
  refreshStagedRender: (reason?:string) => void;
  isStagedTaskCurrent: () => boolean;
  getStagedAssetIssues: () => ProjectAssetIssue[];
  getStagedDeliveryReport: () => StagedDeliveryReport;
  recheckStagedAssetFiles: () => void;
  setStagedRenderQuality: (key: string, report: RenderedQualityReport) => void;
  recordStagedValidationEvidence: () => void;
  captureStagedPreview: (retry?: boolean) => Promise<void>;

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
  setUseCustomNavigation: (enabled: boolean) => void;
  setReferenceDevice: (presetId: string) => void;
  toggleColorMode: () => void;
  setShowViewportGuide: (show: boolean) => void;
  setPanelOpen: (key: string, open: boolean) => void;
  setDesignSystem: (ds: DesignSystem) => void;
  applyExtractedStyle: (ds:DesignSystem,syncScreenIds:string[],expectedKey:string) => void;
  applyDesignLibraryCopy: (copy: DesignLibraryCopy) => void;
  detachDesignLibraryReference: () => void;
  /** 换肤前扫描会被 L4 覆盖挡住的节点 (T-AE-22) */
  scanThemeConflicts: () => ThemeConflict[];
  /** 清除指定 L4 覆盖，使其跟随新主题；escaped 覆盖需显式允许 (T-AE-22) */
  clearOverridesForTheme: (keys: string[], includeEscaped?: boolean) => number;

  // Screen CRUD
  applyMultiPageCreation: (batch:ReadyMultiPageBatch) => string[];
  addScreen: (
    screen: (Omit<Screen, 'id' | 'position'> & { position?: { x: number; y: number } }) | Screen,
    customId?: string,
    options?: { referencedScreenId?: string; anchorScreenId?: string; autoPan?: boolean; importSetup?: HtmlScreenImportSetup; initialOverrides?: StyleOverride[] }
  ) => ScreenId;
  importHtmlScreen: (screen: Omit<Screen, 'id' | 'position'>, setup: HtmlScreenImportSetup, application?:HtmlImportApplication) => Promise<ScreenId>;
  /** 画框是否为风格样张页（doc/aesthetic/spec.md §6.6.7） */
  isSpecimen: (id: ScreenId) => boolean;
  /** 某画框中被 L4 手动覆盖的 nid —— Polish/Restyle 不应改动它们 (T-AE-26) */
  getProtectedNids: (screenId: ScreenId) => string[];
  /** 组装 Restyle 的执行队列，组件优先 (T-AE-28) */
  buildRestylePlan: (screenIds?: ScreenId[]) => RestylePlan;
  /** 核验资源、实际渲染与全部实例投影后，单条 History 应用重塑结果。 */
  applyRestyleOutcome: (outcome: RestyleOutcome, signal?: AbortSignal, isCurrent?:()=>boolean) => Promise<RestyleApplicationResult>;

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
  setScreenLinkTarget: (screenId: ScreenId, nid: Nid, targetScreenId?: ScreenId) => boolean;
  /** 级联删除指定节点及其全部子孙节点，同步清除对应样式覆盖 (ISSUE-021) */
  deleteNode: (screenId: ScreenId, nid: string) => boolean;
  removeScreen: (id: ScreenId) => void;
  renameScreen: (id: ScreenId, name: string) => void;
  setScreenDesignRole: (id: ScreenId, patch: { pageGroup?: string; stateLabel?: string; audienceRole?: string }) => void;
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
  replaceNodeImage: (screenId: string, nid: string, asset: Asset) => boolean;
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
  stageScreenChange: (targetScreenId: ScreenId, newHtml: string, screenName: string, modificationRequest?: string, workflowContract?: DesignTaskContract, executionRecord?: DesignExecutionRecord, repair?: PageRepairRecord) => void;
  restoreStagedCandidate: (candidate: StagedCandidateData, projectId: string) => boolean;
  adoptStagedChange: () => Promise<boolean>;
  forceAdoptStagedChange: () => Promise<boolean>;
  commitStagedDelivery: (mode: DeliveryMode, expectedContextKey?: string) => Promise<boolean>;
  discardStagedChange: () => void;
  keepBothScreens: () => Promise<boolean>;

  // Persistence & Recovery (T-02, T-03, T-04)
  saveProject: () => void;
  saveProjectChecked: () => Promise<void>;
  loadProject: (jsonString: string) => void;
  initNewProject: (opts: { name: string; deviceProfile: 'pc' | 'mobile'; designSystem: DesignSystem; initialDecisions?: string[]; folderPath?: string; createSpecimen?: boolean; referenceDeviceId?: string }) => string;
  loadProjectById: (id: string) => boolean;
  /** 从文件夹读回的工程文档载入 (T-AE-43) */
  loadProjectDocument: (doc: unknown, folderPath?: string) => boolean;
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
function isStagedTaskCurrent(state: ProjectState): boolean {
  const staged = state.stagedScreen;
  const contract = staged?.workflowContract;
  if(staged&&Object.hasOwn(staged,'taskBindingFingerprint')&&(!isTaskContractShape(contract)||typeof staged.taskBindingFingerprint!=='string'||staged.taskBindingFingerprint!==taskInputBinding(contract)))return false;
  if(draftExecutionIssue(staged?.executionRecord,staged?.newHtml))return false;
  if(staged?.repair&&(!isPageRepairRecord(staged.repair)||(staged.repair.guidance&&(!contract||repairGuidanceIssue(staged.repair.guidance,contract,staged.repair.status==='repaired')))))return false;
  if (staged?.baselineFingerprint && staged.baselineFingerprint !== contentFingerprint(state.screens[staged.targetScreenId]?.htmlContent ?? '')) return false;
  if (staged?.projectFingerprint && staged.projectFingerprint !== knowledgeFingerprint(state)) return false;
  if (staged?.designOriginFingerprint && staged.designOriginFingerprint !== contentFingerprint(JSON.stringify([
    state.designSystemOrigin?.kind, state.designSystemOrigin?.sourceId, state.designSystemOrigin?.sourceFingerprint,
    state.designSystemOrigin?.tokenVersion, state.designSystemOrigin?.tokenFingerprint]))) return false;
  if (!staged || contract===undefined) return true; // Explicitly malformed contracts cannot become legacy candidates.
  if(!resolveWorkflowValidation(contract,'candidate').ok)return false;
  if(contract.device.profile!==state.settings.deviceProfile || contract.device.frameWidth!==state.settings.frameWidth)return false;
  if (contract.operation !== 'modify' && contract.operation !== 'restyle') return false;
  if (contract.strategy === 'review-first' || contract.strategy === 'no-canvas-mutation') return false;
  const target = state.screens[staged.targetScreenId];
  if (!target || (contract.target && (contract.target.id !== target.id || contract.target.baselineFingerprint !== contentFingerprint(target.htmlContent)))) return false;
  if (contract.designSystem && (contract.designSystem.id !== state.designSystem.id
    || (contract.designSystem.tokenFingerprint && contract.designSystem.tokenFingerprint !== designTokenFingerprint(state.designSystem.tokens)))) return false;
  const source = contract.designSystemOrigin;
  const currentSource = state.designSystemOrigin;
  if (source && (!currentSource || source.kind !== currentSource.kind
    || (source.sourceId && source.sourceId !== currentSource.sourceId)
    || (source.sourceFingerprint && source.sourceFingerprint !== currentSource.sourceFingerprint)
    || (source.tokenVersion && source.tokenVersion !== currentSource.tokenVersion))) return false;
  if (contract.knowledgeFingerprint && contract.knowledgeFingerprint !== knowledgeFingerprint(state)) return false;
  return true;
}

function candidateBrokenAssetReferences(state: ProjectState): ProjectAssetIssue[] {
  const staged = state.stagedScreen;
  if (!staged) return [];
  const target = state.screens[staged.targetScreenId];
  if (!target) return [{ code: 'unregistered_asset_reference', entityId: staged.targetScreenId, message: '目标页面已不存在，无法核对候选资源。' }];
  const assets = Object.values(state.assets);
  return inspectProjectAssetReferences([screenForAssetAudit({ ...target, htmlContent: staged.newHtml }, state.overrides)], assets)
    .filter(issue => issue.entityId === target.id);
}

function stagedReferencedAssetFiles(state: ProjectState): Asset[] {
  const staged = state.stagedScreen;
  const target = staged && state.screens[staged.targetScreenId];
  if (!staged || !target) return [];
  const files=referencedProjectAssets(screenForAssetAudit({ ...target, htmlContent: staged.newHtml }, state.overrides), Object.values(state.assets));
  return [...new Map([...files,...Object.values(state.assets).filter(a=>libraryMemberLocked(state,'assets',a.id))].map(a=>[a.id,a])).values()];
}

function projectAssetAuditFingerprint(state: ProjectState): string {
  return contentFingerprint(JSON.stringify([knowledgeFingerprint(state),
    Object.values(state.assets).map(asset => [asset.id, asset.name, asset.relPath]).sort(([a], [b]) => a.localeCompare(b))]));
}

function stagedDeliveryReport(state: ProjectState): StagedDeliveryReport {
  const staged = state.stagedScreen;
  const target = staged && state.screens[staged.targetScreenId];
  if (!staged || !target) return { status: 'blocked', checks: [{ id: 'task', status: 'blocked', message: '候选或目标页面不存在。' }] };
  const draftSourceIssue=draftExecutionIssue(staged.executionRecord,staged.newHtml);
  if(draftSourceIssue)return {status:'blocked',checks:[{id:'task',status:'blocked',message:draftSourceIssue}]};
  if(state.stagedRepairStatus)return {status:'blocked',checks:[{id:'task',status:'blocked',message:'候选正在受控修复与复验，暂不能采纳。'}]};
  const checks: StagedDeliveryReport['checks'] = [];
  const referenceIssue=libraryReferenceIssue(state);
  if(referenceIssue)return {status:'blocked',checks:[{id:'task',status:'blocked',message:referenceIssue}]};
  const taskCurrent = isStagedTaskCurrent(state);
  const taskPlan=resolveWorkflowValidation(staged.workflowContract,'candidate');
  checks.push({ id: 'task', status: taskCurrent ? 'passed' : 'blocked', message: !taskPlan.ok?taskPlan.message:taskCurrent ? '任务基线与项目上下文仍有效。' : '原页面、设计来源、设备、Token 或项目资料已变化。' });
  const options = { deviceProfile: state.settings.deviceProfile, useCustomNavigation: state.settings.useCustomNavigation, designSystem: state.designSystem };
  const safety = checkGenerationSourceSafety(staged.newHtml, options);
  checks.push({ id: 'source', status: safety.passed ? 'passed' : 'blocked', message: safety.passed ? 'HTML 源安全检查通过。' : safety.findings.find(item => item.severity === 'error')?.message ?? 'HTML 源不安全。' });
  const quality = checkGenerationQuality(staged.newHtml, { ...options, baselineHtml: target.htmlContent,
    protectedNids: state.getProtectedNids(staged.targetScreenId), modificationRequest: staged.modificationRequest,formRuleRoots:formRuleScope(staged.workflowContract) });
  checks.push({ id: 'quality', status: quality.passed ? 'passed' : 'blocked', message: quality.passed ? '结构、文案与样式规则检查通过。' : quality.findings.find(item => item.severity === 'error')?.message ?? '静态质量检查未通过。' });
  if(taskPlan.ok&&taskPlan.plan.stages.includes('structure')&&staged.workflowContract){
    const structure=inspectWorkflowStructure(staged.workflowContract,target.htmlContent,staged.newHtml,options);
    checks.push({id:'structure',status:structure.passed?'passed':'blocked',message:structure.message});
  }
  const entities=inspectDesignEntities(staged.newHtml,{components:state.components,pageIds:Object.keys(state.screens),baselineHtml:target.htmlContent});
  checks.push({id:'entities',status:entities.passed?'passed':'blocked',message:designEntitySummary(entities)});
  const assetIssues = candidateBrokenAssetReferences(state);
  checks.push({ id: 'assets', status: assetIssues.length ? 'blocked' : 'passed', message: assetIssues[0]?.message ?? '候选本地资源引用均已登记。' });
  const usedAssetFiles = stagedReferencedAssetFiles(state);
  const fileAudit = state.stagedAssetFiles?.key === state.getStagedRenderContextKey() ? state.stagedAssetFiles : null;
  checks.push({ id: 'asset_files', status: fileAudit?.status==='blocked'?'blocked':!usedAssetFiles.length ? 'passed' : fileAudit?.status ?? 'pending',
    message: fileAudit?.status==='blocked'?fileAudit.issues[0]?.message??'资源文件读取未通过。':!usedAssetFiles.length ? '图片/图标登记检查通过；实际页面资源在交付前重新读取。' : !fileAudit ? '正在核对候选引用的全部资源文件。'
      : fileAudit.issues[0]?.message ?? '候选引用的全部资源文件已核对存在。' });
  const rendered = state.stagedRenderQuality;
  const currentReport = rendered?.key === state.getStagedRenderContextKey() ? rendered.report : null;
  checks.push({ id: 'render', status: !currentReport || currentReport.status === 'pending' ? 'pending'
    : currentReport.status !== 'complete' || currentReport.findings.some(item => item.severity === 'error') ? 'blocked' : 'passed',
  message: !currentReport || currentReport.status === 'pending' ? '当前候选的 iframe 渲染检查尚未完成。'
    : currentReport.status !== 'complete' ? currentReport.reason ?? '当前候选的 iframe 渲染检查无法完成。'
    : currentReport.findings.find(item => item.severity === 'error')?.message ?? '当前候选的 iframe 渲染检查通过。' });
  const proof=(id:StagedDeliveryReport['checks'][number]['id'])=>checks.find(check=>check.id===id);
  const workflow=taskPlan.ok?evaluateWorkflowValidation(taskPlan.plan,{'source-safety':proof('source'),quality:proof('quality'),structure:proof('structure'),
    'asset-references':proof('assets'),'asset-files':proof('asset_files'),render:proof('render'),'design-entities':proof('entities')}):undefined;
  const unimplemented=workflow?.checks.find(check=>check.status==='blocked'&&!['source-safety','quality','structure','asset-references','asset-files','render','design-entities'].includes(check.id));
  if(unimplemented&&checks[0].status==='passed'){checks[0].status='blocked';checks[0].message=unimplemented.message;}
  return { status: checks.some(item => item.status === 'blocked')||workflow?.status==='blocked' ? 'blocked' : checks.some(item => item.status === 'pending')||workflow?.status==='pending' ? 'pending' : 'ready', checks,workflow };
}

function canAdoptStagedScreen(state: ProjectState): boolean {
  return stagedDeliveryReport(state).status === 'ready';
}

/** Explicit guard override still requires a current, complete render report with no visual errors. */
function canForceAdoptStagedScreen(state: ProjectState): boolean {
  const workflow=stagedDeliveryReport(state).workflow;
  if(!workflow||workflow.checks.some(check=>!['quality','structure'].includes(check.id)&&check.status!=='passed'))return false;
  const staged = state.stagedScreen;
  if (!staged || !state.screens[staged.targetScreenId] || !isStagedTaskCurrent(state) || candidateBrokenAssetReferences(state).length > 0) return false;
  const usedAssetFiles = stagedReferencedAssetFiles(state);
  if (state.stagedAssetFiles?.key===state.getStagedRenderContextKey()&&state.stagedAssetFiles.status==='blocked')return false;
  if (usedAssetFiles.length && (state.stagedAssetFiles?.key !== state.getStagedRenderContextKey() || state.stagedAssetFiles.status !== 'passed')) return false;
  if (!checkGenerationSourceSafety(staged.newHtml, {
    deviceProfile: state.settings.deviceProfile,
    useCustomNavigation: state.settings.useCustomNavigation,
    designSystem: state.designSystem
  }).passed) return false;
  const rendered = state.stagedRenderQuality;
  return Boolean(rendered && rendered.key === state.getStagedRenderContextKey()
    && rendered.report.status === 'complete'
    && !rendered.report.findings.some(f => f.severity === 'error'));
}

const projectWrites=new Map<string,Promise<void>>();
const projectWriteKey=(id:string,folderPath?:string)=>JSON.stringify([id,folderPath]);

export const useProjectStore = create<ProjectState>((set, get) => ({
  id: 'proj_default',
  name: 'MyDesignStudio',
  createdAt: Date.now(),
  settings: {
    deviceProfile: 'pc',
    frameWidth: 1440,
    viewportGuideHeight: 900,
    referenceDevice: defaultReferenceDevice('pc'),
    showViewportGuide: true,
    colorMode: 'light',
    lodBudget: 12,
    useCustomNavigation: false
  },
  designSystem: neutralModernTheme,
  designSystemOrigin: designSystemOriginFor(neutralModernTheme, { kind: 'project', sourceId: neutralModernTheme.id, sourceName: neutralModernTheme.name, updatedAt: Date.now() }),
  designLibraryBinding: undefined,

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
  stagedCandidateSaveStatus: null,
  stagedRepairStatus: null, stagedRepairError: null, stagedAdoptionStatus: null,
  stagedAdoptionError: null,
  stagedAdoptionAttempt: 0,
  deliveryArchiveRevision: 0,
  deliveryArchiveNotice: null,
  stagedRenderQuality: null,
  stagedAssetFiles: null,
  stagedProjectAssetAudit: null,
  stagedValidationEvidence: null,
  stagedPreview: null,
  stagedAssetAuditRevision: 0,
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
      settings: { ...state.settings, deviceProfile: profile, frameWidth, viewportGuideHeight, referenceDevice: defaultReferenceDevice(profile) }
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

  setReferenceDevice: (presetId) => {
    const previous = get().settings;
    const preset = REFERENCE_DEVICES.find(device => device.id === presetId && device.deviceProfile === previous.deviceProfile);
    if (!preset) return;
    const next = { ...previous, referenceDevice: { ...preset } };
    next.viewportGuideHeight = resolveProjectViewport(next).height;
    if (JSON.stringify(previous.referenceDevice) === JSON.stringify(next.referenceDevice) && previous.viewportGuideHeight === next.viewportGuideHeight) return;
    useHistoryStore.getState().commit('更改参考设备', [{ op: 'replace', path: ['settings'], value: next }], [{ op: 'replace', path: ['settings'], value: previous }]);
    set({ settings: next, selectedNid: null, selectedNode: null, hoveredNid: null });
    get().saveProject();
  },

  setUseCustomNavigation: (enabled) => {
    const previous = get().settings;
    if (previous.deviceProfile !== 'mobile' || !!previous.useCustomNavigation === enabled) return;
    const next = { ...previous, useCustomNavigation: enabled };
    useHistoryStore.getState().commit('切换自定义导航栏', [{ op: 'replace', path: ['settings'], value: next }], [{ op: 'replace', path: ['settings'], value: previous }]);
    set({ settings: next, selectedNid: null, selectedNode: null, hoveredNid: null });
    get().saveProject();
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

  applyExtractedStyle: (ds,syncScreenIds,expectedKey) => {
    const state=get();assertLibraryEditable(state);
    if(styleApplicationKey(state)!==expectedKey)throw new Error('页面或主题已变化，请重新分析并预览。');
    const updates=backgroundScreenUpdates(state,ds,syncScreenIds);
    const origin=designSystemOriginFor(ds,{kind:'project_override',sourceId:ds.id,sourceName:ds.name,updatedAt:Date.now()},state.designSystemOrigin);
    const forward:Patch[]=[{op:'replace',path:['designSystem'],value:ds},{op:'replace',path:['designSystemOrigin'],value:origin}];
    const inverse:Patch[]=[{op:'replace',path:['designSystem'],value:state.designSystem},{op:'replace',path:['designSystemOrigin'],value:state.designSystemOrigin}];
    for(const [id,screen] of Object.entries(updates)){forward.push({op:'replace',path:['screens',id],value:screen});inverse.push({op:'replace',path:['screens',id],value:state.screens[id]});}
    useHistoryStore.getState().commit('从页面提取并应用选定风格',forward,inverse);
    set({designSystem:ds,designSystemOrigin:origin,screens:{...state.screens,...updates}});get().saveProject();
  },

  setDesignSystem: (ds) => {
    assertLibraryEditable(get());
    const prevDs = get().designSystem;
    const prevOrigin = designSystemOriginFor(prevDs, get().designSystemOrigin ?? { kind: 'project', sourceId: prevDs.id, sourceName: prevDs.name, updatedAt: Date.now() });
    const nextOrigin = designSystemOriginFor(ds, { kind: 'project_override', sourceId: ds.id, sourceName: ds.name, updatedAt: Date.now() }, prevOrigin);
    useHistoryStore.getState().commit(
      `切换主题为 ${ds.name}`,
      [{ op: 'replace', path: ['designSystem'], value: ds }, { op: 'replace', path: ['designSystemOrigin'], value: nextOrigin }],
      [{ op: 'replace', path: ['designSystem'], value: prevDs }, { op: 'replace', path: ['designSystemOrigin'], value: prevOrigin }]
    );
    set({ designSystem: ds, designSystemOrigin: nextOrigin });
    get().saveProject();
  },

  applyDesignLibraryCopy: (copy) => {
    const state = get();
    assertDesignLibraryCopyCompatible(copy,state);
    // A project copy is independent: definitions removed upstream stay available to existing pages.
    const components = { ...state.components, ...structuredClone(copy.components) };
    const assets = { ...state.assets, ...structuredClone(copy.assets) };
    const origin = designSystemOriginFor(copy.designSystem, {
      kind: 'project', sourceId: copy.binding.sourceProjectId, sourceName: copy.binding.sourceName,
      sourceFingerprint: copy.binding.sourceFingerprint, tokenVersion: copy.binding.sourceTokenVersion, updatedAt: Date.now()
    });
    const nextBinding = structuredClone(copy.binding);
    if(nextBinding.mode==='pinned_reference'){
      const issue=libraryReferenceIssue(state);
      if(issue)throw new Error(issue+' 请先转为项目副本以恢复编辑。');
      nextBinding.referenceSnapshot=buildLibraryReferenceSnapshot(copy.designSystem,copy.components,copy.assets,
        isLibraryReference(state)?state.designLibraryBinding?.referenceSnapshot:undefined,copy.assetFiles);
    }else delete nextBinding.referenceSnapshot;
    const nextSystem = structuredClone(copy.designSystem);
    const componentForward = Object.entries(copy.components).map(([id, component]) => ({
      op: (state.components[id] ? 'replace' : 'add') as 'replace' | 'add', path: ['components', id], value: component
    }));
    const componentBackward = Object.entries(copy.components).map(([id]) => state.components[id]
      ? { op: 'replace' as const, path: ['components', id], value: state.components[id] }
      : { op: 'remove' as const, path: ['components', id] });
    const assetForward = Object.entries(copy.assets).map(([id, asset]) => ({
      op: (state.assets[id] ? 'replace' : 'add') as 'replace' | 'add', path: ['assets', id], value: asset
    }));
    const assetBackward = Object.entries(copy.assets).map(([id]) => state.assets[id]
      ? { op: 'replace' as const, path: ['assets', id], value: state.assets[id] }
      : { op: 'remove' as const, path: ['assets', id] });
    useHistoryStore.getState().commit(`导入设计库${nextBinding.mode==='pinned_reference'?'只读参考':'项目副本'}: ${nextBinding.sourceName}`,
      [{ op: 'replace', path: ['designSystem'], value: nextSystem }, { op: 'replace', path: ['designSystemOrigin'], value: origin },
        { op: 'replace', path: ['designLibraryBinding'], value: nextBinding }, ...componentForward, ...assetForward],
      [{ op: 'replace', path: ['designSystem'], value: state.designSystem }, { op: 'replace', path: ['designSystemOrigin'], value: state.designSystemOrigin },
        { op: 'replace', path: ['designLibraryBinding'], value: state.designLibraryBinding }, ...componentBackward, ...assetBackward]);
    set({ designSystem: nextSystem, designSystemOrigin: origin, designLibraryBinding: nextBinding, components, assets });
    get().saveProject();
  },

  detachDesignLibraryReference: () => {
    const state=get(),previous=state.designLibraryBinding;
    if(!previous||previous.mode!=='pinned_reference')return;
    const {referenceSnapshot:_snapshot,...identity}=previous;
    const next:DesignLibraryBinding={...identity,mode:'project_copy'};
    useHistoryStore.getState().commit('将只读设计库参考转为项目副本',
      [{op:'replace',path:['designLibraryBinding'],value:next}],
      [{op:'replace',path:['designLibraryBinding'],value:previous}]);
    set({designLibraryBinding:next});get().saveProject();
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

    const componentTargets: RestyleTarget[] = Object.values(components).filter(c=>!libraryMemberLocked(get(),'components',c.id)).map((c) => ({
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
        imported:!!sc.metadata?.importedHtml,
        protectedNids: get().getProtectedNids(sc.id)
      }));

    return planRestyle(componentTargets, screenTargets);
  },

  applyRestyleOutcome: async (outcome, signal, isCurrent) => {
    const state = get(), key = restyleContextKey(state);
    const frozenOutcome = structuredClone(outcome), storage = createProjectStorage(state.id,state.folderPath);
    const current = () => !signal?.aborted && (!isCurrent||isCurrent()) && !taskRuleSafetyIssue(frozenOutcome.workflowContract) &&
      !draftExecutionIssue(frozenOutcome.executionRecord,frozenOutcome.html) && restyleContextKey(get()) === key;
    const frozen = structuredClone({id:state.id,folderPath:state.folderPath,settings:state.settings,
      screens:state.screens,overrides:state.overrides,assets:state.assets,designSystem:state.designSystem,components:state.components,
      decisions:state.decisions,projectDocuments:state.projectDocuments,designLibraryBinding:state.designLibraryBinding,designSystemOrigin:state.designSystemOrigin});
    const plan = await prepareCheckedRestyle(frozen,frozenOutcome,storage,{contextKey:key,isCurrent:current,signal});
    if (plan.validation.status !== 'passed' || !current()) {
      const message = plan.validation.message ?? '工程已变化或重塑已取消，未应用。';
      return {applied:false,validation:{...plan.validation,status:'blocked',message},message};
    }
    const repository = new RestyleDeliveryRepository(storage,state.id);
    let record:RestyleDeliveryRecord | undefined, prepared = false;
    try {
      record = buildRestyleDelivery(frozen,frozenOutcome,plan);
      await captureRestylePreviews(record,storage,current);
      if (!current()) throw new Error('保存重塑档案前工程已变化或执行已取消。');
      await repository.prepare(record);prepared = true;
      const resourceScreens=[...plan.screens,...(plan.component?[{id:`template-${plan.component.id}`,name:plan.component.name,htmlContent:plan.component.templateHtml,position:{x:0,y:0}}]:[])];
      const resources=await readProjectRenderResources(storage,resourceScreens,Object.values(frozen.assets),frozen.overrides);
      const issues = [...await verifyProjectAssetFiles(storage,plan.referencedAssets),...resources.issues,...await verifyLibraryReferenceFiles(storage,frozen)];
      if (!current()) throw new Error('保存重塑档案期间工程已变化或执行已取消。');
      if (issues.length) {plan.validation.assetIssues.push(...issues);throw new Error(issues[0].message);}
      const resourceIssue=renderResourceIssue(mergeRenderResourceFiles(plan.validation.pages.map(p=>p.render?.resourceFiles??[])),resources.resourceFiles);
      if(resourceIssue)throw Error(resourceIssue);
    } catch (error) {
      const message = error instanceof Error ? error.message : '重塑档案保存失败，原页面未修改。';
      if (record && prepared) await repository.finish(record,'aborted',message).catch(()=>{});
      if (record && !prepared) await removeUnarchivedRestylePreviews(record,storage);
      if (get().id === state.id && get().folderPath === state.folderPath) set({deliveryArchiveRevision:get().deliveryArchiveRevision+1});
      return {applied:false,message,validation:{...plan.validation,status:'blocked',message}};
    }
    const patches: Patch[] = [], inverse: Patch[] = [];
    const screens = {...get().screens}, components = {...get().components};
    for (const screen of plan.screens) {
      // View-only canvas position/measurement may change during validation. Preserve those current fields.
      const before = screens[screen.id], after = {...before,htmlContent:screen.htmlContent,metadata:screen.metadata};
      patches.push({op:'replace',path:['screens',screen.id],value:after});
      inverse.push({op:'replace',path:['screens',screen.id],value:before});screens[screen.id] = after;
    }
    if (plan.component) {
      patches.push({op:'replace',path:['components',plan.component.id],value:plan.component});
      inverse.push({op:'replace',path:['components',plan.component.id],value:components[plan.component.id]});components[plan.component.id] = plan.component;
    }
    for (const screen of plan.screens) {
      const before = get().screens[screen.id];
      useHistoryStore.getState().addCheckpoint(`风格重塑前备份: ${before.name}`,{screenId:before.id,htmlContent:before.htmlContent,scopedCss:before.scopedCss});
    }
    useHistoryStore.getState().commit(`风格重塑（已核验）: ${frozenOutcome.target.name}`,patches,inverse);
    set({screens,components});get().saveProject();
    const appliedContextKey = restyleContextKey(get());
    const delivery:RestyleDeliveryReceipt = {id:record.id,status:'applied'};
    try {await repository.finish(record,'applied');}
    catch {
      delivery.status = 'prepared';delivery.message = '重塑已应用，档案状态写入失败；准备记录已保留，可在重塑历史中查看。';
      if (get().id === state.id && get().folderPath === state.folderPath) set({deliveryArchiveNotice:delivery.message});
    }
    if (get().id === state.id && get().folderPath === state.folderPath) set({deliveryArchiveRevision:get().deliveryArchiveRevision+1});
    return {applied:true,validation:plan.validation,delivery,appliedContextKey};
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

  importHtmlScreen: async (screen, setup, application) => {
    if (!application) throw new Error('缺少当前导入预览的确认和任务合同。');
    const state=get(),projectId=state.id,context=pageCreationContext(state);
    if(setup.designSystem)assertLibraryEditable(state);
    if(setup.projectId!==projectId)throw new Error('工程已切换，请重新导入。');
    if(pendingImports.has(projectId))throw new Error('已有导入正在核验，请等待完成。');
    const input=structuredClone({screen,setup,contract:application.contract,preview:application.preview,resources:application.resources});
    const signal=application.signal,isCurrent=application.isCurrent;
    const current=()=>!signal?.aborted&&(isCurrent?.()??true)&&pageCreationContext(get())===context;
    const requireCurrent=()=>{if(!current())throw new Error('导入选项或工程已变化，或操作已取消，请重新确认预览。');};
    pendingImports.add(projectId);
    try{
      requireCurrent();
      if(!input.screen.metadata?.importedHtml||!input.screen.htmlContent.trim())throw new Error('缺少有效 HTML 导入结果');
      const missing=input.resources?.resources.find(resource=>resource.status==='missing');
      if(missing)throw new Error(`导入资源缺失：${missing.url}，请补充资源后重新预览。`);
      if((input.setup.designSystem||input.setup.colorMode)&&Object.values(state.screens).some(sc=>sc.metadata?.kind!=='specimen')){
        if(!input.setup.themeUpdate||input.setup.themeUpdate.expectedKey!==styleApplicationKey(state))throw new Error('已有页面的工程需明确确认主题更新并重新核对预览。');
        if(input.setup.colorMode&&input.setup.colorMode!==state.settings.colorMode)throw new Error('提取风格不切换已有工程明暗模式。');
      }
      const snapshot=structuredClone({id:state.id,folderPath:state.folderPath,screens:state.screens,settings:{...state.settings,
        ...(input.setup.colorMode?{colorMode:input.setup.colorMode}:{}),...(input.setup.useCustomNavigation!==undefined?{useCustomNavigation:input.setup.useCustomNavigation}:{})},
        assets:state.assets,designSystem:input.setup.designSystem??state.designSystem,designSystemOrigin:state.designSystemOrigin,
        designLibraryBinding:state.designLibraryBinding,components:state.components,decisions:state.decisions,projectDocuments:state.projectDocuments,overrides:state.overrides});
      for(const asset of input.setup.assets??[]){
        if(snapshot.assets[asset.id]&&snapshot.assets[asset.id].relPath!==asset.relPath)throw new Error('导入资源标识与已有文件冲突。');
        snapshot.assets[asset.id]??=asset;
      }
      const storage=createProjectStorage(projectId,state.folderPath),memory=Object.create(storage) as typeof storage;
      const binaries=new Map((input.resources?.binaries??[]).map(binary=>[binary.relPath,binary.base64]));
      memory.readBinary=async path=>binaries.get(path)??storage.readBinary(path);
      memory.exists=async path=>binaries.has(path)||await storage.exists(path);
      const prepared=await prepareNewPage(snapshot,{...input.screen,id:crypto.randomUUID(),position:{x:0,y:0}},input.contract,memory,
        {isCurrent:current,signal,purpose:'import',preview:input.preview});
      if(prepared.status!=='ready')throw new Error(prepared.message);
      requireCurrent();
      if(input.resources)await persistImportResources(input.resources,storage);
      requireCurrent();
      for(const [path,base64] of binaries){
        if(await storage.readBinary(path)!==base64)throw new Error(`导入资源内容与核验预览不一致：${path}`);
        requireCurrent();
      }
      for(const file of prepared.evidence.files){
        if(!await storage.exists(file.relPath))throw new Error(`导入资源文件不存在：${file.relPath}`);
        requireCurrent();
      }
      const importedResources=await readProjectRenderResources(storage,[prepared.screen],Object.values(snapshot.assets));requireCurrent();
      if(importedResources.issues.length)throw Error(importedResources.issues[0].message);
      const resourceIssue=renderResourceIssue(prepared.evidence.render.resourceFiles,importedResources.resourceFiles);
      if(resourceIssue)throw Error(resourceIssue);
      const {id,position:_position,...checked}=prepared.screen;
      return get().addScreen({...checked,metadata:{...checked.metadata,creationEvidence:prepared.evidence}},id,{autoPan:true,importSetup:input.setup});
    }finally{pendingImports.delete(projectId);}
  },

  applyMultiPageCreation: (batch) => {
    const state=get(),pages=consumeMultiPageBatch(batch,state),screens={...state.screens},order=[...state.screenOrder];
    for(const page of pages){
      const layout=calculateNewScreenPosition(screens,order,{frameWidth:state.settings.frameWidth,viewportGuideHeight:state.settings.viewportGuideHeight,anchorScreenId:order.at(-1),...(page.metadata?.multiPageDelivery?.kind==='variants'&&order.at(-1)?{referencedScreenId:order.at(-1)}:{})});
      for(const shift of layout.shiftedScreens)if(screens[shift.id])screens[shift.id]={...screens[shift.id],position:{...screens[shift.id].position,x:shift.newX}};
      screens[page.id]={...page,position:layout.position};order.push(page.id);
    }
    const forward:Patch[]=pages.map(page=>({op:'add',path:['screens',page.id],value:screens[page.id]}));
    const inverse:Patch[]=pages.map(page=>({op:'remove',path:['screens',page.id]}));
    for(const [id,screen] of Object.entries(state.screens))if(screens[id]!==screen){
      forward.push({op:'replace',path:['screens',id,'position'],value:screens[id].position});
      inverse.push({op:'replace',path:['screens',id,'position'],value:screen.position});
    }
    forward.push({op:'replace',path:['screenOrder'],value:order});inverse.push({op:'replace',path:['screenOrder'],value:state.screenOrder});
    useHistoryStore.getState().commit(`新增确认计划中的${pages.length}个页面`,forward,inverse);
    set({screens,screenOrder:order,activeScreenId:pages[0]?.id??state.activeScreenId});get().saveProject();
    if(pages[0])get().panToScreen(pages[0].id);return pages.map(p=>p.id);
  },

  addScreen: (screenData, customId, options) => {
    const setup = options?.importSetup;
    if (setup) {
      if(setup.designSystem)assertLibraryEditable(get());
      if (setup.projectId !== get().id) throw new Error('工程已切换，请重新导入');
      if ((setup.designSystem || setup.colorMode) && Object.values(get().screens).some(sc => sc.metadata?.kind !== 'specimen')) {
        if(!setup.themeUpdate||setup.themeUpdate.expectedKey!==styleApplicationKey(get()))throw new Error('已有页面的工程需明确确认主题更新并重新核对预览。');
        if(setup.colorMode&&setup.colorMode!==get().settings.colorMode)throw new Error('提取风格不切换已有工程明暗模式。');
      }
    }
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

    const initialStyleAsset = screenData.scopedCss
      ? nextScopedStyleAsset(id, screenData.scopedCss, setup ? 'imported' : 'generated')
      : undefined;
    const screen: Screen = normalizeScreenNavigation({ ...screenData, id, entry: `screens/${id}.html`, position, htmlContent,
      ...(initialStyleAsset ? { metadata: { ...screenData.metadata, scopedStyleAsset: initialStyleAsset } } : {})
    }, { ...get().settings, useCustomNavigation: setup?.useCustomNavigation ?? get().settings.useCustomNavigation });
    const prevScreens = get().screens;
    const prevOrder = [...get().screenOrder];
    const backgroundUpdates=setup?.designSystem&&setup.themeUpdate?backgroundScreenUpdates(get(),setup.designSystem,setup.themeUpdate.syncScreenIds):{};

    // 历史变更记录：新画框添加 + 序位 + 避让画框的位移 (BR-HIS-09)
    const forwardOps: Array<{ op: 'add' | 'replace'; path: string[]; value: any }> = [
      { op: 'add', path: ['screens', id], value: screen },
      { op: 'replace', path: ['screenOrder'], value: [...prevOrder, id] }
    ];
    const backwardOps: Array<{ op: 'remove' | 'replace'; path: string[]; value?: any }> = [
      { op: 'remove', path: ['screens', id] },
      { op: 'replace', path: ['screenOrder'], value: prevOrder }
    ];

    const copiedOverrides: Record<string, StyleOverride> = {};
    for (const override of options?.initialOverrides ?? []) {
      const key = `${id}:${override.nid}`;
      if (key in get().overrides || key in copiedOverrides) throw new Error('复制画框的手动样式 ID 冲突。');
      copiedOverrides[key] = structuredClone(override);
      forwardOps.push({ op: 'add', path: ['overrides', key], value: copiedOverrides[key] });
      backwardOps.push({ op: 'remove', path: ['overrides', key] });
    }

    if (setup?.designSystem) {
      for(const [screenId,updated] of Object.entries(backgroundUpdates)){
        forwardOps.push({op:'replace',path:['screens',screenId],value:updated});
        backwardOps.push({op:'replace',path:['screens',screenId],value:prevScreens[screenId]});
      }
      forwardOps.push({ op: 'replace', path: ['designSystem'], value: setup.designSystem });
      backwardOps.push({ op: 'replace', path: ['designSystem'], value: get().designSystem });
      const origin = designSystemOriginFor(setup.designSystem, setup.designSystemOrigin ?? {
        kind: 'html_import' as const, sourceId: screenData.metadata?.importedHtml?.workflow?.sourceFingerprint,
        sourceName: screenData.metadata?.importedHtml?.fileName, sourceFingerprint: screenData.metadata?.importedHtml?.workflow?.sourceFingerprint,
        updatedAt: Date.now()
      });
      forwardOps.push({ op: 'replace', path: ['designSystemOrigin'], value: origin });
      backwardOps.push({ op: 'replace', path: ['designSystemOrigin'], value: get().designSystemOrigin });
    }
    const importSettings = { ...get().settings, ...(setup?.colorMode ? { colorMode: setup.colorMode } : {}), ...(setup?.useCustomNavigation !== undefined ? { useCustomNavigation: setup.useCustomNavigation } : {}) };
    if (setup?.colorMode || setup?.useCustomNavigation !== undefined) {
      forwardOps.push({ op: 'replace', path: ['settings'], value: importSettings });
      backwardOps.push({ op: 'replace', path: ['settings'], value: get().settings });
    }
    const importedAssets = { ...get().assets };
    for (const asset of setup?.assets ?? []) {
      if (importedAssets[asset.id]) continue;
      forwardOps.push({ op: 'add', path: ['assets', asset.id], value: asset });
      backwardOps.push({ op: 'remove', path: ['assets', asset.id] });
      importedAssets[asset.id] = asset;
    }

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
      `${setup ? '导入 HTML' : '新建画框'}: ${screen.name}`,
      forwardOps as any,
      backwardOps as any
    );

    set((state) => {
      const nextScreens = { ...state.screens, [id]: screen };
      for(const [screenId,updated] of Object.entries(backgroundUpdates))if(nextScreens[screenId])nextScreens[screenId]={...nextScreens[screenId],metadata:updated.metadata};
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
        activeScreenId: id,
        ...(options?.initialOverrides ? { overrides: { ...state.overrides, ...copiedOverrides } } : {}),
        ...(setup ? { assets: importedAssets } : {}),
        ...(setup?.designSystem ? { designSystem: setup.designSystem } : {}),
        ...(setup?.designSystem ? { designSystemOrigin: designSystemOriginFor(setup.designSystem, setup.designSystemOrigin ?? {
          kind: 'html_import' as const, sourceId: screenData.metadata?.importedHtml?.workflow?.sourceFingerprint,
          sourceName: screenData.metadata?.importedHtml?.fileName, sourceFingerprint: screenData.metadata?.importedHtml?.workflow?.sourceFingerprint,
          updatedAt: Date.now()
        }) } : {}),
        ...(setup?.colorMode || setup?.useCustomNavigation !== undefined ? { settings: importSettings } : {})
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
    const cssChanged = updates.scopedCss !== undefined && updates.scopedCss !== prevScreen.scopedCss;
    const merged = {
      ...prevScreen,
      ...updates,
      ...(cssChanged ? { metadata: {
        ...prevScreen.metadata,
        scopedStyleAsset: nextScopedStyleAsset(id, updates.scopedCss ?? '', 'edited', prevScreen.metadata?.scopedStyleAsset, prevScreen.scopedCss)
      } } : {})
    };
    const updated = updates.htmlContent === undefined ? merged : normalizeScreenNavigation(merged, get().settings);

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

  setScreenLinkTarget: (screenId, nid, targetScreenId) => {
    const screen = get().screens[screenId];
    if (!screen || !nid || targetScreenId && !get().screens[targetScreenId]) return false;
    const parsed = parseHtmlCopy(screen.htmlContent);
    const element = Array.from(parsed.doc.querySelectorAll('[data-nid]')).find(node => node.getAttribute('data-nid') === nid);
    if (!element) return false;
    if (targetScreenId) element.setAttribute('data-target-screen-id', targetScreenId);
    else element.removeAttribute('data-target-screen-id');
    get().updateScreenHtml(screenId, parsed.serialize(), targetScreenId ? '设置页面跳转' : '清除页面跳转');
    return true;
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

  setScreenDesignRole: (id, patch) => {
    const screen = get().screens[id];
    if (!screen || screen.metadata?.kind === 'specimen') return;
    const allowed = ['pageGroup', 'stateLabel', 'audienceRole'] as const;
    const next = { ...screen.metadata };
    let changed = false;
    for (const field of allowed) {
      if (!(field in patch)) continue;
      const value = (patch[field] ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);
      if ((next[field] ?? '') === value) continue;
      if (value) next[field] = value;
      else delete next[field];
      changed = true;
    }
    if (changed) get().updateScreen(id, { metadata: next }, '更新页面分组与静态设计角色');
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
    const live = findScreenElement(screenId, nid);
    if (live) {
      const t = inspectText(live);
      const parents: {nid:string;tagName:string;className?:string}[] = [];
      for (let p=live.parentElement;p;p=p.parentElement) { const id=p.getAttribute('data-nid'); if(id) parents.unshift({nid:id,tagName:p.tagName.toLowerCase(),className:p.getAttribute('class') || ''}); }
      get().selectNode({screenId,nid,tagName:live.tagName.toLowerCase(),textContent:t.text,textEditable:t.editable,textReason:t.reason,classNames:Array.from(live.classList).filter(c=>!c.startsWith('aidesign-')),parentChain:parents,...collectNodePresentation(live)});
      return;
    }

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

    const mergedDeclarations = mergeInspectorDeclarations(prevOverride?.declarations ?? {}, declarations);
    const escapedKeys = new Set(prevOverride?.escapedProperties ?? (prevOverride?.escaped ? Object.keys(prevOverride.declarations) : []));
    for (const [prop, val] of Object.entries(declarations)) {
      escapedKeys.delete(prop);
      if (escaped && val && (isEscapedInspectorValue(prop, val) || !/color|radius|shadow/.test(prop) && !val.includes('var('))) escapedKeys.add(prop);
    }
    for (const prop of escapedKeys) if (!mergedDeclarations[prop]) escapedKeys.delete(prop);
    const hasDeclarations = Object.keys(mergedDeclarations).length > 0;
    const newOverride: StyleOverride = {
      nid, declarations: mergedDeclarations,
      escaped: escapedKeys.size > 0,
      escapedProperties: Array.from(escapedKeys)
    };
    if (JSON.stringify(prevOverride?.declarations ?? {}) === JSON.stringify(mergedDeclarations)
      && !!prevOverride?.escaped === newOverride.escaped) return;

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
      version: 1,
      origin: { kind: 'manual' },
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
      const parsed = parseHtmlCopy(content);
      const doc = parsed.doc;
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
      const componentVersion = 1;

      // Create template copy
      const templateClone = el.cloneNode(true) as HTMLElement;
      templateClone.removeAttribute('data-component-instance');
      templateClone.setAttribute('data-component-id', compId);
      templateClone.setAttribute('data-component-version', String(componentVersion));
      const templateHtml = templateClone.outerHTML;

      // Tag element in screen
      el.setAttribute('data-component-id', compId);
      el.setAttribute('data-component-instance', instId);
      el.setAttribute('data-component-version', String(componentVersion));

      const updatedHtml = parsed.serialize();

      const comp: ComponentDefinition = {
        id: compId,
        name,
        templateHtml,
        version: componentVersion,
        origin: { kind: 'extracted', sourceScreenId: screenId, sourceNid: nid },
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      const updatedScreen = normalizeScreenNavigation({ ...screen, htmlContent: updatedHtml }, get().settings);
      useHistoryStore.getState().commit(
        `提取为组件: ${name}`,
        [
          { op: 'replace', path: ['screens', screenId], value: updatedScreen },
          { op: 'add', path: ['components', compId], value: comp }
        ],
        [
          { op: 'replace', path: ['screens', screenId], value: screen },
          { op: 'remove', path: ['components', compId] }
        ]
      );
      set((state) => ({
        screens: { ...state.screens, [screenId]: updatedScreen },
        components: { ...state.components, [compId]: comp }
      }));
      get().saveProject();

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
    assertLibraryEditable(get(),'components',id);
    const prev = get().components[id];
    if (!prev) return;
    const templateChanged = (updates.templateHtml !== undefined && updates.templateHtml !== prev.templateHtml)||(Object.hasOwn(updates,'slotDefs')&&JSON.stringify(updates.slotDefs)!==JSON.stringify(prev.slotDefs))||
      (Object.hasOwn(updates,'templateContract')&&JSON.stringify(updates.templateContract)!==JSON.stringify(prev.templateContract));
    const nextComp = { ...prev, ...updates, version: (prev.version ?? 1) + (templateChanged ? 1 : 0), updatedAt: Date.now() };
    if(hasTemplateContract(nextComp))compileComponentTemplate(nextComp);
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
    assertLibraryEditable(get(),'components',id);
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

    if(hasTemplateContract(comp))compileComponentTemplate(comp);
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(`<body>${comp.templateHtml}</body>`, 'text/html');
      const el = doc.body.firstElementChild as HTMLElement;
      if (!el) return;

      const instId = `inst-${Math.random().toString(36).substring(2, 9)}`;
      el.setAttribute('data-component-id', componentId);
      el.setAttribute('data-component-instance', instId);
      el.setAttribute('data-component-version', String(comp.version ?? 1));

      const htmlWithNids = NidEngine.injectNids(el.outerHTML);

      const parsedScreen = parseHtmlCopy(screen.htmlContent);
      const screenDoc = parsedScreen.doc;
      const rootContainer = screenDoc.body.firstElementChild || screenDoc.body;
      const tmpDiv = screenDoc.createElement('div');
      tmpDiv.innerHTML = htmlWithNids;
      if (tmpDiv.firstElementChild) {
        rootContainer.appendChild(tmpDiv.firstElementChild);
      }

      get().updateScreenHtml(screenId, parsedScreen.serialize(), `插入组件实例: ${comp.name}`);
    } catch (e) {
      console.error('insertComponent error:', e);
    }
  },

  detachComponentInstance: (screenId, nid) => {
    const screen = get().screens[screenId];
    if (!screen) return;

    try {
      const parser = new DOMParser();
      const parsedScreen = parseHtmlCopy(screen.htmlContent);
      const doc = parsedScreen.doc;
      const el = doc.querySelector(`[data-nid="${nid}"]`);
      if (!el) return;

      const compRoot = el.closest('[data-component-id]') as HTMLElement;
      if (!compRoot) return;

      compRoot.removeAttribute('data-component-id');
      compRoot.removeAttribute('data-component-instance');
      compRoot.removeAttribute('data-component-version');

      get().updateScreenHtml(screenId, parsedScreen.serialize(), '从组件分离实例');

      const curSel = get().selectedNode;
      if (curSel && curSel.nid === nid) {
        get().selectNode({ ...curSel, componentId: undefined, componentInstanceId: undefined });
      }
    } catch (e) {
      console.error('detachComponentInstance error:', e);
    }
  },

  syncComponentInstances: (componentId, force = false) => {
    const state = get(), component = state.components[componentId];
    if (!component) return {syncedCount:0,skippedConflictCount:0,details:[]};
    const projection = projectComponentSync(component,Object.values(state.screens),state.overrides,force);
    for (const screen of projection.screens) get().updateScreenHtml(screen.id,screen.htmlContent,`同步组件实例: ${component.name}`);
    return {syncedCount:projection.syncedCount,skippedConflictCount:projection.skippedConflictCount,details:projection.details};
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
  replaceNodeImage: (screenId, nid, asset) => {
    const screen = get().screens[screenId];
    if (!screen || !/^assets\/images\/[\w.-]+$/.test(asset.relPath)) return false;
    const parsed = parseHtmlCopy(screen.htmlContent);
    const target = Array.from(parsed.doc.querySelectorAll('[data-nid]')).find(el => el.getAttribute('data-nid') === nid);
    if (!target || target.tagName.toLowerCase() !== 'img') return false;
    const oldAssetId = target.getAttribute('data-asset-id');
    const prevAssets = get().assets;
    const existing = Object.values(prevAssets).find(a => a.relPath === asset.relPath || a.id === asset.id);
    const effectiveAsset = existing ?? asset;
    target.setAttribute('src', effectiveAsset.relPath);
    target.setAttribute('data-asset-id', effectiveAsset.id);
    target.removeAttribute('srcset'); target.removeAttribute('sizes');
    if (target.parentElement?.tagName.toLowerCase() === 'picture') {
      target.parentElement.querySelectorAll('source').forEach(source => {source.removeAttribute('srcset'); source.removeAttribute('sizes');});
    }
    const nextScreen = {...screen, htmlContent:parsed.serialize()};
    const nextAssets = {...prevAssets};
    nextAssets[effectiveAsset.id] = {...effectiveAsset,refCount:Math.max(0,existing?.refCount ?? 0) + (oldAssetId === effectiveAsset.id ? 0 : 1)};
    if (oldAssetId && oldAssetId !== effectiveAsset.id && nextAssets[oldAssetId]) nextAssets[oldAssetId] = {...nextAssets[oldAssetId],refCount:Math.max(0,nextAssets[oldAssetId].refCount - 1)};
    const forward:Patch[]=[{op:'replace',path:['screens',screenId],value:nextScreen}];
    const backward:Patch[]=[{op:'replace',path:['screens',screenId],value:screen}];
    for (const id of new Set([effectiveAsset.id,...oldAssetId ? [oldAssetId] : []])) {
      if (!nextAssets[id]) continue;
      forward.push({op:prevAssets[id] ? 'replace':'add',path:['assets',id],value:nextAssets[id]});
      backward.push(prevAssets[id] ? {op:'replace',path:['assets',id],value:prevAssets[id]} : {op:'remove',path:['assets',id]});
    }
    useHistoryStore.getState().commit('替换图片',forward,backward);
    set({screens:{...get().screens,[screenId]:nextScreen},assets:nextAssets});
    get().saveProject();
    return true;
  },

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
    assertLibraryEditable(get(),'assets',id);
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
    const oldRelPath = get().assets[oldAssetId]?.relPath;
    let count = 0;
    const parser = new DOMParser();

    Object.values(screens).forEach((screen) => {
      const parsedScreen = parseHtmlCopy(screen.htmlContent);
      const doc = parsedScreen.doc;
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

      // Imported sources use stable relative asset URLs, including in CSS and templates.
      if (oldRelPath) {
        const replaceUrl = (url: string) => url === oldRelPath ? newAssetUrl : url.startsWith(oldRelPath + '#') ? newAssetUrl + url.slice(oldRelPath.length) : url;
        const visit = (root: ParentNode) => {
          for (const element of Array.from(root.querySelectorAll('*'))) {
            for (const attribute of ['src', 'href', 'xlink:href', 'poster', 'background']) {
              const value = element.getAttribute(attribute);
              if (value && replaceUrl(value) !== value) { element.setAttribute(attribute, replaceUrl(value)); changed = true; count++; }
            }
            for (const attribute of ['srcset', 'imagesrcset']) {
              const value = element.getAttribute(attribute);
              if (!value) continue;
              const candidates = imageSrcsetCandidates(value);
              if (candidates.some(item => replaceUrl(item.url) !== item.url)) {
                element.setAttribute(attribute, candidates.map(item => replaceUrl(item.url) + (item.descriptor ? ` ${item.descriptor}` : '')).join(', ')); changed = true; count++;
              }
            }
            const css = element.localName === 'style' ? element.textContent : element.getAttribute('style');
            if (css) {
              const nextCss = replaceCssResourceUrl(css, oldRelPath, newAssetUrl);
              if (nextCss !== css) {
                if (element.localName === 'style') element.textContent = nextCss; else element.setAttribute('style', nextCss);
                changed = true; count++;
              }
            }
            if (element.localName === 'template') visit((element as HTMLTemplateElement).content);
          }
        };
        visit(doc);
      }

      const nextScopedCss = oldRelPath && screen.scopedCss ? replaceCssResourceUrl(screen.scopedCss, oldRelPath, newAssetUrl) : screen.scopedCss;
      if (nextScopedCss !== screen.scopedCss) { changed = true; count++; }

      if (changed) {
        get().updateScreen(screen.id, { htmlContent: parsedScreen.serialize(), scopedCss: nextScopedCss }, `全局替换素材: ${oldAssetId}`);
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
      if(libraryMemberLocked(get(),'assets',id))return;
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
    const renderSubject = [staged.targetScreenId, staged.newHtml, staged.navigationTitle, staged.modificationRequest];
    return JSON.stringify([state.id, state.stagedRenderRevision, renderSubject, state.settings,renderEvidenceIdentity(state.settings.deviceProfile),
      isTaskContractShape(staged.workflowContract)?taskInputBinding(staged.workflowContract):staged.workflowContract===undefined?'legacy':'invalid-task',
      state.designSystem.tokens, state.overrides, target?.htmlContent, target?.scopedCss, target?.metadata,
      Object.values(state.assets).map(asset => [asset.id, asset.relPath]).sort(([a], [b]) => a.localeCompare(b))]);
  },

  refreshStagedRender: reason => {
    if(!get().stagedScreen)return;
    set({stagedRenderRevision:get().stagedRenderRevision+1,stagedRenderQuality:null,stagedValidationEvidence:null,stagedPreview:null,
      stagedAssetFiles:null,stagedProjectAssetAudit:null,stagedAdoptionAttempt:get().stagedAdoptionAttempt+1,
      stagedAdoptionStatus:reason?'failed':null,stagedAdoptionError:reason??null});
    get().recheckStagedAssetFiles();
  },
  isStagedTaskCurrent: () => isStagedTaskCurrent(get()),
  getStagedAssetIssues: () => candidateBrokenAssetReferences(get()),
  getStagedDeliveryReport: () => stagedDeliveryReport(get()),

  recheckStagedAssetFiles: () => {
    const state = get();
    if (!state.stagedScreen) return;
    const files = stagedReferencedAssetFiles(state);
    const attempt = state.stagedAssetAuditRevision + 1;
    set({ stagedAssetFiles: null, stagedProjectAssetAudit: null, stagedAssetAuditRevision: attempt });
    const key = get().getStagedRenderContextKey();
    const contextFingerprint = projectAssetAuditFingerprint(state);
    const screens = Object.values(state.screens).map(screen => screenForAssetAudit(screen.id === state.stagedScreen!.targetScreenId
      ? { ...screen, htmlContent: state.stagedScreen!.newHtml } : screen, state.overrides));
    const current = () => get().getStagedRenderContextKey() === key && get().stagedAssetAuditRevision === attempt &&
      projectAssetAuditFingerprint(get()) === contextFingerprint;
    void auditProjectAssets(createProjectStorage(state.id, state.folderPath), screens, Object.values(state.assets)).then(async report => {
      const referenceIssues=await verifyLibraryReferenceFiles(createProjectStorage(state.id,state.folderPath),state);
      if (!current()) return;
      const usedIds = new Set(files.map(asset => asset.id));
      const issues = report.issues.filter(issue => (usedIds.has(issue.entityId)||issue.entityId===state.stagedScreen!.targetScreenId) &&
        ['invalid_asset_path', 'missing_asset_file', 'asset_check_unavailable'].includes(issue.code));
      issues.push(...referenceIssues);
      set({ stagedAssetFiles: { key, status: issues.length ? 'blocked' : 'passed', issues },
        stagedProjectAssetAudit: { key, contextFingerprint, report } });
      get().recordStagedValidationEvidence();
    }).catch(() => {
      if (!current()) return;
      const issue: ProjectAssetIssue = { code: 'asset_check_unavailable', entityId: state.stagedScreen!.targetScreenId, message: '无法核对工程资源文件。' };
      set({ stagedAssetFiles: { key, status: 'blocked', issues: [issue] }, stagedProjectAssetAudit: {
        key, contextFingerprint, report: { checkedAt: Date.now(), screenCount: screens.length,
          files: Object.values(state.assets).map(asset => ({ id: asset.id, relPath: asset.relPath })), issues: [issue] }
      } });
      get().recordStagedValidationEvidence();
    });
  },

  setStagedRenderQuality: (key, report) => {
    if (!get().stagedScreen || key !== get().getStagedRenderContextKey()) return;
    set({ stagedRenderQuality: { key, report: structuredClone(report) } });
    if (report.status !== 'pending') get().recordStagedValidationEvidence();
  },

  recordStagedValidationEvidence: () => {
    const state = get(), candidate = state.stagedScreen;
    const target = candidate && state.screens[candidate.targetScreenId];
    if (!candidate || !target) return;
    const options = { deviceProfile: state.settings.deviceProfile, useCustomNavigation: state.settings.useCustomNavigation, designSystem: state.designSystem };
    const source = checkGenerationSourceSafety(candidate.newHtml, options);
    if (!source.passed) return;
    const key = state.getStagedRenderContextKey();
    const viewport = resolveProjectViewport(state.settings);
    const render = state.stagedRenderQuality?.key === key ? state.stagedRenderQuality.report : undefined;
    const projectAssets = state.stagedProjectAssetAudit?.key === key &&
      state.stagedProjectAssetAudit.contextFingerprint === projectAssetAuditFingerprint(state) ? state.stagedProjectAssetAudit.report : undefined;
    const evidence: CandidateValidationEvidence = structuredClone({ ...(candidate.repair?{repair:structuredClone(candidate.repair)}:{}), version: 1, capturedAt: Date.now(),
      candidateFingerprint: contentFingerprint(candidate.newHtml), contextFingerprint: contentFingerprint(key),
      projectFingerprint: knowledgeFingerprint(state), baselineFingerprint: contentFingerprint(target.htmlContent),
      viewport: { profile: state.settings.deviceProfile, width: viewport.width, height: viewport.height },
      designSystem: { id: state.designSystem.id, tokenFingerprint: designTokenFingerprint(state.designSystem.tokens) },
      ...(state.designLibraryBinding ? { designLibrary: state.designLibraryBinding } : {}), source,
      quality: checkGenerationQuality(candidate.newHtml, { ...options, baselineHtml: target.htmlContent,
        protectedNids: state.getProtectedNids(candidate.targetScreenId), modificationRequest: candidate.modificationRequest,formRuleRoots:formRuleScope(candidate.workflowContract) }),
      delivery: stagedDeliveryReport(state), ...(render ? { render } : {}), ...(projectAssets ? { projectAssets } : {}) });
    set({ stagedValidationEvidence: evidence, stagedCandidateSaveStatus: 'pending' });
    const stillCurrent = () => get().id === state.id && get().stagedScreen === candidate && get().stagedValidationEvidence === evidence;
    const preview = state.stagedPreview?.report ?? candidate.preview;
    void saveStagedCandidate(state.id, state.folderPath, { ...candidate, preview, validationEvidence: evidence }).then(() => {
      if (stillCurrent()) set({ stagedCandidateSaveStatus: 'saved' });
    }).catch(error => {
      console.warn('[candidate] 保存失败', error);
      if (stillCurrent()) {
        set({ stagedCandidateSaveStatus: 'failed' });
        void removeStagedCandidate(state.id, state.folderPath, candidate).catch(cleanupError => console.warn('[candidate] 清理旧候选失败', cleanupError));
      }
    });
    void get().captureStagedPreview();
  },

  captureStagedPreview: async (retry = false) => {
    const state = get(), candidate = state.stagedScreen;
    if (!candidate || state.stagedAdoptionStatus === 'saving') return;
    const key = state.getStagedRenderContextKey();
    if (state.stagedRenderQuality?.key !== key || state.stagedRenderQuality.report.status !== 'complete') return;
    if (state.stagedPreview?.key === key && (!retry || state.stagedPreview.pending)) return;
    const target = state.screens[candidate.targetScreenId];
    if (!target || !validCandidateId(candidate.candidateId) || !checkGenerationSourceSafety(candidate.newHtml).passed) return;
    const attempt = crypto.randomUUID();
    const previous = state.stagedPreview?.report ?? candidate.preview;
    set({ stagedPreview: { key, attempt, pending: true, report: previous } });
    const sameAttempt = () => get().id === state.id && get().folderPath === state.folderPath &&
      get().stagedScreen === candidate && get().stagedPreview?.attempt === attempt;
    const current = () => sameAttempt() && get().getStagedRenderContextKey() === key &&
      get().stagedAdoptionStatus !== 'saving' && get().stagedRenderQuality?.key === key && get().stagedRenderQuality?.report.status === 'complete';
    const storage = createProjectStorage(state.id, state.folderPath);
    const request = structuredClone({ screen: { ...target, name: candidate.screenName, htmlContent: candidate.newHtml,
      metadata: { ...target.metadata, ...(candidate.navigationTitle ? { navigationTitle: candidate.navigationTitle } : {}) } },
      settings: state.settings, designSystem: state.designSystem, assets: Object.values(state.assets),
      overrides: Object.fromEntries(Object.entries(state.overrides).filter(([id]) => id.startsWith(`${target.id}:`))),
      relPath: candidatePreviewPath(candidate.candidateId), candidateFingerprint: contentFingerprint(candidate.newHtml),
      contextFingerprint: contentFingerprint(key) });
    let report: PagePreview;
    try { report = await PagePreviewCapture.capture(request, storage, { isCurrent: current }); }
    catch (error) { report = { status: 'failed', scope: 'first-screen', capturedAt: Date.now(),
      candidateFingerprint: request.candidateFingerprint, contextFingerprint: request.contextFingerprint,
      reason: (error instanceof Error ? error.message : '候选预览生成失败。').slice(0, 600) }; }
    if (!current()) {
      if (report.status === 'ready') await storage.remove(report.relPath).catch(() => {});
      if (sameAttempt()) set({ stagedPreview: previous ? { key: '', attempt, pending: false, report: previous } : null });
      return;
    }
    set({ stagedPreview: { key, attempt, pending: false, report } });
    get().recordStagedValidationEvidence();
  },

  getStagedRepairEligibility: () => {
    const state=get(),candidate=state.stagedScreen;
    if(state.stagedRepairStatus||state.stagedAdoptionStatus==='saving')return {allowed:false,message:'候选正在处理，请稍候。'};
    if(!candidate)return {allowed:false,message:'没有待修复的候选。'};
    return candidateRepairEligibility({state,candidate,delivery:stagedDeliveryReport(state),
      render:state.stagedRenderQuality?.key===state.getStagedRenderContextKey()?state.stagedRenderQuality.report:undefined});
  },
  cancelStagedRepair:()=>activeStagedRepairJob?.cancel(),
  repairStagedCandidate: async (model,externalSignal,callerCurrent) => {
    const state=get(),candidate=state.stagedScreen,eligibility=state.getStagedRepairEligibility();
    if(state.stagedRepairStatus)return false;
    if(!candidate||!eligibility.allowed){set({stagedRepairError:eligibility.message});return false;}
    activeStagedRepairJob?.cancel();
    const input=structuredClone({state:{id:state.id,folderPath:state.folderPath,settings:state.settings,designSystem:state.designSystem,
      designSystemOrigin:state.designSystemOrigin,designLibraryBinding:state.designLibraryBinding,components:state.components,assets:state.assets,
      screens:state.screens,overrides:state.overrides,decisions:state.decisions,projectDocuments:state.projectDocuments},
      candidate,delivery:stagedDeliveryReport(state),render:state.stagedRenderQuality!.report});
    const context=pageCreationContext(state),key=state.getStagedRenderContextKey(),contract=JSON.stringify([candidate.workflowContract,candidate.executionRecord]);
    const same=()=>get().id===state.id&&get().folderPath===state.folderPath&&get().stagedScreen?.candidateId===candidate.candidateId&&get().stagedScreen?.newHtml===candidate.newHtml;
    const controller=new AbortController(),signal=controller.signal;
    const job:{cancel:()=>void}={cancel:()=>{
      if(activeStagedRepairJob!==job){controller.abort();return;}
      activeStagedRepairJob=null;controller.abort();
      if(same()){
        const latest=get().stagedScreen!,repair=isPageRepairRecord(latest.repair)?{...latest.repair,status:'cancelled' as const,checkedAt:Date.now(),message:'修复已取消，本次修复资格不会恢复。'}:undefined;
        set({stagedRepairStatus:null,stagedRepairError:'修复已取消，未修改候选。',...(repair?{stagedScreen:{...latest,repair}}:{})});get().recordStagedValidationEvidence();
      }
    }};
    const current=()=>activeStagedRepairJob===job&&!signal.aborted&&(!callerCurrent||callerCurrent())&&same()&&pageCreationContext(get())===context&&get().getStagedRenderContextKey()===key&&JSON.stringify([get().stagedScreen?.workflowContract,get().stagedScreen?.executionRecord])===contract;
    const storage=createProjectStorage(state.id,state.folderPath);
    activeStagedRepairJob=job;
    const abort=()=>job.cancel();externalSignal?.addEventListener('abort',abort,{once:true});
    const unsubscribe=useProjectStore.subscribe(()=>{if(activeStagedRepairJob===job&&!current())job.cancel();});
    set({stagedRepairStatus:'repairing',stagedRepairError:null});
    try{
      if(externalSignal?.aborted)job.cancel();
      const result=await repairCandidate(input,storage,{isCurrent:current,signal,model:{...model,provider:structuredClone(model.provider),
        onPhase:phase=>{if(current()){set({stagedRepairStatus:phase});model.onPhase?.(phase);}}},onAttempt:async repair=>{
          if(!current()||signal?.aborted)throw Error('候选已变化或修复取消。');
          const marked={...get().stagedScreen!,repair:{...repair,message:'已登记一次修复尝试；中断后不会自动重复请求。'}};
          set({stagedScreen:marked});
          // Persist the reservation before any provider request, including crash/reopen scenarios.
          await saveStagedCandidate(state.id,state.folderPath,marked);
        }});
      if(!same()||(activeStagedRepairJob&&activeStagedRepairJob!==job))return false;
      if(result.status==='ready'&&current()&&!signal?.aborted){
        get().stageScreenChange(candidate.targetScreenId,result.html,candidate.screenName,candidate.modificationRequest,candidate.workflowContract,
          candidate.executionRecord?{...candidate.executionRecord,completeHtml:result.html}:undefined,result.repair);
        return true;
      }
      const message=result.status==='blocked'?result.message:'候选或工程上下文已变化，修复结果未应用。';
      const receipt=result.status==='blocked'?result.repair:undefined;
      set({stagedScreen:{...get().stagedScreen!,...(receipt?{repair:receipt}:{})},stagedRepairStatus:null,stagedRepairError:message});
      get().recordStagedValidationEvidence();return false;
    }catch(error){
      if(same()&&(!activeStagedRepairJob||activeStagedRepairJob===job)){set({stagedRepairStatus:null,stagedRepairError:error instanceof Error?error.message:'修复失败。'});get().recordStagedValidationEvidence();}
      return false;
    }finally{unsubscribe();externalSignal?.removeEventListener('abort',abort);if(activeStagedRepairJob===job)activeStagedRepairJob=null;}
  },

  stageScreenChange: (targetScreenId, newHtml, screenName, modificationRequest, workflowContract, executionRecord, repair) => {
    const sourceSafe = checkGenerationSourceSafety(newHtml).passed;
    const normalized = sourceSafe ? normalizeMobileNavigation(newHtml, get().settings) : { html: newHtml, title: undefined };
    const taskSnapshot = workflowContract===undefined?undefined:structuredClone(workflowContract);
    const state = get();
    const candidate: StagedCandidateData = { ...(repair?{repair:structuredClone(repair)}:{}), candidateId: `candidate-${crypto.randomUUID()}`, targetScreenId, newHtml: normalized.html, screenName,
      baselineFingerprint: contentFingerprint(state.screens[targetScreenId]?.htmlContent ?? ''),
      projectFingerprint: knowledgeFingerprint(state),
      designOriginFingerprint: contentFingerprint(JSON.stringify([state.designSystemOrigin?.kind, state.designSystemOrigin?.sourceId,
        state.designSystemOrigin?.sourceFingerprint, state.designSystemOrigin?.tokenVersion, state.designSystemOrigin?.tokenFingerprint])),
      modificationRequest, navigationTitle: normalized.title, workflowContract: taskSnapshot,
      ...(isTaskContractShape(taskSnapshot)?{taskBindingFingerprint:taskInputBinding(taskSnapshot)}:{}),
      executionRecord: executionRecord ? { ...structuredClone(executionRecord),
        ...(executionRecord.completeHtml ? { completeHtml: normalized.html } : {}) } : undefined };
    set({
      stagedScreen: candidate, stagedCandidateSaveStatus: sourceSafe ? 'pending' : 'failed',
      stagedPreview: null,
      stagedRepairStatus: null, stagedRepairError: null, stagedAdoptionStatus: null, stagedAdoptionError: null, stagedAdoptionAttempt: get().stagedAdoptionAttempt + 1,
      stagedRenderQuality: null, stagedAssetFiles: null, stagedProjectAssetAudit: null, stagedValidationEvidence: null,
      stagedRenderRevision: get().stagedRenderRevision + 1
    });
    get().recheckStagedAssetFiles();
    const { id, folderPath } = get();
    if (!sourceSafe) {
      void removeStagedCandidate(id, folderPath).catch(error => console.warn('[candidate] 清理旧候选失败', error));
      return;
    }
    get().recordStagedValidationEvidence();
  },

  restoreStagedCandidate: (candidate, projectId) => {
    if (get().id !== projectId || !get().screens[candidate.targetScreenId]) return false;
    set({ stagedScreen: { ...structuredClone(candidate), candidateId: validCandidateId(candidate.candidateId) ? candidate.candidateId : `candidate-${crypto.randomUUID()}`, restoredFromDisk: true }, stagedCandidateSaveStatus: 'saved', stagedRenderQuality: null,
      stagedPreview: null,
      stagedRepairStatus: null, stagedRepairError: null, stagedAdoptionStatus: null, stagedAdoptionError: null, stagedAdoptionAttempt: get().stagedAdoptionAttempt + 1,
      stagedAssetFiles: null, stagedProjectAssetAudit: null, stagedValidationEvidence: null,
      stagedRenderRevision: get().stagedRenderRevision + 1 });
    get().recheckStagedAssetFiles();
    return true;
  },

  adoptStagedChange: () => get().commitStagedDelivery('replace'),
  forceAdoptStagedChange: () => get().commitStagedDelivery('force-replace'),
  keepBothScreens: () => get().commitStagedDelivery('keep-both'),

  commitStagedDelivery: async (mode, expectedContextKey) => {
    const state = get(), staged = state.stagedScreen;
    if (!staged || state.stagedAdoptionStatus === 'saving') return false;
    if (expectedContextKey !== undefined && state.getStagedRenderContextKey() !== expectedContextKey) {
      set({ stagedAdoptionStatus: 'failed', stagedAdoptionError: '候选或项目上下文已变化，请重新检查并确认。' }); return false;
    }
    const structureConfirmation = mode === 'confirm-structure-replace' || mode === 'confirm-structure-keep-both';
    const keepBoth = mode === 'keep-both' || mode === 'confirm-structure-keep-both';
    if (structureConfirmation && expectedContextKey === undefined) {
      set({ stagedAdoptionStatus: 'failed', stagedAdoptionError: '请先检查并确认当前结构变化。' }); return false;
    }
    const allowed = () => {
      if (structureConfirmation) {
        const report = get().getStagedDeliveryReport();
        return (report.status === 'ready' || canConfirmCandidateStructure(report)) && canForceAdoptStagedScreen(get());
      }
      return mode === 'force-replace' ? canForceAdoptStagedScreen(get()) : canAdoptStagedScreen(get());
    };
    if (!allowed()) {
      const reason = state.getStagedDeliveryReport().checks.find(c => c.status !== 'passed')?.message ?? '交付检查尚未完成。';
      set({ stagedAdoptionStatus: 'failed', stagedAdoptionError: `暂不能采纳：${reason}` }); return false;
    }
    const target = state.screens[staged.targetScreenId];
    const key = state.getStagedRenderContextKey();
    const contextFingerprint = projectAssetAuditFingerprint(state);
    const attempt = state.stagedAdoptionAttempt + 1;
    const current = () => get().id === state.id && get().stagedScreen === staged && get().stagedAdoptionAttempt === attempt;
    const unchanged = () => current() && get().getStagedRenderContextKey() === key &&
      projectAssetAuditFingerprint(get()) === contextFingerprint && allowed();
    const storage = createProjectStorage(state.id, state.folderPath);
    const repository = new DeliveryRepository(storage, state.id);
    set({ stagedAdoptionStatus: 'saving', stagedAdoptionError: null, stagedAdoptionAttempt: attempt });
    let record: DeliveryRecord | undefined;
    let prepared = false;
    try {
      const resourceScreen={...target,htmlContent:staged.newHtml};
      const resources=await readProjectRenderResources(storage,[resourceScreen],Object.values(state.assets),state.overrides);
      const issues = [...await verifyProjectAssetFiles(storage, stagedReferencedAssetFiles(state)),...resources.issues,...await verifyLibraryReferenceFiles(storage,state)];
      if (!unchanged()) throw new Error('候选或项目上下文已变化，未应用本次方案。');
      if (issues.length) {
        set({ stagedAssetFiles: { key, status: 'blocked', issues }, stagedProjectAssetAudit: null });
        get().recordStagedValidationEvidence();
        throw new Error(issues[0].message);
      }
      const resourceIssue=renderResourceIssue(state.stagedRenderQuality?.report.resourceFiles,resources.resourceFiles);
      if(resourceIssue){get().refreshStagedRender(resourceIssue);throw Error(resourceIssue);}
      // A font-only candidate may finish rendering before the background project
      // audit. Archive the files actually read here instead of losing that proof.
      const audit=get().stagedProjectAssetAudit;
      const priorAudit=audit?.key===key&&audit.contextFingerprint===contextFingerprint?audit.report:undefined;
      set({stagedProjectAssetAudit:{key,contextFingerprint,report:{
        ...(priorAudit??{checkedAt:Date.now(),screenCount:1,issues:[]}),
        files:[...new Map([...(priorAudit?.files??[]),...resources.files].map(file=>[file.relPath,file])).values()]
      }}});
      get().recordStagedValidationEvidence();
      const evidence = get().stagedValidationEvidence!;
      const resultId = keepBoth ? `screen-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` : target.id;
      const resultName = keepBoth ? `${staged.screenName} (AI 方案)` : target.name;
      const result = normalizeScreenNavigation({ ...target, id: resultId, name: resultName,
        htmlContent: staged.newHtml.includes('data-nid=') ? staged.newHtml : NidEngine.injectNids(staged.newHtml),
        metadata: { ...target.metadata, ...(staged.navigationTitle ? { navigationTitle: staged.navigationTitle } : {}) } }, state.settings);
      const { preview: _temporaryPreview, ...archivedCandidate } = staged;
      record = structuredClone({ schemaVersion: 1, id: `delivery-${Date.now().toString(36)}-${crypto.randomUUID()}`,
        projectId: state.id, createdAt: Date.now(), status: 'prepared', mode,
        before: { id: target.id, name: target.name, htmlContent: target.htmlContent, scopedCss: target.scopedCss, metadata: target.metadata },
        after: { id: resultId, name: resultName, htmlContent: result.htmlContent, scopedCss: result.scopedCss, metadata: result.metadata },
        resultFingerprint: contentFingerprint(result.htmlContent), candidate: { ...archivedCandidate, validationEvidence: evidence },
        designSystem: state.designSystem, settings: state.settings,
        overrides: Object.fromEntries(Object.entries(state.overrides).filter(([id]) => id.startsWith(`${target.id}:`)).map(([, ov]) => [`${resultId}:${ov.nid}`, ov])),
        assets: Object.values(state.assets) });
      record.preview = await DeliveryPreviewCapture.capture(record, storage);
      if (!unchanged()) throw new Error('生成预览期间候选或项目已变化，未应用本次方案。');
      await repository.prepare(record);
      prepared = true;
      if (!unchanged()) throw new Error('保存档案期间候选或项目已变化，未应用本次方案。');
      const finalResources=await readProjectRenderResources(storage,[result],Object.values(state.assets),record.overrides);
      const finalReferenceIssues=[...await verifyProjectAssetFiles(storage,stagedReferencedAssetFiles(state)),...finalResources.issues,...await verifyLibraryReferenceFiles(storage,state)];
      if(!unchanged())throw new Error('最终核对资源期间候选或项目已变化。');
      if(finalReferenceIssues.length){
        set({stagedAssetFiles:{key,status:'blocked',issues:finalReferenceIssues},stagedProjectAssetAudit:null});
        get().recordStagedValidationEvidence();throw new Error(finalReferenceIssues[0].message);
      }
      const finalResourceIssue=renderResourceIssue(state.stagedRenderQuality?.report.resourceFiles,finalResources.resourceFiles);
      if(finalResourceIssue){get().refreshStagedRender(finalResourceIssue);throw Error(finalResourceIssue);}
      if (keepBoth) {
        get().addScreen({ name: resultName, htmlContent: result.htmlContent, scopedCss: result.scopedCss,
          metadata: { ...result.metadata, basedOnScreenId: target.id } }, resultId,
          { referencedScreenId: target.id, initialOverrides: Object.values(record.overrides) });
      } else {
        useHistoryStore.getState().addCheckpoint(`${mode === 'force-replace' ? '强制采纳新版前备份' : structureConfirmation ? '确认结构变更前备份' : '采纳新版前备份'}: ${target.name}`, {
          screenId: target.id, htmlContent: target.htmlContent, scopedCss: target.scopedCss
        });
        get().updateScreen(target.id, { htmlContent: result.htmlContent, metadata: result.metadata },
          `${mode === 'force-replace' ? '强制采纳' : structureConfirmation ? '确认结构变更后采纳' : '采纳'} AI 生成新版: ${staged.screenName}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '交付档案保存失败，原页面未修改。';
      if (record && prepared) await repository.finish(record, 'aborted', message).catch(() => {});
      if (!prepared && record?.preview?.status === 'ready') await storage.remove(record.preview.relPath).catch(() => {});
      if (current()) set({ stagedAdoptionStatus: 'failed', stagedAdoptionError: message });
      if (get().id === state.id) set({ deliveryArchiveRevision: get().deliveryArchiveRevision + 1 });
      return false;
    }
    set({ stagedScreen: null, stagedPreview: null, stagedCandidateSaveStatus: null, stagedRenderQuality: null, stagedAssetFiles: null,
      stagedProjectAssetAudit: null, stagedValidationEvidence: null, stagedRepairStatus: null, stagedRepairError: null, stagedAdoptionStatus: null, stagedAdoptionError: null });
    try { await repository.finish(record!, 'applied'); }
    catch (error) {
      console.warn('[delivery] 收尾失败', error);
      if (get().id === state.id) set({ deliveryArchiveNotice: '页面已应用，档案状态写入失败；准备记录已保留，可在交付历史中查看。' });
    }
    if (get().id === state.id) set({ deliveryArchiveRevision: get().deliveryArchiveRevision + 1 });
    await removeStagedCandidate(state.id, state.folderPath, staged).catch(error => console.warn('[candidate] 删除失败', error));
    return true;
  },

  discardStagedChange: () => {
    if (!get().stagedScreen) return;
    const { id, folderPath, stagedScreen } = get();
    set({ stagedScreen: null, stagedPreview: null, stagedCandidateSaveStatus: null, stagedRenderQuality: null, stagedAssetFiles: null, stagedProjectAssetAudit: null,
      stagedValidationEvidence: null, stagedRepairStatus: null, stagedRepairError: null, stagedAdoptionStatus: null, stagedAdoptionError: null, stagedAdoptionAttempt: get().stagedAdoptionAttempt + 1 });
    void removeStagedCandidate(id, folderPath, stagedScreen!).catch(error => console.warn('[candidate] 删除失败', error));
  },

  saveProject: () => {
    const { id, name, settings, designSystem, designSystemOrigin, designLibraryBinding, screens, overrides, decisions, components, assets, panelStates, coverImage, quickPrompts, projectDocuments } =
      get();
    const data = {
      id,
      name,
      schemaVersion: 1,
      projectDocuments,
      savedAt: Date.now(),
      settings,
      designSystem,
      designSystemOrigin,
      designLibraryBinding,
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
      const operation=new ProjectRepository(createProjectStorage(id, folderPath)).save(data as never);
      projectWrites.set(projectWriteKey(id,folderPath),operation);
      void operation.catch((e) => console.warn('[project] 文件夹保存失败', e));
    } else {
      writeProject(id, JSON.stringify(data));
      projectWrites.set(projectWriteKey(id),Promise.resolve());
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
      referenceViewportHeight: resolveProjectViewport(settings).height,
      createdAt: get().createdAt,
      updatedAt: data.savedAt,
      screenCount: Object.keys(screens).length,
      previewHtml: firstScreen ? buildScreenDocument(firstScreen, { baseCss: getBaseCss(settings.deviceProfile), tokensCss: compileTokensToCss(designSystem.tokens, settings.colorMode), screenOverrides: '', deviceProfile: settings.deviceProfile, useCustomNavigation: settings.useCustomNavigation, includeMobileChrome: true, viewportHeight: resolveProjectViewport(settings).height, viewportWidth: settings.frameWidth }) : undefined,
      previewCss: '',
      folderPath: get().folderPath,
      coverImage: coverImage || undefined
    };
    upsertMeta(meta);
  },

  saveProjectChecked: async () => {
    const {id,folderPath}=get();get().saveProject();await projectWrites.get(projectWriteKey(id,folderPath));
  },

  /** 新建空白工程并切换为当前工程 (PRD §3.0.1)。默认纯净画布 (0 画框，保证工作区只有有效产物) */
  initNewProject: ({ name, deviceProfile, designSystem: ds, initialDecisions, folderPath, createSpecimen, referenceDeviceId }) => {
    const id = `proj_${Date.now().toString(36)}`;
    const now = Date.now();
    const effectiveDs = ds || defaultTheme;
    const referenceDevice = { ...(REFERENCE_DEVICES.find(device => device.id === referenceDeviceId && device.deviceProfile === deviceProfile) ?? defaultReferenceDevice(deviceProfile)) };
    const referenceHeight = Math.round(referenceDevice.height * (deviceProfile === 'mobile' ? 390 : 1440) / referenceDevice.width);
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
        viewportGuideHeight: referenceHeight,
        referenceDevice,
        showViewportGuide: true,
        colorMode: 'light',
        lodBudget: 12,
        useCustomNavigation: false
      },
      designSystem: effectiveDs,
      designSystemOrigin: designSystemOriginFor(effectiveDs, { kind: 'project', sourceId: effectiveDs.id, sourceName: effectiveDs.name, updatedAt: now }),
      designLibraryBinding: undefined,
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
      stagedPreview: null,
      stagedCandidateSaveStatus: null,
      stagedRepairStatus: null, stagedRepairError: null, stagedAdoptionStatus: null, stagedAdoptionError: null, stagedAdoptionAttempt: get().stagedAdoptionAttempt + 1,
      deliveryArchiveNotice: null,
      stagedRenderQuality: null,
      stagedAssetFiles: null,
      stagedProjectAssetAudit: null,
      stagedValidationEvidence: null,
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
    set({folderPath:undefined}); // A local project must not inherit a previously edited source folder.
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
        settings: normalizeReferenceSettings({ ...(data.settings || get().settings), useCustomNavigation: data.settings?.useCustomNavigation === true, referenceDevice: data.settings?.referenceDevice }),
        designSystem: data.designSystem || get().designSystem,
        designSystemOrigin: designSystemOriginFor(data.designSystem || get().designSystem, data.designSystemOrigin || { kind: 'project', sourceId: (data.designSystem || get().designSystem).id, sourceName: (data.designSystem || get().designSystem).name, updatedAt: data.savedAt || Date.now() }),
        designLibraryBinding: ['project_copy','pinned_reference'].includes(data.designLibraryBinding?.mode) ? data.designLibraryBinding : undefined,
        screens: data.screens || {},
        screenOrder: order,
        activeScreenId: order[0] || null,
        selectedNid: null,
        hoveredNid: null,
        selectedNode: null,
        stagedScreen: null,
        stagedPreview: null,
        stagedCandidateSaveStatus: null,
        stagedRepairStatus: null, stagedRepairError: null, stagedAdoptionStatus: null, stagedAdoptionError: null, stagedAdoptionAttempt: get().stagedAdoptionAttempt + 1,
        deliveryArchiveNotice: null,
        stagedRenderQuality: null,
        stagedAssetFiles: null,
        stagedProjectAssetAudit: null,
        stagedValidationEvidence: null,
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
      let nextDesignSystemOrigin = state.designSystemOrigin;
      let nextDesignLibraryBinding = state.designLibraryBinding;
      let nextSettings = state.settings;
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
        } else if (root === 'designSystemOrigin') {
          nextDesignSystemOrigin = patch.op === 'remove' ? undefined : patch.value as DesignSystemOrigin | undefined;
        } else if (root === 'designLibraryBinding') {
          nextDesignLibraryBinding = patch.op === 'remove' ? undefined : patch.value as DesignLibraryBinding | undefined;
        } else if (root === 'settings' && patch.value) {
          // History may change the visual mode; device profile remains project-immutable.
          const incoming = patch.value as ProjectSettings;
          nextSettings = normalizeReferenceSettings({ ...state.settings, colorMode: incoming.colorMode, useCustomNavigation: incoming.useCustomNavigation === true,
            referenceDevice: validReferenceDevice(incoming.referenceDevice, state.settings.deviceProfile) ? { ...incoming.referenceDevice } : undefined,
            viewportGuideHeight: Number.isFinite(incoming.viewportGuideHeight) && incoming.viewportGuideHeight >= 240 && incoming.viewportGuideHeight <= 7680 ? incoming.viewportGuideHeight : state.settings.viewportGuideHeight });
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
        designSystemOrigin: nextDesignSystemOrigin,
        designLibraryBinding: nextDesignLibraryBinding,
        settings: nextSettings,
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


