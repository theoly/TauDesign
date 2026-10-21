/**
 * A0 · 基座收敛 验收测试 (doc/aesthetic/plan.md §3)
 *
 * 这些用例是「类名漂移」的常驻回归防线：任何一次 base.css 或 PromptBuilder
 * 的改动导致 Prompt 承诺了不存在的类，都会在此处立即失败。
 */
import { describe, test, expect } from 'bun:test';
import { getBaseCss } from '../src/styles/baseCss';
import rawBaseCss from '../src/styles/base.css?raw';
import { extractClassWhitelist } from '../src/utils/cssCompiler';
import { TokenLintEngine } from '../src/utils/tokenLint';
import { PromptBuilder } from '../src/services/ai/promptBuilder';
import { techBlueTheme } from '../src/utils/themePresets';
import { buildStyleSpecimenHtml, specimenCoverage } from '../src/utils/styleSpecimen';

const whitelist = extractClassWhitelist(getBaseCss('pc'));

describe('T-AE-01 · 间距阶梯相对 Token 刻度完备', () => {
  // Token 刻度定义于 cssCompiler.compileTokensToCss，为 {0,1,2,3,4,5,6,8}（无 7）
  const scale = ['0', '1', '2', '3', '4', '5', '6', '8'];
  for (const prefix of ['gap', 'p', 'px', 'py', 'm', 'mt', 'mb']) {
    test(`.${prefix}-* 覆盖全部刻度`, () => {
      for (const n of scale) expect(whitelist).toContain(`${prefix}-${n}`);
    });
  }
});

describe('T-AE-02 · 基座 CSS 单一权威源', () => {
  test('权威源以 base.css 文件为准（PC 档位 = 核心 + PC 切片）', () => {
    expect(getBaseCss('pc').startsWith(rawBaseCss)).toBe(true);
    expect(getBaseCss('mobile').startsWith(rawBaseCss)).toBe(true);
  });

  test('编辑器 chrome 未污染权威源', () => {
    // .aidesign-* 是选中/悬浮描边，属编辑器运行时样式；
    // 若进入权威源会污染白名单并泄漏到导出产物。
    for (const d of ['pc', 'mobile'] as const) {
      expect(getBaseCss(d)).not.toContain('aidesign-selected');
      expect(getBaseCss(d)).not.toContain('aidesign-hovered');
    }
  });
});

describe('T-AE-03 · Prompt 白名单自动派生', () => {
  const prompt = PromptBuilder.buildSystemPrompt({
    designSystem: techBlueTheme,
    decisions: [],
    deviceProfile: 'pc',
    frameWidth: 1440
  });

  test('白名单中每个类都真实存在于基座 CSS', () => {
    const promised = (prompt.match(/^\.[a-z][a-z0-9-]*(?:,\s*\.[a-z][a-z0-9-]*)*$/m)?.[0] || '')
      .split(/,\s*/)
      .map((c) => c.replace(/^\./, ''))
      .filter(Boolean);
    expect(promised.length).toBeGreaterThan(100);
    for (const c of promised) expect(whitelist).toContain(c);
  });

  test('此前漂移的代表性类名现已真实可用', () => {
    // 这 8 个类曾被 Prompt 承诺但运行时不存在，导致层级坍塌与间距断档
    for (const c of ['text-xl', 'text-4xl', 'font-normal', 'mt-3', 'px-5', 'avatar', 'tag', 'divider']) {
      expect(whitelist).toContain(c);
      expect(prompt).toContain(`.${c}`);
    }
  });

  test('不再出现手写区间记法', () => {
    expect(prompt).not.toContain('.p-0 .. .p-8');
    expect(prompt).not.toContain('.gap-1 .. .gap-8');
  });
});

describe('T-AE-04 · tokenLint 的 unknown_class 检测', () => {
  const unknownOf = (html: string) =>
    TokenLintEngine.scan(html, techBlueTheme).issues.filter((i) => i.issueType === 'unknown_class');

  test('报出伪造类名', () => {
    const issues = unknownOf('<div data-nid="a1" class="card fake-cls p-6">x</div>');
    expect(issues.length).toBe(1);
    expect(issues[0].rawSnippet).toBe('fake-cls');
  });

  test('对真实类名零误报', () => {
    expect(unknownOf('<div data-nid="a1" class="card p-6 r-lg shadow-md col gap-4">x</div>').length).toBe(0);
  });

  test('编辑器 chrome 类不误报', () => {
    expect(unknownOf('<div data-nid="a1" class="card aidesign-selected">x</div>').length).toBe(0);
  });
});

describe('T-AE-05 · 风格样张页', () => {
  test('覆盖白名单全集（A0 门禁）', () => {
    const c = specimenCoverage();
    expect(c.missing).toEqual([]);
    expect(c.covered).toBe(c.total);
  });

  test('自身通过 lint：无 unknown_class、无硬编码色值', () => {
    const report = TokenLintEngine.scan(buildStyleSpecimenHtml(), techBlueTheme);
    expect(report.issues.filter((i) => i.issueType === 'unknown_class')).toEqual([]);
    expect(report.issues.filter((i) => i.issueType === 'literal_color')).toEqual([]);
  });

  test('包含内联 SVG 图标与层级化文本', () => {
    const html = buildStyleSpecimenHtml();
    expect(html).toContain('<svg class="icon"');
    expect(html).toContain('text-muted');
  });
});
