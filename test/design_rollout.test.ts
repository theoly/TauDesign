import {expect,test} from 'bun:test';
import {DEFAULT_DESIGN_RULES_ENABLED,designRuleRolloutReadiness,type RolloutChecks} from '../src/services/ai/designKnowledge/rollout';
import {makeExperimentPlan,summarizeExperiment,type ExperimentRun,type HumanReview} from '../src/services/ai/designKnowledge/experiment';
import {experimentCosts} from '../src/services/ai/designKnowledge/experimentAccounting';
const scenarios=Array.from({length:12},(_,i)=>({id:'s'+i,device:'mobile' as const,kind:'create' as const,request:'synthetic rollout'}));
const plan=makeExperimentPlan(scenarios,42,{providerId:'synthetic',model:'no-network',providerFingerprint:'p',sourceFingerprint:'s',themeFingerprint:'t',checkerFingerprint:'c',budgetFingerprint:'b'});
const runs:ExperimentRun[]=plan.runs.map(r=>({id:r.id,planId:plan.id,status:'passed',firstPassed:true,finalPassed:true,firstSevereLayoutIssues:0,finalSevereLayoutIssues:0,durationMs:100,inputTokens:100,outputTokens:50,usageEstimated:false,requests:1,requestedOutputTokens:2048,imageReady:true,measurementComplete:true}));
const reviews:HumanReview[]=['synthetic-one','synthetic-two'].map(reviewerId=>({version:1,planId:plan.id,reviewerId,human:true,independent:true,blind:true,pairs:plan.pairs.map(pair=>({pairId:pair.id,preference:plan.runs.find(r=>r.id===pair.left)!.mode==='contextual'?'left':'right',left:[4,4,4,4],right:[4,4,4,4],leftAcceptable:true,rightAcceptable:true}))}));
const checks:RolloutChecks={offlineCurrent:true,offlinePassed:true,traceAccountingVerified:true,nativeCurrent:true,nativePassed:true,finalAcceptanceCurrent:true,finalAcceptancePassed:true};
test('all quality and cost evidence permits release review without changing defaults or project data',()=>{
 const before=JSON.stringify({runs,reviews}),result=designRuleRolloutReadiness(summarizeExperiment(plan,runs,reviews),checks);
 expect(result.eligible).toBe(true);expect(result.mode).toBe('eligible-for-release-review');expect(result.defaultEnabled).toBe(false);expect(DEFAULT_DESIGN_RULES_ENABLED).toBe(false);expect(JSON.stringify({runs,reviews})).toBe(before);
});
for(const key of Object.keys(checks) as (keyof RolloutChecks)[])test(`${key} missing/failed keeps guidance optional`,()=>{
 const result=designRuleRolloutReadiness(summarizeExperiment(plan,runs,reviews),{...checks,[key]:false});expect(result.eligible).toBe(false);expect(result.mode).toBe('optional');expect(result.blockers).toContain(key);
});
test('single fabricated passed flag cannot override recomputed missing human review or failures',()=>{
 const summary={...summarizeExperiment(plan,runs,[]),passed:true},result=designRuleRolloutReadiness(summary,checks);
 expect(result.eligible).toBe(false);expect(result.blockers).toContain('independentReviewComplete');expect(result.blockers).toContain('preference');
});
test('malformed accounting is rejected and missing usage remains an explicit estimate',()=>{
 expect(()=>experimentCosts([{inputChars:-1,rawResponse:'',maxTokens:100}])).toThrow();
 expect(experimentCosts([{inputChars:7,rawResponse:'abc',maxTokens:100}])).toEqual({inputTokens:2,outputTokens:1,requests:1,requestedOutputTokens:100,usageEstimated:true});
});
