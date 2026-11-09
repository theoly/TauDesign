import {beforeEach,afterEach,expect,test} from 'bun:test';
import calibration from './fixtures/validation/explicit-field-content-v1.json';
import {checkGenerationQuality} from '../src/services/ai/generationQuality';
for(const row of calibration.cases)test(`explicit field source: ${row.id}`,()=>{
 const result=checkGenerationQuality('<main>'+row.html+'</main>',{contentTask:{request:row.request,...('elementNid' in row?{elementNid:row.elementNid}:{})}});
 expect(!result.findings.some(f=>f.code==='required_field_label_missing')).toBe(row.source);
});

import {explicitFieldLabels,inspectExplicitFieldLabels} from '../src/services/ai/explicitFieldContent';
import {buildDesignBrief,renderDesignBrief} from '../src/services/ai/designBrief';
import {defaultTheme} from '../src/utils/themePresets';
import {useProjectStore} from '../src/stores/useProjectStore';
import {useHistoryStore} from '../src/stores/useHistoryStore';
import {buildDesignTaskContract} from '../src/services/ai/designWorkflow';
import {loadStagedCandidate} from '../src/services/storage/candidateRepository';
import {PageRenderCheck} from '../src/services/ai/pageRenderCheck';
import {CanvasToolExecutor} from '../src/services/tools/canvasToolExecutor';
import {stageResourceReport} from './helpers/renderResourceProof';
import {isQualityFinding} from '../src/services/ai/evidenceSchema';
import {assessedFinding} from '../src/services/ai/findingPolicy';
import {proposeStyleRepair} from '../src/services/ai/controlledStyleRepair';

for(const row of calibration.cases)test(`field extraction: ${row.id}`,()=>{
 expect(explicitFieldLabels({request:row.request}).length).toBe('ignored' in row&&row.ignored?0:1);
});
for(const prefix of ['> ','例如：\n','引用内容：\n','如果：\n','```text\n'])test(`field context never upgrades reference: ${prefix}`,()=>{
 expect(explicitFieldLabels(prefix+'字段标签文案必须为“手机号”')).toEqual([]);
});
test('field brief preserves the subject without collapsing identical action text or elevating reference content',()=>{
 const brief=buildDesignBrief({request:'按钮文案改为“手机号”\n字段标签文案必须为“手机号”',device:'pc',mode:'light',designSystem:defaultTheme,globalDecisions:[],components:[],projectKnowledge:'字段标签文案必须为“来自文档”'});
 expect(renderDesignBrief(brief)).toContain('通过for绑定唯一的input/select/textarea');
 expect(brief.contentObligations).toEqual([{kind:'exact',source:'user',text:'手机号'},{kind:'exact',source:'user',target:'field-label',text:'手机号'}]);
 expect(explicitFieldLabels({request:'字段标签文案必须为“手机号”',multiPage:{} as any})).toEqual([]);
});
for(const unknown of [false,true])test(`field required metadata is immutable: ${unknown}`,()=>{
 const f=assessedFinding(unknown?'required-field-label-support':'required-field-label',unknown?'unverified':'failed',{code:unknown?'required_field_label_unverified':'required_field_label_missing',actual:'缺失',expected:'手机号',message:'检查未满足'});
 expect(isQualityFinding(f)).toBe(true);expect(isQualityFinding({...f,severity:'warning'})).toBe(false);expect(isQualityFinding({...f,assessment:undefined})).toBe(false);
});
test('unique field label is located inside the selected region; uncertain observations cannot pass',()=>{
 const doc=new DOMParser().parseFromString('<section data-nid="scope"><label data-nid="label" for="phone">手机号</label><input id="phone"></section>','text/html');
 const result=inspectExplicitFieldLabels(doc,explicitFieldLabels({request:'字段标签文案必须为“手机号”',elementNid:'scope'}),()=>({text:'手机号',uncertain:true}));
 expect(result[0]).toMatchObject({code:'required_field_label_unverified',nid:'label',severity:'error'});
});

