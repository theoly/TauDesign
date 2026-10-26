import {CandidateRepairControl,RepairReceipt} from './CandidateRepairControl';
import { useProjectStore } from '../../stores/useProjectStore';
import { ModificationReviewSource } from '../chat/ModificationReviewSource';
import React, { useState } from 'react';
import type { CandidateValidationEvidence } from '../../services/ai/candidateValidation';
import { CandidatePreviewPanel } from './CandidatePreviewPanel';

const labels = { entities:'设计实体引用', task: '任务快照', source: '源码安全', quality: '静态质量', structure:'结构授权', assets: '资源登记', asset_files: '资源文件', render: '实际渲染' };
const statuses = { passed: '通过', blocked: '未通过', pending: '待检查' };

export function EvidenceRecord({ evidence }: { evidence: CandidateValidationEvidence }) {
  const audit = evidence.projectAssets;
  return <div className="space-y-3">
    <p className="text-slate-500">{new Date(evidence.capturedAt).toLocaleString()} · {evidence.viewport.width} × {evidence.viewport.height}</p>
    <p className="break-all text-slate-500">候选 {evidence.candidateFingerprint} · Token {evidence.designSystem.tokenFingerprint}</p>
    {evidence.designLibrary && <p className="text-slate-400">设计库：{evidence.designLibrary.sourceName} · {evidence.designLibrary.sourceFingerprint}</p>}
    <ul className="space-y-1.5">
      {evidence.delivery.checks.map(check => <li key={check.id}>
        <span className="font-medium text-slate-300">{labels[check.id]}：{statuses[check.status]}</span>
        <p className="mt-0.5 text-slate-500">{check.message}</p>
      </li>)}
    </ul>
    {evidence.delivery.workflow&&<details><summary className="cursor-pointer text-slate-400">工作流验收计划</summary>
      <p className="mt-2 break-all text-slate-500">{evidence.delivery.workflow.plan.workflowId} · {evidence.delivery.workflow.plan.fingerprint}</p>
      {evidence.delivery.workflow.checks.map(check=><p key={check.id} className="mt-1 text-slate-500">{check.id}：{statuses[check.status]} · {check.message}</p>)}
    </details>}
    {!!evidence.quality.findings.length && <details>
      <summary className="cursor-pointer text-slate-400">静态检查发现 {evidence.quality.findings.length} 项</summary>
      <ul className="mt-2 space-y-1 text-amber-300">{evidence.quality.findings.slice(0, 20).map((finding, index) => <li key={index}>{finding.nid && `[${finding.nid}] `}{finding.message}</li>)}</ul>
      {evidence.quality.findings.length > 20 && <p className="text-slate-500">其余记录保存在工程候选文件中。</p>}
    </details>}
    {evidence.render && <details>
      <summary className="cursor-pointer text-slate-400">iframe 检查了 {evidence.render.inspected} 个节点，发现 {evidence.render.findings.length} 项</summary>
      {evidence.render.reason && <p className="mt-2 text-amber-300">{evidence.render.reason}</p>}
      <ul className="mt-2 space-y-1 text-amber-300">{evidence.render.findings.slice(0, 20).map((finding, index) => <li key={index}>{finding.nid && `[${finding.nid}] `}{finding.message}</li>)}</ul>
    </details>}
    <RepairReceipt value={evidence.repair}/>
    {audit ? <div className="space-y-2 border-t border-slate-800 pt-2">
      <p className="font-medium text-slate-300">应用候选后的工程资源核对</p>
      <p className="text-slate-500">{audit.screenCount} 个页面 · {audit.files.length} 个文件 · {audit.issues.length} 个问题</p>
      {!!audit.issues.length && <ul className="space-y-1 text-amber-300">{audit.issues.slice(0, 20).map((issue, index) => <li key={index}>{issue.message}</li>)}</ul>}
      <details><summary className="cursor-pointer text-slate-400">查看检查过的文件</summary>
        <ul className="mt-2 space-y-1 break-all text-slate-500">{audit.files.slice(0, 50).map(file => <li key={file.id}>{file.relPath}</li>)}</ul>
        {audit.files.length > 50 && <p className="text-slate-500">其余 {audit.files.length - 50} 个文件保存在工程候选记录中。</p>}
      </details>
      <p className="text-slate-500">其它页面的问题仅作工程提示；文件记录表示核对当时的存在性。</p>
    </div> : <p className="text-slate-500">项目资源核对尚无结果。</p>}
  </div>;
}

export function CandidateEvidencePanel({ current, historical, currentIsStale = false }: {
  current: CandidateValidationEvidence | null; historical?: CandidateValidationEvidence; currentIsStale?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const receipt = useProjectStore(state => state.stagedScreen?.workflowContract?.modificationReview);
  return <details className="relative text-[11px]" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary className="cursor-pointer rounded-lg border border-slate-700 px-2.5 py-1.5 text-slate-300 hover:bg-slate-800">查看验收记录</summary>
    <div className="absolute right-0 top-full z-50 mt-2 max-h-[65vh] w-80 max-w-[80vw] space-y-3 overflow-y-auto rounded-xl border border-slate-700 bg-slate-950 p-4 shadow-xl" aria-label="候选验收记录">
      {current ? <>
        <p className="font-semibold text-slate-200">{currentIsStale ? '最近检查记录（上下文已变化）' : '本次检查记录'}</p>
        <EvidenceRecord evidence={current} />
      </> : <p className="text-slate-400">正在记录本次检查结果…</p>}
      {historical && <details className="border-t border-slate-800 pt-3">
        <summary className="cursor-pointer text-slate-400">上次存档记录（须重新验证）</summary>
        <p className="my-2 text-amber-300">历史报告仅供回溯，不用于本次采纳。</p>
        <EvidenceRecord evidence={historical} />
      </details>}
      <CandidateRepairControl />
      <ModificationReviewSource receipt={receipt} />
      <CandidatePreviewPanel active={open} />
      <p className="border-t border-slate-800 pt-2 text-slate-500">检查记录与预览图分别保存；预览不等同于跨浏览器像素比较。</p>
    </div>
  </details>;
}
