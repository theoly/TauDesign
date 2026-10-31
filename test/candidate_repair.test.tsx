import {makeGuidancePacket,withGuidanceReceipts} from '../src/services/ai/designKnowledge/receipt';
import {selectDesignRules} from '../src/services/ai/designKnowledge/selector';
import {isCandidateValidationEvidence} from '../src/services/ai/candidateValidation';
import {afterEach,beforeEach,expect,spyOn,test} from 'bun:test';
import React from 'react';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
import {createRoot,type Root} from 'react-dom/client';
import {act} from 'react';
import {useProjectStore} from '../src/stores/useProjectStore';
import {useHistoryStore} from '../src/stores/useHistoryStore';
import {neutralModernTheme} from '../src/utils/themePresets';
import {buildDesignTaskContract,buildRestyleContract} from '../src/services/ai/designWorkflow';
import {PageRenderCheck} from '../src/services/ai/pageRenderCheck';
import {DeliveryPreviewCapture} from '../src/services/storage/deliveryPreview';
import {loadStagedCandidate,saveStagedCandidate} from '../src/services/storage/candidateRepository';
import {createProjectStorage} from '../src/services/storage/projectStorage';
import {DeliveryRepository} from '../src/services/storage/deliveryRepository';
import {CandidateRepairControl,RepairReceipt} from '../src/components/canvas/CandidateRepairControl';
import {isPageRepairRecord} from '../src/services/ai/pageRepairRecord';
import * as CoreFactory from '../src/services/ai/engine/core';
import * as CandidateRepository from '../src/services/storage/candidateRepository';
import {useAIConfigStore} from '../src/stores/useAIConfigStore';
import {TaskBudget} from '../src/services/ai/taskBudget';
import * as BudgetPolicy from '../src/services/ai/taskBudgetPolicy';
import type {AIEngineCore,StreamTextOptions} from '../src/services/ai/engine/core/types';
const html='<main data-nid="root" class="col gap-4 p-4"><h1 data-nid="title">会员资料</h1><section data-nid="region"><button data-nid="save" class="btn btn-primary"><svg data-nid="icon" class="icon" viewBox="0 0 24 24"><path d="M1 1h8"/></svg><span data-nid="label">保存资料</span></button></section><button data-nid="other" class="btn">暂存</button></main>';
const broken=html.replace('data-nid="save"','style="font-size:0px" data-nid="save"');
const bad={status:'complete' as const,inspected:7,findings:[{code:'render_action_invisible_label',severity:'error' as const,nid:'save',message:'实际文案不可见',actual:'字号0',expected:'文案可见'}]};
const good={status:'complete' as const,inspected:7,findings:[]};
const provider={id:'fixture',name:'fixture',protocol:'openai_compatible',baseUrl:'https://invalid.local',apiKey:'SECRET_NEVER_STORE',isEnabled:true,models:[]} as any;
let prior:ReturnType<typeof useProjectStore.getState>,history:ReturnType<typeof useHistoryStore.getState>,calls:StreamTextOptions[],answer:string,renders:number,requests:any[],root:Root|undefined,host:HTMLDivElement;
const original=PageRenderCheck.inspect,preview=DeliveryPreviewCapture.capture;
const core:AIEngineCore={async generateObject(){throw Error('unexpected');},streamText(options){calls.push(options);const text=answer;return {textStream:(async function*(){yield text;})(),reasoningStream:(async function*(){})(),textPromise:Promise.resolve(text),reasoningPromise:Promise.resolve(undefined),usagePromise:Promise.resolve({inputTokens:123,outputTokens:45}),finishReasonPromise:Promise.resolve('stop'),abort(){}};}};
function stage(options:{scope?:string;local?:string[];legacy?:boolean;restyle?:boolean}={}){
 const s=useProjectStore.getState(),target=s.screens.page;
 const contract=options.restyle?buildRestyleContract({scope:'single',target:{id:'page',name:'会员资料',html},deviceProfile:'mobile',frameWidth:390,designSystem:s.designSystem}):buildDesignTaskContract({intent:'modify_screen',request:'调整保存按钮尺寸与字号',target,elementNid:options.scope??'region',deviceProfile:'mobile',frameWidth:390,designSystem:s.designSystem});
 s.stageScreenChange('page',broken,'会员资料',contract.request,options.legacy?undefined:contract,options.local?{source:'local-edit',rawResponse:'',completeHtml:broken,continuationCount:0,warnings:[],localEdit:{mode:'local',targetNids:options.local,operationCount:1}}:undefined);
 publish();
}
function publish(report=bad){const s=useProjectStore.getState();s.setStagedRenderQuality(s.getStagedRenderContextKey(),structuredClone(report));}
const run=(signal?:AbortSignal,engine=core)=>useProjectStore.getState().repairStagedCandidate({core:engine,provider,model:'fixture'},signal);
async function waitFor(fn:()=>boolean){for(let i=0;i<100&&!fn();i++)await new Promise(r=>setTimeout(r,2));expect(fn()).toBe(true);}
beforeEach(()=>{
 prior=useProjectStore.getState();history=useHistoryStore.getState();useProjectStore.getState().initNewProject({name:'候选一次修复',deviceProfile:'mobile',designSystem:neutralModernTheme,createSpecimen:false});
 useProjectStore.getState().addScreen({name:'会员资料',htmlContent:html},'page');calls=[];requests=[];renders=0;answer=JSON.stringify({operations:[{nid:'save',type:'remove_styles',value:'font-size'}]});
 PageRenderCheck.inspect=async request=>{requests.push(structuredClone(request));renders++;return structuredClone(request.screen.htmlContent.includes('font-size:0')?bad:good);};
 DeliveryPreviewCapture.capture=async record=>({status:'failed',scope:'first-screen',capturedAt:Date.now(),candidateFingerprint:record.resultFingerprint,contextFingerprint:'test',reason:'test'});
});
afterEach(()=>{if(root)act(()=>root!.unmount());root=undefined;host?.remove();PageRenderCheck.inspect=original;DeliveryPreviewCapture.capture=preview;useProjectStore.setState(prior,true);useHistoryStore.setState(history,true);});
test('显式调用只替换候选；保护正文/SVG/其它节点，复验后仍待实时iframe和用户采纳',async()=>{
 stage({local:['save']});const before=useHistoryStore.getState().past.length,old=useProjectStore.getState().stagedScreen!;
 expect(useProjectStore.getState().getStagedRepairEligibility().allowed).toBe(true);expect(await run()).toBe(true);
 const s=useProjectStore.getState(),candidate=s.stagedScreen!;expect(candidate.candidateId).not.toBe(old.candidateId);expect(s.screens.page.htmlContent).toBe(html);expect(useHistoryStore.getState().past.length).toBe(before);
 expect(calls).toHaveLength(1);expect(calls[0].maxTokens).toBe(1800);expect(renders).toBe(1);expect(candidate.repair).toMatchObject({status:'repaired',attempts:1,usage:{inputTokens:123,outputTokens:45}});expect(isPageRepairRecord(candidate.repair)).toBe(true);
 expect(candidate.executionRecord!.completeHtml).toBe(candidate.newHtml);expect(s.getStagedDeliveryReport().status).toBe('pending');
 const a=new DOMParser().parseFromString(broken,'text/html'),b=new DOMParser().parseFromString(candidate.newHtml,'text/html');
 for(const nid of ['title','label','icon','other'])expect(a.querySelector(`[data-nid="${nid}"]`)!.isEqualNode(b.querySelector(`[data-nid="${nid}"]`)!)).toBe(true);
 expect(a.body.textContent).toBe(b.body.textContent);expect(await run()).toBe(false);expect(calls).toHaveLength(1);
 publish(good as any);expect(await s.adoptStagedChange()).toBe(true);expect(useHistoryStore.getState().past.length).toBe(before+1);
 const record=(await new DeliveryRepository(createProjectStorage(s.id),s.id).listForScreen('page',10)).records[0];expect(record.candidate.repair!.status).toBe('repaired');expect(record.candidate.validationEvidence!.repair!.usage).toEqual({inputTokens:123,outputTokens:45});expect(JSON.stringify(record)).not.toContain('SECRET_NEVER_STORE');
 useHistoryStore.getState().undo();expect(useProjectStore.getState().screens.page.htmlContent).toBe(html);useHistoryStore.getState().redo();expect(useProjectStore.getState().screens.page.htmlContent).toBe(candidate.newHtml);
});
for(const kind of ['legacy','outside','local-intersection','missing-local-root','protected','l4-target','l4-parent','l4-content','wrong-report-key','incomplete','unsupported-error','unknown-authorization','stale-baseline','source','entities'] as const)test(`${kind} 预检拒绝且不请求模型`,async()=>{
 if(kind.startsWith('l4-')){const nid=kind==='l4-target'?'save':kind==='l4-parent'?'root':'label';useProjectStore.setState({overrides:{[`page:${nid}`]:{nid,declarations:{'border-radius':'8px'}} as any}});}
 stage({legacy:kind==='legacy',scope:kind==='outside'?'other':undefined,local:kind==='local-intersection'?['other']:kind==='missing-local-root'?['missing']:undefined});
 const s=useProjectStore.getState();
 if(kind==='protected')useProjectStore.setState({stagedScreen:{...s.stagedScreen!,workflowContract:{...s.stagedScreen!.workflowContract!,protectedNids:['save']}}});
 if(kind==='unknown-authorization')useProjectStore.setState({stagedScreen:{...s.stagedScreen!,workflowContract:{...s.stagedScreen!.workflowContract!,elementNid:undefined,allowedChanges:['unknown']}}});
 if(kind==='wrong-report-key')useProjectStore.setState({stagedRenderQuality:{key:'old',report:bad}});
 if(kind==='incomplete')publish({...bad,status:'incomplete'} as any);
 if(kind==='unsupported-error')publish({...bad,findings:[{...bad.findings[0],code:'render_other'}]});
 if(kind==='stale-baseline')s.updateScreen('page',{htmlContent:html.replace('会员资料','新会员资料')});
 if(kind==='source'||kind==='entities'){const newHtml=broken.replace('<main',kind==='source'?'<main onclick="bad()"':'<main data-component-id="missing"');useProjectStore.setState({stagedScreen:{...s.stagedScreen!,newHtml}});publish();}
 expect(useProjectStore.getState().getStagedRepairEligibility().allowed).toBe(false);expect(await run()).toBe(false);expect(calls).toHaveLength(0);expect(renders).toBe(0);
});
test('整页修改与单页润色可修复，批量合同不能借候选入口申请修复',async()=>{
 stage({restyle:true});expect(useProjectStore.getState().getStagedRepairEligibility().allowed).toBe(true);expect(await run()).toBe(true);
});
for(const kind of ['outside','text','color','hidden','bad-json','no-change','still-bad','new-warning'] as const)test(`${kind} 不发布无效修复，保存失败记录且重开不可重试`,async()=>{
 stage();const s=useProjectStore.getState(),old=s.stagedScreen!.newHtml;
 if(kind==='outside')answer=JSON.stringify({operations:[{nid:'other',type:'remove_styles',value:'font-size'}]});
 if(kind==='text')answer=JSON.stringify({operations:[{nid:'save',type:'set_text',value:'删除'}]});
 if(kind==='color'||kind==='hidden')answer=JSON.stringify({operations:[{nid:'save',type:'set_styles',value:kind==='color'?'color:transparent':'display:none'}]});
 if(kind==='bad-json')answer='invalid';if(kind==='no-change')answer=JSON.stringify({operations:[{nid:'save',type:'remove_styles',value:'height'}]});
 if(kind==='still-bad')PageRenderCheck.inspect=async()=>bad;
 if(kind==='new-warning')PageRenderCheck.inspect=async()=>({...good,findings:[{...bad.findings[0],code:'render_horizontal_overflow',severity:'warning'}]});
 expect(await run()).toBe(false);expect(useProjectStore.getState().stagedScreen!.newHtml).toBe(old);expect(useProjectStore.getState().stagedScreen!.repair!.status).toBe('blocked');expect(calls).toHaveLength(1);
 const restored=await loadStagedCandidate(s.id);expect(restored?.repair).toBeDefined();s.discardStagedChange();s.restoreStagedCandidate(restored!,s.id);publish();expect(await run()).toBe(false);expect(calls).toHaveLength(1);expect(useProjectStore.getState().screens.page.htmlContent).toBe(html);
});
for(const kind of ['cancel','discard','replace','tokens','documents','baseline','switch'] as const)test(`${kind} 与迟到结果：原候选不被错误覆盖，忙碌期间三种采纳均锁定`,async()=>{
 stage();const s=useProjectStore.getState(),candidate=s.stagedScreen!,controller=new AbortController();let release!:()=>void;
 const slow:AIEngineCore={...core,streamText(options){const response=core.streamText(options),ready=new Promise<void>(resolve=>release=resolve);return {...response,textStream:(async function*(){await ready;yield answer;})(),textPromise:ready.then(()=>answer),abort(){}};}};
 const pending=run(controller.signal,slow);await waitFor(()=>Boolean(release));
 expect((await loadStagedCandidate(s.id))!.repair).toBeDefined();expect(await run()).toBe(false);expect(calls).toHaveLength(1);
 expect(await s.adoptStagedChange()).toBe(false);expect(await s.forceAdoptStagedChange()).toBe(false);expect(await s.keepBothScreens()).toBe(false);
 if(kind==='cancel')controller.abort();if(kind==='discard')s.discardStagedChange();if(kind==='replace')stage();
 if(kind==='tokens')useProjectStore.setState({designSystem:{...s.designSystem,name:'changed'}});
 if(kind==='documents')useProjectStore.setState({projectDocuments:{new:{id:'new',title:'新需求',content:'changed',enabled:true,source:'manual'} as any}});
 if(kind==='baseline')s.updateScreen('page',{htmlContent:html.replace('会员资料','新资料')});
 if(kind==='switch')s.initNewProject({name:'另一个项目',deviceProfile:'mobile',designSystem:neutralModernTheme,createSpecimen:false});
 release();expect(await pending).toBe(false);expect(renders).toBe(0);const end=useProjectStore.getState();expect(end.stagedRepairStatus).toBeNull();
 if(kind==='replace')expect(end.stagedScreen!.candidateId).not.toBe(candidate.candidateId);
 if(kind==='cancel'||kind==='tokens'||kind==='documents'||kind==='baseline')expect(end.stagedScreen!.newHtml).toBe(candidate.newHtml);
});
for(const timing of ['model','render'] as const)test(`真实文件在${timing}期间被删除均重查阻断`,async()=>{
 stage();const s=useProjectStore.getState(),storage=createProjectStorage(s.id);
 s.addAsset({id:'photo',name:'图片',type:'image',mimeType:'image/png',source:'upload',refCount:1,relPath:'assets/images/photo.png'});await storage.writeBinary('assets/images/photo.png','dGVzdA==');
 s.updateScreen('page',{htmlContent:html.replace('</main>','<img src="assets/images/photo.png" alt="资料"></main>')});
 const current=useProjectStore.getState();current.stageScreenChange('page',broken.replace('</main>','<img src="assets/images/photo.png" alt="资料"></main>'),'会员资料','调整按钮',buildDesignTaskContract({intent:'modify_screen',request:'调整按钮',target:current.screens.page,deviceProfile:'mobile',frameWidth:390,designSystem:current.designSystem}));
 publish();await waitFor(()=>useProjectStore.getState().stagedAssetFiles?.status==='passed');
 if(timing==='render')PageRenderCheck.inspect=async()=>{await storage.remove('assets/images/photo.png');return good;};
 const deleting:AIEngineCore={...core,streamText(options){const response=core.streamText(options);return {...response,textPromise:response.textPromise.then(async text=>{await storage.remove('assets/images/photo.png');return text;})};}};
 expect(await run(undefined,timing==='model'?deleting:core)).toBe(false);expect(calls).toHaveLength(1);expect(useProjectStore.getState().stagedScreen!.newHtml).toContain('font-size:0');
});
test('损坏修复记录可以展示但不能再次请求；候选恢复不会自动修复',async()=>{
 stage();const s=useProjectStore.getState(),damaged={...s.stagedScreen!,repair:{invalid:true} as any};useProjectStore.setState({stagedScreen:damaged});await saveStagedCandidate(s.id,undefined,damaged);const restored=await loadStagedCandidate(s.id);expect(restored?.repair).toBeDefined();s.restoreStagedCandidate(restored!,s.id);publish();expect(await run()).toBe(false);expect(calls).toHaveLength(0);
 host=document.createElement('div');document.body.append(host);root=createRoot(host);act(()=>root!.render(<><CandidateRepairControl/><RepairReceipt value={damaged.repair}/></>));expect(host.textContent).toContain('修复记录损坏');expect(host.querySelector('button')!.disabled).toBe(true);expect(calls).toHaveLength(0);
});

