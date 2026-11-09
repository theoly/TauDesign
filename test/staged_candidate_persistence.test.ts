import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { useProjectStore } from '../src/stores/useProjectStore';
import { useHistoryStore } from '../src/stores/useHistoryStore';
import { useWorkspaceStore } from '../src/stores/useWorkspaceStore';
import { createProjectStorage } from '../src/services/storage/projectStorage';
import { loadStagedCandidate, removeStagedCandidate, saveStagedCandidate } from '../src/services/storage/candidateRepository';
import { buildDesignTaskContract } from '../src/services/ai/designWorkflow';
import { neutralModernTheme } from '../src/utils/themePresets';
import { readProject } from '../src/utils/projectRegistry';

const original = '<main data-nid="root0001"><button data-nid="button01">旧文案</button></main>';
const changed = '<main data-nid="root0001"><button data-nid="button01">新文案</button></main>';

describe('staged candidate sidecar', () => {
  let priorProject: ReturnType<typeof useProjectStore.getState>;
  let priorHistory: ReturnType<typeof useHistoryStore.getState>;
  let priorWorkspace: ReturnType<typeof useWorkspaceStore.getState>;
  beforeEach(() => {
    priorProject = useProjectStore.getState();
    priorHistory = useHistoryStore.getState();
    priorWorkspace = useWorkspaceStore.getState();
  });
  afterEach(() => {
    useProjectStore.setState(priorProject, true);
    useHistoryStore.setState(priorHistory, true);
    useWorkspaceStore.setState(priorWorkspace, true);
  });

  test('restores HTML, task snapshot and execution record, but reruns render evidence', async () => {
    const store = useProjectStore.getState();
    const id = store.initNewProject({ name: '候选工程', deviceProfile: 'pc', designSystem: neutralModernTheme, createSpecimen: false });
    store.addScreen({ name: '页面', htmlContent: original, position: { x: 0, y: 0 } }, 'target');
    const contract = buildDesignTaskContract({ intent: 'modify_screen', request: '修改文案', target: { id: 'target', name: '页面', htmlContent: original },
      deviceProfile: 'pc', frameWidth: 1440, designSystem: neutralModernTheme });
    store.stageScreenChange('target', changed, '页面新版', '修改文案', contract,
      { source: 'model', rawResponse: changed, completeHtml: changed, continuationCount: 0, warnings: [] });
    const archived = await loadStagedCandidate(id);
    expect(archived?.workflowContract?.taskId).toBe(contract.taskId);
    expect(archived?.executionRecord?.rawResponse).toBe(changed);
    await useProjectStore.getState().saveProjectChecked();
    expect(readProject(id)).not.toContain(changed);
    store.setStagedRenderQuality(store.getStagedRenderContextKey(), { status: 'complete', findings: [], inspected: 2 });
    expect(useProjectStore.getState().stagedRenderQuality?.report.status).toBe('complete');
    await store.loadProjectById(id);
    expect(useProjectStore.getState().stagedScreen).toBeNull();
    expect(useProjectStore.getState().restoreStagedCandidate(archived!, id)).toBe(true);
    expect(useProjectStore.getState().stagedScreen?.newHtml).toBe(changed);
    expect(useProjectStore.getState().stagedRenderQuality).toBeNull();
    expect(useProjectStore.getState().getStagedDeliveryReport().status).toBe('pending');
    useProjectStore.getState().updateScreen('target', { htmlContent: original.replace('旧文案', '其它文案') });
    expect(useProjectStore.getState().isStagedTaskCurrent()).toBe(false);
    expect(useProjectStore.getState().getStagedDeliveryReport().status).toBe('blocked');
    store.discardStagedChange();
    expect(await loadStagedCandidate(id)).toBeNull();
  });

  test('immediate discard wins over an in-flight save; malformed or foreign files are ignored', async () => {
    const store = useProjectStore.getState();
    const id = store.initNewProject({ name: '并发候选', deviceProfile: 'pc', designSystem: neutralModernTheme, createSpecimen: false });
    store.addScreen({ name: '页面', htmlContent: original, position: { x: 0, y: 0 } }, 'target');
    store.stageScreenChange('target', changed, '新版');
    const valid = structuredClone(useProjectStore.getState().stagedScreen!);
    store.discardStagedChange();
    expect(await loadStagedCandidate(id)).toBeNull();
    const storage = createProjectStorage(id);
    await storage.writeTextAtomic('candidates/current.json', '{bad');
    expect(await loadStagedCandidate(id)).toBeNull();
    await storage.writeTextAtomic('candidates/current.json', JSON.stringify({ schemaVersion: 1, projectId: 'another', candidate: { targetScreenId: 'target', newHtml: changed, screenName: '新版' } }));
    expect(await loadStagedCandidate(id)).toBeNull();
    await saveStagedCandidate(id, undefined, valid);
    expect(await loadStagedCandidate(id)).toMatchObject({ targetScreenId: 'target' });
    await removeStagedCandidate(id);
    expect(await loadStagedCandidate(id)).toBeNull();
    store.stageScreenChange('target', changed, '安全候选');
    expect(await loadStagedCandidate(id)).not.toBeNull();
    store.stageScreenChange('target', `${changed}<script>alert(1)</script>`, '不安全候选');
    expect(await loadStagedCandidate(id)).toBeNull();
    expect(useProjectStore.getState().stagedCandidateSaveStatus).toBe('failed');
  });

  test('opening a registered project restores its saved candidate without old render approval', async () => {
    const store = useProjectStore.getState();
    const id = store.initNewProject({ name: '重开候选工程', deviceProfile: 'pc', designSystem: neutralModernTheme, createSpecimen: false });
    store.addScreen({ name: '页面', htmlContent: original, position: { x: 0, y: 0 } }, 'target');
    store.stageScreenChange('target', changed, '新版');
    store.setStagedRenderQuality(store.getStagedRenderContextKey(), { status: 'complete', findings: [], inspected: 2 });
    await loadStagedCandidate(id);
    await store.saveProjectChecked();
    expect(useWorkspaceStore.getState().openProject(id)).toBe(true);
    const session=useProjectStore.getState().projectAuthoringSession;
    for (let attempt = 0; attempt < 100 && (useProjectStore.getState().projectAuthoringSession===session||!useProjectStore.getState().stagedScreen); attempt++)
      await new Promise(resolve => setTimeout(resolve, 1));
    expect(useProjectStore.getState().stagedScreen?.newHtml).toBe(changed);
    expect(useProjectStore.getState().stagedRenderQuality).toBeNull();
    expect(useProjectStore.getState().getStagedDeliveryReport().status).toBe('pending');
    useProjectStore.getState().discardStagedChange();
    expect(await loadStagedCandidate(id)).toBeNull();
  });

  async function legacyFile(){
    const store=useProjectStore.getState();
    const id=store.initNewProject({name:'旧候选清理',deviceProfile:'pc',designSystem:neutralModernTheme,createSpecimen:false});
    store.addScreen({name:'页面',htmlContent:original},'target');
    const contract=buildDesignTaskContract({intent:'modify_screen',request:'修改文案',target:{id:'target',name:'页面',htmlContent:original},deviceProfile:'pc',frameWidth:1440,designSystem:neutralModernTheme});
    store.stageScreenChange('target',changed,'旧候选','修改文案',contract);
    await loadStagedCandidate(id);
    for(let i=0;i<50&&!useProjectStore.getState().stagedProjectAssetAudit;i++)await new Promise(r=>setTimeout(r,1));
    const old=structuredClone((await loadStagedCandidate(id))!);delete old.candidateId;delete old.inputContextFingerprint;
    await saveStagedCandidate(id,undefined,old);
    const loaded=(await loadStagedCandidate(id))!;expect(loaded.candidateId).toBeUndefined();expect(loaded.inputContextFingerprint).toBeUndefined();
    return {id,old:loaded};
  }
  test('legacy restored candidate stays unauthorized after fresh rendering and can be permanently discarded',async()=>{
    const {id,old}=await legacyFile();let store=useProjectStore.getState();expect(store.restoreStagedCandidate(old,id)).toBe(true);store=useProjectStore.getState();
    expect(store.stagedScreen!.candidateId).toBeDefined();expect(store.stagedScreen!.inputContextFingerprint).toBeUndefined();
    store.refreshStagedRender();store.setStagedRenderQuality(store.getStagedRenderContextKey(),{status:'complete',findings:[],inspected:2});
    const past=useHistoryStore.getState().past.length;
    for(const adopt of [store.adoptStagedChange,store.forceAdoptStagedChange,store.keepBothScreens])expect(await adopt()).toBe(false);
    store=useProjectStore.getState();expect(store.stagedScreen!.inputContextFingerprint).toBeUndefined();expect(store.screens.target.htmlContent).toBe(original);expect(useHistoryStore.getState().past).toHaveLength(past);
    store.discardStagedChange();expect(await loadStagedCandidate(id)).toBeNull();
  });
  test('discarding immediately after restoring an old no-ID candidate removes its disk file',async()=>{
    const {id,old}=await legacyFile();const store=useProjectStore.getState();
    expect(store.restoreStagedCandidate(old,id)).toBe(true);store.discardStagedChange();
    expect(await loadStagedCandidate(id)).toBeNull();
  });
  test('discarding a restored no-ID candidate preserves a concurrent no-ID replacement with a different request',async()=>{
    const {id,old}=await legacyFile();expect(useProjectStore.getState().restoreStagedCandidate(old,id)).toBe(true);
    for(let i=0;i<50&&!useProjectStore.getState().stagedProjectAssetAudit;i++)await new Promise(r=>setTimeout(r,1));
    await loadStagedCandidate(id);const replacement={...old,modificationRequest:'另外一次已授权请求'};
    await saveStagedCandidate(id,undefined,replacement);useProjectStore.getState().discardStagedChange();
    expect((await loadStagedCandidate(id))?.modificationRequest).toBe(replacement.modificationRequest);
  });
  test('discarding a restored candidate never removes a newer identified candidate',async()=>{
    const {id,old}=await legacyFile();expect(useProjectStore.getState().restoreStagedCandidate(old,id)).toBe(true);
    for(let i=0;i<50&&!useProjectStore.getState().stagedProjectAssetAudit;i++)await new Promise(r=>setTimeout(r,1));
    await loadStagedCandidate(id);const replacement={...old,candidateId:'candidate-newer'};
    await saveStagedCandidate(id,undefined,replacement);useProjectStore.getState().discardStagedChange();
    expect((await loadStagedCandidate(id))?.candidateId).toBe(replacement.candidateId);
  });

});
