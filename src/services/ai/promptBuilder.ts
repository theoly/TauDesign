import { referenceDevicePrompt } from '../../utils/referenceDevice';
import { mobileNavigationPrompt } from '../../utils/mobileNavigation';
import type { ReferenceDevice } from '../../types/project';
import { renderDesignBrief, type DesignBrief, type PageKind } from './designBrief';
import { renderComponentContracts, renderProjectComponents } from './componentContracts';
import { DesignSystem } from '../../types/designSystem';
import { Asset, ComponentDefinition, Decision } from '../../types/project';
import { compileTokensToCss, extractClassWhitelist } from '../../utils/cssCompiler';
import { getBaseCss } from '../../styles/baseCss';
import { GOLDEN_HIERARCHY, NEW_SCREEN_STATE_RULES, getDeviceAestheticRules } from './aestheticRules';
import { renderCraftSection } from './craft';
import { buildContextualCraft,renderFrozenCraft } from './designKnowledge/promptAdapter';
import type { RuleQuery } from './designKnowledge/types';
import { resolveDesignProse } from './engine/context/designProseProvider';
import {
  resolveBeautyPromptBundle,
  type BeautyLaneInput
} from './beautyLane';
import {
  buildVisualStyleLock,
  renderVisualStyleLock,
  type VisualStyleLock
} from './visualStyleLock';
import { buildMotherReferenceExample } from '../../reference-pages/injector';
import { matchMother } from '../../reference-pages/retriever';
import type { MotherDensity, MotherPageKind, MotherSelection } from '../../reference-pages/types';

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
- title 属性规范：必须是从页面业务内容提炼的导航标题，简短贴切且不超过 20 个汉字（例如：“动态详情”、“会员中心”、“材料上传”、“说说这次决定”）。用户若明确指定标题则用用户原话；否则根据将生成的页面主标题/核心任务命名。严禁把需求提示词前缀、角色设定（如「你是微信原生小程序…」）、系统约束或长段说明截断当作 title。`;

/**
 * contextEnricher 末尾追加的单行提醒，必须由 ARTIFACT_OUTPUT_CONTRACT 派生
 */
export const ARTIFACT_OUTPUT_REMINDER = `[输出约束: 仅输出单个 <artifact> 块，块外不得有任何文本、说明或 markdown 代码块]`;

/** Soft upper bound for create system prompts (existing ≤12k contract tests). */
export const SYSTEM_PROMPT_CHAR_BUDGET = 11999;

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
  /** A continuing task uses its validated frozen selection instead of today's catalog. */
  frozenGuidance?: import('./designKnowledge/types').RuleSelection;
  /** Experimental only; absent preserves the baseline. Device always comes from the project. */
  contextualGuidance?: Omit<RuleQuery,'device'>;
  designSystem: DesignSystem;
  decisions?: Decision[] | Array<{ id: string; rule: string; rationale: string }> | string[];
  designRules?: string[];
  designProseMarkdown?: string;
  designProseSource?: 'project_override' | 'builtin_preset';
  deviceProfile: 'pc' | 'mobile';
  useCustomNavigation?: boolean;
  frameWidth: number;
  referenceDevice?: ReferenceDevice;
  viewportGuideHeight?: number;
  components?: ComponentDefinition[];
  mediaAssets?:ReadonlyArray<Pick<Asset,'name'|'relPath'>>;
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
  componentRequest?: string;
  taskBrief?: DesignBrief;
  /** Optional page kind override when taskBrief is absent (tests / callers). */
  pageKind?: PageKind;
  /** Optional request text for mother matching when taskBrief.goal is absent. */
  requestText?: string;
  /** Manual mother id override for retriever. */
  userMotherId?: string;
  /** Explicit 1:1 restore wording (feeds BeautyLane). */
  restoreIntent?: boolean;
  /** Design-library binding present (library_bound lane). */
  hasDesignLibraryBinding?: boolean;
  /** Pre-built VisualStyleLock; free_create may synthesize when absent. */
  visualStyleLock?: VisualStyleLock | null;
  /** 润色共享完整设计上下文，但使用自己的输出格式。 */
  outputContract?: string;
}

function shortReferenceFallback(device: 'pc' | 'mobile'): string {
  return `### REFERENCE EXAMPLE (fallback):
