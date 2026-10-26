import {afterEach,beforeEach,expect,spyOn,test} from 'bun:test';
import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {useProjectStore} from '../src/stores/useProjectStore';
import {useHistoryStore} from '../src/stores/useHistoryStore';
import {neutralModernTheme} from '../src/utils/themePresets';
import {PageRenderCheck} from '../src/services/ai/pageRenderCheck';
import {PagePreviewCapture} from '../src/services/storage/pagePreview';
import {createProjectStorage} from '../src/services/storage/projectStorage';
import {DeliveryRepository} from '../src/services/storage/deliveryRepository';
import {RestyleDeliveryRepository} from '../src/services/storage/restyleDeliveryRepository';
import {createVisualTask,visualHash,compareVisualPixels,importVisualEvidence,listVisualEvidence,readVisualImage,type VisualOwner,type VisualResult,type PixelImage} from '../src/services/storage/visualEvidence';
import {acceptRestyleResult} from '../src/services/ai/restyleService';
import {VisualEvidencePanel} from '../src/components/inspector/VisualEvidencePanel';
import {png} from './helpers/previewPng';
import {migrateProjectBundle} from '../src/services/storage/projectBundleMigration';
import {LocalStorageStorage} from '../src/services/storage/projectStorage';
import {readProject} from '../src/utils/projectRegistry';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
let prior:ReturnType<typeof useProjectStore.getState>,history:ReturnType<typeof useHistoryStore.getState>,render:ReturnType<typeof spyOn>,capture:ReturnType<typeof spyOn>,owner:VisualOwner,root:Root|undefined,host:HTMLDivElement;
const source='<main data-nid="root" class="col p-4 gap-4"><h1 data-nid="title">视觉验收</h1><button data-nid="action" class="btn btn-primary">提交</button></main>';
const pixels=(w=390,h=844):PixelImage=>({width:w,height:h,pixels:new Uint8ClampedArray(w*h*4).fill(255)});
const storage=()=>createProjectStorage(owner.projectId);
beforeEach(async()=>{
 prior=useProjectStore.getState();history=useHistoryStore.getState();render=spyOn(PageRenderCheck,'inspect').mockResolvedValue({status:'complete',findings:[],inspected:3});
 capture=spyOn(PagePreviewCapture,'capture').mockImplementation(async request=>({status:'failed',scope:'first-screen',capturedAt:1,candidateFingerprint:request.candidateFingerprint,contextFingerprint:request.contextFingerprint,reason:'unit fixture'}));
 const s=useProjectStore.getState(),id=s.initNewProject({name:'视觉档案',deviceProfile:'mobile',designSystem:neutralModernTheme,createSpecimen:false});s.addScreen({name:'资料页',htmlContent:source},'page');
 s.stageScreenChange('page',source.replace('>提交</button>','>确认提交</button>'),'新版');s.setStagedRenderQuality(s.getStagedRenderContextKey(),{status:'complete',findings:[],inspected:3});expect(await s.adoptStagedChange()).toBe(true);
 const record=(await new DeliveryRepository(createProjectStorage(id),id).listForScreen('page')).records[0];owner={projectId:id,kind:'single',eventId:record.id,screenId:'page'};
});
afterEach(()=>{if(root)act(()=>root!.unmount());root=undefined;host?.remove();render.mockRestore();capture.mockRestore();useProjectStore.setState(prior,true);useHistoryStore.setState(history,true);});
async function bundle(){
 const task=await createVisualTask(storage(),owner),bytes=Uint8Array.from(atob(png(390,844)),c=>c.charCodeAt(0)),sha=await visualHash(bytes);
 const report:VisualResult={schemaVersion:1,taskFingerprint:task.fingerprint,documentHash:task.documentHash,environment:{browser:'chromium',version:'145',platform:'Test OS',machine:'test',fontHash:'a'.repeat(64)},capturedAt:1,status:'passed',threshold:.005,channelThreshold:12,metrics:compareVisualPixels(pixels(),pixels()),images:{reference:{file:'reference.png',sha256:sha},actual:{file:'actual.png',sha256:sha},diff:{file:'diff.png',sha256:sha}}};
 const files=new Map(['reference','actual','diff'].map(role=>[role+'.png',bytes]));return {task,report,files};
}
const options={check:()=>{},decode:async()=>pixels()};
test('单页任务从真实档案输出设备/Token/L4/CSP和稳定SHA，不修改当前页或History',async()=>{
 const s=useProjectStore.getState(),before=s.screens.page.htmlContent,count=useHistoryStore.getState().past.length,task=await createVisualTask(storage(),owner);
 expect(task.width).toBe(390);expect(task.height).toBe(844);expect(task.document).toContain('确认提交');expect(task.document).toContain("script-src 'none'");expect(task.documentHash).toBe(await visualHash(task.document));expect((await createVisualTask(storage(),owner)).fingerprint).toBe(task.fingerprint);expect(useProjectStore.getState().screens.page.htmlContent).toBe(before);expect(useHistoryStore.getState().past.length).toBe(count);
});
test('重塑任务选择真实对应页面；错误页或未应用事件拒绝',async()=>{
 const s=useProjectStore.getState(),html=s.screens.page.htmlContent;expect((await s.applyRestyleOutcome(acceptRestyleResult({kind:'screen',id:'page',name:'资料页',html},html.replace('p-4','p-6')))).applied).toBe(true);
 const record=(await new RestyleDeliveryRepository(storage(),owner.projectId).list()).records[0],restyle={...owner,kind:'restyle' as const,eventId:record.id};expect((await createVisualTask(storage(),restyle)).document).toContain('p-6');await expect(createVisualTask(storage(),{...restyle,screenId:'missing'})).rejects.toThrow();
 await new RestyleDeliveryRepository(storage(),owner.projectId).finish(record,'aborted');await expect(createVisualTask(storage(),restyle)).rejects.toThrow('尚未应用');
});
test('仅初始化、通过、失败分别存档，重复不写图，原代码/History不变',async()=>{
 const b=await bundle(),before=useProjectStore.getState().screens.page.htmlContent,count=useHistoryStore.getState().past.length;
 const initialized=await importVisualEvidence(storage(),owner,JSON.stringify({...b.report,status:'initialized'}),b.files,options);expect(initialized.record.status).toBe('initialized');
 const passed=await importVisualEvidence(storage(),owner,JSON.stringify(b.report),b.files,options);expect(passed.record.status).toBe('passed');
 const duplicate=await importVisualEvidence(storage(),owner,JSON.stringify(b.report),b.files,options);expect(duplicate.duplicate).toBe(true);expect(duplicate.record.id).toBe(passed.record.id);
 expect((await listVisualEvidence(storage(),owner)).records).toHaveLength(2);expect((await readVisualImage(storage(),passed.record,'actual')).startsWith('data:image/png;base64,')).toBe(true);
 expect(await storage().readText(`deliveries/visual/${passed.record.id}.json`)).not.toContain('base64');expect(useProjectStore.getState().screens.page.htmlContent).toBe(before);expect(useHistoryStore.getState().past.length).toBe(count);
 const actual=pixels();actual.pixels.fill(0,0,actual.pixels.length/2);for(let i=3;i<actual.pixels.length;i+=4)actual.pixels[i]=255;
 const report={...b.report,status:'failed',capturedAt:2,metrics:compareVisualPixels(pixels(),actual)};
 let decoded=0;const failed=await importVisualEvidence(storage(),owner,JSON.stringify(report),b.files,{check:()=>{},decode:async()=>++decoded===2?actual:pixels()});expect(failed.record.status).toBe('failed');
});
for(const kind of ['task','document','hash','status','metrics','rules','missing','oversize','decode','dimensions','transparent'] as const)test(`${kind}伪造或异常不产生视觉档案`,async()=>{
 const b=await bundle();let decode=options.decode;
 if(kind==='task')b.report.taskFingerprint='b'.repeat(64);if(kind==='document')b.report.documentHash='b'.repeat(64);if(kind==='hash')b.report.images.actual.sha256='b'.repeat(64);if(kind==='status')b.report.status='failed';if(kind==='metrics')b.report.metrics={...b.report.metrics,changedPixels:1,ratio:1/b.report.metrics.totalPixels};if(kind==='rules')b.report.channelThreshold=255;if(kind==='missing')b.files.delete('diff.png');if(kind==='oversize')b.files.set('diff.png',new Uint8Array(8*1024*1024+1));if(kind==='decode')decode=async()=>{throw Error('decode failed');};if(kind==='dimensions')decode=async()=>pixels(1,1);if(kind==='transparent')decode=async()=>{const image=pixels();image.pixels[3]=0;return image;};
 await expect(importVisualEvidence(storage(),owner,JSON.stringify(b.report),b.files,{check:()=>{},decode})).rejects.toThrow();expect((await listVisualEvidence(storage(),owner)).records).toHaveLength(0);
});
test('取消/上下文变化与保存后任务变化清理本次文件，不发布关联',async()=>{
 const b=await bundle();let cancelled=false;const before=await storage().listDir('assets/images');
 await expect(importVisualEvidence(storage(),owner,JSON.stringify(b.report),b.files,{check:()=>{if(cancelled)throw Error('cancelled');},decode:async()=>{cancelled=true;return pixels();}})).rejects.toThrow('cancelled');expect(await storage().listDir('assets/images')).toEqual(before);
 // Wrap the same storage instance used by the import.
 const target=storage(),original=target.writeBinary.bind(target);let mutated=false;
 target.writeBinary=async(path,bytes)=>{await original(path,bytes);if(!mutated){mutated=true;const record=(await new DeliveryRepository(target,owner.projectId).get('page',owner.eventId))!;record.settings.viewportGuideHeight=900;record.settings.referenceDevice=undefined;await new DeliveryRepository(target,owner.projectId).finish(record,'applied');}};
 await expect(importVisualEvidence(target,owner,JSON.stringify(b.report),b.files,options)).rejects.toThrow('已变化');expect((await listVisualEvidence(target,owner)).records).toHaveLength(0);expect(await target.listDir('assets/images')).toEqual(before);
});
test('写失败/错误回读清理图片，原交付记录继续可读',async()=>{
 for(const kind of ['write','readback']){const b=await bundle(),target=storage(),write=target.writeTextAtomic.bind(target),read=target.readText.bind(target);
 target.writeTextAtomic=async(path,text)=>{if(path.startsWith('deliveries/visual')&&kind==='write')throw Error('disk full');return write(path,text);};target.readText=async path=>path.startsWith('deliveries/visual')&&kind==='readback'?'lost':read(path);
 await expect(importVisualEvidence(target,owner,JSON.stringify(b.report),b.files,options)).rejects.toThrow();expect(await target.listDir('assets/images')).toEqual([]);expect(await new DeliveryRepository(target,owner.projectId).get('page',owner.eventId)).not.toBeNull();}
});
test('报告损坏/图片缺失或内容变化有明确读取失败，未知字段不入存档',async()=>{
 const b=await bundle(),r=await importVisualEvidence(storage(),owner,JSON.stringify({...b.report,apiKey:'never persist',document:'never persist'}),b.files,options),path=`deliveries/visual/${r.record.id}.json`,saved=(await storage().readText(path))!;
 expect(saved).not.toContain('apiKey');expect(saved).not.toContain('never persist');await storage().remove(r.record.images.actual.relPath);await expect(readVisualImage(storage(),r.record,'actual')).rejects.toThrow('缺失');await storage().writeBinary(r.record.images.actual.relPath,png(1,1));await expect(readVisualImage(storage(),r.record,'actual')).rejects.toThrow('变化');
 const tampered=JSON.parse(saved);tampered.environment.platform='tampered';await storage().writeTextAtomic(path,JSON.stringify(tampered));expect((await listVisualEvidence(storage(),owner)).invalidFiles).toBe(1);
});
test('新视觉目录及其独立图片参与完整迁移，原证据无改写',async()=>{
 const b=await bundle(),r=await importVisualEvidence(storage(),owner,JSON.stringify(b.report),b.files,options),target=new LocalStorageStorage('visual-target-'+crypto.randomUUID());
 const result=await migrateProjectBundle({sourceJson:readProject(owner.projectId)!,source:storage(),target,historyRaw:null,readHistory:()=>null,checkCurrent:()=>{}});expect(result.ok).toBe(true);expect((await listVisualEvidence(target,owner)).records[0].id).toBe(r.record.id);expect(await readVisualImage(target,r.record,'reference')).toContain('data:image/png');
});
test('像素阈值、边界/尺寸、透明图及非法数组确实执行',()=>{
 const a=pixels(2,2),b=pixels(2,2);b.pixels[0]=243;expect(compareVisualPixels(a,b).changedPixels).toBe(0);b.pixels[0]=242;expect(compareVisualPixels(a,b).changedPixels).toBe(1);expect(compareVisualPixels(a,pixels(1,2)).sizeMatches).toBe(false);expect(()=>compareVisualPixels(a,{...b,pixels:new Uint8ClampedArray(3)})).toThrow('不完整');
});
test('历史面板旧无报告兼容，加载后可查看外部环境与图入口',async()=>{
 const b=await bundle();await importVisualEvidence(storage(),owner,JSON.stringify(b.report),b.files,options);host=document.createElement('div');document.body.append(host);root=createRoot(host);
 await act(async()=>root!.render(<VisualEvidencePanel projectId={owner.projectId} kind="single" eventId={owner.eventId} screenId="page"/>));
 act(()=>{host.querySelector('details')!.open=true;host.querySelector('details')!.dispatchEvent(new Event('toggle'));});
 for(let i=0;i<40&&!host.textContent?.includes('像素复核通过');i++)await act(async()=>{await new Promise(r=>setTimeout(r,5));});
 expect(host.textContent).toContain('像素复核通过');expect(host.textContent).toContain('chromium 145');expect(host.textContent).toContain('历史视觉证据不解锁');expect(host.querySelector('input[type="file"]')).not.toBeNull();
});
test('同事件并发导入只接受一次，取消后可重试',async()=>{
 const b=await bundle();let release!:(image:PixelImage)=>void,stale=false,held=false;
 const first=importVisualEvidence(storage(),owner,JSON.stringify(b.report),b.files,{check:()=>{if(stale)throw Error('cancelled');},decode:async()=>{if(!held){held=true;return new Promise<PixelImage>(resolve=>release=resolve);}return pixels();}});
 for(let i=0;i<100&&!release;i++)await new Promise(r=>setTimeout(r,1));expect(Boolean(release)).toBe(true);
 await expect(importVisualEvidence(storage(),owner,JSON.stringify(b.report),b.files,options)).rejects.toThrow('正在导入');stale=true;release(pixels());await expect(first).rejects.toThrow('cancelled');
 expect((await importVisualEvidence(storage(),owner,JSON.stringify(b.report),b.files,options)).duplicate).toBe(false);
});
test('历史资源缺失拒绝任务，文件字节改变使旧任务报告失效',async()=>{
 const repository=new DeliveryRepository(storage(),owner.projectId),record=(await repository.get('page',owner.eventId))!;
 record.after.htmlContent=record.after.htmlContent.replace('</main>','<img src="assets/images/historical.png" alt="历史图"></main>');
 const {contentFingerprint}=await import('../src/services/ai/designWorkflow');record.resultFingerprint=contentFingerprint(record.after.htmlContent);record.assets=[{id:'image',name:'历史图',type:'image',mimeType:'image/png',source:'upload',relPath:'assets/images/historical.png',refCount:1}];await repository.finish(record,'applied');
 await expect(createVisualTask(storage(),owner)).rejects.toThrow('缺失');await storage().writeBinary('assets/images/historical.png',png(1,1));const task=await createVisualTask(storage(),owner);expect(task.document).toContain('data:image/png;base64,');
 const b=await bundle();await storage().writeBinary('assets/images/historical.png',png(2,2));await expect(importVisualEvidence(storage(),owner,JSON.stringify(b.report),b.files,options)).rejects.toThrow('不匹配');
});
test('视觉任务使用交付版本的Token和L4，当前项目后续修改不覆盖历史任务',async()=>{
 const repository=new DeliveryRepository(storage(),owner.projectId),record=(await repository.get('page',owner.eventId))!;
 record.overrides={'page:action':{nid:'action',declarations:{padding:'32px'}} as any};record.designSystem.tokens.colors.primary['500']='#7c3aed';await repository.finish(record,'applied');
 const task=await createVisualTask(storage(),owner);expect(task.document).toContain('padding:32px !important');expect(task.document).toContain('#7c3aed');
 useProjectStore.getState().updateScreenHtml('page','<main>当前新页</main>');expect((await createVisualTask(storage(),owner)).fingerprint).toBe(task.fingerprint);
});
test('独立报告ID冲突拒绝，不覆盖已有报告或图片',async()=>{
 const b=await bundle(),saved=await importVisualEvidence(storage(),owner,JSON.stringify(b.report),b.files,options),id=saved.record.id,path=`deliveries/visual/${id}.json`,before=await storage().readText(path);
 const mock=spyOn(crypto,'randomUUID').mockReturnValue(id.slice(7) as `${string}-${string}-${string}-${string}-${string}`);
 try{await expect(importVisualEvidence(storage(),owner,JSON.stringify({...b.report,capturedAt:2}),b.files,options)).rejects.toThrow('ID冲突');expect(await storage().readText(path)).toBe(before);expect(await readVisualImage(storage(),saved.record,'reference')).toContain('data:image/png');}finally{mock.mockRestore();}
});
test('异步解码期间调用方修改图片和owner不会污染已冻结导入',async()=>{
 const b=await bundle(),requestOwner={...owner},expected=await visualHash(b.files.get('actual.png')!);let changed=false;
 const result=await importVisualEvidence(storage(),requestOwner,JSON.stringify(b.report),b.files,{check:()=>{},decode:async()=>{if(!changed){changed=true;b.files.get('actual.png')!.fill(0);requestOwner.screenId='other';}return pixels();}});
 expect(result.record.owner.screenId).toBe('page');expect(result.record.images.actual.sha256).toBe(expected);expect(await readVisualImage(storage(),result.record,'actual')).toContain('data:image/png');
});
test('空/坏JSON及UTF8超预算报告有明确错误，不产生档案',async()=>{
 const b=await bundle();for(const raw of ['null','{broken','汉'.repeat(23000)])await expect(importVisualEvidence(storage(),owner,raw,b.files,options)).rejects.toThrow();expect((await listVisualEvidence(storage(),owner)).records).toHaveLength(0);
});
test('存盘报告owner或视口被改写时不能错误关联其它事件/设备',async()=>{
 const b=await bundle(),saved=await importVisualEvidence(storage(),owner,JSON.stringify(b.report),b.files,options),path=`deliveries/visual/${saved.record.id}.json`;
 const record={...saved.record,width:400};await storage().writeTextAtomic(path,JSON.stringify(record));expect((await listVisualEvidence(storage(),owner)).invalidFiles).toBe(1);
 await storage().writeTextAtomic(path,JSON.stringify({...saved.record,owner:{...owner,screenId:'foreign'}}));expect((await listVisualEvidence(storage(),{...owner,screenId:'foreign'})).invalidFiles).toBe(1);
});
