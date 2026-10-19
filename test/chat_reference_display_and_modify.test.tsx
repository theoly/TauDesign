import { mockModificationAnalysis, confirmLatestModification } from './modification_review_helpers';
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { ChatDrawer } from '../src/components/chat/ChatDrawer';
import { useProjectStore } from '../src/stores/useProjectStore';
import { useAIConfigStore, defaultProviders, defaultBindings } from '../src/stores/useAIConfigStore';
import { defaultTheme } from '../src/utils/themePresets';
import {
  hasExplicitModifyIntent,
  parseReferencedElement,
  extractCleanUserPrompt
} from '../src/services/ai/engine/react/useAIEngineChat';
import { resolveToolFromAIResponse } from '../src/services/tools/toolResolver';
import { AIService } from '../src/services/ai/aiService';
import { PipelineExecutor } from '../src/services/ai/engine/pipeline/executor';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let analysisMock: ReturnType<typeof mockModificationAnalysis>;

describe('对话历史引用展示与修改路由保护 (Chat Reference Display & Modify Guard)', () => {
  let container: HTMLDivElement;
  let root: Root;

  const originalExecute = PipelineExecutor.execute;
  const originalStream = AIService.stream;

  beforeEach(() => {
    analysisMock = mockModificationAnalysis();
    localStorage.clear();
    const store = useProjectStore.getState();
    store.initNewProject({
      name: 'Ref Display Test Project',
      deviceProfile: 'pc',
      designSystem: defaultTheme,
      createSpecimen: false
    });

    store.addScreen({
      name: '测试页面',
      htmlContent: '<main data-nid="root1"><div data-nid="card1"><span>内容</span></div></main>'
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

  describe('CHK-F-01: 显式修改意图判定与工具解析单画框回退', () => {
    test('hasExplicitModifyIntent 正确识别显式修改意图并排除新建意图', () => {
      expect(hasExplicitModifyIntent('按附件图片精准修改页面')).toBe(true);
      expect(hasExplicitModifyIntent('按附件图片修改')).toBe(true);
      expect(hasExplicitModifyIntent('精准修改页面')).toBe(true);
      expect(hasExplicitModifyIntent('修改当前页面')).toBe(true);
      expect(hasExplicitModifyIntent('修改画框')).toBe(true);
      expect(hasExplicitModifyIntent('把标题改成蓝色')).toBe(true);

      // 新建意图必须判定为 false
      expect(hasExplicitModifyIntent('新建页面')).toBe(false);
      expect(hasExplicitModifyIntent('创建新画框')).toBe(false);
      expect(hasExplicitModifyIntent('生成新的个人中心')).toBe(false);
    });

    test('toolResolver 在未传 activeScreenId 但工程仅有单个画框且包含显式修改意图时回退至该画框', () => {
      const screens = useProjectStore.getState().screens;
      const singleScreenId = Object.keys(screens)[0];

      const resolved = resolveToolFromAIResponse({
        rawResponse: '<artifact identifier="screen_new" type="screen" title="修改后的页面"><main data-nid="root1"><h1>新内容</h1></main></artifact>',
        userPrompt: '按附件图片精准修改页面',
        activeScreenId: null, // 未开启画框引用开关
        screens,
        extractedHtml: '<main data-nid="root1"><h1>新内容</h1></main>'
      });

      expect(resolved).not.toBeNull();
      expect(resolved?.tool).toBe('modify_screen');
      expect((resolved?.params as any)?.screenId).toBe(singleScreenId);
    });
  });

  describe('CHK-F-03 & CHK-F-04: 元素引用解析与历史文本清洗', () => {
    test('parseReferencedElement 精准解析元素 nid, 标签与画框名', () => {
      const prompt =
        '[引用元素 nid="njl725bx" 画框="手机登录" 标签=<div>]\n' +
        '元素片段:\n<div class="space-y-4" data-nid="njl725bx">...</div>\n\n' +
        '按附件图片精准修改页面';

      const parsed = parseReferencedElement(prompt);
      expect(parsed).toEqual({
        nid: 'njl725bx',
        screenName: '手机登录',
        tagName: 'div'
      });
    });

    test('extractCleanUserPrompt 完全过滤元素内部 HTML 片段，仅保留用户实际 prompt', () => {
      const prompt =
        '[引用元素 nid="njl725bx" 画框="手机登录" 标签=<div>]\n' +
        '元素片段:\n<div class="space-y-4" data-nid="njl725bx"><svg>...</svg></div>\n\n' +
        '按附件图片精准修改页面';

      const cleaned = extractCleanUserPrompt(prompt);
      expect(cleaned).toBe('按附件图片精准修改页面');
      expect(cleaned).not.toContain('<div');
      expect(cleaned).not.toContain('元素片段:');
      expect(cleaned).not.toContain('njl725bx');
    });

    test('extractCleanUserPrompt 对历史旧格式纯 HTML 元素片段也能安全过滤', () => {
      const legacyPrompt =
        '元素片段:\n<div class="card" data-nid="test01"><p>Old</p></div>\n\n' +
        '把按钮调成圆角';

      const cleaned = extractCleanUserPrompt(legacyPrompt);
      expect(cleaned).toBe('把按钮调成圆角');
      expect(cleaned).not.toContain('<div');
    });
  });

  describe('CHK-F-02 & UI渲染: ChatDrawer 气泡展示徽章且不显示 HTML 源码', () => {
    test('发送带元素引用的消息时，气泡呈现 <div#nid> 徽章且不显示 HTML 源码', async () => {
      PipelineExecutor.execute = (async (args: any) => {
        return {
          rawResponse: '<artifact identifier="screen_1" type="screen" title="页面"><main>OK</main></artifact>',
          extractedHtml: '<main>OK</main>',
          userPrompt: args.input?.rawPrompt,
          modelName: 'mock-model'
        };
      }) as any;

      const store = useProjectStore.getState();
      const screenId = Object.keys(store.screens)[0];
      store.setActiveScreen(screenId);

      // 模拟右键或快捷方式添加元素引用
      store.setPendingNodeRef({
        screenId,
        screenName: '测试页面',
        nid: 'card1',
        tagName: 'div',
        htmlSnippet: '<div data-nid="card1"><span class="ugly-raw-html">内容</span></div>'
      });

      await act(async () => {
        root.render(<ChatDrawer />);
      });

      // 输入框填入“按附件图片精准修改页面”
      const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
      expect(textarea).not.toBeNull();

      act(() => {
        const nativeSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
        nativeSetter?.call(textarea, '按附件图片精准修改页面');
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.dispatchEvent(new Event('change', { bubbles: true }));
      });

      // 查找并点击发送按钮
      const sendBtn = container.querySelector('button[title*="发送设计诉求"]') as HTMLButtonElement;
      expect(sendBtn).not.toBeNull();

      await act(async () => {
        sendBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      await confirmLatestModification(container);

      // 验证渲染结果：用户气泡内应有引用元素徽章，且不包含 ugly-raw-html
      const chatText = container.textContent || '';
      expect(chatText).toContain('引用元素');
      expect(chatText).toContain('<div#card1>');
      expect(chatText).toContain('按附件图片精准修改页面');
      expect(chatText).not.toContain('ugly-raw-html');
      expect(chatText).not.toContain('元素片段:');
    });

    // BR-GT-03/07 调整：未开引用 + 明确修改口令 → 仍落到当前激活画框，
    // 但气泡如实标注「作用于当前画框」，不再谎报为用户引用。
    test('未手动开启引用开关时发送“按附件图片精准修改页面”，落到当前激活画框并如实标注', async () => {
      let executedScreenId: string | null = null;

      PipelineExecutor.execute = (async (args: any) => {
        executedScreenId = args.input?.activeScreenId;
        return {
          rawResponse: '<artifact identifier="screen_1" type="screen" title="修改后的页面"><main>Updated</main></artifact>',
          extractedHtml: '<main>Updated</main>',
          userPrompt: args.input?.rawPrompt,
          modelName: 'mock-model'
        };
      }) as any;

      const store = useProjectStore.getState();
      const screenId = Object.keys(store.screens)[0];
      store.setActiveScreen(screenId);

      await act(async () => {
        root.render(<ChatDrawer />);
      });

      // 确认底栏显示未启用（默认解耦态）
      const refButton = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('测试页面') && b.textContent?.includes('未启用')
      );
      expect(refButton).toBeDefined();

      const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
      act(() => {
        const nativeSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
        nativeSetter?.call(textarea, '按附件图片精准修改页面');
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.dispatchEvent(new Event('change', { bubbles: true }));
      });

      const sendBtn = container.querySelector('button[title*="发送设计诉求"]') as HTMLButtonElement;
      await act(async () => {
        sendBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      await confirmLatestModification(container);

      // 验证：虽然开关未手动开启，但显式修改指令自动将 activeScreenId 注入管道
      expect(executedScreenId).toBe(screenId);

      // 用户气泡如实区分：这是「作用于当前画框」，不是用户主动引用
      const chatText = container.textContent || '';
      expect(chatText).toContain('作用于当前画框');
      expect(chatText).toContain('测试页面');
      expect(chatText).not.toContain('引用画框: @测试页面');
    });

    test('CHK-F-06 & CHK-F-08: 显式修改指令直接更新画框内容，绝不新建画框，气泡准确提示已更新', async () => {
      PipelineExecutor.execute = (async (args: any) => {
        return {
          rawResponse: '<artifact identifier="screen_1" type="screen" title="新内容"><main data-nid="root1"><h1>精准修改后设计</h1></main></artifact>',
          extractedHtml: '<main data-nid="root1"><h1>精准修改后设计</h1></main>',
          userPrompt: args.input?.rawPrompt,
          modelName: 'mock-model'
        };
      }) as any;

      const store = useProjectStore.getState();
      const screenId = Object.keys(store.screens)[0];
      store.renameScreen(screenId, '充值魔方点 (AI 方案)');
      store.setActiveScreen(screenId);

      await act(async () => {
        root.render(<ChatDrawer />);
      });

      const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
      act(() => {
        const nativeSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
        nativeSetter?.call(textarea, '按附件图片精准修改页面');
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.dispatchEvent(new Event('change', { bubbles: true }));
      });

      const sendBtn = container.querySelector('button[title*="发送设计诉求"]') as HTMLButtonElement;
      await act(async () => {
        sendBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      await confirmLatestModification(container);

      const afterState = useProjectStore.getState();
      // 1. 候选方案暂存比选 (BR-SSR-01)
      expect(afterState.stagedScreen).not.toBeNull();
      expect(afterState.stagedScreen?.targetScreenId).toBe(screenId);
      expect(afterState.stagedScreen?.newHtml).toContain('精准修改后设计');

      // 2. 气泡展示并排比选卡片，绝不误报“挂载至画板”
      const chatText = container.textContent || '';
      expect(chatText).toContain('新方案已在右侧画框并排就绪');
      expect(chatText).not.toContain('设计画框已挂载至画板');

      // 3. 点击采纳新版，原画框正式更新
      const adoptBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('采纳新版')
      );
      expect(adoptBtn).toBeDefined();

      await act(async () => {
        adoptBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      const finalState = useProjectStore.getState();
      expect(finalState.screens[screenId].htmlContent).toContain('精准修改后设计');
      expect(finalState.stagedScreen).toBeNull();
      expect(Object.keys(finalState.screens).length).toBe(1);
    });

    test('CHK-F-07: toolResolver 精准支持带空格与括号的 @mention 画框名，且修改意图下绝不被泛词误判为新建', () => {
      const screens = {
        'sc-1': { id: 'sc-1', name: '充值魔方点 (AI 方案)', htmlContent: '<main>Old</main>' },
        'sc-2': { id: 'sc-2', name: '个人中心', htmlContent: '<main>User</main>' }
      };

      // 测试带空格与括号的 @mention
      const resolvedMention = resolveToolFromAIResponse({
        rawResponse: '<artifact identifier="screen_new" type="screen" title="新标题"><main>New</main></artifact>',
        userPrompt: '@充值魔方点 (AI 方案) 按附件图片精准修改页面',
        activeScreenId: null,
        screens,
        extractedHtml: '<main>New</main>'
      });

      expect(resolvedMention).not.toBeNull();
      expect(resolvedMention?.tool).toBe('modify_screen');
      expect((resolvedMention?.params as any)?.screenId).toBe('sc-1');
      expect((resolvedMention?.params as any)?.title).toBe('充值魔方点 (AI 方案)');

      // 测试带有“复刻/生成”但主意图为“修改”时绝不误判为新建
      const resolvedHybrid = resolveToolFromAIResponse({
        rawResponse: '<artifact identifier="screen_new" type="screen" title="新设计"><main>Hybrid</main></artifact>',
        userPrompt: '参考图片复刻并修改当前页面',
        activeScreenId: 'sc-1',
        screens,
        extractedHtml: '<main>Hybrid</main>'
      });

      expect(resolvedHybrid?.tool).toBe('modify_screen');
      expect((resolvedHybrid?.params as any)?.screenId).toBe('sc-1');
    });

    test('CHK-F-09: 点击「回退原版并重新调整」可立即恢复快照并重新发起调整', async () => {
      const store = useProjectStore.getState();
      const screenId = Object.keys(store.screens)[0];

      let callCount = 0;
      let retriedScreenId: string | null = null;
      PipelineExecutor.execute = (async (args: any) => {
        callCount++;
        retriedScreenId = args.input?.activeScreenId;
        return {
          rawResponse: `<artifact identifier="screen_1" type="screen" title="修改版"><main>Run ${callCount}</main></artifact>`,
          extractedHtml: `<main>Run ${callCount}</main>`,
          modelName: 'mock-model'
        };
      }) as any;

      await act(async () => {
        root.render(<ChatDrawer />);
      });

      const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
      act(() => {
        const nativeSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
        nativeSetter?.call(textarea, '按附件图片精准修改页面');
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
      });

      const sendBtn = container.querySelector('button[title*="发送设计诉求"]') as HTMLButtonElement;
      await act(async () => {
        sendBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      await confirmLatestModification(container);

      expect(callCount).toBe(1);
      // 采纳新版候选方案 (BR-SSR-01)
      const adoptBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('采纳新版')
      );
      expect(adoptBtn).toBeDefined();
      await act(async () => {
        adoptBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      expect(useProjectStore.getState().screens[screenId].htmlContent).toContain('Run 1');

      // 查找并点击回退按钮
      const rollbackBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('回退原版并重新调整')
      );
      expect(rollbackBtn).toBeDefined();

      await act(async () => {
        rollbackBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      await confirmLatestModification(container);

      // 验证：重新发起调整，且准确绑定原画框 ID
      expect(callCount).toBe(2);
      expect(retriedScreenId).toBe(screenId);
      // Run 2 作为候选方案暂存供观测比选 (BR-SSR-01)
      expect(useProjectStore.getState().stagedScreen?.newHtml).toContain('Run 2');

      // 采纳 Run 2 候选方案
      useProjectStore.getState().adoptStagedChange();
      expect(useProjectStore.getState().screens[screenId].htmlContent).toContain('Run 2');
    });

    test('CHK-F-14: 纯新建画框即使存在 preActionSnapshot 历史，卡片也必须展示新画框挂载，严禁误报为已更新', async () => {
      PipelineExecutor.execute = (async () => {
        return {
          rawResponse: '<artifact identifier="screen_new" type="screen" title="新画框"><main>New Content</main></artifact>',
          extractedHtml: '<main>New Content</main>',
          artifactMetadata: { identifier: 'screen_new', title: '新画框' },
          modelName: 'mock-model'
        };
      }) as any;

      await act(async () => {
        root.render(<ChatDrawer />);
      });

      const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
      act(() => {
        const nativeSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
        nativeSetter?.call(textarea, '新建页面：活动中心');
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
      });

      const sendBtn = container.querySelector('button[title*="发送设计诉求"]') as HTMLButtonElement;
      await act(async () => {
        sendBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      await confirmLatestModification(container);

      const chatText = container.textContent || '';
      expect(chatText).toContain('设计画框已挂载至画板');
      expect(chatText).not.toContain('已更新画框');
      expect(chatText).not.toContain('已就绪 (内容已覆盖更新)');
    });
  });
});
