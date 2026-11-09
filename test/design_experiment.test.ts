import {expect,test} from 'bun:test';
import {makeExperimentPlan,blindExperimentIndex,summarizeExperiment,assertExperimentPlan,type ExperimentRun,type HumanReview} from '../src/services/ai/designKnowledge/experiment';
const scenarios=Array.from({length:12},(_,i)=>({id:'s'+i,device:i%2?'pc' as const:'mobile' as const,kind:'create' as const,request:'静态测试需求'+i}));
const identity={providerId:'test',model:'test',providerFingerprint:'p',sourceFingerprint:'s',themeFingerprint:'t',checkerFingerprint:'c',budgetFingerprint:'b'};
const plan=makeExperimentPlan(scenarios,42,identity);
function runs():ExperimentRun[]{return plan.runs.map(r=>({id:r.id,planId:plan.id,status:'passed',firstPassed:true,finalPassed:true,firstSevereLayoutIssues:0,finalSevereLayoutIssues:0,durationMs:100,inputTokens:100,outputTokens:100,usageEstimated:false,requests:2,requestedOutputTokens:8000,imageReady:true,measurementComplete:true}));}
function reviews():HumanReview[]{return ['human-one','human-two'].map(reviewerId=>({version:1,planId:plan.id,reviewerId,human:true,independent:true,blind:true,pairs:plan.pairs.map(pair=>({pairId:pair.id,preference:plan.runs.find(r=>r.id===pair.left)!.mode==='contextual'?'left':'right',left:[4,4,4,4],right:[4,4,4,4],leftAcceptable:true,rightAcceptable:true}))}));}
test('24 pairs/48 tasks are frozen, interleaved, repeatable and independently blinded',()=>{
 expect(plan.pairs).toHaveLength(24);expect(plan.runs).toHaveLength(48);expect(new Set(plan.runs.map(r=>r.id)).size).toBe(48);
 expect(makeExperimentPlan(scenarios,42,identity)).toEqual(plan);expect(makeExperimentPlan(scenarios,43,identity)).not.toEqual(plan);
 for(const scenario of scenarios)expect(plan.runs.filter(r=>r.scenarioId===scenario.id)).toHaveLength(4);
 const order=plan.runs.filter((_,i)=>i%2===0).map(r=>r.mode);expect(order).toContain('baseline');expect(order).toContain('contextual');
 const blind=JSON.stringify(blindExperimentIndex(plan));expect(blind).not.toContain('contextual');expect(blind).not.toContain('baseline');expect(blind).not.toContain('seed');
});
test('plan mutation, missing/duplicate scenarios and bad seed fail before calls',()=>{
 expect(()=>makeExperimentPlan(scenarios.slice(1),1,identity)).toThrow();expect(()=>makeExperimentPlan([...scenarios.slice(1),scenarios[1]],1,identity)).toThrow();
 expect(()=>makeExperimentPlan(scenarios,NaN,identity)).toThrow();const copy=structuredClone(plan);copy.runs[0].mode=copy.runs[0].mode==='baseline'?'contextual':'baseline';expect(()=>assertExperimentPlan(copy)).toThrow();
});
test('complete equal-cost actual records and two agreeing reviews can pass',()=>{
 const r=summarizeExperiment(plan,runs(),reviews());expect(r.passed).toBe(true);expect(r.preferenceRate).toBe(1);expect(r.groups.baseline.expected).toBe(24);
});
test('missing and failed tasks stay in denominators and medians; no cherry picking',()=>{
 const rows=runs();rows[0]={...rows[0],status:'failed',firstPassed:false,finalPassed:false,durationMs:1000,inputTokens:500,requests:3};
 const r=summarizeExperiment(plan,rows,[]),mode=plan.runs[0].mode;expect(r.groups[mode].firstPassRate).toBe(23/24);expect(r.groups[mode].maxDurationMs).toBe(1000);expect(r.groups[mode].inputTokens).toBe(2800);expect(r.groups[mode].requests).toBe(49);
 const missing=summarizeExperiment(plan,rows.slice(1),[]);expect(missing.groups[mode].missing).toBe(1);expect(missing.groups[mode].inputMedian).toBeNull();expect(missing.gates.allRunsRecorded).toBe(false);expect(missing.pairs).toHaveLength(24);
});
test('one reviewer, missing votes or disputes cannot be promoted to consensus',()=>{
 expect(summarizeExperiment(plan,runs(),reviews().slice(0,1)).gates.independentReviewComplete).toBe(false);
 const review=reviews();review[0].pairs.pop();expect(summarizeExperiment(plan,runs(),review).pairs.some(p=>p.outcome==='missing-review')).toBe(true);
 const disputed=reviews();disputed[0].pairs[0].preference='tie';const r=summarizeExperiment(plan,runs(),disputed);expect(r.pairs[0].outcome).toBe('disputed');expect(r.pairs[0].points).toBe(0);expect(r.preferenceRate).toBe(23/24);
});
test('tie needs two usable pages and agreeing reviewers; failures never earn wins',()=>{
 const review=reviews();for(const r of review)r.pairs[0].preference='tie';expect(summarizeExperiment(plan,runs(),review).pairs[0].points).toBe(.5);
 const rows=runs(),bad=rows.find(r=>r.id===plan.pairs[0].left)!;Object.assign(bad,{status:'failed',firstPassed:false,finalPassed:false});expect(summarizeExperiment(plan,rows,review).pairs[0].outcome).toBe('invalid-vote');
 const votes=reviews(),winner=plan.runs.find(r=>r.pairId===plan.pairs[0].id&&r.mode==='contextual')!,record=rows.find(r=>r.id===winner.id)!;Object.assign(record,{status:'failed',firstPassed:false,finalPassed:false});expect(summarizeExperiment(plan,rows,votes).pairs[0].points).toBe(0);
});
test('duplicate identities, fabricated human claims, bad scores and run cost/status corruption reject',()=>{
 const r=reviews();r[1].reviewerId=r[0].reviewerId;expect(()=>summarizeExperiment(plan,runs(),r)).toThrow();
 const ai=reviews();ai[0].human=false;expect(()=>summarizeExperiment(plan,runs(),ai)).toThrow();
 const scores=reviews();scores[0].pairs[0].left=[5,4,4,4];expect(()=>summarizeExperiment(plan,runs(),scores)).toThrow();
 const rows=runs();expect(()=>summarizeExperiment(plan,[...rows,rows[0]],[])).toThrow();rows[0].inputTokens=-1;expect(()=>summarizeExperiment(plan,rows,[])).toThrow();rows[0].inputTokens=100;rows[0].finalSevereLayoutIssues=1;expect(()=>summarizeExperiment(plan,rows,[])).toThrow();
});
for(const property of ['inputTokens','durationMs'] as const)test(`${property} increase fails original whole-task cost threshold`,()=>{
 const rows=runs();for(const row of rows)if(plan.runs.find(r=>r.id===row.id)!.mode==='contextual')row[property]=200;
 const result=summarizeExperiment(plan,rows,reviews());expect(property==='inputTokens'?result.gates.inputBudget:result.gates.latencyBudget).toBe(false);expect(result.passed).toBe(false);
});
test('reported/estimated usage remains explicit and all failures/cancellations retain their costs',()=>{
 const rows=runs();rows[0].usageEstimated=true;Object.assign(rows[0],{status:'cancelled',firstPassed:false,finalPassed:false,outputTokens:700});
 const r=summarizeExperiment(plan,rows,[]),mode=plan.runs[0].mode;expect(r.groups[mode].usageEstimated).toBe(true);expect(r.groups[mode].outputTokens).toBe(3000);expect(r.groups[mode].statuses.cancelled).toBe(1);
});
test('three independent agreeing reviewers are allowed, while any disagreement remains unresolved',()=>{
 const review=reviews(),third={...structuredClone(review[0]),reviewerId:'human-three'};review.push(third);
 expect(summarizeExperiment(plan,runs(),review).gates.independentReviewComplete).toBe(true);
 third.pairs[0].preference='tie';expect(summarizeExperiment(plan,runs(),review).pairs[0].outcome).toBe('disputed');
});
test('equally unacceptable designs do not earn half a win',()=>{
 const review=reviews();for(const r of review){r.pairs[0].preference='tie';r.pairs[0].leftAcceptable=false;r.pairs[0].rightAcceptable=false;}
 expect(summarizeExperiment(plan,runs(),review).pairs[0].outcome).toBe('invalid-vote');expect(summarizeExperiment(plan,runs(),review).pairs[0].points).toBe(0);
});
test('a passed real-model trial cannot have no requests or unresolved first-round severe errors',()=>{
 const rows=runs();rows[0].requests=0;expect(()=>summarizeExperiment(plan,rows,[])).toThrow();
 rows[0].requests=2;rows[0].firstSevereLayoutIssues=1;expect(()=>summarizeExperiment(plan,rows,[])).toThrow();
});
test('incomplete runtime experiment identity is rejected',()=>{
 expect(()=>makeExperimentPlan(scenarios,42,{} as any)).toThrow();
});
test('the frozen real generation fixture covers both devices, local edits, long content, badges and forms',async()=>{
 const data=await import('./fixtures/design-knowledge/generation-v1.json');
 const scenarios=data.cases as import('../src/services/ai/designKnowledge/experiment').ExperimentScenario[];
 const fixed=makeExperimentPlan(scenarios,42,identity);expect(fixed.runs).toHaveLength(48);
 expect(new Set(scenarios.map(s=>s.device)).size).toBe(2);expect(scenarios.some(s=>s.kind==='local')).toBe(true);expect(scenarios.some(s=>s.sectioned)).toBe(true);
 for(const feature of ['long-copy','badge','form'])expect(scenarios.some(s=>s.features?.includes(feature as any))).toBe(true);
});
test('private provider credentials cannot be accidentally included in the frozen identity',()=>{
 expect(()=>makeExperimentPlan(scenarios,42,{...identity,apiKey:'never-archive'} as any)).toThrow();
});
test('a fully scored disagreement earns zero points without silently vetoing the original 0.60 criterion',()=>{
 const review=reviews();review[0].pairs[0].preference='tie';const result=summarizeExperiment(plan,runs(),review);
 expect(result.pairs[0].outcome).toBe('disputed');expect(result.pairs[0].points).toBe(0);
 expect(result.gates.independentReviewComplete).toBe(true);expect(result.preferenceRate).toBe(23/24);expect(result.passed).toBe(true);
});

test('an interrupted job with unknown accounting remains in denominators and blocks favorable cost claims',()=>{
 const rows=runs();Object.assign(rows[0],{status:'interrupted',firstPassed:false,finalPassed:false,imageReady:false,measurementComplete:false,inputTokens:0,requests:0});
 const summary=summarizeExperiment(plan,rows,reviews());expect(summary.gates.allRunsRecorded).toBe(true);expect(summary.gates.allMeasurementsComplete).toBe(false);expect(summary.groups[plan.runs[0].mode].inputMedian).toBeNull();expect(summary.passed).toBe(false);
});
