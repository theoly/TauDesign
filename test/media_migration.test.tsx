import {afterEach,beforeEach,expect,test} from 'bun:test';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {prepareMediaMigration,mediaMigrationCurrent,screensWithEmbeddedMedia,createMediaMigrationPreview,consumeMediaMigration,mediaMigrationSourceKey} from '../src/services/import/mediaMigration';
import {useProjectStore} from '../src/stores/useProjectStore';
import {useHistoryStore} from '../src/stores/useHistoryStore';
import {defaultTheme} from '../src/utils/themePresets';
import {createProjectStorage,LocalStorageStorage} from '../src/services/storage/projectStorage';
import {PageRenderCheck} from '../src/services/ai/pageRenderCheck';
import {resourceRenderReport} from './helpers/renderResourceProof';
import {stubIndependentMediaTransport} from './helpers/independentMedia';
import {assertExternalMedia} from '../src/services/ai/externalMedia';
import {HistoryRepository} from '../src/services/storage/historyRepository';
import {MediaMigrationPanel} from '../src/components/settings/MediaMigrationPanel';
import {resumeHistoryPersistence,suspendHistoryPersistence} from '../src/services/storage/historyPersistence';
stubIndependentMediaTransport();
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aKioAAAAASUVORK5CYII=';
const html=`<main data-nid="page"><h1>顾问工作台</h1><button data-nid="entry" aria-label="消息"><svg data-nid="bell" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path data-nid="drawing" d="M12 2L20 20H4Z" /></svg><span>消息</span></button><img data-nid="photo" src="data:image/png;base64,${png}" alt="用户照片"></main>`;
let prior:ReturnType<typeof useProjectStore.getState>,history:ReturnType<typeof useHistoryStore.getState>,inspect:typeof PageRenderCheck.inspect;
beforeEach(()=>{
 prior=useProjectStore.getState();history=useHistoryStore.getState();inspect=PageRenderCheck.inspect;localStorage.clear();resumeHistoryPersistence();
 useProjectStore.getState().initNewProject({name:'旧媒体工程',deviceProfile:'mobile',designSystem:defaultTheme,createSpecimen:false});
 useProjectStore.setState({screens:{old:{id:'old',name:'旧消息页',htmlContent:html,position:{x:0,y:0},scopedCss:'.photo{display:block}'}},screenOrder:['old'],overrides:{'old:photo':{nid:'photo',declarations:{'background-image':`url("data:image/png;base64,${png}")`}}}});
 useHistoryStore.getState().restore(null);PageRenderCheck.inspect=(request,storage)=>resourceRenderReport(request,storage);
});
afterEach(()=>{suspendHistoryPersistence();resumeHistoryPersistence();useProjectStore.setState(prior,true);useHistoryStore.setState(history,true);PageRenderCheck.inspect=inspect;});
function prepare(ids=['old'],controller?:AbortController){const state=useProjectStore.getState(),key=mediaMigrationSourceKey(state,ids);return prepareMediaMigration(state,ids,{signal:controller?.signal,isCurrent:()=>mediaMigrationSourceKey(useProjectStore.getState(),ids)===key});}

