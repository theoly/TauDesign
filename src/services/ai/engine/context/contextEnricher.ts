import { EngineMessage } from '../core/types';
import { DesignProse } from '../../../../types/designSystem';
import { htmlSkeletonize } from './htmlSkeleton';
import { resolveMentions } from './mentionResolver';
import { enforceBudgetGuard } from './budgetGuard';
import { resolveDesignProse } from './designProseProvider';
import { ARTIFACT_OUTPUT_CONTRACT, ARTIFACT_OUTPUT_REMINDER } from '../../promptBuilder';
import { formatTextReferences, type TextReference } from '../../textFileContext';

export interface ContextEnricherParams {
  rawPrompt: string;
  intent: 'create_screen' | 'modify_screen' | 'change_theme' | 'question';
  activeScreenId: string | null;
  screens: Record<string, { id: string; name: string; htmlContent: string; scopedCss?: string }>;
  deviceProfile: 'pc' | 'mobile';
  frameWidth: number;
  baseSystemPrompt: string;
  attachment?: { name: string; dataUrl: string };
  textReferences?: TextReference[];
  projectKnowledge?: string;
  designRules?: string[]; // PRD D18
  decisions?: Array<{ id: string; rule: string; rationale: string }>; // PRD D20
  presetId?: string;
  projectProseMarkdown?: string;
  /**
   * 上游裁决的目标画框 (BR-GT-06)。传入 `{ id }` 即锁定目标；传入 `{ id: null }`
   * 表示本轮明确不针对任何现有画框，富化器不得再自行推断或兜底绑定。
   */
  targetScreenOverride?: { id: string | null };
}

export interface EnrichedContextResult {
  messages: EngineMessage[];
  unmatchedMentions: string[];
  referencedScreens: Array<{ id: string; name: string; skeletonHtml: string }>;
  targetScreen?: {
    id: string;
    name: string;
    htmlContent: string;
    isSkeleton: boolean;
  };
  isContextTrimmed: boolean;
  warnings: string[];
  estimatedChars: number;
  designProse?: DesignProse;
}

export interface RegionTargetDefinition {
  name: string;
  keywords: string[];
  scopeNotice: string;
}

export const MOBILE_REGION_TARGETS: RegionTargetDefinition[] = [
  {
    name: '系统状态栏 (Status Bar)',
    keywords: ['系统栏', '状态栏', '信号栏', 'status bar', 'statusbar', 'system bar', '电量栏', '时间栏'],
    scopeNotice: '仅限顶部 9:41 时间、电量、WiFi 信号所在容器 (.status-bar)。绝对不得外溢破坏或清除下方导航栏 (.appbar) 或 Hero 宣传区 (.hero-section) 的渐变大色块！'
  },
  {
    name: '导航栏/标题栏 (App Bar)',
    keywords: ['导航栏', '标题栏', 'appbar', 'navbar', 'app bar'],
    scopeNotice: '仅限包含返回键、页面标题与胶囊按钮的标题栏容器 (.appbar)，严禁破坏 Hero 区或其他内容卡片。'
  },
  {
    name: 'Hero 宣传区/大图 (Hero Section)',
    keywords: ['hero', '宣传区', '头图', '大图', '大色块', '大渐变'],
    scopeNotice: '仅限头部宣传 Slogan、勋章与插画展示区 (.hero-section)。'
  },
  {
    name: '底部标签栏 (Tab Bar)',
    keywords: ['tabbar', 'tab bar', '底部标签', '底部导航', '底导', '标签栏'],
    scopeNotice: '仅限底部多标签导航切换栏 (.tabbar)。'
  },
  {
    name: '底栏/吸底操作栏 (CTA Fixed Bar)',
    keywords: ['吸底', '底栏', '底部按钮', 'cta-fixed', '固定底栏', '悬浮底栏', '底部操作'],
    scopeNotice: '仅限底部悬浮主操作按钮容器 (.cta-fixed)。'
  }
];

