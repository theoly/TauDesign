import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { DesignLibraryImportPanel } from '../src/components/theme/DesignLibraryImportPanel';
import { t } from '../src/i18n';
import { useLocaleStore } from '../src/stores/useLocaleStore';
import { useProjectStore } from '../src/stores/useProjectStore';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function resetLocale() {
  localStorage.clear();
  useLocaleStore.setState({ locale: 'zh-CN' });
  document.documentElement.lang = 'zh-CN';
}

describe('i18n DesignLibraryImportPanel', () => {
  beforeEach(resetLocale);
  afterEach(resetLocale);

  test('library chrome follows locale', () => {
    const project = useProjectStore.getState();
    useProjectStore.getState().initNewProject({ name: 'I18nLibrary', deviceProfile: 'pc', createSpecimen: false });
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    try {
      act(() => {
        root.render(<DesignLibraryImportPanel />);
      });
      expect(host.textContent).toContain(t('library.title', undefined, 'zh-CN'));
      expect(host.textContent).toContain(t('library.modeCopy', undefined, 'zh-CN'));
      act(() => {
        useLocaleStore.getState().setLocale('en');
      });
      expect(host.textContent).toContain(t('library.title', undefined, 'en'));
      expect(host.textContent).toContain(t('library.modeCopy', undefined, 'en'));
      expect(host.textContent).not.toContain('设计库来源与使用方式');
    } finally {
      act(() => root.unmount());
      host.remove();
      useProjectStore.setState(project, true);
    }
  });
});
