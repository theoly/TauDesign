import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { ChatDrawer } from '../src/components/chat/ChatDrawer';
import { RequestActivityCard } from '../src/components/chat/RequestActivityCard';
import { t } from '../src/i18n';
import { useLocaleStore } from '../src/stores/useLocaleStore';
import { useAIConfigStore, defaultProviders, defaultBindings } from '../src/stores/useAIConfigStore';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function resetLocale() {
  localStorage.clear();
  useLocaleStore.setState({ locale: 'zh-CN' });
  document.documentElement.lang = 'zh-CN';
}

describe('i18n ChatDrawer', () => {
  beforeEach(() => {
    resetLocale();
    useAIConfigStore.setState({
      providers: defaultProviders.map((p) =>
        p.id === 'prov-deepseek' ? { ...p, apiKey: 'sk-test-valid-key' } : p,
      ),
      bindings: defaultBindings,
    });
  });
  afterEach(resetLocale);

  test('header title follows locale switch', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);

    try {
      act(() => {
        root.render(<ChatDrawer onOpenSettings={() => {}} />);
      });
      expect(host.textContent).toContain(t('chat.assistantTitle', undefined, 'zh-CN'));
      expect(host.querySelector('[data-testid="ai-chat-panel"]')?.textContent).toContain('AI 原生助手');

      act(() => {
        useLocaleStore.getState().setLocale('en');
      });
      expect(host.textContent).toContain(t('chat.assistantTitle', undefined, 'en'));
      expect(host.textContent).toContain('AI-native assistant');
      expect(host.textContent).not.toContain('AI 原生助手');
    } finally {
      act(() => root.unmount());
      host.remove();
    }
  });

  test('candidate and activity chrome keys follow locale', () => {
    expect(t('chat.candidateReady', undefined, 'zh-CN')).toContain('候选');
    expect(t('chat.candidateReady', undefined, 'en')).toContain('candidate');
    expect(t('chat.adoptReplace', undefined, 'en')).toContain('Adopt');

    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    try {
      act(() => {
        root.render(
          <RequestActivityCard
            activity={{
              status: 'waiting',
              requests: 1,
              active: 1,
              startedAt: Date.now() - 2000,
              textChars: 0,
              reasoningChars: 0,
              jsonChars: 0,
            }}
            running
          />,
        );
      });
      expect(host.textContent).toContain(t('chat.activityWaiting', undefined, 'zh-CN'));
      act(() => {
        useLocaleStore.getState().setLocale('en');
      });
      expect(host.textContent).toContain(t('chat.activityWaiting', undefined, 'en'));
      expect(host.textContent).not.toContain('等待 AI 回复');
    } finally {
      act(() => root.unmount());
      host.remove();
    }
  });

  const t33Keys = [
    'chat.tokenProposalTitle',
    'chat.deviationTitle',
    'chat.failureHistorySaved',
    'chat.viewCode',
    'chat.collapseCode',
    'chat.streamingBuildingStructure',
    'chat.streamingRunningGuards',
    'chat.retryDirect',
    'chat.regenerateFromScratch',
    'chat.generateFullPage',
  ] as const;

  test('T-I18N-33 chrome keys exist in both catalogs', () => {
    for (const key of t33Keys) {
      const zh = t(key, undefined, 'zh-CN');
      const enText = t(key, undefined, 'en');
      expect(zh).not.toBe(key);
      expect(enText).not.toBe(key);
      expect(zh.length).toBeGreaterThan(0);
      expect(enText.length).toBeGreaterThan(0);
    }
    expect(t('chat.deviationSwitchButton', { alternative: '三栏' }, 'zh-CN')).toContain('三栏');
    expect(t('chat.deviationSwitchButton', { alternative: 'Tabs' }, 'en')).toContain('Tabs');
  });
});