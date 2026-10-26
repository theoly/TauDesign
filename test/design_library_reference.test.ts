import {afterEach,beforeEach,expect,test} from 'bun:test';
import {prepareDesignLibraryImport,applyDesignLibraryImport} from '../src/services/ai/designLibraryImport';
import {readDesignLibraryCopy} from '../src/services/ai/designLibraryCopy';
import {libraryMemberLocked,libraryReferenceIssue,verifyLibraryReferenceFiles} from '../src/services/ai/designLibraryReference';
import {LocalStorageStorage} from '../src/services/storage/projectStorage';
import {useProjectStore} from '../src/stores/useProjectStore';
import {useHistoryStore} from '../src/stores/useHistoryStore';
import {neutralModernTheme} from '../src/utils/themePresets';
import {readProject} from '../src/utils/projectRegistry';
import {prepareCheckedRestyle} from '../src/services/ai/restyleValidation';
import {prepareNewPage} from '../src/services/ai/pageCreationValidation';
import {buildDesignProjectManifest,renderProjectManifestContext} from '../src/services/ai/projectManifest';
import {knowledgeFingerprint} from '../src/services/ai/projectKnowledge';

const fixture=()=>({id:'reference-source',name:'参考库',settings:{deviceProfile:'mobile'},designSystem:structuredClone(neutralModernTheme),designSystemOrigin:{tokenVersion:2},
 components:{card:{id:'card',name:'卡片',templateHtml:'<article data-component-id="card"><img src="assets/images/logo.png" data-asset-id="logo"><span>内容</span></article>',version:1,createdAt:1,updatedAt:1}},
 assets:{logo:{id:'logo',name:'图标',type:'image',mimeType:'image/png',source:'upload',relPath:'assets/images/logo.png',refCount:0}}});
let source:LocalStorageStorage,target:LocalStorageStorage,prior:ReturnType<typeof useProjectStore.getState>,history:ReturnType<typeof useHistoryStore.getState>;
beforeEach(async()=>{
 prior=useProjectStore.getState();history=useHistoryStore.getState();
 useProjectStore.getState().initNewProject({name:'参考目标',deviceProfile:'mobile',createSpecimen:false});
 source=new LocalStorageStorage('reference-source-'+crypto.randomUUID());target=new LocalStorageStorage('reference-target-'+crypto.randomUUID());
 await source.writeTextAtomic('project.json',JSON.stringify(fixture()));await source.writeBinary('assets/images/logo.png','b2xk');
});
afterEach(()=>{useProjectStore.setState(prior,true);useHistoryStore.setState(history,true);});
const prepare=()=>prepareDesignLibraryImport(source,useProjectStore.getState(),{targetStorage:target,mode:'pinned_reference'});
const apply=(preview:Awaited<ReturnType<typeof prepare>>)=>applyDesignLibraryImport(preview,{getState:()=>useProjectStore.getState(),commit:copy=>useProjectStore.getState().applyDesignLibraryCopy(copy)});
const install=async()=>{const preview=await prepare();expect((await apply(preview)).status).toBe('applied');return preview;};
const componentId='lib-reference-source-card';

test('固定版本预览无副作用，确认后保护缓存且支持离线/持久化/撤销重做',async()=>{
 const before=useHistoryStore.getState().past.length,preview=await prepare();
 expect(preview.source.mode).toBe('pinned_reference');expect(await target.listDir('assets/images')).toEqual([]);
 expect(useHistoryStore.getState().past.length).toBe(before);expect(useProjectStore.getState().designLibraryBinding).toBeUndefined();
 expect((await apply(preview)).status).toBe('applied');const state=useProjectStore.getState(),saved=readProject(state.id)!;
 expect(libraryReferenceIssue(state)).toBeUndefined();expect(await verifyLibraryReferenceFiles(target,state)).toEqual([]);
 expect(libraryMemberLocked(state,'components',componentId)).toBe(true);expect(saved).not.toContain('b2xk');
 expect(useHistoryStore.getState().past.length).toBe(before+1);
 useHistoryStore.getState().undo();expect(useProjectStore.getState().designLibraryBinding).toBeUndefined();
 useHistoryStore.getState().redo();expect(libraryMemberLocked(useProjectStore.getState(),'components',componentId)).toBe(true);
 await source.remove('project.json');state.loadProject(saved);expect(libraryReferenceIssue(useProjectStore.getState())).toBeUndefined();
 expect(await verifyLibraryReferenceFiles(target,useProjectStore.getState())).toEqual([]);
});

