import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { PropertyInspector } from '../src/components/inspector/PropertyInspector';
import { PositionSizeInspector, isOffsetDisabled, toPlaceholder } from '../src/components/inspector/PositionSizeInspector';
import { RadiusInspector, hasPerCornerRadius, CORNER_FIELDS } from '../src/components/inspector/RadiusInspector';
import { useProjectStore } from '../src/stores/useProjectStore';
import { useHistoryStore } from '../src/stores/useHistoryStore';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const COMPUTED_BOX = {
  width: 352,
  height: 178,
  top: 0,
  left: 0,
  padding: { top: 24, right: 24, bottom: 24, left: 24 },
  margin: { top: 0, right: 0, bottom: 0, left: 0 }
};

describe('属性面板几何属性与多 Tab (Inspector Geometry & Tabs)', () => {
  let container: HTMLDivElement;
  let root: Root;

  const render = (node: React.ReactElement) => {
    act(() => {
      root.render(node);
    });
  };
  const click = (el: Element | null) => {
    expect(el).not.toBeNull();
    act(() => {
      el!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
  };
  const setInput = (el: Element | null, value: string) => {
    expect(el).not.toBeNull();
    const input = el as HTMLInputElement;
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  describe('CHK-F-01 ~ CHK-F-03 & CHK-F-06: 尺寸与定位 (BR-INS-03/04/06)', () => {
    const renderPS = (declarations: Record<string, string>, computedLayout?: any) => {
      const calls: Array<[string, string]> = [];
      render(
        <PositionSizeInspector
          computedBox={COMPUTED_BOX as any}
          computedLayout={computedLayout}
          declarations={declarations}
          onStyleChange={(p, v) => calls.push([p, v])}
        />
      );
      return calls;
    };

    test('CHK-F-01: 宽高输入写出 width / height，快捷档写出预设值', () => {
      const calls = renderPS({});

      setInput(container.querySelector('[data-testid="size-width"]'), '320');
      expect(calls).toContainEqual(['width', '320px']);

      setInput(container.querySelector('[data-testid="size-height"]'), '200');
      expect(calls).toContainEqual(['height', '200px']);

      const presets = Array.from(container.querySelectorAll('button'));
      click(presets.find((b) => b.textContent === '撑满')!);
      expect(calls).toContainEqual(['width', '100%']);
      click(presets.find((b) => b.textContent === '适应内容')!);
      expect(calls).toContainEqual(['width', 'fit-content']);
    });

    test('CHK-F-02: 定位方式、四向偏移（含负值）与层级各自写出正确属性', () => {
      const calls = renderPS({ position: 'absolute' });

      const select = container.querySelector('[data-testid="position-mode"]') as HTMLSelectElement;
      act(() => {
        const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
        setter?.call(select, 'fixed');
        select.dispatchEvent(new Event('change', { bubbles: true }));
      });
      expect(calls).toContainEqual(['position', 'fixed']);

      setInput(container.querySelector('[data-testid="offset-top"]'), '12');
      expect(calls).toContainEqual(['top', '12px']);

      setInput(container.querySelector('[data-testid="offset-left"]'), '-8');
      expect(calls).toContainEqual(['left', '-8px']);

      // z-index 必须无单位
      setInput(container.querySelector('[data-testid="position-zindex"]'), '10');
      expect(calls).toContainEqual(['z-index', '10']);
      expect(calls.find(([p]) => p === 'z-index')?.[1]).not.toContain('px');
    });

    test('CHK-F-03: static 时四向偏移与层级禁用并给出说明', () => {
      renderPS({ position: 'static' });

      for (const id of ['offset-top', 'offset-right', 'offset-bottom', 'offset-left', 'position-zindex']) {
        expect((container.querySelector(`[data-testid="${id}"]`) as HTMLInputElement).disabled).toBe(true);
      }
      expect(container.querySelector('[data-testid="offset-static-hint"]')).not.toBeNull();

      // 改为 absolute 后恢复可用
      renderPS({ position: 'absolute' });
      expect((container.querySelector('[data-testid="offset-top"]') as HTMLInputElement).disabled).toBe(false);
      expect(container.querySelector('[data-testid="offset-static-hint"]')).toBeNull();
    });

    test('CHK-F-03b: 未声明 position 时按实际生效值判定禁用态', () => {
      expect(isOffsetDisabled('', 'static')).toBe(true);
      expect(isOffsetDisabled('', 'absolute')).toBe(false);
      expect(isOffsetDisabled('relative', 'static')).toBe(false);
      expect(isOffsetDisabled('', undefined)).toBe(true);
    });

    test('CHK-F-06: 未设置覆盖时，占位符展示浏览器实际生效值', () => {
      renderPS({}, { display: 'block', width: '352px', height: '178px', top: '20px', zIndex: '5' });

      expect((container.querySelector('[data-testid="size-width"]') as HTMLInputElement).placeholder).toBe('352');
      expect((container.querySelector('[data-testid="size-height"]') as HTMLInputElement).placeholder).toBe('178');
      expect((container.querySelector('[data-testid="offset-top"]') as HTMLInputElement).placeholder).toBe('20');
      expect((container.querySelector('[data-testid="position-zindex"]') as HTMLInputElement).placeholder).toBe('5');

      expect(toPlaceholder(undefined)).toBe('—');
      expect(toPlaceholder('auto')).toBe('auto');
      expect(toPlaceholder('0px')).toBe('0');
      expect(toPlaceholder('50%')).toBe('50%');
    });
  });

  describe('CHK-F-04 & CHK-F-05: 圆角 (BR-INS-05)', () => {
    const renderRadius = (declarations: Record<string, string>, computedLayout?: any) => {
      const calls: Array<[string, string]> = [];
      render(
        <RadiusInspector
          declarations={declarations}
          computedLayout={computedLayout}
          onStyleChange={(p, v) => calls.push([p, v])}
        />
      );
      return calls;
    };

    test('CHK-F-04: 统一模式下档位与自定义数值都写出 border-radius', () => {
      const calls = renderRadius({});

      const select = container.querySelector('[data-testid="radius-token"]') as HTMLSelectElement;
      act(() => {
        const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
        setter?.call(select, 'var(--radius-lg)');
        select.dispatchEvent(new Event('change', { bubbles: true }));
      });
      expect(calls).toContainEqual(['border-radius', 'var(--radius-lg)']);

      setInput(container.querySelector('[data-testid="radius-custom"]'), '18');
      expect(calls).toContainEqual(['border-radius', '18px']);
    });

    test('CHK-F-05: 切到「分别设置」以统一值铺四角，四角输入写出对应属性', () => {
      const calls = renderRadius({ 'border-radius': '12px' });

      click(container.querySelector('[data-testid="radius-mode-toggle"]'));
      for (const c of CORNER_FIELDS) {
        expect(calls).toContainEqual([c.prop, '12px']);
      }

      setInput(container.querySelector('[data-testid="radius-border-top-left-radius"]'), '30');
      expect(calls).toContainEqual(['border-top-left-radius', '30px']);
    });

    test('CHK-F-05b: 切回统一模式会清空四角，避免残留角值压住统一设置', () => {
      const calls = renderRadius({
        'border-top-left-radius': '8px',
        'border-top-right-radius': '8px'
      });

      // 已存在角值时默认落在四角模式
      expect(container.querySelector('[data-testid="radius-border-top-left-radius"]')).not.toBeNull();

      click(container.querySelector('[data-testid="radius-mode-toggle"]'));
      for (const c of CORNER_FIELDS) {
        expect(calls).toContainEqual([c.prop, '']);
      }
      expect(container.querySelector('[data-testid="radius-token"]')).not.toBeNull();
    });

    test('hasPerCornerRadius 正确识别初始模式', () => {
      expect(hasPerCornerRadius({})).toBe(false);
      expect(hasPerCornerRadius({ 'border-radius': '8px' })).toBe(false);
      expect(hasPerCornerRadius({ 'border-bottom-left-radius': '8px' })).toBe(true);
    });
  });

  describe('CHK-F-07 ~ CHK-F-09: 面板分组与写入链路 (BR-INS-01/07/08)', () => {
    const SCREEN_ID = 'sc-ins';

    const selectNode = (nid: string) => {
      useProjectStore.setState({
        activeScreenId: SCREEN_ID,
        selectedNid: nid,
        selectedNode: {
          screenId: SCREEN_ID,
          nid,
          tagName: 'div',
          textContent: '',
          textEditable: true,
          classNames: [],
          computedBox: COMPUTED_BOX as any,
          computedLayout: { display: 'block', position: 'static' }
        } as any
      });
    };

    beforeEach(() => {
      localStorage.clear();
      useHistoryStore.getState().restore(null);
      useProjectStore.setState({
        id: 'proj_ins',
        screens: {
          [SCREEN_ID]: {
            id: SCREEN_ID,
            name: '测试页',
            position: { x: 0, y: 0 },
            htmlContent: '<main data-nid="r1"><div data-nid="d1">A</div><div data-nid="d2">B</div></main>'
          }
        },
        screenOrder: [SCREEN_ID],
        overrides: {}
      } as any);
      selectNode('d1');
    });

    test('CHK-F-07: 连续分区保留常驻面包屑、AI 与文本入口', () => {
      render(<PropertyInspector />);
      const txt = container.textContent || '';
      for (const label of ['局部 AI 定向微调','文本内容','尺寸:','位置与变换','尺寸与布局','圆角','填充','描边','效果','结构与容器操作']) expect(txt).toContain(label);
      expect(container.querySelector('[data-testid="inspector-tab-style"]')).toBeNull();
    });

    test('CHK-F-08: 切换选中元素保留分区折叠状态，AI 始终可见', () => {
      render(<PropertyInspector />);
      const section = () => Array.from(container.querySelectorAll('section')).find(el => el.textContent?.includes('混合模式'))!;
      click(section().querySelector('button[aria-expanded]'));
      expect(container.querySelector('[aria-label="混合模式"]')).toBeNull();
      act(() => selectNode('d2'));
      expect(container.querySelector('[aria-label="混合模式"]')).toBeNull();
      expect(container.textContent).toContain('局部 AI 定向微调');
      // Restore shared section UI state for subsequent tests.
      click(Array.from(container.querySelectorAll('button[aria-expanded]')).find(el => el.textContent?.includes('图层'))!);
    });

    test('CHK-F-09: 几何控件经 setOverride 写入，可被「还原为 AI 基线样式」一次清除', () => {
      render(<PropertyInspector />);

      setInput(container.querySelector('[aria-label="宽度 W"]'), '320');
      act(() => container.querySelector('[aria-label="宽度 W"]')!.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})));
      setInput(container.querySelector('[aria-label="高度 H"]'), '200');
      act(() => container.querySelector('[aria-label="高度 H"]')!.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})));

      const key = `${SCREEN_ID}:d1`;
      expect(useProjectStore.getState().overrides[key].declarations['width']).toBe('320px');
      expect(useProjectStore.getState().overrides[key].declarations['height']).toBe('200px');

      // 撤销栈里有对应条目
      expect(useHistoryStore.getState().past.length).toBeGreaterThan(0);

      const resetBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('还原为 AI 基线样式')
      );
      click(resetBtn!);
      expect(useProjectStore.getState().overrides[key]).toBeUndefined();
    });
  });
});
