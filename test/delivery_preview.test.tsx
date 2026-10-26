import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { png } from './helpers/previewPng';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { DeliveryPreviewCapture, deliveryPreviewPath, inspectPreviewPng } from '../src/services/storage/deliveryPreview';
import { DeliveryRepository, type DeliveryRecord } from '../src/services/storage/deliveryRepository';
import { createProjectStorage } from '../src/services/storage/projectStorage';
import { DeliveryPreviewImage } from '../src/components/inspector/DeliveryPreviewImage';
import { useProjectStore } from '../src/stores/useProjectStore';
import { useHistoryStore } from '../src/stores/useHistoryStore';
import { neutralModernTheme } from '../src/utils/themePresets';
import { buildExportRenderDocument, type PngExportOutcome } from '../src/utils/pngExporter';
import { REFERENCE_DEVICES } from '../src/utils/referenceDevice';
import { contentFingerprint } from '../src/services/ai/designWorkflow';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const pause = () => new Promise(resolve => setTimeout(resolve, 0));
const pixels = png();
const outcome = (base64 = pixels): PngExportOutcome => ({ dataUrl: `data:image/png;base64,${base64}`, engine: 'foreign-object', cssHeight: 900 });

describe('delivery first-screen previews', () => {
  let priorProject: ReturnType<typeof useProjectStore.getState>;
  let priorHistory: ReturnType<typeof useHistoryStore.getState>;
  let root: Root | undefined, host: HTMLDivElement | undefined;
  const realCapture = DeliveryPreviewCapture.capture;
  beforeEach(() => {
    priorProject = useProjectStore.getState(); priorHistory = useHistoryStore.getState();
    const store = useProjectStore.getState();
    store.initNewProject({ name: '预览工程', deviceProfile: 'pc', designSystem: neutralModernTheme, createSpecimen: false });
    store.addScreen({ name: '按钮页', htmlContent: '<main data-nid="root0001"><button data-nid="button01">提交</button></main>', position: {x:0,y:0} }, 'target');
    store.stageScreenChange('target', '<main data-nid="root0001"><button data-nid="button01">确认提交</button></main>', '新版', '修改按钮文案');
    store.setStagedRenderQuality(store.getStagedRenderContextKey(), {status:'complete', findings:[], inspected:2});
  });
  afterEach(async () => {
    if (root) act(() => root!.unmount()); host?.remove(); root = undefined; host = undefined;
    useProjectStore.getState().discardStagedChange(); await pause();
    useProjectStore.setState(priorProject, true); useHistoryStore.setState(priorHistory, true);
  });
  async function record() {
    const store = useProjectStore.getState(); expect(await store.adoptStagedChange()).toBe(true);
    return (await new DeliveryRepository(createProjectStorage(store.id), store.id).listForScreen('target')).records[0];
  }
  function mockCapture() {
    return spyOn(DeliveryPreviewCapture, 'capture').mockImplementation((r,s) => realCapture(r,s,{render:async () => outcome()}));
  }

  test('captures the saved device, imported metadata, font/image URLs and important L4 styles without embedding binary in JSON', async () => {
    const r = await record(), storage = createProjectStorage(r.projectId);
    r.settings = {...r.settings, deviceProfile:'mobile',frameWidth:390,referenceDevice:REFERENCE_DEVICES.find(d=>d.id==='mobile-standard')};
    const image = 'assets/images/lib-source-photo.png', font = `assets/imports/fonts/${'a'.repeat(64)}.woff2`;
    await storage.writeBinary(image, png(1,1)); await storage.writeBinary(font, 'dGVzdA==');
    r.assets = [{id:'photo',name:'照片',type:'image',mimeType:'image/png',source:'upload',relPath:image,refCount:1}];
    r.after = {...r.after,metadata:{navigationTitle:'自定义标题',importedHtml:{fileName:'导入.html'} as any},
      htmlContent:`<style>@font-face{font-family:Custom;src:url('${font}')}</style><main style="height:100vh"><img src="./${image}?v=1"><button data-nid="button01">确认提交</button></main>`};
    r.resultFingerprint = contentFingerprint(r.after.htmlContent);
    r.overrides = {'target:button01':{nid:'button01',declarations:{'background-image':`url('${image}')`,color:'var(--color-primary)'}}};
    let documentHtml = '';
    const preview = await realCapture(r,storage,{render:async (screen, options) => {
      expect(screen.metadata?.importedHtml?.fileName).toBe('导入.html');
      expect(screen.htmlContent).toContain('data:image/png;base64,'); expect(screen.htmlContent).toContain('data:font/woff2;base64,');
      expect(options.screenOverrides).toContain('!important'); expect(options.screenOverrides).toContain('data:image/png;base64,');
      expect(options).toMatchObject({width:390,viewportHeight:844,clipHeight:844,clipToHeight:true,scale:1,deviceProfile:'mobile'});
      documentHtml = buildExportRenderDocument(screen,options);
      return outcome(png(390,844));
    }});
    expect(preview).toMatchObject({status:'ready',width:390,height:844,candidateFingerprint:r.resultFingerprint});
    expect(documentHtml).toContain('自定义标题'); expect(documentHtml).toContain('752px');
    if (preview.status !== 'ready') throw new Error(preview.reason);
    expect(inspectPreviewPng((await storage.readBinary(preview.relPath))!)).toEqual({width:390,height:844});
    expect(JSON.stringify({...r,preview})).not.toContain('data:image/');
    expect(await realCapture(r,storage,{render:async()=>outcome(png(390,844))})).toMatchObject({status:'failed',reason:expect.stringContaining('已存在')});
    expect(await storage.exists(preview.relPath)).toBe(true);
  });

  test('rejects placeholders, broken PNG, wrong device dimensions and late timeout results without writing files', async () => {
    const r = await record(), storage = createProjectStorage(r.projectId);
    for (const value of [outcome('bm90IGEgcG5n'), {...outcome(),dataUrl:'data:image/svg+xml;base64,PHN2Zy8+'},outcome(png(1,1))]) {
      expect((await realCapture(r,storage,{render:async()=>value})).status).toBe('failed');
      expect(await storage.exists(deliveryPreviewPath(r.id))).toBe(false);
    }
    let release!: (value:PngExportOutcome)=>void;
    const pending = realCapture(r,storage,{timeoutMs:5,render:()=>new Promise(resolve=>{release=resolve;})});
    expect(await pending).toMatchObject({status:'failed',reason:expect.stringContaining('超时')});
    release(outcome()); await pause(); expect(await storage.exists(deliveryPreviewPath(r.id))).toBe(false);
  });

  test('partial image write is removed and failure is explicit; code adoption still succeeds without a renderer', async () => {
    const r = await record(), storage = createProjectStorage(r.projectId);
    expect(r.preview).toMatchObject({status:'failed',reason:expect.stringContaining('渲染视口')});
    const originalWrite = storage.writeBinary.bind(storage);
    const write = spyOn(storage,'writeBinary').mockImplementation(async (path,base64) => {
      await originalWrite(path,base64); throw new Error('disk full');
    });
    try { expect(await realCapture(r,storage,{render:async()=>outcome()})).toMatchObject({status:'failed',reason:'disk full'}); }
    finally { write.mockRestore(); }
    expect(await storage.exists(deliveryPreviewPath(r.id))).toBe(false);
  });

  test('keep-both copies L4 in the page History transaction and retains the archived image after undo', async () => {
    const store = useProjectStore.getState();
    useProjectStore.setState({overrides:{'target:button01':{nid:'button01',declarations:{color:'var(--color-primary)'}}}});
    store.setStagedRenderQuality(store.getStagedRenderContextKey(),{status:'complete',findings:[],inspected:2});
    const capture = mockCapture();
    try { expect(await store.keepBothScreens()).toBe(true); } finally { capture.mockRestore(); }
    const id = useProjectStore.getState().screenOrder.find(id=>id!=='target')!;
    const storage = createProjectStorage(store.id);
    const archived = (await new DeliveryRepository(storage,store.id).listForScreen(id)).records[0];
    expect(archived.preview?.status).toBe('ready');
    expect(useProjectStore.getState().overrides[`${id}:button01`]).toEqual(archived.overrides[`${id}:button01`]);
    useHistoryStore.getState().undo();
    expect(useProjectStore.getState().screens[id]).toBeUndefined(); expect(useProjectStore.getState().overrides[`${id}:button01`]).toBeUndefined();
    expect(await storage.exists(deliveryPreviewPath(archived.id))).toBe(true);
    useHistoryStore.getState().redo(); expect(useProjectStore.getState().overrides[`${id}:button01`]).toBeDefined();
    const files = await storage.listDir(`deliveries/screen-${contentFingerprint(id)}`);
    expect(await storage.readText(`deliveries/screen-${contentFingerprint(id)}/${files[0]}`)).not.toContain(pixels);
  });

  for (const cancel of ['discard','baseline','project'] as const) test(`late preview cannot apply after ${cancel}; unused image is removed`, async () => {
    const store = useProjectStore.getState(), storage = createProjectStorage(store.id);
    let release!: ()=>void, path='';
    const capture = spyOn(DeliveryPreviewCapture,'capture').mockImplementation(async (r,s) => {
      path=deliveryPreviewPath(r.id); await new Promise<void>(resolve=>{release=resolve;});
      return realCapture(r,s,{render:async()=>outcome()});
    });
    try {
      const pending = store.adoptStagedChange(); await pause();
      if (cancel==='discard') store.discardStagedChange();
      if (cancel==='baseline') store.updateScreen('target',{htmlContent:'<p>人工修改</p>'},'人工修改');
      if (cancel==='project') store.initNewProject({name:'新工程',deviceProfile:'pc',createSpecimen:false});
      release(); expect(await pending).toBe(false);
      expect(await storage.exists(path)).toBe(false);
      if (cancel==='project') expect(useProjectStore.getState().screenOrder).toHaveLength(0);
      else expect(useProjectStore.getState().screens.target.htmlContent).not.toContain('确认提交');
    } finally { capture.mockRestore(); }
  });

  test('archive prepare failure cleans the preview and preserves the candidate', async () => {
    const store = useProjectStore.getState(); let path='';
    const capture=spyOn(DeliveryPreviewCapture,'capture').mockImplementation((r,s)=>{path=deliveryPreviewPath(r.id);return realCapture(r,s,{render:async()=>outcome()});});
    const prepare=spyOn(DeliveryRepository.prototype,'prepare').mockRejectedValue(new Error('archive full'));
    try { expect(await store.adoptStagedChange()).toBe(false); } finally { capture.mockRestore();prepare.mockRestore(); }
    expect(useProjectStore.getState().stagedScreen).not.toBeNull(); expect(await createProjectStorage(store.id).exists(path)).toBe(false);
  });

  test('history loads previews only when opened; missing, undecodable and legacy images have visible states', async () => {
    const capture=mockCapture(); let r:DeliveryRecord;
    try { r=await record(); } finally {capture.mockRestore();}
    host=document.createElement('div');document.body.append(host);root=createRoot(host);
    await act(async()=>{root!.render(<DeliveryPreviewImage record={r} projectId={r.projectId}/>);await pause();});
    expect(host.querySelector('img')).toBeNull();
    await act(async()=>{const details=host!.querySelector('details')!;details.open=true;details.dispatchEvent(new Event('toggle'));await pause();});
    expect(host.querySelector('img')?.getAttribute('src')).toStartWith('data:image/png;base64,');
    act(()=>{host!.querySelector('img')!.dispatchEvent(new Event('error'));});expect(host.textContent).toContain('无法解码');
    await createProjectStorage(r.projectId).remove(deliveryPreviewPath(r.id));
    await act(async()=>{const details=host!.querySelector('details')!;details.open=false;details.dispatchEvent(new Event('toggle'));await pause();});
    await act(async()=>{const details=host!.querySelector('details')!;details.open=true;details.dispatchEvent(new Event('toggle'));await pause();});
    expect(host.textContent).toContain('文件缺失');
    await act(async()=>{root!.render(<DeliveryPreviewImage record={{...r,preview:undefined}} projectId={r.projectId}/>);await pause();});
    expect(host.textContent).toContain('未保存预览');
  });

  test('invalid preview paths are never read and do not hide valid historical code', async()=>{
    const r=await record(),storage=createProjectStorage(r.projectId);
    const path=`deliveries/screen-${contentFingerprint('target')}/${r.id}.json`;
    await storage.writeTextAtomic(path,JSON.stringify({...r,preview:{status:'ready',relPath:'../../outside.png'}}));
    const result=await new DeliveryRepository(storage,r.projectId).listForScreen('target');
    expect(result.invalidFiles).toBe(0);expect(result.records[0].after.htmlContent).toContain('确认提交');
    expect(result.records[0].preview).toMatchObject({status:'failed',reason:expect.stringContaining('损坏')});
  });
});
