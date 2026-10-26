import {beforeEach,afterEach,expect,test} from 'bun:test';
import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {ChatDrawer} from '../src/components/chat/ChatDrawer';
import {useProjectStore} from '../src/stores/useProjectStore';
import {useHistoryStore} from '../src/stores/useHistoryStore';
import {useAIConfigStore,defaultProviders,defaultBindings} from '../src/stores/useAIConfigStore';
import {DefaultAIEngineCore} from '../src/services/ai/engine/core/aiEngineCore';
import {PageRenderCheck} from '../src/services/ai/pageRenderCheck';
import {neutralModernTheme} from '../src/utils/themePresets';
import {PageCreationEvidencePanel} from '../src/components/inspector/PageCreationEvidencePanel';
const generate=DefaultAIEngineCore.prototype.generateObject,stream=DefaultAIEngineCore.prototype.streamText,inspect=PageRenderCheck.inspect;
let root:Root,host:HTMLDivElement,prior:ReturnType<typeof useProjectStore.getState>,history:ReturnType<typeof useHistoryStore.getState>,config:ReturnType<typeof useAIConfigStore.getState>,priorAct:unknown;
let plans:number,streams:number,hold:boolean,release:(()=>void)|undefined;
beforeEach(async()=>{
 prior=useProjectStore.getState();history=useHistoryStore.getState();config=useAIConfigStore.getState();priorAct=(globalThis as any).IS_REACT_ACT_ENVIRONMENT;(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
 useProjectStore.getState().initNewProject({name:'聊天多页',deviceProfile:'mobile',designSystem:neutralModernTheme,createSpecimen:false});useProjectStore.getState().addScreen({name:'原页',htmlContent:'<main data-nid="old">原内容</main>'},'old');
 useAIConfigStore.setState({providers:defaultProviders.map(p=>({...p,apiKey:'fixture'})),bindings:defaultBindings});plans=0;streams=0;hold=false;release=undefined;
 DefaultAIEngineCore.prototype.generateObject=async()=>{plans++;return {summary:'两个独立页面',pages:[{name:'登录页',requirements:['手机号登录'],links:['注册页']},{name:'注册页',requirements:['注册资料'],links:[]}]} as any;};
 DefaultAIEngineCore.prototype.streamText=options=>{streams++;const scope=JSON.parse(options.messages.find(m=>m.role==='system')!.content.match(/confirmedMultiPageScope=(.*); output exactly this page/)![1]);
 const answer=`<artifact identifier="screen_new" type="screen" title="${scope.name}"><main class="col gap-4 p-4"><h1>${scope.name}</h1><button class="btn btn-primary">提交</button>${scope.requiredTargetIds.map((id:string)=>`<button class="btn" data-target-screen-id="${id}">关联</button>`).join('')}</main></artifact>`;
 const ready=hold?new Promise<void>(r=>release=r):Promise.resolve();return {textStream:(async function*(){await ready;yield answer;})(),reasoningStream:(async function*(){})(),textPromise:ready.then(()=>answer),reasoningPromise:Promise.resolve(undefined),usagePromise:Promise.resolve(undefined),finishReasonPromise:Promise.resolve('stop'),abort(){release?.();}};
 };
 PageRenderCheck.inspect=async()=>({status:'complete',findings:[],inspected:4});host=document.createElement('div');document.body.append(host);root=createRoot(host);await act(async()=>root.render(<ChatDrawer/>));
});
afterEach(()=>{act(()=>root.unmount());host.remove();DefaultAIEngineCore.prototype.generateObject=generate;DefaultAIEngineCore.prototype.streamText=stream;PageRenderCheck.inspect=inspect;useProjectStore.setState(prior,true);useHistoryStore.setState(history,true);useAIConfigStore.setState(config,true);(globalThis as any).IS_REACT_ACT_ENVIRONMENT=priorAct;});
const card=()=>Array.from(host.querySelectorAll('[data-testid="multi-page-plan"]')).at(-1)!;
const button=(text:string)=>Array.from(card().querySelectorAll('button')).find(b=>b.textContent===text)!;
async function send(request='生成登录页、注册页两个页面'){const input=host.querySelector('textarea[placeholder^="输入设计诉求"]')! as HTMLTextAreaElement;await act(async()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(input,request);input.dispatchEvent(new Event('input',{bubbles:true}));});await act(async()=>{(host.querySelector('button[title="发送设计诉求 (Enter)"]') as HTMLButtonElement).click();await new Promise(r=>setTimeout(r,15));});}
async function input(label:string,value:string){const field=card().querySelector(`[aria-label="${label}"]`)! as HTMLInputElement;await act(async()=>{Object.getOwnPropertyDescriptor(field.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value')!.set!.call(field,value);field.dispatchEvent(new Event('input',{bubbles:true}));});}

test('真实聊天先规划，编辑名称要求、确认后才生成，全部加入一次History',async()=>{
 const before=useHistoryStore.getState().past.length;await send();expect(plans).toBe(1);expect(streams).toBe(0);expect(useProjectStore.getState().screenOrder).toEqual(['old']);expect(card().textContent).toContain('确认 2 页');
 await input('第1页名称','登录设置');await input('第1页要求','新的登录要求');await act(async()=>{button('确认计划并生成 2 页').click();button('确认计划并生成 2 页')?.click();await new Promise(r=>setTimeout(r,20));});
 expect(streams).toBe(2);expect(useProjectStore.getState().screenOrder).toHaveLength(3);expect(useHistoryStore.getState().past.length).toBe(before+1);expect(card().textContent).toContain('已按确认计划新增 2 页');expect(card().textContent).toContain('已加入画布');expect(Object.values(useProjectStore.getState().screens).some(p=>p.name==='登录设置')).toBe(true);
});
test('删除页面同步清理关联，用户明确缩减后只生成选定页',async()=>{
 await send();await act(async()=>button('移除此页：注册页').click());expect(card().querySelector('input[type="checkbox"]')).toBeNull();await act(async()=>{button('确认计划并生成 1 页').click();await new Promise(r=>setTimeout(r,20));});
 expect(streams).toBe(1);expect(card().textContent).toContain('原计划2页');expect(useProjectStore.getState().screenOrder).toHaveLength(2);
});
test('多页面历史优先展示用户需求与关联，内部请求折叠，异常范围显示损坏',async()=>{
 await send();await act(async()=>{button('确认计划并生成 2 页').click();await new Promise(r=>setTimeout(r,20));});
 const page=Object.values(useProjectStore.getState().screens).find(p=>p.id!=='old')!;
 act(()=>root.render(<PageCreationEvidencePanel screen={page}/>));
 const technical=Array.from(host.querySelectorAll('details')).find(d=>d.querySelector(':scope > summary')?.textContent==='本次生成请求（技术记录）')!;
 expect(technical.hasAttribute('open')).toBe(false);expect(technical.textContent).toContain('[完整确认计划');expect(host.textContent).toContain('关联：注册页');expect(host.textContent).toContain('第 1 / 2 页');
 act(()=>root.render(<PageCreationEvidencePanel screen={{...page,metadata:{...page.metadata,multiPageDelivery:{...page.metadata!.multiPageDelivery!,originalPageCount:1}}}}/>));expect(host.textContent).toContain('多页面历史计划记录已损坏');
});
test('计划名称重复禁用确认；工程变化时显示过期并不执行',async()=>{
 await send();await input('第2页名称','登录页');expect(button('确认计划并生成 2 页').disabled).toBe(true);expect(card().textContent).toContain('名称需唯一');
 await input('第2页名称','注册页');act(()=>useProjectStore.getState().addDecision('新的设计要求','global'));expect(button('确认计划并生成 2 页').disabled).toBe(true);expect(card().textContent).toContain('上下文已变化');expect(streams).toBe(0);
});
test('确认前取消不生成；生成期间取消不加入任何页面',async()=>{
 await send();act(()=>button('取消多页面任务').click());expect(card().textContent).toContain('已取消');expect(streams).toBe(0);expect(useProjectStore.getState().screenOrder).toEqual(['old']);
 await send();hold=true;await act(async()=>{button('确认计划并生成 2 页').click();await new Promise(r=>setTimeout(r,0));});expect(release).toBeDefined();act(()=>button('取消多页面任务').click());await act(async()=>{release?.();await new Promise(r=>setTimeout(r,10));});expect(useProjectStore.getState().screenOrder).toEqual(['old']);
});

test('聊天多方案明确引用原页时只读规划、可补差异、并排生成，无业务关联选项',async()=>{
 DefaultAIEngineCore.prototype.generateObject=async()=>{plans++;return {summary:'同一登录页比较',pages:[{name:'紧凑方案',requirements:['手机号登录','紧凑布局'],links:[]},{name:'引导方案',requirements:['手机号登录','步骤引导'],links:[]}]} as any;};
 const before=useHistoryStore.getState().past.length;
 await send('为当前页面生成两个方案用于比较');expect(plans).toBe(1);expect(streams).toBe(0);expect(card().textContent).toContain('同页方案比较');expect(card().querySelector('input[type="checkbox"]')).toBeNull();
 expect(button('移除此方案：紧凑方案').disabled).toBe(true);await input('第1方案名称','重点方案');await input('第1方案要求','手机号登录，突出按钮与隐私提示');
 await act(async()=>{button('确认计划并生成 2 个方案').click();button('确认计划并生成 2 个方案')?.click();await new Promise(r=>setTimeout(r,30));});
 expect(streams).toBe(2);expect(useProjectStore.getState().screenOrder).toHaveLength(3);expect(useHistoryStore.getState().past.length).toBe(before+1);expect(card().textContent).toContain('已并排新增 2 个方案');
 const page=Object.values(useProjectStore.getState().screens).find(p=>p.id!=='old')!;act(()=>root.render(<PageCreationEvidencePanel screen={page}/>));expect(host.textContent).toContain('同页方案确认计划');expect(host.textContent).toContain('突出按钮与隐私提示');expect(host.textContent).toContain('原计划 2 个方案');
});
test('方案卡片重复名称禁用、取消不生成；恢复单独请求不转宽泛修改分析',async()=>{
 DefaultAIEngineCore.prototype.generateObject=async()=>{plans++;return {summary:'比较设计',pages:[{name:'方案甲',requirements:['当前页布局甲'],links:[]},{name:'方案乙',requirements:['当前页布局乙'],links:[]}]} as any;};
 await send('基于当前页面生成两个方案');await input('第2方案名称','方案甲');expect(button('确认计划并生成 2 个方案').disabled).toBe(true);
 act(()=>button('取消方案任务').click());expect(card().textContent).toContain('方案任务已取消');expect(streams).toBe(0);expect(useProjectStore.getState().screenOrder).toEqual(['old']);
});
