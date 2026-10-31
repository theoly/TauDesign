import {expect,test} from 'bun:test';
import {formRuleChanges,authorizedFormChanges,matchesFormAttribute} from '../src/services/ai/formBehaviorChanges';
import {requiresFunctionalPlanning} from '../src/services/ai/functionalModification';
import {requiresModificationReview} from '../src/services/ai/modificationEntry';
import {applyRegionCopyEdits} from '../src/services/ai/regionCopyModification';
import {executeStructuredEdit} from '../src/services/ai/structuredEditExecutor';
import {buildDesignTaskContract} from '../src/services/ai/designWorkflow';
import {DefaultAIEngineCore} from '../src/services/ai/engine/core/aiEngineCore';
import {MockTransport} from '../src/services/ai/engine/transport/mockTransport';
import {techBlueTheme} from '../src/utils/themePresets';
import {chatPageTaskPlan} from './fixtures/pageTaskPlan';
const doc=(html:string)=>new DOMParser().parseFromString(html,'text/html');
const section='<section data-nid="section1"><label>邮箱<input data-nid="email001" type="email" name="email"/></label><label>手机<input data-nid="phone001" type="tel" name="phone"/></label><button data-nid="save0001" type="button">保存</button><a data-nid="link0001" href="/rules">规则</a></section>';
const filler='<aside>'+Array.from({length:24},(_,i)=>`<p data-nid="other${i}">外部${i}</p>`).join('')+'</aside>';
const original='<main>'+section+filler+'</main>';
test('explicit form rule adjustments plan directly while visual, quoted and protective clauses do not',()=>{
 for(const request of ['把邮箱设为必填','将邮箱改为可选','将资料设为只读','把手机改成可编辑','把提交按钮设为不可用','启用保存按钮','把单选套餐改为可多选并显示合计','把套餐多选改为单选','make email required','change optional email to required','change required email to optional','change editable email to read-only','change read-only email to editable','switch single-select to multi-select','change multi-select to single-select']){
  expect(requiresFunctionalPlanning(request)).toBe(true);expect(requiresModificationReview(request)).toBe(false);
 }
 for(const request of ['不要将邮箱设为必填','保留单选，调整按钮颜色','把按钮文案改为“将邮箱设为必填”','将标题改为“必填”','将必填星号颜色改为红色','调整禁用按钮的背景颜色','把按钮颜色改为禁用色','优化表单','make label text required','disable button shadow'])expect(formRuleChanges(request)).toEqual([]);
 expect(formRuleChanges('把保存按钮设为不可用')[0]).toMatchObject({rule:'disabled',enabled:true});expect(formRuleChanges('把邮箱设为不可编辑')[0]).toMatchObject({rule:'readonly',enabled:true});
 expect(formRuleChanges('change multi-select to single-select')[0]).toMatchObject({rule:'multiple',enabled:false});
 expect(formRuleChanges('[引用元素 nid="section1" 画框="资料页" 标签=<section>]\n元素片段:\n<section><button>禁用保存</button></section>\n\n把标题加粗')).toEqual([]);
 expect(formRuleChanges('保留示例 `禁用按钮`，只调整间距')).toEqual([]);
 expect(requiresModificationReview('先分析表单，再将邮箱设为必填')).toBe(true);expect(requiresModificationReview('优化表单')).toBe(true);
});
test('only a named field or an unambiguous deictic target receives a boolean attribute allowance',()=>{
 const d=doc(section),root=d.querySelector('section')!;
 expect(authorizedFormChanges(root,'把邮箱设为必填')).toEqual([{nid:'email001',attribute:'required',value:''}]);
 expect(authorizedFormChanges(root,'把手机设为只读')).toEqual([{nid:'phone001',attribute:'readonly',value:''}]);
 expect(authorizedFormChanges(root,'禁用保存按钮')).toEqual([{nid:'save0001',attribute:'disabled',value:''}]);
 expect(authorizedFormChanges(d.querySelector('input')!,'设为必填')).toEqual([{nid:'email001',attribute:'required',value:''}]);
 expect(authorizedFormChanges(root,'全部字段设为必填')).toHaveLength(2);
});
test('a missing label, duplicate target, missing identity or unsupported control never guesses a field',()=>{
 for(const [html,request] of [
  [section,'把昵称设为必填'],[section,'设为必填'],
  ['<section><label>邮箱<input data-nid="one"/></label><label>邮箱<input data-nid="two"/></label></section>','把邮箱设为必填'],
  ['<section><label>邮箱<input/></label></section>','把邮箱设为必填'],
  ['<section><label>邮箱<input data-nid="same"/></label><input data-nid="same"/></section>','把邮箱设为必填'],
  ['<section><label>颜色<input type="color" data-nid="color001"/></label></section>','把颜色字段设为只读']
 ])expect(()=>authorizedFormChanges(doc(html).body.firstElementChild!,request)).toThrow();
});
test('a longer exact label is selected over its suffix and unrelated controls retain their attributes',()=>{
 const d=doc('<section><label>邮箱<input data-nid="email001"/></label><label>备用邮箱<input data-nid="backup01"/></label></section>');
 expect(authorizedFormChanges(d.body.firstElementChild!,'把备用邮箱设为可选')).toEqual([{nid:'backup01',attribute:'required',value:null}]);
});
test('radio selection conversion preserves the entire named group and refuses partial or ambiguous groups',()=>{
 const html='<main><fieldset data-nid="plans001"><legend>套餐</legend><label>A<input data-nid="plan0001" type="RADIO" name="plan" value="a"/></label><label>B<input data-nid="plan0002" type="radio" name="plan" value="b"/></label></fieldset></main>';
 const d=doc(html),root=d.querySelector('fieldset')!;
 expect(authorizedFormChanges(root,'把套餐单选改为多选')).toEqual([{nid:'plan0001',attribute:'type',value:'checkbox'},{nid:'plan0002',attribute:'type',value:'checkbox'}]);
 expect(()=>authorizedFormChanges(d.querySelector('label')!,'把单选改为多选')).toThrow('部分选择组');
 const nameless=doc(html.replaceAll('name="plan"',''));expect(()=>authorizedFormChanges(nameless.querySelector('fieldset')!,'把套餐单选改为多选')).toThrow();
});
test('multiple-select, readonly and enabled rule reversals require removal of the old boolean state',()=>{
 const d=doc('<section><label>兴趣<select data-nid="inter001" multiple><option>绘画</option></select></label><label>邮箱<input data-nid="email001" readonly/></label><button data-nid="save0001" disabled>保存</button></section>');
 expect(authorizedFormChanges(d.querySelector('section')!,'把兴趣多选改为单选，将邮箱改为可编辑，启用保存按钮')).toEqual([
  {nid:'inter001',attribute:'multiple',value:null},{nid:'email001',attribute:'readonly',value:null},{nid:'save0001',attribute:'disabled',value:null}]);
 const el=d.querySelector('input')!;expect(matchesFormAttribute(el,{nid:'email001',attribute:'readonly',value:null})).toBe(false);el.removeAttribute('readonly');expect(matchesFormAttribute(el,{nid:'email001',attribute:'readonly',value:null})).toBe(true);
 expect(()=>authorizedFormChanges(d.querySelector('section')!,'把邮箱设为必填，将邮箱设为可选')).toThrow('冲突');
});
test('multiple authorized regions resolve each rule once without reading unrelated controls as permission',()=>{
 const d=doc('<main><section id="one"><label>邮箱<input data-nid="email001"/></label></section><section id="two"><label>手机<input data-nid="phone001"/></label></section><label>昵称<input data-nid="name0001"/></label></main>');
 expect(authorizedFormChanges(Array.from(d.querySelectorAll('section')),'把邮箱设为必填，将手机设为只读')).toEqual([{nid:'email001',attribute:'required',value:''},{nid:'phone001',attribute:'readonly',value:''}]);
 expect(()=>authorizedFormChanges(Array.from(d.querySelectorAll('section')),'把昵称设为必填')).toThrow('定位');
});
test('the subtree merge accepts only the declared attribute state and keeps original controls, links and outer DOM',()=>{
 const replacement=section.replace('name="email"','name="email" required');
 const next=applyRegionCopyEdits(original,[{nid:'section1',html:replacement}],{allowedNids:['section1'],device:'mobile',modificationRequest:'把邮箱设为必填',preserveInteractionAttributes:true});
 expect(doc(next.html).querySelector('[data-nid="email001"]')?.hasAttribute('required')).toBe(true);expect(doc(original).querySelector('aside')?.isEqualNode(doc(next.html).querySelector('aside')!)).toBe(true);
 for(const html of [section,replacement.replace('name="email"','name="wrong"'),replacement.replace('href="/rules"','href="/wrong"'),replacement.replace('type="email"','type="password"'),replacement.replace('name="phone"','name="phone" required'),replacement.replace('required','required="false"')])expect(()=>applyRegionCopyEdits(original,[{nid:'section1',html}],{allowedNids:['section1'],device:'mobile',modificationRequest:'把邮箱设为必填',preserveInteractionAttributes:true})).toThrow();
});
test('explicit element behavior changes plan before a scoped fragment with exact application-computed attribute permissions',async()=>{
 const request='把邮箱设为必填',transport=new MockTransport(),requests:any[]=[];
 transport.queueResponse(JSON.stringify({...chatPageTaskPlan,features:[{...chatPageTaskPlan.features[0],change:'update',title:'邮箱',information:[{label:'邮箱',kind:'input'}]}]}));transport.queueResponse(JSON.stringify({nid:'section1',html:section.replace('name="email"','name="email" required')}));
 const core=new DefaultAIEngineCore({id:'capture',stream:(request,event)=>{requests.push(request);return transport.stream(request,event);}});
 const options={mode:'element' as const,elementNid:'section1',screen:{id:'page',name:'资料页',htmlContent:original},request,contract:buildDesignTaskContract({intent:'modify_screen',request,target:{id:'page',name:'资料页',htmlContent:original},elementNid:'section1',deviceProfile:'mobile',frameWidth:390}),settings:{deviceProfile:'mobile' as const,frameWidth:390},designSystem:techBlueTheme,colorMode:'light' as const,binding:{provider:{id:'fixture',protocol:'openai_compatible' as const,baseUrl:'http://mock',apiKey:'FORM_SECRET'},model:'fixture'},isCurrent:()=>true};
 const result=await executeStructuredEdit(core,options);expect(result.status).toBe('ready');expect(requests).toHaveLength(2);
 expect(JSON.parse(requests[1].body.messages.at(-1).content).authorizedFormChanges).toEqual([{nid:'email001',attribute:'required',value:''}]);
 expect(result.contract.pageTaskPlan?.plan.features[0].change).toBe('update');expect(result.contract.allowedChanges).toEqual(['element:section1']);expect(result.taskBudget?.requestedOutputTokens).toBe(7168);expect(options.screen.htmlContent).toBe(original);
});
test('ambiguous or protected behavior changes are rejected before spending any model request',async()=>{
 const core=new DefaultAIEngineCore({id:'unexpected',stream(){throw Error('must not request');}});
 for(const [request,protectedNids] of [['把昵称设为必填',[]],['设为必填',[]],['把邮箱设为必填',['email001']]] as Array<[string,string[]]>){
  const result=await executeStructuredEdit(core,{mode:'element',elementNid:'section1',screen:{id:'page',name:'资料页',htmlContent:original},request,contract:buildDesignTaskContract({intent:'modify_screen',request,target:{id:'page',name:'资料页',htmlContent:original},elementNid:'section1',deviceProfile:'mobile',frameWidth:390}),settings:{deviceProfile:'mobile',frameWidth:390},designSystem:techBlueTheme,colorMode:'light',binding:{provider:{id:'fixture',protocol:'openai_compatible',baseUrl:'http://mock',apiKey:'fixture'},model:'fixture'},protectedNids,isCurrent:()=>true});
  expect(result.status).toBe('failed');expect(result.taskBudget).toBeUndefined();expect(result.executionRecord.rawResponse).toBe('');
 }
});

