import {afterEach,beforeEach,expect,test} from 'bun:test';
import {prepareMultiPagePlan,executeMultiPagePlan,consumeMultiPageBatch,type PreparedMultiPagePlan} from '../src/services/ai/multiPageService';
import {requiresMultiPagePlan,validateMultiPageItems,isMultiPageDelivery,type MultiPageProgress} from '../src/services/ai/multiPageContract';
import {useProjectStore} from '../src/stores/useProjectStore';
import {useHistoryStore} from '../src/stores/useHistoryStore';
import {neutralModernTheme} from '../src/utils/themePresets';
import {PageRenderCheck} from '../src/services/ai/pageRenderCheck';
import {CanvasToolExecutor} from '../src/services/tools/canvasToolExecutor';
import {PipelineExecutor} from '../src/services/ai/engine/pipeline/executor';
import {buildDesignTaskContract} from '../src/services/ai/designWorkflow';
import {readProject} from '../src/utils/projectRegistry';
import type {AIEngineCore,StreamTextOptions} from '../src/services/ai/engine/core/types';
const rawPlan=()=>({summary:'登录与注册两个独立页面',pages:[{name:'登录页',requirements:['手机号登录','清晰主按钮'],links:['注册页']},{name:'注册页',requirements:['手机号注册'],links:['登录页']}]});
const provider={id:'mock',name:'Mock',protocol:'openai_compatible',baseUrl:'https://invalid.local',apiKey:'test',isEnabled:true,models:[]} as any;
let prior:ReturnType<typeof useProjectStore.getState>,history:ReturnType<typeof useHistoryStore.getState>,inspect:typeof PageRenderCheck.inspect;
let objectCalls:number,streamCalls:StreamTextOptions[],rawQueue:unknown[],answerMode:'normal'|'unsafe'|'wrong-name'|'missing-links'|'unknown-link'|'no-html';
beforeEach(()=>{prior=useProjectStore.getState();history=useHistoryStore.getState();inspect=PageRenderCheck.inspect;
 useProjectStore.getState().initNewProject({name:'多页工程',deviceProfile:'mobile',designSystem:neutralModernTheme,createSpecimen:false});
 useProjectStore.getState().addScreen({name:'原页',htmlContent:'<main data-nid="old" class="p-4"><h1>原始页面</h1></main>'},'old');
 PageRenderCheck.inspect=async()=>({status:'complete',findings:[],inspected:5});objectCalls=0;streamCalls=[];rawQueue=[rawPlan()];answerMode='normal';
});
afterEach(()=>{PageRenderCheck.inspect=inspect;useProjectStore.setState(prior,true);useHistoryStore.setState(history,true);});
const core:AIEngineCore={async generateObject(){objectCalls++;const value=rawQueue.shift();if(value instanceof Error)throw value;return value as any;},streamText(options){streamCalls.push(options);
 const system=options.messages.find(m=>m.role==='system')!.content,scope=JSON.parse(system.match(/confirmedMultiPageScope=(.*); output exactly this page/)![1]);
 const links=answerMode==='missing-links'?'':scope.requiredTargetIds.map((id:string)=>`<button class="btn" data-target-screen-id="${id}">关联页面</button>`).join('');
 const title=answerMode==='wrong-name'?'别的页面':scope.name;
 const html=`<main class="col gap-4 p-4"><h1 class="text-xl font-bold">${scope.name}</h1><section class="card p-4"><p>页面要求</p></section><button class="btn btn-primary"${answerMode==='unsafe'?' onclick="bad()"':''}>提交</button>${links}${answerMode==='unknown-link'?'<button data-target-screen-id="missing">未知页</button>':''}</main>`;
 const answer=answerMode==='no-html'?'没有输出页面':`<artifact identifier="screen_new" type="screen" title="${title}">${html}</artifact>`;
 return {textStream:(async function*(){yield answer;})(),reasoningStream:(async function*(){})(),textPromise:Promise.resolve(answer),reasoningPromise:Promise.resolve(undefined),usagePromise:Promise.resolve(undefined),finishReasonPromise:Promise.resolve('stop'),abort(){}};
}};
const prepare=(extra:Partial<Parameters<typeof prepareMultiPagePlan>[0]>={})=>prepareMultiPagePlan({state:useProjectStore.getState(),request:'生成登录页、注册页两个页面',provider,model:'model',core,isCurrent:()=>true,...extra});
const run=(plan:PreparedMultiPagePlan,extra:Partial<Parameters<typeof executeMultiPagePlan>[2]>={})=>executeMultiPagePlan(plan,plan.plan.pages,{getState:()=>useProjectStore.getState(),commit:batch=>{useProjectStore.getState().applyMultiPageCreation(batch);},...extra});
for(const request of ['生成3个页面','设计多页面会员系统','新建登录页、注册页和首页','创建登录页面和注册页面','创建一套后台页面','create multiple pages','generate home and profile pages'])test(`多页路由 ${request}`,()=>expect(requiresMultiPagePlan(request)).toBe(true));
for(const request of ['新建一个资料页，参考首页和详情页','生成一个页面，使用两列卡片','创建详情页，底部链接列表页','修改当前页面','分析这些页面','create one page with two cards'])test(`单页或非新建不误判 ${request}`,()=>expect(requiresMultiPagePlan(request)).toBe(false));

