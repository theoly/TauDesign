import type { ReferenceDevice } from '../../types/project';
import type { DesignSystem } from '../../types/designSystem';
import type { DeviceProfile } from '../../styles/baseCss';
import type { ComponentDefinition, Decision } from '../../types/project';
import { PromptBuilder } from './promptBuilder';

/**
 * 质感润色 / 风格重塑的 Prompt (A3 / T-AE-26, T-AE-27)。
 *
 * 与 `buildSystemPrompt` 的关键差异：这里**不是生成新页面**，而是在既有 DOM 上
 * 做视觉重构。因此约束的重点从「怎么设计」转向「什么不许动」——
 * 模型很容易顺手删掉它认为多余的容器或合并列表项，那样用户丢的是**内容**。
 *
 * 结构承诺由 `utils/structureGuard.ts` 强制校验，Prompt 只是第一道防线。
 */

export interface PolishOptions {
  designSystem: DesignSystem;
  deviceProfile: DeviceProfile;
  useCustomNavigation?: boolean;
  frameWidth: number;
  referenceDevice?: ReferenceDevice;
  viewportGuideHeight?: number;
  colorMode?: 'light' | 'dark';
  /** Restyle 时附加的目标风格描述；Polish 留空表示只提升质感、不改风格调性 */
  styleDirective?: string;
  /** 这些 nid 存在 L4 手动覆盖，改动它们的样式没有意义（会被 !important 挡住） */
  protectedNids?: string[];
  components?: ComponentDefinition[];
  designRules?: string[];
  decisions?: Decision[] | Array<{ id: string; rule: string; rationale: string }>;
  designProseMarkdown?: string;
}

const IMMUTABLE_RULES = `STRUCTURAL CONTRACT (violating ANY of these makes the output be REJECTED outright):
1. DO NOT add, remove, reorder, merge or split any element. The element tree must be IDENTICAL.
2. DO NOT change any visible text content. Every label, heading, number, name and placeholder stays byte-for-byte.
3. PRESERVE every data-nid attribute exactly as given. They are the identity of each node; losing them breaks the user's edits, style overrides and undo history.
4. DO NOT introduce <script>, inline event handlers, or hardcoded hex/rgb colors.

WHAT YOU MAY CHANGE (this is the entire job):
- The class attribute of any element — swap to better utility classes from the whitelist.
- The inner markup of an existing <svg> icon, or add an <svg class="icon"> inside an element that has none.
- Nothing else.`;

export function buildPolishPrompt(options: PolishOptions): string {
  const outputContract = `### OUTPUT CONTRACT — POLISH (STRICT):
Return ONLY the rewritten HTML inside a \`\`\`html code block. No commentary before or after.
必须且仅输出被 \`\`\`html 包裹的完整 HTML，严禁任何解释性文字。
${IMMUTABLE_RULES}
${options.protectedNids?.length ? `PROTECTED NODES (leave class and style attributes untouched): ${options.protectedNids.join(', ')}` : ''}
${options.styleDirective ? `TARGET STYLE: ${options.styleDirective}` : ''}`;
  return PromptBuilder.buildSystemPrompt({ ...options, intent: 'modify_screen', outputContract });
}

/** 把 StyleDNA 三问的答案转成 Restyle 的目标风格描述 */
export function describeTargetStyle(designSystem: DesignSystem): string {
  const t = designSystem.tokens;
  const density = { compact: '紧凑高密度', standard: '标准', relaxed: '宽松舒展' }[t.personality.density];
  return [
    `Primary color ${t.colors.primary['500']}.`,
    `Corner radius scale: md ${t.radius.md}, lg ${t.radius.lg}.`,
    `Spacing density: ${density}.`,
    `Border subtlety: ${t.personality.borderAlpha}.`,
    `Use .shadow-soft / .shadow-card for elevation and .badge-soft for status.`
  ].join(' ');
}
