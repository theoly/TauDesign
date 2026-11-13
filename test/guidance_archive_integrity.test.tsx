import {saveQualityDraft,loadQualityDrafts,claimDraftSuggestion} from '../src/services/storage/qualityDraftRepository';
import {makeFailedPageDraft} from '../src/services/ai/qualityDraft';
import {migrateProjectBundle} from '../src/services/storage/projectBundleMigration';
import {ProjectRepository} from '../src/services/storage/projectRepository';
import {ConversationStore} from '../src/services/storage/conversationStore';
import {LocalStorageStorage} from '../src/services/storage/projectStorage';
import {serializeHistory,parseHistory} from '../src/services/storage/historyRepository';
import {readProject} from '../src/utils/projectRegistry';
import * as storageModule from '../src/services/storage/projectStorage';
import {captureDesignGuidanceHistory,readDesignGuidanceHistory} from '../src/services/ai/designKnowledge/history';
import {isPageCreationEvidence} from '../src/services/ai/pageCreationValidation';
import {CanvasToolExecutor} from '../src/services/tools/canvasToolExecutor';
import {ruleFingerprint} from '../src/services/ai/designKnowledge/selector';
import type {RepairGuidanceTrace} from '../src/services/ai/designKnowledge/repairTrace';
import {afterEach,beforeEach,expect,spyOn,test} from 'bun:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {useProjectStore} from '../src/stores/useProjectStore';
import {useHistoryStore} from '../src/stores/useHistoryStore';
import {buildDesignTaskContract,buildRestyleContract,contentFingerprint} from '../src/services/ai/designWorkflow';
import {makeGuidancePacket,withGuidanceReceipts,guidancePacketIssue} from '../src/services/ai/designKnowledge/receipt';
import {selectDesignRules} from '../src/services/ai/designKnowledge/selector';
import {DefaultAIEngineCore} from '../src/services/ai/engine/core/aiEngineCore';
import {MockTransport} from '../src/services/ai/engine/transport/mockTransport';
import {PageRenderCheck} from '../src/services/ai/pageRenderCheck';
import {DeliveryPreviewCapture} from '../src/services/storage/deliveryPreview';
import {PagePreviewCapture} from '../src/services/storage/pagePreview';
import {DeliveryRepository} from '../src/services/storage/deliveryRepository';
import {RestyleDeliveryRepository} from '../src/services/storage/restyleDeliveryRepository';
import {createProjectStorage} from '../src/services/storage/projectStorage';
import {acceptRestyleResult} from '../src/services/ai/restyleService';
import {loadStagedCandidate} from '../src/services/storage/candidateRepository';
import {DesignGuidanceCard,RepairGuidanceSource} from '../src/components/chat/DesignGuidanceCard';
const html='<main data-nid="root" class="p-4"><button data-nid="action" class="btn btn-primary">保存资料</button></main>',after=html.replace('p-4','p-6');
const provider={id:'fixture',name:'fixture',protocol:'openai_compatible' as const,baseUrl:'https://invalid.test',apiKey:'ARCHIVE_PRIVATE_KEY'};
let prior:ReturnType<typeof useProjectStore.getState>,history:ReturnType<typeof useHistoryStore.getState>,render:ReturnType<typeof spyOn>,capture:ReturnType<typeof spyOn>,pageCapture:ReturnType<typeof spyOn>;
beforeEach(()=>{
 prior=useProjectStore.getState();history=useHistoryStore.getState();const s=useProjectStore.getState();s.initNewProject({name:'来源归档',deviceProfile:'mobile',createSpecimen:false});s.addScreen({name:'资料',htmlContent:html},'page');
 render=spyOn(PageRenderCheck,'inspect').mockResolvedValue({status:'complete',findings:[],inspected:2});
 capture=spyOn(DeliveryPreviewCapture,'capture').mockImplementation(async r=>({status:'failed',scope:'first-screen',capturedAt:Date.now(),candidateFingerprint:r.resultFingerprint,contextFingerprint:'test',reason:'fixture'}));
 pageCapture=spyOn(PagePreviewCapture,'capture').mockImplementation(async r=>({status:'failed',scope:'first-screen',capturedAt:Date.now(),candidateFingerprint:r.candidateFingerprint,contextFingerprint:r.contextFingerprint,reason:'fixture'}));
});
afterEach(()=>{render.mockRestore();capture.mockRestore();pageCapture.mockRestore();useProjectStore.setState(prior,true);useHistoryStore.setState(history,true);});
async function archived(kind:'single'|'restyle',legacyIdentity=false){
 const s=useProjectStore.getState(),target={kind:'screen' as const,id:'page',name:'资料',html};
 const contract=kind==='single'?buildDesignTaskContract({intent:'modify_screen',request:'调整主按钮周围间距',target:s.screens.page,deviceProfile:s.settings.deviceProfile,frameWidth:s.settings.frameWidth,designSystem:s.designSystem}):
  buildRestyleContract({scope:'single',target,deviceProfile:s.settings.deviceProfile,frameWidth:s.settings.frameWidth,designSystem:s.designSystem});
 if(legacyIdentity){Object.assign(contract.designSystem!,{tokens:structuredClone(s.designSystem.tokens)});contract.designSystemOrigin=structuredClone(s.designSystemOrigin);}
 contract.designGuidance=makeGuidancePacket(contract,selectDesignRules({request:'主按钮',operation:contract.operation,device:s.settings.deviceProfile,scope:'page',features:['button'],maxChars:1500}),'html');
 const t=new MockTransport();t.queueResponse(after);await withGuidanceReceipts(new DefaultAIEngineCore(t),contract,contract.designGuidance).streamText({provider,model:'fixture',messages:[{role:'system',content:contract.designGuidance.selection.body}]}).textPromise;
 if(kind==='single'){
  s.stageScreenChange('page',after,'资料',contract.request,contract);s.setStagedRenderQuality(s.getStagedRenderContextKey(),{status:'complete',findings:[],inspected:2});expect(await s.adoptStagedChange()).toBe(true);
  const repo=new DeliveryRepository(createProjectStorage(s.id),s.id),record=(await repo.listForScreen('page')).records[0];return {contract,record,repo,path:`deliveries/screen-${contentFingerprint('page')}/${record.id}.json`};
 }
 expect((await s.applyRestyleOutcome(acceptRestyleResult(target,after,{},contract))).applied).toBe(true);
 const repo=new RestyleDeliveryRepository(createProjectStorage(s.id),s.id),record=(await repo.list()).records[0];return {contract,record,repo,path:`deliveries/restyle/${record.id}.json`};
}
for(const kind of ['single','restyle'] as const)test(`${kind} frozen sources roundtrip and remain readable after unrelated current-page edits`,async()=>{
 const {record,contract,path}=await archived(kind),s=useProjectStore.getState(),storage=createProjectStorage(s.id);
 const loaded=JSON.parse((await storage.readText(path))!),source=kind==='single'?loaded.candidate.workflowContract:loaded.outcome.workflowContract;
 expect(source).toEqual(contract);expect(JSON.stringify(source)).not.toContain(provider.apiKey);s.updateScreen('page',{htmlContent:after.replace('资料','后续资料')});
 const list=kind==='single'?await new DeliveryRepository(storage,s.id).listForScreen('page'):await new RestyleDeliveryRepository(storage,s.id).list();expect(list.records).toHaveLength(1);expect(list.invalidFiles).toBe(0);
 const ui=renderToStaticMarkup(<DesignGuidanceCard contract={source} historical/>);expect(ui).toContain('历史设计依据');expect(ui).toContain('已收到回复');expect(ui).not.toContain(provider.apiKey);
 expect(record.status).toBe('applied');
});
for(const kind of ['single','restyle'] as const)for(const corrupt of ['scope','binding','cancelled','null','target','result','before','request-task','request-index'] as const)test(`${kind} rejects ${corrupt} archive sources on read and new prepare`,async()=>{
 const {record,path}=await archived(kind),s=useProjectStore.getState(),storage=createProjectStorage(s.id),copy=structuredClone(record) as any;
 const owner=kind==='single'?copy.candidate:copy.outcome,c=owner.workflowContract;
 if(corrupt==='request-task')c.designGuidance.requests[0].requestId='foreign-task:request-1';if(corrupt==='request-index')c.designGuidance.requests[0].requestId=`${c.taskId}:request-9`;
 if(corrupt==='scope')c.allowedChanges=['screen:outside'];if(corrupt==='binding')c.designGuidance.bindingFingerprint='12345678';if(corrupt==='cancelled')c.designGuidance.requests[0].status='cancelled';if(corrupt==='null')owner.workflowContract=null;if(corrupt==='target')c.target.id='other';
 if(corrupt==='result'){if(kind==='single'){copy.after.htmlContent+='<p>不相干结果</p>';copy.resultFingerprint=contentFingerprint(copy.after.htmlContent);}else{copy.pages[0].after.htmlContent+='<p>不相干结果</p>';copy.validation.pages[0].candidateFingerprint=contentFingerprint(copy.pages[0].after.htmlContent);}}
 if(corrupt==='before'){if(kind==='single')copy.before.htmlContent+='<p>不相干基线</p>';else copy.pages[0].before.htmlContent+='<p>不相干基线</p>';}

 await storage.writeTextAtomic(path,JSON.stringify(copy));const listed=kind==='single'?await new DeliveryRepository(storage,s.id).listForScreen('page'):await new RestyleDeliveryRepository(storage,s.id).list();
 expect(listed.records).toHaveLength(0);expect(listed.invalidFiles).toBe(1);copy.status='prepared';copy.id=kind==='single'?'delivery-forged':'restyle-forged';
 if(kind==='single'){await expect(new DeliveryRepository(storage,s.id).prepare(copy)).rejects.toThrow();await expect(new DeliveryRepository(storage,s.id).finish(copy,'applied')).rejects.toThrow();}else{await expect(new RestyleDeliveryRepository(storage,s.id).prepare(copy)).rejects.toThrow();await expect(new RestyleDeliveryRepository(storage,s.id).finish(copy,'applied')).rejects.toThrow();}
 expect(useProjectStore.getState().screens.page.htmlContent).toBe(after);
});
test('candidate repository preserves malformed new contracts for diagnostics and live adoption rejects them instead of downgrading',async()=>{
 const s=useProjectStore.getState();s.stageScreenChange('page',after,'资料','调整间距');const original=useProjectStore.getState().stagedScreen!;
 s.stageScreenChange('page',after,'资料','调整间距',null as any);const restored=(await loadStagedCandidate(s.id))!;expect(restored.workflowContract as any).toBeNull();
 useProjectStore.setState({stagedScreen:restored});s.setStagedRenderQuality(s.getStagedRenderContextKey(),{status:'complete',findings:[],inspected:2});expect(s.getStagedDeliveryReport().status).toBe('blocked');expect(await s.adoptStagedChange()).toBe(false);
 expect(useProjectStore.getState().screens.page.htmlContent).toBe(html);
 useProjectStore.setState({stagedScreen:original});s.setStagedRenderQuality(s.getStagedRenderContextKey(),{status:'complete',findings:[],inspected:2});expect(s.getStagedDeliveryReport().status).toBe('ready');
});

