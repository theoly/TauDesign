/**
 * generated-ui-beauty · E6 visual gates + improve ladder
 */
import { describe, expect, test } from 'bun:test';
import { inspectAestheticHeuristics } from '../src/services/ai/aestheticHeuristics';
import { inspectVisualBlockers } from '../src/services/ai/visualBlockerRules';
import { planBeautyImprove } from '../src/services/ai/beautyImproveLadder';
import { checkGenerationQuality } from '../src/services/ai/generationQuality';
import {
  findingDisposition,
  isElevatableFinding,
  isLayoutRiskFinding
} from '../src/services/ai/findingPolicy';
import { isQualityFinding } from '../src/services/ai/evidenceSchema';

const flatPage = `
<main class="col gap-2 p-4">
  <div class="col gap-2">
    <span class="text-md">会员管理</span>
    <span class="text-md">全部用户列表与筛选</span>
    <button class="btn">打开详情面板</button>
    <button class="btn">导出报表数据</button>
  </div>
</main>`;

const texturedPage = `
<main class="col gap-6 p-6 bg-surface-alt">
  <section class="col gap-2">
    <h1 class="text-3xl font-semibold">会员</h1>
    <p class="text-md text-secondary">本周新增与活跃概览</p>
  </section>
  <div class="card shadow-card p-5 col gap-3">
    <span class="text-xl font-semibold">概览</span>
    <span class="text-sm text-muted">更新于今日</span>
    <button class="btn btn-primary nowrap">新建</button>
  </div>
</main>`;

const longHeadingPage = `
<main class="col gap-4 p-4">
  <span class="text-xs text-muted">PRODUCT OVERVIEW</span>
  <h1 class="text-2xl font-semibold">这是一个明显超过八个汉字的展示标题并且带句号。</h1>
  <button class="btn btn-primary nowrap">提交</button>
</main>`;

const mobileWideGrid = `
<main class="grid-4 gap-4 p-4">
  <div class="card p-3">A</div>
  <div class="card p-3">B</div>
  <div class="card p-3">C</div>
  <div class="card p-3">D</div>
</main>`;

describe('E6 aesthetic heuristics', () => {
  test('flags flat type scale, gap, surface, and primary CTA', () => {
    const findings = inspectAestheticHeuristics(flatPage);
    const codes = new Set(findings.map(f => f.code));
    expect(codes.has('aesthetic_type_scale')).toBe(true);
    expect(codes.has('aesthetic_section_gap')).toBe(true);
    expect(codes.has('aesthetic_surface_depth')).toBe(true);
    expect(codes.has('aesthetic_primary_cta_missing')).toBe(true);
    expect(codes.has('aesthetic_zero_texture_hierarchy')).toBe(true);
    expect(findings.every(f => f.severity === 'warning' && f.repairLane)).toBe(true);
  });

  test('accepts textured hierarchical page without flat combo', () => {
    const findings = inspectAestheticHeuristics(texturedPage);
    const codes = new Set(findings.map(f => f.code));
    expect(codes.has('aesthetic_type_scale')).toBe(false);
    expect(codes.has('aesthetic_surface_depth')).toBe(false);
    expect(codes.has('aesthetic_zero_texture_hierarchy')).toBe(false);
    expect(codes.has('aesthetic_primary_cta_missing')).toBe(false);
  });

  test('flags equal-weight card wall when four+ identical cards', () => {
    const html = `<main class="grid-2 gap-4">${'<div class="card p-4 col gap-2"><span class="text-md">项</span></div>'.repeat(4)}</main>`;
    const findings = inspectAestheticHeuristics(html);
    expect(findings.some(f => f.code === 'aesthetic_equal_card_wall')).toBe(true);
  });
});

