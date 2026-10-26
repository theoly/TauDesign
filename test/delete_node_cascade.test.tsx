import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { useProjectStore } from '../src/stores/useProjectStore';
import { useHistoryStore } from '../src/stores/useHistoryStore';
import { deleteElementByNid } from '../src/utils/domPatcher';
import { PropertyInspector } from '../src/components/inspector/PropertyInspector';
import { ScreenFrame } from '../src/components/canvas/ScreenFrame';

describe('节点级联删除与 DOM 结构安全 (Delete Node Cascade - T-DNC-01 ~ T-DNC-05 / ISSUE-021)', () => {
  let container: HTMLDivElement;
  let root: any;

  beforeEach(() => {
    localStorage.clear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    useProjectStore.getState().initNewProject({
      name: '级联删除测试工程',
      deviceProfile: 'pc',
      designSystem: useProjectStore.getState().designSystem,
      createSpecimen: false
    });
  });

  afterEach(() => {
    if (root) {
      act(() => root.unmount());
    }
    if (container && container.parentNode) {
      container.remove();
    }
  });

  const renderComponent = (ui: React.ReactElement) => {
    act(() => {
      root.render(ui);
    });
  };

  test('CHK-F-01: deleteElementByNid 能够正确删除单标签与叶子节点，返回正确的 deletedNids 且不破坏兄弟结构', () => {
    const html = `
      <div data-nid="wrapper" class="container">
        <h1 data-nid="title">Hello World</h1>
        <img data-nid="hero-img" src="avatar.png" alt="test" />
        <input data-nid="user-input" placeholder="type here" />
        <p data-nid="desc">Description paragraph</p>
      </div>
    `.trim();

    // 1. 删除自闭合/单标签 img
    const resImg = deleteElementByNid(html, 'hero-img');
    expect(resImg.success).toBe(true);
    expect(resImg.deletedNids).toEqual(['hero-img']);
    expect(resImg.html.includes('data-nid="hero-img"')).toBe(false);
    expect(resImg.html.includes('data-nid="title"')).toBe(true);
    expect(resImg.html.includes('data-nid="user-input"')).toBe(true);
    expect(resImg.html.includes('data-nid="desc"')).toBe(true);

    // 2. 删除叶子节点 p
    const resP = deleteElementByNid(resImg.html, 'desc');
    expect(resP.success).toBe(true);
    expect(resP.deletedNids).toEqual(['desc']);
    expect(resP.html.includes('data-nid="desc"')).toBe(false);
    expect(resP.html.includes('data-nid="title"')).toBe(true);
  });

  test('CHK-F-02: 包含多层嵌套同名标签（div > div > div）时，删除父容器整棵子树与全部子孙节点被 100% 级联删除，不遗留孤儿节点与多余闭合标签', () => {
    const complexNestedHtml = `
      <section data-nid="sec-root">
        <div data-nid="card-parent" class="card p-6">
          <div data-nid="card-header" class="header">
            <h2 data-nid="card-title">Card Title</h2>
            <div data-nid="badge-box" class="badge">
              <span data-nid="badge-text">New</span>
            </div>
          </div>
          <div data-nid="card-body" class="body">
            <p data-nid="body-p1">First paragraph</p>
            <div data-nid="nested-row" class="row">
              <button data-nid="btn-confirm">OK</button>
              <button data-nid="btn-cancel">Cancel</button>
            </div>
          </div>
        </div>
        <div data-nid="sibling-card" class="card">
          <h3 data-nid="sibling-title">Sibling preserved</h3>
        </div>
      </section>
    `.trim();

    // 删除 card-parent (它内部有 header, badge-box, nested-row 多个 div 子孙)
    const result = deleteElementByNid(complexNestedHtml, 'card-parent');
    expect(result.success).toBe(true);

    // 断言所有后代 nid 全部在 deletedNids 中
    expect(result.deletedNids).toContain('card-parent');
    expect(result.deletedNids).toContain('card-header');
    expect(result.deletedNids).toContain('card-title');
    expect(result.deletedNids).toContain('badge-box');
    expect(result.deletedNids).toContain('badge-text');
    expect(result.deletedNids).toContain('card-body');
    expect(result.deletedNids).toContain('body-p1');
    expect(result.deletedNids).toContain('nested-row');
    expect(result.deletedNids).toContain('btn-confirm');
    expect(result.deletedNids).toContain('btn-cancel');

    // 断言 HTML 中已彻底没有 card-parent 及其任何子元素
    expect(result.html.includes('data-nid="card-parent"')).toBe(false);
    expect(result.html.includes('data-nid="card-header"')).toBe(false);
    expect(result.html.includes('data-nid="card-title"')).toBe(false);
    expect(result.html.includes('data-nid="badge-box"')).toBe(false);
    expect(result.html.includes('data-nid="nested-row"')).toBe(false);
    expect(result.html.includes('btn-confirm')).toBe(false);
    expect(result.html.includes('btn-cancel')).toBe(false);

    // 断言兄弟节点与父级结构完好保留
    expect(result.html.includes('data-nid="sec-root"')).toBe(true);
    expect(result.html.includes('data-nid="sibling-card"')).toBe(true);
    expect(result.html.includes('data-nid="sibling-title"')).toBe(true);

    // 校验 HTML 语法有效性（标签配对，无多余未闭合或多余关闭标签）
    const parser = new DOMParser();
    const parsed = parser.parseFromString(`<body>${result.html}</body>`, 'text/html');
    expect(parsed.querySelector('[data-nid="sibling-card"]')).not.toBeNull();
    expect(parsed.querySelector('[data-nid="card-parent"]')).toBeNull();
    expect(parsed.querySelector('[data-nid="card-header"]')).toBeNull();
  });

  test('CHK-F-03: useProjectStore.deleteNode 同步清除被删除节点及其全部子孙节点的样式覆盖层 (overrides)', () => {
    const screenId = 'screen-cascade-1';
    const html = `
      <div data-nid="card-box" class="card">
        <h2 data-nid="card-head">Headline</h2>
        <p data-nid="card-sub">Subtext</p>
      </div>
      <div data-nid="other-box" class="card">
        <span data-nid="other-span">Other</span>
      </div>
    `.trim();

    useProjectStore.setState({
      screens: {
        [screenId]: {
          id: screenId,
          name: '级联覆盖清理测试页',
          position: { x: 0, y: 0 },
          htmlContent: html
        }
      },
      screenOrder: [screenId],
      activeScreenId: screenId,
      // 为 card-box 以及它的子节点 card-head, card-sub 设置覆盖层
      overrides: {
        [`${screenId}:card-box`]: { nid: 'card-box', declarations: { 'margin': '10px' } },
        [`${screenId}:card-head`]: { nid: 'card-head', declarations: { 'color': 'red' } },
        [`${screenId}:card-sub`]: { nid: 'card-sub', declarations: { 'font-size': '14px' } },
        [`${screenId}:other-box`]: { nid: 'other-box', declarations: { 'padding': '20px' } }
      }
    });

    const store = useProjectStore.getState();
    const success = store.deleteNode(screenId, 'card-box');
    expect(success).toBe(true);

    const updatedOverrides = useProjectStore.getState().overrides;
    // card-box 及其子节点的 overrides 必须被彻底清除
    expect(updatedOverrides[`${screenId}:card-box`]).toBeUndefined();
    expect(updatedOverrides[`${screenId}:card-head`]).toBeUndefined();
    expect(updatedOverrides[`${screenId}:card-sub`]).toBeUndefined();

    // 未被删除的 other-box 的 overrides 必须完好保留
    expect(updatedOverrides[`${screenId}:other-box`]).toBeDefined();
    expect(updatedOverrides[`${screenId}:other-box`].declarations['padding']).toBe('20px');
  });

  test('CHK-F-04: deleteNode 执行后，若当前选中或悬浮的节点处于被删除子树中，自动重置选中状态', () => {
    const screenId = 'screen-sel-test';
    const html = `
      <div data-nid="parent-container">
        <button data-nid="active-button">Click Me</button>
      </div>
    `.trim();

    useProjectStore.setState({
      screens: {
        [screenId]: {
          id: screenId,
          name: '选区重置测试页',
          position: { x: 0, y: 0 },
          htmlContent: html
        }
      },
      screenOrder: [screenId],
      activeScreenId: screenId,
      selectedNid: 'active-button',
      selectedNode: {
        nid: 'active-button',
        tagName: 'BUTTON',
        textContent: 'Click Me',
        classNames: [],
        computedBox: {
          width: 80,
          height: 32,
          padding: { top: 0, right: 0, bottom: 0, left: 0 },
          margin: { top: 0, right: 0, bottom: 0, left: 0 },
          border: { top: 0, right: 0, bottom: 0, left: 0 }
        }
      },
      hoveredNid: 'active-button'
    });

    // 删除父级容器 parent-container
    const success = useProjectStore.getState().deleteNode(screenId, 'parent-container');
    expect(success).toBe(true);

    // 选中状态与悬浮状态均被安全清空
    const state = useProjectStore.getState();
    expect(state.selectedNid).toBeNull();
    expect(state.selectedNode).toBeNull();
    expect(state.hoveredNid).toBeNull();
  });

  test('CHK-F-05: 级联删除支持撤销 (Ctrl+Z) 完整恢复被删除的容器及其全部子节点', () => {
    const screenId = 'screen-undo-test';
    const originalHtml = `
      <div data-nid="card-root">
        <h1 data-nid="title-node">Undo Title</h1>
        <p data-nid="text-node">Undo Body</p>
      </div>
    `.trim();

    useProjectStore.setState({
      screens: {
        [screenId]: {
          id: screenId,
          name: '撤销测试页',
          position: { x: 0, y: 0 },
          htmlContent: originalHtml
        }
      },
      screenOrder: [screenId],
      activeScreenId: screenId
    });

    // 执行级联删除
    useProjectStore.getState().deleteNode(screenId, 'card-root');
    expect(useProjectStore.getState().screens[screenId].htmlContent.includes('card-root')).toBe(false);

    // 执行历史撤销 Undo
    useHistoryStore.getState().undo();

    // 确认 card-root 及其子元素 title-node, text-node 全部完整恢复
    const restoredHtml = useProjectStore.getState().screens[screenId].htmlContent;
    expect(restoredHtml.includes('data-nid="card-root"')).toBe(true);
    expect(restoredHtml.includes('data-nid="title-node"')).toBe(true);
    expect(restoredHtml.includes('data-nid="text-node"')).toBe(true);
  });

  test('CHK-F-06: PropertyInspector 点击「删除此节点」按钮触发级联删除，彻底移除父子节点', () => {
    const screenId = 'screen-inspector-test';
    const html = `
      <div data-nid="card-outer" class="card">
        <div data-nid="card-inner" class="inner">
          <span data-nid="inner-text">Inspect Me</span>
        </div>
      </div>
      <footer data-nid="page-footer">Footer</footer>
    `.trim();

    useProjectStore.setState({
      screens: {
        [screenId]: {
          id: screenId,
          name: '检查器删除测试',
          position: { x: 0, y: 0 },
          htmlContent: html
        }
      },
      screenOrder: [screenId],
      activeScreenId: screenId,
      selectedNid: 'card-outer',
      selectedNode: {
        nid: 'card-outer',
        tagName: 'DIV',
        textContent: 'Inspect Me',
        classNames: ['card'],
        computedBox: {
          width: 200,
          height: 100,
          padding: { top: 0, right: 0, bottom: 0, left: 0 },
          margin: { top: 0, right: 0, bottom: 0, left: 0 },
          border: { top: 0, right: 0, bottom: 0, left: 0 }
        }
      }
    });

    renderComponent(<PropertyInspector />);

    // 结构操作已归入「操作」分组 (doc/feature/inspector-geometry-tabs BR-INS-01)，先切换过去

    // 查找并点击「删除此节点」
    const deleteBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('删除此节点')
    );
    expect(deleteBtn).toBeDefined();

    act(() => {
      deleteBtn?.click();
    });

    // 检查页面已彻底无 card-outer 与 card-inner
    const nextHtml = useProjectStore.getState().screens[screenId].htmlContent;
    expect(nextHtml.includes('data-nid="card-outer"')).toBe(false);
    expect(nextHtml.includes('data-nid="card-inner"')).toBe(false);
    expect(nextHtml.includes('data-nid="inner-text"')).toBe(false);
    expect(nextHtml.includes('data-nid="page-footer"')).toBe(true);

    // 选中状态重置
    expect(useProjectStore.getState().selectedNid).toBeNull();
  });

  test('CHK-F-07: 画框中在非文本输入状态下按 Backspace/Delete 键触发节点级联删除', async () => {
    const screenObj = {
      id: 'screen-key-del',
      name: '快捷键删除页',
      position: { x: 0, y: 0 },
      htmlContent: `
        <div data-nid="layout-root">
          <div data-nid="target-banner" class="banner">
            <h1 data-nid="banner-h1">Hot Deals</h1>
            <p data-nid="banner-p">Limited Time</p>
          </div>
          <div data-nid="content-box">Regular Content</div>
        </div>
      `.trim()
    };

    useProjectStore.setState({
      screens: { [screenObj.id]: screenObj },
      screenOrder: [screenObj.id],
      activeScreenId: screenObj.id,
      selectedNid: 'target-banner',
      selectedNode: {
        nid: 'target-banner',
        screenId: screenObj.id,
        tagName: 'DIV',
        textContent: 'Hot Deals',
        classNames: ['banner'],
        computedBox: {
          width: 300,
          height: 120,
          padding: { top: 0, right: 0, bottom: 0, left: 0 },
          margin: { top: 0, right: 0, bottom: 0, left: 0 },
          border: { top: 0, right: 0, bottom: 0, left: 0 }
        }
      }
    });

    renderComponent(<ScreenFrame screen={screenObj} lodLevel={2} />);

    await act(async () => {
      await new Promise((r) => setTimeout(r, 80));
    });

    const iframe = container.querySelector('iframe') as HTMLIFrameElement;
    expect(iframe).not.toBeNull();

    const doc = iframe.contentDocument;
    expect(doc).not.toBeNull();

    await act(async () => {
      const KeyboardEvt = (doc?.defaultView as any)?.KeyboardEvent || KeyboardEvent;
      const ke = new KeyboardEvt('keydown', { key: 'Backspace', bubbles: true, cancelable: true });
      doc?.body.dispatchEvent(ke);
      await new Promise((r) => setTimeout(r, 20));
    });

    const finalHtml = useProjectStore.getState().screens[screenObj.id].htmlContent;
    // target-banner 及其所有子项被级联移除
    expect(finalHtml.includes('data-nid="target-banner"')).toBe(false);
    expect(finalHtml.includes('data-nid="banner-h1"')).toBe(false);
    expect(finalHtml.includes('data-nid="banner-p"')).toBe(false);
    // 其余内容保留
    expect(finalHtml.includes('data-nid="content-box"')).toBe(true);
  });
});
