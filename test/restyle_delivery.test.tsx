import {resourceRenderReport,stageResourceReport} from './helpers/renderResourceProof';
import {afterEach,beforeEach,expect,spyOn,test} from 'bun:test';
import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {useProjectStore} from '../src/stores/useProjectStore';
import {useHistoryStore} from '../src/stores/useHistoryStore';
import {neutralModernTheme} from '../src/utils/themePresets';
import {PageRenderCheck} from '../src/services/ai/pageRenderCheck';
import {PagePreviewCapture} from '../src/services/storage/pagePreview';
import {RestyleDeliveryRepository} from '../src/services/storage/restyleDeliveryRepository';
import {LocalStorageStorage,createProjectStorage} from '../src/services/storage/projectStorage';
import {acceptRestyleResult} from '../src/services/ai/restyleService';
import {executeRestyleBatch,restyleContextKey} from '../src/services/ai/restyleBatch';
import {DeliveryHistoryPanel} from '../src/components/inspector/DeliveryHistoryPanel';
import {RestyleDeliveryHistoryPanel} from '../src/components/inspector/RestyleDeliveryHistoryPanel';
import {readProject} from '../src/utils/projectRegistry';
import {png} from './helpers/previewPng';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
const source='<main data-nid="root" class="p-4"><button data-nid="action" class="btn btn-primary">提交</button></main>';
const pause=()=>new Promise(resolve=>setTimeout(resolve,0));
let prior:ReturnType<typeof useProjectStore.getState>,history:ReturnType<typeof useHistoryStore.getState>;
let render:ReturnType<typeof spyOn>,capture:ReturnType<typeof spyOn>,root:Root|undefined,host:HTMLDivElement|undefined;
const actualCapture=PagePreviewCapture.capture;
beforeEach(()=>{
  prior=useProjectStore.getState();history=useHistoryStore.getState();
  const store=useProjectStore.getState();store.initNewProject({name:'重塑档案',deviceProfile:'mobile',designSystem:neutralModernTheme,createSpecimen:false});
  store.addScreen({name:'页面甲',htmlContent:source,position:{x:0,y:0}},'a');
  render=spyOn(PageRenderCheck,'inspect').mockImplementation((request,storage)=>resourceRenderReport(request,storage,{status:'complete',findings:[],inspected:2}));
  capture=spyOn(PagePreviewCapture,'capture').mockImplementation((request,storage,deps)=>actualCapture(request,storage,{...deps,
    render:async()=>({dataUrl:`data:image/png;base64,${png(390,844)}`,engine:'foreign-object',cssHeight:844})}));
});
afterEach(()=>{
  if(root)act(()=>root!.unmount());host?.remove();root=undefined;host=undefined;
  render.mockRestore();capture.mockRestore();useProjectStore.setState(prior,true);useHistoryStore.setState(history,true);
});
const proposal=()=>acceptRestyleResult({kind:'screen',id:'a',name:'页面甲',html:useProjectStore.getState().screens.a.htmlContent},
  useProjectStore.getState().screens.a.htmlContent.replace('p-4','p-6'));
const repo=(id=useProjectStore.getState().id)=>new RestyleDeliveryRepository(createProjectStorage(id),id);
async function until(condition:()=>boolean){for(let i=0;i<60&&!condition();i++)await pause();expect(condition()).toBe(true);}

test('page delivery history exposes restyle snapshots, checked evidence and a separately stored preview',async()=>{
  const store=useProjectStore.getState();expect((await store.applyRestyleOutcome(proposal())).applied).toBe(true);
  const records=(await repo().list({screenId:'a'})).records;expect(records).toHaveLength(1);
  expect(records[0].pages[0].preview?.status).toBe('ready');
  expect(JSON.stringify(records[0])).not.toContain('data:image/png;base64,');
  expect(readProject(store.id)).not.toContain('"validation"');
  host=document.createElement('div');document.body.append(host);root=createRoot(host);
  await act(async()=>{root!.render(<DeliveryHistoryPanel projectId={store.id} screen={useProjectStore.getState().screens.a} revision={1}/>);await pause();});
  expect(host.textContent).toContain('重塑交付历史');
  await act(async()=>{const entry=Array.from(host!.querySelectorAll('details')).find(el=>el.querySelector(':scope > summary')?.textContent==='重塑交付历史')!;entry.open=true;entry.dispatchEvent(new Event('toggle'));await pause();});
  expect(host.textContent).toContain('页面甲');expect(host.textContent).toContain('历史证据');
});

