import type { ColorRole } from './colorRoles';
export type ModePair = { light: string; dark: string };
export type Ramp = { [step: string]: string };

export interface DesignSystemTokens {
  colors: {
    primary: Ramp;
    neutral: Ramp;
    success: string;
    warning: string;
    danger: string;
    background: ModePair;
    surface: ModePair;
    surfaceAlt: ModePair;
    textPrimary: ModePair;
    textSecondary: ModePair;
    border: ModePair;
  };
  /** 缺省为自动；可选字段保持旧工程兼容。 */
  colorRoles?: Partial<Record<'light' | 'dark', Partial<Record<ColorRole, ColorBinding>>>>;
  typography: {
    fontFamilySans: string;
    fontFamilyMono: string;
    sizes: Record<string, number>;
    weights: Record<string, number>;
    lineHeights: Record<string, number>;
  };
  spacing: Record<string, number>;
  radius: {
    none: string;
    sm: string;
    md: string;
    lg: string;
    xl: string;
    full: string;
  };
  /**
   * 阴影必须是 ModePair (A2 / T-AE-15)。
   * 此前是单一字符串：深色模式下沿用浅色阴影，在 #0f172a 这类背景上
   * 几乎不可见——"深色毛玻璃"风格在旧模型下根本做不出来。
   */
  shadows: {
    sm: ModePair;
    md: ModePair;
    lg: ModePair;
    /** 弥散柔光：环境光 + 主光源两层叠加 */
    soft: ModePair;
    /** 卡片微阴影 */
    card: ModePair;
    /** 主色光晕，用于主按钮与聚焦元素 */
    glow: ModePair;
  };
  /** 毛玻璃模糊半径 */
  blur: {
    sm: string;
    md: string;
    lg: string;
  };
  /**
   * 风格性格参数 (T-AE-15)。
   * 预设之间若只差主色，"一键换风格"就只是换了个按钮颜色——
   * 这两个字段承载间距密度与边框微妙度的差异。
   */
  personality: {
    /** 间距密度：缩放 spacing 刻度。compact 0.85 / standard 1 / relaxed 1.2 */
    density: 'compact' | 'standard' | 'relaxed';
    /** 边框不透明度 0~1，实现 border-slate-200/60 这类微质感边框 */
    borderAlpha: number;
  };
}

export const DENSITY_SCALE: Record<DesignSystemTokens['personality']['density'], number> = {
  compact: 0.85,
  standard: 1,
  relaxed: 1.2
};

export interface DesignSystem {
  id: string;
  name: string;
  tokens: DesignSystemTokens;
}

export interface ThemePreset {
  id: string;
  name: string;
  description: string;
  primaryColor: string;
  theme: DesignSystem;
}

export interface DesignProse {
  presetId: string;
  title: string;
  tone: string;
  rulesMarkdown: string;
  source: 'project_override' | 'builtin_preset';
}

export type ColorBinding = { source: 'custom'; value: string } | { source: 'alias'; role: ColorRole };
