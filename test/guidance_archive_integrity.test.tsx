import {afterEach,beforeEach,expect,spyOn,test} from 'bun:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {useProjectStore} from '../src/stores/useProjectStore';
import {useHistoryStore} from '../src/stores/useHistoryStore';
import {buildDesignTaskContract,buildRestyleContract,contentFingerprint} from '../src/services/ai/designWorkflow';
import {makeGuidancePacket,withGuidanceReceipts} from '../src/services/ai/designKnowledge/receipt';
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
import {DesignGuidanceCard} from '../src/components/chat/DesignGuidanceCard';
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
 const contract=kind==='single'?buildDesignTaskContract({intent:'modify_screen',request:'调整主按钮周围间距',target:s.screens.page,deviceProfile:'mobile',frameWidth:390,designSystem:s.designSystem}):
  buildRestyleContract({scope:'single',target,deviceProfile:'mobile',frameWidth:390,designSystem:s.designSystem});
 if(legacyIdentity){Object.assign(contract.designSystem!,{tokens:structuredClone(s.designSystem.tokens)});contract.designSystemOrigin=structuredClone(s.designSystemOrigin);}
 contract.designGuidance=makeGuidancePacket(contract,selectDesignRules({request:'主按钮',operation:contract.operation,device:'mobile',scope:'page',features:['button'],maxChars:1500}),'html');
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
 const ui=renderToStaticMarkup(<DesignGuidanceCard contract={source} historical/>);expect(ui).toContain('历史设计依据');expect(ui).toContain('返回完成');expect(ui).not.toContain(provider.apiKey);
 expect(record.status).toBe('applied');
});
for(const kind of ['single','restyle'] as const)for(const corrupt of ['scope','binding','cancelled','null','target','result','before'] as const)test(`${kind} rejects ${corrupt} archive sources on read and new prepare`,async()=>{
 const {record,path}=await archived(kind),s=useProjectStore.getState(),storage=createProjectStorage(s.id),copy=structuredClone(record) as any;
 const owner=kind==='single'?copy.candidate:copy.outcome,c=owner.workflowContract;
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
