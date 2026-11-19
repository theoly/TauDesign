import { t, type Locale } from '../i18n';
import { getUiLocale } from '../stores/useLocaleStore';

const PRESET_KEYS: Record<string, { name: string; description: string }> = {
  'neutral-modern': {
    name: 'workspace.presetNeutralModernName',
    description: 'workspace.presetNeutralModernDesc',
  },
  'theme-neutral-modern': {
    name: 'workspace.presetNeutralModernName',
    description: 'workspace.presetNeutralModernDesc',
  },
  'tech-blue': {
    name: 'workspace.presetTechBlueName',
    description: 'workspace.presetTechBlueDesc',
  },
  'theme-tech-blue': {
    name: 'workspace.presetTechBlueName',
    description: 'workspace.presetTechBlueDesc',
  },
  'vibrant-violet': {
    name: 'workspace.presetVibrantVioletName',
    description: 'workspace.presetVibrantVioletDesc',
  },
  'theme-vibrant-violet': {
    name: 'workspace.presetVibrantVioletName',
    description: 'workspace.presetVibrantVioletDesc',
  },
  'minimalist-slate': {
    name: 'workspace.presetMinimalistSlateName',
    description: 'workspace.presetMinimalistSlateDesc',
  },
  'theme-minimalist-slate': {
    name: 'workspace.presetMinimalistSlateName',
    description: 'workspace.presetMinimalistSlateDesc',
  },
  'emerald-nature': {
    name: 'workspace.presetEmeraldNatureName',
    description: 'workspace.presetEmeraldNatureDesc',
  },
  'theme-emerald-nature': {
    name: 'workspace.presetEmeraldNatureName',
    description: 'workspace.presetEmeraldNatureDesc',
  },
  'ant-blue': {
    name: 'workspace.presetAntBlueName',
    description: 'workspace.presetAntBlueDesc',
  },
  'theme-ant-blue': {
    name: 'workspace.presetAntBlueName',
    description: 'workspace.presetAntBlueDesc',
  },
  'supabase-emerald': {
    name: 'workspace.presetSupabaseEmeraldName',
    description: 'workspace.presetSupabaseEmeraldDesc',
  },
  'theme-supabase-emerald': {
    name: 'workspace.presetSupabaseEmeraldName',
    description: 'workspace.presetSupabaseEmeraldDesc',
  },
};

export function localizedPresetLabel(
  id: string,
  locale: Locale = getUiLocale(),
): { name: string; description: string } | null {
  const keys = PRESET_KEYS[id];
  if (!keys) return null;
  return {
    name: t(keys.name, undefined, locale),
    description: t(keys.description, undefined, locale),
  };
}

const DEVICE_KEYS: Record<string, string> = {
  'mobile-compact': 'workspace.deviceMobileCompact',
  'mobile-standard': 'workspace.deviceMobileStandard',
  'mobile-tall': 'workspace.deviceMobileTall',
  'pc-laptop': 'workspace.devicePcLaptop',
  'pc-standard': 'workspace.devicePcStandard',
  'pc-wide': 'workspace.devicePcWide',
  legacy: 'workspace.deviceLegacySize',
};

export function localizedReferenceDeviceName(
  id: string,
  fallback: string,
  locale: Locale = getUiLocale(),
): string {
  const key = DEVICE_KEYS[id];
  return key ? t(key, undefined, locale) : fallback;
}