for(const kind of ['single','restyle'] as const)test(`${kind} retains already-frozen legacy full-theme source without rewriting its identity`,async()=>{
 const {contract,record,path}=await archived(kind,true),s=useProjectStore.getState(),storage=createProjectStorage(s.id),raw=JSON.parse((await storage.readText(path))!);
 const saved=kind==='single'?raw.candidate.workflowContract:raw.outcome.workflowContract;
 expect(saved).toEqual(contract);expect(saved.designSystem.tokens).toEqual(s.designSystem.tokens);
 const list=kind==='single'?await new DeliveryRepository(storage,s.id).listForScreen('page'):await new RestyleDeliveryRepository(storage,s.id).list();expect(list.records).toHaveLength(1);expect(list.invalidFiles).toBe(0);expect(record.status).toBe('applied');
});

test('a repair selection with no call receipt is displayed as assembled rather than actually injected',async()=>{
 const {contract}=await archived('single'),packet=contract.designGuidance!;
 const trace:RepairGuidanceTrace={version:1,parentTaskId:contract.taskId,parentBindingFingerprint:packet.bindingFingerprint,parentSelectionFingerprint:ruleFingerprint(packet.selection),injectedRuleIds:packet.selection.selected.map(s=>s.rule.id),omittedRuleIds:[],requests:[]};
 expect(trace.injectedRuleIds.length).toBeGreaterThan(0);const ui=renderToStaticMarkup(<RepairGuidanceSource trace={trace}/>);
 expect(ui).not.toContain('实际注入');expect(ui).toContain('尚未记录实际请求');
});

