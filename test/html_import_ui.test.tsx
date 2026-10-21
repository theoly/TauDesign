import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { HtmlImportDialog } from '../src/components/canvas/HtmlImportDialog';
import { useProjectStore } from '../src/stores/useProjectStore';
import { useHistoryStore } from '../src/stores/useHistoryStore';
import { defaultTheme } from '../src/utils/themePresets';

const html = '<!doctype html><html><head><title>预约管理</title><style>body{margin:19px;background:#faf5f6;color:#212121}button{background:#b65378;color:white;border-radius:13px;padding:13px}</style></head><body><h1>预约管理</h1><button>提交预约</button></body></html>';
let container: HTMLDivElement, root: Root, previousActEnvironment: unknown;
const byLabel = (label: string) => container.querySelector(`[aria-label="${label}"]`) as HTMLInputElement;
const byButton = (label: string) => [...container.querySelectorAll('button')].find(el => el.textContent?.trim() === label)!;
const click = (el: HTMLElement) => act(() => el.click());
const waitFor = async (assertion: () => void) => {
  for (let i = 0; ; i++) {
    try { assertion(); return; } catch (error) { if (i >= 35) throw error; }
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
  }
};
beforeEach(() => {
  previousActEnvironment = (globalThis as any).IS_REACT_ACT_ENVIRONMENT;
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  useProjectStore.getState().initNewProject({ name: '导入测试', deviceProfile: 'mobile', designSystem: structuredClone(defaultTheme) });
  useHistoryStore.getState().restore(null);
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); (globalThis as any).IS_REACT_ACT_ENVIRONMENT = previousActEnvironment; });
async function selectHtml(text = html, canImport = text.length > 0) {
  const file = new File([text], 'meeting.html', { type: 'text/html' });
  await act(async () => {
    Object.defineProperty(byLabel('选择 HTML 文件'), 'files', { configurable: true, value: [file] });
    byLabel('选择 HTML 文件').dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 20));
  });
  await waitFor(() => expect(container.textContent).not.toContain('正在分析页面与资源…'));
  await waitFor(() => expect(byButton('确认导入').disabled).toBe(!canImport));
}

