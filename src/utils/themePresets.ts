import { DesignSystem, DesignSystemTokens, ModePair, ThemePreset } from '../types/designSystem';

/**
 * 四套工业级主题预设 (A2 / T-AE-17)。
 *
 * 改造前四套全部以 `...techBlueTheme.tokens` 展开，**仅覆写 primary 色阶与 radius**
 * （emerald 连 radius 都没改），neutral / background / surface / shadow / typography /
 * spacing 完全一致——所谓"一键换风格"实际只换了个按钮颜色，这才是
 * doc/aesthetic/spec.md §1 病因 5「风格无主脑」的真因。
 *
 * 现在每套在**色相、中性色冷暖、圆角尺度、阴影性格、间距密度、边框微妙度、
 * 字族**七个维度上各自成立。
 *
 * ⚠️ preset 与 colorMode 正交 (T-AE-18)：preset 决定**色相与性格**，
 * colorMode 决定**明暗**。每套预设都必须提供可用的 light + dark 两组取值，
 * 不存在"只能用于深色"的预设。
 */

const SANS = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif';
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';

const pair = (light: string, dark: string): ModePair => ({ light, dark });

const SIZES = { xs: 12, sm: 14, md: 16, lg: 18, xl: 20, '2xl': 24, '3xl': 30, '4xl': 36 };
const WEIGHTS = { normal: 400, medium: 500, semibold: 600, bold: 700 };
const LINE_HEIGHTS = { tight: 1.25, normal: 1.5, relaxed: 1.625 };
const SPACING = { '0': 0, '1': 4, '2': 8, '3': 12, '4': 16, '5': 20, '6': 24, '8': 32 };

/** 深色下阴影必须更强更黑才可见，浅色下则需克制 */
const shadow = (light: string, dark: string) => pair(light, dark);

// ── 0. Neutral Modern (现代中性微质感 · 默认主题) ─────────────────────────
export const neutralModernTheme: DesignSystem = {
  id: 'theme-neutral-modern',
  name: 'Neutral Modern (默认现代中性)',
  tokens: {
    colors: {
      primary: { '50': '#eff6ff', '100': '#dbeafe', '200': '#bfdbfe', '500': '#2563eb', '600': '#1d4ed8', '700': '#1e40af', '900': '#1e3a8a' },
      neutral: { '50': '#fafbfc', '100': '#f1f3f5', '200': '#e3e6ea', '500': '#64748b', '700': '#334155', '900': '#0f172a' },
      success: '#16a34a',
      warning: '#d97706',
      danger: '#dc2626',
      background: pair('#f8fafc', '#090d16'),
      surface: pair('#ffffff', '#121826'),
      surfaceAlt: pair('#f1f5f9', '#1a2234'),
      textPrimary: pair('#0f172a', '#f8fafc'),
      textSecondary: pair('#64748b', '#94a3b8'),
      border: pair('#e2e8f0', '#222d42')
    },
    typography: { fontFamilySans: SANS, fontFamilyMono: MONO, sizes: SIZES, weights: WEIGHTS, lineHeights: LINE_HEIGHTS },
    spacing: SPACING,
    radius: { none: '0px', sm: '3px', md: '6px', lg: '10px', xl: '14px', full: '9999px' },
    shadows: {
      sm: shadow('0 1px 2px 0 rgba(15, 23, 42, 0.05)', '0 1px 3px 0 rgba(0, 0, 0, 0.6)'),
      md: shadow('0 4px 6px -1px rgba(15, 23, 42, 0.07), 0 2px 4px -2px rgba(15, 23, 42, 0.05)', '0 4px 10px -2px rgba(0, 0, 0, 0.7)'),
      lg: shadow('0 10px 15px -3px rgba(15, 23, 42, 0.08), 0 4px 6px -4px rgba(15, 23, 42, 0.05)', '0 12px 24px -6px rgba(0, 0, 0, 0.8)'),
      soft: shadow('0 6px 20px -2px rgba(37, 99, 235, 0.08), 0 2px 6px -1px rgba(15, 23, 42, 0.04)', '0 6px 24px -2px rgba(37, 99, 235, 0.25)'),
      card: shadow('0 1px 3px 0 rgba(15, 23, 42, 0.05), 0 1px 2px -1px rgba(15, 23, 42, 0.05)', '0 1px 4px 0 rgba(0, 0, 0, 0.65)'),
      glow: shadow('0 0 0 1px rgba(37, 99, 235, 0.2), 0 4px 14px -2px rgba(37, 99, 235, 0.25)', '0 0 0 1px rgba(37, 99, 235, 0.4), 0 6px 18px -2px rgba(37, 99, 235, 0.45)')
    },
    blur: { sm: '6px', md: '12px', lg: '20px' },
    personality: { density: 'standard', borderAlpha: 0.55 }
  }
};

