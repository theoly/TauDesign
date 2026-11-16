/**
 * Builtin mother catalog — loads the sealed static bundle (browser + Bun safe).
 * Source files remain under mothers/{id}/; regenerate bundle after sealing bodies.
 */
import { BUILTIN_MOTHER_BUNDLE } from './builtinMotherBundle';
import { computeMotherContentFingerprint } from './fingerprint';
import type { MotherPage } from './types';

let cached: MotherPage[] | null = null;
let cachedInvalid: Array<{ id: string; reason: string }> | null = null;

function validateBundle(): { mothers: MotherPage[]; invalid: Array<{ id: string; reason: string }> } {
  const mothers: MotherPage[] = [];
  const invalid: Array<{ id: string; reason: string }> = [];
  for (const mother of BUILTIN_MOTHER_BUNDLE) {
    const id = mother.meta?.id ?? '(missing)';
    if (!mother.meta?.contentFingerprint) {
      invalid.push({ id, reason: 'contentFingerprint missing (WIP skipped until E4b seals)' });
      continue;
    }
    const fingerprint = computeMotherContentFingerprint(mother.bodyHtml, mother.regions ?? []);
    if (mother.meta.contentFingerprint !== fingerprint) {
      invalid.push({
        id,
        reason: `fingerprint mismatch meta=${mother.meta.contentFingerprint} actual=${fingerprint}`
      });
      continue;
    }
    mothers.push(mother);
  }
  return { mothers, invalid };
}

/** Load builtin mothers from the sealed bundle; validates fingerprints. */
export function loadBuiltinMothers(options: { forceReload?: boolean } = {}): MotherPage[] {
  if (cached && !options.forceReload) return cached;
  const { mothers, invalid } = validateBundle();
  cached = mothers;
  cachedInvalid = invalid;
  return mothers;
}

/** WIP / invalid builtin entries skipped by the catalog (fingerprint or schema). */
export function listInvalidBuiltinMothers(
  options?: { forceReload?: boolean }
): Array<{ id: string; reason: string }> {
  if (!cachedInvalid || options?.forceReload) loadBuiltinMothers(options);
  return cachedInvalid ?? [];
}

/** Active builtin mothers only (status=active). */
export function listActiveMothers(options?: { forceReload?: boolean }): MotherPage[] {
  return loadBuiltinMothers(options).filter((m) => m.meta.status === 'active');
}

export function getMotherById(
  id: string,
  options?: { forceReload?: boolean }
): MotherPage | undefined {
  return loadBuiltinMothers(options).find((m) => m.meta.id === id);
}

/** Test helper: replace or clear the in-memory catalog cache. */
export function __setCatalogForTests(mothers: MotherPage[] | null): void {
  cached = mothers;
  cachedInvalid = mothers === null ? null : [];
}
