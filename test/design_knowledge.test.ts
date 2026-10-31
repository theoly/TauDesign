import {expect,test} from 'bun:test';
import {DESIGN_RULE_CATALOG} from '../src/services/ai/designKnowledge/catalog';
import {validateRuleCatalog} from '../src/services/ai/designKnowledge/validation';
import {ruleFingerprint,selectDesignRules} from '../src/services/ai/designKnowledge/selector';
import {getBaseCss} from '../src/styles/baseCss';
import {extractClassWhitelist} from '../src/utils/cssCompiler';
import type {RuleQuery} from '../src/services/ai/designKnowledge/types';

const whitelist=(device:'pc'|'mobile')=>extractClassWhitelist(getBaseCss(device));
const query=(request:string,rest:Partial<RuleQuery>={})=>selectDesignRules({request,operation:'create',device:'mobile',scope:'page',maxChars:800,...rest});

test('reviewed catalog is data-only, advisory and valid on both device slices',()=>{
  expect(DESIGN_RULE_CATALOG).toHaveLength(20);
  expect(validateRuleCatalog(DESIGN_RULE_CATALOG,whitelist)).toEqual([]);
  for(const r of DESIGN_RULE_CATALOG){expect(r.examples.length).toBeGreaterThan(0);expect(r.validation.severity).toBe('advisory');}
});
test('schema rejects malformed data instead of crashing',()=>{
  for(const v of [null,{},[null],[{}],[{...DESIGN_RULE_CATALOG[0],implementation:[{}]}]]) expect(validateRuleCatalog(v,whitelist).length).toBeGreaterThan(0);
});
test('duplicate identities, bad redirects and cycles are rejected; aliases can be shared',()=>{
  const [a,b]=structuredClone(DESIGN_RULE_CATALOG.slice(0,2));
  b.aliases=[...a.aliases];expect(validateRuleCatalog([a,b],whitelist)).toEqual([]);
  expect(validateRuleCatalog([a,a],whitelist)).toContain('catalog: duplicate rule id');
  a.status='deprecated';a.replacedBy=b.id;b.status='deprecated';b.replacedBy=a.id;
  expect(validateRuleCatalog([a,b],whitelist).some(e=>e.includes('cycle'))).toBe(true);
});
test('source CSS classes are not incorrectly judged against native class whitelist',()=>{
  const r=structuredClone(DESIGN_RULE_CATALOG[0]);r.implementation=[{mode:'registered-source-css',classes:['source-custom']}];
  expect(validateRuleCatalog([r],whitelist)).toEqual([]);
  r.implementation[0].mode='native-token';expect(validateRuleCatalog([r],whitelist).some(e=>e.includes('unknown'))).toBe(true);
  r.examples[0].negative='<script>alert(1)</script>';expect(validateRuleCatalog([r],whitelist).some(e=>e.includes('unsafe'))).toBe(true);
});
test.each([
  ['放大铃铛，缩小右上角数字','CP-02'],['对话建议正文被挤成一列','LY-04'],['会员档案','CT-01'],
  ['recharge 套餐选中背景','CP-08'],['long text','LY-04'],['主按钮文字消失','TY-06'],
  ['人物姓名和职业','CP-04'],['通知 badge','CP-02'],['底部抽屉被遮挡','LY-07']
])('Chinese/mixed query %s ranks %s first',(request,id)=>{
  expect(query(request).selected[0]?.rule.id).toBe(id);
});
test('negative and low-match queries abstain without random recommendations',()=>{
  for(const request of ['','今天星期几','无关未知业务','iconic product']) expect(query(request).fallback).toBe('no-match');
});
test('question/theme/import/preserve do not inject aesthetic rules',()=>{
  for(const operation of ['answer','theme-proposal','import'] as const) expect(query('铃铛角标',{operation}).selected).toEqual([]);
  expect(query('铃铛',{preserveSource:true}).fallback).toBe('excluded-workflow');
});
test('element edits require known target scope and never expand via exact rule id',()=>{
  expect(query('铃铛',{scope:'element',operation:'modify'}).fallback).toBe('unknown-target');
  const result=query('CP-08 套餐 放大铃铛',{scope:'element',operation:'modify',features:['badge']});
  expect(result.selected.map(s=>s.rule.id)).toEqual(['CP-02']);
});
test('exact identity cannot bypass device, operation, deprecated or supplemental filters',()=>{
  const rule=structuredClone(DESIGN_RULE_CATALOG[0]);rule.scope.devices=['pc'];
  const q:RuleQuery={request:rule.id,operation:'modify',device:'mobile',scope:'page',maxChars:800};
  expect(selectDesignRules(q,[rule]).selected).toEqual([]);
  rule.scope.devices=[];rule.status='deprecated';expect(selectDesignRules(q,[rule]).selected).toEqual([]);
  rule.status='supplemental';expect(selectDesignRules(q,[rule]).selected).toEqual([]);
  expect(selectDesignRules({...q,features:['long-copy']},[rule]).selected).toHaveLength(1);
});
test('budget excludes entire rules with a reason, never truncates content',()=>{
  const full=query('长正文');const length=full.body.length;
  expect(query('长正文',{maxChars:length}).body).toBe(full.body);
  const short=query('长正文',{maxChars:length-1});expect(short.body).toBe('');expect(short.fallback).toBe('budget');
  expect(short.omitted[0].reason).toBe('budget');
  expect(query('长正文',{maxChars:NaN}).fallback).toBe('budget');
});
test('rule limits and conflicts are deterministic and snapshots cannot mutate catalog',()=>{
  const result=query('长正文 按钮 角标 图片 配色 排版');expect(result.selected.length).toBeLessThanOrEqual(3);
  expect(result.omitted.some(r=>r.reason==='limit')).toBe(true);
  const fingerprint=ruleFingerprint(DESIGN_RULE_CATALOG);
  result.selected[0].rule.guidance='changed';expect(ruleFingerprint(DESIGN_RULE_CATALOG)).toBe(fingerprint);
  const rules=structuredClone(DESIGN_RULE_CATALOG.slice(0,2));rules[0].conflictsWith=[rules[1].id];
  expect(selectDesignRules({request:'长正文 badge',operation:'modify',scope:'page',device:'pc',maxChars:800},rules).selected).toHaveLength(1);
});