test('实际 Store 拦截 Token、组件定义和资源删除且无历史变更，普通项目定义可编辑',async()=>{
 await install();const state=useProjectStore.getState(),asset=Object.values(state.assets)[0],before=useHistoryStore.getState().past.length;
 expect(()=>state.setDesignSystem(neutralModernTheme)).toThrow('只读');
 expect(()=>state.updateComponent(componentId,{description:'绕过'})).toThrow('只读');
 expect(()=>state.deleteComponent(componentId)).toThrow('只读');expect(()=>state.removeAsset(asset.id)).toThrow('只读');
 expect(useHistoryStore.getState().past.length).toBe(before);
 const own=state.createComponent('自定义','<div>自有</div>');state.updateComponent(own,{name:'自定义新名'});state.deleteComponent(own);
 state.addAsset({...asset,id:'own',relPath:'assets/images/own.png'});state.removeAsset('own');
 expect(libraryReferenceIssue(useProjectStore.getState())).toBeUndefined();expect(state.cleanupUnusedAssets()).toBe(0);
 expect(useProjectStore.getState().assets[asset.id]).toBeDefined();
});

test('参考定义可插入、页面可独立修改，批量队列排除参考定义',async()=>{
 await install();const state=useProjectStore.getState();state.addScreen({name:'实例页面',htmlContent:'<main data-nid="root"></main>'},'page');
 state.insertComponent('page',componentId);expect(useProjectStore.getState().screens.page.htmlContent).toContain(componentId);
 const oldTemplate=state.components[componentId].templateHtml;state.updateScreenHtml('page','<main data-nid="root">独立修改内容</main>');
 expect(useProjectStore.getState().components[componentId].templateHtml).toBe(oldTemplate);
 expect(state.buildRestylePlan().queue.some(t=>t.kind==='component'&&t.id===componentId)).toBe(false);
});

test('显式同源更新：变化的图片分版本保存，旧实例不重写，撤销重做恢复快照与定义',async()=>{
 const first=await install(),oldState=useProjectStore.getState(),oldId=first.assets[0].id,oldPath=first.assets[0].relPath;
 oldState.addScreen({name:'旧实例',htmlContent:'<main data-nid="root"></main>'},'page');oldState.insertComponent('page',componentId);
 const oldHtml=useProjectStore.getState().screens.page.htmlContent,oldBinding=useProjectStore.getState().designLibraryBinding;
 const data=fixture();data.components.card.version=2;data.components.card.templateHtml=data.components.card.templateHtml.replace('内容','新版本内容');
 await source.writeTextAtomic('project.json',JSON.stringify(data));await source.writeBinary('assets/images/logo.png','bmV3');
 const next=await prepare();expect(next.assets[0].id).not.toBe(oldId);expect(next.assets[0].relPath).not.toBe(oldPath);
 expect(next.components[0].action).toBe('replace');expect((await apply(next)).status).toBe('applied');
 let state=useProjectStore.getState();expect(state.screens.page.htmlContent).toBe(oldHtml);
 expect(state.components[componentId].templateHtml).toContain(next.assets[0].relPath);expect(state.assets[oldId].relPath).toBe(oldPath);
 expect(await target.readBinary(oldPath)).toBe('b2xk');expect(await target.readBinary(next.assets[0].relPath)).toBe('bmV3');
 expect(libraryReferenceIssue(state)).toBeUndefined();expect(libraryMemberLocked(state,'assets',oldId)).toBe(true);
 useHistoryStore.getState().undo();state=useProjectStore.getState();expect(state.designLibraryBinding).toEqual(oldBinding);expect(state.assets[next.assets[0].id]).toBeUndefined();
 useHistoryStore.getState().redo();expect(libraryReferenceIssue(useProjectStore.getState())).toBeUndefined();
 expect(await verifyLibraryReferenceFiles(target,useProjectStore.getState())).toEqual([]);
});

