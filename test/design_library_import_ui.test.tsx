import {afterEach,beforeEach,expect,spyOn,test} from 'bun:test';
import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {DesignLibraryImportPanel} from '../src/components/theme/DesignLibraryImportPanel';
import {useProjectStore} from '../src/stores/useProjectStore';
import {useHistoryStore} from '../src/stores/useHistoryStore';
import * as folder from '../src/services/storage/folderPicker';
import * as storage from '../src/services/storage/projectStorage';
import {neutralModernTheme} from '../src/utils/themePresets';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
let host:HTMLDivElement,root:Root,prior:ReturnType<typeof useProjectStore.getState>,history:ReturnType<typeof useHistoryStore.getState>;
let source:storage.LocalStorageStorage,target:storage.LocalStorageStorage;
let picker:ReturnType<typeof spyOn>,runtime:ReturnType<typeof spyOn>,factory:ReturnType<typeof spyOn>;
const bytes='dGVzdA==';
const sourceData=()=>({id:'source-ui',name:'界面测试库',settings:{deviceProfile:'mobile'},designSystem:neutralModernTheme,designSystemOrigin:{tokenVersion:3},
 components:{card:{id:'card',name:'卡片',templateHtml:'<article><img src="assets/images/logo.png" data-asset-id="logo"><span>标题</span></article>',version:1,createdAt:1,updatedAt:1}},
 assets:{logo:{id:'logo',name:'图片',type:'image',mimeType:'image/png',relPath:'assets/images/logo.png',source:'upload',refCount:0}}});
beforeEach(async()=>{
 prior=useProjectStore.getState();history=useHistoryStore.getState();useProjectStore.getState().initNewProject({name:'界面目标',deviceProfile:'mobile',createSpecimen:false});
 source=new storage.LocalStorageStorage('library-ui-source-'+crypto.randomUUID());target=new storage.LocalStorageStorage('library-ui-target-'+crypto.randomUUID());
 await source.writeTextAtomic('project.json',JSON.stringify(sourceData()));await source.writeBinary('assets/images/logo.png',bytes);
 picker=spyOn(folder,'pickProjectFolder').mockResolvedValue('/virtual/source.aidesign');runtime=spyOn(folder,'isDesktopRuntime').mockReturnValue(true);
 factory=spyOn(storage,'createProjectStorage').mockImplementation((_id,path)=>path==='/virtual/source.aidesign'?source:target);
 host=document.createElement('div');document.body.append(host);root=createRoot(host);await act(async()=>root.render(<DesignLibraryImportPanel/>));
});
afterEach(()=>{act(()=>root.unmount());host.remove();picker.mockRestore();runtime.mockRestore();factory.mockRestore();useProjectStore.setState(prior,true);useHistoryStore.setState(history,true);});
const button=(text:string)=>Array.from(host.querySelectorAll('button')).find(b=>b.textContent===text)!;
const choose=async()=>{await act(async()=>{button('从其他工程导入副本').click();});};

