import React from 'react';
import {useT} from '../../stores/useLocaleStore';
import type {DesignExecutionRecord} from '../../services/ai/designExecutionRecord';
import {draftExecutionIssue} from '../../services/ai/draftExecutionSource';
import {DesignGuidanceCard} from './DesignGuidanceCard';

export function HistoricalDraftSource({execution}:{execution?:DesignExecutionRecord}){
 const t=useT();
 if(execution?.draftRepair===undefined)return null;
 const issue=draftExecutionIssue(execution,undefined,'history');
 if(issue)return <p role="status" className="text-xs text-amber-300">{t('chat.histDraftUnavailable',{issue})}</p>;
 return <section aria-label={t('chat.histDraftAria')} className="space-y-2 text-xs text-slate-400">
  <p>{t('chat.histDraftNote')}</p>
  <DesignGuidanceCard contract={execution.draftRepair!.historicalGuidanceSource} historical/>
 </section>;
}