test('a failed archive preparation leaves page, checkpoints and the existing candidate intact and removes unreferenced previews',async()=>{
  const store=useProjectStore.getState(),past=useHistoryStore.getState().past.length,checkpoints=useHistoryStore.getState().checkpoints.length;
  store.stageScreenChange('a',source.replace('提交','下一版'),'另一个候选');const candidate=useProjectStore.getState().stagedScreen;
  const prepare=spyOn(RestyleDeliveryRepository.prototype,'prepare').mockRejectedValue(new Error('disk full'));
  try{
    const result=await store.applyRestyleOutcome(proposal());expect(result.applied).toBe(false);expect(result.message).toContain('disk full');
    expect(useProjectStore.getState().screens.a.htmlContent).toBe(source);expect(useProjectStore.getState().stagedScreen).toBe(candidate);
    expect(useHistoryStore.getState().past).toHaveLength(past);expect(useHistoryStore.getState().checkpoints).toHaveLength(checkpoints);
    expect((await createProjectStorage(store.id).listDir('assets/images')).filter(name=>name.startsWith('delivery-preview-delivery-restyle-'))).toHaveLength(0);
  }finally{prepare.mockRestore();store.discardStagedChange();}
});

for(const change of ['edit','cancel','switch'] as const)test(`${change} during archive preparation aborts the event without delayed changes`,async()=>{
  const store=useProjectStore.getState(),id=store.id,before=useHistoryStore.getState().checkpoints.length,controller=new AbortController();
  const real=RestyleDeliveryRepository.prototype.prepare;let release!:(()=>void);
  const prepare=spyOn(RestyleDeliveryRepository.prototype,'prepare').mockImplementation(async function(record){await real.call(this,record);await new Promise<void>(resolve=>{release=resolve;});});
  try{
    const pending=store.applyRestyleOutcome(proposal(),controller.signal);await until(()=>Boolean(release));
    if(change==='edit')store.updateScreenHtml('a',source.replace('提交','人工变更'));
    if(change==='cancel')controller.abort();
    if(change==='switch')store.initNewProject({name:'另一个工程',deviceProfile:'mobile',createSpecimen:false});
    release();expect((await pending).applied).toBe(false);expect((await repo(id).list()).records[0].status).toBe('aborted');
    expect(useHistoryStore.getState().checkpoints).toHaveLength(before);
    if(change==='edit')expect(useProjectStore.getState().screens.a.htmlContent).toContain('人工变更');
    if(change==='cancel')expect(useProjectStore.getState().screens.a.htmlContent).toBe(source);
    if(change==='switch')expect(useProjectStore.getState().screenOrder).toHaveLength(0);
  }finally{prepare.mockRestore();}
});

test('a retained file removed while archiving rejects application even after render passed',async()=>{
  const store=useProjectStore.getState(),storage=createProjectStorage(store.id),path='assets/images/retained.png';
  await storage.writeBinary(path,png(1,1));store.addAsset({id:'photo',name:'图片',relPath:path,type:'image',mimeType:'image/png',source:'upload',refCount:1});
  store.updateScreenHtml('a',source.replace('</main>',`<img src="${path}" alt="照片"></main>`));const before=useProjectStore.getState().screens.a.htmlContent;
  const real=RestyleDeliveryRepository.prototype.prepare,prepare=spyOn(RestyleDeliveryRepository.prototype,'prepare').mockImplementation(async function(record){await real.call(this,record);await storage.remove(path);});
  try{const result=await store.applyRestyleOutcome(proposal());expect(result.applied).toBe(false);expect(result.message).toContain('不存在');
    expect(useProjectStore.getState().screens.a.htmlContent).toBe(before);expect((await repo().list()).records[0].status).toBe('aborted');
  }finally{prepare.mockRestore();}
});

test('failed finalization reports applied with an uncertain prepared archive, and undo keeps that history',async()=>{
  const store=useProjectStore.getState(),finish=spyOn(RestyleDeliveryRepository.prototype,'finish').mockRejectedValue(new Error('disk offline'));
  try{
    const result=await store.applyRestyleOutcome(proposal());expect(result).toMatchObject({applied:true,delivery:{status:'prepared'}});
    expect(result.delivery?.message).toContain('已应用');expect(useProjectStore.getState().deliveryArchiveNotice).toContain('准备记录');
    useHistoryStore.getState().undo();expect(useProjectStore.getState().screens.a.htmlContent).toBe(source);
    expect((await repo().list()).records[0].status).toBe('prepared');
  }finally{finish.mockRestore();}
});

