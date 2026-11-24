import {PageTaskCoverageCard} from '../chat/PageTaskCoverageCard';
import {CandidateRepairControl,RepairReceipt} from './CandidateRepairControl';
import { useProjectStore } from '../../stores/useProjectStore';
import { ModificationReviewSource } from '../chat/ModificationReviewSource';
import React, { useState } from 'react';
import type { CandidateValidationEvidence } from '../../services/ai/candidateValidation';
import { CandidatePreviewPanel } from './CandidatePreviewPanel';
import {DesignGuidanceCard} from '../chat/DesignGuidanceCard';
import {PageTaskPlanCard} from '../chat/PageTaskPlanCard';
import {HistoricalDraftSource} from '../chat/HistoricalDraftSource';
import {QualityFindings,findingSummary} from '../chat/QualityFindings';
import {renderFindingsForDisplay} from '../../services/ai/findingPolicy';
import {RenderCoverageDetails} from '../chat/RenderCoverageDetails';
import {useT} from '../../stores/useLocaleStore';

export function EvidenceRecord({ evidence }: { evidence: CandidateValidationEvidence }) {
  const t = useT();
  const labels = {
    entities: t('quality.evidenceLabelEntities'),
    task: t('quality.evidenceLabelTask'),
    source: t('quality.evidenceLabelSource'),
    quality: t('quality.evidenceLabelQuality'),
    structure: t('quality.evidenceLabelStructure'),
    assets: t('quality.evidenceLabelAssets'),
    asset_files: t('quality.evidenceLabelAssetFiles'),
    render: t('quality.evidenceLabelRender'),
  };
  const statuses = {
    passed: t('quality.evidenceStatusPassed'),
    blocked: t('quality.evidenceStatusBlocked'),
    pending: t('quality.evidenceStatusPending'),
  };
  const audit = evidence.projectAssets;
  return <div className="space-y-3">
    <p className="text-slate-500">{new Date(evidence.capturedAt).toLocaleString()} · {evidence.viewport.width} × {evidence.viewport.height}</p>
    <p className="break-all text-slate-500">{t('quality.evidenceCandidateTokenLine', { candidate: evidence.candidateFingerprint, token: evidence.designSystem.tokenFingerprint })}</p>
    {evidence.designLibrary && <p className="text-slate-400">{t('quality.evidenceLibraryLine', { name: evidence.designLibrary.sourceName, fingerprint: evidence.designLibrary.sourceFingerprint })}</p>}
    <ul className="space-y-1.5">
      {evidence.delivery.checks.map(check => <li key={check.id}>
        <span className="font-medium text-slate-300">{labels[check.id]}：{statuses[check.status]}</span>
        <p className="mt-0.5 text-slate-500">{check.message}</p>
      </li>)}
    </ul>
    {evidence.delivery.workflow&&<details><summary className="cursor-pointer text-slate-400">{t('quality.evidenceWorkflowSummary')}</summary>
      <p className="mt-2 break-all text-slate-500">{evidence.delivery.workflow.plan.workflowId} · {evidence.delivery.workflow.plan.fingerprint}</p>
      {evidence.delivery.workflow.checks.map(check=><p key={check.id} className="mt-1 text-slate-500">{check.id}：{statuses[check.status]} · {check.message}</p>)}
    </details>}
    {!!evidence.quality.findings.length && <details>
      <summary className="cursor-pointer text-slate-400">{t('quality.evidenceStaticSummary', { count: evidence.quality.findings.length })}</summary>
      <p className="mt-2 text-slate-400">{findingSummary(evidence.quality.findings)}</p>
      <QualityFindings findings={evidence.quality.findings}/>
    </details>}
    {evidence.render && <details>
      <summary className="cursor-pointer text-slate-400">{t('quality.evidenceRenderSummary', { inspected: evidence.render.inspected, count: evidence.render.findings.length })}</summary>
      {evidence.render.reason && <p className="mt-2 text-amber-300">{evidence.render.reason}</p>}
      <p className="mt-2 text-slate-400">{findingSummary(renderFindingsForDisplay(evidence.render))}</p>
      <QualityFindings findings={renderFindingsForDisplay(evidence.render)}/>
      <RenderCoverageDetails coverage={evidence.render.coverage}/>
    </details>}
    <RepairReceipt value={evidence.repair}/>
    {audit ? <div className="space-y-2 border-t border-slate-800 pt-2">
      <p className="font-medium text-slate-300">{t('quality.evidenceAssetAuditTitle')}</p>
      <p className="text-slate-500">{t('quality.evidenceAssetAuditStats', { screens: audit.screenCount, files: audit.files.length, issues: audit.issues.length })}</p>
      {!!audit.issues.length && <ul className="space-y-1 text-amber-300">{audit.issues.slice(0, 20).map((issue, index) => <li key={index}>{issue.message}</li>)}</ul>}
      <details><summary className="cursor-pointer text-slate-400">{t('quality.evidenceAssetFilesSummary')}</summary>
        <ul className="mt-2 space-y-1 break-all text-slate-500">{audit.files.slice(0, 50).map(file => <li key={file.id}>{file.relPath}</li>)}</ul>
        {audit.files.length > 50 && <p className="text-slate-500">{t('quality.evidenceAssetMoreFiles', { count: audit.files.length - 50 })}</p>}
      </details>
      <p className="text-slate-500">{t('quality.evidenceAssetNote')}</p>
    </div> : <p className="text-slate-500">{t('quality.evidenceAssetEmpty')}</p>}
  </div>;
}

