import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { CandidateEvidencePanel } from '../src/components/canvas/CandidateEvidencePanel';
import { PagePreviewCapture, type PagePreview, type PagePreviewRequest } from '../src/services/storage/pagePreview';
import { candidatePreviewPath } from '../src/services/storage/candidatePreview';
import { loadStagedCandidate, removeStagedCandidate, saveStagedCandidate } from '../src/services/storage/candidateRepository';
import { createProjectStorage, LocalStorageStorage, type ProjectStorage } from '../src/services/storage/projectStorage';
import { DeliveryRepository } from '../src/services/storage/deliveryRepository';
import { useProjectStore } from '../src/stores/useProjectStore';
import { useHistoryStore } from '../src/stores/useHistoryStore';
import { neutralModernTheme } from '../src/utils/themePresets';
import { readProject } from '../src/utils/projectRegistry';
import { png } from './helpers/previewPng';
import { contentFingerprint } from '../src/services/ai/designWorkflow';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const baseline = '<main data-nid="root0001"><button data-nid="button01">提交</button></main>';
const changed = baseline.replace('>提交<', '>确认提交<');
const clean = { status:'complete' as const, findings:[], inspected:2 };
const pause = () => new Promise(resolve=>setTimeout(resolve,0));
const pixels = png();
const realCapture = PagePreviewCapture.capture;
const renderer = async () => ({dataUrl:`data:image/png;base64,${pixels}`,engine:'foreign-object' as const,cssHeight:900});
const captureReal = (r:PagePreviewRequest,s:ProjectStorage,d?:Parameters<typeof realCapture>[2])=>realCapture(r,s,{...d,render:renderer});
async function settle() { await pause(); await loadStagedCandidate(useProjectStore.getState().id); await pause(); }
function complete() { const store=useProjectStore.getState();store.setStagedRenderQuality(store.getStagedRenderContextKey(),clean); }

