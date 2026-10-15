/**
 * A1 · 生成质量 验收测试 (doc/aesthetic/plan.md §4)
 *
 * 覆盖：微质感类、设备分档隔离、Prompt 美学注入、条件注入、意图分类、样张页正式化。
 */
import { describe, test, expect } from 'bun:test';
import { getBaseCss } from '../src/styles/baseCss';
import { extractClassWhitelist } from '../src/utils/cssCompiler';
import { PromptBuilder } from '../src/services/ai/promptBuilder';
import { classifyIntent } from '../src/services/ai/intentClassifier';
import { techBlueTheme } from '../src/utils/themePresets';
import { TokenLintEngine } from '../src/utils/tokenLint';
import { buildStyleSpecimenHtml, specimenCoverage } from '../src/utils/styleSpecimen';
import { buildPolishPrompt } from '../src/services/ai/polishPrompt';

const wl = (d: 'pc' | 'mobile') => extractClassWhitelist(getBaseCss(d));
const prompt = (d: 'pc' | 'mobile', intent: 'create_screen' | 'modify_screen' | 'change_theme' | 'question') =>
  PromptBuilder.buildSystemPrompt({
    designSystem: techBlueTheme,
    decisions: [],
    deviceProfile: d,
    frameWidth: d === 'pc' ? 1440 : 390,
    intent
  });

describe('T-AE-06 · 微质感原子类', () => {
  test('两档位均具备全部质感类', () => {
    const expected = [
      'shadow-soft', 'shadow-card', 'shadow-glow', 'glass', 'surface-subtle',
      'input-group', 'badge-soft', 'divider-text', 'avatar-group', 'skeleton'
    ];
    for (const d of ['pc', 'mobile'] as const) {
      for (const c of expected) expect(wl(d)).toContain(c);
    }
  });
});

describe('T-AE-07 · 设备专属类互斥', () => {
  test('PC 独有类不出现在移动端白名单', () => {
    for (const c of ['container-max', 'card-hover', 'row-hover', 'link-hover']) {
      expect(wl('pc')).toContain(c);
      expect(wl('mobile')).not.toContain(c);
    }
  });

  test('移动端独有类不出现在 PC 白名单', () => {
    for (const c of ['safe-top', 'safe-bottom', 'appbar', 'tabbar', 'cta-fixed', 'scroll-x', 'input-touch', 'tap-target', 'list-item']) {
      expect(wl('mobile')).toContain(c);
      expect(wl('pc')).not.toContain(c);
    }
  });
});

describe('T-AE-08/09 · Prompt 美学规则分档注入', () => {
  test('PC 要求内容最大宽度容器，且不提及移动端结构', () => {
    const p = prompt('pc', 'create_screen');
    expect(p).toContain('container-max');
    expect(p).not.toContain('tabbar');
    expect(p).not.toContain('safe-top');
  });

  test('移动端禁止多列栅格与 hover，且不提及 PC 悬浮类', () => {
    const p = prompt('mobile', 'create_screen');
    expect(p).toContain('SINGLE COLUMN ONLY');
    expect(p).toContain('NO HOVER STATES');
    // 白名单中不存在的类，规则文本里也不得点名——否则等于诱导模型使用
    expect(p).not.toContain('card-hover');
    expect(p).not.toContain('container-max');
  });

  test('层级准则在两档位均注入', () => {
    for (const d of ['pc', 'mobile'] as const) {
      expect(prompt(d, 'create_screen')).toContain('VISUAL HIERARCHY');
    }
  });

  test('生成、修改与润色均包含前景/背景可见性及配色协调原则', () => {
    for (const deviceProfile of ['pc', 'mobile'] as const) {
      const frameWidth = deviceProfile === 'pc' ? 1440 : 390;
      const prompts = [buildPolishPrompt({ designSystem: techBlueTheme, deviceProfile, frameWidth })];
      for (const colorMode of ['light', 'dark'] as const) {
        for (const intent of ['create_screen', 'modify_screen'] as const) {
          prompts.push(PromptBuilder.buildSystemPrompt({
            designSystem: techBlueTheme, deviceProfile, frameWidth, colorMode, intent
          }));
        }
      }
      for (const p of prompts) {
        expect(p).toContain('配色可见性与美观度');
        expect(p).toContain('文字、图标和关键控件必须与实际背景清晰区分');
        expect(p).toContain('严禁同色或近似色导致内容难以辨认');
        expect(p).toContain('更换背景时同步检查并调整前景色');
        expect(p).toContain('图片、渐变、半透明背景按叠加效果判断');
        expect(p).toContain('品牌色协调、语义一致和主次层级');
        expect(p).toContain('不为柔和、低饱和或装饰效果牺牲可见性');
      }
    }
  });
});

