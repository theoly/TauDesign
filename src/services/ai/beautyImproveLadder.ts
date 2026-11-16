/**
 * Beauty improve ladder scaffolding (E6).
 * Plans L0→L2 attempts from quality findings; does not claim delivery by itself.
 *
 * Wire point (create path): after prepareNewPageWithRepair / before commitCreatedScreen
 * in canvasToolExecutor.create_screen (executeAsync). Call planBeautyImprove(html, findings);
 * if plan.shouldRunPolish && no layoutRiskBlocked, invoke existing polish/restyle only when
 * that pipeline is already available for the task — otherwise keep ledger + draft path.
 * Prefer this API + tests over fragile full auto-polish until polish budget is wired.
 */

import type { QualityFinding } from './generationQuality';
import {
  isElevatableFinding,
  isLayoutRiskFinding,
  type RepairLane
} from './findingPolicy';

export type BeautyImproveLane = 'L0' | 'L1' | 'L2';

export interface RepairLedgerEntry {
  lane: BeautyImproveLane;
  findingCodes: string[];
  passed: boolean;
  /** Optional human-readable note for stubs / skips. */
  note?: string;
}

export interface BeautyImprovePlan {
  html: string;
  findings: QualityFinding[];
  repairLedger: RepairLedgerEntry[];
  /** True when elevatable aesthetics remain after L0/L1 stubs and polish is warranted. */
  shouldRunPolish: boolean;
  /** Layout-risk blockers present — L0–L2 must not wash delivery. */
  layoutRiskBlocked: boolean;
  modelCallBudgetRemaining: number;
}

const MODEL_CALL_BUDGET = 2; // L1 + L2 + L4 share ≤2 model calls / task

function elevatableByLane(findings: QualityFinding[], lane: RepairLane): QualityFinding[] {
  return findings.filter(f => isElevatableFinding(f) && f.repairLane === lane);
}

/**
 * Plan L0→L2 beauty improve attempts.
 * L0/L1 are high-confidence stubs by default (ledger entries, no silent HTML mutation)
 * unless a deterministic class fix is obviously safe later.
 */
export function planBeautyImprove(html: string, findings: QualityFinding[]): BeautyImprovePlan {
  const layoutRisk = findings.filter(isLayoutRiskFinding);
  const layoutRiskBlocked = layoutRisk.length > 0;
  const repairLedger: RepairLedgerEntry[] = [];
  let shouldRunPolish = false;
  let modelCallBudgetRemaining = MODEL_CALL_BUDGET;

  if (layoutRiskBlocked) {
    repairLedger.push({
      lane: 'L0',
      findingCodes: layoutRisk.map(f => f.code),
      passed: false,
      note: 'layout-risk blocker：禁止 L0–L2 洗白交付'
    });
    repairLedger.push({
      lane: 'L1',
      findingCodes: layoutRisk.map(f => f.code),
      passed: false,
      note: 'skipped: layout-risk'
    });
    repairLedger.push({
      lane: 'L2',
      findingCodes: layoutRisk.map(f => f.code),
      passed: false,
      note: 'skipped: layout-risk (shouldRunPolish=false)'
    });
    return {
      html,
      findings,
      repairLedger,
      shouldRunPolish: false,
      layoutRiskBlocked: true,
      modelCallBudgetRemaining
    };
  }

  // L0 — deterministic / text-layout class fixes (stub: no-op with ledger).
  const l0Targets = [
    ...elevatableByLane(findings, 'deterministic'),
    ...findings.filter(f => f.code === 'component_line_break' || f.code === 'compressed_label')
  ];
  const l0Codes = [...new Set(l0Targets.map(f => f.code))];
  repairLedger.push({
    lane: 'L0',
    findingCodes: l0Codes,
    passed: l0Codes.length === 0,
    note:
      l0Codes.length === 0
        ? 'no deterministic elevatable findings'
        : 'stub: high-confidence textLayoutRepair / class fix not applied (ledger only)'
  });

  // L1 — controlled style repair eligibility (stub; reuse proposeStyleRepair when wired).
  const l1Targets = elevatableByLane(findings, 'style');
  const l1Codes = l1Targets.map(f => f.code);
  const l1Eligible = l1Codes.length > 0 && modelCallBudgetRemaining > 0;
  repairLedger.push({
    lane: 'L1',
    findingCodes: l1Codes,
    passed: !l1Eligible,
    note: l1Eligible
      ? 'stub: expand proposeStyleRepair eligibility; model call reserved'
      : 'no style-lane elevatable findings or budget exhausted'
  });
  if (l1Eligible) modelCallBudgetRemaining -= 1;

  // L2 — polish when elevatable aesthetics / polish-lane findings remain.
  const polishTargets = [
    ...elevatableByLane(findings, 'polish'),
    ...findings.filter(
      f =>
        isElevatableFinding(f) &&
        (f.code.startsWith('aesthetic_') || f.code.startsWith('visual_'))
    )
  ];
  const remainingElevatable = findings.filter(isElevatableFinding);
  const polishCodes = [...new Set(polishTargets.map(f => f.code))];
  shouldRunPolish =
    remainingElevatable.length > 0 &&
    (polishCodes.length > 0 || elevatableByLane(findings, 'polish').length > 0) &&
    modelCallBudgetRemaining > 0;

  repairLedger.push({
    lane: 'L2',
    findingCodes: polishCodes.length ? polishCodes : remainingElevatable.map(f => f.code),
    passed: !shouldRunPolish,
    note: shouldRunPolish
      ? 'flag shouldRunPolish=true for existing polish/restyle hook'
      : 'no polish-lane elevatable remaining or budget exhausted'
  });
  if (shouldRunPolish) modelCallBudgetRemaining -= 1;

  return {
    html,
    findings,
    repairLedger,
    shouldRunPolish,
    layoutRiskBlocked: false,
    modelCallBudgetRemaining
  };
}
