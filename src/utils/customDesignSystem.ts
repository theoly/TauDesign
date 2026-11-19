import type { DesignSystem, DesignSystemTokens } from '../types/designSystem';
import { t, type Locale } from '../i18n';
import { getUiLocale } from '../stores/useLocaleStore';
import { applyBrandColor, mixColor } from './colorHarmony';
import { minimalistSlateTheme, techIndigoTheme, warmCoralTheme } from './themePresets';

export interface CustomDesignSystemOptions {
  primary: string;
  style: 'minimal' | 'modern' | 'warm';
  density: DesignSystemTokens['personality']['density'];
  radius: 'sharp' | 'standard' | 'rounded';
}

export interface CustomDesignSystemCandidate {
  theme: DesignSystem;
  options: CustomDesignSystemOptions;
  seed: number;
  description: string;
  variant: 'clear' | 'mist' | 'layered';
}

export const DEFAULT_CUSTOM_DESIGN_SYSTEM: CustomDesignSystemOptions = {
  primary: '#42658c', style: 'modern', density: 'standard', radius: 'standard'
};

export const CUSTOM_STYLE_OPTIONS = [
  { value: 'minimal' as const, labelKey: 'workspace.customStyleMinimal' },
  { value: 'modern' as const, labelKey: 'workspace.customStyleModern' },
  { value: 'warm' as const, labelKey: 'workspace.customStyleWarm' },
];

const VARIANTS = ['clear', 'mist', 'layered'] as const;

export function normalizeCustomPrimary(value: string): string | null {
  const color = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(color)) return color;
  if (/^#[0-9a-f]{3}$/.test(color)) return '#' + [...color.slice(1)].map(c => c + c).join('');
  return null;
}

const radiusScales: Record<CustomDesignSystemOptions['radius'], DesignSystemTokens['radius']> = {
  sharp: { none: '0px', sm: '2px', md: '4px', lg: '6px', xl: '8px', full: '9999px' },
  standard: { none: '0px', sm: '4px', md: '8px', lg: '12px', xl: '16px', full: '9999px' },
  rounded: { none: '0px', sm: '8px', md: '14px', lg: '20px', xl: '28px', full: '9999px' }
};

function hash(value: string): number {
  let result = 2166136261;
  for (const char of value) result = Math.imul(result ^ char.charCodeAt(0), 16777619);
  return result >>> 0;
}

function styleLabel(style: CustomDesignSystemOptions['style'], locale: Locale): string {
  const key = CUSTOM_STYLE_OPTIONS.find(s => s.value === style)!.labelKey;
  return t(key, undefined, locale);
}

function variantLabel(variant: (typeof VARIANTS)[number], locale: Locale): string {
  const key =
    variant === 'clear' ? 'workspace.customVariantClear'
      : variant === 'mist' ? 'workspace.customVariantMist'
        : 'workspace.customVariantLayered';
  return t(key, undefined, locale);
}

/** Generate three complete, independent light/dark themes; the brand seed stays exact. */
export function generateCustomDesignSystems(
  input: CustomDesignSystemOptions,
  seed: number,
  locale: Locale = getUiLocale(),
): CustomDesignSystemCandidate[] {
  const primary = normalizeCustomPrimary(input.primary);
  if (!primary) throw new Error(t('workspace.customPrimaryError', undefined, locale));
  const options = { ...input, primary };
  const source = { minimal: minimalistSlateTheme, modern: techIndigoTheme, warm: warmCoralTheme }[options.style];
  const style = styleLabel(options.style, locale);
  return VARIANTS.map((variant, index) => {
    const key = hash(JSON.stringify([options, seed, index]));
    const amount = (key % 1000) / 1000;
    const tokens = applyBrandColor(structuredClone(source.tokens), primary, true);
    const tint = options.style === 'warm' ? mixColor(primary, '#cda879', 0.65) : primary;
    const strength = 0.015 + index * 0.025 + amount * 0.025;
    tokens.colors.background = {
      light: mixColor(options.style === 'warm' ? '#faf7f2' : '#f7f8fa', tint, strength),
      dark: mixColor(options.style === 'warm' ? '#191613' : '#111318', tint, strength)
    };
    tokens.colors.surfaceAlt = {
      light: mixColor('#f1f2f4', tint, strength * 1.5),
      dark: mixColor('#282a2f', tint, strength * 1.5)
    };
    tokens.colors.border = { light: mixColor('#dedfe2', tint, strength), dark: mixColor('#3c3d42', tint, strength) };
    tokens.personality = { density: options.density, borderAlpha: Number((0.5 + index * 0.1 + amount * 0.08).toFixed(3)) };
    tokens.radius = { ...radiusScales[options.radius] };
    const elevation = options.style === 'minimal' ? 2 : options.style === 'warm' ? 5 : 8;
    const depth = elevation + index * 2 + Math.round(amount * 2);
    tokens.shadows.card = {
      light: `0 ${Math.ceil(depth / 3)}px ${depth * 3}px -${depth}px rgba(20, 24, 32, ${options.style === 'minimal' ? '0.09' : '0.15'})`,
      dark: `0 ${Math.ceil(depth / 3)}px ${depth * 3}px -${depth}px rgba(0, 0, 0, 0.65)`
    };
    tokens.typography.weights.semibold = index === 2 ? 650 : 600;
    tokens.typography.sizes['3xl'] += index * 2;
    tokens.typography.sizes['4xl'] += index * 2;
    const variantText = variantLabel(variant, locale);
    const finish = t(
      options.style === 'minimal' ? 'workspace.customDescLightShadow' : 'workspace.customDescSoftLayers',
      undefined,
      locale,
    );
    return {
      theme: {
        id: `theme-custom-${key.toString(36)}`,
        name: t('workspace.customCandidateName', { style, variant: variantText, batch: seed + 1 }, locale),
        tokens,
      },
      options: { ...options },
      seed,
      variant,
      description: t('workspace.customCandidateDesc', { variant: variantText, finish }, locale),
    };
  });
}

/** Keep recent batches and always keep the user's selected theme available. */
export function retainDesignSystemCandidates(
  previous: CustomDesignSystemCandidate[], next: CustomDesignSystemCandidate[], selectedId: string, limit = 12
): CustomDesignSystemCandidate[] {
  const unique = [...new Map([...next, ...previous].map(c => [c.theme.id, c])).values()];
  const retained = unique.slice(0, Math.max(1, limit));
  const selected = unique.find(c => c.theme.id === selectedId);
  if (selected && !retained.includes(selected)) retained[retained.length - 1] = selected;
  return retained;
}
