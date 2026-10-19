import { classifyIntent } from './intentClassifier';

/**
 * 生成目标单一裁决点 (doc/feature/generation-target-routing/spec.md)
 *
 * 此前「有没有引用画框」与「用户要不要改」这两件事在 6 处各判一次
 * （ChatDrawer / useAIEngineChat / intentClassifier / contextEnricher / toolResolver /
 * applyTargetResolver），且其中 4 处会在判不出目标时**兜底绑定第一个画框**。
 * 直接后果：用户没引用任何画框，一句「按附件图片精准创建/修改页面」就把现有页面覆盖了。
 *
 * 本模块把裁决收敛为一次：输入引用来源与原始诉求，输出唯一的
 * {动作, 目标画框, 风格参考画框}，下游各层只消费、不再自行推断。
 */

export type GenerationAction =
  | 'create_screen'
  | 'modify_screen'
  | 'patch_element'
  | 'change_theme'
  | 'question'
  /** 明确要求修改，但既无引用也无当前页面可指——拒绝动手，引导用户先引用 */
  | 'needs_reference';

/** 引用来源，用于气泡回显与排查 */
export type ReferenceSource = 'toggle' | 'mention' | 'element' | 'screen_name' | 'active_screen';

export interface GenerationTargetInput {
  rawPrompt: string;
  screens: Record<string, { id: string; name: string; htmlContent: string }>;
  /** 输入框里显式启用的画框引用（引用开关） */
  referenceToggleScreenId?: string | null;
  /**
   * 画布当前激活画框。**它本身不构成引用**——只有在用户明确说了「修改页面/当前页」
   * 时才作为「当前页面」的所指，这正是 BR-GT-03 与旧行为的分界。
   */
  activeScreenId?: string | null;
  /** 元素引用（Add to Chat） */
  elementRef?: { nid: string; screenName?: string } | null;
}

export interface GenerationTarget {
  action: GenerationAction;
  /** 需要被覆盖修改的画框；新建/提问/改主题时为 null */
  targetScreenId: string | null;
  /** 新建时作为风格参考与排布锚点的画框；不会被修改 */
  styleReferenceScreenId: string | null;
  elementNid: string | null;
  referenceSource: ReferenceSource | null;
  reason: string;
}

/** 明确要求新建：命中后即便有引用也走新建，引用画框仅作风格参考 */
export const EXPLICIT_CREATE_KEYWORDS = [
  '新建页面', '新建画框', '新建一个页面', '创建新页面', '创建新画框',
  '生成新页面', '生成新画框', '设计新页面', '设计新画框', '新增页面', '新增画框',
  '做一张新页面', '再来一个页面', '再加一个页面', '加一张新页面', '加一个页面'
];

/**
 * 双态口令（快捷短语「按附件图片精准创建/修改页面」）。
 * 必须先于明确修改口令判定——"创建/修改页面" 里本就含有子串 "修改页面"。
 */
export const DUAL_INTENT_KEYWORDS = ['创建/修改', '新建/修改', '创建或修改', '新建或修改'];

/** 明确要求修改现有页面 */
export const EXPLICIT_MODIFY_KEYWORDS = [
  '按附件图片精准修改', '按附件图片修改', '按图精准修改', '按图修改', '按参考图修改',
  '精准修改', '修改页面', '修改当前', '修改此', '修改该', '修改画框',
  '修改本页', '修改这一页', '改当前', '改这一页', '替换当前', '更新当前',
  '优化当前', '优化页面', '优化画框', '优化本页', '润色当前', '润色页面', '调整当前页面', '改进当前页面'
];

/**
 * 造页动词。命中即说明用户在要一张页面，而不是在调主题——
 * 「参考这个风格做一个新的注册页」里的"风格"会被主题分类器抢走，此表用于拦下它。
 */
const PAGE_CREATE_VERBS = ['做一个', '做个', '做一张', '新建', '创建', '生成', '设计一个', '来一个', '搞一个', '出一版'];

