import type { DesignSystemTokens, Ramp } from '../types/designSystem';

type RGB = [number, number, number];
const rgb = (hex: string): RGB => {
  const value = hex.replace(/^#/, '');
  const full = value.length === 3 ? value.split('').map(c => c + c).join('') : value;
  if (!/^[\da-f]{6}$/i.test(full)) throw new Error(`Invalid hex color: ${hex}`);
  return [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16)) as RGB;
};
const hex = (color: RGB) => '#' + color.map(v => Math.round(v).toString(16).padStart(2, '0')).join('');

/** sRGB 插值，用于生成低饱和表面和确定性的品牌色阶。 */
export function mixColor(a: string, b: string, weight: number): string {
  const x = rgb(a), y = rgb(b);
  const w = Math.max(0, Math.min(1, weight));
  return hex(x.map((v, i) => v * (1 - w) + y[i] * w) as RGB);
}

function luminance(color: string): number {
  const linear = rgb(color).map(v => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

export function contrastRatio(a: string, b: string): number {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

export function onColor(fill: string): string {
  return contrastRatio('#ffffff', fill) >= contrastRatio('#111111', fill) ? '#ffffff' : '#111111';
}

/** 在同一明暗表面组上选择最小幅度的明度修正；不改变填充种子色。 */
export function readableColor(foreground: string, backgrounds: string[], minimum = 4.5): string {
  const passes = (color: string) => backgrounds.every(bg => contrastRatio(color, bg) >= minimum);
  if (passes(foreground)) return foreground;
  const targets = ['#000000', '#ffffff'].filter(passes);
  if (!targets.length) return foreground; // 自定义混合明暗表面无法用单一前景满足，留给局部设计。
  let best = targets[0], bestWeight = Infinity;
  for (const target of targets) {
    let low = 0, high = 1;
    for (let i = 0; i < 16; i++) {
      const mid = (low + high) / 2;
      if (passes(mixColor(foreground, target, mid))) high = mid;
      else low = mid;
    }
    if (high < bestWeight) { bestWeight = high; best = mixColor(foreground, target, high); }
  }
  return best;
}

export function buildPrimaryRamp(seed: string): Ramp {
  const normalized = hex(rgb(seed));
  return {
    '50': mixColor(normalized, '#ffffff', 0.96),
    '100': mixColor(normalized, '#ffffff', 0.9),
    '200': mixColor(normalized, '#ffffff', 0.76),
    '500': normalized,
    '600': mixColor(normalized, '#000000', 0.14),
    '700': mixColor(normalized, '#000000', 0.28),
    '900': mixColor(normalized, '#000000', 0.55)
  };
}

export const COLOR_SCHEMES = [
  { id: 'rose', name: '清雅玫瑰', seed: '#b65378', description: '暖灰底与玫瑰强调，适合婚恋、生活服务' },
  { id: 'blue', name: '沉静雾蓝', seed: '#42658c', description: '冷灰底与雾蓝强调，适合业务工作台' },
  { id: 'sage', name: '自然鼠尾草', seed: '#477568', description: '中性底与灰绿强调，适合健康、生活方式' },
  { id: 'apricot', name: '温润暖杏', seed: '#996535', description: '米灰底与暖棕强调，适合内容、精品服务' }
] as const;

/** 不修改输入；联动表面仅在用户选择整套配色时启用。 */
export function applyBrandColor(tokens: DesignSystemTokens, seed: string, harmonizeSurfaces = false): DesignSystemTokens {
  const primary = buildPrimaryRamp(seed);
  if (!harmonizeSurfaces) return { ...tokens, colors: { ...tokens.colors, primary } };
  const tint = (neutral: string, weight: number) => mixColor(neutral, seed, weight);
  const [r, g, b] = rgb(seed);
  return {
    ...tokens,
    colors: {
      ...tokens.colors, primary,
      neutral: { '50': tint('#fafafa', 0.015), '100': tint('#f1f1f1', 0.03), '200': tint('#e0e0e0', 0.04), '500': tint('#737373', 0.06), '700': tint('#404040', 0.06), '900': tint('#202020', 0.06) },
      background: { light: tint('#f7f7f7', 0.025), dark: tint('#121212', 0.035) },
      surface: { light: '#ffffff', dark: tint('#1d1d1d', 0.04) },
      surfaceAlt: { light: tint('#f1f1f1', 0.035), dark: tint('#292929', 0.04) },
      textPrimary: { light: tint('#252525', 0.04), dark: '#f4f4f4' },
      textSecondary: { light: tint('#656565', 0.04), dark: tint('#b8b8b8', 0.025) },
      border: { light: tint('#dedede', 0.04), dark: tint('#3d3d3d', 0.045) }
    },
    shadows: {
      ...tokens.shadows,
      soft: { light: `0 6px 22px -6px rgba(${r}, ${g}, ${b}, 0.08)`, dark: '0 6px 22px -6px rgba(0, 0, 0, 0.45)' },
      glow: { light: `0 0 0 1px rgba(${r}, ${g}, ${b}, 0.2)`, dark: `0 0 0 1px rgba(${r}, ${g}, ${b}, 0.4)` }
    }
  };
}

/** 所有标准组件和预览共享的语义配色。仅处理实体 Hex 表面。 */
export function resolveColorRoles(tokens: DesignSystemTokens, mode: 'light' | 'dark') {
  const c = tokens.colors;
  const surfaces = [c.background[mode], c.surface[mode], c.surfaceAlt[mode]];
  const seed = c.primary['500'] || '#2563eb';
  const accent = c.primary['600'] || seed;
  const container = (color: string) => mixColor(c.surface[mode], color, mode === 'light' ? 0.09 : 0.18);
  const primaryLight = mode === 'light' ? c.primary['100'] || container(seed) : container(seed);
  const semantic = (color: string) => {
    const light = container(color);
    return { text: readableColor(color, [...surfaces, light]), light };
  };
  return {
    primary: seed, onPrimary: onColor(seed), primaryLight,
    primaryText: readableColor(seed, [...surfaces, primaryLight]),
    accent, onAccent: onColor(accent), accentLight: container(accent),
    accentText: readableColor(accent, [...surfaces, container(accent)]),
    textPrimary: readableColor(c.textPrimary[mode], surfaces),
    textSecondary: readableColor(c.textSecondary[mode], surfaces),
    textMuted: readableColor(mixColor(c.textSecondary[mode], c.surface[mode], 0.12), surfaces),
    success: semantic(c.success), warning: semantic(c.warning), danger: semantic(c.danger)
  };
}
