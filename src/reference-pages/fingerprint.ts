import { contentFingerprint } from '../services/ai/designWorkflow';
import type { MotherRegionExcerpt } from './types';

/** Stable non-crypto fingerprint over body + sorted region role/html pairs. */
export function computeMotherContentFingerprint(
  bodyHtml: string,
  regions: MotherRegionExcerpt[] = []
): string {
  const sorted = [...regions].sort((a, b) => a.role.localeCompare(b.role));
  const payload =
    bodyHtml + sorted.map((region) => `${region.role}\n${region.html}`).join('');
  return contentFingerprint(payload);
}