import {checkGenerationQuality} from '../src/services/ai/generationQuality';
import {PipelineExecutor} from '../src/services/ai/engine/pipeline/executor';
test('quality recomputes exact native states and uses the candidate contract scope for duplicate labels outside it',()=>{
 const baseline=original.replace('</aside>','<label>邮箱<input data-nid="outside1"/></label></aside>'),changed=baseline.replace('name="email"','name="email" required');
 expect(checkGenerationQuality(changed,{baselineHtml:baseline,modificationRequest:'把邮箱设为必填'}).passed).toBe(false);
 expect(checkGenerationQuality(changed,{baselineHtml:baseline,modificationRequest:'把邮箱设为必填',formRuleRoots:['section1']}).passed).toBe(true);
 const missing=checkGenerationQuality(baseline,{baselineHtml:baseline,modificationRequest:'把邮箱设为必填',formRuleRoots:['section1']});expect(missing.findings.find(f=>f.code==='form_rule_not_applied')).toMatchObject({nid:'email001',severity:'error'});
 expect(checkGenerationQuality(baseline,{baselineHtml:baseline,modificationRequest:'把文案改成“把邮箱设为必填”'}).findings.some(f=>f.code==='form_rule_not_applied')).toBe(false);
});
test('whole-page modification cannot report success when the native state from its explicit request was omitted',async()=>{
 for(const applied of [false,true]){
  const transport=new MockTransport(),requests:any[]=[];transport.queueResponse(JSON.stringify({...chatPageTaskPlan,features:[{...chatPageTaskPlan.features[0],change:'update',title:'邮箱',information:[{label:'邮箱',kind:'input'}]}]}));
  transport.queueResponse('<artifact identifier="page" type="screen" title="资料页">'+(applied?original.replace('name="email"','name="email" required'):original)+'</artifact>');
  const core=new DefaultAIEngineCore({id:'capture',stream:(request,event)=>{requests.push(request);return transport.stream(request,event);}});
  const result=await PipelineExecutor.execute({input:{rawPrompt:'修改资料页，把邮箱设为必填',activeScreenId:'page',decision:{intent:'modify_screen',targetScreenId:'page',styleReferenceScreenId:null,elementNid:null,reason:'明确规则'}},screens:{page:{id:'page',name:'资料页',htmlContent:original}},provider:{id:'fixture',protocol:'openai_compatible',baseUrl:'http://mock',apiKey:'fixture'},model:'fixture',engineCore:core,pageTaskPlanning:{},deviceProfile:'mobile',frameWidth:390,designSystem:techBlueTheme,baseSystemPrompt:'baseline'});
  expect(result.status).toBe(applied?'staged_side_by_side':'rejected_by_quality');expect(requests).toHaveLength(2);if(!applied)expect(result.qualityReport?.findings.some(f=>f.code==='form_rule_not_applied')).toBe(true);
 }
});

