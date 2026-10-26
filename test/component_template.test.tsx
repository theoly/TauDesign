import {prepareMultiPagePlan,executeMultiPagePlan} from '../src/services/ai/multiPageService';
import type {AIEngineCore} from '../src/services/ai/engine/core/types';
import {afterEach,beforeEach,expect,test} from 'bun:test';
import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {compileComponentTemplate,assertComponentInstance,projectSlottedComponent} from '../src/utils/componentTemplate';
import {inspectDesignEntities} from '../src/services/ai/designEntityValidation';
import {projectComponentSync} from '../src/utils/componentSync';
import {renderProjectComponents} from '../src/services/ai/componentContracts';
import {useProjectStore} from '../src/stores/useProjectStore';
import {useHistoryStore} from '../src/stores/useHistoryStore';
import {neutralModernTheme} from '../src/utils/themePresets';
import {ComponentContractEditor} from '../src/components/assets/ComponentContractEditor';
import {libraryComponentFingerprint,buildLibraryReferenceSnapshot,libraryReferenceIssue} from '../src/services/ai/designLibraryReference';
import {readDesignLibraryCopy} from '../src/services/ai/designLibraryCopy';
import {createProjectStorage} from '../src/services/storage/projectStorage';
import {ProjectRepository} from '../src/services/storage/projectRepository';
import {PageRenderCheck} from '../src/services/ai/pageRenderCheck';
import {CanvasToolExecutor} from '../src/services/tools/canvasToolExecutor';
import {analyzeHtmlImport,convertHtmlImport} from '../src/services/import/htmlImport';
import {importPreviewFingerprint} from '../src/services/ai/pageCreationValidation';
import {acceptRestyleResult} from '../src/services/ai/restyleService';
import {buildDesignTaskContract} from '../src/services/ai/designWorkflow';
import type {ComponentDefinition,SlotDef} from '../src/types/project';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
const template='<article class="card"><h2 data-slot="title">默认标题</h2><p class="text-secondary">固定提示</p><img data-slot="photo" src="https://example.com/default.png" alt="默认图片"><div data-slot="body"><p>默认正文</p></div></article>';
const slots:SlotDef[]=[{slotName:'title',selector:'[data-slot="title"]',type:'text',defaultContent:'默认标题'},{slotName:'photo',selector:'[data-slot="photo"]',type:'image',defaultContent:'默认图片'},{slotName:'body',selector:'[data-slot="body"]',type:'node',defaultContent:'默认正文'}];
const component:ComponentDefinition={id:'card',name:'资料卡',templateHtml:template,templateContract:{version:1},slotDefs:slots,version:2,createdAt:1,updatedAt:1};
const instance=(content=template,version='2')=>{const root=new DOMParser().parseFromString(content,'text/html').body.firstElementChild!;root.setAttribute('data-nid','instance');root.setAttribute('data-component-id','card');root.setAttribute('data-component-instance','anything');root.setAttribute('data-component-version',version);return root.outerHTML;};
const el=(html:string)=>new DOMParser().parseFromString(html,'text/html').body.firstElementChild!;
const report=(html:string,baselineHtml?:string,c=component)=>inspectDesignEntities(html,{components:{card:c},pageIds:[],baselineHtml});
let prior:ReturnType<typeof useProjectStore.getState>,history:ReturnType<typeof useHistoryStore.getState>,root:Root|undefined,host:HTMLDivElement;
const renderCheck=PageRenderCheck.inspect;
beforeEach(()=>{prior=useProjectStore.getState();history=useHistoryStore.getState();useProjectStore.getState().initNewProject({name:'模板合同',deviceProfile:'mobile',designSystem:neutralModernTheme,createSpecimen:false});});
afterEach(()=>{if(root)act(()=>root!.unmount());root=undefined;host?.remove();PageRenderCheck.inspect=renderCheck;useProjectStore.setState(prior,true);useHistoryStore.setState(history,true);});
test('只在声明槽变化时通过，NID/实例ID与类顺序不影响合同，输入不变',()=>{
 const source=instance().replace('默认标题','王先生').replace('https://example.com/default.png','https://example.com/user.png').replace('默认图片','用户图片').replace('<p>默认正文</p>','<ul><li>用户正文</li></ul>');
 const before=JSON.stringify(component),dom=el(source);expect(()=>assertComponentInstance(dom,component)).not.toThrow();expect(report(source).passed).toBe(true);expect(JSON.stringify(component)).toBe(before);expect(dom.outerHTML).toBe(el(source).outerHTML);
 const c={...component,templateHtml:template.replace('class="card"','class="card col"')};expect(report(source.replace('class="card"','class="col card"'),undefined,c).passed).toBe(true);
});
for(const kind of ['root','node','fixed-text','class','style','slot-wrapper','slot-type','photo-size','nested-text','extra-attribute','link'] as const)test(`伪造同版本 ${kind} 必须拒绝`,()=>{
 let html=instance();if(kind==='root')html=html.replaceAll('article','section');if(kind==='node')html=html.replace('<p class="text-secondary">','<aside class="text-secondary">').replace('固定提示</p>','固定提示</aside>');if(kind==='fixed-text')html=html.replace('固定提示','丢失提示');if(kind==='class')html=html.replace('class="card"','class="card row"');if(kind==='style')html=html.replace('<h2','<h2 style="font-size:0"');if(kind==='slot-wrapper')html=html.replace('<div data-slot="body"','<section data-slot="body"').replace('</div>','</section>');if(kind==='slot-type')html=html.replace('<img','<div').replace('alt="默认图片">','alt="默认图片"></div>');if(kind==='photo-size')html=html.replace('<img','<img width="0"');if(kind==='nested-text')html=html.replace('默认标题','<span>新标题</span>');if(kind==='extra-attribute')html=html.replace('<h2','<h2 aria-hidden="true"');if(kind==='link')html=html.replace('<article','<article data-target-screen-id="missing"');
 expect(report(html).passed).toBe(false);expect(report(html).findings.some(f=>f.code==='component_template_mismatch')).toBe(true);
});
for(const kind of ['version','empty','unsafe','multi-root','invalid-selector','duplicate-name','overlap','missing','multi-match','wrong-type','many','nested-template','root-text'] as const)test(`坏合同 ${kind} 不得降级或静默放行`,()=>{
 const c=structuredClone(component);if(kind==='version')c.templateContract={version:2} as any;if(kind==='empty')c.templateHtml='';if(kind==='unsafe')c.templateHtml=template.replace('<h2','<h2 onclick="bad()"');if(kind==='multi-root')c.templateHtml+='<div>多根</div>';
 if(kind==='invalid-selector')c.slotDefs![0].selector='h2';if(kind==='duplicate-name')c.slotDefs!.push({...c.slotDefs![0]});if(kind==='overlap')c.slotDefs!.push({slotName:'root',selector:':scope',type:'node',defaultContent:''});if(kind==='missing')c.slotDefs![0].selector='[data-slot="missing"]';if(kind==='multi-match')c.templateHtml=c.templateHtml.replace('</article>','<h2 data-slot="title">重复</h2></article>');if(kind==='wrong-type')c.slotDefs![0].type='image';if(kind==='many')c.slotDefs=Array(21).fill(slots[0]);if(kind==='nested-template'){c.templateHtml=template.replace('<h2','<template><h2').replace('</h2>','</h2></template>');}if(kind==='root-text')c.slotDefs=[{slotName:'root',selector:':scope',type:'text',defaultContent:''}];
 expect(()=>compileComponentTemplate(c)).toThrow();expect(report(instance(),undefined,c).passed).toBe(false);expect(report(instance(),undefined,c).findings[0].code).toBe(kind==='empty'?'invalid_component_definition':'invalid_component_template_contract');
});
test('纯文本根插槽允许安全修改，节点槽不能覆盖包装属性',()=>{
 const c={...component,templateHtml:'<button class="btn">默认</button>',slotDefs:[{slotName:'label',selector:':scope',type:'text',defaultContent:'默认'}] as SlotDef[]};
 expect(report(instance('<button class="btn">用户文案</button>'),undefined,c).passed).toBe(true);expect(report(instance('<button class="btn" disabled>用户文案</button>'),undefined,c).passed).toBe(false);
});
test('严格新无版本拒绝；原同身份无版本/旧版本兼容但明确警告，不假装当前模板通过',()=>{
 const unversioned=instance().replace(' data-component-version="2"','');expect(report(unversioned).passed).toBe(false);expect(report(unversioned,unversioned).findings[0].severity).toBe('warning');
 expect(report(instance(template,'1'),instance(template,'1')).passed).toBe(true);expect(report(instance(template,'1')).passed).toBe(false);
 const legacy={...component,templateContract:undefined};expect(report(instance('<section>随意内容</section>'),undefined,legacy).passed).toBe(true);
});
test('同步按名字保留文本/图片/节点，即使模板调换顺序也不会串位；原实例不变',()=>{
 const source=el(instance().replace('默认标题','用户标题').replace('https://example.com/default.png','https://example.com/user.png').replace('<p>默认正文</p>','<strong data-nid="body-text">个人正文</strong>'));
 const next={...component,templateHtml:template.replace('<h2 data-slot="title">默认标题</h2>','').replace('</article>','<h2 data-slot="title">新版标题</h2></article>').replace('固定提示','新版固定提示')};
 const before=source.outerHTML,result=projectSlottedComponent(next,source);expect(result.querySelector('h2')!.textContent).toBe('用户标题');expect(result.querySelector('img')!.getAttribute('src')).toContain('user.png');expect(result.querySelector('strong')!.textContent).toBe('个人正文');expect(result.querySelector('p')!.textContent).toBe('新版固定提示');expect(source.outerHTML).toBe(before);expect(()=>assertComponentInstance(result,next)).not.toThrow();
});
test('同步不匹配/不安全槽或L4冲突时跳过，不抹平用户内容',()=>{
 for(const source of [instance().replace('data-slot="title"','data-slot="missing"'),instance().replace('默认标题','<b>复杂正文</b>'),instance().replace('默认正文','<script>alert(1)</script>')]){
 const result=projectComponentSync(component,[{id:'page',name:'页面',htmlContent:source,position:{x:0,y:0}}],{});expect(result.screens).toHaveLength(0);expect(result.skippedConflictCount).toBe(1);expect(result.syncedCount).toBe(0);}
 const result=projectComponentSync(component,[{id:'page',name:'页面',htmlContent:instance(),position:{x:0,y:0}}],{'page:instance':{nid:'instance',declarations:{color:'red'}} as any});expect(result.skippedConflictCount).toBe(1);
});
test('合同与槽变动递增版本，单条History可撤销重做，坏合同在写入前抛错',async()=>{
 const s=useProjectStore.getState(),id=s.createComponent('卡片',template),before=useHistoryStore.getState().past.length;
 s.updateComponent(id,{templateContract:{version:1},slotDefs:slots});expect(useProjectStore.getState().components[id].version).toBe(2);expect(useHistoryStore.getState().past.length).toBe(before+1);
 useHistoryStore.getState().undo();expect(useProjectStore.getState().components[id].templateContract).toBeUndefined();useHistoryStore.getState().redo();expect(useProjectStore.getState().components[id].slotDefs).toEqual(slots);
 expect(()=>s.updateComponent(id,{slotDefs:[{...slots[0],selector:'missing'}]})).toThrow();expect(useProjectStore.getState().components[id].version).toBe(2);
 s.updateComponent(id,{slotDefs:undefined});expect(useProjectStore.getState().components[id].version).toBe(3);
 const storage=createProjectStorage(s.id);const current=useProjectStore.getState();await new ProjectRepository(storage).save({id:current.id,name:current.name,schemaVersion:1,createdAt:Date.now(),updatedAt:Date.now(),settings:current.settings,designSystem:current.designSystem,screens:current.screens,screenOrder:current.screenOrder,components:current.components,overrides:current.overrides,assets:current.assets,decisions:current.decisions} as any);const loaded=await new ProjectRepository(storage).load();expect(loaded!.components![id].templateContract).toEqual({version:1});
});
test('导入副本/参考保留合同和模板，指纹覆盖合同且旧指纹算法保持，坏槽源拒绝',async()=>{
 const s=useProjectStore.getState();let data={id:'source',name:'来源',settings:s.settings,designSystem:s.designSystem,components:{card:component},assets:{}};
 const source={readText:async()=>JSON.stringify(data),readBinary:async()=>null};const copy=await readDesignLibraryCopy(source);const c=Object.values(copy.components)[0];expect(c.templateContract).toEqual({version:1});expect(c.slotDefs).toEqual(slots);
 const first=copy.binding.sourceFingerprint;data={...data,components:{card:{...component,templateContract:undefined}}} as any;const second=await readDesignLibraryCopy(source);expect(second.binding.sourceFingerprint).not.toBe(first);expect(libraryComponentFingerprint(c)).not.toBe(libraryComponentFingerprint({...c,templateContract:undefined}));
 data={...data,components:{card:{...component,slotDefs:[{...slots[0],selector:'bad'}]}}};await expect(readDesignLibraryCopy(source)).rejects.toThrow();
 const snapshot=buildLibraryReferenceSnapshot(s.designSystem,{card:component},{});expect(libraryReferenceIssue({designSystem:s.designSystem,components:{card:{...component,templateContract:undefined}},assets:{},designLibraryBinding:{mode:'pinned_reference',referenceSnapshot:snapshot} as any})).toContain('不一致');
});
test('Prompt包含完整槽合同；超预算组件整项不提供，不臆造可编辑槽',()=>{
 const text=renderProjectComponents([component]);expect(text).toContain('slotDefs=');expect(text).toContain('固定结构/属性/文案必须保持');expect(text).toContain('[data-slot=');expect(renderProjectComponents([component],10)).not.toContain('slotDefs=');
});
function mount(c=component){host=document.createElement('div');document.body.append(host);root=createRoot(host);act(()=>root!.render(<ComponentContractEditor component={c}/>));}
const click=(text:string)=>act(()=>Array.from(host.querySelectorAll('button')).find(b=>b.textContent===text)!.click());
function change(area:HTMLTextAreaElement,value:string){act(()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(area,value);area.dispatchEvent(new Event('input',{bubbles:true}));area.dispatchEvent(new Event('change',{bubbles:true}));});}
test('配置UI明确保存/取消/校验错误，不自动同步页面',()=>{
 useProjectStore.setState({components:{card:component}});mount();click('配置复用约束');change(host.querySelector('[aria-label="组件插槽 JSON"]')!,'{bad');click('保存复用约束');expect(host.textContent).toContain('JSON 格式不正确');expect(useProjectStore.getState().components.card.version).toBe(2);click('取消配置');expect(host.querySelector('textarea')).toBeNull();
});
test('旧表单在组件或工程改变后拒绝保存，只读库配置入口禁用',()=>{
 useProjectStore.setState({components:{card:component}});mount();click('配置复用约束');useProjectStore.getState().updateComponent('card',{description:'外部更新'});click('保存复用约束');expect(host.textContent).toContain('已变化');
 act(()=>root!.unmount());root=undefined;useProjectStore.setState({designLibraryBinding:{mode:'pinned_reference',referenceSnapshot:{components:{card:'hash'}}} as any});root=createRoot(host);act(()=>root!.render(<ComponentContractEditor component={component}/>));expect(host.querySelector('button')!.disabled).toBe(true);
});
test('新建实际应用复用实体门禁：同版本伪模板在实际渲染前拒绝，合格插槽内容可交付',async()=>{
 useProjectStore.setState({components:{card:component}});let renders=0;PageRenderCheck.inspect=async()=>{renders++;return {status:'complete',inspected:8,findings:[]};};
 const s=useProjectStore.getState(),task=()=>buildDesignTaskContract({intent:'create_screen',request:'新建资料页',deviceProfile:'mobile',frameWidth:390,designSystem:s.designSystem});
 const bad=await CanvasToolExecutor.executeAsync({tool:'create_screen',params:{title:'坏模板',html:`<main>${instance().replace('固定提示','错误内容')}</main>`,workflowContract:task()}});expect(bad.success).toBe(false);expect(renders).toBe(0);
 const good=await CanvasToolExecutor.executeAsync({tool:'create_screen',params:{title:'正确模板',html:`<main>${instance().replace('默认标题','用户标题')}</main>`,workflowContract:task()}});expect(good.success).toBe(true);expect(renders).toBe(1);
});

