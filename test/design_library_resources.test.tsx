import {afterEach,beforeEach,expect,spyOn,test} from 'bun:test';
import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {useScreenResources} from '../src/hooks/useScreenResources';
import {ScreenFrame} from '../src/components/canvas/ScreenFrame';
import {createProjectStorage,LocalStorageStorage} from '../src/services/storage/projectStorage';
import {useProjectStore} from '../src/stores/useProjectStore';
import {useHistoryStore} from '../src/stores/useHistoryStore';
import type {Screen} from '../src/types/project';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
const path='assets/images/lib-source-logo-a1b2c3d4.png',iconPath='assets/icons/library-symbol.svg';
const screen:Screen={id:'screen',name:'库资源页面',position:{x:0,y:0},htmlContent:`<main><img src="${path}" alt="图标"></main>`,scopedCss:`main{background:url(${iconPath})}`};
let prior:ReturnType<typeof useProjectStore.getState>,history:ReturnType<typeof useHistoryStore.getState>,root:Root,host:HTMLDivElement,result:ReturnType<typeof useScreenResources>;
const Harness=({source}:{source:Screen})=>{result=useScreenResources(source);return null;};
beforeEach(()=>{prior=useProjectStore.getState();history=useHistoryStore.getState();useProjectStore.getState().initNewProject({name:'库资源',deviceProfile:'mobile',createSpecimen:false});host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(()=>{act(()=>root.unmount());host.remove();useProjectStore.setState(prior,true);useHistoryStore.setState(history,true);});
const register=()=>useProjectStore.setState({assets:{image:{id:'image',name:'图',relPath:path,type:'image',mimeType:'image/png',source:'upload',refCount:0},icon:{id:'icon',name:'图标',relPath:iconPath,type:'svg_icon',mimeType:'image/svg+xml',source:'upload',refCount:0}}});
const render=async()=>{await act(async()=>{root.render(<Harness source={screen}/>);await new Promise(resolve=>setTimeout(resolve,0));});};
test('普通页面的库图片和CSS图标按真实登记解析，源HTML/CSS不变',async()=>{
 const storage=createProjectStorage(useProjectStore.getState().id);await storage.writeBinary(path,'aW1hZ2U=');await storage.writeBinary(iconPath,'c3Zn');register();await render();
 expect(result.loading).toBe(false);expect(result.error).toBeUndefined();expect(result.screen?.htmlContent).toContain('data:image/png;base64,aW1hZ2U=');
 expect(result.screen?.scopedCss).toContain('data:image/svg+xml;base64,c3Zn');expect(screen.htmlContent).toContain(path);expect(screen.scopedCss).toContain(iconPath);
});
test('缺文件显示真实错误；新增登记后刷新同一页面，不读取未登记路径',async()=>{
 await render();expect(result.screen?.htmlContent).toContain(path);expect(result.error).toBeUndefined();
 register();await render();expect(result.error).toContain('资源缺失');
 const storage=createProjectStorage(useProjectStore.getState().id);await storage.writeBinary(path,'cmVwYWly');await storage.writeBinary(iconPath,'c3Zn');
 // Changing the registration is the explicit repair signal; no body/source rewrite is needed.
 act(()=>useProjectStore.setState({assets:{...useProjectStore.getState().assets}}));await render();
 expect(result.error).toBeUndefined();expect(result.screen?.htmlContent).toContain('data:image/png;base64,cmVwYWly');
});
test('切工程不复用旧工程已解析的资源',async()=>{
 register();const storage=createProjectStorage(useProjectStore.getState().id);await storage.writeBinary(path,'b2xk');await storage.writeBinary(iconPath,'c3Zn');await render();
 expect(result.screen?.htmlContent).toContain('b2xk');
 await act(async()=>{useProjectStore.getState().initNewProject({name:'新工程',deviceProfile:'mobile',createSpecimen:false});register();});await render();
 expect(result.screen?.htmlContent).not.toContain('base64,b2xk');expect(result.error).toContain('资源缺失');
});

test('旧工程迟到的读取不能覆盖新工程资源',async()=>{
 register();const oldStorage=createProjectStorage(useProjectStore.getState().id);await oldStorage.writeBinary(path,'b2xk');await oldStorage.writeBinary(iconPath,'c3Zn');
 const original=LocalStorageStorage.prototype.readBinary;let hold=true,release!:(data:string)=>void;
 const reader=spyOn(LocalStorageStorage.prototype,'readBinary').mockImplementation(function(this:LocalStorageStorage,rel:string){return hold&&rel===path?new Promise(resolve=>release=resolve):original.call(this,rel);});
 try{
  await render();expect(result.loading).toBe(true);expect(release).toBeDefined();hold=false;
  await act(async()=>{useProjectStore.getState().initNewProject({name:'替换工程',deviceProfile:'mobile',createSpecimen:false});register();
    const storage=createProjectStorage(useProjectStore.getState().id);await storage.writeBinary(path,'bmV3');await storage.writeBinary(iconPath,'c3Zn');});await render();
  expect(result.screen?.htmlContent).toContain('base64,bmV3');await act(async()=>{release('b2xk');await new Promise(resolve=>setTimeout(resolve,0));});
  expect(result.screen?.htmlContent).toContain('base64,bmV3');expect(result.screen?.htmlContent).not.toContain('base64,b2xk');
 }finally{reader.mockRestore();}
});

test('画框等待资源成功后才挂载，实际文档与点选监听就绪；L4热更新不替换iframe',async()=>{
 register();const storage=createProjectStorage(useProjectStore.getState().id);await storage.writeBinary(path,'aW1hZ2U=');
 const source={...screen,htmlContent:`<main data-nid="root"><img data-nid="picture" src="${path}" alt="图标"></main>`,scopedCss:''};
 useProjectStore.getState().addScreen(source,source.id);useProjectStore.getState().setActiveScreen(source.id);
 let release!:(data:string)=>void;
 const reader=spyOn(LocalStorageStorage.prototype,'readBinary').mockImplementation(()=>new Promise(resolve=>release=resolve));
 try{
  await act(async()=>{root.render(<ScreenFrame screen={source} lodLevel={2}/>);});
  expect(release).toBeDefined();expect(Boolean(host.querySelector('iframe'))).toBe(false);expect(host.textContent).toContain('正在读取页面资源');
  await act(async()=>{release('aW1hZ2U=');await new Promise(resolve=>setTimeout(resolve,0));});
  const frame=host.querySelector('iframe')!;
  expect(frame).not.toBeNull();expect(frame.srcdoc).toContain('data:image/png;base64,aW1hZ2U=');
  act(()=>{frame.contentDocument!.open();frame.contentDocument!.write(frame.srcdoc);frame.contentDocument!.close();frame.dispatchEvent(new Event('load'));});
  act(()=>{(frame.contentDocument!.querySelector('[data-nid="picture"]') as HTMLElement).click();});
  expect(useProjectStore.getState().selectedNid).toBe('picture');
  act(()=>useProjectStore.setState({overrides:{[`${source.id}:picture`]:{nid:'picture',declarations:{'border-radius':'8px'}}}}));
  expect(host.querySelector('iframe')===frame).toBe(true);
  expect(frame.contentDocument!.querySelector('style#overrides')?.textContent).toContain('border-radius');
  expect(useProjectStore.getState().screens[source.id].htmlContent).toContain(path);
 }finally{reader.mockRestore();}
});

test('缺失画框资源显示错误占位，不挂载会破图的未解析文档',async()=>{
 register();await act(async()=>{root.render(<ScreenFrame screen={screen} lodLevel={2}/>);await new Promise(resolve=>setTimeout(resolve,0));});
 expect(Boolean(host.querySelector('iframe'))).toBe(false);expect(host.querySelector('[role="alert"]')?.textContent).toContain('资源缺失');
});
