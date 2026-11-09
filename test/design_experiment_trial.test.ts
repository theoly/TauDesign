import {test,expect,beforeEach,afterEach} from 'bun:test';
import {observeExperimentTransport,experimentCosts,runDesignExperimentTrial,type ExperimentRequestTrace} from '../scripts/lib/designExperimentTrial';
import {MockTransport} from '../src/services/ai/engine/transport/mockTransport';
import type {AITransport} from '../src/services/ai/engine/transport/types';
import {makeExperimentPlan,type ExperimentScenario} from '../src/services/ai/designKnowledge/experiment';
import {useProjectStore} from '../src/stores/useProjectStore';
import {useHistoryStore} from '../src/stores/useHistoryStore';
import {PageRenderCheck} from '../src/services/ai/pageRenderCheck';
import {loadStagedCandidate} from '../src/services/storage/candidateRepository';
const provider={id:'synthetic-trial',name:'Controlled only',protocol:'openai_compatible' as const,baseUrl:'https://invalid.example',apiKey:'fixture-private-credential-not-for-archive',isEnabled:true},binding={provider,model:'synthetic'};
const identity={providerId:provider.id,model:binding.model,providerFingerprint:'controlled',sourceFingerprint:'controlled',themeFingerprint:'controlled',checkerFingerprint:'controlled',budgetFingerprint:'controlled'};
const baseline='<main data-nid="root0001" class="col gap-4 p-4"><h1 data-nid="title001" class="text-xl">资料</h1><button data-nid="action01" class="btn btn-primary">保存</button></main>';
const scenarios:ExperimentScenario[]=Array.from({length:12},(_,i)=>({id:'s'+i,device:i%2?'pc':'mobile',kind:'create',request:'创建带保存按钮的资料页'}));
const functionalPlan={goal:'保存资料',actor:'示例用户',completion:['展示资料'],questions:[],features:[{id:'f1',title:'资料',change:'add',basis:'user',sourceIds:['user:request'],information:[{label:'资料',kind:'display'}],interactions:[{label:'保存',precondition:'已填写',outcome:'展示结果',targetScreenId:''}],states:[{name:'默认',condition:'进入页面',feedback:'可查看资料'}]}]};
let prior:ReturnType<typeof useProjectStore.getState>,history:ReturnType<typeof useHistoryStore.getState>;const originalInspect=PageRenderCheck.inspect;
beforeEach(()=>{prior=useProjectStore.getState();history=useHistoryStore.getState();PageRenderCheck.inspect=async(request,storage)=>{const {createRenderResourceSnapshot}=await import('../src/services/storage/renderResourceSnapshot');const {referencedProjectAssetPaths}=await import('../src/services/ai/projectAssetIntegrity');const snapshot=createRenderResourceSnapshot(storage);for(const path of referencedProjectAssetPaths(request.screen))await snapshot.storage.readBinary(path);return {status:'complete',inspected:3,findings:[],resourceFiles:await snapshot.files()};};});
afterEach(async()=>{const s=useProjectStore.getState();s.discardStagedChange();await loadStagedCandidate(s.id);PageRenderCheck.inspect=originalInspect;useProjectStore.setState(prior,true);useHistoryStore.setState(history,true);});
test('transport traces every call, retains raw deltas and takes cumulative usage only once',async()=>{
 const traces:ExperimentRequestTrace[]=[],mock=new MockTransport([{events:[{type:'Delta',text:'<think>reason</think>正文'},{type:'Usage',input_tokens:10,output_tokens:20},{type:'Usage',input_tokens:12,output_tokens:24},{type:'Done',finish_reason:'stop'}],delayMs:1}]);
 const observed=observeExperimentTransport(mock,traces,()=>{}),events:unknown[]=[];
 await observed.stream({provider,model:binding.model,messages:[{role:'user',content:'abc'}],generationOptions:{maxTokens:2048}},event=>events.push(event)).promise;
 expect(traces).toHaveLength(1);expect(traces[0].rawResponse).toContain('reason');expect(traces[0].finishedAt).toBeDefined();
 expect(experimentCosts(traces)).toEqual({inputTokens:12,outputTokens:24,usageEstimated:false,requests:1,requestedOutputTokens:2048});expect(events).toHaveLength(4);expect(JSON.stringify(traces)).not.toContain(provider.apiKey);
});
test('missing usage and a synchronous failed transport remain counted and estimated',()=>{
 const traces:ExperimentRequestTrace[]=[],bad:AITransport={id:'fail',stream(){throw Error('synthetic failure');}};
 expect(()=>observeExperimentTransport(bad,traces,()=>{}).stream({messages:[{role:'user',content:'1234567'}],generationOptions:{maxTokens:1800}},()=>{})).toThrow('synthetic failure');
 expect(experimentCosts(traces)).toEqual({inputTokens:2,outputTokens:0,usageEstimated:true,requests:1,requestedOutputTokens:1800});expect(traces[0].error).toBe('synthetic failure');
});
test('controlled trial uses real planning/pipeline/source/resource/commit paths; a synthetic render is explicitly test-only',async()=>{
 const plan=makeExperimentPlan(scenarios,42,identity),run=plan.runs.find(r=>r.mode==='baseline')!,mock=new MockTransport();mock.queueResponse(JSON.stringify(functionalPlan),1);mock.queueResponse('<artifact type="text/html" title="资料">'+baseline+'</artifact>',1);
 const result=await runDesignExperimentTrial(plan,run.id,binding,{transport:mock});
 expect(result.scope).toBe('controlled-transport');expect(result.record.status).toBe('passed');expect(result.record.firstPassed).toBe(true);expect(result.record.finalPassed).toBe(true);
 expect(result.requests).toHaveLength(2);expect(result.record.inputTokens).toBe(200);expect(result.record.outputTokens).toBe(100);expect(result.record.imageReady).toBe(false);
 expect(result.reports).toHaveLength(1);expect(result.screen?.metadata?.creationEvidence?.workflow.status).toBe('ready');expect(result.renderDocument).toContain('data-nid="action01"');expect(result.standaloneHtml).toBeDefined();expect(JSON.stringify(result)).not.toContain(provider.apiKey);
});
test('local trial uses the actual finite protocol, stages a copy and preserves the baseline',async()=>{
 const list=structuredClone(scenarios);list[0]={id:'local',device:'pc',kind:'local',request:'按钮文案改为“保存资料”',targetNid:'action01',baselineHtml:baseline};
 const plan=makeExperimentPlan(list,42,identity),run=plan.runs.find(r=>r.scenarioId==='local'&&r.mode==='baseline')!,mock=new MockTransport();mock.queueResponse(JSON.stringify({requiresPageRewrite:false,reason:'明确文案',operations:[{type:'set_text',nid:'action01',value:'保存资料'}]}),1);
 const result=await runDesignExperimentTrial(plan,run.id,binding,{transport:mock});expect(result.errorMessage).toBeUndefined();expect(result.record.finalPassed).toBe(true);expect(result.record.requests).toBe(1);
 expect(useProjectStore.getState().screens.baseline.htmlContent).toBe(baseline);expect(result.screen?.htmlContent).toContain('保存资料');expect(result.repairAttempted).toBe(false);
});
test('a model/protocol failure retains all costs and never becomes a successful page',async()=>{
 const plan=makeExperimentPlan(scenarios,42,identity),run=plan.runs[0],mock=new MockTransport();mock.queueResponse('not-json',1);mock.queueResponse('still-not-json',1);
 const result=await runDesignExperimentTrial(plan,run.id,binding,{transport:mock});expect(result.record.status).toBe('failed');expect(result.record.finalPassed).toBe(false);expect(result.record.requests).toBe(2);expect(result.record.outputTokens).toBe(100);expect(result.requests.map(r=>r.rawResponse)).toEqual(['not-json','still-not-json']);expect(result.record.imageReady).toBe(false);
});
test('a missing credential is supported and finished evidence is detached from late transport mutations',async()=>{
 const plan=makeExperimentPlan(scenarios,42,identity),run=plan.runs[0],keyless={provider:{...provider,apiKey:undefined as any},model:binding.model};let late!:(event:any)=>void;
 const transport:AITransport={id:'controlled-late',stream(_request,event){late=event;return {abort(){},promise:Promise.resolve().then(()=>{event({type:'Delta',text:'not-json'});event({type:'Done',finish_reason:'stop'});})};}};
 const result=await runDesignExperimentTrial(plan,run.id,keyless,{transport}),snapshot=JSON.stringify(result);
 late({type:'Delta',text:'late text'});expect(JSON.stringify(result)).toBe(snapshot);expect(result.record.measurementComplete).toBe(true);expect(result.record.requests).toBe(2);
});
test('a response echoing a private configuration value is quarantined and redacted before any archive',async()=>{
 const plan=makeExperimentPlan(scenarios,42,identity),run=plan.runs.find(r=>r.mode==='baseline')!,mock=new MockTransport();mock.queueResponse(JSON.stringify(functionalPlan),1);mock.queueResponse('<artifact type="text/html" title="资料">'+baseline.replace('资料',provider.apiKey)+'</artifact>',1);
 const result=await runDesignExperimentTrial(plan,run.id,binding,{transport:mock});expect(result.record.finalPassed).toBe(false);expect(result.errorMessage).toContain('quarantined');expect(JSON.stringify(result)).not.toContain(provider.apiKey);expect(result.reports).toHaveLength(0);expect(result.renderDocument).toBeUndefined();
});
test('a pre-cancelled trial records cancellation and does not send a model request',async()=>{
 const plan=makeExperimentPlan(scenarios,42,identity),abort=new AbortController();abort.abort();
 const result=await runDesignExperimentTrial(plan,plan.runs[0].id,binding,{transport:new MockTransport(),signal:abort.signal});expect(result.record.status).toBe('cancelled');expect(result.record.requests).toBe(0);expect(result.record.finalPassed).toBe(false);
});
test('foreign model binding is refused before changing the project',async()=>{
 const plan=makeExperimentPlan(scenarios,42,identity),id=useProjectStore.getState().id;
 await expect(runDesignExperimentTrial(plan,plan.runs[0].id,{...binding,model:'foreign'},{transport:new MockTransport()})).rejects.toThrow('identity');expect(useProjectStore.getState().id).toBe(id);
});
test('a provider account failure retains its actual HTTP status for the batch circuit breaker',async()=>{
 const traces:ExperimentRequestTrace[]=[],transport=new MockTransport([{events:[{type:'Error',kind:'network_error',http_status:402,message:'Insufficient Balance'}],delayMs:1}]);
 await observeExperimentTransport(transport,traces,()=>{}).stream({messages:[],generationOptions:{maxTokens:3072}} as any,()=>{}).promise;
 expect(traces).toHaveLength(1);expect(traces[0].httpStatus).toBe(402);expect(traces[0].error).toBe('Insufficient Balance');
});


