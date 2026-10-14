import { DesignSystem } from '../../types/designSystem';
import { ComponentDefinition, Decision } from '../../types/project';
import { compileTokensToCss, extractClassWhitelist } from '../../utils/cssCompiler';
import { getBaseCss } from '../../styles/baseCss';
import { GOLDEN_HIERARCHY, getDeviceAestheticRules, getFewShotExample } from './aestheticRules';
import { renderCraftSection } from './craft';
import { resolveDesignProse } from './engine/context/designProseProvider';

export type GenerationIntent = 'create_screen' | 'modify_screen' | 'change_theme' | 'question';

export type PromptSectionId =
  | 'role_core'
  | 'design_spec'
  | 'design_tokens'
  | 'class_whitelist'
  | 'component_library'
  | 'craft_references'
  | 'reference_example'
  | 'project_conventions'
  | 'active_decisions'
  | 'output_contract';

/**
 * BR-06.3 章节顺序契约：System Prompt 必须严格按下表顺序拼装，
 * 缺省章节整节省略但不得改变相对次序；output_contract 恒为最后一节。
 */
export const PROMPT_SECTION_ORDER: readonly PromptSectionId[] = [
  'role_core',
  'design_spec',
  'design_tokens',
  'class_whitelist',
  'component_library',
  'craft_references',
  'reference_example',
  'project_conventions',
  'active_decisions',
  'output_contract'
] as const;

/**
 * BR-06.4 <artifact> 输出契约的唯一字面量来源
 */
export const ARTIFACT_OUTPUT_CONTRACT = `### OUTPUT CONTRACT (MANDATORY):
You MUST return the complete, standalone HTML design enclosed strictly inside an explicit <artifact> block:
<artifact identifier="screen_new" type="screen" title="Page Title">
... HTML content ...
</artifact>
- The root element inside the artifact must be a container element with utility classes, such as <div class="card p-6 ...">, <main class="p-6 ...">, <section class="p-6 ...">, or <form class="card p-6 ...">.
- Absolutely DO NOT output conversational chatter, greetings, explanations, or markdown code blocks outside or around the <artifact> block.
- 必须且仅输出单个被 <artifact identifier="..." type="screen" title="..."> 与 </artifact> 包裹的高保真 HTML，严禁在标签之外输出任何解释、寒暄或 Markdown 文本。顶层容器请使用 <div>, <main>, <section> 或 <form>。
- title 属性规范：必须为贴切的页面标题，在表达贴切的同时尽量简短，不要超过 20 个汉字（例如：“动态详情”、“会员中心”、“送花表达心意 - 牵手币充值”），严禁长篇大论或冗余说明。`;

/**
 * contextEnricher 末尾追加的单行提醒，必须由 ARTIFACT_OUTPUT_CONTRACT 派生
 */
export const ARTIFACT_OUTPUT_REMINDER = `[输出约束: 仅输出单个 <artifact> 块，块外不得有任何文本、说明或 markdown 代码块]`;

const SECTION_HEADER_MAP: Record<PromptSectionId, string> = {
  role_core: '### ROLE & CORE CONSTRAINTS',
  design_spec: '### DESIGN SPECIFICATION',
  design_tokens: '### DESIGN TOKENS',
  class_whitelist: '### CLASS WHITELIST',
  component_library: '### COMPONENT LIBRARY',
  craft_references: '### CRAFT REFERENCES',
  reference_example: '### REFERENCE EXAMPLE',
  project_conventions: '### PROJECT CONVENTIONS',
  active_decisions: '### ACTIVE DECISIONS',
  output_contract: '### OUTPUT CONTRACT'
};

/**
 * 供测试断言实际产出的章节序列 (BR-06.3 / CHK-OD-11)
 */
export function extractSectionOrder(systemPrompt: string): PromptSectionId[] {
  const matches: Array<{ id: PromptSectionId; index: number }> = [];
  for (const id of PROMPT_SECTION_ORDER) {
    const header = SECTION_HEADER_MAP[id];
    const idx = systemPrompt.indexOf(header);
    if (idx !== -1) {
      matches.push({ id, index: idx });
    }
  }
  matches.sort((a, b) => a.index - b.index);
  return matches.map((m) => m.id);
}

