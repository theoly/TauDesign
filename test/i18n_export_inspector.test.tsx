import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { ExportModal } from '../src/components/export/ExportModal';
import { PropertyInspector } from '../src/components/inspector/PropertyInspector';
import { useLocaleStore } from '../src/stores/useLocaleStore';
import { useProjectStore } from '../src/stores/useProjectStore';
import { useHistoryStore } from '../src/stores/useHistoryStore';

function resetLocale() {
  localStorage.clear();
  useLocaleStore.setState({ locale: 'zh-CN' });
  document.documentElement.lang = 'zh-CN';
}

describe('i18n export + inspector chrome', () => {
  beforeEach(resetLocale);
  afterEach(resetLocale);

  test('ExportModal and PropertyInspector empty state follow locale', () => {
    const oldAct = (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const project = useProjectStore.getState();
    const history = useHistoryStore.getState();
    useProjectStore.getState().initNewProject({ name: 'I18nExport', deviceProfile: 'pc', createSpecimen: false });

    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);

    try {
      act(() => {
        root.render(
          <>
            <ExportModal onClose={() => {}} />
            <PropertyInspector />
          </>,
        );
      });
      expect(host.textContent).toContain('单页交付导出中心');
      expect(host.textContent).toContain('未选中任何元素');
      expect(host.textContent).toContain('自包含 HTML 单页');

      act(() => {
        useLocaleStore.getState().setLocale('en');
      });
      expect(host.textContent).toContain('Single-page export & handoff');
      expect(host.textContent).toContain('No element selected');
      expect(host.textContent).toContain('Self-contained HTML page');
    } finally {
      act(() => root.unmount());
      host.remove();
      useProjectStore.setState(project, true);
      useHistoryStore.setState(history, true);
      (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = oldAct;
    }
  });
});
