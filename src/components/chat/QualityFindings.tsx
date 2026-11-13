import {UserFacingNotice} from '../common/UserFacingNotice';
import React from 'react';
import type { QualityFinding } from '../../services/ai/generationQuality';
import { findingDisposition, findingRequirement } from '../../services/ai/findingPolicy';

const labels = { blocker: '阻断', warning: '警告', unverified: '未验证', advisory: '设计建议' };
const colors = { blocker: 'text-rose-300', warning: 'text-amber-200', unverified: 'text-slate-300', advisory: 'text-sky-200' };

export function findingSummary(findings: QualityFinding[]): string {
  return (Object.keys(labels) as Array<keyof typeof labels>)
    .map(type => `${findings.filter(f => findingDisposition(f) === type).length} 项${labels[type]}`).join(' · ');
}

export function QualityFindings({findings, onLocate}: {findings: QualityFinding[]; onLocate?: (nid: string) => void}) {
  return <ul className="mt-2 max-h-48 space-y-2 overflow-y-auto">
    {findings.map((finding, index) => <li key={index} className="break-words">
      <div className={colors[findingDisposition(finding)]}>
        {labels[findingDisposition(finding)]}：{finding.nid ? `[${finding.nid}] ` : ''}<UserFacingNotice message={finding.message}/>
      </div>
      <details data-technical-details className="text-slate-400"><summary className="cursor-pointer">查看检查详情</summary><div>{findingRequirement(finding) === 'required' ? '必需检查' : '建议类检查'} · 实际：{finding.actual}</div>
      <div>建议：{finding.expected}</div></details>
      {finding.nid && onLocate && <button type="button" onClick={() => onLocate(finding.nid!)} className="mt-1 text-blue-300 underline">定位组件 {finding.nid}</button>}
    </li>)}
  </ul>;
}
