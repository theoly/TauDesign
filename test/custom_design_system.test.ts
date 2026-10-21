import { describe, expect, test } from 'bun:test';
import { generateCustomDesignSystems, retainDesignSystemCandidates, normalizeCustomPrimary, type CustomDesignSystemOptions } from '../src/utils/customDesignSystem';
import { themePresets } from '../src/utils/themePresets';
import { compileTokensToCss } from '../src/utils/cssCompiler';
import { contrastRatio, resolveColorRoles } from '../src/utils/colorHarmony';
import { getBuiltinDesignProse } from '../src/styles/presets/designProse';

const options: CustomDesignSystemOptions = { primary: '#b65378', style: 'modern', density: 'compact', radius: 'rounded' };

describe('custom design system candidates', () => {
  test('custom and imported themes never silently inherit technology blue prompt styling', () => {
    for (const id of ['theme-custom-example', 'import-example']) {
      const prose = getBuiltinDesignProse(id);
      expect(prose.presetId).toBe(id.replace(/^theme-/, ''));
      expect(prose.rulesMarkdown).toContain('当前 Token');
      expect(prose.rulesMarkdown).not.toContain('靛蓝紫');
      expect(prose.rulesMarkdown).not.toContain('Linear / Stripe');
    }
  });
  test('normalizes shorthand colors and rejects invalid colors instead of silently using a previous theme', () => {
    expect(normalizeCustomPrimary(' #AbC ')).toBe('#aabbcc');
    expect(normalizeCustomPrimary('#B65378')).toBe('#b65378');
    for (const invalid of ['', '#12', '#gg1234', 'red', '#12345678']) {
      expect(normalizeCustomPrimary(invalid)).toBeNull();
      expect(() => generateCustomDesignSystems({ ...options, primary: invalid }, 0)).toThrow();
    }
  });

  test('same options and seed produce identical complete candidates with distinct tokens', () => {
    const candidates = generateCustomDesignSystems(options, 7);
    expect(candidates).toHaveLength(3);
    expect(candidates).toEqual(generateCustomDesignSystems(options, 7));
    expect(new Set(candidates.map(c => c.theme.id)).size).toBe(3);
    expect(new Set(candidates.map(c => JSON.stringify(c.theme.tokens))).size).toBe(3);
    for (const { theme, options: input } of candidates) {
      expect(input).toEqual(options);
      expect(theme.tokens.colors.primary['500']).toBe(options.primary);
      expect(theme.tokens.personality.density).toBe('compact');
      expect(theme.tokens.radius.md).toBe('14px');
      for (const mode of ['light', 'dark'] as const) {
        expect(compileTokensToCss(theme.tokens, mode)).toContain('--color-primary:');
        expect(compileTokensToCss(theme.tokens, mode)).not.toContain('undefined');
        const roles = resolveColorRoles(theme.tokens, mode);
        expect(contrastRatio(roles.textPrimary, theme.tokens.colors.surface[mode])).toBeGreaterThanOrEqual(4.5);
        for (const shadow of Object.values(theme.tokens.shadows)) expect(shadow[mode]).toBeTruthy();
      }
    }
  });

  test('reroll changes visual tokens while preserving all requested choices and preset sources', () => {
    const before = JSON.stringify(themePresets);
    const initial = generateCustomDesignSystems(options, 0);
    const next = generateCustomDesignSystems(options, 1);
    expect(next[0].theme.tokens).not.toEqual(initial[0].theme.tokens);
    for (const candidate of [...initial, ...next]) {
      expect(candidate.options).toEqual(options);
      expect(candidate.theme.tokens.colors.primary['500']).toBe(options.primary);
      expect(candidate.theme.tokens.radius).toEqual(initial[0].theme.tokens.radius);
    }
    next[0].theme.tokens.typography.sizes.md = 99;
    expect(next[1].theme.tokens.typography.sizes.md).not.toBe(99);
    expect(JSON.stringify(themePresets)).toBe(before);
  });

  test('style choices change surfaces, shadows and typography while density and radius remain explicit', () => {
    const minimal = generateCustomDesignSystems({ ...options, style: 'minimal', density: 'relaxed', radius: 'sharp' }, 2)[0].theme.tokens;
    const warm = generateCustomDesignSystems({ ...options, style: 'warm', density: 'relaxed', radius: 'sharp' }, 2)[0].theme.tokens;
    expect(minimal.colors.background).not.toEqual(warm.colors.background);
    expect(minimal.shadows).not.toEqual(warm.shadows);
    expect(minimal.typography).not.toEqual(warm.typography);
    expect(minimal.personality.density).toBe('relaxed');
    expect(warm.personality.density).toBe('relaxed');
    expect(minimal.radius.md).toBe('4px');
    expect(warm.radius).toEqual(minimal.radius);
  });

  test('retains previous selectable candidates and pins selected candidate when bounded history fills', () => {
    let candidates = generateCustomDesignSystems(options, 0);
    const selected = candidates[1];
    const next = generateCustomDesignSystems(options, 1);
    candidates = retainDesignSystemCandidates(candidates, next, selected.theme.id);
    expect(candidates).toHaveLength(6);
    expect(candidates).toContain(selected);
    expect(candidates[0]).toBe(next[0]);
    for (let seed = 2; seed < 20; seed++) candidates = retainDesignSystemCandidates(candidates, generateCustomDesignSystems(options, seed), selected.theme.id);
    expect(candidates).toHaveLength(12);
    expect(candidates).toContain(selected);
    expect(new Set(candidates.map(c => c.theme.id)).size).toBe(12);
    expect(retainDesignSystemCandidates(candidates, candidates, selected.theme.id)).toHaveLength(12);
  });
});
