import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  contentLanguageDirective,
  detectSystemLocale,
  htmlLang,
  isLocale,
  t,
} from '../src/i18n';
import { resolveInitialLocale, useLocaleStore, useT } from '../src/stores/useLocaleStore';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('i18n core', () => {
  const resetLocale = () => {
    localStorage.clear();
    useLocaleStore.setState({ locale: 'zh-CN' });
    document.documentElement.lang = 'zh-CN';
  };
  beforeEach(resetLocale);
  afterEach(resetLocale);

  test('isLocale accepts only zh-CN and en', () => {
    expect(isLocale('zh-CN')).toBe(true);
    expect(isLocale('en')).toBe(true);
    expect(isLocale('fr')).toBe(false);
  });

  test('t returns zh and en strings for app.name', () => {
    expect(t('app.name', undefined, 'zh-CN')).toBe('TauDesign');
    expect(t('app.name', undefined, 'en')).toBe('TauDesign');
  });

  test('t interpolates params', () => {
    expect(t('settings.currentProject', { name: 'Demo' }, 'en')).toBe('Current project: Demo');
  });

  test('missing key falls back to zh-CN then key', () => {
    expect(t('settings.title', undefined, 'en')).toBe('Project settings');
    expect(t('does.not.exist', undefined, 'en')).toBe('does.not.exist');
  });

  test('setLocale persists and syncs document lang', () => {
    useLocaleStore.getState().setLocale('en');
    expect(useLocaleStore.getState().locale).toBe('en');
    expect(localStorage.getItem('tau.locale')).toBe('en');
    expect(document.documentElement.lang).toBe('en');
    expect(htmlLang('zh-CN')).toBe('zh-CN');
  });

  test('detectSystemLocale maps zh/en families and falls back to en', () => {
    expect(detectSystemLocale('zh-CN')).toBe('zh-CN');
    expect(detectSystemLocale('zh-TW')).toBe('zh-CN');
    expect(detectSystemLocale('zh')).toBe('zh-CN');
    expect(detectSystemLocale('en-US')).toBe('en');
    expect(detectSystemLocale('en')).toBe('en');
    expect(detectSystemLocale('fr-FR')).toBe('en');
    expect(detectSystemLocale('ja')).toBe('en');
    expect(detectSystemLocale('')).toBe('en');
    expect(detectSystemLocale(undefined)).toBe('en');
  });

  test('resolveInitialLocale prefers saved preference over system', () => {
    expect(resolveInitialLocale('zh-CN', 'en-US')).toBe('zh-CN');
    expect(resolveInitialLocale('en', 'zh-CN')).toBe('en');
    expect(resolveInitialLocale(null, 'zh-Hans-CN')).toBe('zh-CN');
    expect(resolveInitialLocale(undefined, 'de-DE')).toBe('en');
    expect(resolveInitialLocale('nope', 'zh-CN')).toBe('zh-CN');
  });

  test('content language directive differs by locale', () => {
    expect(contentLanguageDirective('en')).toContain('English');
    expect(contentLanguageDirective('zh-CN')).toContain('中文');
  });

  test('useT identity is stable until locale changes', () => {
    const seen: Array<(key: string) => string> = [];
    function Probe() {
      seen.push(useT());
      return null;
    }
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    try {
      act(() => {
        root.render(React.createElement(Probe));
      });
      act(() => {
        root.render(React.createElement(Probe));
      });
      expect(seen.length).toBe(2);
      expect(seen[0]).toBe(seen[1]);
      act(() => {
        useLocaleStore.getState().setLocale('en');
      });
      expect(seen.length).toBe(3);
      expect(seen[2]).not.toBe(seen[1]);
      expect(seen[2]('importHtml.title')).toBe(t('importHtml.title', undefined, 'en'));
    } finally {
      act(() => root.unmount());
      host.remove();
    }
  });
});