export interface PromptBuildOptions {
  designSystem: DesignSystem;
  decisions?: Decision[] | Array<{ id: string; rule: string; rationale: string }> | string[];
  designRules?: string[];
  designProseMarkdown?: string;
  designProseSource?: 'project_override' | 'builtin_preset';
  deviceProfile: 'pc' | 'mobile';
  frameWidth: number;
  components?: ComponentDefinition[];
  /**
   * 当前工程生效的明暗模式 (ISSUE-015)。Token 必须按此模式编译，
   * 否则模型看到的是另一套色值，会照着它写死颜色。
   */
  colorMode?: 'light' | 'dark';
  /**
   * 决定美学段落的注入粒度 (T-AE-10 / REQ-OD-06)。
   * Few-Shot 范例仅在新建画框时注入；change_theme / question 零注入。
   */
  intent?: GenerationIntent;
  /**
   * 是否附带参考设计图 (Vision / Attachment)。
   * 若附带参考图，必须抑制通用的登录 Few-Shot 范例，避免将锁头图标、固定吸底等代码污染进复刻结果。
   */
  hasAttachment?: boolean;
}

export class PromptBuilder {
  public static buildSystemPrompt(options: PromptBuildOptions): string {
    const intent: GenerationIntent = options.intent ?? 'create_screen';
    const sections: Array<{ id: PromptSectionId; content: string }> = [];

    // 1. role_core
    const roleContent = `### ROLE & CORE CONSTRAINTS:
You are the Expert AI UI/UX Design Engine for "TauDesign".
You generate production-ready HTML and styles for web and mobile applications using modern, token-driven, pixel-perfect design standards.
1. STYLING ARCHITECTURE:
   - Output ONLY clean, valid HTML5 with semantic structures.
   - You MUST use the provided utility class names and CSS variables.
   - ABSOLUTELY NO arbitrary inline styles with hardcoded hex/rgb colors (e.g. style="color: #123456" is FORBIDDEN).
   - All colors, margins, fonts, radii, and shadows MUST reference CSS variables or white-listed classes.
   - DO NOT include <script> tags.
2. ICONS & IMAGES:
   - Use inline SVG icons with stroke="currentColor" and class="icon" (default 20x20px).
   - NEVER output bare, unconstrained SVGs inside input fields or cards without class="icon".
   - When placing icons inside text inputs, ALWAYS wrap them in <div class="input-group"><svg class="icon" .../><input class="input" .../></div>.
   - For images, you may use placeholder SVG data URLs or valid image URLs.
3. TARGET DEVICE PROFILE:
   - Width: ${options.frameWidth}px (${options.deviceProfile.toUpperCase()})
   - Height: Content driven (natural height)
4. COLOR MODE (CRITICAL):
   - The project is currently rendering in ${(options.colorMode ?? 'light').toUpperCase()} mode.
   - The token values below are already resolved for ${(options.colorMode ?? 'light').toUpperCase()} mode. Do NOT infer a different mode from them.
   - NEVER hardcode a color literal. The user can toggle light/dark at any time, and the page MUST follow that toggle automatically.
   - This only works if every color comes from var(--color-*) or a white-listed class. A literal such as background:#0b1020 permanently freezes the page in one mode and is a defect.${
     options.hasAttachment
       ? `\n5. REFERENCE IMAGE FIDELITY:
   - Faithfully reproduce visual warmth and palette (.bg-ambient-warm, .bg-ambient-cool, .bg-gradient-soft).
   - For full-bleed headers, avoid artificial floating cards with bottom rounded corners.
   - NARROW EXCEPTION (deviation-note): the "no text outside <artifact>" rule above has exactly one scoped exception, fully specified in the DEVIATION DISCLOSURE section of the user message below. Follow that section's conditions precisely; do not invent a different format.`
       : ''
   }`;
    sections.push({ id: 'role_core', content: roleContent });

    // 2. design_spec (BR-03 / REQ-OD-03)
    const prose = options.designProseMarkdown
      ? { rulesMarkdown: options.designProseMarkdown, source: options.designProseSource || 'builtin_preset' }
      : resolveDesignProse({ presetId: options.designSystem.id });
    const sourceTag = prose.source === 'project_override' ? '工程覆盖' : '内置预设';
    const specContent = `### DESIGN SPECIFICATION (DESIGN.md - [${sourceTag}]):\n${prose.rulesMarkdown}`;
    sections.push({ id: 'design_spec', content: specContent });

    // 3. design_tokens
    const tokensCss = compileTokensToCss(options.designSystem.tokens, options.colorMode ?? 'light', options.deviceProfile);
    const tokensContent = `### DESIGN TOKENS:\n\`\`\`css\n${tokensCss}\n\`\`\``;
    sections.push({ id: 'design_tokens', content: tokensContent });

