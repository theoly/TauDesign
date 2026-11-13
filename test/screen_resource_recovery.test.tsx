import {afterEach,beforeEach,expect,spyOn,test} from 'bun:test';
import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {useScreenResources,useStyleResources} from '../src/hooks/useScreenResources';
import {ScreenFrame} from '../src/components/canvas/ScreenFrame';
import {ExportModal} from '../src/components/export/ExportModal';
import {MediaResourceSessions} from '../src/services/storage/mediaResourceSession';
import {createProjectStorage,LocalStorageStorage} from '../src/services/storage/projectStorage';
import {useProjectStore} from '../src/stores/useProjectStore';
import {useHistoryStore} from '../src/stores/useHistoryStore';
import type {Screen} from '../src/types/project';
import {mediaDiagnosticsSnapshot} from '../src/services/storage/mediaDiagnostics';
import * as exportSaver from '../src/utils/exportSaver';
import {DefaultAIEngineCore} from '../src/services/ai/engine/core/aiEngineCore';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
const image='assets/images/recovery.png',other='assets/images/other.png';
const screen:Screen={id:'page',name:'媒体恢复',position:{x:0,y:0},htmlContent:`<main data-nid="root"><img data-nid="photo" src="${image}" alt="照片"></main>`};
let prior:ReturnType<typeof useProjectStore.getState>,history:ReturnType<typeof useHistoryStore.getState>,root:Root,host:HTMLDivElement,result:ReturnType<typeof useScreenResources>,styles:ReturnType<typeof useStyleResources>;
let failures:boolean,registrations:number,closed:number,mock:ReturnType<typeof spyOn>;
const Harness=({source=screen,css=''}:{source?:Screen;css?:string})=>{result=useScreenResources(source);styles=useStyleResources(css);return null;};
const flush=async(predicate:()=>boolean)=>{const end=Date.now()+2000;while(!predicate()&&Date.now()<end)await act(async()=>{await new Promise(resolve=>setTimeout(resolve,1));});expect(predicate()).toBe(true);};
const button=(text:string)=>Array.from(host.querySelectorAll('button')).find(node=>node.textContent?.includes(text))!;
beforeEach(async()=>{
 prior=useProjectStore.getState();history=useHistoryStore.getState();useProjectStore.getState().initNewProject({name:'资源恢复隔离',deviceProfile:'mobile',createSpecimen:false});
 useProjectStore.getState().addScreen(screen,'page');useProjectStore.getState().setActiveScreen('page');
 for(const [id,path] of [['photo',image],['other',other]])useProjectStore.getState().addAsset({id,name:id,relPath:path,type:'image',mimeType:'image/png',source:'upload',refCount:0});
 const storage=createProjectStorage(useProjectStore.getState().id);await storage.writeBinary(image,'aW1hZ2U=');await storage.writeBinary(other,'bmV3');
 useHistoryStore.getState().restore(null);host=document.createElement('div');document.body.append(host);root=createRoot(host);failures=false;registrations=closed=0;
 mock=spyOn(MediaResourceSessions,'create').mockImplementation(()=>({async url(path:string){registrations++;if(failures)throw Error('媒体服务暂时失败');return 'https://unit-preview.example.test/'+path;},async close(){closed++;}}));
});
afterEach(()=>{act(()=>root.unmount());host.remove();mock.mockRestore();useProjectStore.setState(prior,true);useHistoryStore.setState(history,true);});

