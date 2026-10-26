import {afterEach,beforeEach,describe,expect,test} from 'bun:test';
import {prepareDesignLibraryImport,applyDesignLibraryImport,designLibraryImportContext} from '../src/services/ai/designLibraryImport';
import {readDesignLibraryCopy} from '../src/services/ai/designLibraryCopy';
import {LocalStorageStorage} from '../src/services/storage/projectStorage';
import {useProjectStore} from '../src/stores/useProjectStore';
import {useHistoryStore} from '../src/stores/useHistoryStore';
import {neutralModernTheme} from '../src/utils/themePresets';
import {readProject} from '../src/utils/projectRegistry';

const binary='bGlicmFyeS1pbWFnZQ==';
const data=()=>({id:'source',name:'设计来源',settings:{deviceProfile:'mobile'},savedAt:1,designSystem:structuredClone(neutralModernTheme),designSystemOrigin:{tokenVersion:4},
  components:{card:{id:'card',name:'资料卡',description:'卡片说明',slotDefs:[{slotName:'title',selector:'span',type:'text',defaultContent:'标题'}],
    templateHtml:'<article data-component-id="card"><span>标题</span><img src="assets/images/logo.png" data-asset-id="logo"></article>',version:2,createdAt:1,updatedAt:1}},
  assets:{logo:{id:'logo',name:'图标',type:'image',mimeType:'image/png',source:'upload',relPath:'assets/images/logo.png',refCount:1}}});
let source:LocalStorageStorage,target:LocalStorageStorage,prior:ReturnType<typeof useProjectStore.getState>,history:ReturnType<typeof useHistoryStore.getState>;
beforeEach(async()=>{
  prior=useProjectStore.getState();history=useHistoryStore.getState();
  useProjectStore.getState().initNewProject({name:'库目标',deviceProfile:'mobile',createSpecimen:false});
  source=new LocalStorageStorage('library-source-'+crypto.randomUUID());target=new LocalStorageStorage('library-target-'+crypto.randomUUID());
  await source.writeTextAtomic('project.json',JSON.stringify(data()));await source.writeBinary('assets/images/logo.png',binary);
});
afterEach(()=>{useProjectStore.setState(prior,true);useHistoryStore.setState(history,true);});
const prepare=()=>prepareDesignLibraryImport(source,useProjectStore.getState(),{targetStorage:target});
const apply=(preview:Awaited<ReturnType<typeof prepare>>,extra:Partial<Parameters<typeof applyDesignLibraryImport>[1]>={})=>applyDesignLibraryImport(preview,{getState:()=>useProjectStore.getState(),commit:copy=>useProjectStore.getState().applyDesignLibraryCopy(copy),...extra});