/** 「以某页为参考新建」的语义词，仅用于给新建画框挑排布锚点 */
const STYLE_REFERENCE_KEYWORDS = ['参考', '基于', '类似', '仿照', '照着', '右侧', '右边', '根据', '衍生'];

export type CommandKind = 'explicit_create' | 'dual' | 'explicit_modify' | 'neutral';

/** 口令分类。顺序即优先级：双态 > 明确新建 > 明确修改 > 中性 */
export function classifyCommand(rawPrompt: string): { kind: CommandKind; hit?: string } {
  const t = rawPrompt.trim();

  const dual = DUAL_INTENT_KEYWORDS.find((kw) => t.includes(kw));
  if (dual) return { kind: 'dual', hit: dual };

  const create = EXPLICIT_CREATE_KEYWORDS.find((kw) => t.includes(kw));
  if (create) return { kind: 'explicit_create', hit: create };

  const modify = EXPLICIT_MODIFY_KEYWORDS.find((kw) => t.includes(kw));
  if (modify) return { kind: 'explicit_modify', hit: modify };

  return { kind: 'neutral' };
}

interface ResolvedReference {
  screenId: string;
  source: ReferenceSource;
}

/** 解析显式引用：引用开关 > @提及 > 提示词中出现画框全名 (BR-GT-02) */
export function resolveExplicitReference(
  rawPrompt: string,
  screens: GenerationTargetInput['screens'],
  referenceToggleScreenId?: string | null
): ResolvedReference | null {
  if (referenceToggleScreenId && screens[referenceToggleScreenId]) {
    return { screenId: referenceToggleScreenId, source: 'toggle' };
  }

  // 长名优先，避免「登录」抢走「登录注册页」
  const sorted = Object.entries(screens).sort(([, a], [, b]) => b.name.length - a.name.length);

  for (const [sid, s] of sorted) {
    if (rawPrompt.includes(`@${s.name}`) || rawPrompt.includes(`@${sid}`)) {
      return { screenId: sid, source: 'mention' };
    }
  }

  for (const [sid, s] of sorted) {
    if (s.name && s.name.trim().length >= 2 && rawPrompt.includes(s.name)) {
      return { screenId: sid, source: 'screen_name' };
    }
  }

  return null;
}

function findElementScreen(
  elementRef: NonNullable<GenerationTargetInput['elementRef']>,
  screens: GenerationTargetInput['screens'],
  fallbackIds: Array<string | null | undefined>
): string | null {
  if (elementRef.screenName) {
    const byName = Object.entries(screens).find(([, s]) => s.name === elementRef.screenName);
    if (byName) return byName[0];
  }
  const byNid = Object.entries(screens).find(([, s]) =>
    s.htmlContent.includes(`data-nid="${elementRef.nid}"`)
  );
  if (byNid) return byNid[0];

  for (const id of fallbackIds) {
    if (id && screens[id]) return id;
  }
  return null;
}

/**
 * 裁决本轮生成的动作与落点。
 *
 * 两条铁律：
 * - **无引用 → 绝不修改现有画框**，除非用户明确说了「修改…」并且存在当前激活画框 (BR-GT-03)；
 * - **有引用 + 没明确说新建 → 一律修改引用画框** (BR-GT-04)。
 */
