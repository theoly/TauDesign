import {afterEach,beforeEach,describe,expect,spyOn,test} from 'bun:test';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {DesignRuleSafety,ruleSafetyIssue,taskRuleSafetyIssue} from '../src/services/ai/designKnowledge/safety';
import {DESIGN_RULE_CATALOG} from '../src/services/ai/designKnowledge/catalog';
import {selectDesignRules} from '../src/services/ai/designKnowledge/selector';
import {guidancePacketIssue,makeGuidancePacket,withGuidanceReceipts} from '../src/services/ai/designKnowledge/receipt';
import {captureDesignGuidanceHistory,readDesignGuidanceHistory} from '../src/services/ai/designKnowledge/history';
import {buildDesignTaskContract,buildRestyleContract} from '../src/services/ai/designWorkflow';
import {analyzeScreenModification,buildModificationReviewReceipt,isModificationReviewReceipt} from '../src/services/ai/modificationReview';
import {draftExecutionIssue} from '../src/services/ai/draftExecutionSource';
import {frozenRepairGuidance,repairGuidanceIssue} from '../src/services/ai/designKnowledge/repairTrace';
import {PageRenderCheck} from '../src/services/ai/pageRenderCheck';
import {prepareNewPage} from '../src/services/ai/pageCreationValidation';
import {prepareCheckedRestyle} from '../src/services/ai/restyleValidation';
import {acceptRestyleResult} from '../src/services/ai/restyleService';
import {buildRestyleDelivery} from '../src/services/storage/restyleDelivery';
import {RestyleDeliveryRepository} from '../src/services/storage/restyleDeliveryRepository';
import type {DesignExecutionRecord} from '../src/services/ai/designExecutionRecord';
import {proposeStyleRepair} from '../src/services/ai/controlledStyleRepair';
import {taskProvenanceIssue} from '../src/services/ai/taskProvenance';
import {resolveWorkflowValidation} from '../src/services/ai/workflowValidation';
import {DefaultAIEngineCore} from '../src/services/ai/engine/core/aiEngineCore';
import {MockTransport} from '../src/services/ai/engine/transport/mockTransport';
import {DesignGuidanceCard} from '../src/components/chat/DesignGuidanceCard';
import {useProjectStore} from '../src/stores/useProjectStore';
import {useHistoryStore} from '../src/stores/useHistoryStore';
import {neutralModernTheme} from '../src/utils/themePresets';
import {DeliveryRepository} from '../src/services/storage/deliveryRepository';
import {createProjectStorage} from '../src/services/storage/projectStorage';
import {makeFailedPageDraft,draftGuidanceIssue,repairDraftLabels} from '../src/services/ai/qualityDraft';
import {loadQualityDrafts,saveQualityDraft,claimDraftSuggestion} from '../src/services/storage/qualityDraftRepository';
import type {AIProviderConfig} from '../src/types/provider';

const query={request:'长正文',operation:'create' as const,device:'pc' as const,scope:'page' as const,maxChars:800};
const provider={id:'test-provider',protocol:'openai_compatible',baseUrl:'http://mock',apiKey:'not-persisted',models:[]} as unknown as AIProviderConfig;
const before='<main data-nid="root0001"><button data-nid="button01">提交</button></main>';
const after='<main data-nid="root0001"><button data-nid="button01">确认提交</button></main>';
const withdrawal={revision:'test-withdrawal',withdrawals:[{id:'LY-04',throughVersion:1,reason:'测试中模拟经审阅的撤回'}]};
function source(modify=false){
 const contract=buildDesignTaskContract({intent:modify?'modify_screen':'create_screen',request:'长正文',deviceProfile:'pc',frameWidth:1440,
  designSystem:neutralModernTheme,...(modify?{target:{id:'target',name:'页面',htmlContent:before}}:{})});
 contract.designGuidance=makeGuidancePacket(contract,selectDesignRules({...query,operation:modify?'modify':'create'}));
 expect(contract.designGuidance.selection.selected.map(s=>s.rule.id)).toContain('LY-04');
 return contract;
}
function completed(contract:ReturnType<typeof source>){
 const packet=contract.designGuidance!;
 packet.requests.push({requestId:`${contract.taskId}:request-1`,parentTaskId:contract.taskId,providerId:provider.id,model:'test',
  messageFingerprint:'1234abcd',injectedRuleIds:packet.selection.selected.map(s=>s.rule.id),outputProtocol:'stream-text',status:'completed'});
 return contract;
}
let policySpy:ReturnType<typeof spyOn<typeof DesignRuleSafety,'read'>>|undefined;
const withdraw=()=>{policySpy=spyOn(DesignRuleSafety,'read').mockReturnValue(withdrawal);};
afterEach(()=>{policySpy?.mockRestore();policySpy=undefined;});

