import { afterEach, beforeEach, expect, test } from 'bun:test';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { mockIPC, clearMocks } from '@tauri-apps/api/mocks';
import { ProjectSettingsPanel } from '../src/components/settings/ProjectSettingsPanel';
import { AIProviderModal } from '../src/components/settings/AIProviderModal';
import { openProjectDirectory } from '../src/services/storage/projectDirectory';
import { useProjectStore } from '../src/stores/useProjectStore';
import { useHistoryStore } from '../src/stores/useHistoryStore';

let container: HTMLDivElement, root: Root, previousAct: unknown;
let previousProject: ReturnType<typeof useProjectStore.getState>;
const runtimeKeys = ['__TAURI_INTERNALS__', '__TAURI_EVENT_PLUGIN_INTERNALS__', '__TAURI__', 'isTauri'];
let previousRuntime: Array<PropertyDescriptor | undefined>;
const removeRuntime = () => runtimeKeys.forEach(key => Reflect.deleteProperty(window, key));
const path = '/Users/test/项目文件夹/包含 空格的工程.aidesign';
const button = () => container.querySelector('section button') as HTMLButtonElement;
const render = () => act(() => root.render(<ProjectSettingsPanel />));
beforeEach(() => {
  previousRuntime = runtimeKeys.map(key => Object.getOwnPropertyDescriptor(window, key));
  removeRuntime();
  previousAct = (globalThis as any).IS_REACT_ACT_ENVIRONMENT;
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  previousProject = useProjectStore.getState();
  useProjectStore.setState({ id: 'directory-test', name: '测试工程', folderPath: path });
  container = document.createElement('div'); document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount()); container.remove();
  clearMocks();
  removeRuntime();
  runtimeKeys.forEach((key, index) => { if (previousRuntime[index]) Object.defineProperty(window, key, previousRuntime[index]!); });
  useProjectStore.setState(previousProject, true);
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = previousAct;
});

test('完整显示路径、通过IPC打开、等待防重复且不修改工程或History', async () => {
  const calls: unknown[] = [];
  let resolve!: () => void;
  mockIPC((cmd, args) => {
    calls.push({ cmd, args });
    return new Promise<void>(done => { resolve = done; });
  });
  const before = useProjectStore.getState(), history = useHistoryStore.getState();
  render();
  expect(container.querySelector('[aria-label="工程路径"]')?.textContent).toBe(path);
  await act(async () => { button().click(); button().click(); });
  expect(button().disabled).toBe(true);
  expect(calls).toEqual([{ cmd: 'project_open_directory', args: { root: path } }]);
  await act(async () => resolve());
  expect(button().disabled).toBe(false);
  expect(container.querySelector('[role="alert"]')).toBeNull();
  expect(useProjectStore.getState()).toBe(before);
  expect(useHistoryStore.getState()).toBe(history);
});

test('失败显示原因，重试成功清理错误；切工程后展示新路径', async () => {
  let count = 0;
  mockIPC(() => { if (count++ === 0) return Promise.reject('目录不存在'); });
  render();
  await act(async () => button().click());
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('目录不存在');
  expect(button().disabled).toBe(false);
  await act(async () => button().click());
  expect(count).toBe(2); expect(container.querySelector('[role="alert"]')).toBeNull();
  act(() => useProjectStore.setState({ id: 'another-project', folderPath: '/tmp/another' }));
  expect(container.querySelector('[aria-label="工程路径"]')?.textContent).toBe('/tmp/another');
});

test('未关联目录说明内置存储，浏览器有路径也不能调用原生打开', async () => {
  mockIPC(() => { throw Error('不得发起IPC'); });
  useProjectStore.setState({ folderPath: undefined }); render();
  expect(container.textContent).toContain('应用内置存储'); expect(button().disabled).toBe(true);
  clearMocks();
  removeRuntime();
  act(() => useProjectStore.setState({ folderPath: path }));
  expect(container.textContent).toContain('请在桌面端'); expect(button().disabled).toBe(true);
  await expect(openProjectDirectory(path)).rejects.toThrow('桌面端');
  await expect(openProjectDirectory('')).rejects.toThrow('尚未关联');
});

test('切换工程时旧目录请求迟到失败不会污染新工程设置', async () => {
  let reject!: (cause: string) => void;
  mockIPC(() => new Promise((_resolve, fail) => { reject = fail; }));
  render();
  await act(async () => button().click());
  act(() => useProjectStore.setState({ id: 'new-project', folderPath: '/tmp/new-project' }));
  await act(async () => reject('旧目录已移走'));
  expect(container.querySelector('[aria-label="工程路径"]')?.textContent).toBe('/tmp/new-project');
  expect(container.querySelector('[role="alert"]')).toBeNull(); expect(button().disabled).toBe(false);
});

test('设置窗口提供项目标签且仍可返回Provider和快捷输入', () => {
  act(() => root.render(<AIProviderModal onClose={() => {}} />));
  const click = (label: string) => act(() => {
    const control = [...container.querySelectorAll('button')].find(b => b.textContent?.trim() === label);
    expect(control).toBeDefined(); control!.click();
  });
  click('项目设置'); expect(container.querySelector('[aria-label="工程路径"]')?.textContent).toBe(path);
  click('AI 模型与 Provider'); expect(container.textContent).toContain('Provider 厂商列表');
  click('对话快捷输入 (Quick Prompts)'); expect(container.textContent).toContain('快捷');
});
