/**
 * A3 · 智能闭环 验收测试 (doc/aesthetic/plan.md §6)
 *
 * 重点在两个强制机制：结构守卫与组件优先编排。Polish / Restyle 的承诺是
 * 「只改样子不改内容」，这条承诺必须可强制执行，不能只靠 Prompt 请求。
 */
import { describe, test, expect, spyOn } from 'bun:test';
import { PageRenderCheck } from '../src/services/ai/pageRenderCheck';
import { compareStructure, hasTextDrift } from '../src/utils/structureGuard';
import { planRestyle, acceptRestyleResult, summarizeOutcomes, type RestyleTarget } from '../src/services/ai/restyleService';
import { buildPolishPrompt, describeTargetStyle } from '../src/services/ai/polishPrompt';
import { techIndigoTheme, warmCoralTheme } from '../src/utils/themePresets';

const ORIGINAL = `<div data-nid="a1" class="card p-4">
  <h2 data-nid="a2" class="text-lg">季度营收</h2>
  <p data-nid="a3" class="text-sm">2,847 万元</p>
  <button data-nid="a4" class="btn">查看明细</button>
</div>`;

describe('T-AE-26 · 结构守卫（Polish 的承诺执行者）', () => {
  test('仅改 class 判定通过', () => {
    const after = ORIGINAL
      .replace('class="card p-4"', 'class="card shadow-soft p-6"')
      .replace('class="text-lg"', 'class="text-xl font-bold"')
      .replace('class="btn"', 'class="btn btn-primary"');
    const d = compareStructure(ORIGINAL, after);
    expect(d.ok).toBe(true);
    expect(d.textChanged).toBe(0);
  });

  test('补图标不算结构变化（这是 Polish 的合法动作）', () => {
    const after = ORIGINAL.replace(
      '<button data-nid="a4" class="btn">查看明细</button>',
      '<button data-nid="a4" class="btn btn-primary"><svg class="icon" viewBox="0 0 24 24"><path d="M5 12h14"/></svg>查看明细</button>'
    );
    expect(compareStructure(ORIGINAL, after).ok).toBe(true);
  });

  test('删除节点被拒绝——用户丢的是内容而不只是样式', () => {
    const after = ORIGINAL.replace('<p data-nid="a3" class="text-sm">2,847 万元</p>', '');
    const d = compareStructure(ORIGINAL, after);
    expect(d.ok).toBe(false);
    expect(d.removed.length).toBeGreaterThan(0);
    expect(d.reason).toContain('不得增删业务节点');
  });

  test('新增节点同样被拒绝', () => {
    const after = ORIGINAL.replace('</div>', '<span data-nid="a5" class="badge">新</span></div>');
    const d = compareStructure(ORIGINAL, after);
    expect(d.ok).toBe(false);
    expect(d.added.length).toBeGreaterThan(0);
  });

  test('文案被改动会被检出（不阻断但必须如实报告）', () => {
    const after = ORIGINAL.replace('2,847 万元', '1,000 万元');
    const d = compareStructure(ORIGINAL, after);
    expect(d.ok).toBe(true);
    expect(hasTextDrift(d)).toBe(true);
    expect(d.textChanged).toBe(1);
  });

  test('节点顺序被打乱会被检出', () => {
    const after = `<div data-nid="a1" class="card p-4">
  <p data-nid="a3" class="text-sm">2,847 万元</p>
  <h2 data-nid="a2" class="text-lg">季度营收</h2>
  <button data-nid="a4" class="btn">查看明细</button>
</div>`;
    expect(compareStructure(ORIGINAL, after).ok).toBe(false);
  });
});

describe('T-AE-26 · Polish Prompt 的结构契约', () => {
  const p = buildPolishPrompt({ designSystem: techIndigoTheme, deviceProfile: 'pc', frameWidth: 1440 });

  test('明示违反结构契约将被整体拒绝', () => {
    expect(p).toContain('REJECTED outright');
    expect(p).toContain('PRESERVE every data-nid');
    expect(p).toContain('DO NOT change any visible text');
  });

  test('明确限定可改动范围只有 class 与 svg', () => {
    expect(p).toContain('WHAT YOU MAY CHANGE');
    expect(p).toContain('Nothing else.');
  });

  test('受保护节点会被列出（L4 覆盖改了也被 !important 挡住）', () => {
    const withProtected = buildPolishPrompt({
      designSystem: techIndigoTheme, deviceProfile: 'pc', frameWidth: 1440, protectedNids: ['a1', 'a3']
    });
    expect(withProtected).toContain('PROTECTED NODES');
    expect(withProtected).toContain('a1, a3');
  });

  test('按设备分档注入且白名单来自真实基座', () => {
    expect(p).toContain('container-max');
    const m = buildPolishPrompt({ designSystem: techIndigoTheme, deviceProfile: 'mobile', frameWidth: 390 });
    expect(m).toContain('SINGLE COLUMN ONLY');
    expect(m).not.toContain('container-max');
  });

  test('目标风格描述含可量化维度', () => {
    const d = describeTargetStyle(warmCoralTheme);
    expect(d).toContain(warmCoralTheme.tokens.colors.primary['500']);
    expect(d).toContain(warmCoralTheme.tokens.radius.md);
  });
});

