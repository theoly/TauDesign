import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  FailedDraftCard,
  FailedDraftFixBlockersDock,
  resolveFixBlockersDockOwner,
} from '../src/components/chat/FailedDraftCard';
import { findingSummary } from '../src/components/chat/QualityFindings';
import { draftRepairTargets, makeFailedPageDraft } from '../src/services/ai/qualityDraft';
import type { SavedQualityDraft } from '../src/services/storage/qualityDraftRepository';
import { t } from '../src/i18n';
import { useLocaleStore } from '../src/stores/useLocaleStore';
import { defaultTheme } from '../src/utils/themePresets';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function resetLocale() {
  localStorage.clear();
  useLocaleStore.setState({ locale: 'zh-CN' });
  document.documentElement.lang = 'zh-CN';
}

const bad =
  '<main class="container-max relative"><section><h2>操作区</h2><button class="btn btn-primary absolute"><svg class="icon"><path d="M1 1L2 2"/></svg><span></span></button></section><section>' +
  Array.from({ length: 15 }, (_, i) => `<p>保留${i}</p>`).join('') +
  '</section></main>';

function blockedDraft(status: SavedQualityDraft['status'] = 'blocked'): SavedQualityDraft {
  const draft = makeFailedPageDraft(bad, 'context', 'binding', { designSystem: defaultTheme })!;
  return {
    version: 1,
    id: `draft-${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`,
    projectId: `project-${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`,
    createdAt: Date.now(),
    draft,
    request: '设计会员中心',
    projectContext: 'project-context',
    decision: {
      action: 'create_screen',
      targetScreenId: null,
      styleReferenceScreenId: null,
      elementNid: null,
      referenceSource: null,
      reason: 'test',
    },
    status,
  };
}