let prior:ReturnType<typeof useProjectStore.getState>,history:ReturnType<typeof useHistoryStore.getState>;
const inspect=PageRenderCheck.inspect,baseline='<main data-nid="scope"><label data-nid="label" for="phone">姓名</label><input id="phone" data-nid="field" class="input"></main>',request='字段标签文案必须为“手机号”';
beforeEach(()=>{prior=useProjectStore.getState();history=useHistoryStore.getState();useProjectStore.getState().initNewProject({name:'字段标签验收',deviceProfile:'pc',designSystem:defaultTheme,createSpecimen:false});});
afterEach(async()=>{PageRenderCheck.inspect=inspect;const s=useProjectStore.getState();s.discardStagedChange();await loadStagedCandidate(s.id);useProjectStore.setState(prior,true);useHistoryStore.setState(history,true);});
const contract=(modify=false)=>buildDesignTaskContract({intent:modify?'modify_screen':'create_screen',request,deviceProfile:'pc',frameWidth:1440,...(modify?{target:{id:'page',name:'页面',htmlContent:baseline},elementNid:'scope'}:{})});
test('creation checks field source before rendering and carries the exact frozen contract to final render',async()=>{
 let received:unknown;PageRenderCheck.inspect=async input=>{received=input.contentTask;return {status:'complete',inspected:3,findings:[]};};
 const task=contract(),before=useHistoryStore.getState().past.length,create=(html:string)=>CanvasToolExecutor.executeAsync({tool:'create_screen',params:{title:'资料',html,workflowContract:task}});
 expect((await create(baseline)).success).toBe(false);expect(received).toBeUndefined();expect(useProjectStore.getState().screenOrder).toHaveLength(0);expect(useHistoryStore.getState().past.length).toBe(before);
 expect((await create(baseline.replace('>姓名<','>手机号<'))).success).toBe(true);expect(received).toEqual(task);
});
for(const mode of ['adoptStagedChange','forceAdoptStagedChange','keepBothScreens'] as const)test(`${mode} cannot adopt an absent field label; saved failed evidence stays blocked`,async()=>{
 const s=useProjectStore.getState();s.addScreen({name:'页面',htmlContent:baseline,position:{x:0,y:0}},'page');const task=contract(true);
 s.stageScreenChange('page',baseline,'候选',request,task);await stageResourceReport();
 expect(s.getStagedDeliveryReport().checks.find(c=>c.id==='quality')?.status).toBe('blocked');expect(await s[mode]()).toBe(false);expect(useProjectStore.getState().screens.page.htmlContent).toBe(baseline);
 const saved=await loadStagedCandidate(s.id);expect(saved?.validationEvidence?.quality.findings.some(f=>f.code==='required_field_label_missing')).toBe(true);
 expect(s.restoreStagedCandidate(saved!,s.id)).toBe(true);await stageResourceReport();expect(await s[mode]()).toBe(false);
 s.discardStagedChange();s.stageScreenChange('page',baseline.replace('>姓名<','>手机号<'),'候选',request,task);await stageResourceReport();expect(await s[mode]()).toBe(true);
});
test('missing required field text cannot borrow the button style-repair allowance',async()=>{
 let calls=0;const core={streamText(){calls++;throw Error('must not call');},async generateObject(){calls++;throw Error('must not call');}};
 const result=await proposeStyleRepair({state:useProjectStore.getState(),html:baseline+'<button data-nid="save" style="font-size:0">保存</button>',contract:contract(),context:'field-missing',render:{status:'complete',inspected:4,findings:[{severity:'error',code:'render_action_invisible_label',nid:'save',message:'零字号',actual:'0',expected:'可见'}]}},
 {isCurrent:()=>true,model:{core,provider:{id:'fixture'} as any,model:'fixture'}});
 expect(result.status).toBe('skipped');expect(calls).toBe(0);
});
