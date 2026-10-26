import { DesignSystem } from '../types/designSystem';
import { extractClassWhitelist } from './cssCompiler';
import { getBaseCss, type DeviceProfile } from '../styles/baseCss';
import { parseHtmlCopy } from './htmlDocument';
import type { Screen } from '../types/project';

/** Diagnostic wording only: this never changes the whitelist, findings or severity. */
export type TokenLintContext = 'project-tokens' | 'retained-source';
export function getTokenLintContext(screen: Pick<Screen, 'metadata'>): TokenLintContext {
  const mode = screen.metadata?.importedHtml?.mode;
  return mode === 'preserve' || mode === 'selective' ? 'retained-source' : 'project-tokens';
}

/** 编辑器注入的运行时类，不属于设计基座，不应报为 unknown_class */
const IGNORED_CLASS_PREFIXES = ['aidesign-'];

export interface LintIssue {
  nid: string;
  tagName: string;
  issueType: 'literal_color' | 'literal_radius' | 'literal_spacing' | 'unknown_class' | 'escaped_override';
  description: string;
  rawSnippet: string;
  suggestedFix: string;
}

export interface LintReport {
  totalNodes: number;
  compliantNodes: number;
  complianceRate: number; // 0 - 100
  issues: LintIssue[];
}

export class TokenLintEngine {
  /**
   * Scans HTML content and returns structured lint report
   */
  public static scan(html: string, designSystem: DesignSystem, deviceProfile: DeviceProfile = 'pc', context: TokenLintContext = 'project-tokens'): LintReport {
    const issues: LintIssue[] = [];
    let totalNodes = 0;
    const whitelist = new Set(extractClassWhitelist(getBaseCss(deviceProfile)));

    const { doc, full } = parseHtmlCopy(html);
    const nonCompliant = new Set<Element>();
    for (const element of Array.from(doc.querySelectorAll('*'))) {
      const tag = element.tagName.toLowerCase();
      if (['html', 'head', 'meta', 'title', 'link', 'style', 'script'].includes(tag) || (tag === 'body' && !full)) continue;
      totalNodes++;
      const initialIssueCount = issues.length;
      const nid = element.getAttribute('data-nid') || 'unknown';
      const styleValue = element.getAttribute('style');
      // 1. Check for literal hex or rgb colors in inline style
      if (styleValue) {
        const styleStr = styleValue;
        const hexMatch = styleStr.match(/#([a-fA-F0-9]{3,8})\b/);
        if (hexMatch) {
          issues.push({
            nid,
            tagName: tag,
            issueType: 'literal_color',
            description: context === 'retained-source' ? `保留源页面色值 "${hexMatch[0]}"，不会自动跟随项目主题` : `发现硬编码字面量色值 "${hexMatch[0]}"，破坏主题统一`,
            rawSnippet: hexMatch[0],
            suggestedFix: context === 'retained-source' ? '如需跟随项目主题，请选择统一配色；保留原貌时无需替换' : 'var(--color-primary)'
          });
        }

        const rgbMatch = styleStr.match(/rgba?\([^)]+\)/);
        if (rgbMatch) {
          issues.push({
            nid,
            tagName: tag,
            issueType: 'literal_color',
            description: context === 'retained-source' ? `保留源页面 RGB 声明 "${rgbMatch[0]}"，不会自动跟随项目主题` : `发现字面量 RGB 声明 "${rgbMatch[0]}"`,
            rawSnippet: rgbMatch[0],
            suggestedFix: context === 'retained-source' ? '如需跟随项目主题，请选择统一配色；保留原貌时无需替换' : 'var(--color-surface)'
          });
        }

        // Check for non-ladder border-radius
        const radiusMatch = styleStr.match(/border-radius:\s*([0-9]+px)/);
        if (radiusMatch && !['0px', '4px', '8px', '12px', '16px', '9999px'].includes(radiusMatch[1])) {
          issues.push({
            nid,
            tagName: tag,
            issueType: 'literal_radius',
            description: context === 'retained-source' ? `保留源页面圆角 "${radiusMatch[1]}"，未使用项目圆角 Token` : `非阶梯圆角 "${radiusMatch[1]}"`,
            rawSnippet: radiusMatch[0],
            suggestedFix: context === 'retained-source' ? '如需统一圆角，请选择对应 Token 类别；保留原貌时无需替换' : 'border-radius: var(--radius-md)'
          });
        }
      }

      // 4. T-AE-04: 检测白名单外的类名
      // 这是发现"Prompt 承诺了但 base.css 中不存在"的类名漂移的唯一防线。
      // 此前 unknown_class 只在类型中声明、无任何实现，导致 51 个空转类名长期无人察觉。
      const classValue = element.getAttribute('class');
      if (classValue) {
        const unknown = classValue
          .split(/\s+/)
          .filter(Boolean)
          .filter(c => !whitelist.has(c) && !IGNORED_CLASS_PREFIXES.some(p => c.startsWith(p)));
        for (const c of unknown) {
          issues.push({
            nid,
            tagName: tag,
            issueType: 'unknown_class',
            description: `类名 "${c}" 未由项目基座定义；页面自带 CSS 是否提供样式需另行核验`,
            rawSnippet: c,
            suggestedFix: context === 'retained-source' ? '保留原貌时核对源 CSS 和实际预览；如需统一规范，再映射到项目基座类名' : '使用项目基座类名；若页面自带 CSS，核对其定义及实际预览 (PRD §3.5.6)'
          });
        }
      }
      if (issues.length > initialIssueCount) nonCompliant.add(element);
    }

    const nonCompliantNodes = nonCompliant.size;
    const compliantNodes = Math.max(0, totalNodes - nonCompliantNodes);
    const complianceRate = totalNodes > 0 ? Math.round((compliantNodes / totalNodes) * 100) : 100;

    return {
      totalNodes,
      compliantNodes,
      complianceRate,
      issues
    };
  }