test('规划只返回可编辑的有界计划，不生成HTML或写页面/History',async()=>{
 const before=useHistoryStore.getState().past.length,plan=await prepare();expect(objectCalls).toBe(1);expect(streamCalls).toHaveLength(0);
 expect(plan.plan.pages).toHaveLength(2);expect(plan.plan.pages[0].links).toEqual([plan.plan.pages[1].id]);expect(plan.evidence.status).toBe('ready');
 expect(plan.contract.workflowId).toBe('plan-multiple-pages');expect(useProjectStore.getState().screenOrder).toEqual(['old']);expect(useHistoryStore.getState().past.length).toBe(before);
});
for(const kind of ['empty','one','too-many','duplicate','unknown-link','self-link','too-long'] as const)test(`无效 ${kind} 计划只纠正一次仍失败`,async()=>{
 const data=rawPlan() as any;if(kind==='empty')data.pages=[];if(kind==='one')data.pages.pop();if(kind==='too-many')data.pages=Array.from({length:9},(_,i)=>({name:`页面${i}`,requirements:['内容'],links:[]}));
 if(kind==='duplicate')data.pages[1].name=data.pages[0].name;if(kind==='unknown-link')data.pages[0].links=['missing'];if(kind==='self-link')data.pages[0].links=['登录页'];if(kind==='too-long')data.pages[0].requirements=['x'.repeat(251)];
 rawQueue=[data,data];await expect(prepare()).rejects.toThrow('纠正后');expect(objectCalls).toBe(2);expect(streamCalls).toHaveLength(0);expect(useProjectStore.getState().screenOrder).toEqual(['old']);
});
test('格式纠正后使用真实第二次计划，网络错误不当作格式重试',async()=>{
 rawQueue=[{analysis:'bad'},rawPlan()];const plan=await prepare();expect(plan.plan.planning.attempts).toBe(2);
 rawQueue=[new Error('network offline')];objectCalls=0;await expect(prepare()).rejects.toThrow('network offline');expect(objectCalls).toBe(1);
});
test('取消/过期后的非协作坏计划不能触发纠正或生成',async()=>{
 const controller=new AbortController();let release!:(v:unknown)=>void;
 const pending=prepare({core:{...core,async generateObject(){objectCalls++;return await new Promise(r=>release=r) as any;}},signal:controller.signal});
 controller.abort();release({bad:true});await expect(pending).rejects.toThrow('取消');expect(objectCalls).toBe(1);expect(streamCalls).toHaveLength(0);
});

test('全部页面实际验收后才一次History加入，关系有效并支持Undo/Redo与存盘重开',async()=>{
 const plan=await prepare(),before=useHistoryStore.getState().past.length,old=useProjectStore.getState().screens.old.htmlContent,events:MultiPageProgress[][]=[];
 const result=await run(plan,{onProgress:p=>{events.push(p);if(p.some(item=>item.status!=='applied'))expect(useProjectStore.getState().screenOrder).toEqual(['old']);}});
 expect(result.status).toBe('complete');expect(streamCalls).toHaveLength(2);expect(events.at(-1)!.every(p=>p.status==='applied')).toBe(true);
 const state=useProjectStore.getState();expect(state.screenOrder).toHaveLength(3);expect(state.screens.old.htmlContent).toBe(old);expect(useHistoryStore.getState().past.length).toBe(before+1);
 const pages=result.screenIds.map(id=>state.screens[id]);expect(pages[0].htmlContent).toContain(`data-target-screen-id="${pages[1].id}"`);expect(pages[1].htmlContent).toContain(pages[0].id);
 expect(isMultiPageDelivery(pages[0].metadata?.multiPageDelivery)).toBe(true);expect(pages.every(p=>p.metadata!.creationEvidence!.workflow.checks.find(c=>c.id==='multi-page-scope')?.status==='passed')).toBe(true);
 const saved=readProject(state.id)!;useHistoryStore.getState().undo();expect(useProjectStore.getState().screenOrder).toEqual(['old']);useHistoryStore.getState().redo();expect(useProjectStore.getState().screenOrder).toHaveLength(3);
 state.loadProject(saved);expect(useProjectStore.getState().screens[pages[0].id].metadata!.multiPageDelivery).toEqual(pages[0].metadata!.multiPageDelivery);
 expect((await run(plan)).status).toBe('blocked');expect(streamCalls).toHaveLength(2);
});