test('read-only preparation and independent preview precede one atomic History commit, exact undo and verified reopen',async()=>{
 const before=structuredClone(useProjectStore.getState().screens.old),overrides=structuredClone(useProjectStore.getState().overrides),storage=createProjectStorage(useProjectStore.getState().id);
 const handle=await prepare();expect(screensWithEmbeddedMedia(useProjectStore.getState()).map(s=>s.id)).toEqual(['old']);expect(await storage.listDir('assets')).toHaveLength(0);expect(useHistoryStore.getState().past).toHaveLength(0);expect(useProjectStore.getState().screens.old).toEqual(before);
 const preview=await createMediaMigrationPreview(handle,0,useProjectStore.getState());expect(preview.before).toContain('data:image/png;base64,');expect(preview.after).not.toContain(png);expect(preview.after).toContain('https://unit-preview.example.test/');await preview.dispose();
 useProjectStore.setState({screens:{...useProjectStore.getState().screens,old:{...before,position:{x:200,y:120}}}});expect(mediaMigrationCurrent(handle,useProjectStore.getState())).toBe(true);
 await useProjectStore.getState().applyMediaMigration(handle);
 const state=useProjectStore.getState(),converted=state.screens.old;expect(converted.position).toEqual({x:200,y:120});expect(converted.htmlContent).not.toContain('<path');expect(converted.htmlContent).toContain('顾问工作台');expect(screensWithEmbeddedMedia(state)).toHaveLength(0);expect(()=>assertExternalMedia(converted.htmlContent,converted.scopedCss)).not.toThrow();expect(JSON.stringify(state.overrides)).not.toContain(png);expect(useHistoryStore.getState().past).toHaveLength(1);expect(converted.metadata?.mediaConversion?.removedNids).toContain('drawing');
 const repo=new HistoryRepository(storage,state.id);await repo.save(useHistoryStore.getState());expect(await storage.readText('history.json')).not.toContain(png);expect(await storage.readText('history.json')).not.toContain('<path');
 useHistoryStore.getState().restore(await repo.load());useHistoryStore.getState().undo();expect(useProjectStore.getState().screens.old.htmlContent).toBe(before.htmlContent);expect(useProjectStore.getState().overrides).toEqual(overrides);useHistoryStore.getState().redo();expect(useProjectStore.getState().screens.old).toEqual(converted);
 await expect(useProjectStore.getState().applyMediaMigration(handle)).rejects.toThrow('已使用');
});

for(const change of ['html','theme','override','tamper','cancel'] as const)test(`late ${change} cannot publish converted pages or History`,async()=>{
 const handle=await prepare(),controller=new AbortController();
 if(change==='html')useProjectStore.setState({screens:{...useProjectStore.getState().screens,old:{...useProjectStore.getState().screens.old,htmlContent:html.replace('工作台','更新')}}});
 if(change==='theme')useProjectStore.setState({settings:{...useProjectStore.getState().settings,colorMode:'dark'}});
 if(change==='override')useProjectStore.setState({overrides:{'old:photo':{nid:'photo',declarations:{width:'40px'}}}});
 if(change==='tamper')handle.pages[0].converted.htmlContent='<main>篡改</main>';
 if(change==='cancel')controller.abort();const before=useProjectStore.getState().screens.old,count=useHistoryStore.getState().past.length;
 await expect(useProjectStore.getState().applyMediaMigration(handle,controller.signal)).rejects.toThrow();expect(useProjectStore.getState().screens.old).toEqual(before);expect(useHistoryStore.getState().past).toHaveLength(count);
});

test('cancel during render and new render blockers retain source; unavailable evidence cannot pass',async()=>{
 for(const outcome of ['cancel','unavailable','error'] as const){
  const controller=new AbortController();let calls=0;PageRenderCheck.inspect=async(request,storage)=>{calls++;if(outcome==='cancel')controller.abort();return resourceRenderReport(request,storage,{status:outcome==='unavailable'?'unavailable':'complete',findings:calls===2&&outcome==='error'?[{code:'overflow',severity:'error',message:'新增溢出',actual:'超宽',expected:'完整'}]:[],inspected:4});};
  await expect(prepare(['old'],controller)).rejects.toThrow();expect(useHistoryStore.getState().past).toHaveLength(0);expect(useProjectStore.getState().screens.old.htmlContent).toBe(html);
 }
});

test('existing render findings remain explicit and are not turned into a complete design pass',async()=>{
 PageRenderCheck.inspect=(request,storage)=>resourceRenderReport(request,storage,{status:'complete',findings:[{code:'overflow',severity:'error',message:'已有溢出',actual:'超宽',expected:'完整'}],inspected:4});
 const handle=await prepare();expect(handle.warnings.some(w=>w.includes('保留原有1项设计问题'))).toBe(true);await useProjectStore.getState().applyMediaMigration(handle);expect(useProjectStore.getState().screens.old.metadata?.creationEvidence).toBeUndefined();
});