完整结构见 COMPONENT LIBRARY；按业务组合，勿照搬示例文案。
${device === 'mobile' ? '移动端单列；系统顶栏不写入页面HTML。' : 'PC用.container-max；正文与操作分组。'}
用户文案完整保留。`;
}

function resolveMotherPageKind(pageKind: PageKind | undefined): MotherPageKind | PageKind | undefined {
  if (!pageKind || pageKind === 'unknown') return pageKind;
  return pageKind;
}

function resolveMotherSelection(
  options: PromptBuildOptions,
  beauty: ReturnType<typeof resolveBeautyPromptBundle>
): MotherSelection | null {
  if (!beauty.allowMotherInjection) return null;
  const pageKind = options.pageKind ?? options.taskBrief?.scene?.pageKind;
  const requestText =
    options.requestText ?? options.taskBrief?.goal ?? options.componentRequest;
  const density = options.designSystem.tokens.personality.density as MotherDensity;
  return matchMother({
    device: options.deviceProfile,
    pageKind: resolveMotherPageKind(pageKind),
    requestText,
    density,
    hasAttachment: options.hasAttachment,
    userMotherId: options.userMotherId
  });
}

function buildReferenceExampleSection(
  options: PromptBuildOptions,
  beauty: ReturnType<typeof resolveBeautyPromptBundle>,
  mother: MotherSelection | null
): string | null {
  const intent = options.intent ?? 'create_screen';
  if (intent !== 'create_screen' || options.hasAttachment) return null;
  if (mother) {
    // Prefer structure prior under create ≤12k; tighten when brief/conventions inflate the prompt.
    const budget = options.taskBrief ? 480 : 1000;
    return buildMotherReferenceExample(mother, budget).text;
  }
  return shortReferenceFallback(options.deviceProfile);
}

function joinSections(sections: Array<{ id: PromptSectionId; content: string }>): string {
  return sections.map((s) => s.content).join('\n\n');
}

/**
 * Keep create system prompts inside the ≤12k contract.
 * Prefer dropping optional craft tails; never erase baseline craft titles or StyleLock header.
 */
function fitSystemPromptToBudget(
  sections: Array<{ id: PromptSectionId; content: string }>,
  budget: number = SYSTEM_PROMPT_CHAR_BUDGET
): string {
  let text = joinSections(sections);
  if (text.length <= budget) return text;

  const craftIdx = sections.findIndex((s) => s.id === 'craft_references');
  if (craftIdx < 0) return text;

  const applyCraft = (craft: string) => {
    sections[craftIdx] = { ...sections[craftIdx], content: craft };
    text = joinSections(sections);
    return text.length <= budget;
  };

  let craft = sections[craftIdx].content;

  // Prefer shrinking references/mothers before dropping StyleLock (E5 free_create lock).
  // Never drop CONTEXTUAL SCENE RULES — guidance receipts need renderRule() text.

  const refIdx = sections.findIndex((s) => s.id === 'reference_example');
  if (refIdx >= 0 && text.length > budget) {
    const current = sections[refIdx].content;
    // Empty mother shells only burn budget; drop them before deeper craft cuts.
    if (/^### REFERENCE EXAMPLE \(mother:[^\n]+\)\s*$/.test(current.trim())) {
      sections.splice(refIdx, 1);
      text = joinSections(sections);
    } else if (!current.includes('(mother:')) {
      const device: 'pc' | 'mobile' =
        text.includes('MOBILE Profile') || text.includes('DEVICE RULES — MOBILE') ? 'mobile' : 'pc';
      sections[refIdx] = { ...sections[refIdx], content: shortReferenceFallback(device) };
      text = joinSections(sections);
    }
  }

  if (refIdx >= 0 && text.length > budget) {
    const current = sections[refIdx].content;
    const motherHeader = current.match(/^### REFERENCE EXAMPLE \(mother:[^\n]+\)/);
    if (motherHeader) {
      const overflow = text.length - budget;
      const suffix = '\n[母版摘要已按预算压缩]';
      const keep = Math.max(motherHeader[0].length + 24, current.length - overflow - suffix.length);
      sections[refIdx] = {
        ...sections[refIdx],
        content: `${current.slice(0, keep).trimEnd()}${suffix}`
      };
      text = joinSections(sections);
    }
  }

  if (text.length > budget) {
    const craftIdx2 = sections.findIndex((s) => s.id === 'craft_references');
    if (craftIdx2 >= 0) {
      let c = sections[craftIdx2].content;
      const compactMobile =
        'DEVICE RULES — MOBILE (390px):\n- SINGLE COLUMN ONLY.\n- NO HOVER STATES.\n- WIDTH CONTAINMENT: ≤390px; no 100vw; root <main class="col …">; .row.wrap; CTA may wrap.\n- PAGE GUTTER: body>main ~16px inset; keep content inset, never flush right. Only .hero-section/.full-bleed/.tabbar/.cta-fixed/.appbar/.status-bar edge-to-edge.\n- TABBAR: .tabbar equal-split .tabbar-item; optional .tabbar-soft/.tabbar-dock.\n- FULL-BLEED HERO BANNERS & GRADIENTS; CTA BUTTON PLACEMENT: ALWAYS match the button placement in the reference; RIBBON BADGES & STATUS STRIPS.\n- SEMANTIC REGION DECOUPLING: Never emit invisible white-on-white text.\n';
      const next = c.replace(
        /DEVICE RULES — MOBILE \(390px\):[\s\S]*?(?=\nWECHAT NATIVE NAVIGATION|\nCUSTOM MOBILE NAVIGATION|\n#### 视觉层次金律)/,
        compactMobile
      );
      // Never expand an already-compressed mobile block.
      if (next.length < c.length) {
        sections[craftIdx2] = { ...sections[craftIdx2], content: next };
        text = joinSections(sections);
        craft = sections[craftIdx2].content;
      }
    }
  }

  if (refIdx >= 0 && text.length > budget) {
    const current = sections[refIdx].content;
    const motherHeader = current.match(/^### REFERENCE EXAMPLE \(mother:[^\n]+\)/);
    if (motherHeader && current.length > motherHeader[0].length + 32) {
      // Keep mother id receipt; drop body rather than wiping to a bare header.
      sections[refIdx] = {
        ...sections[refIdx],
        content: `${motherHeader[0]}\n[母版摘要已按预算压缩]`
      };
      text = joinSections(sections);
    } else if (!motherHeader) {
      const headerEnd = current.indexOf('\n');
      if (headerEnd > 0) {
        const overflow = text.length - budget;
        const body = current.slice(headerEnd + 1);
        const keptBody = body.slice(0, Math.max(0, body.length - overflow)).trimEnd();
        sections[refIdx] = {
          ...sections[refIdx],
          content: `${current.slice(0, headerEnd)}\n${keptBody}`
        };
        text = joinSections(sections);
      }
    }
  }

  // Last resort only: drop StyleLock after mother/device compression.
  if (text.length > budget) {
    craft = sections[craftIdx].content;
    const lockAt = craft.indexOf('\n### VISUAL STYLE LOCK');
    if (lockAt !== -1) {
      craft = craft.slice(0, lockAt).trimEnd();
      if (applyCraft(craft)) return text;
    }
    const lockAtHead = craft.indexOf('### VISUAL STYLE LOCK');
    if (lockAtHead === 0 || (lockAtHead > 0 && craft[lockAtHead - 1] === '\n')) {
      craft = craft.slice(0, lockAtHead).trimEnd();
      if (applyCraft(craft)) return text;
    }
  }

  return text;
}

export class PromptBuilder {
  public static buildSystemPrompt(options: PromptBuildOptions): string {
    const intent: GenerationIntent = options.intent ?? 'create_screen';
    const sections: Array<{ id: PromptSectionId; content: string }> = [];

    const beautyInput: BeautyLaneInput = {
      intent,
      hasAttachment: options.hasAttachment,
      restoreIntent: options.restoreIntent,
      hasDesignLibraryBinding: options.hasDesignLibraryBinding,
      request: options.requestText ?? options.taskBrief?.goal ?? options.componentRequest
    };
    const beauty = resolveBeautyPromptBundle(beautyInput);
    const motherSelection =
      intent === 'create_screen' && !options.hasAttachment
        ? resolveMotherSelection(options, beauty)
        : null;

    // 1. role_core
    const roleContent = `### ROLE & CORE CONSTRAINTS:
