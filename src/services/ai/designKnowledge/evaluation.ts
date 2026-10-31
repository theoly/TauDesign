import {selectDesignRules} from './selector';
import type {RuleQuery,RuleSelection} from './types';
export interface RelevanceCase {
  id:string;family:string;split:'calibration'|'held-out';query:RuleQuery;acceptable:string[];forbidden:string[];
}
export type RelevanceSelector=(query:RuleQuery)=>{selected:ReadonlyArray<{rule:{id:string}}>;fallback:RuleSelection['fallback']};
export function evaluateRelevance(cases:readonly RelevanceCase[],select:RelevanceSelector=selectDesignRules) {
  const rows=cases.map(c=>{
    const result=select(c.query),ids=result.selected.map(s=>s.rule.id);
    return {id:c.id,positive:c.acceptable.length>0,correct:c.acceptable.length?c.acceptable.includes(ids[0]):ids.length===0,
      forbidden:ids.filter(id=>c.forbidden.includes(id)),selected:ids,fallback:result.fallback};
  });
  const positives=rows.filter(r=>r.positive),negatives=rows.filter(r=>!r.positive);
  return {rows,positive:{correct:positives.filter(r=>r.correct).length,total:positives.length},
    negative:{correct:negatives.filter(r=>r.correct).length,total:negatives.length},forbiddenCount:rows.reduce((n,r)=>n+r.forbidden.length,0)};
}
