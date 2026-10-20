import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { requiresModificationReview } from '../src/services/ai/modificationEntry';
import { useAIEngineChat } from '../src/services/ai/engine/react/useAIEngineChat';
import { DefaultAIEngineCore } from '../src/services/ai/engine/core';
import { PipelineExecutor } from '../src/services/ai/engine/pipeline/executor';
import { useProjectStore } from '../src/stores/useProjectStore';
import { useAIConfigStore, defaultProviders, defaultBindings } from '../src/stores/useAIConfigStore';
import { defaultTheme } from '../src/utils/themePresets';

describe('修改要求具体程度', () => {
  for (const request of [
    '修改当前页面，将主按钮文案缩短为“提交并核销权益”',
    '优化页面：移除主按钮btn-ghost，增加浅色主色背景与加粗文字',
    '修改页面，给文本节点增加可收缩与换行能力',
    '修改页面，将回访录入抽屉改为固定底部sheet，内容独立滚动',
    '修复页面中的按钮换行和图标未居中',
    '修改页面，卡片圆角设为12px，间距调整为16px',
    '修改页面，删除底部的广告卡片',
    '修改页面，增加手机号字段',
    '修改页面，将标题改成“会员详情”',
    '修改页面，头像放到姓名左侧',
    '修改页面，重排标题区',
    '修改页面，按钮文字太长被截断了',
    '修改页面，主按钮文字不见了',
    '修改页面，按钮背景使用#ed6da6',
    '修改页面，保留布局并将按钮文案改为“先分析”',
    'Update the page: change the primary button label to Save',
  ]) test(`明确要求直接执行：${request}`, () => expect(requiresModificationReview(request)).toBe(false));
  for (const request of [
    '优化页面', '修改当前页面', '让页面更好看、更高级', '修改当前页面，优化信息层级',
    '优化页面，但保留原按钮和配色', '修改当前页面的标题', '按附件优化当前页面',
    '优化会员信息区域', '优化按钮', '不要删除按钮，优化页面',
    '优化按钮，增加高级感',
    '先分析页面并列出修改点，将主按钮改为保存', '请先给修改建议，不要直接改按钮文案',
    '[引用元素 nid="button01"] 优化一下',
  ]) test(`宽泛或先分析：${request}`, () => expect(requiresModificationReview(request)).toBe(true));
});

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
describe('具体要求跳过分析的实际入口', () => {
  let host: HTMLDivElement, root: Root, id: string, engine: ReturnType<typeof useAIEngineChat>;
  let objects: ReturnType<typeof spyOn>, pipeline: ReturnType<typeof spyOn>;
  const html = '<main data-nid="root"><button data-nid="submit" class="btn btn-primary">提交并核销权益</button></main>';
  const updated = html.replace('提交并核销权益', '提交');
  const Harness = () => { engine = useAIEngineChat(); return null; };
  beforeEach(async () => {
    localStorage.clear();
    useProjectStore.getState().initNewProject({ name: '具体修改', deviceProfile: 'mobile', designSystem: defaultTheme, createSpecimen: false });
    id = useProjectStore.getState().addScreen({ name: '回访录入', htmlContent: html });
    useAIConfigStore.setState({ providers: defaultProviders.map(p => ({ ...p, apiKey: 'test' })), bindings: defaultBindings });
    objects = spyOn(DefaultAIEngineCore.prototype, 'generateObject').mockResolvedValue({ summary: '优化建议', items: [] });
    pipeline = spyOn(PipelineExecutor, 'execute').mockResolvedValue({ status: 'staged_side_by_side', rawResponse: `<artifact>${updated}</artifact>`, extractedHtml: updated });
    host = document.createElement('div'); document.body.append(host); root = createRoot(host);
    await act(async () => { root.render(<Harness />); });
  });
  afterEach(() => { act(() => root.unmount()); host.remove(); objects.mockRestore(); pipeline.mockRestore(); });
  test('用户已说明按钮文案时不分析，目标/原诉求/附件保留且原页等待采纳', async () => {
    const request = '修改当前页面，将主按钮文案缩短为“提交”';
    const references = [{ name: 'rules.md', content: '保留合同规则', source: 'upload' as const }];
    await act(async () => { await engine.sendMessage(request, undefined, { referencedScreenId: id, textReferences: references }); });
    expect(objects).not.toHaveBeenCalled(); expect(pipeline).toHaveBeenCalledTimes(1);
    const input = pipeline.mock.calls[0][0].input;
    expect(input.rawPrompt).toBe(request); expect(input.activeScreenId).toBe(id); expect(input.textReferences).toEqual(references);
    expect(engine.messages.some(m => m.modificationReview)).toBe(false);
    expect(useProjectStore.getState().screens[id].htmlContent).toBe(html);
    expect(useProjectStore.getState().stagedScreen?.targetScreenId).toBe(id);
  });
  test('宽泛优化仍分析，即使引用HTML带具体按钮和CSS也不据此跳过', async () => {
    await act(async () => { await engine.sendMessage('[引用元素 nid="submit"]\n元素片段:\n<button class="btn-primary">修改按钮文案为提交</button>\n\n优化一下', undefined, { referencedScreenId: id }); });
    expect(objects).toHaveBeenCalledTimes(1); expect(pipeline).not.toHaveBeenCalled();
    expect(engine.messages.some(m => m.modificationReview?.status === 'ready')).toBe(true);
  });
  test('直接修改期间原页变化，不发布过期候选', async () => {
    let resolve!: (value: any) => void;
    pipeline.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
    let pending!: Promise<void>;
    await act(async () => { pending = engine.sendMessage('修改页面，将按钮文案改为“提交”', undefined, { referencedScreenId: id }); });
    expect(objects).not.toHaveBeenCalled(); expect(pipeline).toHaveBeenCalledTimes(1);
    act(() => useProjectStore.getState().updateScreenHtml(id, html + '<p>人工更新</p>'));
    await act(async () => { resolve({ status: 'staged_side_by_side', rawResponse: updated, extractedHtml: updated }); await pending; });
    expect(useProjectStore.getState().stagedScreen).toBeNull();
    expect(useProjectStore.getState().screens[id].htmlContent).toContain('人工更新');
    expect(engine.messages.at(-1)?.text).toContain('本次未应用修改');
  });
  test('直接修改锁定原目标，切换激活页不会误改另一页', async () => {
    let resolve!: (value: any) => void;
    pipeline.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
    let pending!: Promise<void>;
    await act(async () => { pending = engine.sendMessage('修改页面，将主按钮文案改为“提交”', undefined, { referencedScreenId: id }); });
    let other!: string;
    act(() => { other = useProjectStore.getState().addScreen({ name: '其他页面', htmlContent: '<main>其他页面</main>' }); });
    const otherHtml = useProjectStore.getState().screens[other].htmlContent;
    await act(async () => { resolve({ status: 'staged_side_by_side', rawResponse: `<artifact>${updated}</artifact>`, extractedHtml: updated }); await pending; });
    expect(objects).not.toHaveBeenCalled();
    expect(useProjectStore.getState().stagedScreen?.targetScreenId).toBe(id);
    expect(useProjectStore.getState().screens[other].htmlContent).toBe(otherHtml);
  });
  test('直接修改中止后不产生候选，也不误报生成失败', async () => {
    let resolve!: (value: any) => void;
    pipeline.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
    let pending!: Promise<void>;
    await act(async () => { pending = engine.sendMessage('修改页面，将按钮文案改为“提交”', undefined, { referencedScreenId: id }); });
    act(() => engine.abort());
    await act(async () => { resolve({ status: 'error', rawResponse: '', errorMessage: '生成已取消' }); await pending; });
    expect(objects).not.toHaveBeenCalled(); expect(useProjectStore.getState().stagedScreen).toBeNull();
    expect(engine.messages.at(-1)?.isStopped).toBe(true); expect(engine.messages.at(-1)?.isError).not.toBe(true);
  });
});
