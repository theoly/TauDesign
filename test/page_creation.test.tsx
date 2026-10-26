import {afterEach,beforeEach,expect,test} from 'bun:test';
import {useProjectStore} from '../src/stores/useProjectStore';
import {useHistoryStore} from '../src/stores/useHistoryStore';
import {CanvasToolExecutor} from '../src/services/tools/canvasToolExecutor';
import {PageRenderCheck} from '../src/services/ai/pageRenderCheck';
import {buildDesignTaskContract} from '../src/services/ai/designWorkflow';
import {defaultTheme} from '../src/utils/themePresets';
const html='<main data-nid="root"><h1>资料</h1><button data-nid="save" class="btn btn-primary">保存</button></main>';
let prior:ReturnType<typeof useProjectStore.getState>,history:ReturnType<typeof useHistoryStore.getState>;
const inspect=PageRenderCheck.inspect;
beforeEach(()=>{prior=useProjectStore.getState();history=useHistoryStore.getState();useProjectStore.getState().initNewProject({name:'创建门禁',deviceProfile:'mobile',designSystem:defaultTheme,createSpecimen:false});PageRenderCheck.inspect=async()=>({status:'complete',inspected:3,findings:[]});});
afterEach(()=>{PageRenderCheck.inspect=inspect;useProjectStore.setState(prior,true);useHistoryStore.setState(history,true);});
function task(){const s=useProjectStore.getState();return buildDesignTaskContract({intent:'create_screen',request:'创建资料页',deviceProfile:s.settings.deviceProfile,frameWidth:s.settings.frameWidth,designSystem:s.designSystem});}
test('synchronous AI creation cannot bypass actual render validation',()=>{
 const count=useHistoryStore.getState().past.length,checkpoints=useHistoryStore.getState().checkpoints.length;
 const result=CanvasToolExecutor.execute({tool:'create_screen',params:{title:'资料',html}});
 expect(result.success).toBe(false);expect(useProjectStore.getState().screenOrder).toHaveLength(0);
 expect(useHistoryStore.getState().past).toHaveLength(count);expect(useHistoryStore.getState().checkpoints).toHaveLength(checkpoints);
});
test('unsafe source cannot be silently normalized and committed as an AI page',()=>{
 const result=CanvasToolExecutor.execute({tool:'create_screen',params:{title:'危险',html:'<main><button onclick="go()">保存</button><scr'}});
 expect(result.success).toBe(false);expect(useProjectStore.getState().screenOrder).toHaveLength(0);
});
async function create(content=html,contract=task(),options:Parameters<typeof CanvasToolExecutor.executeAsync>[1]={}){
 return CanvasToolExecutor.executeAsync({tool:'create_screen',params:{title:'资料',html:content,workflowContract:contract}},options);
}
function historyCounts(){const h=useHistoryStore.getState();return [h.past.length,h.checkpoints.length];}
test('creation waits for render, stores bounded actual evidence and supports one-step undo/redo',async()=>{
 const count=historyCounts();let publish!:()=>void;
 PageRenderCheck.inspect=async()=>{await new Promise<void>(resolve=>publish=resolve);return {status:'complete',inspected:3,findings:[]};};
 const contract=task(),pending=create(html,contract);await new Promise(resolve=>setTimeout(resolve,0));
 expect(useProjectStore.getState().screenOrder).toHaveLength(0);expect(historyCounts()).toEqual(count);
 publish();const result=await pending;expect(result.success).toBe(true);
 const s=useProjectStore.getState().screens[result.screenId!],e=s.metadata!.creationEvidence!;
 expect(e.workflow.status).toBe('ready');expect(e.workflow.checks.every(c=>c.status==='passed')).toBe(true);expect(e.render.inspected).toBe(3);
 expect(JSON.stringify(e)).not.toContain('rawResponse');expect(JSON.stringify(e)).not.toContain('base64');
 expect(await create(html,contract)).toMatchObject({success:false});
 useHistoryStore.getState().undo();expect(useProjectStore.getState().screenOrder).toHaveLength(0);
 useHistoryStore.getState().redo();expect(useProjectStore.getState().screens[s.id].metadata!.creationEvidence).toEqual(e);
});
for(const damage of ['unknown-workflow','modified-plan','device','permission'] as const)test(`damaged ${damage} fails before render`,async()=>{
 const contract=task();if(damage==='unknown-workflow')contract.workflowId='unknown' as any;
 if(damage==='modified-plan')contract.validationPlan!.fingerprint='modified';if(damage==='device')contract.device.frameWidth=999;
 if(damage==='permission')contract.allowedChanges=[];
 let renders=0;PageRenderCheck.inspect=async()=>{renders++;return {status:'complete',inspected:3,findings:[]};};
 const count=historyCounts();expect((await create(html,contract)).success).toBe(false);expect(renders).toBe(0);expect(historyCounts()).toEqual(count);
});
for(const status of ['unavailable','incomplete','pending','complete'] as const)test(`render ${status}${status==='complete'?' with severe finding':''} rejects creation`,async()=>{
 PageRenderCheck.inspect=async()=>({status,inspected:3,findings:status==='complete'?[{code:'invisible_action',severity:'error',message:'按钮不可见',actual:'透明',expected:'可见'}]:[]});
 const count=historyCounts();expect((await create()).success).toBe(false);expect(historyCounts()).toEqual(count);expect(useProjectStore.getState().screenOrder).toHaveLength(0);
});
for(const registered of [false,true])test(`${registered?'missing':'unregistered'} resources reject new pages`,async()=>{
 if(registered)useProjectStore.getState().addAsset({id:'img',name:'缺失图片',relPath:'assets/images/missing.png',type:'image',mimeType:'image/png',source:'upload',refCount:1});
 const count=historyCounts();expect((await create(html.replace('</main>','<img src="assets/images/missing.png" alt="示例"></main>'))).success).toBe(false);expect(historyCounts()).toEqual(count);
});
for(const change of ['cancel','switch','theme','knowledge','source','metadata','assets','ai-document'] as const)test(`late ${change} during render does not create or checkpoint`,async()=>{
 let publish!:()=>void;PageRenderCheck.inspect=async()=>{await new Promise<void>(resolve=>publish=resolve);return {status:'complete',inspected:3,findings:[]};};
 useProjectStore.getState().addScreen({name:'保留页面',htmlContent:html},'original');
 const controller=new AbortController(),pending=create(html,task(),{signal:controller.signal});await new Promise(resolve=>setTimeout(resolve,0));
 const s=useProjectStore.getState();
 if(change==='cancel')controller.abort();if(change==='switch')s.initNewProject({name:'另一个工程',deviceProfile:'mobile',designSystem:defaultTheme,createSpecimen:false});
 if(change==='theme'){const ds=structuredClone(s.designSystem);ds.tokens.radius.md='27px';s.setDesignSystem(ds);}
 if(change==='knowledge')s.addDecision('新规则','global');if(change==='source')s.updateScreenHtml('original',html.replace('资料','新资料'));
 if(change==='metadata')s.setScreenDesignRole('original',{pageGroup:'新分组'});
 if(change==='ai-document')s.upsertProjectDocument({id:'project-analysis',title:'AI整理需求',content:'新的已归纳要求',source:'ai',enabled:true,createdAt:Date.now(),updatedAt:Date.now()});
 if(change==='assets')s.addAsset({id:'other',name:'图片',relPath:'assets/images/other.png',type:'image',mimeType:'image/png',source:'upload',refCount:1});
 const count=historyCounts(),screens=JSON.stringify(useProjectStore.getState().screens);publish();expect((await pending).success).toBe(false);
 expect(JSON.stringify(useProjectStore.getState().screens)).toBe(screens);expect(historyCounts()).toEqual(count);
});
test('same task cannot run concurrently, and caller mutation cannot change frozen input',async()=>{
 let publish!:()=>void;PageRenderCheck.inspect=async()=>{await new Promise<void>(resolve=>publish=resolve);return {status:'complete',inspected:3,findings:[]};};
 const contract=task(),params={title:'原名称',html,workflowContract:contract};const pending=CanvasToolExecutor.executeAsync({tool:'create_screen',params});
 await new Promise(resolve=>setTimeout(resolve,0));expect((await create(html,contract)).success).toBe(false);
 params.html='<main>污染</main>';contract.request='污染请求';publish();const result=await pending;
 expect(result.success).toBe(true);expect(useProjectStore.getState().screens[result.screenId!].htmlContent).toContain('保存');
 expect(useProjectStore.getState().screens[result.screenId!].metadata!.creationEvidence!.contract.request).toBe('创建资料页');
});
test('viewport pan and measurements do not invalidate a creation',async()=>{
 PageRenderCheck.inspect=async()=>{const s=useProjectStore.getState();s.setViewportTransform({x:2,y:3,scale:.8});return {status:'complete',inspected:3,findings:[]};};
 expect((await create()).success).toBe(true);
});
test('newly required stages without a checker fail before creating or rendering',async()=>{
 const {WORKFLOW_CATALOG}=await import('../src/services/ai/workflowCatalog');const descriptor=WORKFLOW_CATALOG['create-page'],old=descriptor.validationStages;
 try{descriptor.validationStages=[...old,'analysis-schema'];let renders=0;PageRenderCheck.inspect=async()=>{renders++;return {status:'complete',findings:[],inspected:3};};
 expect((await create()).success).toBe(false);expect(renders).toBe(0);expect(useProjectStore.getState().screenOrder).toHaveLength(0);
 }finally{descriptor.validationStages=old;}
});
test('asset deleted during actual rendering is rechecked before the page is committed',async()=>{
 const {createProjectStorage}=await import('../src/services/storage/projectStorage');const state=useProjectStore.getState(),storage=createProjectStorage(state.id);
 await storage.writeBinary('assets/images/valid.png','aW1hZ2U=');state.addAsset({id:'valid',name:'图片',relPath:'assets/images/valid.png',type:'image',mimeType:'image/png',source:'upload',refCount:1});
 PageRenderCheck.inspect=async()=>{await storage.remove('assets/images/valid.png');return {status:'complete',findings:[],inspected:4};};
 const count=historyCounts();const result=await create(html.replace('</main>','<img src="assets/images/valid.png" alt="示例"></main>'));
 expect(result.success).toBe(false);expect(result.error).toContain('不存在');expect(historyCounts()).toEqual(count);
});
test('render exceptions and caller-invalidated results are rejected without history writes',async()=>{
 const count=historyCounts();PageRenderCheck.inspect=async()=>{throw new Error('渲染异常');};
 expect((await create()).error).toContain('渲染异常');expect((await create(html,task(),{isCurrent:()=>false})).success).toBe(false);expect(historyCounts()).toEqual(count);
});
test('creation evidence survives project.json save/load without embedding generated HTML in metadata',async()=>{
 const {createProjectStorage}=await import('../src/services/storage/projectStorage'),{ProjectRepository}=await import('../src/services/storage/projectRepository');
 const result=await create(),s=useProjectStore.getState(),repo=new ProjectRepository(createProjectStorage(s.id));
 await repo.save({id:s.id,name:s.name,settings:s.settings,screens:s.screens,assets:s.assets,overrides:s.overrides,components:s.components,decisions:s.decisions,designSystem:s.designSystem} as any);const loaded=await repo.load(),e=(loaded!.screens as any)[result.screenId!].metadata.creationEvidence;
 expect(e.workflow.status).toBe('ready');expect(e.contract.request).toBe('创建资料页');expect(e).not.toHaveProperty('completeHtml');
 const projectJson=await createProjectStorage(s.id).readText('project.json');expect(projectJson).not.toContain('<main');
});
test('creating a separate page does not replace the current candidate or its baseline',async()=>{
 const store=useProjectStore.getState();store.addScreen({name:'旧页',htmlContent:html},'original');store.stageScreenChange('original',html.replace('保存','确认保存'),'已存在的候选');
 const staged=structuredClone(useProjectStore.getState().stagedScreen);
 try{expect((await create()).success).toBe(true);expect(useProjectStore.getState().stagedScreen).toEqual(staged);expect(useProjectStore.getState().screens.original.htmlContent).toContain('>保存<');}
 finally{useProjectStore.getState().discardStagedChange();const {loadStagedCandidate}=await import('../src/services/storage/candidateRepository');await loadStagedCandidate(store.id);}
});

import {createProjectStorage} from '../src/services/storage/projectStorage';
const importedFont=`assets/imports/fonts/${'a'.repeat(64)}.woff2`;
for(const mode of ['present','missing','removed-during-render'] as const)test(`AI creation font ${mode} uses actual resource reads and records dependencies`,async()=>{
 const state=useProjectStore.getState(),storage=createProjectStorage(state.id),value=`<style>@font-face{font-family:Imported;src:url(${importedFont})}</style>${html}`;
 if(mode!=='missing')await storage.writeBinary(importedFont,'dGVzdA==');
 PageRenderCheck.inspect=async()=>{if(mode==='removed-during-render')await storage.remove(importedFont);return {status:'complete',findings:[],inspected:3};};
 const result=await CanvasToolExecutor.executeAsync({tool:'create_screen',params:{title:'字体页',html:value,workflowContract:task()}});
 expect(result.success).toBe(mode==='present');
 if(mode==='present'){const page=Object.values(useProjectStore.getState().screens)[0];expect(page.metadata?.creationEvidence?.files.map(f=>f.relPath)).toContain(importedFont);}
 else expect(useProjectStore.getState().screenOrder).toEqual([]);
});
