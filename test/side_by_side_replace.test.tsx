import { mockModificationAnalysis, confirmLatestModification } from './modification_review_helpers';
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { useProjectStore } from '../src/stores/useProjectStore';
import { passStagedRenderCheck } from './helpers/stagedQuality';
import { useHistoryStore } from '../src/stores/useHistoryStore';
import { CanvasToolExecutor } from '../src/services/tools/canvasToolExecutor';
import { InfiniteCanvas } from '../src/components/canvas/InfiniteCanvas';
import { ChatDrawer } from '../src/components/chat/ChatDrawer';
import { defaultTheme } from '../src/utils/themePresets';
import { useAIConfigStore, defaultProviders, defaultBindings } from '../src/stores/useAIConfigStore';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let analysisMock: ReturnType<typeof mockModificationAnalysis>;

describe('页面修改并排观测与比选替换 (Side-by-Side Replace) 测试套件', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    analysisMock = mockModificationAnalysis();
    useAIConfigStore.setState({
      providers: defaultProviders.map((p) =>
        p.id === 'prov-deepseek' ? { ...p, apiKey: 'sk-test-valid' } : p
      ),
      bindings: defaultBindings
    });

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    useProjectStore.setState({
      id: 'test-project',
      name: '测试工程',
      settings: {
        deviceProfile: 'mobile',
        frameWidth: 390,
        viewportGuideHeight: 844,
        colorMode: 'light'
      },
      designSystem: defaultTheme,
      screens: {
        'screen-auth': {
          id: 'screen-auth',
          name: '认证信息',
          position: { x: 100, y: 100 },
          htmlContent: '<div data-nid="root-auth" class="auth-page"><h1>认证信息原版</h1></div>',
          measuredHeight: 844
        }
      },
      screenOrder: ['screen-auth'],
      activeScreenId: 'screen-auth',
      stagedScreen: null,
      viewportTransform: { x: 0, y: 0, scale: 1 },
      overrides: {},
      decisions: {},
      components: {},
      assets: {}
    });

    useHistoryStore.setState({
      checkpoints: [],
      past: [],
      future: []
    });
  });

  afterEach(() => {
    analysisMock.mockRestore();
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('CHK-F-01: Mobile 模式下候选画框贴合原画框排布 (frameWidth 390 + gap 40 = 430px 偏移)', async () => {
    useProjectStore.getState().stageScreenChange(
      'screen-auth',
      '<div data-nid="root-cand"><h1>认证信息新版</h1></div>',
      '认证信息 (AI 方案候选)'
    );

    await act(async () => {
      root.render(<InfiniteCanvas />);
    });

    // 找到 staged-screen-preview 画框外层容器
    const stagedScreenEl = container.querySelector('[id="screen-frame-staged-screen-preview"]')
      || container.querySelector('[data-testid="screen-frame-staged-screen-preview"]');

    expect(stagedScreenEl).not.toBeNull();
    // 原画框 x = 100, frameWidth = 390, gapX = 40 => 期望 x = 100 + 390 + 40 = 530px
    const styleAttr = stagedScreenEl?.getAttribute('style') || '';
    expect(styleAttr).toContain('left: 530px');
    expect(styleAttr).toContain('top: 100px');
  });

  it('CHK-F-01b: PC 模式下候选画框贴合原画框排布 (frameWidth 1440 + gap 60 = 1500px 偏移)', async () => {
    useProjectStore.setState({
      settings: {
        deviceProfile: 'pc',
        frameWidth: 1440,
        viewportGuideHeight: 900,
        colorMode: 'light'
      },
      screens: {
        'screen-dashboard': {
          id: 'screen-dashboard',
          name: '数据看板',
          position: { x: 200, y: 150 },
          htmlContent: '<div data-nid="root-dash"><h1>数据看板原版</h1></div>',
          measuredHeight: 900
        }
      },
      screenOrder: ['screen-dashboard'],
      activeScreenId: 'screen-dashboard'
    });

    useProjectStore.getState().stageScreenChange(
      'screen-dashboard',
      '<div data-nid="root-dash-cand"><h1>数据看板新版</h1></div>',
      '数据看板 (AI 方案候选)'
    );

    await act(async () => {
      root.render(<InfiniteCanvas />);
    });

    const stagedScreenEl = container.querySelector('[id="screen-frame-staged-screen-preview"]')
      || container.querySelector('[data-testid="screen-frame-staged-screen-preview"]');

    expect(stagedScreenEl).not.toBeNull();
    // 原画框 x = 200, frameWidth = 1440, gapX = 60 => 期望 x = 200 + 1440 + 60 = 1700px
    const styleAttr = stagedScreenEl?.getAttribute('style') || '';
    expect(styleAttr).toContain('left: 1700px');
    expect(styleAttr).toContain('top: 150px');
  });

  it('CHK-F-02: CanvasToolExecutor.execute({ tool: "modify_screen" }) 默认暂存候选画框并排比选', () => {
    const result = CanvasToolExecutor.execute({
      tool: 'modify_screen',
      params: {
        screenId: 'screen-auth',
        title: '认证信息 (升级版)',
        html: '<div data-nid="root-cand"><h1>认证信息新版候选</h1></div>'
      }
    });

    expect(result.success).toBe(true);
    expect(result.status).toBe('screen_staged');
    expect(result.checkpointId).toBeDefined();

    const store = useProjectStore.getState();
    // 原画框保持原版未受破坏
    expect(store.screens['screen-auth'].htmlContent).toContain('认证信息原版');
    // stagedScreen 处于激活状态
    expect(store.stagedScreen).not.toBeNull();
    expect(store.stagedScreen?.targetScreenId).toBe('screen-auth');
    expect(store.stagedScreen?.newHtml).toContain('认证信息新版候选');
  });

  it('CHK-F-02b: modify_screen 支持 forceInPlace 直接原地更新 (用于强制放行场景)', () => {
    const result = CanvasToolExecutor.execute({
      tool: 'modify_screen',
      params: {
        screenId: 'screen-auth',
        title: '认证信息',
        html: '<div data-nid="root-cand"><h1>强制原地覆盖新版</h1></div>',
        forceInPlace: true
      }
    });

    expect(result.success).toBe(true);
    expect(result.status).toBe('screen_modified');

    const store = useProjectStore.getState();
    // 原画框被直接更新
    expect(store.screens['screen-auth'].htmlContent).toContain('强制原地覆盖新版');
    expect(store.stagedScreen).toBeNull();
  });

  it('CHK-F-04: 采纳新版 (替换原版) 闭环：备份 Checkpoint，更新原画框并清空暂存区', async () => {
    useProjectStore.getState().stageScreenChange(
      'screen-auth',
      '<div data-nid="root-cand"><h1>采纳后的新认证页面</h1></div>',
      '认证信息 (AI 方案候选)'
    );

    passStagedRenderCheck();
    await useProjectStore.getState().adoptStagedChange();

    const store = useProjectStore.getState();
    // 1. 原画框内容被替换为新版
    expect(store.screens['screen-auth'].htmlContent).toContain('采纳后的新认证页面');
    // 2. 暂存候选区清空
    expect(store.stagedScreen).toBeNull();
    // 3. 产生 Checkpoint 备份
    const checkpoints = useHistoryStore.getState().checkpoints;
    expect(checkpoints.some((cp) => cp.label.includes('采纳新版前备份: 认证信息'))).toBe(true);
  });

  it('CHK-F-05: 两版都留闭环：创建新独立画框，原画框保持不变，清空暂存区', async () => {
    const originalHtml = useProjectStore.getState().screens['screen-auth'].htmlContent;

    useProjectStore.getState().stageScreenChange(
      'screen-auth',
      '<div data-nid="root-cand"><h1>新分支页面</h1></div>',
      '认证信息'
    );

    passStagedRenderCheck();
    await useProjectStore.getState().keepBothScreens();

    const store = useProjectStore.getState();
    // 1. 原画框未被改动
    expect(store.screens['screen-auth'].htmlContent).toBe(originalHtml);
    // 2. 新增了一个画框，总数变为 2
    expect(store.screenOrder.length).toBe(2);
    const newScreenId = store.screenOrder[1];
    expect(store.screens[newScreenId].htmlContent).toContain('新分支页面');
    expect(store.screens[newScreenId].metadata?.basedOnScreenId).toBe('screen-auth');
    // 3. 暂存区清空
    expect(store.stagedScreen).toBeNull();
  });

  it('CHK-F-06: 保留原版 (丢弃新方案) 闭环：暂存区清空，原画框与工程完全保持不变', () => {
    const originalHtml = useProjectStore.getState().screens['screen-auth'].htmlContent;

    useProjectStore.getState().stageScreenChange(
      'screen-auth',
      '<div data-nid="root-cand"><h1>将被丢弃的内容</h1></div>',
      '认证信息 (AI 方案候选)'
    );

    useProjectStore.getState().discardStagedChange();

    const store = useProjectStore.getState();
    expect(store.screens['screen-auth'].htmlContent).toBe(originalHtml);
    expect(store.stagedScreen).toBeNull();
  });

  it('CHK-F-07: ChatDrawer 中呈现并排比选卡片与比选操作按钮', async () => {
    useProjectStore.getState().stageScreenChange(
      'screen-auth',
      '<div data-nid="root-cand"><h1>AI 候选方案内容</h1></div>',
      '认证信息'
    );

    await act(async () => {
      root.render(<ChatDrawer isOpen={true} onClose={() => {}} />);
    });

    // 检查是否显示了并排就绪提示
    expect(container.textContent).toContain('新方案已在右侧画框并排就绪');
    expect(container.textContent).toContain('采纳新版 (替换原版)');
    expect(container.textContent).toContain('两版都留');
    expect(container.textContent).toContain('保留原版');
    expect(container.textContent).toContain('交付检查');
    const adopt = Array.from(container.querySelectorAll('button')).find(button => button.textContent?.includes('采纳新版'));
    expect(adopt?.disabled).toBe(true);
  });

  it('CHK-F-03: 结构守卫拦截 (rejected_by_guard) 协同可视化：画布暂存新页面并排展示，支持一键采纳替换', async () => {
    const { PipelineExecutor } = await import('../src/services/ai/engine/pipeline/executor');
    const originalExecute = PipelineExecutor.execute;

    try {
      PipelineExecutor.execute = (async () => {
        return {
          status: 'rejected_by_guard',
          rawResponse: '<artifact identifier="screen_1" type="screen" title="认证信息"><main data-nid="root-new"><h1>大幅重绘的认证页面</h1></main></artifact>',
          extractedHtml: '<main data-nid="root-new"><h1>大幅重绘的认证页面</h1></main>',
          structureDiff: { ok: false, added: ['div', 'div'], removed: ['span'] },
          errorMessage: '结构守卫拦截: 检测到原有节点被非预期修改 (新增 2 处, 丢失 1 处)'
        };
      }) as any;

      await act(async () => {
        root.render(<ChatDrawer isOpen={true} onClose={() => {}} />);
      });

      const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
      act(() => {
        const nativeSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
        nativeSetter?.call(textarea, '参考设计图修改页面');
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.dispatchEvent(new Event('change', { bubbles: true }));
      });

      const sendBtn = container.querySelector('button[title*="发送设计诉求"]') as HTMLButtonElement;
      await act(async () => {
        sendBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      await confirmLatestModification(container);

      const store = useProjectStore.getState();
      // 1. 原画框未被破坏覆盖
      expect(store.screens['screen-auth'].htmlContent).toContain('认证信息原版');
      // 2. 新页面已写入 stagedScreen 暂存比选，在画布原画框右侧并排展示
      expect(store.stagedScreen).not.toBeNull();
      expect(store.stagedScreen?.targetScreenId).toBe('screen-auth');
      expect(store.stagedScreen?.newHtml).toContain('大幅重绘的认证页面');

      // 3. 对话卡片中清晰展示并排比选与结构提醒
      const chatText = container.textContent || '';
      expect(chatText).toContain('新方案已在右侧画框并排就绪');
      expect(chatText).toContain('结构守卫提醒');

      // 4. 结构守卫拦截后只能走明确的强制放行；渲染检查通过后原画框才会更新。
      act(() => passStagedRenderCheck());
      const adoptBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('强制放行并覆盖更新原画框')
      );
      expect(adoptBtn).toBeDefined();
      expect(adoptBtn?.disabled).toBe(false);

      await act(async () => {
        adoptBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      const afterAdoptStore = useProjectStore.getState();
      expect(afterAdoptStore.screens['screen-auth'].htmlContent).toContain('大幅重绘的认证页面');
      expect(afterAdoptStore.stagedScreen).toBeNull();
    } finally {
      PipelineExecutor.execute = originalExecute;
    }
  });
});