describe('E6 visual blocker rules', () => {
  test('flags long heading and decorative eyebrow conservatively', () => {
    const findings = inspectVisualBlockers(longHeadingPage);
    const codes = new Set(findings.map(f => f.code));
    expect(codes.has('visual_heading_too_long')).toBe(true);
    expect(codes.has('visual_decorative_eyebrow')).toBe(true);
    expect(findings.every(f => f.severity === 'warning' && f.repairLane === 'deterministic')).toBe(true);
  });

  test('does not flag short heading without eyebrow', () => {
    const findings = inspectVisualBlockers(`<main><h1 class="text-2xl">会员中心</h1><button class="btn btn-primary nowrap">新建</button></main>`);
    expect(findings.some(f => f.code === 'visual_heading_too_long')).toBe(false);
    expect(findings.some(f => f.code === 'visual_decorative_eyebrow')).toBe(false);
  });

  test('flags long btn label missing nowrap class only', () => {
    const findings = inspectVisualBlockers(`<main><button class="btn">打开详情面板</button><button class="btn nowrap">提交</button></main>`);
    expect(findings.some(f => f.code === 'visual_btn_missing_nowrap')).toBe(true);
    expect(findings.filter(f => f.code === 'visual_btn_missing_nowrap')).toHaveLength(1);
  });
});

describe('E6 finding policy + generationQuality wiring', () => {
  test('elevatable aesthetics do not hard-fail create quality', () => {
    const report = checkGenerationQuality(flatPage, { deviceProfile: 'pc' });
    expect(report.passed).toBe(true);
    const elevatable = report.findings.filter(isElevatableFinding);
    expect(elevatable.length).toBeGreaterThan(0);
    expect(elevatable.every(f => findingDisposition(f) === 'elevatable')).toBe(true);
    expect(elevatable.every(isQualityFinding)).toBe(true);
  });

  test('mobile wide grid is layout-risk blocker', () => {
    const report = checkGenerationQuality(mobileWideGrid, { deviceProfile: 'mobile' });
    expect(report.passed).toBe(false);
    const risk = report.findings.find(f => f.code === 'layout_risk_device_contract')!;
    expect(isLayoutRiskFinding(risk)).toBe(true);
    expect(findingDisposition(risk)).toBe('layout-risk');
  });

  test('zero texture+hierarchy combo stays elevatable polish lane', () => {
    const report = checkGenerationQuality(flatPage, { deviceProfile: 'pc' });
    const combo = report.findings.find(f => f.code === 'aesthetic_zero_texture_hierarchy')!;
    expect(combo.severity).toBe('warning');
    expect(combo.repairLane).toBe('polish');
    expect(findingDisposition(combo)).toBe('elevatable');
  });
});

describe('E6 beauty improve ladder', () => {
  test('planBeautyImprove flags polish for elevatable aesthetics', () => {
    const findings = [
      ...inspectAestheticHeuristics(flatPage),
      ...inspectVisualBlockers(flatPage)
    ];
    const plan = planBeautyImprove(flatPage, findings);
    expect(plan.layoutRiskBlocked).toBe(false);
    expect(plan.shouldRunPolish).toBe(true);
    expect(plan.repairLedger.map(e => e.lane)).toEqual(['L0', 'L1', 'L2']);
    expect(plan.repairLedger.every(e => Array.isArray(e.findingCodes))).toBe(true);
    expect(plan.modelCallBudgetRemaining).toBeLessThanOrEqual(2);
  });

  test('layout-risk blocks L0–L2 wash and polish flag', () => {
    const report = checkGenerationQuality(mobileWideGrid, { deviceProfile: 'mobile' });
    const plan = planBeautyImprove(mobileWideGrid, report.findings);
    expect(plan.layoutRiskBlocked).toBe(true);
    expect(plan.shouldRunPolish).toBe(false);
    expect(plan.repairLedger.some(e => e.note?.includes('layout-risk'))).toBe(true);
  });

  test('clean textured page needs no polish ladder work', () => {
    const findings = inspectAestheticHeuristics(texturedPage);
    const plan = planBeautyImprove(texturedPage, findings);
    expect(plan.shouldRunPolish).toBe(false);
    expect(plan.layoutRiskBlocked).toBe(false);
  });
});
