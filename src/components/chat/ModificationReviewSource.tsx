import React from 'react';
import { useT } from '../../stores/useLocaleStore';
import { isModificationReviewReceipt } from '../../services/ai/modificationReview';
import {DesignGuidanceCard} from './DesignGuidanceCard';

/** Read-only provenance; restored diagnostic records never enable a confirmation action. */
export function ModificationReviewSource({ receipt }: { receipt: unknown }) {
  const t = useT();
  if (receipt === undefined) return null;
  if (!isModificationReviewReceipt(receipt)) return <p className="text-amber-300">{t('chat.modReviewCorrupt')}</p>;
  const {analysis,selectedIds,extra}=receipt, evidence=analysis.evidence;
  return <details className="space-y-1 text-[11px] text-slate-400">
    <summary className="cursor-pointer">{t('chat.modReviewSummary')}</summary>
    <p className="break-all">{t('chat.modReviewFpLine',{taskId:evidence.taskId,base:evidence.baselineFingerprint,analysis:evidence.analysisFingerprint})}</p>
    <p className="break-all">{evidence.context.device.frameWidth}px · {evidence.context.designSystem.name} · Token {evidence.context.designSystem.tokenFingerprint}</p>
    <p>{t('chat.modReviewAttemptsLine',{attempts:evidence.attempts})}</p>
    <DesignGuidanceCard contract={analysis.workflowContract} historical />
    <ul className="list-inside list-disc">{analysis.items.filter(item=>selectedIds.includes(item.id)).map(item=><li key={item.id}>{item.title}：{item.change}</li>)}</ul>
    {extra&&<p className="whitespace-pre-wrap break-words">{t('chat.modReviewExtraLine',{extra})}</p>}
    {evidence.downgrades.map(item=><p key={item.id} className="text-amber-300">{item.id}：{item.reason}</p>)}
  </details>;
}
