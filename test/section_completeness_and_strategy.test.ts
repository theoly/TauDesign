import {expect, test} from 'bun:test';
import {extractArtifact} from '../src/services/ai/engine/pipeline/interceptors/streamTransform';
import {htmlIsComplete, repairHtmlSnippet} from '../src/utils/htmlCompleteness';
import {choosePageWriteStrategy, estimatePageHtmlBytes} from '../src/services/ai/generationStrategy';
import {generateSectionedPage, parseSectionPlan} from '../src/services/ai/sectionedGeneration';
import type {StreamTextOptions, AIEngineCore} from '../src/services/ai/engine/core/types';
import {defaultProviders} from '../src/stores/useAIConfigStore';

test('extractArtifact 成功识别并提取以 header, nav, footer, aside, article, ul, ol, table 开头的 HTML', () => {
  const tags = ['header', 'nav', 'footer', 'aside', 'article', 'ul', 'ol', 'table'];
  for (const tag of tags) {
    // 1. Raw HTML
    const raw = `<${tag} class="container p-4"><span>Content for ${tag}</span></${tag}>`;
    const resRaw = extractArtifact(raw);
    expect(resRaw).toBeDefined();
    expect(resRaw?.html).toContain(`Content for ${tag}`);
    expect(resRaw?.isComplete).toBe(true);

    // 2. Generic Markdown fence (``` ... ```)
    const genericFence = `\`\`\`\n<${tag} class="box">\n  <p>Inside fence</p>\n</${tag}>\n\`\`\``;
    const resGeneric = extractArtifact(genericFence);
    expect(resGeneric).toBeDefined();
    expect(resGeneric?.html).toContain(`Inside fence`);
    expect(resGeneric?.isComplete).toBe(true);
  }
});

test('repairHtmlSnippet 成功将自闭合非 void 标签正规化为双标签', () => {
  const jsxLike = '<header class="header"><i class="lucide-user" /><span class="badge" /><div class="divider" /><h1>Title</h1></header>';
  expect(htmlIsComplete(jsxLike)).toBe(false);

  const repaired = repairHtmlSnippet(jsxLike);
  expect(repaired).toContain('<i class="lucide-user"></i>');
  expect(repaired).toContain('<span class="badge"></span>');
  expect(repaired).toContain('<div class="divider"></div>');
  expect(htmlIsComplete(repaired)).toBe(true);
});

test('repairHtmlSnippet 保留 SVG 内部合法自闭合元素', () => {
  const svgHtml = '<div class="icon-wrap"><svg viewBox="0 0 24 24"><path d="M0 0" /><circle cx="12" cy="12" r="10" /><rect x="0" y="0" width="10" height="10" /></svg></div>';
  expect(htmlIsComplete(svgHtml)).toBe(true);
  const repaired = repairHtmlSnippet(svgHtml);
  expect(repaired).toBe(svgHtml);
});

test('repairHtmlSnippet 能够安全补齐尾部未闭合的结构性标签', () => {
  const unclosed = '<section class="p-4"><div class="card"><h2 class="title">Header</h2><p>Description</p>';
  expect(htmlIsComplete(unclosed)).toBe(false);

  const repaired = repairHtmlSnippet(unclosed);
  expect(htmlIsComplete(repaired)).toBe(true);
  expect(repaired.endsWith('</div></section>')).toBe(true);
});

test('repairHtmlSnippet 遇到中途截断的非法属性或标签时不强行注入闭合', () => {
  const truncated = '<section class="p-4"><div class="card-broken';
  const repaired = repairHtmlSnippet(truncated);
  expect(repaired).toBe(truncated);
  expect(htmlIsComplete(repaired)).toBe(false);
});