export function CandidateEvidencePanel({ current, historical, currentIsStale = false }: {
  current: CandidateValidationEvidence | null; historical?: CandidateValidationEvidence; currentIsStale?: boolean;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const receipt = useProjectStore(state => state.stagedScreen?.workflowContract?.modificationReview);
  const contract=useProjectStore(state=>state.stagedScreen?.workflowContract);
  const candidateHtml=useProjectStore(state=>state.stagedScreen?.newHtml);
  const execution=useProjectStore(state=>state.stagedScreen?.executionRecord);
  return <details className="relative text-[11px]" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary className="cursor-pointer rounded-lg border border-slate-700 px-2.5 py-1.5 text-slate-300 hover:bg-slate-800">{t('chat.viewAcceptanceRecords')}</summary>
    <div className="absolute right-0 top-full z-50 mt-2 max-h-[65vh] w-80 max-w-[80vw] space-y-3 overflow-y-auto rounded-xl border border-slate-700 bg-slate-950 p-4 shadow-xl" aria-label={t('chat.acceptanceRecordsAria')}>
      {current ? <>
        <p className="font-semibold text-slate-200">{currentIsStale ? t('quality.evidenceCurrentStaleTitle') : t('quality.evidenceCurrentTitle')}</p>
        <EvidenceRecord evidence={current} />
      </> : <p className="text-slate-400">{t('quality.evidenceRecording')}</p>}
      {historical && <details className="border-t border-slate-800 pt-3">
        <summary className="cursor-pointer text-slate-400">{t('quality.evidenceHistoricalSummary')}</summary>
        <p className="my-2 text-amber-300">{t('quality.evidenceHistoricalWarning')}</p>
        <EvidenceRecord evidence={historical} />
      </details>}
      <CandidateRepairControl />
      <ModificationReviewSource receipt={receipt} />
      <DesignGuidanceCard contract={contract}/>
      <HistoricalDraftSource execution={execution}/>
      <PageTaskPlanCard contract={contract}/>
      <PageTaskCoverageCard contract={contract} html={candidateHtml}/>
      <CandidatePreviewPanel active={open} />
      <p className="border-t border-slate-800 pt-2 text-slate-500">{t('quality.evidenceFooterNote')}</p>
    </div>
  </details>;
}
