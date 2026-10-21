import { afterEach, beforeEach, expect, test } from 'bun:test';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ProjectManager } from '../src/components/workspace/ProjectManager';
import { useProjectStore } from '../src/stores/useProjectStore';
import { useWorkspaceStore } from '../src/stores/useWorkspaceStore';
import { DEFAULT_CUSTOM_DESIGN_SYSTEM, generateCustomDesignSystems } from '../src/utils/customDesignSystem';
import { readProject, upsertMeta, writeProject } from '../src/utils/projectRegistry';

let container: HTMLDivElement;
let root: Root;
let previousActEnvironment: unknown;
const button = (text: string) => {
  const element = [...container.querySelectorAll('button')].find(b => b.textContent?.trim() === text);
  expect(element).toBeDefined();
  return element!;
};
const click = (element: HTMLElement) => act(() => element.click());
const inputValue = (element: HTMLInputElement, value: string) => act(() => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(element, value);
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
});

beforeEach(() => {
  previousActEnvironment = (globalThis as any).IS_REACT_ACT_ENVIRONMENT;
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  useWorkspaceStore.setState({ view: 'manager', projects: [], activeProjectId: null, missingIds: [] });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(<ProjectManager />));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
});

test('custom candidate remains selectable after reroll; create saves exactly the selected complete theme', async () => {
  click(button('新建工程'));
  click(button('自定义生成'));
  const original = generateCustomDesignSystems(DEFAULT_CUSTOM_DESIGN_SYSTEM, 0)[2];
  click(container.querySelector(`[data-candidate-id="${original.theme.id}"]`)! as HTMLElement);
  click(button('换一批'));
  expect(container.querySelector(`[data-candidate-id="${original.theme.id}"]`)?.getAttribute('aria-pressed')).toBe('true');
  expect(container.querySelectorAll('[data-candidate-id]')).toHaveLength(6);

  const selected = generateCustomDesignSystems(DEFAULT_CUSTOM_DESIGN_SYSTEM, 1)[1];
  click(container.querySelector(`[data-candidate-id="${selected.theme.id}"]`)! as HTMLElement);
  expect(container.textContent).toContain(selected.theme.name);
  await act(async () => {
    button('创建并进入工程').click();
    await new Promise(resolve => setTimeout(resolve, 30));
  });
  const state = useProjectStore.getState();
  expect(state.designSystem).toEqual(selected.theme);
  expect(state.screenOrder).toHaveLength(0);
  expect(useWorkspaceStore.getState().view).toBe('workspace');
  expect(JSON.parse(readProject(state.id)!).designSystem).toEqual(selected.theme);
  expect(useProjectStore.getState().loadProjectById(state.id)).toBe(true);
  expect(useProjectStore.getState().designSystem).toEqual(selected.theme);
});

test('invalid custom primary disables creation and Enter cannot submit a stale candidate', () => {
  click(button('新建工程'));
  click(button('自定义生成'));
  const input = container.querySelector('[aria-label="自定义主色"]') as HTMLInputElement;
  expect(input).not.toBeNull();
  inputValue(input, '#xyz');
  expect(button('创建并进入工程').disabled).toBe(true);
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('主色');
  act(() => container.querySelector('input')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
  expect(useWorkspaceStore.getState().view).toBe('manager');
  inputValue(input, '#abc');
  expect(button('创建并进入工程').disabled).toBe(false);
  click(button('创建并进入工程'));
  expect(useProjectStore.getState().designSystem.tokens.colors.primary['500']).toBe('#aabbcc');
});

test('project thumbnail renders a complete imported document directly with original head, attributes and CSP', () => {
  for (const [index, html] of [
    '<!doctype html><html lang="zh"><head><meta http-equiv="Content-Security-Policy" content="script-src \'none\'"><style>body{background:coral}</style></head><body class="imported"><h1>Imported page</h1></body></html>',
    '<html lang="en"><head><style>.card{padding:22px}</style></head><body><article class="card">Full page</article></body></html>'
  ].entries()) {
    const id = `import-preview-${index}`;
    upsertMeta({ id, name: id, screenCount: 1, deviceProfile: 'pc', frameWidth: 1440, createdAt: Date.now(), updatedAt: Date.now(), previewHtml: html, previewCss: '' });
    writeProject(id, JSON.stringify({ id, name: id, screens: {} }));
    act(() => useWorkspaceStore.getState().refresh());
    expect(container.querySelector(`iframe[title="${id} 预览"]`)?.getAttribute('srcdoc')).toBe(html);
  }
});
