import { describe, expect, test } from 'bun:test';
import { getMotherById } from '../src/reference-pages/catalog';
import { ingestMotherHtml } from '../src/reference-pages/ingest';

describe('reference-pages ingest', () => {
  test('pc-list-cards fixture passes unknown_class=0 and no script', () => {
    const mother = getMotherById('pc-list-cards', { forceReload: true })!;
    const result = ingestMotherHtml({
      bodyHtml: mother.bodyHtml,
      device: mother.meta.device,
      regions: mother.regions,
      meta: { contentFingerprint: mother.meta.contentFingerprint }
    });
    expect(result.unknownClassCount).toBe(0);
    expect(result.issues).toEqual([]);
    expect(result.ok).toBe(true);
  });

  test('rejects script tags', () => {
    const result = ingestMotherHtml({
      bodyHtml: '<main class="p-4"><script>alert(1)</script></main>',
      device: 'pc'
    });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === 'script')).toBe(true);
  });

  test('rejects unknown whitelist classes', () => {
    const result = ingestMotherHtml({
      bodyHtml: '<main class="p-4 totally-fake-class">x</main>',
      device: 'pc'
    });
    expect(result.ok).toBe(false);
    expect(result.unknownClassCount).toBeGreaterThan(0);
    expect(result.issues.some((i) => i.code === 'unknown_class')).toBe(true);
  });
});
