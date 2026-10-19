import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useAIEngineChat } from '../src/services/ai/engine/react/useAIEngineChat';
import { DefaultAIEngineCore } from '../src/services/ai/engine/core';
import { PipelineExecutor } from '../src/services/ai/engine/pipeline/executor';
import { analyzeScreenModification, buildReviewedModificationRequest, captureModificationSnapshot, isModificationSnapshotCurrent } from '../src/services/ai/modificationReview';
import { ModificationReviewCard } from '../src/components/chat/ModificationReviewCard';
import { RestylePanel } from '../src/components/theme/RestylePanel';
import { InfiniteCanvas } from '../src/components/canvas/InfiniteCanvas';
import { useProjectStore } from '../src/stores/useProjectStore';
import { useAIConfigStore, defaultProviders, defaultBindings } from '../src/stores/useAIConfigStore';
import { defaultTheme } from '../src/utils/themePresets';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const analysis = { summary: '页面结构分析', items: [
  { id: 'suggestion-1', title: '调整主次层级', reason: '标题和正文样式相同', change: '提高标题层级' },
  { id: 'suggestion-2', title: '调整卡片间距', reason: '卡片缺少间距', change: '增加卡片间距' }
] };
const html = '<main data-nid="root0001" class="col"><h1 data-nid="title001">原页面</h1></main>';