test('trial prepares the same external icons as chat and embeds only export copies, not model/page payloads',async()=>{
 const {importedLucideSvg}=await import('../src/services/import/importLucideIcons');
 const svg=importedLucideSvg('check')!,bytes=new TextEncoder().encode(svg),hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
 const path=`assets/icons/${hash}.svg`,plan=makeExperimentPlan(scenarios,42,identity),run=plan.runs.find(r=>r.mode==='baseline')!,mock=new MockTransport();
 mock.queueResponse(JSON.stringify(functionalPlan),1);mock.queueResponse(`<artifact type="text/html" title="资料"><main class="col p-4"><h1>资料</h1><button class="btn btn-primary"><span class="icon icon-mask" style="mask-image:url(${path});-webkit-mask-image:url(${path})" aria-hidden="true"></span><span>保存</span></button></main></artifact>`,1);
 const result=await runDesignExperimentTrial(plan,run.id,binding,{transport:mock});
 expect(result.errorMessage).toBeUndefined(); expect(result.record.finalPassed).toBe(true);expect(result.requests).toHaveLength(2);expect(JSON.stringify(result.requests)).toContain(path);expect(JSON.stringify(result.requests)).not.toContain('data:image');
 expect(result.screen?.htmlContent).toContain(path);expect(result.screen?.htmlContent).not.toContain('data:image');expect(result.screen?.htmlContent).not.toContain('<path');
 expect(result.standaloneHtml).toContain('data:image/svg+xml;base64,');expect(result.renderDocument).toContain('data:image/svg+xml;base64,');
 expect(Object.values(useProjectStore.getState().assets).some(asset=>asset.relPath===path)).toBe(true);
});


