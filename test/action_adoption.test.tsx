import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { InfiniteCanvas } from '../src/components/canvas/InfiniteCanvas';
import { useProjectStore } from '../src/stores/useProjectStore';
import { useHistoryStore } from '../src/stores/useHistoryStore';
import type { RenderedQualityReport } from '../src/utils/renderedQuality';
import { buildDesignTaskContract } from '../src/services/ai/designWorkflow';
import { knowledgeFingerprint } from '../src/services/ai/projectKnowledge';
import { createProjectStorage } from '../src/services/storage/projectStorage';

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
  useProjectStore.setState({ screens: { action: { id: 'action', name: '操作页', htmlContent: original, scopedCss: '', position: { x: 0, y: 0 } } }, screenOrder: ['action'], activeScreenId: 'action', overrides: {}, projectDocuments: {}, stagedScreen: null, stagedRenderQuality: null });
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
  test('强制采纳仅绕过结构守卫，保留源码安全与当前渲染检查', async () => {
    const store = useProjectStore.getState();
    store.stageScreenChange('action', `${candidate}<script>alert(1)</script>`, '守卫拦截候选');
    store.setStagedRenderQuality(key(), clean);
    await store.forceAdoptStagedChange();
    expect(useProjectStore.getState().stagedScreen).not.toBeNull();
    expect(useProjectStore.getState().screens.action.htmlContent).toBe(original);

    store.stageScreenChange('action', candidate, '守卫拦截候选');
    await store.forceAdoptStagedChange();
    expect(useProjectStore.getState().stagedScreen).not.toBeNull();
    store.setStagedRenderQuality(key(), clean);
    await store.forceAdoptStagedChange();
    expect(useProjectStore.getState().stagedScreen).toBeNull();
    expect(useProjectStore.getState().screens.action.htmlContent).toContain('创建项目');
  });
  test('源文案清空或删除主按钮时，直接store采纳也被阻止', async () => {
    const store = useProjectStore.getState();
    for (const html of [candidate.replace('创建项目', ''), '<main data-nid="root0001"></main>']) {
      store.stageScreenChange('action', html, '候选', '调整布局');
      await store.adoptStagedChange();
      await store.keepBothScreens();
      expect(useProjectStore.getState().stagedScreen).not.toBeNull();
      expect(useProjectStore.getState().screens.action.htmlContent).toBe(original);
      expect(useProjectStore.getState().screenOrder).toEqual(['action']);
    }
  });
  test('新引入的未登记图片资源不能由普通或强制采纳写入原页', async () => {
    const store = useProjectStore.getState();
    store.stageScreenChange('action', `${candidate}<img src="assets/images/ghost.png" alt="缺失图">`, '候选', '加图片');
    store.setStagedRenderQuality(key(), clean);
    await store.adoptStagedChange(); await store.forceAdoptStagedChange(); await store.keepBothScreens();
    expect(useProjectStore.getState().screens.action.htmlContent).toBe(original);
    expect(useProjectStore.getState().screenOrder).toEqual(['action']);
    expect(useProjectStore.getState().stagedScreen).not.toBeNull();
  });
  test('用户明确删除主按钮时允许源检查后采纳', async () => {
    const store = useProjectStore.getState();
    store.stageScreenChange('action', '<main data-nid="root0001"></main>', '候选', '删除立即创建项目按钮');
    store.setStagedRenderQuality(key(), clean);
    await store.adoptStagedChange();
    expect(useProjectStore.getState().stagedScreen).toBeNull();
    expect(useProjectStore.getState().screens.action.htmlContent).not.toContain('<button');
  });
  test('渲染报告缺失、未完成或不可用时所有直接采纳入口均拒绝', async () => {
    const store = useProjectStore.getState();
    for (const status of ['incomplete', 'unavailable'] as const) {
      store.stageScreenChange('action', candidate, '候选');
      store.setStagedRenderQuality(key(), { status, findings: [], inspected: 0, reason: '测试不可测量' });
      await store.adoptStagedChange();
      expect(useProjectStore.getState().stagedScreen).not.toBeNull();
      expect(useProjectStore.getState().screens.action.htmlContent).toBe(original);
    }
    store.stageScreenChange('action', candidate, '候选');
    await store.adoptStagedChange();
    expect(useProjectStore.getState().stagedScreen).not.toBeNull();
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
  test('执行记录留在候选但不膨胀渲染证据键', () => {
    const record = { source: 'model' as const, rawResponse: 'MODEL_RAW_MARKER'.repeat(3000), completeHtml: candidate,
      finishReason: 'stop', continuationCount: 1, warnings: [] };
    const store = useProjectStore.getState();
    store.stageScreenChange('action', candidate, '候选', '缩短文案', undefined, record);
    expect(useProjectStore.getState().stagedScreen?.executionRecord?.rawResponse).toBe(record.rawResponse);
    expect(store.getStagedRenderContextKey()).not.toContain('MODEL_RAW_MARKER');
  });
  test('交付报告由当前安全、质量、资源、任务和渲染证据计算', () => {
    const store = useProjectStore.getState();
    store.stageScreenChange('action', candidate, '候选');
    expect(store.getStagedDeliveryReport().status).toBe('pending');
    expect(store.getStagedDeliveryReport().checks.map(item => item.id)).toEqual(['task', 'source', 'quality', 'entities', 'assets', 'asset_files', 'render']);
    store.setStagedRenderQuality(key(), clean);
    expect(store.getStagedDeliveryReport().status).toBe('ready');
    store.setStagedRenderQuality(key(), { status: 'unavailable', findings: [], inspected: 0, reason: '图片无法加载' });
    expect(store.getStagedDeliveryReport().checks.find(item => item.id === 'render')).toMatchObject({ status: 'blocked', message: '图片无法加载' });
    store.stageScreenChange('action', `${candidate}<img src="assets/images/ghost.png" alt="缺失图">`, '候选');
    store.setStagedRenderQuality(key(), clean);
    const report = store.getStagedDeliveryReport();
    expect(report.status).toBe('blocked');
    expect(report.checks.find(item => item.id === 'assets')?.message).toContain('ghost.png');
  });
  test('新增已登记图片仍须核对物理文件，缺失时不能采纳', async () => {
    const projectId = `asset-gate-${Date.now()}`;
    const path = 'assets/images/new-photo.png';
    const asset = { id: 'new-photo', name: '新图片', type: 'image' as const, mimeType: 'image/png', source: 'upload' as const, relPath: path, refCount: 1 };
    useProjectStore.setState({ id: projectId, folderPath: undefined, assets: { [asset.id]: asset } });
    const store = useProjectStore.getState();
    store.stageScreenChange('action', `${candidate}<img src="${path}" alt="新图片">`, '缺文件候选');
    store.setStagedRenderQuality(key(), clean);
    expect(store.getStagedDeliveryReport().checks.find(check => check.id === 'asset_files')?.status).toBe('pending');
    await store.adoptStagedChange();
    expect(useProjectStore.getState().screens.action.htmlContent).toBe(original);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(store.getStagedDeliveryReport().checks.find(check => check.id === 'asset_files')).toMatchObject({ status: 'blocked' });
    await store.forceAdoptStagedChange();
    expect(useProjectStore.getState().screens.action.htmlContent).toBe(original);

    await createProjectStorage(projectId).writeBinary(path, 'dGVzdA==');
    store.recheckStagedAssetFiles();
    expect(store.getStagedDeliveryReport().checks.find(check => check.id === 'asset_files')?.status).toBe('pending');
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(store.getStagedDeliveryReport().checks.find(check => check.id === 'asset_files')?.status).toBe('passed');
    await createProjectStorage(projectId).remove(path);
  });
  test('已登记但路径不安全的候选资源不能绕过物理核对', async () => {
    useProjectStore.setState({ assets: { unsafe: { id: 'unsafe', name: '非法路径', type: 'image', mimeType: 'image/png', source: 'upload', relPath: 'assets/images/../escape.png', refCount: 1 } } });
    const store = useProjectStore.getState();
    store.stageScreenChange('action', `${candidate}<img data-asset-id="unsafe" alt="图片">`, '候选');
    store.setStagedRenderQuality(key(), clean);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(store.getStagedDeliveryReport().checks.find(check => check.id === 'asset_files')).toMatchObject({ status: 'blocked' });
    await store.forceAdoptStagedChange();
    expect(useProjectStore.getState().screens.action.htmlContent).toBe(original);
  });
  test('原页已有的缺失图片仍阻断最终候选，补齐文件后可以重新核对', async () => {
    const projectId = `retained-asset-${Date.now()}`;
    const path = 'assets/images/retained.png';
    const asset = { id: 'retained', name: '原有图片', type: 'image' as const, mimeType: 'image/png', source: 'upload' as const, relPath: path, refCount: 1 };
    const baseline = `${original}<img src="${path}" alt="原有图片">`;
    const result = `${candidate}<img src="${path}" alt="原有图片">`;
    useProjectStore.setState({ id: projectId, folderPath: undefined,
      screens: { action: { id: 'action', name: '操作页', htmlContent: baseline, position: { x: 0, y: 0 } } }, assets: { retained: asset } });
    const store = useProjectStore.getState();
    store.stageScreenChange('action', result, '候选', '缩短按钮文字');
    store.setStagedRenderQuality(key(), clean);
    expect(store.getStagedDeliveryReport().checks.find(check => check.id === 'asset_files')?.status).toBe('pending');
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(store.getStagedDeliveryReport().checks.find(check => check.id === 'asset_files')).toMatchObject({ status: 'blocked' });
    await store.adoptStagedChange(); await store.forceAdoptStagedChange();
    expect(useProjectStore.getState().screens.action.htmlContent).toBe(baseline);
    await createProjectStorage(projectId).writeBinary(path, 'dGVzdA==');
    store.recheckStagedAssetFiles();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(store.getStagedDeliveryReport().checks.find(check => check.id === 'asset_files')?.status).toBe('passed');
    await store.adoptStagedChange();
    expect(useProjectStore.getState().stagedScreen).toBeNull();
    await createProjectStorage(projectId).remove(path);
  });
  test('候选保留的未登记资源引用会阻断采纳；其它页面缺文件不牵连当前候选', async () => {
    const baseline = `${original}<img src="assets/images/ghost.png" alt="旧图">`;
    useProjectStore.setState({ screens: { action: { id: 'action', name: '操作页', htmlContent: baseline, position: { x: 0, y: 0 } } } });
    const store = useProjectStore.getState();
    store.stageScreenChange('action', `${candidate}<img src="assets/images/ghost.png" alt="旧图">`, '候选', '缩短按钮文字');
    store.setStagedRenderQuality(key(), clean);
    expect(store.getStagedDeliveryReport().checks.find(check => check.id === 'assets')).toMatchObject({ status: 'blocked' });
    await store.adoptStagedChange(); await store.forceAdoptStagedChange();
    expect(useProjectStore.getState().screens.action.htmlContent).toBe(baseline);
    store.discardStagedChange();
    useProjectStore.setState({ screens: { action: { id: 'action', name: '操作页', htmlContent: original, position: { x: 0, y: 0 } },
      unrelated: { id: 'unrelated', name: '其它页', htmlContent: '<img src="assets/images/missing.png">', position: { x: 100, y: 0 } } },
      assets: { missing: { id: 'missing', name: '其它页图片', type: 'image', mimeType: 'image/png', source: 'upload', relPath: 'assets/images/missing.png', refCount: 1 } } });
    store.stageScreenChange('action', candidate, '候选', '缩短按钮文字');
    store.setStagedRenderQuality(key(), clean);
    expect(store.getStagedDeliveryReport().checks.find(check => check.id === 'asset_files')?.status).toBe('passed');
    await store.adoptStagedChange();
    expect(useProjectStore.getState().stagedScreen).toBeNull();
  });
  test('项目知识或原页在生成后变化时，普通与强制采纳都拒绝过期任务', async () => {
    const store = useProjectStore.getState();
    const workflowContract = buildDesignTaskContract({ intent: 'modify_screen', request: '缩短按钮文字',
      target: { id: 'action', name: '操作页', htmlContent: original }, deviceProfile: store.settings.deviceProfile,
      frameWidth: store.settings.frameWidth, designSystem: store.designSystem, designSystemOrigin: store.designSystemOrigin,
      knowledgeFingerprint: knowledgeFingerprint(store) });
    store.stageScreenChange('action', candidate, '候选', '缩短按钮文字', workflowContract);
    store.setStagedRenderQuality(key(), clean);
    expect(store.isStagedTaskCurrent()).toBe(true);
    useProjectStore.setState({ projectDocuments: { brief: { id: 'brief', title: '需求', content: '新要求', source: 'manual', enabled: true, createdAt: 1, updatedAt: 1 } } });
    expect(store.isStagedTaskCurrent()).toBe(false);
    await store.adoptStagedChange(); await store.forceAdoptStagedChange(); await store.keepBothScreens();
    expect(useProjectStore.getState().screens.action.htmlContent).toBe(original);
    expect(useProjectStore.getState().stagedScreen).not.toBeNull();
    useProjectStore.setState({ projectDocuments: {}, screens: { action: { ...store.screens.action, htmlContent: `${original}<p>新段落</p>` } } });
    expect(store.isStagedTaskCurrent()).toBe(false);
  });
  test('设计来源身份或版本变化时，即使 Token 值相同也不能采纳旧候选', async () => {
    const origin = { ...useProjectStore.getState().designSystemOrigin!, kind: 'project' as const,
      sourceId: 'library-a', sourceFingerprint: 'revision-a', tokenVersion: 3 };
    useProjectStore.setState({ designSystemOrigin: origin });
    const store = useProjectStore.getState();
    const contract = buildDesignTaskContract({ intent: 'modify_screen', request: '缩短按钮文字',
      target: { id: 'action', name: '操作页', htmlContent: original }, deviceProfile: store.settings.deviceProfile,
      frameWidth: store.settings.frameWidth, designSystem: store.designSystem, designSystemOrigin: origin });
    store.stageScreenChange('action', candidate, '候选', '缩短按钮文字', contract);
    store.setStagedRenderQuality(key(), clean);
    expect(store.getStagedDeliveryReport().status).toBe('ready');
    for (const changed of [{ ...origin, sourceId: 'library-b' }, { ...origin, sourceFingerprint: 'revision-b' },
      { ...origin, tokenVersion: 4 }, { ...origin, kind: 'project_override' as const }]) {
      useProjectStore.setState({ designSystemOrigin: changed });
      expect(store.getStagedDeliveryReport().checks.find(check => check.id === 'task')).toMatchObject({ status: 'blocked' });
      await store.adoptStagedChange(); await store.forceAdoptStagedChange(); await store.keepBothScreens();
      expect(useProjectStore.getState().screens.action.htmlContent).toBe(original);
      expect(useProjectStore.getState().stagedScreen).not.toBeNull();
    }
  });
  test('仅分析的工作流合同不能被误当作可采纳页面候选', async () => {
    const store = useProjectStore.getState();
    const contract = buildDesignTaskContract({ intent: 'modify_screen', reviewRequired: true, request: '优化页面',
      target: { id: 'action', name: '操作页', htmlContent: original }, deviceProfile: store.settings.deviceProfile,
      frameWidth: store.settings.frameWidth });
    store.stageScreenChange('action', candidate, '误暂存候选', '优化页面', contract);
    store.setStagedRenderQuality(key(), clean);
    expect(store.getStagedDeliveryReport().checks.find(check => check.id === 'task')?.status).toBe('blocked');
    await store.adoptStagedChange(); await store.forceAdoptStagedChange(); await store.keepBothScreens();
    expect(useProjectStore.getState().screens.action.htmlContent).toBe(original);
    expect(useProjectStore.getState().stagedScreen).not.toBeNull();
  });
  for(const corruption of ['unknown','mismatch'] as const)test(`伪造${corruption}工作流身份不能通过普通或强制采纳`,async()=>{
    const store=useProjectStore.getState(),contract=buildDesignTaskContract({intent:'modify_screen',request:'缩短按钮文字',
      target:{id:'action',name:'操作页',htmlContent:original},deviceProfile:store.settings.deviceProfile,frameWidth:store.settings.frameWidth});
    (contract as any).workflowId=corruption==='unknown'?'invented-workflow':'answer-question';
    store.stageScreenChange('action',candidate,'伪造候选','缩短按钮文字',contract);store.setStagedRenderQuality(key(),clean);
    expect(store.getStagedDeliveryReport().status).toBe('blocked');
    expect(await store.adoptStagedChange()).toBe(false);expect(await store.forceAdoptStagedChange()).toBe(false);expect(await store.keepBothScreens()).toBe(false);
    expect(useProjectStore.getState().screens.action.htmlContent).toBe(original);
  });
  test('手动覆盖变化使原候选持续失效，重新发起任务并复验后才可采纳', async () => {
    const store = useProjectStore.getState();
    store.stageScreenChange('action', candidate, '候选', '缩短按钮文字');
    expect(useProjectStore.getState().stagedScreen?.modificationRequest).toBe('缩短按钮文字');
    const old = key(); store.setStagedRenderQuality(old, clean);
    useProjectStore.setState({ overrides: { 'action:action01': { nid: 'action01', declarations: { color: 'transparent' } } } });
    store.setStagedRenderQuality(old, clean);
    await store.adoptStagedChange();
    expect(useProjectStore.getState().stagedScreen).not.toBeNull();
    store.setStagedRenderQuality(key(), clean);
    await store.adoptStagedChange();
    expect(useProjectStore.getState().stagedScreen).not.toBeNull();
    expect(useProjectStore.getState().screens.action.htmlContent).toBe(original);
    store.stageScreenChange('action', candidate, '候选', '缩短按钮文字');
    expect(useProjectStore.getState().stagedRenderQuality).toBeNull();
    store.setStagedRenderQuality(key(), clean);
    await store.adoptStagedChange();
    expect(useProjectStore.getState().stagedScreen).toBeNull();
    expect(useProjectStore.getState().stagedRenderQuality).toBeNull();
  });
  test('新候选清空旧报告；普通渲染warning允许采纳', async () => {
    const store = useProjectStore.getState();
    store.stageScreenChange('action', candidate, '候选');
    const old = key(); store.setStagedRenderQuality(old, error);
    store.stageScreenChange('action', candidate.replace('创建项目', '立即创建'), '下一候选');
    expect(useProjectStore.getState().stagedRenderQuality).toBeNull();
    store.setStagedRenderQuality(old, error);
    expect(useProjectStore.getState().stagedRenderQuality).toBeNull();
    store.setStagedRenderQuality(key(), { ...error, findings: error.findings.map(f => ({ ...f, severity: 'warning' })) });
    await store.adoptStagedChange();
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
  test('候选新引入未登记图片时画布禁用采纳并说明资源问题', async () => {
    const store = useProjectStore.getState();
    store.stageScreenChange('action', `${candidate}<img src="assets/images/ghost.png" alt="缺失图">`, '候选');
    store.setStagedRenderQuality(key(), clean);
    container = document.createElement('div'); document.body.appendChild(container);
    mounted = createRoot(container);
    await act(async () => mounted!.render(<InfiniteCanvas />));
    for (const label of ['采纳新版', '两版都留']) {
      const button = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes(label));
      expect(button?.disabled).toBe(true);
    }
    expect(container.textContent).toContain('候选资源引用未通过');
    expect(container.textContent).toContain('assets/images/ghost.png');
  });
  test('画布显示新增资源的物理缺失并提供重新核对入口', async () => {
    const projectId = `asset-ui-${Date.now()}`;
    const path = 'assets/images/physical.png';
    useProjectStore.setState({ id: projectId, folderPath: undefined, assets: { physical: { id: 'physical', name: '实物图片', type: 'image', mimeType: 'image/png', source: 'upload', relPath: path, refCount: 1 } } });
    const store = useProjectStore.getState();
    store.stageScreenChange('action', `${candidate}<img src="${path}" alt="实物图片">`, '候选');
    store.setStagedRenderQuality(key(), clean);
    await new Promise(resolve => setTimeout(resolve, 0));
    container = document.createElement('div'); document.body.appendChild(container);
    mounted = createRoot(container);
    await act(async () => mounted!.render(<InfiniteCanvas />));
    expect(container.textContent).toContain('文件 assets/images/physical.png 不存在');
    expect(Array.from(container.querySelectorAll('button')).some(button => button.textContent === '重新核对')).toBe(true);
    expect(Array.from(container.querySelectorAll('button')).find(button => button.textContent?.includes('采纳新版'))?.disabled).toBe(true);
  });
  test('渲染检查不可用时画布禁用采纳并说明原因', async () => {
    const store = useProjectStore.getState();
    store.stageScreenChange('action', candidate, '候选');
    store.setStagedRenderQuality(key(), { status: 'unavailable', findings: [], inspected: 0, reason: '画框尚无可测量尺寸' });
    container = document.createElement('div'); document.body.appendChild(container);
    mounted = createRoot(container);
    await act(async () => mounted!.render(<InfiniteCanvas />));
    await act(async () => store.setStagedRenderQuality(key(), { status: 'unavailable', findings: [], inspected: 0, reason: '画框尚无可测量尺寸' }));
    for (const label of ['采纳新版', '两版都留']) {
      const button = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes(label));
      expect(button?.disabled).toBe(true);
    }
    expect(container.textContent).toContain('渲染检查未完成，暂不能采纳');
  });
});
