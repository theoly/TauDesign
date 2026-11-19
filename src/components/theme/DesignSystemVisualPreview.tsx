import { buildThemePreview } from '../../utils/themePreview';
import type { DeviceProfile } from '../../styles/baseCss';
import React, { useMemo, useState } from 'react';
import { DesignSystem, DENSITY_SCALE } from '../../types/designSystem';
import { compileTokensToCss } from '../../utils/cssCompiler';
import { resolveColorRoles } from '../../utils/colorHarmony';
import { Check, Copy, Eye, Moon, Sun, Terminal } from 'lucide-react';
import { useT } from '../../stores/useLocaleStore';
import { localizedPresetLabel } from '../../utils/themePresetLabels';

interface DesignSystemVisualPreviewProps {
  theme: DesignSystem;
  colorMode?: 'light' | 'dark';
  onColorModeChange?: (mode: 'light' | 'dark') => void;
  className?: string;
  compact?: boolean;
  device?: DeviceProfile;
}

export const DesignSystemVisualPreview: React.FC<DesignSystemVisualPreviewProps> = ({
  theme,
  colorMode: controlledMode,
  onColorModeChange,
  className = '',
  compact = false,
  device = 'pc'
}) => {
  const t = useT();
  const [internalMode, setInternalMode] = useState<'light' | 'dark'>('light');
  const [viewTab, setViewTab] = useState<'visual' | 'token'>('visual');
  const [copied, setCopied] = useState(false);
  const displayName = localizedPresetLabel(theme.id)?.name ?? theme.name;
  const subtitle =
    theme.id === 'theme-neutral-modern' || theme.id === 'neutral-modern'
      ? t('workspace.previewNeutralSubtitle')
      : t('workspace.previewSandboxSubtitle');

  const mode = controlledMode ?? internalMode;
  const setMode = (m: 'light' | 'dark') => {
    if (onColorModeChange) onColorModeChange(m);
    else setInternalMode(m);
  };

  const tokens = theme.tokens;
  const spacing = (key: string) => Math.round((tokens.spacing[key] ?? 16) * DENSITY_SCALE[tokens.personality.density]);
  const roles = useMemo(() => resolveColorRoles(tokens, mode), [tokens, mode]);
  const compiledCss = useMemo(() => compileTokensToCss(tokens, mode), [tokens, mode]);

  // 取代表性色值供卡片直接显示 Hex
  const primaryHex = roles.primary;
  const bgHex = roles.background;
  const surfaceHex = roles.surface;
  const surfaceAltHex = roles.surfaceAlt;
  const textPrimaryHex = roles.textPrimary;
  const borderHex = roles.border;

  const handleCopyCss = () => {
    navigator.clipboard.writeText(compiledCss);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`flex flex-col h-full bg-slate-950 text-slate-200 overflow-hidden ${className}`}>
      {/* Top Header Bar */}
      <div className={`px-5 py-3.5 border-b border-slate-800/80 bg-slate-900/60 flex gap-3 shrink-0 ${compact ? 'flex-col items-stretch' : 'flex-wrap items-center justify-between'}`}>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className="w-3.5 h-3.5 rounded-full border border-white/20 shrink-0"
              style={{ backgroundColor: primaryHex }}
            />
            <h3 className="min-w-0 break-words font-semibold text-slate-100 text-sm">{displayName}</h3>
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">{subtitle}</p>
        </div>

        {/* Controls: Mode & View Toggle */}
        <div className="flex items-center gap-2 shrink-0">
          {/* View Tab Toggle */}
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-0.5 flex items-center text-xs">
            <button
              onClick={() => setViewTab('visual')}
              className={`px-2.5 py-1 rounded-md transition flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                viewTab === 'visual'
                  ? 'bg-blue-600 text-white font-medium shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Eye className="w-3.5 h-3.5 shrink-0" />
              <span>{t('workspace.previewVisual')}</span>
            </button>
            <button
              onClick={() => setViewTab('token')}
              className={`px-2.5 py-1 rounded-md transition flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                viewTab === 'token'
                  ? 'bg-blue-600 text-white font-medium shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Terminal className="w-3.5 h-3.5 shrink-0" />
              <span>Token</span>
            </button>
          </div>

          {/* Color Mode Toggle */}
          <button
            onClick={() => setMode(mode === 'light' ? 'dark' : 'light')}
            className="p-1.5 rounded-lg border border-slate-800 bg-slate-900 text-slate-400 hover:text-slate-200 hover:border-slate-700 transition"
            title={t('workspace.previewToggleMode', {
              mode: mode === 'light' ? t('header.dark') : t('header.light'),
            })}
          >
            {mode === 'light' ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5 text-amber-400" />}
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-5">
        {viewTab === 'visual' ? (
          <div
            data-design-sample="system"
            className="rounded-xl border p-6 transition-colors shadow-inner"
            style={{
              backgroundColor: bgHex,
              borderColor: borderHex,
              color: textPrimaryHex,
              fontFamily: tokens.typography.fontFamilySans
            }}
          >
            {/* Section 1: Palette */}
            <div className="mb-6">
              <h4 className="text-[11px] font-bold uppercase tracking-wider mb-3 opacity-60">{t('workspace.previewPalette')}</h4>
              <div className={`grid gap-2.5 ${compact ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-4 md:grid-cols-6'}`}>
                {[
                  { label: 'Primary', role: 'accent', hex: primaryHex, bg: primaryHex, text: roles.onPrimary },
                  { label: 'Surface', role: 'surface', hex: surfaceHex, bg: surfaceHex, text: textPrimaryHex, border: true },
                  { label: 'Surface Alt', role: 'accent-sec', hex: surfaceAltHex, bg: surfaceAltHex, text: textPrimaryHex },
                  { label: 'Success', role: 'success', hex: roles.success.text, bg: roles.success.light, text: roles.success.text },
                  { label: 'Warning', role: 'warning', hex: roles.warning.text, bg: roles.warning.light, text: roles.warning.text },
                  { label: 'Danger', role: 'danger', hex: roles.danger.text, bg: roles.danger.light, text: roles.danger.text }
                ].map((c) => (
                  <div
                    key={c.label}
                    className="rounded-lg p-2.5 flex flex-col justify-between h-20 transition shadow-sm"
                    style={{
                      backgroundColor: c.bg,
                      color: c.text,
                      border: c.border ? `1px solid ${borderHex}` : 'none'
                    }}
                  >
                    <span className="text-[10px] font-bold truncate leading-tight">{c.label}</span>
                    <div>
                      <span className="text-[9px] block opacity-80 uppercase tracking-tight">{c.role}</span>
                      <span className="text-[10px] font-mono opacity-90">{c.hex}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Section 2: Typography */}
            <div className="mb-6">
              <h4 className="text-[11px] font-bold uppercase tracking-wider mb-3 opacity-60">{t('workspace.previewTypography')}</h4>
              <div
                className="p-4 rounded-xl space-y-3"
                style={{
                  backgroundColor: surfaceHex,
                  border: `1px solid ${borderHex}`
                }}
              >
                <div>
                  <span className="text-[9px] uppercase tracking-wider font-mono opacity-50 block mb-1">Display</span>
                  <div data-design-sample="display" style={{ fontSize: tokens.typography.sizes['2xl'], fontWeight: tokens.typography.weights.bold, lineHeight: tokens.typography.lineHeights.tight }}>The grid carries weight; the line carries pace.</div>
                </div>
                <div className="pt-2 border-t" style={{ borderColor: borderHex }}>
                  <span className="text-[9px] uppercase tracking-wider font-mono opacity-50 block mb-1">Body</span>
                  <div data-design-sample="body" className="opacity-85" style={{ fontSize: tokens.typography.sizes.md, lineHeight: tokens.typography.lineHeights.normal }}>
                    {t('workspace.previewBodySample')}
                  </div>
                </div>
                <div className="pt-2 border-t" style={{ borderColor: borderHex }}>
                  <span className="text-[9px] uppercase tracking-wider font-mono opacity-50 block mb-1">Mono</span>
                  <code className="text-[11px] opacity-80 block truncate" style={{ fontFamily: tokens.typography.fontFamilyMono }}>
                    const theme = &#123; density: &quot;{tokens.personality.density}&quot;, radius: &quot;{tokens.radius.md}&quot; &#125;;
                  </code>
                </div>
              </div>
            </div>

            <iframe title={t('workspace.previewIframeTitle')} srcDoc={buildThemePreview(tokens, mode, device)}
              className="w-full rounded-xl border-0 mb-6" style={{ height: compact ? 480 : 620 }} />
            {/* Section 3: Components */}
            <div>
              <h4 className="text-[11px] font-bold uppercase tracking-wider mb-3 opacity-60">{t('workspace.previewComponents')}</h4>
              <div
                data-design-sample="card"
                className="p-5 transition shadow-sm"
                style={{
                  backgroundColor: surfaceHex,
                  border: `1px solid ${borderHex}`,
                  borderRadius: tokens.radius.lg,
                  boxShadow: tokens.shadows.card[mode],
                  padding: spacing('4')
                }}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: roles.textSecondary }}>CARD SAMPLE</span>
                  <div className="flex items-center gap-1.5">
                    <span
                      className="px-2 py-0.5 text-[10px] font-medium rounded-full"
                      style={{ backgroundColor: roles.success.light, color: roles.success.text }}
                    >
                      Active
                    </span>
                    <span
                      className="px-2 py-0.5 text-[10px] font-medium rounded-full"
                      style={{ backgroundColor: roles.primaryLight, color: roles.primaryText }}
                    >
                      Pro
                    </span>
                  </div>
                </div>

                <h5 className="font-semibold text-sm mb-1">Production-quality artifact</h5>
                <p className="text-xs mb-4 leading-relaxed" style={{ color: roles.textSecondary }}>
                  {t('workspace.previewCardBlurb')}
                </p>

                {/* Interactive Controls Sandbox */}
                <div className="flex flex-wrap items-center gap-3 pt-3 border-t" style={{ borderColor: borderHex }}>
                  <button
                    type="button"
                    className="px-3.5 py-1.5 text-xs font-semibold text-white transition shadow-sm"
                    style={{
                      backgroundColor: primaryHex,
                      color: roles.onPrimary,
                      borderRadius: tokens.radius.md,
                      padding: `${spacing('2')}px ${spacing('3')}px`,
                      fontSize: tokens.typography.sizes.sm,
                      fontWeight: tokens.typography.weights.semibold,
                      lineHeight: tokens.typography.lineHeights.normal
                    }}
                  >
                    {t('workspace.previewPrimaryBtn')}
                  </button>

                  <button
                    type="button"
                    className="px-3.5 py-1.5 text-xs font-semibold transition"
                    style={{
                      backgroundColor: surfaceAltHex,
                      color: textPrimaryHex,
                      border: `1px solid ${borderHex}`,
                      borderRadius: tokens.radius.md
                    }}
                  >
                    {t('workspace.previewSecondaryBtn')}
                  </button>

                  <button
                    type="button"
                    className="px-2.5 py-1.5 text-xs font-medium transition hover:underline"
                    style={{
                      color: roles.primaryText
                    }}
                  >
                    {t('workspace.previewLinkBtn')}
                  </button>

                  <div className="flex-1 min-w-[140px]">
                    <input
                      readOnly
                      placeholder={t('workspace.previewInputPlaceholder')}
                      className="w-full text-xs px-3 py-1.5 outline-none transition"
                      style={{
                        backgroundColor: bgHex,
                        border: `1px solid ${borderHex}`,
                        color: textPrimaryHex,
                        borderRadius: tokens.radius.sm
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Token Code View */
          <div className="relative">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-mono text-slate-400">:root CSS Variables</span>
              <button
                onClick={handleCopyCss}
                className="flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs transition"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? t('workspace.previewCopied') : t('workspace.previewCopyCss')}</span>
              </button>
            </div>
            <pre className="p-4 bg-slate-900 border border-slate-800 rounded-xl text-[11px] font-mono text-blue-300 overflow-x-auto max-h-[500px]">
              {compiledCss}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
};
