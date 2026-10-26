import {afterEach,beforeEach,expect,test} from 'bun:test';
import {useProjectStore} from '../src/stores/useProjectStore';
import {useHistoryStore} from '../src/stores/useHistoryStore';
import {defaultTheme} from '../src/utils/themePresets';
const screen={name:'导入',htmlContent:'<main><button>保存</button></main>',metadata:{importedHtml:{version:1 as const,fileName:'source.html',mode:'preserve' as const,categories:[],changes:[],retained:[]}}};
let prior:ReturnType<typeof useProjectStore.getState>,history:ReturnType<typeof useHistoryStore.getState>;
beforeEach(()=>{prior=useProjectStore.getState();history=useHistoryStore.getState();useProjectStore.getState().initNewProject({name:'导入门禁',deviceProfile:'mobile',designSystem:defaultTheme,createSpecimen:false});});
afterEach(()=>{useProjectStore.setState(prior,true);useHistoryStore.setState(history,true);});
test('import without confirmed current preview cannot silently create a page',async()=>{
 const store=useProjectStore.getState(),count=useHistoryStore.getState().past.length;
 let failed=false;try{await store.importHtmlScreen(screen,{projectId:store.id});}catch{failed=true;}
 expect(failed).toBe(true);expect(useProjectStore.getState().screenOrder).toHaveLength(0);expect(useHistoryStore.getState().past).toHaveLength(count);
});
import {analyzeHtmlImport,convertHtmlImport} from '../src/services/import/htmlImport';
import {importPreviewFingerprint} from '../src/services/ai/pageCreationValidation';
import {PageRenderCheck} from '../src/services/ai/pageRenderCheck';
import {createProjectStorage,LocalStorageStorage} from '../src/services/storage/projectStorage';
import {warmCoralTheme} from '../src/utils/themePresets';
import type {HtmlImportMode} from '../src/types/htmlImport';
const originalInspect=PageRenderCheck.inspect;
beforeEach(()=>{PageRenderCheck.inspect=async()=>({status:'complete',findings:[],inspected:4});});
afterEach(()=>{PageRenderCheck.inspect=originalInspect;});
const markup='<html><head><style>.original{padding:17px;background:#ff9800;color:#222;border-radius:13px}</style></head><body><main class="original"><h1>原始标题</h1><button>保存</button></main></body></html>';
function request(mode:HtmlImportMode='preserve',setup:any={},source=markup){
 const s=useProjectStore.getState(),theme=setup.designSystem??s.designSystem,settings={...s.settings,...(setup.colorMode?{colorMode:setup.colorMode}:{}),...(setup.useCustomNavigation!==undefined?{useCustomNavigation:setup.useCustomNavigation}:{})};
 const converted=convertHtmlImport(analyzeHtmlImport(source,'source.html'),{mode,categories:['colors'],designSystem:theme,colorMode:settings.colorMode,deviceProfile:settings.deviceProfile,frameWidth:settings.frameWidth,useCustomNavigation:settings.useCustomNavigation});
 const screen={name:'导入',htmlContent:converted.htmlContent,scopedCss:converted.scopedCss,metadata:{importedHtml:converted.metadata}};
 return {screen,setup:{projectId:s.id,...setup},application:{contract:converted.workflowContract!,preview:{version:1 as const,fingerprint:importPreviewFingerprint(screen,settings,theme)}}};
}
function apply(r= request()){return useProjectStore.getState().importHtmlScreen(r.screen,r.setup,r.application);}
function counts(){const s=useProjectStore.getState(),h=useHistoryStore.getState();return [s.screenOrder.length,h.past.length,h.checkpoints.length];}
for(const mode of ['preserve','unify','selective'] as const)test(`${mode} imports only after actual render and records the full mandatory plan`,async()=>{
 const r=request(mode),id=await apply(r),page=useProjectStore.getState().screens[id],e=page.metadata!.creationEvidence!;
 expect(e.workflow.status).toBe('ready');expect(e.workflow.checks.find(c=>c.id==='import-preview')?.status).toBe('passed');expect(e.render.inspected).toBe(4);
 expect(page.htmlContent).toContain('原始标题');expect(page.htmlContent).toContain(mode==='unify'?'padding:var(--td-import-space-4)':'padding:17px');
 if(mode==='preserve')expect(page.htmlContent).toContain('#ff9800');
 expect(JSON.stringify(e)).not.toContain('rawResponse');
 useHistoryStore.getState().undo();expect(useProjectStore.getState().screens[id]).toBeUndefined();useHistoryStore.getState().redo();expect(useProjectStore.getState().screens[id].metadata!.creationEvidence).toEqual(e);
});
for(const damage of ['preview','content','plan','source','workflow','permission'] as const)test(`${damage} mismatch blocks import before rendering or history writes`,async()=>{
 const r=request();let renders=0;PageRenderCheck.inspect=async()=>{renders++;return {status:'complete',findings:[],inspected:4};};
 if(damage==='preview')r.application.preview.fingerprint='old';if(damage==='content')r.screen.htmlContent+='<!-- changed -->';
 if(damage==='plan')r.application.contract.validationPlan!.fingerprint='forged';if(damage==='source')r.application.contract.target!.baselineFingerprint='other';
 if(damage==='workflow')r.application.contract.workflowId='create-page';if(damage==='permission')r.application.contract.allowedChanges=[];
 const before=counts();await expect(apply(r)).rejects.toThrow();expect(renders).toBe(0);expect(counts()).toEqual(before);
});
for(const change of ['cancel','switch','theme','document','options'] as const)test(`late ${change} during import prevents all page/configuration writes`,async()=>{
 const r=request();let publish!:()=>void;PageRenderCheck.inspect=async()=>{await new Promise<void>(resolve=>publish=resolve);return {status:'complete',findings:[],inspected:4};};
 const controller=new AbortController(),guard={current:true};const pending=useProjectStore.getState().importHtmlScreen(r.screen,r.setup,{...r.application,signal:controller.signal,isCurrent:()=>guard.current});
 await new Promise(resolve=>setTimeout(resolve,0));
 const s=useProjectStore.getState();if(change==='cancel')controller.abort();if(change==='switch')s.initNewProject({name:'其他',deviceProfile:'mobile',designSystem:defaultTheme,createSpecimen:false});
 if(change==='theme')s.setDesignSystem(warmCoralTheme);if(change==='document')s.upsertProjectDocument({id:'summary',title:'整理',content:'新要求',source:'ai',enabled:true,createdAt:1,updatedAt:2});if(change==='options')guard.current=false;
 const before=counts(),theme=useProjectStore.getState().designSystem;publish();await expect(pending).rejects.toThrow();expect(counts()).toEqual(before);expect(useProjectStore.getState().designSystem).toEqual(theme);
});
test('theme extraction and custom navigation are checked with the future theme, then committed atomically',async()=>{
 const r=request('unify',{designSystem:warmCoralTheme,colorMode:'dark',useCustomNavigation:true}),before=counts();let rendered:any;
 PageRenderCheck.inspect=async input=>{rendered=input;return {status:'complete',findings:[],inspected:4};};
 const id=await apply(r);expect(rendered.designSystem).toEqual(warmCoralTheme);expect(rendered.settings.colorMode).toBe('dark');expect(rendered.settings.useCustomNavigation).toBe(true);
 expect(useHistoryStore.getState().past.length).toBe(before[1]+1);expect(useProjectStore.getState().designSystem).toEqual(warmCoralTheme);
 useHistoryStore.getState().undo();expect(useProjectStore.getState().screens[id]).toBeUndefined();expect(useProjectStore.getState().designSystem).toEqual(defaultTheme);expect(useProjectStore.getState().settings.useCustomNavigation).toBe(false);
 useHistoryStore.getState().redo();expect(useProjectStore.getState().settings.useCustomNavigation).toBe(true);
});
for(const status of ['unavailable','incomplete','pending','complete'] as const)test(`render ${status} ${status==='complete'?'with error':''} cannot import`,async()=>{
 PageRenderCheck.inspect=async()=>({status,findings:status==='complete'?[{code:'hidden_action',severity:'error',message:'按钮不可见',actual:'隐藏',expected:'可见'}]:[],inspected:4});
 const before=counts();await expect(apply()).rejects.toThrow();expect(counts()).toEqual(before);
});
const imagePath='assets/images/'+ 'a'.repeat(64)+'.png',fontPath='assets/imports/fonts/'+'b'.repeat(64)+'.woff2';
function withResources(kind:'image'|'font'){
 const path=kind==='image'?imagePath:fontPath;
 const r=request('preserve',kind==='image'?{assets:[{id:'uploaded',name:'图片',relPath:path,type:'image',mimeType:'image/png',source:'upload',refCount:1}]}:{},
  kind==='image'?markup.replace('</main>',`<img src="${path}" alt="图片"></main>`):markup.replace('</style>',`@font-face{font-family:Imported;src:url("${path}")}h1{font-family:Imported}</style>`));
 return {...r,application:{...r.application,resources:{html:r.screen.htmlContent,resources:[],warnings:[],binaries:[{relPath:path,name:kind,base64:'dGVzdA==',mimeType:kind==='image'?'image/png':'font/woff2'}]}}};
}
for(const kind of ['image','font'] as const)test(`${kind} is checked from memory before writing, then physically rechecked and recorded`,async()=>{
 const r=withResources(kind),storage=createProjectStorage(useProjectStore.getState().id),path=kind==='image'?imagePath:fontPath;
 PageRenderCheck.inspect=async(_request,memory)=>{expect(await storage.exists(path)).toBe(false);expect(await memory.readBinary(path)).toBe('dGVzdA==');return {status:'complete',findings:[],inspected:4};};
 const id=await useProjectStore.getState().importHtmlScreen(r.screen,r.setup,r.application);
 expect(await storage.readBinary(path)).toBe('dGVzdA==');expect(useProjectStore.getState().screens[id].metadata!.creationEvidence!.files.map(f=>f.relPath)).toContain(path);
 expect(JSON.stringify(useProjectStore.getState().screens[id].metadata)).not.toContain('dGVzdA==');
});
for(const kind of ['image','font'] as const)test(`missing ${kind} blocks before rendering when no uploaded bytes or physical file exist`,async()=>{
 const r=withResources(kind);r.application.resources.binaries=[];let renders=0;PageRenderCheck.inspect=async()=>{renders++;return {status:'complete',findings:[],inspected:4};};
 const before=counts();await expect(useProjectStore.getState().importHtmlScreen(r.screen,r.setup,r.application)).rejects.toThrow();expect(renders).toBe(0);expect(counts()).toEqual(before);
});
test('render rejection never persists uploaded binaries',async()=>{
 const r=withResources('image');PageRenderCheck.inspect=async()=>({status:'unavailable',findings:[],inspected:0});
 await expect(useProjectStore.getState().importHtmlScreen(r.screen,r.setup,r.application)).rejects.toThrow();expect(await createProjectStorage(useProjectStore.getState().id).exists(imagePath)).toBe(false);
});
test('existing file with different bytes is not overwritten or accepted as the verified preview',async()=>{
 const r=withResources('image'),storage=createProjectStorage(useProjectStore.getState().id);await storage.writeBinary(imagePath,'b3RoZXI=');
 const before=counts();await expect(useProjectStore.getState().importHtmlScreen(r.screen,r.setup,r.application)).rejects.toThrow('不一致');expect(counts()).toEqual(before);expect(await storage.readBinary(imagePath)).toBe('b3RoZXI=');
});
test('write failure or file deletion after writing never commits page, assets or extracted theme',async()=>{
 const original=LocalStorageStorage.prototype.writeBinary;
 for(const kind of ['fail','delete']){
  const r=withResources('image'),before=counts();LocalStorageStorage.prototype.writeBinary=async function(path,data){if(kind==='fail')throw new Error('写入失败');await original.call(this,path,data);await this.remove(path);};
  try{await expect(useProjectStore.getState().importHtmlScreen(r.screen,r.setup,r.application)).rejects.toThrow();expect(counts()).toEqual(before);expect(useProjectStore.getState().assets.uploaded).toBeUndefined();}
  finally{LocalStorageStorage.prototype.writeBinary=original;}
 }
});
test('concurrent confirmation cannot import twice and source inputs are frozen',async()=>{
 const r=request();let publish!:()=>void;PageRenderCheck.inspect=async()=>{await new Promise<void>(resolve=>publish=resolve);return {status:'complete',findings:[],inspected:4};};
 const pending=apply(r);await new Promise(resolve=>setTimeout(resolve,0));await expect(apply(r)).rejects.toThrow('正在核验');
 r.screen.htmlContent='<main>污染</main>';r.application.contract.request='污染请求';publish();const id=await pending;
 expect(useProjectStore.getState().screens[id].htmlContent).toContain('原始标题');expect(useProjectStore.getState().screens[id].metadata!.creationEvidence!.contract.request).not.toBe('污染请求');
});
test('missing bundle resources and newly required unimplemented stages fail closed',async()=>{
 const r=withResources('image');r.application.resources.resources=[{url:'missing.woff2',status:'missing',kind:'font'}] as any;
 await expect(useProjectStore.getState().importHtmlScreen(r.screen,r.setup,r.application)).rejects.toThrow('missing.woff2');
 const {WORKFLOW_CATALOG}=await import('../src/services/ai/workflowCatalog'),descriptor=WORKFLOW_CATALOG['import-html-preserve'],old=descriptor.validationStages;
 try{descriptor.validationStages=[...old,'analysis-schema'];await expect(apply()).rejects.toThrow('analysis-schema');}
 finally{descriptor.validationStages=old;}
});
for(const damage of ['unsafe','truncated'] as const)test(`tampered ${damage} conversion is checked before DOM normalization even with a matching preview identity`,async()=>{
 const r=request();r.screen.htmlContent=damage==='unsafe'?r.screen.htmlContent.replace('<button','<button onclick="go()"'):r.screen.htmlContent+'<scr';
 const s=useProjectStore.getState();r.application.preview.fingerprint=importPreviewFingerprint(r.screen,s.settings,s.designSystem);
 const before=counts();await expect(apply(r)).rejects.toThrow();expect(counts()).toEqual(before);
});
test('import plans cannot remove safety, assets, render or preview even when the descriptor stages are empty',async()=>{
 const {WORKFLOW_CATALOG}=await import('../src/services/ai/workflowCatalog'),{createWorkflowValidationPlan}=await import('../src/services/ai/workflowValidation');
 const plan=createWorkflowValidationPlan({...WORKFLOW_CATALOG['import-html-preserve'],validationStages:[]});
 expect(plan.stages).toEqual(['source-safety','quality','asset-references','asset-files','render','design-entities','import-preview']);
});

