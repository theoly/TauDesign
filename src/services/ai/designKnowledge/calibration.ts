import {DESIGN_RULE_CATALOG} from './catalog';
import {matchesRuleAlias,renderRule} from './selector';
import {evaluateRelevance,type RelevanceCase,type RelevanceSelector} from './evaluation';
import type {DesignRule} from './types';

/** Deliberately simple: same safety filters/aliases, first fitting catalog entry, no weighted ranking. */
export function aliasBaseline(catalog:readonly DesignRule[]=DESIGN_RULE_CATALOG):RelevanceSelector {
 return query=>{
  if(query.preserveSource||['answer','theme-proposal','import'].includes(query.operation))return {selected:[],fallback:'excluded-workflow'};
  if(query.scope==='element'&&!query.features?.length)return {selected:[],fallback:'unknown-target'};
  if(!Number.isFinite(query.maxChars)||query.maxChars<0)return {selected:[],fallback:'budget'};
  const applicable=catalog.filter(rule=>rule.status!=='deprecated'&&
   (!rule.scope.operations.length||rule.scope.operations.includes(query.operation))&&(!rule.scope.devices.length||rule.scope.devices.includes(query.device))&&
   (query.scope!=='element'||rule.triggers.some(f=>query.features?.includes(f)))&&
   (rule.status!=='supplemental'||rule.triggers.some(f=>query.features?.includes(f))));
  const matches=applicable.filter(rule=>matchesRuleAlias(query.request,rule.id)||rule.aliases.some(a=>matchesRuleAlias(query.request,a))||rule.triggers.some(f=>query.features?.includes(f)));
  const first=matches.find(rule=>renderRule(rule).length<=Math.floor(query.maxChars));
  return {selected:first?[{rule:{id:first.id}}]:[],fallback:first?'none':matches.length?'budget':'no-match'};
 };
}

/** Development reports never score the reserved partition, even when supplied the complete fixture. */
export function evaluateCalibration(cases:readonly RelevanceCase[]) {
 const calibration=cases.filter(c=>c.split==='calibration'),held=cases.filter(c=>c.split==='held-out');
 const families=new Set(calibration.map(c=>c.family));
 if(calibration.length!==40||held.length!==20||new Set(cases.map(c=>c.id)).size!==60||held.some(c=>families.has(c.family))||held.filter(c=>!c.acceptable.length).length<10)throw Error('冻结校准/留出分区或family隔离不符合原评估合同。');
 const contextual=evaluateRelevance(calibration),baseline=evaluateRelevance(calibration,aliasBaseline());
 const rate=(n:number,d:number)=>d?n/d:0;
 const gates={positive:rate(contextual.positive.correct,contextual.positive.total)>=.85,
  negative:rate(contextual.negative.correct,contextual.negative.total)>=.95,forbidden:contextual.forbiddenCount===0,
  allCalibrationCorrect:contextual.rows.every(r=>r.correct)};
 return {version:1 as const,partition:'calibration' as const,heldOut:{count:held.length,status:'not-scored' as const},
  contextual,baseline,gates,passed:Object.values(gates).every(Boolean),
  comparison:{positiveCorrectDelta:contextual.positive.correct-baseline.positive.correct,negativeCorrectDelta:contextual.negative.correct-baseline.negative.correct},
  limitations:['人工构造校准集，不代表真实用户分布或独立留出成绩。','两个方案使用同一适用性和别名匹配；对照仅比较目录顺序首项与现有确定性排序，未引入BM25。','baseline只返回首项；P@1分母相同，不代表全部规则质量或模型成本对照。','此报告不执行生成/协议干跑、盲评或UI质量评估，不单独满足M2-05或默认启用门槛。']};
}
