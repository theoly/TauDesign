import { mockModificationAnalysis, confirmLatestModification } from './modification_review_helpers';
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { ChatDrawer } from '../src/components/chat/ChatDrawer';
import { useProjectStore } from '../src/stores/useProjectStore';
import { useAIConfigStore, defaultProviders, defaultBindings } from '../src/stores/useAIConfigStore';
import { defaultTheme } from '../src/utils/themePresets';
import { checkStructureIntegrity } from '../src/services/ai/engine/pipeline/interceptors/guardInterceptor';
import { resolveApplyToolCall } from '../src/services/tools/applyTargetResolver';
import { PipelineContext } from '../src/services/ai/engine/pipeline/types';
import { PipelineExecutor } from '../src/services/ai/engine/pipeline/executor';
import { AIService } from '../src/services/ai/aiService';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let analysisMock: ReturnType<typeof mockModificationAnalysis>;

const ORIGINAL_HTML =
  '<main data-nid="root1"><header data-nid="hd1"><h1>充值魔方点</h1></header>' +
  '<section data-nid="pk1"><div data-nid="p60">60 币</div><div data-nid="p300">300 币</div></section></main>';

const REWRITTEN_HTML =
  '<main data-nid="root1"><header data-nid="hd1"><h1>充值魔方点</h1></header>' +
  '<section data-nid="bal1"><span>当前余额 128</span></section></main>';

function buildContext(overrides: Partial<PipelineContext> = {}): PipelineContext {
  return {
    input: {
      rawPrompt: '按附件图片精准修改页面',
      attachment: { name: 'ref.png', dataUrl: 'data:image/png;base64,AAAA' },
      activeScreenId: 'sc-1'
    },
    intent: 'modify_screen',
    intentReason: 'test',
    hasExplicitStructuralChangeIntent: false,
    targetScreen: {
      id: 'sc-1',
      name: '充值魔方点 (AI 方案)',
      htmlContent: ORIGINAL_HTML,
      isSkeleton: false
    },
    referencedScreens: [],
    unmatchedMentions: [],
    activeRules: [],
    activeDecisions: [],
    assembledMessages: [],
    estimatedChars: 0,
    isContextTrimmed: false,
    warnings: [],
    ...overrides
  };
}