test('bundled policy is empty and immutable until a reviewed application release changes it',()=>{
 expect(DesignRuleSafety.read().withdrawals).toEqual([]);
 expect(Object.isFrozen(DesignRuleSafety.read())).toBe(true);
 expect(Object.isFrozen(DesignRuleSafety.read().withdrawals)).toBe(true);
});
test('withdrawal matches only its ID and affected versions, including older versions',()=>{
 expect(ruleSafetyIssue([{id:'LY-04',version:1}],withdrawal)).toContain('已被安全撤回');
 expect(ruleSafetyIssue([{id:'LY-04',version:2}],withdrawal)).toBeUndefined();
 expect(ruleSafetyIssue([{id:'OTHER',version:1}],withdrawal)).toBeUndefined();
 expect(ruleSafetyIssue([{id:'LY-04',version:1}],{...withdrawal,withdrawals:[{...withdrawal.withdrawals[0],throughVersion:3}]})).toContain('安全撤回');
});
test('malformed application policy fails closed even for an empty selection',()=>{
 expect(ruleSafetyIssue([],{revision:'bad',withdrawals:[{id:'LY-04',throughVersion:NaN,reason:''}]})).toContain('策略无效');
});
test('new selections exclude withdrawn versions but allow reviewed fixed versions',()=>{
 const fixed=structuredClone(DESIGN_RULE_CATALOG);fixed.find(r=>r.id==='LY-04')!.version=2;
 withdraw();
 expect(selectDesignRules(query).selected.some(s=>s.rule.id==='LY-04')).toBe(false);
 expect(selectDesignRules(query,fixed).selected.find(s=>s.rule.id==='LY-04')?.rule.version).toBe(2);
});
test('ordinary catalog deprecation does not replace or invalidate a frozen active snapshot',()=>{
 const c=completed(source()),rule=DESIGN_RULE_CATALOG.find(r=>r.id==='LY-04')!,status=rule.status;
 try{rule.status='deprecated';expect(guidancePacketIssue(c)).toBeUndefined();expect(c.designGuidance!.selection.selected[0].rule.status).toBe('active');}
 finally{rule.status=status;}
});
test('project-supplied empty policy cannot override the trusted withdrawal, but history stays readable',()=>{
 const c=completed(source()),snapshot=JSON.stringify(c);Object.assign(c,{ruleSafetyPolicy:{revision:'fake',withdrawals:[]}});
 withdraw();expect(guidancePacketIssue(c)).toContain('安全撤回');expect(resolveWorkflowValidation(c,'create').ok).toBe(false);
 expect(guidancePacketIssue(c,true,'history')).toBeUndefined();expect(taskProvenanceIssue(c)).toBeUndefined();
 expect(JSON.stringify(c)).toContain(snapshot.slice(1,-1));
});
for(const protocol of ['stream','json'] as const)test(`${protocol} withdrawal before dispatch sends nothing and creates no receipt`,async()=>{
 const c=source(),transport=new MockTransport(),core=withGuidanceReceipts(new DefaultAIEngineCore(transport),c,c.designGuidance!);
 const options={provider,model:'test',messages:[{role:'system' as const,content:c.designGuidance!.selection.body}]};
 withdraw();
 if(protocol==='stream')expect(()=>core.streamText(options)).toThrow('安全撤回');
 else await expect(core.generateObject({},options)).rejects.toThrow('安全撤回');
 expect(transport.lastRequest).toBeUndefined();expect(c.designGuidance!.requests).toHaveLength(0);
});
for(const protocol of ['stream','json'] as const)test(`${protocol} withdrawal during a real core call rejects its late result while retaining the completed receipt`,async()=>{
 const c=source(),transport=new MockTransport();transport.queueResponse(protocol==='json'?'{}':'<main>内容</main>');
 const core=withGuidanceReceipts(new DefaultAIEngineCore(transport),c,c.designGuidance!);
 const options={provider,model:'test',messages:[{role:'system' as const,content:c.designGuidance!.selection.body}]};
 const pending=protocol==='json'?core.generateObject({},options):core.streamText(options).textPromise;
 expect(transport.lastRequest).toBeDefined();withdraw();
 await expect(pending).rejects.toThrow('安全撤回');
 expect(c.designGuidance!.requests).toHaveLength(1);expect(c.designGuidance!.requests[0].status).toBe('completed');
 expect(guidancePacketIssue(c,true,'history')).toBeUndefined();
});
test('historical chat and guidance card retain exact withdrawn rules and explain the execution restriction',()=>{
 const c=completed(source()),history=captureDesignGuidanceHistory(c,c.request)!;withdraw();
 const loaded=readDesignGuidanceHistory(history,c.request);expect(loaded?.contract.designGuidance).toEqual(c.designGuidance);
 const host=document.createElement('div');document.body.appendChild(host);const root=createRoot(host);
 try{act(()=>root.render(<DesignGuidanceCard contract={loaded!.contract} historical/>));
  expect(host.querySelector('[aria-label="历史设计依据"]')).not.toBeNull();
  expect(host.textContent).toContain('LY-04@1');expect(host.textContent).toContain('安全撤回');expect(host.textContent).toContain('不能继续执行或采纳');
 }finally{act(()=>root.unmount());host.remove();}
});
test('withdrawn draft remains recoverable, but local label repair and AI suggestion authorization are blocked',async()=>{
 const c=completed(source()),draft=makeFailedPageDraft('<main><button></button></main>','context','binding',{})!;
 draft.sourceTaskId=c.taskId;draft.guidanceSource=c;
 const id=`project-${crypto.randomUUID()}`,saved={version:1 as const,id:`draft-${crypto.randomUUID()}`,projectId:id,createdAt:1,draft,request:c.request,projectContext:'context',
  decision:{action:'create_screen' as const,targetScreenId:null,styleReferenceScreenId:null,elementNid:null,referenceSource:null,reason:'test'},status:'blocked' as const};
 await saveQualityDraft(saved);withdraw();
 expect((await loadQualityDrafts(id))[0].draft.guidanceSource).toEqual(c);
 expect(draftGuidanceIssue(draft)).toContain('安全撤回');
 expect(()=>repairDraftLabels(draft,[{nid:'irrelevant',text:'确认'}])).toThrow('安全撤回');
 expect(await claimDraftSuggestion(saved)).toBe(false);
});
test('zero-request local repair retains readable history but cannot use withdrawn generation provenance',()=>{
 const c=completed(source()),record:DesignExecutionRecord={source:'local-edit',rawResponse:'',completeHtml:after,continuationCount:0,warnings:[],
  draftRepair:{sourceFingerprint:'1234abcd',sourceTaskId:c.taskId,confirmedLabels:[{nid:'button01',text:'确认提交'}],historicalGuidanceSource:c}};
 expect(draftExecutionIssue(record,after)).toBeUndefined();withdraw();
 expect(draftExecutionIssue(record,after)).toContain('安全撤回');expect(draftExecutionIssue(record,after,'history')).toBeUndefined();
});
test('style repair inherits all parent withdrawal restrictions, including rules omitted from its short prompt',()=>{
 const c=completed(source()),adapted=frozenRepairGuidance(c,{tokens:':root{--space:1px}'})!;
 expect(adapted.trace.injectedRuleIds).toEqual([]);expect(adapted.trace.omittedRuleIds).toContain('LY-04');withdraw();
 expect(repairGuidanceIssue(adapted.trace,c)).toContain('安全撤回');
 expect(repairGuidanceIssue(adapted.trace,c,false,'history')).toBeUndefined();
 expect(()=>frozenRepairGuidance(c,{tokens:':root{--space:1px}'})).toThrow('安全撤回');
});
test('confirmed analysis remains historical evidence but cannot authorize a new modification after withdrawal',async()=>{
 const transport=new MockTransport();transport.queueResponse(JSON.stringify({summary:'长正文需要优化',items:[{title:'优化间距',reason:'正文拥挤',change:'增加正文间距',scope:'page',operations:[]}]}));
 const analysis=await analyzeScreenModification(new DefaultAIEngineCore(transport),{provider,model:'test',html:before,name:'页面',request:'优化长正文',
  designSystem:neutralModernTheme,mode:'light',deviceProfile:'pc',frameWidth:1440,contextualGuidance:{features:['long-copy']}});
 expect(analysis.workflowContract!.designGuidance!.selection.selected.map(s=>s.rule.id)).toContain('LY-04');
 const selected=[analysis.items[0].id];
 const receipt=buildModificationReviewReceipt(analysis,selected,'',{id:analysis.evidence!.targetId,htmlContent:before});
 expect(isModificationReviewReceipt(receipt)).toBe(true);
 const next=source(true);delete next.designGuidance;next.modificationReview=receipt;
 const frozen=JSON.stringify(receipt);
 withdraw();expect(isModificationReviewReceipt(receipt)).toBe(true);
 expect(()=>buildModificationReviewReceipt(analysis,selected,'',{id:analysis.evidence!.targetId,htmlContent:before})).toThrow('分析证据');
 expect(taskRuleSafetyIssue(next)).toContain('安全撤回');expect(resolveWorkflowValidation(next,'candidate').ok).toBe(false);
 expect(JSON.stringify(receipt)).toBe(frozen);
});

