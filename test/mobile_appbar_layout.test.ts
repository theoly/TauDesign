import { describe, test, expect } from 'bun:test';
import { getBaseCss } from '../src/styles/baseCss';
import { extractClassWhitelist } from '../src/utils/cssCompiler';
import { buildStyleSpecimenHtml, specimenCoverage } from '../src/utils/styleSpecimen';
import { TokenLintEngine } from '../src/utils/tokenLint';
import { techBlueTheme } from '../src/utils/themePresets';

describe('CHK-F-01 / CHK-F-02: 移动端标题栏 .appbar 基础尺寸与安全区复合高度', () => {
  const mobileCss = getBaseCss('mobile');

  test('appbar 具备固定高度 48px、刚性不收缩 flex-shrink: 0 与 z-index 层叠上下文', () => {
    expect(mobileCss).toContain('.appbar');
    expect(mobileCss).toContain('height: 48px');
    expect(mobileCss).toContain('min-height: 48px');
    expect(mobileCss).toContain('flex-shrink: 0');
    expect(mobileCss).toContain('z-index: 20');
    expect(mobileCss).toContain('box-sizing: border-box');
  });

  test('appbar.safe-top 结合状态栏安全区自适应扩展为 92px (44px + 48px)', () => {
    expect(mobileCss).toContain('.appbar.safe-top');
    expect(mobileCss).toContain('padding-top: 44px');
    expect(mobileCss).toContain('height: calc(44px + 48px)');
    expect(mobileCss).toContain('min-height: calc(44px + 48px)');
  });
});

describe('CHK-F-03: 标题栏内部元素严格垂直居中与对齐规范', () => {
  const mobileCss = getBaseCss('mobile');

  test('直接子元素统一强制垂直居中与清除垂直外边距', () => {
    expect(mobileCss).toContain('.appbar > *');
    expect(mobileCss).toContain('display: inline-flex');
    expect(mobileCss).toContain('align-items: center');
    expect(mobileCss).toContain('margin-top: 0 !important');
    expect(mobileCss).toContain('margin-bottom: 0 !important');
    expect(mobileCss).toContain('line-height: 1');
  });

  test('标题文字 (h1~h4, p, span) 自动居中与单行省略', () => {
    expect(mobileCss).toContain('.appbar > h1');
    expect(mobileCss).toContain('.appbar > span:not(.tap-target):not(.appbar-capsule)');
    expect(mobileCss).toContain('justify-content: center');
    expect(mobileCss).toContain('text-overflow: ellipsis');
    expect(mobileCss).toContain('white-space: nowrap');
    expect(mobileCss).toContain('flex: 1');
  });

  test('操作按钮与触控区 (.tap-target, .btn, button, a) 规范 40px 尺寸与居中', () => {
    expect(mobileCss).toContain('.appbar > .tap-target');
    expect(mobileCss).toContain('.appbar > button');
    expect(mobileCss).toContain('width: 40px');
    expect(mobileCss).toContain('height: 40px');
    expect(mobileCss).toContain('min-width: 40px');
    expect(mobileCss).toContain('min-height: 40px');
  });

  test('按钮内 SVG 图标规范 20px 居中', () => {
    expect(mobileCss).toContain('.appbar > .tap-target svg');
    expect(mobileCss).toContain('width: 20px');
    expect(mobileCss).toContain('height: 20px');
  });
});

