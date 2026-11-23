import { expect, test } from 'bun:test';
import { applyConfirmedLayoutDirectives } from '../src/services/ai/confirmedLayoutDirectives';
import { buildReviewedModificationRequest } from '../src/services/ai/modificationReview';

const html = `<section data-nid="scaw2585" class="card col gap-3">
  <div data-nid="scaw258p" class="row gap-1">
    <button data-nid="scaw258a" class="btn btn-text btn-sm p-0 tap-target" aria-label="1"><span class="icon-mask"></span></button>
    <button data-nid="scaw258b" class="btn btn-text btn-sm p-0 tap-target" aria-label="2"><span class="icon-mask"></span></button>
  </div>
  <button data-nid="scaw258z" class="btn tap-target">移除该维度</button>
</section>`;

const request = `1. 收紧星组：将星组容器（scaw258p）的 gap-1 改为 gap-0，并把组内星按钮的 tap-target 类移除。（目标区块: scaw2585）`;

test('confirmed gap and tap-target edits land on named icon buttons only', () => {
  const next = applyConfirmedLayoutDirectives(html, request);
  const doc = new DOMParser().parseFromString(next, 'text/html');
  expect(doc.querySelector('[data-nid="scaw258p"]')?.className).toContain('gap-0');
  expect(doc.querySelector('[data-nid="scaw258p"]')?.className).not.toContain('gap-1');
  expect(doc.querySelector('[data-nid="scaw258a"]')?.className).not.toContain('tap-target');
  expect(doc.querySelector('[data-nid="scaw258b"]')?.className).not.toContain('tap-target');
  expect(doc.querySelector('[data-nid="scaw258z"]')?.className).toContain('tap-target');
});

test('rewritten nids still tighten a dense icon row that kept the source gap', () => {
  const rewritten = `<section data-nid="scaw2585" class="card col gap-3">
    <div data-nid="newnid01" class="row gap-1">
      <button class="btn tap-target" aria-label="1"><span class="icon-mask"></span></button>
      <button class="btn tap-target" aria-label="2"><span class="icon-mask"></span></button>
      <button class="btn tap-target" aria-label="3"><span class="icon-mask"></span></button>
    </div>
    <div data-nid="newnid02" class="row gap-1">
      <button class="btn tap-target" aria-label="编辑"><span class="icon-mask"></span></button>
      <button class="btn tap-target" aria-label="删除"><span class="icon-mask"></span></button>
    </div>
    <button data-nid="scaw258z" class="btn tap-target">移除该维度</button>
  </section>`;
  const next = applyConfirmedLayoutDirectives(rewritten, request);
  const doc = new DOMParser().parseFromString(next, 'text/html');
  const dense = doc.querySelector('[data-nid="newnid01"]');
  const pair = doc.querySelector('[data-nid="newnid02"]');
  expect(dense?.className).toContain('gap-0');
  expect(dense?.querySelector('.tap-target')).toBeNull();
  expect(pair?.className).toContain('gap-1');
  expect(pair?.querySelector('.tap-target')).not.toBeNull();
  expect(doc.querySelector('[data-nid="scaw258z"]')?.className).toContain('tap-target');
});

test('unrelated requests and protected nodes stay unchanged', () => {
  expect(applyConfirmedLayoutDirectives(html, '只改文案')).toBe(html);
  const locked = applyConfirmedLayoutDirectives(html, request, ['scaw258p']);
  expect(locked).toContain('gap-1');
  expect(locked).toContain('tap-target');
});

test('confirmed rating text without node ids packs spread heart rows only', () => {
  const page = `<section class="card col gap-3">
    <div class="row justify-between flex-1 gap-3">
      <span>候选 A 评价</span>
      <div class="grid-5 flex-1 justify-between">
        <button class="btn btn-text btn-sm p-0 tap-target flex-1" aria-label="1"><span class="icon-mask"></span></button>
        <button class="btn btn-text btn-sm p-0 tap-target flex-1" aria-label="2"><span class="icon-mask"></span></button>
        <button class="btn btn-text btn-sm p-0 tap-target flex-1" aria-label="3"><span class="icon-mask"></span></button>
        <button class="btn btn-text btn-sm p-0 tap-target flex-1" aria-label="4"><span class="icon-mask"></span></button>
        <button class="btn btn-text btn-sm p-0 tap-target flex-1" aria-label="5"><span class="icon-mask"></span></button>
      </div>
      <span>4 / 5 不错</span>
    </div>
    <div class="row gap-1">
      <button class="btn tap-target" aria-label="编辑"><span class="icon-mask"></span></button>
      <button class="btn tap-target" aria-label="删除"><span class="icon-mask"></span></button>
    </div>
    <button class="btn tap-target">移除该维度</button>
  </section>`;
  const confirmed = `1. 收入维度星级行去掉 tap-target 并收紧星形间距：对星形按钮移除 tap-target 类，保留 btn btn-text btn-sm p-0 与原有 icon-mask 星形控件，使星形按 gap-1 紧凑排列。`;
  const next = applyConfirmedLayoutDirectives(page, confirmed);
  const doc = new DOMParser().parseFromString(next, 'text/html');
  const stars = doc.querySelector('.grid-5, .justify-start');
  expect(stars?.className).toContain('justify-start');
  expect(stars?.className).toContain('gap-1');
  expect(stars?.className).not.toContain('grid-5');
  expect(stars?.className).not.toContain('justify-between');
  expect(stars?.className).not.toContain('flex-1');
  expect(stars?.querySelector('.tap-target')).toBeNull();
  expect(stars?.querySelector('button')?.className).toContain('px-0');
  expect(stars?.querySelector('button')?.className).not.toContain('flex-1');
  expect(doc.querySelector('button.btn.tap-target')?.getAttribute('aria-label')).toBe('编辑');
  expect(Array.from(doc.querySelectorAll('button')).some((button) => button.textContent?.includes('移除该维度') && button.className.includes('tap-target'))).toBe(true);
});

test('reviewed request states that confirmed class edits beat the 44px default', () => {
  const text = buildReviewedModificationRequest({
    summary: '收紧',
    items: [{ id: 'suggestion-1', title: '收紧星组', reason: '44px 过宽', change: 'gap-1 改为 gap-0，并移除 tap-target', targetNids: ['scaw258p'] }],
  }, ['suggestion-1'], '');
  expect(text).toContain('已确认的类名变更优先于默认44px触控');
});