test('sectionedGeneration 能够自愈包含自闭合标签或缺少尾标签的区块并顺利合并', async () => {
  const plan = {
    title: '用户中心',
    shellHtml: '<main class="container-max col gap-4 p-4"><section data-design-slot="section-1"></section><section data-design-slot="section-2"></section></main>',
    sections: [
      {id: 'section-1', name: '头部', requirements: '导航与个人信息'},
      {id: 'section-2', name: '列表', requirements: '功能卡片列表'}
    ]
  };

  const provider = defaultProviders[0];
  const options = {provider, model: 'fixture', messages: [{role: 'user' as const, content: '生成用户中心'}]};

  const core: AIEngineCore = {
    streamText(o) {
      const step = o.messages.find(m => m.content.includes('当前区块：')) ? 'section' : 'plan';
      let text = '';
      if (step === 'plan') {
        text = JSON.stringify(plan);
      } else if (o.messages.some(m => m.content.includes('"id":"section-1"'))) {
        // section-1 contains self-closing <i /> tag which previously broke htmlIsComplete
        text = '<artifact><header class="flex items-center gap-2"><i class="lucide-user" /><h1>用户中心</h1></header></artifact>';
      } else {
        // section-2 missing trailing </section>
        text = '<artifact><div class="card p-4"><button class="btn btn-primary">退出登录</button></artifact>';
      }
      return {
        textStream: (async function*() { yield text; })(),
        reasoningStream: (async function*() {})(),
        textPromise: Promise.resolve(text),
        reasoningPromise: Promise.resolve(undefined),
        usagePromise: Promise.resolve({inputTokens: 10, outputTokens: 20}),
        finishReasonPromise: Promise.resolve('stop'),
        abort() {}
      };
    },
    async generateObject() { throw new Error('unused'); }
  };

  const result = await generateSectionedPage(core, options, 'test-ctx');
  expect(result.errorMessage).toBeUndefined();
  expect(result.sectioned?.completed).toBe(2);
  expect(result.rawResponse).toContain('用户中心');
  expect(result.rawResponse).toContain('退出登录');
  expect(result.rawResponse).toContain('class="lucide-user"');
  expect(result.rawResponse).toContain('</i>');
  expect(result.rawResponse).toContain('</button></div>');
});

test('choosePageWriteStrategy 策略路由校准: 1-3 区块走 SkeletonMainAtomic, 4-6 区块走 SectionPlanThenWrite, 仅 7+ 或超大走 SectionedPatch', () => {
  const planForFeatures = (count: number) => ({
    goal: '测试页面',
    architecture: {pattern: 'dashboard' as const, layout: 'flow' as const, device: 'pc' as const},
    features: Array.from({length: count}, (_, i) => ({
      id: `f-${i+1}`,
      title: `功能${i+1}`,
      information: ['字段A', '字段B'],
      interactions: ['操作1', '操作2'],
      states: ['空态', '加载态'],
      role: 'content' as const
    })),
    dataDependencies: [],
    questions: []
  });

  // 1. 2 个功能 (1-3 区块) -> SkeletonMainAtomic
  const plan2 = planForFeatures(2);
  const bytes2 = estimatePageHtmlBytes('生成简单页', plan2);
  const fits2 = Math.ceil(bytes2 / 3.5) <= 8192;
  const s2 = choosePageWriteStrategy({plan: plan2, estimatedHtmlBytes: bytes2, atomicFits: fits2, requested: 'auto'});
  expect(s2.mode).toBe('SkeletonMainAtomic');

  // 2. 4 个功能 (4-6 区块) -> SectionPlanThenWrite (不再被误判强推为 SectionedPatch!)
  const plan4 = planForFeatures(4);
  const bytes4 = estimatePageHtmlBytes('生成普通管理后台', plan4);
  const fits4 = Math.ceil(bytes4 / 3.5) <= 8192;
  const s4 = choosePageWriteStrategy({plan: plan4, estimatedHtmlBytes: bytes4, atomicFits: fits4, requested: 'auto'});
  expect(s4.mode).toBe('SectionPlanThenWrite');
  expect(s4.reason).toContain('4–6个主要区块');

  // 3. 6 个功能 (4-6 区块) -> SectionPlanThenWrite
  const plan6 = planForFeatures(6);
  const bytes6 = estimatePageHtmlBytes('生成丰富功能页', plan6);
  const fits6 = Math.ceil(bytes6 / 3.5) <= 8192;
  const s6 = choosePageWriteStrategy({plan: plan6, estimatedHtmlBytes: bytes6, atomicFits: fits6, requested: 'auto'});
  expect(s6.mode).toBe('SectionPlanThenWrite');

  // 4. 7 个功能 (>=7 区块) -> SectionedPatch
  const plan7 = planForFeatures(7);
  const bytes7 = estimatePageHtmlBytes('生成超长页面', plan7);
  const fits7 = Math.ceil(bytes7 / 3.5) <= 8192;
  const s7 = choosePageWriteStrategy({plan: plan7, estimatedHtmlBytes: bytes7, atomicFits: fits7, requested: 'auto'});
  expect(s7.mode).toBe('SectionedPatch');
  expect(s7.reason).toContain('至少7个主要业务区块');

  // 5. 显式指定 patch -> SectionedPatch
  const sPatch = choosePageWriteStrategy({plan: plan2, estimatedHtmlBytes: bytes2, atomicFits: true, requested: 'patch'});
  expect(sPatch.mode).toBe('SectionedPatch');

  // 6. 字节超过 45KiB -> SectionedPatch
  const sHuge = choosePageWriteStrategy({plan: plan2, estimatedHtmlBytes: 50 * 1024, atomicFits: true, requested: 'auto'});
  expect(sHuge.mode).toBe('SectionedPatch');
  expect(sHuge.reason).toContain('45KiB');
});
