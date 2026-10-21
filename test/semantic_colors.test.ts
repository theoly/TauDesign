import { describe, expect, test } from 'bun:test';
import { COLOR_ROLES, colorRoleKeys } from '../src/types/colorRoles';
import { themePresets, defaultTheme } from '../src/utils/themePresets';
import { applyBrandColor, contrastRatio, onColor, readableColor } from '../src/utils/colorHarmony';
import { checkColorContrast, resolveThemeColors, withColorBinding } from '../src/utils/semanticColors';
import { compileTokensToCss, extractClassWhitelist } from '../src/utils/cssCompiler';
import { getBaseCss } from '../src/styles/baseCss';
import { buildThemePreview } from '../src/utils/themePreview';
import { specimenCoverage } from '../src/utils/styleSpecimen';
import { PromptBuilder } from '../src/services/ai/promptBuilder';
import { buildPolishPrompt } from '../src/services/ai/polishPrompt';
import type { DesignSystemTokens } from '../src/types/designSystem';

describe('完整语义角色与标准配对', () => {
  for (const p of themePresets) for (const mode of ['light', 'dark'] as const) {
    test(`${p.id}/${mode}: 旧工程自动补全全部角色和交互配对`, () => {
      const original = JSON.stringify(p.theme.tokens);
      const r = resolveThemeColors(p.theme.tokens, mode);
      expect(r.issues).toEqual([]);
      for (const role of colorRoleKeys) expect(r.values[role]).toMatch(/^#[\da-f]{6}$/);
      expect(checkColorContrast(r).filter(c => !c.passes)).toEqual([]);
      expect(JSON.stringify(p.theme.tokens)).toBe(original);
      const css = compileTokensToCss(p.theme.tokens, mode);
      for (const role of colorRoleKeys) expect(css).toContain(`--color-${COLOR_ROLES[role][1]}: ${r.cssValues[role]};`);
    });
  }
  for (const seed of ['#ffffff', '#000000', '#ffff00', '#ff8a55', '#00ffff']) {
    test(`极端品牌 ${seed} 的填充前景与交互状态始终可读`, () => {
      for (const mode of ['light', 'dark'] as const) {
        const r = resolveThemeColors(applyBrandColor(defaultTheme.tokens, seed, true), mode);
        expect(checkColorContrast(r).filter(c => !c.passes)).toEqual([]);
      }
    });
  }
});

test('自定义/继承沿自动依赖更新，明暗隔离，恢复自动，序列化稳定', () => {
  let t = withColorBinding(defaultTheme.tokens, 'light', 'primary', { source: 'custom', value: '#abc' });
  t = withColorBinding(t, 'light', 'selectedBg', { source: 'alias', role: 'primary' });
  t = withColorBinding(t, 'light', 'infoFill', { source: 'alias', role: 'selectedBg' });
  let r = resolveThemeColors(t, 'light');
  expect(r.values.primary).toBe('#aabbcc');
  expect(r.values.infoFill).toBe('#aabbcc');
  expect(r.sources.infoFill).toContain('跟随');
  expect(r.values.onPrimary).toBe('#111111');
  expect(resolveThemeColors(t, 'dark').values.primary).toBe(defaultTheme.tokens.colors.primary['500']);
  const recolored = applyBrandColor(t, '#ff8a55', true);
  expect(resolveThemeColors(recolored, 'light').values.primary).toBe('#aabbcc');
  expect(resolveThemeColors(recolored, 'light').values.brand).toBe('#ff8a55');
  expect(resolveThemeColors(JSON.parse(JSON.stringify(t)), 'light')).toEqual(r);
  t = withColorBinding(t, 'light', 'primary');
  r = resolveThemeColors(t, 'light');
  expect(r.values.infoFill).toBe(defaultTheme.tokens.colors.primary['500']);
});

test('坏引用、自继承、间接循环、自动依赖循环、非法 Hex 拒绝且旧坏数据安全回退', () => {
  for (const bindings of [
    { primary: { source: 'alias', role: 'primary' } },
    { primary: { source: 'alias', role: 'onPrimary' } },
    { textPrimary: { source: 'alias', role: 'missing' } },
    { primary: { source: 'custom', value: 'red; background:url(x)' } },
    { primary: { source: 'alias', role: 'selectedBg' }, selectedBg: { source: 'alias', role: 'primary' } },
  ]) {
    const t = { ...defaultTheme.tokens, colorRoles: { light: bindings } } as DesignSystemTokens;
    const r = resolveThemeColors(t, 'light');
    expect(r.issues.length).toBeGreaterThan(0);
    for (const role of colorRoleKeys) expect(r.values[role]).toMatch(/^#[\da-f]{6}$/);
    expect(() => compileTokensToCss(t, 'light')).not.toThrow();
  }
  expect(() => withColorBinding(defaultTheme.tokens, 'light', 'primary', { source: 'alias', role: 'onPrimary' })).toThrow('循环');
});

test('固定白字保留原值并报告不足；建议改变背景后满足所有按钮状态', () => {
  let t = applyBrandColor(defaultTheme.tokens, '#ff8a55');
  t = withColorBinding(t, 'light', 'onPrimary', { source: 'custom', value: '#ffffff' });
  let r = resolveThemeColors(t, 'light');
  expect(r.values.onPrimary).toBe('#ffffff');
  expect(r.values.primary).toBe('#ff8a55');
  expect(checkColorContrast(r).some(c => c.background === 'primary' && !c.passes)).toBe(true);
  const suggestion = readableColor(r.values.primary, [r.values.onPrimary]);
  t = withColorBinding(t, 'light', 'primary', { source: 'custom', value: suggestion });
  r = resolveThemeColors(t, 'light');
  expect(contrastRatio(r.values.onPrimary, r.values.primary)).toBeGreaterThanOrEqual(4.5);
  expect(checkColorContrast(r).filter(c => ['primary', 'primaryHover', 'primaryActive'].includes(c.background) && !c.passes)).toEqual([]);
});

test('自动文字因背景变化调整且解释来源；手动低对比状态不静默修正', () => {
  let t = withColorBinding(defaultTheme.tokens, 'light', 'surface', { source: 'custom', value: '#888888' });
  const r = resolveThemeColors(t, 'light');
  expect(r.sources.textPrimary).toContain('自动');
  t = withColorBinding(t, 'light', 'primaryHover', { source: 'custom', value: '#ffffff' });
  t = withColorBinding(t, 'light', 'onPrimary', { source: 'custom', value: '#ffffff' });
  const next = resolveThemeColors(t, 'light');
  expect(next.values.primaryHover).toBe('#ffffff');
  expect(checkColorContrast(next).find(c => c.background === 'primaryHover')?.passes).toBe(false);
});

for (const device of ['pc', 'mobile'] as const) test(`${device} 预览、白名单和组件样张引用完整，颜色变量无悬空`, () => {
  const css = getBaseCss(device);
  const compiled = compileTokensToCss(defaultTheme.tokens, 'dark', device);
  for (const match of css.matchAll(/var\((--color-[\w-]+)/g)) expect(compiled).toContain(`${match[1]}:`);
  const doc = new DOMParser().parseFromString(buildThemePreview(defaultTheme.tokens, 'dark', device), 'text/html');
  expect(doc.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content')).toContain("script-src 'none'");
  expect(doc.querySelector('style')!.textContent).toContain(css);
  expect(doc.querySelector('style')!.textContent).toContain(compiled);
  expect(doc.querySelector('button:disabled')).not.toBeNull();
  expect(doc.querySelector('.input')).not.toBeNull();
  expect(doc.querySelector('.is-selected')).not.toBeNull();
  const whitelist = extractClassWhitelist(css);
  for (const el of doc.body.querySelectorAll('[class]')) for (const cls of el.classList) expect(whitelist).toContain(cls);
  expect(specimenCoverage(device).missing).toEqual([]);
  if (device === 'mobile') expect(css).not.toContain(':hover');
});

test('生成、修改、润色使用同一配对规则及当前编译颜色', () => {
  const tokens = withColorBinding(defaultTheme.tokens, 'light', 'primary', { source: 'custom', value: '#b8441c' });
  const options = { designSystem: { ...defaultTheme, tokens }, deviceProfile: 'mobile' as const, frameWidth: 390 };
  for (const prompt of [PromptBuilder.buildSystemPrompt(options), PromptBuilder.buildSystemPrompt({ ...options, intent: 'modify_screen' }), buildPolishPrompt(options)]) {
    expect(prompt).toContain('SEMANTIC COLOR PAIRS');
    expect(prompt).toContain('按钮内文字和SVG继承 currentColor');
    expect(prompt).toContain('--color-primary: #b8441c');
  }
});


test('多处旧坏配置允许逐项恢复，仍拒绝新循环', () => {
  let t = { ...defaultTheme.tokens, colorRoles: { light: {
    primary: { source: 'custom', value: 'bad' },
    onPrimary: { source: 'custom', value: 'bad' }
  } } } as DesignSystemTokens;
  t = withColorBinding(t, 'light', 'primary');
  expect(resolveThemeColors(t, 'light').issues).toHaveLength(1);
  t = withColorBinding(t, 'light', 'onPrimary');
  expect(resolveThemeColors(t, 'light').issues).toEqual([]);
  expect(() => withColorBinding(t, 'light', 'primary', { source: 'alias', role: 'onPrimary' })).toThrow();
});


test('全部 256 档灰度填充的自动前景达到普通字号要求', () => {
  for (let n = 0; n <= 255; n++) {
    const gray = '#' + n.toString(16).padStart(2, '0').repeat(3);
    expect(contrastRatio(gray, onColor(gray))).toBeGreaterThanOrEqual(4.5);
  }
});
