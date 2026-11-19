import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { AppearanceSections } from '../src/components/inspector/AppearanceSections';
import { useLocaleStore } from '../src/stores/useLocaleStore';
import { t } from '../src/i18n';

function resetLocale() {
  localStorage.clear();
  useLocaleStore.setState({ locale: 'zh-CN' });
  document.documentElement.lang = 'zh-CN';
}

describe('i18n AppearanceSections chrome', () => {
  beforeEach(resetLocale);
  afterEach(resetLocale);

  test('section titles follow locale', () => {
    const oldAct = (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);

    try {
      act(() => {
        root.render(
          <AppearanceSections declarations={{}} computed={{}} onChange={() => {}} />,
        );
      });
      expect(host.textContent).toContain(t('inspector.appearance.sectionLayer', undefined, 'zh-CN'));
      expect(host.textContent).toContain(t('inspector.appearance.sectionFill', undefined, 'zh-CN'));
      expect(host.textContent).toContain(t('inspector.appearance.gradientTool', undefined, 'zh-CN'));

      act(() => {
        useLocaleStore.getState().setLocale('en');
      });
      expect(host.textContent).toContain(t('inspector.appearance.sectionLayer', undefined, 'en'));
      expect(host.textContent).toContain(t('inspector.appearance.sectionFill', undefined, 'en'));
      expect(host.textContent).not.toContain(t('inspector.appearance.sectionLayer', undefined, 'zh-CN'));
    } finally {
      act(() => root.unmount());
      host.remove();
      (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = oldAct;
    }
  });
});