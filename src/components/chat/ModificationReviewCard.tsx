import React, { useId, useRef, useState } from 'react';
import {
  getLocalModificationPlan,
  getRegionModificationPlan,
  type ModificationMode,
  type ModificationReviewState,
  type ModificationSuggestion,
} from '../../services/ai/modificationReview';
import { useT } from '../../stores/useLocaleStore';

export const ModificationReviewCard: React.FC<{
  review: ModificationReviewState;
  disabled?: boolean;
  onConfirm: (selected: string[], extra: string, mode: ModificationMode) => void | Promise<void>;
  onCancel: () => void;
  onRetry?: () => void;
}> = ({ review, disabled, onConfirm, onCancel, onRetry }) => {
  const t = useT();
  const [selected, setSelected] = useState<string[]>([]);
  const [extra, setExtra] = useState('');
  const [requestedMode, setRequestedMode] = useState<'auto' | ModificationMode>('auto');
  const modeGroup = useId();
  const localPlan = getLocalModificationPlan(review, selected);
  const regionPlan = getRegionModificationPlan(review, selected);
  const allCoveredByLocal = Boolean(localPlan && localPlan.includedIds.length === selected.length);
  const allCoveredByRegion = Boolean(regionPlan && regionPlan.includedIds.length === selected.length);
  const recommendedMode: ModificationMode = allCoveredByLocal ? 'local' : allCoveredByRegion ? 'region' : 'page';
  const mode: ModificationMode = requestedMode === 'auto' ? recommendedMode : requestedMode;
  const submitting = useRef(false);
  const [busy, setBusy] = useState(false);
  const ready = review.status === 'ready';
  const locked = disabled || busy || !ready;
  const skippedForMode =
    mode === 'local' && localPlan
      ? selected.filter((id) => !localPlan.includedIds.includes(id))
      : mode === 'region' && regionPlan
        ? selected.filter((id) => !regionPlan.includedIds.includes(id))
        : [];
  const scopeLabel = (scope?: ModificationSuggestion['scope']) =>
    scope === 'local' ? t('plan.modScopeLocal') : scope === 'region' ? t('plan.modScopeRegion') : t('plan.modScopePage');
  return (
    <section data-testid="modification-review" className="space-y-3 rounded-xl border border-host-border bg-host-elevated p-3 text-xs text-host-primary">
      <h3 className="font-semibold">{review.status === 'analyzing' ? t('plan.modTitleAnalyzing') : t('plan.modTitleReady')}</h3>
      <p className="text-host-secondary">{review.summary}</p>
      {review.evidence && (
        <details className="space-y-1 text-[11px] text-host-secondary">
          <summary className="cursor-pointer">{t('plan.modEvidenceSummary')}</summary>
          <p className="break-all">
            {t('plan.modEvidenceTask', { taskId: review.evidence.taskId, fingerprint: review.evidence.analysisFingerprint })}
          </p>
          <p>
            {t('plan.modEvidenceAttempts', {
              attempts: review.evidence.attempts,
              correction: review.evidence.attempts > 1 ? t('plan.modEvidenceCorrection') : '',
            })}
          </p>
          {review.evidence.downgrades.map((item) => (
            <p key={item.id} className="text-host-warning">
              {t('plan.modEvidenceDowngrade', {
                title: review.items.find((s) => s.id === item.id)?.title ?? item.id,
                reason: item.reason,
              })}
            </p>
          ))}
        </details>
      )}
      {ready && (
        <>
          <p className="text-[11px] text-host-secondary">{t('plan.modHintReady')}</p>
          <div className="max-h-80 space-y-2 overflow-y-auto">
            {review.items.map((item) => (
              <label key={item.id} className="flex cursor-pointer items-start gap-2 rounded-lg border border-host-border bg-host-sunken p-2">
                <input
                  type="checkbox"
                  disabled={locked}
                  checked={selected.includes(item.id)}
                  className="mt-0.5"
                  onChange={(e) => {
                    setSelected((prev) => (e.target.checked ? [...prev, item.id] : prev.filter((id) => id !== item.id)));
                    setRequestedMode('auto');
                  }}
                />
                <span className="min-w-0 space-y-1">
                  <strong className="block">{item.title}</strong>
                  <span className="block text-host-secondary">{item.reason}</span>
                  <span className="block text-host-primary">
                    {t('plan.modSuggestionPrefix')}
                    {item.change}
                  </span>
                  <span className="block text-[10px] text-host-brand">{scopeLabel(item.scope)}</span>
                </span>
              </label>
            ))}
          </div>
          <textarea
            aria-label={t('plan.modExtraAria')}
            value={extra}
            disabled={locked}
            onChange={(e) => setExtra(e.target.value)}
            placeholder={t('plan.modExtraPlaceholder')}
            className="min-h-20 w-full resize-y rounded-lg border border-host-border bg-host-sunken p-2 text-host-primary focus:outline-none focus:border-host-accent"
          />
          <fieldset className="space-y-2 rounded-lg border border-host-border p-2">
            <legend className="px-1 text-host-secondary">{t('plan.modModeLegend')}</legend>
            <label className="flex items-center gap-2">
              <input
                name={modeGroup}
                type="radio"
                checked={mode === 'local'}
                disabled={locked || !localPlan}
                onChange={() => setRequestedMode('local')}
              />
              {t('plan.modModeLocal')}
              {localPlan ? t('plan.modRecommended') : ''}
            </label>
            <label className="flex items-center gap-2">
              <input
                name={modeGroup}
                type="radio"
                checked={mode === 'region'}
                disabled={locked || !regionPlan}
                onChange={() => setRequestedMode('region')}
              />
              {t('plan.modModeRegion')}
              {recommendedMode === 'region' ? t('plan.modRecommended') : ''}
            </label>
            <label className="flex items-center gap-2">
              <input name={modeGroup} type="radio" checked={mode === 'page'} disabled={locked} onChange={() => setRequestedMode('page')} />
              {t('plan.modModePage')}
            </label>
            <p className="text-[11px] text-host-secondary">
              {mode === 'local' && localPlan
                ? t('plan.modModeHintLocal')
                : mode === 'region' && regionPlan
                  ? t('plan.modModeHintRegion')
                  : selected.length > 1 && review.items.some((item) => selected.includes(item.id) && item.scope !== 'page') && !allCoveredByLocal && !allCoveredByRegion
                    ? t('plan.modModeHintOverlap')
                    : t('plan.modModeHintPage')}
              {skippedForMode.length
                ? t('plan.modModeHintSkip', { count: skippedForMode.length })
                : t('plan.modModeHintSupplement')}
            </p>
          </fieldset>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={
                locked ||
                (!selected.length && !extra.trim()) ||
                (mode === 'local' && !localPlan) ||
                (mode === 'region' && !regionPlan)
              }
              onClick={async () => {
                if (submitting.current) return;
                submitting.current = true;
                setBusy(true);
                try {
                  const confirmed =
                    mode === 'local' && localPlan
                      ? localPlan.includedIds
                      : mode === 'region' && regionPlan
                        ? regionPlan.includedIds
                        : selected;
                  await onConfirm(confirmed, extra, mode);
                } finally {
                  submitting.current = false;
                  setBusy(false);
                }
              }}
              className="rounded-lg bg-host-accent hover:bg-host-accent-hover text-host-on-accent font-medium px-3 py-2 disabled:opacity-40 transition"
            >
              {t('plan.modConfirm')}
            </button>
            <button type="button" disabled={disabled || busy} onClick={onCancel} className="px-2 py-2 text-host-secondary hover:text-host-primary">
              {t('plan.modCancel')}
            </button>
          </div>
        </>
      )}
      {review.status === 'error' && (
        <div className="flex gap-3">
          {onRetry && (
            <button type="button" disabled={disabled} onClick={onRetry} className="text-host-brand hover:underline">
              {t('plan.modRetry')}
            </button>
          )}
          <button type="button" disabled={disabled} onClick={onCancel} className="text-host-secondary hover:text-host-primary">
            {t('plan.modCancel')}
          </button>
        </div>
      )}
      {review.status === 'submitted' && <p className="text-host-brand">{t('plan.modSubmitted')}</p>}
      {review.status === 'cancelled' && (
        <div className="space-y-2">
          <p className="text-host-secondary">{t('plan.modCancelled')}</p>
          {onRetry && (
            <button type="button" disabled={disabled} onClick={onRetry} className="text-host-brand hover:underline">
              {t('plan.modRetry')}
            </button>
          )}
        </div>
      )}
    </section>
  );
};