import {afterEach,beforeEach,expect,test} from 'bun:test';
import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {InfiniteCanvas} from '../src/components/canvas/InfiniteCanvas';
import {useProjectStore} from '../src/stores/useProjectStore';
import {useHistoryStore} from '../src/stores/useHistoryStore';
import {buildDesignTaskContract} from '../src/services/ai/designWorkflow';
import {DeliveryRepository} from '../src/services/storage/deliveryRepository';
import {createProjectStorage} from '../src/services/storage/projectStorage';
const original='<main class="container-max" data-nid="root0001"><section data-nid="section1"><h1>公开资料</h1><button class="btn btn-primary" data-nid="action01">打开资料</button></section></main>';
const candidate='<main class="container-max" data-nid="root0001"><article data-nid="article1"><h1>隐私提示</h1><button class="btn btn-primary" data-nid="action01">登录查看</button></article></main>';
const prior=useProjectStore.getState(),priorHistory=useHistoryStore.getState();let host:HTMLDivElement,root:Root|undefined,oldAct:unknown;
const key=()=>useProjectStore.getState().getStagedRenderContextKey();
const clean=()=>useProjectStore.getState().setStagedRenderQuality(key(),{status:'complete',findings:[],inspected:5});
const btn=(name:string)=>[...host.querySelectorAll('button')].find(b=>b.textContent?.includes(name))!;
function stage(html=candidate){const s=useProjectStore.getState();const contract=buildDesignTaskContract({intent:'modify_screen',request:'隐藏真实信息，展示登录提示',target:s.screens.page,deviceProfile:'pc',frameWidth:1440,designSystem:s.designSystem,allowedChanges:['screen:page']});s.stageScreenChange('page',html,'候选',contract.request,contract);clean();}
async function mount(){root=createRoot(host);await act(async()=>{root!.render(<InfiniteCanvas/>);});await act(async()=>{clean();await new Promise(r=>setTimeout(r,0));});}
beforeEach(()=>{oldAct=(globalThis as any).IS_REACT_ACT_ENVIRONMENT;(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;useProjectStore.getState().initNewProject({name:'候选操作回归',deviceProfile:'pc',createSpecimen:false});useProjectStore.getState().addScreen({name:'原版',htmlContent:original,position:{x:0,y:0}},'page');useHistoryStore.getState().restore(null);host=document.createElement('div');document.body.append(host);stage();});
afterEach(()=>{if(root)act(()=>root!.unmount());root=undefined;host.remove();useProjectStore.setState(prior,true);useHistoryStore.setState(priorHistory,true);(globalThis as any).IS_REACT_ACT_ENVIRONMENT=oldAct;});
test('7/8结构阻断直接显示原因，禁用按钮有明确外观，丢弃仍有效',async()=>{
 await mount();const r=useProjectStore.getState().getStagedDeliveryReport();expect(r.checks.filter(c=>c.status!=='passed').map(c=>c.id)).toEqual(['structure']);
 expect(host.querySelector('[data-testid="candidate-delivery-blockers"]')?.textContent).toContain('结构守卫拦截');
 expect(btn('采纳新版').disabled).toBe(true);expect(btn('采纳新版').className).toContain('disabled:');expect(btn('两版都留').disabled).toBe(true);
 await act(async()=>{btn('保留原版').click();});expect(useProjectStore.getState().stagedScreen).toBeNull();expect(useProjectStore.getState().screens.page.htmlContent).toBe(original);
});
test('显式确认绑定当前候选，重暂存后不能沿用旧确认',async()=>{
 await mount();const confirm=host.querySelector('input[aria-label="我已检查并接受这次结构变化"]') as HTMLInputElement;expect(confirm).not.toBeNull();
 await act(async()=>confirm.click());expect(btn('采纳新版').disabled).toBe(false);expect(btn('两版都留').disabled).toBe(false);
 await act(async()=>{stage();});await act(async()=>clean());expect(btn('采纳新版').disabled).toBe(true);expect((host.querySelector('input[aria-label="我已检查并接受这次结构变化"]') as HTMLInputElement).checked).toBe(false);
});
test('确认结构变化后的两版保留经过完整管道、History和可重开档案',async()=>{
 const before=key();const ok=await (useProjectStore.getState().commitStagedDelivery as any)('confirm-structure-keep-both',before);expect(ok).toBe(true);
 const state=useProjectStore.getState();expect(Object.keys(state.screens)).toHaveLength(2);expect(state.screens.page.htmlContent).toBe(original);const added=Object.values(state.screens).find(p=>p.id!=='page')!;
 expect(added.htmlContent).toContain('隐私提示');const events=await new DeliveryRepository(createProjectStorage(state.id),state.id).listForScreen(added.id);expect(events.records[0].mode).toBe('confirm-structure-keep-both');
 useHistoryStore.getState().undo();expect(Object.keys(useProjectStore.getState().screens)).toHaveLength(1);useHistoryStore.getState().redo();expect(Object.keys(useProjectStore.getState().screens)).toHaveLength(2);
});
test('旧上下文确认不能作用于新候选',async()=>{const old=key();stage(candidate.replace('隐私提示','新的隐私说明'));const result=await (useProjectStore.getState().commitStagedDelivery as any)('force-replace',old);expect(result).toBe(false);expect(useProjectStore.getState().screens.page.htmlContent).toBe(original);});
test('其它门禁阻断不能通过结构确认放行',async()=>{
 await mount();await act(async()=>useProjectStore.getState().setStagedRenderQuality(key(),{status:'unavailable',findings:[],inspected:0,reason:'渲染未完成'}));
 expect(host.querySelector('input[aria-label="我已检查并接受这次结构变化"]')).toBeNull();expect(btn('采纳新版').disabled).toBe(true);expect(await (useProjectStore.getState().commitStagedDelivery as any)('confirm-structure-keep-both',key())).toBe(false);
});
test('严格结构确认不能绕过静态质量、资源或缺少确认上下文',async()=>{
 expect(await useProjectStore.getState().commitStagedDelivery('confirm-structure-replace')).toBe(false);
 stage(candidate.replace('登录查看',''));expect(useProjectStore.getState().getStagedDeliveryReport().checks.find(c=>c.id==='quality')?.status).toBe('blocked');
 expect(await useProjectStore.getState().commitStagedDelivery('confirm-structure-replace',key())).toBe(false);
 stage(candidate+'<img src="assets/images/missing.png" alt="缺失图片">');expect(useProjectStore.getState().getStagedDeliveryReport().checks.find(c=>c.id==='assets')?.status).toBe('blocked');
 expect(await useProjectStore.getState().commitStagedDelivery('confirm-structure-keep-both',key())).toBe(false);expect(useProjectStore.getState().screens.page.htmlContent).toBe(original);
});
test('确认结构替换存档并可撤销，普通阻断尝试返回可见错误',async()=>{
 expect(await useProjectStore.getState().adoptStagedChange()).toBe(false);expect(useProjectStore.getState().stagedAdoptionError).toContain('结构守卫');
 expect(await useProjectStore.getState().commitStagedDelivery('confirm-structure-replace',key())).toBe(true);const state=useProjectStore.getState();expect(state.screens.page.htmlContent).toContain('隐私提示');
 expect((await new DeliveryRepository(createProjectStorage(state.id),state.id).listForScreen('page')).records[0].mode).toBe('confirm-structure-replace');
 useHistoryStore.getState().undo();expect(useProjectStore.getState().screens.page.htmlContent).toBe(original);
});