describe('i18n FailedDraftCard', () => {
  beforeEach(resetLocale);
  afterEach(resetLocale);

  test('failed draft chrome follows locale switch', () => {
    const value = blockedDraft();
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);

    try {
      act(() => {
        root.render(
          <FailedDraftCard
            value={value}
            saved
            onSuggest={() => {}}
            onRepair={() => {}}
            onRegenerate={() => {}}
          />,
        );
      });

      const section = host.querySelector('section');
      expect(section?.getAttribute('aria-label')).toBe(t('failedDraft.sectionAria', undefined, 'zh-CN'));
      expect(host.textContent).toContain(t('failedDraft.titleBlocked', undefined, 'zh-CN'));
      expect(host.querySelector('[data-testid="failed-draft-finding-summary"]')?.textContent).toBe(
        findingSummary(value.draft.quality.findings),
      );
      expect(host.textContent).toContain(t('failedDraft.savedHint', undefined, 'zh-CN'));
      expect(host.textContent).toContain(t('failedDraft.adoptionHint', undefined, 'zh-CN'));
      expect(host.textContent).toContain(
        t('failedDraft.labelsSummary', { count: draftRepairTargets(value.draft).length }, 'zh-CN'),
      );
      expect(host.querySelector('[data-testid="failed-draft-action-labels"]')).toBeTruthy();
      expect(host.textContent).toContain(t('failedDraft.localRepairSummary', undefined, 'zh-CN'));
      expect(host.textContent).toContain(t('failedDraft.viewSource', undefined, 'zh-CN'));
      expect(host.textContent).toContain(t('failedDraft.regenerate', undefined, 'zh-CN'));
      expect(host.textContent).toContain(t('failedDraft.fixBlockers', undefined, 'zh-CN'));
      expect(host.textContent).toContain(t('failedDraft.fixBlockersHint', undefined, 'zh-CN'));
      expect(host.querySelector('input[placeholder]')?.getAttribute('placeholder')).toBe(
        t('failedDraft.labelPlaceholder', undefined, 'zh-CN'),
      );
      expect(host.querySelector('textarea')?.getAttribute('placeholder')).toBe(
        t('failedDraft.repairInstructionPlaceholder', undefined, 'zh-CN'),
      );
      expect(host.querySelector('textarea')?.getAttribute('aria-label')).toBe(
        t('failedDraft.repairInstructionAria', undefined, 'zh-CN'),
      );

      act(() => {
        useLocaleStore.getState().setLocale('en');
      });

      expect(section?.getAttribute('aria-label')).toBe(t('failedDraft.sectionAria', undefined, 'en'));
      expect(host.textContent).toContain(t('failedDraft.titleBlocked', undefined, 'en'));
      expect(host.querySelector('[data-testid="failed-draft-finding-summary"]')?.textContent).toBe(
        findingSummary(value.draft.quality.findings),
      );
      expect(host.textContent).toContain(t('failedDraft.savedHint', undefined, 'en'));
      expect(host.textContent).toContain(t('failedDraft.adoptionHint', undefined, 'en'));
      expect(host.textContent).toContain(
        t('failedDraft.labelsSummary', { count: draftRepairTargets(value.draft).length }, 'en'),
      );
      expect(host.textContent).toContain(t('failedDraft.localRepairSummary', undefined, 'en'));
      expect(host.textContent).toContain(t('failedDraft.viewSource', undefined, 'en'));
      expect(host.textContent).toContain(t('failedDraft.regenerate', undefined, 'en'));
      expect(host.textContent).toContain(t('failedDraft.fixBlockers', undefined, 'en'));
      expect(host.textContent).toContain(t('failedDraft.fixBlockersHint', undefined, 'en'));
      expect(host.querySelector('input[placeholder]')?.getAttribute('placeholder')).toBe(
        t('failedDraft.labelPlaceholder', undefined, 'en'),
      );
      expect(host.textContent).not.toContain('Prefer restoring original copy; fill unclear buttons yourself.');
      expect(host.querySelector('textarea')?.getAttribute('placeholder')).toBe(
        t('failedDraft.repairInstructionPlaceholder', undefined, 'en'),
      );
      expect(host.textContent).not.toContain('页面已生成，暂未通过验收');
      expect(host.textContent).not.toContain('AI建议文案（限一次）');
      expect(host.textContent).not.toContain('从头重新生成');

      const viewSource = Array.from(host.querySelectorAll('button')).find((btn) =>
        btn.textContent === t('failedDraft.viewSource', undefined, 'en'),
      );
      expect(viewSource).toBeTruthy();
      act(() => {
        viewSource!.click();
      });
      expect(host.textContent).toContain(t('failedDraft.hideSource', undefined, 'en'));
      expect(host.querySelector(`[aria-label="${t('failedDraft.draftSourceAria', undefined, 'en')}"]`)).toBeTruthy();
    } finally {
      act(() => root.unmount());
      host.remove();
    }
  });

  test('fix blockers button repairs only mapped error regions', () => {
    const html =
      '<main data-nid="root"><section data-nid="region" aria-label="基础资料"><h2>基础资料</h2><p data-nid="keep-a">改写甲</p></section><section data-nid="other">' +
      Array.from({ length: 15 }, (_, i) => `<p data-nid="p${i}">保留${i}</p>`).join('') +
      '</section></main>';
    const draft = makeFailedPageDraft(html, 'context', 'binding', { designSystem: defaultTheme })!;
    draft.quality = {
      passed: false,
      findings: [
        {
          code: 'redesign_content_missing',
          severity: 'error',
          nid: 'keep-a',
          message: '整页重设计遗漏了未经授权删除或改写的原业务文案。',
          actual: '原文甲',
          expected: '保留',
        },
      ],
    };
    const value: SavedQualityDraft = {
      ...blockedDraft(),
      draft,
      request: '修复业务文案',
    };
    const repairs: Array<{ labels: unknown; region?: { nids: string[]; instruction: string } }> = [];
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    try {
      act(() => {
        root.render(
          <FailedDraftCard
            value={value}
            saved
            onSuggest={() => {}}
            onRepair={(labels, region) => repairs.push({ labels, region })}
            onRegenerate={() => {}}
          />,
        );
      });
      const button = Array.from(host.querySelectorAll('button')).find((btn) =>
        btn.textContent?.includes(t('failedDraft.fixBlockers', undefined, 'zh-CN')),
      );
      expect(button).toBeTruthy();
      expect((button as HTMLButtonElement).disabled).toBe(false);
      act(() => {
        button!.click();
      });
      expect(repairs).toHaveLength(1);
      expect(repairs[0].labels).toEqual([]);
      expect(repairs[0].region).toEqual({
        nids: ['region'],
        instruction: expect.stringContaining('keep-a'),
      });
    } finally {
      act(() => root.unmount());
      host.remove();
    }
  });

  test('resolved title and unsaved hint follow locale', () => {
    const value = blockedDraft('resolved');
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);

    try {
      act(() => {
        root.render(
          <FailedDraftCard
            value={value}
            saved={false}
            onSuggest={() => {}}
            onRepair={() => {}}
            onRegenerate={() => {}}
          />,
        );
      });

      expect(host.textContent).toContain(t('failedDraft.titleResolved', undefined, 'zh-CN'));
      expect(host.textContent).toContain(t('failedDraft.unsavedHint', undefined, 'zh-CN'));

      act(() => {
        useLocaleStore.getState().setLocale('en');
      });

      expect(host.textContent).toContain(t('failedDraft.titleResolved', undefined, 'en'));
      expect(host.textContent).toContain(t('failedDraft.unsavedHint', undefined, 'en'));
      expect(host.textContent).not.toContain('原失败草稿 · 已完成修复');
      expect(host.textContent).not.toContain('草稿尚未保存至磁盘。');
    } finally {
      act(() => root.unmount());
      host.remove();
    }
  });

  test('fix-blockers dock stays actionable for the latest blocked draft', () => {
    const html =
      '<main data-nid="root"><section data-nid="region" aria-label="基础资料"><h2>基础资料</h2><p data-nid="keep-a">改写甲</p></section><section data-nid="other">' +
      Array.from({ length: 15 }, (_, i) => `<p data-nid="p${i}">保留${i}</p>`).join('') +
      '</section></main>';
    const draft = makeFailedPageDraft(html, 'context', 'binding', { designSystem: defaultTheme })!;
    draft.quality = {
      passed: false,
      findings: [
        {
          code: 'redesign_content_missing',
          severity: 'error',
          nid: 'keep-a',
          message: '整页重设计遗漏了未经授权删除或改写的原业务文案。',
          actual: '原文甲',
          expected: '保留',
        },
      ],
    };
    const value: SavedQualityDraft = { ...blockedDraft(), draft, request: '修复业务文案' };
    const repairs: Array<{ labels: unknown; region?: { nids: string[]; instruction: string } }> = [];
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    try {
      act(() => {
        root.render(
          <>
            <FailedDraftCard
              value={value}
              saved
              compactActions
              onSuggest={() => {}}
              onRepair={() => {}}
              onRegenerate={() => {}}
            />
            <FailedDraftFixBlockersDock
              value={value}
              onRepair={(labels, region) => repairs.push({ labels, region })}
            />
          </>,
        );
      });
      expect(host.querySelector('[data-testid="failed-draft-fix-blockers"]')).toBeNull();
      const dock = host.querySelector('[data-testid="failed-draft-fix-blockers-dock"]');
      expect(dock).toBeTruthy();
      expect(dock?.textContent).toContain(t('failedDraft.fixBlockersDockTitle', undefined, 'zh-CN'));
      const button = Array.from(host.querySelectorAll('button')).find((btn) =>
        btn.textContent?.includes(t('failedDraft.fixBlockers', undefined, 'zh-CN')),
      );
      expect(button).toBeTruthy();
      act(() => {
        button!.click();
      });
      expect(repairs).toHaveLength(1);
      expect(repairs[0].region?.nids).toEqual(['region']);
    } finally {
      act(() => root.unmount());
      host.remove();
    }
  });

  test('new user turn or in-flight analysis cancels the Fix-blockers dock owner', () => {
    const blocked = { id: 'blocked', sender: 'assistant', qualityDraft: { status: 'blocked' } };
    expect(resolveFixBlockersDockOwner([blocked])?.id).toBe('blocked');
    expect(
      resolveFixBlockersDockOwner([
        blocked,
        { id: 'ask', sender: 'user', text: '再分析一次' },
        { id: 'analyzing', sender: 'assistant', isGenerating: true, text: '' },
      ]),
    ).toBeNull();
    expect(
      resolveFixBlockersDockOwner([
        blocked,
        { id: 'ok', sender: 'assistant', text: '已给出普通答复', qualityDraft: undefined },
      ]),
    ).toBeNull();
    expect(
      resolveFixBlockersDockOwner([
        blocked,
        { id: 'busy', sender: 'assistant', qualityDraftBusy: true } as { id: string; sender: string; qualityDraft?: { status: string } },
      ])?.id,
    ).toBe('blocked');
  });
});