describe('HTML 导入对话框', () => {
  test('导航开关取消不改项目，确认与导入原子提交', async () => {
    const source = '<main><div class="status-bar">9:41</div><nav class="appbar"><span class="appbar-title">客户</span></nav><article>客户列表</article></main>';
    act(() => root.render(<HtmlImportDialog onClose={() => {}} />));
    await selectHtml(source);
    expect(byLabel('使用自定义导航栏').checked).toBe(false);
    click(byLabel('使用自定义导航栏'));
    expect(byLabel('使用自定义导航栏').checked).toBe(true);
    expect(useProjectStore.getState().settings.useCustomNavigation).toBe(false);
    click(byButton('取消'));
    expect(useHistoryStore.getState().past.length).toBe(0);
    await waitFor(() => expect(byButton('确认导入').disabled).toBe(false));
    click(byButton('确认导入'));
    await waitFor(() => expect(useProjectStore.getState().screenOrder.length).toBe(1));
    const imported = Object.values(useProjectStore.getState().screens)[0];
    expect(useProjectStore.getState().settings.useCustomNavigation).toBe(true);
    expect(imported.htmlContent).toContain('class="appbar"');
    expect(imported.htmlContent).not.toContain('class="status-bar"');
    act(() => useHistoryStore.getState().undo());
    expect(useProjectStore.getState().settings.useCustomNavigation).toBe(false);
    expect(useProjectStore.getState().screenOrder.length).toBe(0);
  });
  test('Tailwind4原貌导入经过静态编译，脚本和运行时样式类型不落盘', async () => {
    act(() => root.render(<HtmlImportDialog onClose={() => {}} />));
    await selectHtml('<script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4.3.1/dist/index.global.js"></script><style type="text/tailwindcss">@theme {--color-brand:#f66}</style><div class="grid grid-cols-3"><span>甲</span><span>乙</span><span>丙</span><i data-lucide="check"></i></div>');
    expect(container.textContent).toContain('本地 Tailwind 4');
    click(byButton('确认导入'));
    await waitFor(() => expect(useProjectStore.getState().screenOrder.length).toBe(1));
    const imported = Object.values(useProjectStore.getState().screens)[0];
    expect(imported.htmlContent).toContain('data-import-compiled="tailwind4"');
    expect(imported.htmlContent).toContain('grid-template-columns: repeat(3, minmax(0, 1fr))');
    expect(imported.htmlContent).not.toContain('<script'); expect(imported.htmlContent).not.toContain('type="text/tailwindcss"');
    expect(new DOMParser().parseFromString(imported.htmlContent,'text/html').querySelector('svg[data-lucide="check"]')).not.toBeNull();
  });
  test('运行时编译失败显示具体原因并阻止残缺原貌导入', async () => {
    act(() => root.render(<HtmlImportDialog onClose={() => {}} />));
    await selectHtml('<style type="text/tailwindcss">@plugin "untrusted-plugin";</style><div class="grid">业务</div>',false);
    expect(container.textContent).toContain('JavaScript 配置或插件');
    expect(byButton('确认导入').disabled).toBe(true); expect(useProjectStore.getState().screenOrder.length).toBe(0);
    expect(useHistoryStore.getState().past.length).toBe(0);
  });
  test('主题明暗可预览，取消不改变工程或历史', async () => {
    let closed = false;
    act(() => root.render(<HtmlImportDialog onClose={() => { closed = true; }} />));
    await selectHtml();
    click(byButton('设计系统预览'));
    const darkButton = container.querySelector('button[title="切换为深色模式预览"]') as HTMLButtonElement;
    expect(darkButton).not.toBeNull();
    click(darkButton);
    expect(container.querySelector('button[title="切换为浅色模式预览"]')).not.toBeNull();
    expect(useProjectStore.getState().settings.colorMode).toBe('light');
    click(byButton('取消'));
    expect(closed).toBe(true);
    expect(useProjectStore.getState().screenOrder.length).toBe(0);
    expect(useHistoryStore.getState().past.length).toBe(0);
  });
  test('原貌默认、可预览并新增画框，取消不产生历史', async () => {
    let closed = false;
    act(() => root.render(<HtmlImportDialog onClose={() => { closed = true; }} />));
    await selectHtml();
    expect(byLabel('保留原貌').checked).toBe(true);
    expect(container.querySelector('[title="原始页面预览"]')).toBeTruthy();
    click(byButton('确认导入'));
    await waitFor(() => expect(useProjectStore.getState().screenOrder.length).toBe(1));
    const imported = Object.values(useProjectStore.getState().screens)[0];
    expect(imported.name).toBe('预约管理');
    expect(imported.htmlContent).toContain('提交预约');
    expect(imported.metadata?.importedHtml?.mode).toBe('preserve');
    expect(useHistoryStore.getState().past.length).toBe(1);
    expect(closed).toBe(true);
  });
  test('选择性统一只改勾选类别，空工程可提取主题并在撤销时恢复', async () => {
    act(() => root.render(<HtmlImportDialog onClose={() => {}} />));
    await selectHtml();
    click(byLabel('选择性统一'));
    click(byLabel('以此页面建立项目风格'));
    act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(byLabel('提取主色'), '#477568'); byLabel('提取主色').dispatchEvent(new Event('input', { bubbles: true })); });
    await waitFor(() => expect(byButton('确认导入').disabled).toBe(false));
    click(byButton('确认导入'));
    await waitFor(() => expect(useProjectStore.getState().screenOrder.length).toBe(1));
    expect(useProjectStore.getState().designSystem.tokens.colors.primary['500']).toBe('#477568');
    expect(Object.values(useProjectStore.getState().screens)[0].metadata?.importedHtml?.mode).toBe('selective');
    act(() => { useHistoryStore.getState().undo(); });
    expect(useProjectStore.getState().screenOrder.length).toBe(0);
    expect(useProjectStore.getState().designSystem).toEqual(defaultTheme);
  });
  test('已有页面不提供全局主题替换，空文件明确报错且不能导入', async () => {
    useProjectStore.getState().addBlankScreen();
    act(() => root.render(<HtmlImportDialog onClose={() => {}} />));
    await selectHtml('');
    expect(byLabel('以此页面建立项目风格')).toBeNull();
    expect(container.querySelector('[role="alert"]')?.textContent).toBeTruthy();
    expect(byButton('确认导入').disabled).toBe(true);
    expect(useProjectStore.getState().screenOrder.length).toBe(1);
  });
});
