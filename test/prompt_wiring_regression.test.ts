import { describe, test, expect } from 'bun:test';
import { PipelineExecutor } from '../src/services/ai/engine/pipeline/executor';
import { DefaultAIEngineCore } from '../src/services/ai/engine/core/aiEngineCore';
import { MockTransport } from '../src/services/ai/engine/transport/mockTransport';
import { EngineMessage } from '../src/services/ai/engine/core/types';
import { minimalistSlateTheme } from '../src/utils/themePresets';
import { AIProviderConfig } from '../src/types/provider';
import { ALL_CRAFT_RULES } from '../src/services/ai/craft';

/**
 * ISSUE-015 回归：
 * 生产链路（useAIEngineChat → PipelineExecutor）此前把一句话字面量当作 System Prompt，
 * PromptBuilder.buildSystemPrompt 只被测试调用过 —— 模型从未收到 Token、类名白名单、
 * DESIGN.md 与明暗模式，只能自行发挥并写死颜色。
 */
describe('ISSUE-015 System Prompt 生产接线与明暗模式', () => {
  const preset = minimalistSlateTheme;
  const mockProvider: AIProviderConfig = {
    id: 'p1',
    name: 'mock',
    protocol: 'openai_compatible',
    baseUrl: 'http://mock',
    apiKey: 'k',
    models: [{ id: 'mock-model-chat', name: 'mock', capabilities: ['chat'] }]
  } as any;

  /** 跑一次管道并截获真正发给模型的 System Prompt */
  const capture = async (colorMode: 'light' | 'dark', rawPrompt = '创建一个用户仪表盘') => {
    const transport = new MockTransport();
    transport.queueResponse(
      '<artifact identifier="s_new" type="screen" title="仪表盘"><section class="p-8"><h1>Hi</h1></section></artifact>'
    );
    const core = new DefaultAIEngineCore(transport);
    let captured: EngineMessage[] = [];
    const spyCore = {
      ...core,
      streamText: (opts: any) => {
        captured = opts.messages;
        return core.streamText(opts);
      },
      generateObject: core.generateObject.bind(core)
    } as any;

    await PipelineExecutor.execute({
      input: { rawPrompt },
      provider: mockProvider,
      model: 'mock-model-chat',
      engineCore: spyCore,
      screens: {},
      deviceProfile: 'pc',
      frameWidth: 1440,
      baseSystemPrompt: '你是一名顶级前端与UI设计系统专家，负责输出高质感现代 Web 设计。',
      designSystem: preset,
      colorMode,
      designTokens: preset.tokens,
      designRules: []
    });

    return captured.find((m) => m.role === 'system')?.content || '';
  };

  test('System Prompt 必须携带设计系统上下文，而不是一句话字面量', async () => {
    const sys = await capture('light');

    // 回归核心：此前这里只有这一句话，其余全部缺失
    expect(sys).toContain('### ROLE & CORE CONSTRAINTS');
    expect(sys).toContain('### DESIGN TOKENS');
    expect(sys).toContain('### CLASS WHITELIST');
    expect(sys).toContain('### DESIGN SPECIFICATION');
    expect(sys).toContain('### OUTPUT CONTRACT');
    for (const rule of ALL_CRAFT_RULES) expect(sys).toContain(rule.body);
    // 白名单必须是真的类名，不是空壳
    expect(sys).toContain('.card');
    expect(sys.length).toBeGreaterThan(2000);
  });

  test('Token 必须按当前明暗模式编译：浅色模式绝不能把深色底值喂给模型', async () => {
    const lightSys = await capture('light');
    const darkSys = await capture('dark');

    const lightBg = preset.tokens.colors.background.light;
    const darkBg = preset.tokens.colors.background.dark;
    expect(lightBg).not.toBe(darkBg);

    expect(lightSys).toContain(`--color-bg: ${lightBg}`);
    expect(lightSys).not.toContain(`--color-bg: ${darkBg}`);

    expect(darkSys).toContain(`--color-bg: ${darkBg}`);
    expect(darkSys).not.toContain(`--color-bg: ${lightBg}`);
  });

  test('System Prompt 必须显式告知当前模式，并禁止写死色值（否则页面无法响应深浅切换）', async () => {
    const lightSys = await capture('light');
    expect(lightSys).toContain('LIGHT mode');
    expect(lightSys).toContain('NEVER hardcode a color literal');
    expect(lightSys).toContain('toggle light/dark');

    const darkSys = await capture('dark');
    expect(darkSys).toContain('DARK mode');
  });

  test('按意图条件注入未回退：新建画框注入 Few-Shot，提问不注入任何美学层 (T-AE-10)', async () => {
    const createSys = await capture('light', '创建一个用户仪表盘');
    expect(createSys).toContain('### REFERENCE EXAMPLE');
    expect(createSys).toContain('### CRAFT REFERENCES');

    const askSys = await capture('light', '这个设计系统的主色是什么？');
    expect(askSys).not.toContain('### REFERENCE EXAMPLE');
  });
});
