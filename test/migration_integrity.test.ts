import {afterEach,expect,spyOn,test} from 'bun:test';
import {ProjectRepository,migrateProjectToFolder,type ProjectDocument} from '../src/services/storage/projectRepository';
import * as storageModule from '../src/services/storage/projectStorage';
import type {ProjectStorage} from '../src/services/storage/projectStorage';
import {neutralModernTheme} from '../src/utils/themePresets';
import * as folder from '../src/services/storage/folderPicker';
import {useWorkspaceStore} from '../src/stores/useWorkspaceStore';
import {writeProject,upsertMeta,listProjects} from '../src/utils/projectRegistry';
import {historyKey,serializeHistory} from '../src/services/storage/historyRepository';
const storage=()=>new storageModule.LocalStorageStorage('migration-'+crypto.randomUUID());
const project=():ProjectDocument=>({id:'migration-'+crypto.randomUUID(),name:'旧工程',schemaVersion:1,
 settings:{deviceProfile:'mobile',frameWidth:390,viewportGuideHeight:844},designSystem:structuredClone(neutralModernTheme) as any,
 screens:{page:{id:'page',name:'资料',position:{x:40,y:60},htmlContent:'<main data-nid="root"><button>保存资料</button></main>',scopedCss:'button{border-radius:12px}',metadata:{navigationTitle:'资料',designRole:{kind:'page',group:'会员'}}}},
 overrides:{'page:root':{nid:'root',declarations:{padding:'16px'}}},components:{card:{id:'card',version:1,templateHtml:'<p>资料卡</p>'}},assets:{},decisions:{one:{content:'保留按钮'}},designLibraryBinding:{mode:'project-copy',sourceProjectId:'brand'} as any});