  /**
   * 显式修复：沿用既有颜色角色映射，仅修改样式声明，不推断业务语义。
   */
  public static autoFix(html: string): string {
    const copy = parseHtmlCopy(html);
    for (const element of Array.from(copy.doc.querySelectorAll<HTMLElement>('[style]'))) {
      const style = element.style;
      // 先捕获所有原始声明，避免改写shorthand时改变CSSOM枚举。
      const properties = new Set(Array.from({ length: style.length }, (_, index) => style.item(index)));
      properties.add('border-radius');
      for (const property of properties) {
        const value = style.getPropertyValue(property);
        const priority = style.getPropertyPriority(property);
        if (/#[a-fA-F0-9]{3,8}\b/.test(value)) {
          if (property === 'color') style.setProperty(property, 'var(--color-primary)', priority);
          if (property === 'background' || property === 'background-color') style.setProperty(property, 'var(--color-surface)', priority);
        }
        if (property === 'border-radius' && /^\d+px$/.test(value.trim())) {
          style.setProperty(property, 'var(--radius-md)', priority);
        }
      }
    }
    return copy.serialize();
  }
}

/**
 * 工程级「风格可回溯率」(A2 / T-AE-23)。
 *
 * 换主题时，只有能用 Token 表达的部分会自动回溯到已有页面；硬编码的字面量
 * 永远不跟随。此前 tokenLint 只产出孤立报告、没有产品位置——把它前置为
 * 换肤的决策依据，就从"事后报告"变成了"事前预期管理"。
 *
 * 参见 doc/aesthetic/spec.md §7.4(b)。
 */
export interface RetraceabilityReport {
  /** 0~100，可跟随主题变化的节点占比 */
  rate: number;
  totalNodes: number;
  /** 含硬编码字面量、永远不会跟随主题的节点数 */
  literalNodes: number;
  /** 被 L4 !important 覆盖挡住的节点数 */
  overriddenNodes: number;
  screens: Array<{ screenId: string; screenName: string; rate: number }>;
}

export function computeRetraceability(
  screens: Array<{ id: string; name: string; htmlContent: string }>,
  designSystem: DesignSystem,
  overrideNids: string[],
  deviceProfile: DeviceProfile = 'pc'
): RetraceabilityReport {
  const overridden = new Set(overrideNids);
  let totalNodes = 0;
  let literalNodes = 0;
  let overriddenNodes = 0;
  const perScreen: RetraceabilityReport['screens'] = [];

  for (const sc of screens) {
    const report = TokenLintEngine.scan(sc.htmlContent, designSystem, deviceProfile);
    // 只有字面量类问题代表"永远不跟随主题"；unknown_class 是另一回事
    const literalIds = new Set(
      report.issues
        .filter((i) => i.issueType.startsWith('literal_'))
        .map((i) => i.nid)
    );
    const scOverridden = [...new Set(
      (sc.htmlContent.match(/data-nid="([a-zA-Z0-9]+)"/g) || [])
        .map((m) => m.slice(10, -1))
        .filter((n) => overridden.has(n))
    )];

    const blocked = new Set([...literalIds, ...scOverridden]);
    totalNodes += report.totalNodes;
    literalNodes += literalIds.size;
    overriddenNodes += scOverridden.length;
    perScreen.push({
      screenId: sc.id,
      screenName: sc.name,
      rate: report.totalNodes > 0 ? Math.round(((report.totalNodes - blocked.size) / report.totalNodes) * 100) : 100
    });
  }

  const blockedTotal = literalNodes + overriddenNodes;
  return {
    rate: totalNodes > 0 ? Math.round(((totalNodes - blockedTotal) / totalNodes) * 100) : 100,
    totalNodes,
    literalNodes,
    overriddenNodes,
    screens: perScreen
  };
}

