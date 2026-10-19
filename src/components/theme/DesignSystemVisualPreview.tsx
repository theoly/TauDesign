import React, { useMemo, useState } from 'react';
import { DesignSystem } from '../../types/designSystem';
import { compileTokensToCss } from '../../utils/cssCompiler';
import { resolveColorRoles } from '../../utils/colorHarmony';
import { Check, Copy, Eye, Moon, Sun, Terminal } from 'lucide-react';

interface DesignSystemVisualPreviewProps {
  theme: DesignSystem;
  colorMode?: 'light' | 'dark';
  onColorModeChange?: (mode: 'light' | 'dark') => void;
  className?: string;
  compact?: boolean;
}

export const DesignSystemVisualPreview: React.FC<DesignSystemVisualPreviewProps> = ({
  theme,
  colorMode: controlledMode,
  onColorModeChange,
  className = '',
  compact = false
}) => {
  const [internalMode, setInternalMode] = useState<'light' | 'dark'>('light');
  const [viewTab, setViewTab] = useState<'visual' | 'token'>('visual');
  const [copied, setCopied] = useState(false);

  const mode = controlledMode ?? internalMode;
  const setMode = (m: 'light' | 'dark') => {
    if (onColorModeChange) onColorModeChange(m);
    else setInternalMode(m);
  };

  const tokens = theme.tokens;
  const roles = useMemo(() => resolveColorRoles(tokens, mode), [tokens, mode]);
  const compiledCss = useMemo(() => compileTokensToCss(tokens, mode), [tokens, mode]);

  // 取代表性色值供卡片直接显示 Hex
  const primaryHex = tokens.colors.primary['500'] || '#2563eb';
  const bgHex = mode === 'dark' ? tokens.colors.background.dark : tokens.colors.background.light;
  const surfaceHex = mode === 'dark' ? tokens.colors.surface.dark : tokens.colors.surface.light;
  const surfaceAltHex = mode === 'dark' ? tokens.colors.surfaceAlt.dark : tokens.colors.surfaceAlt.light;
  const textPrimaryHex = roles.textPrimary;
  const borderHex = mode === 'dark' ? tokens.colors.border.dark : tokens.colors.border.light;

  const handleCopyCss = () => {
    navigator.clipboard.writeText(compiledCss);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`flex flex-col h-full bg-slate-950 text-slate-200 overflow-hidden ${className}`}>
      {/* Top Header Bar */}
      <div className="px-5 py-3.5 border-b border-slate-800/80 bg-slate-900/60 flex items-center justify-between shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <span
              className="w-3.5 h-3.5 rounded-full border border-white/20 shrink-0"
              style={{ backgroundColor: primaryHex }}
            />
            <h3 className="font-semibold text-slate-100 text-sm">{theme.name}</h3>
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {theme.id === 'theme-neutral-modern'
              ? '现代全栈中性风 · 默认主题：克制冷灰阶、精致微质感阴影、自然圆角'
              : '设计系统可视化沙盒 · 调色板、排版尺度与组件渲染'}
          </p>
        </div>

        {/* Controls: Mode & View Toggle */}
        <div className="flex items-center gap-2">
          {/* View Tab Toggle */}
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-0.5 flex items-center text-xs">
            <button
              onClick={() => setViewTab('visual')}
              className={`px-2.5 py-1 rounded-md transition flex items-center gap-1.5 ${
                viewTab === 'visual'
                  ? 'bg-blue-600 text-white font-medium shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span>可视化</span>
            </button>
            <button
              onClick={() => setViewTab('token')}
              className={`px-2.5 py-1 rounded-md transition flex items-center gap-1.5 ${
                viewTab === 'token'
                  ? 'bg-blue-600 text-white font-medium shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Terminal className="w-3.5 h-3.5" />
              <span>Token</span>
            </button>
          </div>

          {/* Color Mode Toggle */}
          <button
            onClick={() => setMode(mode === 'light' ? 'dark' : 'light')}
            className="p-1.5 rounded-lg border border-slate-800 bg-slate-900 text-slate-400 hover:text-slate-200 hover:border-slate-700 transition"
            title={`切换为${mode === 'light' ? '深色' : '浅色'}模式预览`}
          >
            {mode === 'light' ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5 text-amber-400" />}
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-5">
        {viewTab === 'visual' ? (
          <div
            className="rounded-xl border p-6 transition-colors shadow-inner"
            style={{
              backgroundColor: bgHex,
              borderColor: borderHex,
              color: textPrimaryHex
            }}
          >
            {/* Section 1: Palette */}
            <div className="mb-6">
              <h4 className="text-[11px] font-bold uppercase tracking-wider mb-3 opacity-60">调色板 (Palette)</h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2.5">
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
              <h4 className="text-[11px] font-bold uppercase tracking-wider mb-3 opacity-60">排版标尺 (Typography)</h4>
              <div
                className="p-4 rounded-xl space-y-3"
                style={{
                  backgroundColor: surfaceHex,
                  border: `1px solid ${borderHex}`
                }}
              >
                <div>
                  <span className="text-[9px] uppercase tracking-wider font-mono opacity-50 block mb-1">Display</span>
                  <div className="text-xl font-bold tracking-tight">The grid carries weight; the line carries pace.</div>
                </div>
                <div className="pt-2 border-t" style={{ borderColor: borderHex }}>
                  <span className="text-[9px] uppercase tracking-wider font-mono opacity-50 block mb-1">Body</span>
                  <div className="text-xs leading-relaxed opacity-85">
                    标准正文文本采用高可读性字族与严谨行高，克制与韵律在设计系统中优于盲目繁复。
                  </div>
                </div>
                <div className="pt-2 border-t" style={{ borderColor: borderHex }}>
                  <span className="text-[9px] uppercase tracking-wider font-mono opacity-50 block mb-1">Mono</span>
                  <code className="text-[11px] font-mono opacity-80 block truncate">
                    const theme = &#123; density: &quot;{tokens.personality.density}&quot;, radius: &quot;{tokens.radius.md}&quot; &#125;;
                  </code>
                </div>
              </div>
            </div>

            {/* Section 3: Components */}
            <div>
              <h4 className="text-[11px] font-bold uppercase tracking-wider mb-3 opacity-60">核心组件 (Components)</h4>
              <div
                className="p-5 transition shadow-sm"
                style={{
                  backgroundColor: surfaceHex,
                  border: `1px solid ${borderHex}`,
                  borderRadius: tokens.radius.lg
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
                <p className="text-xs opacity-75 mb-4 leading-relaxed">
                  展示当前设计系统在卡片底色、边框细微透明度、间距节奏与主色调交互下的综合真实质感。
                </p>

                {/* Interactive Controls Sandbox */}
                <div className="flex flex-wrap items-center gap-3 pt-3 border-t" style={{ borderColor: borderHex }}>
                  <button
                    type="button"
                    className="px-3.5 py-1.5 text-xs font-semibold text-white transition shadow-sm"
                    style={{
                      backgroundColor: primaryHex,
                      color: roles.onPrimary,
                      borderRadius: tokens.radius.md
                    }}
                  >
                    主操作 (Primary)
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
                    次级操作 (Secondary)
                  </button>

                  <button
                    type="button"
                    className="px-2.5 py-1.5 text-xs font-medium transition hover:underline"
                    style={{
                      color: primaryHex
                    }}
                  >
                    幽灵链接 (Link →)
                  </button>

                  <div className="flex-1 min-w-[140px]">
                    <input
                      readOnly
                      placeholder="表单输入框效果..."
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
                <span>{copied ? '已复制' : '复制 CSS'}</span>
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
