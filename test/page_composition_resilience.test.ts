import { describe, test, expect } from 'bun:test';
import {
  repairPageComposition,
  parsePageComposition,
  defaultPageComposition,
  pageCompositionSchema,
  buildCompositionShell,
  type PageComposition
} from '../src/services/ai/pageComposition';
import { generateTaskPage } from '../src/services/ai/pageTaskGeneration';
import { choosePageWriteStrategy } from '../src/services/ai/generationStrategy';
import { DefaultAIEngineCore } from '../src/services/ai/engine/core/aiEngineCore';
import { MockTransport } from '../src/services/ai/engine/transport/mockTransport';
import { TaskBudget } from '../src/services/ai/taskBudget';
import type { PageTaskPlan } from '../src/services/ai/pageTaskPlan';

describe('Page Composition Resilience & Auto-Repair Suite (BR-PCR-01 ~ BR-PCR-03)', () => {
  const mockPlan: PageTaskPlan = {
    goal: '高端电商详情页',
    actor: '消费者',
    completion: ['可下单'],
    questions: [],
    features: [
      { id: 'f1', title: '顶部轮播图', change: 'add', basis: 'user', sourceIds: [], information: [], interactions: [], states: [] },
      { id: 'f2', title: '商品基本信息与价格', change: 'add', basis: 'user', sourceIds: [], information: [], interactions: [], states: [] },
      { id: 'f3', title: '规格与SKU选择器', change: 'add', basis: 'user', sourceIds: [], information: [], interactions: [], states: [] },
      { id: 'f4', title: '图文详情展示', change: 'add', basis: 'user', sourceIds: [], information: [], interactions: [], states: [] },
      { id: 'f5', title: '用户真实评价', change: 'add', basis: 'user', sourceIds: [], information: [], interactions: [], states: [] },
      { id: 'f6', title: '底部立即购买CTA', change: 'add', basis: 'user', sourceIds: [], information: [], interactions: [], states: [] }
    ]
  };

  test('CHK-F-01: pageCompositionSchema(device, featureIds) 生成带有 featureIds enum 约束的 Schema', () => {
    const validIds = ['f1', 'f2', 'f3', 'f4', 'f5', 'f6'];
    const schema = pageCompositionSchema('mobile', validIds);
    expect(schema.properties.regions.items.properties.featureIds.items).toEqual({
      type: 'string',
      enum: validIds
    });
  });

  test('CHK-F-02: 当模型遗漏功能 ID 时，repairPageComposition 自动补齐缺失 ID 到主体区域且全局唯一', () => {
    // 模型遗漏了 f4 和 f5
    const partialRaw = {
      version: 1,
      layout: 'flow',
      footer: 'cta',
      regions: [
        { id: 'section-1', role: 'header', featureIds: ['f1'] },
        { id: 'section-2', role: 'main', featureIds: ['f2', 'f3'] },
        { id: 'section-3', role: 'footer', featureIds: ['f6'] }
      ]
    };

    const repaired = repairPageComposition(partialRaw, mockPlan, 'mobile');
    const parsed = parsePageComposition(repaired, mockPlan, 'mobile');

    expect(parsed.regions).toHaveLength(3);
    const allAssigned = parsed.regions.flatMap(r => r.featureIds);
    expect(allAssigned.sort()).toEqual(['f1', 'f2', 'f3', 'f4', 'f5', 'f6']);
    // 缺失的 f4 与 f5 被平滑补入 main 区域
    const mainSection = parsed.regions.find(r => r.role === 'main');
    expect(mainSection?.featureIds).toContain('f4');
    expect(mainSection?.featureIds).toContain('f5');
  });

  test('CHK-F-03: 当模型重复分配功能 ID 时，repairPageComposition 自动去重，保留首次出现位置', () => {
    // 模型在 section-1 和 section-2 中重复声明了 f2
    const duplicateRaw = {
      version: 1,
      layout: 'flow',
      footer: 'flow',
      regions: [
        { id: 'section-1', role: 'header', featureIds: ['f1', 'f2'] },
        { id: 'section-2', role: 'main', featureIds: ['f2', 'f3', 'f4', 'f5'] },
        { id: 'section-3', role: 'footer', featureIds: ['f6'] }
      ]
    };

    const repaired = repairPageComposition(duplicateRaw, mockPlan, 'mobile');
    const parsed = parsePageComposition(repaired, mockPlan, 'mobile');

    const allAssigned = parsed.regions.flatMap(r => r.featureIds);
    expect(new Set(allAssigned).size).toBe(6);
    expect(allAssigned.length).toBe(6);
    // f2 保留在首个声明的 section-1 中，section-2 不再重复包含
    expect(parsed.regions[0].featureIds).toContain('f2');
    expect(parsed.regions[1].featureIds).not.toContain('f2');
  });

  test('CHK-F-04: 当模型使用功能标题或 feature-N 变体时，自动映射为规范 fN ID', () => {
    const nameAliasedRaw = {
      version: 1,
      layout: 'flow',
      footer: 'cta',
      regions: [
        { id: 'section-1', role: 'header', featureIds: ['顶部轮播图'] }, // 使用了功能标题
        { id: 'section-2', role: 'main', featureIds: ['feature-2', 'FEATURE_3', 'f4', 'f5'] }, // 变体 ID
        { id: 'section-3', role: 'footer', featureIds: ['f6'] }
      ]
    };

    const repaired = repairPageComposition(nameAliasedRaw, mockPlan, 'mobile');
    const parsed = parsePageComposition(repaired, mockPlan, 'mobile');

    expect(parsed.regions[0].featureIds).toEqual(['f1']);
    expect(parsed.regions[1].featureIds).toEqual(['f2', 'f3', 'f4', 'f5']);
    expect(parsed.regions[2].featureIds).toEqual(['f6']);
  });

  test('CHK-F-05: 当模型臆造不存在的 ID 时，自动过滤无效 ID 并补齐实际功能', () => {
    const hallucinatedRaw = {
      version: 1,
      layout: 'flow',
      footer: 'flow',
      regions: [
        { id: 'section-1', role: 'header', featureIds: ['f1', 'f99_hallucinated'] },
        { id: 'section-2', role: 'main', featureIds: ['f2', 'unknown-feature', 'f3'] },
        { id: 'section-3', role: 'footer', featureIds: ['f6'] }
      ]
    };

    const repaired = repairPageComposition(hallucinatedRaw, mockPlan, 'mobile');
    const parsed = parsePageComposition(repaired, mockPlan, 'mobile');

    const allAssigned = parsed.regions.flatMap(r => r.featureIds);
    expect(allAssigned).not.toContain('f99_hallucinated');
    expect(allAssigned).not.toContain('unknown-feature');
    expect(allAssigned.sort()).toEqual(['f1', 'f2', 'f3', 'f4', 'f5', 'f6']);
  });

  test('CHK-F-06: generateTaskPage 面对遗漏/重复/变体 ID 响应时，平滑完成整页写入而不抛出功能归属错误', async () => {
    const strategy = choosePageWriteStrategy({
      plan: mockPlan,
      estimatedHtmlBytes: 50000,
      requested: 'patch'
    });
    expect(strategy.mode).toBe('SectionedPatch');

    const transport = new MockTransport();
    // 模拟大模型返回带有遗漏（缺少 f5）和重复（f2 在两处声明）的布局规划
    const flawedComposition = {
      version: 1,
      layout: 'flow',
      footer: 'flow',
      regions: [
        { id: 'section-1', role: 'header', featureIds: ['f1', 'f2'] },
        { id: 'section-2', role: 'main', featureIds: ['f2', 'f3', 'f4'] }, // 重复了 f2，漏掉了 f5
        { id: 'section-3', role: 'footer', featureIds: ['f6'] }
      ]
    };
    transport.queueResponse(JSON.stringify(flawedComposition));
    transport.queueResponse('<artifact type="screen"><header>轮播图与基本信息</header></artifact>');
    transport.queueResponse('<artifact type="screen"><section>SKU与图文详情</section></artifact>');
    transport.queueResponse('<artifact type="screen"><footer>底部操作</footer></artifact>');

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
    const result = await generateTaskPage(core, { provider, model: 'test', messages: [{ role: 'user', content: '生成商品详情页' }] }, {
      request: '生成商品详情页',
      strategy,
      plan: mockPlan,
      device: 'mobile',
      title: '商品详情页',
      contextKey: 'flawed-composition-test',
      budget
    });

    expect(result.errorMessage).toBeUndefined();
    expect(result.rawResponse).toContain('轮播图与基本信息');
    expect(result.rawResponse).toContain('SKU与图文详情');
    expect(result.rawResponse).toContain('底部操作');
  });

  test('CHK-F-07: generateTaskPage 面对完全损坏或非 JSON 响应时，自动降级为 defaultPageComposition 不中断生成', async () => {
    const strategy = choosePageWriteStrategy({
      plan: mockPlan,
      estimatedHtmlBytes: 50000,
      requested: 'patch'
    });

    const transport = new MockTransport();
    // 模拟大模型返回完全破损的内容（例如网络中断残留纯文本）
    transport.queueResponse('Sorry, I cannot output JSON today. Here is text.');
    // 模拟降级到 defaultPageComposition 后的三个区域正常生成
    transport.queueResponse('<artifact type="screen"><section>区域一内容</section></artifact>');
    transport.queueResponse('<artifact type="screen"><section>区域二内容</section></artifact>');
    transport.queueResponse('<artifact type="screen"><section>区域三内容</section></artifact>');

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
    const result = await generateTaskPage(core, { provider, model: 'test', messages: [{ role: 'user', content: '生成商品详情页' }] }, {
      request: '生成商品详情页',
      strategy,
      plan: mockPlan,
      device: 'mobile',
      title: '商品详情页',
      contextKey: 'corrupt-composition-fallback',
      budget
    });

    expect(result.errorMessage).toBeUndefined();
    expect(result.rawResponse).toContain('区域一内容');
    expect(result.rawResponse).toContain('区域二内容');
    expect(result.rawResponse).toContain('区域三内容');
  });
});
