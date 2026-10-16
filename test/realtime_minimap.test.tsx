import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { CanvasMinimap } from '../src/components/canvas/CanvasMinimap';
import { useProjectStore } from '../src/stores/useProjectStore';
import { createMapProjection, getWorldViewport, mapPointToWorld, projectMapRect } from '../src/utils/minimapGeometry';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('实时小地图几何', () => {
  test('负坐标、远端画框和长页全部等比容纳，并可逆映射', () => {
    const frames = [{ x: -1500, y: -500, width: 390, height: 9000 }, { x: 24000, y: 15000, width: 1440, height: 800 }];
    const projection = createMapProjection(frames, 208, 128);
    for (const frame of frames) {
      const rect = projectMapRect(frame, projection);
      expect(rect.x).toBeGreaterThanOrEqual(7.99);
      expect(rect.y).toBeGreaterThanOrEqual(7.99);
      expect(rect.x + rect.width).toBeLessThanOrEqual(200.01);
      expect(rect.y + rect.height).toBeLessThanOrEqual(120.01);
      expect(rect.width / rect.height).toBeCloseTo(frame.width / frame.height, 8);
      const world = mapPointToWorld(rect.x, rect.y, projection);
      expect(world.x).toBeCloseTo(frame.x, 8);
      expect(world.y).toBeCloseTo(frame.y, 8);
    }
  });

  test('视口坐标按缩放反算，空场景仍有有限投影', () => {
    expect(getWorldViewport({ x: -200, y: 100, scale: 0.5 }, { width: 1200, height: 800 }))
      .toEqual({ x: 400, y: -200, width: 2400, height: 1600 });
    expect(Number.isFinite(createMapProjection([], 208, 128).scale)).toBe(true);
  });
});

describe('实时小地图组件', () => {
  let host: HTMLDivElement;
  let canvas: HTMLDivElement;
  let root: Root;
  let saved: ReturnType<typeof useProjectStore.getState>;
  let canvasWidth: number;
  beforeEach(() => {
    saved = useProjectStore.getState();
    canvasWidth = 1200;
    canvas = document.createElement('div');
    canvas.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, right: canvasWidth, bottom: 800, width: canvasWidth, height: 800, toJSON() {} });
    host = document.createElement('div');
    document.body.append(host, canvas);
    root = createRoot(host);
    useProjectStore.setState({
      screens: { one: { id: 'one', name: '长页面', position: { x: -400, y: 200 }, measuredHeight: 3200, htmlContent: '<p data-nid="text0001">实时内容</p>' } },
      screenOrder: ['one'], activeScreenId: null, selectedNid: null, selectedNode: null, overrides: {},
      settings: { ...saved.settings, frameWidth: 390, deviceProfile: 'mobile' },
      viewportTransform: { x: 40, y: 60, scale: 0.5 }
    });
    act(() => root.render(<CanvasMinimap canvasRef={{ current: canvas }} />));
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove(); canvas.remove();
    useProjectStore.setState(saved);
  });
  const click = (element: Element) => act(() => element.dispatchEvent(new MouseEvent('click', { bubbles: true })));

  test('点击按实际长页中心定位、保留缩放；平移与容器resize实时更新视口框', () => {
    click(host.querySelector('[data-testid="minimap-screen-one"]')!);
    expect(useProjectStore.getState().activeScreenId).toBe('one');
    expect(useProjectStore.getState().viewportTransform).toEqual({ x: 702.5, y: -500, scale: 0.5 });
    const viewport = host.querySelector('[data-testid="minimap-viewport"]') as HTMLElement;
    const before = viewport.style.cssText;
    act(() => useProjectStore.getState().setViewportTransform({ x: -800, y: 0, scale: 1 }));
    expect(viewport.style.cssText).not.toBe(before);
    const beforeResize = viewport.style.width;
    canvasWidth = 600;
    act(() => window.dispatchEvent(new Event('resize')));
    expect(viewport.style.width).not.toBe(beforeResize);
  });

  test('位置/高度与HTML更新同步，平移和样式热更新不替换iframe文档；收起卸载', () => {
    const iframe = host.querySelector('iframe')!;
    const originalDoc = iframe.srcdoc;
    const rect = host.querySelector('[data-testid="minimap-screen-one"]') as HTMLElement;
    const before = rect.style.cssText;
    act(() => useProjectStore.setState((state) => ({ screens: { one: { ...state.screens.one, position: { x: 6000, y: -2000 }, measuredHeight: 6000 } } })));
    expect(rect.style.cssText).not.toBe(before);
    expect(iframe.srcdoc).toBe(originalDoc);
    act(() => useProjectStore.getState().setViewportTransform({ x: -900, y: -200, scale: 2 }));
    expect(iframe.srcdoc).toBe(originalDoc);
    const doc = iframe.contentDocument!;
    doc.head.innerHTML = '<style id="minimap-tokens"></style><style id="minimap-overrides"></style>';
    act(() => iframe.dispatchEvent(new Event('load')));
    act(() => useProjectStore.setState({ overrides: { 'one:text0001': { nid: 'text0001', declarations: { padding: '24px' } } } }));
    expect(doc.getElementById('minimap-overrides')?.textContent).toContain('padding: 24px !important');
    act(() => useProjectStore.setState((state) => ({ settings: { ...state.settings, colorMode: 'dark' } })));
    expect(doc.getElementById('minimap-tokens')?.textContent).toContain('--color-bg');
    expect(iframe.srcdoc).toBe(originalDoc);
    act(() => useProjectStore.setState((state) => ({ screens: { one: { ...state.screens.one, htmlContent: '<p>更新内容</p>' } } })));
    expect(iframe.srcdoc).toContain('更新内容');
    expect(iframe.srcdoc).toContain("script-src 'none'");
    click(host.querySelector('[aria-controls="minimap-scene"]')!);
    expect(host.querySelector('iframe')).toBeNull();
    click(host.querySelector('[aria-controls="minimap-scene"]')!);
    expect(host.querySelector('iframe')).not.toBeNull();
  });

  test('地图拖动使用冻结投影导航，且鼠标与滚轮不传播到画布', () => {
    const scene = host.querySelector('[data-testid="minimap-scene"]') as HTMLDivElement;
    scene.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, right: 208, bottom: 128, width: 208, height: 128, toJSON() {} });
    let bubbled = 0;
    const onBubble = () => bubbled++;
    document.addEventListener('mousedown', onBubble);
    document.addEventListener('wheel', onBubble);
    scene.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    scene.dispatchEvent(new WheelEvent('wheel', { bubbles: true }));
    document.removeEventListener('mousedown', onBubble);
    document.removeEventListener('wheel', onBubble);
    expect(bubbled).toBe(0);
    const projection = createMapProjection([
      { x: -400, y: 200, width: 390, height: 3200 },
      getWorldViewport({ x: 40, y: 60, scale: 0.5 }, { width: 1200, height: 800 })
    ], 208, 128);
    act(() => scene.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, button: 0, clientX: 80, clientY: 60 })));
    act(() => scene.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 1, clientX: 100, clientY: 70 })));
    const world = mapPointToWorld(100, 70, projection);
    expect(useProjectStore.getState().viewportTransform).toEqual({ x: 600 - world.x * 0.5, y: 400 - world.y * 0.5, scale: 0.5 });
    act(() => scene.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1 })));
    const after = useProjectStore.getState().viewportTransform;
    act(() => scene.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 1, clientX: 10, clientY: 10 })));
    expect(useProjectStore.getState().viewportTransform).toEqual(after);
  });
});