export const PC_REGION_TARGETS: RegionTargetDefinition[] = [
  {
    name: '侧边栏/导航菜单 (Sidebar)',
    keywords: ['侧边栏', '左侧菜单', 'sidebar', '左侧导航', '菜单栏'],
    scopeNotice: '仅限 <aside class="sidebar"> 及其内部子树，严禁外溢修改右侧主工作台或画布背景！'
  },
  {
    name: '筛选栏/工具栏 (Toolbar)',
    keywords: ['筛选栏', '工具栏', '查询栏', 'toolbar', 'filter bar', '搜索栏', '筛选区'],
    scopeNotice: '仅限搜索框、下拉筛选与查询重置按钮所在的工具栏容器 (.toolbar / .filter-bar)，严禁破坏下方数据表格或外部大卡片背景！'
  },
  {
    name: '数据表格 (Data Table)',
    keywords: ['表格', '数据表格', 'table', '列表区', '数据网格'],
    scopeNotice: '仅限 <table> 或表格容器 (.table-container)，严禁波及外部大卡片或筛选栏。'
  },
  {
    name: '分页器 (Pagination)',
    keywords: ['分页', '翻页', 'pagination'],
    scopeNotice: '仅限底部页码、每页条数与跳页控件容器 (.pagination)。'
  },
  {
    name: '页面头部/面包屑区 (Page Header)',
    keywords: ['页面头部', '面包屑', 'page header', 'page-header', '标题区'],
    scopeNotice: '仅限面包屑、页面主标题与操作按钮所在的头部容器 (.page-header)。'
  },
  {
    name: '指标卡/统计看板 (Metric Cards)',
    keywords: ['指标卡', '统计卡', 'kpi', '看板卡片', '概览卡片', 'metric'],
    scopeNotice: '仅限顶部指标卡片网格，严禁改动全页其他卡片。'
  }
];

export function detectRegionIsolationDirective(rawPrompt: string, deviceProfile: 'pc' | 'mobile'): string {
  const promptLower = rawPrompt.toLowerCase();
  const targets = deviceProfile === 'mobile'
    ? [...MOBILE_REGION_TARGETS, ...PC_REGION_TARGETS]
    : [...PC_REGION_TARGETS, ...MOBILE_REGION_TARGETS];

  const matched = targets.filter((t) => t.keywords.some((kw) => promptLower.includes(kw)));
  if (matched.length === 0) return '';

  const matchedNotices = matched.map((m) => `- 目标「${m.name}」: ${m.scopeNotice}`).join('\n');

  return `\n[专用语义区块修改与隔离守卫 (Universal Region Isolation Guard)]:
检测到用户修改指令明确针对以下特定专用区块：
${matchedNotices}
【作用域单向隔离铁律】:
1. 物理作用域隔离：修改范围严格约束在对应区块的独立语义容器内部，严禁外溢污染父级背景（例如：修改系统栏/状态栏背景绝对不得将下方 Hero 宣传区或整个 Header 的渐变大背景替换），若现有 DOM 尚未拆分独立子容器，请先拆分出独立容器生效；
2. 对比度与反色联动铁律：调整任意区块背景（如深改浅、深色渐变改纯白、浅改深）时，必须同步重置内部所有文本、图标与分割线颜色！若背景变为浅色/纯白底，原反白文字 (.text-white, .text-inverse) 必须联动转为深色文字，严禁产生“白底白字”不可读缺陷！\n`;
}

