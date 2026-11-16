import { describe, expect, test } from 'bun:test';
import { getMotherById } from '../src/reference-pages/catalog';
import {
  buildMotherReferenceExample,
  DEFAULT_MOTHER_INJECT_BUDGET
} from '../src/reference-pages/injector';
import { matchMother } from '../src/reference-pages/retriever';

describe('reference-pages injector', () => {
  test('builds REFERENCE EXAMPLE with id/version and mother-page receipt', () => {
    const selection = matchMother({
      device: 'pc',
      pageKind: 'list',
      requestText: '会员列表卡片筛选',
      features: ['filters', 'cards'],
      density: 'standard'
    });
    expect(selection).not.toBeNull();

    const result = buildMotherReferenceExample(selection!);
    expect(result.text).toContain('### REFERENCE EXAMPLE (mother: pc-list-cards@v1.0.0)');
    expect(result.text).toContain('list/pc');
    expect(result.text.length).toBeLessThanOrEqual(DEFAULT_MOTHER_INJECT_BUDGET);
    expect(result.receipt).toEqual({
      kind: 'mother-page',
      id: 'pc-list-cards',
      version: '1.0.0',
      fingerprint: selection!.mother.meta.contentFingerprint
    });
  });

  test('respects tight budget by clipping region excerpts', () => {
    const mother = getMotherById('pc-list-cards', { forceReload: true })!;
    const result = buildMotherReferenceExample(
      {
        mother,
        score: 80,
        regions: mother.regions.slice(0, 2),
        reason: 'test'
      },
      400
    );
    expect(result.text.length).toBeLessThanOrEqual(400);
    expect(result.text).toContain('pc-list-cards@v1.0.0');
    expect(result.receipt.kind).toBe('mother-page');
  });
});
