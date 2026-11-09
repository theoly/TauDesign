import {afterEach,beforeEach,expect,test} from 'bun:test';
import {finalizeModelHtml} from '../src/services/ai/modelHtmlResult';
import {modelExecutionRecord,sanitizeExecutionMedia} from '../src/services/ai/designExecutionRecord';
import {PipelineExecutor} from '../src/services/ai/engine/pipeline/executor';
import {MockTransport} from '../src/services/ai/engine/transport/mockTransport';
import {DefaultAIEngineCore} from '../src/services/ai/engine/core/aiEngineCore';
import {buildDesignTaskContract,buildRestyleContract} from '../src/services/ai/designWorkflow';
import {executeStructuredEdit} from '../src/services/ai/structuredEditExecutor';
import {executeRestyleTarget} from '../src/services/ai/restyleExecutor';
import {CanvasToolExecutor} from '../src/services/tools/canvasToolExecutor';
import {PageRenderCheck} from '../src/services/ai/pageRenderCheck';
import {useProjectStore} from '../src/stores/useProjectStore';
import {useHistoryStore} from '../src/stores/useHistoryStore';
import {neutralModernTheme} from '../src/utils/themePresets';
const provider={id:'media-gates',name:'fixture',protocol:'openai_compatible' as const,baseUrl:'https://api.openai.com/v1',apiKey:'unit-only',enabled:true};
const source='<main data-nid="root"><h1>资料</h1><button data-nid="save" class="btn btn-primary">保存</button></main>';
const frame=(inner:string)=>source.replace('</main>',inner+'</main>');
const artifact=(body:string)=>`<artifact type="screen" title="资料">${body}</artifact>`;
const cases={image:'<img src="data:image/png;base64,YWJjZA==" alt="用户">',svg:'<svg viewBox="0 0 24 24"><path d="M2 2L20 20"/></svg>',css:'<style>main{background:image-set("data:image/png;base64,YWJjZA==" 1x)}</style>',temporary:'<audio src="blob:temporary" controls></audio>',template:'<template><img src="data:image/svg+xml,%3Csvg%2F%3E"></template>'};
let before:ReturnType<typeof useProjectStore.getState>,history:ReturnType<typeof useHistoryStore.getState>,inspect:typeof PageRenderCheck.inspect,renders:number;
beforeEach(()=>{before=useProjectStore.getState();history=useHistoryStore.getState();inspect=PageRenderCheck.inspect;useProjectStore.getState().initNewProject({name:'生产入口媒体门禁',deviceProfile:'mobile',designSystem:neutralModernTheme,createSpecimen:false});useProjectStore.getState().addScreen({name:'资料',htmlContent:source},'page');renders=0;PageRenderCheck.inspect=async()=>{renders++;return {status:'complete',inspected:4,findings:[]};};});
afterEach(()=>{PageRenderCheck.inspect=inspect;useProjectStore.setState(before,true);useHistoryStore.setState(history,true);});
for(const [name,payload] of Object.entries(cases))test(`${name}: terminal, pipeline, structured, restyle, create and candidate delivery share external media policy`,async()=>{
 const html=frame(payload),raw=artifact(html),terminal=finalizeModelHtml({rawResponse:raw,finishReason:'stop',warnings:[],continuationCount:0});expect(terminal.status).toBe('rejected_by_quality');expect(terminal.html).toBeUndefined();
 const transport=new MockTransport();transport.queueResponse(raw);const output=await PipelineExecutor.execute({input:{rawPrompt:'创建资料页',activeScreenId:null,decision:{intent:'create_screen',targetScreenId:null,reason:'明确新建'}},provider,model:'test',engineCore:new DefaultAIEngineCore(transport),screens:{},deviceProfile:'mobile',frameWidth:390,baseSystemPrompt:'本地合成测试'});
 expect(output.status).toBe('error');expect(output.extractedHtml).toBeUndefined();expect(output.rawResponse).toBe('');expect(output.omittedResponseChars).toBe(raw.length);expect(output.usage).toEqual({inputTokens:100,outputTokens:50});expect(output.executionRecord?.responseOmitted).toBe('embedded-media');expect(output.executionRecord?.observedResponseChars).toBe(raw.length);expect(JSON.stringify(output)).not.toContain(payload);expect(JSON.stringify(output)).not.toContain('YWJjZA==');
 const state=useProjectStore.getState(),count=useHistoryStore.getState().past.length,request='调整保存按钮间距',target={id:'page',name:'资料',htmlContent:html};let calls=0;
 const core={streamText(){calls++;throw Error('不应调用');},async generateObject<T>():Promise<T>{calls++;throw Error('不应调用');}};
 const modified=await executeStructuredEdit(core,{mode:'local',screen:target,request,contract:buildDesignTaskContract({intent:'modify_screen',request,target,allowedChanges:['element:save'],deviceProfile:'mobile',frameWidth:390}),settings:state.settings,designSystem:state.designSystem,colorMode:'light',local:{operations:[{nid:'save',type:'add_classes',value:'p-4'}],allowedNids:['save']},isCurrent:()=>true});
 expect(modified.status).toBe('failed');if(modified.status==='failed')expect(modified.message).toMatch(/媒体|SVG|blob/);expect(calls).toBe(0);
 const restyleTarget={kind:'screen' as const,id:'page',name:'资料',html},restyled=await executeRestyleTarget(core,{target:restyleTarget,contract:buildRestyleContract({scope:'single',target:restyleTarget,deviceProfile:'mobile',frameWidth:390}),quality:{designSystem:state.designSystem,deviceProfile:'mobile'},request:{provider,model:'test',messages:[]}});expect(restyled.status).toBe('failed');expect(calls).toBe(0);
 const created=await CanvasToolExecutor.executeAsync({tool:'create_screen',params:{title:'资料',html,workflowContract:buildDesignTaskContract({intent:'create_screen',request:'创建资料页',deviceProfile:'mobile',frameWidth:390,designSystem:state.designSystem})}});expect(created.success).toBe(false);expect(renders).toBe(0);
 expect(()=>state.stageScreenChange('page',html,'候选')).toThrow();expect(useProjectStore.getState().stagedScreen).toBeNull();expect(useProjectStore.getState().screens.page.htmlContent).toBe(source);expect(useHistoryStore.getState().past).toHaveLength(count);
});