describe('引用画框修改落点路由 (Guard Reject Modify Routing)', () => {
  describe('CHK-F-01 & CHK-F-02: 结构守卫放行边界 (BR-GRM-01)', () => {
    test('CHK-F-01: 带参考图 + “按附件图片精准修改页面” 时守卫放行，不再拦截', () => {
      const res = checkStructureIntegrity(buildContext(), REWRITTEN_HTML);
      expect(res.passed).toBe(true);
      expect(res.reason).toContain('按图精准修改');
    });

    test('CHK-F-01b: “按图修改” / “精准修改” 等同义口令同样放行', () => {
      for (const prompt of ['按图修改这一页', '精准修改本页布局']) {
        const res = checkStructureIntegrity(
          buildContext({
            input: {
              rawPrompt: prompt,
              attachment: { name: 'ref.png', dataUrl: 'data:image/png;base64,AAAA' },
              activeScreenId: 'sc-1'
            }
          }),
          REWRITTEN_HTML
        );
        expect(res.passed).toBe(true);
      }
    });

    test('CHK-F-02: 无参考图的整页重写仍被结构守卫拦截，防护未被削弱', () => {
      const res = checkStructureIntegrity(
        buildContext({
          input: { rawPrompt: '精准修改页面', activeScreenId: 'sc-1' }
        }),
        REWRITTEN_HTML
      );
      expect(res.passed).toBe(false);
      expect(res.structureDiff?.ok).toBe(false);
    });

    test('CHK-F-02b: 带参考图但无按图修改口令时，依然执行结构比对拦截', () => {
      const res = checkStructureIntegrity(
        buildContext({
          input: {
            rawPrompt: '让这个页面更好看一些',
            attachment: { name: 'ref.png', dataUrl: 'data:image/png;base64,AAAA' },
            activeScreenId: 'sc-1'
          }
        }),
        REWRITTEN_HTML
      );
      expect(res.passed).toBe(false);
    });
  });

  describe('CHK-F-03 ~ CHK-F-05: 落点裁决 (BR-GRM-02 / BR-GRM-03)', () => {
    const screens = {
      'sc-1': { id: 'sc-1', name: '充值魔方点 (AI 方案)', htmlContent: ORIGINAL_HTML },
      'sc-2': { id: 'sc-2', name: '个人中心', htmlContent: '<main data-nid="r2">User</main>' }
    };

    test('CHK-F-03: 守卫拦截态以原始引用画框为落点，解析为 modify_screen', () => {
      const call = resolveApplyToolCall({
        html: REWRITTEN_HTML,
        userPrompt: '按附件图片精准修改页面',
        screens,
        referencedScreenId: 'sc-1',
        snapshotScreenId: 'sc-1',
        fallbackScreenId: 'sc-2',
        isGuardRejected: true,
        isModifyIntent: true
      });

      expect(call?.tool).toBe('modify_screen');
      expect((call?.params as any).screenId).toBe('sc-1');
    });

    test('CHK-F-05: 用户诉求为空（旧缺陷以 AI 响应做裁决）时，守卫拦截态仍覆盖原画框而非新建', () => {
      const call = resolveApplyToolCall({
        html: REWRITTEN_HTML,
        userPrompt: '',
        screens,
        referencedScreenId: 'sc-1',
        isGuardRejected: true
      });

      expect(call?.tool).toBe('modify_screen');
      expect((call?.params as any).screenId).toBe('sc-1');
    });

    test('CHK-F-05b: 引用画框 + 显式修改诉求（非守卫态）同样强制覆盖原画框', () => {
      const call = resolveApplyToolCall({
        html: REWRITTEN_HTML,
        userPrompt: '按附件图片精准修改页面',
        screens,
        referencedScreenId: 'sc-1',
        isModifyIntent: true,
        createTitle: '画框 (AI 补挂)'
      });

      expect(call?.tool).toBe('modify_screen');
      expect((call?.params as any).screenId).toBe('sc-1');
    });

    test('CHK-F-04: 无引用画框且为纯新建诉求时，仍按 create_screen 新建并沿用指定标题', () => {
      const call = resolveApplyToolCall({
        html: '<main data-nid="rnew"><h1>全新页面</h1></main>',
        userPrompt: '新建一个营销活动页面',
        screens,
        referencedScreenId: null,
        fallbackScreenId: null,
        createTitle: '营销活动页'
      });

      expect(call?.tool).toBe('create_screen');
      expect((call?.params as any).title).toBe('营销活动页');
    });
  });

  describe('CHK-F-06: 守卫拦截态聊天区交互闭环 (BR-GRM-04 / BR-GRM-05)', () => {
    let container: HTMLDivElement;
    let root: Root;
    const originalExecute = PipelineExecutor.execute;
    const originalStream = AIService.stream;

    beforeEach(() => {
    analysisMock = mockModificationAnalysis();
      localStorage.clear();
      const store = useProjectStore.getState();
      store.initNewProject({
        name: 'Guard Reject Routing Project',
        deviceProfile: 'mobile',
        designSystem: defaultTheme,
        createSpecimen: false
      });
      store.addScreen({ name: '充值魔方点 (AI 方案)', htmlContent: ORIGINAL_HTML });

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

    test('守卫拦截后不出现“一键挂载至画板”，点击强制放行覆盖原画框且不新建页面', async () => {
      PipelineExecutor.execute = (async () => ({
        status: 'rejected_by_guard',
        rawResponse: '<artifact identifier="screen_1" type="screen" title="充值魔方点"></artifact>',
        extractedHtml: REWRITTEN_HTML,
        structureDiff: { ok: false, added: ['bal1'], removed: ['pk1'], changed: [] },
        errorMessage: '结构守卫拦截: 检测到原有节点被非预期修改'
      })) as any;

      const store = useProjectStore.getState();
      const screenId = Object.keys(store.screens)[0];
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

      // 1. 拦截态：不得暴露会新建页面的挂载入口
      const guardText = container.textContent || '';
      expect(guardText).toContain('结构守卫已拦截本次覆盖');
      expect(guardText).not.toContain('一键挂载至画板');
      expect(Object.keys(useProjectStore.getState().screens).length).toBe(1);

      // 2. 点击强制放行
      const forceBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('强制放行并覆盖更新原画框')
      ) as HTMLButtonElement;
      expect(forceBtn).toBeDefined();

      await act(async () => {
        forceBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      // 3. 原画框被原地覆盖，画布无新增画框
      const after = useProjectStore.getState();
      expect(Object.keys(after.screens).length).toBe(1);
      expect(after.screens[screenId].htmlContent).toContain('当前余额 128');

      // 4. 卡片回显为“已更新画框”，绝不误报挂载新建
      const afterText = container.textContent || '';
      expect(afterText).toContain('已更新画框「充值魔方点 (AI 方案)」');
      expect(afterText).not.toContain('设计画框已挂载至画板');
    });
  });
});