describe('旧页面分析选择与比较聚焦', () => {
  let host: HTMLDivElement, root: Root, targetId: string;
  let engine: ReturnType<typeof useAIEngineChat>;
  let objectMock: ReturnType<typeof spyOn>, pipelineMock: ReturnType<typeof spyOn>;
  const Harness = () => { engine = useAIEngineChat(); return null; };
  const render = async (node: React.ReactNode) => { await act(async () => { root.render(node); }); };
  const start = async () => { await act(async () => { await engine.sendMessage('修改当前页面，优化信息层级', undefined, { referencedScreenId: targetId }); }); };
  const latestPlan = () => engine.messages.find(m => m.modificationReview?.status === 'ready')!;
  beforeEach(() => {
    localStorage.clear();
    useProjectStore.getState().initNewProject({ name: '分析测试', deviceProfile: 'mobile', designSystem: defaultTheme, createSpecimen: false });
    targetId = useProjectStore.getState().addScreen({ name: '原页面', htmlContent: html });
    useAIConfigStore.setState({ providers: defaultProviders.map(p => p.id === 'prov-deepseek' ? { ...p, apiKey: 'test' } : p), bindings: defaultBindings });
    objectMock = spyOn(DefaultAIEngineCore.prototype, 'generateObject').mockResolvedValue(analysis);
    pipelineMock = spyOn(PipelineExecutor, 'execute').mockResolvedValue({ status: 'staged_side_by_side', rawResponse: `<artifact type="screen">${html}</artifact>`, extractedHtml: html });
    host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  });
  afterEach(() => { act(() => root.unmount()); host.remove(); objectMock.mockRestore(); pipelineMock.mockRestore(); });

  test('分析使用原HTML/Token/用户诉求与元素范围；非法结果拒绝，不伪造建议', async () => {
    const core = new DefaultAIEngineCore({} as any);
    const options = { provider: defaultProviders[0], model: 'test', html, name: '原页面', request: '优化', designSystem: defaultTheme, mode: 'light' as const, elementNid: 'title001' };
    const result = await analyzeScreenModification(core, options);
    expect(result.items).toHaveLength(2);
    const request = objectMock.mock.calls[0][1];
    const context = JSON.parse(request.messages[1].content);
    expect(context.html).toBe(html); expect(context.elementNid).toBe('title001'); expect(context.tokens).toContain('--color-primary:');
    objectMock.mockResolvedValue({ summary: '错误', items: [{ title: '无依据' }] });
    await expect(analyzeScreenModification(core, options)).rejects.toThrow('缺少问题依据');
    objectMock.mockResolvedValue({ summary: '无问题', items: [] });
    expect((await analyzeScreenModification(core, options)).items).toEqual([]);
    const controller = new AbortController(); controller.abort();
    await expect(analyzeScreenModification(core, { ...options, signal: controller.signal })).rejects.toThrow('取消');
  });

  test('确认前不生成；仅传递所选建议与补充，切换激活画框不改变目标，重复确认只执行一次', async () => {
    await render(<Harness />); await start();
    expect(pipelineMock).not.toHaveBeenCalled(); expect(useProjectStore.getState().stagedScreen).toBeNull();
    expect(useProjectStore.getState().screens[targetId].htmlContent).toBe(html);
    const plan = latestPlan();
    act(() => { useProjectStore.getState().addScreen({ name: '其他页面', htmlContent: '<main>其他</main>' }); });
    await act(async () => { await Promise.all([engine.confirmModification(plan.id, ['suggestion-1'], '保留配色'), engine.confirmModification(plan.id, ['suggestion-1'], '')]); });
    expect(pipelineMock).toHaveBeenCalledTimes(1);
    const input = pipelineMock.mock.calls[0][0].input;
    expect(input.activeScreenId).toBe(targetId); expect(input.rawPrompt).toContain('提高标题层级'); expect(input.rawPrompt).toContain('保留配色');
    expect(input.rawPrompt).not.toContain('增加卡片间距'); expect(useProjectStore.getState().stagedScreen?.targetScreenId).toBe(targetId);
    expect(useProjectStore.getState().screens[targetId].htmlContent).toBe(html);
  });

  test('取消或原HTML改变后不执行旧计划，可重新分析', async () => {
    await render(<Harness />); await start();
    const cancelled = latestPlan(); act(() => engine.cancelModification(cancelled.id));
    await act(async () => { await engine.confirmModification(cancelled.id, ['suggestion-1'], ''); });
    expect(pipelineMock).not.toHaveBeenCalled();
    await start(); const stale = latestPlan();
    act(() => useProjectStore.getState().updateScreenHtml(targetId, '<main>已被手动修改</main>'));
    await act(async () => { await engine.confirmModification(stale.id, ['suggestion-1'], ''); });
    expect(pipelineMock).not.toHaveBeenCalled();
    expect(engine.messages.find(m => m.id === stale.id)?.modificationReview?.summary).toContain('重新分析');
    await act(async () => { await engine.retryModificationAnalysis(stale.id); });
    expect(latestPlan()).toBeDefined(); expect(objectMock).toHaveBeenCalledTimes(3);
  });

  test('补充文字可单独执行，空范围被拒绝；主题和覆盖样式变化使快照过期', () => {
    expect(() => buildReviewedModificationRequest(analysis, [], ' ')).toThrow();
    expect(buildReviewedModificationRequest(analysis, [], '只改标题')).toContain('只改标题');
    const snapshot = captureModificationSnapshot(useProjectStore.getState(), targetId);
    expect(isModificationSnapshotCurrent(useProjectStore.getState(), snapshot)).toBe(true);
    useProjectStore.getState().setOverride(targetId, 'title001', { color: 'var(--color-primary)' });
    expect(isModificationSnapshotCurrent(useProjectStore.getState(), snapshot)).toBe(false);
  });

  test('生成期间原页面变化时不应用候选；新建与问答不触发分析', async () => {
    await render(<Harness />); await start(); const plan = latestPlan();
    let resolve!: (value: any) => void;
    pipelineMock.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
    let pending!: Promise<void>;
    await act(async () => { pending = engine.confirmModification(plan.id, ['suggestion-1'], ''); });
    act(() => useProjectStore.getState().updateScreenHtml(targetId, '<main>生成期间手动修改</main>'));
    await act(async () => { resolve({ status: 'staged_side_by_side', rawResponse: html, extractedHtml: html }); await pending; });
    expect(useProjectStore.getState().stagedScreen).toBeNull();
    expect(useProjectStore.getState().screens[targetId].htmlContent).toContain('手动修改');
    expect(engine.messages.at(-1)?.text).toContain('本次未应用修改');
    objectMock.mockClear();
    pipelineMock.mockResolvedValue({ status: 'answered_question', rawResponse: '已回复' });
    await act(async () => { await engine.sendMessage('这个工具如何使用？'); });
    await act(async () => { await engine.sendMessage('新建一个登录页面'); });
    expect(objectMock).not.toHaveBeenCalled();
  });

  test('分析期间切换工程，旧分析结果不进入新工程', async () => {
    await render(<Harness />);
    let resolve!: (value: any) => void;
    objectMock.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
    let pending!: Promise<void>;
    await act(async () => { pending = engine.sendMessage('修改当前页面', undefined, { referencedScreenId: targetId }); });
    await act(async () => { useProjectStore.getState().initNewProject({ name: '新工程', deviceProfile: 'mobile', designSystem: defaultTheme, createSpecimen: false }); });
    await act(async () => { resolve(analysis); await pending; });
    expect(engine.messages.some(m => m.modificationReview?.status === 'ready')).toBe(false);
    expect(pipelineMock).not.toHaveBeenCalled();
    expect(useProjectStore.getState().stagedScreen).toBeNull();
  });

  test('原目标删除后重新分析不转向其他激活画框', async () => {
    await render(<Harness />); await start(); const plan = latestPlan();
    act(() => {
      useProjectStore.getState().addScreen({ name: '另一个页面', htmlContent: '<main>保留</main>' });
      useProjectStore.getState().removeScreen(targetId);
    });
    await act(async () => { await engine.retryModificationAnalysis(plan.id); });
    expect(objectMock).toHaveBeenCalledTimes(1); expect(pipelineMock).not.toHaveBeenCalled();
    expect(engine.messages.find(m => m.id === plan.id)?.modificationReview?.summary).toContain('重新指定目标');
  });

  test('选择卡片不默认授权，允许补充文字和取消', async () => {
    const confirmed: any[] = []; let cancelled = false;
    await render(<ModificationReviewCard review={{ ...analysis, status: 'ready' }} onConfirm={(ids, extra) => { confirmed.push({ids, extra}); }} onCancel={() => {cancelled = true;}} />);
    const button = host.querySelector('button')!; expect(button.disabled).toBe(true);
    const checkbox = host.querySelector('input')!; expect(checkbox.checked).toBe(false);
    act(() => checkbox.click());
    expect(button.disabled).toBe(false);
    await act(async () => { button.click(); button.click(); });
    expect(confirmed).toHaveLength(1); expect(confirmed[0].ids).toEqual(['suggestion-1']);
    act(() => { host.querySelectorAll('button')[1].click(); }); expect(cancelled).toBe(true);
  });

  test('单页润色先选择，再生成候选，原HTML不变', async () => {
    let closed = false;
    const streamMock = spyOn(DefaultAIEngineCore.prototype, 'streamText').mockReturnValue({ textPromise: Promise.resolve(`\`\`\`html\n${html}\n\`\`\``) } as any);
    try {
      await render(<RestylePanel scope={targetId} onClose={() => { closed = true; }} />);
      const analyze = Array.from(host.querySelectorAll('button')).find(b => b.textContent?.includes('分析原页面'))!;
      await act(async () => { analyze.click(); });
      expect(objectMock).toHaveBeenCalledTimes(1); expect(streamMock).not.toHaveBeenCalled();
      act(() => host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
      await act(async () => { Array.from(host.querySelectorAll('button')).find(b => b.textContent?.includes('按所选内容生成新版'))!.click(); });
      expect(streamMock).toHaveBeenCalledTimes(1); expect(closed).toBe(true);
      expect(useProjectStore.getState().stagedScreen?.targetScreenId).toBe(targetId);
      expect(useProjectStore.getState().screens[targetId].htmlContent).toBe(html);
    } finally { streamMock.mockRestore(); }
  });

  test('对比蒙版盖住其他画框，原版只挂载一次，退出比较恢复', async () => {
    const otherId = useProjectStore.getState().addScreen({ name: '其他页', htmlContent: '<main>其他</main>' });
    useProjectStore.getState().stageScreenChange(targetId, html, '新版');
    await render(<InfiniteCanvas />);
    expect(host.querySelector('[data-testid="comparison-backdrop"]')).not.toBeNull();
    expect(host.querySelectorAll(`[data-testid="screen-frame-${targetId}"]`)).toHaveLength(1);
    expect(host.querySelector(`[data-testid="screen-frame-${targetId}"]`)?.getAttribute('data-comparison-focus')).toBe('true');
    expect(host.querySelector(`[data-testid="screen-frame-${otherId}"]`)?.getAttribute('data-comparison-focus')).toBeNull();
    expect(host.querySelector('[data-testid="screen-frame-staged-screen-preview"]')?.getAttribute('data-comparison-focus')).toBe('true');
    act(() => useProjectStore.getState().discardStagedChange());
    expect(host.querySelector('[data-testid="comparison-backdrop"]')).toBeNull();
    expect(host.querySelector('[data-comparison-focus]')).toBeNull();
    for (const action of ['adoptStagedChange', 'keepBothScreens'] as const) {
      act(() => useProjectStore.getState().stageScreenChange(targetId, html, '再次比较'));
      expect(host.querySelector('[data-testid="comparison-backdrop"]')).not.toBeNull();
      act(() => { useProjectStore.getState()[action](); });
      expect(host.querySelector('[data-testid="comparison-backdrop"]')).toBeNull();
      expect(host.querySelector('[data-comparison-focus]')).toBeNull();
    }
  });
});
