import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { LayoutInspector } from '../src/components/inspector/LayoutInspector';
import { PositionSizeInspector } from '../src/components/inspector/PositionSizeInspector';
import { ImageSection } from '../src/components/inspector/ImageSection';
import { useProjectStore } from '../src/stores/useProjectStore';
import { useLocaleStore } from '../src/stores/useLocaleStore';
import { t } from '../src/i18n';

function resetLocale() {
  localStorage.clear();
  useLocaleStore.setState({ locale: 'zh-CN' });
  document.documentElement.lang = 'zh-CN';
}

describe('i18n layout & image inspector chrome', () => {
  beforeEach(resetLocale);
  afterEach(resetLocale);

  test('LayoutInspector and PositionSizeInspector follow locale', () => {
    const oldAct = (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);

  const computedLayout = {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    flexWrap: 'nowrap',
    gap: 'var(--space-2)',
    position: 'static',
    width: 'auto',
    height: 'auto',
    zIndex: 'auto'
  };

    try {
      act(() => {
        root.render(
          <>
            <LayoutInspector
              computedLayout={computedLayout as never}
              declarations={{ display: 'flex' }}
              onStyleChange={() => {}}
            />
            <PositionSizeInspector
              computedBox={{ width: 200, height: 100 } as never}
              computedLayout={computedLayout as never}
              declarations={{}}
              onStyleChange={() => {}}
            />
          </>,
        );
      });
      expect(host.textContent).toContain(t('inspector.layout.sectionTitle', undefined, 'zh-CN'));
      expect(host.textContent).toContain(t('inspector.layout.mainAxisDirection', undefined, 'zh-CN'));
      expect(host.textContent).toContain(t('inspector.layout.sectionSize', undefined, 'zh-CN'));
      expect(host.textContent).toContain(t('inspector.layout.presetFill', undefined, 'zh-CN'));

      act(() => {
        useLocaleStore.getState().setLocale('en');
      });
      expect(host.textContent).toContain(t('inspector.layout.sectionTitle', undefined, 'en'));
      expect(host.textContent).toContain(t('inspector.layout.sectionPosition', undefined, 'en'));
      expect(host.textContent).not.toContain(t('inspector.layout.sectionTitle', undefined, 'zh-CN'));
    } finally {
      act(() => root.unmount());
      host.remove();
      (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = oldAct;
    }
  });

  test('ImageSection labels follow locale', () => {
    const oldAct = (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

    useProjectStore.setState({
      screens: {
        s1: {
          id: 's1',
          name: 'Test',
          position: { x: 0, y: 0 },
          htmlContent: '<img data-nid="img-1" src="x.png" alt="sample">',
        },
      },
    });

    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);

    const sectionProps = {
      screenId: 's1',
      nid: 'img-1',
      tagName: 'IMG',
      declarations: {},
      computed: {},
      onChange: () => {},
    };

    try {
      act(() => {
        root.render(<ImageSection {...sectionProps} />);
      });
      expect(host.textContent).toContain(t('inspector.image.replaceLocal', undefined, 'zh-CN'));
      expect(host.textContent).toContain(t('inspector.image.objectFit', undefined, 'zh-CN'));

      act(() => {
        useLocaleStore.getState().setLocale('en');
      });
      expect(host.textContent).toContain(t('inspector.image.replaceLocal', undefined, 'en'));
      expect(host.textContent).not.toContain(t('inspector.image.replaceLocal', undefined, 'zh-CN'));
    } finally {
      act(() => root.unmount());
      host.remove();
      (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = oldAct;
    }
  });
});