test('changed physical source bytes or target hash bytes fail without page changes',async()=>{
 const state=useProjectStore.getState(),storage=createProjectStorage(state.id),path='assets/images/legacy.png';await storage.writeBinary(path,png);
 useProjectStore.setState({screens:{old:{...state.screens.old,htmlContent:html.replace('</main>',`<img src="${path}" alt="旧图片"></main>`)}},assets:{legacy:{id:'legacy',name:'旧图片',relPath:path,type:'image',mimeType:'image/png',source:'upload',refCount:1}}});
 let handle=await prepare();await storage.writeBinary(path,'eA==');await expect(consumeMediaMigration(handle,useProjectStore.getState)).rejects.toThrow('资源');expect(useHistoryStore.getState().past).toHaveLength(0);
 await storage.writeBinary(path,png);handle=await prepare();await storage.writeBinary(handle.assets[0].relPath,'eA==');await expect(useProjectStore.getState().applyMediaMigration(handle)).rejects.toThrow('不一致');expect(useProjectStore.getState().screens.old.htmlContent).toContain(path);expect(useHistoryStore.getState().past).toHaveLength(0);
});

test('resource write error and rollback archive error never commit partial conversion',async()=>{
 const originalWrite=LocalStorageStorage.prototype.writeBinary;
 try{
  let handle=await prepare();LocalStorageStorage.prototype.writeBinary=async()=>{throw Error('资源写失败');};await expect(useProjectStore.getState().applyMediaMigration(handle)).rejects.toThrow('资源写失败');expect(useHistoryStore.getState().past).toHaveLength(0);
  LocalStorageStorage.prototype.writeBinary=originalWrite;handle=await prepare();LocalStorageStorage.prototype.writeBinary=async function(path,data){if(path.startsWith('assets/history/'))throw Error('撤销归档写失败');return originalWrite.call(this,path,data);};
  await expect(useProjectStore.getState().applyMediaMigration(handle)).rejects.toThrow('撤销归档写失败');expect(useProjectStore.getState().screens.old.htmlContent).toBe(html);expect(useHistoryStore.getState().past).toHaveLength(0);
 }finally{LocalStorageStorage.prototype.writeBinary=originalWrite;}
});

test('settings UI requires selecting, preparing, comparing and explicitly applying; no AI call',async()=>{
 const container=document.createElement('div');document.body.append(container);const root=createRoot(container),previous=(globalThis as any).IS_REACT_ACT_ENVIRONMENT;(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
 const waitFor=async(check:()=>void)=>{for(let i=0;;i++){try{check();return;}catch(error){if(i>60)throw error;}await act(async()=>{await new Promise(resolve=>setTimeout(resolve,10));});}};
 const button=(name:string)=>Array.from(container.querySelectorAll('button')).find(el=>el.textContent?.trim()===name)!;
 try{
  act(()=>root.render(<MediaMigrationPanel/>));act(()=>container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());act(()=>button('准备转换并预览').click());
  await waitFor(()=>expect(Boolean(container.querySelector('iframe[title="媒体转换后：旧消息页"]'))).toBe(true));expect(useHistoryStore.getState().past).toHaveLength(0);act(()=>button('应用媒体转换').click());
  await waitFor(()=>expect(container.textContent).toContain('媒体已转换为独立文件；可通过撤销恢复原页面。'));expect(useHistoryStore.getState().past).toHaveLength(1);expect(screensWithEmbeddedMedia(useProjectStore.getState())).toHaveLength(0);
 }finally{act(()=>root.unmount());container.remove();(globalThis as any).IS_REACT_ACT_ENVIRONMENT=previous;}
});