describe('T-AE-27/28 · Restyle 编排', () => {
  const comp = (id: string, reuse: number): RestyleTarget =>
    ({ kind: 'component', id, name: `组件${id}`, html: `<div data-nid="${id}">x</div>`, reuseCount: reuse });
  const screen = (id: string): RestyleTarget =>
    ({ kind: 'screen', id, name: `画框${id}`, html: `<div data-nid="${id}">y</div>` });

  test('组件优先，且复用多的排在前面', () => {
    const plan = planRestyle([comp('c1', 2), comp('c2', 10)], [screen('s1'), screen('s2')]);
    expect(plan.queue.map((t) => t.id)).toEqual(['c2', 'c1', 's1', 's2']);
  });

  test('组件优先确实省下调用次数', () => {
    // c2 被 10 个页面复用：组件优先只需 1 次，逐页重写要 10 次
    const plan = planRestyle([comp('c2', 10)], [screen('s1')]);
    expect(plan.estimatedCalls).toBe(2);
    expect(plan.naiveCalls).toBe(11);
  });

  test('试跑目标是队列首项——未确认前不得批量', () => {
    const plan = planRestyle([comp('c1', 3)], [screen('s1')]);
    expect(plan.dryRun?.id).toBe('c1');
  });

  test('空输入不产生试跑目标', () => {
    expect(planRestyle([], []).dryRun).toBeNull();
  });
});

describe('T-AE-27 · 结果校验与汇总', () => {
  const target: RestyleTarget = { kind: 'screen', id: 's1', name: '仪表盘', html: ORIGINAL };

  test('结构合法的结果被接受', () => {
    const rewritten = ORIGINAL.replace('class="card p-4"', 'class="card shadow-soft p-6"');
    const o = acceptRestyleResult(target, rewritten);
    expect(o.status).toBe('applied');
    expect(o.html).toBe(rewritten);
  });

  test('结构被破坏时拒绝落盘', () => {
    const o = acceptRestyleResult(target, ORIGINAL.replace('<button data-nid="a4" class="btn">查看明细</button>', ''));
    expect(o.status).toBe('skipped_structure');
    expect(o.html).toBeUndefined();
  });

  test('空返回判为失败而非静默通过', () => {
    expect(acceptRestyleResult(target, null).status).toBe('failed');
    expect(acceptRestyleResult(target, '   ').status).toBe('failed');
  });

  test('文案漂移不阻断，但在结果中如实标注', () => {
    const o = acceptRestyleResult(target, ORIGINAL.replace('季度营收', '年度营收'));
    expect(o.status).toBe('applied');
    expect(o.message).toContain('文案变化');
  });

  test('汇总只列出异常项，不淹没正常结果', () => {
    const good = acceptRestyleResult(target, ORIGINAL.replace('class="btn"', 'class="btn btn-primary"'));
    const bad = acceptRestyleResult(
      { ...target, id: 's2', name: '列表页' },
      ORIGINAL.replace('<p data-nid="a3" class="text-sm">2,847 万元</p>', '')
    );
    const s = summarizeOutcomes([good, bad]);
    expect(s.total).toBe(2);
    expect(s.applied).toBe(1);
    expect(s.structureRejected).toBe(1);
    expect(s.details.length).toBe(1);
    expect(s.details[0]).toContain('列表页');
  });
});

