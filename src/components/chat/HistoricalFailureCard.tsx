import {finishReasonLabel,requestStageLabel} from '../../utils/userFacingMessage';
import React from 'react';
import {useT} from '../../stores/useLocaleStore';
import type {ConversationFailure} from '../../services/storage/conversationFailure';
import {executionPhaseLabels} from '../../services/ai/requestActivity';
export function HistoricalFailureCard({failure,busy,onReuse}:{failure:ConversationFailure;busy?:boolean;onReuse:()=>void}){
 const t=useT();
 const phase=failure.phase&&(executionPhaseLabels[failure.phase as keyof typeof executionPhaseLabels]??requestStageLabel(failure.phase));
 return <div className="rounded-lg border border-slate-700 bg-slate-950/70 p-2 text-[11px] text-slate-400">
  <p>{failure.status==='cancelled'?t('chat.histFailCancelled'):t('chat.histFailFailed')}{t('chat.histFailBannerSuffix')}</p>
  <details className="mt-1"><summary className="cursor-pointer">{t('chat.histFailSummary')}</summary><div className="mt-1 space-y-1 break-words">
   {phase&&<p>{t('chat.histFailPhase',{phase})}</p>}{failure.model&&<p>{t('chat.histFailModel',{model:failure.model})}</p>}
   {failure.requests!==undefined&&<p>{t('chat.histFailRequests',{requests:failure.requests,limit:failure.requestLimit!==undefined?` / ${failure.requestLimit}`:''})}</p>}
   {failure.effectiveOutputTokens!==undefined&&<p>{t('chat.histFailOutputCap',{tokens:failure.effectiveOutputTokens})}</p>}
   {(failure.finishReason||failure.httpStatus)&&<p>{t('chat.histFailFinish',{reason:finishReasonLabel(failure.finishReason)})}</p>}
   {failure.attachmentUnavailable&&<p className="text-amber-300">{t('chat.histFailAttachmentLost')}</p>}
   <details data-technical-details><summary>{t('repair.technicalDetails')}</summary>{failure.phase&&<p>{t('chat.histFailOrigPhase',{phase:failure.phase})}</p>}{failure.taskId&&<p className="break-all">{t('chat.histFailTaskId',{id:failure.taskId})}</p>}{failure.finishReason&&<p>{t('chat.histFailOrigFinish',{reason:failure.finishReason})}</p>}{failure.httpStatus!==undefined&&<p>HTTP {failure.httpStatus}</p>}</details>
  </div></details>
  <button type="button" disabled={busy} onClick={onReuse} title={t('chat.histFailReuseTitle')} className="mt-2 rounded border border-slate-600 px-2 py-1 text-slate-300 disabled:opacity-40">{t('chat.histFailReuseBtn')}</button>
 </div>;
}
