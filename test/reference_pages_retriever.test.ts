import { describe, expect, test } from 'bun:test';
import { listActiveMothers } from '../src/reference-pages/catalog';
import {
  matchMother,
  MOTHER_SCORE_THRESHOLD,
  scoreMother
} from '../src/reference-pages/retriever';

describe('reference-pages retriever', () => {
  const pool = () => listActiveMothers({ forceReload: true });

  test('device hard filter + pageKind/alias scoring selects pc-list-cards', () => {
    const selection = matchMother(
      {
        device: 'pc',
        pageKind: 'list',
        requestText: '做一个会员列表，用卡片展示并带筛选',
        features: ['filters', 'cards'],
        density: 'standard'
      },
      pool()
    );
    expect(selection).not.toBeNull();
    expect(selection!.mother.meta.id).toBe('pc-list-cards');
    expect(selection!.score).toBeGreaterThanOrEqual(MOTHER_SCORE_THRESHOLD);
    expect(selection!.regions.length).toBeLessThanOrEqual(2);
  });

  test('hasAttachment refuses mother injection', () => {
    expect(
      matchMother(
        {
          device: 'pc',
          pageKind: 'list',
          requestText: '会员列表',
          hasAttachment: true
        },
        pool()
      )
    ).toBeNull();
  });

  test('score below threshold refuses weak kind-only match', () => {
    const mother = pool().find((m) => m.meta.id === 'pc-list-cards')!;
    // pageKind (+35) plus optional quality bonus stays below threshold without aliases/features.
    const score = scoreMother(mother, { device: 'pc', pageKind: 'list', requestText: '' });
    expect(score).toBeLessThan(MOTHER_SCORE_THRESHOLD);
    expect(
      matchMother({ device: 'pc', pageKind: 'list', requestText: '' }, pool())
    ).toBeNull();
  });

  test('mobile device hard-filters out pc mothers', () => {
    const selection = matchMother(
      {
        device: 'mobile',
        pageKind: 'list',
        requestText: '会员列表卡片',
        features: ['filters']
      },
      pool()
    );
    expect(selection).not.toBeNull();
    expect(selection!.mother.meta.device).toBe('mobile');
    expect(selection!.mother.meta.id).toBe('mobile-list-cards');
  });

  test('notApplicableWhen blocks marketing landing phrasing on list mother', () => {
    expect(
      matchMother(
        {
          device: 'pc',
          pageKind: 'list',
          requestText: '会员列表但其实是营销长落地页',
          features: ['filters']
        },
        pool()
      )
    ).toBeNull();
  });

  test('userMotherId manual override skips score threshold', () => {
    const selection = matchMother(
      { device: 'pc', userMotherId: 'pc-list-cards', requestText: '' },
      pool()
    );
    expect(selection?.mother.meta.id).toBe('pc-list-cards');
    expect(selection?.score).toBe(100);
  });
});