// ── 1. Apple / Vercel 极简性冷淡 ───────────────────────────────────────────
export const minimalistSlateTheme: DesignSystem = {
  id: 'theme-minimalist-slate',
  name: '极简性冷淡 (Minimalist Monochrome)',
  tokens: {
    colors: {
      primary: { '50': '#fafafa', '100': '#f4f4f5', '200': '#e4e4e7', '500': '#09090b', '600': '#000000', '700': '#000000', '900': '#000000' },
      neutral: { '50': '#fafafa', '100': '#f4f4f5', '200': '#e4e4e7', '500': '#71717a', '700': '#3f3f46', '900': '#18181b' },
      success: '#16a34a',
      warning: '#ca8a04',
      danger: '#dc2626',
      background: pair('#fafafa', '#09090b'),
      surface: pair('#ffffff', '#18181b'),
      surfaceAlt: pair('#f4f4f5', '#27272a'),
      textPrimary: pair('#09090b', '#fafafa'),
      textSecondary: pair('#71717a', '#a1a1aa'),
      border: pair('#e4e4e7', '#3f3f46')
    },
    typography: { fontFamilySans: SANS, fontFamilyMono: MONO, sizes: SIZES, weights: WEIGHTS, lineHeights: LINE_HEIGHTS },
    // 极简风靠留白而非装饰，间距放大
    spacing: SPACING,
    radius: { none: '0px', sm: '2px', md: '4px', lg: '6px', xl: '8px', full: '9999px' },
    // 阴影极弱近无 —— 层次靠边框与留白
    shadows: {
      sm: shadow('0 1px 2px 0 rgba(9, 9, 11, 0.04)', '0 1px 2px 0 rgba(0, 0, 0, 0.6)'),
      md: shadow('0 2px 4px -1px rgba(9, 9, 11, 0.05)', '0 2px 6px -1px rgba(0, 0, 0, 0.7)'),
      lg: shadow('0 6px 12px -4px rgba(9, 9, 11, 0.07)', '0 8px 20px -6px rgba(0, 0, 0, 0.8)'),
      soft: shadow('0 2px 10px -2px rgba(9, 9, 11, 0.04)', '0 2px 14px -2px rgba(0, 0, 0, 0.6)'),
      card: shadow('0 1px 2px 0 rgba(9, 9, 11, 0.04)', '0 1px 3px 0 rgba(0, 0, 0, 0.6)'),
      glow: shadow('0 0 0 1px rgba(9, 9, 11, 0.08)', '0 0 0 1px rgba(250, 250, 250, 0.14)')
    },
    blur: { sm: '8px', md: '14px', lg: '24px' },
    personality: { density: 'relaxed', borderAlpha: 0.7 }
  }
};

