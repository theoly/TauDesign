import { describe, test, expect, beforeEach } from 'bun:test';
import { MockTransport } from '../src/services/ai/engine/transport/mockTransport';
import { DefaultAIEngineCore } from '../src/services/ai/engine/core/aiEngineCore';
import { PipelineExecutor } from '../src/services/ai/engine/pipeline/executor';
import { enrichContext } from '../src/services/ai/engine/context/contextEnricher';
import { resolveMentions } from '../src/services/ai/engine/context/mentionResolver';
import { htmlSkeletonize } from '../src/services/ai/engine/context/htmlSkeleton';
import { extractTokensWithEngine, EXTRACTED_STYLE_SCHEMA } from '../src/services/ai/visionTokenExtract';
import { AIProviderConfig } from '../src/types/provider';
import { techIndigoTheme } from '../src/utils/themePresets';

describe('AI Engine & Pipeline Suite (Layer 1 ~ Layer 4)', () => {
  const mockProvider: AIProviderConfig = {
    id: 'prov-mock',
    name: 'Mock Provider',
    protocol: 'openai_compatible',
    baseUrl: 'https://api.mock.ai/v1',
    apiKey: 'sk-mock-key',
    enabled: true,
    models: [
      {
        id: 'mock-model-chat',
        name: 'Mock Chat',
        capabilities: ['chat', 'vision', 'code']
      }
    ]
  };

  const defaultScreens: Record<string, any> = {
    'screen-home': {
      id: 'screen-home',
      name: '首页',
      htmlContent: '<main class="container-max p-6"><nav class="navbar"><button class="btn-primary">探索</button></nav><div class="grid"><div class="card p-4"><h3>推荐</h3></div></div></main>'
    },
    'screen-detail': {
      id: 'screen-detail',
      name: '商品详情页',
      htmlContent: '<div class="product-page"><h1 class="title">商品标题</h1><button class="btn-buy">立即购买</button><button class="btn-cart">加入购物车</button></div>'
    }
  };

  test('Branch 1: 新建画框 (create_screen) 完整流转', async () => {
    const mockTransport = new MockTransport();
    mockTransport.queueResponse('```html\n<section class="container-max p-8"><h1 class="text-3xl font-bold">用户仪表盘</h1></section>\n```');

    const engineCore = new DefaultAIEngineCore(mockTransport);

    const output = await PipelineExecutor.execute({
      input: {
        rawPrompt: '创建高端数据看板'
      },
      provider: mockProvider,
      model: 'mock-model-chat',
      engineCore,
      screens: defaultScreens,
      deviceProfile: 'pc',
      frameWidth: 1440,
      baseSystemPrompt: 'System Prompt',
      designTokens: techIndigoTheme.tokens,
      designRules: []
    });

    expect(output.status).toBe('applied');
    expect(output.extractedHtml).toContain('<section class="container-max p-8">');
    expect(output.extractedHtml).toContain('用户仪表盘');
    expect(output.changeSet?.screens).toBeDefined();
    expect((output.changeSet?.screens as any[])[0].action).toBe('created');
  });

  test('Branch 2: 修改画框 (modify_screen) 原画框 HTML 注入与并排候选 (ISSUE-011 & D17)', async () => {
    const mockTransport = new MockTransport();
    mockTransport.queueResponse('```html\n<div class="product-page"><h1 class="title">豪华版商品</h1><button class="btn-buy bg-red-500">立即购买</button><button class="btn-cart">加入购物车</button></div>\n```');

    const engineCore = new DefaultAIEngineCore(mockTransport);

    // 1. Verify context enricher explicitly includes target_screen_current_html
    const enriched = enrichContext({
      rawPrompt: '把购买按钮改成红色高亮',
      intent: 'modify_screen',
      activeScreenId: 'screen-detail',
      screens: defaultScreens,
      deviceProfile: 'pc',
      frameWidth: 1440,
      baseSystemPrompt: 'System Prompt',
      decisions: []
    });

    expect(enriched.targetScreen?.id).toBe('screen-detail');
    expect(enriched.messages[1].content).toContain('[待修改目标画框当前 HTML]');
    expect(enriched.messages[1].content).toContain('立即购买');

    // 2. Execute pipeline and verify D17 side-by-side candidate staging
    const output = await PipelineExecutor.execute({
      input: {
        rawPrompt: '把购买按钮改成红色高亮',
        activeScreenId: 'screen-detail'
      },
      provider: mockProvider,
      model: 'mock-model-chat',
      engineCore,
      screens: defaultScreens,
      deviceProfile: 'pc',
      frameWidth: 1440,
      baseSystemPrompt: 'System Prompt',
      designTokens: techIndigoTheme.tokens,
      designRules: []
    });

    expect(output.status).toBe('staged_side_by_side');
    expect(output.stagedScreen).toBeDefined();
    expect(output.stagedScreen?.targetOriginalId).toBe('screen-detail');
    expect(output.stagedScreen?.name).toContain('AI 调整候选');
    expect(output.stagedScreen?.htmlContent).toContain('豪华版商品');
  });

  test('Branch 3: 结构守卫拦截大面积误删 (StructureGuard rejection & ISSUE-011 防御)', async () => {
    const complexScreenHtml = `
      <div class="dashboard p-8">
        <header><input type="search" /><button>搜索</button><button>通知</button></header>
        <section class="cards"><div class="card">1</div><div class="card">2</div><div class="card">3</div></section>
        <form><input name="u"/><input name="p"/><button type="submit">提交</button></form>
      </div>
    `;

    const screensWithComplex = {
      'screen-complex': {
        id: 'screen-complex',
        name: '复杂面板',
        htmlContent: complexScreenHtml
      }
    };

    const mockTransport = new MockTransport();
    // 保留主操作以单独验证结构守卫；主操作丢失由更早的质量守卫阻断。
    mockTransport.queueResponse('```html\n<div>只剩下一句话<button type="submit">提交</button></div>\n```');

    const engineCore = new DefaultAIEngineCore(mockTransport);

    const output = await PipelineExecutor.execute({
      input: {
        rawPrompt: '调整一下字体',
        activeScreenId: 'screen-complex'
      },
      provider: mockProvider,
      model: 'mock-model-chat',
      engineCore,
      screens: screensWithComplex,
      deviceProfile: 'pc',
      frameWidth: 1440,
      baseSystemPrompt: 'System Prompt',
      designTokens: techIndigoTheme.tokens,
      designRules: []
    });

    // Guard should catch critical structural node deletions and reject direct apply
    expect(output.status).toBe('rejected_by_guard');
    expect(output.structureDiff).toBeDefined();
    expect(output.errorMessage).toContain('结构守卫');
    expect(output.extractedHtml).toBeDefined(); // Retained for manual force apply
  });

  test('Branch 4: @ 实体引用解析与骨架投影注入 (ISSUE-012)', () => {
    const prompt = '参考 @首页 的导航栏风格，为 @商品详情页 设计一个配套的结账页，同时参考 @不存在的页面';
    const resolution = resolveMentions(prompt, defaultScreens);

    expect(resolution.referencedScreens.length).toBe(2);
    expect(resolution.referencedScreens.map((s) => s.name)).toEqual(['首页', '商品详情页']);
    expect(resolution.unmatchedMentions).toEqual(['不存在的页面']);

    // Check skeleton generation
    const skeleton = htmlSkeletonize(defaultScreens['screen-home'].htmlContent);
    expect(skeleton).toContain('class="container-max p-6"');
    expect(skeleton).toContain('class="navbar"');
    expect(skeleton).toContain('class="btn-primary"');
  });

  test('Branch 5: 主题调整意图分发 (change_theme)', async () => {
    const mockTransport = new MockTransport();
    mockTransport.queueResponse('我已为您调整圆角预设。');

    const engineCore = new DefaultAIEngineCore(mockTransport);

    const output = await PipelineExecutor.execute({
      input: {
        rawPrompt: '把全工程圆角改大一点'
      },
      provider: mockProvider,
      model: 'mock-model-chat',
      engineCore,
      screens: defaultScreens,
      deviceProfile: 'pc',
      frameWidth: 1440,
      baseSystemPrompt: 'System Prompt',
      designTokens: techIndigoTheme.tokens,
      designRules: []
    });

    expect(output.status).toBe('theme_proposed');
    expect(output.themeProposal).toBeDefined();
    expect(output.themeProposal?.label).toContain('圆角');
  });

  test('Branch 6: 纯问答咨询意图分发 (question)', async () => {
    const mockTransport = new MockTransport();
    mockTransport.queueResponse('本设计系统遵循 4px 基准网格，按钮常规圆角为 8px，主强调色为科技蓝 #3b82f6。');

    const engineCore = new DefaultAIEngineCore(mockTransport);

    const output = await PipelineExecutor.execute({
      input: {
        rawPrompt: '请问我们工程的基准间距和主色是什么？'
      },
      provider: mockProvider,
      model: 'mock-model-chat',
      engineCore,
      screens: defaultScreens,
      deviceProfile: 'pc',
      frameWidth: 1440,
      baseSystemPrompt: 'System Prompt',
      designTokens: techIndigoTheme.tokens,
      designRules: []
    });

    expect(output.status).toBe('answered_question');
    expect(output.extractedHtml).toBeUndefined(); // No html code block
    expect(output.rawResponse).toContain('4px 基准网格');
  });

  test('Branch 7: 结构化抽取消费 generateObject 与脏值安全过滤 (T-CH-17 & T-CH-18)', async () => {
    const mockTransport = new MockTransport();
    mockTransport.queueResponse(
      JSON.stringify({
        primary: '#2563eb',
        background: '#ffffff',
        surface: '#f8fafc',
        textPrimary: '#0f172a',
        radiusMd: '12px',
        density: 'compact',
        borderAlpha: 0.85,
        shadowStrength: 'medium',
        isDark: false,
        invalidProp: 'ignored'
      })
    );

    const engineCore = new DefaultAIEngineCore(mockTransport);

    const extracted = await extractTokensWithEngine(
      engineCore,
      mockProvider,
      'mock-model-chat',
      'data:image/png;base64,mockImageData'
    );

    expect(extracted).not.toBeNull();
    expect(extracted?.primary).toBe('#2563eb');
    expect(extracted?.radiusMd).toBe('12px');
    expect(extracted?.density).toBe('compact');
    expect(extracted?.borderAlpha).toBe(0.85);
    expect(extracted?.shadowStrength).toBe('medium');
    expect(extracted?.isDark).toBe(false);
  });

  test('Branch 8: 消费 <artifact> 标签元数据自动命名画框 (CHK-OD-16)', async () => {
    const mockTransport = new MockTransport();
    mockTransport.queueResponse(
      '<artifact identifier="screen_custom_001" type="screen" title="高端企业看板">\n<section class="container-max p-8"><h1>看板内容</h1></section>\n</artifact>'
    );

    const engineCore = new DefaultAIEngineCore(mockTransport);

    const output = await PipelineExecutor.execute({
      input: {
        rawPrompt: '生成高端企业看板'
      },
      provider: mockProvider,
      model: 'mock-model-chat',
      engineCore,
      screens: defaultScreens,
      deviceProfile: 'pc',
      frameWidth: 1440,
      baseSystemPrompt: 'System Prompt'
    });

    expect(output.status).toBe('applied');
    expect(output.artifactMetadata?.identifier).toBe('screen_custom_001');
    expect(output.artifactMetadata?.title).toBe('高端企业看板');
    expect(output.artifactMetadata?.isFallback).toBe(false);

    // 画框自动命名为标签中的 title
    const createdScreen = (output.changeSet?.screens as any[])[0];
    expect(createdScreen.id).toBe('screen_custom_001');
    expect(createdScreen.name).toBe('高端企业看板');
  });
});