test('local experiment externalizes frozen legacy graphics before either strategy, preserving the outer target and separate bytes',async()=>{
 const html='<main data-nid="root0001" class="col p-4"><h1>资料</h1><button data-nid="action01" class="btn btn-primary"><svg data-nid="icon0001" class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path data-nid="path0001" d="M5 12l4 4L19 6"/></svg><span data-nid="label001">保存</span></button></main>';
 const list=structuredClone(scenarios);list[0]={id:'local-svg',device:'mobile',kind:'local',request:'按钮文案改为“保存资料”',targetNid:'action01',baselineHtml:html};
 const plan=makeExperimentPlan(list,42,identity),run=plan.runs.find(r=>r.scenarioId==='local-svg'&&r.mode==='baseline')!,mock=new MockTransport();mock.queueResponse(JSON.stringify({requiresPageRewrite:false,reason:'明确文案',operations:[{type:'set_text',nid:'label001',value:'保存资料'}]}),1);
 const result=await runDesignExperimentTrial(plan,run.id,binding,{transport:mock});expect(result.errorMessage).toBeUndefined();expect(result.record.finalPassed).toBe(true);expect(result.record.requests).toBe(1);
 const original=useProjectStore.getState().screens.baseline.htmlContent,prepared=result.inputPreparation as any;
 (await import('../src/services/ai/externalMedia')).assertExternalMedia(original);expect(original).not.toContain('<path');expect(original).toContain('data-external-media="mask"');expect(original).toContain('data-nid="action01"');expect(original).toContain('>保存</span>');expect(result.screen?.htmlContent).toContain('保存资料');
 expect(prepared.kind).toBe('externalize-legacy-svg');expect(prepared.resourceFiles).toHaveLength(1);expect(prepared.removedNids).toEqual(['path0001']);expect(prepared.rawBaselineFingerprint).not.toBe(prepared.preparedBaselineFingerprint);
 expect(result.standaloneHtml).toContain('data:image/svg+xml;base64,');expect(plan.scenarios[0].baselineHtml).toBe(html);
 expect(JSON.stringify(result.requests)).not.toContain('<path');expect(JSON.stringify(prepared)).not.toContain('base64');
});