test('来源删除定义后旧实例的缓存仍被保留并锁定',async()=>{
 const first=await install(),data=fixture();data.components={} as any;await source.writeTextAtomic('project.json',JSON.stringify(data));await install();
 const state=useProjectStore.getState();expect(state.components[componentId]).toBeDefined();expect(libraryMemberLocked(state,'components',componentId)).toBe(true);
 expect(state.assets[first.assets[0].id]).toBeDefined();expect(state.cleanupUnusedAssets()).toBe(0);expect(libraryReferenceIssue(state)).toBeUndefined();
});

for(const kind of ['mode','source'] as const)test(`参考期间禁止绕过改${kind}，预览冲突且不提交`,async()=>{
 await install();if(kind==='source'){const data=fixture();data.id='other-source';await source.writeTextAtomic('project.json',JSON.stringify(data));}
 const preview=await prepareDesignLibraryImport(source,useProjectStore.getState(),{targetStorage:target,mode:kind==='mode'?'project_copy':'pinned_reference'});
 expect(preview.conflicts[0]).toContain('先转为项目副本');const before=useHistoryStore.getState().past.length;
 expect((await apply(preview)).status).toBe('blocked');expect(useHistoryStore.getState().past.length).toBe(before);
 const direct=await readDesignLibraryCopy(source);expect(()=>useProjectStore.getState().applyDesignLibraryCopy(direct)).toThrow('先转为项目副本');
});

test('转为副本不改变外观和缓存，一条历史可撤销重新上锁',async()=>{
 await install();const state=useProjectStore.getState(),tokens=state.designSystem,components=state.components,assets=state.assets,before=useHistoryStore.getState().past.length;
 const knowledgeBefore=knowledgeFingerprint(state);state.detachDesignLibraryReference();let next=useProjectStore.getState();
 expect(next.designLibraryBinding?.mode).toBe('project_copy');expect(next.designLibraryBinding?.referenceSnapshot).toBeUndefined();
 expect(next.designSystem).toBe(tokens);expect(next.components).toBe(components);expect(next.assets).toBe(assets);expect(knowledgeFingerprint(next)).not.toBe(knowledgeBefore);
 expect(useHistoryStore.getState().past.length).toBe(before+1);useHistoryStore.getState().undo();expect(()=>useProjectStore.getState().updateComponent(componentId,{name:'绕过'})).toThrow('只读');
 useHistoryStore.getState().redo();next=useProjectStore.getState();next.updateComponent(componentId,{name:'允许编辑'});expect(useProjectStore.getState().components[componentId].name).toBe('允许编辑');
});

for(const change of ['missing','tokens','component','asset'] as const)test(`损坏的${change}快照阻断交付而非静默解锁`,async()=>{
 await install();const state=useProjectStore.getState();
 if(change==='missing')useProjectStore.setState({designLibraryBinding:{...state.designLibraryBinding!,referenceSnapshot:undefined}});
 if(change==='tokens'){const ds=structuredClone(state.designSystem);ds.tokens.colors.primary['500']='#123456';useProjectStore.setState({designSystem:ds});}
 if(change==='component')useProjectStore.setState({components:{...state.components,[componentId]:{...state.components[componentId],name:'篡改'}}});
 if(change==='asset'){const [id,a]=Object.entries(state.assets)[0];useProjectStore.setState({assets:{[id]:{...a,relPath:'assets/images/missing.png'}}});}
 const current=useProjectStore.getState();expect(libraryReferenceIssue(current)).toContain('只读设计库');expect(()=>current.deleteComponent(componentId)).toThrow('只读');
 const page=await prepareNewPage(current,{id:'new',name:'新页',position:{x:0,y:0},htmlContent:'<main>内容</main>'},{} as any,target,{isCurrent:()=>true});
 expect(page.status).toBe('blocked');if(page.status==='blocked')expect(page.message).toContain('只读设计库');
 const manifest=buildDesignProjectManifest({projectId:current.id,projectName:current.name,deviceProfile:'mobile',screens:[],assets:Object.values(current.assets),components:Object.values(current.components),designSystem:current.designSystem,designLibraryBinding:current.designLibraryBinding});
 expect(manifest.issues.some(i=>i.code==='invalid_library_reference')).toBe(true);
 current.addScreen({name:'原页',htmlContent:'<main data-nid="root">内容</main>'},'page');current.stageScreenChange('page','<main data-nid="root">新内容</main>','新版本');
 expect(useProjectStore.getState().getStagedDeliveryReport().checks[0].message).toContain('只读设计库');
 current.detachDesignLibraryReference();expect(libraryReferenceIssue(useProjectStore.getState())).toBeUndefined();
});

