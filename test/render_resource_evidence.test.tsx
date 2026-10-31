import {afterEach,beforeEach,describe,expect,spyOn,test} from 'bun:test';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {createRenderResourceSnapshot,mergeRenderResourceFiles,renderResourceIssue,validRenderResourceFiles} from '../src/services/storage/renderResourceSnapshot';
import {createProjectStorage} from '../src/services/storage/projectStorage';
import {readProjectRenderResources} from '../src/services/ai/projectAssetIntegrity';
import {useProjectStore} from '../src/stores/useProjectStore';
import {useHistoryStore} from '../src/stores/useHistoryStore';
import {neutralModernTheme} from '../src/utils/themePresets';
import {useScreenResources,useStyleResources} from '../src/hooks/useScreenResources';
import {isRenderedQualityReport} from '../src/services/ai/evidenceSchema';
import {buildDesignTaskContract} from '../src/services/ai/designWorkflow';
import {makeGuidancePacket,guidancePacketIssue} from '../src/services/ai/designKnowledge/receipt';
import {selectDesignRules,ruleFingerprint} from '../src/services/ai/designKnowledge/selector';
import {captureDesignGuidanceHistory} from '../src/services/ai/designKnowledge/history';
import {DeliveryPreviewCapture} from '../src/services/storage/deliveryPreview';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
const path='assets/images/example.png',font=`assets/imports/fonts/${'a'.repeat(64)}.woff2`;
const data=btoa('first image bytes'),next=btoa('different image bytes'),clean={status:'complete' as const,findings:[],inspected:3};
const pause=()=>new Promise(resolve=>setTimeout(resolve,0));

test('one snapshot reuses the exact rendered bytes and records SHA256 without binary content',async()=>{
 const storage=createProjectStorage(`resource-${crypto.randomUUID()}`);await storage.writeBinary(path,data);
 const read=spyOn(storage,'readBinary'),snapshot=createRenderResourceSnapshot(storage);
 try{
  expect(await snapshot.storage.readBinary(path)).toBe(data);await storage.writeBinary(path,next);
  expect(await snapshot.storage.readBinary(path)).toBe(data);expect(read).toHaveBeenCalledTimes(1);
  const files=await snapshot.files();expect(validRenderResourceFiles(files)).toBe(true);expect(files[0].sha256).toHaveLength(64);
  expect(JSON.stringify(files)).not.toContain(data);
  const fresh=createRenderResourceSnapshot(storage);await fresh.storage.readBinary(path);
  expect(renderResourceIssue(files,await fresh.files())).toContain('资源内容已变化');
 }finally{read.mockRestore();}
});
test('legacy no-resource reports remain valid while missing, malformed and mismatched proofs fail closed',()=>{
 const a={relPath:path,sha256:'a'.repeat(64)},b={...a,sha256:'b'.repeat(64)};
 expect(renderResourceIssue(undefined,[])).toBeUndefined();expect(renderResourceIssue(undefined,[a])).toContain('摘要');
 expect(renderResourceIssue([a],[a])).toBeUndefined();expect(renderResourceIssue([a],[b])).toContain('变化');
 expect(validRenderResourceFiles([a,a])).toBe(false);expect(validRenderResourceFiles([{...a,relPath:'assets/images/../private'}])).toBe(false);
 expect(isRenderedQualityReport({...clean,resourceFiles:[{...a,sha256:'bad'}]})).toBe(false);
 expect(()=>mergeRenderResourceFiles([[a],[b]])).toThrow('渲染期间发生变化');
});
test('HTML, imported fonts and manual CSS URLs share actual file evidence',async()=>{
 const storage=createProjectStorage(`resource-${crypto.randomUUID()}`);await storage.writeBinary(path,data);await storage.writeBinary(font,btoa('font bytes'));
 const screen={id:'page',name:'页',position:{x:0,y:0},htmlContent:`<style>@font-face{font-family:Local;src:url('${font}')}</style><main><img src='./${path}?v=1'></main>`};
 const resources=await readProjectRenderResources(storage,[screen],[{id:'photo',relPath:path} as any],{'page:root':{nid:'root',declarations:{background:`url('${path}')`}}});
 expect(resources.issues).toEqual([]);expect(resources.resourceFiles.map(f=>f.relPath)).toEqual([path,font].sort((a,b)=>a.localeCompare(b)));
});
test('historical frozen implementation classes survive base CSS removal without authorizing a new execution',()=>{
 const c=buildDesignTaskContract({intent:'create_screen',request:'长正文',deviceProfile:'pc',frameWidth:1440});
 const selection=selectDesignRules({request:'长正文',operation:'create',device:'pc',scope:'page',maxChars:1000});
 const selected=selection.selected[0];selected.rule.implementation[0].classes.push('retired-class-from-older-base');selected.fingerprint=ruleFingerprint(selected.rule);
 c.designGuidance=makeGuidancePacket(c,selection);
 expect(guidancePacketIssue(c,false)).toContain('快照结构无效');expect(guidancePacketIssue(c,false,'history')).toBeUndefined();
 expect(captureDesignGuidanceHistory(c,c.request)?.contract.designGuidance).toEqual(c.designGuidance);
});

