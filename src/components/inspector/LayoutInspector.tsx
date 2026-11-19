import React, { useMemo } from 'react';
import { ArrowDown, ArrowRight, Grid, Maximize2, RotateCcw, Rows, WrapText } from 'lucide-react';
import { useT } from '../../stores/useLocaleStore';
import { ComputedLayoutInfo } from '../../stores/useProjectStore';

interface LayoutInspectorProps {
  computedLayout?: ComputedLayoutInfo;
  declarations: Record<string, string>;
  onStyleChange: (prop: string, val: string, isCustom?: boolean) => void;
  onClearProp?: (prop: string) => void;
}

export const LayoutInspector: React.FC<LayoutInspectorProps> = ({
  computedLayout,
  declarations,
  onStyleChange,
  onClearProp
}) => {
  const t = useT();
  const l = (key: string, params?: Record<string, string | number>) =>
    t(`inspector.layout.${key}` as Parameters<typeof t>[0], params);

  const GAP_TOKEN_OPTIONS = useMemo(
    () => [
      { label: l('gapDefault'), value: '' },
      { label: l('gapSpace0'), value: 'var(--space-0)' },
      { label: l('gapSpace1'), value: 'var(--space-1)' },
      { label: l('gapSpace2'), value: 'var(--space-2)' },
      { label: l('gapSpace3'), value: 'var(--space-3)' },
      { label: l('gapSpace4'), value: 'var(--space-4)' },
      { label: l('gapSpace5'), value: 'var(--space-5)' },
      { label: l('gapSpace6'), value: 'var(--space-6)' },
      { label: l('gapSpace8'), value: 'var(--space-8)' }
    ],
    [t]
  );

  // Current effective values (override takes precedence over computed)
  const effectiveDisplay = String(declarations['display'] || computedLayout?.display || 'block').toLowerCase();
  const isFlex = effectiveDisplay === 'flex' || effectiveDisplay === 'inline-flex';
  const isGrid = effectiveDisplay === 'grid' || effectiveDisplay === 'inline-grid';

  const effectiveDirection = String(declarations['flex-direction'] || computedLayout?.flexDirection || 'row').toLowerCase();
  const effectiveAlign = String(declarations['align-items'] || computedLayout?.alignItems || 'stretch').toLowerCase();
  const effectiveJustify = String(declarations['justify-content'] || computedLayout?.justifyContent || 'flex-start').toLowerCase();
  const effectiveWrap = String(declarations['flex-wrap'] || computedLayout?.flexWrap || 'nowrap').toLowerCase();
  const effectiveGap = declarations['gap'] ?? (computedLayout?.gap && computedLayout.gap !== '0px' && computedLayout.gap !== 'normal' ? computedLayout.gap : '');

  const isOverridden = (prop: string) => Boolean(declarations[prop]);

  const justifyOptions = useMemo(
    () =>
      [
        { val: 'flex-start', label: l('justifyStart'), tip: l('justifyStartTip') },
        { val: 'center', label: l('justifyCenter'), tip: l('justifyCenterTip') },
        { val: 'flex-end', label: l('justifyEnd'), tip: l('justifyEndTip') },
        { val: 'space-between', label: l('justifyBetween'), tip: l('justifyBetweenTip') },
        { val: 'space-around', label: l('justifyAround'), tip: l('justifyAroundTip') }
      ] as const,
    [t]
  );

  const alignOptions = useMemo(
    () =>
      [
        { val: 'stretch', label: l('alignStretch'), tip: l('alignStretchTip') },
        { val: 'flex-start', label: l('alignStart'), tip: l('alignStartTip') },
        { val: 'center', label: l('alignCenter'), tip: l('alignCenterTip') },
        { val: 'flex-end', label: l('alignEnd'), tip: l('alignEndTip') }
      ] as const,
    [t]
  );

  return (
    <div className="space-y-3 pt-2 border-t border-slate-800" data-testid="layout-inspector">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
          {l('sectionTitle')}
        </span>
        {(isOverridden('display') ||
          isOverridden('flex-direction') ||
          isOverridden('align-items') ||
          isOverridden('justify-content') ||
          isOverridden('flex-wrap') ||
          isOverridden('gap')) && (
          <button
            onClick={() => {
              ['display', 'flex-direction', 'align-items', 'justify-content', 'flex-wrap', 'gap'].forEach((p) => {
                if (declarations[p]) onStyleChange(p, '');
              });
            }}
            title={l('resetLayoutTitle')}
            className="text-[10px] text-blue-400 hover:text-blue-300 flex items-center gap-1"
          >
            <RotateCcw className="w-2.5 h-2.5" />
            <span>{l('resetLayout')}</span>
          </button>
        )}
      </div>

      {/* Display Mode Switcher */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] text-slate-500">{l('displayMode')}</span>
          {isOverridden('display') && <span className="w-1.5 h-1.5 rounded-full bg-blue-500" title={l('overriddenTitle')} />}
        </div>
        <div className="grid grid-cols-3 gap-1 p-0.5 bg-slate-950 border border-slate-800 rounded-lg">
          <button
            type="button"
            onClick={() => onStyleChange('display', 'flex')}
            className={`py-1 px-1.5 rounded text-[11px] font-medium transition flex items-center justify-center gap-1 ${
              effectiveDisplay === 'flex'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Rows className="w-3 h-3" />
            <span>{l('displayFlex')}</span>
          </button>
          <button
            type="button"
            onClick={() => onStyleChange('display', 'grid')}
            className={`py-1 px-1.5 rounded text-[11px] font-medium transition flex items-center justify-center gap-1 ${
              effectiveDisplay === 'grid'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Grid className="w-3 h-3" />
            <span>{l('displayGrid')}</span>
          </button>
          <button
            type="button"
            onClick={() => onStyleChange('display', 'block')}
            className={`py-1 px-1.5 rounded text-[11px] font-medium transition flex items-center justify-center gap-1 ${
              effectiveDisplay === 'block'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Maximize2 className="w-3 h-3" />
            <span>{l('displayBlock')}</span>
          </button>
        </div>
      </div>

      {/* Flex controls: Direction & Wrap */}
      {isFlex && (
        <div className="space-y-2.5 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-slate-500">{l('mainAxisDirection')}</span>
                {isOverridden('flex-direction') && <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />}
              </div>
              <div className="grid grid-cols-2 gap-1 bg-slate-900 p-0.5 rounded-lg border border-slate-800">
                <button
                  type="button"
                  title={l('rowTitle')}
                  onClick={() => onStyleChange('flex-direction', 'row')}
                  className={`py-1 rounded text-[10px] font-medium flex items-center justify-center gap-1 transition ${
                    effectiveDirection === 'row'
                      ? 'bg-slate-800 text-blue-400 border border-slate-700 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <ArrowRight className="w-3 h-3" />
                  <span>{l('row')}</span>
                </button>
                <button
                  type="button"
                  title={l('colTitle')}
                  onClick={() => onStyleChange('flex-direction', 'column')}
                  className={`py-1 rounded text-[10px] font-medium flex items-center justify-center gap-1 transition ${
                    effectiveDirection === 'column'
                      ? 'bg-slate-800 text-blue-400 border border-slate-700 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <ArrowDown className="w-3 h-3" />
                  <span>{l('col')}</span>
                </button>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-slate-500">{l('flexWrap')}</span>
                {isOverridden('flex-wrap') && <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />}
              </div>
              <div className="grid grid-cols-2 gap-1 bg-slate-900 p-0.5 rounded-lg border border-slate-800">
                <button
                  type="button"
                  title={l('nowrapTitle')}
                  onClick={() => onStyleChange('flex-wrap', 'nowrap')}
                  className={`py-1 rounded text-[10px] font-medium flex items-center justify-center transition ${
                    effectiveWrap === 'nowrap'
                      ? 'bg-slate-800 text-blue-400 border border-slate-700 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span>{l('singleLine')}</span>
                </button>
                <button
                  type="button"
                  title={l('wrapTitle')}
                  onClick={() => onStyleChange('flex-wrap', 'wrap')}
                  className={`py-1 rounded text-[10px] font-medium flex items-center justify-center gap-1 transition ${
                    effectiveWrap === 'wrap'
                      ? 'bg-slate-800 text-blue-400 border border-slate-700 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <WrapText className="w-3 h-3" />
                  <span>{l('wrap')}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Justify Content */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-slate-500">{l('justifyLabel')}</span>
              {isOverridden('justify-content') && <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />}
            </div>
            <div className="grid grid-cols-5 gap-1 bg-slate-900 p-0.5 rounded-lg border border-slate-800">
              {justifyOptions.map(({ val, label, tip }) => (
                <button
                  key={val}
                  type="button"
                  title={tip}
                  onClick={() => onStyleChange('justify-content', val)}
                  className={`py-1 rounded text-[10px] font-medium transition ${
                    effectiveJustify === val
                      ? 'bg-slate-800 text-blue-400 border border-slate-700 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Align Items */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-slate-500">{l('alignLabel')}</span>
              {isOverridden('align-items') && <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />}
            </div>
            <div className="grid grid-cols-4 gap-1 bg-slate-900 p-0.5 rounded-lg border border-slate-800">
              {alignOptions.map(({ val, label, tip }) => (
                <button
                  key={val}
                  type="button"
                  title={tip}
                  onClick={() => onStyleChange('align-items', val)}
                  className={`py-1 rounded text-[10px] font-medium transition ${
                    effectiveAlign === val
                      ? 'bg-slate-800 text-blue-400 border border-slate-700 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Gap for Flex & Grid */}
      {(isFlex || isGrid) && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-slate-500">{l('gapLabel')}</span>
            {isOverridden('gap') && <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />}
          </div>
          <div className="flex items-center gap-1.5">
            <select
              value={
                GAP_TOKEN_OPTIONS.some((o) => o.value === effectiveGap)
                  ? effectiveGap
                  : effectiveGap ? 'custom' : ''
              }
              onChange={(e) => {
                if (e.target.value !== 'custom') {
                  onStyleChange('gap', e.target.value);
                }
              }}
              className="flex-1 bg-slate-950 border border-slate-700 rounded-lg p-1.5 text-slate-200 text-xs focus:outline-none focus:border-blue-500"
            >
              {GAP_TOKEN_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
              {!GAP_TOKEN_OPTIONS.some((o) => o.value === effectiveGap) && effectiveGap && (
                <option value="custom">{l('gapCustom', { gap: effectiveGap })}</option>
              )}
            </select>
            {isOverridden('gap') && (
              <button
                type="button"
                onClick={() => onStyleChange('gap', '')}
                title={l('clearGapTitle')}
                className="p-1.5 text-slate-500 hover:text-slate-300 rounded bg-slate-900 border border-slate-800"
              >
                <RotateCcw className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};