function intercept(target:ProjectStorage,read:(path:string,value:string|null)=>string|null|Promise<string|null>):ProjectStorage {
 return new Proxy(target,{get(object,key){if(key==='readText')return async(path:string)=>read(path,await object.readText(path));const value=Reflect.get(object,key);return typeof value==='function'?value.bind(object):value;}});
}
for(const field of ['settings','designSystem','overrides','components','assets','decisions','designLibraryBinding'])test(`HTML完好但${field}丢失时迁移失败并保留备份`,async()=>{
 const target=storage(),source=JSON.stringify(project()),broken=intercept(target,(path,value)=>{if(path==='project.json'&&value){const doc=JSON.parse(value);delete doc[field];return JSON.stringify(doc);}return value;});
 const result=await migrateProjectToFolder(source,broken);expect(result.ok).toBe(false);expect(result.backup).toBe(source);expect(result.error).toContain(field);
});
test('CSS丢失或篡改不能通过仅HTML校验',async()=>{for(const css of [null,'button{display:none}']){const result=await migrateProjectToFolder(JSON.stringify(project()),intercept(storage(),(path,value)=>path.endsWith('.css')&&path.startsWith('screens/')?css:value));expect(result.ok).toBe(false);expect(result.error).toContain('样式不一致');}});
test('页面设计角色元数据丢失阻断迁移',async()=>{
 const result=await migrateProjectToFolder(JSON.stringify(project()),intercept(storage(),(path,value)=>{if(path==='project.json'&&value){const doc=JSON.parse(value);delete doc.screens.page.metadata;return JSON.stringify(doc);}return value;}));expect(result.ok).toBe(false);expect(result.error).toContain('metadata');
});
test('文档正文静默缺失阻断迁移且源未改变',async()=>{
 const doc=project();doc.projectDocuments={requirements:{id:'requirements',title:'需求',source:'manual',content:'按钮必须存在',enabled:true,createdAt:1,updatedAt:1}};
 const source=JSON.stringify(doc),result=await migrateProjectToFolder(source,intercept(storage(),(path,value)=>path.startsWith('documents/')?null:value));expect(result.ok).toBe(false);expect(result.error).toContain('项目文档');expect(result.backup).toBe(source);
});
test('读回抛出异常返回失败，保留可恢复源',async()=>{
 const target=storage(),read=target.readText.bind(target);let written=false;const write=target.writeTextAtomic.bind(target);target.writeTextAtomic=async(path,text)=>{await write(path,text);if(path==='project.json')written=true;};target.readText=async path=>{if(written&&path==='project.json')throw Error('disk disconnected');return read(path);};
 const source=JSON.stringify(project()),result=await migrateProjectToFolder(source,target);expect(result.ok).toBe(false);expect(result.error).toContain('disk disconnected');expect(result.backup).toBe(source);
});
test('注册资源实际复制，索引/原始字节/CSS/文档/旧缺省字段均保留',async()=>{
 const doc=project(),source=storage(),target=storage();doc.assets={logo:{id:'logo',relPath:'assets/images/logo.png'}};
 doc.projectDocuments={requirements:{id:'requirements',title:'需求',source:'manual',content:'完整需求',originalContent:'原文',enabled:true,createdAt:1,updatedAt:1}};
 await source.writeBinary('assets/images/logo.png','aW1hZ2U=');const result=await migrateProjectToFolder(JSON.stringify(doc),target,source);expect(result.ok).toBe(true);expect(await target.readBinary('assets/images/logo.png')).toBe('aW1hZ2U=');expect(await source.readBinary('assets/images/logo.png')).toBe('aW1hZ2U=');
 const loaded=(await new ProjectRepository(target).load())!;expect(loaded.screens.page.scopedCss).toBe(doc.screens.page.scopedCss);expect(loaded.screens.page.renderer).toBe('html-iframe');expect(loaded.projectDocuments).toEqual(doc.projectDocuments);expect(loaded.overrides).toEqual(doc.overrides);
});
for(const kind of ['missing','empty','corrupted','unsafe'] as const)test(`资源${kind}不伪报迁移完成`,async()=>{
 const doc=project(),source=storage(),target=storage(),path=kind==='unsafe'?'assets/images/../secrets.png':'assets/images/logo.png';doc.assets={logo:{id:'logo',relPath:path}};
 if(kind!=='missing')await source.writeBinary(path,kind==='empty'?'':'aW1hZ2U=');if(kind==='corrupted')target.writeBinary=async(path)=>storageModule.LocalStorageStorage.prototype.writeBinary.call(target,path,'bG9zcw==');
 const original=JSON.stringify(doc),result=await migrateProjectToFolder(original,target,source);expect(result.ok).toBe(false);expect(result.backup).toBe(original);expect(await target.readText('project.json')).toBeNull();
});
const restores:(()=>void)[]=[];afterEach(()=>{while(restores.length)restores.pop()!();});
test('History保存失败不发布迁移成功或改注册表路径',async()=>{
 const doc=project(),id=doc.id,source=JSON.stringify(doc),target=storage();writeProject(id,source);localStorage.setItem(historyKey(id),serializeHistory(id,{past:[],future:[],checkpoints:[]},1024*1024));upsertMeta({id,name:doc.name,deviceProfile:'mobile',createdAt:1,updatedAt:1,screenCount:1});
 for(const mock of [spyOn(folder,'isDesktopRuntime').mockReturnValue(true),spyOn(folder,'pickProjectFolder').mockResolvedValue('/virtual/migration.aidesign'),spyOn(storageModule,'createProjectStorage').mockReturnValue(target)])restores.push(()=>mock.mockRestore());
 const write=target.writeTextAtomic.bind(target);target.writeTextAtomic=async(path,text)=>{if(path==='history.json')throw Error('history disk full');return write(path,text);};
 const result=await useWorkspaceStore.getState().migrateProject(id);expect(result.ok).toBe(false);expect(result.message).toContain('history disk full');expect(listProjects().find(meta=>meta.id===id)?.folderPath).toBeUndefined();
});
test('未登记图片索引的导入字体、组件图片、srcset与L4资源也真实迁移',async()=>{
 const doc=project(),source=storage(),target=storage(),font=`assets/imports/fonts/${'a'.repeat(64)}.woff2`;
 doc.screens.page.scopedCss=`@font-face{font-family:Brand;src:url('${font}')} .hero{background:url(assets/images/hero.png)}`;
 doc.screens.page.htmlContent='<main><img srcset="assets/images/one.png 1x, assets/images/two.png 2x"><template><img src="assets/images/lazy.png"></template></main>';
 doc.components={image:{templateHtml:'<img src="assets/icons/brand.svg">'}};doc.overrides={'page:root':{declarations:{backgroundImage:'url(assets/images/l4.png)'}}};
 const paths=[font,'assets/images/hero.png','assets/images/one.png','assets/images/two.png','assets/images/lazy.png','assets/icons/brand.svg','assets/images/l4.png'];for(const path of paths)await source.writeBinary(path,'Ynl0ZXM=');
 expect((await migrateProjectToFolder(JSON.stringify(doc),target,source)).ok).toBe(true);for(const path of paths)expect(await target.readBinary(path)).toBe('Ynl0ZXM=');
});
test('CSS引用的导入字体缺失时不发布只有HTML的迁移结果',async()=>{
 const doc=project(),source=storage(),target=storage();doc.screens.page.scopedCss=`@font-face{font-family:Brand;src:url(assets/imports/fonts/${'a'.repeat(64)}.woff2)}`;
 const result=await migrateProjectToFolder(JSON.stringify(doc),target,source);expect(result.ok).toBe(false);expect(result.error).toContain('资源文件缺失');expect(await target.readText('project.json')).toBeNull();
});
