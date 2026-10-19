import { mockModificationAnalysis, confirmLatestModification } from './modification_review_helpers';
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { ChatDrawer } from '../src/components/chat/ChatDrawer';
import { useProjectStore } from '../src/stores/useProjectStore';
import { useAIConfigStore, defaultProviders, defaultBindings } from '../src/stores/useAIConfigStore';
import { defaultTheme } from '../src/utils/themePresets';
import { AIService } from '../src/services/ai/aiService';
import { PipelineExecutor } from '../src/services/ai/engine/pipeline/executor';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let analysisMock: ReturnType<typeof mockModificationAnalysis>;

describe('Chat Reference Toggle: 画布点选与对话引用解耦 & 双态卡片交互', () => {
  let container: HTMLDivElement;
  let root: Root;

  const originalExecute = PipelineExecutor.execute;
  const originalStream = AIService.stream;

  beforeEach(() => {
    analysisMock = mockModificationAnalysis();
    localStorage.clear();
    const store = useProjectStore.getState();
    store.initNewProject({
      name: 'Ref Toggle Test Project',
      deviceProfile: 'pc',
      designSystem: defaultTheme,
      createSpecimen: false
    });

    // 创建两个测试画框
    store.addScreen({
      name: '编辑资料',
      htmlContent: '<div class="profile-card" data-nid="prof0001"><button data-nid="btn0001">保存</button></div>'
    });
    store.addScreen({
      name: '设置中心',
      htmlContent: '<div class="settings-card" data-nid="sett0001"><span>设置项</span></div>'
    });

    useAIConfigStore.setState({
      providers: defaultProviders.map((p) =>
        p.id === 'prov-deepseek' ? { ...p, apiKey: 'sk-test-valid' } : p
      ),
      bindings: defaultBindings
    });

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    analysisMock.mockRestore();
    PipelineExecutor.execute = originalExecute;
    AIService.stream = originalStream;
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  test('CHK-F-01: 画布选中画框后，引用卡片默认展示为「未启用」状态', () => {
    const screens = useProjectStore.getState().screens;
    const screenIds = Object.keys(screens);
    expect(screenIds.length).toBeGreaterThanOrEqual(2);

    // 选中第一个画框
    act(() => {
      useProjectStore.getState().setActiveScreen(screenIds[0]);
    });

    act(() => {
      root.render(React.createElement(ChatDrawer, { onOpenSettings: () => {} }));
    });

    const activeScreen = screens[screenIds[0]];
    // 应当渲染「编辑资料」引用卡片，且显示「未启用」
    expect(container.textContent).toContain(activeScreen.name);
    expect(container.textContent).toContain('未启用');
    expect(container.textContent).not.toContain('已启用');
  });

  test('CHK-F-02: 点击引用卡片可在「启用」与「未启用」之间自由切换', () => {
    const screens = useProjectStore.getState().screens;
    const screenIds = Object.keys(screens);

    act(() => {
      useProjectStore.getState().setActiveScreen(screenIds[0]);
    });

    act(() => {
      root.render(React.createElement(ChatDrawer, { onOpenSettings: () => {} }));
    });

    // 找到页面引用按钮
    const refBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes(screens[screenIds[0]].name) && b.textContent?.includes('未启用')
    );
    expect(refBtn).toBeDefined();

    // 点击启用引用
    act(() => {
      refBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).toContain('已启用');
    expect(container.textContent).not.toContain('未启用');

    // 找到已启用的引用按钮，再次点击切换为未启用
    const activeRefBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes(screens[screenIds[0]].name) && b.textContent?.includes('已启用')
    );
    expect(activeRefBtn).toBeDefined();

    act(() => {
      activeRefBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).toContain('未启用');
    expect(container.textContent).not.toContain('已启用');
  });

  test('CHK-F-06: 画布切换到其他画框时，引用状态自动重置为「未启用」', () => {
    const screens = useProjectStore.getState().screens;
    const screenIds = Object.keys(screens);

    act(() => {
      useProjectStore.getState().setActiveScreen(screenIds[0]);
    });

    act(() => {
      root.render(React.createElement(ChatDrawer, { onOpenSettings: () => {} }));
    });

    // 先点击启用当前页引用
    const refBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes(screens[screenIds[0]].name) && b.textContent?.includes('未启用')
    );
    act(() => {
      refBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(container.textContent).toContain('已启用');

    // 画布切换到第二个画框「设置中心」
    act(() => {
      useProjectStore.getState().setActiveScreen(screenIds[1]);
    });

    // 新画框应当重置为「未启用」
    expect(container.textContent).toContain(screens[screenIds[1]].name);
    expect(container.textContent).toContain('未启用');
    expect(container.textContent).not.toContain('已启用');
  });

  test('CHK-F-03: 当引用处于「未启用」时发送修改类 prompt，AI 管道接收的 activeScreenId 为 null', async () => {
    const screens = useProjectStore.getState().screens;
    const screenIds = Object.keys(screens);

    act(() => {
      useProjectStore.getState().setActiveScreen(screenIds[0]);
    });

    act(() => {
      root.render(React.createElement(ChatDrawer, { onOpenSettings: () => {} }));
    });

    let capturedInput: any = null;
    (PipelineExecutor as any).execute = async (args: any) => {
      capturedInput = args.input;
      return {
        rawResponse: '```html\n<div class="new-page">New Content</div>\n```',
        extractedHtml: '<div class="new-page">New Content</div>'
      };
    };

    const textarea = container.querySelector('textarea');
    expect(textarea).not.toBeNull();

    act(() => {
      const nativeSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      nativeSetter?.call(textarea, '优化表单设计');
      textarea?.dispatchEvent(new Event('input', { bubbles: true }));
      textarea?.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const sendBtn = container.querySelector('button[title*="发送设计诉求"]');
    await act(async () => {
      sendBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
      await confirmLatestModification(container);

    expect(capturedInput).not.toBeNull();
    // 核心断言：未点击引用时，activeScreenId 必须为 null，防止覆盖已有页面！
    expect(capturedInput.activeScreenId).toBeNull();
  });

  test('CHK-F-04: 当引用处于「已启用」时发送修改 prompt，AI 管道正确接收该画框 ID', async () => {
    const screens = useProjectStore.getState().screens;
    const screenIds = Object.keys(screens);

    act(() => {
      useProjectStore.getState().setActiveScreen(screenIds[0]);
    });

    act(() => {
      root.render(React.createElement(ChatDrawer, { onOpenSettings: () => {} }));
    });

    // 点击启用引用
    const refBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes(screens[screenIds[0]].name) && b.textContent?.includes('未启用')
    );
    act(() => {
      refBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(container.textContent).toContain('已启用');

    let capturedInput: any = null;
    (PipelineExecutor as any).execute = async (args: any) => {
      capturedInput = args.input;
      return {
        rawResponse: '```html\n<div class="profile-card" data-nid="prof0001"><button data-nid="btn0001">修改后保存</button></div>\n```',
        extractedHtml: '<div class="profile-card" data-nid="prof0001"><button data-nid="btn0001">修改后保存</button></div>'
      };
    };

    const textarea = container.querySelector('textarea');
    act(() => {
      const nativeSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      nativeSetter?.call(textarea, '修改按钮文字');
      textarea?.dispatchEvent(new Event('input', { bubbles: true }));
      textarea?.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const sendBtn = container.querySelector('button[title*="发送设计诉求"]');
    await act(async () => {
      sendBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
      await confirmLatestModification(container);

    expect(capturedInput).not.toBeNull();
    // 核心断言：已启用引用时，activeScreenId 必须为选中画框 ID！
    expect(capturedInput.activeScreenId).toBe(screenIds[0]);
  });

  test('CHK-F-05: 选中元素时提供元素引用卡片，支持「启用/未启用」状态切换与注入', () => {
    const screens = useProjectStore.getState().screens;
    const screenIds = Object.keys(screens);

    act(() => {
      useProjectStore.getState().setActiveScreen(screenIds[0]);
      useProjectStore.getState().selectNode({
        screenId: screenIds[0],
        nid: 'btn0001',
        tagName: 'button'
      });
    });

    act(() => {
      root.render(React.createElement(ChatDrawer, { onOpenSettings: () => {} }));
    });

    // 应当出现元素引用卡片，初始为「未启用」
    expect(container.textContent).toContain('<button>');
    const elementRefBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('<button>') && b.textContent?.includes('未启用')
    );
    expect(elementRefBtn).toBeDefined();

    // 点击启用元素引用
    act(() => {
      elementRefBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // 元素引用变为「已启用」，且页面引用也联动变为「已启用」
    expect(container.textContent).toContain('已启用');
    expect(useProjectStore.getState().pendingNodeRef).not.toBeNull();
    expect(useProjectStore.getState().pendingNodeRef?.nid).toBe('btn0001');

    // 点击停用元素引用
    const activeElementRefBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('<button>') && b.textContent?.includes('已启用')
    );
    act(() => {
      activeElementRefBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // 变为「未启用」且 pendingNodeRef 被清除
    expect(useProjectStore.getState().pendingNodeRef).toBeNull();
  });
});