test('先展示可审阅的来源/主题/组件/资源预览，明确确认才一次写入，来源无变更',async()=>{
 const before=useHistoryStore.getState().past.length,original=await source.readText('project.json');
 await choose();expect(host.textContent).toContain('分析完成');expect(host.textContent).toContain('Token v3');expect(host.textContent).toContain('新增 1 个组件');
 expect(host.querySelector('[aria-label="设计库导入预览"]')).not.toBeNull();expect(await target.listDir('assets/images')).toEqual([]);expect(useProjectStore.getState().designLibraryBinding).toBeUndefined();
 await act(async()=>{button('确认导入项目副本').click();button('确认导入项目副本')?.click();});
 expect(useHistoryStore.getState().past.length).toBe(before+1);expect(host.textContent).toContain('可通过撤销');expect(host.textContent).toContain('核对了 1 个资源文件');
 expect(useProjectStore.getState().designLibraryBinding?.importEvidence?.files).toHaveLength(1);expect(await source.readText('project.json')).toBe(original);
});
test('选择器未完成时切工程，不读取来源或误写新工程，双击只开一个选择器',async()=>{
 let release!:(folder:string)=>void;picker.mockImplementation(()=>new Promise(resolve=>release=resolve));let reads=0;const read=source.readText.bind(source);source.readText=async path=>{reads++;return read(path);};
 await act(async()=>{button('从其他工程导入副本').click();button('从其他工程导入副本')?.click();});expect(picker).toHaveBeenCalledTimes(1);
 act(()=>useProjectStore.getState().initNewProject({name:'另一个工程',deviceProfile:'mobile',createSpecimen:false}));
 await act(async()=>{release('/virtual/source.aidesign');});expect(reads).toBe(0);expect(host.textContent).toContain('目标工程已变化');expect(useProjectStore.getState().designLibraryBinding).toBeUndefined();
});
test('预览后上下文改变会禁用确认，取消可返回而不改工程',async()=>{
 await choose();act(()=>useProjectStore.getState().setDesignSystem({...useProjectStore.getState().designSystem,name:'人工修改'}));
 expect(button('确认导入项目副本').disabled).toBe(true);expect(host.textContent).toContain('目标工程或设计内容已变化');
 act(()=>button('取消导入').click());expect(host.querySelector('[aria-label="设计库导入预览"]')).toBeNull();expect(useProjectStore.getState().designLibraryBinding).toBeUndefined();
});
test('冲突预览明确显示原因，确认禁用且无文件写入',async()=>{
 useProjectStore.getState().initNewProject({name:'PC',deviceProfile:'pc',createSpecimen:false});await choose();
 expect(host.textContent).toContain('设备档位不同');expect(button('确认导入项目副本').disabled).toBe(true);expect(await target.listDir('assets/images')).toEqual([]);
});
test('确认前源更改显示重新分析，不继续提交旧预览',async()=>{
 await choose();await source.writeTextAtomic('project.json',JSON.stringify({...sourceData(),name:'新的库'}));
 await act(async()=>{button('确认导入项目副本').click();});expect(host.textContent).toContain('来源设计库已变化');expect(useProjectStore.getState().designLibraryBinding).toBeUndefined();
});
test('卸载期间非协作读取返回后，不写元数据或目标文件',async()=>{
 let release!:(raw:string|null)=>void;const read=source.readText.bind(source);source.readText=()=>new Promise(resolve=>release=resolve);
 await act(async()=>{button('从其他工程导入副本').click();});act(()=>root.render(null));
 await act(async()=>{release(await read('project.json'));});expect(useProjectStore.getState().designLibraryBinding).toBeUndefined();expect(await target.listDir('assets/images')).toEqual([]);
});
test('写盘期间取消不提交且显示保留孤立文件的真实情况',async()=>{
 await choose();let release!:()=>void;const write=target.writeBinary.bind(target);target.writeBinary=async(path,value)=>{await write(path,value);await new Promise<void>(resolve=>release=resolve);};
 await act(async()=>{button('确认导入项目副本').click();});expect(release).toBeDefined();act(()=>button('取消导入').click());
 await act(async()=>{release();});expect(host.textContent).toContain('已取消');expect(host.textContent).toContain('未自动删除');expect(useProjectStore.getState().designLibraryBinding).toBeUndefined();
});
test('损坏导入诊断隔离，旧无记录绑定正常显示',()=>{
 const binding={mode:'project_copy',sourceName:'旧来源',sourceProjectId:'old',sourceDeviceProfile:'mobile',sourceFingerprint:'old',sourceTokenVersion:1,importedAt:1};
 act(()=>useProjectStore.setState({designLibraryBinding:{...binding,importEvidence:{files:{length:{wrong:true}}}} as any}));expect(host.textContent).toContain('导入检查记录不完整');
 act(()=>useProjectStore.setState({designLibraryBinding:binding as any}));expect(host.textContent).toContain('旧来源');expect(host.textContent).not.toContain('导入检查记录不完整');
});

test('可选固定版本参考，确认前无安装，模式锁定、更新和转副本可撤销',async()=>{
 const radios=host.querySelectorAll<HTMLInputElement>('input[type="radio"]');act(()=>radios[1].click());
 await act(async()=>button('从其他工程导入只读参考').click());expect(useProjectStore.getState().designLibraryBinding).toBeUndefined();
 expect(host.textContent).toContain('确认固定版本参考');expect(await target.listDir('assets/images')).toEqual([]);
 await act(async()=>button('确认固定版本参考').click());expect(useProjectStore.getState().designLibraryBinding?.mode).toBe('pinned_reference');
 expect(host.querySelector('fieldset')?.disabled).toBe(true);expect(host.textContent).toContain('检查并更新参考');expect(host.textContent).toContain('本地缓存可离线使用');
 await act(async()=>button('检查并更新参考').click());expect(host.textContent).toContain('替换 1 个组件');
 await act(async()=>button('确认固定版本参考').click());expect(host.textContent).toContain('固定版本只读参考');
 act(()=>button('转为项目副本').click());expect(useProjectStore.getState().designLibraryBinding?.mode).toBe('project_copy');expect(host.querySelector('fieldset')?.disabled).toBe(false);
 act(()=>useHistoryStore.getState().undo());expect(useProjectStore.getState().designLibraryBinding?.mode).toBe('pinned_reference');expect(host.querySelector('fieldset')?.disabled).toBe(true);
});

test('只读参考预览后改选副本必须重新分析；损坏参考快照展示原因并允许显式解锁',async()=>{
 act(()=>host.querySelectorAll<HTMLInputElement>('input[type="radio"]')[1].click());await act(async()=>button('从其他工程导入只读参考').click());
 act(()=>host.querySelectorAll<HTMLInputElement>('input[type="radio"]')[0].click());expect(host.querySelector('[aria-label="设计库导入预览"]')).toBeNull();
 await choose();await act(async()=>button('确认导入项目副本').click());
 act(()=>useProjectStore.setState({designLibraryBinding:{...useProjectStore.getState().designLibraryBinding!,mode:'pinned_reference',referenceSnapshot:undefined}}));
 expect(host.textContent).toContain('快照缺失或无效');act(()=>button('转为项目副本').click());expect(host.textContent).not.toContain('快照缺失或无效');
});
