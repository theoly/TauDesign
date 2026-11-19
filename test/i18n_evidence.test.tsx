import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { DeliveryHistoryPanel } from '../src/components/inspector/DeliveryHistoryPanel';
import { PageCreationEvidencePanel } from '../src/components/inspector/PageCreationEvidencePanel';
import { RestyleDeliveryHistoryPanel } from '../src/components/inspector/RestyleDeliveryHistoryPanel';
import { VisualEvidencePanel } from '../src/components/inspector/VisualEvidencePanel';
import { t } from '../src/i18n';
import { useLocaleStore } from '../src/stores/useLocaleStore';
import { useProjectStore } from '../src/stores/useProjectStore';
import { neutralModernTheme } from '../src/utils/themePresets';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function resetLocale() {
  localStorage.clear();
  useLocaleStore.setState({ locale: 'zh-CN' });
  document.documentElement.lang = 'zh-CN';
}

describe('i18n inspector evidence panels', () => {
  beforeEach(resetLocale);
  afterEach(resetLocale);

  test('delivery, restyle, visual, and page-creation chrome follow locale', async () => {
    const store = useProjectStore.getState();
    store.initNewProject({ name: 'Evidence i18n', deviceProfile: 'pc', designSystem: neutralModernTheme, createSpecimen: false });
    store.addScreen({ name: 'Home', htmlContent: '<main data-nid="root"><p>Hi</p></main>', position: { x: 0, y: 0 } }, 'page');
    const screen = useProjectStore.getState().screens.page;

    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);

    try {
      act(() => {
        root.render(
          <>
            <DeliveryHistoryPanel projectId={store.id} screen={screen} revision={0} />
            <RestyleDeliveryHistoryPanel projectId={store.id} screen={screen} revision={0} />
            <VisualEvidencePanel projectId={store.id} kind="single" eventId="evt-1" screenId="page" />
            <PageCreationEvidencePanel screen={{ ...screen, metadata: { creationEvidence: {} as never } }} />
          </>,
        );
      });

      expect(host.querySelector('section')?.getAttribute('aria-label')).toBe(t('inspector.deliverySectionAria', undefined, 'zh-CN'));
      expect(host.textContent).toContain(t('inspector.deliveryHistory', undefined, 'zh-CN'));
      for (let i = 0; i < 50 && host.textContent?.includes(t('inspector.deliveryLoading', undefined, 'zh-CN')); i++) {
        await act(async () => {
          await new Promise((r) => setTimeout(r, 10));
        });
      }
      expect(host.textContent).toContain(t('inspector.deliveryEmpty', undefined, 'zh-CN'));
      expect(host.textContent).toContain(t('inspector.deliveryRestyleTitle', undefined, 'zh-CN'));
      expect(host.textContent).toContain(t('inspector.evidenceVisualSummary', undefined, 'zh-CN'));
      expect(host.textContent).toContain(t('inspector.pageCreationCorrupted', undefined, 'zh-CN'));

      act(() => {
        useLocaleStore.getState().setLocale('en');
      });

      expect(host.querySelector('section')?.getAttribute('aria-label')).toBe(t('inspector.deliverySectionAria', undefined, 'en'));
      expect(host.textContent).toContain(t('inspector.deliveryHistory', undefined, 'en'));
      expect(host.textContent).toContain(t('inspector.deliveryEmpty', undefined, 'en'));
      expect(host.textContent).toContain(t('inspector.deliveryRestyleTitle', undefined, 'en'));
      expect(host.textContent).toContain(t('inspector.evidenceVisualSummary', undefined, 'en'));
      expect(host.textContent).toContain(t('inspector.pageCreationCorrupted', undefined, 'en'));
      expect(host.textContent).not.toContain(t('inspector.deliveryHistory', undefined, 'zh-CN'));
      expect(host.textContent).not.toContain('像素复核通过');
    } finally {
      act(() => root.unmount());
      host.remove();
    }
  });
});