export function enrichContext(params: ContextEnricherParams): EnrichedContextResult {
  const {
    rawPrompt,
    intent,
    activeScreenId,
    screens,
    deviceProfile,
    frameWidth,
    baseSystemPrompt,
    attachment,
    textReferences = [],
    designRules = [],
    decisions = [],
    presetId,
    projectProseMarkdown,
    targetScreenOverride
  } = params;

  // 1. Resolve mentions (ISSUE-012 fix)
  const { referencedScreens, unmatchedMentions } = resolveMentions(rawPrompt, screens);

  // 2. Identify target screen if modify_screen (ISSUE-011 fix)
  let targetScreenId = activeScreenId;

  // 2.0 上游已裁决目标画框：直接采信，跳过全部推断与兜底 (BR-GT-06)
  const hasOverride = Boolean(targetScreenOverride);
  if (hasOverride) {
    targetScreenId = targetScreenOverride!.id;
  }

  // 2.1 尝试从 [引用元素 ... 画框="xxx" ...] 中提取目标画框
  const screenNameMatch = hasOverride ? null : rawPrompt.match(/画框="([^"]+)"/);
  if (screenNameMatch) {
    const matchedName = screenNameMatch[1].trim();
    const foundEntry = Object.entries(screens).find(([, s]) => s.name === matchedName);
    if (foundEntry) {
      targetScreenId = foundEntry[0];
    }
  }

  // 2.2 尝试从 nid="xxx" 中按内容反向检索目标画框
  const nidMatch = rawPrompt.match(/nid="([^"]+)"/);
  const elementNid = nidMatch ? nidMatch[1].trim() : null;
  if (!hasOverride && !targetScreenId && elementNid) {
    const foundEntry = Object.entries(screens).find(([, s]) => s.htmlContent.includes(`data-nid="${elementNid}"`));
    if (foundEntry) {
      targetScreenId = foundEntry[0];
    }
  }

  // 2.3 尝试从提示词中精准匹配已有画框全名
  if (!hasOverride && !targetScreenId) {
    const sorted = Object.entries(screens).sort(([, a], [, b]) => b.name.length - a.name.length);
    for (const [sId, s] of sorted) {
      if (s.name && s.name.length >= 2 && rawPrompt.includes(s.name)) {
        targetScreenId = sId;
        break;
      }
    }
  }

  // 2.4 若仍未匹配，但当前为修改意图且存在画框，自动绑定首个画框，确保注入上下文。
  //     上游已裁决时不得兜底——「没引用就别改现有页」的底线在此 (BR-GT-05)
  if (!hasOverride && !targetScreenId && Object.keys(screens).length > 0 && intent === 'modify_screen') {
    targetScreenId = Object.keys(screens)[0];
  }

  let targetOriginalHtml = '';
  let targetName = '';
  if (targetScreenId && screens[targetScreenId]) {
    targetOriginalHtml = screens[targetScreenId].htmlContent;
    targetName = screens[targetScreenId].name;
  }

  // 3. Enforce budget guard
  const budgetResult = enforceBudgetGuard({
    targetHtml: targetOriginalHtml,
    targetId: targetScreenId || undefined,
    targetName,
    referencedScreens,
    skeletonizeFn: htmlSkeletonize
  });

  // 3.5. Resolve Design Prose (DESIGN.md)
  const designProse = resolveDesignProse({
    presetId,
    projectProseMarkdown
  });

  // 4. Assemble System Prompt with DESIGN.md, D18 Rules and D20 Decisions
  // 遵守末位铁律 (BR-06.3 / CHK-OD-18)：D18 与 D20 章节必须严格置于 OUTPUT CONTRACT 之前
  let systemContent = baseSystemPrompt;
  const extraSections: string[] = [];

  if (designProse && designProse.rulesMarkdown && !systemContent.includes('### DESIGN SPECIFICATION')) {
    extraSections.push(`### DESIGN SPECIFICATION (DESIGN.md - [${designProse.source === 'project_override' ? '工程覆盖' : '预设基准'}]):\n${designProse.rulesMarkdown}`);
  }

  if (designRules.length > 0 && !systemContent.includes('### PROJECT CONVENTIONS')) {
    extraSections.push(`### PROJECT CONVENTIONS (D18):\n${designRules.map((r, i) => `${i + 1}. ${r}`).join('\n')}`);
  }

  if (decisions.length > 0 && !systemContent.includes('### ACTIVE DECISIONS')) {
    extraSections.push(`### ACTIVE DECISIONS (D20):\n${decisions
      .map((d) => `- [${d.id}] ${d.rule}: ${d.rationale}`)
      .join('\n')}`);
  }

  if (extraSections.length > 0) {
    const outputContractIdx = systemContent.indexOf('### OUTPUT CONTRACT');
    if (outputContractIdx !== -1) {
      const beforeContract = systemContent.slice(0, outputContractIdx).trimEnd();
      const contractPart = systemContent.slice(outputContractIdx);
      systemContent = `${beforeContract}\n\n${extraSections.join('\n\n')}\n\n${contractPart}`;
    } else {
      systemContent = `${systemContent.trimEnd()}\n\n${extraSections.join('\n\n')}\n\n${ARTIFACT_OUTPUT_CONTRACT}`;
    }
  }

  // 5. Assemble User Prompt with target screen & reference screenshots
  let userPrompt = rawPrompt;

  if (attachment) {
    userPrompt = `[Attached Reference UI Design Screenshot: "${attachment.name}"]
[VISUAL REVERSE-ENGINEERING & REPLICATION PROTOCOL (高保真视觉反推与还原协议)]:
You MUST thoroughly visually analyze the attached screenshot and reproduce its exact UI design, visual mood, layout hierarchy, and element structures into high-fidelity HTML:

1. GLOBAL CANVAS & AMBIENT MOOD (全局氛围与背景):
   - Background & Atmosphere: Carefully inspect the overall background of the screenshot. Is it a warm peach/cream/almond tint (e.g. #FFF9F0 or #FBF6EE), a cool slate tint, stark white, or dark?
   - DO NOT flatten warm or colored backgrounds to stark white! Apply ambient background classes (.bg-ambient-warm, .bg-ambient-cool, or .bg-gradient-soft) or gradient styling to the outer container.
   - Primary Gradient & Brand Palette: Detect the exact hue and gradient stops of the primary actions and headers (e.g. warm golden amber/orange gradient vs crimson vs tech blue). Ensure primary buttons, badges, and accents reflect the reference image's color warmth rather than defaulting to mismatched colors.
   - If there are floating soft rounded elements, subtle glows, or ambient decorative shapes in the background, reproduce them using subtle background shapes.

2. HERO SECTION VS. BOTTOM SHEET DECOUPLING (顶部平铺与底部卡片解耦):
   - Full-bleed Hero Integrity: If the top header (status bar, navigation, page title, hero illustration/badge) is displayed on a continuous colored or gradient background extending to the screen edges, DO NOT wrap the top area in an artificial floating card with bottom rounded corners! Keep it directly on the canvas flow (full width, no horizontal margins, no bottom radius).
   - Bottom Overlap & Flow: If the lower section consists of cards or a bottom-sheet, list cards can naturally flow beneath or gently overlap the hero. If the screenshot has a white bottom-sheet card with rounded top corners, wrap that entire lower section inside a cohesive container (e.g. .sheet-card or .card .r-xl with .p-6).

3. BUTTON PLACEMENT & IN-FLOW INTEGRITY (按钮位置与卡片流式对齐):
   - CRITICAL: Replicate the EXACT button placement shown in the screenshot!
   - Dual-state Button Styling:
     * Inactive / Completed state: subtle muted pill button (e.g. "已认证" / "已完成" in soft neutral pill styling).
     * Active Primary CTA: vibrant brand gradient button (e.g. "立即认证" / "提交") with appropriate visual prominence.
   - If the primary CTA button sits inside a card or form, KEEP IT INSIDE THE CARD! NEVER rip the button out into a fixed bottom bar (.cta-fixed) unless the screenshot explicitly shows a sticky floating bottom bar.

4. FORM MORPHOLOGY & INPUT DETAILS (输入框微形态与前缀):
   - Corner Badges (Ribbons): For corner tags (e.g. "推荐完成", "热门", "官方") attached to the top-right corner of cards, position them flush against the card's top-right boundary inside parent .card (which has overflow:hidden) or using a dedicated ribbon layout.
   - Secondary Notice Bars: For inline secondary notification strips (e.g. "你的资料已展示已认证金色徽章"), render a compact rounded container with subtle warm tint (.bg-warning-light or .bg-surface-alt) and an inline semantic icon.
   - Replicate prefix elements like country code (+86 |) accurately inside the input container using an inline row with a vertical divider (.divider-v or text divider), and replicate inline action buttons directly inside or alongside the input field.

5. FEATURE CARDS & SOCIAL PROOF (功能卡片与社交背书):
   - Multi-item Alignment: When feature cards, action pills, or options sit in a row, use .row .gap-2 .flex-1 or .grid-2 / .grid-3.
   - Visual Balance: Balance left-hand icon badges (e.g. icon inside a soft rounded container .r-md with subtle background tint) against the main title, subtitle, and right-hand action.
   - Replicate social proof elements or avatar clusters when present using .avatar-group with .avatar and accompanying text.

6. STRICT ANTI-HALLUCINATION (严格语义抗幻觉与真实还原):
   - STRICT ANTI-HALLUCINATION: ONLY render icons that visibly exist in the screenshot!
   - NEVER invent cartoon smileys (☺) or arbitrary emojis when official verification badges, shields, checkmarks, or locks are shown! Use clean semantic SVG icons (<svg class="icon" ...>).
   - Accurately preserve text hierarchy without unwanted line breaks on badges or titles.
   - CONTENT SCOPE FIDELITY (内容范围忠实度): ONLY reproduce functional sections, menu items, tags, badges, or feature blocks that are visibly present in the screenshot. DO NOT invent, add, or supplement extra sections/items that do not appear in the reference image, even if they seem like a common or natural addition for this type of page. If the user's own request explicitly asks for additional content beyond the screenshot, that explicit instruction takes precedence — but never add unrequested "nice-to-have" content on your own initiative.

7. DEVIATION DISCLOSURE (设计取舍披露 — 严格受限的例外):
   - You MUST still output exactly one complete <artifact>...</artifact> block as normal. This section ONLY concerns what may optionally follow AFTER the closing </artifact> tag.
   - By default, output NOTHING after </artifact>. This exception applies ONLY when the reference image genuinely conflicts with the project's existing state on one of these three axes:
     (a) navigation structure / information architecture, (b) an already-active project decision, (c) a component the project mandates reusing.
   - Purely aesthetic differences (corner radius, exact hue, spacing) are NEVER grounds for this exception — silently follow the project's own aesthetic system for those.
   - When (and only when) a genuine conflict on one of the three axes above exists, you MAY append EXACTLY ONE block of this exact shape immediately after </artifact>, with no other text before, between, or after it:
     <deviation-note>{"conflict": "...", "chosen": "...", "alternative": "...", "alternativeInstruction": "..."}</deviation-note>
   - All four fields are required, non-empty strings:
     - "conflict": what the reference image shows vs. what the project's existing state requires.
     - "chosen": which option you actually used in the <artifact> you just produced, and why.
     - "alternative": the other option, described precisely.
     - "alternativeInstruction": a precise, self-contained instruction that could be sent verbatim as the NEXT user turn to switch this screen to the alternative — not a vague description.
   - At most ONE <deviation-note> per response. If multiple such conflicts exist, report only the single most significant one.
   - When you are unsure whether a conflict qualifies, do NOT emit the note — silence is always the safe default.

User Request: ${userPrompt}`;
  }

  if (textReferences.length > 0) {
    userPrompt = `${userPrompt}\n\n${formatTextReferences(textReferences)}`;
  }

  // Inject target screen if modifying (ISSUE-011 core)
  const isTargetedScreenModification =
    (intent === 'modify_screen' || Boolean(elementNid)) &&
    Boolean(targetScreenId) &&
    Boolean(budgetResult.targetScreenHtml);

  const regionDirective = detectRegionIsolationDirective(rawPrompt, deviceProfile);

  if (isTargetedScreenModification && targetScreenId) {
    const elementDirective = elementNid
      ? `\n[定向元素精准修改约束]: 用户明确引用了画框中 data-nid="${elementNid}" 的元素。请必须在完整输出该画框 HTML 时，重点对此节点进行精准设计与填充，严禁新建画框！除被修改元素外，其余已有布局结构和所有已有 data-nid 必须完整保留。\n`
      : '';

    userPrompt = `[待修改目标画框当前 ${budgetResult.targetIsSkeleton ? '骨架' : 'HTML'}] (名称: "${targetName}"):
\`\`\`html
${budgetResult.targetScreenHtml}
\`\`\`
${elementDirective}${regionDirective}
[重要修改约束]: 请在严格保留原有业务内容、文本和已有 data-nid 的基础上进行指定调整。必须且仅输出被 <artifact identifier="${targetScreenId}" type="screen" title="${targetName}"> 与 </artifact> 包裹的完整 HTML，严禁输出 identifier="screen_new"。\n\n${ARTIFACT_OUTPUT_REMINDER}\n\n用户修改需求: ${userPrompt}`;
  } else {
    userPrompt = `${userPrompt}${regionDirective}\n\n[指令约束: 适配当前 ${deviceProfile} 设备 (${frameWidth}px)，必须且仅输出被 <artifact identifier="screen_new" type="screen" title="贴切精简页面标题(不超过20字)"> 与 </artifact> 包裹的完整高保真页面，严禁在标签外输出寒暄或解释]\n\n${ARTIFACT_OUTPUT_REMINDER}`;
  }

  // Inject referenced screen skeletons if any
  if (budgetResult.referencedScreens.length > 0) {
    const refsBlock = budgetResult.referencedScreens
      .map((r) => `[参考画框风格骨架: "${r.name}"]:\n\`\`\`html\n${r.skeletonHtml}\n\`\`\``)
      .join('\n\n');
    userPrompt = `${refsBlock}\n\n${userPrompt}`;
  }

  if (params.projectKnowledge) userPrompt = `${params.projectKnowledge}\n\n[本轮用户要求]\n${userPrompt}`;

  const messages: EngineMessage[] = [
    { role: 'system', content: systemContent },
    {
      role: 'user',
      content: userPrompt,
      imageUrl: attachment ? attachment.dataUrl : undefined
    }
  ];

  const estimatedChars = messages.reduce((acc, m) => acc + (m.content?.length || 0), 0);

  return {
    messages,
    unmatchedMentions,
    referencedScreens: budgetResult.referencedScreens,
    targetScreen: targetScreenId
      ? {
          id: targetScreenId,
          name: targetName,
          htmlContent: budgetResult.targetScreenHtml,
          isSkeleton: budgetResult.targetIsSkeleton
        }
      : undefined,
    isContextTrimmed: budgetResult.isContextTrimmed,
    warnings: budgetResult.warnings,
    estimatedChars,
    designProse
  };
}