// ── 2. Linear / Stripe 现代科技质感 ────────────────────────────────────────
export const techIndigoTheme: DesignSystem = {
  id: 'theme-tech-blue',
  name: '现代科技质感 (Modern SaaS & Glow)',
  tokens: {
    colors: {
      primary: { '50': '#eef2ff', '100': '#e0e7ff', '200': '#c7d2fe', '500': '#5e6ad2', '600': '#4f5bc4', '700': '#4338ca', '900': '#312e81' },
      neutral: { '50': '#f8fafc', '100': '#f1f5f9', '200': '#e2e8f0', '500': '#64748b', '700': '#334155', '900': '#0f172a' },
      success: '#10b981',
      warning: '#f59e0b',
      danger: '#ef4444',
      background: pair('#f8fafc', '#0b1020'),
      surface: pair('#ffffff', '#151b2e'),
      surfaceAlt: pair('#f1f5f9', '#1e2740'),
      textPrimary: pair('#0f172a', '#f8fafc'),
      textSecondary: pair('#64748b', '#94a3b8'),
      border: pair('#e2e8f0', '#2c3550')
    },
    typography: { fontFamilySans: SANS, fontFamilyMono: MONO, sizes: SIZES, weights: WEIGHTS, lineHeights: LINE_HEIGHTS },
    spacing: SPACING,
    radius: { none: '0px', sm: '4px', md: '8px', lg: '12px', xl: '16px', full: '9999px' },
    // 主色弥散微光是这套风格的签名
    shadows: {
      sm: shadow('0 1px 2px 0 rgba(15, 23, 42, 0.06)', '0 1px 3px 0 rgba(0, 0, 0, 0.7)'),
      md: shadow('0 4px 6px -1px rgba(15, 23, 42, 0.08), 0 2px 4px -2px rgba(15, 23, 42, 0.06)', '0 4px 10px -2px rgba(0, 0, 0, 0.75)'),
      lg: shadow('0 12px 24px -6px rgba(15, 23, 42, 0.12)', '0 16px 32px -8px rgba(0, 0, 0, 0.85)'),
      soft: shadow('0 4px 20px -2px rgba(94, 106, 210, 0.10), 0 2px 6px -1px rgba(15, 23, 42, 0.04)', '0 4px 24px -2px rgba(94, 106, 210, 0.28)'),
      card: shadow('0 1px 3px 0 rgba(15, 23, 42, 0.07)', '0 1px 4px 0 rgba(0, 0, 0, 0.7)'),
      glow: shadow('0 0 0 1px rgba(94, 106, 210, 0.22), 0 6px 20px -4px rgba(94, 106, 210, 0.35)', '0 0 0 1px rgba(94, 106, 210, 0.45), 0 8px 28px -4px rgba(94, 106, 210, 0.55)')
    },
    blur: { sm: '10px', md: '18px', lg: '30px' },
    // 高信息密度
    personality: { density: 'compact', borderAlpha: 0.6 }
  }
};

// ── 3. Airbnb 温润活力（移动消费端）────────────────────────────────────────
export const warmCoralTheme: DesignSystem = {
  id: 'theme-vibrant-violet',
  name: '温润活力 (Warm & Playful)',
  tokens: {
    colors: {
      primary: { '50': '#fff1f3', '100': '#ffe4e8', '200': '#fecdd6', '500': '#ff385c', '600': '#e11d48', '700': '#be123c', '900': '#881337' },
      // 中性色偏暖（带一点红/黄），与前两套的冷灰形成对比
      neutral: { '50': '#fafaf9', '100': '#f5f5f4', '200': '#e7e5e4', '500': '#78716c', '700': '#44403c', '900': '#1c1917' },
      success: '#059669',
      warning: '#ea580c',
      danger: '#e11d48',
      background: pair('#fffbfa', '#1c1917'),
      surface: pair('#ffffff', '#292524'),
      surfaceAlt: pair('#faf5f4', '#3a3330'),
      textPrimary: pair('#1c1917', '#fafaf9'),
      textSecondary: pair('#78716c', '#a8a29e'),
      border: pair('#e7e5e4', '#44403c')
    },
    // 移动消费端字号整体上调一档
    typography: {
      fontFamilySans: SANS,
      fontFamilyMono: MONO,
      sizes: { xs: 13, sm: 15, md: 17, lg: 19, xl: 22, '2xl': 26, '3xl': 32, '4xl': 40 },
      weights: WEIGHTS,
      lineHeights: { tight: 1.3, normal: 1.55, relaxed: 1.7 }
    },
    spacing: SPACING,
    // 大圆角是这套风格的签名
    radius: { none: '0px', sm: '8px', md: '14px', lg: '20px', xl: '28px', full: '9999px' },
    // 暖光软投影
    shadows: {
      sm: shadow('0 1px 3px 0 rgba(120, 53, 15, 0.06)', '0 1px 3px 0 rgba(0, 0, 0, 0.65)'),
      md: shadow('0 6px 14px -3px rgba(120, 53, 15, 0.10)', '0 6px 16px -3px rgba(0, 0, 0, 0.75)'),
      lg: shadow('0 16px 32px -8px rgba(120, 53, 15, 0.16)', '0 18px 36px -8px rgba(0, 0, 0, 0.85)'),
      soft: shadow('0 8px 28px -4px rgba(255, 56, 92, 0.12), 0 3px 8px -2px rgba(120, 53, 15, 0.06)', '0 8px 30px -4px rgba(255, 56, 92, 0.30)'),
      card: shadow('0 2px 6px -1px rgba(120, 53, 15, 0.08)', '0 2px 8px -1px rgba(0, 0, 0, 0.7)'),
      glow: shadow('0 0 0 1px rgba(255, 56, 92, 0.20), 0 8px 24px -4px rgba(255, 56, 92, 0.38)', '0 0 0 1px rgba(255, 56, 92, 0.45), 0 10px 30px -4px rgba(255, 56, 92, 0.58)')
    },
    blur: { sm: '12px', md: '20px', lg: '32px' },
    personality: { density: 'relaxed', borderAlpha: 0.5 }
  }
};

