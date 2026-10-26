import {afterEach,beforeEach,expect,test} from 'bun:test';
import {useProjectStore} from '../src/stores/useProjectStore';
import {useHistoryStore} from '../src/stores/useHistoryStore';
import {neutralModernTheme} from '../src/utils/themePresets';
import {buildDesignTaskContract,buildRestyleContract} from '../src/services/ai/designWorkflow';
import {WORKFLOW_CATALOG} from '../src/services/ai/workflowCatalog';
import {evaluateWorkflowValidation,createWorkflowValidationPlan,resolveWorkflowValidation,inspectWorkflowStructure,isWorkflowValidationReport} from '../src/services/ai/workflowValidation';
import {loadStagedCandidate} from '../src/services/storage/candidateRepository';

const source='<main data-nid="root"><h1 data-nid="title">标题</h1><button data-nid="action" class="btn">提交</button></main>';
const candidate=source.replace('class="btn"','class="btn btn-primary"');
const changed=source.replace('<h1','<section data-nid="new"><h1').replace('</h1>','</h1></section>');
let prior:ReturnType<typeof useProjectStore.getState>,history:ReturnType<typeof useHistoryStore.getState>;
beforeEach(()=>{prior=useProjectStore.getState();history=useHistoryStore.getState();const s=useProjectStore.getState();s.initNewProject({name:'工作流验收',deviceProfile:'pc',designSystem:neutralModernTheme,createSpecimen:false});s.addScreen({name:'页面',htmlContent:source,position:{x:0,y:0}},'a');});
afterEach(async()=>{const s=useProjectStore.getState();s.discardStagedChange();await loadStagedCandidate(s.id);useProjectStore.setState(prior,true);useHistoryStore.setState(history,true);});
const contract=(request='调整主按钮样式')=>buildDesignTaskContract({intent:'modify_screen',request,target:{id:'a',name:'页面',htmlContent:source},deviceProfile:'pc',frameWidth:1440});
function stage(html=candidate,task=contract()){
  const s=useProjectStore.getState();s.stageScreenChange('a',html,'候选',task.request,task);
  s.setStagedRenderQuality(s.getStagedRenderContextKey(),{status:'complete',findings:[],inspected:3});return s;
}
test('catalog plans keep mandatory safety, assets and render checks even if a descriptor removes them',()=>{
  const plan=createWorkflowValidationPlan({...WORKFLOW_CATALOG['edit-page-copy'],validationStages:[]});
  expect(plan.stages).toEqual(['source-safety','quality','asset-references','asset-files','render','design-entities','structure']);
  const report=evaluateWorkflowValidation(plan,{'source-safety':{status:'passed',message:'源码已查'}});
  expect(report.status).toBe('blocked');expect(report.checks.find(c=>c.id==='render')?.status).toBe('blocked');
});
test('removing catalog stages cannot disable structure protection on a modifying workflow',()=>{
  const workflow=WORKFLOW_CATALOG['edit-page-copy'],old=workflow.validationStages;
  try{workflow.validationStages=[];expect(stage(changed,contract('调整按钮样式')).getStagedDeliveryReport().status).toBe('blocked');}
  finally{workflow.validationStages=old;}
});
for(const mutation of ['fingerprint','remove-render','device','strategy'] as const)test(`changed ${mutation} plan/contract cannot be adopted by any entry`,async()=>{
  const task=contract();
  if(mutation==='fingerprint')task.validationPlan!.fingerprint='forged';
  if(mutation==='remove-render')task.validationPlan!.stages=task.validationPlan!.stages.filter(stage=>stage!=='render');
  if(mutation==='device')task.device.profile='mobile';
  if(mutation==='strategy')task.strategy='validated-batch';
  const s=stage(candidate,task);expect(s.getStagedDeliveryReport().status).toBe('blocked');
  expect(await s.adoptStagedChange()).toBe(false);expect(await s.forceAdoptStagedChange()).toBe(false);expect(await s.keepBothScreens()).toBe(false);
});
test('newly required stages without an executable check block ordinary and forced adoption',async()=>{
  const workflow=WORKFLOW_CATALOG['edit-page-copy'],old=workflow.validationStages;
  try{
    workflow.validationStages=[...old,'analysis-schema'];const s=stage();
    expect(s.getStagedDeliveryReport().status).toBe('blocked');
    expect(await s.forceAdoptStagedChange()).toBe(false);
  }finally{workflow.validationStages=old;}
});
test('restyle candidates must pass actual structure checks, while explicit override records the failed stage',async()=>{
  const task=buildRestyleContract({scope:'single',target:{id:'a',name:'页面',html:source},deviceProfile:'pc',frameWidth:1440});
  const s=stage(changed,task);expect(s.getStagedDeliveryReport().checks.find(check=>check.id==='structure')?.status).toBe('blocked');
  expect(await s.adoptStagedChange()).toBe(false);expect(await s.forceAdoptStagedChange()).toBe(true);
});
test('page structure changes require the existing explicit structural authorization',()=>{
  const s=stage(changed,contract('调整按钮样式'));expect(s.getStagedDeliveryReport().status).toBe('blocked');
  s.discardStagedChange();stage(changed,contract('增加标题卡片区块'));expect(s.getStagedDeliveryReport().status).toBe('ready');
});
test('actual stage evidence is saved, old contracts infer the current plan, and restored evidence cannot unlock render',async()=>{
  const task=contract();delete task.validationPlan;const s=stage(candidate,task);
  expect(s.getStagedDeliveryReport().status).toBe('ready');
  const saved=await loadStagedCandidate(s.id);expect(saved?.validationEvidence?.delivery.workflow?.status).toBe('ready');
  expect(saved?.validationEvidence?.delivery.workflow?.checks.find(check=>check.id==='render')?.status).toBe('passed');
  s.restoreStagedCandidate(saved!,s.id);expect(useProjectStore.getState().getStagedDeliveryReport().status).toBe('pending');
});
test('a nested authorized scope is treated as a union and changes outside its roots are detected',()=>{
  const task=contract();task.allowedChanges=['element:root','element:title'];
  expect(inspectWorkflowStructure(task,source,changed,{deviceProfile:'pc'}).passed).toBe(true);
  task.allowedChanges=['element:title'];
  expect(inspectWorkflowStructure(task,source,source.replace('提交','无权改动'),{deviceProfile:'pc'}).passed).toBe(false);
  expect(inspectWorkflowStructure(task,source,source.replace('class="btn"','class="btn" disabled'),{deviceProfile:'pc'}).passed).toBe(false);
});
test('catalog changes invalidate an earlier snapshot, but legacy candidates retain the original hard gates',()=>{
  const task=contract(),workflow=WORKFLOW_CATALOG['edit-page-copy'],old=workflow.validationStages;
  try{workflow.validationStages=[...old,'import-preview'];expect(resolveWorkflowValidation(task,'candidate').ok).toBe(false);}
  finally{workflow.validationStages=old;}
  const s=useProjectStore.getState();s.stageScreenChange('a',candidate,'旧候选');
  expect(s.getStagedDeliveryReport().status).toBe('pending');
});
for(const registered of [false,true])test(`${registered?'registered but missing':'unregistered'} L4 background files block candidate workflow evidence`,async()=>{
  const s=useProjectStore.getState();s.setOverride('a','root',{'background-image':'url(assets/images/l4.png)'});
  if(registered)s.addAsset({id:'l4',name:'覆盖背景',type:'image',mimeType:'image/png',source:'upload',refCount:1,relPath:'assets/images/l4.png'});
  const store=stage();await loadStagedCandidate(store.id);
  expect(store.getStagedDeliveryReport().status).toBe('blocked');
  expect(await store.forceAdoptStagedChange()).toBe(false);
});
test('contradictory archived stage summaries are invalid diagnostics',()=>{
  const report=evaluateWorkflowValidation(createWorkflowValidationPlan(WORKFLOW_CATALOG['edit-page-copy']),{});
  expect(isWorkflowValidationReport(report)).toBe(true);
  expect(isWorkflowValidationReport({...report,status:'ready'})).toBe(false);
});