test('清单正确说明固定版本语义，组件批量重塑不能绕过 Store',async()=>{
 await install();const state=useProjectStore.getState();
 const plan=await prepareCheckedRestyle(state,{status:'applied',target:{kind:'component',id:componentId,name:'卡片',html:state.components[componentId].templateHtml},html:'<article>重塑</article>'} as any,target,{contextKey:'test',isCurrent:()=>true});
 expect(plan.validation.status).toBe('blocked');expect(plan.validation.message).toContain('只读');
 const manifest=buildDesignProjectManifest({projectId:state.id,projectName:state.name,deviceProfile:'mobile',screens:[],assets:Object.values(state.assets),components:Object.values(state.components),designSystem:state.designSystem,designLibraryBinding:state.designLibraryBinding});
 expect(renderProjectManifestContext(manifest)).toContain('固定版本只读参考');expect(manifest.issues).toEqual([]);
});

test('无页面的参考项目也不能经 HTML 导入接管 Token',async()=>{
 await install();const state=useProjectStore.getState(),before=useHistoryStore.getState().past.length;
 expect(()=>state.addScreen({name:'导入',htmlContent:'<main>内容</main>'},'import',{importSetup:{projectId:state.id,designSystem:neutralModernTheme}})).toThrow('只读');
 await expect(state.importHtmlScreen({name:'导入',htmlContent:'<main>内容</main>'},{projectId:state.id,designSystem:neutralModernTheme},{} as any)).rejects.toThrow('只读');
 expect(useHistoryStore.getState().past.length).toBe(before);
});

test('缓存实际文件被外部覆盖或读失败不能以登记存在作为通过证据',async()=>{
 const first=await install();await target.writeBinary(first.assets[0].relPath,'Y29ycnVwdA==');
 expect((await verifyLibraryReferenceFiles(target,useProjectStore.getState()))[0].message).toContain('与固定版本内容不一致');
 await target.remove(first.assets[0].relPath);expect(await verifyLibraryReferenceFiles(target,useProjectStore.getState())).toHaveLength(1);
 expect(await verifyLibraryReferenceFiles({readBinary:async()=>{throw Error('offline');}},useProjectStore.getState())).toHaveLength(1);
});

test('更新前保留的库文件被外部覆盖时阻断提交，导入返回绑定与已保存快照一致',async()=>{
 const first=await prepare(),result=await apply(first);expect(result.status).toBe('applied');expect(result.binding).toEqual(useProjectStore.getState().designLibraryBinding);
 const beforeBinding=useProjectStore.getState().designLibraryBinding,before=useHistoryStore.getState().past.length;
 await target.writeBinary(first.assets[0].relPath,'dGFtcGVy');await source.writeBinary('assets/images/logo.png','bmV3');
 const next=await prepare(),blocked=await apply(next);expect(blocked.status).toBe('blocked');expect(blocked.message).toContain('与固定版本内容不一致');
 expect(useProjectStore.getState().designLibraryBinding).toEqual(beforeBinding);expect(useHistoryStore.getState().past.length).toBe(before);
});
