import React from 'react';
import type { QualityReport } from '../../services/ai/generationQuality';
import { QualityFindings, findingSummary } from './QualityFindings';

export function QualityReportCard({ report, onLocate }: { report: QualityReport; onLocate?: (nid: string) => void }) {
  if (!report.findings.length) return null;
  return <details className="my-2 max-w-lg rounded-lg border border-amber-500/30 bg-slate-900 p-3 text-xs text-slate-300">
    <summary className="cursor-pointer text-amber-300">{report.passed ? '设计检查提示' : '结果未通过检查'} · {findingSummary(report.findings)}</summary>
    <p className="mt-2 text-slate-400">已检查源码规则；尚不代表实际排版或视觉验收。</p>
    <QualityFindings findings={report.findings} onLocate={onLocate}/>
  </details>;
}
