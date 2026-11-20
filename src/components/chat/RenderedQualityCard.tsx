import React from 'react';
import type { RenderedQualityReport } from '../../utils/renderedQuality';
import { renderFindingsForDisplay } from '../../services/ai/findingPolicy';
import { QualityFindings, findingSummary } from './QualityFindings';
import {RenderCoverageDetails} from './RenderCoverageDetails';
import {validRenderCoverage,renderCoverageDescription} from '../../services/ai/renderCoverage';
import { useT } from '../../stores/useLocaleStore';

export function RenderedQualityCard({ report, onLocate, onRepairLayout, embedded }: { report: RenderedQualityReport; onLocate?: (nid: string) => void; onRepairLayout?:()=>void; embedded?: boolean }) {
  const t = useT();
  const label = {
    pending: t('quality.renderPending'),
    complete: t('quality.renderComplete'),
    incomplete: t('quality.renderIncomplete'),
    unavailable: t('quality.renderUnavailable'),
  }[report.status];
  const findings = renderFindingsForDisplay(report);
  const coverageValid=report.coverage===undefined||validRenderCoverage(report.coverage);
  const unverifiedCoverage=coverageValid&&report.coverage?.some(entry=>renderCoverageDescription(entry).outcome==='unverified');
  const completeSuffix = !coverageValid
    ? ` · ${t('quality.renderCoverageInvalid')}`
    : unverifiedCoverage
      ? ` · ${t('quality.renderPartialUnverified')}`
      : ` · ${t('quality.renderNoCoveredIssues')}`;
  const title=`${label}${findings.length ? ` · ${findingSummary(findings)}` : report.status === 'complete' ? completeSuffix : ''}`;
  const body=<>
    <p className={`${embedded?'':'mt-2 '}text-slate-400`}>{report.reason || t('quality.renderMeasured', {count: report.inspected})}</p>
    <QualityFindings findings={findings} onLocate={onLocate}/>
    <RenderCoverageDetails coverage={report.coverage}/>
    {onRepairLayout&&<button type="button" onClick={onRepairLayout} className="mt-2 rounded border border-blue-400/40 px-2 py-1 text-blue-300">{t('quality.previewLayoutRepair')}</button>}
  </>;
  if(embedded){
    return <div className="space-y-1 text-xs text-slate-300" data-testid="render-quality-report">
      <p className="font-medium text-slate-200">{title}</p>
      {body}
    </div>;
  }
  return <details className="max-w-lg rounded-lg border border-slate-700 bg-slate-900 p-2 text-xs text-slate-300" data-testid="render-quality-report">
    <summary className="cursor-pointer">{title}</summary>
    {body}
  </details>;
}
