import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { DesignSections, TypographySection } from '../src/components/inspector/DesignSections';
import { useLocaleStore } from '../src/stores/useLocaleStore';

function resetLocale() {
  localStorage.clear();
  useLocaleStore.setState({ locale: 'zh-CN' });
  document.documentElement.lang = 'zh-CN';
}

describe('i18n DesignSections chrome', () => {
  beforeEach(resetLocale);
  afterEach(resetLocale);

  test('DesignSections and TypographySection follow locale', () => {
    const oldAct = (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);

    try {
      act(() => {
        root.render(
          <>
            <DesignSections
              tagName="div"
              declarations={{ display: 'flex', transform: 'none' }}
              computed={{ display: 'flex', 'flex-direction': 'row' }}
              width={200}
              height={100}
              onChange={() => {}}
            />
            <TypographySection declarations={{}} computed={{}} onChange={() => {}} />
          </>,
        );
      });
      expect(host.textContent).toContain('位置与变换');
      expect(host.textContent).toContain('尺寸与布局');
      expect(host.textContent).toContain('文本');
      expect(host.textContent).toContain('Flex 自动布局');

      act(() => {
        useLocaleStore.getState().setLocale('en');
      });
      expect(host.textContent).toContain('Position & transform');
      expect(host.textContent).toContain('Size & layout');
      expect(host.textContent).toContain('Typography');
      expect(host.textContent).toContain('Flex');
      expect(host.textContent).not.toContain('位置与变换');
      expect(host.textContent).not.toContain('尺寸与布局');
    } finally {
      act(() => root.unmount());
      host.remove();
      (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = oldAct;
    }
  });
});