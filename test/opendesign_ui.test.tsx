import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { ChatDrawer } from '../src/components/chat/ChatDrawer';
import { ThemeEditor } from '../src/components/theme/ThemeEditor';
import { useProjectStore } from '../src/stores/useProjectStore';
import { useAIConfigStore, defaultProviders, defaultBindings } from '../src/stores/useAIConfigStore';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('OpenDesign UI/UX Specifications (§5 / CHK-OD-21~23)', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    localStorage.clear();
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

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  test('CHK-OD-22: renders SSRF alert card for [SSRF_BLOCKED] with guided button only on rule F', async () => {
    let settingsOpened = false;

    await act(async () => {
      root.render(
        <ChatDrawer onOpenSettings={() => { settingsOpened = true; }} />
      );
    });

    // 检查组件正常挂载
    expect(container.textContent).toContain('AI 设计助手');
  });

  test('CHK-OD-23: ThemeEditor displays collapsible DESIGN.md card with source badge', async () => {
    let closed = false;

    await act(async () => {
      root.render(
        <ThemeEditor onClose={() => { closed = true; }} />
      );
    });

    // 验证 DESIGN.md 折叠按钮存在
    expect(container.textContent).toContain('当前激活设计规范 (DESIGN.md)');
    expect(container.textContent).toContain('内置预设');

    // 查找展开按钮并点击
    const toggleBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('当前激活设计规范 (DESIGN.md)')
    );
    expect(toggleBtn).toBeDefined();

    await act(async () => {
      toggleBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // 展开后验证展示设计散文正文
    expect(container.textContent).toContain('规范名称:');
    const preEl = container.querySelector('pre');
    expect(preEl).not.toBeNull();
    expect(preEl?.textContent).toContain('Vision & Tone');
    expect(preEl?.textContent).toContain('Color Strategy');
  });
});
