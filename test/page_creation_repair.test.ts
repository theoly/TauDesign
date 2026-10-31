import {makeGuidancePacket,withGuidanceReceipts} from '../src/services/ai/designKnowledge/receipt';
import {selectDesignRules} from '../src/services/ai/designKnowledge/selector';
import {TaskBudget,withTaskBudget} from '../src/services/ai/taskBudget';
import {frozenRepairGuidance,repairGuidanceIssue} from '../src/services/ai/designKnowledge/repairTrace';
import {useAIConfigStore} from '../src/stores/useAIConfigStore';
import {RepairReceipt} from '../src/components/canvas/CandidateRepairControl';
import {renderToStaticMarkup} from 'react-dom/server';
import {createElement} from 'react';
import {withMultiPageTasks} from './fixtures/multiPageTask';
import {afterEach,beforeEach,expect,test} from 'bun:test';
import {prepareNewPageWithRepair} from '../src/services/ai/pageCreationRepair';
import {PageRenderCheck} from '../src/services/ai/pageRenderCheck';
import {isPageRepairRecord} from '../src/services/ai/pageRepairRecord';
import {isPageCreationEvidence} from '../src/services/ai/pageCreationValidation';
import {buildDesignTaskContract} from '../src/services/ai/designWorkflow';
import {contentFingerprint} from '../src/services/ai/designWorkflow';
import {useProjectStore} from '../src/stores/useProjectStore';
import {useHistoryStore} from '../src/stores/useHistoryStore';
import {neutralModernTheme} from '../src/utils/themePresets';
import {createProjectStorage} from '../src/services/storage/projectStorage';
import {CanvasToolExecutor} from '../src/services/tools/canvasToolExecutor';
import {prepareMultiPagePlan,executeMultiPagePlan} from '../src/services/ai/multiPageService';
import type {AIEngineCore,StreamTextOptions} from '../src/services/ai/engine/core/types';
const html='<main data-nid="root" class="col gap-4 p-4"><h1 data-nid="title">会员资料</h1><button data-nid="save" class="btn btn-primary" style="font-size:0px"><svg data-nid="icon" class="icon" viewBox="0 0 24 24"><path d="M1 1h8"/></svg><span data-nid="label">保存资料</span></button></main>';
const bad={status:'complete' as const,inspected:5,findings:[{code:'render_action_invisible_label',severity:'error' as const,nid:'save',message:'实际文案不可见',actual:'字号0',expected:'文案可见'}]};
const good={status:'complete' as const,inspected:5,findings:[]};
const original=PageRenderCheck.inspect;
const provider={id:'fixture',name:'fixture',protocol:'openai_compatible',baseUrl:'https://invalid.local',apiKey:'SECRET_NEVER_STORE',isEnabled:true,models:[]} as any;
let prior:ReturnType<typeof useProjectStore.getState>,history:ReturnType<typeof useHistoryStore.getState>,renders:number,calls:StreamTextOptions[],answer:string,finish:string,renderedHtml:string[];
const core:AIEngineCore={async generateObject(){throw Error('No second structured abstraction');},streamText(options){calls.push(options);const text=answer;return {textStream:(async function*(){yield text;})(),reasoningStream:(async function*(){})(),textPromise:Promise.resolve(text),reasoningPromise:Promise.resolve(undefined),usagePromise:Promise.resolve({inputTokens:123,outputTokens:45}),finishReasonPromise:Promise.resolve(finish),abort(){}};}};
beforeEach(()=>{
 prior=useProjectStore.getState();history=useHistoryStore.getState();useProjectStore.getState().initNewProject({name:'一次修复',deviceProfile:'mobile',designSystem:neutralModernTheme,createSpecimen:false});
 renders=0;calls=[];renderedHtml=[];answer=JSON.stringify({operations:[{nid:'save',type:'remove_styles',value:'font-size'}]});finish='stop';PageRenderCheck.inspect=async request=>{renders++;renderedHtml.push(request.screen.htmlContent);return structuredClone(request.screen.htmlContent.includes('font-size:0')?bad:good);};
});
afterEach(()=>{PageRenderCheck.inspect=original;useProjectStore.setState(prior,true);useHistoryStore.setState(history,true);});
function task(){const s=useProjectStore.getState();return buildDesignTaskContract({intent:'create_screen',request:'新建会员资料',deviceProfile:'mobile',frameWidth:390,designSystem:s.designSystem});}
const run=(overrides:Partial<Parameters<typeof prepareNewPageWithRepair>[4]>={},source=html,contract=task())=>prepareNewPageWithRepair(useProjectStore.getState(),{id:'new',name:'会员资料',htmlContent:source,position:{x:0,y:0}},contract,createProjectStorage(useProjectStore.getState().id),{isCurrent:()=>true,repair:{core,provider,model:'fixture'},...overrides});
test('一次请求仅修复控件自身样式，完整重验且不写页面/History，正文SVG和其他节点不变',async()=>{
 const before=useHistoryStore.getState().past.length,result=await run();expect(result.status).toBe('ready');if(result.status!=='ready')return;
 expect(calls).toHaveLength(1);expect(renders).toBe(2);expect(calls[0].maxTokens).toBe(1800);expect(calls[0].jsonSchema).toBeDefined();
 const a=new DOMParser().parseFromString(renderedHtml[0],'text/html'),b=new DOMParser().parseFromString(result.screen.htmlContent,'text/html');
 for(const nid of ['title','icon','label'])expect(a.querySelector(`[data-nid="${nid}"]`)!.isEqualNode(b.querySelector(`[data-nid="${nid}"]`)!)).toBe(true);
 expect(b.querySelector('[data-nid="save"]')!.getAttribute('style')??'').not.toContain('font-size');expect(b.body.textContent).toBe(a.body.textContent);
 expect(result.evidence.repair).toMatchObject({attempts:1,status:'repaired',usage:{inputTokens:123,outputTokens:45},usageEstimated:false});
 expect(result.evidence.repair!.afterHtmlFingerprint).toBe(contentFingerprint(result.screen.htmlContent));
 expect(isPageRepairRecord(result.evidence.repair)).toBe(true);expect(isPageCreationEvidence(result.evidence)).toBe(true);expect(JSON.stringify(result.evidence)).not.toContain('SECRET_NEVER_STORE');expect(JSON.stringify(result.evidence)).not.toContain('data:image');
 expect(useHistoryStore.getState().past.length).toBe(before);expect(useProjectStore.getState().screenOrder).toEqual([]);
});
test('没有AI上下文、已通过或只有警告均不多请求模型',async()=>{
 expect((await run({repair:undefined})).status).toBe('blocked');expect(calls).toHaveLength(0);
 PageRenderCheck.inspect=async()=>({...good,findings:[{...bad.findings[0],severity:'warning'}]});expect((await run()).status).toBe('ready');expect(calls).toHaveLength(0);
});
for(const kind of ['unavailable','incomplete','unknown-code','missing-nid','wrong-target','protected','no-content'] as const)test(`${kind} 渲染问题不触发修复`,async()=>{
 const report=structuredClone(bad),contract=task();let source=html;
 if(kind==='unavailable'||kind==='incomplete')(report as any).status=kind;
 if(kind==='unknown-code')report.findings[0].code='render_other';if(kind==='missing-nid')delete (report.findings[0] as any).nid;if(kind==='wrong-target')report.findings[0].nid='root';if(kind==='protected')contract.protectedNids=['save'];
 if(kind==='no-content')source='<main><button data-nid="save" aria-label="仅无内容的控件"></button></main>';
 PageRenderCheck.inspect=async()=>report;expect((await run({},source,contract)).status).toBe('blocked');expect(calls).toHaveLength(0);
});
for(const kind of ['unsafe','truncated','unknown-component','missing-asset','invalid-contract'] as const)test(`${kind} 先于渲染被拦截，不能借修复改写`,async()=>{
 let source=html;const contract=task();if(kind==='unsafe')source=source.replace('<button','<button onclick="bad()"');if(kind==='truncated')source+='<scr';if(kind==='unknown-component')source=source.replace('<h1','<h1 data-component-id="missing"');if(kind==='missing-asset')source=source.replace('</main>','<img src="assets/images/missing.png"></main>');if(kind==='invalid-contract')contract.allowedChanges=[];
 expect((await run({},source,contract)).status).toBe('blocked');expect(renders).toBe(0);expect(calls).toHaveLength(0);
});
for(const kind of ['text','html','outside','hidden','color','zero-size','unknown-property','extra-key','empty','many','no-change','bad-json','truncated-response'] as const)test(`${kind} 修复拒绝且绝不再请求第二次`,async()=>{
 let op:any={nid:'save',type:'remove_styles',value:'font-size'};
 if(kind==='text')op={...op,type:'set_text',value:'替换文案'};if(kind==='html')op={...op,type:'replace_html',value:'<button>新</button>'};if(kind==='outside')op.nid='title';if(kind==='hidden')op={...op,type:'set_styles',value:'display:none'};if(kind==='color')op={...op,type:'set_styles',value:'color:transparent'};if(kind==='zero-size')op={...op,type:'set_styles',value:'height:0px'};if(kind==='unknown-property')op={...op,type:'remove_styles',value:'opacity'};if(kind==='extra-key')op.extra='not allowed';if(kind==='no-change')op.value='height';
 answer=JSON.stringify({operations:kind==='empty'?[]:kind==='many'?Array(9).fill(op):[op]});if(kind==='bad-json')answer='not JSON';if(kind==='truncated-response')finish='length';
 const contract=task(),result=await run({},html,contract);expect(result.status).toBe('blocked');expect(calls).toHaveLength(1);expect(renders).toBe(1);expect(useProjectStore.getState().screenOrder).toEqual([]);
 expect((await run({},html,contract)).status).toBe('blocked');expect(calls).toHaveLength(1);
});
test('复验仍有错误则停止一次，不把修复操作完成当作通过',async()=>{
 PageRenderCheck.inspect=async()=>{renders++;return structuredClone(bad);};const result=await run();expect(result.status).toBe('blocked');expect(result.status==='blocked'&&result.message).toContain('完整复验未通过');expect(calls).toHaveLength(1);expect(renders).toBe(2);
});
test('不能通过修复按钮却引入新的溢出警告来交付',async()=>{
 PageRenderCheck.inspect=async()=>++renders===1?structuredClone(bad):{...good,findings:[{...bad.findings[0],code:'render_horizontal_overflow',severity:'warning',message:'修复后按钮超出画框'}]};
 const result=await run();expect(result.status).toBe('blocked');expect(result.status==='blocked'&&result.message).toContain('新的渲染问题');expect(calls).toHaveLength(1);expect(renders).toBe(2);
});
test('修复传输失败、格式错误不续写或重试',async()=>{
 const broken:AIEngineCore={...core,streamText(options){calls.push(options);throw Error('network offline');}};const result=await run({repair:{core:broken,provider,model:'fixture'}});expect(result.status).toBe('blocked');expect(calls).toHaveLength(1);
});
for(const kind of ['cancel','stale'] as const)test(`非协作 ${kind} 修复输出不得复验或应用`,async()=>{
 const controller=new AbortController();let current=true,release!:()=>void;
 const slow:AIEngineCore={...core,streamText(options){const result=core.streamText(options),ready=new Promise<void>(resolve=>release=resolve);return {...result,textStream:(async function*(){await ready;yield answer;})(),textPromise:ready.then(()=>answer),abort(){}};}};
 const pending=run({signal:controller.signal,isCurrent:()=>current,repair:{core:slow,provider,model:'fixture'}});for(let i=0;i<20&&!release;i++)await new Promise(r=>setTimeout(r,0));
 if(kind==='cancel')controller.abort();else current=false;release();const result=await pending;expect(result.status).toBe('blocked');expect(calls).toHaveLength(1);expect(renders).toBe(1);expect(useProjectStore.getState().screenOrder).toEqual([]);
});
test('确认前或修复后上下文变更不会启动额外请求或发布通过记录',async()=>{
 let current=false;expect((await run({isCurrent:()=>current})).status).toBe('blocked');expect(calls).toHaveLength(0);
 current=true;expect((await run({isCurrent:()=>current,repair:{core,provider,model:'fixture',onPhase:phase=>{if(phase==='verifying')current=false;}}})).status).toBe('blocked');expect(renders).toBe(1);expect(calls).toHaveLength(1);
});
test('成功记录支持一次History撤销重做，不能从损坏历史宣称修复通过',async()=>{
 const result=await CanvasToolExecutor.executeAsync({tool:'create_screen',params:{title:'会员资料',html,workflowContract:task()}},{repair:{core,provider,model:'fixture'}});expect(result.success).toBe(true);expect(result.createdHtml).not.toContain('font-size:0');
 const s=useProjectStore.getState(),page=s.screens[result.screenId!],e=page.metadata!.creationEvidence!;expect(e.repair!.status).toBe('repaired');
 useHistoryStore.getState().undo();expect(useProjectStore.getState().screens[page.id]).toBeUndefined();useHistoryStore.getState().redo();expect(useProjectStore.getState().screens[page.id].metadata).toEqual(page.metadata);
 expect(isPageCreationEvidence({...e,repair:{...e.repair,operations:null}})).toBe(false);expect(isPageCreationEvidence({...e,repair:{...e.repair,status:'blocked'}})).toBe(false);
});
test('模型请求期间本地文件被删除，复验重新核对资源且不写入页面',async()=>{
 const s=useProjectStore.getState(),storage=createProjectStorage(s.id);s.addAsset({id:'photo',name:'图片',type:'image',mimeType:'image/png',source:'upload',refCount:1,relPath:'assets/images/photo.png'});await storage.writeBinary('assets/images/photo.png','dGVzdA==');
 const deleting:AIEngineCore={...core,streamText(options){const stream=core.streamText(options);return {...stream,textPromise:stream.textPromise.then(async text=>{await storage.remove('assets/images/photo.png');return text;})};}};
 const result=await run({repair:{core:deleting,provider,model:'fixture'}},html.replace('</main>','<img src="assets/images/photo.png" alt="资料图片"></main>'));
 expect(result.status).toBe('blocked');expect(result.status==='blocked'&&result.message).toContain('不存在');expect(calls).toHaveLength(1);expect(renders).toBe(1);expect(useProjectStore.getState().screenOrder).toEqual([]);
});
test('超过3个报错控件不会请求模型；非白名单警告与错误混合仍不能修复',async()=>{
 const source='<main>'+Array.from({length:4},(_,i)=>`<button data-nid="s${i}">提交${i}</button>`).join('')+'</main>';
 PageRenderCheck.inspect=async()=>({...bad,findings:Array.from({length:4},(_,i)=>({...bad.findings[0],nid:`s${i}`}))});expect((await run({},source)).status).toBe('blocked');expect(calls).toHaveLength(0);
 PageRenderCheck.inspect=async()=>({...bad,findings:[...bad.findings,{...bad.findings[0],code:'unknown_severe'}]});expect((await run()).status).toBe('blocked');expect(calls).toHaveLength(0);
});
test('缺失用量时记录明确估算，冻结调用信息不保存凭证',async()=>{
 const noUsage:AIEngineCore={...core,streamText(options){return {...core.streamText(options),usagePromise:Promise.resolve(undefined)};}};
 const result=await run({repair:{core:noUsage,provider,model:'fixture'}});expect(result.status).toBe('ready');if(result.status==='ready'){expect(result.evidence.repair!.usageEstimated).toBe(true);expect(result.evidence.repair!.usage!.inputTokens).toBeGreaterThan(0);}
});
for(const failSecond of [false,true])test(`多页首屏一次修复后${failSecond?'第二页失败整批不写':'全部通过才一起加入'}`,async()=>{
 let pages=0;
 const multi:AIEngineCore={async generateObject(){return withMultiPageTasks({summary:'两页静态资料',pages:[{name:'资料页',requirements:['会员资料'],links:[]},{name:'设置页',requirements:['设置'],links:[]}]}) as any;},streamText(options){
  if(options.jsonSchema)return core.streamText(options);
  const scope=JSON.parse(options.messages.find(m=>m.role==='system')!.content.match(/confirmedMultiPageScope=(.*); output exactly this page/)![1]);pages++;
  const content=pages===1?html:html.replace('font-size:0px','font-size:14px');const text=failSecond&&pages===2?'无有效页面':`<artifact identifier="screen_new" type="screen" title="${scope.name}">${content}</artifact>`;
  return {...core.streamText(options),textStream:(async function*(){yield text;})(),textPromise:Promise.resolve(text)};
 }};
 const before=useHistoryStore.getState().past.length,plan=await prepareMultiPagePlan({state:useProjectStore.getState(),request:'创建两个页面',provider,model:'fixture',core:multi,isCurrent:()=>true});
 const progress:string[]=[],result=await executeMultiPagePlan(plan,plan.plan.pages,{getState:()=>useProjectStore.getState(),commit:batch=>{useProjectStore.getState().applyMultiPageCreation(batch);},onProgress:p=>progress.push(p[0]?.message??'')});
 expect(result.status).toBe(failSecond?'blocked':'complete');expect(calls.filter(c=>c.jsonSchema)).toHaveLength(1);expect(progress.some(m=>m.includes('一次受控样式修复'))).toBe(true);
 expect(useProjectStore.getState().screenOrder).toHaveLength(failSecond?0:2);expect(useHistoryStore.getState().past.length).toBe(before+(failSecond?0:1));
 if(!failSecond)expect(useProjectStore.getState().screens[result.screenIds[0]].metadata!.creationEvidence!.repair!.status).toBe('repaired');
});

