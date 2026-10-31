import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { ChatDrawer } from '../src/components/chat/ChatDrawer';
import { QuickPromptsConfigPanel } from '../src/components/settings/QuickPromptsConfigPanel';
import { useProjectStore } from '../src/stores/useProjectStore';
import { useQuickPromptsStore, DEFAULT_BUILTIN_PROMPTS } from '../src/stores/useQuickPromptsStore';
import { useAIConfigStore, defaultProviders, defaultBindings } from '../src/stores/useAIConfigStore';
import { defaultTheme } from '../src/utils/themePresets';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('Chat Quick Prompts (对话快捷输入与分级配置)', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    localStorage.clear();
    // 初始化工程
    const store = useProjectStore.getState();
    store.initNewProject({
      name: 'Quick Prompts Test Project',
      deviceProfile: 'pc',
      designSystem: defaultTheme,
      createSpecimen: false
    });

    useAIConfigStore.setState({
      providers: defaultProviders.map((p) =>
        p.id === 'prov-deepseek' ? { ...p, apiKey: 'sk-test-valid' } : p
      ),
      bindings: defaultBindings
    });

    // 重置全局 prompts
    useQuickPromptsStore.getState().resetGlobalPrompts();

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

  test('CHK-F-01: 对话框上方风格选择标签彻底移除，由快捷输入芯片栏替代', () => {
    act(() => {
      root.render(React.createElement(ChatDrawer, { onOpenSettings: () => {} }));
    });

    // 原风格标签彻底不出现
    expect(container.textContent).not.toContain('极简留白');
    expect(container.textContent).not.toContain('深色毛玻璃');
    expect(container.textContent).not.toContain('温暖大圆角');
    expect(container.textContent).not.toContain('仅本轮生效');

    // 快捷输入芯片栏渲染
    expect(container.textContent).toContain('快捷输入');
    // 包含内置默认快捷短语
    expect(container.textContent).toContain('移动端适配');
    expect(container.textContent).toContain('完善表单');
  });

  test('CHK-F-02: 点击快捷输入芯片可将预设文字快速插入至输入框，且不会触发表单提交', () => {
    act(() => {
      root.render(React.createElement(ChatDrawer, { onOpenSettings: () => {} }));
    });

    const textarea = container.querySelector('textarea');
    expect(textarea).not.toBeNull();
    expect(textarea?.value).toBe('');

    // 找到「移动端适配」芯片按钮
    const promptBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('移动端适配')
    );
    expect(promptBtn).toBeDefined();

    // 点击该芯片
    act(() => {
      promptBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // 文字已插入对话框
    expect(textarea?.value).toContain('请优化移动端小屏幕适配');

    // 核心断言：未触发表单提交/发送
    // 页面不应出现正在生成中或用户发出气泡
    expect(container.textContent).not.toContain('AI 正在生成中');
    expect(container.textContent).not.toContain('AI 正在执行请求');

    // 再次点击另一个快捷短语「完善表单」，应自动追加文字
    const formPromptBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('完善表单')
    );
    act(() => {
      formPromptBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(textarea?.value).toContain('请优化移动端小屏幕适配');
    expect(textarea?.value).toContain('补充表单输入验证状态');
  });

  test('CHK-F-03: 快捷短语包含内置预设', () => {
    const globalPrompts = useQuickPromptsStore.getState().globalPrompts;
    expect(globalPrompts.length).toBeGreaterThanOrEqual(DEFAULT_BUILTIN_PROMPTS.length);
    const titles = globalPrompts.map((p) => p.title);
    expect(titles.some((t) => t.includes('移动端适配'))).toBe(true);
    expect(titles.some((t) => t.includes('优化微质感'))).toBe(true);
    expect(titles.some((t) => t.includes('完善表单'))).toBe(true);
  });

  test('CHK-F-04: 设置面板中可新增当前工程快捷短语（默认 scope = project），保存至当前工程', () => {
    act(() => {
      root.render(React.createElement(QuickPromptsConfigPanel));
    });

    // 填写新短语表单
    const titleInput = container.querySelector('input[type="text"]') as HTMLInputElement;
    const contentInput = container.querySelector('textarea') as HTMLTextAreaElement;
    const submitBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('添加短语')
    );

    expect(titleInput).not.toBeNull();
    expect(contentInput).not.toBeNull();
    expect(submitBtn).toBeDefined();

    act(() => {
      const nativeInputSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      nativeInputSetter?.call(titleInput, '🎯 强化主按钮');
      titleInput.dispatchEvent(new Event('input', { bubbles: true }));
      titleInput.dispatchEvent(new Event('change', { bubbles: true }));

      const nativeTextSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      nativeTextSetter?.call(contentInput, '突出首要 CTA 按钮视觉层级，添加微光反馈');
      contentInput.dispatchEvent(new Event('input', { bubbles: true }));
      contentInput.dispatchEvent(new Event('change', { bubbles: true }));
    });

    // 点击添加短语（默认 scope = 'project'）
    act(() => {
      submitBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // 检查 projectStore 中已包含该短语
    const projectPrompts = useProjectStore.getState().quickPrompts;
    expect(projectPrompts.length).toBe(1);
    expect(projectPrompts[0].title).toBe('🎯 强化主按钮');
    expect(projectPrompts[0].content).toBe('突出首要 CTA 按钮视觉层级，添加微光反馈');
    expect(projectPrompts[0].scope).toBe('project');

    // 面板中当前项目列表应显示此短语
    expect(container.textContent).toContain('🎯 强化主按钮');
    expect(container.textContent).toContain('项目专属');
  });

  test('CHK-F-05: 设置面板中可新增全局通用快捷短语（scope = global），切换工程后依然存在', () => {
    act(() => {
      root.render(React.createElement(QuickPromptsConfigPanel));
    });

    // 切换作用域为全局可用
    const globalScopeBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('全局可用')
    );
    expect(globalScopeBtn).toBeDefined();

    act(() => {
      globalScopeBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const titleInput = container.querySelector('input[type="text"]') as HTMLInputElement;
    const contentInput = container.querySelector('textarea') as HTMLTextAreaElement;
    const submitBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('添加短语')
    );

    expect(titleInput).not.toBeNull();
    expect(contentInput).not.toBeNull();

    act(() => {
      const nativeInputSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      nativeInputSetter?.call(titleInput, '⚡ 全局快捷提示');
      titleInput.dispatchEvent(new Event('input', { bubbles: true }));

      const nativeTextSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      nativeTextSetter?.call(contentInput, '这是一个跨所有工程通用的全局提示词');
      contentInput.dispatchEvent(new Event('input', { bubbles: true }));
    });

    act(() => {
      submitBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // 验证 globalPrompts 包含此条目
    const globalPrompts = useQuickPromptsStore.getState().globalPrompts;
    const found = globalPrompts.find((p) => p.title === '⚡ 全局快捷提示');
    expect(found).toBeDefined();
    expect(found?.scope).toBe('global');

    // 模拟切换/新建另一个工程
    act(() => {
      useProjectStore.getState().initNewProject({
        name: 'Another Project',
        deviceProfile: 'mobile',
        designSystem: defaultTheme,
        createSpecimen: false
      });
    });

    // 新工程自身的 projectPrompts 为空
    expect(useProjectStore.getState().quickPrompts.length).toBe(0);

    // 但全局 prompts 依然存在
    const afterSwitchGlobals = useQuickPromptsStore.getState().globalPrompts;
    expect(afterSwitchGlobals.some((p) => p.title === '⚡ 全局快捷提示')).toBe(true);
  });

  test('CHK-F-06: 修改与删除快捷短语', () => {
    // 先添加一条项目短语
    const store = useProjectStore.getState();
    const item = store.addProjectQuickPrompt({
      title: '旧短语标题',
      content: '旧短语内容'
    });

    act(() => {
      root.render(React.createElement(QuickPromptsConfigPanel));
    });

    expect(container.textContent).toContain('旧短语标题');

    // 点击删除按钮
    const deleteBtn = container.querySelector('button[title="删除该短语"]');
    expect(deleteBtn).not.toBeNull();

    act(() => {
      deleteBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // 短语已从 store 移除
    expect(useProjectStore.getState().quickPrompts.find((p) => p.id === item.id)).toBeUndefined();
    expect(container.textContent).not.toContain('旧短语标题');
  });

  test('CHK-F-07: 快捷输入栏调高且多排折行展示（flex-wrap），限制最多4排，支持上下滚动，禁用左右滚动', () => {
    act(() => {
      root.render(React.createElement(ChatDrawer, { onOpenSettings: () => {} }));
    });

    // 查找包含快捷输入芯片的容器
    const chipsContainer = container.querySelector('div[data-testid="quick-prompts-container"]');
    expect(chipsContainer).not.toBeNull();

    const classNames = chipsContainer?.getAttribute('class') || '';
    // 必须支持折行展示
    expect(classNames).toContain('flex-wrap');
    // 必须支持纵向上下滚动
    expect(classNames).toContain('overflow-y-auto');
    // 必须彻底禁用横向左右滚动
    expect(classNames).toContain('overflow-x-hidden');
    expect(classNames).not.toContain('overflow-x-auto');
    // 限高最多 4 排 (约 118px)
    expect(classNames).toContain('max-h-[118px]');

    // 快捷输入标题与配置入口在独立标头常显
    expect(container.textContent).toContain('快捷输入');
    expect(container.textContent).toContain('配置');
  });
});