describe('unadopted candidate previews',()=>{
  let priorProject:ReturnType<typeof useProjectStore.getState>,priorHistory:ReturnType<typeof useHistoryStore.getState>;
  let root:Root|undefined,host:HTMLDivElement|undefined;
  beforeEach(()=>{
    priorProject=useProjectStore.getState();priorHistory=useHistoryStore.getState();
    const store=useProjectStore.getState();
    store.initNewProject({name:'候选预览',deviceProfile:'pc',designSystem:neutralModernTheme,createSpecimen:false});
    store.addScreen({name:'提交页',htmlContent:baseline,position:{x:0,y:0}},'target');
    store.stageScreenChange('target',changed,'候选页','修改文案');
  });
  afterEach(async()=>{
    if(root)act(()=>root!.unmount());host?.remove();root=undefined;host=undefined;
    useProjectStore.getState().discardStagedChange();await settle();
    useProjectStore.setState(priorProject,true);useHistoryStore.setState(priorHistory,true);
  });
  async function panel() {
    host=document.createElement('div');document.body.append(host);root=createRoot(host);
    await act(async()=>{root!.render(<CandidateEvidencePanel current={useProjectStore.getState().stagedValidationEvidence}/>);await pause();});
    await act(async()=>{const details=host!.querySelector('details')!;details.open=true;details.dispatchEvent(new Event('toggle'));await pause();});
  }

  test('waits for actual render completion, deduplicates reports, and keeps latest evidence with binary outside JSON and History',async()=>{
    const store=useProjectStore.getState(),capture=spyOn(PagePreviewCapture,'capture').mockImplementation(captureReal);
    try{
      await settle();expect(capture).not.toHaveBeenCalled();
      const count=useHistoryStore.getState().past.length;
      complete();complete();await settle();
      expect(capture).toHaveBeenCalledTimes(1);
      const first=(await loadStagedCandidate(store.id))!;
      expect(first.preview).toMatchObject({status:'ready',width:1440,height:900});
      store.setStagedRenderQuality(store.getStagedRenderContextKey(),{...clean,findings:[{code:'render_contrast',severity:'warning',message:'最新检查',actual:'3:1',expected:'4.5:1'}]});
      await settle();const latest=(await loadStagedCandidate(store.id))!;
      expect(capture).toHaveBeenCalledTimes(1);expect(latest.preview).toEqual(first.preview);
      expect(latest.validationEvidence?.render?.findings[0].message).toBe('最新检查');
      expect(JSON.stringify(latest)).not.toContain(pixels);expect(readProject(store.id)).not.toContain('candidate-preview-');
      expect(useHistoryStore.getState().past).toHaveLength(count);
    }finally{capture.mockRestore();}
  });

  test('reopened preview is historical and cannot satisfy the live gate; a fresh capture replaces and cleans the previous image',async()=>{
    const store=useProjectStore.getState(),capture=spyOn(PagePreviewCapture,'capture').mockImplementation(captureReal);
    try{
      complete();await settle();const archived=(await loadStagedCandidate(store.id))!;
      if(archived.preview?.status!=='ready')throw new Error('missing fixture preview');
      const oldPath=archived.preview.relPath,storage=createProjectStorage(store.id);
      // A fresh application may reproduce the same render key; history still cannot count as a new capture.
      useProjectStore.setState({stagedRenderRevision:useProjectStore.getState().stagedRenderRevision-1});
      store.loadProject(readProject(store.id)!);store.restoreStagedCandidate(archived,store.id);await settle();
      expect(archived.preview.contextFingerprint).toBe(contentFingerprint(store.getStagedRenderContextKey()));
      expect(useProjectStore.getState().stagedRenderQuality).toBeNull();expect(await store.adoptStagedChange()).toBe(false);
      expect(store.getStagedDeliveryReport().status).toBe('pending');
      await panel();expect(host!.textContent).toContain('历史图片');expect(host!.textContent).toContain('不用于本次采纳');
      expect(host!.querySelector('img')?.getAttribute('src')).toStartWith('data:image/png;base64,');
      act(()=>complete());await act(async()=>{await settle();});
      const next=(await loadStagedCandidate(store.id))!;
      expect(next.preview?.status).toBe('ready');if(next.preview?.status!=='ready')return;
      expect(next.preview.relPath).not.toBe(oldPath);expect(await storage.exists(oldPath)).toBe(false);
      expect(await storage.exists(next.preview.relPath)).toBe(true);
    }finally{capture.mockRestore();}
  });

  test('navigation/import metadata changes invalidate the render key and preserve the old image until a new capture is saved',async()=>{
    const store=useProjectStore.getState(),capture=spyOn(PagePreviewCapture,'capture').mockImplementation(captureReal);
    try{
      complete();await settle();const first=(await loadStagedCandidate(store.id))!.preview!;
      if(first.status!=='ready')throw new Error('missing fixture');
      const oldKey=store.getStagedRenderContextKey();
      store.updateScreen('target',{metadata:{navigationTitle:'新的导航标题'}},'调整导航标题');
      expect(store.getStagedRenderContextKey()).not.toBe(oldKey);
      await store.captureStagedPreview();expect(capture).toHaveBeenCalledTimes(1);
      store.recordStagedValidationEvidence();await settle();expect(await createProjectStorage(store.id).exists(first.relPath)).toBe(true);
      complete();await settle();expect(capture).toHaveBeenCalledTimes(2);
      expect(capture.mock.calls[1][0].screen.metadata?.navigationTitle).toBe('新的导航标题');
      expect(await createProjectStorage(store.id).exists(first.relPath)).toBe(false);
    }finally{capture.mockRestore();}
  });

  test('a failed preview is saved once and explicit retry recovers it without changing delivery readiness',async()=>{
    const store=useProjectStore.getState();let release!:()=>void;
    const capture=spyOn(PagePreviewCapture,'capture').mockRejectedValueOnce(new Error('render offline')).mockImplementation(async(r,s,d)=>{
      await new Promise<void>(resolve=>{release=resolve;});return captureReal(r,s,d);
    });
    try{
      complete();await settle();expect((await loadStagedCandidate(store.id))?.preview).toMatchObject({status:'failed',reason:'render offline'});
      complete();await settle();expect(capture).toHaveBeenCalledTimes(1);expect(store.getStagedDeliveryReport().status).toBe('ready');
      const retry=store.captureStagedPreview(true);await store.captureStagedPreview(true);expect(capture).toHaveBeenCalledTimes(2);
      release();await retry;await settle();expect((await loadStagedCandidate(store.id))?.preview?.status).toBe('ready');
    }finally{capture.mockRestore();}
  });

  for(const action of ['discard','replace','switch','adopt'] as const)test(`late capture after ${action} cannot revive the old candidate or delete a newer preview`,async()=>{
    const store=useProjectStore.getState(),oldId=store.id,storage=createProjectStorage(oldId);
    let release!:()=>void,oldPath='';let first=true;
    const capture=spyOn(PagePreviewCapture,'capture').mockImplementation(async(r,s,d)=>{
      if(!first)return captureReal(r,s,d);first=false;oldPath=r.relPath;
      await new Promise<void>(resolve=>{release=resolve;});
      // Simulate an uncooperative renderer finishing after cancellation; the store must still reject it.
      return captureReal(r,s);
    });
    try{
      complete();await settle();
      if(action==='discard')store.discardStagedChange();
      if(action==='replace'){store.stageScreenChange('target',changed.replace('确认提交','下一版本'),'下个候选');complete();await settle();}
      if(action==='switch')store.initNewProject({name:'另一工程',deviceProfile:'pc',createSpecimen:false});
      if(action==='adopt')expect(await store.adoptStagedChange()).toBe(true);
      const next=useProjectStore.getState().stagedScreen;
      release();await settle();expect(await storage.exists(oldPath)).toBe(false);
      if(action==='replace'){
        expect(useProjectStore.getState().stagedScreen).toBe(next);
        const candidate=(await loadStagedCandidate(oldId))!;expect(candidate.screenName).toBe('下个候选');
        if(candidate.preview?.status!=='ready')throw new Error('new preview missing');expect(await storage.exists(candidate.preview.relPath)).toBe(true);
      }else{
        expect(useProjectStore.getState().stagedScreen).toBeNull();
        if(action!=='switch')expect(await loadStagedCandidate(oldId)).toBeNull();
      }
      if(action==='adopt'){
        const record=(await new DeliveryRepository(storage,oldId).listForScreen('target')).records[0];
        expect(record.candidate.preview).toBeUndefined();expect(record.preview?.status).toBe('ready');
      }
    }finally{capture.mockRestore();}
  });

  test('discard cleans the referenced image; conditional cleanup never deletes the newer candidate image',async()=>{
    const store=useProjectStore.getState(),capture=spyOn(PagePreviewCapture,'capture').mockImplementation(captureReal),storage=createProjectStorage(store.id);
    try{
      complete();await settle();const first=(await loadStagedCandidate(store.id))!;
      store.stageScreenChange('target',changed,'第二候选');complete();await settle();const next=(await loadStagedCandidate(store.id))!;
      if(first.preview?.status!=='ready'||next.preview?.status!=='ready')throw new Error('fixture');
      expect(await storage.exists(first.preview.relPath)).toBe(false);
      await removeStagedCandidate(store.id,undefined,first);
      expect((await loadStagedCandidate(store.id))?.candidateId).toBe(next.candidateId);expect(await storage.exists(next.preview.relPath)).toBe(true);
      store.discardStagedChange();await settle();expect(await storage.exists(next.preview.relPath)).toBe(false);
    }finally{capture.mockRestore();}
  });

  test('failed atomic sidecar write cleans the new PNG and preserves the editable candidate with a visible retry state',async()=>{
    const store=useProjectStore.getState(),storage=createProjectStorage(store.id);await settle();
    let previewPath='';
    const originalWrite=LocalStorageStorage.prototype.writeTextAtomic;
    const write=spyOn(LocalStorageStorage.prototype,'writeTextAtomic').mockImplementation(async function(path,text){
      if(path==='candidates/current.json'&&JSON.parse(text).candidate.preview?.status==='ready')throw new Error('sidecar full');
      return originalWrite.call(this,path,text);
    });
    const capture=spyOn(PagePreviewCapture,'capture').mockImplementation(async(r,s,d)=>{previewPath=r.relPath;return captureReal(r,s,d);});
    try{
      complete();await settle();expect(useProjectStore.getState().stagedCandidateSaveStatus).toBe('failed');
      expect(useProjectStore.getState().stagedScreen?.newHtml).toBe(changed);expect(await storage.exists(previewPath)).toBe(false);
      write.mockRestore();await store.captureStagedPreview(true);await settle();expect((await loadStagedCandidate(store.id))?.preview?.status).toBe('ready');
    }finally{write.mockRestore();capture.mockRestore();}
  });

  test('corrupt or foreign preview paths remain diagnostics and are never deleted or used as a live gate',async()=>{
    const store=useProjectStore.getState();await settle();const storage=createProjectStorage(store.id);
    const raw=JSON.parse((await storage.readText('candidates/current.json'))!);
    const foreign=candidatePreviewPath(`${raw.candidate.candidateId}-another`);await storage.writeBinary(foreign,pixels);
    raw.candidate.preview={status:'ready',scope:'first-screen',capturedAt:Date.now(),candidateFingerprint:contentFingerprint(changed),contextFingerprint:'x',relPath:foreign,width:1440,height:900,engine:'foreign-object'};
    await storage.writeTextAtomic('candidates/current.json',JSON.stringify(raw));
    const restored=(await loadStagedCandidate(store.id))!;
    expect(restored.newHtml).toBe(changed);expect(restored.preview).toMatchObject({status:'failed',reason:expect.stringContaining('损坏')});
    store.discardStagedChange();await settle();expect(await storage.exists(foreign)).toBe(true);
  });
});
