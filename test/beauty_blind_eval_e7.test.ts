/**
 * generated-ui-beauty · E7 automated beauty eval proxy
 *
 * Spec asks for dual-human preference (24 briefs × PC/Mobile). This suite is the
 * engineering proxy until a human panel runs: every sealed builtin mother is
 * scored with checkGenerationQuality + planBeautyImprove on its target device.
 *
 * Human preference % is NOT inferred from these numbers — see doc/generated-ui-beauty/test.md.
 */
import { describe, expect, test } from 'bun:test';
import { listActiveMothers } from '../src/reference-pages/catalog';
import type { MotherPage } from '../src/reference-pages/types';
import { planBeautyImprove } from '../src/services/ai/beautyImproveLadder';
import {
  isElevatableFinding,
  isLayoutRiskFinding
} from '../src/services/ai/findingPolicy';
import { checkGenerationQuality } from '../src/services/ai/generationQuality';
import type { DeviceProfile } from '../src/styles/baseCss';

const EXPECTED_COUNT = 24;

interface MotherEvalRow {
  id: string;
  device: DeviceProfile;
  kind: string;
  barePassed: boolean;
  bareErrorCount: number;
  bareElevatableCount: number;
  layoutRiskBlocked: boolean;
  shouldRunPolish: boolean;
  ledgerLanes: string[];
  elevatableCodes: string[];
  layoutRiskCodes: string[];
}

function evalMother(mother: MotherPage): MotherEvalRow {
  const device = mother.meta.device as DeviceProfile;
  const bare = checkGenerationQuality(mother.bodyHtml, { deviceProfile: device });
  const plan = planBeautyImprove(mother.bodyHtml, bare.findings);
  // Re-check after ladder plan (L0/L1 currently ledger-only; scores record scaffolding state).
  const post = checkGenerationQuality(plan.html, { deviceProfile: device });
  const elevatable = post.findings.filter(isElevatableFinding);
  const layoutRisk = post.findings.filter(isLayoutRiskFinding);

  return {
    id: mother.meta.id,
    device,
    kind: mother.meta.pageKind,
    barePassed: bare.passed,
    bareErrorCount: bare.findings.filter((f) => f.severity === 'error').length,
    bareElevatableCount: bare.findings.filter(isElevatableFinding).length,
    layoutRiskBlocked: plan.layoutRiskBlocked,
    shouldRunPolish: plan.shouldRunPolish,
    ledgerLanes: plan.repairLedger.map((e) => e.lane),
    elevatableCodes: [...new Set(elevatable.map((f) => f.code))].sort(),
    layoutRiskCodes: [...new Set(layoutRisk.map((f) => f.code))].sort()
  };
}

describe('E7 beauty blind-eval proxy (24 builtin mothers)', () => {
  test('all 24 active mothers pass hard quality; layout-risk rate recorded', () => {
    const mothers = listActiveMothers({ forceReload: true });
    expect(mothers).toHaveLength(EXPECTED_COUNT);

    const rows = mothers.map(evalMother);
    const layoutRiskHits = rows.filter((r) => r.layoutRiskBlocked);
    const hardFails = rows.filter((r) => !r.barePassed);
    const polishCandidates = rows.filter((r) => r.shouldRunPolish && !r.layoutRiskBlocked);

    // Engineering gate: sealed mothers must not ship with hard errors / layout-risk.
    expect(hardFails.map((r) => r.id)).toEqual([]);
    expect(layoutRiskHits.map((r) => r.id)).toEqual([]);

    // Coverage: every mother produces a ladder plan (ledger may be empty when clean).
    expect(rows.every((r) => Array.isArray(r.ledgerLanes))).toBe(true);

    // Stable ordering for human review dump in test.md.
    const summary = {
      motherCount: rows.length,
      hardFailCount: hardFails.length,
      layoutRiskCount: layoutRiskHits.length,
      polishCandidateCount: polishCandidates.length,
      elevatableById: Object.fromEntries(
        rows
          .filter((r) => r.bareElevatableCount > 0)
          .map((r) => [r.id, r.elevatableCodes])
      ),
      rows: rows
        .slice()
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((r) => ({
          id: r.id,
          device: r.device,
          kind: r.kind,
          barePassed: r.barePassed,
          elevatable: r.bareElevatableCount,
          polish: r.shouldRunPolish,
          layoutRisk: r.layoutRiskBlocked
        }))
    };

    // Keep assertion side-effect free for CI; dump is for local/doc capture.
    expect(summary.motherCount).toBe(EXPECTED_COUNT);
    expect(summary.hardFailCount).toBe(0);
    expect(summary.layoutRiskCount).toBe(0);

    // Expose for optional console capture when debugging:
    if (process.env.BEAUTY_E7_DUMP === '1') {
      console.log(JSON.stringify(summary, null, 2));
    }
  });

  test('pc/mobile coverage matches sealed 24-id inventory (13 pc / 11 mobile)', () => {
    const mothers = listActiveMothers({ forceReload: true });
    const pc = mothers.filter((m) => m.meta.device === 'pc');
    const mobile = mothers.filter((m) => m.meta.device === 'mobile');
    // Spec table is 24 IDs total; device split is asymmetric by design (no 12/12 claim).
    expect(pc.length).toBe(13);
    expect(mobile.length).toBe(11);
    expect(pc.length + mobile.length).toBe(EXPECTED_COUNT);
  });
});

