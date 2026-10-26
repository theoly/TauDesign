import { beforeEach, describe, expect, test } from 'bun:test';
import { useProjectStore } from '../src/stores/useProjectStore';
import { useHistoryStore } from '../src/stores/useHistoryStore';
import { defaultTheme } from '../src/utils/themePresets';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { PropertyInspector } from '../src/components/inspector/PropertyInspector';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(() => {
  localStorage.clear();
  useHistoryStore.getState().restore(null);
  useProjectStore.getState().initNewProject({ name: '页面关系', deviceProfile: 'mobile', designSystem: structuredClone(defaultTheme) });
});

describe('页面关系编辑', () => {
  test('选择跳转目标写入稳定DOM属性，并由History撤销/重做', () => {
    const store = useProjectStore.getState();
    const source = store.addScreen({ name: '首页', htmlContent: '<main><button data-nid="go-detail">详情</button></main>' });
    const target = useProjectStore.getState().addScreen({ name: '详情页', htmlContent: '<main data-nid="detail-root">详情</main>' });

    expect(useProjectStore.getState().setScreenLinkTarget(source, 'go-detail', target)).toBe(true);
    expect(useProjectStore.getState().screens[source].htmlContent).toContain(`data-target-screen-id="${target}"`);
    useHistoryStore.getState().undo();
    expect(useProjectStore.getState().screens[source].htmlContent).not.toContain('data-target-screen-id=');
    useHistoryStore.getState().redo();
    expect(useProjectStore.getState().screens[source].htmlContent).toContain(`data-target-screen-id="${target}"`);
  });

  test('拒绝不存在的目标和不存在的元素，不损坏页面', () => {
    const store = useProjectStore.getState();
    const source = store.addScreen({ name: '首页', htmlContent: '<main><button data-nid="go-detail">详情</button></main>' });
    const html = useProjectStore.getState().screens[source].htmlContent;
    expect(useProjectStore.getState().setScreenLinkTarget(source, 'go-detail', 'missing')).toBe(false);
    expect(useProjectStore.getState().setScreenLinkTarget(source, 'missing-node', undefined)).toBe(false);
    expect(useProjectStore.getState().screens[source].htmlContent).toBe(html);
  });

  test('属性检查器展示页面目标选择器并写入选中的目标', () => {
    const store = useProjectStore.getState();
    const source = store.addScreen({ name: '首页', htmlContent: '<main><button data-nid="go-detail">详情</button></main>' });
    const target = useProjectStore.getState().addScreen({ name: '详情页', htmlContent: '<main data-nid="detail-root">详情</main>' });
    const frame = document.createElement('iframe');
    frame.setAttribute('data-inspector-screen', source);
    document.body.append(frame);
    frame.contentDocument!.body.innerHTML = '<button data-nid="go-detail">详情</button>';
    useProjectStore.setState({ activeScreenId: source, selectedNid: 'go-detail', selectedNode: {
      screenId: source, nid: 'go-detail', tagName: 'button', textContent: '详情', textEditable: true, classNames: [],
      computedBox: { width: 80, height: 40, top: 0, left: 0, padding: { top: 0, right: 0, bottom: 0, left: 0 }, margin: { top: 0, right: 0, bottom: 0, left: 0 } }
    } as any });
    const host = document.createElement('div'); document.body.append(host);
    const root = createRoot(host);
    act(() => root.render(<PropertyInspector />));
    const select = host.querySelector('[aria-label="跳转目标页面"]') as HTMLSelectElement;
    expect(select).not.toBeNull();
    act(() => { select.value = target; select.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(useProjectStore.getState().screens[source].htmlContent).toContain(`data-target-screen-id="${target}"`);
    act(() => root.unmount()); host.remove(); frame.remove();
  });
});