TauDesign UI/UX引擎：生成精致语义HTML5。
1. STYLING: 仅用白名单类与CSS变量；禁硬编码hex/rgb与<script>。
2. ICONS & IMAGES: .icon/.icon-mask；输入用.input-group；媒体仅资源清单真实路径或HTTPS；禁data URL/base64/内联SVG媒体。优先.icon-mask+mask-image/-webkit-mask-image引用外部SVG，background-color:currentColor。禁无名图标按钮。参考图走Provider输入字段，不写入页面代码。
3. DEVICE: Width ${options.frameWidth}px (${options.deviceProfile.toUpperCase()})；高度随内容。${referenceDevicePrompt({ ...options, viewportGuideHeight: options.viewportGuideHeight ?? (options.deviceProfile === 'mobile' ? 844 : 900) })}
BACKGROUND ROLES: 新页body继承--background-page，根透明；.btn-primary: --background-primary-action；.bg-decorative-surface: --background-decorative-surface。explicit优先；local保留背景。
4. COLOR MODE: ${(options.colorMode ?? 'light').toUpperCase()} mode; Tokens已按此模式解析。NEVER hardcode a color literal. 用var(--color-*)/--background-*或白名单类适配toggle light/dark。${
     options.hasAttachment && options.intent!=='question'
       ? `\n5. REFERENCE IMAGE FIDELITY: 截图作布局/内容参考，用项目Token(.bg-ambient-warm/.bg-ambient-cool/.bg-gradient-soft)；设备/导航/组件/编辑范围优先。全宽头图勿人造底圆角浮卡。NARROW EXCEPTION (deviation-note): artifact外文本仅遵循 DEVIATION DISCLOSURE。`
       : ''
   }`;
    sections.push({ id: 'role_core', content: roleContent });

    // 2. design_spec (BR-03 / REQ-OD-03)
    const prose = options.designProseMarkdown
      ? { rulesMarkdown: options.designProseMarkdown, source: options.designProseSource || 'project_override' }
      : resolveDesignProse({ presetId: options.designSystem.id });
    const sourceTag = prose.source === 'project_override' ? '工程覆盖' : '内置预设';
    const specContent = `### DESIGN SPECIFICATION (DESIGN.md - [${sourceTag}]):\n${prose.rulesMarkdown}`;
    sections.push({ id: 'design_spec', content: specContent });

    // 3. design_tokens
    const tokensCss = compileTokensToCss(options.designSystem.tokens, options.colorMode ?? 'light', options.deviceProfile)
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\n\s*/g, '').trim();
    const tokensContent = `### DESIGN TOKENS:\n\`\`\`css\n${tokensCss}\n\`\`\``;
    sections.push({ id: 'design_tokens', content: tokensContent });

    // 4. class_whitelist
    const classWhitelist = extractClassWhitelist(getBaseCss(options.deviceProfile))
      .map((c) => `.${c}`)
      .join(',');
    const whitelistContent = `### CLASS WHITELIST (derived from base.css — these are the ONLY classes that exist):\n${classWhitelist}`;
    sections.push({ id: 'class_whitelist', content: whitelistContent });

    // Resolve scene appendix early so optional sections can yield budget to additive rules.
    const wantsCraft = intent === 'create_screen' || intent === 'modify_screen';
    let sceneAppendix = '';
    let craftBaseForSections = wantsCraft ? renderCraftSection(intent) : '';
    if (wantsCraft && options.frozenGuidance) {
      const frozen = renderFrozenCraft(intent, options.frozenGuidance);
      if (frozen.startsWith(craftBaseForSections)) sceneAppendix = frozen.slice(craftBaseForSections.length);
      else craftBaseForSections = frozen;
    } else if (wantsCraft && options.contextualGuidance) {
      const built = buildContextualCraft(intent, {
        ...options.contextualGuidance,
        device: options.deviceProfile
      });
      if (built.body.startsWith(craftBaseForSections)) sceneAppendix = built.body.slice(craftBaseForSections.length);
      else craftBaseForSections = built.body;
    }

    // 5. 组件契约：默认不塞 HTML 范例（保 ≤12k / StyleLock / 母版）；媒体路径单独短清单。
    // 有场景规则时改短 stub，避免 guided create 相对 baseline 增长。
    if (intent === 'create_screen' || intent === 'modify_screen') {
      const requestText = options.componentRequest ?? '';
      const assets = options.mediaAssets ?? [];
      let mediaNote = '';
      if (assets.length) {
        mediaNote =
          `\n已登记独立资源（仅用下列路径；优先.icon-mask，禁止内联 SVG 或 path 标签）：\n` +
          assets.map((a) => `- ${a.name}: ${a.relPath}`).join('\n');
      } else if (/通知|角标|徽标|badge|图标/i.test(requestText)) {
        mediaNote =
          '\n图标结构示例未提供：当前未登记对应独立资源，不得猜测路径或改为内联SVG。';
      }
      if (sceneAppendix) {
        sections.push({
          id: 'component_library',
          content:
            '### COMPONENT LIBRARY (REUSABLE PROJECT COMPONENTS)\n沿用 COMPONENT CONTRACTS；修改或润色只调整已授权节点。' +
            mediaNote
        });
      } else {
        sections.push({
          id: 'component_library',
          content: `### COMPONENT LIBRARY (REUSABLE PROJECT COMPONENTS)
${renderComponentContracts(false, requestText, assets)}${mediaNote}${
            options.components?.length
              ? `\n\n${renderProjectComponents(options.components)}`
              : ''
          }`
        });
      }
    }

    // 6. craft_references (REQ-OD-06 / BR-06.1~6.2) — baseline craft always present; scene rules append last.
    if (wantsCraft) {
      let craftBase = craftBaseForSections;
      // When contextual scene rules append (create additive path), keep baseline craft titles
      // but drop optional tails / compress device copy so guided ≤ unguided message budget
      // (protocol dry-run: 最终请求字符预算不得增长). Full device rules remain without scene.
      const deviceRules = sceneAppendix
        ? options.deviceProfile === 'pc'
          ? 'DEVICE RULES — PC (1440px):\n- .container-max≤1200px；SEMANTIC REGIONS: sidebar/toolbar/filter-bar。\n'
          : `DEVICE RULES — MOBILE (390px):\n- SINGLE COLUMN ONLY.\n- NO HOVER STATES.\n- WIDTH CONTAINMENT: ≤390px; no 100vw; root <main class="col">.\n- PAGE GUTTER: body>main ~16px inset; never flush right. Only .hero-section/.full-bleed/.tabbar/.cta-fixed/.appbar/.status-bar edge-to-edge.\n- TABBAR: .tabbar equal-split .tabbar-item; optional .tabbar-soft/.tabbar-dock.\n- FULL-BLEED HERO BANNERS & GRADIENTS; CTA BUTTON PLACEMENT: ALWAYS match the button placement in the reference; RIBBON BADGES & STATUS STRIPS.\n- SEMANTIC REGION DECOUPLING: Never emit invisible white-on-white text.\n${mobileNavigationPrompt({ deviceProfile: 'mobile', useCustomNavigation: options.useCustomNavigation })}`
        : getDeviceAestheticRules(options.deviceProfile, options.useCustomNavigation);
      const includeCreateState =
        intent === 'create_screen' && !motherSelection && !sceneAppendix;
      let craftContent = `${craftBase}${includeCreateState ? `\n\n${NEW_SCREEN_STATE_RULES}` : ''}\n\n#### 设备档位专属工艺约束 (${options.deviceProfile.toUpperCase()} Profile)\n${deviceRules}\n\n#### 视觉层次金律 (VISUAL HIERARCHY)\n${GOLDEN_HIERARCHY}`;

      if (sceneAppendix) craftContent += sceneAppendix;

      if (beauty.allowVisualStyleLock && !sceneAppendix) {
        const lock =
          options.visualStyleLock !== undefined
            ? options.visualStyleLock
            : buildVisualStyleLock({
                lane: beauty.lane,
                density: options.designSystem.tokens.personality.density
              });
        const lockText = renderVisualStyleLock(lock);
        if (lockText) craftContent += `\n\n${lockText}`;
      }

      sections.push({ id: 'craft_references', content: craftContent });
    }

    // 7. reference_example — mother injector first (BeautyLane gated); short prose fallback only.
    // Skip when scene rules already occupy the optional budget (guided create parity).
    const referenceExample = sceneAppendix
      ? null
      : buildReferenceExampleSection(options, beauty, motherSelection);
    if (referenceExample) {
      sections.push({ id: 'reference_example', content: referenceExample });
    }

    // 8. project_conventions (PRD D18)
    if (options.designRules?.length || options.taskBrief) {
      const rulesContent = `### PROJECT CONVENTIONS (D18):\n${(options.designRules || [])
        .map((r, i) => `${i + 1}. ${r}`)
        .join('\n')}${options.taskBrief ? `\n${renderDesignBrief(options.taskBrief)}` : ''}`;
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
    sections.push({ id: 'output_contract', content: options.outputContract ?? ARTIFACT_OUTPUT_CONTRACT });

    // Always fit create/modify prompts; question/theme are already small.
    return intent === 'create_screen' || intent === 'modify_screen'
      ? fitSystemPromptToBudget(sections)
      : joinSections(sections);
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
