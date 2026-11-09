import React from 'react';
import {renderCoverageDescription,validRenderCoverage,type RenderCoverageEntry} from '../../services/ai/renderCoverage';

export function RenderCoverageDetails({coverage}:{coverage?:RenderCoverageEntry[]}){
  if(coverage===undefined||Array.isArray(coverage)&&!coverage.length)return null;
  if(!validRenderCoverage(coverage))return <p className="mt-2 text-amber-300">检查范围记录格式不合法，需重新检查。</p>;
  return <section aria-label="检查范围与局限" className="mt-3 border-t border-slate-700 pt-2">
    <p className="font-medium text-slate-300">检查范围与局限（不代表检查通过）</p>
    <ul className="mt-1 max-h-40 space-y-2 overflow-y-auto text-slate-400">
      {coverage.map(entry=>{const description=renderCoverageDescription(entry);return <li key={entry.reason} className="break-words">
        <p>{description.check} · {description.outcome==='not-applicable'?'不适用':'未验证'} · {entry.count} 处</p>
        <p>{description.message}</p>
        {!!entry.nids.length&&<p className="font-mono text-[10px]">节点：{entry.nids.join('、')}</p>}
      </li>;})}
    </ul>
  </section>;
}
