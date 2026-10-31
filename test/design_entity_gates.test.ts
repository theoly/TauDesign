import {withMultiPageTasks} from './fixtures/multiPageTask';
import {afterEach,beforeEach,expect,test} from 'bun:test';
import {useProjectStore} from '../src/stores/useProjectStore';
import {useHistoryStore} from '../src/stores/useHistoryStore';
import {neutralModernTheme} from '../src/utils/themePresets';
import {PageRenderCheck} from '../src/services/ai/pageRenderCheck';
import {CanvasToolExecutor} from '../src/services/tools/canvasToolExecutor';
import {acceptRestyleResult} from '../src/services/ai/restyleService';
import {loadStagedCandidate} from '../src/services/storage/candidateRepository';
import {analyzeHtmlImport,convertHtmlImport} from '../src/services/import/htmlImport';
import {importPreviewFingerprint} from '../src/services/ai/pageCreationValidation';
import {WORKFLOW_CATALOG} from '../src/services/ai/workflowCatalog';
import {prepareMultiPagePlan,executeMultiPagePlan} from '../src/services/ai/multiPageService';
import type {AIEngineCore} from '../src/services/ai/engine/core/types';

const source='<main data-nid="root" class="col gap-4 p-4"><article data-nid="instance" data-component-id="card" data-component-version="1" class="card p-4"><p data-nid="label">会员资料</p></article><button data-nid="action" class="btn btn-primary" data-target-screen-id="detail">查看详情</button></main>';
const inspect=PageRenderCheck.inspect;
let prior:ReturnType<typeof useProjectStore.getState>,history:ReturnType<typeof useHistoryStore.getState>,renders:number;
beforeEach(()=>{
 prior=useProjectStore.getState();history=useHistoryStore.getState();renders=0;
 const s=useProjectStore.getState();s.initNewProject({name:'实体门禁',deviceProfile:'mobile',designSystem:neutralModernTheme,createSpecimen:false});
 useProjectStore.setState({components:{card:{id:'card',name:'资料卡片',templateHtml:'<article class="card p-4"><p>资料</p></article>',version:3,createdAt:1,updatedAt:1}}});
 s.addScreen({name:'原页',htmlContent:source},'old');s.addScreen({name:'详情',htmlContent:'<main class="p-4">详情内容</main>'},'detail');
 PageRenderCheck.inspect=async()=>{renders++;return {status:'complete',findings:[],inspected:5};};
});
afterEach(async()=>{const s=useProjectStore.getState();s.discardStagedChange();await loadStagedCandidate(s.id);PageRenderCheck.inspect=inspect;useProjectStore.setState(prior,true);useHistoryStore.setState(history,true);});
const counts=()=>[useProjectStore.getState().screenOrder.length,useHistoryStore.getState().past.length,useHistoryStore.getState().checkpoints.length];
function stage(html:string){const s=useProjectStore.getState();s.stageScreenChange('old',html,'修改候选');s.setStagedRenderQuality(s.getStagedRenderContextKey(),{status:'complete',findings:[],inspected:5});return s;}

