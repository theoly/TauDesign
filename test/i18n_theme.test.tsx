import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { RestylePanel } from '../src/components/theme/RestylePanel';
import { ThemeEditor } from '../src/components/theme/ThemeEditor';
import { ColorRoleEditor } from '../src/components/theme/ColorRoleEditor';
import { defaultTheme } from '../src/utils/themePresets';
import { t } from '../src/i18n';
import { useLocaleStore } from '../src/stores/useLocaleStore';
import { useProjectStore } from '../src/stores/useProjectStore';
import { useHistoryStore } from '../src/stores/useHistoryStore';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function resetLocale() {
  localStorage.clear();
  useLocaleStore.setState({ locale: 'zh-CN' });
  document.documentElement.lang = 'zh-CN';
}

describe('i18n ThemeEditor', () => {
  beforeEach(resetLocale);
  afterEach(resetLocale);

  test('header title follows locale switch', () => {
    const project = useProjectStore.getState();
    const history = useHistoryStore.getState();
    useProjectStore.getState().initNewProject({ name: 'I18nTheme', deviceProfile: 'pc', createSpecimen: false });

    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);

    try {
      act(() => {
        root.render(<ThemeEditor onClose={() => {}} />);
      });
      expect(host.textContent).toContain(t('theme.title', undefined, 'zh-CN'));
      expect(host.textContent).toContain('设计系统与规范管理中心');

      act(() => {
        useLocaleStore.getState().setLocale('en');
      });
      expect(host.textContent).toContain(t('theme.title', undefined, 'en'));
      expect(host.textContent).toContain('Design system & guidelines');
      expect(host.textContent).not.toContain('设计系统与规范管理中心');
    } finally {
      act(() => root.unmount());
      host.remove();
      useProjectStore.setState(project, true);
      useHistoryStore.setState(history, true);
    }
  });

  test('ColorRoleEditor chrome follows locale', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    try {
      act(() => {
        root.render(
          <ColorRoleEditor tokens={defaultTheme.tokens} mode="light" onChange={() => {}} />,
        );
      });
      expect(host.textContent).toContain(t('theme.colorRoleHeading', { mode: t('theme.colorRoleModeLight', undefined, 'zh-CN') }, 'zh-CN'));
      expect(host.textContent).toContain(t('theme.colorRoleExpandAdvanced', undefined, 'zh-CN'));

      act(() => {
        useLocaleStore.getState().setLocale('en');
      });
      expect(host.textContent).toContain(t('theme.colorRoleHeading', { mode: t('theme.colorRoleModeLight', undefined, 'en') }, 'en'));
      expect(host.textContent).toContain(t('theme.colorRoleExpandAdvanced', undefined, 'en'));
      expect(host.textContent).not.toContain(t('theme.colorRoleExpandAdvanced', undefined, 'zh-CN'));
    } finally {
      act(() => root.unmount());
      host.remove();
    }
  });

  test('RestylePanel plan and progress chrome follow locale', () => {
    const oldAct = (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const project = useProjectStore.getState();
    const history = useHistoryStore.getState();
    useProjectStore.getState().initNewProject({ name: 'I18nRestyle', deviceProfile: 'pc', createSpecimen: false });
    useProjectStore.getState().addScreen(
      { name: 'Home', htmlContent: '<main data-nid="aaaaaaaa" class="card">Hi</main>', position: { x: 0, y: 0 } },
      's',
    );

    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);

    try {
      act(() => {
        root.render(<RestylePanel scope="s" onClose={() => {}} />);
      });
      expect(host.textContent).toContain(t('theme.restylePolishTitle', undefined, 'zh-CN'));
      expect(host.textContent).toContain(t('theme.restyleEstimateCalls', { count: 2 }, 'zh-CN'));
      expect(host.textContent).toContain(t('theme.restylePlanWarnSingle', { name: 'Home' }, 'zh-CN'));

      act(() => {
        useLocaleStore.getState().setLocale('en');
      });
      expect(host.textContent).toContain(t('theme.restylePolishTitle', undefined, 'en'));
      expect(host.textContent).toContain(t('theme.restyleEstimateCalls', { count: 2 }, 'en'));
      expect(host.textContent).toContain(t('theme.restylePlanWarnSingle', { name: 'Home' }, 'en'));
      expect(host.textContent).not.toContain(t('theme.restylePolishTitle', undefined, 'zh-CN'));
    } finally {
      act(() => root.unmount());
      host.remove();
      useProjectStore.setState(project, true);
      useHistoryStore.setState(history, true);
      (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = oldAct;
    }
  });
});
