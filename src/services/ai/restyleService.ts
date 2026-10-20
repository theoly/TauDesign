import { checkGenerationQuality, qualitySummary, type QualityOptions, type QualityReport } from './generationQuality';
import { compareStructure, type StructureDiff } from '../../utils/structureGuard';

/**
 * 批量风格重塑的编排 (A3 / T-AE-27, T-AE-28)。
 *
 * Restyle = Polish 的批量版 + 风格定向版，用来处理「换主题回溯不到」的那部分：
 * Token 能表达的差异切主题就生效了，**类名选择与 DOM 结构不会回溯**
 * （doc/aesthetic/spec.md §7.3），只能逐页重写。
 *
 * 三条编排原则，缺一不可：
 *   1. **组件优先**：一个被 N 个页面复用的组件，重塑成本是 1 次调用而非 N 次；
 *      且只改组件定义再走实例同步，避免同一组件在不同页面被改成不同样子。
 *   2. **强制单页试跑**：未确认效果前不允许批量，这是唯一能防止
 *      「花 N 次调用把整个工程改丑」的机制。
 *   3. **结构守卫**：任何一页结构校验不过就跳过该页，不落盘、不打 Checkpoint。
 */

export type RestyleTargetKind = 'component' | 'screen';

export interface RestyleTarget {
  kind: RestyleTargetKind;
  id: string;
  name: string;
  html: string;
  /** 该目标被多少个页面复用——组件优先排序的依据 */
  reuseCount?: number;
  /** 含 L4 覆盖的节点，其 class 不应被改写 */
  protectedNids?: string[];
}

export interface RestyleOutcome {
  target: RestyleTarget;
  status: 'applied' | 'skipped_structure' | 'skipped_conflict' | 'failed';
  html?: string;
  diff?: StructureDiff;
  qualityReport?: QualityReport;
  message?: string;
}

export interface RestylePlan {
  /** 按「组件优先、复用多的在前」排序后的执行队列 */
  queue: RestyleTarget[];
  /** 试跑目标：队列首项 */
  dryRun: RestyleTarget | null;
  /** 预估 LLM 调用次数 */
  estimatedCalls: number;
  /** 若不走组件优先，需要的调用次数——用于向用户说明省了多少 */
  naiveCalls: number;
}

/**
 * 编排执行顺序 (T-AE-28)。
 *
 * 组件排在页面之前，且复用次数多的优先——重塑一个被 10 个页面用到的卡片组件，
 * 一次调用就让 10 个页面同时受益。
 */
export function planRestyle(
  components: RestyleTarget[],
  screens: RestyleTarget[]
): RestylePlan {
  const comps = [...components].sort((a, b) => (b.reuseCount ?? 0) - (a.reuseCount ?? 0));
  const queue = [...comps, ...screens];
  const naiveCalls = screens.length + comps.reduce((n, c) => n + Math.max(1, c.reuseCount ?? 1), 0);
  return {
    queue,
    dryRun: queue[0] ?? null,
    estimatedCalls: queue.length,
    naiveCalls
  };
}

/**
 * 校验并接受一次改写结果。
 *
 * 结构变化即拒绝——这不是保守，是因为模型删掉一个容器时用户丢的是内容，
 * 而 Restyle 的承诺只是「换个样子」。
 */
export function acceptRestyleResult(target: RestyleTarget, rewritten: string | null, options: QualityOptions = {}): RestyleOutcome {
  if (!rewritten || !rewritten.trim()) {
    return { target, status: 'failed', message: '模型未返回有效 HTML' };
  }

  const diff = compareStructure(target.html, rewritten);
  const qualityReport = checkGenerationQuality(rewritten, { ...options, baselineHtml: target.html, preserveNids: true, protectedNids: target.protectedNids });
  if (!diff.ok) return { target, status: 'skipped_structure', qualityReport, diff, message: diff.reason };
  if (!qualityReport.passed) return { target, status: 'failed', qualityReport, message: qualitySummary(qualityReport) };

  // 文案漂移不阻断，但要如实报告——用户有权知道哪些页面的文字被动过
  return {
    target,
    status: 'applied',
    qualityReport,
    html: rewritten,
    diff,
    message: [diff.textChanged > 0 ? `已应用，但检测到 ${diff.textChanged} 处文案变化，建议核对` : '', qualitySummary(qualityReport)].filter(Boolean).join('；') || undefined
  };
}

/** 汇总批量结果，供执行报告展示 */
export function summarizeOutcomes(outcomes: RestyleOutcome[]) {
  const applied = outcomes.filter((o) => o.status === 'applied');
  const structureRejected = outcomes.filter((o) => o.status === 'skipped_structure');
  const failed = outcomes.filter((o) => o.status === 'failed');
  const textDrift = applied.filter((o) => (o.diff?.textChanged ?? 0) > 0);
  return {
    total: outcomes.length,
    applied: applied.length,
    structureRejected: structureRejected.length,
    failed: failed.length,
    textDrift: textDrift.length,
    details: outcomes
      .filter((o) => o.status !== 'applied' || Boolean(o.message))
      .map((o) => `${o.target.kind === 'component' ? '组件' : '画框'}「${o.target.name}」：${o.message ?? o.status}`)
  };
}