// ── 4. 极客赛博 / 数据大屏 ────────────────────────────────────────────────
export const cyberCyanTheme: DesignSystem = {
  id: 'theme-emerald-nature',
  name: '极客赛博 (Cyber & Glass)',
  tokens: {
    colors: {
      primary: { '50': '#ecfeff', '100': '#cffafe', '200': '#a5f3fc', '500': '#06b6d4', '600': '#0891b2', '700': '#0e7490', '900': '#164e63' },
      neutral: { '50': '#f9fafb', '100': '#f3f4f6', '200': '#e5e7eb', '500': '#6b7280', '700': '#374151', '900': '#030712' },
      success: '#10b981',
      warning: '#fbbf24',
      danger: '#fb7185',
      background: pair('#f4f7f9', '#030712'),
      surface: pair('#ffffff', '#111827'),
      surfaceAlt: pair('#eef2f5', '#1f2937'),
      textPrimary: pair('#030712', '#e5e7eb'),
      textSecondary: pair('#6b7280', '#9ca3af'),
      border: pair('#e5e7eb', '#22d3ee')
    },
    typography: {
      fontFamilySans: SANS,
      fontFamilyMono: MONO,
      sizes: SIZES,
      weights: WEIGHTS,
      lineHeights: { tight: 1.2, normal: 1.45, relaxed: 1.6 }
    },
    spacing: SPACING,
    radius: { none: '0px', sm: '3px', md: '6px', lg: '10px', xl: '14px', full: '9999px' },
    // 冷色辉光
    shadows: {
      sm: shadow('0 1px 2px 0 rgba(3, 7, 18, 0.06)', '0 1px 3px 0 rgba(0, 0, 0, 0.8)'),
      md: shadow('0 4px 10px -2px rgba(3, 7, 18, 0.10)', '0 4px 14px -2px rgba(0, 0, 0, 0.85)'),
      lg: shadow('0 14px 28px -8px rgba(3, 7, 18, 0.16)', '0 18px 40px -10px rgba(0, 0, 0, 0.9)'),
      soft: shadow('0 4px 18px -2px rgba(6, 182, 212, 0.14)', '0 4px 26px -2px rgba(6, 182, 212, 0.34)'),
      card: shadow('0 1px 3px 0 rgba(3, 7, 18, 0.08)', '0 1px 4px 0 rgba(0, 0, 0, 0.8)'),
      glow: shadow('0 0 0 1px rgba(6, 182, 212, 0.30), 0 6px 22px -4px rgba(6, 182, 212, 0.40)', '0 0 0 1px rgba(6, 182, 212, 0.60), 0 8px 30px -4px rgba(6, 182, 212, 0.70)')
    },
    // 毛玻璃是这套风格的签名
    blur: { sm: '14px', md: '24px', lg: '40px' },
    personality: { density: 'compact', borderAlpha: 0.35 }
  }
};

