import {afterEach,expect,test} from 'bun:test';
import {createGeneratedMediaProcessor,verifyGeneratedMediaAssets} from '../src/services/ai/generatedMedia';
import {LocalStorageStorage,createProjectStorage} from '../src/services/storage/projectStorage';
import {defaultTheme} from '../src/utils/themePresets';
import {assertExternalMedia,embeddedMediaIssue} from '../src/services/ai/externalMedia';
import {streamWithContinuation} from '../src/services/ai/boundedContinuation';
import {extractArtifact} from '../src/services/ai/engine/pipeline/interceptors/streamTransform';
import {PipelineExecutor} from '../src/services/ai/engine/pipeline/executor';
import {DefaultAIEngineCore} from '../src/services/ai/engine/core/aiEngineCore';
import {MockTransport} from '../src/services/ai/engine/transport/mockTransport';
import {CanvasToolExecutor} from '../src/services/tools/canvasToolExecutor';
import {useProjectStore} from '../src/stores/useProjectStore';
import {useHistoryStore} from '../src/stores/useHistoryStore';
import {PageRenderCheck} from '../src/services/ai/pageRenderCheck';
import {readProjectRenderResources} from '../src/services/ai/projectAssetIntegrity';
import {generateSectionedPage} from '../src/services/ai/sectionedGeneration';
const settings={deviceProfile:'mobile' as const,frameWidth:390,viewportGuideHeight:844,showViewportGuide:true,colorMode:'light' as const,lodBudget:12};
const svg='<svg class="icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"><title>能量分布</title><path d="M12 2L22 18L2 18Z"/></svg>';
const html=`<main class="p-4"><h1>决策助手</h1>${svg}<button class="btn btn-primary">开始分析</button></main>`;
const provider={id:'q',name:'Q',protocol:'openai_compatible' as const,baseUrl:'https://workspace.cn-beijing.maas.aliyuncs.com/compatible-mode/v1',apiKey:''};
function engine(outputs:Array<[string,string]>){let calls=0;const core={streamText(){calls++;const [text,reason]=outputs.shift()!;return {textStream:(async function*(){yield text;})(),reasoningStream:(async function*(){})(),textPromise:Promise.resolve(text),reasoningPromise:Promise.resolve(''),usagePromise:Promise.resolve({inputTokens:2,outputTokens:3}),finishReasonPromise:Promise.resolve(reason),abort(){}};},async generateObject<T>():Promise<T>{throw Error('unused');}};return {core,count:()=>calls};}
const options={provider,model:'qwen-plus',messages:[{role:'user' as const,content:'设计主页'}]};
const fixture=()=>{const storage=new LocalStorageStorage('generated-media-'+crypto.randomUUID());return {storage,processor:createGeneratedMediaProcessor({storage,settings,designSystem:defaultTheme})};};
test('static generated SVG becomes a real hash-verified file; only references enter page or registry metadata',async()=>{
 const {storage,processor}=fixture(),result=await processor.prepare(html),assets=await processor.collect(result);
 expect(()=>assertExternalMedia(result)).not.toThrow();expect(result).not.toContain('<path');expect(result).toContain('currentColor');expect(result).toContain('能量分布');expect(assets).toHaveLength(1);
 expect(JSON.stringify(assets)).not.toMatch(/base64|<svg|data:image/);await verifyGeneratedMediaAssets(storage,assets);
 expect(atob((await storage.readBinary(assets[0].relPath))!)).toContain('M12 2L22 18L2 18Z');
 expect(await processor.prepare(html)).toBe(result);expect(await storage.listDir('assets/images')).toHaveLength(1);
});
test('generated vector processing does not relax the default external media guard',async()=>{
 const strict=engine([[`<artifact>${html}</artifact>`,'stop']]);expect((await streamWithContinuation(strict.core,options,{externalMediaOnly:true})).errorMessage).toContain('独立文件');
 const f=fixture(),e=engine([[`<artifact title="主页">${html}</artifact>`,'stop']]);const result=await streamWithContinuation(e.core,options,{externalMediaOnly:true,prepareGeneratedHtml:f.processor.prepare});
 expect(result.errorMessage).toBeUndefined();expect(e.count()).toBe(1);expect(extractArtifact(result.rawResponse)?.title).toBe('主页');expect(embeddedMediaIssue(result.rawResponse)).toBeUndefined();
});
test('bounded SVG continuation completes in memory; a truncated graphic never becomes a persisted checkpoint',async()=>{
 const f=fixture(),prefix='<artifact><main><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M0 0';
 const e=engine([[prefix,'length'],['L24 24"/></svg></main></artifact>','stop']]);
 const result=await streamWithContinuation(e.core,options,{externalMediaOnly:true,prepareGeneratedHtml:f.processor.prepare});expect(result.errorMessage).toBeUndefined();expect(e.count()).toBe(2);expect(result.continuationCount).toBe(1);expect(embeddedMediaIssue(result.rawResponse)).toBeUndefined();
 const partial=engine([[prefix,'length']]);const stopped=await streamWithContinuation(partial.core,options,{externalMediaOnly:true,prepareGeneratedHtml:f.processor.prepare,budget:{autoContinuations:0}});expect(stopped.checkpoint).toBeUndefined();expect(stopped.rawResponse).toBe(prefix);
});
for(const unsafe of [svg.replace('<path','<script>alert(1)</script><path'),svg.replace('<path','<path onclick="run()"'),svg.replace('<path','<foreignObject><div>HTML</div></foreignObject><path'),'<img src="data:image/png;base64,YQ==">','<img src="blob:temporary">'])test('unsafe/encoded media is refused before asset writes: '+unsafe.slice(0,45),async()=>{
 const {storage,processor}=fixture();await expect(processor.prepare(`<main>${unsafe}</main>`)).rejects.toThrow();expect(await storage.listDir('assets/images')).toEqual([]);
});
test('media from stale/cancelled contexts and hash conflicts never overwrites a resource',async()=>{
 const {storage,processor}=fixture(),result=await processor.prepare(html),assets=await processor.collect(result),path=assets[0].relPath;
 await storage.writeBinary(path,btoa('tampered'));await expect(processor.prepare(html)).rejects.toThrow('冲突');expect(await storage.readBinary(path)).toBe(btoa('tampered'));await expect(processor.collect(result)).rejects.toThrow('SHA-256');
 const aborted=new AbortController();aborted.abort();await expect(createGeneratedMediaProcessor({storage,settings,designSystem:defaultTheme,signal:aborted.signal}).prepare(html)).rejects.toThrow('取消');
 await expect(createGeneratedMediaProcessor({storage,settings,designSystem:defaultTheme,isCurrent:()=>false}).prepare(html)).rejects.toThrow('已变化');
});
test('V2 section preparation happens before the completed checkpoint and merge',async()=>{
 const f=fixture(),e=engine([[`<artifact><section>${svg}<p>五行能量</p></section></artifact>`,'stop']]);let checkpoint='';
 const result=await generateSectionedPage(e.core,options,'context',{preplanned:{version:2,title:'首页',shellHtml:'<main><section data-design-slot="section-1"></section></main>',sections:[{id:'section-1',name:'能量',requirements:'展示五行能量'}]},prepareGeneratedHtml:f.processor.prepare,onCheckpoint:async(_plan,parts)=>{checkpoint=parts.map(p=>p.html).join('');}});
 expect(result.errorMessage).toBeUndefined();expect(checkpoint).toContain('assets/images/');expect(embeddedMediaIssue(checkpoint)).toBeUndefined();expect(result.rawResponse).toContain('五行能量');
});
test('chat pipeline returns verified asset identities without a second model request',async()=>{
 const f=fixture(),transport=new MockTransport();transport.queueResponse(`<artifact title="主页">${html}</artifact>`);let calls=0;
 const core=new DefaultAIEngineCore({id:'capture',stream:(request,event)=>{calls++;return transport.stream(request,event);}});
 const result=await PipelineExecutor.execute({input:{rawPrompt:'创建决策助手主页',activeScreenId:null},provider,model:'qwen-plus',engineCore:core,screens:{},deviceProfile:'mobile',frameWidth:390,designSystem:defaultTheme,baseSystemPrompt:'test',generatedMedia:{storage:f.storage,settings}});
 expect(result.status).toBe('applied');expect(calls).toBe(1);expect(result.generatedAssets).toHaveLength(1);expect(result.extractedHtml).toContain('assets/images/');expect(result.executionRecord?.completeHtml).not.toContain('<path');
});
const prior=useProjectStore.getState(),past=useHistoryStore.getState(),inspect=PageRenderCheck.inspect;
afterEach(()=>{PageRenderCheck.inspect=inspect;useProjectStore.setState(prior,true);useHistoryStore.setState(past,true);});
test('page and verified generated asset share a History commit; render rejection adds neither',async()=>{
 useProjectStore.getState().initNewProject({name:'媒体发布',deviceProfile:'mobile',designSystem:defaultTheme,createSpecimen:false});const state=useProjectStore.getState(),storage=createProjectStorage(state.id,state.folderPath),processor=createGeneratedMediaProcessor({storage,settings:state.settings,designSystem:state.designSystem});
 const converted=await processor.prepare(html),assets=await processor.collect(converted),call={tool:'create_screen' as const,params:{title:'决策助手',html:converted,generatedAssets:assets}};
 PageRenderCheck.inspect=async()=>({status:'unavailable',inspected:0,findings:[]});expect((await CanvasToolExecutor.executeAsync(call)).success).toBe(false);expect(Object.keys(useProjectStore.getState().assets)).toHaveLength(0);
 PageRenderCheck.inspect=async request=>({status:'complete',inspected:5,findings:[],resourceFiles:(await readProjectRenderResources(storage,[request.screen],request.assets)).resourceFiles});const result=await CanvasToolExecutor.executeAsync(call);expect(result.error).toBeUndefined();expect(result.success).toBe(true);expect(useProjectStore.getState().assets[assets[0].id]).toBeDefined();
 useHistoryStore.getState().undo();expect(useProjectStore.getState().screenOrder).toHaveLength(0);expect(Object.keys(useProjectStore.getState().assets)).toHaveLength(0);
 useHistoryStore.getState().redo();expect(useProjectStore.getState().screenOrder).toHaveLength(1);expect(useProjectStore.getState().assets[assets[0].id]).toBeDefined();
});

