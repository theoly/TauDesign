import React from 'react';
import { isModificationReviewReceipt } from '../../services/ai/modificationReview';
import {DesignGuidanceCard} from './DesignGuidanceCard';

/** Read-only provenance; restored diagnostic records never enable a confirmation action. */
export function ModificationReviewSource({ receipt }: { receipt: unknown }) {
  if (receipt === undefined) return null;
  if (!isModificationReviewReceipt(receipt)) return <p className="text-amber-300">分析来源记录不完整，无法展示；不影响其它验收记录。</p>;
  const {analysis,selectedIds,extra}=receipt, evidence=analysis.evidence;
  return <details className="space-y-1 text-[11px] text-slate-400">
    <summary className="cursor-pointer">已确认的分析来源</summary>
    <p className="break-all">{evidence.taskId} · 原页 {evidence.baselineFingerprint} · 建议 {evidence.analysisFingerprint}</p>
    <p className="break-all">{evidence.context.device.frameWidth}px · {evidence.context.designSystem.name} · Token {evidence.context.designSystem.tokenFingerprint}</p>
    <p>输出格式检查通过，共请求 {evidence.attempts} 次。此记录仅供回溯。</p>
    <DesignGuidanceCard contract={analysis.workflowContract} />
    <ul className="list-inside list-disc">{analysis.items.filter(item=>selectedIds.includes(item.id)).map(item=><li key={item.id}>{item.title}：{item.change}</li>)}</ul>
    {extra&&<p className="whitespace-pre-wrap break-words">用户补充：{extra}</p>}
    {evidence.downgrades.map(item=><p key={item.id} className="text-amber-300">{item.id}：{item.reason}</p>)}
  </details>;
}
