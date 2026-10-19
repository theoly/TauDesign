import { describe, expect, test } from 'bun:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { applyBrandColor, buildPrimaryRamp, COLOR_SCHEMES, contrastRatio, resolveColorRoles } from '../src/utils/colorHarmony';
import { themePresets, techBlueTheme } from '../src/utils/themePresets';
import { compileTokensToCss } from '../src/utils/cssCompiler';
import { getBuiltinDesignProse } from '../src/styles/presets/designProse';
import { proposeTokenChange } from '../src/services/ai/styleTags';
import { applyExtraction } from '../src/services/ai/visionTokenExtract';
import { ThemeEditor } from '../src/components/theme/ThemeEditor';
import { useProjectStore } from '../src/stores/useProjectStore';
import { useHistoryStore } from '../src/stores/useHistoryStore';
import { PromptBuilder } from '../src/services/ai/promptBuilder';
import { buildPolishPrompt } from '../src/services/ai/polishPrompt';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('配色角色与联动', () => {
  const verify = (tokens: typeof techBlueTheme.tokens, mode: 'light' | 'dark') => {
    const r = resolveColorRoles(tokens, mode);
    const c = tokens.colors;
    const surfaces = [c.background[mode], c.surface[mode], c.surfaceAlt[mode]];
    const meets = (fg: string, bg: string) => expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(4.5);
    meets(r.onPrimary, r.primary);
    meets(r.onAccent, r.accent);
    for (const bg of surfaces) {
      for (const fg of [r.textPrimary, r.textSecondary, r.textMuted, r.primaryText, r.accentText]) meets(fg, bg);
      for (const role of [r.success, r.warning, r.danger]) meets(role.text, bg);
    }
    meets(r.primaryText, r.primaryLight);
    meets(r.accentText, r.accentLight);
    for (const role of [r.success, r.warning, r.danger]) meets(role.text, role.light);
  };

  for (const preset of themePresets) {
    test(`${preset.id} 明暗配色的标准文字与按钮均满足4.5`, () => {
      for (const mode of ['light', 'dark'] as const) verify(preset.theme.tokens, mode);
      expect(getBuiltinDesignProse(preset.theme.id).presetId).toBe(preset.id);
    });
  }

  for (const seed of [...COLOR_SCHEMES.map(s => s.seed), '#ffffff', '#000000', '#ffff00', '#00ffff', '#ff00ff']) {
    test(`主色 ${seed} 联动色阶、表面和前景`, () => {
      const original = JSON.stringify(techBlueTheme.tokens);
      const next = applyBrandColor(techBlueTheme.tokens, seed, true);
      expect(next.colors.primary['500']).toBe(seed);
      expect(next.colors.primary).toEqual(buildPrimaryRamp(seed));
      expect(next.typography).toBe(techBlueTheme.tokens.typography);
      expect(next.colors.success).toBe(techBlueTheme.tokens.colors.success);
      expect(JSON.stringify(techBlueTheme.tokens)).toBe(original);
      for (const mode of ['light', 'dark'] as const) verify(next, mode);
    });
  }

  test('编辑、对话提案与截图提取共享完整色阶，默认不替换自定义背景', () => {
    const seed = '#b65378';
    const expected = buildPrimaryRamp(seed);
    const proposal = proposeTokenChange(`主色改成 ${seed}`, techBlueTheme.tokens)!;
    for (const tokens of [applyBrandColor(techBlueTheme.tokens, seed), proposal.apply(techBlueTheme.tokens), applyExtraction(techBlueTheme.tokens, {primary: seed})]) {
      expect(tokens.colors.primary).toEqual(expected);
      expect(tokens.colors.background).toEqual(techBlueTheme.tokens.colors.background);
    }
    expect(applyExtraction(techBlueTheme.tokens, { primary: seed, background: '#fefefe' }).colors.background.light).toBe('#fefefe');
  });

  test('旧式单色修改后，淡底不再读取其他色相的旧 ramp', () => {
    const tokens = { ...techBlueTheme.tokens, colors: { ...techBlueTheme.tokens.colors, primary: buildPrimaryRamp('#b65378') } };
    expect(resolveColorRoles(tokens, 'light').primaryLight).toBe(tokens.colors.primary['100']);
    expect(resolveColorRoles(tokens, 'dark').primaryLight).not.toBe(tokens.colors.primary['100']);
    const css = compileTokensToCss(tokens);
    expect(css).toContain('--color-on-primary:');
    expect(css).toContain('--color-primary-text:');
    expect(css).not.toContain('--color-text-muted: #94a3b8;');
  });

  test('配色方案点击通过历史管道，撤销恢复整套Token', () => {
    useProjectStore.getState().initNewProject({ name: '配色回归', deviceProfile: 'mobile', designSystem: techBlueTheme, createSpecimen: false });
    useHistoryStore.getState().clear();
    const previous = useProjectStore.getState().designSystem;
    const container = document.createElement('div'); document.body.append(container);
    const root = createRoot(container);
    try {
      act(() => root.render(<ThemeEditor onClose={() => {}} />));
      const button = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('清雅玫瑰'))!;
      expect(button).toBeDefined();
      act(() => button.click());
      expect(useProjectStore.getState().designSystem.tokens.colors.primary['500']).toBe(COLOR_SCHEMES[0].seed);
      expect(useProjectStore.getState().designSystem.tokens.colors.background).not.toEqual(previous.tokens.colors.background);
      expect(useHistoryStore.getState().past).toHaveLength(1);
      act(() => { useHistoryStore.getState().undo(); });
      expect(useProjectStore.getState().designSystem).toEqual(previous);
    } finally {
      act(() => root.unmount()); container.remove();
    }
  });

  test('生成/修改/润色均包含色彩角色规范', () => {
    const options = { designSystem: techBlueTheme, deviceProfile: 'mobile' as const, frameWidth: 390 };
    for (const prompt of [PromptBuilder.buildSystemPrompt(options), PromptBuilder.buildSystemPrompt({...options, intent: 'modify_screen'}), buildPolishPrompt(options)]) {
      expect(prompt).toContain('COLOR ROLES');
      expect(prompt).toContain('勿写死白字、蓝链接或整段彩色正文');
    }
  });
});
