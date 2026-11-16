import type { PageKind } from './designBrief';
import { getPageKindTemplate } from './pageKindTemplates';

/**
 * Generation-time visual checkpoints (E3).
 * Locked before HTML generation so layout risks are named up front —
 * not discovered only after a low-fidelity first pass.
 */

export interface HierarchyPlan {
  /** Largest display / hero type when applicable. */
  display: string;
  title: string;
  body: string;
  muted: string;
}

export interface BeautyCompositionRef {
  kind: 'template' | 'mother';
  /** templateId today; motherId once E4 injector lands. */
  id: string;
}

export interface BeautyPreflight {
  version: 1;
  pageKind: PageKind;
  device: 'pc' | 'mobile';
  visualAnchor: string;
  hierarchyPlan: HierarchyPlan;
  compositionRef: BeautyCompositionRef;
  firstScreenRegions: string[];
  layoutRisks: string[];
}

export interface BeautyPreflightInput {
  pageKind: PageKind;
  device: 'pc' | 'mobile';
  /** Optional mother override once catalog exists. */
  motherId?: string;
}

const HIERARCHY: Record<PageKind, HierarchyPlan> = {
  list: { display: 'none', title: 'text-xl/text-2xl 页标题', body: 'text-md 行主文', muted: 'text-sm 次要元数据' },
  form: { display: 'none', title: 'text-xl 表单标题', body: 'text-md 标签与输入', muted: 'text-sm 帮助与错误' },
  detail: { display: 'text-2xl/3xl 主体名', title: 'text-lg 分组标题', body: 'text-md 属性值', muted: 'text-sm 辅助说明' },
  dashboard: { display: 'text-3xl 关键指标', title: 'text-xl 区块标题', body: 'text-md 图表说明', muted: 'text-sm 趋势脚注' },
  pricing: { display: 'text-3xl 价格数字', title: 'text-xl 套餐名', body: 'text-md 权益项', muted: 'text-sm 备注' },
  conversation: { display: 'none', title: 'text-xl 话题标题', body: 'text-md 长正文', muted: 'text-sm 来源/时间' },
  landing: { display: 'text-4xl/5xl 品牌主张', title: 'text-xl 卖点标题', body: 'text-md 支撑句', muted: 'text-sm 次要说明' },
  settings: { display: 'none', title: 'text-lg 节标题', body: 'text-md 行标签', muted: 'text-sm 说明文案' },
  empty: { display: 'none', title: 'text-xl 空态标题', body: 'text-md 一句说明', muted: 'text-sm 可选次操作' },
  result: { display: 'text-2xl 状态词', title: 'text-lg 结果摘要', body: 'text-md 明细', muted: 'text-sm 提示' },
  unknown: { display: '可选', title: 'text-xl 主标题', body: 'text-md 正文', muted: 'text-sm 辅助' }
};

function layoutRisksFor(pageKind: PageKind, device: 'pc' | 'mobile'): string[] {
  const shared: string[] = [];
  if (device === 'mobile') {
    shared.push('禁止假桌面多列表格挤进 390 宽', '长标签按钮易 overflow：主 CTA 保持 nowrap 且可降权次按钮');
    if (pageKind === 'dashboard') shared.push('指标卡横滑勿与纵向区块重叠');
    if (pageKind === 'landing') shared.push('首屏勿堆统计条/多 CTA；英雄区底圆角归零约定');
    if (pageKind === 'pricing') shared.push('纵向套餐卡避免等权三按钮争抢');
  } else {
    shared.push('container-max 内保持主次字号阶梯，避免满屏同 gap 卡片墙');
    if (pageKind === 'dashboard') shared.push('指标卡须有主次字号，禁止完全等权四卡墙');
    if (pageKind === 'list') shared.push('工具条与筛选条勿与表头重叠');
    if (pageKind === 'landing') shared.push('首屏仅品牌+一句主张+单一主 CTA，禁统计条堆砌');
  }
  if (pageKind === 'form') shared.push('标签/帮助/错误分层，避免控件贴边');
  if (pageKind === 'empty' || pageKind === 'result') shared.push('单一视觉主 CTA，次操作降权');
  return shared;
}

/**
 * Build BeautyPreflight from pageKind × device (template priors).
 * Mother compositionRef is optional until E4 catalog lands.
 */
export function buildBeautyPreflight(input: BeautyPreflightInput): BeautyPreflight {
  const template = getPageKindTemplate(input.pageKind, input.device);
  const compositionRef: BeautyCompositionRef = input.motherId
    ? { kind: 'mother', id: input.motherId }
    : { kind: 'template', id: template.templateId };

  return {
    version: 1,
    pageKind: input.pageKind,
    device: input.device,
    visualAnchor: template.visualAnchor,
    hierarchyPlan: { ...HIERARCHY[input.pageKind] },
    compositionRef,
    firstScreenRegions: [...template.regionRoles],
    layoutRisks: layoutRisksFor(input.pageKind, input.device)
  };
}

/** Compact prompt appendix for E5 injector budgets. */
export function renderBeautyPreflight(preflight: BeautyPreflight): string {
  return [
    '### BEAUTY PREFLIGHT',
    `- visualAnchor: ${preflight.visualAnchor}`,
    `- hierarchy: display=${preflight.hierarchyPlan.display}; title=${preflight.hierarchyPlan.title}; body=${preflight.hierarchyPlan.body}; muted=${preflight.hierarchyPlan.muted}`,
    `- compositionRef: ${preflight.compositionRef.kind}:${preflight.compositionRef.id}`,
    `- firstScreenRegions: ${preflight.firstScreenRegions.join(', ')}`,
    `- layoutRisks: ${preflight.layoutRisks.join('；') || '无'}`
  ].join('\n');
}
