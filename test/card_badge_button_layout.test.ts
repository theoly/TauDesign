import {expect, test} from 'bun:test';
import {extractClassWhitelist} from '../src/utils/cssCompiler';
import {getBaseCss} from '../src/styles/baseCss';
import {inspectRenderedQuality} from '../src/utils/renderedQuality';

test('CHK-F-01: base.css 包含 relative 与 absolute 原子定位类并在白名单中', () => {
  const whitelist = extractClassWhitelist(getBaseCss('pc'));
  expect(whitelist).toContain('relative');
  expect(whitelist).toContain('absolute');

  const mobileWhitelist = extractClassWhitelist(getBaseCss('mobile'));
  expect(mobileWhitelist).toContain('relative');
  expect(mobileWhitelist).toContain('absolute');
});

test('CHK-F-02: .btn.px-* 能够覆盖按钮默认的 16px 水平内边距', () => {
  const css = getBaseCss('pc');
  expect(css).toContain('.btn.px-0');
  expect(css).toContain('.btn.px-1');
  expect(css).toContain('.btn.px-2');
  expect(css).toContain('.btn.px-3');
  expect(css).toContain('.btn.px-4');
});

function makeFixture(html: string) {
  const iframe = document.createElement('iframe');
  document.body.append(iframe);
  const doc = iframe.contentDocument!;
  doc.head.innerHTML = `<style>* { background-color:rgba(0,0,0,0); font-size:14px; visibility:visible; opacity:1; } html,body { background-color:rgb(255,255,255); color:rgb(0,0,0); opacity:1; }</style>`;
  doc.body.innerHTML = html;
  const setRect = (el: Element, left: number, top: number, width: number, height: number, scrollWidth = width) => {
    el.getBoundingClientRect = () => ({ x: left, y: top, left, top, width, height, right: left + width, bottom: top + height, toJSON: () => ({}) });
    Object.defineProperty(el, 'clientWidth', { configurable: true, value: width });
    Object.defineProperty(el, 'clientHeight', { configurable: true, value: height });
    Object.defineProperty(el, 'scrollWidth', { configurable: true, value: scrollWidth });
    Object.defineProperty(el, 'scrollHeight', { configurable: true, value: height });
  };
  Object.defineProperty(doc.documentElement, 'clientWidth', { configurable: true, value: 390 });
  Object.defineProperty(doc.documentElement, 'clientHeight', { configurable: true, value: 844 });
  setRect(doc.body, 0, 0, 390, 844);
  return { iframe, doc, setRect, report: () => inspectRenderedQuality(doc) };
}

test('CHK-F-03: renderedQuality 能够检测操作按钮文字超出按钮宽度', () => {
  const f = makeFixture('<button class="btn" data-nid="overflow-btn">发送超长小纸条</button>');
  const btn = f.doc.querySelector('[data-nid="overflow-btn"]')!;
  // clientWidth: 60px, scrollWidth: 96px -> 超出按钮
  f.setRect(btn, 10, 10, 60, 36, 96);

  const report = f.report();
  f.iframe.remove();
  const finding = report.findings.find(f => f.code === 'render_action_overflow');
  expect(finding).toBeDefined();
  expect(finding?.message).toContain('超出按钮宽度');
});

test('CHK-F-03: renderedQuality 能够检测绝对定位容器中的徽标遮挡文字', () => {
  const f = makeFixture(`
    <div class="card" data-nid="card">
      <div class="absolute" data-nid="wrap-badge">
        <span class="badge" data-nid="b1">已实名认证</span>
      </div>
      <h3 data-nid="h1">林知夏</h3>
    </div>
  `);
  const card = f.doc.querySelector('[data-nid="card"]')!;
  const wrap = f.doc.querySelector('[data-nid="wrap-badge"]')!;
  const badge = f.doc.querySelector('[data-nid="b1"]')!;
  const h3 = f.doc.querySelector('[data-nid="h1"]')!;

  f.setRect(card, 10, 10, 300, 200);
  f.setRect(wrap, 10, 10, 80, 24);
  // 徽标 rect 与 文字 rect 在空间上发生重叠
  f.setRect(badge, 10, 10, 80, 24);
  f.setRect(h3, 10, 15, 100, 30);

  // Range 模拟文字物理位置与徽标相交
  f.doc.createRange = (() => ({
    selectNodeContents: () => {},
    getClientRects: () => [{ top: 15, bottom: 45, left: 10, right: 110, width: 100, height: 30 }]
  })) as typeof f.doc.createRange;

  const report = f.report();
  f.iframe.remove();
  const finding = report.findings.find(f => f.code === 'render_badge_overlap');
  expect(finding).toBeDefined();
  expect(finding?.message).toContain('徽标可能遮挡');
});

test('CHK-F-04: 3 个按钮的移动端操作栏按比例分配后无内容溢出与贴边', () => {
  const f = makeFixture(`
    <div class="card p-4" data-nid="card">
      <div class="row items-center gap-2" data-nid="row">
        <button class="btn btn-ghost flex-none" data-nid="b-none">无感</button>
        <button class="btn btn-outline flex-none" data-nid="b-like">喜欢</button>
        <button class="btn btn-primary flex-1 min-w-0" data-nid="b-msg">
          <svg class="icon"></svg>
          <span>发送小纸条</span>
        </button>
      </div>
    </div>
  `);
  const card = f.doc.querySelector('[data-nid="card"]')!;
  const row = f.doc.querySelector('[data-nid="row"]')!;
  const bNone = f.doc.querySelector('[data-nid="b-none"]')!;
  const bLike = f.doc.querySelector('[data-nid="b-like"]')!;
  const bMsg = f.doc.querySelector('[data-nid="b-msg"]')!;

  f.setRect(card, 10, 10, 316, 120);
  f.setRect(row, 26, 26, 284, 40);
  f.setRect(bNone, 26, 26, 78, 38);
  f.setRect(bLike, 112, 26, 78, 38);
  f.setRect(bMsg, 198, 26, 112, 38, 98); // scrollWidth 98 < clientWidth 112，容纳自如

  const report = f.report();
  f.iframe.remove();
  expect(report.findings.filter(f => f.code === 'render_action_overflow')).toHaveLength(0);
});