for(const kind of ['fixed-text','class'])test(`严格候选${kind}不可被普通/强制/两版采纳绕过`,async()=>{
 useProjectStore.setState({components:{card:component}});const s=useProjectStore.getState(),source=`<main>${instance()}</main>`;s.addScreen({name:'原页',htmlContent:source},'old');
 const changed=source.replace(kind==='class'?'class="card"':'固定提示',kind==='class'?'class="card p-4"':'伪造提示');s.stageScreenChange('old',changed,'候选');s.setStagedRenderQuality(s.getStagedRenderContextKey(),{status:'complete',inspected:10,findings:[]});
 const before=useHistoryStore.getState().past.length;expect(s.getStagedDeliveryReport().checks.find(c=>c.id==='entities')?.status).toBe('blocked');expect(await s.adoptStagedChange()).toBe(false);expect(await s.forceAdoptStagedChange()).toBe(false);expect(await s.keepBothScreens()).toBe(false);expect(useHistoryStore.getState().past.length).toBe(before);expect(useProjectStore.getState().screens.old.htmlContent).toBe(source);
});
for(const mode of ['preserve','unify','selective'] as const)test(`严格模板${mode}导入不能改固定区域`,async()=>{
 useProjectStore.setState({components:{card:component}});const s=useProjectStore.getState(),html=`<main>${instance().replace('固定提示','伪造提示')}</main>`;
 const converted=convertHtmlImport(analyzeHtmlImport(html,'source.html'),{mode,categories:['colors'],designSystem:s.designSystem,colorMode:s.settings.colorMode,deviceProfile:'mobile',frameWidth:390});
 const screen={name:'导入',htmlContent:converted.htmlContent,scopedCss:converted.scopedCss,metadata:{importedHtml:converted.metadata}},before=useHistoryStore.getState().past.length;
 await expect(s.importHtmlScreen(screen,{projectId:s.id},{contract:converted.workflowContract!,preview:{version:1,fingerprint:importPreviewFingerprint(screen,s.settings,s.designSystem)}})).rejects.toThrow('模板');expect(useProjectStore.getState().screenOrder).toHaveLength(0);expect(useHistoryStore.getState().past.length).toBe(before);
});
test('页面润色不能改严格固定区；组件模板润色可更新固定样式并按槽同步',async()=>{
 const plain={...component,templateHtml:template.replace('<img data-slot="photo" src="https://example.com/default.png" alt="默认图片">',''),slotDefs:slots.filter(s=>s.type!=='image')};useProjectStore.setState({components:{card:plain}});
 const s=useProjectStore.getState(),source=`<main>${instance(plain.templateHtml).replace('默认标题','保留姓名')}</main>`;s.addScreen({name:'页面',htmlContent:source},'page');PageRenderCheck.inspect=async()=>({status:'complete',inspected:7,findings:[]});
 const bad=await s.applyRestyleOutcome(acceptRestyleResult({kind:'screen',id:'page',name:'页面',html:source},source.replace('class="card"','class="card p-4"')));expect(bad.applied).toBe(false);expect(bad.message).toContain('模板');
 const next=plain.templateHtml.replace('class="card"','class="card p-4"');const good=await s.applyRestyleOutcome(acceptRestyleResult({kind:'component',id:'card',name:'资料卡',html:plain.templateHtml},next));expect(good.applied).toBe(true);expect(useProjectStore.getState().components.card.version).toBe(3);expect(useProjectStore.getState().screens.page.htmlContent).toContain('保留姓名');expect(report(useProjectStore.getState().screens.page.htmlContent,undefined,useProjectStore.getState().components.card).templateCount).toBe(1);
});

