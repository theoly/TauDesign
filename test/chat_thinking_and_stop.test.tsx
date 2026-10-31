import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { ChatDrawer } from '../src/components/chat/ChatDrawer';
import { useAIConfigStore, defaultProviders, defaultBindings } from '../src/stores/useAIConfigStore';
import { AIService } from '../src/services/ai/aiService';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('ChatDrawer: AI Thinking & Collapsible Feedback & Click-to-Stop', () => {
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
    // Ensure active provider has an API key so sending messages doesn't block on warning
    useAIConfigStore.setState({
      providers: defaultProviders.map((p) =>
        p.id === 'prov-deepseek' ? { ...p, apiKey: 'sk-test-key-valid' } : p
      ),
      bindings: defaultBindings
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

  test('collapsible thinking & feedback process can be expanded and collapsed', async () => {
    let mockOnEvent: any;
    let mockAbortCalled = false;

    // Mock AIService.stream
    AIService.stream = (_prov, _mod, _msgs, onEvent) => {
      mockOnEvent = onEvent;
      return {
        abort: () => {
          mockAbortCalled = true;
        },
        promise: new Promise((resolve) => {
          // Delay resolve to test in-flight thinking state
          setTimeout(() => {
            onEvent({ type: 'Delta', text: '这是布局建议。' });
            onEvent({ type: 'Done', finish_reason: 'stop' });
            resolve();
          }, 100);
        })
      };
    };

    act(() => {
      root.render(React.createElement(ChatDrawer, { onOpenSettings: () => {} }));
    });

    const textarea = container.querySelector('textarea');
    expect(textarea).not.toBeNull();

    // Type prompt
    act(() => {
      fireChange(textarea!, '什么是布局？');
    });

    // Find submit button
    const sendBtn = container.querySelector('button[title*="发送设计诉求"]');
    expect(sendBtn).not.toBeNull();

    // Click submit
    await act(async () => {
      sendBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // 1. Verify thinking card appears during generation
    expect(container.textContent).toContain('AI 正在执行请求');
    expect(container.textContent).toContain('核对请求与任务范围');

    // Wait for the stream promise to finish
    await act(async () => {
      await new Promise((r) => setTimeout(r, 150));
    });

    // 2. Once finished, thinking card is in collapsed state (简略展示)
    expect(container.textContent).toContain('AI 思考与反馈过程');
    expect(container.textContent).toContain('展开');

    // Click to expand thinking details
    const toggleBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('AI 思考与反馈过程')
    );
    expect(toggleBtn).toBeDefined();

    act(() => {
      toggleBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // Detailed steps are now visible
    expect(container.textContent).toContain('收起');
    expect(container.textContent).toContain('组装页面、主题与工程上下文');
    expect(container.textContent).toContain('调用模型生成结果');

    // Click again to collapse
    act(() => {
      toggleBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(container.textContent).toContain('展开');
  });

  test('submit button displays loading state during generation and can be clicked to stop', async () => {
    let mockAbortCalled = false;
    let resolveStreamPromise: () => void;

    AIService.stream = (_prov, _mod, _msgs, _onEvent) => {
      return {
        abort: () => {
          mockAbortCalled = true;
        },
        promise: new Promise<void>((resolve) => {
          resolveStreamPromise = resolve;
        })
      };
    };

    act(() => {
      root.render(React.createElement(ChatDrawer, { onOpenSettings: () => {} }));
    });

    const textarea = container.querySelector('textarea');
    act(() => {
      fireChange(textarea!, '做一个登录页面');
    });

    const sendBtn = container.querySelector('button[title*="发送设计诉求"]');
    await act(async () => {
      sendBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // Submit button should now be in loading state
    const stopBtn = container.querySelector('button[title*="点击可立即停止"]');
    expect(stopBtn).not.toBeNull();
    expect(stopBtn?.textContent).toContain('思考中');
    expect(stopBtn?.textContent).toContain('停止');
    expect(stopBtn?.querySelector('.animate-spin')).not.toBeNull();

    // Click the loading/stop button to stop generation
    await act(async () => {
      stopBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      resolveStreamPromise!();
    });

    expect(mockAbortCalled).toBe(true);
    // Assistant message reflects that it was stopped
    expect(container.textContent).toContain('生成已由用户手动停止');

    // The button transitions back to regular send button
    const restoredSendBtn = container.querySelector('button[title*="发送设计诉求"]');
    expect(restoredSendBtn).not.toBeNull();
  });
});
