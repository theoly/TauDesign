import { CraftRule } from './types';
import { typographyCraft } from './typography';
import { colorCraft } from './color';
import { antiAiSlopCraft } from './anti-ai-slop';
import { layoutCraft } from './layout';
import { GenerationIntent } from '../promptBuilder';

export * from './types';
export * from './typography';
export * from './color';
export * from './anti-ai-slop';
export * from './layout';

/** 通用工艺规则的固定让位前言：冲突时一律以 DESIGN SPECIFICATION 为准 (REQ-OD-06 / BR-06.1) */
export const CRAFT_DEFERENCE_PREAMBLE =
  '以下为通用工艺参考；凡与 DESIGN SPECIFICATION 冲突之处，一律以 DESIGN SPECIFICATION 为准。';

export const ALL_CRAFT_RULES: CraftRule[] = [
  typographyCraft,
  colorCraft,
  antiAiSlopCraft,
  layoutCraft
];

export function getCraftRules(intent: GenerationIntent = 'create_screen'): CraftRule[] {
  if (intent === 'change_theme' || intent === 'question') {
    return [];
  }
  return ALL_CRAFT_RULES.filter((rule) => rule.appliesTo.includes(intent));
}

export function renderCraftSection(intent: GenerationIntent = 'create_screen'): string {
  const rules = getCraftRules(intent);
  if (rules.length === 0) return '';

  const rulesBody = rules
    .map((r) => `#### ${r.title}\n${r.body}`)
    .join('\n\n');

  return `### CRAFT REFERENCES:\n${CRAFT_DEFERENCE_PREAMBLE}\n\n${rulesBody}`;
}