test('选中根与allowedChanges同样取交集，不让较宽的elementNid扩大授权',async()=>{
 stage();const s=useProjectStore.getState(),c=s.stagedScreen!;useProjectStore.setState({stagedScreen:{...c,workflowContract:{...c.workflowContract!,elementNid:'root',allowedChanges:['element:other']}}});
 expect(s.getStagedRepairEligibility().allowed).toBe(false);expect(await run()).toBe(false);expect(calls).toHaveLength(0);
});
for(const duplicate of [false,true])test(`${duplicate?'duplicate click':'another control'} must retain cancellation of the one active repair`,async()=>{
 stage();const config=useAIConfigStore.getState();let release!:()=>void,aborts=0;
 const slow:AIEngineCore={...core,streamText(options){const stream=core.streamText(options),pending=new Promise<void>(resolve=>release=resolve);return {...stream,textStream:(async function*(){await pending;yield answer;})(),textPromise:pending.then(()=>answer),abort(){aborts++;}};}};
 const factory=spyOn(CoreFactory,'createAIEngineCore').mockReturnValue(slow);useAIConfigStore.setState({getActiveProviderForRole:()=>({provider,modelId:'fixture'})});
 host=document.createElement('div');document.body.append(host);root=createRoot(host);
 try{
  await act(async()=>{root!.render(<><CandidateRepairControl/><CandidateRepairControl/></>);});
  const start=host.querySelector('button')!;await act(async()=>{start.click();if(duplicate)start.dispatchEvent(new MouseEvent('click',{bubbles:true}));await waitFor(()=>Boolean(release));});expect(calls).toHaveLength(1);
  const cancel=[...host.querySelectorAll('button')].filter(button=>button.textContent==='取消修复');expect(cancel).toHaveLength(2);await act(async()=>{cancel[duplicate?0:1].click();await new Promise(resolve=>setTimeout(resolve,5));});
  expect(aborts).toBeGreaterThan(0);expect(useProjectStore.getState().stagedRepairStatus).toBeNull();expect(useProjectStore.getState().stagedScreen?.newHtml).toBe(broken);
  await act(async()=>{release();await new Promise(resolve=>setTimeout(resolve,5));});expect(calls).toHaveLength(1);expect((await loadStagedCandidate(useProjectStore.getState().id))!.repair).toBeDefined();
 }finally{await act(async()=>{release?.();await new Promise(resolve=>setTimeout(resolve,5));});factory.mockRestore();useAIConfigStore.setState(config,true);}
});
test('a pending candidate repair exposes actual request activity without granting adoption',async()=>{
 stage();const config=useAIConfigStore.getState();let release!:()=>void;
 const slow:AIEngineCore={...core,streamText(options){const stream=core.streamText(options),pending=new Promise<void>(resolve=>release=resolve);return {...stream,textStream:(async function*(){await pending;yield answer;})(),textPromise:pending.then(()=>answer),abort(){}};}};
 const factory=spyOn(CoreFactory,'createAIEngineCore').mockReturnValue(slow);useAIConfigStore.setState({getActiveProviderForRole:()=>({provider,modelId:'fixture'})});host=document.createElement('div');document.body.append(host);root=createRoot(host);
 try{
  await act(async()=>{root!.render(<CandidateRepairControl/>);});await act(async()=>{host!.querySelector('button')!.click();await waitFor(()=>Boolean(release));});expect(calls).toHaveLength(1);
  const summary=host.querySelector('[aria-label="应用调用摘要"]');expect(summary).not.toBeNull();expect(summary!.textContent).toContain('等待调用返回');expect(summary!.textContent).toContain('调用尝试 1 次');expect(await useProjectStore.getState().adoptStagedChange()).toBe(false);
 }finally{await act(async()=>{release?.();await new Promise(resolve=>setTimeout(resolve,5));});factory.mockRestore();useAIConfigStore.setState(config,true);}
});
for(const action of ['model','unmount'] as const)test(`${action} aborts candidate repair and its late response cannot replace the original candidate`,async()=>{
 stage();const config=useAIConfigStore.getState(),id=useProjectStore.getState().stagedScreen!.candidateId;let release!:()=>void,aborts=0;
 const slow:AIEngineCore={...core,streamText(options){const stream=core.streamText(options),pending=new Promise<void>(resolve=>release=resolve);return {...stream,textStream:(async function*(){await pending;yield answer;})(),textPromise:pending.then(()=>answer),abort(){aborts++;}};}};
 const factory=spyOn(CoreFactory,'createAIEngineCore').mockReturnValue(slow);useAIConfigStore.setState({getActiveProviderForRole:()=>({provider,modelId:'fixture'})});host=document.createElement('div');document.body.append(host);root=createRoot(host);
 try{await act(async()=>{root!.render(<CandidateRepairControl/>);});await act(async()=>{host.querySelector('button')!.click();await waitFor(()=>Boolean(release));});
  await act(async()=>{if(action==='model')useAIConfigStore.setState({getActiveProviderForRole:()=>({provider,modelId:'changed'})});else {root!.unmount();root=undefined;}await new Promise(resolve=>setTimeout(resolve,5));});expect(aborts).toBeGreaterThan(0);expect(useProjectStore.getState().stagedRepairStatus).toBeNull();
  await act(async()=>{release();await new Promise(resolve=>setTimeout(resolve,5));});expect(useProjectStore.getState().stagedScreen?.candidateId).toBe(id);expect(useProjectStore.getState().stagedScreen?.newHtml).toBe(broken);expect(calls).toHaveLength(1);if(action==='model')expect(host.textContent).toContain('模型');else expect(host.childElementCount).toBe(0);
 }finally{await act(async()=>{release?.();await new Promise(resolve=>setTimeout(resolve,5));});factory.mockRestore();useAIConfigStore.setState(config,true);}
});
test('an actual repair deadline ends busy UI and consumes only the original one-attempt allowance',async()=>{
 stage();const config=useAIConfigStore.getState(),budget=new TaskBudget({maxRequests:1,maxRequestedOutputTokens:1800,maxDurationMs:1000,maxRequestDurationMs:60});let release!:()=>void,aborts=0;
 const slow:AIEngineCore={...core,streamText(options){const stream=core.streamText(options),pending=new Promise<void>(resolve=>release=resolve);return {...stream,textStream:(async function*(){await pending;yield answer;})(),textPromise:pending.then(()=>answer),abort(){aborts++;}};}};
 const factory=spyOn(CoreFactory,'createAIEngineCore').mockReturnValue(slow),policy=spyOn(BudgetPolicy,'createSingleRequestBudget').mockReturnValue(budget);useAIConfigStore.setState({getActiveProviderForRole:()=>({provider,modelId:'fixture'})});host=document.createElement('div');document.body.append(host);root=createRoot(host);
 try{await act(async()=>{root!.render(<CandidateRepairControl/>);});await act(async()=>{host.querySelector('button')!.click();await waitFor(()=>Boolean(release));await new Promise(resolve=>setTimeout(resolve,100));});expect(useProjectStore.getState().stagedRepairStatus).toBeNull();expect(host.textContent).toContain('超过时限');expect(aborts).toBeGreaterThan(0);expect(host.querySelector('button')!.disabled).toBe(true);
  await act(async()=>{release();await new Promise(resolve=>setTimeout(resolve,5));});expect(useProjectStore.getState().stagedScreen?.newHtml).toBe(broken);expect(calls).toHaveLength(1);expect(budget.snapshot()).toMatchObject({requests:1,requestedOutputTokens:1800});
 }finally{release?.();budget.close();policy.mockRestore();factory.mockRestore();useAIConfigStore.setState(config,true);}
});
test('global cancellation during verification releases busy immediately and retains a cancelled receipt',async()=>{
 stage();const s=useProjectStore.getState(),id=s.stagedScreen!.candidateId;let release!:()=>void;
 PageRenderCheck.inspect=async()=>{await new Promise<void>(resolve=>release=resolve);return good;};
 const pending=run();await waitFor(()=>Boolean(release));expect(useProjectStore.getState().stagedRepairStatus).toBe('verifying');s.cancelStagedRepair();expect(useProjectStore.getState().stagedRepairStatus).toBeNull();
 release();expect(await pending).toBe(false);expect(useProjectStore.getState().stagedScreen?.candidateId).toBe(id);expect(useProjectStore.getState().stagedScreen?.repair?.status).toBe('cancelled');expect(calls).toHaveLength(1);expect((await loadStagedCandidate(s.id))!.repair).toBeDefined();
});
test('an old delayed reservation cannot dispatch or clear a replacement repair operation',async()=>{
 stage();const realSave=CandidateRepository.saveStagedCandidate;let releaseReservation!:()=>void,reserved=false,releaseModel!:()=>void;
 const reservation=new Promise<void>(resolve=>releaseReservation=resolve),save=spyOn(CandidateRepository,'saveStagedCandidate').mockImplementation(async(project,folder,value)=>{await realSave(project,folder,value);if(value.repair?.message?.startsWith('已登记一次修复尝试')&&!reserved){reserved=true;await reservation;}});
 let first!:Promise<boolean>,second!:Promise<boolean>;
 try{
  first=run();await waitFor(()=>reserved);expect(calls).toHaveLength(0);useProjectStore.getState().cancelStagedRepair();stage();const id=useProjectStore.getState().stagedScreen!.candidateId;
  const slow:AIEngineCore={...core,streamText(options){const stream=core.streamText(options),pending=new Promise<void>(resolve=>releaseModel=resolve);return {...stream,textStream:(async function*(){await pending;yield answer;})(),textPromise:pending.then(()=>answer),abort(){}};}};
  second=run(undefined,slow);await waitFor(()=>Boolean(releaseModel));expect(calls).toHaveLength(1);releaseReservation();expect(await first).toBe(false);expect(useProjectStore.getState().stagedRepairStatus).toBe('repairing');expect(useProjectStore.getState().stagedScreen?.candidateId).toBe(id);
  useProjectStore.getState().cancelStagedRepair();releaseModel();expect(await second).toBe(false);expect(calls).toHaveLength(1);
 }finally{releaseReservation?.();releaseModel?.();await first;await second;save.mockRestore();}
});
test('批量润色合同不能借单页候选入口修复',async()=>{
 const s=useProjectStore.getState(),task=buildRestyleContract({scope:'batch',target:{id:'page',name:'会员资料',html},deviceProfile:'mobile',frameWidth:390,designSystem:s.designSystem});
 s.stageScreenChange('page',broken,'会员资料',task.request,task);publish();expect(s.getStagedRepairEligibility().allowed).toBe(false);expect(await run()).toBe(false);expect(calls).toHaveLength(0);
});
test('整页授权与无关L4样式可修，实际复验携带精确覆盖',async()=>{
 useProjectStore.setState({overrides:{'page:other':{nid:'other',declarations:{'border-radius':'8px'}} as any}});
 const s=useProjectStore.getState(),task=buildDesignTaskContract({intent:'modify_screen',request:'调整页面按钮字号',target:s.screens.page,deviceProfile:'mobile',frameWidth:390,designSystem:s.designSystem});
 s.stageScreenChange('page',broken,'会员资料',task.request,task);publish();expect(await run()).toBe(true);expect(requests[0].overrides).toEqual(s.overrides);expect(calls).toHaveLength(1);
});

