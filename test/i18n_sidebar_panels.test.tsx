import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { ScreensPanel } from '../src/components/layout/panels/ScreensPanel';
import { HistoryPanel } from '../src/components/layout/panels/HistoryPanel';
import { DesignSystemPanel } from '../src/components/layout/panels/DesignSystemPanel';
import { useLocaleStore } from '../src/stores/useLocaleStore';
import { useProjectStore } from '../src/stores/useProjectStore';
import { useHistoryStore } from '../src/stores/useHistoryStore';

function resetLocale() {
  localStorage.clear();
  useLocaleStore.setState({ locale: 'zh-CN' });
  document.documentElement.lang = 'zh-CN';
}

describe('i18n sidebar panels', () => {
  beforeEach(resetLocale);
  afterEach(resetLocale);

  test('Screens / History / Design chrome follow locale', () => {
    const oldAct = (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const project = useProjectStore.getState();
    const history = useHistoryStore.getState();
    useProjectStore.getState().initNewProject({ name: 'I18nPanels', deviceProfile: 'pc', createSpecimen: false });

    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);

    try {
      act(() => {
        root.render(
          <>
            <ScreensPanel />
            <HistoryPanel />
            <DesignSystemPanel onOpenThemeEditor={() => {}} onOpenRestyle={() => {}} />
          </>,
        );
      });
      expect(host.textContent).toContain('页面画框');
      expect(host.textContent).toContain('撤销栈');
      expect(host.textContent).toContain('完整主题编辑器');
      expect(host.textContent).toContain('主按钮背景');
      expect(host.textContent).toContain('参考设备');

      act(() => {
        useLocaleStore.getState().setLocale('en');
      });
      expect(host.textContent).toContain('Screens');
      expect(host.textContent).toContain('Undo stack');
      expect(host.textContent).toContain('Full theme editor');
      expect(host.textContent).toContain('Primary button background');
      expect(host.textContent).toContain('Reference device');
    } finally {
      act(() => root.unmount());
      host.remove();
      useProjectStore.setState(project, true);
      useHistoryStore.setState(history, true);
      (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = oldAct;
    }
  });
});