describe('T-AE-10 · Few-Shot 条件注入（成本约束）', () => {
  test('仅新建画框时注入范例', () => {
    expect(prompt('pc', 'create_screen')).toContain('REFERENCE EXAMPLE');
    expect(prompt('pc', 'modify_screen')).not.toContain('REFERENCE EXAMPLE');
    expect(prompt('pc', 'change_theme')).not.toContain('REFERENCE EXAMPLE');
  });

  test('改主题与提问不注入美学段落', () => {
    expect(prompt('pc', 'change_theme')).not.toContain('AESTHETIC DIRECTIVES');
    expect(prompt('pc', 'question')).not.toContain('AESTHETIC DIRECTIVES');
  });

  test('条件注入确实省下 token', () => {
    expect(prompt('pc', 'modify_screen').length).toBeLessThan(prompt('pc', 'create_screen').length);
    expect(prompt('pc', 'change_theme').length).toBeLessThan(prompt('pc', 'modify_screen').length);
  });

  test('两档位范例互斥，不混用', () => {
    expect(prompt('mobile', 'create_screen')).toContain('cta-fixed');
    expect(prompt('pc', 'create_screen')).not.toContain('cta-fixed');
  });
});

describe('T-AE-11 · 意图分类（ISSUE-007）', () => {
  test('主题诉求不再被误判为修改画框', () => {
    // 这些语句此前全部命中 includes('改')，导致当前画框被重写
    for (const t of ['把主色改成暖橙一点', '整体圆角再大一些', '配色换成深色模式', '间距太挤了，放松一点']) {
      expect(classifyIntent(t, true).intent).toBe('change_theme');
    }
  });

  test('指向具体页面的修改仍判为 modify_screen', () => {
    expect(classifyIntent('把这个页面改成两栏布局', true).intent).toBe('modify_screen');
    expect(classifyIntent('重构当前画框的表单', true).intent).toBe('modify_screen');
  });

  test('无选中画框时"修改"回落为新建', () => {
    expect(classifyIntent('改一下', false).intent).toBe('create_screen');
  });

  test('疑问句判为 question', () => {
    expect(classifyIntent('这个工具支持导出 PNG 吗？', true).intent).toBe('question');
  });
});

describe('T-AE-13 · 样张页正式化', () => {
  test('两档位均 100% 覆盖各自白名单', () => {
    for (const d of ['pc', 'mobile'] as const) {
      const c = specimenCoverage(d);
      expect(c.missing).toEqual([]);
    }
  });

  test('两档位内容确实不同且各自正确', () => {
    const pc = buildStyleSpecimenHtml('pc');
    const mo = buildStyleSpecimenHtml('mobile');
    expect(pc).not.toBe(mo);
    expect(pc).toContain('container-max');
    expect(pc).not.toContain('tabbar');
    expect(mo).toContain('tabbar');
    expect(mo).not.toContain('container-max');
  });

  test('样张页自身通过 lint（按各自档位）', () => {
    for (const d of ['pc', 'mobile'] as const) {
      const r = TokenLintEngine.scan(buildStyleSpecimenHtml(d), techBlueTheme, d);
      expect(r.issues.filter((i) => i.issueType === 'unknown_class')).toEqual([]);
      expect(r.issues.filter((i) => i.issueType === 'literal_color')).toEqual([]);
    }
  });

  test('质感类在样张中有实际展示', () => {
    const pc = buildStyleSpecimenHtml('pc');
    for (const c of ['shadow-soft', 'badge-soft', 'input-group', 'divider-text', 'glass', 'skeleton']) {
      expect(pc).toContain(c);
    }
  });
});

describe('T-AE-14 · 样张页生命周期', () => {
  test('新建工程首个画框是样张页且带 specimen 标记', async () => {
    const { useProjectStore } = await import('../src/stores/useProjectStore');
    const { techBlueTheme: theme } = await import('../src/utils/themePresets');
    useProjectStore.getState().initNewProject({ name: 'T', deviceProfile: 'pc', designSystem: theme, createSpecimen: true });
    const st = useProjectStore.getState();
    const first = st.screens[st.screenOrder[0]];
    expect(first.metadata?.kind).toBe('specimen');
    expect(first.name).toContain('风格样张');
    expect(st.isSpecimen(first.id)).toBe(true);
    // 不再是那个信息量为零的空白欢迎页
    expect(first.htmlContent).not.toContain('空白画框');
  });

  test('样张页按工程设备档位生成', async () => {
    const { useProjectStore } = await import('../src/stores/useProjectStore');
    const { techBlueTheme: theme } = await import('../src/utils/themePresets');
    useProjectStore.getState().initNewProject({ name: 'M', deviceProfile: 'mobile', designSystem: theme, createSpecimen: true });
    const st = useProjectStore.getState();
    expect(st.screens[st.screenOrder[0]].htmlContent).toContain('tabbar');
  });

  test('删除后可重新生成', async () => {
    const { useProjectStore } = await import('../src/stores/useProjectStore');
    const { techBlueTheme: theme } = await import('../src/utils/themePresets');
    useProjectStore.getState().initNewProject({ name: 'R', deviceProfile: 'pc', designSystem: theme });
    const id = useProjectStore.getState().regenerateSpecimen();
    expect(useProjectStore.getState().isSpecimen(id)).toBe(true);
  });

  test('样张页自身不含内联字面量色值', async () => {
    // blankScreenHtml 曾写 style="min-height:800px"，是用户看到的第一个反面教材
    for (const d of ['pc', 'mobile'] as const) {
      expect(buildStyleSpecimenHtml(d)).not.toMatch(/style="[^"]*#[0-9a-fA-F]{3,8}/);
    }
  });
});
