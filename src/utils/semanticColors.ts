import { COLOR_ROLES, colorRoleKeys, type ColorRole } from '../types/colorRoles';
import type { ColorBinding, DesignSystemTokens } from '../types/designSystem';
import { contrastRatio, mixColor, onColor, readableColor, rgb } from './colorMath';

export const normalizeHex = (value: string): string | null => {
  if (typeof value !== 'string') return null;
  const s = value.trim();
  if (/^#[\da-f]{6}$/i.test(s)) return s.toLowerCase();
  if (/^#[\da-f]{3}$/i.test(s)) return '#' + s.slice(1).split('').map(c => c + c).join('').toLowerCase();
  return null;
};
export interface ColorIssue { role: ColorRole; message: string }
export interface ColorResolution {
  values: Record<ColorRole, string>;
  sources: Record<ColorRole, string>;
  cssValues: Record<ColorRole, string>;
  issues: ColorIssue[];
}
class InvalidBinding extends Error {}

/** 自动依赖和显式继承使用同一 DFS，循环/坏引用回退至完整自动主题。 */
export function resolveThemeColors(tokens: DesignSystemTokens, mode: 'light' | 'dark'): ColorResolution {
  const c = tokens.colors;
  const bindings = tokens.colorRoles?.[mode] ?? {};
  const issues: ColorIssue[] = [];
  const resolve = (useBindings: boolean) => {
    const values = {} as Record<ColorRole, string>;
    const sources = {} as Record<ColorRole, string>;
    const active = new Set<ColorRole>();
    const get = (role: ColorRole): string => {
      if (!Object.hasOwn(COLOR_ROLES, role)) throw new InvalidBinding(`不存在的角色 ${role}`);
      if (active.has(role)) throw new InvalidBinding(`继承或自动依赖形成循环：${COLOR_ROLES[role][0]}`);
      if (values[role]) return values[role];
      active.add(role);
      const safe = (value: string | undefined, fallback: string) => normalizeHex(value ?? '') ?? fallback;
      const surfaces = () => [get('background'), get('surface'), get('surfaceAlt'), get('overlaySurface')];
      const container = (color: string) => mixColor(get('surface'), color, mode === 'light' ? .09 : .18);
      const readable = (fg: string, bgs: string[]) => readableColor(fg, bgs);
      const automatic = (): string => {
        switch (role) {
          case 'brand': return safe(c.primary['500'], '#2563eb');
          case 'background': return safe(c.background[mode], mode === 'light' ? '#fafafa' : '#121212');
          case 'surface': return safe(c.surface[mode], mode === 'light' ? '#ffffff' : '#1d1d1d');
          case 'surfaceAlt': return safe(c.surfaceAlt[mode], mode === 'light' ? '#f1f1f1' : '#292929');
          case 'overlaySurface': return get('surface');
          case 'primary': return get('brand');
          case 'onPrimary': return onColor(get('primary'));
          case 'primaryLight': return mode === 'light' ? normalizeHex(c.primary['100']) ?? container(get('brand')) : container(get('brand'));
          case 'primaryText': return readable(get('brand'), [...surfaces(), get('primaryLight')]);
          case 'primaryHover': return readable(mixColor(get('primary'), mode === 'light' ? '#000000' : '#ffffff', .08), [get('onPrimary')]);
          case 'primaryActive': return readable(mixColor(get('primary'), mode === 'light' ? '#000000' : '#ffffff', .14), [get('onPrimary')]);
          case 'textPrimary': return readable(safe(c.textPrimary[mode], mode === 'light' ? '#252525' : '#f4f4f4'), surfaces());
          case 'textSecondary': return readable(safe(c.textSecondary[mode], mode === 'light' ? '#656565' : '#b8b8b8'), surfaces());
          case 'textMuted': return readable(mixColor(get('textSecondary'), get('surface'), .12), surfaces());
          case 'border': return safe(c.border[mode], mode === 'light' ? '#dedede' : '#3d3d3d');
          case 'borderSubtle': return mixColor(get('surface'), get('border'), tokens.personality.borderAlpha);
          case 'controlBorder': return readableColor(get('border'), surfaces(), 3);
          case 'focusRing': return readableColor(get('brand'), surfaces(), 3);
          case 'selectedBg': return get('primaryLight');
          case 'selectedText': return readable(get('primaryText'), [get('selectedBg')]);
          case 'disabledBg': return get('surfaceAlt');
          case 'disabledText': return mixColor(get('textSecondary'), get('disabledBg'), .25);
          case 'inverseBg': return mode === 'light' ? '#252525' : '#f4f4f4';
          case 'inverseText': return onColor(get('inverseBg'));
          case 'scrim': return '#000000';
          case 'accent': return normalizeHex(c.primary['600']) ?? get('brand');
          case 'onAccent': return onColor(get('accent'));
          case 'accentLight': return container(get('accent'));
          case 'accentText': return readable(get('accent'), [...surfaces(), get('accentLight')]);
          default: {
            const state = role.startsWith('success') || role === 'onSuccess' ? 'success' : role.startsWith('warning') || role === 'onWarning' ? 'warning' : role.startsWith('danger') || role === 'onDanger' ? 'danger' : 'info';
            const fill = `${state}Fill` as ColorRole;
            const text = `${state}Text` as ColorRole;
            if (role === fill) return state === 'info' ? '#2563eb' : safe(c[state], '#2563eb');
            if (role === text) return readable(get(fill), [...surfaces(), get(`${state}Light` as ColorRole)]);
            if (role.endsWith('Light')) return container(get(fill));
            if (role === 'dangerHover' || role === 'dangerActive') return readable(mixColor(get(fill), '#000000', role === 'dangerHover' ? .08 : .14), [get('onDanger')]);
            return onColor(get(fill));
          }
        }
      };
      try {
        const binding = useBindings ? bindings[role] : undefined;
        let value: string;
        if (binding?.source === 'custom') {
          const normalized = normalizeHex(binding.value);
          if (!normalized) throw new InvalidBinding(`${COLOR_ROLES[role][0]}的自定义颜色无效`);
          value = normalized;
          sources[role] = '自定义';
        } else if (binding?.source === 'alias') {
          value = get(binding.role);
          sources[role] = `跟随 ${COLOR_ROLES[binding.role][0]}`;
        } else {
          if (binding) throw new InvalidBinding(`${COLOR_ROLES[role][0]}的来源无效`);
          value = automatic();
          sources[role] = role === 'onPrimary' ? '自动生成 · 按主按钮背景选择可读前景' : '自动生成';
          if (role === 'textPrimary' || role === 'textSecondary') {
            if (value !== normalizeHex(c[role][mode])) sources[role] += ' · 已修正对比度';
          }
        }
        values[role] = value;
        return value;
      } finally { active.delete(role); }
    };
    return { get, values, sources };
  };
  const fallback = resolve(false);
  const actual = resolve(true);
  for (const role of colorRoleKeys) {
    try { actual.get(role); }
    catch (error) {
      if (!(error instanceof InvalidBinding)) throw error;
      issues.push({ role, message: error.message });
      actual.values[role] = fallback.get(role);
      actual.sources[role] = '无效配置 · 回退自动';
    }
  }
  const cssValues = { ...actual.values };
  // 保留旧式透明细边框；values 表示它叠加于 surface 后的可见颜色，供继承与选色。
  if (!bindings.borderSubtle && tokens.personality.borderAlpha < 1) {
    const [r, g, b] = rgb(actual.values.border);
    cssValues.borderSubtle = `rgba(${r}, ${g}, ${b}, ${tokens.personality.borderAlpha})`;
    actual.sources.borderSubtle += ' · 展示叠加于卡片的生效色';
  }
  return { values: actual.values, cssValues, sources: actual.sources, issues };
}

/** 不接受循环、坏引用或非法值；调用方通过历史动作提交返回的完整 Token。 */
export function withColorBinding(tokens: DesignSystemTokens, mode: 'light' | 'dark', role: ColorRole, binding?: ColorBinding): DesignSystemTokens {
  const next = { ...tokens, colorRoles: { ...tokens.colorRoles, [mode]: { ...tokens.colorRoles?.[mode] } } };
  if (binding) next.colorRoles[mode]![role] = binding;
  else delete next.colorRoles[mode]![role];
  const before = new Set(resolveThemeColors(tokens, mode).issues.map(i => `${i.role}:${i.message}`));
  const issues = resolveThemeColors(next, mode).issues.filter(i => !before.has(`${i.role}:${i.message}`));
  if (issues.length) throw new Error(issues.map(i => i.message).join('；'));
  return next;
}

export interface ContrastCheck {
  label: string; foreground: ColorRole; background: ColorRole; ratio: number; minimum: number; passes: boolean;
}
export function checkColorContrast(resolved: ColorResolution): ContrastCheck[] {
  const pairs: Array<[string, ColorRole, ColorRole, number]> = [];
  for (const bg of ['background', 'surface', 'surfaceAlt', 'overlaySurface'] as const) {
    for (const fg of ['textPrimary', 'textSecondary', 'textMuted', 'primaryText', 'accentText', 'successText', 'warningText', 'dangerText', 'infoText'] as const) pairs.push([`${COLOR_ROLES[fg][0]} / ${COLOR_ROLES[bg][0]}`, fg, bg, 4.5]);
    pairs.push(['焦点环 / ' + COLOR_ROLES[bg][0], 'focusRing', bg, 3]);
  }
  for (const bg of ['primary', 'primaryHover', 'primaryActive'] as const) pairs.push(['主按钮 / ' + COLOR_ROLES[bg][0], 'onPrimary', bg, 4.5]);
  for (const bg of ['dangerFill', 'dangerHover', 'dangerActive'] as const) pairs.push(['危险按钮 / ' + COLOR_ROLES[bg][0], 'onDanger', bg, 4.5]);
  pairs.push(['次按钮 / 品牌浅底', 'primaryText', 'primaryLight', 4.5], ['选中项', 'selectedText', 'selectedBg', 4.5], ['反色内容', 'inverseText', 'inverseBg', 4.5], ['辅助强调', 'onAccent', 'accent', 4.5], ['辅助强调浅底', 'accentText', 'accentLight', 4.5], ['控件边框 / 内部表面', 'controlBorder', 'surface', 3], ['控件边框 / 外部背景', 'controlBorder', 'background', 3]);
  for (const state of ['success', 'warning', 'danger', 'info'] as const) {
    const name = COLOR_ROLES[`${state}Text`][0];
    pairs.push([name + ' / 浅底', `${state}Text`, `${state}Light`, 4.5], [name + ' / 填充', `on${state[0].toUpperCase()}${state.slice(1)}` as ColorRole, `${state}Fill`, 4.5]);
  }
  return pairs.map(([label, foreground, background, minimum]) => {
    const ratio = contrastRatio(resolved.values[foreground], resolved.values[background]);
    return { label, foreground, background, ratio, minimum, passes: ratio >= minimum };
  });
}

export function colorUsageRules(): string {
  return 'SEMANTIC COLOR PAIRS: 正文用 --color-text-primary，品牌链接 .text-primary；主/次/描边/文字/危险操作分别用 .btn-primary/.btn-secondary/.btn-outline/.btn-text/.btn-danger。按钮内文字和SVG继承 currentColor，禁止叠加正文色；选中 .is-selected，禁用 disabled。状态浅底与前景成对使用 .bg-success-light/.bg-warning-light/.bg-danger-light/.bg-info-light。品牌识别与操作填充分离；引用当前编译 Token，保留角色覆盖。';
}
