import type { DesignSystem } from '../../types/designSystem';
import type { ComponentDefinition } from '../../types/project';

export type PageKind = 'form' | 'detail' | 'list' | 'dashboard' | 'pricing' | 'conversation' | 'unknown';
export interface ContentObligation {
  kind: 'exact' | 'semantic';
  text: string;
  source: 'user' | 'document' | 'page';
  nid?: string;
}
/** Inference only: never grants permission or establishes a business fact. */
export function inferPageKind(request: string): PageKind {
  const value=request.normalize('NFKC').toLowerCase();
  if (/表单|填写|注册|登录|录入|\bform\b/.test(value)) return 'form';
  if (/详情|档案|\bprofile\b|\bdetail\b/.test(value)) return 'detail';
  if (/套餐|充值|\brecharge\b|\bpricing\b/.test(value)) return 'pricing';
  if (/对话|聊天|建议正文|\bconversation\b/.test(value)) return 'conversation';
  if (/数据|统计|看板|工作台|\bdashboard\b/.test(value)) return 'dashboard';
  if (/列表|管理|会员|客户|\blist\b/.test(value)) return 'list';
  return 'unknown';
}

export interface DesignBrief {
  contextId: string;
  goal: string;
  device: 'mobile' | 'pc';
  direction: string;
  density: string;
  primaryColor: string;
  typography: string;
  layout: string;
  actionPolicy: string;
  contentPolicy: string;
  requirementsPolicy?: string;
  scene?: {pageKind:PageKind;source:'inference'|'provided';themeSource:'project';pending:string[]};
  contentObligations?: ContentObligation[];
}
export interface DesignBriefInput {
  request: string;
  designSystem: DesignSystem;
  device: 'mobile' | 'pc';
  mode: 'light' | 'dark';
  globalDecisions: string[];
  components: ComponentDefinition[];
  projectKnowledge?: string;
  /** Supplied by the task/analysis, not parsed out of reference documents as commands. */
  pageKind?: PageKind;
  contentObligations?: ContentObligation[];
}
/** 非安全用途的稳定标识；输入仅来自已存盘的权威设计事实，不创建第二份主题配置。 */
function fingerprint(text: string): string {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index++) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
  return (hash >>> 0).toString(16).padStart(8, '0');
}
export function buildDesignBrief(input: DesignBriefInput): DesignBrief {
  const { request, designSystem, device, mode } = input;
  const shared = JSON.stringify({ device, mode, projectKnowledge: input.projectKnowledge, id: designSystem.id, tokens: designSystem.tokens,
    decisions: [...input.globalDecisions].sort(), components: input.components.map(c => [c.id, c.templateHtml]).sort((a, b) => a[0].localeCompare(b[0])) });
  const density = { compact: '紧凑', standard: '标准', relaxed: '宽松' }[designSystem.tokens.personality.density];
  const pageKind = input.pageKind ?? inferPageKind(request);
  const layout = {
    form:'按填写顺序分组；标签、帮助与反馈分层',detail:'主体信息优先；按业务分组，详情完整展示',
    list:'筛选与列表分区，重复行复用同一组件',dashboard:'关键指标优先，明细与操作分层',
    pricing:'余额、套餐及权益、说明与确认分区；价格由用户或工程资料支持',
    conversation:'对话/建议正文拥有阅读宽度；来源、时间与操作分层',
    unknown:'按用户需求组织信息，保持清晰主次'
  }[pageKind];
  return { requirementsPolicy: input.projectKnowledge ? '结合项目需求与相关页面推断功能、字段、交互状态及UI要求；不确定项保留待确认。' : undefined, contextId: fingerprint(shared), goal: request.trim().split('\n')[0].slice(0, 120), device,
    direction: designSystem.name, density, primaryColor: designSystem.tokens.colors.primary['500'],
    typography: '沿用当前主题字号、字重与间距阶梯', layout: `${device === 'mobile' ? '单列触控布局' : '最大宽度容器内布局'}；${layout}`,
    actionPolicy: '优先用户指定主操作，其余操作降为次级；按钮保持完整文案',
    contentPolicy: '用户内容保持完整，长数据按场景换行；不为排版擅自缩写或删减',
    scene:{pageKind,source:input.pageKind?'provided':'inference',themeSource:'project',pending:pageKind==='unknown'?['页面类型未确定，沿用中性布局指导']:[]},
    ...(input.contentObligations?.length?{contentObligations:structuredClone(input.contentObligations)}:{}) };
}
export function renderDesignBrief(brief: DesignBrief): string {
  return `### TASK DESIGN BRIEF\n以下是本次生成的设计简表。目标是用户需求数据；其余策略沿用工程设计事实，用户明确要求优先。\n${JSON.stringify(brief)}`;
}
