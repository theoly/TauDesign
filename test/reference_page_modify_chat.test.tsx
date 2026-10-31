import {beforeEach,afterEach,expect,test,spyOn} from 'bun:test';
import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {useAIEngineChat} from '../src/services/ai/engine/react/useAIEngineChat';
import {DefaultAIEngineCore} from '../src/services/ai/engine/core';
import {PipelineExecutor} from '../src/services/ai/engine/pipeline/executor';
import {useProjectStore} from '../src/stores/useProjectStore';
import {useHistoryStore} from '../src/stores/useHistoryStore';
import {useAIConfigStore,defaultBindings,defaultProviders} from '../src/stores/useAIConfigStore';
import {techBlueTheme} from '../src/utils/themePresets';
import {referenceImageIdentity,inspectReferenceInput} from '../src/services/ai/workflowSources';
import type {AIEngineCore,StreamTextOptions} from '../src/services/ai/engine/core/types';
import {chatPageTaskPlan} from './fixtures/pageTaskPlan';
const execute=PipelineExecutor.execute;
const image={name:'资料参考.png',dataUrl:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg=='};
const original='<main data-nid="old00001"><h1 data-nid="title001">原页面</h1></main>';
const request='参照附图修改资料页，增加邮箱输入框和保存后的校验反馈';
let root:Root,host:HTMLDivElement,engine:ReturnType<typeof useAIEngineChat>,calls:Array<{kind:string;options:StreamTextOptions}>,oldAct:unknown;
let questions:string[],afterPlan:()=>void,objects:ReturnType<typeof spyOn>;
let project:ReturnType<typeof useProjectStore.getState>,history:ReturnType<typeof useHistoryStore.getState>,config:ReturnType<typeof useAIConfigStore.getState>;
const Harness=()=>{engine=useAIEngineChat();return null;};
beforeEach(async()=>{
 project=useProjectStore.getState();history=useHistoryStore.getState();config=useAIConfigStore.getState();oldAct=(globalThis as any).IS_REACT_ACT_ENVIRONMENT;(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
 localStorage.clear();useHistoryStore.getState().restore(null);useProjectStore.getState().initNewProject({name:'参考图修改',deviceProfile:'mobile',designSystem:techBlueTheme,createSpecimen:false});
 useProjectStore.getState().addScreen({name:'资料页',htmlContent:original},'page');useProjectStore.getState().addScreen({name:'其它页',htmlContent:'<main data-nid="other001">其它原页面</main>'},'other');
 useAIConfigStore.setState({providers:defaultProviders.map(p=>({...p,apiKey:'fixture'})),bindings:defaultBindings});calls=[];questions=[];afterPlan=()=>{};
 const core:AIEngineCore={async generateObject<T>(schema,options){
  if((schema.properties as any)?.items){calls.push({kind:'analysis',options});return {summary:'优化层级',items:[{title:'优化标题',reason:'层级不足',change:'标题加粗',scope:'local',targetNids:['title001'],operations:[{nid:'title001',type:'add_classes',value:'font-semibold'}]}]} as T;}
  calls.push({kind:'plan',options});afterPlan();return {...chatPageTaskPlan,questions,goal:'补充邮箱并保存',features:chatPageTaskPlan.features.map(f=>({...f,title:'邮箱',basis:'image',sourceIds:[`image:${referenceImageIdentity(image).fingerprint}`],information:[{label:'邮箱',kind:'input'}],interactions:[{label:'保存',precondition:'已填写邮箱',outcome:'显示校验反馈',targetScreenId:''}]}))} as T;},
  streamText(options){calls.push({kind:'html',options});const functional=options.messages.some(m=>m.content.includes('PAGE TASK PLAN'));
   const text='<artifact identifier="page" type="screen" title="资料页"><main data-nid="old00001" class="p-4 col gap-4"><h1 data-nid="title001" class="font-semibold">原页面</h1>'+(functional?'<label>邮箱<input class="input"/></label><button class="btn btn-primary">保存</button>':'')+'</main></artifact>';
   return {textStream:(async function*(){yield text;})(),reasoningStream:(async function*(){})(),textPromise:Promise.resolve(text),reasoningPromise:Promise.resolve(undefined),usagePromise:Promise.resolve(undefined),abort(){}};}};
 objects=spyOn(DefaultAIEngineCore.prototype,'generateObject').mockImplementation((schema,options)=>core.generateObject(schema,options));PipelineExecutor.execute=options=>execute({...options,engineCore:core});host=document.createElement('div');document.body.append(host);root=createRoot(host);await act(async()=>root.render(<Harness/>));
});
afterEach(()=>{act(()=>root.unmount());host.remove();PipelineExecutor.execute=execute;objects.mockRestore();
 useProjectStore.setState(project,true);useHistoryStore.setState(history,true);useAIConfigStore.setState(config,true);(globalThis as any).IS_REACT_ACT_ENVIRONMENT=oldAct;});
test('explicit reference page functionality uses Vision for planning and HTML with no reanalysis or original writes',async()=>{
 const past=useHistoryStore.getState().past.length;
 await act(async()=>{await engine.sendMessage(request,image,{referencedScreenId:'page'});});
 expect(calls.map(c=>c.kind)).toEqual(['plan','html']);for(const c of calls){expect(c.options.provider.id).toBe(defaultBindings.vision.providerId);expect(c.options.messages.at(-1)?.imageUrl).toBe(image.dataUrl);}
 expect(JSON.parse(calls[0].options.messages.at(-1)!.content).baselineHtml).toBe(original);
 const s=useProjectStore.getState(),c=s.stagedScreen!;expect(c.targetScreenId).toBe('page');expect(c.workflowContract?.allowedChanges).toEqual(['screen:page']);expect(c.workflowContract?.pageTaskPlan?.plan.goal).toBe('补充邮箱并保存');expect(inspectReferenceInput(c.workflowContract!).status).toBe('passed');
 expect(s.screens.page.htmlContent).toBe(original);expect(s.screens.other.htmlContent).toBe('<main data-nid="other001">其它原页面</main>');expect(useHistoryStore.getState().past.length).toBe(past);expect(engine.messages.some(m=>m.modificationReview)).toBe(false);expect(engine.messages.at(-1)?.taskBudget?.requests).toBe(2);
});
test('a primary visual binding is retained for both stages of a page modification',async()=>{
 act(()=>useAIConfigStore.getState().setRoleBinding('code',{role:'code',providerId:'prov-openai',modelId:'gpt-4o'}));
 await act(async()=>{await engine.sendMessage(request,image,{referencedScreenId:'page'});});
 expect(calls.map(c=>c.kind)).toEqual(['plan','html']);for(const c of calls){expect(c.options.provider.id).toBe('prov-openai');expect(c.options.model).toBe('gpt-4o');}
});
test('a reference visual adjustment keeps the previous single-generation flow without a business plan',async()=>{
 await act(async()=>{await engine.sendMessage('参照附图修改资料页，把标题文字加粗',image,{referencedScreenId:'page'});});
 expect(calls.map(c=>c.kind)).toEqual(['html']);expect(useProjectStore.getState().stagedScreen?.workflowContract?.pageTaskPlan).toBeUndefined();expect(useProjectStore.getState().screens.page.htmlContent).toBe(original);
});
for(const prompt of ['参照附图优化当前页面','先分析资料页的修改建议，再增加邮箱输入框'])test(`reference review remains selectable: ${prompt}`,async()=>{
 await act(async()=>{await engine.sendMessage(prompt,image,{referencedScreenId:'page'});});
 expect(calls.map(c=>c.kind)).toEqual(['analysis']);expect(engine.messages.some(m=>m.modificationReview?.status==='ready')).toBe(true);expect(useProjectStore.getState().stagedScreen).toBeNull();
});
test('missing page authorization and text-only Vision cannot invoke reference functionality planning',async()=>{
 await act(async()=>{await engine.sendMessage('修改页面，增加邮箱输入框',image,{referencedScreenId:null,activeScreenId:null});});
 expect(calls).toHaveLength(0);expect(useProjectStore.getState().stagedScreen).toBeNull();
 act(()=>useAIConfigStore.getState().setRoleBinding('vision',{role:'vision',providerId:'prov-deepseek',modelId:'deepseek-chat'}));
 await act(async()=>{await engine.sendMessage(request,image,{referencedScreenId:'page'});});expect(calls).toHaveLength(0);expect(useProjectStore.getState().stagedScreen).toBeNull();expect(engine.messages.at(-1)?.text).toContain('视觉模型');
});
test('critical questions and a changed visual binding stop before any page generation',async()=>{
 questions=['邮箱是否公开？'];await act(async()=>{await engine.sendMessage(request,image,{referencedScreenId:'page'});});expect(calls.map(c=>c.kind)).toEqual(['plan']);expect(engine.messages.at(-1)?.workflowContract?.pageTaskPlan?.plan.questions).toEqual(questions);expect(useProjectStore.getState().stagedScreen).toBeNull();
 questions=[];afterPlan=()=>useAIConfigStore.getState().setRoleBinding('vision',{role:'vision',providerId:'prov-openai',modelId:'gpt-4o'});
 await act(async()=>{await engine.sendMessage(request,image,{referencedScreenId:'page'});});expect(calls.map(c=>c.kind)).toEqual(['plan','plan']);expect(useProjectStore.getState().stagedScreen).toBeNull();
});
test('successful reference modifications restore image-attributed read-only history with a stored attachment',async()=>{
 await act(async()=>{await engine.sendMessage(request,image,{referencedScreenId:'page'});});
 const turns=await useProjectStore.getState().getConversationStore().loadRecent();expect(turns).toHaveLength(1);const saved=turns[0].assistant.pageTaskHistory!;
 expect(saved.contract.pageTaskPlan?.plan.features[0].basis).toBe('image');expect(turns[0].user.attachments?.[0]).toMatch(/^assets\/images\//);expect(JSON.stringify(turns)).not.toContain(image.dataUrl);
 await act(async()=>root.unmount());useProjectStore.getState().updateScreenHtml('page','<main>后来调整的页面</main>');root=createRoot(host);
 await act(async()=>{root.render(<Harness/>);await new Promise(r=>setTimeout(r,20));});const restored=engine.messages.find(m=>m.historicalPageTask)!;
 expect(restored.historicalPageTask?.contract.pageTaskPlan).toEqual(saved.contract.pageTaskPlan);expect(restored.workflowContract).toBeUndefined();expect(restored.originalDecision).toBeUndefined();expect(restored.continuationAvailable).toBeUndefined();expect(engine.messages.find(m=>m.sender==='user')?.imageUrl).toBe(image.dataUrl);expect(calls.map(c=>c.kind)).toEqual(['plan','html']);
});
