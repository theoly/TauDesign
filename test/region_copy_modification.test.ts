import { describe, expect, test } from 'bun:test';
import { applyRegionCopyEdits, validateRegionTargets, generateRegionCopyEdits } from '../src/services/ai/regionCopyModification';
import { techBlueTheme } from '../src/utils/themePresets';
import type { AIEngineCore } from '../src/services/ai/engine/core/types';
const html = '<!DOCTYPE html><html><head><title>Keep</title></head><body><main data-nid="page"><section data-nid="a" data-component="card"><h2 data-nid="heading">Title</h2><button data-nid="buy" class="btn btn-primary">Buy</button></section><aside data-nid="b"><p data-nid="p">Other</p><span>Keep</span><span>Keep</span><span>Keep</span></aside></main></body></html>';
const good = '<section data-nid="a" data-component="card"><div><h2 data-nid="heading">New title</h2></div><button data-nid="buy" class="btn btn-primary">Buy</button></section>';
const options = { device: 'pc' as const, modificationRequest: '修改标题' };
describe('atomic region copy modifications', () => {
 test('merges one complete region and preserves document head and outside siblings', () => {
  const result = applyRegionCopyEdits(html, [{ nid: 'a', html: good }], options);
  const doc = new DOMParser().parseFromString(result.html, 'text/html');
  expect(doc.doctype?.name).toBe('html'); expect(doc.title).toBe('Keep');
  expect(doc.querySelector('[data-nid="b"]')?.outerHTML).toBe(new DOMParser().parseFromString(html, 'text/html').querySelector('[data-nid="b"]')?.outerHTML);
  expect(result.qualityReport.passed).toBe(true); expect(result.html).toContain('New title');
 });
 test('validates unique bounded nonnested authorized targets', () => {
  expect(validateRegionTargets(html, ['a'])).toEqual(['a']);
  for (const nids of [[], ['missing'], ['a','a'], ['a','heading'], ['page'], ['a','b'], ['a','b','p','buy']]) expect(() => validateRegionTargets(html, nids)).toThrow();
  expect(() => validateRegionTargets(html, ['a'], { allowedNids: ['b'] })).toThrow();
  expect(() => validateRegionTargets(html, ['a'], { protectedNids: ['buy'] })).toThrow();
 });
 test('rejects incomplete, multi-root, identity, metadata, unsafe and cross-region changes', () => {
  for (const replacement of [good.slice(0,-10), good+'<div></div>', 'text'+good, good.replace('data-nid="a"','data-nid="x"'), good.replace('data-component="card"',''), good.replace('</section>','<script>alert(1)</script></section>'), good.replace('New title','<img onerror="bad()">'), good.replace('data-nid="heading"','data-nid="p"'), good.replace('<button data-nid="buy" class="btn btn-primary">Buy</button>','')]) expect(() => applyRegionCopyEdits(html,[{nid:'a',html:replacement}],options)).toThrow();
 });
 test('rejects global styles and document wrappers before DOM normalization', () => {
  for (const replacement of [good.replace('</section>','<style>aside{display:none}</style></section>'), '<html><body>'+good+'</body></html>', good.replace('</section>','<template><link rel="stylesheet" href="x"></template></section>')]) expect(() => applyRegionCopyEdits(html,[{nid:'a',html:replacement}],options)).toThrow();
 });
 test('layout-only requests cannot silently drop business text', () => {
  expect(() => applyRegionCopyEdits(html,[{nid:'a',html:good}],{device:'pc',modificationRequest:'重新布局'})).toThrow();
 });
 test('preserves form controls, values and component metadata', () => {
  const source = html.replace('<h2 data-nid="heading">Title</h2>', '<input data-nid="field" name="email" value="user@example.com">');
  const replacement = good.replace('<div><h2 data-nid="heading">New title</h2></div>', '<p>Changed</p>');
  expect(() => applyRegionCopyEdits(source,[{nid:'a',html:replacement}],options)).toThrow();
  expect(() => applyRegionCopyEdits(source,[{nid:'a',html:replacement.replace('<p>Changed</p>', '<input data-nid="field" name="other" value="wrong">')}],options)).toThrow();
 });
 test('title authorization preserves unrelated policy and honors negation', () => {
  const source=html.replace('</section>','<p data-nid="policy">Important policy</p></section>');
  expect(() => applyRegionCopyEdits(source,[{nid:'a',html:good}],options)).toThrow();
  expect(() => applyRegionCopyEdits(html,[{nid:'a',html:good}],{device:'pc',modificationRequest:'重新布局，不要修改标题或文字'})).toThrow();
  expect(() => applyRegionCopyEdits(source,[{nid:'a',html:good}],{device:'pc',modificationRequest:'不要删除Important policy，修改标题'})).toThrow();
  expect(applyRegionCopyEdits(source,[{nid:'a',html:good.replace('</section>','<p data-nid="policy">Important policy</p></section>')}],options).qualityReport.passed).toBe(true);
 });
 test('preserves all form behavior attributes during layout changes', () => {
  const attrs=['min="1"','max="9"','readonly','pattern="[0-9]+"','step="2"','minlength="2"','maxlength="5"','form="purchase"','accept="image/*"','autocomplete="off"'];
  for(const attr of attrs){
   const source=html.replace('<h2 data-nid="heading">Title</h2>', '<input data-nid="field" name="qty" '+attr+'>');
   const replacement=good.replace('<div><h2 data-nid="heading">New title</h2></div>', '<input data-nid="field" name="qty">');
   expect(() => applyRegionCopyEdits(source,[{nid:'a',html:replacement}],{device:'pc',modificationRequest:'重新布局'})).toThrow();
  }
 });
 test('rejects parser repairs for invalid paragraph nesting and nested interactive controls', () => {
  const source=html.replace('<h2 data-nid="heading">Title</h2>', '<p>One</p>');
  for(const replacement of ['<section data-nid="a" data-component="card"><p><div>One</div></p><button data-nid="buy" class="btn btn-primary">Buy</button></section>', good.replace('New title','<button><button>Nested</button></button>'), good.replace('New title','<a href="a"><a href="b">Nested</a></a>')]) expect(() => applyRegionCopyEdits(source,[{nid:'a',html:replacement}],options)).toThrow();
 });
 test('generates constrained JSON through core and returns complete merged document', async () => {
  const requests: any[]=[];
  const core = { generateObject: async (schema: unknown, request: unknown) => { requests.push({schema, request}); return {nid:'a',html:good}; } } as unknown as AIEngineCore;
  const result = await generateRegionCopyEdits(core,{ ...options, provider: {} as any, model:'test',html,request:'Rearrange card',targetNids:['a'],designSystem:techBlueTheme,mode:'light',projectKnowledge:'Product facts'});
  expect(result.html).toContain('<title>Keep</title>'); expect(requests).toHaveLength(1);
  expect(requests[0].request.maxTokens).toBe(4096); expect(requests[0].request.messages[1].content).toContain('Product facts');
 });
 test('later region failures never return a partial candidate and requests stay bounded', async () => {
  let calls=0;
  const core={ generateObject: async () => {calls++; if(calls===2) throw new Error('Provider failed'); return {nid:'heading',html:'<h2 data-nid="heading">New</h2>'};} } as unknown as AIEngineCore;
  await expect(generateRegionCopyEdits(core,{...options,provider:{} as any,model:'test',html,request:'Update both',targetNids:['heading','p'],designSystem:techBlueTheme,mode:'light'})).rejects.toThrow('Provider failed');
  expect(calls).toBe(2);
  expect(html).toContain('>Title</h2>');
 });
 test('cancellation and invalid model output fail closed', async () => {
  const controller=new AbortController(); let calls=0;
  const core = { generateObject: async () => {calls++;controller.abort();return {nid:'a',html:good};} } as unknown as AIEngineCore;
  const opts={...options,provider:{} as any,model:'test',html,request:'Move',targetNids:['a'],designSystem:techBlueTheme,mode:'light' as const,signal:controller.signal};
  await expect(generateRegionCopyEdits(core,opts)).rejects.toThrow(); expect(calls).toBe(1);
  await expect(generateRegionCopyEdits(core,opts)).rejects.toThrow(); expect(calls).toBe(1);
 });
});
