import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { DesignBriefCard } from '../src/components/chat/DesignBriefCard';
import { MultiPagePlanCard } from '../src/components/chat/MultiPagePlanCard';
import { ModificationReviewCard } from '../src/components/chat/ModificationReviewCard';
import { buildDesignBrief } from '../src/services/ai/designBrief';
import { pageCreationContext } from '../src/services/ai/pageCreationValidation';
import type { MultiPageReview } from '../src/services/ai/multiPageContract';
import type { ModificationReviewState } from '../src/services/ai/modificationReview';
import { t } from '../src/i18n';
import { useLocaleStore } from '../src/stores/useLocaleStore';
import { useProjectStore } from '../src/stores/useProjectStore';
import { techBlueTheme } from '../src/utils/themePresets';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function resetLocale() {
  localStorage.clear();
  useLocaleStore.setState({ locale: 'zh-CN' });
  document.documentElement.lang = 'zh-CN';
}

describe('i18n plan cards', () => {
  beforeEach(resetLocale);
  afterEach(resetLocale);

  test('DesignBriefCard chrome follows locale', () => {
    const brief = buildDesignBrief({
      request: '会员档案',
      device: 'mobile',
      mode: 'light',
      designSystem: techBlueTheme,
      globalDecisions: [],
      components: [],
      contentObligations: [{ kind: 'exact', text: '确认提交', source: 'user' }],
    });
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    try {
      act(() => root.render(<DesignBriefCard brief={brief} />));
      expect(host.textContent).toContain(t('plan.goal', undefined, 'zh-CN'));
      expect(host.textContent).toContain(t('plan.sceneInferred', undefined, 'zh-CN'));
      expect(host.textContent).toContain(t('plan.briefFooter', undefined, 'zh-CN'));

      act(() => useLocaleStore.getState().setLocale('en'));
      expect(host.textContent).toContain(t('plan.goal', undefined, 'en'));
      expect(host.textContent).toContain(t('plan.briefFooter', undefined, 'en'));
      expect(host.textContent).not.toContain(t('plan.briefFooter', undefined, 'zh-CN'));
    } finally {
      act(() => root.unmount());
      host.remove();
    }
  });

  test('MultiPagePlanCard chrome follows locale', () => {
    const prior = useProjectStore.getState();
    useProjectStore.getState().initNewProject({
      name: 'i18n-plan',
      deviceProfile: 'mobile',
      designSystem: techBlueTheme,
      createSpecimen: false,
    });
    const fingerprint = pageCreationContext(useProjectStore.getState());
    const review: MultiPageReview = {
      status: 'ready',
      message: 'Planning summary from pipeline',
      plan: {
        version: 1,
        id: 'plan-test',
        request: 'two pages',
        summary: 'Two pages',
        contextFingerprint: fingerprint,
        originalPageCount: 0,
        pages: [
          { id: 'p1', name: '登录页', requirements: '手机号', links: ['p2'] },
          { id: 'p2', name: '注册页', requirements: '资料', links: [] },
        ],
        planning: { attempts: 1, checkedAt: Date.now() },
      },
    };
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    try {
      act(() =>
        root.render(<MultiPagePlanCard review={review} disabled={false} onConfirm={async () => {}} onCancel={() => {}} />),
      );
      expect(host.textContent).toContain(t('plan.titleMultiPage', undefined, 'zh-CN'));
      expect(host.textContent).toContain(t('plan.confirmGenerate', { count: 2, unit: t('plan.unitPage', undefined, 'zh-CN') }, 'zh-CN'));
      expect(host.querySelector(`[aria-label="${t('plan.sharedTreeAria', undefined, 'zh-CN')}"]`)).toBeTruthy();

      act(() => useLocaleStore.getState().setLocale('en'));
      expect(host.textContent).toContain(t('plan.titleMultiPage', undefined, 'en'));
      expect(host.textContent).toContain(t('plan.confirmGenerate', { count: 2, unit: t('plan.unitPage', undefined, 'en') }, 'en'));
    } finally {
      act(() => root.unmount());
      host.remove();
      useProjectStore.setState(prior, true);
    }
  });

  test('ModificationReviewCard chrome follows locale', () => {
    const review: ModificationReviewState = {
      status: 'ready',
      summary: 'Two items to review',
      items: [
        {
          id: 'a',
          title: '标题区',
          reason: '层级不清',
          change: '加大主标题',
          scope: 'local',
        },
      ],
    };
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    try {
      act(() =>
        root.render(<ModificationReviewCard review={review} onConfirm={async () => {}} onCancel={() => {}} />),
      );
      expect(host.textContent).toContain(t('plan.modTitleReady', undefined, 'zh-CN'));
      expect(host.textContent).toContain(t('plan.modConfirm', undefined, 'zh-CN'));
      expect(host.textContent).toContain(t('plan.modScopeLocal', undefined, 'zh-CN'));
      expect(host.querySelector('textarea')?.getAttribute('placeholder')).toBe(t('plan.modExtraPlaceholder', undefined, 'zh-CN'));

      act(() => useLocaleStore.getState().setLocale('en'));
      expect(host.textContent).toContain(t('plan.modTitleReady', undefined, 'en'));
      expect(host.textContent).toContain(t('plan.modConfirm', undefined, 'en'));
      expect(host.querySelector('textarea')?.getAttribute('placeholder')).toBe(t('plan.modExtraPlaceholder', undefined, 'en'));
    } finally {
      act(() => root.unmount());
      host.remove();
    }
  });
});