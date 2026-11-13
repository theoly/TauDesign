import {finishReasonLabel,requestStageLabel} from '../../utils/userFacingMessage';
import React from 'react';
import type {ConversationFailure} from '../../services/storage/conversationFailure';
import {executionPhaseLabels} from '../../services/ai/requestActivity';
export function HistoricalFailureCard({failure,busy,onReuse}:{failure:ConversationFailure;busy?:boolean;onReuse:()=>void}){
 const phase=failure.phase&&(executionPhaseLabels[failure.phase as keyof typeof executionPhaseLabels]??requestStageLabel(failure.phase));
 return <div className="rounded-lg border border-slate-700 bg-slate-950/70 p-2 text-[11px] text-slate-400">
  <p>{failure.status==='cancelled'?'历史已停止记录':'历史失败记录'} · 仅供查看，不会自动修改当前页面或继续旧任务</p>
  <details className="mt-1"><summary className="cursor-pointer">查看失败诊断</summary><div className="mt-1 space-y-1 break-words">
   {phase&&<p>阶段：{phase}</p>}{failure.model&&<p>模型：{failure.model}</p>}
   {failure.requests!==undefined&&<p>请求：{failure.requests}{failure.requestLimit!==undefined?` / ${failure.requestLimit}`:''} 次</p>}
   {failure.effectiveOutputTokens!==undefined&&<p>该次回复长度上限：{failure.effectiveOutputTokens} 个用量单位</p>}
   {(failure.finishReason||failure.httpStatus)&&<p>结束：{finishReasonLabel(failure.finishReason)}</p>}
   {failure.attachmentUnavailable&&<p className="text-amber-300">原图片未能存档，复用时请重新选择附件。</p>}
   <details data-technical-details><summary>技术详情</summary>{failure.phase&&<p>原始阶段：{failure.phase}</p>}{failure.taskId&&<p className="break-all">任务：{failure.taskId}</p>}{failure.finishReason&&<p>原始结束状态：{failure.finishReason}</p>}{failure.httpStatus!==undefined&&<p>HTTP {failure.httpStatus}</p>}</details>
  </div></details>
  <button type="button" disabled={busy} onClick={onReuse} title="仅替换输入框文字；附件和页面引用需重新确认，不自动发送" className="mt-2 rounded border border-slate-600 px-2 py-1 text-slate-300 disabled:opacity-40">重新使用该需求</button>
 </div>;
}
