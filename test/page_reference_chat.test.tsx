import {beforeEach,afterEach,expect,test} from 'bun:test';
import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {useAIEngineChat} from '../src/services/ai/engine/react/useAIEngineChat';
import {PipelineExecutor} from '../src/services/ai/engine/pipeline/executor';
import {PageRenderCheck} from '../src/services/ai/pageRenderCheck';
import {useProjectStore} from '../src/stores/useProjectStore';
import {useHistoryStore} from '../src/stores/useHistoryStore';
import {useAIConfigStore,defaultBindings,defaultProviders} from '../src/stores/useAIConfigStore';
import {defaultTheme} from '../src/utils/themePresets';
import {referenceImageIdentity} from '../src/services/ai/workflowSources';
import type {AIEngineCore,StreamTextOptions} from '../src/services/ai/engine/core/types';
import {chatPageTaskPlan} from './fixtures/pageTaskPlan';
const execute=PipelineExecutor.execute,inspect=PageRenderCheck.inspect;
const attachment={name:'预约.png',dataUrl:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg=='};
let root:Root,host:HTMLDivElement,engine:ReturnType<typeof useAIEngineChat>,calls:Array<{kind:string;options:StreamTextOptions}>,oldAct:unknown;
let project:ReturnType<typeof useProjectStore.getState>,history:ReturnType<typeof useHistoryStore.getState>,config:ReturnType<typeof useAIConfigStore.getState>;
const Harness=()=>{engine=useAIEngineChat();return null;};
beforeEach(async()=>{
 project=useProjectStore.getState();history=useHistoryStore.getState();config=useAIConfigStore.getState();oldAct=(globalThis as any).IS_REACT_ACT_ENVIRONMENT;(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
 localStorage.clear();useHistoryStore.getState().restore(null);useProjectStore.getState().initNewProject({name:'参考图规划',deviceProfile:'mobile',designSystem:defaultTheme,createSpecimen:false});
 useProjectStore.getState().addScreen({name:'保留原页',htmlContent:'<main data-nid="old00001">原页面</main>'},'old');useAIConfigStore.setState({providers:defaultProviders.map(p=>({...p,apiKey:'fixture'})),bindings:defaultBindings});calls=[];
 const core:AIEngineCore={async generateObject<T>(_schema,options){calls.push({kind:'plan',options});return {...chatPageTaskPlan,features:chatPageTaskPlan.features.map(f=>({...f,basis:'image',sourceIds:[`image:${referenceImageIdentity(attachment).fingerprint}`]}))} as T;},
  streamText(options){calls.push({kind:'html',options});const text='<artifact type="screen" title="预约"><main class="p-4"><h1>资料</h1><button class="btn btn-primary">查看详情</button></main></artifact>';
   return {textStream:(async function*(){yield text;})(),reasoningStream:(async function*(){})(),textPromise:Promise.resolve(text),reasoningPromise:Promise.resolve(undefined),usagePromise:Promise.resolve(undefined),abort(){}};}};
 PipelineExecutor.execute=options=>execute({...options,engineCore:core});PageRenderCheck.inspect=async()=>({status:'complete',findings:[],inspected:3});
 host=document.createElement('div');document.body.append(host);root=createRoot(host);await act(async()=>root.render(<Harness/>));
});
afterEach(()=>{act(()=>root.unmount());host.remove();PipelineExecutor.execute=execute;PageRenderCheck.inspect=inspect;
 useProjectStore.setState(project,true);useHistoryStore.setState(history,true);useAIConfigStore.setState(config,true);(globalThis as any).IS_REACT_ACT_ENVIRONMENT=oldAct;});
test('ordinary reference creation routes both planning and HTML to Vision and saves metadata plus a real attachment path',async()=>{
 await act(async()=>{await engine.sendMessage('根据参考图创建一个预约页面',attachment);});
 expect(calls.map(c=>c.kind)).toEqual(['plan','html']);
 for(const c of calls){expect(c.options.provider.id).toBe(defaultBindings.vision.providerId);expect(c.options.messages.at(-1)?.imageUrl).toBe(attachment.dataUrl);}
 const page=Object.values(useProjectStore.getState().screens).find(s=>s.id!=='old')!;
 expect(page.metadata?.creationEvidence?.contract.pageTaskPlan?.plan.features[0].basis).toBe('image');
 expect(useProjectStore.getState().screens.old.htmlContent).toBe('<main data-nid="old00001">原页面</main>');
 const turns=await useProjectStore.getState().getConversationStore().loadRecent();expect(turns).toHaveLength(1);
 expect(turns[0].assistant.pageTaskHistory?.contract.pageTaskPlan?.request.imageFingerprint).toBe(referenceImageIdentity(attachment).fingerprint);
 expect(turns[0].user.attachments?.[0]).toMatch(/^assets\/images\//);expect(JSON.stringify(turns)).not.toContain(attachment.dataUrl);
 expect(await useProjectStore.getState().getAttachmentStore().readDataUrl(turns[0].user.attachments![0])).toBe(attachment.dataUrl);
});
test('a primary Vision model is reused for both stages without unnecessarily switching the role',async()=>{
 act(()=>useAIConfigStore.getState().setRoleBinding('code',{role:'code',providerId:'prov-openai',modelId:'gpt-4o'}));
 await act(async()=>{await engine.sendMessage('根据参考图创建一个预约页面',attachment);});
 expect(calls.map(c=>c.kind)).toEqual(['plan','html']);for(const c of calls){expect(c.options.provider.id).toBe('prov-openai');expect(c.options.model).toBe('gpt-4o');}
 expect(engine.messages.at(-1)?.workflowContract?.pageTaskPlan?.request.providerId).toBe('prov-openai');
});
test('a misconfigured text-only Vision role stops before any model call or page creation',async()=>{
 act(()=>useAIConfigStore.getState().setRoleBinding('vision',{role:'vision',providerId:'prov-deepseek',modelId:'deepseek-chat'}));
 const checkpoints=useHistoryStore.getState().checkpoints.length;
 await act(async()=>{await engine.sendMessage('根据参考图创建一个预约页面',attachment);});
 expect(calls).toHaveLength(0);expect(engine.messages.at(-1)?.isError).toBe(true);expect(engine.messages.at(-1)?.text).toContain('视觉模型');
 expect(useProjectStore.getState().screenOrder).toEqual(['old']);expect(useHistoryStore.getState().checkpoints).toHaveLength(checkpoints);
});
