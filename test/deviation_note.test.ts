import { describe, it, test, expect } from 'bun:test';
import { extractDeviationNote, extractArtifact } from '../src/services/ai/engine/pipeline/interceptors/streamTransform';
import { enrichContext } from '../src/services/ai/engine/context/contextEnricher';
import { PromptBuilder, ARTIFACT_OUTPUT_CONTRACT } from '../src/services/ai/promptBuilder';
import { techBlueTheme, techIndigoTheme } from '../src/utils/themePresets';
import { MockTransport } from '../src/services/ai/engine/transport/mockTransport';
import { DefaultAIEngineCore } from '../src/services/ai/engine/core/aiEngineCore';
import { PipelineExecutor } from '../src/services/ai/engine/pipeline/executor';
import { AIProviderConfig } from '../src/types/provider';

describe('设计取舍披露与用户裁决 (Deviation Note) — doc/feature/deviation-note', () => {
  describe('CHK-DN-01 & CHK-DN-02: extractDeviationNote 抽取正确性与容错', () => {
    it('CHK-DN-01: 四字段齐全时正确抽取 <deviation-note>', () => {
      const raw = `<artifact identifier="scr_1" type="screen" title="我的">
<div class="card">...</div>
</artifact>
<deviation-note>{"conflict": "参考图三栏导航 vs 项目现有五栏导航", "chosen": "保留现有五栏，避免死链", "alternative": "改为参考图三栏", "alternativeInstruction": "请把底部导航换成喜欢/发现/联谊圈三栏"}</deviation-note>`;

      const note = extractDeviationNote(raw);
      expect(note).toBeDefined();
      expect(note?.conflict).toContain('三栏导航');
      expect(note?.chosen).toContain('保留现有五栏');
      expect(note?.alternative).toContain('三栏');
      expect(note?.alternativeInstruction).toContain('喜欢/发现/联谊圈');

      // 不应污染 artifact 的抽取
      const artifact = extractArtifact(raw);
      expect(artifact?.html).not.toContain('deviation-note');
    });

    it('CHK-DN-02a: 无该标签时静默返回 undefined', () => {
      const raw = `<artifact identifier="scr_1" type="screen" title="我的"><div>ok</div></artifact>`;
      expect(extractDeviationNote(raw)).toBeUndefined();
    });

    it('CHK-DN-02b: 畸形 JSON 时静默返回 undefined，不抛异常', () => {
      const raw = `<artifact>...</artifact><deviation-note>{not valid json}</deviation-note>`;
      expect(() => extractDeviationNote(raw)).not.toThrow();
      expect(extractDeviationNote(raw)).toBeUndefined();
    });

    it('CHK-DN-02c: 缺字段时静默返回 undefined', () => {
      const raw = `<artifact>...</artifact><deviation-note>{"conflict": "x", "chosen": "y"}</deviation-note>`;
      expect(extractDeviationNote(raw)).toBeUndefined();
    });

    it('CHK-DN-02d: 空字符串输入不抛异常', () => {
      expect(extractDeviationNote('')).toBeUndefined();
    });
  });

  describe('CHK-DN-03: hasAttachment=true 时协议文本正确注入', () => {
    it('User Prompt 包含 DEVIATION DISCLOSURE 小节及触发范围/载荷契约关键字', () => {
      const enriched = enrichContext({
        rawPrompt: '参考附件图片精准修改这个页面',
        intent: 'modify_screen',
        activeScreenId: 'scr_1',
        screens: {
          scr_1: { id: 'scr_1', name: '我的', htmlContent: '<div class="card">Old</div>' }
        },
        deviceProfile: 'mobile',
        frameWidth: 390,
        baseSystemPrompt: 'MOCK_SYSTEM_PROMPT',
        attachment: {
          name: 'reference.png',
          dataUrl: 'data:image/png;base64,mockImageContent'
        }
      });

      const content = enriched.messages.find((m) => m.role === 'user')?.content || '';

      expect(content).toContain('DEVIATION DISCLOSURE');
      expect(content).toContain('navigation structure / information architecture');
      expect(content).toContain('already-active project decision');
      expect(content).toContain('mandates reusing');
      expect(content).toContain('<deviation-note>');
      expect(content).toContain('"alternativeInstruction"');
      expect(content).toContain('At most ONE <deviation-note> per response');
    });

    it('System Prompt 的 hasAttachment 分支包含窄口子授权声明，且不改动 ARTIFACT_OUTPUT_CONTRACT 字面量', () => {
      const prompt = PromptBuilder.buildSystemPrompt({
        designSystem: techBlueTheme,
        deviceProfile: 'mobile',
        frameWidth: 390,
        intent: 'create_screen',
        hasAttachment: true
      });

      expect(prompt).toContain('NARROW EXCEPTION (deviation-note)');
      // CHK-DN-N01: ARTIFACT_OUTPUT_CONTRACT 常量本身完整、未被改写地注入
      expect(prompt).toContain(ARTIFACT_OUTPUT_CONTRACT);
    });
  });

  describe('CHK-DN-04: hasAttachment=false 时协议文本不得出现', () => {
    it('无附件的 create_screen 场景，System/User Prompt 均不包含 DEVIATION DISCLOSURE 相关文本', () => {
      const systemPrompt = PromptBuilder.buildSystemPrompt({
        designSystem: techBlueTheme,
        deviceProfile: 'mobile',
        frameWidth: 390,
        intent: 'create_screen'
      });
      expect(systemPrompt).not.toContain('DEVIATION DISCLOSURE');
      expect(systemPrompt).not.toContain('NARROW EXCEPTION (deviation-note)');

      const enriched = enrichContext({
        rawPrompt: '创建一个空白页面',
        intent: 'create_screen',
        activeScreenId: null,
        screens: {},
        deviceProfile: 'mobile',
        frameWidth: 390,
        baseSystemPrompt: 'MOCK_SYSTEM_PROMPT'
      });
      const userContent = enriched.messages.find((m) => m.role === 'user')?.content || '';
      expect(userContent).not.toContain('DEVIATION DISCLOSURE');
      expect(userContent).not.toContain('<deviation-note>');
    });
  });

  describe('CHK-DN-N01 & CHK-DN-N02: 输出契约字面量与提示词字符预算 0 回归', () => {
    it('CHK-DN-N01: ARTIFACT_OUTPUT_CONTRACT 常量保持既有铁律措辞（未新增任何豁免字样）', () => {
      expect(ARTIFACT_OUTPUT_CONTRACT).toContain(
        'Absolutely DO NOT output conversational chatter, greetings, explanations, or markdown code blocks outside or around the <artifact> block.'
      );
    });

    it('CHK-DN-N02: 无附件 create_screen 的 System Prompt 字符预算仍在既有 [10000, 12000] 区间', () => {
      const prompt = PromptBuilder.buildSystemPrompt({
        designSystem: techBlueTheme,
        decisions: [],
        deviceProfile: 'pc',
        frameWidth: 1440,
        intent: 'create_screen'
      });
      expect(prompt.length).toBeGreaterThan(10000);
      expect(prompt.length).toBeLessThan(12000);
    });
  });

  describe('CHK-DN-05: PipelineExecutor 端到端 — deviationNote 只在成功路径挂载', () => {
    const mockProvider: AIProviderConfig = {
      id: 'prov-mock',
      name: 'Mock Provider',
      protocol: 'openai_compatible',
      baseUrl: 'https://api.mock.ai/v1',
      apiKey: 'sk-mock-key',
      isEnabled: true,
      models: [{ id: 'mock-model-chat', name: 'Mock Chat', capabilities: ['chat', 'vision', 'code'] }]
    };

    test('成功路径 (applied)：模型输出含 <deviation-note> 时正确挂载到 output.deviationNote', async () => {
      const mockTransport = new MockTransport();
      mockTransport.queueResponse(
        '<artifact identifier="screen_new" type="screen" title="我的">' +
          '<div class="card p-4">我的页面</div>' +
          '</artifact>' +
          '<deviation-note>{"conflict": "参考图三栏导航 vs 项目现有五栏导航", "chosen": "保留现有五栏，避免死链", "alternative": "改为参考图三栏", "alternativeInstruction": "请把底部导航换成喜欢/发现/联谊圈三栏"}</deviation-note>'
      );
      const engineCore = new DefaultAIEngineCore(mockTransport);

      const output = await PipelineExecutor.execute({
        input: { rawPrompt: '参考附件图片创建我的页面', attachment: { name: 'ref.png', dataUrl: 'data:image/png;base64,AAAA' }, activeScreenId: null },
        provider: mockProvider,
        model: 'mock-model-chat',
        engineCore,
        screens: {},
        deviceProfile: 'mobile',
        frameWidth: 390,
        baseSystemPrompt: 'System Prompt',
        designTokens: techIndigoTheme.tokens,
        designRules: []
      });

      expect(output.status).toBe('applied');
      expect(output.deviationNote).toBeDefined();
      expect(output.deviationNote?.alternativeInstruction).toContain('喜欢/发现/联谊圈');
    });

    test('拦截路径 (rejected_by_guard)：即使原始响应含 <deviation-note>，output.deviationNote 也不得挂载', async () => {
      const complexScreenHtml = `
        <div class="complex">
          <input name="u"/><input name="p"/>
          <section class="cards"><div class="card">1</div><div class="card">2</div><div class="card">3</div></section>
          <button type="submit">提交</button>
        </div>
      `;
      const mockTransport = new MockTransport();
      // 模型严重丢失结构节点，同时附带 deviation-note——守卫应拦截且不挂载取舍披露
      mockTransport.queueResponse(
        '```html\n<div>只剩下一句话</div>\n```' +
          '<deviation-note>{"conflict": "x", "chosen": "y", "alternative": "z", "alternativeInstruction": "w"}</deviation-note>'
      );
      const engineCore = new DefaultAIEngineCore(mockTransport);

      const output = await PipelineExecutor.execute({
        input: { rawPrompt: '调整一下字体', activeScreenId: 'screen-complex' },
        provider: mockProvider,
        model: 'mock-model-chat',
        engineCore,
        screens: { 'screen-complex': { id: 'screen-complex', name: '复杂面板', htmlContent: complexScreenHtml } },
        deviceProfile: 'pc',
        frameWidth: 1440,
        baseSystemPrompt: 'System Prompt',
        designTokens: techIndigoTheme.tokens,
        designRules: []
      });

      expect(output.status).toBe('rejected_by_guard');
      expect(output.deviationNote).toBeUndefined();
    });
  });
});