// ── 5. Ant Design 经典企业级 ──────────────────────────────────────────────
export const antBlueTheme: DesignSystem = {
  id: 'theme-ant-blue',
  name: 'Ant Design (经典企业级)',
  tokens: {
    colors: {
      primary: { '50': '#e6f4ff', '100': '#bae0ff', '200': '#91caff', '500': '#1677ff', '600': '#0958d9', '700': '#003eb3', '900': '#002c8c' },
      neutral: { '50': '#fafafa', '100': '#f5f5f5', '200': '#e8e8e8', '500': '#8c8c8c', '700': '#595959', '900': '#1f1f1f' },
      success: '#52c41a',
      warning: '#faad14',
      danger: '#ff4d4f',
      background: pair('#f5f5f5', '#000000'),
      surface: pair('#ffffff', '#141414'),
      surfaceAlt: pair('#fafafa', '#1f1f1f'),
      textPrimary: pair('#1f1f1f', '#ffffff'),
      textSecondary: pair('#8c8c8c', '#a6a6a6'),
      border: pair('#d9d9d9', '#303030')
    },
    typography: { fontFamilySans: SANS, fontFamilyMono: MONO, sizes: SIZES, weights: WEIGHTS, lineHeights: LINE_HEIGHTS },
    spacing: SPACING,
    radius: { none: '0px', sm: '2px', md: '6px', lg: '8px', xl: '12px', full: '9999px' },
    shadows: {
      sm: shadow('0 1px 2px 0 rgba(0, 0, 0, 0.03)', '0 1px 2px 0 rgba(0, 0, 0, 0.5)'),
      md: shadow('0 3px 6px -1px rgba(0, 0, 0, 0.12), 0 2px 4px -1px rgba(0, 0, 0, 0.07)', '0 3px 6px -1px rgba(0, 0, 0, 0.6)'),
      lg: shadow('0 10px 20px rgba(0, 0, 0, 0.15)', '0 10px 20px rgba(0, 0, 0, 0.75)'),
      soft: shadow('0 2px 8px rgba(0, 0, 0, 0.08)', '0 2px 8px rgba(0, 0, 0, 0.55)'),
      card: shadow('0 1px 2px 0 rgba(0, 0, 0, 0.03)', '0 1px 2px 0 rgba(0, 0, 0, 0.45)'),
      glow: shadow('0 0 0 2px rgba(22, 119, 255, 0.2)', '0 0 0 2px rgba(22, 119, 255, 0.35)')
    },
    blur: { sm: '4px', md: '8px', lg: '16px' },
    personality: { density: 'standard', borderAlpha: 0.8 }
  }
};

// ── 6. Supabase 极客黑绿 ──────────────────────────────────────────────────
export const supabaseEmeraldTheme: DesignSystem = {
  id: 'theme-supabase-emerald',
  name: 'Supabase Style (极客黑绿)',
  tokens: {
    colors: {
      primary: { '50': '#ecfdf5', '100': '#d1fae5', '200': '#a7f3d0', '500': '#10b981', '600': '#059669', '700': '#047857', '900': '#064e3b' },
      neutral: { '50': '#f4f4f5', '100': '#e4e4e7', '200': '#d4d4d8', '500': '#71717a', '700': '#27272a', '900': '#18181b' },
      success: '#34d399',
      warning: '#fbbf24',
      danger: '#f87171',
      background: pair('#fafafa', '#121212'),
      surface: pair('#ffffff', '#1c1c1c'),
      surfaceAlt: pair('#f4f4f5', '#242424'),
      textPrimary: pair('#18181b', '#ededed'),
      textSecondary: pair('#71717a', '#a1a1aa'),
      border: pair('#e4e4e7', '#2e2e2e')
    },
    typography: { fontFamilySans: SANS, fontFamilyMono: MONO, sizes: SIZES, weights: WEIGHTS, lineHeights: LINE_HEIGHTS },
    spacing: SPACING,
    radius: { none: '0px', sm: '2px', md: '4px', lg: '6px', xl: '8px', full: '9999px' },
    shadows: {
      sm: shadow('0 1px 2px 0 rgba(0, 0, 0, 0.05)', '0 1px 2px 0 rgba(0, 0, 0, 0.8)'),
      md: shadow('0 4px 6px -1px rgba(0, 0, 0, 0.1)', '0 4px 12px rgba(0, 0, 0, 0.85)'),
      lg: shadow('0 10px 15px -3px rgba(0, 0, 0, 0.1)', '0 12px 24px rgba(0, 0, 0, 0.9)'),
      soft: shadow('0 4px 16px -2px rgba(16, 185, 129, 0.1)', '0 4px 20px -2px rgba(16, 185, 129, 0.25)'),
      card: shadow('0 1px 3px 0 rgba(0, 0, 0, 0.06)', '0 1px 3px 0 rgba(0, 0, 0, 0.7)'),
      glow: shadow('0 0 0 1px rgba(16, 185, 129, 0.25), 0 0 16px rgba(16, 185, 129, 0.2)', '0 0 0 1px rgba(16, 185, 129, 0.4), 0 0 20px rgba(16, 185, 129, 0.3)')
    },
    blur: { sm: '8px', md: '16px', lg: '24px' },
    personality: { density: 'compact', borderAlpha: 0.65 }
  }
};