test('用户缩减到一页并修改要求，清理关联后确认范围披露',async()=>{
 const plan=await prepare();const selected=[{...plan.plan.pages[0],name:'登录设置',requirements:'用户补充的登录要求',links:[]}];
 const result=await executeMultiPagePlan(plan,selected,{getState:()=>useProjectStore.getState(),commit:batch=>{useProjectStore.getState().applyMultiPageCreation(batch);}});
 expect(result.status).toBe('complete');expect(result.message).toContain('原计划2页');expect(result.message).toContain('缩减为1页');expect(streamCalls[0].messages.at(-1)?.content).toContain('用户补充的登录要求');expect(useProjectStore.getState().screens[result.screenIds[0]].name).toBe('登录设置');
});
for(const mode of ['unsafe','wrong-name','missing-links','unknown-link','no-html'] as const)test(`不合格页面 ${mode} 不加入部分页`,async()=>{
 const plan=await prepare();answerMode=mode;const before=useHistoryStore.getState().past.length,result=await run(plan);
 expect(result.status).toBe('blocked');expect(useProjectStore.getState().screenOrder).toEqual(['old']);expect(useHistoryStore.getState().past.length).toBe(before);
});

test('第二页失败也不交付已通过的第一页',async()=>{
 const plan=await prepare();PageRenderCheck.inspect=async()=>{if(streamCalls.length===2)return {status:'incomplete',findings:[],inspected:0,reason:'第二页未渲染'};return {status:'complete',findings:[],inspected:5};};
 const progress:MultiPageProgress[][]=[],result=await run(plan,{onProgress:p=>progress.push(p)});expect(result.status).toBe('blocked');expect(streamCalls).toHaveLength(2);
 expect(progress.at(-1)![0].status).toBe('checked');expect(progress.at(-1)![1].status).toBe('failed');expect(useProjectStore.getState().screenOrder).toEqual(['old']);
});
test('第一页面检查完成后取消，原工程无部分页面',async()=>{
 const plan=await prepare(),controller=new AbortController();const result=await run(plan,{signal:controller.signal,onProgress:p=>{if(p[0].status==='checked')controller.abort();}});
 expect(result.status).toBe('cancelled');expect(streamCalls).toHaveLength(1);expect(useProjectStore.getState().screenOrder).toEqual(['old']);
});
for(const change of ['switch','theme','document','decision'] as const)test(`生成中 ${change} 使整个批次过期`,async()=>{
 const plan=await prepare();PageRenderCheck.inspect=async()=>{const state=useProjectStore.getState();if(change==='switch')state.initNewProject({name:'另一工程',deviceProfile:'mobile',designSystem:neutralModernTheme,createSpecimen:false});if(change==='theme'){const ds=structuredClone(state.designSystem);ds.tokens.radius.md='31px';state.setDesignSystem(ds);}if(change==='decision')state.addDecision('改变设计要求','global');if(change==='document')state.upsertProjectDocument({id:'requirements',title:'新需求',content:'新的全局要求',source:'manual',enabled:true,createdAt:1,updatedAt:1});return {status:'complete',findings:[],inspected:5};};
 expect((await run(plan)).status).toBe('blocked');expect(Object.values(useProjectStore.getState().screens).every(p=>!p.metadata?.multiPageDelivery)).toBe(true);
});
test('并发确认只运行一次，确认后修改调用方数组不能污染任务',async()=>{
 const plan=await prepare();let release!:()=>void;const inspect=PageRenderCheck.inspect;PageRenderCheck.inspect=async()=>{await new Promise<void>(r=>release=r);return inspect({} as any,{} as any);};
 const pending=run(plan);await new Promise(r=>setTimeout(r,0));expect((await run(plan)).status).toBe('blocked');plan.plan.pages[0].name='事后污染';PageRenderCheck.inspect=inspect;release();
 const result=await pending;expect(result.status).toBe('complete');expect(useProjectStore.getState().screens[result.screenIds[0]].name).toBe('登录页');
});
test('直接Pipeline与单页工具不能把明确多页需求当作单页交付',async()=>{
 const output=await PipelineExecutor.execute({input:{rawPrompt:'生成3个页面',activeScreenId:null},provider,model:'model',engineCore:core,screens:{},deviceProfile:'mobile',frameWidth:390,baseSystemPrompt:'测试'});expect(output.status).toBe('error');expect(streamCalls).toHaveLength(0);
 const contract=buildDesignTaskContract({intent:'create_screen',request:'生成3个页面',deviceProfile:'mobile',frameWidth:390});
 const result=await CanvasToolExecutor.executeAsync({tool:'create_screen',params:{title:'仅一页',html:'<main>仅一页</main>',workflowContract:contract}});expect(result.success).toBe(false);expect(useProjectStore.getState().screenOrder).toEqual(['old']);
});
test('伪造批次或复制句柄不能绕过私有批次与History',()=>{
 expect(()=>useProjectStore.getState().applyMultiPageCreation({version:1,id:'fake',fingerprint:'fake',names:[]})).toThrow('批次');
 const items=[{id:'a',name:'a',requirements:'a',links:['missing']}];expect(()=>validateMultiPageItems(items)).toThrow('关联');
});

