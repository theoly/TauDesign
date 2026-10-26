import {stubPageCreationRender} from './helpers/pageCreation';
stubPageCreationRender();
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { ChatDrawer } from '../src/components/chat/ChatDrawer';
import { useProjectStore } from '../src/stores/useProjectStore';
import { useHistoryStore } from '../src/stores/useHistoryStore';
import { useAIConfigStore, defaultProviders, defaultBindings } from '../src/stores/useAIConfigStore';
import { AIService } from '../src/services/ai/aiService';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('Bugfix: AI 画框生成并挂载至画板 (Screen Mounting & Canvas Sync)', () => {
  let container: HTMLDivElement;
  let root: Root;

  const fireChange = (el: HTMLInputElement | HTMLTextAreaElement, val: string) => {
    const nativeSetter = Object.getOwnPropertyDescriptor(
      el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,
      'value'
    )?.set;
    nativeSetter?.call(el, val);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };

  beforeEach(() => {
    localStorage.clear();
    useHistoryStore.setState({ past: [], future: [], checkpoints: [] });

    // Ensure active provider has a valid key
    useAIConfigStore.setState({
      providers: defaultProviders.map((p) =>
        p.id === 'prov-deepseek' ? { ...p, apiKey: 'sk-test-key-valid' } : p
      ),
      bindings: defaultBindings
    });

    // Setup initial project state mimicking initial creation:
    // 1 screen ('screen-1', 风格样张) and activeScreenId: 'screen-1'
    useProjectStore.setState({
      id: 'proj-test-mount',
      name: 'Test Project',
      screens: {
        'screen-1': {
          id: 'screen-1',
          name: '风格样张',
          htmlContent: '<div data-nid="root-001" class="p-4"><h1>风格样张</h1></div>',
          scopedCss: '',
          position: { x: 100, y: 120 },
          width: 390,
          updatedAt: Date.now(),
          metadata: { kind: 'specimen' }
        }
      },
      screenOrder: ['screen-1'],
      activeScreenId: 'screen-1',
      settings: {
        deviceProfile: 'mobile',
        frameWidth: 390,
        colorMode: 'dark',
        autoSave: false
      }
    });

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  const originalStream = AIService.stream;

  afterEach(() => {
    AIService.stream = originalStream;
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  test('当已有选中的画框 (activeScreenId 非空) 时，AI 创建新页面必须成功添加至 screens 与 screenOrder 并更新 activeScreenId', async () => {
    const generatedHtml = `<artifact identifier="login_screen" type="screen" title="手机号登录页">
<div data-nid="login-01" class="card p-6">
  <h1 class="text-xl font-bold">登录</h1>
  <input class="input" placeholder="手机号" />
</div>
</artifact>`;

    AIService.stream = (_prov, _mod, _msgs, onEvent) => {
      return {
        abort: () => {},
        promise: new Promise((resolve) => {
          setTimeout(() => {
            onEvent({ type: 'Delta', text: generatedHtml });
            onEvent({ type: 'Done', finish_reason: 'stop' });
            resolve();
          }, 50);
        })
      };
    };

    act(() => {
      root.render(React.createElement(ChatDrawer, { onOpenSettings: () => {} }));
    });

    // Verify initial store state
    expect(useProjectStore.getState().screenOrder.length).toBe(1);
    expect(useProjectStore.getState().activeScreenId).toBe('screen-1');

    // Type prompt
    const textarea = container.querySelector('textarea');
    expect(textarea).not.toBeNull();
    act(() => {
      fireChange(textarea!, '创建一个登录页面，使用手机号和验证码登录');
    });

    // Send
    const sendBtn = container.querySelector('button[title*="发送设计诉求"]');
    expect(sendBtn).not.toBeNull();
    await act(async () => {
      sendBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // Wait for AI streaming and processing to complete
    await act(async () => {
      await new Promise((r) => setTimeout(r, 200));
    });

    // VERIFY: The new screen MUST be in screens and screenOrder!
    const state = useProjectStore.getState();
    expect(state.screenOrder.length).toBe(2);
    expect(state.screenOrder).toContain('login_screen');

    const newScreen = state.screens['login_screen'];
    expect(newScreen).toBeDefined();
    expect(newScreen.name).toBe('手机号登录页');
    expect(newScreen.htmlContent).toContain('登录');
    // Position should be spaced: 100 + (390 + 120) = 610
    expect(newScreen.position.x).toBe(610);
    // Active screen should switch to the newly created screen
    expect(state.activeScreenId).toBe('login_screen');

    // VERIFY: Chat Drawer renders "已挂载至画板" and "定位画框"
    expect(container.textContent).toContain('设计画框已挂载至画板');
    expect(container.textContent).toContain('定位画框');
  });

  test('若历史消息含有未挂载的 HTML，可点击“一键挂载至画板”成功补挂至画板', async () => {
    // Render ChatDrawer
    act(() => {
      root.render(React.createElement(ChatDrawer, { onOpenSettings: () => {} }));
    });

    // Initially 1 screen
    expect(useProjectStore.getState().screenOrder.length).toBe(1);

    // Mock an unmounted message by triggering a send with non-artifact raw html
    // that gets extracted as htmlOutput
    const rawHtml = `<div data-nid="recovered-01" class="card"><h1>已恢复画框</h1></div>`;

    AIService.stream = (_prov, _mod, _msgs, onEvent) => {
      return {
        abort: () => {},
        promise: new Promise((resolve) => {
          setTimeout(() => {
            onEvent({ type: 'Delta', text: `\`\`\`html\n${rawHtml}\n\`\`\`` });
            onEvent({ type: 'Done', finish_reason: 'stop' });
            resolve();
          }, 30);
        })
      };
    };

    const textarea = container.querySelector('textarea');
    act(() => {
      fireChange(textarea!, '生成一个卡片');
    });

    const sendBtn = container.querySelector('button[title*="发送设计诉求"]');
    await act(async () => {
      sendBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 150));
    });

    // Verify it automatically mounted (the primary fix)
    expect(useProjectStore.getState().screenOrder.length).toBe(2);

    // Now artificially remove the screen from store to simulate an unmounted past message state
    const secondScreenId = useProjectStore.getState().screenOrder[1];
    act(() => {
      useProjectStore.setState((prev) => {
        const nextScreens = { ...prev.screens };
        delete nextScreens[secondScreenId];
        return {
          screens: nextScreens,
          screenOrder: ['screen-1'],
          activeScreenId: 'screen-1'
        };
      });
    });

    expect(useProjectStore.getState().screenOrder.length).toBe(1);

    // Re-render will now detect that the message's screen is not in store
    // and show the "一键挂载至画板" button
    const mountBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('一键挂载至画板')
    );
    expect(mountBtn).toBeDefined();

    // Click "一键挂载至画板"
    await act(async () => {
      mountBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // Screen is recovered!
    expect(useProjectStore.getState().screenOrder.length).toBe(2);
    expect(container.textContent).toContain('设计画框已挂载至画板');
  });
});
