import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { ScreenFrame } from '../src/components/canvas/ScreenFrame';
import { useProjectStore } from '../src/stores/useProjectStore';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('ScreenFrame 标题栏防溢出与首屏辅助线视觉弱化', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  test('超长标题具有 truncate 和 min-w-0 类，标题容器具备 flex-1 和 min-w-0', async () => {
    const longName = '送花表达心意 - 牵手币充值与特权卡开通 (AI 超长优化方案演示画框)';
    const mockScreen = {
      id: 'screen-long-title',
      name: longName,
      htmlContent: '<div data-nid="root0001" class="p-4"><p>内容</p></div>',
      scopedCss: '',
      position: { x: 0, y: 0 },
      width: 390,
      measuredHeight: 600,
      updatedAt: Date.now(),
      metadata: {}
    };

    useProjectStore.setState({
      screens: { [mockScreen.id]: mockScreen },
      screenOrder: [mockScreen.id],
      activeScreenId: mockScreen.id,
      settings: {
        ...useProjectStore.getState().settings,
        deviceProfile: 'mobile',
        frameWidth: 390,
        showViewportGuide: false
      }
    });

    await act(async () => {
      root.render(<ScreenFrame screen={mockScreen} lodLevel={2} />);
    });

    // 查找标题 span
    const titleSpan = container.querySelector('span[title*="双击重命名"]');
    expect(titleSpan).not.toBeNull();
    expect(titleSpan?.textContent).toBe(longName);
    expect(titleSpan?.className).toContain('break-words');
    expect(titleSpan?.className).toContain('max-w-full');

    // 检查标题左侧父容器
    const titleParent = titleSpan?.parentElement;
    expect(titleParent).not.toBeNull();
    expect(titleParent?.className).toContain('min-w-0');
    expect(titleParent?.className).toContain('flex-1');
    expect(titleParent?.className).toContain('mr-2');

    // 检查右侧快捷操作按钮区有 flex-shrink-0 (在激活状态下渲染)
    const actionsContainer = container.querySelector('.flex-shrink-0 button')?.parentElement;
    expect(actionsContainer).not.toBeNull();
    expect(actionsContainer?.className).toContain('flex-shrink-0');
  });

  test('首屏参考线跟随参考设备，并使用无边框、无阴影的低对比辅助标记', async () => {
    const mockScreen = {
      id: 'screen-guide-test',
      name: '测试首屏线',
      htmlContent: '<div data-nid="root0002" class="p-4" style="height: 1200px;"><p>长内容</p></div>',
      scopedCss: '',
      position: { x: 0, y: 0 },
      width: 390,
      measuredHeight: 1200,
      updatedAt: Date.now(),
      metadata: {}
    };

    useProjectStore.setState({
      screens: { [mockScreen.id]: mockScreen },
      screenOrder: [mockScreen.id],
      activeScreenId: mockScreen.id,
      settings: {
        ...useProjectStore.getState().settings,
        deviceProfile: 'mobile',
        frameWidth: 390,
        showViewportGuide: true,
        viewportGuideHeight: 500,
        referenceDevice: {
          id: 'mobile-test',
          name: '测试设备',
          deviceProfile: 'mobile',
          width: 390,
          height: 400
        }
      }
    });

    await act(async () => {
      root.render(<ScreenFrame screen={mockScreen} lodLevel={0} />);
    });

    // L0 不挂载 iframe，避免测试环境的布局测量覆盖显式长页高度。
    // 参考线本身位于 iframe 外层，所有 LOD 均使用同一实现。
    const guideLine = container.querySelector('.border-dashed');
    expect(guideLine).not.toBeNull();
    // 验证不包含刺眼的 rose-500 或 rose-600
    expect(guideLine?.className).not.toContain('rose-500');
    expect(guideLine?.className).not.toContain('rose-600');
    // 设备快照优先于旧缓存高度，线条保持低对比。
    expect((guideLine as HTMLElement)?.style.top).toBe('400px');
    expect(guideLine?.className).toContain('border-slate-400/20');

    // 查找文字提示 pill
    const guideBadge = guideLine?.querySelector('span');
    expect(guideBadge).not.toBeNull();
    expect(guideBadge?.textContent).toContain('首屏 · 400px');
    expect(guideBadge?.getAttribute('title')).toContain('测试设备');
    expect(guideBadge?.className).toContain('bg-slate-950/20');
    expect(guideBadge?.className).toContain('text-slate-500/55');
    expect(guideBadge?.className).not.toContain('border');
    expect(guideBadge?.className).not.toContain('shadow');
    expect(guideBadge?.className).not.toContain('bg-rose-600');
  });
});
