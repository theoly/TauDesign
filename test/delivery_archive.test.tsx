import {resourceRenderReport,stageResourceReport} from './helpers/renderResourceProof';
import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { DeliveryHistoryPanel } from '../src/components/inspector/DeliveryHistoryPanel';
import { DeliveryRepository } from '../src/services/storage/deliveryRepository';
import { createProjectStorage } from '../src/services/storage/projectStorage';
import { loadStagedCandidate } from '../src/services/storage/candidateRepository';
import { contentFingerprint } from '../src/services/ai/designWorkflow';
import { useProjectStore } from '../src/stores/useProjectStore';
import { useHistoryStore } from '../src/stores/useHistoryStore';
import { neutralModernTheme } from '../src/utils/themePresets';
import { readProject } from '../src/utils/projectRegistry';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const before = '<main data-nid="root0001"><button data-nid="action01">提交</button></main>';
const after = '<main data-nid="root0001"><button data-nid="action01">确认提交</button></main>';
const pause = () => new Promise(resolve => setTimeout(resolve, 0));
const ready = () => {
  const store = useProjectStore.getState();
  store.setStagedRenderQuality(store.getStagedRenderContextKey(), { status: 'complete', findings: [], inspected: 2 });
};

describe('durable delivery archive', () => {
  let priorProject: ReturnType<typeof useProjectStore.getState>;
  let priorHistory: ReturnType<typeof useHistoryStore.getState>;
  let root: Root | undefined;
  let host: HTMLDivElement | undefined;
  beforeEach(() => {
    priorProject = useProjectStore.getState(); priorHistory = useHistoryStore.getState();
    const store = useProjectStore.getState();
    store.initNewProject({ name: '长期交付', deviceProfile: 'pc', designSystem: neutralModernTheme, createSpecimen: false });
    store.addScreen({ name: '提交页', htmlContent: before, position: { x: 0, y: 0 } }, 'target');
    store.stageScreenChange('target', after, '新提交页', '修改提交文案', undefined,
      { source: 'model', rawResponse: 'RAW_DELIVERY_MARKER', completeHtml: after, continuationCount: 0, warnings: [] });
    ready();
  });
  afterEach(async () => {
    if (root) act(() => root!.unmount()); host?.remove(); root = undefined; host = undefined;
    const state = useProjectStore.getState(); state.discardStagedChange(); await loadStagedCandidate(state.id);
    useProjectStore.setState(priorProject, true); useHistoryStore.setState(priorHistory, true);
  });
  const repository = () => { const state = useProjectStore.getState(); return new DeliveryRepository(createProjectStorage(state.id), state.id); };

  test('records request, both versions and evidence; undo/redo does not erase the historical event', async () => {
    const store = useProjectStore.getState();
    expect(await store.adoptStagedChange()).toBe(true);
    const result = await repository().listForScreen('target');
    expect(result.records).toHaveLength(1);
    expect(result.records[0]).toMatchObject({ status: 'applied', mode: 'replace', before: { htmlContent: before }, after: { htmlContent: after },
      candidate: { modificationRequest: '修改提交文案', executionRecord: { rawResponse: 'RAW_DELIVERY_MARKER' }, validationEvidence: { render: { status: 'complete' } } } });
    expect(await loadStagedCandidate(store.id)).toBeNull();
    expect(readProject(store.id)).not.toContain('RAW_DELIVERY_MARKER');
    useHistoryStore.getState().undo();
    expect(useProjectStore.getState().screens.target.htmlContent).toBe(before);
    expect((await repository().listForScreen('target')).records[0].status).toBe('applied');
    useHistoryStore.getState().redo();
    expect(useProjectStore.getState().screens.target.htmlContent).toBe(after);
    host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
    await act(async () => { root!.render(<DeliveryHistoryPanel projectId={store.id} screen={useProjectStore.getState().screens.target} revision={1} />); await pause(); });
    expect(host.textContent).toContain('已应用');
    expect(host.textContent).toContain('修改提交文案');
    expect(host.textContent).toContain('当前 HTML/CSS 与此交付版本一致');
  });

  test('archive write failure preserves original, candidate and history', async () => {
    const store = useProjectStore.getState(); const historyCount = useHistoryStore.getState().past.length;
    const prepare = spyOn(DeliveryRepository.prototype, 'prepare').mockRejectedValue(new Error('disk full'));
    try {
      expect(await store.adoptStagedChange()).toBe(false);
      expect(useProjectStore.getState().screens.target.htmlContent).toBe(before);
      expect(useProjectStore.getState().stagedScreen).not.toBeNull();
      expect(useProjectStore.getState().stagedAdoptionError).toBe('disk full');
      expect(useHistoryStore.getState().past).toHaveLength(historyCount);
    } finally { prepare.mockRestore(); }
  });

  test('second click is ignored; a baseline edit during archive preparation prevents delayed application', async () => {
    const store = useProjectStore.getState(); const realPrepare = DeliveryRepository.prototype.prepare;
    let release!: () => void;
    const prepare = spyOn(DeliveryRepository.prototype, 'prepare').mockImplementation(async function(record) {
      await realPrepare.call(this, record); await new Promise<void>(resolve => { release = resolve; });
    });
    try {
      const pending = store.adoptStagedChange();
      expect(await store.keepBothScreens()).toBe(false);
      await pause();
      expect(useProjectStore.getState().screens.target.htmlContent).toBe(before);
      store.updateScreen('target', { htmlContent: before + '<p>人工变更</p>' }, '人工变更');
      release(); expect(await pending).toBe(false);
      expect(useProjectStore.getState().screens.target.htmlContent).toContain('人工变更');
      expect((await repository().listForScreen('target')).records[0].status).toBe('aborted');
      expect(useProjectStore.getState().stagedAdoptionError).toContain('已变化');
    } finally { prepare.mockRestore(); }
  });

  test('switching projects while saving never applies the old candidate to the new project', async () => {
    const store = useProjectStore.getState(); const oldId = store.id; const realPrepare = DeliveryRepository.prototype.prepare;
    let release!: () => void;
    const prepare = spyOn(DeliveryRepository.prototype, 'prepare').mockImplementation(async function(record) {
      await realPrepare.call(this, record); await new Promise<void>(resolve => { release = resolve; });
    });
    try {
      const pending = store.adoptStagedChange(); await pause();
      store.initNewProject({ name: '另一个工程', deviceProfile: 'pc', designSystem: neutralModernTheme, createSpecimen: false });
      release(); expect(await pending).toBe(false);
      expect(useProjectStore.getState().screenOrder).toHaveLength(0);
      expect((await new DeliveryRepository(createProjectStorage(oldId), oldId).listForScreen('target')).records[0].status).toBe('aborted');
      expect(useProjectStore.getState().stagedAdoptionError).toBeNull();
    } finally { prepare.mockRestore(); }
  });

  test('discarding while saving cancels the delivery without changing history', async () => {
    const store = useProjectStore.getState(); const realPrepare = DeliveryRepository.prototype.prepare;
    const count = useHistoryStore.getState().past.length;
    let release!: () => void;
    const prepare = spyOn(DeliveryRepository.prototype, 'prepare').mockImplementation(async function(record) {
      await realPrepare.call(this, record); await new Promise<void>(resolve => { release = resolve; });
    });
    try {
      const pending = store.adoptStagedChange(); await pause();
      store.discardStagedChange(); release();
      expect(await pending).toBe(false);
      expect(useProjectStore.getState().screens.target.htmlContent).toBe(before);
      expect(useProjectStore.getState().stagedScreen).toBeNull();
      expect(useHistoryStore.getState().past).toHaveLength(count);
      expect((await repository().listForScreen('target')).records[0].status).toBe('aborted');
    } finally { prepare.mockRestore(); }
  });

  test('the actual click rechecks files even if the earlier file audit passed', async () => {
    const store = useProjectStore.getState(); const path = 'assets/images/click-check.png';
    const storage = createProjectStorage(store.id);
    await storage.writeBinary(path, 'dGVzdA==');
    useProjectStore.setState({ assets: { photo: { id: 'photo', name: '页面图片', type: 'image', mimeType: 'image/png', source: 'upload', relPath: path, refCount: 1 } } });
    store.stageScreenChange('target', `${after}<img src="${path}" alt="页面图片">`, '图片候选'); ready(); await pause();
    expect(store.getStagedDeliveryReport().checks.find(check => check.id === 'asset_files')?.status).toBe('passed');
    await storage.remove(path);
    expect(await store.adoptStagedChange()).toBe(false);
    expect(useProjectStore.getState().screens.target.htmlContent).toBe(before);
    expect(useProjectStore.getState().stagedAdoptionError).toContain('不存在');
    expect((await repository().listForScreen('target')).records).toHaveLength(0);
  });

  for(const mode of ['replace','force-replace','keep-both'] as const)test(`resource removed after archive prepare blocks ${mode} without page/history changes`,async()=>{
    const state=useProjectStore.getState(),path='assets/images/final-check.png',storage=createProjectStorage(state.id);
    await storage.writeBinary(path,'dGVzdA==');state.addAsset({id:'final-photo',name:'最终资源',type:'image',mimeType:'image/png',source:'upload',relPath:path,refCount:1});
    state.stageScreenChange('target',`${after}<img src="${path}" alt="最终资源">`,'最终候选');await stageResourceReport();await pause();
    const historyCount=useHistoryStore.getState().past.length,checkpoints=useHistoryStore.getState().checkpoints.length,candidate=useProjectStore.getState().stagedScreen;
    const originalPrepare=DeliveryRepository.prototype.prepare;let recordId='',screenId='';
    const prepare=spyOn(DeliveryRepository.prototype,'prepare').mockImplementation(async function(record){await originalPrepare.call(this,record);recordId=record.id;screenId=record.after.id;await storage.remove(path);});
    try{
      expect(await state.commitStagedDelivery(mode)).toBe(false);expect(useProjectStore.getState().screens.target.htmlContent).toBe(before);
      expect(useProjectStore.getState().screenOrder).toEqual(['target']);expect(useProjectStore.getState().stagedScreen).toBe(candidate);
      expect(useHistoryStore.getState().past.length).toBe(historyCount);expect(useHistoryStore.getState().checkpoints.length).toBe(checkpoints);
      expect(useProjectStore.getState().stagedAdoptionError).toContain('不存在');
      const record=await repository().get(screenId,recordId);expect(record?.status).toBe('aborted');
    }finally{prepare.mockRestore();}
  });

  test('font-only adoption archives its actual read evidence before a pending background audit',async()=>{
    const state=useProjectStore.getState(),font=`assets/imports/fonts/${'a'.repeat(64)}.woff2`,storage=createProjectStorage(state.id);
    await storage.writeBinary(font,'dGVzdA==');state.updateScreen('target',{scopedCss:`@font-face{font-family:Imported;src:url(${font})}`},'添加字体');
    state.addScreen({name:'其它页面',htmlContent:'<main>其它页面</main>'},'other');
    const prototype=Object.getPrototypeOf(storage),actualRead=prototype.readBinary;let first=true,release!:()=>void,entered!:()=>void;
    const started=new Promise<void>(resolve=>entered=resolve);
    const read=spyOn(prototype,'readBinary').mockImplementation(async function(path:string){
      if(path===font&&first){first=false;entered();await new Promise<void>(resolve=>release=resolve);}
      return actualRead.call(this,path);
    });
    try{
      state.stageScreenChange('target',after,'字体候选');await started;await stageResourceReport();
      expect(useProjectStore.getState().stagedProjectAssetAudit).toBeNull();expect(await state.adoptStagedChange()).toBe(true);
      const record=(await repository().listForScreen('target')).records[0];
      expect(record.candidate.validationEvidence?.projectAssets?.files.map(f=>f.relPath)).toContain(font);
      expect(record.candidate.validationEvidence?.projectAssets?.screenCount).toBe(1);
    }finally{release?.();await pause();read.mockRestore();}
  });

  test('late delivery cleanup cannot delete a newer candidate', async () => {
    const store = useProjectStore.getState(); const realFinish = DeliveryRepository.prototype.finish;
    let release!: () => void;
    const finish = spyOn(DeliveryRepository.prototype, 'finish').mockImplementation(async function(record, status, reason) {
      if (status === 'applied') await new Promise<void>(resolve => { release = resolve; });
      await realFinish.call(this, record, status, reason);
    });
    try {
      const pending = store.adoptStagedChange(); await pause();
      expect(useProjectStore.getState().stagedScreen).toBeNull();
      store.stageScreenChange('target', after.replace('确认提交', '下一版本'), '下一候选');
      const nextId = useProjectStore.getState().stagedScreen!.candidateId;
      release(); expect(await pending).toBe(true);
      expect((await loadStagedCandidate(store.id))?.candidateId).toBe(nextId);
    } finally { finish.mockRestore(); }
  });

  test('keep-both and force modes retain their actual outcome and guard findings', async () => {
    const store = useProjectStore.getState();
    expect(await store.keepBothScreens()).toBe(true);
    const newId = useProjectStore.getState().screenOrder.find(id => id !== 'target')!;
    expect(useProjectStore.getState().screens.target.htmlContent).toBe(before);
    expect((await repository().listForScreen(newId)).records[0]).toMatchObject({ mode: 'keep-both', status: 'applied', after: { id: newId } });
    store.stageScreenChange('target', '<main data-nid="root0001"></main>', '强制候选', '调整布局'); ready();
    expect(await store.forceAdoptStagedChange()).toBe(true);
    expect((await repository().listForScreen('target')).records[0]).toMatchObject({ mode: 'force-replace', candidate: { validationEvidence: { quality: { passed: false } } } });
  });

  test('failed finalization retains a prepared archive; corrupt records do not hide good records', async () => {
    const store = useProjectStore.getState();
    const finish = spyOn(DeliveryRepository.prototype, 'finish').mockRejectedValue(new Error('disk offline'));
    try { expect(await store.adoptStagedChange()).toBe(true); } finally { finish.mockRestore(); }
    expect(useProjectStore.getState().screens.target.htmlContent).toBe(after);
    expect(useProjectStore.getState().deliveryArchiveNotice).toContain('准备记录已保留');
    const storage = createProjectStorage(store.id);
    await storage.writeTextAtomic(`deliveries/screen-${contentFingerprint('target')}/delivery-zzzz-broken.json`, '{bad');
    const result = await repository().listForScreen('target');
    expect(result.records[0].status).toBe('prepared');
    expect(result.invalidFiles).toBe(1);
  });
});
