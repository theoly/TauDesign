import {contentFingerprint} from '../designWorkflow';
import type {RuleFeature} from './types';
export type ExperimentMode='baseline'|'contextual';
export interface ExperimentScenario {id:string;title?:string;device:'pc'|'mobile';kind:'create'|'local';request:string;sectioned?:boolean;baselineHtml?:string;targetNid?:string;features?:RuleFeature[]}
export interface ExperimentIdentity {providerId:string;model:string;providerFingerprint:string;sourceFingerprint:string;themeFingerprint:string;checkerFingerprint:string;budgetFingerprint:string}
export interface ExperimentPlan {version:1;id:string;seed:number;identity:ExperimentIdentity;scenarios:ExperimentScenario[];pairs:Array<{id:string;scenarioId:string;repeat:number;left:string;right:string}>;runs:Array<{id:string;pairId:string;scenarioId:string;mode:ExperimentMode}>}
export interface ExperimentRun {id:string;planId:string;status:'passed'|'failed'|'cancelled'|'timeout'|'interrupted';firstPassed:boolean;finalPassed:boolean;firstSevereLayoutIssues:number;finalSevereLayoutIssues:number;durationMs:number;inputTokens:number;outputTokens:number;usageEstimated:boolean;requests:number;requestedOutputTokens:number;imageReady:boolean;measurementComplete:boolean}
export type ReviewPreference='left'|'right'|'tie'|'neither';
export interface HumanReview {version:1;planId:string;reviewerId:string;human:boolean;independent:boolean;blind:boolean;pairs:Array<{pairId:string;preference:ReviewPreference;left:number[];right:number[];leftAcceptable:boolean;rightAcceptable:boolean}>}
const hash=(value:unknown)=>contentFingerprint(JSON.stringify(value));
const pass=(values:Record<string,boolean>)=>Object.values(values).every(Boolean);
export function makeExperimentPlan(scenarios:readonly ExperimentScenario[],seed:number,identity:ExperimentIdentity):ExperimentPlan{
 if(scenarios.length!==12||new Set(scenarios.map(s=>s.id)).size!==12||scenarios.some(s=>!s.id||!s.request.trim()||!['pc','mobile'].includes(s.device)||!['create','local'].includes(s.kind)||s.kind==='local'&&(!s.baselineHtml||!s.targetNid)))throw Error('实验必须冻结12个有效且唯一的需求。');
 const identityKeys=['providerId','model','providerFingerprint','sourceFingerprint','themeFingerprint','checkerFingerprint','budgetFingerprint'];
 if(Object.keys(identity).some(k=>!identityKeys.includes(k))||!Number.isSafeInteger(seed)||seed<0||seed>0xffffffff||identityKeys.some(k=>typeof identity[k as keyof ExperimentIdentity]!=='string'||!identity[k as keyof ExperimentIdentity].trim()))throw Error('实验身份或随机种子无效。');
 let state=seed||0x9e3779b9;const next=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return state>>>0;};
 const shuffle=<T,>(items:T[])=>{for(let i=items.length-1;i>0;i--){const j=next()%(i+1);[items[i],items[j]]=[items[j],items[i]];}return items;};
 const rows=shuffle(scenarios.flatMap(s=>[1,2].map(repeat=>({scenarioId:s.id,repeat})))),pairs:ExperimentPlan['pairs']=[],runs:ExperimentPlan['runs']=[],used=new Set<string>();
 const opaque=()=>{let id:string;do{id='r'+next().toString(16).padStart(8,'0');}while(used.has(id));used.add(id);return id;};
 for(const [i,row] of rows.entries()){
  const pairId='p'+String(i+1).padStart(3,'0'),a={id:opaque(),pairId,scenarioId:row.scenarioId,mode:'baseline' as const},b={id:opaque(),pairId,scenarioId:row.scenarioId,mode:'contextual' as const};
  const left=next()%2?a.id:b.id;pairs.push({id:pairId,...row,left,right:left===a.id?b.id:a.id});runs.push(...(next()%2?[a,b]:[b,a]));
 }
 const frozen={identity:structuredClone(identity),scenarios:structuredClone([...scenarios])};
 return {version:1,id:hash([frozen,seed,pairs,runs]),seed,...frozen,pairs,runs};
}
export function assertExperimentPlan(plan:ExperimentPlan){
 if(plan.version!==1||JSON.stringify(plan)!==JSON.stringify(makeExperimentPlan(plan.scenarios,plan.seed,plan.identity)))throw Error('冻结实验计划已变化。');
}
/** No modes, seed or execution order in the reviewer bundle. */
export function blindExperimentIndex(plan:ExperimentPlan){
 assertExperimentPlan(plan);
 return {version:1,planId:plan.id,pairs:plan.pairs.map(p=>({id:p.id,request:plan.scenarios.find(s=>s.id===p.scenarioId)!.request,device:plan.scenarios.find(s=>s.id===p.scenarioId)!.device,left:p.left+'.png',right:p.right+'.png'}))};
}
function assertRuns(plan:ExperimentPlan,runs:readonly ExperimentRun[]){
 const ids=new Set(plan.runs.map(r=>r.id));
 if(new Set(runs.map(r=>r.id)).size!==runs.length)throw Error('实验记录重复，不能择优覆盖。');
 for(const r of runs){
  if(!ids.has(r.id)||r.planId!==plan.id||!['passed','failed','cancelled','timeout','interrupted'].includes(r.status)||typeof r.firstPassed!=='boolean'||typeof r.finalPassed!=='boolean'||r.finalPassed!==(r.status==='passed')||typeof r.usageEstimated!=='boolean'||typeof r.imageReady!=='boolean'||typeof r.measurementComplete!=='boolean'||r.status==='passed'&&!r.measurementComplete)throw Error('实验记录身份或状态无效。');
  if(['firstSevereLayoutIssues','finalSevereLayoutIssues','inputTokens','outputTokens','requests','requestedOutputTokens'].some(k=>!Number.isSafeInteger(r[k as keyof ExperimentRun])||Number(r[k as keyof ExperimentRun])<0)||!Number.isFinite(r.durationMs)||r.durationMs<0||r.finalPassed&&(r.finalSevereLayoutIssues>0||r.requests===0||r.requestedOutputTokens===0)||r.firstPassed&&r.firstSevereLayoutIssues>0)throw Error('实验记录费用或严重问题计数无效。');
 }
}
function assertReviews(plan:ExperimentPlan,reviews:readonly HumanReview[]){
 const ids=new Set(plan.pairs.map(p=>p.id));
 if(new Set(reviews.map(r=>r.reviewerId)).size!==reviews.length)throw Error('独立评阅者身份重复。');
 for(const r of reviews){
  if(r.version!==1||r.planId!==plan.id||!r.reviewerId?.trim()||r.human!==true||r.independent!==true||r.blind!==true||!Array.isArray(r.pairs)||new Set(r.pairs.map(p=>p.pairId)).size!==r.pairs.length)throw Error('评阅声明、身份或配对记录无效。');
  for(const pair of r.pairs)if(!ids.has(pair.pairId)||!['left','right','tie','neither'].includes(pair.preference)||typeof pair.leftAcceptable!=='boolean'||typeof pair.rightAcceptable!=='boolean'||[pair.left,pair.right].some(scores=>!Array.isArray(scores)||scores.length!==4||scores.some(s=>!Number.isInteger(s)||s<0||s>4)))throw Error('评阅分数或配对无效。');
 }
}
const median=(values:number[])=>{if(!values.length)return null;values=[...values].sort((a,b)=>a-b);const i=Math.floor(values.length/2);return values.length%2?values[i]:(values[i-1]+values[i])/2;};
export function summarizeExperiment(plan:ExperimentPlan,runs:readonly ExperimentRun[],reviews:readonly HumanReview[]){
 assertExperimentPlan(plan);assertRuns(plan,runs);assertReviews(plan,reviews);
 const byId=new Map(runs.map(r=>[r.id,r]));
 const groups=Object.fromEntries((['baseline','contextual'] as const).map(mode=>{
  const expected=plan.runs.filter(r=>r.mode===mode),actual=expected.flatMap(r=>byId.has(r.id)?[byId.get(r.id)!]:[]);
  return [mode,{expected:expected.length,recorded:actual.length,missing:expected.length-actual.length,firstPassed:actual.filter(r=>r.firstPassed).length,finalPassed:actual.filter(r=>r.finalPassed).length,
   firstPassRate:actual.filter(r=>r.firstPassed).length/expected.length,finalPassRate:actual.filter(r=>r.finalPassed).length/expected.length,
   firstSevereLayoutIssues:actual.reduce((n,r)=>n+r.firstSevereLayoutIssues,0),finalSevereLayoutIssues:actual.reduce((n,r)=>n+r.finalSevereLayoutIssues,0),
   inputTokens:actual.reduce((n,r)=>n+r.inputTokens,0),outputTokens:actual.reduce((n,r)=>n+r.outputTokens,0),requests:actual.reduce((n,r)=>n+r.requests,0),requestedOutputTokens:actual.reduce((n,r)=>n+r.requestedOutputTokens,0),usageEstimated:actual.some(r=>r.usageEstimated),measurementIncomplete:actual.filter(r=>!r.measurementComplete).length,
   inputMedian:actual.length===expected.length&&actual.every(r=>r.measurementComplete)?median(actual.map(r=>r.inputTokens)):null,durationMedianMs:actual.length===expected.length&&actual.every(r=>r.measurementComplete)?median(actual.map(r=>r.durationMs)):null,maxDurationMs:actual.length?Math.max(...actual.map(r=>r.durationMs)):null,
   statuses:Object.fromEntries(['passed','failed','cancelled','timeout','interrupted'].map(status=>[status,actual.filter(r=>r.status===status).length]))}];
 })) as Record<ExperimentMode,{expected:number;recorded:number;missing:number;firstPassed:number;finalPassed:number;firstPassRate:number;finalPassRate:number;firstSevereLayoutIssues:number;finalSevereLayoutIssues:number;inputTokens:number;outputTokens:number;requests:number;requestedOutputTokens:number;usageEstimated:boolean;measurementIncomplete:number;inputMedian:number|null;durationMedianMs:number|null;maxDurationMs:number|null;statuses:Record<string,number>}>;
 const pairs=plan.pairs.map(pair=>{
  const votes=reviews.map(review=>review.pairs.find(p=>p.pairId===pair.id)),left=byId.get(pair.left),right=byId.get(pair.right);
  if(reviews.length<2||votes.some(v=>!v))return {id:pair.id,outcome:'missing-review',points:0};
  if(votes.some(v=>v!.preference!==votes[0]!.preference))return {id:pair.id,outcome:'disputed',points:0};
  const preference=votes[0]!.preference;
  if(preference==='neither')return {id:pair.id,outcome:'neither',points:0};
  const usable=(run:ExperimentRun|undefined)=>!!run?.finalPassed&&run.imageReady;
  if(preference==='tie'){const accepted=usable(left)&&usable(right)&&votes.every(v=>v!.leftAcceptable&&v!.rightAcceptable);return {id:pair.id,outcome:accepted?'tie':'invalid-vote',points:accepted ? 0.5 : 0};}
  const winner=preference==='left'?left:right,acceptable=votes.every(v=>preference==='left'?v!.leftAcceptable:v!.rightAcceptable);
  if(!usable(winner)||!acceptable)return {id:pair.id,outcome:'invalid-vote',points:0};
  const contextual=plan.runs.find(r=>r.id===winner!.id)!.mode==='contextual';return {id:pair.id,outcome:contextual?'contextual':'baseline',points:contextual?1:0};
 });
 const b=groups.baseline,c=groups.contextual,preference=pairs.reduce((n,p)=>n+p.points,0)/plan.pairs.length;
 const complete=runs.length===plan.runs.length,measured=complete&&runs.every(r=>r.measurementComplete),reviewComplete=reviews.length>=2&&pairs.every(p=>p.outcome!=='missing-review');
 const gates={allRunsRecorded:complete,allMeasurementsComplete:measured,independentReviewComplete:reviewComplete,preference:preference>=.60,
  firstPassNotLower:measured&&c.firstPassRate>=b.firstPassRate,finalPassNotLower:measured&&c.finalPassRate>=b.finalPassRate,
  severeNotIncreased:measured&&c.firstSevereLayoutIssues<=b.firstSevereLayoutIssues&&c.finalSevereLayoutIssues<=b.finalSevereLayoutIssues,
  inputBudget:complete&&b.inputMedian!==null&&c.inputMedian!==null&&c.inputMedian<=b.inputMedian*1.10,
  latencyBudget:complete&&b.durationMedianMs!==null&&c.durationMedianMs!==null&&c.durationMedianMs<=b.durationMedianMs*1.15};
 return {version:1,planId:plan.id,groups,pairs,reviewStatus:{complete:reviewComplete,missing:pairs.filter(p=>p.outcome==='missing-review').length,disputed:pairs.filter(p=>p.outcome==='disputed').length,ineligible:pairs.filter(p=>p.outcome==='invalid-vote').length},reviewers:reviews.map(r=>r.reviewerId),preferenceRate:preference,gates,passed:pass(gates),limitations:[
  '所有48个计划任务和24对固定分母；缺失、失败、取消和超时不删。费用/耗时中位数仅在全部记录和测量齐全时计算；中断未知成本不记为零优势，包含失败任务。',
  '独立人工身份依赖显式用户提交的评阅声明，程序不执行身份核验；不得将AI打分填作人评。',
  '至少两名评阅者；意见不一致为未解决争议，计0分并留在固定分母，不另设整体一致性否决；缺评、失败页面胜出均不算胜。',
  'usage缺失时明确估计，不转换为伪精确货币费用；thinking沿用Provider输出口径，不重复加总。',
  '首轮阈值为工程试点判据，不是统计显著性；不单独代表原生或发布验收。']};
}
