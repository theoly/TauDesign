import { describe, expect, test } from 'bun:test';
import { PromptBuilder } from '../src/services/ai/promptBuilder';
import { buildContextualCraft } from '../src/services/ai/designKnowledge/promptAdapter';
import { antiAiSlopCraft } from '../src/services/ai/designKnowledge/core';
import { GOLDEN_HIERARCHY } from '../src/services/ai/aestheticRules';
import { techBlueTheme } from '../src/utils/themePresets';
import { buildDesignBrief } from '../src/services/ai/designBrief';

const base = {
  designSystem: techBlueTheme,
  decisions: [] as [],
  deviceProfile: 'pc' as const,
  frameWidth: 1440,
  intent: 'create_screen' as const
};

describe('E5 beauty prompt wiring', () => {
  test('create + list injects compressed mother id into REFERENCE EXAMPLE', () => {
    const brief = buildDesignBrief({
      request: '会员列表卡片筛选管理',
      designSystem: techBlueTheme,
      device: 'pc',
      mode: 'light',
      globalDecisions: [],
      components: [],
      pageKind: 'list'
    });
    const prompt = PromptBuilder.buildSystemPrompt({
      ...base,
      taskBrief: brief,
      requestText: '会员列表卡片筛选管理',
      pageKind: 'list'
    });
    expect(prompt).toContain('### REFERENCE EXAMPLE (mother:');
    expect(prompt).toMatch(/mother: pc-list-(cards|table)@/);
    expect(prompt).not.toContain('### REFERENCE EXAMPLE (fallback):');
    expect(prompt.length).toBeLessThan(12000);
  });

  test('free_create without brief injects VisualStyleLock summary', () => {
    const prompt = PromptBuilder.buildSystemPrompt(base);
    expect(prompt).toContain('### VISUAL STYLE LOCK');
    expect(prompt).toContain('brandPrimaryRole: primary');
  });

  test('attachment / restore lanes do not inject marketing mothers', () => {
    const withAttachment = PromptBuilder.buildSystemPrompt({
      ...base,
      hasAttachment: true,
      pageKind: 'list',
      requestText: '会员列表卡片筛选管理'
    });
    expect(withAttachment).not.toContain('(mother:');
    expect(withAttachment).not.toContain('### REFERENCE EXAMPLE');

    const restore = PromptBuilder.buildSystemPrompt({
      ...base,
      restoreIntent: true,
      pageKind: 'list',
      requestText: '请按参考图 1:1 还原会员列表'
    });
    expect(restore).not.toContain('(mother:');
    expect(restore).toContain('### REFERENCE EXAMPLE (fallback):');
    expect(restore).not.toContain('### VISUAL STYLE LOCK');
  });

  test('additive craft keeps baseline titles when scene rules append', () => {
    const { body, selection } = buildContextualCraft('create_screen', {
      request: '长正文挤成一列',
      operation: 'create',
      device: 'pc',
      scope: 'page',
      maxChars: 10000
    });
    expect(selection.selected.length).toBeGreaterThan(0);
    expect(body).toContain('排版与文字阶梯 (Typography Craft)');
    expect(body).toContain('反 AI 塑料感与审美负面清单 (Anti-AI-Slop Craft)');
    expect(body).toContain('色彩平衡与对比度 (Color Craft)');
    expect(body).toContain('内容与空间 (Layout Craft)');
    expect(body).toContain('#### CONTEXTUAL SCENE RULES');
    expect(body).toContain('[LY-04@1]');

    const prompt = PromptBuilder.buildSystemPrompt({
      ...base,
      contextualGuidance: {
        request: '长正文挤成一列',
        operation: 'create',
        scope: 'page',
        maxChars: 10000
      }
    });
    expect(prompt).toContain('排版与文字阶梯 (Typography Craft)');
    expect(prompt).toContain('[LY-04@1]');
    expect(prompt.length).toBeLessThan(12000);
  });

  test('anti-slop and golden hierarchy forbid inline SVG icons', () => {
    expect(antiAiSlopCraft.body).toContain('.icon/.icon-mask');
    expect(antiAiSlopCraft.body).toMatch(/禁用emoji与内联SVG|禁止内联SVG/);
    expect(antiAiSlopCraft.body).toContain('aria-label');
    expect(antiAiSlopCraft.body).not.toMatch(/功能图标用内联SVG/);
    expect(GOLDEN_HIERARCHY).toContain('禁止内联SVG');
    expect(GOLDEN_HIERARCHY).toContain('.icon/.icon-mask');
    expect(GOLDEN_HIERARCHY).toContain('禁无名图标按钮');
  });

  test('create system prompt stays within existing ≤12k budget', () => {
    const prompt = PromptBuilder.buildSystemPrompt(base);
    expect(prompt.length).toBeGreaterThan(10000);
    expect(prompt.length).toBeLessThan(12000);
  });
});
