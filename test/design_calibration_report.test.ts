import {expect,test} from 'bun:test';
import data from './fixtures/design-knowledge/relevance-v1.json';
import {evaluateCalibration,aliasBaseline} from '../src/services/ai/designKnowledge/calibration';
import type {RelevanceCase} from '../src/services/ai/designKnowledge/evaluation';
import {DESIGN_RULE_CATALOG} from '../src/services/ai/designKnowledge/catalog';
test('calibration comparison keeps independent denominators and never evaluates held-out queries',()=>{
 const cases=structuredClone(data.cases) as RelevanceCase[];
 for(const c of cases.filter(c=>c.split==='held-out'))Object.defineProperty(c,'query',{get(){throw Error('held-out query must not be scored');}});
 const report=evaluateCalibration(cases);expect(report.passed).toBe(true);expect(report.heldOut).toEqual({count:20,status:'not-scored'});
 expect(report.contextual.positive).toEqual({correct:21,total:21});expect(report.contextual.negative).toEqual({correct:19,total:19});
 expect(report.baseline.positive.total).toBe(21);expect(report.baseline.negative.total).toBe(19);expect(report.contextual.rows.some(r=>r.id.startsWith('hold'))).toBe(false);
});
test('the simple baseline keeps scope, exclusion, deprecated, device, word boundary and exact character limits',()=>{
 const q={request:'CP-02 角标',operation:'modify' as const,device:'mobile' as const,scope:'element' as const,features:['badge' as const],maxChars:800};
 const select=aliasBaseline();expect(select(q).selected[0]?.rule.id).toBe('CP-02');expect(select({...q,preserveSource:true}).selected).toEqual([]);
 expect(select({...q,features:[]}).selected).toEqual([]);expect(select({...q,maxChars:1}).fallback).toBe('budget');
 expect(select({...q,scope:'page',features:[],request:'iconic product'}).selected).toEqual([]);
 const rule=structuredClone(DESIGN_RULE_CATALOG.find(r=>r.id==='CP-02')!);rule.scope.devices=['pc'];expect(aliasBaseline([rule])(q).selected).toEqual([]);rule.scope.devices=[];rule.status='deprecated';expect(aliasBaseline([rule])(q).selected).toEqual([]);
});
test('changed partition or a real calibration miss fails instead of retuning or removing the sample',()=>{
 const cases=structuredClone(data.cases) as RelevanceCase[];cases[0].query.request='未知问题';const report=evaluateCalibration(cases);
 expect(report.passed).toBe(false);expect(report.contextual.positive.total).toBe(21);expect(report.contextual.positive.correct).toBe(20);expect(report.contextual.rows[0].correct).toBe(false);
 cases[0].family=cases.find(c=>c.split==='held-out')!.family;expect(()=>evaluateCalibration(cases)).toThrow('隔离');
});
