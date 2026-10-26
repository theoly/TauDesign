import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { CandidateEvidencePanel } from '../src/components/canvas/CandidateEvidencePanel';
import { useProjectStore } from '../src/stores/useProjectStore';
import { useHistoryStore } from '../src/stores/useHistoryStore';
import { loadStagedCandidate } from '../src/services/storage/candidateRepository';
import { createProjectStorage, LocalStorageStorage } from '../src/services/storage/projectStorage';
import { neutralModernTheme } from '../src/utils/themePresets';
import { readProject } from '../src/utils/projectRegistry';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const baseline = '<main data-nid="root0001"><button data-nid="action01">提交</button></main>';
const candidate = '<main data-nid="root0001"><button data-nid="action01">确认提交</button></main>';
const clean = { status: 'complete' as const, findings: [], inspected: 2 };
const pause = () => new Promise(resolve => setTimeout(resolve, 0));

describe('candidate validation evidence', () => {
  let priorProject: ReturnType<typeof useProjectStore.getState>;
  let priorHistory: ReturnType<typeof useHistoryStore.getState>;
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;
  beforeEach(() => {
    priorProject = useProjectStore.getState(); priorHistory = useHistoryStore.getState();
    const store = useProjectStore.getState();
    store.initNewProject({ name: '验收证据', deviceProfile: 'pc', designSystem: neutralModernTheme, createSpecimen: false });
    store.addScreen({ name: '目标页', htmlContent: baseline, position: { x: 0, y: 0 } }, 'target');
  });
  afterEach(async () => {
    if (root) act(() => root!.unmount());
    container?.remove(); root = undefined; container = undefined;
    const store = useProjectStore.getState();
    store.discardStagedChange(); await loadStagedCandidate(store.id);
    useProjectStore.setState(priorProject, true); useHistoryStore.setState(priorHistory, true);
  });

  test('archives actual render findings and full project file scope without blocking on unrelated files', async () => {
    const store = useProjectStore.getState();
    useProjectStore.setState({ assets: { other: { id: 'other', name: '其它页图片', type: 'image', mimeType: 'image/png', source: 'upload', relPath: 'assets/images/other.png', refCount: 1 } } });
    store.addScreen({ name: '其它页', htmlContent: '<img src="assets/images/other.png">', position: { x: 100, y: 0 } }, 'other-page');
    store.stageScreenChange('target', candidate, '候选');
    const findings = [{ code: 'render_contrast', severity: 'warning' as const, message: '测试对比度记录', actual: '3:1', expected: '4.5:1' }];
    store.setStagedRenderQuality(store.getStagedRenderContextKey(), { ...clean, findings });
    await pause();
    const archived = await loadStagedCandidate(store.id);
    const evidence = archived!.validationEvidence!;
    expect(evidence.render).toEqual({ ...clean, findings });
    expect(evidence.projectAssets).toMatchObject({ screenCount: 2, files: [{ id: 'other', relPath: 'assets/images/other.png' }] });
    expect(evidence.projectAssets!.issues[0]).toMatchObject({ code: 'missing_asset_file', entityId: 'other' });
    expect(evidence.source.passed).toBe(true);
    expect(evidence.delivery.status).toBe('ready');
    expect(evidence.viewport).toMatchObject({ profile: 'pc', width: 1440 });
    expect(readProject(store.id)).not.toContain('测试对比度记录');
    container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
    act(() => root!.render(<CandidateEvidencePanel current={evidence} />));
    expect(container.textContent).toContain('其它页图片');
    expect(container.textContent).toContain('assets/images/other.png');
    expect(container.textContent).toContain('测试对比度记录');
  });

  test('restored evidence remains historical and cannot satisfy the fresh render gate', async () => {
    const store = useProjectStore.getState();
    store.stageScreenChange('target', candidate, '候选');
    store.setStagedRenderQuality(store.getStagedRenderContextKey(), clean);
    await pause();
    const archived = (await loadStagedCandidate(store.id))!;
    expect(archived.validationEvidence!.delivery.status).toBe('ready');
    store.loadProject(readProject(store.id)!);
    store.restoreStagedCandidate(archived, store.id);
    expect(useProjectStore.getState().stagedRenderQuality).toBeNull();
    await store.adoptStagedChange();
    expect(useProjectStore.getState().screens.target.htmlContent).toBe(baseline);
    await pause();
    const current = useProjectStore.getState().stagedValidationEvidence!;
    expect(current.delivery.status).toBe('pending');
    expect(current.render).toBeUndefined();
    expect(useProjectStore.getState().stagedScreen!.validationEvidence!.render!.status).toBe('complete');
    container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
    act(() => root!.render(<CandidateEvidencePanel current={current} historical={archived.validationEvidence} />));
    expect(container.textContent).toContain('上次存档记录（须重新验证）');
    expect(container.textContent).toContain('历史报告仅供回溯，不用于本次采纳');
  });

  test('malformed or mismatched historical evidence is ignored while the candidate remains recoverable', async () => {
    const store = useProjectStore.getState();
    store.stageScreenChange('target', candidate, '候选'); await pause();
    await loadStagedCandidate(store.id);
    const storage = createProjectStorage(store.id);
    const saved = JSON.parse((await storage.readText('candidates/current.json'))!);
    saved.candidate.validationEvidence.render = { status: 'complete', findings: null, inspected: 1 };
    await storage.writeTextAtomic('candidates/current.json', JSON.stringify(saved));
    expect((await loadStagedCandidate(store.id))?.validationEvidence).toBeUndefined();
    delete saved.candidate.validationEvidence.render;
    saved.candidate.validationEvidence.candidateFingerprint = 'different';
    await storage.writeTextAtomic('candidates/current.json', JSON.stringify(saved));
    expect((await loadStagedCandidate(store.id))?.newHtml).toBe(candidate);
    expect((await loadStagedCandidate(store.id))?.validationEvidence).toBeUndefined();
  });

  test('late project audits cannot replace evidence for the next candidate', async () => {
    const store = useProjectStore.getState();
    const path = 'assets/images/delayed.png';
    useProjectStore.setState({ assets: { delayed: { id: 'delayed', name: '延迟资源', type: 'image', mimeType: 'image/png', source: 'upload', relPath: path, refCount: 1 } } });
    let release!: (value: boolean) => void;
    let calls = 0;
    const exists = spyOn(LocalStorageStorage.prototype, 'exists').mockImplementation(async () => {
      if (++calls === 1) return new Promise<boolean>(resolve => { release = resolve; });
      return false;
    });
    try {
      store.stageScreenChange('target', `${candidate}<img src="${path}">`, '第一候选');
      store.stageScreenChange('target', candidate, '第二候选');
      store.setStagedRenderQuality(store.getStagedRenderContextKey(), clean);
      await pause();
      const current = useProjectStore.getState().stagedValidationEvidence;
      release(true); await pause();
      expect(useProjectStore.getState().stagedValidationEvidence).toBe(current);
      expect((await loadStagedCandidate(store.id))?.screenName).toBe('第二候选');
      expect((await loadStagedCandidate(store.id))?.validationEvidence?.projectAssets?.issues[0].code).toBe('missing_asset_file');
    } finally { exists.mockRestore(); }
  });
});