test('explicit resource retry recovers the same authored page and releases failed sessions without automatic retry loops',async()=>{
 failures=true;act(()=>root.render(<Harness/>));await flush(()=>!result.loading);
 expect(result.error).toContain('暂时失败');expect(closed).toBe(1);expect(registrations).toBe(1);expect(result.resourceFiles).toEqual([]);
 failures=false;act(()=>result.retry());await flush(()=>!result.loading);
 expect(result.error).toBeUndefined();expect(result.screen?.htmlContent).toContain('https://unit-preview.example.test/');expect(result.resourceFiles.length).toBe(1);expect(registrations).toBe(2);
 expect(useProjectStore.getState().screens.page.htmlContent).toBe(screen.htmlContent);expect(useHistoryStore.getState().past).toHaveLength(0);
});
test('loading a new resource key never exposes old file evidence or an old resolved URL',async()=>{
 act(()=>root.render(<Harness/>));await flush(()=>!result.loading);expect(result.resourceFiles).toHaveLength(1);
 const read=LocalStorageStorage.prototype.readBinary;let release!:(bytes:string)=>void;
 const reader=spyOn(LocalStorageStorage.prototype,'readBinary').mockImplementation(function(this:LocalStorageStorage,path:string){return path===other?new Promise(resolve=>{release=resolve;}):read.call(this,path);});
 try{
  act(()=>root.render(<Harness source={{...screen,htmlContent:screen.htmlContent.replace(image,other)}}/>));await flush(()=>!!release);
  expect(result.loading).toBe(true);expect(result.resourceFiles).toEqual([]);expect(result.screen?.htmlContent).toContain(other);expect(result.screen?.htmlContent).not.toContain('https://unit-preview.example.test/');
  await act(async()=>{release('bmV3');});await flush(()=>!result.loading);expect(result.resourceFiles.map(file=>file.relPath)).toEqual([other]);
 }finally{reader.mockRestore();}
});
test('switching away from pending screen and style reads records cancellation without leaking page content',async()=>{
 const start=mediaDiagnosticsSnapshot().events.at(-1)?.sequence??0,read=LocalStorageStorage.prototype.readBinary;const releases:Array<(bytes:string)=>void>=[];
 const reader=spyOn(LocalStorageStorage.prototype,'readBinary').mockImplementation(function(this:LocalStorageStorage,path:string){return path===other?new Promise(resolve=>{releases.push(resolve);}):read.call(this,path);});
 try{
  act(()=>root.render(<Harness source={{...screen,htmlContent:screen.htmlContent.replace(image,other)}} css={`.demo{background-image:url(${other})}`}/>));await flush(()=>releases.length===2);
  act(()=>root.render(<Harness/>));await act(async()=>{releases.forEach(resolve=>resolve('bmV3'));});await flush(()=>!result.loading);
  const events=mediaDiagnosticsSnapshot().events.filter(row=>row.sequence>start);expect(events.some(row=>row.scope==='screen'&&row.stage==='close'&&row.status==='canceled')).toBe(true);expect(events.some(row=>row.scope==='style'&&row.stage==='close'&&row.status==='canceled')).toBe(true);expect(events.some(row=>row.stage==='resolve'&&row.status==='canceled')).toBe(true);
  expect(JSON.stringify(events)).not.toContain('background-image');expect(JSON.stringify(events)).not.toContain(other);
 }finally{reader.mockRestore();}
});
test('missing files are not automatically retried; repair plus the frame action rechecks page and L4 without changing history',async()=>{
 const storage=createProjectStorage(useProjectStore.getState().id);await storage.remove(image);const before=JSON.stringify(useProjectStore.getState().screens);
 const reports:any[]=[];act(()=>root.render(<ScreenFrame screen={screen} lodLevel={2} isStaged renderQualityKey="current-candidate" onRenderQuality={(_id,_key,report)=>reports.push(report)}/>));
 await flush(()=>!!host.querySelector('[role="alert"]'));expect(host.textContent).toContain('资源缺失');expect(registrations).toBe(0);expect(host.querySelector('iframe')).toBeNull();expect(reports.at(-1)?.status).toBe('unavailable');
 await storage.writeBinary(image,'aW1hZ2U=');act(()=>button('重试页面资源').click());await flush(()=>!!host.querySelector('iframe'));
 expect(host.querySelector('[role="alert"]')).toBeNull();expect(host.querySelector('iframe')?.srcdoc).not.toContain('data:image');expect(JSON.stringify(useProjectStore.getState().screens)).toBe(before);expect(useHistoryStore.getState().past).toHaveLength(0);
});
test('L4-only errors have the same retry action and invalidate rendered evidence',async()=>{
 const storage=createProjectStorage(useProjectStore.getState().id);await storage.remove(other);
 act(()=>useProjectStore.setState({overrides:{'page:root':{nid:'root',declarations:{'background-image':`url(${other})`}}}}));
 const reports:any[]=[];act(()=>root.render(<ScreenFrame screen={screen} lodLevel={2} isStaged renderQualityKey="candidate-l4" onRenderQuality={(_id,_key,report)=>reports.push(report)}/>));
 await flush(()=>!!host.querySelector('[role="alert"]'));expect(reports.at(-1)?.status).toBe('unavailable');expect(host.textContent).toContain('资源缺失');
 await storage.writeBinary(other,'bmV3');act(()=>button('重试页面资源').click());await flush(()=>!host.querySelector('[role="alert"]'));
 expect(useHistoryStore.getState().past).toHaveLength(0);
});
test('candidate retry changes its render key and rejects a late report from the prior resource session',async()=>{
 const state=useProjectStore.getState();state.stageScreenChange('page',screen.htmlContent,'媒体候选','仅调整布局');
 const key=state.getStagedRenderContextKey(),revision=useProjectStore.getState().stagedRenderRevision;
 failures=true;
 const report=(_id:string,reportKey:string,value:any)=>useProjectStore.getState().setStagedRenderQuality(reportKey,value);
 act(()=>root.render(<ScreenFrame screen={screen} lodLevel={2} isStaged renderQualityKey={key} onRenderQuality={report}/>));
 await flush(()=>!!host.querySelector('[role="alert"]'));expect(useProjectStore.getState().stagedRenderQuality?.report.status).toBe('unavailable');
 failures=false;act(()=>button('重试页面资源').click());
 expect(useProjectStore.getState().stagedRenderRevision).toBe(revision+1);expect(useProjectStore.getState().getStagedRenderContextKey()).not.toBe(key);
 act(()=>state.setStagedRenderQuality(key,{status:'complete',inspected:1,findings:[],resourceFiles:[]}));
 expect(useProjectStore.getState().stagedRenderQuality).toBeNull();await flush(()=>!!host.querySelector('iframe'));
 expect(useProjectStore.getState().stagedRenderQuality).toBeNull();expect(useHistoryStore.getState().past).toHaveLength(0);
});
test('export resource retry only rereads bytes and unlocks export; it never starts a download or edits source',async()=>{
 const storage=createProjectStorage(useProjectStore.getState().id);await storage.remove(image);act(()=>root.render(<ExportModal onClose={()=>{}}/>));
 await flush(()=>!!host.querySelector('[role="alert"]'));expect(button('保存独立 HTML 文件').disabled).toBe(true);expect(button('复制代码').disabled).toBe(true);
 await storage.writeBinary(image,'aW1hZ2U=');act(()=>button('重新读取导出资源').click());await flush(()=>!button('保存独立 HTML 文件').disabled);
 expect(button('保存独立 HTML 文件').disabled).toBe(false);expect(host.textContent).not.toContain('保存成功');expect(useProjectStore.getState().screens.page.htmlContent).toBe(screen.htmlContent);expect(useHistoryStore.getState().past).toHaveLength(0);
});
test('export failure panel saves diagnostics only on explicit click, reports cancellation and makes zero model calls',async()=>{
 const storage=createProjectStorage(useProjectStore.getState().id);await storage.remove(image);
 const save=spyOn(exportSaver,'saveExportFile').mockResolvedValue({status:'canceled',fileName:'media-diagnostics.json'}),stream=spyOn(DefaultAIEngineCore.prototype,'streamText'),generate=spyOn(DefaultAIEngineCore.prototype,'generateObject');
 try{
  act(()=>root.render(<ExportModal onClose={()=>{}}/>));await flush(()=>!!host.querySelector('[role="alert"]'));expect(save).not.toHaveBeenCalled();
  await act(async()=>{button('导出资源诊断').click();});expect(save).toHaveBeenCalledTimes(1);expect(host.textContent).toContain('已取消诊断保存');
  const request=save.mock.calls[0][0],json=new TextDecoder().decode(request.bytes);expect(request.fileName).toBe('media-diagnostics.json');expect(JSON.parse(json).events.some((row:any)=>row.usage==='export'&&row.stage==='resolve'&&row.status==='failed')).toBe(true);expect(json).not.toContain(image);
  expect(stream).not.toHaveBeenCalled();expect(generate).not.toHaveBeenCalled();expect(useHistoryStore.getState().past).toHaveLength(0);expect(useProjectStore.getState().screens.page.htmlContent).toBe(screen.htmlContent);
 }finally{save.mockRestore();stream.mockRestore();generate.mockRestore();}
});
