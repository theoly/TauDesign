import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { DesignTaskRecords } from '../src/components/chat/DesignTaskRecords';
import { t } from '../src/i18n';
import { useLocaleStore } from '../src/stores/useLocaleStore';
import { useProjectStore } from '../src/stores/useProjectStore';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function resetLocale() {
  localStorage.clear();
  useLocaleStore.setState({ locale: 'zh-CN' });
  document.documentElement.lang = 'zh-CN';
}

async function settleBusy(host: HTMLElement) {
  const deadline = Date.now() + 5000;
  do {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
  } while (
    (host.textContent?.includes(t('tasks.busy', undefined, 'zh-CN')) ||
      host.textContent?.includes(t('tasks.busy', undefined, 'en'))) &&
    Date.now() < deadline
  );
}

describe('i18n DesignTaskRecords', () => {
  beforeEach(resetLocale);
  afterEach(resetLocale);

  test('task records chrome follows locale switch', async () => {
    const project = useProjectStore.getState();
    useProjectStore.getState().initNewProject({ name: 'I18nTasks', deviceProfile: 'pc', createSpecimen: false });

    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);

    try {
      act(() => {
        root.render(<DesignTaskRecords running={false} onClose={() => {}} />);
      });
      await settleBusy(host);

      expect(host.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe(
        t('tasks.dialogAria', undefined, 'zh-CN'),
      );
      expect(host.textContent).toContain(t('tasks.title', undefined, 'zh-CN'));
      expect(host.textContent).toContain(t('tasks.intro', undefined, 'zh-CN'));
      expect(host.textContent).toContain(t('tasks.empty', undefined, 'zh-CN'));
      expect(host.textContent).toContain(t('tasks.selectHint', undefined, 'zh-CN'));
      expect(host.textContent).toContain(t('common.close', undefined, 'zh-CN'));
      expect(t('tasks.statusDraft', undefined, 'zh-CN')).toContain('待完成');
      expect(t('tasks.statusBlocked', undefined, 'en')).toContain('pass');
      expect(t('tasks.syncDelivery', undefined, 'en')).toContain('Sync');
      expect(t('tasks.recoverDraft', undefined, 'en')).toContain('Recover');
      expect(t('tasks.overBudget', undefined, 'en')).toContain('budget');

      act(() => {
        useLocaleStore.getState().setLocale('en');
      });
      await settleBusy(host);

      expect(host.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe(
        t('tasks.dialogAria', undefined, 'en'),
      );
      expect(host.textContent).toContain(t('tasks.title', undefined, 'en'));
      expect(host.textContent).toContain(t('tasks.intro', undefined, 'en'));
      expect(host.textContent).toContain(t('tasks.selectHint', undefined, 'en'));
      expect(host.textContent).toContain(t('common.close', undefined, 'en'));
      expect(host.textContent).not.toContain('设计任务记录');
      expect(host.textContent).not.toContain('不会自动修改画布');
    } finally {
      act(() => root.unmount());
      host.remove();
      useProjectStore.setState(project, true);
    }
  });
});
