import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { AssetModal } from '../src/components/assets/AssetModal';
import { AssetsPanel } from '../src/components/layout/panels/AssetsPanel';
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

function clickModalTab(host: HTMLElement, tabLabel: string) {
  const btn = Array.from(host.querySelectorAll('button')).find((b) =>
    (b.textContent ?? '').includes(tabLabel),
  );
  expect(btn, `tab button for ${tabLabel}`).toBeDefined();
  act(() => btn!.click());
}

describe('i18n assets chrome', () => {
  beforeEach(resetLocale);
  afterEach(resetLocale);

  test('AssetModal and AssetsPanel chrome follow locale', () => {
    const project = useProjectStore.getState();
    const history = useHistoryStore.getState();
    useProjectStore.getState().initNewProject({ name: 'I18nAssets', deviceProfile: 'pc', createSpecimen: false });

    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);

    try {
      act(() => {
        root.render(
          <>
            <AssetModal onClose={() => {}} />
            <AssetsPanel onOpenAssetCenter={() => {}} />
          </>,
        );
      });

      expect(host.textContent).toContain(t('assets.title', undefined, 'zh-CN'));
      expect(host.textContent).toContain(t('assets.tabComponents', undefined, 'zh-CN'));
      expect(host.textContent).toContain(t('assets.tabImages', undefined, 'zh-CN'));
      expect(host.textContent).toContain(t('assets.openCenter', undefined, 'zh-CN'));
      expect(host.textContent).toContain(t('assets.panelImages', undefined, 'zh-CN'));
      expect(host.textContent).toContain(t('assets.emptyLibrary', undefined, 'zh-CN'));
      expect(host.textContent).toContain(t('assets.emptyComponentsTitle', undefined, 'zh-CN'));
      expect(host.textContent).toContain(t('common.close', undefined, 'zh-CN'));
      clickModalTab(host, t('assets.tabImages', undefined, 'zh-CN'));
      expect(host.textContent).toContain(t('assets.uploadZoneTitle', undefined, 'zh-CN'));
      clickModalTab(host, t('assets.tabIcons', undefined, 'zh-CN'));
      expect(host.textContent).toContain(t('assets.builtinIconUser', undefined, 'zh-CN'));
      clickModalTab(host, t('assets.tabMothers', undefined, 'zh-CN'));
      expect(host.textContent).toContain(t('assets.mothersTitle', undefined, 'zh-CN'));

      act(() => {
        useLocaleStore.getState().setLocale('en');
      });

      clickModalTab(host, t('assets.tabComponents', undefined, 'en'));
      expect(host.textContent).toContain(t('assets.title', undefined, 'en'));
      expect(host.textContent).toContain(t('assets.tabComponents', undefined, 'en'));
      expect(host.textContent).toContain(t('assets.tabImages', undefined, 'en'));
      expect(host.textContent).toContain(t('assets.openCenter', undefined, 'en'));
      expect(host.textContent).toContain(t('assets.panelImages', undefined, 'en'));
      expect(host.textContent).toContain(t('assets.emptyLibrary', undefined, 'en'));
      expect(host.textContent).toContain(t('assets.emptyComponentsTitle', undefined, 'en'));
      clickModalTab(host, t('assets.tabImages', undefined, 'en'));
      expect(host.textContent).toContain(t('assets.uploadZoneTitle', undefined, 'en'));
      clickModalTab(host, t('assets.tabIcons', undefined, 'en'));
      expect(host.textContent).toContain(t('assets.builtinIconUser', undefined, 'en'));
      expect(host.textContent).toContain(t('common.close', undefined, 'en'));
      expect(host.textContent).not.toContain('工程资源与组件中心');
      expect(host.textContent).not.toContain('资源中心（上传 / AI 生成）');
      expect(host.textContent).not.toContain('点击或拖拽上传本地图片');
      expect(host.textContent).not.toContain('暂无已封装的工程组件');
      expect(host.textContent).not.toContain('业务母版库');
    } finally {
      act(() => root.unmount());
      host.remove();
      useProjectStore.setState(project, true);
      useHistoryStore.setState(history, true);
    }
  });
});
