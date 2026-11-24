import React from 'react';
import {useT} from '../../stores/useLocaleStore';
import {renderCoverageDescription,validRenderCoverage,type RenderCoverageEntry} from '../../services/ai/renderCoverage';

export function RenderCoverageDetails({coverage}:{coverage?:RenderCoverageEntry[]}){
  const t=useT();
  if(coverage===undefined||Array.isArray(coverage)&&!coverage.length)return null;
  if(!validRenderCoverage(coverage))return <p className="mt-2 text-amber-300">{t('quality.coverageInvalid')}</p>;
  return <section aria-label={t('quality.coverageSectionAria')} className="mt-3 border-t border-slate-700 pt-2">
    <p className="font-medium text-slate-300">{t('quality.coverageSectionTitle')}</p>
    <ul className="mt-1 max-h-40 space-y-2 overflow-y-auto text-slate-400">
      {coverage.map(entry=>{const description=renderCoverageDescription(entry);return <li key={entry.reason} className="break-words">
        <p>{t('quality.coverageItemLine',{check:description.check,outcome:description.outcome==='not-applicable'?t('quality.coverageOutcomeNA'):t('quality.coverageOutcomeUnverified'),count:entry.count})}</p>
        <p>{description.message}</p>
        {!!entry.nids.length&&<p className="font-mono text-[10px]">{t('quality.coverageNodesLine',{nids:entry.nids.join('、')})}</p>}
      </li>;})}
    </ul>
  </section>;
}
