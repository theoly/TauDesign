import React from 'react';
import { Check, Copy, X } from 'lucide-react';
import { useT } from '../../stores/useLocaleStore';
import { useProjectStore } from '../../stores/useProjectStore';
import type { CandidateDeliveryReport } from '../../services/ai/candidateValidation';
import type { QualityReport } from '../../services/ai/generationQuality';
import type { RenderedQualityReport } from '../../utils/renderedQuality';
import type { CandidateValidationEvidence } from '../../services/ai/candidateValidation';
import { findingSummary } from '../chat/QualityFindings';
import { QualityReportCard } from '../chat/QualityReportCard';
import { RenderedQualityCard } from '../chat/RenderedQualityCard';
import { CandidateRecheckControl } from './CandidateRecheckControl';
import { CandidateEvidencePanel } from './CandidateEvidencePanel';
import { renderFindingsForDisplay } from '../../services/ai/findingPolicy';

type StagedSave = 'pending' | 'saved' | 'failed' | null | undefined;

export function CandidateAdoptionPanel({
  deliveryReport,
  blockers,
  blockedDescription,
  adoptionBlocked,
  structureConfirmed,
  canConfirmDelivery,
  structureOnlyConfirm,
  renderKey,
  stagedCandidateSaveStatus,
  stagedAdoptionStatus,
  stagedAdoptionError,
  renderPending,
  renderIncomplete,
  taskCurrent,
  stagedAssetIssues,
  candidateQuality,
  renderedReport,
  stagedValidationEvidence,
  evidenceStale,
  historicalEvidence,
  onConfirmStructure,
  onRecheckAssets,
  onDiscard,
  onLocate,
}: {
  deliveryReport: CandidateDeliveryReport | null;
  blockers: CandidateDeliveryReport['checks'];
  blockedDescription: string;
  adoptionBlocked: boolean;
  structureConfirmed: boolean;
  canConfirmDelivery: boolean;
  structureOnlyConfirm: boolean;
  renderKey: string;
  stagedCandidateSaveStatus: StagedSave;
  stagedAdoptionStatus: string | null;
  stagedAdoptionError: string | null;
  renderPending: boolean;
  renderIncomplete: boolean;
  taskCurrent: boolean;
  stagedAssetIssues: Array<{ message: string }>;
  candidateQuality: QualityReport | null;
  renderedReport?: RenderedQualityReport;
  stagedValidationEvidence: CandidateValidationEvidence | null;
  evidenceStale: boolean;
  historicalEvidence?: CandidateValidationEvidence;
  onConfirmStructure: (checked: boolean) => void;
  onRecheckAssets: () => void;
  onDiscard: () => void;
  onLocate: (nid: string) => void;
}) {
  const t = useT();
  const saving = stagedAdoptionStatus === 'saving';
  const passed = deliveryReport?.checks.filter((c) => c.status === 'passed').length ?? 0;
  const total = deliveryReport?.checks.length ?? 0;
  const primaryReason = blockers[0]?.message ?? '';
  const extraBlockers = Math.max(0, blockers.length - 1);
  const renderFindings = renderedReport ? renderFindingsForDisplay(renderedReport) : [];
  const hasDesignIssues = Boolean(candidateQuality && candidateQuality.findings.length > 0);
  const hasRenderIssues = Boolean(renderedReport && (renderFindings.length > 0 || renderedReport.status !== 'complete'));
  const showIssues = hasDesignIssues || hasRenderIssues || blockers.length > 0;

  return (
    <div
      data-testid="candidate-actions-toolbar"
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.code === 'Space') e.stopPropagation();
      }}
      className="absolute top-5 left-1/2 z-50 w-[min(40rem,calc(100%-1.5rem))] -translate-x-1/2 overflow-hidden rounded-2xl border border-violet-500/35 bg-slate-950/95 text-xs text-slate-300 shadow-2xl shadow-violet-950/40 backdrop-blur-xl"
    >
      {/* Status strip */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-slate-800/80 px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="h-2 w-2 shrink-0 rounded-full bg-violet-400 shadow-[0_0_8px_rgba(167,139,250,0.8)]" />
          <span className="truncate font-semibold text-violet-100">{t('chat.candidateReadySideBySide')}</span>
        </div>
        {stagedCandidateSaveStatus && (
          <span
            role={stagedCandidateSaveStatus === 'failed' ? 'alert' : 'status'}
            className={`shrink-0 ${stagedCandidateSaveStatus === 'failed' ? 'text-amber-300' : 'text-slate-500'}`}
          >
            {stagedCandidateSaveStatus === 'pending'
              ? t('chat.candidateSaving')
              : stagedCandidateSaveStatus === 'saved'
                ? t('chat.candidateSaved')
                : t('chat.candidateSaveFailed')}
          </span>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <CandidateRecheckControl />
          <CandidateEvidencePanel
            current={stagedValidationEvidence}
            historical={historicalEvidence}
            currentIsStale={evidenceStale}
          />
          {deliveryReport && (
            <span
              role="status"
              title={deliveryReport.checks.map((check) => `${check.id}: ${check.message}`).join('\n')}
              className={`rounded-md px-2 py-1 font-medium tabular-nums ${
                deliveryReport.status === 'ready'
                  ? 'bg-emerald-950/50 text-emerald-300'
                  : 'bg-slate-900 text-slate-300'
              }`}
            >
              {t('chat.deliveryChecks', { passed, total })}
            </span>
          )}
        </div>
      </div>

      {/* Alerts + compact issue drawer */}
      {(showIssues ||
        saving ||
        stagedAdoptionError ||
        renderPending ||
        renderIncomplete ||
        !taskCurrent ||
        stagedAssetIssues.length > 0) && (
        <div className="space-y-2 border-b border-slate-800/80 px-4 py-3">
          {saving && (
            <p role="status" className="text-slate-300">
              {t('chat.savingDelivery')}
            </p>
          )}
          {stagedAdoptionError && (
            <p role="alert" className="text-amber-300">
              {stagedAdoptionError}
            </p>
          )}
          {renderPending && (
            <p role="status" className="text-slate-400">
              {t('chat.renderChecking')}
            </p>
          )}
          {renderIncomplete && (
            <p role="alert" className="text-amber-300">
              {t('chat.renderIncompleteCannotAdopt')}
            </p>
          )}
          {!taskCurrent && (
            <p role="alert" className="text-amber-300">
              {t('chat.candidateExpired')}
            </p>
          )}
          {stagedAssetIssues.length > 0 && (
            <p role="alert" className="text-amber-300">
              {t('chat.assetIssuesPrefix', {
                message: stagedAssetIssues[0].message,
                extra:
                  stagedAssetIssues.length > 1
                    ? t('chat.assetIssuesExtra', { count: stagedAssetIssues.length - 1 })
                    : '',
              })}
            </p>
          )}
          {deliveryReport?.checks.find((check) => check.id === 'entities')?.status === 'blocked' && (
            <p role="alert" className="break-words text-amber-300">
              {t('chat.entityIssuesPrefix', {
                message: deliveryReport.checks.find((check) => check.id === 'entities')!.message,
              })}
            </p>
          )}
          {deliveryReport?.checks.find((check) => check.id === 'asset_files')?.status !== 'passed' && (
            <p role="alert" className="flex flex-wrap items-center gap-2 text-amber-300">
              <span>{deliveryReport?.checks.find((check) => check.id === 'asset_files')?.message}</span>
              <button
                type="button"
                onClick={onRecheckAssets}
                className="underline text-blue-300 hover:text-blue-200"
              >
                {t('chat.recheckAssets')}
              </button>
            </p>
          )}
          {renderedReport?.findings.some((f) => f.severity === 'error') && (
            <p role="alert" className="text-rose-300">
              {t('chat.severeRenderBlock')}
            </p>
          )}

          {blockers.length > 0 && (
            <div
              id="candidate-delivery-blockers"
              data-testid="candidate-delivery-blockers"
              role={deliveryReport?.status === 'blocked' ? 'alert' : 'status'}
              className="rounded-xl border border-amber-500/25 bg-amber-950/25 px-3 py-2.5 text-amber-100"
            >
              <p className="font-medium text-amber-50">
                {structureConfirmed ? t('chat.structureConfirmedPrefix') : t('chat.cannotAdoptPrefix')}
                <span className="font-normal text-amber-100/90">{primaryReason}</span>
                {extraBlockers > 0 && (
                  <span className="ml-1 text-amber-200/70">{t('chat.moreBlockerReasons', { count: extraBlockers })}</span>
                )}
              </p>
              {canConfirmDelivery && (
                <label className="mt-2.5 flex cursor-pointer items-start gap-2 text-slate-200">
                  <input
                    type="checkbox"
                    aria-label={t(structureOnlyConfirm ? 'chat.structureAcceptAria' : 'chat.overrideAcceptAria')}
                    checked={structureConfirmed}
                    disabled={saving}
                    onChange={(e) => onConfirmStructure(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span>{t(structureOnlyConfirm ? 'chat.structureAcceptHint' : 'chat.overrideAcceptHint')}</span>
                </label>
              )}
            </div>
          )}

          {(hasDesignIssues || hasRenderIssues) && (
            <details className="group rounded-xl border border-slate-700/80 bg-slate-900/60">
              <summary className="cursor-pointer list-none px-3 py-2 text-slate-300 marker:content-none [&::-webkit-details-marker]:hidden">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-slate-200">{t('chat.adoptionIssues')}</span>
                  {hasDesignIssues && candidateQuality && (
                    <span className="rounded-md bg-amber-950/40 px-1.5 py-0.5 text-[11px] text-amber-200">
                      {t('chat.designIssueChip')} · {findingSummary(candidateQuality.findings)}
                    </span>
                  )}
                  {hasRenderIssues && renderedReport && (
                    <span className="rounded-md bg-slate-800 px-1.5 py-0.5 text-[11px] text-slate-300">
                      {t('chat.renderIssueChip')}
                      {renderFindings.length ? ` · ${findingSummary(renderFindings)}` : ''}
                    </span>
                  )}
                  <span className="ml-auto text-[11px] text-slate-500 group-open:hidden">{t('chat.expandIssues')}</span>
                  <span className="ml-auto hidden text-[11px] text-slate-500 group-open:inline">{t('chat.collapseIssues')}</span>
                </div>
              </summary>
              <div className="max-h-56 space-y-2 overflow-y-auto border-t border-slate-800 px-3 py-2">
                {hasDesignIssues && candidateQuality && <QualityReportCard report={candidateQuality} embedded />}
                {renderedReport && <RenderedQualityCard report={renderedReport} onLocate={onLocate} embedded />}
              </div>
            </details>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <p className="text-[11px] text-slate-500">{t('chat.adoptionActionsHint')}</p>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            disabled={adoptionBlocked || saving}
            onClick={() =>
              void useProjectStore
                .getState()
                .commitStagedDelivery(structureConfirmed ? 'confirm-structure-replace' : 'replace', renderKey)
            }
            aria-describedby={blockers.length ? 'candidate-delivery-blockers' : undefined}
            title={
              adoptionBlocked
                ? blockedDescription
                : structureConfirmed
                  ? t('chat.adoptStructureTitle')
                  : t('chat.adoptTitle')
            }
            className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg bg-blue-600 px-3.5 py-2 font-medium text-white shadow transition enabled:hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500 disabled:shadow-none"
          >
            <Check className="h-4 w-4" />
            <span>{t('chat.adoptReplace')}</span>
          </button>
          <button
            type="button"
            disabled={adoptionBlocked || saving}
            onClick={() =>
              void useProjectStore
                .getState()
                .commitStagedDelivery(structureConfirmed ? 'confirm-structure-keep-both' : 'keep-both', renderKey)
            }
            aria-describedby={blockers.length ? 'candidate-delivery-blockers' : undefined}
            title={adoptionBlocked ? blockedDescription : t('chat.keepBothTitle')}
            className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-700 bg-slate-900 px-3.5 py-2 font-medium text-slate-200 transition enabled:hover:bg-slate-800 disabled:cursor-not-allowed disabled:text-slate-500 disabled:opacity-60"
          >
            <Copy className="h-4 w-4" />
            <span>{t('chat.keepBoth')}</span>
          </button>
          <button
            type="button"
            onClick={onDiscard}
            title={t('chat.discardTitle')}
            className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg px-3 py-2 font-medium text-slate-400 transition hover:bg-slate-900 hover:text-rose-300"
          >
            <X className="h-4 w-4" />
            <span>{t('chat.keepOriginal')}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
