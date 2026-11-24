import React, { useState } from 'react';
import { Squircle } from 'lucide-react';
import { ComputedLayoutInfo } from '../../stores/useProjectStore';
import { SpacingNumberInput } from './BoxModelInspector';
import { toPlaceholder } from './PositionSizeInspector';
import { useT } from '../../stores/useLocaleStore';

/**
 * 圆角检查器 (doc/feature/inspector-geometry-tabs/spec.md BR-INS-05)
 *
 * 原先只有一个 6 档 token 下拉，既写不了自定义数值，也做不了四角独立。
 */

export interface RadiusInspectorProps {
  computedLayout?: ComputedLayoutInfo;
  declarations: Record<string, string>;
  onStyleChange: (prop: string, val: string, isCustom?: boolean) => void;
}

export const RADIUS_TOKENS: Array<{ value: string; label: string }> = [
  { value: '', label: '默认' },
  { value: 'var(--radius-none)', label: '无圆角 (0px)' },
  { value: 'var(--radius-sm)', label: 'SM (4px)' },
  { value: 'var(--radius-md)', label: 'MD (8px)' },
  { value: 'var(--radius-lg)', label: 'LG (12px)' },
  { value: 'var(--radius-xl)', label: 'XL (16px)' },
  { value: 'var(--radius-full)', label: 'Full 胶囊' }
];

export const CORNER_FIELDS: Array<{ prop: string; label: string; computedKey: keyof ComputedLayoutInfo }> = [
  { prop: 'border-top-left-radius', label: '左上', computedKey: 'borderTopLeftRadius' },
  { prop: 'border-top-right-radius', label: '右上', computedKey: 'borderTopRightRadius' },
  { prop: 'border-bottom-right-radius', label: '右下', computedKey: 'borderBottomRightRadius' },
  { prop: 'border-bottom-left-radius', label: '左下', computedKey: 'borderBottomLeftRadius' }
];

const INPUT_CLS =
  'w-full bg-slate-950 border border-slate-700 rounded-md px-1.5 py-1 text-center text-slate-200 text-[11px] font-mono focus:outline-none focus:border-blue-500';

/** 是否已存在任一角的独立设置——决定打开面板时默认落在哪个模式 */
export function hasPerCornerRadius(declarations: Record<string, string>): boolean {
  return CORNER_FIELDS.some((c) => Boolean(declarations[c.prop]));
}

export const RadiusInspector: React.FC<RadiusInspectorProps> = ({
  computedLayout,
  declarations,
  onStyleChange
}) => {
  const t = useT();
  const [perCorner, setPerCorner] = useState(() => hasPerCornerRadius(declarations));
  const presetLabels: Record<string, string> = {
    '': t('inspector.radiusPresetDefault'),
    'var(--radius-none)': t('inspector.radiusPresetNone'),
    'var(--radius-full)': t('inspector.radiusPresetFull'),
  };
  const cornerLabels: Record<string, string> = {
    'border-top-left-radius': t('inspector.radiusCornerTL'),
    'border-top-right-radius': t('inspector.radiusCornerTR'),
    'border-bottom-right-radius': t('inspector.radiusCornerBR'),
    'border-bottom-left-radius': t('inspector.radiusCornerBL'),
  };

  const unified = declarations['border-radius'] || '';
  const isTokenValue = unified.startsWith('var(');

  /** 切到统一模式：用统一值覆盖四角，避免残留的角值继续压住统一设置 */
  const switchToUnified = () => {
    CORNER_FIELDS.forEach((c) => onStyleChange(c.prop, ''));
    setPerCorner(false);
  };

  /** 切到四角模式：以当前统一值作为四角初值，视觉上不跳变 */
  const switchToPerCorner = () => {
    if (unified) {
      CORNER_FIELDS.forEach((c) => onStyleChange(c.prop, unified));
    }
    setPerCorner(true);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
          <Squircle className="w-3.5 h-3.5 text-slate-400" />
          <span>{t('inspector.radiusTitle')}</span>
        </span>
        <button
          type="button"
          data-testid="radius-mode-toggle"
          onClick={() => (perCorner ? switchToUnified() : switchToPerCorner())}
          className="text-[10px] px-1.5 py-0.5 rounded border border-slate-700 bg-slate-950 hover:bg-slate-800 text-slate-300 transition"
        >
          {perCorner ? t('inspector.radiusUnifiedBtn') : t('inspector.radiusPerCornerBtn')}
        </button>
      </div>

      {perCorner ? (
        <div>
          <div className="grid grid-cols-4 gap-1 text-center mb-1">
            {CORNER_FIELDS.map((c) => (
              <span key={c.prop} className="text-[10px] text-slate-500">
                {cornerLabels[c.prop] ?? c.label}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-4 gap-1">
            {CORNER_FIELDS.map((c) => (
              <SpacingNumberInput
                key={c.prop}
                value={declarations[c.prop] || ''}
                placeholder={toPlaceholder(computedLayout?.[c.computedKey] as string | undefined)}
                onChange={(v) => onStyleChange(c.prop, v)}
                className={INPUT_CLS}
                title={cornerLabels[c.prop] ?? c.label}
                data-testid={`radius-${c.prop}`}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <span className="text-[10px] text-slate-500 block mb-1">{t('inspector.radiusTokenLabel')}</span>
            <select
              value={isTokenValue ? unified : ''}
              onChange={(e) => onStyleChange('border-radius', e.target.value)}
              aria-label={t('inspector.radiusTokenAria')}
              data-testid="radius-token"
              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-1.5 text-slate-200 text-xs"
            >
              {RADIUS_TOKENS.map((item) => (
                <option key={item.value} value={item.value}>
                  {presetLabels[item.value] ?? item.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <span className="text-[10px] text-slate-500 block mb-1">{t('inspector.radiusCustomLabel')}</span>
            <SpacingNumberInput
              value={isTokenValue ? '' : unified}
              placeholder={toPlaceholder(computedLayout?.borderRadius)}
              onChange={(v) => onStyleChange('border-radius', v, true)}
              className={INPUT_CLS}
              title={t('inspector.radiusCustomTitle')}
              data-testid="radius-custom"
            />
          </div>
        </div>
      )}
    </div>
  );
};