test('a saved failed draft retains external media; label repair reuses files without another model call',async()=>{
 const {draftRepairTargets}=await import('../src/services/ai/qualityDraft');
 const {storage}=fixture(),transport=new MockTransport();transport.queueResponse(`<artifact title="主页"><main>${svg}<button class="btn btn-primary">${svg.replace('<title>能量分布</title>','')}<span></span></button></main></artifact>`);let calls=0;
 const core=new DefaultAIEngineCore({id:'capture',stream:(r,e)=>{calls++;return transport.stream(r,e);}});
 const opts={input:{rawPrompt:'创建主页',activeScreenId:null},provider,model:'qwen-plus',engineCore:core,screens:{},deviceProfile:'mobile' as const,frameWidth:390,designSystem:defaultTheme,baseSystemPrompt:'test',generatedMedia:{storage,settings}};
 const rejected=await PipelineExecutor.execute(opts);expect(rejected.status).toBe('rejected_by_quality');const draft=JSON.parse(JSON.stringify(rejected.failedDraft!));
 expect(draft.html).toContain('assets/images/');expect(JSON.stringify(draft)).not.toContain('<path');
 const targets=draftRepairTargets(draft);expect(targets).toHaveLength(1);
 const repaired=await PipelineExecutor.execute({...opts,qualityRepair:{draft,labels:targets.map(t=>({nid:t.nid,text:'开始分析'}))}});
 expect(repaired.status).toBe('applied');expect(calls).toBe(1);expect(repaired.generatedAssets).toHaveLength(2);expect(repaired.extractedHtml).toContain('开始分析');
});

