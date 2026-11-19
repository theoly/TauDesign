import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { ModelCapacitySettings } from '../src/components/settings/ModelCapacitySettings';
import { t } from '../src/i18n';
import { useLocaleStore } from '../src/stores/useLocaleStore';
import { useAIConfigStore, defaultBindings } from '../src/stores/useAIConfigStore';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const provider = {
  id: 'capacity-i18n',
  name: 'test',
  protocol: 'openai_compatible' as const,
  baseUrl: 'https://example.test/v1',
  apiKey: '',
  isEnabled: true,
  defaultModel: 'm',
};

function resetLocale() {
  localStorage.clear();
  useLocaleStore.setState({ locale: 'zh-CN' });
  document.documentElement.lang = 'zh-CN';
}

describe('i18n ModelCapacitySettings', () => {
  beforeEach(resetLocale);
  afterEach(resetLocale);

  test('capacity chrome follows locale', () => {
    const before = useAIConfigStore.getState();
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);

    try {
      useAIConfigStore.setState({
        providers: [provider],
        bindings: { ...defaultBindings, code: { role: 'code', providerId: provider.id, modelId: 'm' } },
      });

      act(() => {
        root.render(<ModelCapacitySettings provider={provider} model="m" />);
      });

      expect(host.textContent).toContain(t('settings.capacitySectionSummary', undefined, 'zh-CN'));
      expect(host.textContent).toContain(t('settings.capacitySaveModel', undefined, 'zh-CN'));
      expect(host.textContent).toContain(t('settings.capacitySaveRoleOutput', undefined, 'zh-CN'));
      expect(host.querySelector(`[aria-label="${t('settings.capacityAriaContextWindow', undefined, 'zh-CN')}"]`)).toBeTruthy();

      act(() => {
        useLocaleStore.getState().setLocale('en');
      });

      expect(host.textContent).toContain(t('settings.capacitySectionSummary', undefined, 'en'));
      expect(host.textContent).toContain(t('settings.capacitySaveModel', undefined, 'en'));
      expect(host.textContent).not.toContain('模型可处理的内容与回复长度');
      expect(host.textContent).not.toContain('保存模型容量');
    } finally {
      act(() => root.unmount());
      host.remove();
      useAIConfigStore.setState(before, true);
    }
  });
});