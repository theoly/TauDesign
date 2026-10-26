import { describe, it, expect, beforeEach } from 'bun:test';
import { classifyIntent } from '../src/services/ai/intentClassifier';
import { resolveToolFromAIResponse } from '../src/services/tools/toolResolver';
import { CanvasToolExecutor } from '../src/services/tools/canvasToolExecutor';
import { enrichContext } from '../src/services/ai/engine/context/contextEnricher';
import { useProjectStore } from '../src/stores/useProjectStore';
import { passStagedRenderCheck } from './helpers/stagedQuality';

describe('引用画框下图文修改精准路由测试 (Referenced Screen Image Modify)', () => {
  const existingScreens = {
    'screen-login': {
      id: 'screen-login',
      name: '手机号验证码登录',
      htmlContent: '<main data-nid="root1"><div data-nid="card1"><input data-nid="inp1" placeholder="手机号" /></div></main>',
      position: { x: 100, y: 120 }
    },
    'screen-profile': {
      id: 'screen-profile',
      name: '个人中心',
      htmlContent: '<main data-nid="root2"><h1>个人中心</h1></main>',
      position: { x: 530, y: 120 }
    }
  };

  beforeEach(() => {
    useProjectStore.setState({
      screens: { ...existingScreens },
      activeScreenId: null,
      selectedNids: [],
      stagedScreen: null
    });
  });

  describe('CHK-F-01: classifyIntent 双态口令分流验证', () => {
    it('当开启画框引用 (hasActiveScreen: true) 时，“按附件图片精准创建/修改页面”路由为 modify_screen', () => {
      const result = classifyIntent('按附件图片精准创建/修改页面', true);
      expect(result.intent).toBe('modify_screen');
      expect(result.reason).toContain('按修改执行');
    });

    it('当未开启画框引用 (hasActiveScreen: false) 时，“按附件图片精准创建/修改页面”路由为 create_screen', () => {
      const result = classifyIntent('按附件图片精准创建/修改页面', false);
      expect(result.intent).toBe('create_screen');
      expect(result.reason).toContain('按新建执行');
    });

    it('即使有画框引用，纯新建指令（“新建一个页面”）依然判定为 create_screen', () => {
      const result = classifyIntent('新建一个页面', true);
      expect(result.intent).toBe('create_screen');
    });

    it('未开启画框引用但显式 @个人中心 创建/修改页面 时，路由为 modify_screen', () => {
      const result = classifyIntent('@个人中心 按附件图片精准创建/修改页面', false);
      expect(result.intent).toBe('modify_screen');
    });
  });

  describe('CHK-F-02 & CHK-F-03: resolveToolFromAIResponse 路由验证', () => {
    const rawResponse = '<artifact identifier="screen-login" type="screen" title="手机号验证码登录"><main data-nid="root1"><h1>新版登录</h1></main></artifact>';
    const extractedHtml = '<main data-nid="root1"><h1>新版登录</h1></main>';

    it('CHK-F-02: activeScreenId 有效时，“按附件图片精准创建/修改页面”解析为 modify_screen 且指向当前画框', () => {
      const call = resolveToolFromAIResponse({
        rawResponse,
        userPrompt: '按附件图片精准创建/修改页面',
        activeScreenId: 'screen-login',
        screens: existingScreens,
        extractedHtml,
        artifactMetadata: { identifier: 'screen-login', title: '手机号验证码登录' }
      });

      expect(call).not.toBeNull();
      expect(call?.tool).toBe('modify_screen');
      if (call?.tool === 'modify_screen') {
        expect(call.params.screenId).toBe('screen-login');
        expect(call.params.html).toContain('新版登录');
      }
    });

    it('CHK-F-03: activeScreenId 为 null 时，同一口令“按附件图片精准创建/修改页面”解析为 create_screen', () => {
      const call = resolveToolFromAIResponse({
        rawResponse,
        userPrompt: '按附件图片精准创建/修改页面',
        activeScreenId: null,
        screens: existingScreens,
        extractedHtml,
        artifactMetadata: { identifier: 'screen-login', title: '手机号验证码登录' }
      });

      expect(call).not.toBeNull();
      expect(call?.tool).toBe('create_screen');
    });

    it('CHK-F-05: activeScreenId 有效但用户显式输入“新建列表页”时，解析为 create_screen', () => {
      const call = resolveToolFromAIResponse({
        rawResponse,
        userPrompt: '新建一个活动列表页',
        activeScreenId: 'screen-login',
        screens: existingScreens,
        extractedHtml,
        artifactMetadata: { identifier: 'screen_new', title: '活动列表' }
      });

      expect(call?.tool).toBe('create_screen');
    });
  });

  describe('CHK-F-04: CanvasToolExecutor 与精准原地修改完整闭环 (BR-CR-04)', () => {
    it('执行引用状态下的修改动作，直接原地更新画框内容并记录检查点', async () => {
      useProjectStore.setState({ activeScreenId: 'screen-login' });

      const fullHtml = '<main data-nid="root1"><div data-nid="card1"><h3>新视觉登录</h3></div></main>';
      const call = resolveToolFromAIResponse({
        rawResponse: fullHtml,
        userPrompt: '按附件图片精准创建/修改页面',
        activeScreenId: 'screen-login',
        screens: existingScreens,
        extractedHtml: fullHtml,
        artifactMetadata: { identifier: 'screen-login', title: '手机号验证码登录' }
      });

      expect(call?.tool).toBe('modify_screen');

      // 执行修改工具调用 (BR-SSR-01: 暂存候选方案)
      const execResult = CanvasToolExecutor.execute(call!);
      expect(execResult.success).toBe(true);
      expect(execResult.status).toBe('screen_staged');
      expect(execResult.checkpointId).toBeDefined();

      const store = useProjectStore.getState();
      expect(store.stagedScreen).not.toBeNull();
      expect(store.stagedScreen?.targetScreenId).toBe('screen-login');

      // 采纳新版后正式覆盖
      passStagedRenderCheck();
      await store.adoptStagedChange();
      const afterAdoptStore = useProjectStore.getState();
      expect(afterAdoptStore.screens['screen-login'].htmlContent).toContain('新视觉登录');
      expect(afterAdoptStore.stagedScreen).toBeNull();
    });
  });

  describe('contextEnricher 目标注入验证', () => {
    it('当 intent 为 modify_screen 且 activeScreenId 存在时，注入待修改目标画框当前 HTML 与修改约束', () => {
      const enriched = enrichContext({
        rawPrompt: '按附件图片精准创建/修改页面',
        intent: 'modify_screen',
        activeScreenId: 'screen-login',
        screens: existingScreens,
        deviceProfile: 'mobile',
        frameWidth: 390,
        baseSystemPrompt: 'MOCK_BASE_SYSTEM',
        attachment: {
          name: 'design_ref.png',
          dataUrl: 'data:image/png;base64,mockData'
        }
      });

      const userMsg = enriched.messages.find((m) => m.role === 'user');
      expect(userMsg).toBeDefined();
      const content = userMsg?.content || '';

      // 验证包含了目标画框当前骨架与重要修改约束
      expect(content).toContain('[待修改目标画框当前 HTML]');
      expect(content).toContain('手机号验证码登录');
      expect(content).toContain('[重要修改约束]');
      expect(content).toContain('identifier="screen-login"');
    });

    it('CHK-F-11: 当 intent 为 modify_screen 但未传 activeScreenId 时，多画框工程自动绑定首个画框并注入 HTML', () => {
      const enriched = enrichContext({
        rawPrompt: '按附件图片精准修改页面',
        intent: 'modify_screen',
        activeScreenId: null,
        screens: existingScreens,
        deviceProfile: 'mobile',
        frameWidth: 390,
        baseSystemPrompt: 'MOCK_BASE_SYSTEM'
      });

      const userMsg = enriched.messages.find((m) => m.role === 'user');
      expect(userMsg).toBeDefined();
      const content = userMsg?.content || '';

      expect(content).toContain('[待修改目标画框当前 HTML]');
      expect(content).toContain('手机号验证码登录');
      expect(content).toContain('identifier="screen-login"');
      expect(content).not.toContain('<artifact identifier="screen_new"');
    });
  });

  describe('CHK-F-10, CHK-F-12 & CHK-F-13: 多画框下显式修改意图全链路防护', () => {
    it('CHK-F-10: classifyIntent 对“按附件图片精准修改页面”即使 hasActiveScreen 为 false 依然裁决为 modify_screen', () => {
      const res = classifyIntent('按附件图片精准修改页面', false);
      expect(res.intent).toBe('modify_screen');
      expect(res.reason).toContain('显式修改指令');
    });

    it('CHK-F-12: 多画框下 activeScreenId 为空且模型输出 identifier="screen_new"，toolResolver 仍原地路由至目标画框', () => {
      const call = resolveToolFromAIResponse({
        rawResponse: '<artifact identifier="screen_new" type="screen" title="画框"><main data-nid="root1"><h1>新版界面</h1></main></artifact>',
        userPrompt: '按附件图片精准修改页面',
        activeScreenId: null,
        screens: existingScreens,
        extractedHtml: '<main data-nid="root1"><h1>新版界面</h1></main>',
        artifactMetadata: { identifier: 'screen_new', title: '画框' }
      });

      expect(call).not.toBeNull();
      expect(call?.tool).toBe('modify_screen');
      if (call?.tool === 'modify_screen') {
        expect(call.params.screenId).toBe('screen-login');
        // 确保标题保持现有画框名称，绝不降级为“画框”
        expect(call.params.title).toBe('手机号验证码登录');
      }
    });

    it('CHK-F-13: CanvasToolExecutor 原地修改画框时，严格保护原有画框标题，禁止篡改为“画框”', async () => {
      const res = CanvasToolExecutor.execute({
        tool: 'modify_screen',
        params: {
          screenId: 'screen-login',
          title: '画框',
          html: '<main data-nid="root1"><p>新内容</p></main>'
        }
      });

      expect(res.success).toBe(true);
      expect(res.status).toBe('screen_staged');
      expect(res.screenName).toBe('手机号验证码登录'); // 不被“画框”篡改

      passStagedRenderCheck();
      await useProjectStore.getState().adoptStagedChange();
      const store = useProjectStore.getState();
      expect(store.screens['screen-login'].name).toBe('手机号验证码登录');
      expect(store.screens['screen-login'].htmlContent).toContain('新内容');
    });
  });
});