for(const treeMode of [false,true])test('multi-page production path registers generated media with batch; shared tree='+treeMode,async()=>{
 const {prepareMultiPagePlan,executeMultiPagePlan}=await import('../src/services/ai/multiPageService');
 const {withMultiPageTasks}=await import('./fixtures/multiPageTask');
 useProjectStore.getState().initNewProject({name:'多页媒体',deviceProfile:'mobile',designSystem:defaultTheme,createSpecimen:false});
 const core={async generateObject<T>(schema:any,request:any):Promise<T>{if(schema.properties.rootRequirements){const text=request.messages.at(-1).content,pages=JSON.parse(text.slice(text.lastIndexOf('\n')+1));return {version:1,rootRequirements:'共用消息图标',groups:[],leaves:pages.map((p:any)=>({pageId:p.id,parentId:'root'}))} as T;}return withMultiPageTasks({summary:'两个主页',pages:[{name:'能量页',requirements:['能量与操作'],links:[]},{name:'工具页',requirements:['工具与操作'],links:[]}]}) as T;},streamText(o:any){
  const system=o.messages.find((m:any)=>m.role==='system').content,scope=system.match(/confirmedMultiPageScope=(.*); output exactly this page/);
  const text=o.provenance?.stepId==='root'?`<artifact><main class="col"><header>${svg}</header><div data-generation-slot="content-root"></div></main></artifact>`:`<artifact title="${JSON.parse(scope![1]).name}">${html}</artifact>`;
  return {textStream:(async function*(){yield text;})(),reasoningStream:(async function*(){})(),textPromise:Promise.resolve(text),reasoningPromise:Promise.resolve(undefined),usagePromise:Promise.resolve(undefined),finishReasonPromise:Promise.resolve('stop'),abort(){}};
 }};
 PageRenderCheck.inspect=async(request,storage)=>({status:'complete',inspected:5,findings:[],resourceFiles:(await readProjectRenderResources(storage,[request.screen],request.assets)).resourceFiles});
 const prepared=await prepareMultiPagePlan({state:useProjectStore.getState(),request:'生成能量页和工具页两个页面',provider,model:'mock',core,isCurrent:()=>true});
 const result=await executeMultiPagePlan(prepared,prepared.plan.pages,{getState:()=>useProjectStore.getState(),commit:batch=>useProjectStore.getState().applyMultiPageCreation(batch),...(treeMode?{generationTree:{concurrency:1 as const}}:{})});
 expect(result.message).not.toContain('失败');expect(result.status).toBe('complete');expect(Object.keys(useProjectStore.getState().assets)).toHaveLength(1);expect(useProjectStore.getState().screenOrder).toHaveLength(2);
 useHistoryStore.getState().undo();expect(useProjectStore.getState().screenOrder).toHaveLength(0);expect(Object.keys(useProjectStore.getState().assets)).toHaveLength(0);
});

