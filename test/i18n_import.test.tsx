import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { HtmlImportDialog } from '../src/components/canvas/HtmlImportDialog';
import { t } from '../src/i18n';
import { useLocaleStore } from '../src/stores/useLocaleStore';
import { useProjectStore } from '../src/stores/useProjectStore';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function resetLocale() {
  localStorage.clear();
  useLocaleStore.setState({ locale: 'zh-CN' });
  document.documentElement.lang = 'zh-CN';
}

describe('i18n HtmlImportDialog', () => {
  beforeEach(resetLocale);
  afterEach(resetLocale);

  test('import dialog chrome follows locale switch', () => {
    const project = useProjectStore.getState();
    useProjectStore.getState().initNewProject({ name: 'I18nImport', deviceProfile: 'pc', createSpecimen: false });

    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);

    try {
      act(() => {
        root.render(<HtmlImportDialog onClose={() => {}} />);
      });

      expect(host.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe(
        t('importHtml.dialogAria', undefined, 'zh-CN'),
      );
      expect(host.textContent).toContain(t('importHtml.title', undefined, 'zh-CN'));
      expect(host.textContent).toContain(t('importHtml.hint', undefined, 'zh-CN'));
      expect(host.textContent).toContain(t('importHtml.pickHtml', undefined, 'zh-CN'));
      expect(host.textContent).toContain(t('importHtml.addResources', undefined, 'zh-CN'));
      expect(host.textContent).toContain(t('importHtml.emptyPreview', undefined, 'zh-CN'));
      expect(host.textContent).toContain(t('importHtml.confirm', undefined, 'zh-CN'));
      expect(host.textContent).toContain(t('common.cancel', undefined, 'zh-CN'));

      act(() => {
        useLocaleStore.getState().setLocale('en');
      });

      expect(host.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe(
        t('importHtml.dialogAria', undefined, 'en'),
      );
      expect(host.textContent).toContain(t('importHtml.title', undefined, 'en'));
      expect(host.textContent).toContain(t('importHtml.hint', undefined, 'en'));
      expect(host.textContent).toContain(t('importHtml.pickHtml', undefined, 'en'));
      expect(host.textContent).toContain(t('importHtml.addResources', undefined, 'en'));
      expect(host.textContent).toContain(t('importHtml.emptyPreview', undefined, 'en'));
      expect(host.textContent).toContain(t('importHtml.confirm', undefined, 'en'));
      expect(host.textContent).toContain(t('common.cancel', undefined, 'en'));
      expect(host.textContent).not.toContain('导入 HTML 页面');
      expect(host.textContent).not.toContain('确认导入');
    } finally {
      act(() => root.unmount());
      host.remove();
      useProjectStore.setState(project, true);
    }
  });
});
