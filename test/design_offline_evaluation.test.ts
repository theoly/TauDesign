import {expect,test} from 'bun:test';
import {offlinePartitionGates,evaluateOffline} from '../src/services/ai/designKnowledge/offlineEvaluation';
import {evaluateRelevance,type RelevanceCase} from '../src/services/ai/designKnowledge/evaluation';
function report(positiveCorrect:number,negativeCorrect:number){
 const rows=Array.from({length:40},(_,i)=>({id:'synthetic-'+i,positive:i<20,correct:i<20?i<positiveCorrect:i-20<negativeCorrect,selected:[] as string[],forbidden:[] as string[],fallback:'no-match' as const}));
 return {rows,positive:{correct:positiveCorrect,total:20},negative:{correct:negativeCorrect,total:20},forbiddenCount:0};
}
test('fixed partition thresholds use separate denominators and include positive abstentions',()=>{
 expect(Object.values(offlinePartitionGates(report(17,19))).every(Boolean)).toBe(true);
 expect(offlinePartitionGates(report(16,20)).positive).toBe(false);
 expect(offlinePartitionGates(report(20,18)).negative).toBe(false);
});
test('empty, forbidden and inconsistent summaries cannot pass',()=>{
 expect(offlinePartitionGates(evaluateRelevance([])).positive).toBe(false);
 expect(offlinePartitionGates(evaluateRelevance([])).negative).toBe(false);
 const r=report(20,20);r.rows[0].forbidden=['fake'];r.forbiddenCount=1;
 expect(offlinePartitionGates(r).forbidden).toBe(false);
 expect(offlinePartitionGates({...r,forbiddenCount:0}).countsConsistent).toBe(false);
 expect(offlinePartitionGates({...r,positive:{correct:21,total:20}}).countsConsistent).toBe(false);
});
function synthetic():RelevanceCase[]{
 return Array.from({length:60},(_,i)=>({id:'case-'+i,family:(i<40?'cal-':'held-')+i,split:i<40?'calibration':'held-out',
  query:{request:'未知需求',operation:'create',device:'pc',scope:'page',maxChars:800},acceptable:[],forbidden:[]}));
}
test('formal evaluation scores all reserved cases and preserves calibration and baseline counts',()=>{
 const cases=synthetic(),r=evaluateOffline(cases);
 expect(r.calibration.heldOut.status).toBe('not-scored');expect(r.heldOut.status).toBe('scored');
 expect(r.calibration.contextual.rows).toHaveLength(40);expect(r.heldOut.contextual.rows).toHaveLength(20);
 expect(r.heldOut.baseline.rows).toHaveLength(20);expect(r.heldOut.contextual.negative).toEqual({correct:20,total:20});
 expect(r.passed).toBe(false); // No positive cases cannot count as a successful positive evaluation.
 expect(r.heldOut.gates.positive).toBe(false);expect(r.scope.heldContextual).toEqual([]);
});
test('missing partition, family leakage and duplicate IDs reject instead of dropping bad cases',()=>{
 const cases=synthetic();expect(()=>evaluateOffline(cases.slice(1))).toThrow('隔离');
 cases[40].family=cases[0].family;expect(()=>evaluateOffline(cases)).toThrow('隔离');
 cases[40].family='held-40';cases[40].id=cases[0].id;expect(()=>evaluateOffline(cases)).toThrow('隔离');
});
test('an actual forbidden match remains in the held-out denominator and audit',()=>{
 const cases=synthetic();cases[40]={...cases[40],query:{...cases[40].query,request:'CP-02 角标'},acceptable:['CP-02'],forbidden:['CP-02']};
 const r=evaluateOffline(cases);expect(r.heldOut.contextual.rows[0].selected).toContain('CP-02');
 expect(r.heldOut.contextual.positive.total).toBe(1);expect(r.heldOut.contextual.forbiddenCount).toBe(1);expect(r.passed).toBe(false);
});