describe('resource-aware candidate rendering and adoption',()=>{
 let prior:ReturnType<typeof useProjectStore.getState>,history:ReturnType<typeof useHistoryStore.getState>;
 const before=`<main data-nid="root0001" class="container-max p-4"><img data-nid="photo001" src="${path}" alt="例图"><button data-nid="button01" class="btn">提交</button></main>`;
 const after=before.replace('>提交<','>确认提交<');
 beforeEach(async()=>{
  prior=useProjectStore.getState();history=useHistoryStore.getState();const store=useProjectStore.getState();
  store.initNewProject({name:'资源证据',deviceProfile:'pc',designSystem:neutralModernTheme,createSpecimen:false});
  useProjectStore.setState({assets:{photo:{id:'photo',name:'例图',type:'image',mimeType:'image/png',source:'upload',relPath:path,refCount:1}}});
  await createProjectStorage(useProjectStore.getState().id).writeBinary(path,data);store.addScreen({name:'原页',htmlContent:before,position:{x:0,y:0}},'page');
 });
 afterEach(()=>{useProjectStore.getState().discardStagedChange();useProjectStore.setState(prior,true);useHistoryStore.setState(history,true);});
 async function proof(){
  const store=useProjectStore.getState(),screen={...store.screens.page,htmlContent:store.stagedScreen!.newHtml};
  const resources=await readProjectRenderResources(createProjectStorage(store.id),[screen],Object.values(store.assets),store.overrides);
  store.setStagedRenderQuality(store.getStagedRenderContextKey(),{...clean,resourceFiles:resources.resourceFiles});
  for(let i=0;i<30&&store.getStagedDeliveryReport().status!=='ready';i++)await pause();
  expect(store.getStagedDeliveryReport().status).toBe('ready');
 }
 test('same-path replacement invalidates old proof, preserves task and permits refreshed adoption with Undo/Redo',async()=>{
  const store=useProjectStore.getState();store.stageScreenChange('page',after,'新版');await proof();
  const staged=useProjectStore.getState().stagedScreen!,key=store.getStagedRenderContextKey(),count=useHistoryStore.getState().past.length;
  await createProjectStorage(store.id).writeBinary(path,next);expect(await store.adoptStagedChange()).toBe(false);
  expect(store.getStagedRenderContextKey()).not.toBe(key);expect(useProjectStore.getState().stagedScreen).toBe(staged);
  expect(store.isStagedTaskCurrent()).toBe(true);expect(useHistoryStore.getState().past.length).toBe(count);
  expect(useProjectStore.getState().stagedAdoptionError).toContain('资源内容已变化');
  store.setStagedRenderQuality(key,clean);expect(useProjectStore.getState().stagedRenderQuality).toBeNull();
  await proof();expect(await store.adoptStagedChange()).toBe(true);
  useHistoryStore.getState().undo();expect(useProjectStore.getState().screens.page.htmlContent).toBe(before);
  useHistoryStore.getState().redo();expect(useProjectStore.getState().screens.page.htmlContent).toBe(after);
 });
 test('unrelated file changes do not invalidate actual page resource proof',async()=>{
  const store=useProjectStore.getState();store.stageScreenChange('page',after,'新版');await proof();
  await createProjectStorage(store.id).writeBinary('assets/images/unrelated.png',next);
  expect(await store.keepBothScreens()).toBe(true);expect(useProjectStore.getState().screenOrder).toHaveLength(2);
 });
 test('a legacy complete report without bytes cannot authorize a page with local resources',async()=>{
  const store=useProjectStore.getState();store.stageScreenChange('page',after,'新版');
  store.setStagedRenderQuality(store.getStagedRenderContextKey(),clean);
  for(let i=0;i<30&&store.getStagedDeliveryReport().status!=='ready';i++)await pause();
  expect(await store.forceAdoptStagedChange()).toBe(false);expect(useProjectStore.getState().screens.page.htmlContent).toBe(before);
 });
 test('replacement during archive preview is caught by the final gate, before any History mutation',async()=>{
  const store=useProjectStore.getState(),storage=createProjectStorage(store.id);store.stageScreenChange('page',after,'新版');await proof();
  const historyCount=useHistoryStore.getState().past.length;
  const capture=spyOn(DeliveryPreviewCapture,'capture').mockImplementation(async record=>{
   await storage.writeBinary(path,next);
   return {status:'failed',scope:'first-screen',capturedAt:Date.now(),candidateFingerprint:record.resultFingerprint,contextFingerprint:'test',reason:'测试预览'};
  });
  try{expect(await store.adoptStagedChange()).toBe(false);expect(useProjectStore.getState().screens.page.htmlContent).toBe(before);
   expect(useHistoryStore.getState().past.length).toBe(historyCount);expect(useProjectStore.getState().stagedAdoptionError).toContain('资源内容已变化');
  }finally{capture.mockRestore();}
 });
 test('refresh rereads HTML and L4 bytes without reselecting or rewriting the candidate',async()=>{
  const store=useProjectStore.getState(),storage=createProjectStorage(store.id);await storage.writeBinary(font,btoa('font'));
  const screen={...store.screens.page,scopedCss:`@font-face{font-family:Local;src:url('${font}')}`};
  const css=`[data-nid="root0001"]{background-image:url('${path}')}`;
  const host=document.createElement('div');document.body.appendChild(host);const root=createRoot(host);
  let current:any;
  function Probe({revision}:{revision:number}){const a=useScreenResources(screen,revision),b=useStyleResources(css,revision);current={a,b};return <span>{a.loading||b.loading?'loading':'ready'}</span>;}
  try{
   await act(async()=>{root.render(<Probe revision={0}/>);});
   for(let i=0;i<30&&host.textContent!=='ready';i++)await act(async()=>{await pause();});
   expect(current.a.resourceFiles).toHaveLength(2);expect(current.b.css).toContain(data);
   await storage.writeBinary(path,next);await act(async()=>{root.render(<Probe revision={1}/>);});
   for(let i=0;i<30&&host.textContent!=='ready';i++)await act(async()=>{await pause();});
   expect(current.a.screen.htmlContent).toContain(next);expect(current.b.css).toContain(next);
   expect(screen.htmlContent).toBe(before);expect(screen.scopedCss).toContain(font);
  }finally{act(()=>root.unmount());host.remove();}
 });
});
