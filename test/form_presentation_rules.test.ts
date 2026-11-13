import {expect,test} from 'bun:test';
import {inspectCssTokenProperties} from '../src/services/ai/cssTokenPropertyValidation';
import {checkGenerationQuality} from '../src/services/ai/generationQuality';
import {FORM_PRESENTATION_RULES,SCOPED_FORM_PRESENTATION_RULES,inspectFormPresentation} from '../src/services/ai/formPresentationRules';
import {GOLDEN_HIERARCHY} from '../src/services/ai/aestheticRules';
import {parseHtmlCopy} from '../src/utils/htmlDocument';
import {PromptBuilder} from '../src/services/ai/promptBuilder';
import {techBlueTheme} from '../src/utils/themePresets';
import {generateElementCopyEdits} from '../src/services/ai/elementCopyModification';
import {generateSupplementedLocalEdits} from '../src/services/ai/localCopyModification';
import {generateRegionCopyEdits} from '../src/services/ai/regionCopyModification';
import {repairDraftRegions} from '../src/services/ai/draftRegionRepair';
import {makeFailedPageDraft} from '../src/services/ai/qualityDraft';
import type {AIEngineCore,StreamTextOptions} from '../src/services/ai/engine/core/types';
const inspect=(html:string,css='')=>inspectCssTokenProperties(parseHtmlCopy(html).doc,css);
test('project color role used as border width and style is located and blocked',()=>{
 const html='<input data-nid="field" style="border-width:var(--color-border);border-style:var(--color-border)">';
 expect(inspect(html).map(f=>[f.code,f.nid,f.severity])).toEqual([['css_token_property_type','field','error'],['css_token_property_type','field','error']]);
 expect(checkGenerationQuality(html).passed).toBe(false);
 // The old B compound form: earlier valid shorthand does not cure later bad longhands.
 expect(inspect('<input data-nid="field" style="border:1px solid;border-width:var(--color-border);border-style:var(--color-border);border-color:var(--color-border)">')).toHaveLength(2);
});
for(const property of ['border-top-width','border-bottom-style','border-inline-start-width','border-block-end-style','outline-width','column-rule-style'])test(`${property} has a proven incompatible color type`,()=>{
 expect(inspect(`<div data-nid="x" style="${property}:var(--color-border)"></div>`)).toHaveLength(1);
});
test('stylesheet declarations and supplied scoped CSS locate their actual matching targets',()=>{
 const html='<style>.input{border-width:var(--color-border)}</style><input data-nid="field" class="input">';
 expect(inspect(html)[0]).toMatchObject({nid:'field',actual:'border-width: var(--color-border) (.input)'});
 expect(inspect('<input data-nid="field" class="input">','.input{border-style:var(--color-border)}')[0]?.nid).toBe('field');
 expect(inspect('<style>.absent{border-width:var(--color-border)}</style><input>')).toHaveLength(0);
});
test('legal variables, unknown fallbacks, same-name overrides and color property usage remain legal',()=>{
 for(const value of [
  '<input style="--edge:2px;border-width:var(--edge);border-style:solid;border-color:var(--color-border)">',
  '<input style="--color-border:2px;border-width:var(--color-border)">',
  '<style>:root{--color-border:2px}</style><input style="border-width:var(--color-border)">',
  '<input style="border-width:var(--custom, 2px);border-style:var(--style, solid)">',
  '<input style="--alias:var(--custom, 2px);border-width:var(--alias)">',
  '<input style="--alias:var(--alias);border-width:var(--alias, 2px)">',
  '<input style="border-color:var(--color-border);color:var(--color-text-primary);background:var(--color-surface);border:1px solid var(--color-border)">',
  '<input style="border-width:var(--color-border);border-width:1px">',
  '<input style="border-width:var(--color-border);border:1px solid gray">',
  '<style>.other{--color-border:2px}</style><input style="border-width:var(--color-border)">'
 ])expect(inspect(value)).toHaveLength(0);
 expect(inspect('<link rel="stylesheet" href="https://fixture.example.test/theme.css"><input style="border-width:var(--color-border)">')).toHaveLength(0);
});
test('known color fallback and a fully known alias chain retain their incompatible type',()=>{
 expect(inspect('<input style="border-width:var(--color-border, 2px)">')).toHaveLength(1);
 expect(inspect('<style>:root{--alias:var(--color-border)}</style><input style="--local:var(--alias);border-width:var(--local)">')).toHaveLength(1);
 expect(inspect('<input style="--local:transparent;border-style:var(--local)">')).toHaveLength(1);
});
test('unsupported nesting, typed registrations, strings and escaped variable names cannot manufacture static proof',()=>{
 for(const css of [
  ':root{@media (min-width:1px){--color-border:2px}}',
  '@property --color-border{syntax:"<length>";inherits:false;initial-value:2px}',
  ':root{--color\\-border:2px}',
  '.other{content:";border-width:var(--color-border);";border:1px solid var(--color-border)}'
 ])expect(inspect(`<style>${css}</style><input style="border-width:var(--color-border)">`).length).toBe(css.includes('content:')?1:0);
 expect(inspect('<input style="border:1px solid var(--color-border);--note:\';border-width:var(--color-border)\'">')).toHaveLength(0);
});
test('existing baseline errors stay advisory, while newly introduced errors are still blocking',()=>{
 const old='<input data-nid="field" style="border-width:var(--color-border)">';
 const report=checkGenerationQuality(old,{baselineHtml:old});
 expect(report.findings.find(f=>f.code==='css_token_property_type')?.severity).toBe('warning');
 expect(checkGenerationQuality(old,{baselineHtml:'<input data-nid="field">'}).findings.find(f=>f.code==='css_token_property_type')?.severity).toBe('error');
});
test('inactive conditions and potential cross-rule/inline/shorthand winners never create a hard block',()=>{
 for(const html of [
  '<style>@media(min-width:99999px){input{border-width:var(--color-border)}}</style><input data-nid="x" style="border:1px solid gray">',
  '<style>input{border-width:var(--color-border)}input{border-width:2px}</style><input data-nid="x">',
  '<style>input{border-width:var(--color-border)}</style><input data-nid="x" style="border-width:2px">',
  '<style>input{border-width:var(--color-border)}</style><input data-nid="x" style="border:1px solid gray">',
  '<style>input{border-width:var(--color-border)}input{border:1px solid gray}</style><input data-nid="x">',
  '<style>@supports(display:grid){input{border-width:var(--color-border)}}</style><input data-nid="x">'
 ]){
  expect(inspect(html)).toHaveLength(0);
  expect(checkGenerationQuality(html).findings.filter(f=>f.code==='css_token_property_type')).toHaveLength(0);
 }
});
test('important and all competing declarations remain unverified while an isolated bad important declaration is proven',()=>{
 for(const style of ['border:1px solid!important;border-width:var(--color-border);border-style:var(--color-border)','border-width:1px!important;border-width:var(--color-border)','border:1px solid ! /*priority*/ important;border-width:var(--color-border)','border-width:var(--color-border);all:initial','border-width:var(--color-border);all:revert'])expect(inspect(`<input data-nid="x" style="${style}">`)).toHaveLength(0);
 expect(inspect('<input data-nid="x" style="border-width:var(--color-border)!important;border-style:var(--color-border)!important">')).toHaveLength(2);
 expect(inspect('<style>input{border-width:var(--color-border)}input{all:revert}</style><input>')).toHaveLength(0);
 expect(inspect('<style>@import "https://fixture.example.test/theme.css";</style><input style="border-width:var(--color-border)">')).toHaveLength(0);
});
test('shared prompt allows legitimate styles and scopes changes; detached DOM never claims a visual proof',()=>{
 expect(GOLDEN_HIERARCHY).toContain(FORM_PRESENTATION_RULES);
 for(const text of ['下划线','只读','统一列','Token','选中的元素或区域','导入保留原貌'])expect(FORM_PRESENTATION_RULES).toContain(text);
 expect(FORM_PRESENTATION_RULES).not.toMatch(/52px|12px/);
 expect(inspectFormPresentation(parseHtmlCopy('<input style="border:0;background:none">').doc)).toEqual([]);
});
for(const intent of ['create_screen','modify_screen'] as const)test(`${intent} system prompt actually carries device-independent form guidance`,()=>{
 for(const deviceProfile of ['pc','mobile'] as const)expect(PromptBuilder.buildSystemPrompt({intent,deviceProfile,frameWidth:deviceProfile==='pc'?1440:390,decisions:[],designSystem:techBlueTheme})).toContain(FORM_PRESENTATION_RULES);
});
for(const entry of ['element','local','region','draft'] as const)test(`${entry} request carries scoped form guidance without changing schema, budget or call count`,async()=>{
 const html='<main data-nid="root"><section data-nid="region"><h2>基础资料</h2><p>填写资料</p></section><section data-nid="other">'+Array.from({length:15},(_,i)=>`<p data-nid="p${i}">保留${i}</p>`).join('')+'</section></main>';
 const calls:Array<{schema:unknown;request:StreamTextOptions}>=[];
 const core={generateObject:async(schema:unknown,request:StreamTextOptions)=>{
  calls.push({schema,request});
  return ['region','draft'].includes(entry)?{nid:'region',html:'<section data-nid="region" class="p-4"><h2>基础资料</h2><p>填写资料</p></section>'}:{requiresPageRewrite:false,reason:'',operations:[{nid:'region',type:'add_classes',value:'p-4'}]};
 }} as unknown as AIEngineCore;
 const provider={id:'test',name:'test',protocol:'openai_compatible' as const,baseUrl:'https://invalid.test',apiKey:'',enabled:true};
 const options={html,request:'调整字段样式',device:'pc' as const,designSystem:techBlueTheme,mode:'light' as const,provider,model:'test'};
 let measured='';
 if(entry==='element')await generateElementCopyEdits(core,{...options,targetNid:'region'});
 if(entry==='local')await generateSupplementedLocalEdits(core,{...options,allowedNids:['region']});
 if(entry==='region')await generateRegionCopyEdits(core,{...options,targetNids:['region']});
 if(entry==='draft')await repairDraftRegions(core,{provider,model:'test',messages:[{role:'system',content:'项目规则'}]},makeFailedPageDraft(html,'context','binding',{})!,{nids:['region'],instruction:'调整字段样式'},[],messages=>{measured=JSON.stringify(messages);});
 expect(calls).toHaveLength(1);
 expect(calls[0].request.messages.filter(m=>m.role==='system').map(m=>m.content).join('\n')).toContain(SCOPED_FORM_PRESENTATION_RULES);
 expect(calls[0].request.maxTokens).toBe(entry==='element'?2048:entry==='local'?1800:4096);
 expect(JSON.stringify(calls[0].request.messages)).not.toContain('保留14');
 if(entry==='draft')expect(measured).toBe(JSON.stringify(calls[0].request.messages));
 expect((calls[0].schema as {properties:object}).properties).toHaveProperty(['region','draft'].includes(entry)?'html':'operations');
});
