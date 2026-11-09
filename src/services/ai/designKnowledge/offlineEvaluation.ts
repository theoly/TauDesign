import {DESIGN_RULE_CATALOG} from './catalog';
import {aliasBaseline,evaluateCalibration} from './calibration';
import {evaluateRelevance,type RelevanceCase} from './evaluation';
import {renderRule} from './selector';

export const OFFLINE_TARGETS=Object.freeze({positive:.85,negative:.95});
type RelevanceReport=ReturnType<typeof evaluateRelevance>;
export function offlinePartitionGates(report:RelevanceReport){
 const positive=report.rows.filter(row=>row.positive),negative=report.rows.filter(row=>!row.positive);
 const consistent=report.positive.total===positive.length&&report.positive.correct===positive.filter(row=>row.correct).length
  &&report.negative.total===negative.length&&report.negative.correct===negative.filter(row=>row.correct).length
  &&report.forbiddenCount===report.rows.reduce((sum,row)=>sum+row.forbidden.length,0);
 return {countsConsistent:consistent,positive:positive.length>0&&report.positive.correct/positive.length>=OFFLINE_TARGETS.positive,
  negative:negative.length>0&&report.negative.correct/negative.length>=OFFLINE_TARGETS.negative,forbidden:report.forbiddenCount===0};
}
function scopeIssues(cases:readonly RelevanceCase[],report:RelevanceReport){
 const byId=new Map(cases.map(row=>[row.id,row])),catalog=new Map(DESIGN_RULE_CATALOG.map(rule=>[rule.id,rule]));
 return report.rows.flatMap(row=>row.selected.flatMap(id=>{
  const query=byId.get(row.id)!.query,rule=catalog.get(id),reasons:string[]=[];
  if(!rule)reasons.push('unknown-rule');
  else{
   if(rule.status==='deprecated')reasons.push('deprecated');
   if(query.preserveSource||['answer','theme-proposal','import'].includes(query.operation))reasons.push('excluded-workflow');
   if(rule.scope.operations.length&&!rule.scope.operations.includes(query.operation))reasons.push('operation');
   if(rule.scope.devices.length&&!rule.scope.devices.includes(query.device))reasons.push('device');
   if(query.scope==='element'&&!rule.triggers.some(feature=>query.features?.includes(feature)))reasons.push('element-feature');
   if(!Number.isFinite(query.maxChars)||renderRule(rule).length>query.maxChars)reasons.push('rule-budget');
  }
  return reasons.map(reason=>({caseId:row.id,ruleId:id,reason}));
 }));
}
/** Formal evaluation only. The development calibration entry still never scores held-out queries. */
export function evaluateOffline(cases:readonly RelevanceCase[]){
 const calibration=evaluateCalibration(cases),held=cases.filter(row=>row.split==='held-out'),training=cases.filter(row=>row.split==='calibration');
 const contextual=evaluateRelevance(held),baseline=evaluateRelevance(held,aliasBaseline());
 const heldGates=offlinePartitionGates(contextual);
 const scope={calibrationContextual:scopeIssues(training,calibration.contextual),calibrationBaseline:scopeIssues(training,calibration.baseline),
  heldContextual:scopeIssues(held,contextual),heldBaseline:scopeIssues(held,baseline)};
 const gates={calibration:calibration.passed,heldOut:Object.values(heldGates).every(Boolean),
  negativeCoverage:calibration.contextual.negative.total+contextual.negative.total>=20,
  scope:Object.values(scope).every(issues=>issues.length===0)};
 return {version:1 as const,targets:OFFLINE_TARGETS,calibration,heldOut:{count:held.length,status:'scored' as const,contextual,baseline,gates:heldGates,
  comparison:{positiveCorrectDelta:contextual.positive.correct-baseline.positive.correct,negativeCorrectDelta:contextual.negative.correct-baseline.negative.correct}},scope,gates,
  passed:Object.values(gates).every(Boolean),limitations:[
   '冻结的人工构造60例，仅为首期工程评估，不代表真实用户分布或统计显著性。',
   '校准与留出分别报告，不用混合总分掩盖留出失败；不得依据本次留出调参后将重跑称为独立留出。',
   'baseline沿用相同适用性和别名，仅比较目录顺序首项与确定性排序，非BM25或真实模型生成对照。',
   '范围审计仅核对规则与查询的设备/操作/元素特征/单条字符预算；实际DOM授权、保护及完整消息预算另由运行态门禁验证。',
   '离线成绩不替代真实生成、双人独立盲评、成本和原生验收，不单独允许默认启用。'
  ]};
}
