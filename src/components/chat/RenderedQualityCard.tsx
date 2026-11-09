import React from 'react';
import type { RenderedQualityReport } from '../../utils/renderedQuality';
import { renderFindingsForDisplay } from '../../services/ai/findingPolicy';
import { QualityFindings, findingSummary } from './QualityFindings';
import {RenderCoverageDetails} from './RenderCoverageDetails';
import {validRenderCoverage,renderCoverageDescription} from '../../services/ai/renderCoverage';

export function RenderedQualityCard({ report, onLocate, onRepairLayout }: { report: RenderedQualityReport; onLocate?: (nid: string) => void; onRepairLayout?:()=>void }) {
  const label = { pending: '正在检查渲染', complete: '渲染检查', incomplete: '渲染检查未完成', unavailable: '渲染检查暂不可用' }[report.status];
  const findings = renderFindingsForDisplay(report);
  const coverageValid=report.coverage===undefined||validRenderCoverage(report.coverage);
  const unverifiedCoverage=coverageValid&&report.coverage?.some(entry=>renderCoverageDescription(entry).outcome==='unverified');
  return <details className="max-w-lg rounded-lg border border-slate-700 bg-slate-900 p-2 text-xs text-slate-300" data-testid="render-quality-report">
    <summary className="cursor-pointer">{label}{findings.length ? ` · ${findingSummary(findings)}` : report.status === 'complete' ? !coverageValid?' · 检查范围记录不可用':unverifiedCoverage?' · 部分规则未验证':' · 未发现已覆盖规则的问题' : ''}</summary>
    <p className="mt-2 text-slate-400">{report.reason || `已测量${report.inspected}个可见节点。仅覆盖当前渲染、纯色对比度和部分几何问题；复杂变换下不判断祖先裁切，不代表全面视觉验收。`}</p>
    <QualityFindings findings={findings} onLocate={onLocate}/>
    <RenderCoverageDetails coverage={report.coverage}/>
    {onRepairLayout&&<button type="button" onClick={onRepairLayout} className="mt-2 rounded border border-blue-400/40 px-2 py-1 text-blue-300">预览本页纵向布局修复</button>}
  </details>;
}