test('old candidate loading remains diagnostic; none of the three adoption actions bypasses media checks',async()=>{
 const state=useProjectStore.getState();state.stageScreenChange('page',source,'合法候选','调整布局');const saved=structuredClone(useProjectStore.getState().stagedScreen!);state.discardStagedChange();
 const count=useHistoryStore.getState().past.length;expect(state.restoreStagedCandidate({...saved,newHtml:frame(cases.svg)},state.id)).toBe(true);
 const report=useProjectStore.getState().getStagedDeliveryReport();expect(report.status).toBe('blocked');expect(report.checks.find(c=>c.id==='source')?.status).toBe('blocked');
 expect(await state.adoptStagedChange()).toBe(false);expect(await state.forceAdoptStagedChange()).toBe(false);expect(await state.keepBothScreens()).toBe(false);expect(useHistoryStore.getState().past).toHaveLength(count);expect(useProjectStore.getState().screens.page.htmlContent).toBe(source);
});

test('a legacy source or L4 media payload is refused before whole-page model communication',async()=>{
 for(const layer of ['html','scoped','override'] as const){
  const transport=new MockTransport(),screen={id:'page',name:'资料',htmlContent:layer==='html'?frame(cases.svg):source,scopedCss:layer==='scoped'?'main{background:url(data:image/png;base64,YWJjZA==)}':undefined};
  const output=await PipelineExecutor.execute({input:{rawPrompt:'重新设计资料页',activeScreenId:'page',decision:{intent:'modify_screen',targetScreenId:'page',reason:'整页修改'}},provider,model:'test',engineCore:new DefaultAIEngineCore(transport),screens:{page:screen},deviceProfile:'mobile',frameWidth:390,baseSystemPrompt:'本地测试',overrides:layer==='override'?{'page:root':{nid:'root',declarations:{background:'url(data:image/png;base64,YWJjZA==)'}}}:undefined});
  expect(output.status).toBe('error');expect(output.errorMessage).toContain('项目设置');expect(transport.lastRequest).toBeUndefined();
 }
});

test('safe external SVG containers and independent media stay deliverable; failed response diagnostics never store graphic payload',()=>{
 const html=frame('<svg class="icon"><use href="assets/icons/bell.svg#shape"/></svg><img src="assets/images/user.png" alt="用户">');expect(finalizeModelHtml({rawResponse:artifact(html),finishReason:'stop',warnings:[],continuationCount:0}).status).toBe('valid');
 const record=modelExecutionRecord({rawResponse:artifact(frame(cases.svg)),warnings:[],continuationCount:0},{completeHtml:frame(cases.svg)});expect(record.rawResponse).toBe('');expect(record.completeHtml).toBeUndefined();expect(record.responseFingerprint).toHaveLength(8);
 const sectioned=sanitizeExecutionMedia({source:'sectioned-model',rawResponse:'',continuationCount:0,warnings:[],sectioned:{plan:{title:'旧分区',shellHtml:frame(cases.svg),sections:[]},requests:[],completed:0,total:1,requestedOutputTokens:1024,batchRequestedOutputTokens:1024}});expect(sectioned.sectioned).toBeUndefined();expect(sectioned.responseOmitted).toBe('embedded-media');
});
