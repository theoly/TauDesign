import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { ProjectDocumentsPanel } from '../src/components/layout/panels/ProjectDocumentsPanel';
import { useLocaleStore } from '../src/stores/useLocaleStore';
import { useProjectStore } from '../src/stores/useProjectStore';

function resetLocale() {
  localStorage.clear();
  useLocaleStore.setState({ locale: 'zh-CN' });
  document.documentElement.lang = 'zh-CN';
}

describe('i18n project documents', () => {
  beforeEach(resetLocale);
  afterEach(resetLocale);

  test('documents chrome follows locale', () => {
    const oldAct = (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const project = useProjectStore.getState();
    useProjectStore.getState().initNewProject({ name: 'I18nDocs', deviceProfile: 'pc', createSpecimen: false });

    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);

    try {
      act(() => {
        root.render(<ProjectDocumentsPanel />);
      });
      expect(host.textContent).toContain('新建文档');
      expect(host.textContent).toContain('AI 整理');

      act(() => {
        useLocaleStore.getState().setLocale('en');
      });
      expect(host.textContent).toContain('New document');
      expect(host.textContent).toContain('AI organize');
    } finally {
      act(() => root.unmount());
      host.remove();
      useProjectStore.setState(project, true);
      (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = oldAct;
    }
  });
});