test('guided candidate repair persists parent provenance, rechecks it on adoption and archives the actual repair request',async()=>{
 stage();let s=useProjectStore.getState();const original=s.stagedScreen!,contract=structuredClone(original.workflowContract!);
 contract.designGuidance=makeGuidancePacket(contract,selectDesignRules({request:'主按钮',operation:'modify',device:'mobile',scope:'element',features:['button'],maxChars:1500}),'finite-json');
 await withGuidanceReceipts(core,contract,contract.designGuidance).streamText({provider,model:'fixture',maxTokens:4,messages:[{role:'system',content:contract.designGuidance.selection.body}]}).textPromise;calls=[];
 s.stageScreenChange('page',broken,'会员资料',contract.request,contract);publish();expect(await run()).toBe(true);s=useProjectStore.getState();
 const repaired=s.stagedScreen!;expect(repaired.repair!.guidance!.requests).toHaveLength(1);expect(calls).toHaveLength(1);expect(repaired.workflowContract).toEqual(contract);
 await saveStagedCandidate(s.id,undefined,repaired);const restored=(await loadStagedCandidate(s.id))!;expect(restored.repair).toEqual(repaired.repair);expect(isPageRepairRecord(restored.repair)).toBe(true);
 useProjectStore.setState({stagedScreen:restored});publish(good as any);expect(useProjectStore.getState().getStagedDeliveryReport().status).toBe('ready');
 const badRecord=structuredClone(restored);badRecord.repair!.guidance!.parentBindingFingerprint='12345678';useProjectStore.setState({stagedScreen:badRecord});publish(good as any);
 expect(useProjectStore.getState().getStagedDeliveryReport().status).toBe('blocked');expect(await useProjectStore.getState().adoptStagedChange()).toBe(false);
 useProjectStore.setState({stagedScreen:restored});publish(good as any);expect(await useProjectStore.getState().adoptStagedChange()).toBe(true);
 const record=(await new DeliveryRepository(createProjectStorage(s.id),s.id).listForScreen('page',10)).records[0];
 expect(record.candidate.repair).toEqual(repaired.repair);expect(isCandidateValidationEvidence(record.candidate.validationEvidence)).toBe(true);
 expect(isCandidateValidationEvidence({...record.candidate.validationEvidence,repair:{...repaired.repair,guidance:{requests:[]}}})).toBe(false);
 useHistoryStore.getState().undo();expect(useProjectStore.getState().screens.page.htmlContent).toBe(html);useHistoryStore.getState().redo();expect(useProjectStore.getState().screens.page.htmlContent).not.toContain('font-size:0');
});
