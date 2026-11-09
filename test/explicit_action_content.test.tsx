import {afterEach,beforeEach,expect,test} from 'bun:test';
import calibration from './fixtures/validation/explicit-action-content-v1.json';
import {checkGenerationQuality} from '../src/services/ai/generationQuality';
import {explicitActionTexts,inspectExplicitActionTexts} from '../src/services/ai/explicitActionContent';
import {buildDesignBrief} from '../src/services/ai/designBrief';
import {defaultTheme} from '../src/utils/themePresets';
import {useProjectStore} from '../src/stores/useProjectStore';
import {useHistoryStore} from '../src/stores/useHistoryStore';
import {loadStagedCandidate} from '../src/services/storage/candidateRepository';
import {buildDesignTaskContract} from '../src/services/ai/designWorkflow';
import {CanvasToolExecutor} from '../src/services/tools/canvasToolExecutor';
import {PageRenderCheck} from '../src/services/ai/pageRenderCheck';
import {stageResourceReport} from './helpers/renderResourceProof';
import {isQualityFinding} from '../src/services/ai/evidenceSchema';
for(const row of calibration.cases)test(`explicit action source: ${row.id}`,()=>{
 const result=checkGenerationQuality('<main>'+row.html+'</main>',{contentTask:{request:row.request,...('elementNid' in row?{elementNid:row.elementNid}:{})}});
 expect(!result.findings.some(f=>f.code==='required_action_text_missing')).toBe(row.source);
});
for(const row of calibration.cases)test(`user declaration extraction: ${row.id}`,()=>{
 const ignored=['question','negative','reference','code','example','unquoted','multiline-example','conditional','multiline-negative','following-example'].includes(row.id);
 expect(explicitActionTexts({request:row.request}).length).toBe(ignored?0:1);
});
test('brief discloses user literal without upgrading supplied semantic or reference content',()=>{
 const brief=buildDesignBrief({request:'按钮文案改为“确认提交”',designSystem:defaultTheme,device:'pc',mode:'light',globalDecisions:[],components:[],
  projectKnowledge:'按钮文案改为“来自文档”',contentObligations:[{kind:'semantic',text:'说明权益',source:'document'}]});
 expect(brief.contentObligations).toEqual([{kind:'semantic',text:'说明权益',source:'document'},{kind:'exact',source:'user',text:'确认提交'}]);
 expect(explicitActionTexts({request:'按钮文案改为“确认提交”',multiPage:{} as any})).toEqual([]);
});
test('required content metadata cannot be omitted or downgraded',()=>{
 const finding=checkGenerationQuality('<button>保存</button>',{modificationRequest:'按钮文案改为“确认提交”'}).findings.find(f=>f.code==='required_action_text_missing')!;
 expect(isQualityFinding(finding)).toBe(true);expect(isQualityFinding({...finding,severity:'warning'})).toBe(false);expect(isQualityFinding({...finding,assessment:undefined})).toBe(false);
});

let prior:ReturnType<typeof useProjectStore.getState>,history:ReturnType<typeof useHistoryStore.getState>;
const inspect=PageRenderCheck.inspect,baseline='<main data-nid="scope"><button data-nid="control" class="btn">保存</button></main>';
beforeEach(()=>{
 prior=useProjectStore.getState();history=useHistoryStore.getState();useProjectStore.getState().initNewProject({name:'明确原文',deviceProfile:'pc',designSystem:defaultTheme,createSpecimen:false});
});
afterEach(async()=>{
 PageRenderCheck.inspect=inspect;const store=useProjectStore.getState();store.discardStagedChange();await loadStagedCandidate(store.id);useProjectStore.setState(prior,true);useHistoryStore.setState(history,true);
});
const task=(intent:'create_screen'|'modify_screen')=>buildDesignTaskContract({intent,request:'按钮文案改为“确认提交”',deviceProfile:'pc',frameWidth:1440,
 ...(intent==='modify_screen'?{target:{id:'target',name:'页面',htmlContent:baseline},elementNid:'scope'}:{})});
test('creation rejects missing exact text before render and passes the same frozen requirement to actual render',async()=>{
 let received:unknown;PageRenderCheck.inspect=async request=>{received=request.contentTask;return {status:'complete',inspected:3,findings:[]};};
 const contract=task('create_screen'),count=useHistoryStore.getState().past.length;
 const create=(html:string)=>CanvasToolExecutor.executeAsync({tool:'create_screen',params:{title:'资料',html,workflowContract:contract}});
 expect((await create(baseline)).success).toBe(false);expect(received).toBeUndefined();expect(useProjectStore.getState().screenOrder).toHaveLength(0);expect(useHistoryStore.getState().past.length).toBe(count);
 expect((await create(baseline.replace('>保存<','>确认提交<'))).success).toBe(true);expect(received).toEqual(contract);
});
for(const mode of ['adoptStagedChange','forceAdoptStagedChange','keepBothScreens'] as const)test(`${mode} cannot adopt a lost user literal even after a clean generic render`,async()=>{
 const store=useProjectStore.getState();store.addScreen({name:'页面',htmlContent:baseline,position:{x:0,y:0}},'target');
 const contract=task('modify_screen');store.stageScreenChange('target',baseline,'候选',contract.request,contract);await stageResourceReport();
 expect(store.getStagedDeliveryReport().checks.find(check=>check.id==='quality')?.status).toBe('blocked');expect(await store[mode]()).toBe(false);
 expect(useProjectStore.getState().screens.target.htmlContent).toBe(baseline);
 store.discardStagedChange();store.stageScreenChange('target',baseline.replace('>保存<','>确认提交<'),'候选',contract.request,contract);await stageResourceReport();
 expect(await store[mode]()).toBe(true);
});

test('a visibility finding locates the unique source-bearing control inside the selected region',()=>{
 const doc=new DOMParser().parseFromString('<section data-nid="scope"><button data-nid="control" style="font-size:0">确认提交</button></section>','text/html');
 const result=inspectExplicitActionTexts(doc,explicitActionTexts({request:'按钮文案改为“确认提交”',elementNid:'scope'}),()=>({text:''}));
 expect(result[0].nid).toBe('control');
});
