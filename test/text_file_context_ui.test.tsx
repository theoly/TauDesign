import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ChatDrawer } from '../src/components/chat/ChatDrawer';
import { useProjectStore } from '../src/stores/useProjectStore';
import { defaultTheme } from '../src/utils/themePresets';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('对话文本文件入口', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    localStorage.clear();
    useProjectStore.getState().initNewProject({ name: '文本附件测试', deviceProfile: 'mobile', designSystem: defaultTheme, createSpecimen: false });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root.render(<ChatDrawer />));
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  test('上传 Markdown 后显示可移除的附件，发送按钮可用', async () => {
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input.accept).toContain('.md');
    const propsKey = Object.keys(input).find((key) => key.startsWith('__reactProps'))!;
    const props = (input as any)[propsKey];
    await act(async () => {
      props.onChange({ target: { files: [new File(['# 页面规范'], 'guide.md', { type: 'text/markdown' })], value: 'guide.md' } });
      await Promise.resolve();
    });
    expect(container.textContent).toContain('guide.md');
    expect(container.querySelector('button[title="发送设计诉求 (Enter)"]')?.hasAttribute('disabled')).toBe(false);
    act(() => (container.querySelector('button[title="移除 guide.md"]') as HTMLButtonElement).click());
    expect(container.querySelector('button[title="发送设计诉求 (Enter)"]')?.hasAttribute('disabled')).toBe(true);
  });

  test('粘贴文本文件拦截默认粘贴并显示附件', async () => {
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    const propsKey = Object.keys(textarea).find((key) => key.startsWith('__reactProps'))!;
    const file = new File(['设计要求'], 'notes.txt', { type: 'text/plain' });
    let prevented = false;
    await act(async () => {
      (textarea as any)[propsKey].onPaste({
        clipboardData: { items: [{ kind: 'file', type: 'text/plain', getAsFile: () => file }] },
        preventDefault: () => { prevented = true; },
        stopPropagation: () => {}
      });
      await Promise.resolve();
    });
    expect(prevented).toBe(true);
    expect(container.textContent).toContain('notes.txt');
  });

  test('剪贴板仅提供 files 列表时仍可读取文本文件', async () => {
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    const propsKey = Object.keys(textarea).find((key) => key.startsWith('__reactProps'))!;
    let prevented = false;
    await act(async () => {
      (textarea as any)[propsKey].onPaste({
        clipboardData: { items: [], files: [new File(['# 规范'], 'fallback.md', { type: 'text/markdown' })] },
        preventDefault: () => { prevented = true; },
        stopPropagation: () => {}
      });
      await Promise.resolve();
    });
    expect(prevented).toBe(true);
    expect(container.textContent).toContain('fallback.md');
  });

  test('路径不存在时显示错误，保留输入且不发送模型请求', async () => {
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    const propsKey = Object.keys(textarea).find((key) => key.startsWith('__reactProps'))!;
    act(() => (textarea as any)[propsKey].onChange({ target: { value: '参考 missing.md 创建页面' } }));
    const send = container.querySelector('button[title="发送设计诉求 (Enter)"]') as HTMLButtonElement;
    await act(async () => { send.click(); await Promise.resolve(); });
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('文件不存在：missing.md');
    expect((container.querySelector('textarea') as HTMLTextAreaElement).value).toContain('missing.md');
  });
});
