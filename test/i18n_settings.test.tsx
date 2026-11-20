import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { AIProviderModal } from '../src/components/settings/AIProviderModal';
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

describe('i18n settings chrome', () => {
  beforeEach(resetLocale);
  afterEach(resetLocale);

  test('AIProviderModal high-frequency chrome follows locale', () => {
    const project = useProjectStore.getState();
    const history = useHistoryStore.getState();
    useProjectStore.getState().initNewProject({ name: 'I18nSettings', deviceProfile: 'pc', createSpecimen: false });

    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);

    try {
      act(() => {
        root.render(<AIProviderModal onClose={() => {}} />);
      });

      expect(host.textContent).toContain(t('header.settings', undefined, 'zh-CN'));
      expect(host.textContent).toContain(t('settings.title', undefined, 'zh-CN'));
      expect(host.textContent).toContain(t('settings.tabProvider', undefined, 'zh-CN'));
      expect(host.textContent).toContain(t('settings.tabQuickPrompts', undefined, 'zh-CN'));
      expect(host.textContent).toContain(t('settings.providerList', undefined, 'zh-CN'));
      expect(host.textContent).toContain(t('settings.addThirdParty', undefined, 'zh-CN'));
      expect(host.textContent).toContain(t('settings.capacityAssign', undefined, 'zh-CN'));
      expect(host.textContent).toContain(t('settings.saveAndClose', undefined, 'zh-CN'));
      expect(host.textContent).toContain(t('settings.autoDesignRulesHint', undefined, 'zh-CN'));
      expect(host.textContent).toContain(t('settings.protocolSectionLabel', undefined, 'zh-CN'));
      expect(host.textContent).toContain(t('settings.apiKeyLabel', undefined, 'zh-CN'));
      expect(host.textContent).toContain(t('settings.setAsCodeModel', undefined, 'zh-CN'));
      expect(host.textContent).toContain(t('settings.privacyNoticeTitle', undefined, 'zh-CN'));

      const projectTabZh = Array.from(host.querySelectorAll('button')).find((el) =>
        el.textContent?.includes(t('settings.title', undefined, 'zh-CN')),
      );
      expect(projectTabZh).toBeTruthy();
      act(() => {
        projectTabZh!.click();
      });
      expect(host.textContent).toContain(t('settings.iconCacheTitle', undefined, 'zh-CN'));
      expect(host.textContent).toContain(t('settings.mediaConvertTitle', undefined, 'zh-CN'));
      expect(host.textContent).toContain(t('settings.iconCacheEmpty', undefined, 'zh-CN'));
      expect(host.textContent).toContain(t('settings.mediaConvertEmpty', undefined, 'zh-CN'));

      const quickTab = Array.from(host.querySelectorAll('button')).find((el) =>
        el.textContent?.includes(t('settings.tabQuickPrompts', undefined, 'zh-CN')),
      );
      expect(quickTab).toBeTruthy();
      act(() => {
        quickTab!.click();
      });
      expect(host.textContent).toContain(t('settings.promptScopeProject', undefined, 'zh-CN'));
      expect(host.textContent).toContain(t('settings.promptResetDefaults', undefined, 'zh-CN'));

      act(() => {
        useLocaleStore.getState().setLocale('en');
      });

      expect(host.textContent).toContain(t('header.settings', undefined, 'en'));
      expect(host.textContent).toContain(t('settings.title', undefined, 'en'));
      expect(host.textContent).toContain(t('settings.tabProvider', undefined, 'en'));
      expect(host.textContent).toContain(t('settings.tabQuickPrompts', undefined, 'en'));
      expect(host.textContent).toContain(t('settings.promptScopeProject', undefined, 'en'));
      expect(host.textContent).toContain(t('settings.promptResetDefaults', undefined, 'en'));
      expect(host.textContent).toContain(t('settings.builtinPrompts.mobileAdaptive.title', undefined, 'en'));
      expect(host.textContent).toContain(t('settings.builtinPrompts.mobileAdaptive.content', undefined, 'en'));
      expect(host.textContent).not.toContain('移动端适配');

      const projectTabEn = Array.from(host.querySelectorAll('button')).find((el) =>
        el.textContent?.includes(t('settings.title', undefined, 'en')),
      );
      expect(projectTabEn).toBeTruthy();
      act(() => {
        projectTabEn!.click();
      });
      expect(host.textContent).toContain(t('settings.iconCacheTitle', undefined, 'en'));
      expect(host.textContent).toContain(t('settings.mediaConvertTitle', undefined, 'en'));
      expect(host.textContent).toContain(t('settings.iconCacheEmpty', undefined, 'en'));
      expect(host.textContent).toContain(t('settings.mediaConvertEmpty', undefined, 'en'));
      expect(host.textContent).not.toContain('旧图标缓存整理');
      expect(host.textContent).not.toContain('旧页面媒体转换');

      const providerTab = Array.from(host.querySelectorAll('button')).find((el) =>
        el.textContent?.includes(t('settings.tabProvider', undefined, 'en')),
      );
      expect(providerTab).toBeTruthy();
      act(() => {
        providerTab!.click();
      });

      expect(host.textContent).toContain(t('settings.setAsCodeModel', undefined, 'en'));
      expect(host.textContent).toContain(t('settings.protocolSectionLabel', undefined, 'en'));
      expect(host.textContent).toContain(t('settings.privacyNoticeTitle', undefined, 'en'));
      expect(host.textContent).not.toContain('AI 模型与 Provider');
      expect(host.textContent).not.toContain('当前项目 (默认)');
      expect(host.textContent).not.toContain('恢复默认内置短语');
      expect(host.textContent).not.toContain('设为代码模型');
      expect(host.textContent).not.toContain('接口协议规范 (Protocol)');
      expect(host.textContent).not.toContain('隐私与安全声明 (PRD D4)');
    } finally {
      act(() => root.unmount());
      host.remove();
      useProjectStore.setState(project, true);
      useHistoryStore.setState(history, true);
    }
  });
});
