import { describe, test, expect, beforeEach, afterEach, spyOn } from 'bun:test';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { ChatDrawer } from '../src/components/chat/ChatDrawer';
import { useAIConfigStore, defaultProviders, defaultBindings } from '../src/stores/useAIConfigStore';
import { AIService } from '../src/services/ai/aiService';
import { ConversationStore, type ConversationTurn } from '../src/services/storage/conversationStore';
import { AttachmentStore } from '../src/services/storage/attachmentStore';
import { useProjectStore } from '../src/stores/useProjectStore';
import { techBlueTheme } from '../src/utils/themePresets';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('ChatDrawer: Chat Scroll Control & Floating "Latest Content" Button', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    localStorage.clear();
    useAIConfigStore.setState({
      providers: defaultProviders.map((p) =>
        p.id === 'prov-deepseek' ? { ...p, apiKey: 'sk-test-valid-key' } : p
      ),
      bindings: defaultBindings
    });

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

  test('CHK-SC-01 & CHK-SC-03: initial state is at bottom; scrolling up displays floating "最新内容" button', () => {
    act(() => {
      root.render(React.createElement(ChatDrawer, { onOpenSettings: () => {} }));
    });

    // Message list exists
    const scrollContainer = container.querySelector('.overflow-y-auto') as HTMLDivElement;
    expect(scrollContainer).not.toBeNull();

    // Initially at bottom, so floating button should not exist
    let floatBtn = container.querySelector('[data-testid="scroll-to-bottom-btn"]');
    expect(floatBtn).toBeNull();

    // Mock dimensions to simulate scrolling up away from bottom:
    // scrollHeight = 1000, clientHeight = 400, scrollTop = 100 (distance = 500 > 35)
    Object.defineProperty(scrollContainer, 'scrollHeight', { value: 1000, configurable: true });
    Object.defineProperty(scrollContainer, 'clientHeight', { value: 400, configurable: true });
    Object.defineProperty(scrollContainer, 'scrollTop', { value: 100, configurable: true, writable: true });

    act(() => {
      scrollContainer.dispatchEvent(new Event('scroll'));
    });

    // Floating button should now appear
    floatBtn = container.querySelector('[data-testid="scroll-to-bottom-btn"]');
    expect(floatBtn).not.toBeNull();
    expect(floatBtn?.textContent).toContain('最新内容');
  });

  test('CHK-SC-04: clicking floating button scrolls to bottom and hides button', () => {
    act(() => {
      root.render(React.createElement(ChatDrawer, { onOpenSettings: () => {} }));
    });

    const scrollContainer = container.querySelector('.overflow-y-auto') as HTMLDivElement;
    Object.defineProperty(scrollContainer, 'scrollHeight', { value: 1000, configurable: true });
    Object.defineProperty(scrollContainer, 'clientHeight', { value: 400, configurable: true });
    Object.defineProperty(scrollContainer, 'scrollTop', { value: 100, configurable: true, writable: true });

    act(() => {
      scrollContainer.dispatchEvent(new Event('scroll'));
    });

    let floatBtn = container.querySelector('[data-testid="scroll-to-bottom-btn"]') as HTMLButtonElement;
    expect(floatBtn).not.toBeNull();

    // Click floating button
    act(() => {
      floatBtn.click();
    });

    // Button should be hidden now because isAtBottom became true
    floatBtn = container.querySelector('[data-testid="scroll-to-bottom-btn"]') as HTMLButtonElement;
    expect(floatBtn).toBeNull();
  });

  test('CHK-SC-05: dragging or scrolling back to bottom hides floating button', () => {
    act(() => {
      root.render(React.createElement(ChatDrawer, { onOpenSettings: () => {} }));
    });

    const scrollContainer = container.querySelector('.overflow-y-auto') as HTMLDivElement;
    Object.defineProperty(scrollContainer, 'scrollHeight', { value: 1000, configurable: true });
    Object.defineProperty(scrollContainer, 'clientHeight', { value: 400, configurable: true });
    Object.defineProperty(scrollContainer, 'scrollTop', { value: 200, configurable: true, writable: true });

    act(() => {
      scrollContainer.dispatchEvent(new Event('scroll'));
    });

    expect(container.querySelector('[data-testid="scroll-to-bottom-btn"]')).not.toBeNull();

    // Now scroll back down close to bottom: distance = 1000 - 580 - 400 = 20 <= 35
    scrollContainer.scrollTop = 580;
    act(() => {
      scrollContainer.dispatchEvent(new Event('scroll'));
    });

    expect(container.querySelector('[data-testid="scroll-to-bottom-btn"]')).toBeNull();
  });

  test('CHK-SC-02: wheel up event immediately cancels auto-scroll without crashing', () => {
    act(() => {
      root.render(React.createElement(ChatDrawer, { onOpenSettings: () => {} }));
    });

    const scrollContainer = container.querySelector('.overflow-y-auto') as HTMLDivElement;
    expect(() => {
      act(() => {
        const wheelEvent = new WheelEvent('wheel', { deltaY: -100, bubbles: true });
        scrollContainer.dispatchEvent(wheelEvent);
      });
    }).not.toThrow();
  });

  const openProject = (name: string) => useProjectStore.getState().initNewProject({
    name, deviceProfile: 'mobile', designSystem: techBlueTheme, createSpecimen: false
  });
  const turn = (id: string): ConversationTurn => ({
    turnId: id, ts: Date.now(), user: { text: `问题 ${id}` }, assistant: { text: `答复 ${id}` }
  });
  const dimensions = (el: HTMLDivElement) => {
    Object.defineProperty(el, 'scrollHeight', { value: 1000, configurable: true });
    Object.defineProperty(el, 'clientHeight', { value: 400, configurable: true });
    Object.defineProperty(el, 'scrollTop', { value: 0, configurable: true, writable: true });
  };

  test('工程历史异步恢复后即时滚到底部；迟到的图片仅在跟随时继续贴底', async () => {
    openProject('历史恢复');
    let resolve!: (turns: ConversationTurn[]) => void;
    const load = spyOn(ConversationStore.prototype, 'loadRecent').mockImplementation(() => new Promise(r => { resolve = r; }));
    const attachment = spyOn(AttachmentStore.prototype, 'readDataUrl').mockResolvedValue('data:image/png;base64,dGVzdA==');
    try {
      await act(async () => { root.render(<ChatDrawer onOpenSettings={() => {}} />); });
      const el = container.querySelector('.overflow-y-auto') as HTMLDivElement;
      dimensions(el);
      const saved = turn('最新历史'); saved.user.attachments = ['assets/images/history.png'];
      await act(async () => { resolve([saved]); });
      expect(container.textContent).toContain('答复 最新历史');
      expect(el.scrollTop).toBe(600);
      expect(container.querySelector('[data-testid="scroll-to-bottom-btn"]')).toBeNull();
      const image = el.querySelector('img')!;
      expect(image).not.toBeNull();
      Object.defineProperty(el, 'scrollHeight', { value: 1200, configurable: true });
      act(() => { image.dispatchEvent(new Event('load')); });
      expect(el.scrollTop).toBe(800);
      el.scrollTop = 100;
      act(() => { el.dispatchEvent(new Event('scroll')); });
      Object.defineProperty(el, 'scrollHeight', { value: 1400, configurable: true });
      act(() => { image.dispatchEvent(new Event('load')); });
      expect(el.scrollTop).toBe(100);
      expect(container.querySelector('[data-testid="scroll-to-bottom-btn"]')).not.toBeNull();
    } finally { load.mockRestore(); attachment.mockRestore(); }
  });

  test('等长会话切换工程后仍重新恢复并定位最新', async () => {
    openProject('工程A');
    const load = spyOn(ConversationStore.prototype, 'loadRecent').mockResolvedValue([turn('A')]);
    try {
      await act(async () => { root.render(<ChatDrawer onOpenSettings={() => {}} />); });
      const el = container.querySelector('.overflow-y-auto') as HTMLDivElement;
      dimensions(el);
      el.scrollTop = 100;
      act(() => { el.dispatchEvent(new Event('scroll')); });
      load.mockResolvedValue([turn('B')]);
      await act(async () => { openProject('工程B'); });
      expect(load).toHaveBeenCalledTimes(2);
      expect(container.textContent).toContain('答复 B');
      expect(container.textContent).not.toContain('答复 A');
      expect(el.scrollTop).toBe(600);
      expect(container.querySelector('[data-testid="scroll-to-bottom-btn"]')).toBeNull();
    } finally { load.mockRestore(); }
  });

  test('快速切换工程时忽略旧工程迟到的恢复结果', async () => {
    openProject('慢工程');
    let resolveOld!: (turns: ConversationTurn[]) => void;
    const load = spyOn(ConversationStore.prototype, 'loadRecent')
      .mockImplementationOnce(() => new Promise(r => { resolveOld = r; }))
      .mockResolvedValue([turn('新工程')]);
    try {
      await act(async () => { root.render(<ChatDrawer onOpenSettings={() => {}} />); });
      await act(async () => { openProject('快工程'); });
      await act(async () => { resolveOld([turn('旧工程')]); });
      expect(container.textContent).toContain('答复 新工程');
      expect(container.textContent).not.toContain('答复 旧工程');
    } finally { load.mockRestore(); }
  });
});
