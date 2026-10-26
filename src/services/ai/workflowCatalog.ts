import type { HtmlImportMode } from '../../types/htmlImport';
import type { PipelineIntent } from './engine/pipeline/types';
import { requiresModificationReview } from './modificationEntry';

export type DesignWorkflowId =
  | 'create-page-from-reference' | 'create-page-from-library' | 'create-page-from-reference-library'
  | 'plan-page-variants' | 'plan-multiple-pages' | 'answer-question' | 'propose-theme' | 'create-page' | 'review-page-modification' | 'edit-element-copy' | 'edit-page-copy'
  | 'import-html-preserve' | 'import-html-unify' | 'import-html-selective' | 'restyle-page' | 'restyle-batch';
export type WorkflowValidationStage = 'design-entities' | 'multi-page-scope' | 'page-plan-schema' | 'reference-input' | 'library-binding' | 'analysis-schema' | 'source-safety' | 'quality' | 'structure' | 'render' | 'import-preview' | 'asset-references' | 'asset-files';

export interface WorkflowDescriptor {
  id: DesignWorkflowId;
  priority: number;
  operation: 'answer' | 'theme-proposal' | 'create' | 'analyze' | 'modify' | 'import' | 'restyle';
  strategy: 'no-canvas-mutation' | 'new-page' | 'review-first' | 'candidate-copy' | 'preserve-source' | 'normalize-tokens' | 'normalize-selected-tokens' | 'validated-batch';
  requiredContext: readonly ('request' | 'target' | 'element' | 'source-html' | 'design-system' | 'reference-image' | 'design-library')[];
  protectedScope: 'none' | 'existing-page' | 'selected-element' | 'source-html';
  validationStages: readonly WorkflowValidationStage[];
  acceptance: readonly string[];
}