function repairTrace(contract:ReturnType<typeof buildDesignTaskContract>):RepairGuidanceTrace{
 const packet=contract.designGuidance!;return {version:1,parentTaskId:contract.taskId,parentBindingFingerprint:packet.bindingFingerprint,parentSelectionFingerprint:ruleFingerprint(packet.selection),injectedRuleIds:packet.selection.selected.map(s=>s.rule.id),omittedRuleIds:[],requests:[]};
}
for(const status of ['assembled','dispatched','completed','failed','cancelled'] as const)test(`repair source keeps ${status} separate from assembly and acceptance`,async()=>{
 const {contract}=await archived('single'),trace=repairTrace(contract);
 trace.requests=[{requestId:`${contract.taskId}:style-repair:request-1`,parentTaskId:contract.taskId,providerId:'fixture',model:'fixture',messageFingerprint:'12345678',outputProtocol:'stream-text',injectedRuleIds:[...trace.injectedRuleIds],status}];
 const ui=renderToStaticMarkup(<RepairGuidanceSource trace={trace}/>);
 expect(ui).toContain('本次准备');expect(ui).toContain(`修复请求尝试 ${status==='assembled'?0:1} 次`);expect(ui).toContain('不保证 AI 服务已收到');
 expect(ui.includes('请求中包含')).toBe(status!=='assembled');expect(ui.includes('尚未记录实际请求')).toBe(status==='assembled');
});
test('a completed repair with every rule omitted records one call and zero rule inputs',async()=>{
 const {contract}=await archived('single'),trace=repairTrace(contract);trace.omittedRuleIds=[...trace.injectedRuleIds];trace.injectedRuleIds=[];
 trace.requests=[{requestId:`${contract.taskId}:style-repair:request-1`,parentTaskId:contract.taskId,providerId:'fixture',model:'fixture',messageFingerprint:'12345678',outputProtocol:'stream-text',injectedRuleIds:[],status:'completed'}];
 const ui=renderToStaticMarkup(<RepairGuidanceSource trace={trace}/>);expect(ui).toContain('请求中包含 0 条规则');expect(ui).toContain('修复请求尝试 1 次');expect(ui).not.toContain('尚未记录实际请求');
});
test('legacy generated IDs without outputProtocol remain readable without inventing the missing field',async()=>{
 const {contract}=await archived('single');delete contract.designGuidance!.requests[0].outputProtocol;
 const saved=captureDesignGuidanceHistory(contract,contract.request),restored=readDesignGuidanceHistory(saved,contract.request);
 expect(restored).toBeDefined();expect(restored!.contract.designGuidance!.requests[0].outputProtocol).toBeUndefined();expect(restored!.contract.designGuidance!.requests[0].requestId).toBe(`${contract.taskId}:request-1`);
});
for(const kind of ['foreign','skipped','repair'] as const)test(`read-only history does not upgrade ${kind} request identity`,async()=>{
 const {contract}=await archived('single');contract.designGuidance!.requests[0].requestId=kind==='foreign'?'another:request-1':kind==='skipped'?`${contract.taskId}:request-8`:`${contract.taskId}:style-repair:request-1`;
 expect(captureDesignGuidanceHistory(contract,contract.request)).toBeUndefined();expect(readDesignGuidanceHistory({version:1,contract},contract.request)).toBeUndefined();
});
async function tracedContract(operation:'create'|'modify'){
 const s=useProjectStore.getState(),request=operation==='create'?'创建资料页':'调整主按钮周围间距';
 const contract=buildDesignTaskContract({intent:operation==='create'?'create_screen':'modify_screen',request,...(operation==='modify'?{target:s.screens.page}:{}),deviceProfile:'mobile',frameWidth:390,designSystem:s.designSystem});
 contract.designGuidance=makeGuidancePacket(contract,selectDesignRules({request,operation,device:'mobile',scope:'page',features:['button'],maxChars:1500}),'html');
 const transport=new MockTransport();transport.queueResponse(after);await withGuidanceReceipts(new DefaultAIEngineCore(transport),contract,contract.designGuidance).streamText({provider,model:'fixture',messages:[{role:'system',content:contract.designGuidance.selection.body}]}).textPromise;
 return contract;
}
test('new-page sidecars retain actual receipt IDs and reject an altered child identity',async()=>{
 const contract=await tracedContract('create'),result=await CanvasToolExecutor.executeAsync({tool:'create_screen',params:{title:'资料新页',html:after,workflowContract:contract}});
 expect(result.success).toBe(true);const evidence=useProjectStore.getState().screens[result.screenId!].metadata!.creationEvidence!;
 expect(isPageCreationEvidence(evidence)).toBe(true);expect(evidence.contract.designGuidance).toEqual(contract.designGuidance);
 const bad=structuredClone(evidence);bad.contract.designGuidance!.requests[0].requestId='foreign-task:request-1';expect(isPageCreationEvidence(bad)).toBe(false);
});
test('candidate roundtrip keeps a corrupt receipt for diagnostics and never grants adoption',async()=>{
 const contract=await tracedContract('modify'),s=useProjectStore.getState();s.stageScreenChange('page',after,'资料',contract.request,contract);let current=useProjectStore.getState();current.setStagedRenderQuality(current.getStagedRenderContextKey(),{status:'complete',findings:[],inspected:2});expect(current.getStagedDeliveryReport().status).toBe('ready');
 const bad=structuredClone(contract);bad.designGuidance!.requests[0].requestId='foreign-task:request-1';s.stageScreenChange('page',after,'资料',bad.request,bad);const restored=(await loadStagedCandidate(s.id))!;
 expect(restored.workflowContract!.designGuidance!.requests[0].requestId).toBe('foreign-task:request-1');current=useProjectStore.getState();current.setStagedRenderQuality(current.getStagedRenderContextKey(),{status:'complete',findings:[],inspected:2});expect(current.getStagedDeliveryReport().status).toBe('blocked');
 const before=useHistoryStore.getState().past.length;expect(await current.adoptStagedChange()).toBe(false);expect(useProjectStore.getState().screens.page.htmlContent).toBe(html);expect(useHistoryStore.getState().past).toHaveLength(before);
});

