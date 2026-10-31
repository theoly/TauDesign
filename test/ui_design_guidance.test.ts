import { expect, test } from 'bun:test';
import { ALL_CRAFT_RULES, renderCraftSection } from '../src/services/ai/craft';
import { getBaseCss } from '../src/styles/baseCss';
import { extractClassWhitelist } from '../src/utils/cssCompiler';
import { PromptBuilder } from '../src/services/ai/promptBuilder';
import { buildPolishPrompt } from '../src/services/ai/polishPrompt';
import { techBlueTheme } from '../src/utils/themePresets';

test('shared craft examples only recommend available classes on both devices', () => {
  const recommended = ALL_CRAFT_RULES.flatMap(rule =>
    rule.body.match(/\b(?:text|font|leading|tracking|bg|border|shadow|items|gap|min-w)(?:-[a-z0-9]+)+\b/g) ?? []);
  expect(recommended.length).toBeGreaterThan(5);
  for (const device of ['pc', 'mobile'] as const) {
    const whitelist = extractClassWhitelist(getBaseCss(device));
    for (const name of recommended) expect(whitelist).toContain(name);
  }
});

test('shared guidance reaches create, modify and polish without weakening polish scope', () => {
  expect(ALL_CRAFT_RULES.some(rule => rule.slug === 'layout')).toBe(true);
  for (const deviceProfile of ['pc', 'mobile'] as const) {
    const options = { designSystem: techBlueTheme, deviceProfile, frameWidth: deviceProfile === 'pc' ? 1440 : 390 };
    const polish = buildPolishPrompt({ ...options, protectedNids: ['protected1'] });
    for (const prompt of [
      PromptBuilder.buildSystemPrompt({ ...options, intent: 'create_screen' }),
      PromptBuilder.buildSystemPrompt({ ...options, intent: 'modify_screen' }),
      polish
    ]) {
      for (const rule of ALL_CRAFT_RULES) expect(prompt).toContain(rule.body);
      expect(prompt).toContain('修改仅限已授权范围');
    }
    expect(polish).toContain('The element tree must be IDENTICAL');
    expect(polish).toContain('DO NOT change any visible text content');
    expect(polish).toContain('PROTECTED NODES (leave class and style attributes untouched): protected1');
  }
  expect(renderCraftSection('question')).toBe('');
  expect(renderCraftSection('change_theme')).toBe('');
});