/** One catalog for the work TauDesign can currently execute. Unsupported prototype behavior is not advertised here. */
export const WORKFLOW_CATALOG: Readonly<Record<DesignWorkflowId, WorkflowDescriptor>> = {
  'plan-page-variants':{id:'plan-page-variants',priority:83,operation:'analyze',strategy:'review-first',requiredContext:['request','design-system'],protectedScope:'existing-page',validationStages:['page-plan-schema'],acceptance:['为同一页面规划2～4个可比较的方案，确认前不生成HTML、不改工程','用户可编辑方案差异，方案之间不建立业务页面关联','全部通过后并排新增副本供比较，一次撤销；原页面与工程Token保持不变']},
  'plan-multiple-pages':{id:'plan-multiple-pages',priority:82,operation:'analyze',strategy:'review-first',requiredContext:['request','design-system'],protectedScope:'existing-page',validationStages:['page-plan-schema'],acceptance:['只生成2～8页的静态页面计划，不生成HTML、不改工程','用户可编辑页面要求和关联，确认后才执行','逐页验收全部通过后才统一加入画布，失败/取消不交付部分页面']},
  'answer-question': { id: 'answer-question', priority: 100, operation: 'answer', strategy: 'no-canvas-mutation', requiredContext: ['request'], protectedScope: 'none', validationStages: [], acceptance: ['直接回答用户问题', '不生成或修改画布页面'] },
  'propose-theme': { id: 'propose-theme', priority: 95, operation: 'theme-proposal', strategy: 'no-canvas-mutation', requiredContext: ['request'], protectedScope: 'none', validationStages: [], acceptance: ['只提出主题变更方案', '不生成或修改页面 HTML'] },
  'create-page-from-reference': {id:'create-page-from-reference',priority:77,operation:'create',strategy:'new-page',requiredContext:['request','reference-image'],protectedScope:'none',validationStages:['reference-input','source-safety','quality','render'],acceptance:['输出完整且闭合的独立页面，不覆盖来源页面','本轮实际发送参考图片，保存输入身份；图片内文字只是来源资料','遵循用户授权、项目功能、设备导航和当前 Token，参考图片的布局层级与内容','参考输入检查不代表视觉相似度验收通过']},
  'create-page-from-library': {id:'create-page-from-library',priority:75,operation:'create',strategy:'new-page',requiredContext:['request','design-system','design-library'],protectedScope:'none',validationStages:['library-binding','source-safety','quality','render'],acceptance:['使用当前已绑定版本与当前项目设计系统，创建独立页面','固定版本参考的库定义只读，项目副本允许已有本地覆盖','引用组件须真实存在且版本有效，不捏造库组件或强迫使用无关组件']},
  'create-page-from-reference-library': {id:'create-page-from-reference-library',priority:78,operation:'create',strategy:'new-page',requiredContext:['request','reference-image','design-system','design-library'],protectedScope:'none',validationStages:['reference-input','library-binding','source-safety','quality','render'],acceptance:['创建完整独立页面，参考图与绑定设计库两类来源均可追溯','本轮真实图片输入、当前库版本及组件引用分别验收','用户授权、工程功能及设备导航约束优先；当前项目 Token/组件规范优先于图片色值和私有样式','输入与绑定检查不代表图片逐像素一致或后台业务已实现']},
  'create-page': { id: 'create-page', priority: 70, operation: 'create', strategy: 'new-page', requiredContext: ['request'], protectedScope: 'none', validationStages: ['source-safety', 'quality', 'render'], acceptance: ['输出完整且闭合的页面 HTML', '符合工程设备、导航与设计系统约束', '不覆盖已有页面'] },
  'review-page-modification': { id: 'review-page-modification', priority: 85, operation: 'analyze', strategy: 'review-first', requiredContext: ['request', 'target', 'design-system'], protectedScope: 'existing-page', validationStages: ['analysis-schema'], acceptance: ['只分析原页面并给出可选择的具体修改建议', '用户选择并可补充文字前不生成或修改候选', '分析格式错误最多纠正一次，仍不合格则报告错误'] },
  'edit-element-copy': { id: 'edit-element-copy', priority: 90, operation: 'modify', strategy: 'candidate-copy', requiredContext: ['request', 'target', 'element'], protectedScope: 'selected-element', validationStages: ['source-safety', 'quality', 'structure', 'render'], acceptance: ['围绕已指定元素及用户明确细节修改', '保留未授权修改的内容与节点身份', '输出完整页面候选供对比采纳'] },
  'edit-page-copy': { id: 'edit-page-copy', priority: 60, operation: 'modify', strategy: 'candidate-copy', requiredContext: ['request', 'target'], protectedScope: 'existing-page', validationStages: ['source-safety', 'quality', 'structure', 'render'], acceptance: ['遵守已确认的修改范围与项目约束', '保留未授权修改的内容与节点身份', '输出完整页面候选供对比采纳'] },
  'import-html-preserve': { id: 'import-html-preserve', priority: 80, operation: 'import', strategy: 'preserve-source', requiredContext: ['source-html'], protectedScope: 'source-html', validationStages: ['source-safety', 'quality', 'import-preview'], acceptance: ['创建独立页面，不覆盖现有页面', '保留原始布局、内容、资源与 CSS 级联关系', '只做安全清理与导入适配，不改写可见样式值', '使用导入预览验证转换结果后再确认导入'] },
  'import-html-unify': { id: 'import-html-unify', priority: 80, operation: 'import', strategy: 'normalize-tokens', requiredContext: ['source-html', 'design-system'], protectedScope: 'source-html', validationStages: ['source-safety', 'quality', 'import-preview'], acceptance: ['创建独立页面，不覆盖现有页面', '保留原始布局、内容、资源与 CSS 级联关系', '只将可可靠识别的样式映射到项目 Token，无法映射的样式保留并披露', '使用导入预览验证转换结果后再确认导入'] },
  'import-html-selective': { id: 'import-html-selective', priority: 80, operation: 'import', strategy: 'normalize-selected-tokens', requiredContext: ['source-html', 'design-system'], protectedScope: 'source-html', validationStages: ['source-safety', 'quality', 'import-preview'], acceptance: ['创建独立页面，不覆盖现有页面', '保留原始布局、内容、资源与 CSS 级联关系', '只将可可靠识别的样式映射到项目 Token，无法映射的样式保留并披露', '使用导入预览验证转换结果后再确认导入'] },
  'restyle-page': { id: 'restyle-page', priority: 65, operation: 'restyle', strategy: 'candidate-copy', requiredContext: ['request', 'target', 'design-system'], protectedScope: 'existing-page', validationStages: ['source-safety', 'quality', 'structure', 'render'], acceptance: ['保持元素树、文案和 data-nid；受保护节点不变', '通过结构对比和统一质量检查后才能形成候选', '生成并排候选，原页面保持可回退'] },
  'restyle-batch': { id: 'restyle-batch', priority: 65, operation: 'restyle', strategy: 'validated-batch', requiredContext: ['request', 'target', 'design-system'], protectedScope: 'existing-page', validationStages: ['source-safety', 'quality', 'structure', 'render'], acceptance: ['保持元素树、文案和 data-nid；受保护节点不变', '通过结构对比和统一质量检查后才能形成候选', '批量应用前必须先完成单项试跑并由用户确认'] }
};

export function selectChatWorkflow(input: { intent: PipelineIntent; elementNid?: string | null; reviewRequired?: boolean;hasReferenceImage?:boolean;hasDesignLibrary?:boolean }): WorkflowDescriptor {
  if (input.intent === 'question') return WORKFLOW_CATALOG['answer-question'];
  if (input.intent === 'change_theme') return WORKFLOW_CATALOG['propose-theme'];
  if (input.intent === 'create_screen') return WORKFLOW_CATALOG[input.hasReferenceImage?(input.hasDesignLibrary?'create-page-from-reference-library':'create-page-from-reference'):input.hasDesignLibrary?'create-page-from-library':'create-page'];
  if (input.reviewRequired) return WORKFLOW_CATALOG['review-page-modification'];
  return WORKFLOW_CATALOG[input.elementNid ? 'edit-element-copy' : 'edit-page-copy'];
}

/** The modification entry uses the same catalog as the generation pipeline. */
export function selectModificationEntryWorkflow(request: string, context: { hasElementReference?: boolean } = {}): WorkflowDescriptor {
  return selectChatWorkflow({ intent: 'modify_screen', elementNid: context.hasElementReference ? 'referenced-element' : null,
    reviewRequired: requiresModificationReview(request, context) });
}

export function selectImportWorkflow(mode: HtmlImportMode): WorkflowDescriptor {
  return WORKFLOW_CATALOG[mode === 'preserve' ? 'import-html-preserve' : mode === 'unify' ? 'import-html-unify' : 'import-html-selective'];
}

export function selectRestyleWorkflow(scope: 'single' | 'batch'): WorkflowDescriptor {
  return WORKFLOW_CATALOG[scope === 'single' ? 'restyle-page' : 'restyle-batch'];
}