test('editing during asynchronous finalization stops the batch before another model request',async()=>{
  const store=useProjectStore.getState();store.addScreen({name:'页面乙',htmlContent:source,position:{x:450,y:0}},'b');
  const plan=store.buildRestylePlan(),real=RestyleDeliveryRepository.prototype.finish;let release!:(()=>void),calls=0;
  const finish=spyOn(RestyleDeliveryRepository.prototype,'finish').mockImplementation(async function(record,status,reason){
    if(status==='applied')await new Promise<void>(resolve=>{release=resolve;});await real.call(this,record,status,reason);
  });
  try{
    const pending=executeRestyleBatch({plan,dryRun:acceptRestyleResult(plan.dryRun!,plan.dryRun!.html.replace('p-4','p-6')),confirmedContextKey:restyleContextKey(useProjectStore.getState()),getContextKey:()=>restyleContextKey(useProjectStore.getState()),
      resolveTarget:target=>({...target,html:useProjectStore.getState().screens[target.id].htmlContent}),
      generate:async target=>{calls++;return acceptRestyleResult(target,target.html.replace('p-4','p-6'));},apply:outcome=>store.applyRestyleOutcome(outcome)});
    await until(()=>Boolean(release));store.updateScreenHtml('b',source.replace('提交','手动编辑'));release();
    const result=await pending;expect(result.status).toBe('stale');expect(calls).toBe(0);expect(result.outcomes).toHaveLength(1);
    expect(result.outcomes[0].delivery?.status).toBe('applied');expect((await repo().list()).records[0].batchId).toStartWith('restyle-batch-');
  }finally{finish.mockRestore();}
});

test('component event contains exactly the changed pages and persists even without an instance',async()=>{
  const store=useProjectStore.getState(),id=store.createComponent('操作','<section data-nid="comp" class="card p-4">组件内容</section>');
  const apply=()=>{const target={kind:'component' as const,id,name:'操作',html:useProjectStore.getState().components[id].templateHtml};return store.applyRestyleOutcome(acceptRestyleResult(target,target.html.replace('p-4','p-6')));};
  expect((await apply()).applied).toBe(true);const noInstance=(await repo().list()).records[0];
  expect(noInstance.pages).toHaveLength(0);expect(noInstance.component?.before.templateHtml).toContain('p-4');expect(noInstance.component?.after.templateHtml).toContain('p-6');
  useHistoryStore.getState().undo();store.insertComponent('a',id);const before=useProjectStore.getState().screens.a.htmlContent;
  expect((await apply()).applied).toBe(true);const linked=(await repo().list({screenId:'a'})).records[0];
  expect(linked.pages).toHaveLength(1);expect(linked.pages[0].before.htmlContent).toBe(before);
  expect(linked.validation.pages.map(page=>page.id)).toEqual([`template-${id}`,'a']);
  useHistoryStore.getState().undo();expect(useProjectStore.getState().screens.a.htmlContent).toBe(before);
  useHistoryStore.getState().redo();expect(useProjectStore.getState().screens.a.htmlContent).toBe(linked.pages[0].after.htmlContent);
});

test('bad archives are isolated, a malformed preview does not hide valid code, and path traversal is refused',async()=>{
  const store=useProjectStore.getState();await store.applyRestyleOutcome(proposal());const storage=createProjectStorage(store.id),record=(await repo().list()).records[0];
  (record.pages[0] as any).preview={status:'ready',relPath:'../../private.png'};
  await storage.writeTextAtomic(`deliveries/restyle/${record.id}.json`,JSON.stringify(record));
  await storage.writeTextAtomic('deliveries/restyle/restyle-zzzz-broken.json','{bad');
  const result=await repo().list();expect(result.invalidFiles).toBe(1);expect(result.records).toHaveLength(1);expect(result.records[0].pages[0].preview).toMatchObject({status:'failed'});
  await expect(repo().prepare({...record,id:'../escape',status:'prepared'})).rejects.toThrow();
});

