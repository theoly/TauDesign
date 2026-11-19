import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { FailedDraftCard } from '../src/components/chat/FailedDraftCard';
import { makeFailedPageDraft } from '../src/services/ai/qualityDraft';
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
      expect(host.textContent).toContain(
        t('failedDraft.blockerCount', { count: value.draft.quality.findings.filter((f) => f.severity === 'error').length }, 'zh-CN'),
      );
      expect(host.textContent).toContain(
        t('failedDraft.warningCount', { count: value.draft.quality.findings.filter((f) => f.severity === 'warning').length }, 'zh-CN'),
      );
      expect(host.textContent).toContain(t('failedDraft.savedHint', undefined, 'zh-CN'));
      expect(host.textContent).toContain(t('failedDraft.adoptionHint', undefined, 'zh-CN'));
      expect(host.textContent).toContain(t('failedDraft.aiSuggestOnce', undefined, 'zh-CN'));
      expect(host.textContent).toContain(t('failedDraft.confirmLabelsRepair', undefined, 'zh-CN'));
      expect(host.textContent).toContain(t('failedDraft.localRepairSummary', undefined, 'zh-CN'));
      expect(host.textContent).toContain(t('failedDraft.viewSource', undefined, 'zh-CN'));
      expect(host.textContent).toContain(t('failedDraft.regenerate', undefined, 'zh-CN'));
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
      expect(host.textContent).toContain(
        t('failedDraft.blockerCount', { count: value.draft.quality.findings.filter((f) => f.severity === 'error').length }, 'en'),
      );
      expect(host.textContent).toContain(
        t('failedDraft.warningCount', { count: value.draft.quality.findings.filter((f) => f.severity === 'warning').length }, 'en'),
      );
      expect(host.textContent).toContain(t('failedDraft.savedHint', undefined, 'en'));
      expect(host.textContent).toContain(t('failedDraft.adoptionHint', undefined, 'en'));
      expect(host.textContent).toContain(t('failedDraft.aiSuggestOnce', undefined, 'en'));
      expect(host.textContent).toContain(t('failedDraft.confirmLabelsRepair', undefined, 'en'));
      expect(host.textContent).toContain(t('failedDraft.localRepairSummary', undefined, 'en'));
      expect(host.textContent).toContain(t('failedDraft.viewSource', undefined, 'en'));
      expect(host.textContent).toContain(t('failedDraft.regenerate', undefined, 'en'));
      expect(host.querySelector('input[placeholder]')?.getAttribute('placeholder')).toBe(
        t('failedDraft.labelPlaceholder', undefined, 'en'),
      );
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
});
