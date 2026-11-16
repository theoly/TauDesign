import { extractClassWhitelist } from '../utils/cssCompiler';
import { getBaseCss } from '../styles/baseCss';
import { TokenLintEngine } from '../utils/tokenLint';
import { techBlueTheme } from '../utils/themePresets';
import { computeMotherContentFingerprint } from './fingerprint';
import type {
  MotherIngestIssue,
  MotherIngestResult,
  MotherPageMeta,
  MotherRegionExcerpt
} from './types';

const SCRIPT_RE = /<script\b/i;
const EXTERNAL_SCRIPT_SRC_RE = /<script\b[^>]*\bsrc\s*=/i;

export interface MotherIngestInput {
  bodyHtml: string;
  device: 'pc' | 'mobile';
  regions?: MotherRegionExcerpt[];
  /** When provided, fingerprint must match body+regions. */
  meta?: Pick<MotherPageMeta, 'contentFingerprint'>;
}

/**
 * Mother ingest gate: unknown_class=0, no script tags, whitelist from getBaseCss(device).
 * Render sampling stays for E4b; this is the deterministic TokenLint path.
 */
export function ingestMotherHtml(input: MotherIngestInput): MotherIngestResult {
  const issues: MotherIngestIssue[] = [];
  const { bodyHtml, device } = input;
  const regions = input.regions ?? [];
  const fragments = [bodyHtml, ...regions.map((r) => r.html)];

  for (const html of fragments) {
    if (EXTERNAL_SCRIPT_SRC_RE.test(html) || SCRIPT_RE.test(html)) {
      issues.push({
        code: 'script',
        message: 'Mother HTML must not include script tags'
      });
      break;
    }
  }

  if (input.meta) {
    const actual = computeMotherContentFingerprint(bodyHtml, regions);
    if (actual !== input.meta.contentFingerprint) {
      issues.push({
        code: 'fingerprint_mismatch',
        message: 'contentFingerprint does not match body+regions',
        detail: `expected=${input.meta.contentFingerprint} actual=${actual}`
      });
    }
  }

  // Force whitelist derivation for the target device (TokenLint uses the same source).
  const whitelist = new Set(extractClassWhitelist(getBaseCss(device)));
  void whitelist;

  let unknownClassCount = 0;
  for (const html of fragments) {
    const report = TokenLintEngine.scan(html, techBlueTheme, device);
    const unknown = report.issues.filter((issue) => issue.issueType === 'unknown_class');
    unknownClassCount += unknown.length;
    for (const issue of unknown) {
      issues.push({
        code: 'unknown_class',
        message: issue.description,
        detail: issue.rawSnippet
      });
    }
  }

  return {
    ok: issues.length === 0 && unknownClassCount === 0,
    unknownClassCount,
    issues
  };
}
