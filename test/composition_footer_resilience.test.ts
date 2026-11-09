import { describe, test, expect } from 'bun:test';
import { parsePageComposition, pageCompositionSchema, buildCompositionShell, type PageComposition } from '../src/services/ai/pageComposition';
import { generateTaskPage, compileSectionPlan } from '../src/services/ai/pageTaskGeneration';
import { choosePageWriteStrategy } from '../src/services/ai/generationStrategy';
import { safeJsonParse, extractJsonPayload } from '../src/services/ai/structuredOutput';
import { DefaultAIEngineCore } from '../src/services/ai/engine/core/aiEngineCore';
import { MockTransport } from '../src/services/ai/engine/transport/mockTransport';
import { TaskBudget } from '../src/services/ai/taskBudget';
import type { PageTaskPlan } from '../src/services/ai/pageTaskPlan';

describe('Page Composition Footer Resilience Suite (BR-CFR-01 ~ BR-CFR-03)', () => {
  const mockPlan: PageTaskPlan = {
    goal: '高端官网页面',
    features: [
      { id: 'f1', title: '顶部导航', change: 'add', basis: 'user', sourceIds: [], information: [], interactions: [], states: [] },
      { id: 'f2', title: 'Banner展示', change: 'add', basis: 'user', sourceIds: [], information: [], interactions: [], states: [] },
      { id: 'f3', title: '产品特色', change: 'add', basis: 'user', sourceIds: [], information: [], interactions: [], states: [] },
      { id: 'f4', title: '客户评价', change: 'add', basis: 'user', sourceIds: [], information: [], interactions: [], states: [] },
      { id: 'f5', title: '新闻动态', change: 'add', basis: 'user', sourceIds: [], information: [], interactions: [], states: [] },
      { id: 'f6', title: '联系我们', change: 'add', basis: 'user', sourceIds: [], information: [], interactions: [], states: [] }
    ],
    questions: []
  };

  test('CHK-F-01: PC 端传入 footer: cta 时，parsePageComposition 自动容灾降级为 flow 不抛异常', () => {
    const rawComposition: PageComposition = {
      version: 1,
      layout: 'flow',
      footer: 'cta', // 模型在 PC 端返回了 cta
      regions: [
        { id: 'section-1', role: 'header', featureIds: ['f1'] },
        { id: 'section-2', role: 'main', featureIds: ['f2', 'f3', 'f4', 'f5'] },
        { id: 'section-3', role: 'footer', featureIds: ['f6'] }
      ]
    };

    const parsed = parsePageComposition(rawComposition, mockPlan, 'pc');
    expect(parsed.footer).toBe('flow'); // 自动平滑修正为 flow
    expect(parsed.layout).toBe('flow');
    expect(parsed.regions).toHaveLength(3);

    // 骨架中不含移动端吸底 cta-fixed
    const shell = buildCompositionShell(parsed, 'pc');
    expect(shell).not.toContain('cta-fixed');
    expect(shell).toContain('container-max');
  });

  test('CHK-F-02: 移动端但无 footer 角色区域时传入 footer: cta，自动规范化为 flow', () => {
    const rawComposition: PageComposition = {
      version: 1,
      layout: 'flow',
      footer: 'cta',
      regions: [
        { id: 'section-1', role: 'header', featureIds: ['f1'] },
        { id: 'section-2', role: 'main', featureIds: ['f2', 'f3', 'f4', 'f5', 'f6'] }
      ]
    };

    const parsed = parsePageComposition(rawComposition, mockPlan, 'mobile');
    expect(parsed.footer).toBe('flow');
  });

  test('CHK-F-03: 移动端且声明了 footer 角色区域时，footer: cta 正常生效并注入 cta-fixed', () => {
    const rawComposition: PageComposition = {
      version: 1,
      layout: 'flow',
      footer: 'cta',
      regions: [
        { id: 'section-1', role: 'main', featureIds: ['f1', 'f2', 'f3', 'f4', 'f5'] },
        { id: 'section-2', role: 'footer', featureIds: ['f6'] }
      ]
    };

    const parsed = parsePageComposition(rawComposition, mockPlan, 'mobile');
    expect(parsed.footer).toBe('cta');
    const shell = buildCompositionShell(parsed, 'mobile');
    expect(shell).toContain('cta-fixed');
  });

  test('CHK-F-04: pageCompositionSchema(device) 按设备生成收敛的 footer 枚举', () => {
    const pcSchema: any = pageCompositionSchema('pc');
    expect(pcSchema.properties.footer.enum).toEqual(['flow']);

    const mobileSchema: any = pageCompositionSchema('mobile');
    expect(mobileSchema.properties.footer.enum).toEqual(['flow', 'cta']);
  });

  test('CHK-F-05: generateTaskPage 在 PC 端接收到模型的 footer: cta 响应时，平滑完成整页写入而不崩溃', async () => {
    const strategy = choosePageWriteStrategy({
      plan: mockPlan,
      estimatedHtmlBytes: 50000,
      requested: 'patch'
    });
    expect(strategy.mode).toBe('SectionedPatch');

    const transport = new MockTransport();
    // 模拟布局调用返回带有 footer: cta 的非法 PC 布局
    const badPcComposition = {
      version: 1,
      layout: 'flow',
      footer: 'cta',
      regions: [
        { id: 'section-1', role: 'header', featureIds: ['f1'] },
        { id: 'section-2', role: 'main', featureIds: ['f2', 'f3', 'f4', 'f5'] },
        { id: 'section-3', role: 'footer', featureIds: ['f6'] }
      ]
    };
    transport.queueResponse(JSON.stringify(badPcComposition));
    // 模拟接下来三个区域的返回
    transport.queueResponse('<artifact type="screen"><header>导航</header></artifact>');
    transport.queueResponse('<artifact type="screen"><section>主体内容</section></artifact>');
    transport.queueResponse('<artifact type="screen"><footer>底部版权</footer></artifact>');

    const core = new DefaultAIEngineCore({
      id: 'test-core',
      stream: (req, evt) => transport.stream(req, evt)
    });

    const budget = new TaskBudget({
      maxRequests: 5,
      maxRequestedOutputTokens: 16000,
      maxDurationMs: 900000,
      maxRequestDurationMs: 900000
    });

    const provider = { id: 'test', name: 'test', protocol: 'openai_compatible' as const, baseUrl: 'http://mock', apiKey: 'test' };
    const result = await generateTaskPage(core, { provider, model: 'test', messages: [{ role: 'user', content: '设计Kmxx官网' }] }, {
      request: '设计Kmxx官网',
      strategy,
      plan: mockPlan,
      device: 'pc',
      title: 'Kmxx-web 官网首页',
      contextKey: 'pc-test',
      budget
    });

    // 断言生成成功，无任何 "CTA底栏仅用于移动端已声明的footer区域" 报错
    expect(result.errorMessage).toBeUndefined();
    expect(result.rawResponse).toContain('导航');
    expect(result.rawResponse).toContain('主体内容');
    expect(result.rawResponse).toContain('底部版权');
    expect(result.rawResponse).not.toContain('cta-fixed');
  });

  test('CHK-F-06: extractJsonPayload 与 safeJsonParse 能够剥离 Layout 等对话前缀与代码块标签', () => {
    // 模拟真实大模型输出：带有对话前缀或 Markdown 代码块
    const outputWithPrefix = `Layout plan:\n{\n  "version": 1,\n  "layout": "flow",\n  "footer": "flow",\n  "regions": []\n}`;
    const parsed1 = safeJsonParse<any>(outputWithPrefix);
    expect(parsed1.version).toBe(1);
    expect(parsed1.layout).toBe('flow');

    const outputWithCodeBlock = `Here is the Layout:\n\`\`\`json\n{\n  "version": 1,\n  "layout": "sidebar-main",\n  "footer": "flow",\n  "regions": []\n}\n\`\`\`\nHope this helps!`;
    const parsed2 = safeJsonParse<any>(outputWithCodeBlock);
    expect(parsed2.version).toBe(1);
    expect(parsed2.layout).toBe('sidebar-main');
  });

  test('CHK-F-07: generateTaskPage 面对输出含有 Layout 前缀的大模型响应时，安全解析 JSON 并完成写入', async () => {
    const strategy = choosePageWriteStrategy({
      plan: mockPlan,
      estimatedHtmlBytes: 50000,
      requested: 'patch'
    });

    const transport = new MockTransport();
    // 模拟模型在返回中带有 "Layout: \n```json\n..."
    const conversationalOutput = `Layout: \n\`\`\`json\n${JSON.stringify({
      version: 1,
      layout: 'flow',
      footer: 'flow',
      regions: [
        { id: 'section-1', role: 'header', featureIds: ['f1'] },
        { id: 'section-2', role: 'main', featureIds: ['f2', 'f3', 'f4', 'f5'] },
        { id: 'section-3', role: 'footer', featureIds: ['f6'] }
      ]
    })}\n\`\`\``;
    transport.queueResponse(conversationalOutput);
    transport.queueResponse('<artifact type="screen"><header>导航</header></artifact>');
    transport.queueResponse('<artifact type="screen"><section>主体内容</section></artifact>');
    transport.queueResponse('<artifact type="screen"><footer>底部版权</footer></artifact>');

    const core = new DefaultAIEngineCore({
      id: 'test-core-prefix',
      stream: (req, evt) => transport.stream(req, evt)
    });

    const budget = new TaskBudget({
      maxRequests: 5,
      maxRequestedOutputTokens: 16000,
      maxDurationMs: 900000,
      maxRequestDurationMs: 900000
    });

    const provider = { id: 'test', name: 'test', protocol: 'openai_compatible' as const, baseUrl: 'http://mock', apiKey: 'test' };
    const result = await generateTaskPage(core, { provider, model: 'test', messages: [{ role: 'user', content: '设计Kmxx官网' }] }, {
      request: '设计Kmxx官网',
      strategy,
      plan: mockPlan,
      device: 'pc',
      title: 'Kmxx-web 官网首页',
      contextKey: 'pc-prefix-test',
      budget
    });

    // 断言解析成功，无 "JSON Parse error: Unexpected identifier 'Layout'" 报错
    expect(result.errorMessage).toBeUndefined();
    expect(result.rawResponse).toContain('导航');
    expect(result.rawResponse).toContain('主体内容');
    expect(result.rawResponse).toContain('底部版权');
  });
});
