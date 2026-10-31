import {expect,test} from 'bun:test';
import data from './fixtures/design-knowledge/relevance-v1.json';
import {evaluateRelevance,type RelevanceCase} from '../src/services/ai/designKnowledge/evaluation';
import {buildContextualCraft} from '../src/services/ai/designKnowledge/promptAdapter';
import {selectWithNarrowRetry} from '../src/services/ai/designKnowledge/selector';
import {PromptBuilder} from '../src/services/ai/promptBuilder';
import {buildDesignBrief,inferPageKind} from '../src/services/ai/designBrief';
import {techBlueTheme} from '../src/utils/themePresets';
import type {RuleQuery} from '../src/services/ai/designKnowledge/types';

const cases=data.cases as RelevanceCase[];
test('frozen fixture has independent families and a reserved held-out partition',()=>{
  expect(cases).toHaveLength(60);expect(new Set(cases.map(c=>c.id)).size).toBe(60);
  const calibration=cases.filter(c=>c.split==='calibration'),held=cases.filter(c=>c.split==='held-out');
  expect(calibration).toHaveLength(40);expect(held).toHaveLength(20);
  expect(held.filter(c=>!c.acceptable.length).length).toBeGreaterThanOrEqual(10);
  const families=new Set(calibration.map(c=>c.family));expect(held.some(c=>families.has(c.family))).toBe(false);
});
test('calibration reports positive and negative denominators separately, including abstentions',()=>{
  const report=evaluateRelevance(cases.filter(c=>c.split==='calibration'));
  expect(report.rows).toHaveLength(40);
  expect(report.positive.correct/report.positive.total).toBeGreaterThanOrEqual(.85);
  expect(report.negative.correct/report.negative.total).toBeGreaterThanOrEqual(.95);
  expect(report.forbiddenCount).toBe(0);
  for(const row of report.rows)expect(row.correct).toBe(true);
});
test('one local narrowed retry cannot escape target or excluded workflow',()=>{
  const q:RuleQuery={request:'优化此处',operation:'create',device:'mobile',scope:'page',maxChars:800};
  expect(selectWithNarrowRetry(q,'长正文').attempts).toBe(2);
  expect(selectWithNarrowRetry(q,'依旧未知').attempts).toBe(2);
  expect(selectWithNarrowRetry({...q,operation:'import'},'长正文').attempts).toBe(1);
  expect(selectWithNarrowRetry({...q,operation:'modify',scope:'element'},'长正文').fallback).toBe('unknown-target');
});
test('experimental guidance only replaces craft, preserving output, device, whitelist and project contracts',()=>{
  for(const deviceProfile of ['mobile','pc'] as const){
    const base={designSystem:techBlueTheme,deviceProfile,frameWidth:deviceProfile==='pc'?1440:390};
    const baseline=PromptBuilder.buildSystemPrompt(base);
    const experimental=PromptBuilder.buildSystemPrompt({...base,contextualGuidance:{request:'长正文挤成一列',operation:'create',scope:'page',maxChars:10000}});
    expect(experimental).toContain('[LY-04@1]');expect(experimental.length).toBeLessThanOrEqual(baseline.length);
    for(const header of ['### ROLE & CORE CONSTRAINTS','### DESIGN TOKENS','### CLASS WHITELIST','### DESIGN SPECIFICATION','### OUTPUT CONTRACT']){
      expect(experimental).toContain(header);
    }
    const output=baseline.slice(baseline.indexOf('### OUTPUT CONTRACT'));
    expect(experimental.slice(experimental.indexOf('### OUTPUT CONTRACT'))).toBe(output);
    expect(PromptBuilder.buildSystemPrompt({...base,intent:'question',contextualGuidance:{request:'角标',operation:'create',scope:'page',maxChars:800}})).not.toContain('[CP-02@1]');
  }
});
test('adapter does not impose HTML protocol on JSON or source-preserving requests',()=>{
  const q:RuleQuery={request:'角标',operation:'modify',device:'mobile',scope:'element',features:['badge'],maxChars:800};
  const body=buildContextualCraft('modify_screen',q).body;
  expect(body).toContain('[CP-02@1]');expect(body).not.toContain('返回完整 HTML');
  const base={designSystem:techBlueTheme,deviceProfile:'mobile' as const,frameWidth:390,intent:'modify_screen' as const,outputContract:'ONLY JSON PATCH'};
  expect(PromptBuilder.buildSystemPrompt({...base,contextualGuidance:q})).toEndWith('ONLY JSON PATCH');
  expect(buildContextualCraft('modify_screen',{...q,preserveSource:true}).selection.selected).toEqual([]);
});
test('brief distinguishes scene inference, theme facts and exact/semantic obligations',()=>{
  expect(inferPageKind('会员档案')).toBe('detail');expect(inferPageKind('社交产品')).toBe('unknown');
  const obligations=[{kind:'exact' as const,text:'确认提交',source:'user' as const},{kind:'semantic' as const,text:'说明价格与权益',source:'document' as const}];
  const brief=buildDesignBrief({request:'充值套餐',device:'mobile',mode:'light',designSystem:techBlueTheme,globalDecisions:[],components:[],contentObligations:obligations});
  expect(brief.scene).toEqual({pageKind:'pricing',source:'inference',themeSource:'project',pending:[]});
  expect(brief.direction).toBe(techBlueTheme.name);expect(brief.contentObligations?.[0].text).toBe('确认提交');
  obligations[0].text='changed';expect(brief.contentObligations?.[0].text).toBe('确认提交');
  expect(brief.layout).not.toContain('Hero');
});
