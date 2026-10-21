import { afterEach, beforeEach, expect, test } from 'bun:test';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ProjectManager } from '../src/components/workspace/ProjectManager';
import { DesignSystemPanel } from '../src/components/layout/panels/DesignSystemPanel';
import { useProjectStore } from '../src/stores/useProjectStore';
import { useWorkspaceStore } from '../src/stores/useWorkspaceStore';
import { useHistoryStore } from '../src/stores/useHistoryStore';
import { defaultTheme } from '../src/utils/themePresets';
let container: HTMLDivElement, root: Root, previous: unknown;
const click = (text: string) => act(() => {
  const button = [...container.querySelectorAll('button')].find(button => button.textContent?.trim() === text);
  expect(button).toBeDefined(); button!.click();
});
const select = (value: string) => act(() => {
  const control = container.querySelector('[aria-label="参考设备"]') as HTMLSelectElement;
  control.value = value; control.dispatchEvent(new Event('change', { bubbles: true }));
});
beforeEach(() => {
  previous = (globalThis as any).IS_REACT_ACT_ENVIRONMENT; (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear(); useWorkspaceStore.setState({ view: 'manager', projects: [], activeProjectId: null, missingIds: [] });
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); (globalThis as any).IS_REACT_ACT_ENVIRONMENT = previous; });
test('新建选择预设，切换档位重置默认，创建按最终预设初始化', () => {
  act(() => root.render(<ProjectManager />)); click('新建工程');
  expect((container.querySelector('[aria-label="参考设备"]') as HTMLSelectElement).value).toBe('pc-standard');
  select('pc-laptop'); expect(container.textContent).toContain('1440 × 810');
  click('移动端390px'); expect((container.querySelector('[aria-label="参考设备"]') as HTMLSelectElement).value).toBe('mobile-standard');
  select('mobile-compact'); expect(container.textContent).toContain('390 × 694');
  click('创建并进入工程'); expect(useProjectStore.getState().settings.referenceDevice?.id).toBe('mobile-compact');
  expect(useProjectStore.getState().settings.viewportGuideHeight).toBe(694);
});
test('已有项目面板可选择、撤销，旧尺寸有明确选项且可恢复默认', () => {
  useProjectStore.getState().initNewProject({ name: '旧项目', deviceProfile: 'mobile', designSystem: defaultTheme });
  const store = useProjectStore.getState(); store.loadProject(JSON.stringify({ ...store, settings: { ...store.settings, referenceDevice: undefined, viewportGuideHeight: 740 } }));
  useHistoryStore.getState().restore(null);
  act(() => root.render(<DesignSystemPanel onOpenThemeEditor={() => {}} onOpenRestyle={() => {}} />));
  expect(container.textContent).toContain('现有项目尺寸'); expect(container.textContent).toContain('390 × 740');
  select('mobile-standard'); expect(container.textContent).toContain('390 × 844');
  act(() => useHistoryStore.getState().undo()); expect(container.textContent).toContain('390 × 740');
  act(() => useHistoryStore.getState().redo()); expect(container.textContent).toContain('390 × 844');
});
