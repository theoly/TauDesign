import * as BaseCss from '../src/styles/baseCss';
import {saveStagedCandidate} from '../src/services/storage/candidateRepository';
import {pageCreationContext} from '../src/services/ai/pageCreationValidation';
import {afterEach,beforeEach,describe,expect,spyOn,test} from 'bun:test';
import {useProjectStore} from '../src/stores/useProjectStore';
import {useHistoryStore} from '../src/stores/useHistoryStore';
import {buildDesignTaskContract} from '../src/services/ai/designWorkflow';
import {RenderEvidenceAuthority,taskInputBinding} from '../src/services/ai/evidenceIdentity';
import {loadStagedCandidate} from '../src/services/storage/candidateRepository';
import {neutralModernTheme} from '../src/utils/themePresets';
import {knowledgeFingerprint,buildProjectKnowledgeBundle} from '../src/services/ai/projectKnowledge';

const baseline='<main data-nid="root0001"><button data-nid="button01">旧文案</button></main>';
const candidate='<main data-nid="root0001"><button data-nid="button01">新文案</button></main>';
const clean={status:'complete' as const,findings:[],inspected:2};

describe('candidate input and checker invalidation',()=>{
 let priorProject:ReturnType<typeof useProjectStore.getState>;
 let priorHistory:ReturnType<typeof useHistoryStore.getState>;
 beforeEach(()=>{
  priorProject=useProjectStore.getState();priorHistory=useHistoryStore.getState();
  const store=useProjectStore.getState();
  store.initNewProject({name:'失效矩阵',deviceProfile:'pc',designSystem:neutralModernTheme,createSpecimen:false});
  store.addScreen({name:'页面',htmlContent:baseline,position:{x:0,y:0}},'target');
 });
 afterEach(async()=>{
  const store=useProjectStore.getState();store.discardStagedChange();await loadStagedCandidate(store.id);
  useProjectStore.setState(priorProject,true);useHistoryStore.setState(priorHistory,true);
 });
 function stage(newHtml=candidate){
  const store=useProjectStore.getState();
  const contract=buildDesignTaskContract({intent:'modify_screen',request:'修改文案',
   target:{id:'target',name:'页面',htmlContent:baseline},deviceProfile:store.settings.deviceProfile,frameWidth:store.settings.frameWidth,designSystem:neutralModernTheme});
  expect(contract.designGuidance).toBeUndefined();
  store.stageScreenChange('target',newHtml,'新版','修改文案',contract);
  expect(store.isStagedTaskCurrent()).toBe(true);
  return contract;
 }

 test('persists a frozen authorization binding even with guidance disabled',async()=>{
  const contract=stage();const store=useProjectStore.getState();
  expect((await loadStagedCandidate(store.id))?.taskBindingFingerprint).toBe(taskInputBinding(contract));
 });

 test('changed authorization cannot be unlocked by a new passing render',async()=>{
  stage();const store=useProjectStore.getState();
  const staged=structuredClone(store.stagedScreen!);
  staged.workflowContract!.allowedChanges.push('额外修改');
  useProjectStore.setState({stagedScreen:staged});
  store.setStagedRenderQuality(store.getStagedRenderContextKey(),clean);
  expect(store.isStagedTaskCurrent()).toBe(false);
  expect(store.getStagedDeliveryReport().status).toBe('blocked');
  await store.adoptStagedChange();
  expect(useProjectStore.getState().screens.target.htmlContent).toBe(baseline);
 });

 test('malformed stored binding is rejected rather than downgraded to legacy',()=>{
  stage();const store=useProjectStore.getState();
  useProjectStore.setState({stagedScreen:{...store.stagedScreen!,taskBindingFingerprint:'invalid'}});
  expect(store.isStagedTaskCurrent()).toBe(false);
 });

 test.each(['overrides','documents','theme'] as const)('fresh candidate detects changed %s without reopening',kind=>{
  stage();const store=useProjectStore.getState();
  if(kind==='overrides')store.setOverride('target','button01',{padding:'20px'});
  if(kind==='documents')useProjectStore.setState({projectDocuments:{brief:{id:'brief',title:'需求',content:'新增要求',source:'manual',enabled:true,createdAt:1,updatedAt:1}}});
  if(kind==='theme')useProjectStore.setState({designSystem:{...store.designSystem,name:'更新主题'}});
  store.setStagedRenderQuality(store.getStagedRenderContextKey(),clean);
  expect(store.isStagedTaskCurrent()).toBe(false);
  expect(store.getStagedDeliveryReport().status).toBe('blocked');
 });

 test('moving a frame does not invalidate its task inputs or render proof',()=>{
  stage();const store=useProjectStore.getState(),key=store.getStagedRenderContextKey();
  store.updateScreen('target',{position:{x:700,y:300}});
  expect(store.isStagedTaskCurrent()).toBe(true);
  expect(store.getStagedRenderContextKey()).toBe(key);
 });

 test('checker revision rejects late callbacks and permits fresh checks of the same task',()=>{
  stage();const store=useProjectStore.getState(),key=store.getStagedRenderContextKey();
  store.setStagedRenderQuality(key,clean);
  const binding=store.stagedScreen!.taskBindingFingerprint;
  const revision=spyOn(RenderEvidenceAuthority,'revision').mockReturnValue('test-next-checker');
  try{
   const next=store.getStagedRenderContextKey();expect(next).not.toBe(key);
   expect(store.isStagedTaskCurrent()).toBe(true);
   expect(store.getStagedDeliveryReport().status).toBe('pending');
   store.setStagedRenderQuality(key,{...clean,findings:[{code:'render_overlap',severity:'error',message:'迟到结果'}]});
   expect(useProjectStore.getState().stagedRenderQuality!.report).toEqual(clean);
   store.setStagedRenderQuality(next,clean);
   expect(useProjectStore.getState().stagedRenderQuality!.key).toBe(next);
   expect(store.getStagedDeliveryReport().status).toBe('ready');
   expect(store.stagedScreen!.taskBindingFingerprint).toBe(binding);
  }finally{revision.mockRestore();}
 });
 for(const change of ['content','disabled','removed','source'] as const)test(`AI summary ${change} invalidates a candidate even though the nonrecursive knowledge base stays unchanged`,async()=>{
  const store=useProjectStore.getState(),initialBase=knowledgeFingerprint(store);
  const doc={id:'project-analysis',title:'AI项目归纳',content:'旧需求：确认后保存',source:'ai' as const,enabled:true,createdAt:1,updatedAt:1,sourceFingerprint:initialBase};
  store.upsertProjectDocument(doc);stage();const before=knowledgeFingerprint(useProjectStore.getState()),context=buildProjectKnowledgeBundle(useProjectStore.getState(),'修改文案','target').content;
  if(change==='removed')store.removeProjectDocument(doc.id);
  else store.upsertProjectDocument({...doc,...(change==='content'?{content:'新需求：确认后必须审批'}:change==='disabled'?{enabled:false}:{sourceFingerprint:'stale-source'}),updatedAt:2});
  expect(knowledgeFingerprint(useProjectStore.getState())).toBe(before);expect(before).toBe(initialBase);
  expect(buildProjectKnowledgeBundle(useProjectStore.getState(),'修改文案','target').content).not.toBe(context);
  const history=useHistoryStore.getState().past.length;store.refreshStagedRender();store.setStagedRenderQuality(store.getStagedRenderContextKey(),clean);
  expect(store.isStagedTaskCurrent()).toBe(false);expect(store.getStagedDeliveryReport().status).toBe('blocked');
  expect(await store.adoptStagedChange()).toBe(false);expect(useHistoryStore.getState().past).toHaveLength(history);expect(useProjectStore.getState().screens.target.htmlContent).toBe(baseline);
 });
 test('a fresh mobile render cannot let an old candidate overwrite a manually changed navigation title',async()=>{
  const store=useProjectStore.getState();store.initNewProject({name:'导航失效',deviceProfile:'mobile',designSystem:neutralModernTheme,createSpecimen:false});
  store.addScreen({name:'页面',htmlContent:baseline,metadata:{navigationTitle:'原导航'},position:{x:0,y:0}},'target');
  stage('<header class="appbar"><span class="appbar-title">候选旧导航</span></header>'+candidate);
  expect(useProjectStore.getState().stagedScreen!.navigationTitle).toBe('候选旧导航');const before=knowledgeFingerprint(useProjectStore.getState());
  store.updateScreen('target',{metadata:{...useProjectStore.getState().screens.target.metadata,navigationTitle:'人工新导航'}});
  expect(knowledgeFingerprint(useProjectStore.getState())).toBe(before);const history=useHistoryStore.getState().past.length;
  store.setStagedRenderQuality(store.getStagedRenderContextKey(),clean);expect(store.isStagedTaskCurrent()).toBe(false);
  expect(await store.adoptStagedChange()).toBe(false);expect(useProjectStore.getState().screens.target.metadata!.navigationTitle).toBe('人工新导航');
  expect(useHistoryStore.getState().past).toHaveLength(history);
 });

 for(const bad of [undefined,'bad',null,42] as const)test(`restored complete-input binding ${String(bad)} cannot be repaired by fresh reports`,async()=>{
  stage();let store=useProjectStore.getState();const id=store.id;
  await loadStagedCandidate(id);for(let i=0;i<50&&!useProjectStore.getState().stagedProjectAssetAudit;i++)await new Promise(r=>setTimeout(r,1));
  const saved=structuredClone((await loadStagedCandidate(id))!);if(bad===undefined)delete saved.inputContextFingerprint;else (saved as any).inputContextFingerprint=bad;
  await saveStagedCandidate(id,undefined,saved);const loaded=(await loadStagedCandidate(id))!;
  expect(loaded.newHtml).toBe(saved.newHtml);expect(loaded.inputContextFingerprint).toBe(bad);
  store.restoreStagedCandidate(loaded,id);store=useProjectStore.getState();const before=useHistoryStore.getState().past.length;
  store.refreshStagedRender();store.setStagedRenderQuality(store.getStagedRenderContextKey(),clean);
  for(const adopt of [store.adoptStagedChange,store.forceAdoptStagedChange,store.keepBothScreens])expect(await adopt()).toBe(false);
  expect(useHistoryStore.getState().past).toHaveLength(before);expect(useProjectStore.getState().screens.target.htmlContent).toBe(baseline);
  expect(useProjectStore.getState().stagedScreen!.inputContextFingerprint).toBe(bad);
  expect((await loadStagedCandidate(id))!.inputContextFingerprint).toBe(bad);
 });
 test('complete input snapshot survives persistence, restore and fresh checks without being replaced',async()=>{
  stage();const store=useProjectStore.getState(),frozen=useProjectStore.getState().stagedScreen!.inputContextFingerprint;
  expect(frozen).toBe(pageCreationContext(useProjectStore.getState()));const loaded=(await loadStagedCandidate(store.id))!;expect(loaded.inputContextFingerprint).toBe(frozen);
  store.restoreStagedCandidate(loaded,store.id);store.refreshStagedRender();store.setStagedRenderQuality(store.getStagedRenderContextKey(),clean);
  expect(useProjectStore.getState().isStagedTaskCurrent()).toBe(true);expect(useProjectStore.getState().stagedScreen!.inputContextFingerprint).toBe(frozen);expect((await loadStagedCandidate(store.id))!.inputContextFingerprint).toBe(frozen);
 });
 for(const dependency of ['base-css','user-agent','pixel-ratio'] as const)test(`${dependency} changes only check evidence; same task gets a fresh passing report`,()=>{
  stage();const store=useProjectStore.getState(),candidate=JSON.stringify(store.stagedScreen),oldKey=store.getStagedRenderContextKey();
  store.setStagedRenderQuality(oldKey,clean);
  let reset:()=>void;
  if(dependency==='base-css'){const original=BaseCss.getBaseCss;const mock=spyOn(BaseCss,'getBaseCss').mockImplementation(profile=>original(profile)+'\n/* checker dependency update */');reset=()=>mock.mockRestore();}
  else{const object=dependency==='user-agent'?navigator:window,key=dependency==='user-agent'?'userAgent':'devicePixelRatio',descriptor=Object.getOwnPropertyDescriptor(object,key);
   Object.defineProperty(object,key,{configurable:true,value:dependency==='user-agent'?'Different test browser':9});reset=()=>{if(descriptor)Object.defineProperty(object,key,descriptor);else delete (object as any)[key];};}
  try{
   const key=store.getStagedRenderContextKey();expect(key).not.toBe(oldKey);expect(store.isStagedTaskCurrent()).toBe(true);expect(store.getStagedDeliveryReport().status).toBe('pending');
   store.setStagedRenderQuality(oldKey,{status:'unavailable',findings:[],inspected:0});expect(useProjectStore.getState().stagedRenderQuality!.key).toBe(oldKey);expect(useProjectStore.getState().stagedRenderQuality!.report).toEqual(clean);
   store.setStagedRenderQuality(key,clean);expect(store.getStagedDeliveryReport().status).toBe('ready');expect(JSON.stringify(useProjectStore.getState().stagedScreen)).toBe(candidate);
  }finally{reset!();}
 });

 test('selection, viewport transform and measured height do not change task or render identity',()=>{
  stage();const store=useProjectStore.getState(),key=store.getStagedRenderContextKey(),input=useProjectStore.getState().stagedScreen!.inputContextFingerprint;
  store.setActiveScreen(null);store.setViewportTransform({x:200,y:100,scale:0.5});store.updateScreen('target',{measuredHeight:1720});store.setActiveScreen('target');
  expect(store.isStagedTaskCurrent()).toBe(true);expect(store.getStagedRenderContextKey()).toBe(key);expect(useProjectStore.getState().stagedScreen!.inputContextFingerprint).toBe(input);
 });

 for(const removed of ['binding','contract','both'] as const)test(`removing ${removed} cannot downgrade a persisted modern candidate into legacy permission`,async()=>{
  stage();const store=useProjectStore.getState(),id=store.id;
  await loadStagedCandidate(id);for(let i=0;i<50&&!useProjectStore.getState().stagedProjectAssetAudit;i++)await new Promise(r=>setTimeout(r,1));
  const saved=structuredClone((await loadStagedCandidate(id))!);
  if(removed!=='contract')delete saved.taskBindingFingerprint;if(removed!=='binding')delete saved.workflowContract;
  await saveStagedCandidate(id,undefined,saved);const restored=(await loadStagedCandidate(id))!;store.restoreStagedCandidate(restored,id);
  store.setStagedRenderQuality(store.getStagedRenderContextKey(),clean);const past=useHistoryStore.getState().past.length;
  expect(store.isStagedTaskCurrent()).toBe(false);
  for(const adopt of [store.adoptStagedChange,store.forceAdoptStagedChange,store.keepBothScreens])expect(await adopt()).toBe(false);
  expect(useProjectStore.getState().screens.target.htmlContent).toBe(baseline);expect(useHistoryStore.getState().past).toHaveLength(past);
 });
 test('an explicitly staged no-contract candidate records that original absence rather than omitting its authority binding',async()=>{
  const store=useProjectStore.getState();store.stageScreenChange('target',candidate,'确定性候选');
  const saved=(await loadStagedCandidate(store.id))!;expect(saved.workflowContract).toBeUndefined();expect(saved.taskBindingFingerprint).toMatch(/^[a-f0-9]{8}$/);
  store.restoreStagedCandidate(saved,store.id);expect(store.isStagedTaskCurrent()).toBe(true);
 });

});
