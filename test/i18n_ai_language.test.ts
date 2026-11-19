import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  buildGoldenHierarchy,
  contentAestheticRule,
  GOLDEN_HIERARCHY,
} from '../src/services/ai/aestheticRules';
import { PromptBuilder } from '../src/services/ai/promptBuilder';
import {
  contentLanguageDirective,
  htmlLang,
} from '../src/i18n';
import { useLocaleStore } from '../src/stores/useLocaleStore';
import { techBlueTheme } from '../src/utils/themePresets';
import { buildThemePreview } from '../src/utils/themePreview';

const baseOptions = {
  designSystem: techBlueTheme,
  deviceProfile: 'pc' as const,
  frameWidth: 1440,
  intent: 'create_screen' as const,
};

describe('i18n AI content language', () => {
  const resetLocale = () => {
    localStorage.clear();
    useLocaleStore.setState({ locale: 'zh-CN' });
    document.documentElement.lang = 'zh-CN';
  };
  beforeEach(resetLocale);
  afterEach(resetLocale);

  test('contentAestheticRule / buildGoldenHierarchy switch by locale', () => {
    expect(contentAestheticRule('zh-CN')).toContain('真实感中文');
    expect(contentAestheticRule('en')).toContain('English');
    expect(contentAestheticRule('en')).not.toContain('真实感中文');

    expect(buildGoldenHierarchy('en')).toContain('Natural English UI copy');
    expect(buildGoldenHierarchy('zh-CN')).toContain('真实感中文');
    expect(GOLDEN_HIERARCHY).toContain('真实感中文');
  });

  test('buildSystemPrompt injects English LANG directive when contentLocale=en', () => {
    const prompt = PromptBuilder.buildSystemPrompt({
      ...baseOptions,
      contentLocale: 'en',
    });
    expect(prompt).toContain(contentLanguageDirective('en'));
    expect(prompt).toContain('English');
    expect(prompt).toContain(contentAestheticRule('en'));
    expect(prompt).not.toContain(contentLanguageDirective('zh-CN'));
  });

  test('buildSystemPrompt uses Chinese hierarchy CONTENT for zh-CN without extra LANG line', () => {
    const prompt = PromptBuilder.buildSystemPrompt({
      ...baseOptions,
      contentLocale: 'zh-CN',
    });
    expect(prompt).not.toContain(contentLanguageDirective('zh-CN'));
    expect(prompt).toContain('中文');
    expect(prompt).toContain(contentAestheticRule('zh-CN'));
  });

  test('contentLocale falls back to getUiLocale()', () => {
    useLocaleStore.getState().setLocale('en');
    const prompt = PromptBuilder.buildSystemPrompt(baseOptions);
    expect(prompt).toContain(contentLanguageDirective('en'));
    expect(prompt).toContain(contentAestheticRule('en'));
  });

  test('buildThemePreview uses htmlLang and localized fixture chrome', () => {
    const zh = buildThemePreview(techBlueTheme.tokens, 'light', 'pc', 'zh-CN');
    const en = buildThemePreview(techBlueTheme.tokens, 'light', 'pc', 'en');
    expect(zh).toContain(`<html lang="${htmlLang('zh-CN')}">`);
    expect(en).toContain(`<html lang="${htmlLang('en')}">`);
    expect(en).toContain('Base components');
    expect(en).toContain('Primary');
    expect(en).not.toContain('真实基座组件');
    expect(zh).toContain('真实基座组件');
  });
});
