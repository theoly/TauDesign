import { readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { listActiveMothers, listInvalidBuiltinMothers, loadBuiltinMothers } from '../src/reference-pages/catalog';

const EXPECTED_IDS = [
  'pc-list-table',
  'pc-list-cards',
  'mobile-list-cards',
  'pc-form-grouped',
  'pc-form-wizard',
  'mobile-form-sheet',
  'pc-detail-profile',
  'mobile-detail-hero',
  'mobile-detail-tabs',
  'pc-dashboard-metrics',
  'pc-dashboard-sidebar',
  'mobile-dashboard-stack',
  'pc-pricing-compare',
  'mobile-pricing-stack',
  'pc-conversation-suggest',
  'mobile-conversation-reading',
  'pc-landing-hero',
  'mobile-landing-hero',
  'pc-settings-sections',
  'mobile-settings-grouped',
  'pc-empty-state',
  'mobile-empty-state',
  'pc-result-success',
  'mobile-result-status'
] as const;

const MOTHERS_ROOT = join(import.meta.dir, '../src/reference-pages/mothers');

describe('reference-pages catalog count (E4b)', () => {
  test('mothers directory contains exactly 24 builtin ids with meta+body', () => {
    const dirs = readdirSync(MOTHERS_ROOT)
      .filter((name) => statSync(join(MOTHERS_ROOT, name)).isDirectory())
      .sort();
    expect(dirs).toEqual([...EXPECTED_IDS].sort());
    expect(dirs).toHaveLength(24);

    for (const id of EXPECTED_IDS) {
      expect(existsSync(join(MOTHERS_ROOT, id, 'meta.json'))).toBe(true);
      expect(existsSync(join(MOTHERS_ROOT, id, 'body.html'))).toBe(true);
    }
  });

  test('catalog loads 24 active sealed mothers with no invalid leftovers', () => {
    const mothers = loadBuiltinMothers({ forceReload: true });
    const active = listActiveMothers({ forceReload: true });
    const invalid = listInvalidBuiltinMothers({ forceReload: true });

    expect(invalid).toEqual([]);
    expect(mothers).toHaveLength(24);
    expect(active).toHaveLength(24);
    expect(active.map((m) => m.meta.id).sort()).toEqual([...EXPECTED_IDS].sort());
    expect(active.every((m) => m.meta.origin === 'builtin')).toBe(true);
    expect(active.every((m) => m.meta.status === 'active')).toBe(true);
    expect(active.every((m) => m.meta.version === '1.0.0')).toBe(true);
  });
});
