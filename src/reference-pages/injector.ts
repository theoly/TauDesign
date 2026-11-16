import type { MotherInjectResult, MotherSelection } from './types';

export const DEFAULT_MOTHER_INJECT_BUDGET = 1200;

function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  if (max <= 40) return text.slice(0, max);
  return `${text.slice(0, max - 40)}\n[预算压缩：后续内容未包含]`;
}

function compositionSummary(selection: MotherSelection): string {
  const hint = selection.mother.meta.compositionHint;
  const applicable = selection.mother.meta.applicableWhen.slice(0, 3).join('；') || '无';
  return `layout=${hint.layout}; roles=${hint.regionRoles.join(',')}; cta=${hint.primaryCta}; when=${applicable}`;
}

/**
 * Build a compressed REFERENCE EXAMPLE string (summary + regions ≤ budget).
 * PromptBuilder injects this for free_create / library_bound create_screen.
 */
export function buildMotherReferenceExample(
  selection: MotherSelection,
  budgetChars: number = DEFAULT_MOTHER_INJECT_BUDGET
): MotherInjectResult {
  const { mother, regions } = selection;
  const meta = mother.meta;
  const budget = Math.max(
    240,
    Math.min(budgetChars, meta.promptBudgetChars > 0 ? meta.promptBudgetChars : budgetChars)
  );

  const header = [
    `### REFERENCE EXAMPLE (mother: ${meta.id}@v${meta.version})`,
    `用途: ${meta.pageKind}/${meta.device} · 只学结构、层级、节奏与微质感`,
    '禁止: 照搬示例姓名/金额/业务文案；禁止引入未登记图标路径',
    `布局合同摘要: ${compositionSummary(selection)}`
  ].join('\n');

  const reserved = header.length + 8;
  let remaining = Math.max(80, budget - reserved);

  const excerpts = regions.slice(0, 2);
  const bodyParts: string[] = [];

  if (excerpts.length) {
    for (let index = 0; index < excerpts.length; index++) {
      const region = excerpts[index];
      const label = `--- region:${region.role} ---`;
      const room = index === 0 ? Math.floor(remaining * 0.6) : remaining;
      const chunk = `${label}\n${clip(region.html.trim(), Math.max(40, room - label.length - 1))}`;
      if (chunk.length > remaining) break;
      bodyParts.push(chunk);
      remaining -= chunk.length + 1;
    }
  } else {
    bodyParts.push(`--- body ---\n${clip(mother.bodyHtml.trim(), remaining)}`);
  }

  const text = clip([header, ...bodyParts].join('\n'), budget);

  return {
    text,
    receipt: {
      kind: 'mother-page',
      id: meta.id,
      version: meta.version,
      fingerprint: meta.contentFingerprint
    }
  };
}