export interface LocateTarget {
  type: 'element' | 'block' | 'screen';
  screenId: string;
  screenName: string;
  nid?: string;
  tagName?: string;
  label: string;
}

export interface ScreenAuditReport {
  screenId: string;
  screenName: string;
  complianceRate: number;
  totalNodes: number;
  issues: LintIssue[];
  targetToLocate: LocateTarget;
}

/**
 * 计算页面的 Token 规范评测报告与智能定位目标
 * - 若页面只有 1 个逃逸元素：定位该具体元素
 * - 若页面有多个逃逸元素：定位包含多个元素的最小父区块（LCA），若无独立区块则定位该页面
 */
export function computeScreenAuditReport(
  screen: Pick<Screen, 'id' | 'name' | 'htmlContent' | 'metadata'>,
  designSystem: DesignSystem,
  deviceProfile: DeviceProfile = 'pc'
): ScreenAuditReport {
  const lint = TokenLintEngine.scan(screen.htmlContent, designSystem, deviceProfile, getTokenLintContext(screen));
  const issues = lint.issues;
  const distinctNids = Array.from(new Set(issues.map((i) => i.nid).filter((n) => n && n !== 'unknown')));

  let targetToLocate: LocateTarget;

  if (distinctNids.length === 0) {
    targetToLocate = {
      type: 'screen',
      screenId: screen.id,
      screenName: screen.name,
      label: `定位该页面: ${screen.name} (完全合规)`
    };
  } else if (distinctNids.length === 1) {
    // 只有单个元素逃逸，定位具体元素
    const singleNid = distinctNids[0];
    const firstIssue = issues.find((i) => i.nid === singleNid);
    const tag = firstIssue?.tagName || 'element';
    targetToLocate = {
      type: 'element',
      screenId: screen.id,
      screenName: screen.name,
      nid: singleNid,
      tagName: tag,
      label: `定位逃逸元素: <${tag}> (nid: ${singleNid})`
    };
  } else {
    // 页面有多个元素逃逸：定位包含多个元素的最小父区块，或只定位该页面
    const parser = new DOMParser();
    const doc = parser.parseFromString(`<body>${screen.htmlContent}</body>`, 'text/html');
    const domElements = distinctNids
      .map((nid) => doc.querySelector(`[data-nid="${nid}"]`))
      .filter((el): el is Element => el !== null);

    if (domElements.length <= 1) {
      targetToLocate = {
        type: 'screen',
        screenId: screen.id,
        screenName: screen.name,
        label: `定位该页面: ${screen.name}`
      };
    } else {
      // 计算 Lowest Common Ancestor (LCA)
      let lca: Element | null = domElements[0].parentElement;
      for (let i = 1; i < domElements.length; i++) {
        const el = domElements[i];
        while (lca && !lca.contains(el)) {
          lca = lca.parentElement;
        }
      }

      // 寻找 lca 向上或本身具备 data-nid 且非 body/html 的父区块
      let parentBlock: Element | null = null;
      let cur: Element | null = lca;
      while (cur && cur !== doc.body && cur.tagName.toLowerCase() !== 'html') {
        if (cur.getAttribute('data-nid')) {
          parentBlock = cur;
          break;
        }
        cur = cur.parentElement;
      }

      if (parentBlock) {
        const blockNid = parentBlock.getAttribute('data-nid')!;
        const blockTag = parentBlock.tagName.toLowerCase();
        const classAttr = parentBlock.getAttribute('class');
        const classSnippet = classAttr ? `.${classAttr.trim().split(/\s+/)[0]}` : '';
        targetToLocate = {
          type: 'block',
          screenId: screen.id,
          screenName: screen.name,
          nid: blockNid,
          tagName: blockTag,
          label: `定位包含 ${distinctNids.length} 个逃逸点的父区块: <${blockTag}${classSnippet}> (nid: ${blockNid})`
        };
      } else {
        // 无单一包含容器（如跨越顶部导航与底部页脚），定位该页面整体
        targetToLocate = {
          type: 'screen',
          screenId: screen.id,
          screenName: screen.name,
          label: `定位该页面: ${screen.name} (逃逸点分散在多处)`
        };
      }
    }
  }

  return {
    screenId: screen.id,
    screenName: screen.name,
    complianceRate: lint.complianceRate,
    totalNodes: lint.totalNodes,
    issues,
    targetToLocate
  };
}

