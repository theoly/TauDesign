import {afterEach,beforeEach,describe,expect,spyOn,test} from 'bun:test';
import {useProjectStore} from '../src/stores/useProjectStore';
import {useHistoryStore} from '../src/stores/useHistoryStore';
import {buildDesignTaskContract} from '../src/services/ai/designWorkflow';
import {RenderEvidenceAuthority,taskInputBinding} from '../src/services/ai/evidenceIdentity';
import {loadStagedCandidate} from '../src/services/storage/candidateRepository';
import {neutralModernTheme} from '../src/utils/themePresets';

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
 function stage(){
  const store=useProjectStore.getState();
  const contract=buildDesignTaskContract({intent:'modify_screen',request:'修改文案',
   target:{id:'target',name:'页面',htmlContent:baseline},deviceProfile:'pc',frameWidth:1440,designSystem:neutralModernTheme});
  expect(contract.designGuidance).toBeUndefined();
  store.stageScreenChange('target',candidate,'新版','修改文案',contract);
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
});