describe('T-AE-27/28 · store 层编排', () => {
  const setup = async () => {
    const { useProjectStore } = await import('../src/stores/useProjectStore');
    const { techIndigoTheme: theme } = await import('../src/utils/themePresets');
    useProjectStore.getState().initNewProject({ name: 'R', deviceProfile: 'pc', designSystem: theme });
    return useProjectStore;
  };

  test('样张页被排除在重塑队列外（改它应该去改 Token）', async () => {
    const store = await setup();
    store.getState().addScreen({ name: '业务页', position: { x: 0, y: 0 }, htmlContent: '<div data-nid="b1">x</div>' });
    const plan = store.getState().buildRestylePlan();
    expect(plan.queue.some((t) => t.name.includes('风格样张'))).toBe(false);
    expect(plan.queue.some((t) => t.name === '业务页')).toBe(true);
  });

  test('含 L4 覆盖的节点被标为受保护', async () => {
    const store = await setup();
    const sid = store.getState().addScreen({
      name: '含覆盖页', position: { x: 0, y: 0 }, htmlContent: '<div data-nid="p1">x</div>'
    });
    store.getState().setOverride(sid, 'p1', { color: 'red' });
    const target = store.getState().buildRestylePlan().queue.find((t) => t.id === sid);
    expect(target?.protectedNids).toContain('p1');
  });

  test('组件按复用次数排在画框之前', async () => {
    const store = await setup();
    const cid = store.getState().createComponent('指标卡', '<div data-nid="c1" class="card">卡</div>');
    store.getState().addScreen({
      name: 'A', position: { x: 0, y: 0 },
      htmlContent: `<div data-component-id="${cid}">1</div><div data-component-id="${cid}">2</div>`
    });
    const plan = store.getState().buildRestylePlan();
    expect(plan.queue[0].kind).toBe('component');
    expect(plan.queue[0].reuseCount).toBe(2);
    // 组件优先：2 处实例只需 1 次调用
    expect(plan.naiveCalls).toBeGreaterThan(plan.estimatedCalls);
  });

  test('结构不合法的结果不会被落地', async () => {
    const store = await setup();
    const sid = store.getState().addScreen({
      name: '目标页', position: { x: 0, y: 0 }, htmlContent: '<div data-nid="z1"><span data-nid="z2">a</span></div>'
    });
    const before = store.getState().screens[sid].htmlContent;
    const applied = await store.getState().applyRestyleOutcome({
      target: { kind: 'screen', id: sid, name: '目标页', html: before },
      status: 'skipped_structure'
    });
    expect(applied.applied).toBe(false);
    expect(store.getState().screens[sid].htmlContent).toBe(before);
  });

  test('合法结果落地到画框', async () => {
    const store = await setup();
    const sid = store.getState().addScreen({
      name: '目标页2', position: { x: 0, y: 0 }, htmlContent: '<div data-nid="y1" class="card">a</div>'
    });
    const html = '<div data-nid="y1" class="card shadow-soft p-6">a</div>';
    const render = spyOn(PageRenderCheck,'inspect').mockResolvedValue({status:'complete',findings:[],inspected:1});
    try {
    expect(
      (await store.getState().applyRestyleOutcome({
        target: { kind: 'screen', id: sid, name: '目标页2', html: '<div data-nid="y1" class="card">a</div>' },
        status: 'applied',
        html
      })).applied
    ).toBe(true);
    expect(store.getState().screens[sid].htmlContent).toBe(html);
    } finally { render.mockRestore(); }
  });
});

describe('T-AE-29 · 截图风格提取落 Token', () => {
  test('解析合法输出', async () => {
    const { parseExtraction } = await import('../src/services/ai/visionTokenExtract');
    const e = parseExtraction('```json\n{"primary":"#FF385C","radiusMd":"16px","density":"relaxed","borderAlpha":0.45,"isDark":false}\n```');
    expect(e).toEqual({ primary: '#ff385c', radiusMd: '16px', density: 'relaxed', borderAlpha: 0.45, isDark: false });
  });

  test('脏值被丢弃而非污染设计系统', async () => {
    const { parseExtraction } = await import('../src/services/ai/visionTokenExtract');
    const e = parseExtraction('{"primary":"红色","radiusMd":"很大","density":"随便","borderAlpha":9,"surface":"#FFFFFF"}');
    // 只有合法的 surface 被保留
    expect(e).toEqual({ surface: '#ffffff' });
  });

  test('无法解析时返回 null，不编造', async () => {
    const { parseExtraction } = await import('../src/services/ai/visionTokenExtract');
    expect(parseExtraction('这张图看起来很现代')).toBeNull();
    expect(parseExtraction('{}')).toBeNull();
  });

  test('提取结果合并进 A2 新增的全部 Token 字段', async () => {
    const { applyExtraction } = await import('../src/services/ai/visionTokenExtract');
    const { techIndigoTheme } = await import('../src/utils/themePresets');
    const next = applyExtraction(techIndigoTheme.tokens, {
      primary: '#ff385c', radiusMd: '16px', density: 'relaxed', borderAlpha: 0.4, shadowStrength: 'strong', isDark: false
    });
    expect(next.colors.primary['500']).toBe('#ff385c');
    expect(next.radius.md).toBe('16px');
    expect(next.personality.density).toBe('relaxed');
    expect(next.personality.borderAlpha).toBe(0.4);
    expect(next.shadows.soft.light).toContain('rgba');
    expect(next.shadows.soft.dark).not.toBe(next.shadows.soft.light);
  });

  test('深色截图写入 dark 侧，不把整套主题改成深色', async () => {
    const { applyExtraction } = await import('../src/services/ai/visionTokenExtract');
    const { techIndigoTheme } = await import('../src/utils/themePresets');
    const before = techIndigoTheme.tokens.colors.background.light;
    const next = applyExtraction(techIndigoTheme.tokens, { background: '#030712', isDark: true });
    expect(next.colors.background.dark).toBe('#030712');
    expect(next.colors.background.light).toBe(before); // 浅色侧未被改动
  });

  test('变更清单人类可读，供确认卡片展示', async () => {
    const { describeExtraction } = await import('../src/services/ai/visionTokenExtract');
    const { techIndigoTheme } = await import('../src/utils/themePresets');
    const lines = describeExtraction({ primary: '#ff385c', density: 'relaxed' }, techIndigoTheme.tokens);
    expect(lines.some((l) => l.includes('主色'))).toBe(true);
    expect(lines.some((l) => l.includes('间距密度'))).toBe(true);
  });
});
