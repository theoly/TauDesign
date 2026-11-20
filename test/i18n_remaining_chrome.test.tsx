import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { AIProviderModal } from '../src/components/settings/AIProviderModal';
import { ScreenDesignRoleEditor } from '../src/components/inspector/ScreenDesignRoleEditor';
import { RenderedQualityCard } from '../src/components/chat/RenderedQualityCard';
import { findingSummary } from '../src/components/chat/QualityFindings';
import { t } from '../src/i18n';
import { useLocaleStore } from '../src/stores/useLocaleStore';
import { useProjectStore } from '../src/stores/useProjectStore';
import { useHistoryStore } from '../src/stores/useHistoryStore';
import { defaultTheme } from '../src/utils/themePresets';
import type { Screen } from '../src/types/project';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function resetLocale() {
  localStorage.clear();
  useLocaleStore.setState({ locale: 'zh-CN' });
  document.documentElement.lang = 'zh-CN';
}

describe('i18n remaining host chrome', () => {
  beforeEach(resetLocale);
  afterEach(resetLocale);

  test('provider names, design roles, and render summary follow locale', () => {
    useProjectStore.getState().initNewProject({
      name: 'I18nRemaining',
      deviceProfile: 'pc',
      designSystem: defaultTheme,
      createSpecimen: false,
    });
    const screen: Screen = {
      id: 'screen-1',
      name: 'Home',
      htmlContent: '<div></div>',
      width: 1440,
      height: 900,
      x: 0,
      y: 0,
    };
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);

    try {
      act(() => {
        root.render(
          <>
            <AIProviderModal onClose={() => {}} />
            <ScreenDesignRoleEditor screen={screen} onCommit={() => {}} />
            <RenderedQualityCard
              report={{
                status: 'complete',
                inspected: 3,
                findings: [{ code: 'x', severity: 'warning', message: 'wrap', actual: '2', expected: '1' }],
              }}
            />
          </>,
        );
      });

      expect(host.textContent).toContain(t('settings.providerNames.prov-openai', undefined, 'zh-CN'));
      expect(host.textContent).toContain(t('inspector.designRole', undefined, 'zh-CN'));
      expect(host.textContent).toContain(t('quality.renderComplete', undefined, 'zh-CN'));
      expect(host.textContent).toContain(findingSummary([{ code: 'x', severity: 'warning', message: 'wrap', actual: '2', expected: '1' }]));

      act(() => {
        useLocaleStore.getState().setLocale('en');
      });

      expect(host.textContent).toContain(t('settings.providerNames.prov-openai', undefined, 'en'));
      expect(host.textContent).not.toContain('OpenAI 官方');
      expect(host.textContent).toContain(t('inspector.designRole', undefined, 'en'));
      expect(host.textContent).toContain(t('quality.renderComplete', undefined, 'en'));
      expect(host.textContent).toContain(findingSummary([{ code: 'x', severity: 'warning', message: 'wrap', actual: '2', expected: '1' }]));
      expect(findingSummary([{ code: 'x', severity: 'warning', message: 'wrap', actual: '2', expected: '1' }])).toContain('1 warnings');
      expect(findingSummary([{ code: 'x', severity: 'warning', message: 'wrap', actual: '2', expected: '1' }])).not.toContain('项警告');
    } finally {
      act(() => root.unmount());
      host.remove();
      useHistoryStore.setState({ past: [], future: [] });
    }
  });
});