export function resolveGenerationTarget(input: GenerationTargetInput): GenerationTarget {
  const { rawPrompt, screens, referenceToggleScreenId, activeScreenId, elementRef } = input;
  const screenIds = Object.keys(screens);

  const base: GenerationTarget = {
    action: 'create_screen',
    targetScreenId: null,
    styleReferenceScreenId: null,
    elementNid: null,
    referenceSource: null,
    reason: ''
  };

  // 1. 元素引用是最强特征：只改该元素所在画框的局部 (BR-GT-01)
  const inlineElementRef = elementRef || parseInlineElementRef(rawPrompt);
  if (inlineElementRef) {
    const screenId = findElementScreen(inlineElementRef, screens, [referenceToggleScreenId, activeScreenId]);
    if (screenId) {
      return {
        ...base,
        action: 'patch_element',
        targetScreenId: screenId,
        elementNid: inlineElementRef.nid,
        referenceSource: 'element',
        reason: `元素引用 #${inlineElementRef.nid}`
      };
    }
  }

  const reference = resolveExplicitReference(rawPrompt, screens, referenceToggleScreenId);
  const command = classifyCommand(rawPrompt);

  // 2. 提问与纯主题诉求不触碰画布，沿用既有分类器
  const classified = classifyIntent(rawPrompt, Boolean(reference));
  if (classified.intent === 'question') {
    return { ...base, action: 'question', reason: classified.reason };
  }
  const hasPageCreateVerb = PAGE_CREATE_VERBS.some((v) => rawPrompt.includes(v));
  if (classified.intent === 'change_theme' && !hasPageCreateVerb) {
    return { ...base, action: 'change_theme', reason: classified.reason };
  }

  // 3. 有引用 (BR-GT-04)
  if (reference) {
    if (command.kind === 'explicit_create') {
      return {
        ...base,
        action: 'create_screen',
        styleReferenceScreenId: reference.screenId,
        referenceSource: reference.source,
        reason: `已引用「${screens[reference.screenId].name}」但明确要求新建（"${command.hit}"），新建并以其为风格参考`
      };
    }
    return {
      ...base,
      action: 'modify_screen',
      targetScreenId: reference.screenId,
      referenceSource: reference.source,
      reason:
        command.kind === 'explicit_modify'
          ? `引用「${screens[reference.screenId].name}」且明确要求修改（"${command.hit}"）`
          : command.kind === 'dual'
          ? `引用「${screens[reference.screenId].name}」且为双态口令（"${command.hit}"），按修改执行`
          : `引用「${screens[reference.screenId].name}」且未要求新建，默认修改引用画框`
    };
  }

  // 4. 无引用 + 明确要求修改 → 只认「当前激活画框」；无当前页面时绝不猜 (BR-GT-03)
  if (command.kind === 'explicit_modify') {
    if (activeScreenId && screens[activeScreenId]) {
      return {
        ...base,
        action: 'modify_screen',
        targetScreenId: activeScreenId,
        referenceSource: 'active_screen',
        reason: `未引用画框，但明确要求修改（"${command.hit}"），落到当前激活画框「${screens[activeScreenId].name}」`
      };
    }
    if (screenIds.length === 1) {
      return {
        ...base,
        action: 'modify_screen',
        targetScreenId: screenIds[0],
        referenceSource: 'active_screen',
        reason: `未引用画框，但明确要求修改（"${command.hit}"），工程仅有一个画框「${screens[screenIds[0]].name}」`
      };
    }
    return {
      ...base,
      action: 'needs_reference',
      reason: `明确要求修改（"${command.hit}"），但当前既未引用画框也无激活画框，已停止以免误改`
    };
  }

  // 5. 无引用 + 新建/双态/中性 → 一律新建，绝不触碰现有画框 (BR-GT-05)
  const wantsStyleReference =
    activeScreenId &&
    screens[activeScreenId] &&
    STYLE_REFERENCE_KEYWORDS.some((kw) => rawPrompt.includes(kw));

  return {
    ...base,
    action: 'create_screen',
    styleReferenceScreenId: wantsStyleReference ? activeScreenId! : null,
    reason:
      command.kind === 'explicit_create'
        ? `明确要求新建（"${command.hit}"）`
        : command.kind === 'dual'
        ? `未引用画框且为双态口令（"${command.hit}"），按新建执行`
        : '未引用画框且未要求修改，按新建执行'
  };
}

/** 从 Prompt 里解析 Add to Chat 注入的元素引用标记 */
export function parseInlineElementRef(rawPrompt: string): { nid: string; screenName?: string } | null {
  const tagged = rawPrompt.match(/\[引用元素\s+nid="([^"]+)"(?:\s+画框="([^"]+)")?/);
  if (tagged) return { nid: tagged[1], screenName: tagged[2] };
  if (rawPrompt.includes('元素片段:')) {
    const bare = rawPrompt.match(/nid="([^"]+)"/);
    if (bare) return { nid: bare[1] };
  }
  return null;
}