for(const status of ['assembled','dispatched','completed','failed','cancelled'] as const)test(`historical ${status} receipt is readable without claiming dispatch or execution success`,async()=>{
 const {contract}=await archived('single');contract.designGuidance!.requests[0].status=status;
 expect(Boolean(guidancePacketIssue(contract))).toBe(status!=='completed');
 const saved=captureDesignGuidanceHistory(contract,contract.request),restored=readDesignGuidanceHistory(saved,contract.request);expect(restored).toBeDefined();
 const ui=renderToStaticMarkup(<DesignGuidanceCard contract={restored!.contract} historical/>);
 expect(ui).toContain('请求记录 · 1 条');expect(ui.includes('已准备的输入')).toBe(status==='assembled');expect(ui).not.toContain('实际进入请求');expect(ui).not.toContain(provider.apiKey);
});

for(const device of ['mobile','pc'] as const)for(const kind of ['single','restyle'] as const)for(const legacy of [false,true])test(`${device} ${kind} ${legacy?'full-theme legacy':'current'} project and sidecars migrate unchanged, reopen as history and require fresh candidate checks`,async()=>{
 if(device==='pc'){const s=useProjectStore.getState();s.initNewProject({name:'PC来源归档',deviceProfile:'pc',createSpecimen:false});s.addScreen({name:'资料',htmlContent:html},'page');}
 const {contract,record,path}=await archived(kind,legacy),s=useProjectStore.getState(),source=createProjectStorage(s.id),target=new LocalStorageStorage(`compat-copy-${crypto.randomUUID()}`);
 const sourceHistory=captureDesignGuidanceHistory(contract,contract.request);expect(sourceHistory).toBeDefined();
 const conversation=new ConversationStore(source);await conversation.appendTurn({turnId:'compat',ts:Date.UTC(2026,10,2),user:{text:contract.request},assistant:{text:'原始来源会话',designGuidanceHistory:sourceHistory}});
 const createdContract=buildDesignTaskContract({intent:'create_screen',request:'创建主按钮资料页',deviceProfile:device,frameWidth:s.settings.frameWidth,designSystem:s.designSystem});
 if(legacy){Object.assign(createdContract.designSystem!,{tokens:structuredClone(s.designSystem.tokens)});createdContract.designSystemOrigin=structuredClone(s.designSystemOrigin);}
 createdContract.designGuidance=makeGuidancePacket(createdContract,selectDesignRules({request:createdContract.request,operation:'create',device,scope:'page',features:['button'],maxChars:1500}),'html');
 const transport=new MockTransport();transport.queueResponse(after);
 await withGuidanceReceipts(new DefaultAIEngineCore(transport),createdContract,createdContract.designGuidance).streamText({provider,model:'fixture',messages:[{role:'system',content:createdContract.designGuidance.selection.body}]}).textPromise;
 const created=await CanvasToolExecutor.executeAsync({tool:'create_screen',params:{title:'迁移新页',html:after,workflowContract:createdContract}});
 expect(created.success).toBe(true);const creation=structuredClone(useProjectStore.getState().screens[created.screenId!].metadata!.creationEvidence!);
 expect(isPageCreationEvidence(creation)).toBe(true);
 // A source-less old candidate remains source-less. Migration must not synthesize a task or render approval.
 s.stageScreenChange('page',html,'旧候选');
 for(let i=0;i<30&&!useProjectStore.getState().stagedProjectAssetAudit;i++)await new Promise(resolve=>setTimeout(resolve,0));
 expect(useProjectStore.getState().stagedProjectAssetAudit).not.toBeNull();await loadStagedCandidate(s.id);
 if(legacy){const raw=JSON.parse((await source.readText('candidates/current.json'))!);delete raw.candidate.candidateId;delete raw.candidate.validationEvidence;await source.writeTextAtomic('candidates/current.json',JSON.stringify(raw));}
 const draft=makeFailedPageDraft(after.replace('保存资料',''),'compat-draft-context','compat-model-binding',{deviceProfile:device,designSystem:s.designSystem})!;
 draft.guidanceSource=structuredClone(contract);draft.sourceTaskId=contract.taskId;
 const savedDraft={version:1 as const,id:`draft-${crypto.randomUUID()}`,projectId:s.id,createdAt:Date.now(),draft,request:contract.request,projectContext:'compat-draft-context',status:'blocked' as const,aiAttempted:true,
  decision:{action:'modify_screen' as const,targetScreenId:'page',styleReferenceScreenId:null,elementNid:null,referenceSource:null,reason:'历史失败草稿'}};
 await saveQualityDraft(savedDraft);
 const historyStore=useHistoryStore.getState(),historyRaw=serializeHistory(s.id,{past:historyStore.past,future:historyStore.future,checkpoints:historyStore.checkpoints},8*1024*1024);
 await useProjectStore.getState().saveProjectChecked();
 const sourceJson=readProject(s.id)!,snapshots=new Map<string,string>();
 for(const file of [path,`drafts/${savedDraft.id}.json`,'candidates/current.json','conversations/2026-11.jsonl','conversations/index.json'])snapshots.set(file,(await source.readText(file))!);
 const result=await migrateProjectBundle({sourceJson,source,target,historyRaw,checkCurrent:()=>{},readHistory:()=>historyRaw});
 expect(result.ok).toBe(true);expect(result.archiveFiles).toBeGreaterThanOrEqual(6);
 for(const [file,raw] of snapshots){expect(await target.readText(file)).toBe(raw);expect(await source.readText(file)).toBe(raw);}
 expect(await target.readText('history.json')).toBe(historyRaw);expect(readProject(s.id)).toBe(sourceJson);
 const project=(await new ProjectRepository(target).load())!;expect(project.screens.page.htmlContent).toBe(s.screens.page.htmlContent);expect(project.designSystem).toEqual(s.designSystem);
 const archivedAgain=kind==='single'?await new DeliveryRepository(target,s.id).get('page',record.id):await new RestyleDeliveryRepository(target,s.id).get(record.id);
 expect(archivedAgain).toEqual(record);
 const [turn]=await new ConversationStore(target).loadRecent();expect(readDesignGuidanceHistory(turn.assistant.designGuidanceHistory,turn.user.text)).toEqual(sourceHistory);
 const restored=readDesignGuidanceHistory(turn.assistant.designGuidanceHistory,turn.user.text)!;expect(restored.contract.designGuidance!.requests).toEqual(contract.designGuidance!.requests);
 expect(project.screens[created.screenId!].metadata).toEqual(useProjectStore.getState().screens[created.screenId!].metadata);
 expect(isPageCreationEvidence((project.screens[created.screenId!].metadata as any).creationEvidence)).toBe(true);
 s.loadProject(JSON.stringify(project));
 useHistoryStore.getState().restore(parseHistory(await target.readText('history.json'),s.id));
 useHistoryStore.getState().undo();expect(useProjectStore.getState().screens[created.screenId!]).toBeUndefined();
 useHistoryStore.getState().redo();expect(useProjectStore.getState().screens[created.screenId!].metadata!.creationEvidence).toEqual(creation);
 const mock=spyOn(storageModule,'createProjectStorage').mockReturnValue(target);
 try{
  const [restoredDraft]=await loadQualityDrafts(s.id);expect(restoredDraft).toEqual(savedDraft);expect(await claimDraftSuggestion(restoredDraft)).toBe(false);
  const candidate=(await loadStagedCandidate(s.id))!;expect(candidate.workflowContract).toBeUndefined();expect(candidate.repair).toBeUndefined();
  if(legacy){expect(candidate.candidateId).toBeUndefined();expect(candidate.validationEvidence).toBeUndefined();}
  expect(s.restoreStagedCandidate(candidate,s.id)).toBe(true);expect(useProjectStore.getState().stagedRenderQuality).toBeNull();
  expect(useProjectStore.getState().getStagedDeliveryReport().status).not.toBe('ready');const past=useHistoryStore.getState().past.length;
  expect(await s.adoptStagedChange()).toBe(false);expect(useHistoryStore.getState().past).toHaveLength(past);expect(useProjectStore.getState().screens.page.htmlContent).toBe(project.screens.page.htmlContent);
 }finally{mock.mockRestore();}
});