for(const [name,html] of [
 ['未知组件',source.replace('data-component-id="card"','data-component-id="missing"')],
 ['未来版本',source.replace('data-component-version="1"','data-component-version="4"')],
 ['新旧版本',source.replace('data-nid="instance"','data-nid="newinstance"')],
 ['未知页面',source.replace('data-target-screen-id="detail"','data-target-screen-id="missing"')]
])test(`${name} 候选不能通过普通、强制或保留两版，真实原页和History保持`,async()=>{
 const before=counts(),s=stage(html),report=s.getStagedDeliveryReport();expect(report.status).toBe('blocked');expect(report.checks.find(c=>c.id==='entities')?.status).toBe('blocked');
 expect(await s.adoptStagedChange()).toBe(false);expect(await s.forceAdoptStagedChange()).toBe(false);expect(await s.keepBothScreens()).toBe(false);expect(counts()).toEqual(before);expect(useProjectStore.getState().screens.old.htmlContent).toBe(source);
});
test('旧实例修改保留警告并保存实体工作流证据，重新打开不能复用旧渲染解锁',async()=>{
 const s=stage(source.replace('p-4','p-6'));expect(s.getStagedDeliveryReport().status).toBe('ready');
 const check=s.getStagedDeliveryReport().checks.find(c=>c.id==='entities')!;expect(check.status).toBe('passed');expect(check.message).toContain('本次未同步模板');
 const saved=(await loadStagedCandidate(s.id))!;expect(saved.validationEvidence!.delivery.workflow!.checks.find(c=>c.id==='design-entities')?.message).toContain('v1');
 s.restoreStagedCandidate(saved,s.id);expect(useProjectStore.getState().getStagedDeliveryReport().status).toBe('pending');
 useProjectStore.getState().setStagedRenderQuality(useProjectStore.getState().getStagedRenderContextKey(),{status:'complete',findings:[],inspected:5});
 const before=counts();expect(await s.adoptStagedChange()).toBe(true);expect(counts()[1]).toBe(before[1]+1);expect(useProjectStore.getState().screens.old.htmlContent).toContain('data-component-version="1"');
});
test('门禁每次按当前真实组件和页面表重算，旧通过证据不能放行删除目标',async()=>{
 const s=stage(source.replace('p-4','p-6'));expect(s.getStagedDeliveryReport().status).toBe('ready');
 s.removeScreen('detail');expect(useProjectStore.getState().getStagedDeliveryReport().checks.find(c=>c.id==='entities')?.status).toBe('blocked');expect(await s.forceAdoptStagedChange()).toBe(false);
});
for(const mode of ['preserve','unify','selective'] as const)test(`${mode} 导入未知实体在渲染和写入前阻断`,async()=>{
 const s=useProjectStore.getState(),converted=convertHtmlImport(analyzeHtmlImport('<main><div data-component-id="missing">资料</div></main>','source.html'),{mode,categories:['colors'],designSystem:s.designSystem,colorMode:s.settings.colorMode,deviceProfile:'mobile',frameWidth:390});
 const screen={name:'导入',htmlContent:converted.htmlContent,scopedCss:converted.scopedCss,metadata:{importedHtml:converted.metadata}},before=counts();
 await expect(s.importHtmlScreen(screen,{projectId:s.id},{contract:converted.workflowContract!,preview:{version:1,fingerprint:importPreviewFingerprint(screen,s.settings,s.designSystem)}})).rejects.toThrow('不存在的组件');
 expect(renders).toBe(0);expect(counts()).toEqual(before);
});
for(const kind of ['unknown-component','stale-version','unknown-page'] as const)test(`普通新建 ${kind} 不能借已有页面引用绕过`,async()=>{
 let html=source.replace('data-component-version="1"','data-component-version="3"');if(kind==='unknown-component')html=html.replace('data-component-id="card"','data-component-id="missing"');if(kind==='stale-version')html=source;if(kind==='unknown-page')html=html.replace('data-target-screen-id="detail"','data-target-screen-id="missing"');
 const before=counts(),result=await CanvasToolExecutor.executeAsync({tool:'create_screen',params:{title:'新建',html}});expect(result.success).toBe(false);expect(renders).toBe(0);expect(counts()).toEqual(before);
});
test('实际版本新建通过，实体证据在创建记录中并随一次撤销重做保留',async()=>{
 const result=await CanvasToolExecutor.executeAsync({tool:'create_screen',params:{title:'新建',html:source.replace('data-component-version="1"','data-component-version="3"')}});expect(result.success).toBe(true);
 const s=useProjectStore.getState(),page=s.screens[result.screenId!];expect(page.metadata!.creationEvidence!.workflow.checks.find(c=>c.id==='design-entities')?.status).toBe('passed');
 useHistoryStore.getState().undo();expect(useProjectStore.getState().screens[page.id]).toBeUndefined();useHistoryStore.getState().redo();expect(useProjectStore.getState().screens[page.id].metadata).toEqual(page.metadata);
});
test('重塑保留同身份旧实例，但未知引用不能批量写入',async()=>{
 const s=useProjectStore.getState(),target={kind:'screen' as const,id:'old',name:'原页',html:source};
 const result=await s.applyRestyleOutcome(acceptRestyleResult(target,source.replace('p-4','p-6')));expect(result.applied).toBe(true);expect(result.validation!.workflow!.checks.find(c=>c.id==='design-entities')?.message).toContain('本次未同步模板');
 const baseline=useProjectStore.getState().screens.old.htmlContent,before=counts();const bad=baseline.replace('data-component-id="card"','data-component-id="missing"');
 const rejected=await s.applyRestyleOutcome(acceptRestyleResult({...target,html:baseline},bad));expect(rejected.applied).toBe(false);expect(rejected.message).toContain('不存在的组件');expect(counts()).toEqual(before);expect(useProjectStore.getState().screens.old.htmlContent).toBe(baseline);
});
test('删掉目录声明不能关闭实体检查',async()=>{
 const workflow=WORKFLOW_CATALOG['edit-page-copy'],old=workflow.validationStages;
 try{workflow.validationStages=[];const s=stage(source.replace('data-target-screen-id="detail"','data-target-screen-id="missing"'));expect(s.getStagedDeliveryReport().workflow!.checks.find(c=>c.id==='design-entities')?.status).toBe('blocked');expect(await s.forceAdoptStagedChange()).toBe(false);}
 finally{workflow.validationStages=old;}
});
test('多页面第二页组件引用错误，不交付已经检查通过的第一页',async()=>{
 let calls=0;const core:AIEngineCore={async generateObject(){return withMultiPageTasks({summary:'两个静态页面',pages:[{name:'会员页',requirements:['会员资料'],links:[]},{name:'设置页',requirements:['设置'],links:[]}]}) as any;},streamText(options){calls++;const scope=JSON.parse(options.messages.find(m=>m.role==='system')!.content.match(/confirmedMultiPageScope=(.*); output exactly this page/)![1]);
  const answer=`<artifact identifier="screen_new" type="screen" title="${scope.name}"><main class="p-4"><h1>${scope.name}</h1><div${calls===2?' data-component-id="missing"':''}>资料</div><button class="btn btn-primary">保存</button></main></artifact>`;
  return {textStream:(async function*(){yield answer;})(),reasoningStream:(async function*(){})(),textPromise:Promise.resolve(answer),reasoningPromise:Promise.resolve(undefined),usagePromise:Promise.resolve(undefined),finishReasonPromise:Promise.resolve('stop'),abort(){}};
 }};
 const before=counts(),plan=await prepareMultiPagePlan({state:useProjectStore.getState(),request:'创建两个页面',provider:{id:'fixture',protocol:'openai_compatible',name:'fixture',baseUrl:'https://invalid.local',apiKey:'fixture',isEnabled:true,models:[]} as any,model:'fixture',core,isCurrent:()=>true});
 const result=await executeMultiPagePlan(plan,plan.plan.pages,{getState:()=>useProjectStore.getState(),commit:batch=>{useProjectStore.getState().applyMultiPageCreation(batch);}});expect(result.status).toBe('blocked');expect(result.message).toContain('不存在的组件');expect(calls).toBe(2);expect(renders).toBe(1);expect(counts()).toEqual(before);
});
