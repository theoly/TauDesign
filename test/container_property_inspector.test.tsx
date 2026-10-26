import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { useProjectStore, SelectedNodeInfo } from '../src/stores/useProjectStore';
import { useHistoryStore } from '../src/stores/useHistoryStore';
import { PropertyInspector } from '../src/components/inspector/PropertyInspector';
import { LayoutInspector } from '../src/components/inspector/LayoutInspector';
import { BoxModelInspector } from '../src/components/inspector/BoxModelInspector';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

const render = (component: React.ReactElement) => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(component);
  });
};

const fireChange = (el: HTMLInputElement | HTMLSelectElement, val: string) => {
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  nativeSetter?.call(el, val);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
};

const cleanup = () => {
  if (root) {
    act(() => root.unmount());
  }
  if (container && container.parentNode) {
    container.remove();
  }
};

describe('容器属性编辑与显示测试 (Container Property Inspector)', () => {
  beforeEach(() => {
    useProjectStore.setState({
      screens: {},
      screenOrder: [],
      overrides: {},
      selectedNid: null,
      selectedNode: null,
      activeScreenId: null
    });
    useHistoryStore.getState().clear();
  });

  afterEach(() => {
    cleanup();
  });

  test('CHK-F-01: SelectedNodeInfo 携带 computedLayout 并在 selectNodeByNid 中推断布局', () => {
    const store = useProjectStore.getState();
    const screenId = store.addScreen({
      name: '测试画框',
      htmlContent: `
        <div data-nid="c1" class="row gap-3 p-4">
          <div data-nid="card1" class="col gap-2 p-2">卡片1</div>
          <div data-nid="card2" class="col gap-2 p-2">卡片2</div>
        </div>
      `
    });

    // Select row container by nid
    act(() => {
      store.selectNodeByNid(screenId, 'c1');
    });

    const selected = useProjectStore.getState().selectedNode;
    expect(selected).not.toBeNull();
    expect(selected?.nid).toBe('c1');
    expect(selected?.computedLayout).toBeDefined();
    expect(selected?.computedLayout?.display).toBe('flex');
    expect(selected?.computedLayout?.flexDirection).toBe('row');
    expect(selected?.computedLayout?.gap).toBe('var(--space-3)');

    // Select col container by nid
    act(() => {
      store.selectNodeByNid(screenId, 'card1');
    });
    const cardSelected = useProjectStore.getState().selectedNode;
    expect(cardSelected?.computedLayout?.flexDirection).toBe('column');
    expect(cardSelected?.computedLayout?.gap).toBe('var(--space-2)');
  });

  test('CHK-F-02: LayoutInspector 正确回显当前布局状态并支持模式切换', () => {
    let changedProps: Record<string, string> = {};
    const handleStyleChange = (prop: string, val: string) => {
      changedProps[prop] = val;
    };

    render(
      <LayoutInspector
        computedLayout={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'nowrap',
          gap: 'var(--space-3)'
        }}
        declarations={{}}
        onStyleChange={handleStyleChange}
      />
    );

    expect(container.textContent).toContain('布局与对齐 (Layout)');
    expect(container.textContent).toContain('Flex');
    expect(container.textContent).toContain('Grid');
    expect(container.textContent).toContain('Block');
    expect(container.textContent).toContain('主轴方向');
    expect(container.textContent).toContain('Row');
    expect(container.textContent).toContain('Col');

    // Click Col direction button
    const colBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Col'));
    expect(colBtn).toBeDefined();
    act(() => {
      colBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(changedProps['flex-direction']).toBe('column');

    // Click Grid display mode
    const gridBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Grid'));
    expect(gridBtn).toBeDefined();
    act(() => {
      gridBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(changedProps['display']).toBe('grid');
  });

  test('CHK-F-03: 修改对齐与间距通过 setOverride 写入覆盖层并记录历史', () => {
    const store = useProjectStore.getState();
    const screenId = store.addScreen({
      name: '测试页面',
      htmlContent: '<div data-nid="box1" class="row">内容</div>'
    });

    act(() => {
      store.selectNodeByNid(screenId, 'box1');
    });

    render(<PropertyInspector />);

    // 连续分区的分布选择仍通过同一历史管道提交。
    const distribution = container.querySelector('select[aria-label="分布"]') as HTMLSelectElement;
    expect(distribution).not.toBeNull();
    act(() => fireChange(distribution, 'space-between'));

    const key = `${screenId}:box1`;
    const ov = useProjectStore.getState().overrides[key];
    expect(ov).toBeDefined();
    expect(ov.declarations['justify-content']).toBe('space-between');

    // History should have commit
    const history = useHistoryStore.getState();
    expect(history.past.length).toBeGreaterThan(0);
  });

  test('CHK-F-04: BoxModelInspector 移除同心盒模型图并直接紧凑渲染 Padding 与 Margin 控制器', () => {
    render(
      <BoxModelInspector
        computedBox={{
          width: 320,
          height: 180,
          top: 0,
          left: 0,
          padding: { top: 16, right: 24, bottom: 16, left: 24 },
          margin: { top: 8, right: 12, bottom: 8, left: 12 }
        }}
        declarations={{}}
        onStyleChange={() => {}}
      />
    );

    expect(container.textContent).toContain('盒模型与间距 (Box Model)');
    // 盒模型同心图已被废弃移除，不再包含纯展示的 CONTENT 与同心大写外框
    expect(container.textContent).not.toContain('MARGIN (外边距)');
    expect(container.textContent).not.toContain('PADDING (内边距)');
    expect(container.textContent).not.toContain('CONTENT');
    // 紧凑渲染核心 Padding 与 Margin 编辑控制器
    expect(container.textContent).toContain('Padding (内边距)');
    expect(container.textContent).toContain('Margin (外边距)');
  });

  test('CHK-F-05: 修改 Padding 与 Margin（单边与四边联动）正确生成覆盖声明', () => {
    let changedProps: Record<string, string> = {};
    const handleStyleChange = (prop: string, val: string) => {
      changedProps[prop] = val;
    };

    render(
      <BoxModelInspector
        computedBox={{
          width: 200,
          height: 100,
          top: 0,
          left: 0,
          padding: { top: 8, right: 8, bottom: 8, left: 8 },
          margin: { top: 0, right: 0, bottom: 0, left: 0 }
        }}
        declarations={{}}
        onStyleChange={handleStyleChange}
      />
    );

    // Find padding-top input (initial placeholder '8')
    const inputs = Array.from(container.querySelectorAll('input'));
    const topInput = inputs.find((i) => i.placeholder === '8');
    expect(topInput).toBeDefined();

    act(() => {
      fireChange(topInput!, '16px');
    });
    expect(changedProps['padding-top']).toBe('16px');

    // Test lock linking toggle
    const linkButtons = Array.from(container.querySelectorAll('button')).filter((b) =>
      b.title.includes('锁定') || b.title.includes('四边')
    );
    expect(linkButtons.length).toBeGreaterThanOrEqual(1);

    act(() => {
      linkButtons[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // When linked, changing padding sets unified 'padding'
    const selects = Array.from(container.querySelectorAll('select'));
    expect(selects.length).toBeGreaterThan(0);
    act(() => {
      fireChange(selects[0], 'var(--space-4)');
    });
    expect(changedProps['padding']).toBe('var(--space-4)');
  });

  test('CHK-F-06: 历史撤销 (Undo) 能回退布局与边距修改，还原基线清除覆盖', () => {
    const store = useProjectStore.getState();
    const screenId = store.addScreen({
      name: '可撤销页面',
      htmlContent: '<div data-nid="elem1" class="col">测试元素</div>'
    });

    act(() => {
      store.selectNodeByNid(screenId, 'elem1');
    });

    // 1. Set override for padding
    act(() => {
      store.setOverride(screenId, 'elem1', { padding: 'var(--space-6)' });
    });
    expect(useProjectStore.getState().overrides[`${screenId}:elem1`].declarations['padding']).toBe('var(--space-6)');

    // 2. Set override for flex-direction
    act(() => {
      store.setOverride(screenId, 'elem1', { 'flex-direction': 'row' });
    });
    expect(useProjectStore.getState().overrides[`${screenId}:elem1`].declarations['flex-direction']).toBe('row');

    // 3. Undo once: flex-direction should revert
    act(() => {
      useHistoryStore.getState().undo();
    });
    expect(useProjectStore.getState().overrides[`${screenId}:elem1`].declarations['flex-direction']).toBeUndefined();
    expect(useProjectStore.getState().overrides[`${screenId}:elem1`].declarations['padding']).toBe('var(--space-6)');

    // 4. Clear all overrides for this node via clearNodeOverrides
    act(() => {
      store.clearNodeOverrides(screenId, 'elem1');
    });
    expect(useProjectStore.getState().overrides[`${screenId}:elem1`]).toBeUndefined();

    // 5. Undo clear: overrides should restore
    act(() => {
      useHistoryStore.getState().undo();
    });
    expect(useProjectStore.getState().overrides[`${screenId}:elem1`]).toBeDefined();
    expect(useProjectStore.getState().overrides[`${screenId}:elem1`].declarations['padding']).toBe('var(--space-6)');
  });
});
