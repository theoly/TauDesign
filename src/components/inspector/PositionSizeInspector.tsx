import React, { useMemo } from 'react';
import { Move, Ruler } from 'lucide-react';
import { useT } from '../../stores/useLocaleStore';
import { ComputedBoxModel, ComputedLayoutInfo } from '../../stores/useProjectStore';
import { SpacingNumberInput } from './BoxModelInspector';

/**
 * 定位与尺寸检查器 (doc/feature/inspector-geometry-tabs/spec.md BR-INS-03/04)
 *
 * 此前面板顶部只读地显示「尺寸: 352 × 178px」，宽高不可改，定位能力整段缺失。
 * 本组件补齐这两块，并沿用 `SpacingNumberInput` 的输入规整与方向键步进。
 */

export interface PositionSizeInspectorProps {
  computedBox?: ComputedBoxModel;
  computedLayout?: ComputedLayoutInfo;
  declarations: Record<string, string>;
  onStyleChange: (prop: string, val: string, isCustom?: boolean) => void;
}

const INPUT_CLS =
  'w-full bg-slate-950 border border-slate-700 rounded-md px-1.5 py-1 text-center text-slate-200 text-[11px] font-mono focus:outline-none focus:border-blue-500 disabled:opacity-40 disabled:cursor-not-allowed';

/** 生效值转占位提示：0px / auto 这类噪声值不值得显示 */
export function toPlaceholder(computed?: string): string {
  if (!computed) return '—';
  const v = computed.trim();
  if (!v || v === 'auto' || v === 'normal') return 'auto';
  if (v === '0px') return '0';
  if (v.endsWith('px')) return v.slice(0, -2);
  return v;
}

/** static（含未设置时的默认值）下四向偏移与层级在 CSS 中无效，应禁用而非放任误操作 (BR-INS-04) */
export function isOffsetDisabled(declaredPosition: string, computedPosition?: string): boolean {
  const effective = declaredPosition || computedPosition || 'static';
  return effective === 'static';
}

const OFFSET_FIELDS: Array<{ prop: 'top' | 'right' | 'bottom' | 'left'; label: string }> = [
  { prop: 'top', label: 'T' },
  { prop: 'right', label: 'R' },
  { prop: 'bottom', label: 'B' },
  { prop: 'left', label: 'L' }
];

export const PositionSizeInspector: React.FC<PositionSizeInspectorProps> = ({
  computedBox,
  computedLayout,
  declarations,
  onStyleChange
}) => {
  const t = useT();
  const l = (key: string, params?: Record<string, string | number>) =>
    t(`inspector.layout.${key}` as Parameters<typeof t>[0], params);

  const POSITION_OPTIONS = useMemo(
    () =>
      [
        { value: '', label: l('positionDefault') },
        { value: 'static', label: l('positionStatic') },
        { value: 'relative', label: l('positionRelative') },
        { value: 'absolute', label: l('positionAbsolute') },
        { value: 'fixed', label: l('positionFixed') },
        { value: 'sticky', label: l('positionSticky') }
      ] as const,
    [t]
  );

  const SIZE_PRESETS = useMemo(
    () =>
      [
        { label: l('presetAuto'), value: 'auto', title: l('presetAutoTitle') },
        { label: l('presetFill'), value: '100%', title: l('presetFillTitle') },
        { label: l('presetFitContent'), value: 'fit-content', title: l('presetFitContentTitle') }
      ] as const,
    [t]
  );

  const declaredPosition = declarations['position'] || '';
  const offsetsDisabled = isOffsetDisabled(declaredPosition, computedLayout?.position);

  return (
    <div className="space-y-3">
      {/* ── 尺寸 ───────────────────────────────── */}
      <div className="space-y-2">
        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
          <Ruler className="w-3.5 h-3.5 text-slate-400" />
          <span>{l('sectionSize')}</span>
        </span>

        <div className="grid grid-cols-2 gap-2">
          {(['width', 'height'] as const).map((prop) => (
            <div key={prop}>
              <span className="text-[10px] text-slate-500 block mb-1">
                {prop === 'width' ? l('widthW') : l('heightH')}
                <span className="text-slate-600 ml-1 font-mono">
                  {prop === 'width'
                    ? `${Math.round(computedBox?.width ?? 0)}px`
                    : `${Math.round(computedBox?.height ?? 0)}px`}
                </span>
              </span>
              <SpacingNumberInput
                value={declarations[prop] || ''}
                placeholder={toPlaceholder(
                  prop === 'width' ? computedLayout?.width : computedLayout?.height
                )}
                allowAuto
                onChange={(v) => onStyleChange(prop, v)}
                className={INPUT_CLS}
                title={prop === 'width' ? l('widthTitle') : l('heightTitle')}
                data-testid={`size-${prop}`}
              />
            </div>
          ))}
        </div>

        <div className="flex items-center gap-1">
          <span className="text-[10px] text-slate-500 shrink-0">{l('sizeShortcuts')}</span>
          {SIZE_PRESETS.map((p) => (
            <button
              key={p.value}
              type="button"
              title={p.title}
              onClick={() => onStyleChange('width', p.value)}
              className="px-1.5 py-0.5 bg-slate-950 hover:bg-slate-800 border border-slate-700 rounded text-[10px] text-slate-300 transition"
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── 定位 ───────────────────────────────── */}
      <div className="space-y-2 pt-2 border-t border-slate-800/80">
        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
          <Move className="w-3.5 h-3.5 text-slate-400" />
          <span>{l('sectionPosition')}</span>
        </span>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <span className="text-[10px] text-slate-500 block mb-1">{l('positionMode')}</span>
            <select
              value={declaredPosition}
              onChange={(e) => onStyleChange('position', e.target.value)}
              aria-label={l('positionMode')}
              data-testid="position-mode"
              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-1.5 text-slate-200 text-xs"
            >
              {POSITION_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                  {o.value === '' && computedLayout?.position
                    ? l('positionCurrent', { position: computedLayout.position })
                    : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <span className="text-[10px] text-slate-500 block mb-1">{l('zIndexLabel')}</span>
            <SpacingNumberInput
              value={declarations['z-index'] || ''}
              placeholder={toPlaceholder(computedLayout?.zIndex)}
              allowNegative
              unitless
              disabled={offsetsDisabled}
              onChange={(v) => onStyleChange('z-index', v)}
              className={INPUT_CLS}
              title={l('zIndexTitle')}
              data-testid="position-zindex"
            />
          </div>
        </div>

        <div>
          <div className="grid grid-cols-4 gap-1 text-center mb-1">
            {OFFSET_FIELDS.map((f) => (
              <span key={f.prop} className="text-[10px] text-slate-500">
                {f.label}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-4 gap-1">
            {OFFSET_FIELDS.map((f) => (
              <SpacingNumberInput
                key={f.prop}
                value={declarations[f.prop] || ''}
                placeholder={toPlaceholder(computedLayout?.[f.prop])}
                allowNegative
                allowAuto
                disabled={offsetsDisabled}
                onChange={(v) => onStyleChange(f.prop, v)}
                className={INPUT_CLS}
                title={f.prop}
                data-testid={`offset-${f.prop}`}
              />
            ))}
          </div>
        </div>

        {offsetsDisabled && (
          <p className="text-[10px] text-slate-500 leading-tight" data-testid="offset-static-hint">
            {l('offsetStaticHint')}
          </p>
        )}
      </div>
    </div>
  );
};