import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { useProjectStore } from '../src/stores/useProjectStore';
import { PropertyInspector } from '../src/components/inspector/PropertyInspector';
import { LayoutInspector } from '../src/components/inspector/LayoutInspector';
import { BoxModelInspector } from '../src/components/inspector/BoxModelInspector';
import { ScreenFrame } from '../src/components/canvas/ScreenFrame';
import { ErrorBoundary } from '../src/components/common/ErrorBoundary';

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

const cleanup = () => {
  if (root) {
    act(() => root.unmount());
  }
  if (container && container.parentNode) {
    container.remove();
  }
};

describe('ISSUE-018: 画框元素多次点选与 SVG 面包屑防崩溃测试', () => {
  beforeEach(() => {
    useProjectStore.setState({
      screens: {},
      screenOrder: [],
      overrides: {},
      selectedNid: null,
      selectedNode: null,
      activeScreenId: null
    });
  });

  afterEach(() => {
    cleanup();
  });

  test('CHK-F-01: 当选中的元素或其祖先为 SVG 元素时，parentChain 面包屑不抛 split 异常', () => {
    const store = useProjectStore.getState();
    const screenId = store.addScreen({
      name: 'SVG 测试画框',
      htmlContent: `
        <div data-nid="root1" class="container">
          <button data-nid="btn1" class="btn btn-primary">
            <svg data-nid="svg1" class="icon w-4 h-4" viewBox="0 0 24 24">
              <path data-nid="path1" d="M12 2L2 7l10 5 10-5-10-5z" />
            </svg>
            <span data-nid="txt1">点击我</span>
          </button>
        </div>
      `
    });

    // 模拟选择深层 path 节点
    act(() => {
      store.selectNodeByNid(screenId, 'path1');
    });

    const selected = useProjectStore.getState().selectedNode;
    expect(selected).not.toBeNull();
    expect(selected?.nid).toBe('path1');
    expect(selected?.parentChain).toBeDefined();

    // 验证 parentChain 中每一项的 className 均为 string 规范类型
    selected?.parentChain?.forEach((p) => {
      expect(typeof p.className === 'string' || p.className === undefined).toBe(true);
    });

    // 渲染 PropertyInspector，验证面包屑渲染完全不抛出异常
    expect(() => {
      render(<PropertyInspector />);
    }).not.toThrow();

    expect(container.textContent).toContain('path');
    expect(container.textContent).toContain('svg');
    expect(container.textContent).toContain('#path1');
  });

  test('CHK-F-01 进阶: parentChain 中即使包含 SVGAnimatedString 结构的对象，PropertyInspector 仍安全渲染', () => {
    const store = useProjectStore.getState();
    const screenId = store.addScreen({
      name: '异常链测试',
      htmlContent: '<div data-nid="n1"><span data-nid="n2">文案</span></div>'
    });

    // 手动构造一个带有 SVGAnimatedString 仿造对象的 parentChain
    const mockSvgAnimatedString = {
      baseVal: 'icon w-5 h-5 text-blue-500',
      animVal: 'icon w-5 h-5 text-blue-500'
    };

    act(() => {
      store.selectNode({
        screenId,
        nid: 'n2',
        tagName: 'span',
        textContent: '文案',
        classNames: ['text-sm'],
        parentChain: [
          {
            nid: 'n1',
            tagName: 'svg',
            // @ts-expect-error 故意传入非 string 的 SVGAnimatedString 结构测试防御性
            className: mockSvgAnimatedString
          }
        ],
        computedBox: {
          width: 60,
          height: 20,
          top: 0,
          left: 0,
          padding: { top: 0, right: 0, bottom: 0, left: 0 },
          margin: { top: 0, right: 0, bottom: 0, left: 0 }
        },
        computedLayout: {
          display: 'inline',
          flexDirection: 'row',
          alignItems: 'stretch',
          justifyContent: 'flex-start',
          flexWrap: 'nowrap',
          gap: '0px'
        }
      });
    });

    // 渲染时不会因为 .split 调用报错
    expect(() => {
      render(<PropertyInspector />);
    }).not.toThrow();

    const breadcrumbBtn = container.querySelector('button[title*="icon.w-5"]');
    expect(breadcrumbBtn).not.toBeNull();
  });

  test('CHK-F-02 & CHK-F-03: BoxModelInspector 与 LayoutInspector 在属性缺失时不崩溃', () => {
    // 盒模型缺少 padding 或 margin 字段
    expect(() => {
      render(
        <BoxModelInspector
          // @ts-expect-error 故意缺省内层字段测试健壮性
          computedBox={{
            width: 100,
            height: 50,
            top: 0,
            left: 0
          }}
          declarations={{}}
          onStyleChange={() => {}}
        />
      );
    }).not.toThrow();

    // 布局检查器在 computedLayout 为空或异常字段时不崩溃
    expect(() => {
      render(
        <LayoutInspector
          // @ts-expect-error 故意缺省或乱码测试
          computedLayout={{
            display: undefined as any,
            flexDirection: null as any
          }}
          declarations={{}}
          onStyleChange={() => {}}
        />
      );
    }).not.toThrow();
  });

  test('CHK-F-04: ErrorBoundary 拦截子组件异常并支持重置状态恢复', () => {
    let shouldCrash = true;
    const BuggyComponent: React.FC = () => {
      if (shouldCrash) {
        throw new Error('Test Simulated Render Crash');
      }
      return <div>正常渲染完成</div>;
    };

    let resetCalled = false;
    render(
      <ErrorBoundary
        fallbackTitle="测试崩溃拦截"
        onReset={() => {
          resetCalled = true;
          shouldCrash = false;
        }}
      >
        <BuggyComponent />
      </ErrorBoundary>
    );

    // 验证没有黑屏，而是呈现了错误降级界面
    expect(container.textContent).toContain('测试崩溃拦截');
    expect(container.textContent).toContain('Test Simulated Render Crash');

    // 找到重置按钮并点击
    const resetBtn = container.querySelector('button');
    expect(resetBtn).not.toBeNull();

    act(() => {
      resetBtn?.click();
    });

    expect(resetCalled).toBe(true);
    // 重置后应该成功恢复为正常内容
    expect(container.textContent).toContain('正常渲染完成');
  });

  test('CHK-F-01: 画框 iframe 内点击含 SVG 的子元素，安全捕获并写入 selectedNode', async () => {
    const store = useProjectStore.getState();
    const screenId = store.addScreen({
      name: 'Iframe SVG 测试',
      htmlContent: `
        <div data-nid="root2" class="p-4">
          <button data-nid="btn2" class="btn">
            <svg data-nid="svg2" class="w-4 h-4"><path data-nid="path2" d="M0 0h24v24H0z" /></svg>
            <span data-nid="txt2">提交</span>
          </button>
        </div>
      `
    });
    store.setActiveScreen(screenId);

    const screen = useProjectStore.getState().screens[screenId];
    render(<ScreenFrame screen={screen} lodLevel={2} />);

    await act(async () => {
      await new Promise((r) => setTimeout(r, 60));
    });

    const iframe = container.querySelector('iframe') as HTMLIFrameElement;
    expect(iframe).not.toBeNull();
    const doc = iframe.contentDocument!;
    const pathEl = doc.querySelector('[data-nid="path2"]') as HTMLElement;
    expect(pathEl).not.toBeNull();

    await act(async () => {
      pathEl.dispatchEvent(new (doc.defaultView as any).MouseEvent('click', { bubbles: true }));
    });

    const selected = useProjectStore.getState().selectedNode;
    expect(selected).not.toBeNull();
    expect(selected?.nid).toBe('path2');
    expect(selected?.parentChain?.some((p) => p.nid === 'svg2')).toBe(true);
  });

  test('Shift+点击已有页面跳转元素时切换到目标画框', async () => {
    const store = useProjectStore.getState();
    const sourceId = store.addScreen({ name: '来源页', htmlContent: '<button data-nid="go" data-target-screen-id="target-page">打开详情</button>' }, 'source-page');
    const targetId = store.addScreen({ name: '目标页', htmlContent: '<main data-nid="target">详情</main>' }, 'target-page');
    store.setActiveScreen(sourceId);
    render(<ScreenFrame screen={useProjectStore.getState().screens[sourceId]} lodLevel={2} />);
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 60)); });
    const iframe = container.querySelector('iframe') as HTMLIFrameElement;
    const button = iframe.contentDocument!.querySelector('[data-nid="go"]')!;
    await act(async () => {
      button.dispatchEvent(new (iframe.contentDocument!.defaultView as any).MouseEvent('click', { bubbles: true, shiftKey: true }));
    });
    expect(useProjectStore.getState().activeScreenId).toBe(targetId);
    expect(useProjectStore.getState().selectedNode).toBeNull();
  });
});