for(const mode of ['preserve','selective','unify'] as const)test(`${mode} creation evidence uses source-aware wording without dropping unknown classes`,async()=>{
 const r=request(mode,{},markup.replace('<main class="original">','<main class="original unresolved" style="border-radius:17px">'));
 const id=await apply(r),e=useProjectStore.getState().screens[id].metadata!.creationEvidence!;
 const unknown=e.quality.findings.filter(f=>f.code==='unknown_class');
 expect(unknown.some(f=>f.actual==='unresolved')).toBe(true);
 expect(unknown.every(f=>f.message.includes('页面自带 CSS')&&!f.message.includes('不会产生任何样式'))).toBe(true);
 if(mode!=='unify'){
  const radius=e.quality.findings.find(f=>f.code==='literal_radius');expect(radius?.message).toContain('保留源页面圆角');expect(radius?.expected).toContain('无需替换');
 }
 expect(e.workflow.status).toBe('ready');
});
test('preserve import still refuses an unnamed primary icon-only action without history changes',async()=>{
 const r=request('preserve',{},markup.replace('<button>保存</button>','<button class="btn-primary"><svg viewBox="0 0 24 24"><path d="M1 1L9 9"/></svg></button>'));
 const before=counts();await expect(apply(r)).rejects.toThrow();expect(counts()).toEqual(before);
});
