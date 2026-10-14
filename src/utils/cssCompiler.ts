import { DENSITY_SCALE, DesignSystemTokens } from '../types/designSystem';

/** #rrggbb -> rgba(r,g,b,alpha)；非法输入原样返回 */
function withAlpha(hex: string, alpha: number): string {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m || alpha >= 1) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

export function compileTokensToCss(tokens: DesignSystemTokens, mode: 'light' | 'dark' = 'light', device: 'pc' | 'mobile' | 'all' = 'all'): string {
  const c = tokens.colors;
  const t = tokens.typography;
  const s = tokens.spacing;
  const r = tokens.radius;
  const sh = tokens.shadows;

  const bg = mode === 'light' ? c.background.light : c.background.dark;
  const surface = mode === 'light' ? c.surface.light : c.surface.dark;
  const surfaceAlt = mode === 'light' ? c.surfaceAlt.light : c.surfaceAlt.dark;
  const textPrimary = mode === 'light' ? c.textPrimary.light : c.textPrimary.dark;
  const textSecondary = mode === 'light' ? c.textSecondary.light : c.textSecondary.dark;
  const border = mode === 'light' ? c.border.light : c.border.dark;
  const pick = (p: { light: string; dark: string }) => (mode === 'light' ? p.light : p.dark);
  const density = DENSITY_SCALE[tokens.personality.density];
  const sp = (k: string, fallback: number) => Math.round((s[k] ?? fallback) * density);

  const primary500 = c.primary['500'] || '#2563eb';
  const primaryLight = c.primary['100'] || '#dbeafe';

  return `:root {
  /* Colors */
  --color-primary: ${primary500};
  --color-primary-light: ${primaryLight};
  --color-bg: ${bg};
  --color-surface: ${surface};
  --color-surface-alt: ${surfaceAlt};
  --color-text-primary: ${textPrimary};
  --color-text-secondary: ${textSecondary};
  --color-border: ${border};
  --color-border-subtle: ${withAlpha(border, tokens.personality.borderAlpha)};
  --color-success: ${c.success};
  --color-success-light: ${withAlpha(c.success, 0.15)};
  --color-warning: ${c.warning};
  --color-warning-light: ${withAlpha(c.warning, 0.15)};
  --color-danger: ${c.danger};
  --color-danger-light: ${withAlpha(c.danger, 0.15)};
  --color-accent: ${c.primary['600'] || c.primary['500'] || '#7c3aed'};
  --color-accent-light: ${withAlpha(c.primary['500'] || '#7c3aed', 0.15)};
  --color-text-muted: ${mode === 'light' ? '#94a3b8' : '#64748b'};

  /* Typography */
  --font-sans: ${t.fontFamilySans};
  --font-mono: ${t.fontFamilyMono};
  --font-size-xs: ${t.sizes.xs || 12}px;
  --font-size-sm: ${t.sizes.sm || 14}px;
  --font-size-md: ${t.sizes.md || 16}px;
  --font-size-lg: ${t.sizes.lg || 18}px;
  --font-size-xl: ${t.sizes.xl || 20}px;
  --font-size-2xl: ${t.sizes['2xl'] || 24}px;
  --font-size-3xl: ${t.sizes['3xl'] || 30}px;
  --font-size-4xl: ${t.sizes['4xl'] || 36}px;

  /* Spacing (按 personality.density 缩放) */
  --space-0: ${sp('0', 0)}px;
  --space-1: ${sp('1', 4)}px;
  --space-2: ${sp('2', 8)}px;
  --space-3: ${sp('3', 12)}px;
  --space-4: ${sp('4', 16)}px;
  --space-5: ${sp('5', 20)}px;
  --space-6: ${sp('6', 24)}px;
  --space-8: ${sp('8', 32)}px;

  ${device === 'pc' ? '' : `/* Mobile header geometry */
  --mini-status-height: 44px;
  --mini-capsule-width: 86px;
  --mini-capsule-height: 32px;
  --mini-title-reserve: 210px;
  --mini-home-ring: 12px;
  --mini-home-dot: 4px;
  --mini-border-width: 1px;
  --mini-home-ring-width: 2px;`}

  /* Radius */
  --radius-none: ${r.none || '0px'};
  --radius-sm: ${r.sm || '4px'};
  --radius-md: ${r.md || '8px'};
  --radius-lg: ${r.lg || '12px'};
  --radius-xl: ${r.xl || '16px'};
  --radius-full: ${r.full || '9999px'};

  /* Shadows (按 colorMode 取值：深色下需要更强的阴影才可见) */
  --shadow-sm: ${pick(sh.sm)};
  --shadow-md: ${pick(sh.md)};
  --shadow-lg: ${pick(sh.lg)};
  --shadow-soft: ${pick(sh.soft)};
  --shadow-card: ${pick(sh.card)};
  --shadow-glow: ${pick(sh.glow)};

  /* Blur */
  --blur-sm: ${tokens.blur.sm};
  --blur-md: ${tokens.blur.md};
  --blur-lg: ${tokens.blur.lg};
}`;
}

/**
 * 从基座 CSS 反推真实存在的类名白名单 (T-AE-03)。
 *
 * 此前 Prompt 的白名单是手写常量，与 base.css 漂移了 51 个类——模型忠实
 * 输出了这些类，渲染却为零样式。改由此函数派生后，白名单**物理上不可能**
 * 承诺不存在的类。详见 doc/aesthetic/spec.md §1.1。
 */
export function extractClassWhitelist(baseCss: string): string[] {
  // 先剥离注释，避免注释中的 .foo 被误当作类名
  const stripped = baseCss.replace(/\/\*[\s\S]*?\*\//g, '');
  const classMatches = stripped.matchAll(/\.([a-zA-Z][a-zA-Z0-9_-]*)(?=[\s,{:>+~[]|$)/g);
  const classes = new Set<string>();
  for (const m of classMatches) {
    classes.add(m[1]);
  }
  return Array.from(classes).sort();
}