describe('CHK-F-04: 主体页面防重叠与防穿透保护', () => {
  const mobileCss = getBaseCss('mobile');

  test('标题栏紧随的主体容器清除负外边距并维持正常文档流', () => {
    expect(mobileCss).toContain('.appbar + *');
    expect(mobileCss).toContain('margin-top: 0 !important');
    expect(mobileCss).toContain('z-index: 1');
  });

  test('底部 tabbar 与 cta-fixed 均具备 flex-shrink: 0 与 z-index: 20', () => {
    expect(mobileCss).toContain('.tabbar');
    expect(mobileCss).toContain('.cta-fixed');
    // 确保底部导航同样不被弹性内容挤压
    expect(mobileCss).toMatch(/\.tabbar\s*\{[^}]*flex-shrink:\s*0/);
    expect(mobileCss).toMatch(/\.cta-fixed\s*\{[^}]*flex-shrink:\s*0/);
  });

  test('tabbar 微信标准：全宽均分、28px 图标、soft/dock 变体可选', () => {
    expect(mobileCss).toMatch(/\.tabbar\s*\{[^}]*width:\s*100%/s);
    expect(mobileCss).toMatch(/\.tabbar\s*>\s*\.tabbar-item\s*\{[^}]*flex:\s*1 1 0%/s);
    expect(mobileCss).toMatch(/\.tabbar\s*>\s*\.tabbar-item\s*>\s*\.icon[\s\S]*?width:\s*28px/);
    expect(mobileCss).toContain('font-size: 10px');
    expect(mobileCss).toContain('.tabbar-soft');
    expect(mobileCss).toContain('.tabbar-dock');
    expect(mobileCss).toMatch(/\.tabbar-dock\s*>\s*\.tabbar-item\.is-active\s*\{[^}]*background-color:\s*var\(--color-primary-light/s);
  });

  test('移动端视口宽度锁：长 CTA / 标签簇不得撑破 390px', () => {
    expect(mobileCss).toMatch(/html\s*\{[^}]*overflow-x:\s*clip/);
    expect(mobileCss).toMatch(/body\s*\{[^}]*overflow-x:\s*clip/);
    expect(mobileCss).toContain('min-width: 0');
    expect(mobileCss).toContain('max-width: 100%');
    expect(mobileCss).toMatch(/\.cta-fixed\s*>\s*\.btn\s*\{[^}]*flex:\s*1 1 auto[^}]*min-width:\s*0[^}]*white-space:\s*normal/s);
    expect(mobileCss).toMatch(/\.col\s*>\s*\.btn[\s\S]*?white-space:\s*normal/);
    expect(mobileCss).toContain('.row:has(> .badge, > .badge-soft, > .tag)');
  });

  test('移动端默认页边距用 main margin，避免右贴边假象；全幅区可破出', () => {
    expect(mobileCss).toMatch(/body\s*>\s*main[\s\S]*?margin-left:\s*var\(--space-4/);
    expect(mobileCss).toMatch(/body\s*>\s*main[\s\S]*?margin-right:\s*var\(--space-4/);
    expect(mobileCss).toMatch(/body\s*>\s*main[\s\S]*?max-width:\s*calc\(100% - 2 \* var\(--space-4/);
    expect(mobileCss).toMatch(/body\s*\{[^}]*padding-left:\s*0/s);
    expect(mobileCss).toMatch(/body\s*\{[^}]*padding-right:\s*0/s);
    expect(mobileCss).toContain('.full-bleed');
    expect(mobileCss).toMatch(/\.full-bleed[\s\S]*?margin-left:\s*calc\(-1 \* var\(--space-4/);
    expect(mobileCss).toMatch(/body\s*>\s*\.appbar/);
    expect(mobileCss).toMatch(/\.tabbar:not\(\.tabbar-dock\)/);
    expect(mobileCss).toMatch(/\.hero-section/);
  });
});

describe('CHK-F-05: 白名单与样张页 100% 覆盖保证', () => {
  test('移动端独有类依然完整存在且不漂移', () => {
    const wl = extractClassWhitelist(getBaseCss('mobile'));
    const expectedClasses = [
      'appbar',
      'safe-top',
      'safe-bottom',
      'tabbar',
      'tabbar-item',
      'tabbar-soft',
      'tabbar-dock',
      'full-bleed',
      'cta-fixed',
      'scroll-x',
      'input-touch',
      'tap-target',
      'list-item'
    ];

    for (const c of expectedClasses) {
      expect(wl).toContain(c);
    }
  });

  test('移动端样张页 100% 覆盖移动端白名单', () => {
    const coverage = specimenCoverage('mobile');
    expect(coverage.missing).toEqual([]);
  });

  test('样张页通过 TokenLint 检查，零未知类名', () => {
    const mobileHtml = buildStyleSpecimenHtml('mobile');
    const lintResult = TokenLintEngine.scan(mobileHtml, techBlueTheme, 'mobile');
    expect(lintResult.issues.filter((i) => i.issueType === 'unknown_class')).toEqual([]);
  });
});
