import React from 'react';
import type { QualityReport } from '../../services/ai/generationQuality';

export function QualityReportCard({ report }: { report: QualityReport }) {
  if (!report.findings.length) return null;
  return <details className="my-2 max-w-lg rounded-lg border border-amber-500/30 bg-slate-900 p-3 text-xs text-slate-300">
    <summary className="cursor-pointer text-amber-300">{report.passed ? '设计检查提示' : '结果未通过检查'} · {report.findings.filter(f=>f.severity==='error').length} 项阻断 · {report.findings.filter(f=>f.severity==='warning').length} 项警告</summary>
    <p className="mt-2 text-slate-400">已检查源码规则；尚不代表实际排版或视觉验收。</p>
    <ul className="mt-2 max-h-48 overflow-y-auto space-y-2">
      {report.findings.map((finding, index) => <li key={index} className="break-words">
        <span className={finding.severity === 'error' ? 'text-rose-300' : 'text-amber-200'}>{finding.severity==='error'?'阻断：':'警告：'}{finding.nid ? `[${finding.nid}] ` : ''}{finding.message}</span>
        <div className="text-slate-400">建议：{finding.expected}</div>
      </li>)}
    </ul>
  </details>;
}