for(const reason of ['MAX_TOKENS','content_filter','SAFETY','tool_calls','unknown_status'])test(`closed repair JSON with ${reason} cannot bypass the shared end gate or retry`,async()=>{
 finish=reason;const contract=task(),result=await run({},html,contract);expect(result.status).toBe('blocked');expect(calls).toHaveLength(1);expect(renders).toBe(1);
 expect(useProjectStore.getState().screenOrder).toEqual([]);expect((await run({},html,contract)).status).toBe('blocked');expect(calls).toHaveLength(1);
});

async function guidedTask(budget?:TaskBudget){
 const contract=task();contract.designGuidance=makeGuidancePacket(contract,selectDesignRules({request:'长正文',operation:'create',device:'mobile',scope:'page',maxChars:1500}),'html');
 const tracked=withGuidanceReceipts(core,contract,contract.designGuidance);
 await (budget?withTaskBudget(tracked,budget):tracked).streamText({provider,model:'fixture',maxTokens:4,messages:[{role:'system',content:contract.designGuidance.selection.body}]}).textPromise;
 calls=[];return contract;
}
test('guided creation repair keeps the frozen parent, bounded JSON protocol and actual independent receipt',async()=>{
 const plain=await run();expect(plain.status).toBe('ready');const originalMessages=JSON.stringify(calls[0].messages);calls=[];
 const budget=new TaskBudget({maxRequests:2,maxRequestedOutputTokens:1804,maxDurationMs:10000,maxRequestDurationMs:10000});
 const contract=await guidedTask(budget),before=JSON.stringify(contract),config=useAIConfigStore.getState();
 useAIConfigStore.setState({autoReferenceDesignRules:false});
 try{
  const result=await run({repair:{core,provider,model:'fixture',taskBudget:budget}},html,contract);expect(result.status).toBe('ready');if(result.status!=='ready')return;
  expect(calls).toHaveLength(1);expect(calls[0].maxTokens).toBe(1800);expect(calls[0].messages[0].content).toContain('只返回JSON');expect(calls[0].messages[0].content).not.toContain('OUTPUT CONTRACT');
  expect(JSON.stringify(calls[0].messages).length).toBeLessThanOrEqual(originalMessages.length);expect(JSON.stringify(contract)).toBe(before);
  const repair=result.evidence.repair!,trace=repair.guidance!;expect(trace.injectedRuleIds.length).toBeGreaterThan(0);
  expect(trace.requests).toHaveLength(1);expect(trace.requests[0].requestId).not.toBe(contract.designGuidance!.requests[0].requestId);expect(trace.requests[0].status).toBe('completed');
  for(const id of trace.injectedRuleIds)expect(calls[0].messages[0].content).toContain(`[${id}@`);
  expect(repairGuidanceIssue(trace,contract,true)).toBeUndefined();expect(isPageCreationEvidence(JSON.parse(JSON.stringify(result.evidence)))).toBe(true);
  expect(budget.snapshot()).toMatchObject({requests:2,requestedOutputTokens:1804,reservedOutputTokens:0});
  const ui=renderToStaticMarkup(createElement(RepairReceipt,{value:repair}));expect(ui).toContain('沿用原任务');expect(ui).toContain('返回完成');expect(ui).not.toContain(provider.apiKey);
  const corrupt=structuredClone(result.evidence);corrupt.repair!.guidance!.parentTaskId='another';expect(isPageCreationEvidence(corrupt)).toBe(false);
  const legacy=structuredClone(result.evidence);delete legacy.repair!.guidance;expect(isPageCreationEvidence(legacy)).toBe(true);
 }finally{budget.close();useAIConfigStore.setState(config,true);}
});
test('guided repair budget exhaustion does not create a failed dispatch or refill the parent allowance',async()=>{
 const budget=new TaskBudget({maxRequests:1,maxRequestedOutputTokens:1804,maxDurationMs:10000,maxRequestDurationMs:10000}),contract=await guidedTask(budget);
 const result=await run({repair:{core,provider,model:'fixture',taskBudget:budget}},html,contract);
 expect(result.status).toBe('blocked');if(result.status!=='blocked')return;
 expect(calls).toHaveLength(0);expect(result.repair?.guidance?.requests).toEqual([]);expect(contract.designGuidance!.requests[0].status).toBe('completed');expect(budget.snapshot().requests).toBe(1);
 expect(isPageRepairRecord(result.repair)).toBe(true);expect(result.message).toContain('预算');budget.close();
});
test('frozen repair rules use existing CSS whitespace only and explicitly omit an oversized rule',async()=>{
 const contract=await guidedTask(),before=JSON.stringify(contract),payload={tokens:':root{--space:1px}',targets:['original']};
 const adapted=frozenRepairGuidance(contract,payload)!;
 expect(adapted.payload).toEqual(payload);expect(adapted.suffix).toBe('');expect(adapted.trace.injectedRuleIds).toEqual([]);
 expect(adapted.trace.omittedRuleIds).toEqual(contract.designGuidance!.selection.selected.map(s=>s.rule.id));expect(JSON.stringify(contract)).toBe(before);
 expect(repairGuidanceIssue(adapted.trace,contract)).toBeUndefined();
});
for(const kind of ['scope','incomplete','rule'] as const)test(`invalid ${kind} parent guidance is refused before repair dispatch`,async()=>{
 const contract=await guidedTask();if(kind==='scope')contract.allowedChanges=['screen:outside'];if(kind==='incomplete')contract.designGuidance!.requests[0].status='cancelled';if(kind==='rule')contract.designGuidance!.selection.selected[0].rule.guidance='changed';
 const result=await run({},html,contract);expect(result.status).toBe('blocked');expect(calls).toHaveLength(0);
});
test('failed guided repair retains its actual failure receipt and cannot publish a repaired record',async()=>{
 const contract=await guidedTask();answer='not JSON';const result=await run({},html,contract);expect(result.status).toBe('blocked');if(result.status!=='blocked')return;
 expect(calls).toHaveLength(1);expect(result.repair?.guidance?.requests).toHaveLength(1);expect(result.repair?.status).toBe('blocked');expect(isPageRepairRecord(result.repair)).toBe(true);
 const forged={...result.repair,status:'repaired',operations:[{nid:'save',type:'remove_styles',value:'font-size'}],afterHtmlFingerprint:'12345678',guidance:{...result.repair!.guidance,requests:[]}};expect(isPageRepairRecord(forged)).toBe(false);
});

test('cancelled guided repair keeps a cancelled receipt after an uncooperative late response',async()=>{
 const contract=await guidedTask(),controller=new AbortController();let release!:()=>void;
 const slow:AIEngineCore={...core,streamText(options){const result=core.streamText(options),wait=new Promise<void>(resolve=>release=resolve);return {...result,textStream:(async function*(){await wait;yield answer;})(),textPromise:wait.then(()=>answer),abort(){}};}};
 const pending=run({signal:controller.signal,repair:{core:slow,provider,model:'fixture'}},html,contract);
 for(let i=0;i<30&&!release;i++)await new Promise(r=>setTimeout(r,0));expect(release).toBeDefined();controller.abort();release();
 const result=await pending;expect(result.status).toBe('blocked');if(result.status!=='blocked')return;
 expect(result.repair?.status).toBe('cancelled');expect(result.repair?.guidance?.requests[0].status).toBe('cancelled');expect(isPageRepairRecord(result.repair)).toBe(true);
 expect(renders).toBe(1);expect(contract.designGuidance!.requests[0].status).toBe('completed');
});
