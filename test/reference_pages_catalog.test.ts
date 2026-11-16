import { describe, expect, test } from 'bun:test';
import {
  getMotherById,
  listActiveMothers,
  listInvalidBuiltinMothers,
  loadBuiltinMothers
} from '../src/reference-pages/catalog';
import { computeMotherContentFingerprint } from '../src/reference-pages/fingerprint';

describe('reference-pages catalog', () => {
  test('loads sealed builtin mothers and validates fingerprints', () => {
    const mothers = loadBuiltinMothers({ forceReload: true });
    expect(mothers.length).toBeGreaterThanOrEqual(1);

    const cards = getMotherById('pc-list-cards', { forceReload: true });
    expect(cards).toBeDefined();
    expect(cards!.meta.status).toBe('active');
    expect(cards!.meta.device).toBe('pc');
    expect(cards!.meta.pageKind).toBe('list');
    expect(cards!.meta.origin).toBe('builtin');
    expect(cards!.bodyHtml.length).toBeGreaterThan(100);
    expect(cards!.regions.length).toBeGreaterThanOrEqual(1);

    const actual = computeMotherContentFingerprint(cards!.bodyHtml, cards!.regions);
    expect(actual).toBe(cards!.meta.contentFingerprint);
  });

  test('listActiveMothers returns only active sealed entries', () => {
    const active = listActiveMothers({ forceReload: true });
    expect(active.every((m) => m.meta.status === 'active')).toBe(true);
    expect(active.some((m) => m.meta.id === 'pc-list-cards')).toBe(true);
    // WIP dirs without fingerprints are skipped, not fatal.
    const invalid = listInvalidBuiltinMothers();
    expect(invalid.every((item) => item.reason.length > 0)).toBe(true);
  });
});