test('多页第一份严格模板合格、第二页伪模板失败时不提前加入任何页面',async()=>{
 useProjectStore.setState({components:{card:component}});PageRenderCheck.inspect=async()=>({status:'complete',inspected:8,findings:[]});let calls=0;
 const core:AIEngineCore={async generateObject(){return {summary:'两页资料',pages:[{name:'资料页',requirements:['资料'],links:[]},{name:'设置页',requirements:['设置'],links:[]}]} as any;},streamText(options){
  calls++;const scope=JSON.parse(options.messages.find(m=>m.role==='system')!.content.match(/confirmedMultiPageScope=(.*); output exactly this page/)![1]);
  const html=`<artifact identifier="screen_new" type="screen" title="${scope.name}"><main>${instance().replace('固定提示',calls===2?'坏固定区':'固定提示')}</main></artifact>`;
  return {textStream:(async function*(){yield html;})(),reasoningStream:(async function*(){})(),textPromise:Promise.resolve(html),reasoningPromise:Promise.resolve(undefined),usagePromise:Promise.resolve(undefined),finishReasonPromise:Promise.resolve('stop'),abort(){}};
 }};
 const before=useHistoryStore.getState().past.length,plan=await prepareMultiPagePlan({state:useProjectStore.getState(),request:'创建两个页面',provider:{id:'fixture',name:'fixture',protocol:'openai_compatible',baseUrl:'https://invalid.local',apiKey:'fixture',isEnabled:true,models:[]} as any,model:'fixture',core,isCurrent:()=>true});
 const result=await executeMultiPagePlan(plan,plan.plan.pages,{getState:()=>useProjectStore.getState(),commit:batch=>useProjectStore.getState().applyMultiPageCreation(batch)});expect(result.status).toBe('blocked');expect(calls).toBe(2);expect(result.message).toContain('模板');expect(useProjectStore.getState().screenOrder).toHaveLength(0);expect(useHistoryStore.getState().past.length).toBe(before);
});

test('按槽同步保留用户纯文本的前后空白，不以trim改写内容',()=>{
 const source=el(instance().replace('默认标题','  用户 标题  ')),result=projectSlottedComponent(component,source);
 expect(result.querySelector('h2')!.textContent).toBe('  用户 标题  ');
});

for(const kind of ['template','image-slot','node-slot','inert-template'])test(`${kind} 不把内嵌图片正文写入严格组件`,()=>{
 const data='data:image/png;base64,aGVsbG8=';
 if(kind==='template')expect(()=>compileComponentTemplate({...component,templateHtml:template.replace('https://example.com/default.png',data)})).toThrow('图片正文');
 else if(kind==='image-slot')expect(report(instance().replace('https://example.com/default.png',data)).passed).toBe(false);
 else expect(report(instance().replace('<p>默认正文</p>',kind==='inert-template'?`<template><img src="${data}"></template>`:`<img src="${data}">`)).passed).toBe(false);
});