describe('candidate and delivery safety lifecycle',()=>{
 let priorProject:ReturnType<typeof useProjectStore.getState>,priorHistory:ReturnType<typeof useHistoryStore.getState>;
 beforeEach(()=>{
  priorProject=useProjectStore.getState();priorHistory=useHistoryStore.getState();
  const store=useProjectStore.getState();store.initNewProject({name:'撤回验收',deviceProfile:'pc',designSystem:neutralModernTheme,createSpecimen:false});
  store.addScreen({name:'页面',htmlContent:before,position:{x:0,y:0}},'target');
 });
 afterEach(()=>{useProjectStore.getState().discardStagedChange();useProjectStore.setState(priorProject,true);useHistoryStore.setState(priorHistory,true);});
 function stage(){const c=completed(source(true)),store=useProjectStore.getState();
  store.stageScreenChange('target',after,'新版','长正文',c);store.setStagedRenderQuality(store.getStagedRenderContextKey(),{status:'complete',findings:[],inspected:2});return c;}
 test('withdrawal blocks ordinary, forced and keep-both adoption without modifying pages',async()=>{
  stage();const store=useProjectStore.getState();expect(store.getStagedDeliveryReport().status).toBe('ready');withdraw();
  expect(store.isStagedTaskCurrent()).toBe(false);
  expect(await store.adoptStagedChange()).toBe(false);expect(await store.forceAdoptStagedChange()).toBe(false);expect(await store.keepBothScreens()).toBe(false);
  expect(useProjectStore.getState().screens.target.htmlContent).toBe(before);expect(useProjectStore.getState().screenOrder).toHaveLength(1);
 });
 test('withdrawal during async new-page render rejects the result before publication',async()=>{
  const c=completed(source()),store=useProjectStore.getState();
  const render=spyOn(PageRenderCheck,'inspect').mockImplementation(async()=>{withdraw();return {status:'complete',findings:[],inspected:2};});
  try{
   const result=await prepareNewPage(store,{id:'new',name:'新页',htmlContent:after,position:{x:0,y:0}},c,createProjectStorage(store.id),{isCurrent:()=>true});
   expect(render).toHaveBeenCalledTimes(1);expect(result.status).toBe('blocked');
   if(result.status==='blocked')expect(result.message).toContain('安全撤回');
   expect(useProjectStore.getState().screenOrder).toHaveLength(1);
  }finally{render.mockRestore();}
 });
 test('withdrawn parent cannot request a controlled style repair',async()=>{
  const c=completed(source()),store=useProjectStore.getState(),transport=new MockTransport();withdraw();
  const result=await proposeStyleRepair({state:store,html:after,contract:c,context:'test',render:{status:'complete',inspected:2,
   findings:[{code:'render_action_zero_size',severity:'error',nid:'button01',message:'按钮零尺寸'}]}},
   {isCurrent:()=>true,model:{core:new DefaultAIEngineCore(transport),provider,model:'test'}});
  expect(result.status).toBe('blocked');if(result.status!=='proposed')expect(result.message).toContain('安全撤回');
  expect(transport.lastRequest).toBeUndefined();expect(c.designGuidance!.requests).toHaveLength(1);
 });
 test('restyle archives preserve withdrawn provenance while new prepare and async validation reject it',async()=>{
  const store=useProjectStore.getState(),target={id:'target',name:'页面',kind:'screen' as const,html:before};
  const c=buildRestyleContract({scope:'single',target,deviceProfile:'pc',frameWidth:1440,designSystem:neutralModernTheme});
  c.designGuidance=makeGuidancePacket(c,selectDesignRules({...query,operation:'restyle'}),'html');completed(c);
  const outcome=acceptRestyleResult(target,before.replace('<main ','<main class="p-4" '),{},c),storage=createProjectStorage(store.id);
  const render=spyOn(PageRenderCheck,'inspect').mockResolvedValue({status:'complete',findings:[],inspected:2});
  try{
   const plan=await prepareCheckedRestyle(store,outcome,storage,{contextKey:'test',isCurrent:()=>true});expect(plan.validation.status).toBe('passed');
   const record=buildRestyleDelivery(store,outcome,plan),repo=new RestyleDeliveryRepository(storage,store.id);await repo.prepare(record);
   withdraw();expect((await repo.get(record.id))?.outcome.workflowContract).toEqual(c);await repo.finish(record,'applied');
   expect((await repo.list()).invalidFiles).toBe(0);
   await expect(repo.prepare({...record,id:`restyle-${crypto.randomUUID()}`})).rejects.toThrow('快照不完整');
   const denied=await prepareCheckedRestyle(store,outcome,storage,{contextKey:'test',isCurrent:()=>true});
   expect(denied.validation.status).toBe('blocked');expect(denied.validation.message).toContain('安全撤回');
  }finally{render.mockRestore();}
 });
 test('applied history remains readable and finishable after withdrawal; a new prepare is refused',async()=>{
  stage();const store=useProjectStore.getState();expect(await store.adoptStagedChange()).toBe(true);
  const repo=new DeliveryRepository(createProjectStorage(store.id),store.id),record=(await repo.listForScreen('target')).records[0];
  expect(record).toBeDefined();withdraw();
  expect((await repo.get('target',record.id))?.status).toBe('applied');expect((await repo.listForScreen('target')).invalidFiles).toBe(0);
  await repo.finish(record,'applied');
  await expect(repo.prepare({...record,id:`delivery-${crypto.randomUUID()}`,status:'prepared'})).rejects.toThrow('快照不完整');
  expect(useProjectStore.getState().screens.target.htmlContent).toBe(after);
  useHistoryStore.getState().undo();expect(useProjectStore.getState().screens.target.htmlContent).toBe(before);
  useHistoryStore.getState().redo();expect(useProjectStore.getState().screens.target.htmlContent).toBe(after);
 });
});
