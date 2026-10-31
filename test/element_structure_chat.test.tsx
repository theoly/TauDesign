import {beforeEach,afterEach,expect,spyOn,test} from 'bun:test';
import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {useAIEngineChat} from '../src/services/ai/engine/react/useAIEngineChat';
import {DefaultAIEngineCore} from '../src/services/ai/engine/core';
import {PipelineExecutor} from '../src/services/ai/engine/pipeline/executor';
import {useProjectStore} from '../src/stores/useProjectStore';
import {useHistoryStore} from '../src/stores/useHistoryStore';
import {useAIConfigStore,defaultProviders,defaultBindings} from '../src/stores/useAIConfigStore';
import {passStagedRenderCheck} from './helpers/stagedQuality';
import {chatPageTaskPlan} from './fixtures/pageTaskPlan';
const source='<main data-nid="page0001"><section data-nid="card0001"><h2 data-nid="title001">资料</h2><button data-nid="save0001" type="button" class="btn btn-primary">保存</button></section><aside data-nid="aside001">'+Array.from({length:18},(_,i)=>`<p data-nid="keep${i}">保留资料${i}</p>`).join('')+'</aside></main>';
const html='<section data-nid="card0001" class="col gap-4"><h2 data-nid="title001">资料</h2><label>邮箱<input class="input"/></label><button data-nid="save0001" type="button" class="btn btn-primary">保存</button></section>';
const plan={...chatPageTaskPlan,goal:'输入邮箱并保存',features:[{...chatPageTaskPlan.features[0],information:[{label:'邮箱',kind:'input'}],interactions:[{label:'保存',precondition:'邮箱有效',outcome:'显示结果',targetScreenId:''}]}]};
let root:Root,host:HTMLDivElement,engine:ReturnType<typeof useAIEngineChat>,objects:ReturnType<typeof spyOn>,pipeline:ReturnType<typeof spyOn>,oldAct:unknown;
let project:ReturnType<typeof useProjectStore.getState>,history:ReturnType<typeof useHistoryStore.getState>,config:ReturnType<typeof useAIConfigStore.getState>;
const Harness=()=>{engine=useAIEngineChat();return null;};
const reference={referencedScreenId:'page',referencedElement:{nid:'card0001',tagName:'section',screenName:'资料页'}};
beforeEach(async()=>{
 project=useProjectStore.getState();history=useHistoryStore.getState();config=useAIConfigStore.getState();oldAct=(globalThis as any).IS_REACT_ACT_ENVIRONMENT;(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
 localStorage.clear();useHistoryStore.getState().restore(null);useProjectStore.getState().initNewProject({name:'元素结构',deviceProfile:'mobile',createSpecimen:false});useProjectStore.getState().addScreen({name:'资料页',htmlContent:source},'page');
 useAIConfigStore.setState({providers:defaultProviders.map(p=>({...p,apiKey:'fixture'})),bindings:defaultBindings});
 objects=spyOn(DefaultAIEngineCore.prototype,'generateObject').mockImplementation(async schema=>(schema.properties as any)?.features?plan:{nid:'card0001',html});
 pipeline=spyOn(PipelineExecutor,'execute').mockResolvedValue({status:'no_html',rawResponse:''});host=document.createElement('div');document.body.append(host);root=createRoot(host);await act(async()=>root.render(<Harness/>));
});
afterEach(()=>{act(()=>root.unmount());host.remove();objects.mockRestore();pipeline.mockRestore();useProjectStore.setState(project,true);useHistoryStore.setState(history,true);useAIConfigStore.setState(config,true);(globalThis as any).IS_REACT_ACT_ENVIRONMENT=oldAct;});
test('an explicit referenced container gains fields directly without selectable analysis and adopts through History',async()=>{
 const before=useHistoryStore.getState().past.length;
 await act(async()=>{await engine.sendMessage('增加邮箱输入框',undefined,reference);});
 expect(objects).toHaveBeenCalledTimes(2);expect(pipeline).not.toHaveBeenCalled();expect(engine.messages.some(m=>m.modificationReview)).toBe(false);
 const candidate=useProjectStore.getState().stagedScreen!;expect(candidate.workflowContract?.elementNid).toBe('card0001');expect(candidate.workflowContract?.allowedChanges).toEqual(['element:card0001']);expect(candidate.executionRecord?.localEdit?.structural).toBe(true);
 expect(useProjectStore.getState().screens.page.htmlContent).toBe(source);expect(useHistoryStore.getState().past.length).toBe(before);
 passStagedRenderCheck();await act(async()=>{await useProjectStore.getState().adoptStagedChange();});expect(useProjectStore.getState().screens.page.htmlContent).toContain('邮箱');expect(useHistoryStore.getState().past.length).toBe(before+1);
 act(()=>useHistoryStore.getState().undo());expect(useProjectStore.getState().screens.page.htmlContent).toBe(source);
});
for(const wrappedInput of [false,true])test(`${wrappedInput?'wrapped':'plain'} element references restore only historical planning`,async()=>{
 const wrapped='[引用元素 nid="card0001" 画框="资料页" 标签=<section>]\n元素片段:\n<section>旧片段</section>\n\n增加邮箱输入框';
 await act(async()=>{await engine.sendMessage(wrappedInput?wrapped:'增加邮箱输入框',undefined,reference);});
 const turns=await useProjectStore.getState().getConversationStore().loadRecent();expect(turns[0].assistant.pageTaskHistory?.contract.request).toBe('增加邮箱输入框');expect(turns[0].user.reference?.element.nid).toBe('card0001');
 await act(async()=>root.unmount());root=createRoot(host);await act(async()=>{root.render(<Harness/>);await new Promise(r=>setTimeout(r,15));});
 const restored=engine.messages.find(m=>m.historicalPageTask)!;expect(restored.workflowContract).toBeUndefined();expect(restored.originalDecision).toBeUndefined();expect(engine.messages.find(m=>m.sender==='user')?.referencedElement?.nid).toBe('card0001');expect(objects).toHaveBeenCalledTimes(2);
});
test('retry retains an options-only element reference and never reaches a whole-page pipeline',async()=>{
 await act(async()=>{await engine.sendMessage('增加邮箱输入框',undefined,reference);});
 const result=engine.messages.find(m=>m.toolAction==='modified')!;
 await act(async()=>{engine.retryTurn(result.id);await new Promise(r=>setTimeout(r,15));});
 expect(objects).toHaveBeenCalledTimes(4);expect(pipeline).not.toHaveBeenCalled();expect(useProjectStore.getState().stagedScreen?.workflowContract?.elementNid).toBe('card0001');expect(new Set(engine.messages.map(m=>m.id)).size).toBe(engine.messages.length);
});
test('pending questions and model changes block subtree delivery without new analysis or a page fallback',async()=>{
 objects.mockResolvedValue({...plan,questions:['请确认邮箱规则']});await act(async()=>{await engine.sendMessage('增加邮箱输入框',undefined,reference);});
 expect(objects).toHaveBeenCalledTimes(1);expect(useProjectStore.getState().stagedScreen).toBeNull();expect(engine.messages.at(-1)?.workflowContract?.pageTaskPlan?.plan.questions).toContain('请确认邮箱规则');
 objects.mockImplementationOnce(async()=>{useAIConfigStore.getState().setRoleBinding('code',{role:'code',providerId:'prov-openai',modelId:'gpt-4o'});return plan;});
 await act(async()=>{await engine.sendMessage('增加邮箱输入框',undefined,reference);});expect(objects).toHaveBeenCalledTimes(2);expect(useProjectStore.getState().stagedScreen).toBeNull();expect(pipeline).not.toHaveBeenCalled();expect(engine.messages.some(m=>m.modificationReview)).toBe(false);
});

test('native field rule edits use exact subtree scope at delivery, adoption and undo despite an outside field with the same label',async()=>{
 const baseline=source.replace('</h2>','</h2><label>邮箱<input data-nid="email001" type="email"/></label>').replace('</aside>','<label>邮箱<input data-nid="outside1"/></label></aside>');
 act(()=>useProjectStore.getState().updateScreenHtml('page',baseline));
 objects.mockImplementation(async schema=>(schema.properties as any)?.features?{...plan,features:plan.features.map(f=>({...f,change:'update'}))}:{nid:'card0001',html:'<section data-nid="card0001"><h2 data-nid="title001">资料</h2><label>邮箱<input data-nid="email001" type="email" required/></label><button data-nid="save0001" type="button" class="btn btn-primary">保存</button></section>'});
 const before=useHistoryStore.getState().past.length;await act(async()=>{await engine.sendMessage('把邮箱设为必填',undefined,reference);});
 expect(objects).toHaveBeenCalledTimes(2);expect(pipeline).not.toHaveBeenCalled();expect(useProjectStore.getState().getStagedDeliveryReport().checks.find(c=>c.id==='quality')?.status).toBe('passed');
 passStagedRenderCheck();await act(async()=>{await useProjectStore.getState().adoptStagedChange();});
 const next=new DOMParser().parseFromString(useProjectStore.getState().screens.page.htmlContent,'text/html');expect(next.querySelector('[data-nid="email001"]')?.hasAttribute('required')).toBe(true);expect(next.querySelector('[data-nid="outside1"]')?.hasAttribute('required')).toBe(false);expect(useHistoryStore.getState().past.length).toBe(before+1);
 act(()=>useHistoryStore.getState().undo());expect(useProjectStore.getState().screens.page.htmlContent).toBe(baseline);
});
