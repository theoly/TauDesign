import React from 'react';
import type {DesignExecutionRecord} from '../../services/ai/designExecutionRecord';
import {draftExecutionIssue} from '../../services/ai/draftExecutionSource';
import {DesignGuidanceCard} from './DesignGuidanceCard';

export function HistoricalDraftSource({execution}:{execution?:DesignExecutionRecord}){
 if(execution?.draftRepair===undefined)return null;
 const issue=draftExecutionIssue(execution);
 if(issue)return <p role="status" className="text-xs text-amber-300">草稿修复历史来源不可用：{issue}</p>;
 return <section aria-label="草稿修复历史来源" className="space-y-2 text-xs text-slate-400">
  <p>本次只修复已确认文案，未调用模型。以下调用记录属于原生成任务，不计作本次请求，也不代表当前页面已通过检查。</p>
  <DesignGuidanceCard contract={execution.draftRepair!.historicalGuidanceSource} historical/>
 </section>;
}
