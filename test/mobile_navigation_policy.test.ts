import { describe, expect, test } from 'bun:test';
import { normalizeMobileNavigation, injectMobileChrome } from '../src/utils/mobileNavigation';
import { buildScreenDocument } from '../src/utils/screenDocument';
import { buildStandaloneHtml, buildExportSvg } from '../src/utils/exportRenderer';
import { buildExportRenderDocument } from '../src/utils/pngExporter';
import { defaultTheme } from '../src/utils/themePresets';
import { compileTokensToCss } from '../src/utils/cssCompiler';
import { getBaseCss } from '../src/styles/baseCss';
import type { Screen } from '../src/types/project';

const html = '<!doctype html><html lang="zh"><head><style>.card{padding:13px}</style></head><body><main><div class="status-bar" data-nid="status01">9:41<span>Wi-Fi 电量</span></div><header class="appbar" data-nid="navbar01"><button aria-label="返回">‹</button><span class="appbar-title">会员管理</span><span class="appbar-capsule">···</span></header><article class="card" data-nid="business"><h1>本月概览</h1><button>新增会员</button></article><nav class="tabbar">会员 / 我的</nav></main></body></html>';
const policy = { deviceProfile: 'mobile' as const, useCustomNavigation: false };
const page: Screen = { id: 'nav-page', name: '画框名字', position: { x: 0, y: 0 }, htmlContent: html };
const options = { tokensCss: compileTokensToCss(defaultTheme.tokens, 'light', 'mobile'), baseCss: getBaseCss('mobile'), screenOverrides: '', deviceProfile: 'mobile' as const, useCustomNavigation: false };
describe('移动端导航策略', () => {
  test('默认移除顶部栏且保留标题、业务正文与底部导航，重复处理幂等', () => {
    const normalized = normalizeMobileNavigation(html, policy);
    const doc = new DOMParser().parseFromString(normalized.html, 'text/html');
    expect(doc.querySelector('.status-bar')).toBeNull(); expect(doc.querySelector('.appbar')).toBeNull();
    expect(normalized.title).toBe('会员管理'); expect(doc.querySelector('[data-nid="business"]')).not.toBeNull();
    expect(doc.querySelector('.tabbar')?.textContent).toContain('会员');
    expect(doc.head.textContent).toContain('padding:13px'); expect(doc.documentElement.lang).toBe('zh');
    expect(normalizeMobileNavigation(normalized.html, policy).html).toBe(normalized.html);
  });
  test('自定义开关保留导航，PC完全不动，业务header和搜索/新增操作不丢失', () => {
    const custom = normalizeMobileNavigation(html, { ...policy, useCustomNavigation: true });
    expect(normalizeMobileNavigation('<main class="safe-top"><nav class="appbar safe-top"><h1>自定义</h1></nav></main>', { ...policy, useCustomNavigation: true }).html).not.toContain('safe-top');
    expect(custom.html).toContain('appbar-title'); expect(custom.html).not.toContain('class="status-bar"');
    expect(normalizeMobileNavigation(html, { deviceProfile: 'pc' }).html).toBe(html);
    const business = '<main><header><h1>会员管理</h1><button>新增会员</button><input placeholder="搜索" /></header><article>业务</article></main>';
    expect(normalizeMobileNavigation(business, policy).html).toBe(business);
    const mixed = normalizeMobileNavigation('<main><header class="navbar"><h1 class="title">会员</h1><button aria-label="返回">‹</button><input placeholder="搜索会员"><button>新增会员</button></header><article>业务</article></main>', policy);
    expect(mixed.html).toContain('搜索会员'); expect(mixed.html).toContain('<h1 class="title">会员</h1>'); expect(mixed.html).toContain('新增会员'); expect(mixed.html).not.toContain('aria-label="返回"');
  });
  test('语义导航可识别，业务状态提示与卡片内导航不误删', () => {
    const input = '<main><header><button aria-label="返回">‹</button><h1>页面标题</h1></header><article>业务正文</article></main>';
    const result = normalizeMobileNavigation(input, policy);
    expect(result.title).toBe('页面标题'); expect(result.html).not.toContain('aria-label="返回"');
    const business = '<main><div class="status-bar"><svg viewBox="0 0 24 24"></svg>待回访</div><article class="card"><nav class="navbar"><h2>卡片内部</h2></nav></article></main>';
    expect(normalizeMobileNavigation(business, policy).html).toBe(business);
  });
  test('微信外壳没有工程节点，只存在渲染文档并能去重', () => {
    const doc = new DOMParser().parseFromString('<body><article>业务</article></body>', 'text/html');
    injectMobileChrome(doc, policy, '<会员>'); injectMobileChrome(doc, policy, '<会员>');
    expect(doc.querySelectorAll('[data-taudesign-mobile-chrome="header"]').length).toBe(1);
    expect(doc.querySelector('[data-taudesign-mobile-chrome] [data-nid]')).toBeNull();
    expect(doc.querySelector('.td-mini-title')?.textContent).toBe('<会员>');
    expect(doc.querySelectorAll('.td-mini-capsule > span').length).toBe(2);
  });
  test('画布/PNG含微信顶部，HTML导出无顶部，自定义只补系统状态', () => {
    const canvas = buildScreenDocument(page, { ...options, includeMobileChrome: true });
    const exported = buildStandaloneHtml(page, options);
    const png = buildExportRenderDocument(page, { ...options, width: 390, bgColor: '#fff' });
    const svg = buildExportSvg(page, { ...options, width: 390, height: 844, bgColor: '#fff' });
    for (const result of [canvas, png, svg]) expect(result).toContain('td-mini-capsule');
    expect(exported).not.toContain('td-mini-capsule'); expect(exported).not.toContain('class="appbar"');
    expect(exported).not.toContain('class="status-bar"'); expect(exported).toContain('新增会员');
    const custom = buildScreenDocument(page, { ...options, useCustomNavigation: true, includeMobileChrome: true });
    expect(custom).toContain('class="appbar"');
    expect(new DOMParser().parseFromString(custom, 'text/html').querySelector('.td-mini-navigation')).toBeNull();
  });
});
