import React, { useState, useEffect } from 'react';
import { Link2, Link2Off, RotateCcw } from 'lucide-react';
import { ComputedBoxModel } from '../../stores/useProjectStore';
import { useT } from '../../stores/useLocaleStore';

interface BoxModelInspectorProps {
  computedBox: ComputedBoxModel;
  declarations: Record<string, string>;
  onStyleChange: (prop: string, val: string, isCustom?: boolean) => void;
}

const SPACING_TOKENS = [
  { label: '0px', value: 'var(--space-0)' },
  { label: '4px', value: 'var(--space-1)' },
  { label: '8px', value: 'var(--space-2)' },
  { label: '12px', value: 'var(--space-3)' },
  { label: '16px', value: 'var(--space-4)' },
  { label: '20px', value: 'var(--space-5)' },
  { label: '24px', value: 'var(--space-6)' },
  { label: '32px', value: 'var(--space-8)' }
];

/**
 * 净化用户在间距输入框中的输入文本，严格限制为合法数字字符（或合法关键字 auto/var）
 */
export function sanitizeSpacingInput(raw: string, allowNegative = false, allowAuto = false): string {
  if (!raw) return '';
  const trimmed = raw.trim();

  if (trimmed.startsWith('var(')) {
    return trimmed;
  }

  if (allowAuto) {
    const lower = trimmed.toLowerCase();
    if (lower === 'auto' || 'auto'.startsWith(lower)) {
      return lower;
    }
  }

  let isNegative = false;
  let remaining = trimmed;

  if (allowNegative && remaining.startsWith('-')) {
    isNegative = true;
    remaining = remaining.slice(1);
  }

  let hasDot = false;
  let digits = '';
  for (const ch of remaining) {
    if (ch >= '0' && ch <= '9') {
      digits += ch;
    } else if (ch === '.' && !hasDot) {
      hasDot = true;
      digits += '.';
    }
  }

  if (!digits && isNegative) return '-';
  if (!digits) return '';

  return isNegative ? `-${digits}` : digits;
}

/**
 * 将净化的间距值转换为标准有效的 CSS 属性值（自动补齐 px 单位，确保浏览器合法解析生效）
 */
export function formatCssSpacing(val: string, allowNegative = false): string {
  if (!val || val === '-' || val === '.') return '';
  const trimmed = val.trim();
  if (trimmed === 'auto' || trimmed.startsWith('var(')) return trimmed;

  const num = parseFloat(trimmed);
  if (Number.isNaN(num)) return '';
  if (!allowNegative && num < 0) return '0px';

  return `${num}px`;
}

/**
 * 将 CSS 属性值（如 20px, -10px）剥离单位后转化为输入框显示的纯数字字符串
 */
export function toDisplaySpacing(val: string): string {
  if (!val) return '';
  const trimmed = val.trim();
  if (trimmed.endsWith('px')) {
    return trimmed.slice(0, -2);
  }
  return trimmed;
}

export interface SpacingNumberInputProps {
  value: string;
  placeholder?: string;
  allowNegative?: boolean;
  allowAuto?: boolean;
  /** 无单位数值（如 z-index）：不追加 px */
  unitless?: boolean;
  disabled?: boolean;
  onChange: (cssVal: string) => void;
  className?: string;
  title?: string;
  'data-testid'?: string;
}

export const SpacingNumberInput: React.FC<SpacingNumberInputProps> = ({
  value,
  placeholder,
  allowNegative = false,
  allowAuto = false,
  unitless = false,
  disabled = false,
  onChange,
  className,
  title,
  'data-testid': testId
}) => {
  const [draft, setDraft] = useState<string | null>(null);

  // 当外部 value 改变且与当前 draft 不匹配时，重置本地编辑缓存
  useEffect(() => {
    if (draft !== null) {
      const formattedDraft = formatCssSpacing(draft, allowNegative);
      if (formattedDraft !== value && draft !== '-' && draft !== '.') {
        setDraft(null);
      }
    }
  }, [value, allowNegative]);

  const displayValue = draft !== null ? draft : toDisplaySpacing(value);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const sanitized = sanitizeSpacingInput(raw, allowNegative, allowAuto);
    setDraft(sanitized);

    if (!sanitized) {
      onChange('');
    } else if (sanitized === '-' || sanitized === '.') {
      // 半完成状态，等待后续输入，暂不提交非法 CSS
    } else if (sanitized === 'auto' || sanitized.startsWith('var(')) {
      onChange(sanitized);
    } else if (unitless) {
      onChange(sanitized);
    } else {
      const cssVal = formatCssSpacing(sanitized, allowNegative);
      if (cssVal) {
        onChange(cssVal);
      }
    }
  };

  const handleBlur = () => {
    if (draft !== null) {
      if (draft === '-' || draft === '.' || draft === '') {
        setDraft(null);
        onChange('');
      } else if (unitless) {
        setDraft(null);
        onChange(draft);
      } else {
        const cssVal = formatCssSpacing(draft, allowNegative);
        setDraft(null);
        onChange(cssVal);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      (e.target as HTMLInputElement).blur();
      return;
    }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const currentStr = draft !== null ? draft : toDisplaySpacing(value);
      let currentNum = parseFloat(currentStr);
      if (Number.isNaN(currentNum)) {
        currentNum = placeholder ? parseFloat(placeholder) || 0 : 0;
      }
      const step = e.shiftKey ? 10 : 1;
      const delta = e.key === 'ArrowUp' ? step : -step;
      let nextNum = currentNum + delta;
      if (!allowNegative && nextNum < 0) nextNum = 0;
      const nextStr = String(nextNum);
      setDraft(nextStr);
      onChange(unitless ? nextStr : `${nextNum}px`);
    }
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      value={displayValue}
      placeholder={placeholder}
      disabled={disabled}
      onChange={handleChange}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      className={className}
      title={title}
      data-testid={testId}
    />
  );
};

