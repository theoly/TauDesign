import React from 'react';
import type { QualityReport } from '../../services/ai/generationQuality';
import { QualityFindings, findingSummary } from './QualityFindings';
import { useT } from '../../stores/useLocaleStore';

export function QualityReportCard({ report, onLocate, embedded }: { report: QualityReport; onLocate?: (nid: string) => void; embedded?: boolean }) {
  const t = useT();
  if (!report.findings.length) return null;
  const body = <>
    <p className={`${embedded ? '' : 'mt-2 '}text-slate-400`}>{t('quality.designHintsBody')}</p>
    <QualityFindings findings={report.findings} onLocate={onLocate}/>
  </>;
  if (embedded) {
    return <div className="space-y-1 text-xs text-slate-300">
      <p className="font-medium text-amber-300">{report.passed ? t('quality.designHints') : t('quality.designFailed')} · {findingSummary(report.findings)}</p>
      {body}
    </div>;
  }
  return <details className="my-2 max-w-lg rounded-lg border border-amber-500/30 bg-slate-900 p-3 text-xs text-slate-300">
    <summary className="cursor-pointer text-amber-300">{report.passed ? t('quality.designHints') : t('quality.designFailed')} · {findingSummary(report.findings)}</summary>
    {body}
  </details>;
}
