import { describe, expect, test } from 'bun:test';
import { getBaseCss } from '../src/styles/baseCss';
import { getDeviceAestheticRules, getFewShotExample } from '../src/services/ai/aestheticRules';
import { extractClassWhitelist } from '../src/utils/cssCompiler';
import { compileTokensToCss } from '../src/utils/cssCompiler';
import { techBlueTheme } from '../src/utils/themePresets';
import { buildStyleSpecimenHtml, specimenCoverage } from '../src/utils/styleSpecimen';

describe('微信小程序式移动端页面头部', () => {
  test('真实 span 胶囊不继承标题弹性布局，样张和生成范例保持固定尺寸', () => {
    const style = document.createElement('style');
    style.textContent = compileTokensToCss(techBlueTheme.tokens, 'light', 'mobile') + getBaseCss('mobile');
    document.head.appendChild(style);
    const host = document.createElement('div');
    document.body.appendChild(host);
    try {
      for (const html of [getFewShotExample('mobile', true), buildStyleSpecimenHtml('mobile')]) {
        host.innerHTML = html;
        const capsule = host.querySelector<HTMLElement>('.appbar > .appbar-capsule')!;
        expect(capsule).not.toBeNull();
        expect(capsule.matches('.appbar > span:not(.tap-target):not(.appbar-capsule)')).toBe(false);
        const computed = getComputedStyle(capsule);
        expect(computed.flexGrow).toBe('0');
        expect(computed.flexShrink).toBe('0');
        expect(computed.width).toBe('86px');
        expect(computed.height).toBe('32px');
        const title = host.querySelector<HTMLElement>('.appbar-title')!;
        expect(getComputedStyle(title).position).toBe('absolute');
        expect(getComputedStyle(title).left).toBe('50%');
        for (const control of capsule.children) {
          expect(getComputedStyle(control).flexBasis).toBe('0%');
          expect(getComputedStyle(control).boxSizing).toBe('border-box');
          expect(getComputedStyle(control).justifyContent).toBe('center');
        }
      }
    } finally {
      host.remove();
      style.remove();
    }
  });

  test('状态栏、导航栏独立占位，标题居中且胶囊为双分区', () => {
    const css = getBaseCss('mobile');
    const tokenCss = compileTokensToCss(techBlueTheme.tokens);
    expect(tokenCss).toContain('--mini-status-height: 44px');
    expect(css).toMatch(/\.status-bar\s*\{[^}]*height:\s*var\(--mini-status-height\)/);
    expect(css).toMatch(/\.appbar\s*\{[^}]*height:\s*48px/);
    expect(css).toMatch(/\.appbar > \.appbar-title\s*\{[^}]*left:\s*50%/);
    expect(tokenCss).toContain('--mini-capsule-width: 86px');
    expect(css).toMatch(/\.appbar > \.appbar-capsule\s*\{[^}]*width:\s*var\(--mini-capsule-width\)/);
    expect(css).toContain('.appbar-capsule-more { border-right:');

    const example = getFewShotExample('mobile');
    expect(example).not.toContain('class="status-bar"');
    expect(example).not.toContain('class="appbar"');
    expect(example).toContain('class="col gap-6 p-4 flex-1"');
    const custom = getFewShotExample('mobile', true);
    expect(custom).not.toContain('class="status-bar"');
    expect(custom).toContain('class="appbar-title"');
    expect(custom).toContain('class="appbar-capsule-home"');
  });

  test('移动端规则覆盖登录页与 Hero 页，避免重复安全区', () => {
    const rules = getDeviceAestheticRules('mobile');
    expect(rules).toContain('WECHAT NATIVE NAVIGATION');
    expect(rules).toContain('不预留顶部44/48/92px或safe-top');
    expect(rules).toContain('.status-bar');
    expect(getDeviceAestheticRules('mobile', true)).toContain('CUSTOM MOBILE NAVIGATION ENABLED');
  });

  test('新增类名只进入移动端白名单且出现在样张', () => {
    const mobile = extractClassWhitelist(getBaseCss('mobile'));
    const pc = extractClassWhitelist(getBaseCss('pc'));
    const specimen = buildStyleSpecimenHtml('mobile');
    for (const name of ['status-bar', 'status-bar-icons', 'appbar-title', 'appbar-capsule', 'appbar-capsule-more', 'appbar-capsule-home']) {
      expect(mobile).toContain(name);
      expect(pc).not.toContain(name);
      expect(specimen).toContain(`class="${name}"`);
    }
    expect(specimenCoverage('mobile').missing).toEqual([]);
  });
});
