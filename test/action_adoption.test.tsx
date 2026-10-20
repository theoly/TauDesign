import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { InfiniteCanvas } from '../src/components/canvas/InfiniteCanvas';
import { useProjectStore } from '../src/stores/useProjectStore';
import { useHistoryStore } from '../src/stores/useHistoryStore';
import type { RenderedQualityReport } from '../src/utils/renderedQuality';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const original = '<main data-nid="root0001"><button class="btn btn-primary" data-nid="action01">立即创建项目</button></main>';
const candidate = '<main data-nid="root0001"><button class="btn btn-primary" data-nid="action01">创建项目</button></main>';
const clean: RenderedQualityReport = { status: 'complete', findings: [], inspected: 2 };
const error: RenderedQualityReport = { ...clean, findings: [{ code: 'render_action_text_invisible', severity: 'error', nid: 'action01', message: '按钮文字不可见', actual: 'transparent', expected: '可读文字' }] };
const key = () => useProjectStore.getState().getStagedRenderContextKey();
let mounted: Root | undefined;
let container: HTMLDivElement | undefined;
let history: ReturnType<typeof useHistoryStore.getState>;
let saved: ReturnType<typeof useProjectStore.getState>;
beforeEach(() => {
  saved = useProjectStore.getState();
  history = useHistoryStore.getState();
  useProjectStore.setState({ screens: { action: { id: 'action', name: '操作页', htmlContent: original, scopedCss: '', position: { x: 0, y: 0 } } }, screenOrder: ['action'], activeScreenId: 'action', overrides: {}, stagedScreen: null, stagedRenderQuality: null });
});
afterEach(() => {
  if (mounted) act(() => mounted!.unmount());
  container?.remove(); mounted = undefined; container = undefined;
  useProjectStore.setState(saved, true);
  useHistoryStore.setState(history, true);
});

describe('候选采纳底线', () => {
  for (const method of ['adoptStagedChange', 'keepBothScreens'] as const) {
    test(`${method}在源检查严重错误时保留候选与原页`, () => {
      const store = useProjectStore.getState();
      store.stageScreenChange('action', `${candidate}<script>alert(1)</script>`, '候选');
      store[method]();
      expect(useProjectStore.getState().stagedScreen).not.toBeNull();
      expect(useProjectStore.getState().screens.action.htmlContent).toBe(original);
      expect(useProjectStore.getState().screenOrder).toEqual(['action']);
    });
    test(`${method}不能绕过当前渲染严重错误`, () => {
      const store = useProjectStore.getState();
      store.stageScreenChange('action', candidate, '候选');
      store.setStagedRenderQuality(key(), error);
      store[method]();
      expect(useProjectStore.getState().stagedScreen).not.toBeNull();
      expect(useProjectStore.getState().screens.action.htmlContent).toBe(original);
      expect(useProjectStore.getState().screenOrder).toEqual(['action']);
    });
  }
  test('源文案清空或删除主按钮时，直接store采纳也被阻止', () => {
    const store = useProjectStore.getState();
    for (const html of [candidate.replace('创建项目', ''), '<main data-nid="root0001"></main>']) {
      store.stageScreenChange('action', html, '候选', '调整布局');
      store.adoptStagedChange();
      store.keepBothScreens();
      expect(useProjectStore.getState().stagedScreen).not.toBeNull();
      expect(useProjectStore.getState().screens.action.htmlContent).toBe(original);
      expect(useProjectStore.getState().screenOrder).toEqual(['action']);
    }
  });
  test('用户明确删除主按钮时允许源检查后采纳', () => {
    const store = useProjectStore.getState();
    store.stageScreenChange('action', '<main data-nid="root0001"></main>', '候选', '删除立即创建项目按钮');
    store.adoptStagedChange();
    expect(useProjectStore.getState().stagedScreen).toBeNull();
    expect(useProjectStore.getState().screens.action.htmlContent).not.toContain('<button');
  });
  test('报告及候选动作不写历史；丢弃清空渲染证据', () => {
    const store = useProjectStore.getState();
    const before = useHistoryStore.getState();
    store.stageScreenChange('action', candidate, '候选');
    store.setStagedRenderQuality(key(), error);
    expect(useHistoryStore.getState().past).toBe(before.past);
    expect(useHistoryStore.getState().checkpoints).toBe(before.checkpoints);
    store.discardStagedChange();
    expect(useProjectStore.getState().stagedRenderQuality).toBeNull();
  });
  test('重新暂存同HTML也拒绝上轮报告', () => {
    const store = useProjectStore.getState();
    store.stageScreenChange('action', candidate, '候选');
    const old = key();
    store.stageScreenChange('action', candidate, '候选');
    store.setStagedRenderQuality(old, clean);
    expect(key()).not.toBe(old);
    expect(useProjectStore.getState().stagedRenderQuality).toBeNull();
  });
  test('通过报告不能覆盖变化后的主题；迟到旧报告也被忽略', () => {
    const store = useProjectStore.getState();
    store.stageScreenChange('action', candidate, '候选', '缩短按钮文字');
    expect(useProjectStore.getState().stagedScreen?.modificationRequest).toBe('缩短按钮文字');
    const old = key(); store.setStagedRenderQuality(old, clean);
    useProjectStore.setState({ overrides: { 'action:action01': { nid: 'action01', declarations: { color: 'transparent' } } } });
    store.setStagedRenderQuality(old, clean);
    store.adoptStagedChange();
    expect(useProjectStore.getState().stagedScreen).not.toBeNull();
    store.setStagedRenderQuality(key(), clean);
    store.adoptStagedChange();
    expect(useProjectStore.getState().stagedScreen).toBeNull();
    expect(useProjectStore.getState().stagedRenderQuality).toBeNull();
  });
  test('新候选清空旧报告；普通渲染warning允许采纳', () => {
    const store = useProjectStore.getState();
    store.stageScreenChange('action', candidate, '候选');
    const old = key(); store.setStagedRenderQuality(old, error);
    store.stageScreenChange('action', candidate.replace('创建项目', '立即创建'), '下一候选');
    expect(useProjectStore.getState().stagedRenderQuality).toBeNull();
    store.setStagedRenderQuality(old, error);
    expect(useProjectStore.getState().stagedRenderQuality).toBeNull();
    store.setStagedRenderQuality(key(), { ...error, findings: error.findings.map(f => ({ ...f, severity: 'warning' })) });
    store.adoptStagedChange();
    expect(useProjectStore.getState().stagedScreen).toBeNull();
  });
  test('画布采纳及两版保留在渲染严重错误时禁用', async () => {
    const store = useProjectStore.getState();
    store.stageScreenChange('action', candidate, '候选');
    store.setStagedRenderQuality(key(), error);
    container = document.createElement('div'); document.body.appendChild(container);
    mounted = createRoot(container);
    await act(async () => mounted!.render(<InfiniteCanvas />));
    await act(async () => store.setStagedRenderQuality(key(), error));
    for (const label of ['采纳新版', '两版都留']) {
      const button = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes(label));
      expect(button?.disabled).toBe(true);
    }
    expect(container.textContent).toContain('按钮文字不可见');
  });
});