test('modify path verifies independent media before staging while leaving the original page unchanged',async()=>{
 useProjectStore.getState().initNewProject({name:'候选媒体',deviceProfile:'mobile',designSystem:defaultTheme,createSpecimen:false});
 const state=useProjectStore.getState(),id=state.addScreen({name:'原页',htmlContent:'<main><h1>原页</h1></main>'}),original=useProjectStore.getState().screens[id].htmlContent;
 const processor=createGeneratedMediaProcessor({storage:createProjectStorage(state.id,state.folderPath),settings:state.settings,designSystem:state.designSystem});
 const converted=await processor.prepare(html),assets=await processor.collect(converted);
 const result=await CanvasToolExecutor.executeAsync({tool:'modify_screen',params:{screenId:id,html:converted,generatedAssets:assets}});
 expect(result.success).toBe(true);expect(useProjectStore.getState().screens[id].htmlContent).toBe(original);expect(useProjectStore.getState().stagedScreen?.newHtml).toContain('assets/images/');expect(Object.keys(useProjectStore.getState().assets)).toHaveLength(1);
});

test('generated asset metadata cannot carry an extra binary payload into History',async()=>{
 const f=fixture(),converted=await f.processor.prepare(html),assets=await f.processor.collect(converted);
 await expect(verifyGeneratedMediaAssets(f.storage,[{...assets[0],payload:'encoded bytes'} as any])).rejects.toThrow('身份');
});
