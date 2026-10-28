import React from 'react';
import type { RenderedQualityReport } from '../../utils/renderedQuality';

export function RenderedQualityCard({ report, onLocate, onRepairLayout }: { report: RenderedQualityReport; onLocate?: (nid: string) => void; onRepairLayout?:()=>void }) {
  const label = { pending: '正在检查渲染', complete: '渲染检查', incomplete: '渲染检查未完成', unavailable: '渲染检查暂不可用' }[report.status];
  return <details className="max-w-lg rounded-lg border border-slate-700 bg-slate-900 p-2 text-xs text-slate-300" data-testid="render-quality-report">
    <summary className="cursor-pointer">{label}{report.findings.length ? ` · ${report.findings.filter(f=>f.severity==='error').length} 项阻断 · ${report.findings.filter(f=>f.severity==='warning').length} 项警告` : report.status === 'complete' ? ' · 未发现已覆盖规则的问题' : ''}</summary>
    <p className="mt-2 text-slate-400">{report.reason || `已测量${report.inspected}个可见节点。仅覆盖当前渲染、纯色对比度和部分几何问题；复杂变换下不判断祖先裁切，不代表全面视觉验收。`}</p>
    <ul className="mt-2 max-h-48 space-y-2 overflow-y-auto">
      {report.findings.map((f, index) => <li key={index} className="break-words">
        <div className={f.severity==='error'?'text-rose-300':'text-amber-200'}>{f.message}</div>
        <div className="text-slate-400">{f.actual}；建议：{f.expected}</div>
        {f.nid && onLocate && <button type="button" onClick={() => onLocate(f.nid!)} className="mt-1 text-blue-300 underline">定位组件 {f.nid}</button>}
      </li>)}
    </ul>
    {onRepairLayout&&<button type="button" onClick={onRepairLayout} className="mt-2 rounded border border-blue-400/40 px-2 py-1 text-blue-300">预览本页纵向布局修复</button>}
  </details>;
}
