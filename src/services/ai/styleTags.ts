import type { DesignSystemTokens } from '../../types/designSystem';
import { applyBrandColor } from '../../utils/colorHarmony';

/**
 * 对话框风格标签 (A2 / T-AE-21)。
 *
 * StyleDNA 三个入口中的「本轮临时覆盖」：
 *   - 新建工程三问  → 设初始值（写入工程）
 *   - **对话框标签  → 本轮临时覆盖（不写入工程）**
 *   - 设计约定面板  → 持久修改（写入工程）
 *
 * 三者读写同一份 StyleDNA 概念，但作用域不同。标签只注入当轮 Prompt，
 * **绝不改动 designSystem 或 decisions**——用户点一下标签就永久改掉工程风格
 * 是不可接受的意外。参见 doc/aesthetic/spec.md §6.1。
 */
export interface StyleTag {
  id: string;
  label: string;
  /** 注入当轮 system prompt 的设计约定 */
  directive: string;
}

export const STYLE_TAGS: StyleTag[] = [
  {
    id: 'minimal',
    label: '🌿 极简留白',
    directive: 'Favor generous whitespace and restraint: larger section spacing, hairline borders, minimal or no shadows, limited color usage. Hierarchy comes from space and weight, not decoration.'
  },
  {
    id: 'glow',
    label: '⚡ 高质感微光',
    directive: 'Apply a refined engineered look: .shadow-soft on cards, .shadow-glow on the primary action, .border-subtle instead of hard borders, and dense but well-aligned information.'
  },
  {
    id: 'round',
    label: '🧁 温暖大圆角',
    directive: 'Use the largest radius steps (.r-lg / .r-xl) on cards and buttons, warm soft shadows, generous padding, and a friendly approachable tone in all copy.'
  },
  {
    id: 'glass',
    label: '🌌 深色毛玻璃',
    directive: 'Build an immersive dark surface treatment: use .glass for overlay panels, .border-subtle for edges, and .shadow-glow for emphasis. Keep contrast high enough for text legibility.'
  },
  {
    id: 'dense',
    label: '📊 高信息密度',
    directive: 'Maximize information per screen: compact spacing, table/list layouts over large cards, .text-sm body text, and .badge-soft for compact status indicators.'
  }
];

/** 组装本轮附加的风格指令；无选中标签时返回空串 */
export function buildStyleTagDirectives(tagIds: string[]): string {
  const picked = STYLE_TAGS.filter((t) => tagIds.includes(t.id));
  if (picked.length === 0) return '';
  return `\n### STYLE TAGS (this request only — do NOT treat as permanent project rules):\n${picked
    .map((t) => `- ${t.directive}`)
    .join('\n')}\n`;
}

/**
 * 从自然语言中提取可量化的 Token 调整候选 (A2 / T-AE-25)。
 *
 * ISSUE-007 的剩余部分：意图分类器已能识别 change_theme，但识别之后无处可去。
 * 本函数把"圆角再大一些"这类表述映射为具体的 Token 变更提案，
 * 交由候选卡片让用户确认——**绝不静默写入**（spec §8.2 规则 1）。
 */
export interface TokenProposal {
  /** 人类可读的变更描述 */
  label: string;
  apply: (t: DesignSystemTokens) => DesignSystemTokens;
}

const RADIUS_STEPS: Array<DesignSystemTokens['radius']> = [
  { none: '0px', sm: '2px', md: '4px', lg: '6px', xl: '8px', full: '9999px' },
  { none: '0px', sm: '4px', md: '8px', lg: '12px', xl: '16px', full: '9999px' },
  { none: '0px', sm: '6px', md: '12px', lg: '16px', xl: '24px', full: '9999px' },
  { none: '0px', sm: '8px', md: '14px', lg: '20px', xl: '28px', full: '9999px' }
];

const DENSITIES: Array<DesignSystemTokens['personality']['density']> = ['compact', 'standard', 'relaxed'];

export function proposeTokenChange(text: string, current: DesignSystemTokens): TokenProposal | null {
  const t = text.trim();
  const bigger = /(大|圆润|柔和)(一?些|一点|点)?|加大|调大/.test(t);
  const smaller = /(小|锐利|方正|硬朗)(一?些|一点|点)?|减小|调小/.test(t);
  const looser = /(松|宽松|舒展|放松|透气)(一?些|一点|点)?/.test(t);
  const tighter = /(紧凑|挤|密)(一?些|一点|点)?/.test(t);

  if (/圆角/.test(t) && (bigger || smaller)) {
    const idx = RADIUS_STEPS.findIndex((r) => r.md === current.radius.md);
    const cur = idx < 0 ? 1 : idx;
    const next = Math.min(RADIUS_STEPS.length - 1, Math.max(0, cur + (bigger ? 1 : -1)));
    if (next === cur) return null;
    return {
      label: `圆角尺度调整为 md ${RADIUS_STEPS[next].md}（当前 ${current.radius.md}）`,
      apply: (tok) => ({ ...tok, radius: RADIUS_STEPS[next] })
    };
  }

  if (/(间距|留白|密度)/.test(t) && (looser || tighter)) {
    const cur = DENSITIES.indexOf(current.personality.density);
    const next = Math.min(DENSITIES.length - 1, Math.max(0, cur + (looser ? 1 : -1)));
    if (next === cur) return null;
    return {
      label: `间距密度调整为「${DENSITIES[next]}」（当前 ${current.personality.density}）`,
      apply: (tok) => ({ ...tok, personality: { ...tok.personality, density: DENSITIES[next] } })
    };
  }

  const hex = /#([0-9a-fA-F]{6})\b/.exec(t);
  if (hex && /(主色|主题色|品牌色)/.test(t)) {
    const value = `#${hex[1]}`;
    return {
      label: `主色调整为 ${value}（当前 ${current.colors.primary['500']}）`,
      apply: (tok) => applyBrandColor(tok, value)
    };
  }

  return null;
}
