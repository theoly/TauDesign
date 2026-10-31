import type {MultiPageScope} from './multiPageContract';
import type { DesignSystem } from '../../types/designSystem';
import type { DesignLibraryBinding,DesignSystemOrigin } from '../../types/project';
import type { PipelineIntent } from './engine/pipeline/types';
import type { DesignProjectManifest } from './projectManifest';
import type { HtmlImportMode } from '../../types/htmlImport';
import { selectChatWorkflow, selectImportWorkflow, selectRestyleWorkflow } from './workflowCatalog';
import type { DesignWorkflowId } from './workflowCatalog';
import {createWorkflowValidationPlan,type WorkflowValidationPlan} from './workflowValidation';
import {renderPageTaskPlan} from './pageTaskPlan';
import type { ModificationReviewReceipt } from './modificationReview';

export type { DesignWorkflowId } from './workflowCatalog';

export interface KnowledgeSourceRef {
  kind: 'project-context' | 'document' | 'page' | 'text-reference' | 'decision' | 'design-system' | 'component' | 'reference-image' | 'design-library';
  id: string;
  fingerprint: string;
  stale?: boolean;
}

/** Runtime callers may pass a full theme; contracts store identity, never the entire theme or arbitrary caller fields. */
function designIdentity(system:Pick<DesignSystem,'id'|'name'>,origin?:DesignWorkflowInput['designSystemOrigin']):NonNullable<DesignTaskContract['designSystem']> {
  return {id:system.id,name:system.name,...(origin?.tokenVersion?{tokenVersion:origin.tokenVersion}:{}),...(origin?.tokenFingerprint?{tokenFingerprint:origin.tokenFingerprint}:{})};
}
function originIdentity(origin:NonNullable<DesignWorkflowInput['designSystemOrigin']>):NonNullable<DesignTaskContract['designSystemOrigin']> {
  return {kind:origin.kind,...Object.fromEntries(Object.entries(origin).filter(([key])=>['sourceId','sourceName','sourceFingerprint','tokenVersion','tokenFingerprint'].includes(key)))};
}
function knowledgeIdentity(source:KnowledgeSourceRef):KnowledgeSourceRef {
  const {kind,id,fingerprint,stale}=source;return {kind,id,fingerprint,...(stale===undefined?{}:{stale})};
}

