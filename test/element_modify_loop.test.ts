import { describe, test, expect } from 'bun:test';
import { checkStructureIntegrity } from '../src/services/ai/engine/pipeline/interceptors/guardInterceptor';
import { analyzePipelineIntent } from '../src/services/ai/engine/pipeline/interceptors/intentInterceptor';
import { PipelineContext } from '../src/services/ai/engine/pipeline/types';

describe('Element Modify & Structure Guard Interception & Loop Prevention', () => {
  const mockScreen = {
    id: 'screen-1',
    name: '送花表达心意 - 牵手币充值',
    htmlContent: `
<main class="page bg-background p-4">
  <div data-nid="card-1" class="card p-4">
    <div data-nid="ho2m25cl" class="card">
      <div data-nid="ho2m25cm" class="badge">Old Option 1</div>
      <div data-nid="ho2m25cn" class="badge">Old Option 2</div>
    </div>
  </div>
</main>`,
    isSkeleton: false
  };

  const newHtmlWithDifferentNodeCount = `
<main class="page bg-background p-4">
  <div data-nid="card-1" class="card p-4">
    <div data-nid="ho2m25cl" class="card bg-surface p-3 col items-center">
      <div data-nid="ho2m25c1" class="badge">New 10 牵手币</div>
      <div data-nid="ho2m25c2" class="badge">New 50 牵手币</div>
      <div data-nid="ho2m25c3" class="badge">New 100 牵手币</div>
      <div data-nid="ho2m25c4" class="badge">New 200 牵手币</div>
      <div data-nid="ho2m25c5" class="badge">New 500 牵手币</div>
      <div data-nid="ho2m25c6" class="badge">New 1000 牵手币</div>
      <div data-nid="ho2m25c7" class="badge">New 2000 牵手币</div>
      <div data-nid="ho2m25c8" class="badge">New 5000 牵手币</div>
    </div>
  </div>
</main>`;

  test('CHK-LP-01: 引用子树内可改变节点数量，不能放行目标之外的新增', () => {
    const rawPrompt = `[引用元素 nid="ho2m25cl" 画框="送花表达心意 - 牵手币充值" 标签=<div>]
元素片段:
<div data-nid="ho2m25cl" class="card">...</div>
参考图片，填充选项卡内容`;

    const context: PipelineContext = {
      input: {
        rawPrompt,
        activeScreenId: 'screen-1'
      },
      intent: 'modify_screen',
      intentReason: 'modify element',
      hasExplicitStructuralChangeIntent: false,
      targetScreen: mockScreen,
      referencedScreens: [],
      unmatchedMentions: [],
      activeRules: [],
      activeDecisions: []
    };

    const res = checkStructureIntegrity(context, newHtmlWithDifferentNodeCount);
    expect(res.passed).toBe(true);
    expect(checkStructureIntegrity(context, newHtmlWithDifferentNodeCount.replace('</main>', '<p>越界新增内容</p></main>')).passed).toBe(false);
  });

  test('CHK-LP-02: keywords like "填充", "修改", "替换" mark hasExplicitStructuralChangeIntent as true and bypass guard', () => {
    const input = {
      rawPrompt: '参考图片，填充选项卡内容',
      activeScreenId: 'screen-1'
    };

    const intentRes = analyzePipelineIntent(input);
    expect(intentRes.hasExplicitStructuralChangeIntent).toBe(true);

    const context: PipelineContext = {
      input,
      intent: 'modify_screen',
      intentReason: 'modify',
      hasExplicitStructuralChangeIntent: intentRes.hasExplicitStructuralChangeIntent,
      targetScreen: mockScreen,
      referencedScreens: [],
      unmatchedMentions: [],
      activeRules: [],
      activeDecisions: []
    };

    const res = checkStructureIntegrity(context, newHtmlWithDifferentNodeCount);
    expect(res.passed).toBe(true);
    expect(res.reason).toContain('结构调整需求');
  });

  test('CHK-LP-04: recursive prompt wrapper stripping prevents multi-layer nesting loops', () => {
    let prompt = '参考图片，填充选项卡内容';

    // Simulate clicking "一键生成" multiple times
    const wrapPrompt = (prev: string) => {
      let cleaned = prev
        .replace(/^请针对之前的页面设计诉求：“([\s\S]*?)”，直接且仅输出.*$/, '$1')
        .trim();
      return `请针对之前的页面设计诉求：“${cleaned}”，直接且仅输出被 <artifact identifier="screen_new" type="screen" title="新页面设计"> 与 </artifact> 包裹的完整页面代码块，严禁输出任何多余解释`;
    };

    const firstWrap = wrapPrompt(prompt);
    expect(firstWrap).toContain('请针对之前的页面设计诉求：“参考图片，填充选项卡内容”');

    // Second wrap should NOT nest
    const secondWrap = wrapPrompt(firstWrap);
    expect(secondWrap).toBe(firstWrap);
    expect(secondWrap.split('请针对之前的页面设计诉求：').length).toBe(2); // exactly 1 occurrence

    // Third wrap
    const thirdWrap = wrapPrompt(secondWrap);
    expect(thirdWrap).toBe(firstWrap);
    expect(thirdWrap.split('请针对之前的页面设计诉求：').length).toBe(2);
  });
});
