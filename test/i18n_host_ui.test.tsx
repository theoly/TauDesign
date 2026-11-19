import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { LanguageMenu } from '../src/components/common/LanguageMenu';
import { LanguageSwitcher } from '../src/components/common/LanguageSwitcher';
import { Header } from '../src/components/layout/Header';
import { t } from '../src/i18n';
import { useLocaleStore } from '../src/stores/useLocaleStore';
import { useProjectStore } from '../src/stores/useProjectStore';
import { useHistoryStore } from '../src/stores/useHistoryStore';

function resetLocale() {
  localStorage.clear();
  useLocaleStore.setState({ locale: 'zh-CN' });
  document.documentElement.lang = 'zh-CN';
}

describe('i18n host UI', () => {
  beforeEach(resetLocale);
  afterEach(resetLocale);

  test('workspace/header/sidebar keys resolve in zh and en', () => {
    expect(t('header.exportDelivery', undefined, 'zh-CN')).toBe('交付导出');
    expect(t('header.exportDelivery', undefined, 'en')).toBe('Export');
    expect(t('sidebar.screens', undefined, 'en')).toBe('Screens');
    expect(t('workspace.deviceMobile390', undefined, 'en')).toBe('Mobile 390');
    expect(t('workspace.screenCount', { count: 3 }, 'zh-CN')).toBe('3 个页面');
  });

  test('LanguageSwitcher and Header labels follow locale', () => {
    const oldAct = (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const project = useProjectStore.getState();
    const history = useHistoryStore.getState();
    useProjectStore.getState().initNewProject({ name: 'HostUI', deviceProfile: 'pc', createSpecimen: false });

    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);

    try {
      act(() => {
        root.render(
          <>
            <LanguageSwitcher />
            <Header onOpenExport={() => {}} onOpenSettings={() => {}} />
          </>,
        );
      });
      expect(host.textContent).toContain('交付导出');
      expect(host.textContent).toContain('首屏线');
      expect(host.textContent).toContain('工程');
      expect(host.querySelector('[data-testid="language-menu-trigger"]')).not.toBeNull();

      act(() => {
        useLocaleStore.getState().setLocale('en');
      });
      expect(host.textContent).toContain('Export');
      expect(host.textContent).toContain('Viewport guide');
      expect(host.textContent).toContain('Projects');
      expect(host.querySelector('[data-testid="locale-en"]')?.getAttribute('aria-pressed')).toBe('true');
    } finally {
      act(() => root.unmount());
      host.remove();
      useProjectStore.setState(project, true);
      useHistoryStore.setState(history, true);
      (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = oldAct;
    }
  });

  test('LanguageMenu switches locale and persists', () => {
    const oldAct = (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    try {
      act(() => {
        root.render(<LanguageMenu />);
      });
      const enItem = host.querySelector('[data-testid="locale-menu-en"]') as HTMLButtonElement | null;
      expect(enItem).not.toBeNull();
      act(() => {
        enItem?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      expect(useLocaleStore.getState().locale).toBe('en');
      expect(localStorage.getItem('tau.locale')).toBe('en');
      expect(document.documentElement.lang).toBe('en');
    } finally {
      act(() => root.unmount());
      host.remove();
      (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = oldAct;
    }
  });
});