/** 默认主题 */
export const defaultTheme = neutralModernTheme;

/** 兼容既有引用名 */
export const techBlueTheme = techIndigoTheme;

export const themePresets: ThemePreset[] = [
  {
    id: 'neutral-modern',
    name: 'Neutral Modern',
    description: '现代中性微质感 · 默认主题：克制沉稳冷灰阶、精致微质感阴影、适中圆角',
    primaryColor: '#2563eb',
    theme: neutralModernTheme
  },
  {
    id: 'tech-blue',
    name: '现代科技质感',
    description: 'Linear / Stripe 风：靛蓝紫主色、主色弥散微光、高信息密度',
    primaryColor: '#5e6ad2',
    theme: techIndigoTheme
  },
  {
    id: 'vibrant-violet',
    name: '温润活力',
    description: 'Airbnb 风：珊瑚红主色、暖中性色、大圆角、暖光软投影',
    primaryColor: '#ff385c',
    theme: warmCoralTheme
  },
  {
    id: 'minimalist-slate',
    name: '极简性冷淡',
    description: 'Apple / Vercel 风：极简留白、精细黑白对比、近乎无阴影',
    primaryColor: '#09090b',
    theme: minimalistSlateTheme
  },
  {
    id: 'emerald-nature',
    name: '极客赛博',
    description: '数据大屏风：电光青蓝、冷色辉光、强毛玻璃、紧凑锐利',
    primaryColor: '#06b6d4',
    theme: cyberCyanTheme
  },
  {
    id: 'ant-blue',
    name: 'Ant Design',
    description: '经典企业级：沉稳科技蓝、规整结构、标准圆角与清晰边框',
    primaryColor: '#1677ff',
    theme: antBlueTheme
  },
  {
    id: 'supabase-emerald',
    name: 'Supabase Style',
    description: '极客黑绿风：电光翠绿点缀、深邃黑底、高对比开发质感',
    primaryColor: '#10b981',
    theme: supabaseEmeraldTheme
  }
];

/** 预设之间的差异维度统计，用于验收"一键换风格"是否名副其实 (T-AE-17) */
export function presetDifferenceCount(a: DesignSystemTokens, b: DesignSystemTokens): number {
  let n = 0;
  const j = (x: unknown) => JSON.stringify(x);
  if (j(a.colors.primary) !== j(b.colors.primary)) n++;
  if (j(a.colors.neutral) !== j(b.colors.neutral)) n++;
  if (j(a.colors.background) !== j(b.colors.background)) n++;
  if (j(a.colors.surface) !== j(b.colors.surface)) n++;
  if (j(a.colors.surfaceAlt) !== j(b.colors.surfaceAlt)) n++;
  if (j(a.colors.border) !== j(b.colors.border)) n++;
  if (j(a.colors.textSecondary) !== j(b.colors.textSecondary)) n++;
  if (j(a.radius) !== j(b.radius)) n++;
  if (j(a.shadows) !== j(b.shadows)) n++;
  if (j(a.blur) !== j(b.blur)) n++;
  if (j(a.typography.sizes) !== j(b.typography.sizes)) n++;
  if (j(a.typography.lineHeights) !== j(b.typography.lineHeights)) n++;
  if (a.personality.density !== b.personality.density) n++;
  if (a.personality.borderAlpha !== b.personality.borderAlpha) n++;
  return n;
}