test('partial archive write failures remove preview bytes while preserving old files',async()=>{
  const store=useProjectStore.getState(),storage=createProjectStorage(store.id),old='assets/images/keep.png';await storage.writeBinary(old,png(1,1));
  const actual=LocalStorageStorage.prototype.writeTextAtomic;
  const write=spyOn(LocalStorageStorage.prototype,'writeTextAtomic').mockImplementation(async function(path,raw){if(path.startsWith('deliveries/restyle/'))throw new Error('atomic write failed');return actual.call(this,path,raw);});
  try{expect((await store.applyRestyleOutcome(proposal())).applied).toBe(false);expect(await storage.exists(old)).toBe(true);
    expect((await storage.listDir('assets/images')).filter(name=>name.startsWith('delivery-preview-delivery-restyle-'))).toHaveLength(0);
  }finally{write.mockRestore();}
});
test('malformed nested display fields cannot crash or hide other valid history entries',async()=>{
  const store=useProjectStore.getState();await store.applyRestyleOutcome(proposal());
  const storage=createProjectStorage(store.id),record=(await repo().list()).records[0];
  const cases=[
    {designSystemOrigin:{...record.designSystemOrigin,sourceName:{damaged:true}}},
    {designSystem:{...record.designSystem,name:{damaged:true}}},
    {settings:{...record.settings,referenceDevice:{...record.settings.referenceDevice,name:{damaged:true}}}},
    {settings:{...record.settings,deviceProfile:{damaged:true}}}
  ];
  for(const [index,change] of cases.entries()){
    const id=`restyle-zzzz-damaged-${index}`;
    await storage.writeTextAtomic(`deliveries/restyle/${id}.json`,JSON.stringify({...record,id,...change}));
  }
  const result=await repo().list();expect(result.invalidFiles).toBe(4);expect(result.records.map(r=>r.id)).toEqual([record.id]);
});
test('caller mutation during rendering cannot change the archived request, target or checked result',async()=>{
  const store=useProjectStore.getState(),outcome=proposal();let release!:(value:any)=>void;
  render.mockImplementation(()=>new Promise(resolve=>{release=resolve;}));
  const pending=store.applyRestyleOutcome(outcome);await until(()=>Boolean(release));
  outcome.target.id='different-page';outcome.target.name='污染目标';outcome.html='<main>污染页面</main>';
  release({status:'complete',findings:[],inspected:2});expect((await pending).applied).toBe(true);
  const record=(await repo().list()).records[0];expect(record.outcome.target.id).toBe('a');expect(record.outcome.target.name).toBe('页面甲');
  expect(record.pages[0].after.htmlContent).toContain('p-6');expect(record.pages[0].after.htmlContent).not.toContain('污染');
});
test('cancellation after preview bytes are written removes the unarchived image without applying',async()=>{
  const store=useProjectStore.getState(),controller=new AbortController();let release!:(()=>void);
  const original=capture.getMockImplementation()!;
  capture.mockImplementation(async(...args:any[])=>{const result=await (original as any)(...args);await new Promise<void>(resolve=>{release=resolve;});return result;});
  const pending=store.applyRestyleOutcome(proposal(),controller.signal);await until(()=>Boolean(release));controller.abort();release();
  expect((await pending).applied).toBe(false);expect(useProjectStore.getState().screens.a.htmlContent).toBe(source);
  expect((await repo().list()).records).toHaveLength(0);
  expect((await createProjectStorage(store.id).listDir('assets/images')).filter(name=>name.startsWith('delivery-preview-delivery-restyle-'))).toHaveLength(0);
});
test('late history reads from another project never appear in the current panel',async()=>{
  const store=useProjectStore.getState();await store.applyRestyleOutcome(proposal());
  const previous=await repo().list();let release!:(value:typeof previous)=>void;
  const read=spyOn(RestyleDeliveryRepository.prototype,'list').mockImplementation(()=>new Promise(resolve=>{release=resolve;}));
  try{
    host=document.createElement('div');document.body.append(host);root=createRoot(host);
    await act(async()=>{root!.render(<RestyleDeliveryHistoryPanel projectId={store.id} revision={0}/>);});
    await act(async()=>{const entry=host!.querySelector('details')!;entry.open=true;entry.dispatchEvent(new Event('toggle'));await pause();});
    const oldRelease=release;
    const next=store.initNewProject({name:'新的历史',deviceProfile:'mobile',createSpecimen:false});
    await act(async()=>{root!.render(<RestyleDeliveryHistoryPanel projectId={next} revision={0}/>);await pause();});
    await act(async()=>{oldRelease(previous);release({records:[],invalidFiles:0,hasMore:false});await pause();});
    expect(host.textContent).not.toContain('页面甲');expect(host.textContent).toContain('暂无重塑记录');
  }finally{read.mockRestore();}
});

test('same-path resource replacement during archive preparation rejects the restyle with no History changes',async()=>{
 const store=useProjectStore.getState(),storage=createProjectStorage(store.id),path='assets/images/replaced.png';
 await storage.writeBinary(path,png(1,1));store.addAsset({id:'replaced',name:'图片',relPath:path,type:'image',mimeType:'image/png',source:'upload',refCount:1});
 store.updateScreenHtml('a',source.replace('</main>',`<img src="${path}" alt="照片"></main>`));const before=useProjectStore.getState().screens.a.htmlContent,count=useHistoryStore.getState().past.length;
 const real=RestyleDeliveryRepository.prototype.prepare,prepare=spyOn(RestyleDeliveryRepository.prototype,'prepare').mockImplementation(async function(record){await real.call(this,record);await storage.writeBinary(path,png(2,2));});
 try{const result=await store.applyRestyleOutcome(proposal());expect(result.applied).toBe(false);expect(result.message).toContain('资源内容已变化');
  expect(useProjectStore.getState().screens.a.htmlContent).toBe(before);expect(useHistoryStore.getState().past.length).toBe(count);
  expect((await repo().list()).records[0].status).toBe('aborted');
 }finally{prepare.mockRestore();}
});