    // 4. class_whitelist
    const classWhitelist = extractClassWhitelist(getBaseCss(options.deviceProfile))
      .map((c) => `.${c}`)
      .join(', ');
    const whitelistContent = `### CLASS WHITELIST (derived from base.css — these are the ONLY classes that exist):\n${classWhitelist}`;
    sections.push({ id: 'class_whitelist', content: whitelistContent });

    // 5. component_library
    if (options.components && options.components.length > 0) {
      const activeComponents = options.components
        .map(
          (c) =>
            `- 组件名称: ${c.name} (${c.id})\n  结构摘要: ${c.templateHtml
              .replace(/\s+/g, ' ')
              .slice(0, 160)}...`
        )
        .join('\n');
      sections.push({
        id: 'component_library',
        content: `### COMPONENT LIBRARY (REUSABLE PROJECT COMPONENTS - PRD §3.7.4 MANDATORY REUSE):\nWhen generating layouts that include repeating widgets or cards, you MUST adopt the structure and styling of these existing components:\n${activeComponents}`
      });
    }

    // 6. craft_references (REQ-OD-06 / BR-06.1~6.2)
    const wantsCraft = intent === 'create_screen' || intent === 'modify_screen';
    if (wantsCraft) {
      const craftBase = renderCraftSection(intent);
      const deviceRules = getDeviceAestheticRules(options.deviceProfile);
      const craftContent = `${craftBase}\n\n#### 设备档位专属工艺约束 (${options.deviceProfile.toUpperCase()} Profile)\n${deviceRules}\n\n#### 视觉层次金律 (VISUAL HIERARCHY)\n${GOLDEN_HIERARCHY}`;
      sections.push({ id: 'craft_references', content: craftContent });
    }

    // 7. reference_example (T-AE-10 / 仅无参考图的纯文本 create_screen 时注入)
    if (intent === 'create_screen' && !options.hasAttachment) {
      const exampleContent = `### REFERENCE EXAMPLE (match this level of polish, not its content):\n\`\`\`html\n${getFewShotExample(
        options.deviceProfile
      )}\n\`\`\``;
      sections.push({ id: 'reference_example', content: exampleContent });
    }

    // 8. project_conventions (PRD D18)
    if (options.designRules && options.designRules.length > 0) {
      const rulesContent = `### PROJECT CONVENTIONS (D18):\n${options.designRules
        .map((r, i) => `${i + 1}. ${r}`)
        .join('\n')}`;
      sections.push({ id: 'project_conventions', content: rulesContent });
    }

    // 9. active_decisions (PRD D20)
    if (options.decisions && options.decisions.length > 0) {
      const activeDecisions = options.decisions.filter((d: any) => {
        if (typeof d === 'object' && d !== null && 'active' in d) {
          return d.active !== false;
        }
        return true;
      });
      if (activeDecisions.length > 0) {
        const decisionsList = activeDecisions.map((d: any) => {
          if (typeof d === 'string') return `- ${d}`;
          if (d.rule) return `- [${d.id || 'DEC'}] ${d.rule}${d.rationale ? `: ${d.rationale}` : ''}`;
          return `- ${d.text}`;
        });
        sections.push({
          id: 'active_decisions',
          content: `### ACTIVE DECISIONS (D20):\n${decisionsList.join('\n')}`
        });
      }
    }

    // 10. output_contract (恒为末位 / 末位铁律)
    sections.push({ id: 'output_contract', content: ARTIFACT_OUTPUT_CONTRACT });

    return sections.map((s) => s.content).join('\n\n');
  }

  public static buildIntentAnalysisPrompt(userInput: string, existingScreensCount: number): string {
    return `Analyze the user's design request and identify the intent.
User Request: "${userInput}"

Possible Intents:
- "create_screen": User wants to create a new page/artboard.
- "modify_screen": User wants to change/redesign the currently selected page.
- "change_theme": User wants to adjust colors, theme, or design tokens.
- "question": User is asking a question or clarifying requirements.

Reply in strictly valid JSON:
{
  "intent": "create_screen" | "modify_screen" | "change_theme" | "question",
  "screenName": "Proposed accurate and concise screen name (<= 20 chars, e.g. 动态详情)",
  "summary": "One sentence summary echo to show the user before execution"
}`;
  }

  public static parseMentions(text: string): string[] {
    const matches = text.match(/@([^\s@]+(?:\s*\([^)]+\))?)/g) || [];
    return matches.map((m) => m.slice(1).trim());
  }
}