test('existing accessible form states stay synchronized and multiple selected values are never silently reduced',()=>{
 const baseline=original.replace('name="email"','name="email" aria-required="false"');
 const root=doc(baseline).querySelector('section')!;
 expect(authorizedFormChanges(root,'把邮箱设为必填')).toEqual([{nid:'email001',attribute:'required',value:''},{nid:'email001',attribute:'aria-required',value:'true'}]);
 const unsynchronized=baseline.replace('name="email"','name="email" required');expect(checkGenerationQuality(unsynchronized,{baselineHtml:baseline,modificationRequest:'把邮箱设为必填',formRuleRoots:['section1']}).passed).toBe(false);
 const synchronized=unsynchronized.replace('aria-required="false"','aria-required="true"');expect(checkGenerationQuality(synchronized,{baselineHtml:baseline,modificationRequest:'把邮箱设为必填',formRuleRoots:['section1']}).passed).toBe(true);
 const choices=doc('<fieldset><legend>套餐</legend><label>A<input data-nid="choice01" type="radio" role="radio" name="plans"/></label><label>B<input data-nid="choice02" type="radio" name="plans"/></label></fieldset>');
 expect(authorizedFormChanges(choices.querySelector('fieldset')!,'把套餐改为多选')).toContainEqual({nid:'choice01',attribute:'role',value:'checkbox'});
 const selected=doc('<fieldset><legend>套餐</legend><label>A<input data-nid="choice01" type="checkbox" name="plans" checked/></label><label>B<input data-nid="choice02" type="checkbox" name="plans" checked/></label></fieldset>');
 expect(()=>authorizedFormChanges(selected.querySelector('fieldset')!,'把套餐改为单选')).toThrow('默认项');
});