describe('设计库来源与预览确认',()=>{
  test('读取只读、预览不安装，确认后一次History，撤销/重做和重开保留有限回执',async()=>{
    const sourceBefore=await source.readText('project.json'),before=useHistoryStore.getState().past.length;
    const preview=await prepare();expect(preview.components[0]).toMatchObject({name:'资料卡',action:'add'});expect(preview.assets[0].action).toBe('add');
    expect(await target.exists(preview.assets[0].relPath)).toBe(false);expect(useProjectStore.getState().designLibraryBinding).toBeUndefined();expect(useHistoryStore.getState().past.length).toBe(before);
    expect(JSON.stringify(preview)).not.toContain(binary);
    const result=await apply(preview);expect(result.status).toBe('applied');expect(useHistoryStore.getState().past.length).toBe(before+1);
    expect(await target.readBinary(preview.assets[0].relPath)).toBe(binary);expect(await source.readText('project.json')).toBe(sourceBefore);
    const s=useProjectStore.getState(),saved=readProject(s.id)!;expect(saved).not.toContain(binary);expect(s.designLibraryBinding?.sourceFingerprintVersion).toBe(2);
    expect(s.designLibraryBinding?.importEvidence).toMatchObject({version:1,sourceFingerprint:preview.source.sourceFingerprint,previewFingerprint:preview.fingerprint,files:[{relPath:preview.assets[0].relPath,fingerprint:preview.assets[0].fingerprint}]});
    useHistoryStore.getState().undo();expect(useProjectStore.getState().designLibraryBinding).toBeUndefined();
    useHistoryStore.getState().redo();expect(useProjectStore.getState().designLibraryBinding?.importEvidence?.previewFingerprint).toBe(preview.fingerprint);
    s.loadProject(saved);expect(useProjectStore.getState().designLibraryBinding?.importEvidence).toEqual(result.binding?.importEvidence);
  });
  test('项目副本被编辑后，再导入明确展示替换定义，不重写已有页面',async()=>{
    await apply(await prepare());const s=useProjectStore.getState();s.updateComponent('lib-source-card',{description:'本地自定义',templateHtml:'<article><span>本地修改</span></article>'});
    s.addScreen({name:'旧页面',htmlContent:'<main><article data-component-id="lib-source-card">本地实例</article></main>'},'page');
    const preview=await prepare();expect(preview.components[0].action).toBe('replace');const original=useProjectStore.getState().screens.page.htmlContent;
    expect((await apply(preview)).status).toBe('applied');expect(useProjectStore.getState().screens.page.htmlContent).toBe(original);
  });
  for(const kind of ['device','self','component','asset'] as const)test(`${kind}冲突在写盘前显示且拒绝确认`,async()=>{
    if(kind==='device')useProjectStore.getState().initNewProject({name:'pc',deviceProfile:'pc',createSpecimen:false});
    if(kind==='self'){const d=data();d.id=useProjectStore.getState().id;await source.writeTextAtomic('project.json',JSON.stringify(d));}
    if(kind==='component')useProjectStore.setState({components:{'lib-source-card':{id:'lib-source-card',name:'自有组件',templateHtml:'<div>现有</div>',createdAt:1,updatedAt:1}}});
    if(kind==='asset')useProjectStore.setState({assets:{'lib-source-logo':{...data().assets.logo,id:'lib-source-logo',relPath:'assets/images/another.png'} as any}});
    const preview=await prepare();expect(preview.conflicts).toHaveLength(1);expect((await apply(preview)).status).toBe('blocked');expect(await target.listDir('assets/images')).toEqual([]);
  });
  for(const change of ['theme-name','source-name','device','description','slot','template','version','token-version','asset-name','asset-bytes'] as const)test(`来源 ${change} 改变后旧预览不能确认`,async()=>{
    const preview=await prepare(),d=data();
    if(change==='theme-name')d.designSystem.name='新主题名';if(change==='source-name')d.name='新库名';if(change==='device')d.settings.deviceProfile='pc';
    if(change==='description')d.components.card.description='说明变更';if(change==='slot')d.components.card.slotDefs[0].defaultContent='新默认内容';
    if(change==='template')d.components.card.templateHtml='<article>新模板</article>';if(change==='version')d.components.card.version++;
    if(change==='token-version')d.designSystemOrigin.tokenVersion++;if(change==='asset-name')d.assets.logo.name='新资源名';
    if(change==='asset-bytes')await source.writeBinary('assets/images/logo.png','Y2hhbmdlZA==');
    await source.writeTextAtomic('project.json',JSON.stringify(d));const result=await apply(preview);
    expect(result.status).toBe('blocked');expect(result.message).toContain('来源设计库已变化');expect(useProjectStore.getState().designLibraryBinding).toBeUndefined();
    expect(await target.listDir('assets/images')).toEqual([]);
  });
  test('键序、保存时间、无关页面/组件时间和资源refCount变化不误判库版本',async()=>{
    const preview=await prepare(),d:any=data();d.savedAt=9;d.components.card.updatedAt=9;d.components.card.createdAt=9;d.assets.logo.refCount=99;
    d.screens={other:{htmlContent:'其它页面'}};d.designSystem.tokens=Object.fromEntries(Object.entries(d.designSystem.tokens).reverse());
    d.components.card=Object.fromEntries(Object.entries(d.components.card).reverse());
    await source.writeTextAtomic('project.json',JSON.stringify(d));expect((await readDesignLibraryCopy(source)).binding.sourceFingerprint).toBe(preview.source.sourceFingerprint);
    expect((await apply(preview)).status).toBe('applied');
  });
  for(const change of ['project','tokens','AI-document','component'] as const)test(`确认前目标 ${change} 改变不会写入新上下文`,async()=>{
    const preview=await prepare();
    if(change==='project')useProjectStore.getState().initNewProject({name:'另一个工程',deviceProfile:'mobile',createSpecimen:false});
    if(change==='tokens')useProjectStore.getState().setColorMode('dark');
    if(change==='AI-document')useProjectStore.getState().upsertProjectDocument({id:'ai',title:'AI文档',content:'新内容',source:'ai',enabled:true,createdAt:1,updatedAt:1});
    if(change==='component')useProjectStore.getState().createComponent('新组件','<section>新</section>');
    const result=await apply(preview);expect(result.status).toBe('blocked');expect(result.message).toContain('目标工程');expect(await target.listDir('assets/images')).toEqual([]);
  });
  test('画布平移和测量不使预览过期',async()=>{
    const s=useProjectStore.getState();s.addScreen({name:'页面',htmlContent:'<main>内容</main>'},'page');const key=designLibraryImportContext(useProjectStore.getState()),preview=await prepare();
    s.setViewportTransform({x:22,y:44,scale:0.8});useProjectStore.setState({screens:{...useProjectStore.getState().screens,page:{...useProjectStore.getState().screens.page,position:{x:100,y:200},measuredHeight:2000}}});
    expect(designLibraryImportContext(useProjectStore.getState())).toBe(key);expect((await apply(preview)).status).toBe('applied');
  });
  test('拒绝被改写/克隆的预览，双击仅提交一次，同一计划不能重用',async()=>{
    const first=await prepare();first.theme.name='篡改';expect((await apply(first)).message).toContain('预览已被修改');
    const preview=await prepare();expect((await apply(structuredClone(preview))).status).toBe('blocked');
    const [a,b]=await Promise.all([apply(preview),apply(preview)]);expect(a.status).toBe('applied');expect(b.status).toBe('blocked');expect((await apply(preview)).status).toBe('blocked');
  });
  test('取消开始前/非协作来源读取后阻止后续读取或提交',async()=>{
    const controller=new AbortController();controller.abort();await expect(prepareDesignLibraryImport(source,useProjectStore.getState(),{signal:controller.signal})).rejects.toThrow('取消');
    let reads=0;const stop=new AbortController();const wrapped={readText:async(path:string)=>{reads++;const value=await source.readText(path);stop.abort();return value;},readBinary:source.readBinary.bind(source)};
    await expect(prepareDesignLibraryImport(wrapped,useProjectStore.getState(),{signal:stop.signal})).rejects.toThrow('取消');expect(reads).toBe(1);
    const preview=await prepare();expect((await apply(preview,{signal:controller.signal})).message).toContain('取消');expect(await target.listDir('assets/images')).toEqual([]);
  });
  for(const interruption of ['source','project','cancel','write-error','corrupt-target'] as const)test(`安装中 ${interruption} 不写元数据/History，不盲删可能被复用的文件`,async()=>{
    const preview=await prepare(),controller=new AbortController(),write=target.writeBinary.bind(target),before=useHistoryStore.getState().past.length;
    target.writeBinary=async(path,bytes)=>{
      await write(path,interruption==='corrupt-target'?'Y29ycnVwdA==':bytes);
      if(interruption==='source'){const d=data();d.components.card.description='期间修改';await source.writeTextAtomic('project.json',JSON.stringify(d));}
      if(interruption==='project')useProjectStore.getState().setDesignSystem({...useProjectStore.getState().designSystem,name:'中途修改的主题'});if(interruption==='cancel')controller.abort();if(interruption==='write-error')throw new Error('写入失败');
    };
    const result=await apply(preview,{signal:controller.signal});expect(result.status).toBe('blocked');expect(result.message).toContain('未自动删除');
    expect(useProjectStore.getState().designLibraryBinding).toBeUndefined();expect(useProjectStore.getState().components['lib-source-card']).toBeUndefined();
    expect(useHistoryStore.getState().past.length).toBe(before+(interruption==='project'?1:0));expect(await target.exists(preview.assets[0].relPath)).toBe(true);
  });
  test('目标字节冲突时不写文件，已存在的相同文件可复用并复核',async()=>{
    const preview=await prepare();await target.writeBinary(preview.assets[0].relPath,'b2xk');const result=await apply(preview);expect(result.status).toBe('blocked');expect(result.message).toContain('文件冲突');expect(await target.readBinary(preview.assets[0].relPath)).toBe('b2xk');
    await target.writeBinary(preview.assets[0].relPath,binary);expect((await apply(await prepare())).status).toBe('applied');
  });
  test('读取期间JSON或资源内容变化，不返回混合版本',async()=>{
    let reads=0;const wrapped={readText:async(path:string)=>{const raw=await source.readText(path);return ++reads===2?raw+' ':raw;},readBinary:source.readBinary.bind(source)};
    await expect(readDesignLibraryCopy(wrapped)).rejects.toThrow('来源工程已变化');
    let binaries=0;await expect(readDesignLibraryCopy({readText:source.readText.bind(source),readBinary:async path=>++binaries===2?'Y2hhbmdlZA==':source.readBinary(path)})).rejects.toThrow('来源资源已变化');
  });
  test('不完整Token及重复资源登记明确拒绝',async()=>{
    const invalid:any=data();invalid.designSystem.tokens.shadows={};await source.writeTextAtomic('project.json',JSON.stringify(invalid));await expect(prepare()).rejects.toThrow('Token 不完整');
    const duplicate:any=data();duplicate.assets.another={...duplicate.assets.logo};await source.writeTextAtomic('project.json',JSON.stringify(duplicate));await expect(prepare()).rejects.toThrow('重复');
  });
});

