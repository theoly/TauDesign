import { describe, expect, test } from 'bun:test';
import { en } from '../src/i18n/messages/en';
import { zhCN } from '../src/i18n/messages/zh-CN';
import type { MessageTree } from '../src/i18n/types';
import { t } from '../src/i18n';

function leafKeys(tree: MessageTree, prefix = ''): string[] {
  const keys: string[] = [];
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') keys.push(path);
    else keys.push(...leafKeys(value, path));
  }
  return keys.sort();
}

const REQUIRED_NAMESPACES = [
  'app',
  'common',
  'settings',
  'workspace',
  'chat',
  'export',
  'inspector',
  'assets',
  'theme',
  'layout',
  'ai',
  'plan',
] as const;

describe('i18n catalogs', () => {
  test('en and zh-CN leaf key sets match', () => {
    expect(leafKeys(en as MessageTree)).toEqual(leafKeys(zhCN as MessageTree));
  });

  test('required namespaces exist with non-empty string leaves', () => {
    for (const ns of REQUIRED_NAMESPACES) {
      expect(zhCN[ns], `missing zh-CN.${ns}`).toBeDefined();
      expect(en[ns], `missing en.${ns}`).toBeDefined();
    }
    for (const key of leafKeys(zhCN as MessageTree)) {
      expect(t(key, undefined, 'zh-CN').length).toBeGreaterThan(0);
      expect(t(key, undefined, 'en').length).toBeGreaterThan(0);
      expect(t(key, undefined, 'en')).not.toBe(key);
    }
  });

  test('placeholder params interpolate in both locales', () => {
    expect(t('chat.pageRefOn', { name: 'Home' }, 'zh-CN')).toContain('Home');
    expect(t('chat.pageRefOn', { name: 'Home' }, 'en')).toContain('Home');
    expect(t('export.savedLabel', { label: 'HTML' }, 'en')).toBe('HTML saved');
    expect(t('inspector.lintIssues', { count: 3 }, 'zh-CN')).toContain('3');
  });
});