for(const request of ['生成9个页面','生成一百个页面','create 12 pages','CREATE 12 PAGES'])test(`超出页数 ${request} 在请求模型前拒绝拆分任务`,async()=>{
 await expect(prepare({request})).rejects.toThrow('最多规划8页');expect(objectCalls).toBe(0);expect(streamCalls).toHaveLength(0);
});
test('明确要求3页不能静默少规划1页；原计划与确认范围分别记录',async()=>{
 rawQueue=[rawPlan(),rawPlan()];await expect(prepare({request:'生成3个页面'})).rejects.toThrow('纠正后');expect(objectCalls).toBe(2);
});
test('输入规划合同/实际格式证据随页面交付快照保存',async()=>{
 const plan=await prepare(),result=await run(plan);expect(result.status).toBe('complete');
 const planning=useProjectStore.getState().screens[result.screenIds[0]].metadata!.multiPageDelivery!.planning;
 expect(planning.contract?.workflowId).toBe('plan-multiple-pages');expect(planning.evidence?.checks.find(c=>c.id==='page-plan-schema')?.status).toBe('passed');
});

// 同页方案共用批次门禁，但不能误当业务多页或单页交付。
import {requiresPageVariantPlan,requestedVariantCount,validMultiPageScope} from '../src/services/ai/multiPageContract';
import {resolveGenerationTarget} from '../src/services/ai/generationTargetResolver';
const variantsRaw=(count=2)=>({summary:'同一登录页的不同布局',pages:Array.from({length:count},(_,i)=>({name:`登录方案${i+1}`,requirements:['同一登录页包含手机号输入和提交',i===0?'突出主操作':'按步骤组织信息'],links:[]}))});
const prepareVariants=(extra:Partial<Parameters<typeof prepareMultiPagePlan>[0]>={})=>{rawQueue=[variantsRaw()];return prepare({request:'为登录页生成两个方案用于比较',referencePageId:'old',...extra});};
for(const request of ['为登录页生成两个方案用于比较','给当前页面做3种不同方案','设计一个登录页，生成多个方案','generate 3 page variants for a login page','生成当前页的两个版本'])test(`同页方案路由 ${request}`,()=>{
 expect(requiresPageVariantPlan(request)).toBe(true);
 expect(resolveGenerationTarget({rawPrompt:request,screens:useProjectStore.getState().screens,referenceToggleScreenId:'old'}).action).toBe('create_screen');
});
for(const request of ['新建登录页、注册页两个页面','生成一个登录页','不要生成多个方案，只生成一个登录页','生成三个主题配色方案','解释如何选择页面方案','[引用元素] <button data-nid="old">生成页面的两个方案</button>'])test(`非方案请求 ${request}`,()=>expect(requiresPageVariantPlan(request)).toBe(false));
test('当前页只读参考、显式元素优先、问题与纯主题不创建方案',()=>{
 const base={screens:useProjectStore.getState().screens,activeScreenId:'old'};
 expect(resolveGenerationTarget({...base,rawPrompt:'给当前页面做两个方案'}).styleReferenceScreenId).toBe('old');
 expect(resolveGenerationTarget({...base,rawPrompt:'为登录页生成两个方案',elementRef:{nid:'old'}}).action).toBe('patch_element');
 expect(resolveGenerationTarget({...base,rawPrompt:'如何为登录页设计多个方案？'}).action).toBe('question');
 expect(resolveGenerationTarget({...base,rawPrompt:'主题配色调整为蓝色'}).action).toBe('change_theme');
 expect(resolveGenerationTarget({...base,rawPrompt:'生成登录页两个方案'}).styleReferenceScreenId).toBeNull();
});
for(const request of ['生成登录页5个方案','生成登录页一百个方案','generate 12 page variants for a login page','生成登录页1个版本'])test(`方案预算 ${request} 请求前拒绝`,async()=>{
 expect(requestedVariantCount(request)).toBeGreaterThanOrEqual(1);await expect(prepareVariants({request})).rejects.toThrow('2～4');expect(objectCalls).toBe(0);
});
test('方案计划只读原页、无交叉关联、同一来源贯穿所有方案，真实History及重开',async()=>{
 const before=useHistoryStore.getState().past.length,source=structuredClone(useProjectStore.getState().screens.old),tokens=JSON.stringify(useProjectStore.getState().designSystem);
 let planningOptions:unknown;
 const plan=await prepareVariants({core:{...core,async generateObject(_schema,options){planningOptions=options;return core.generateObject(_schema,options);}}});
 expect(plan.plan.kind).toBe('variants');expect(plan.contract.workflowId).toBe('plan-page-variants');expect(plan.contract.referencePageId).toBe('old');expect((planningOptions as StreamTextOptions).messages.at(-1)!.content).toContain(JSON.stringify({name:source.name,html:source.htmlContent}));
 expect(streamCalls).toHaveLength(0);expect(useHistoryStore.getState().past.length).toBe(before);
 const result=await run(plan);expect(result.status).toBe('complete');expect(result.message).toContain('已并排新增 2 个方案');
 const state=useProjectStore.getState(),pages=result.screenIds.map(id=>state.screens[id]);expect(pages[0].position.y).toBe(pages[1].position.y);expect(pages[1].position.x).toBeGreaterThan(pages[0].position.x+390);
 expect(pages.every(p=>p.metadata?.pageGroup===pages[0].metadata?.pageGroup&&p.metadata!.multiPageDelivery!.kind==='variants')).toBe(true);
 expect(pages.every(p=>isMultiPageDelivery(p.metadata?.multiPageDelivery))).toBe(true);expect(streamCalls.every(c=>c.messages.some(m=>m.content.includes('参考原画框')||m.content.includes('原始页面')))).toBe(true);
 expect(pages.every(p=>p.metadata!.creationEvidence!.contract.referencePageId==='old')).toBe(true);expect(pages.every(p=>p.metadata!.creationEvidence!.contract.multiPage!.kind==='variants')).toBe(true);
 expect(state.screens.old.htmlContent).toBe(source.htmlContent);expect(JSON.stringify(state.designSystem)).toBe(tokens);expect(useHistoryStore.getState().past.length).toBe(before+1);
 const saved=readProject(state.id)!;useHistoryStore.getState().undo();expect(useProjectStore.getState().screenOrder).toEqual(['old']);useHistoryStore.getState().redo();expect(useProjectStore.getState().screenOrder).toHaveLength(3);state.loadProject(saved);expect(useProjectStore.getState().screens[pages[1].id].metadata?.multiPageDelivery?.kind).toBe('variants');
});
for(const bad of ['cross-link','five','under-count'] as const)test(`无效方案计划 ${bad} 只纠正一次`,async()=>{
 const value=variantsRaw(bad==='five'?5:2);if(bad==='cross-link')value.pages[0].links=['登录方案2'] as never;
 rawQueue=[value,value];await expect(prepare({request:bad==='under-count'?'生成登录页三个方案':'生成登录页多个方案'})).rejects.toThrow('纠正后');expect(objectCalls).toBe(2);expect(streamCalls).toHaveLength(0);
});
for(const bad of ['single','links','kind'] as const)test(`确认方案范围 ${bad} 无效时不生成`,async()=>{
 const plan=await prepareVariants();if(bad==='kind')plan.plan.kind=undefined;
 const edited=structuredClone(plan.plan.pages);if(bad==='single')edited.pop();if(bad==='links')edited[0].links=[edited[1].id];
 const result=await executeMultiPagePlan(plan,edited,{getState:()=>useProjectStore.getState(),commit:batch=>{useProjectStore.getState().applyMultiPageCreation(batch);}});
 expect(result.status).toBe('blocked');expect(streamCalls).toHaveLength(0);expect(useProjectStore.getState().screenOrder).toEqual(['old']);
});
for(const failure of ['second','cancel','stale'] as const)test(`同页方案 ${failure} 不交付部分副本`,async()=>{
 const plan=await prepareVariants(),controller=new AbortController(),before=useHistoryStore.getState().past.length;
 PageRenderCheck.inspect=async()=>{if(streamCalls.length===2&&failure==='second')return {status:'incomplete',findings:[],inspected:0,reason:'方案2无法渲染'};if(failure==='stale')useProjectStore.getState().addDecision('新要求','global');return {status:'complete',findings:[],inspected:4};};
 const result=await run(plan,{signal:controller.signal,onProgress:p=>{if(failure==='cancel'&&p[0].status==='checked')controller.abort();}});
 expect(result.status).toBe(failure==='cancel'?'cancelled':'blocked');expect(useProjectStore.getState().screenOrder).toEqual(['old']);if(failure!=='stale')expect(useHistoryStore.getState().past.length).toBe(before);
});
test('直接Pipeline或工具不能将多个方案静默交付一页',async()=>{
 const request='生成登录页三个方案';const output=await PipelineExecutor.execute({input:{rawPrompt:request,activeScreenId:null},provider,model:'model',engineCore:core,screens:{},deviceProfile:'mobile',frameWidth:390,baseSystemPrompt:'测试'});expect(output.status).toBe('error');expect(streamCalls).toHaveLength(0);
 const contract=buildDesignTaskContract({intent:'create_screen',request,deviceProfile:'mobile',frameWidth:390});const result=await CanvasToolExecutor.executeAsync({tool:'create_screen',params:{title:'一页',html:'<main>单页</main>',workflowContract:contract}});expect(result.success).toBe(false);
});
test('历史方案与范围拒绝未知kind/交叉关联/单个方案，旧多页记录仍有效',async()=>{
 const plan=await prepareVariants(),result=await run(plan),page=useProjectStore.getState().screens[result.screenIds[0]],delivery=page.metadata!.multiPageDelivery!,scope=page.metadata!.creationEvidence!.contract.multiPage!;
 expect(validMultiPageScope(scope)).toBe(true);expect(validMultiPageScope({...scope,kind:'unknown'})).toBe(false);expect(validMultiPageScope({...scope,total:1})).toBe(false);expect(validMultiPageScope({...scope,requiredTargetIds:[scope.pageIds[1]]})).toBe(false);
 expect(isMultiPageDelivery({...delivery,kind:'unknown'})).toBe(false);expect(isMultiPageDelivery({...delivery,pages:[delivery.pages[0]]})).toBe(false);
});
for(const request of ['设计报价页面，展示多个方案','生成套餐页，包含三个方案','create a page to show multiple options'])test(`业务内容不是设计备选 ${request}`,()=>expect(requiresPageVariantPlan(request)).toBe(false));
test('多个业务页再做多方案须拆分，不静默只生成一个业务页的方案',async()=>{
 await expect(prepareVariants({request:'生成两个页面，给每页生成三个方案'})).rejects.toThrow('拆成独立任务');expect(objectCalls).toBe(0);
});

import {createProjectStorage} from '../src/services/storage/projectStorage';
test('font removed while a later scheme is generating blocks the complete batch, not just the last page',async()=>{
 const font=`assets/imports/fonts/${'a'.repeat(64)}.woff2`,storage=createProjectStorage(useProjectStore.getState().id);await storage.writeBinary(font,'dGVzdA==');
 const plan=await prepareVariants({core:{...core,streamText(options){const output=core.streamText(options);if(streamCalls.length===1){const inject=(text:string)=>text.replace('<main ',`<style>@font-face{font-family:Imported;src:url(${font})}</style><main `);return {...output,textStream:(async function*(){yield inject(await output.textPromise);})(),textPromise:output.textPromise.then(inject)};}return output;}}});
 PageRenderCheck.inspect=async()=>{if(streamCalls.length===2)await storage.remove(font);return {status:'complete',findings:[],inspected:4};};
 const before=useHistoryStore.getState().past.length,result=await run(plan);expect(result.status).toBe('blocked');expect(result.message).toContain('不存在');expect(streamCalls).toHaveLength(2);expect(useProjectStore.getState().screenOrder).toEqual(['old']);expect(useHistoryStore.getState().past.length).toBe(before);
});