function nextTaskId(): string {
  return `design-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export interface ReferenceImageIdentity {
  region?: import('../../types/referenceImage').ReferenceRegion;
  name:string;fingerprint:string;
  /** Computed from the actual outgoing current-turn message, never model output. */
  inputReceipt?:{version:1;checkedAt:number;imageFingerprint:string;requestFingerprint:string;messageFingerprint:string;providerId:string;model:string;reusedFromTaskId?:string};
}
export interface DesignLibrarySourceIdentity {
  mode:DesignLibraryBinding['mode'];sourceProjectId:string;sourceFingerprint:string;sourceTokenVersion:number;bindingFingerprint:string;
}
export interface DesignTaskContract {
  pageTaskPlan?:import('./pageTaskPlan').PageTaskSnapshot;
  designGuidance?: import('./designKnowledge/receipt').DesignGuidancePacket;
  generationMode?: 'sections';
  version: 1;
  taskId: string;
  request: string;
  workflowId: DesignWorkflowId;
  operation: 'answer' | 'theme-proposal' | 'create' | 'analyze' | 'modify' | 'import' | 'restyle';
  strategy: 'no-canvas-mutation' | 'new-page' | 'review-first' | 'candidate-copy' | 'preserve-source' | 'normalize-tokens' | 'normalize-selected-tokens' | 'validated-batch';
  sourceName?: string;
  referenceImage?:ReferenceImageIdentity;
  multiPage?:MultiPageScope;
  librarySource?:DesignLibrarySourceIdentity;
  target?: { id: string; name: string; baselineFingerprint: string };
  referencePageId?: string;
  elementNid?: string;
  device: { profile: 'pc' | 'mobile'; frameWidth: number; referenceDevice?: string };
  designSystem?: { id: string; name: string; tokenVersion?: number; tokenFingerprint?: string };
  designSystemOrigin?: Pick<DesignSystemOrigin, 'kind' | 'sourceId' | 'sourceName' | 'sourceFingerprint' | 'tokenVersion' | 'tokenFingerprint'>;
  projectPages?: string[];
  projectPageCount?: number;
  acceptance: string[];
  allowedChanges: string[];
  protectedNids: string[];
  knowledgeSources: KnowledgeSourceRef[];
  knowledgeFingerprint?: string;
  validationPlan?: WorkflowValidationPlan;
  /** Diagnostic provenance of the user's reviewed choices; never grants execution by itself. */
  modificationReview?: ModificationReviewReceipt;
}

export interface DesignWorkflowInput {
  referenceImage?:Pick<ReferenceImageIdentity,'name'|'fingerprint'|'region'>;
  multiPage?:MultiPageScope;
  designLibraryBinding?:DesignLibraryBinding;
  intent: PipelineIntent;
  request: string;
  target?: { id: string; name: string; htmlContent: string };
  referencePageId?: string | null;
  elementNid?: string | null;
  reviewRequired?: boolean;
  deviceProfile: 'pc' | 'mobile';
  frameWidth: number;
  referenceDeviceName?: string;
  designSystem?: Pick<DesignSystem, 'id' | 'name'>;
  designSystemOrigin?: Pick<DesignSystemOrigin, 'kind' | 'sourceId' | 'sourceName' | 'sourceFingerprint' | 'tokenVersion' | 'tokenFingerprint'>;
  projectManifest?: DesignProjectManifest;
  protectedNids?: string[];
  allowedChanges?: string[];
  knowledgeSources?: KnowledgeSourceRef[];
  knowledgeFingerprint?: string;
}

/** Stable, non-cryptographic identity for change tracking; never used for security. */
export function contentFingerprint(content: string): string {
  let hash = 2166136261;
  for (let index = 0; index < content.length; index++) hash = Math.imul(hash ^ content.charCodeAt(index), 16777619);
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function buildDesignTaskContract(input: DesignWorkflowInput): DesignTaskContract {
  const workflow = selectChatWorkflow({...input,hasReferenceImage:Boolean(input.referenceImage),hasDesignLibrary:Boolean(input.designLibraryBinding)});
  const allowedChanges = input.allowedChanges ?? (workflow.operation === 'analyze' ? [] : input.elementNid ? [`element:${input.elementNid}`]
    : workflow.operation === 'modify' && input.target ? [`screen:${input.target.id}`]
      : workflow.operation === 'create' ? ['new-screen'] : []);

  return {
    version: 1, taskId: nextTaskId(), request: input.request,
    workflowId: workflow.id, operation: workflow.operation, strategy: workflow.strategy,validationPlan:createWorkflowValidationPlan(workflow,input.multiPage),
    ...(input.target ? { target: { id: input.target.id, name: input.target.name, baselineFingerprint: contentFingerprint(input.target.htmlContent) } } : {}),
    ...(workflow.operation==='create'&&input.multiPage?{multiPage:structuredClone(input.multiPage)}:{}),
    ...(['create','modify'].includes(workflow.operation)&&input.referenceImage?{referenceImage:{name:input.referenceImage.name,fingerprint:input.referenceImage.fingerprint,...(input.referenceImage.region?{region:structuredClone(input.referenceImage.region)}:{})}}:{}),
    ...(workflow.operation==='create'&&input.designLibraryBinding?{librarySource:{mode:input.designLibraryBinding.mode,sourceProjectId:input.designLibraryBinding.sourceProjectId,
      sourceFingerprint:input.designLibraryBinding.sourceFingerprint,sourceTokenVersion:input.designLibraryBinding.sourceTokenVersion,bindingFingerprint:contentFingerprint(JSON.stringify(input.designLibraryBinding))}}:{}),
    ...(input.referencePageId ? { referencePageId: input.referencePageId } : {}),
    ...(input.elementNid ? { elementNid: input.elementNid } : {}),
    device: { profile: input.deviceProfile, frameWidth: input.frameWidth, ...(input.referenceDeviceName ? { referenceDevice: input.referenceDeviceName } : {}) },
    ...(input.designSystem ? { designSystem: designIdentity(input.designSystem,input.designSystemOrigin) } : {}),
    ...(input.designSystemOrigin ? { designSystemOrigin: originIdentity(input.designSystemOrigin) } : {}),
    ...(input.projectManifest ? {
      projectPages: input.projectManifest.pages.filter(page => page.kind === 'screen').slice(0, 20).map(page => page.name),
      projectPageCount: input.projectManifest.pages.filter(page => page.kind === 'screen').length
    } : {}),
    acceptance: [...workflow.acceptance,...(input.multiPage?[input.multiPage.kind==='variants'?'只交付当前确认方案，同页功能需求一致、布局层级有差异；不将方案互相作为业务跳转，全部通过后一起并排新增，原页与项目Token不变':'只交付当前确认计划中的这一页，静态关联指向约定页面，全部页通过后才一起加入画布']:[])], allowedChanges: [...allowedChanges,...(input.multiPage?[`planned-page:${input.multiPage.planId}:${input.multiPage.itemId}`]:[])],
    protectedNids: [...new Set(input.protectedNids ?? [])],
    knowledgeSources: [...(input.knowledgeSources ?? []).map(knowledgeIdentity),
      ...(['create','modify'].includes(workflow.operation)&&input.referenceImage?[{kind:'reference-image' as const,id:input.referenceImage.name,fingerprint:input.referenceImage.fingerprint}]:[]),
      ...(workflow.operation==='create'&&input.designLibraryBinding?[{kind:'design-library' as const,id:input.designLibraryBinding.sourceProjectId,fingerprint:contentFingerprint(JSON.stringify(input.designLibraryBinding))}]:[])],
    ...(input.knowledgeFingerprint ? { knowledgeFingerprint: input.knowledgeFingerprint } : {})
  };
}

export function buildHtmlImportContract(input: {
  fileName: string; html: string; mode: HtmlImportMode; categories?: string[];
  deviceProfile: 'pc' | 'mobile'; frameWidth: number; referenceDeviceName?: string;
  designSystem?: Pick<DesignSystem, 'id' | 'name'>;
}): DesignTaskContract {
  const workflow = selectImportWorkflow(input.mode);
  const categoryText = input.mode === 'selective' ? `仅统一选择类别：${(input.categories ?? []).join('、') || '未选择类别'}` : '';
  return {
    version: 1, taskId: nextTaskId(), request: `导入 ${input.fileName}（${input.mode}）`,
    workflowId: workflow.id, operation: workflow.operation, strategy: workflow.strategy, sourceName: input.fileName,validationPlan:createWorkflowValidationPlan(workflow),
    target: { id: input.fileName, name: input.fileName, baselineFingerprint: contentFingerprint(input.html) },
    device: { profile: input.deviceProfile, frameWidth: input.frameWidth, ...(input.referenceDeviceName ? { referenceDevice: input.referenceDeviceName } : {}) },
    ...(input.designSystem ? { designSystem: designIdentity(input.designSystem) } : {}),
    acceptance: [
      ...workflow.acceptance,
      ...(categoryText ? [categoryText] : []),
    ], allowedChanges: [input.mode === 'selective' ? `tokens:${(input.categories ?? []).join(',')}` : `import:${input.mode}`],
    protectedNids: [], knowledgeSources: [{ kind: 'text-reference', id: input.fileName, fingerprint: contentFingerprint(input.html) }]
  };
}

export function buildRestyleContract(input: {
  scope: 'single' | 'batch'; target: { id: string; name: string; html: string };
  deviceProfile: 'pc' | 'mobile'; frameWidth: number; referenceDeviceName?: string;
  designSystem?: Pick<DesignSystem, 'id' | 'name'>; confirmedScope?: string;
  designSystemOrigin?: Pick<DesignSystemOrigin, 'kind' | 'sourceId' | 'sourceName' | 'sourceFingerprint' | 'tokenVersion' | 'tokenFingerprint'>;
  protectedNids?: string[]; knowledgeSources?: KnowledgeSourceRef[]; knowledgeFingerprint?: string;
}): DesignTaskContract {
  const workflow = selectRestyleWorkflow(input.scope);
  return {
    version: 1, taskId: nextTaskId(), request: input.confirmedScope ?? '仅润色当前页面UI，保留功能结构文案',
    workflowId: workflow.id, operation: workflow.operation, strategy: workflow.strategy,validationPlan:createWorkflowValidationPlan(workflow),
    target: { id: input.target.id, name: input.target.name, baselineFingerprint: contentFingerprint(input.target.html) },
    device: { profile: input.deviceProfile, frameWidth: input.frameWidth, ...(input.referenceDeviceName ? { referenceDevice: input.referenceDeviceName } : {}) },
    ...(input.designSystem ? { designSystem: designIdentity(input.designSystem,input.designSystemOrigin) } : {}),
    ...(input.designSystemOrigin ? { designSystemOrigin: originIdentity(input.designSystemOrigin) } : {}),
    acceptance: [
      ...(input.confirmedScope ? [`严格限定在已确认范围：${input.confirmedScope}`] : ['仅调整视觉风格，不改变业务结构与交互']),
      ...workflow.acceptance
    ], allowedChanges: [input.confirmedScope ?? 'visual-style-only'], protectedNids: [...new Set(input.protectedNids ?? [])],
    knowledgeSources: (input.knowledgeSources ?? []).map(knowledgeIdentity),
    ...(input.knowledgeFingerprint ? { knowledgeFingerprint: input.knowledgeFingerprint } : {})
  };
}

export function renderDesignTaskContract(contract: DesignTaskContract): string {
  return [
    '### DESIGN TASK CONTRACT (machine-routed; do not expand the authorized scope)',
    `taskId=${contract.taskId}; version=${contract.version}`,
    `workflow=${contract.workflowId}; operation=${contract.operation}; strategy=${contract.strategy}`,
    contract.generationMode?`generationMode=${contract.generationMode}; 公共骨架与区块由程序验证后合并，最终仍是同一页。`:'',
    contract.validationPlan?`validationPlan=${contract.validationPlan.fingerprint}; stages=${contract.validationPlan.stages.join(',')}`:'',
    `device=${contract.device.profile}/${contract.device.frameWidth}px${contract.device.referenceDevice ? ` (${contract.device.referenceDevice})` : ''}`,
    contract.target ? `target=${contract.target.name} [${contract.target.id}], baseline=${contract.target.baselineFingerprint}` : '',
    contract.referencePageId ? `referencePage=${contract.referencePageId}` : '',
    contract.referenceImage?`referenceImage=${JSON.stringify({name:contract.referenceImage.name,fingerprint:contract.referenceImage.fingerprint,region:contract.referenceImage.region})}; source-only, no permission to expand scope${contract.referenceImage.region?'; 用户已选择目标区域，模型收到的是裁切图；不要补回选区外的编辑器工具或其它页面。':''}`:'',
    contract.librarySource?`designLibrarySource=${JSON.stringify(contract.librarySource)}; ${contract.librarySource.mode==='pinned_reference'?'fixed version readonly cache':'editable project copy; current project overrides apply'}`:'',
    contract.multiPage?`confirmedMultiPageScope=${JSON.stringify(contract.multiPage)}; output exactly this page; no partial delivery`:'',
    contract.pageTaskPlan?renderPageTaskPlan(contract.pageTaskPlan):'',
    contract.operation==='create'?'输出预算：优先完成当前页全部已确认功能与主操作，复用现有样式类，保持HTML紧凑，减少重复装饰/SVG路径和无关注释。不得为了篇幅删除明确要求的字段、内容或条目，也不要把其它业务页的职责堆进当前页；只输出当前页完整产物。':'',
    ['create','modify','restyle','import'].includes(contract.operation)?'实体引用规则：data-component-id只用上下文中真实组件ID，新实例data-component-version使用当前定义版本；原页同身份旧实例保留原版本，不自行同步。data-target-screen-id只指向已知工程页面或已确认计划ID，禁止臆造目标。未提供组件模板时不要伪造绑定标识。':'',
    ['create','modify'].includes(contract.operation)?'可见文案边界：页面只展示本次业务所需内容。合同、计划和参考资料中的静态设计、不发起请求、不实现权限校验、Token/CSS白名单等是生成执行约束，不得转写成终端用户看到的标题、正文、提示或脚注（例如“本页仅展示静态说明，不发起请求或判断权限”）。不要为了声明实现边界而新增工程说明。用户明确要求展示的技术说明及原页面已有文案依本次授权保留，不据此擅自删除或改写。':'',
    contract.sourceName ? `source=${contract.sourceName}` : '',
    contract.elementNid ? `elementNid=${contract.elementNid}` : '',
    contract.designSystem ? `designSystem=${contract.designSystem.name} [${contract.designSystem.id}]${contract.designSystem.tokenVersion ? ` tokens-v${contract.designSystem.tokenVersion}` : ''}${contract.designSystem.tokenFingerprint ? ` #${contract.designSystem.tokenFingerprint}` : ''}` : '',
    contract.designSystemOrigin ? `designSystemOrigin=${contract.designSystemOrigin.kind}${contract.designSystemOrigin.sourceName ? `: ${contract.designSystemOrigin.sourceName}` : ''}${contract.designSystemOrigin.sourceId ? ` id=${contract.designSystemOrigin.sourceId}` : ''}${contract.designSystemOrigin.sourceFingerprint ? ` [${contract.designSystemOrigin.sourceFingerprint}]` : ''}${contract.designSystemOrigin.tokenVersion ? ` v${contract.designSystemOrigin.tokenVersion}` : ''}` : '',
    contract.projectPages ? `projectPages=${contract.projectPages.join('、') || '暂无业务页面'}${(contract.projectPageCount ?? 0) > contract.projectPages.length ? `（共${contract.projectPageCount}页，已列前${contract.projectPages.length}页）` : ''}` : '',
    contract.allowedChanges.length ? `allowedChanges=${contract.allowedChanges.join('、')}` : '',
    contract.protectedNids.length ? `protectedNids=${contract.protectedNids.slice(0, 40).join('、')}${contract.protectedNids.length > 40 ? '…' : ''}` : '',
    contract.knowledgeSources.length ? `knowledgeSources=${JSON.stringify(contract.knowledgeSources.slice(0, 24).map(source => ({ kind: source.kind,
      id: source.id.slice(0, 200), fingerprint: source.fingerprint, stale: Boolean(source.stale) })))}${contract.knowledgeSources.length > 24 ? '（其余省略）' : ''}` : '',
    `acceptance=${contract.acceptance.map(item => `- ${item}`).join('\n')}`,
    '此合同只明确执行边界，不取代用户原始诉求、工程规则或后续代码质量门禁。'
  ].filter(Boolean).join('\n');
}