export const BoxModelInspector: React.FC<BoxModelInspectorProps> = ({
  computedBox,
  declarations,
  onStyleChange
}) => {
  const t = useT();
  const [paddingLinked, setPaddingLinked] = useState(false);
  const [marginLinked, setMarginLinked] = useState(false);

  const isPaddingOverridden = Boolean(
    declarations['padding'] ||
      declarations['padding-top'] ||
      declarations['padding-right'] ||
      declarations['padding-bottom'] ||
      declarations['padding-left']
  );

  const isMarginOverridden = Boolean(
    declarations['margin'] ||
      declarations['margin-top'] ||
      declarations['margin-right'] ||
      declarations['margin-bottom'] ||
      declarations['margin-left']
  );

  const handlePaddingChange = (side: 'top' | 'right' | 'bottom' | 'left', val: string) => {
    const formatted = formatCssSpacing(val, false);
    if (paddingLinked) {
      // Clear individual sides and set unified padding
      ['padding-top', 'padding-right', 'padding-bottom', 'padding-left'].forEach((s) => {
        if (declarations[s]) onStyleChange(s, '');
      });
      onStyleChange('padding', formatted);
    } else {
      if (declarations['padding']) onStyleChange('padding', '');
      onStyleChange(`padding-${side}`, formatted);
    }
  };

  const handleMarginChange = (side: 'top' | 'right' | 'bottom' | 'left', val: string) => {
    const formatted = formatCssSpacing(val, true);
    if (marginLinked) {
      ['margin-top', 'margin-right', 'margin-bottom', 'margin-left'].forEach((s) => {
        if (declarations[s]) onStyleChange(s, '');
      });
      onStyleChange('margin', formatted);
    } else {
      if (declarations['margin']) onStyleChange('margin', '');
      onStyleChange(`margin-${side}`, formatted);
    }
  };

  const resetPadding = () => {
    ['padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left'].forEach((p) => {
      if (declarations[p]) onStyleChange(p, '');
    });
  };

  const resetMargin = () => {
    ['margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left'].forEach((p) => {
      if (declarations[p]) onStyleChange(p, '');
    });
  };

  return (
    <div className="space-y-3 pt-2 border-t border-slate-800" data-testid="box-model-inspector">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
          {t('inspector.boxModelTitle')}
        </span>
        {(isPaddingOverridden || isMarginOverridden) && (
          <button
            onClick={() => {
              resetPadding();
              resetMargin();
            }}
            title={t('inspector.resetSpacingTitle')}
            className="text-[10px] text-blue-400 hover:text-blue-300 flex items-center gap-1"
          >
            <RotateCcw className="w-2.5 h-2.5" />
            <span>{t('inspector.resetSpacingBtn')}</span>
          </button>
        )}
      </div>

      {/* Padding & Margin Controls */}
      <div className="space-y-3">
        {/* Padding Editor Section */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-medium text-emerald-400 flex items-center gap-1">
              <span>{t('inspector.paddingLabel')}</span>
              {isPaddingOverridden && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setPaddingLinked(!paddingLinked)}
                className={`p-1 rounded transition ${
                  paddingLinked
                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
                title={paddingLinked ? t('inspector.sidesLinkedTitle') : t('inspector.sidesUnlinkedTitle')}
              >
                {paddingLinked ? <Link2 className="w-3 h-3" /> : <Link2Off className="w-3 h-3" />}
              </button>
              {isPaddingOverridden && (
                <button
                  type="button"
                  onClick={resetPadding}
                  title={t('inspector.clearPaddingTitle')}
                  className="p-1 text-slate-500 hover:text-slate-300 rounded"
                >
                  <RotateCcw className="w-2.5 h-2.5" />
                </button>
              )}
            </div>
          </div>

          {paddingLinked ? (
            <div className="flex items-center gap-1.5">
              <select
                value={
                  SPACING_TOKENS.some((tok) => tok.value === (declarations['padding'] || ''))
                    ? declarations['padding']
                    : declarations['padding'] ? 'custom' : ''
                }
                onChange={(e) => {
                  if (e.target.value !== 'custom') {
                    handlePaddingChange('top', e.target.value);
                  }
                }}
                className="flex-1 bg-slate-950 border border-slate-700 rounded-lg p-1.5 text-slate-200 text-xs focus:outline-none focus:border-emerald-500"
              >
                <option value="">{t('inspector.spacingDefaultOption', { value: computedBox?.padding?.top ?? 0 })}</option>
                {SPACING_TOKENS.map((tok) => (
                  <option key={tok.value} value={tok.value}>
                    {tok.label} ({tok.value})
                  </option>
                ))}
                {!SPACING_TOKENS.some((tok) => tok.value === declarations['padding']) && declarations['padding'] && (
                  <option value="custom">{t('inspector.spacingCustomOption', { value: declarations['padding'] })}</option>
                )}
              </select>
              <SpacingNumberInput
                placeholder={t('inspector.spacingCustomPlaceholder')}
                value={declarations['padding'] || ''}
                allowNegative={false}
                allowAuto={false}
                onChange={(val) => handlePaddingChange('top', val)}
                className="w-28 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 font-mono"
                title={t('inspector.paddingCustomInputTitle')}
                data-testid="padding-linked-custom-input"
              />
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-1.5">
              {(['top', 'right', 'bottom', 'left'] as const).map((side) => (
                <div key={side} className="space-y-0.5">
                  <span className="text-[9px] text-slate-500 block text-center uppercase">{side[0]}</span>
                  <SpacingNumberInput
                    placeholder={`${computedBox?.padding?.[side] ?? 0}`}
                    value={declarations[`padding-${side}`] || (declarations['padding'] ?? '')}
                    allowNegative={false}
                    allowAuto={false}
                    onChange={(val) => handlePaddingChange(side, val)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-1.5 py-1 text-center text-xs text-slate-200 focus:outline-none focus:border-emerald-500 font-mono"
                    title={`Padding ${side}`}
                    data-testid={`padding-${side}-input`}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Margin Editor Section */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-medium text-amber-400 flex items-center gap-1">
              <span>{t('inspector.marginLabel')}</span>
              {isMarginOverridden && <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />}
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setMarginLinked(!marginLinked)}
                className={`p-1 rounded transition ${
                  marginLinked
                    ? 'bg-amber-950 text-amber-300 border border-amber-800'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
                title={marginLinked ? t('inspector.sidesLinkedTitle') : t('inspector.sidesUnlinkedTitle')}
              >
                {marginLinked ? <Link2 className="w-3 h-3" /> : <Link2Off className="w-3 h-3" />}
              </button>
              {isMarginOverridden && (
                <button
                  type="button"
                  onClick={resetMargin}
                  title={t('inspector.clearMarginTitle')}
                  className="p-1 text-slate-500 hover:text-slate-300 rounded"
                >
                  <RotateCcw className="w-2.5 h-2.5" />
                </button>
              )}
            </div>
          </div>

          {marginLinked ? (
            <div className="flex items-center gap-1.5">
              <select
                value={
                  SPACING_TOKENS.some((tok) => tok.value === (declarations['margin'] || ''))
                    ? declarations['margin']
                    : declarations['margin'] ? 'custom' : ''
                }
                onChange={(e) => {
                  if (e.target.value !== 'custom') {
                    handleMarginChange('top', e.target.value);
                  }
                }}
                className="flex-1 bg-slate-950 border border-slate-700 rounded-lg p-1.5 text-slate-200 text-xs focus:outline-none focus:border-amber-500"
              >
                <option value="">{t('inspector.spacingDefaultOption', { value: computedBox?.margin?.top ?? 0 })}</option>
                <option value="auto">{t('inspector.marginAutoOption')}</option>
                {SPACING_TOKENS.map((tok) => (
                  <option key={tok.value} value={tok.value}>
                    {tok.label} ({tok.value})
                  </option>
                ))}
                {!SPACING_TOKENS.some((tok) => tok.value === declarations['margin']) && declarations['margin'] && (
                  <option value="custom">{t('inspector.spacingCustomOption', { value: declarations['margin'] })}</option>
                )}
              </select>
              <SpacingNumberInput
                placeholder={t('inspector.spacingCustomPlaceholder')}
                value={declarations['margin'] || ''}
                allowNegative={true}
                allowAuto={true}
                onChange={(val) => handleMarginChange('top', val)}
                className="w-28 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-amber-500 font-mono"
                title={t('inspector.marginCustomInputTitle')}
                data-testid="margin-linked-custom-input"
              />
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-1.5">
              {(['top', 'right', 'bottom', 'left'] as const).map((side) => (
                <div key={side} className="space-y-0.5">
                  <span className="text-[9px] text-slate-500 block text-center uppercase">{side[0]}</span>
                  <SpacingNumberInput
                    placeholder={`${computedBox?.margin?.[side] ?? 0}`}
                    value={declarations[`margin-${side}`] || (declarations['margin'] ?? '')}
                    allowNegative={true}
                    allowAuto={true}
                    onChange={(val) => handleMarginChange(side, val)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-1.5 py-1 text-center text-xs text-slate-200 focus:outline-none focus:border-amber-500 font-mono"
                    title={`Margin ${side}`}
                    data-testid={`margin-${side}-input`}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
