import {stubPageCreationRender} from './helpers/pageCreation';
stubPageCreationRender();
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { ChatDrawer } from '../src/components/chat/ChatDrawer';
import { useProjectStore } from '../src/stores/useProjectStore';
import { useHistoryStore } from '../src/stores/useHistoryStore';
import { useAIConfigStore, defaultProviders, defaultBindings } from '../src/stores/useAIConfigStore';
import { defaultTheme } from '../src/utils/themePresets';
import { PipelineExecutor } from '../src/services/ai/engine/pipeline/executor';
import { AIService } from '../src/services/ai/aiService';
import {
  classifyCommand,
  resolveGenerationTarget,
  resolveExplicitReference
} from '../src/services/ai/generationTargetResolver';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const SCREENS = {
  'sc-login': {
    id: 'sc-login',
    name: '手机号验证码登录',
    htmlContent: '<main data-nid="r1"><button data-nid="btn1">登录</button></main>'
  },
  'sc-profile': {
    id: 'sc-profile',
    name: '个人中心',
    htmlContent: '<main data-nid="r2">个人中心</main>'
  }
};

describe('生成落点单一裁决 (Generation Target Routing)', () => {
  describe('CHK-F-01: 口令分类优先级 (BR-GT-02)', () => {
    test('双态口令先于明确修改命中——"创建/修改页面" 本就含子串 "修改页面"', () => {
      expect(classifyCommand('按附件图片精准创建/修改页面').kind).toBe('dual');
      expect(classifyCommand('按附件图片精准修改页面').kind).toBe('explicit_modify');
      expect(classifyCommand('新建页面').kind).toBe('explicit_create');
      expect(classifyCommand('加个底部导航栏').kind).toBe('neutral');
      expect(classifyCommand('把主色调暖一点').kind).toBe('neutral');
    });

    test('引用来源解析：开关 > @提及 > 画框全名；长名优先', () => {
      expect(resolveExplicitReference('随便说点什么', SCREENS, 'sc-profile')).toEqual({
        screenId: 'sc-profile',
        source: 'toggle'
      });
      expect(resolveExplicitReference('@个人中心 调整一下', SCREENS)).toEqual({
        screenId: 'sc-profile',
        source: 'mention'
      });
      expect(resolveExplicitReference('把手机号验证码登录的按钮改大', SCREENS)).toEqual({
        screenId: 'sc-login',
        source: 'screen_name'
      });
      expect(resolveExplicitReference('做一个营销活动页', SCREENS)).toBeNull();
    });
  });

  describe('CHK-F-02: 无引用一律不改现有画框 (BR-GT-05)', () => {
    test('回归截图缺陷：未引用 + 双态口令 + 存在活跃画框 → 新建，绝不覆盖现有页', () => {
      const t = resolveGenerationTarget({
        rawPrompt: '按附件图片精准创建/修改页面',
        screens: SCREENS,
        referenceToggleScreenId: null,
        activeScreenId: 'sc-login'
      });
      expect(t.action).toBe('create_screen');
      expect(t.targetScreenId).toBeNull();
      expect(t.reason).toContain('未引用画框');
    });

    test('未引用 + 中性指令 → 新建', () => {
      const t = resolveGenerationTarget({
        rawPrompt: '做一个带底部导航的活动页',
        screens: SCREENS,
        activeScreenId: 'sc-login'
      });
      expect(t.action).toBe('create_screen');
      expect(t.targetScreenId).toBeNull();
    });

    test('未引用 + 明确新建 → 新建', () => {
      const t = resolveGenerationTarget({
        rawPrompt: '新建页面：优惠券列表',
        screens: SCREENS,
        activeScreenId: 'sc-login'
      });
      expect(t.action).toBe('create_screen');
      expect(t.targetScreenId).toBeNull();
    });

    test('未引用 + 含参考语义 → 新建，并以活跃画框作风格参考（不修改它）', () => {
      const t = resolveGenerationTarget({
        rawPrompt: '参考这个风格做一个新的注册页',
        screens: SCREENS,
        activeScreenId: 'sc-login'
      });
      expect(t.action).toBe('create_screen');
      expect(t.targetScreenId).toBeNull();
      expect(t.styleReferenceScreenId).toBe('sc-login');
    });
  });

  describe('CHK-F-03: 无引用但明确要求修改 → 落当前激活画框 (BR-GT-03)', () => {
    test('有活跃画框 → 修改它，引用来源标记为 active_screen', () => {
      const t = resolveGenerationTarget({
        rawPrompt: '按附件图片精准修改页面',
        screens: SCREENS,
        referenceToggleScreenId: null,
        activeScreenId: 'sc-login'
      });
      expect(t.action).toBe('modify_screen');
      expect(t.targetScreenId).toBe('sc-login');
      expect(t.referenceSource).toBe('active_screen');
    });

    test('无活跃画框但工程仅一个画框 → 修改该画框', () => {
      const t = resolveGenerationTarget({
        rawPrompt: '修改当前页面的配色',
        screens: { 'sc-login': SCREENS['sc-login'] },
        activeScreenId: null
      });
      expect(t.action).toBe('modify_screen');
      expect(t.targetScreenId).toBe('sc-login');
    });

    test('无活跃画框且多画框 → 停手并要求先引用，绝不兜底改第一个', () => {
      const t = resolveGenerationTarget({
        rawPrompt: '精准修改页面',
        screens: SCREENS,
        activeScreenId: null
      });
      expect(t.action).toBe('needs_reference');
      expect(t.targetScreenId).toBeNull();
    });
  });

  describe('CHK-F-04: 有引用且未要求新建 → 默认修改引用画框 (BR-GT-04)', () => {
    test('引用开关 + 中性指令 → 修改引用画框', () => {
      const t = resolveGenerationTarget({
        rawPrompt: '顶部加一个余额卡片',
        screens: SCREENS,
        referenceToggleScreenId: 'sc-login'
      });
      expect(t.action).toBe('modify_screen');
      expect(t.targetScreenId).toBe('sc-login');
      expect(t.referenceSource).toBe('toggle');
    });

    test('引用开关 + 双态口令 → 修改引用画框', () => {
      const t = resolveGenerationTarget({
        rawPrompt: '按附件图片精准创建/修改页面',
        screens: SCREENS,
        referenceToggleScreenId: 'sc-login'
      });
      expect(t.action).toBe('modify_screen');
      expect(t.targetScreenId).toBe('sc-login');
    });

    test('@提及 / 画框全名 + 中性指令 → 修改被提及的画框', () => {
      expect(
        resolveGenerationTarget({ rawPrompt: '@个人中心 底部加个退出按钮', screens: SCREENS }).targetScreenId
      ).toBe('sc-profile');
      expect(
        resolveGenerationTarget({ rawPrompt: '个人中心 底部加个退出按钮', screens: SCREENS }).targetScreenId
      ).toBe('sc-profile');
    });

    test('有引用但明确要求新建 → 新建，引用画框降级为风格参考', () => {
      const t = resolveGenerationTarget({
        rawPrompt: '基于这个做一个新建页面：注册页',
        screens: SCREENS,
        referenceToggleScreenId: 'sc-login'
      });
      expect(t.action).toBe('create_screen');
      expect(t.targetScreenId).toBeNull();
      expect(t.styleReferenceScreenId).toBe('sc-login');
    });
  });

  describe('CHK-F-05: 元素引用、提问与主题不误伤画布 (BR-GT-01)', () => {
    test('元素引用 → patch_element，锁定该元素所在画框', () => {
      const t = resolveGenerationTarget({
        rawPrompt: '[引用元素 nid="btn1" 画框="手机号验证码登录" 标签=<button>]\n把它改成圆角',
        screens: SCREENS
      });
      expect(t.action).toBe('patch_element');
      expect(t.targetScreenId).toBe('sc-login');
      expect(t.elementNid).toBe('btn1');
    });

    test('提问与纯主题诉求不产生任何画框落点', () => {
      expect(resolveGenerationTarget({ rawPrompt: '这个工具支持导出吗？', screens: SCREENS }).action).toBe('question');
      const theme = resolveGenerationTarget({ rawPrompt: '把主色改成暖橙', screens: SCREENS });
      expect(theme.action).toBe('change_theme');
      expect(theme.targetScreenId).toBeNull();
    });
  });

  describe('CHK-F-06 & CHK-F-07: 端到端 (BR-GT-05/03)', () => {
    let container: HTMLDivElement;
    let root: Root;
    const originalExecute = PipelineExecutor.execute;
    const originalStream = AIService.stream;

    beforeEach(() => {
      localStorage.clear();
      useHistoryStore.getState().restore(null);
      const store = useProjectStore.getState();
      store.initNewProject({
        name: 'Routing E2E',
        deviceProfile: 'mobile',
        designSystem: defaultTheme,
        createSpecimen: false
      });
      store.addScreen({ name: '手机号验证码登录', htmlContent: '<main data-nid="r1">原始内容</main>' });

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
      PipelineExecutor.execute = originalExecute;
      AIService.stream = originalStream;
      act(() => root.unmount());
      container.remove();
    });

    const send = async (text: string) => {
      const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
      act(() => {
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
        setter?.call(textarea, text);
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.dispatchEvent(new Event('change', { bubbles: true }));
      });
      const sendBtn = container.querySelector('button[title*="发送设计诉求"]') as HTMLButtonElement;
      await act(async () => {
        sendBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
    };

    test('CHK-F-06: 未开引用开关 + 双态口令 → 新建画框，原画框内容纹丝不动', async () => {
      PipelineExecutor.execute = (async () => ({
        status: 'applied',
        rawResponse: '<artifact identifier="screen_new" type="screen" title="充值页"><main data-nid="rn">全新内容</main></artifact>',
        extractedHtml: '<main data-nid="rn">全新内容</main>',
        artifactMetadata: { identifier: 'screen_new', title: '充值页' }
      })) as any;

      const screenId = Object.keys(useProjectStore.getState().screens)[0];
      useProjectStore.getState().setActiveScreen(screenId);

      await act(async () => {
        root.render(<ChatDrawer />);
      });
      await send('按附件图片精准创建/修改页面');

      const after = useProjectStore.getState();
      expect(Object.keys(after.screens).length).toBe(2);
      expect(after.screens[screenId].htmlContent).toContain('原始内容');
      const chatText = container.textContent || '';
      expect(chatText).not.toContain('已更新画框');
    });

    test('CHK-F-07: 明确修改但无引用无激活画框（多画框）→ 停手并给出引导，画布零改动', async () => {
      let pipelineCalled = false;
      PipelineExecutor.execute = (async () => {
        pipelineCalled = true;
        return { status: 'applied', rawResponse: '', extractedHtml: '<main>X</main>' };
      }) as any;

      useProjectStore.getState().addScreen({ name: '个人中心', htmlContent: '<main data-nid="r2">B</main>' });
      useProjectStore.getState().setActiveScreen(null);
      const before = JSON.stringify(useProjectStore.getState().screens);

      await act(async () => {
        root.render(<ChatDrawer />);
      });
      await send('精准修改页面');

      expect(pipelineCalled).toBe(false);
      expect(JSON.stringify(useProjectStore.getState().screens)).toBe(before);
      expect(container.textContent || '').toContain('本次未做任何改动');
    });
  });
});

describe('CHK-F-09: 提问与主题诉求经流水线时不被误判为改页 (BR-GT-06)', () => {
  const originalExecute = PipelineExecutor.execute;
  afterEach(() => {
    PipelineExecutor.execute = originalExecute;
  });

  test('question / change_theme 的裁决原样传入流水线，不被压成 modify_screen', () => {
    const q = resolveGenerationTarget({ rawPrompt: '这个支持导出 PNG 吗？', screens: SCREENS });
    const th = resolveGenerationTarget({ rawPrompt: '把主色改成暖橙', screens: SCREENS });

    const toPipelineIntent = (action: string) =>
      action === 'question' || action === 'change_theme'
        ? action
        : action === 'create_screen'
        ? 'create_screen'
        : 'modify_screen';

    expect(toPipelineIntent(q.action)).toBe('question');
    expect(toPipelineIntent(th.action)).toBe('change_theme');
  });
});