test('未知组件/主题字段不会随副本进入工程，过大清单明确拒绝',async()=>{
  const d:any=data();d.designSystem.extraSourceDocument=binary;d.components.card.extraSourceDocument=binary;
  await source.writeTextAtomic('project.json',JSON.stringify(d));const preview=await prepare();expect((await apply(preview)).status).toBe('applied');
  expect(JSON.stringify(useProjectStore.getState().components)).not.toContain(binary);expect(JSON.stringify(useProjectStore.getState().designSystem)).not.toContain(binary);
  await source.writeTextAtomic('project.json',' '.repeat(6_000_001));await expect(prepare()).rejects.toThrow('超过 6 MB');
});
test('冻结输入快照，读取中调用方修改对象不会改变预览的冲突结论',async()=>{
  const live=useProjectStore.getState(),input=structuredClone({id:live.id,folderPath:live.folderPath,settings:live.settings,designSystem:live.designSystem,designSystemOrigin:live.designSystemOrigin,
    designLibraryBinding:live.designLibraryBinding,components:live.components,assets:live.assets,screens:live.screens,overrides:live.overrides,decisions:live.decisions,projectDocuments:live.projectDocuments});
  let release!:(raw:string|null)=>void,first=true;
  const wrapped={readText:async(path:string)=>{if(first){first=false;return new Promise<string|null>(resolve=>release=resolve);}return source.readText(path);},readBinary:source.readBinary.bind(source)};
  const pending=prepareDesignLibraryImport(wrapped,input,{targetStorage:target});
  input.settings.deviceProfile='pc';input.components['lib-source-card']={id:'lib-source-card',name:'新冲突',templateHtml:'<p>冲突</p>',createdAt:1,updatedAt:1};
  release(await source.readText('project.json'));const preview=await pending;expect(preview.conflicts).toEqual([]);expect((await apply(preview)).status).toBe('applied');
});
for(const type of ['font','color-pair','spacing','shadow-pair'] as const)test(`来源 ${type} 字段类型错误不能进入主题预览`,async()=>{
 const d:any=data();if(type==='font')d.designSystem.tokens.typography.fontFamilySans={bad:'type'};
 if(type==='color-pair')d.designSystem.tokens.colors.background='#fff';if(type==='spacing')d.designSystem.tokens.spacing['4']='16';
 if(type==='shadow-pair')d.designSystem.tokens.shadows.card='0 1px 2px black';
 await source.writeTextAtomic('project.json',JSON.stringify(d));await expect(prepare()).rejects.toThrow('Token 不完整');
});
test('错误资源字段在进入预览前拒绝，不把对象作为组件文字渲染',async()=>{
 const d:any=data();d.assets.logo.name={invalid:true};await source.writeTextAtomic('project.json',JSON.stringify(d));
 await expect(prepare()).rejects.toThrow('资源登记无效');
});
