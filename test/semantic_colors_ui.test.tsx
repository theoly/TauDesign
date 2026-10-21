import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ThemeEditor } from '../src/components/theme/ThemeEditor';
import { defaultTheme } from '../src/utils/themePresets';
import { useProjectStore } from '../src/stores/useProjectStore';
import { useHistoryStore } from '../src/stores/useHistoryStore';
import { checkColorContrast, resolveThemeColors } from '../src/utils/semanticColors';
import { ScreenFrame } from '../src/components/canvas/ScreenFrame';
import { ExportModal } from '../src/components/export/ExportModal';
import * as pngExporter from '../src/utils/pngExporter';
import { withColorBinding } from '../src/utils/semanticColors';
import { readProject } from '../src/utils/projectRegistry';

let host: HTMLDivElement, root: Root;
let previousAct: unknown;
const element = <T extends Element>(label: string) => host.querySelector(`[aria-label="${label}"]`)! as T;
const choose = (label: string, value: string) => act(() => {
  const input = element<HTMLSelectElement>(label);
  input.value = value; input.dispatchEvent(new Event('change', { bubbles: true }));
});
const fill = (label: string, value: string) => act(() => {
  const input = element<HTMLInputElement>(label);
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
});
const button = (label: string) => [...host.querySelectorAll('button')].find(b => b.textContent?.trim() === label)!;
const click = (el: HTMLElement) => act(() => el.click());
const tokens = () => useProjectStore.getState().designSystem.tokens;

beforeEach(() => {
  previousAct = (globalThis as any).IS_REACT_ACT_ENVIRONMENT;
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  useProjectStore.getState().initNewProject({ name: '语义配色测试', deviceProfile: 'mobile', designSystem: defaultTheme, createSpecimen: false });
  useHistoryStore.getState().clear();
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  act(() => root.render(<ThemeEditor onClose={() => {}} />));
});
afterEach(() => { act(() => root.unmount()); host.remove(); (globalThis as any).IS_REACT_ACT_ENVIRONMENT = previousAct; });

test('独立按钮文字保存、非法值拒绝、恢复自动可 Undo/Redo、重载不丢角色', () => {
  choose('主按钮文字来源', 'custom');
  fill('主按钮文字颜色值', '#123456');
  act(() => element<HTMLInputElement>('主按钮文字颜色值').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
  expect(tokens().colorRoles?.light?.onPrimary).toEqual({ source: 'custom', value: '#123456' });
  expect(tokens().colors.textPrimary).toEqual(defaultTheme.tokens.colors.textPrimary);
  const id = useProjectStore.getState().id;
  expect(JSON.parse(readProject(id)!).designSystem.tokens.colorRoles.light.onPrimary.value).toBe('#123456');
  fill('主按钮文字颜色值', '#zzzzzz');
  act(() => element<HTMLInputElement>('主按钮文字颜色值').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
  expect(host.textContent).toContain('请输入 3 位或 6 位 Hex');
  expect(tokens().colorRoles?.light?.onPrimary).toEqual({ source: 'custom', value: '#123456' });
  click(element<HTMLButtonElement>('主按钮文字恢复自动'));
  expect(tokens().colorRoles?.light?.onPrimary).toBeUndefined();
  act(() => useHistoryStore.getState().undo());
  expect(resolveThemeColors(tokens(), 'light').values.onPrimary).toBe('#123456');
  act(() => useHistoryStore.getState().redo());
  expect(tokens().colorRoles?.light?.onPrimary).toBeUndefined();
  act(() => useHistoryStore.getState().undo());
  act(() => { useProjectStore.getState().loadProjectById(id); });
  expect(resolveThemeColors(tokens(), 'light').values.onPrimary).toBe('#123456');
});

test('暖橙方案作为一次历史动作应用；亮橙白字不足时预览建议后点击修复', () => {
  const previous = tokens();
  click(button('应用暖橙白字方案'));
  expect(useHistoryStore.getState().past).toHaveLength(1);
  expect(tokens().colors.primary['500']).toBe('#ff8a55');
  expect(resolveThemeColors(tokens(), 'light').values.primary).toBe('#b8441c');
  expect(resolveThemeColors(tokens(), 'dark').values.onPrimary).toBe('#ffffff');
  act(() => useHistoryStore.getState().undo());
  expect(tokens()).toEqual(previous);
  act(() => useHistoryStore.getState().redo());
  choose('主按钮背景来源', 'auto');
  expect(resolveThemeColors(tokens(), 'light').values.primary).toBe('#ff8a55');
  expect(button('应用建议背景')).toBeDefined();
  click(button('应用建议背景'));
  const r = resolveThemeColors(tokens(), 'light');
  expect(r.values.onPrimary).toBe('#ffffff');
  expect(checkColorContrast(r).filter(c => ['primary', 'primaryHover', 'primaryActive'].includes(c.background) && !c.passes)).toEqual([]);
});

test('高级继承更新、循环拒绝、模式隔离和 iframe 预览接入', () => {
  choose('副文本来源', 'custom');
  fill('副文本颜色值', '#334455');
  act(() => element<HTMLInputElement>('副文本颜色值').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
  click(button('展开高级配色'));
  choose('辅助文本来源', 'alias');
  expect(resolveThemeColors(tokens(), 'light').values.textMuted).toBe('#334455');
  choose('副文本来源', 'alias');
  choose('副文本跟随角色', 'textMuted');
  expect(host.textContent).toContain('循环');
  expect(tokens().colorRoles?.light?.textSecondary).toEqual({ source: 'alias', role: 'textPrimary' });
  const frame = host.querySelector('iframe[title="主题真实组件预览"]')! as HTMLIFrameElement;
  expect(frame.srcdoc).toContain('--color-text-muted:');
  expect(frame.srcdoc).not.toContain(':hover');
  click(button('深色'));
  expect(tokens().colorRoles?.dark).toBeUndefined();
  expect(host.textContent).toContain('语义配色 · 深色');
});


test('自定义页面背景传到画框壳、Token 热更新及 PNG 导出底色', async () => {
  const state = useProjectStore.getState();
  const t = withColorBinding(state.designSystem.tokens, 'light', 'background', { source: 'custom', value: '#efe4d8' });
  act(() => state.setDesignSystem({ ...state.designSystem, tokens: t }));
  let id = '';
  act(() => { id = useProjectStore.getState().addScreen({ name: '导出检查', htmlContent: '<main data-nid="abcdefgh">主题背景</main>' }); });
  const screen = useProjectStore.getState().screens[id];
  await act(async () => root.render(<ScreenFrame screen={screen} lodLevel={2} />));
  expect([...host.querySelectorAll<HTMLElement>('[style]')].some(el => el.style.background === 'rgb(239, 228, 216)' || el.style.background === '#efe4d8')).toBe(true);
  expect((host.querySelector('iframe') as HTMLIFrameElement).srcdoc).toContain('--color-bg: #efe4d8');
  const exportSpy = spyOn(pngExporter, 'exportScreenPng').mockResolvedValue({ dataUrl: 'data:image/png;base64,aGVsbG8=', engine: 'native-webview-pdf', cssHeight: 800 });
  try {
    await act(async () => root.render(<ExportModal onClose={() => {}} />));
    click(button('高保真 PNG 渲染图'));
    await act(async () => { button('下载高清 PNG 图片').click(); });
    expect(exportSpy).toHaveBeenCalledTimes(1);
    expect(exportSpy.mock.calls[0][1].bgColor).toBe('#efe4d8');
    expect(exportSpy.mock.calls[0][1].tokensCss).toContain('--color-bg: #efe4d8');
  } finally { exportSpy.mockRestore(); }
});
