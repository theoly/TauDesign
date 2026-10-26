import {writeProject} from '../src/utils/projectRegistry';
import {afterEach,beforeEach,expect,spyOn,test} from 'bun:test';
import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {useProjectStore} from '../src/stores/useProjectStore';
import {useWorkspaceStore} from '../src/stores/useWorkspaceStore';
import {useHistoryStore} from '../src/stores/useHistoryStore';
import {prepareLibrarySourceEdit} from '../src/services/ai/designLibrarySource';
import {readDesignLibraryCopy} from '../src/services/ai/designLibraryCopy';
import {prepareDesignLibraryImport,applyDesignLibraryImport} from '../src/services/ai/designLibraryImport';
import {ProjectRepository,type ProjectDocument} from '../src/services/storage/projectRepository';
import * as storage from '../src/services/storage/projectStorage';
import * as folder from '../src/services/storage/folderPicker';
import {resumeHistoryPersistence,flushHistorySaveChecked} from '../src/services/storage/historyPersistence';
import {loadStagedCandidate} from '../src/services/storage/candidateRepository';
import {neutralModernTheme} from '../src/utils/themePresets';
import {DesignLibrarySourceEditor} from '../src/components/theme/DesignLibrarySourceEditor';
import {LibraryEditingBanner} from '../src/components/workspace/LibraryEditingBanner';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
let source:storage.LocalStorageStorage,consumer:storage.LocalStorageStorage,doc:ProjectDocument;
let prior:ReturnType<typeof useProjectStore.getState>,workspace:ReturnType<typeof useWorkspaceStore.getState>,history:ReturnType<typeof useHistoryStore.getState>;
let factory:ReturnType<typeof spyOn>,picker:ReturnType<typeof spyOn>,runtime:ReturnType<typeof spyOn>,root:Root|undefined,host:HTMLDivElement;
const sourcePath='/virtual/library.aidesign',consumerPath='/virtual/consumer.aidesign';
const actualFactory=storage.createProjectStorage;
const prepare=(options:{signal?:AbortSignal;isCurrent?:()=>boolean}={})=>prepareLibrarySourceEdit(source,sourcePath,useProjectStore.getState(),{isCurrent:options.isCurrent??(()=>true),signal:options.signal});
async function enter(){const preview=await prepare();expect(await useWorkspaceStore.getState().enterLibrarySource(preview)).toBe(true);return preview;}
beforeEach(async()=>{
 prior=useProjectStore.getState();workspace=useWorkspaceStore.getState();history=useHistoryStore.getState();useHistoryStore.getState().restore(null);resumeHistoryPersistence();
 source=new storage.LocalStorageStorage('author-source-'+crypto.randomUUID());consumer=new storage.LocalStorageStorage('author-consumer-'+crypto.randomUUID());
 factory=spyOn(storage,'createProjectStorage').mockImplementation((id,path)=>path===sourcePath?source:path===consumerPath?consumer:actualFactory(id,path));
 picker=spyOn(folder,'pickProjectFolder').mockResolvedValue(sourcePath);runtime=spyOn(folder,'isDesktopRuntime').mockReturnValue(true);
 const s=useProjectStore.getState(),id=s.initNewProject({name:'消费工程',deviceProfile:'mobile',designSystem:neutralModernTheme,folderPath:consumerPath,createSpecimen:false});
 doc={id:'source-'+crypto.randomUUID(),name:'源设计库',settings:structuredClone(useProjectStore.getState().settings),designSystem:structuredClone(neutralModernTheme) as any,screens:{page:{id:'page',name:'源页面',position:{x:0,y:0},htmlContent:'<main data-nid="root" class="p-4"><h1>源页面内容</h1></main>'}},components:{card:{id:'card',name:'卡片',templateHtml:'<article class="card"><p data-slot="name">默认姓名</p></article>',version:1,templateContract:{version:1},slotDefs:[{slotName:'name',selector:'[data-slot="name"]',type:'text',defaultContent:'默认姓名'}],createdAt:1,updatedAt:1}},assets:{},overrides:{},decisions:{}};
 await new ProjectRepository(source).save(doc);
 const copy=await readDesignLibraryCopy(source,()=>{},'pinned_reference');s.applyDesignLibraryCopy(copy);
 s.addScreen({name:'消费页面',htmlContent:`<main data-nid="consumer"><article data-nid="instance" data-component-id="${Object.keys(copy.components)[0]}" data-component-version="1" class="card"><p data-slot="name">消费者姓名</p></article></main>`},'consumer');
 useWorkspaceStore.setState({view:'workspace',activeProjectId:id,navigationRevision:workspace.navigationRevision+1,sourceEditing:null,sourceTransition:null,sourceTransitionError:null});
 await s.saveProjectChecked();await flushHistorySaveChecked(id,consumerPath);
});
afterEach(async()=>{if(root)act(()=>root!.unmount());root=undefined;host?.remove();await useProjectStore.getState().saveProjectChecked().catch(()=>{});factory.mockRestore();picker.mockRestore();runtime.mockRestore();useProjectStore.setState(prior,true);useWorkspaceStore.setState(workspace,true);useHistoryStore.setState(history,true);resumeHistoryPersistence();});
test('只读预览不写来源、不切工程，路径和源正文不放进预览',async()=>{
 const id=useProjectStore.getState().id,raw=await source.readText('project.json');const preview=await prepare();expect(preview.sourceId).toBe(doc.id);expect(preview.componentCount).toBe(1);expect(preview.pageCount).toBe(1);expect(preview.changed).toBe(false);expect(useProjectStore.getState().id).toBe(id);expect(await source.readText('project.json')).toBe(raw);expect(JSON.stringify(preview)).not.toContain(sourcePath);expect(JSON.stringify(preview)).not.toContain('源页面内容');
});
for(const kind of ['wrong-id','self','wrong-device','missing-page','missing-document','bad-component','array-components'] as const)test(`${kind} 不能进入源编辑`,async()=>{
 const next=structuredClone(doc);if(kind==='wrong-id')next.id='another';if(kind==='self')next.id=useProjectStore.getState().id;if(kind==='wrong-device')next.settings.deviceProfile='pc';if(kind==='missing-page')await source.remove('screens/page.html');if(kind==='missing-document')(next as any).projectDocuments={missing:{id:'missing',title:'文档',source:'manual',enabled:true,contentFile:'documents/missing.md'}};if(kind==='bad-component')(next.components as any).card.slotDefs[0].selector='invalid';if(kind==='array-components')next.components=Object.values(next.components as any);
 if(!['missing-page'].includes(kind)){const meta=JSON.parse((await source.readText('project.json'))!);await source.writeTextAtomic('project.json',JSON.stringify({...meta,...next,screens:meta.screens}));}
 await expect(prepare()).rejects.toThrow();expect(useWorkspaceStore.getState().sourceEditing).toBeNull();
});
test('进入源库后缓存/页面不联动，源编辑及History真实存盘，返回恢复原候选与撤销记录',async()=>{
 const s=useProjectStore.getState(),id=s.id,binding=structuredClone(s.designLibraryBinding),original=s.screens.consumer.htmlContent;
 s.stageScreenChange('consumer',original.replace('消费者姓名','候选姓名'),'候选');const before=useHistoryStore.getState().past.length;await enter();
 expect(useProjectStore.getState().id).toBe(doc.id);expect(useWorkspaceStore.getState().sourceEditing?.returnTo.id).toBe(id);expect(useHistoryStore.getState().past).toHaveLength(0);
 useProjectStore.getState().updateComponent('card',{templateHtml:'<article class="card p-4"><p data-slot="name">默认姓名</p></article>'});expect(useProjectStore.getState().components.card.version).toBe(2);
 useHistoryStore.getState().undo();expect(useProjectStore.getState().components.card.version).toBe(1);useHistoryStore.getState().redo();expect(useProjectStore.getState().components.card.version).toBe(2);
 expect(await useWorkspaceStore.getState().returnFromLibrarySource()).toBe(true);const returned=useProjectStore.getState();expect(returned.id).toBe(id);expect(returned.designLibraryBinding).toEqual(binding);expect(returned.screens.consumer.htmlContent).toBe(original);expect(returned.stagedScreen?.newHtml).toContain('候选姓名');expect(returned.stagedRenderQuality).toBeNull();expect(useHistoryStore.getState().past).toHaveLength(before);
 expect((JSON.parse((await source.readText('project.json'))!).components as any).card.version).toBe(2);expect((await loadStagedCandidate(id,consumerPath))!.newHtml).toContain('候选姓名');
 const preview=await prepareDesignLibraryImport(source,returned,{mode:'pinned_reference',targetStorage:consumer});expect(preview.source.sourceFingerprint).not.toBe(binding!.sourceFingerprint);expect(useProjectStore.getState().designLibraryBinding).toEqual(binding);
 const applied=await applyDesignLibraryImport(preview,{getState:()=>useProjectStore.getState(),commit:copy=>useProjectStore.getState().applyDesignLibraryCopy(copy)});expect(applied.status).toBe('applied');expect(useProjectStore.getState().screens.consumer.htmlContent).toBe(original);
});
for(const timing of ['preview-source-change','consumer-change','candidate-change','abort','tamper'] as const)test(`${timing} 旧预览不得切换`,async()=>{
 const id=useProjectStore.getState().id,preview=await prepare(),controller=new AbortController();if(timing==='preview-source-change')await source.writeTextAtomic('screens/page.html','<main>外部变更</main>');if(timing==='consumer-change')useProjectStore.getState().addDecision('改变需求','global');if(timing==='candidate-change')useProjectStore.getState().stageScreenChange('consumer',useProjectStore.getState().screens.consumer.htmlContent,'新候选');if(timing==='abort')controller.abort();if(timing==='tamper')preview.sourceName='伪造';
 expect(await useWorkspaceStore.getState().enterLibrarySource(preview,controller.signal)).toBe(false);expect(useProjectStore.getState().id).toBe(id);expect(useWorkspaceStore.getState().sourceEditing).toBeNull();expect(await useWorkspaceStore.getState().enterLibrarySource(preview)).toBe(false);
});
for(const path of ['project.json','history.json','candidates/current.json'])test(`${path} 保存失败保留当前工程和History`,async()=>{
 const s=useProjectStore.getState(),id=s.id;s.stageScreenChange('consumer',s.screens.consumer.htmlContent,'候选');const preview=await prepare(),before=useHistoryStore.getState().past.length;
 const write=consumer.writeTextAtomic.bind(consumer);consumer.writeTextAtomic=async(rel,text)=>{if(rel===path)throw Error('disk full '+path);return write(rel,text);};
 expect(await useWorkspaceStore.getState().enterLibrarySource(preview)).toBe(false);expect(useProjectStore.getState().id).toBe(id);expect(useHistoryStore.getState().past).toHaveLength(before);expect(useWorkspaceStore.getState().sourceTransitionError).toContain('disk full');consumer.writeTextAtomic=write;
});
test('返回保存失败停留源工程，可修复后重试且不误写消费工程',async()=>{
 await enter();const write=source.writeTextAtomic.bind(source);source.writeTextAtomic=async(rel,text)=>{if(rel==='project.json')throw Error('source disk full');return write(rel,text);};
 expect(await useWorkspaceStore.getState().returnFromLibrarySource()).toBe(false);expect(useProjectStore.getState().id).toBe(doc.id);expect(useWorkspaceStore.getState().sourceEditing).not.toBeNull();source.writeTextAtomic=write;expect(await useWorkspaceStore.getState().returnFromLibrarySource()).toBe(true);
});
test('重复确认只进入一次；普通导航让迟到读取失效',async()=>{
 const preview=await prepare();let release!:()=>void,armed=true;const read=source.readText.bind(source);source.readText=async path=>{if(armed){armed=false;await new Promise<void>(r=>release=r);}return read(path);};
 const job=useWorkspaceStore.getState().enterLibrarySource(preview);expect(await useWorkspaceStore.getState().enterLibrarySource(preview)).toBe(false);useWorkspaceStore.getState().backToManager();release();expect(await job).toBe(false);expect(useWorkspaceStore.getState().view).toBe('manager');expect(useWorkspaceStore.getState().sourceEditing).toBeNull();source.readText=read;
});
test('返回工程被替换或缺失页面时不离开源工程',async()=>{
 await enter();await consumer.remove('screens/consumer.html');expect(await useWorkspaceStore.getState().returnFromLibrarySource()).toBe(false);expect(useProjectStore.getState().id).toBe(doc.id);expect(useWorkspaceStore.getState().sourceTransitionError).toContain('缺失');
});
test('源工程自身的只读参考不被编辑入口解除',async()=>{
 const raw=JSON.parse((await source.readText('project.json'))!);raw.designLibraryBinding=structuredClone(useProjectStore.getState().designLibraryBinding);await source.writeTextAtomic('project.json',JSON.stringify(raw));const preview=await prepare();expect(preview.upstreamReadOnly).toBe(true);expect(await useWorkspaceStore.getState().enterLibrarySource(preview)).toBe(true);expect(useProjectStore.getState().designLibraryBinding?.mode).toBe('pinned_reference');expect(()=>useProjectStore.getState().setDesignSystem(neutralModernTheme)).toThrow('只读');
});
function mount(element:React.ReactNode){host=document.createElement('div');document.body.append(host);root=createRoot(host);act(()=>root!.render(element));}
const click=async(text:string)=>{await act(async()=>Array.from(host.querySelectorAll('button')).find(b=>b.textContent===text)!.click());};
test('实际预览/取消/确认和横幅返回，未确认不进入源工程',async()=>{
 mount(<><DesignLibrarySourceEditor/><LibraryEditingBanner/></>);await click('编辑源库：选择来源工程');expect(host.textContent).toContain('1 个组件');expect(host.textContent).toContain('确认进入源库编辑');await click('取消源库编辑');expect(host.textContent).not.toContain('确认进入源库编辑');await click('编辑源库：选择来源工程');await click('确认进入源库编辑');expect(host.textContent).toContain('正在编辑源库');await click('保存并返回「消费工程」');expect(host.textContent).not.toContain('正在编辑源库');
});
test('取消发生在工程写入等待期间：写入结束后不切源、不污染History',async()=>{
 const id=useProjectStore.getState().id,preview=await prepare(),controller=new AbortController(),write=consumer.writeTextAtomic.bind(consumer);let release!:()=>void,held=false;
 consumer.writeTextAtomic=async(rel,text)=>{if(rel==='project.json'&&!held){held=true;await new Promise<void>(r=>release=r);}return write(rel,text);};
 const job=useWorkspaceStore.getState().enterLibrarySource(preview,controller.signal);for(let i=0;i<100&&!release;i++)await new Promise(r=>setTimeout(r,1));expect(Boolean(release)).toBe(true);controller.abort();release();expect(await job).toBe(false);expect(useProjectStore.getState().id).toBe(id);expect(useWorkspaceStore.getState().sourceEditing).toBeNull();consumer.writeTextAtomic=write;
});
test('运行态返回路径不写入源工程或消费绑定，常规新建清除编辑上下文',async()=>{
 await enter();await useProjectStore.getState().saveProjectChecked();const raw=(await source.readText('project.json'))!;expect(raw).not.toContain(sourcePath);expect(raw).not.toContain(consumerPath);expect(raw).not.toContain('sourceEditing');
 useWorkspaceStore.getState().createProject('另一个工程','mobile',neutralModernTheme);expect(useWorkspaceStore.getState().sourceEditing).toBeNull();expect(useWorkspaceStore.getState().sourceTransition).toBeNull();expect(await useWorkspaceStore.getState().returnFromLibrarySource()).toBe(false);
});

test('常规打开本地工程清除源文件夹关联，后续自动保存不误写源库',async()=>{
 const localId='local-'+crypto.randomUUID();writeProject(localId,JSON.stringify({id:localId,name:'本地工程',settings:useProjectStore.getState().settings,designSystem:neutralModernTheme,screens:{},components:{},assets:{}}));
 await enter();const before=await source.readText('project.json');expect(useWorkspaceStore.getState().openProject(localId)).toBe(true);expect(useProjectStore.getState().folderPath).toBeUndefined();useProjectStore.getState().setName('本地工程修改');await useProjectStore.getState().saveProjectChecked();expect(await source.readText('project.json')).toBe(before);expect(useWorkspaceStore.getState().sourceEditing).toBeNull();
});
