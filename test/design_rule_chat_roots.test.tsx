import {afterEach,beforeEach,expect,test} from 'bun:test';
import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {useAIEngineChat} from '../src/services/ai/engine/react/useAIEngineChat';
import {DefaultAIEngineCore} from '../src/services/ai/engine/core/aiEngineCore';
import {MockTransport} from '../src/services/ai/engine/transport/mockTransport';
import {PageRenderCheck} from '../src/services/ai/pageRenderCheck';
import {useProjectStore} from '../src/stores/useProjectStore';
import {useHistoryStore} from '../src/stores/useHistoryStore';
import {useAIConfigStore,defaultProviders,defaultBindings} from '../src/stores/useAIConfigStore';
import {chatPageTaskPlan} from './fixtures/pageTaskPlan';
import {withMultiPageTasks} from './fixtures/multiPageTask';
import {isModificationReviewReceipt} from '../src/services/ai/modificationReview';
import {contentFingerprint} from '../src/services/ai/designWorkflow';
const original='<main data-nid="root0001" class="container-max p-4"><section data-nid="region01"><h2 data-nid="title001">资料</h2><p data-nid="copy0001">'+('长正文需要完整阅读。'.repeat(10))+'</p><button data-nid="button01" class="btn btn-primary">查看详情</button></section><aside data-nid="outside1">'+Array.from({length:24},(_,i)=>`<p data-nid="keep${i}">保留外部${i}</p>`).join('')+'</aside></main>';
const attachment={name:'参考.png',dataUrl:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg=='};
const realStream=DefaultAIEngineCore.prototype.streamText,inspect=PageRenderCheck.inspect;
let root:Root,host:HTMLDivElement,engine:ReturnType<typeof useAIEngineChat>,prior:ReturnType<typeof useProjectStore.getState>,history:ReturnType<typeof useHistoryStore.getState>,config:ReturnType<typeof useAIConfigStore.getState>,actState:unknown,requests:any[],disableAtPlan:boolean,analysisRegion:boolean,holdAnalysis:boolean;
function Harness(){engine=useAIEngineChat();return null;}
beforeEach(async()=>{
 prior=useProjectStore.getState();history=useHistoryStore.getState();config=useAIConfigStore.getState();actState=(globalThis as any).IS_REACT_ACT_ENVIRONMENT;(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;localStorage.clear();useHistoryStore.getState().restore(null);
 useProjectStore.getState().initNewProject({name:'根入口规则',deviceProfile:'pc',createSpecimen:false});useProjectStore.getState().addScreen({name:'资料页',htmlContent:original},'page');
 useAIConfigStore.setState({providers:defaultProviders.map(p=>({...p,apiKey:'ROOT_SYNTHETIC_SECRET'})),bindings:{...defaultBindings,vision:{role:'vision',providerId:'prov-openai',modelId:'gpt-4o'}},autoReferenceDesignRules:true});requests=[];disableAtPlan=false;analysisRegion=false;holdAnalysis=false;
 const transport=new MockTransport(),core=new DefaultAIEngineCore({id:'root-capture',stream:(request,event)=>{
  const b=request.body!,schema=b.response_format?.json_schema?.schema,raw=b.messages.at(-1).content,text=Array.isArray(raw)?raw.find(c=>c.type==='text').text:raw,system=b.messages[0].content;
  requests.push({schema,messages:b.messages,maxTokens:b.max_tokens});
  if(schema?.properties.features){if(disableAtPlan)useAIConfigStore.getState().setAutoReferenceDesignRules(false);transport.queueResponse(JSON.stringify({...chatPageTaskPlan,features:chatPageTaskPlan.features.map(f=>({...f,...(Array.isArray(raw)?{basis:'image',sourceIds:[`image:${contentFingerprint(attachment.dataUrl)}`]}:{})}))}));}
  else if(schema?.properties.pages)transport.queueResponse(JSON.stringify(withMultiPageTasks({summary:'两页长正文',pages:[{name:'正文一',requirements:['展示长正文'],links:[]},{name:'正文二',requirements:['展示长正文'],links:[]}]})));
  else if(schema?.properties.summary)transport.queueResponse(JSON.stringify({summary:'长正文可优化',items:[{title:'调整层级',reason:'信息层级不明确',change:analysisRegion?'调整长正文的完整区块层级':'主按钮文字加粗',scope:analysisRegion?'region':'local',...(analysisRegion?{targetNids:['region01']} :{}),operations:analysisRegion?[]:[{nid:'button01',type:'add_classes',value:'font-semibold'}]}]}),holdAnalysis?1000:5);
  else if(schema?.properties.nid)transport.queueResponse(JSON.stringify({nid:'region01',html:new DOMParser().parseFromString(original,'text/html').querySelector('[data-nid=region01]')!.outerHTML.replace('data-nid="region01"','data-nid="region01" class="col gap-4"')}));
  else if(schema?.properties.requiresPageRewrite)transport.queueResponse(JSON.stringify({requiresPageRewrite:false,reason:'仅修改授权主按钮',operations:[{nid:'button01',type:'add_classes',value:'p-4'}]}));
  else if(text.includes('Token是什么'))transport.queueResponse('Token是主题中的复用设计值。');
  else if(system.includes('operation=modify'))transport.queueResponse('<artifact title="资料页">'+original.replace('class="btn btn-primary"','class="btn btn-primary font-semibold"')+'</artifact>');
  else {const scope=system.match(/confirmedMultiPageScope=(.*); output exactly this page/)?.[1],name=scope?JSON.parse(scope).name:'正文页';transport.queueResponse(`<artifact title="${name}"><main class="container-max p-4"><h1>${name}</h1><p>完整正文。</p><button class="btn btn-primary">查看详情</button></main></artifact>`);}
  return transport.stream(request,event);
 }});
 DefaultAIEngineCore.prototype.streamText=function(options){return realStream.call(core,options);};PageRenderCheck.inspect=async()=>({status:'complete',findings:[],inspected:5});
 host=document.createElement('div');document.body.append(host);root=createRoot(host);await act(async()=>root.render(<Harness/>));
});
afterEach(()=>{act(()=>root.unmount());host.remove();DefaultAIEngineCore.prototype.streamText=realStream;PageRenderCheck.inspect=inspect;useProjectStore.setState(prior,true);useHistoryStore.setState(history,true);useAIConfigStore.setState(config,true);(globalThis as any).IS_REACT_ACT_ENVIRONMENT=actState;});
for(const enabled of [false,true])test(`normal creation honors the captured opt-in (${enabled}); business planning remains facts-only`,async()=>{
 useAIConfigStore.setState({autoReferenceDesignRules:enabled});disableAtPlan=enabled;await act(async()=>{await engine.sendMessage('新建长正文说明页');});
 const page=Object.values(useProjectStore.getState().screens).find(s=>s.id!=='page')!;expect(page).toBeDefined();const packet=page.metadata!.creationEvidence!.contract.designGuidance;
 expect(Boolean(packet)).toBe(enabled);expect(requests).toHaveLength(2);expect(requests[0].messages[0].content).not.toContain('[LY-04@1]');expect(requests[1].messages[0].content.includes('[LY-04@1]')).toBe(enabled);expect(useProjectStore.getState().screens.page.htmlContent).toBe(original);
 if(enabled){expect(useAIConfigStore.getState().autoReferenceDesignRules).toBe(false);expect(packet!.requests).toHaveLength(1);expect(packet!.requests[0].status).toBe('completed');}
});
test('reference creation carries the root preference into actual Vision HTML with the original image and plan',async()=>{
 await act(async()=>{await engine.sendMessage('参考图片新建长正文说明页',attachment);});
 const page=Object.values(useProjectStore.getState().screens).find(s=>s.id!=='page')!;expect(page.metadata!.creationEvidence!.contract.designGuidance!.requests[0].status).toBe('completed');expect(requests).toHaveLength(2);
 expect(requests[0].messages[0].content).not.toContain('[LY-04@1]');expect(requests[1].messages[0].content).toContain('[LY-04@1]');expect(requests.every(r=>r.messages.at(-1).content.some(c=>c.type==='image_url'&&c.image_url.url===attachment.dataUrl))).toBe(true);
});
test('explicit referenced button directly uses scoped finite JSON and known DOM semantics without review',async()=>{
 await act(async()=>{await engine.sendMessage('[引用元素 nid="button01" 画框="资料页" 标签=<button>]\n\n主按钮内边距增大');});
 const c=useProjectStore.getState().stagedScreen!;expect(c).toBeDefined();expect(requests).toHaveLength(1);expect(engine.messages.some(m=>m.modificationReview)).toBe(false);
 expect(c.workflowContract!.designGuidance!.protocol).toBe('finite-json');expect(c.workflowContract!.designGuidance!.selection.selected.map(s=>s.rule.id)).toContain('TY-06');expect(c.workflowContract!.allowedChanges).toEqual(['element:button01']);expect(useProjectStore.getState().screens.page.htmlContent).toBe(original);
});
for(const mode of ['local','region'] as const)test(`reviewed ${mode} modification uses independent analysis and execution provenance without expanding scope`,async()=>{
 analysisRegion=mode==='region';await act(async()=>{await engine.sendMessage('修改当前页面，先分析长正文排版并列出修改建议',undefined,{referencedScreenId:'page'});});
 const review=engine.messages.find(m=>m.modificationReview?.status==='ready')!;expect(review).toBeDefined();expect(review.workflowContract!.designGuidance!.protocol).toBe('analysis-json');expect(requests).toHaveLength(1);
 useAIConfigStore.getState().setAutoReferenceDesignRules(false);
 await act(async()=>{await engine.confirmModification(review.id,['suggestion-1'],mode==='local'?'主按钮内边距增大':'',mode);});
 const c=useProjectStore.getState().stagedScreen!;expect(c).toBeTruthy();expect(requests).toHaveLength(2);expect(c.workflowContract!.designGuidance!.protocol).toBe(mode==='local'?'finite-json':'fragment-json');
 expect(isModificationReviewReceipt(c.workflowContract!.modificationReview)).toBe(true);expect(c.workflowContract!.modificationReview!.analysis.workflowContract!.designGuidance!.requests).toHaveLength(1);expect(useProjectStore.getState().screens.page.htmlContent).toBe(original);
});
test('multi-page confirmation retains the original plan opt-in after the global control changes',async()=>{
 await act(async()=>{await engine.sendMessage('新建两个页面，分别展示长正文');});const m=engine.messages.find(m=>m.pagePlan?.plan)!;expect(m).toBeDefined();expect(requests).toHaveLength(1);expect(requests[0].messages[0].content).not.toContain('[LY-04@1]');
 useAIConfigStore.getState().setAutoReferenceDesignRules(false);await act(async()=>{await engine.confirmPagePlan(m.id,m.pagePlan!.plan!.pages);});
 const created=Object.values(useProjectStore.getState().screens).filter(s=>s.id!=='page');expect(created).toHaveLength(2);expect(created.every(s=>s.metadata!.creationEvidence!.contract.designGuidance!.requests.length===1)).toBe(true);expect(requests).toHaveLength(3);expect(useProjectStore.getState().screens.page.htmlContent).toBe(original);
});
test('confirmed deterministic local operations do not manufacture a model guidance call',async()=>{
 await act(async()=>{await engine.sendMessage('修改当前页面，先分析长正文排版并列出修改建议',undefined,{referencedScreenId:'page'});});
 const m=engine.messages.find(m=>m.modificationReview?.status==='ready')!;
 await act(async()=>{await engine.confirmModification(m.id,['suggestion-1'],'','local');});
 const c=useProjectStore.getState().stagedScreen!;expect(c).toBeTruthy();expect(requests).toHaveLength(1);expect(c.workflowContract!.designGuidance).toBeUndefined();expect(c.workflowContract!.modificationReview!.analysis.workflowContract!.designGuidance!.requests).toHaveLength(1);expect(c.newHtml).toContain('font-semibold');expect(useProjectStore.getState().screens.page.htmlContent).toBe(original);
});
for(const enabled of [false,true])test(`reviewed whole-page execution retains the initial preference (${enabled}) after the control changes`,async()=>{
 useAIConfigStore.setState({autoReferenceDesignRules:enabled});await act(async()=>{await engine.sendMessage('修改当前页面，先分析长正文排版并列出修改建议',undefined,{referencedScreenId:'page'});});
 const m=engine.messages.find(m=>m.modificationReview?.status==='ready')!;useAIConfigStore.getState().setAutoReferenceDesignRules(!enabled);
 await act(async()=>{await engine.confirmModification(m.id,['suggestion-1'],'','page');});
 const c=useProjectStore.getState().stagedScreen!;expect(c).toBeTruthy();expect(Boolean(c.workflowContract!.designGuidance)).toBe(enabled);expect(requests).toHaveLength(2);expect(requests[1].messages[0].content.includes('[LY-04@1]')).toBe(enabled);expect(useProjectStore.getState().screens.page.htmlContent).toBe(original);
});
test('same-page variants freeze the preference while planning stays facts-only and all copies retain their own receipts',async()=>{
 await act(async()=>{await engine.sendMessage('创建一个长正文页面的两个方案');});const m=engine.messages.find(m=>m.pagePlan?.plan)!;expect(m?.pagePlan?.plan?.kind).toBe('variants');
 useAIConfigStore.getState().setAutoReferenceDesignRules(false);await act(async()=>{await engine.confirmPagePlan(m.id,m.pagePlan!.plan!.pages);});
 const pages=Object.values(useProjectStore.getState().screens).filter(s=>s.id!=='page');expect(pages).toHaveLength(2);expect(pages.every(s=>s.metadata!.multiPageDelivery!.kind==='variants'&&s.metadata!.creationEvidence!.contract.designGuidance!.requests.length===1)).toBe(true);expect(requests).toHaveLength(3);expect(requests[0].messages[0].content).not.toContain('[LY-04@1]');
});
test('question and theme routes do not fabricate a visual-rule packet when the control is on',async()=>{
 await act(async()=>{await engine.sendMessage('Token是什么？');});expect(requests).toHaveLength(1);expect(requests[0].messages[0].content).not.toContain('DESIGN REFERENCES');expect(engine.messages.at(-1)!.workflowContract!.designGuidance).toBeUndefined();
 await act(async()=>{await engine.sendMessage('把主题改成暗色');});expect(requests).toHaveLength(1);expect(Object.keys(useProjectStore.getState().screens)).toEqual(['page']);
});
test('stopping a real pending analysis keeps its cancelled call evidence without producing a candidate',async()=>{
 holdAnalysis=true;let pending:Promise<void>;
 await act(async()=>{pending=engine.sendMessage('修改当前页面，先分析长正文排版并列出修改建议',undefined,{referencedScreenId:'page'});await Promise.resolve();});
 expect(requests).toHaveLength(1);await act(async()=>{engine.abort();await pending;});
 const m=engine.messages.find(m=>m.modificationReview?.status==='cancelled')!;expect(m).toBeDefined();expect(m.workflowContract!.designGuidance!.requests).toHaveLength(1);expect(m.workflowContract!.designGuidance!.requests[0].status).toBe('cancelled');expect(useProjectStore.getState().stagedScreen).toBeNull();expect(useProjectStore.getState().screens.page.htmlContent).toBe(original);
});

for(const mode of ['create','element'] as const)test(`${mode} conversation reopens frozen rule receipts as read-only history, without dispatch or execution fields`,async()=>{
 await act(async()=>{await engine.sendMessage(mode==='create'?'新建长正文说明页':'[引用元素 nid="button01" 画框="资料页" 标签=<button>]\n\n主按钮内边距增大');});
 const state=useProjectStore.getState(),turns=await state.getConversationStore().loadRecent(),turn=turns.at(-1)!;
 expect(turn.assistant.designGuidanceHistory).toBeDefined();const originalPacket=structuredClone(turn.assistant.designGuidanceHistory!.contract.designGuidance),calls=requests.length,past=useHistoryStore.getState().past.length;
 useAIConfigStore.getState().setAutoReferenceDesignRules(false);
 await act(async()=>{root.unmount();root=createRoot(host);root.render(<Harness/>);await new Promise(r=>setTimeout(r,30));});
 const restored=engine.messages.find(m=>m.historicalGuidance)!;expect(restored).toBeDefined();expect(restored.historicalGuidance!.contract.designGuidance).toEqual(originalPacket);
 expect(restored.workflowContract).toBeUndefined();expect(restored.originalDecision).toBeUndefined();expect(restored.continuationAvailable).toBeUndefined();expect(restored.historicalGuidanceNotice).toContain('不能直接采纳或续写');
 expect(requests).toHaveLength(calls);expect(useHistoryStore.getState().past).toHaveLength(past);expect(useProjectStore.getState().screens.page.htmlContent).toBe(original);
});
test('corrupt conversation rules display a diagnostic while legacy and corrupt turn text remain readable',async()=>{
 await act(async()=>{await engine.sendMessage('新建长正文说明页');});const store=useProjectStore.getState().getConversationStore(),turn=(await store.loadRecent()).at(-1)!,corrupt=structuredClone(turn.assistant.designGuidanceHistory!);
 corrupt.contract.allowedChanges=['outside'];await store.appendTurn({turnId:'corrupt-rules',ts:Date.now()+1,user:{text:turn.user.text},assistant:{text:'损坏来源的会话正文',designGuidanceHistory:corrupt}});
 await store.appendTurn({turnId:'legacy-rules',ts:Date.now()+2,user:{text:'旧会话'},assistant:{text:'旧回复没有规则卡'}});
 const count=requests.length;await act(async()=>{root.unmount();root=createRoot(host);root.render(<Harness/>);await new Promise(r=>setTimeout(r,30));});
 const bad=engine.messages.find(m=>m.text==='损坏来源的会话正文')!,legacy=engine.messages.find(m=>m.text==='旧回复没有规则卡')!;
 expect(bad.historicalGuidance).toBeUndefined();expect(bad.historicalGuidanceNotice).toContain('损坏');expect(legacy.historicalGuidance).toBeUndefined();expect(legacy.historicalGuidanceNotice).toBeUndefined();expect(requests).toHaveLength(count);
});
