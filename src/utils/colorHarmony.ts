import type { DesignSystemTokens, Ramp } from '../types/designSystem';

import { mixColor, rgb } from './colorMath';
export { mixColor, contrastRatio, onColor, readableColor } from './colorMath';
import { resolveThemeColors } from './semanticColors';

export function buildPrimaryRamp(seed: string): Ramp {
  const normalized = mixColor(seed, seed, 0);
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

/** 兼容既有消费方；所有结果由统一角色引擎解析。 */
export function resolveColorRoles(tokens: DesignSystemTokens, mode: 'light' | 'dark') {
  const r = resolveThemeColors(tokens, mode).values;
  return {
    ...r,
    success: { text: r.successText, light: r.successLight },
    warning: { text: r.warningText, light: r.warningLight },
    danger: { text: r.dangerText, light: r.dangerLight },
    info: { text: r.infoText, light: r.infoLight }
  };
}
