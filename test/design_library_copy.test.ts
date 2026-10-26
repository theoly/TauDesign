import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { installDesignLibraryCopyFiles, readDesignLibraryCopy } from '../src/services/ai/designLibraryCopy';
import { LocalStorageStorage } from '../src/services/storage/projectStorage';
import { useProjectStore } from '../src/stores/useProjectStore';
import { useHistoryStore } from '../src/stores/useHistoryStore';
import { neutralModernTheme } from '../src/utils/themePresets';
import { readProject } from '../src/utils/projectRegistry';
import { buildProjectKnowledgeBundle } from '../src/services/ai/projectKnowledge';
import { buildDesignProjectManifest, renderProjectManifestContext } from '../src/services/ai/projectManifest';

const source = (templateHtml = '<article data-component-id="card"><span>内容</span></article>') => ({
  id: 'source-project', name: '设计源', designSystem: { ...neutralModernTheme, id: 'library-theme', name: '设计源主题' },
  settings: { deviceProfile: 'mobile' },
  designSystemOrigin: { tokenVersion: 4 },
  components: { card: { id: 'card', name: '卡片', templateHtml, version: 2, createdAt: 1, updatedAt: 1 } }
});

describe('local project design library copy', () => {
  let storage: LocalStorageStorage;
  let previousProject: ReturnType<typeof useProjectStore.getState>;
  let previousHistory: ReturnType<typeof useHistoryStore.getState>;
  beforeEach(() => {
    previousProject = useProjectStore.getState(); previousHistory = useHistoryStore.getState();
    storage = new LocalStorageStorage(`design-library-test-${Date.now()}-${Math.random()}`);
  });
  afterEach(() => {
    useProjectStore.setState(previousProject, true);
    useHistoryStore.setState(previousHistory, true);
  });

  test('reads source without modifying it; namespaces component references and rejects unregistered local assets', async () => {
    await storage.writeTextAtomic('project.json', JSON.stringify(source()));
    const before = await storage.readText('project.json');
    const copy = await readDesignLibraryCopy(storage);
    expect(copy.binding).toMatchObject({ mode: 'project_copy', sourceProjectId: 'source-project', sourceDeviceProfile: 'mobile', sourceTokenVersion: 4 });
    expect(copy.components['lib-source-project-card']).toMatchObject({ version: 2,
      origin: { kind: 'library_copy', sourceProjectId: 'source-project', sourceComponentId: 'card' } });
    expect(copy.components['lib-source-project-card'].templateHtml).toContain('data-component-id="lib-source-project-card"');
    expect(await storage.readText('project.json')).toBe(before);
    await storage.writeTextAtomic('project.json', JSON.stringify({ ...source(), designSystem: {
      ...source().designSystem, tokens: Object.fromEntries(Object.entries(source().designSystem.tokens).reverse()) } }));
    expect((await readDesignLibraryCopy(storage)).binding.sourceFingerprint).toBe(copy.binding.sourceFingerprint);
    await storage.writeTextAtomic('project.json', JSON.stringify(source('<article><img src="assets/images/missing.png"></article>')));
    await expect(readDesignLibraryCopy(storage)).rejects.toThrow('未登记');
    await storage.writeTextAtomic('project.json', JSON.stringify(source('<article data-component-id="unknown">断链</article>')));
    await expect(readDesignLibraryCopy(storage)).rejects.toThrow('不存在的组件');
  });

  test('copies referenced files before one History transaction, rewrites references and preserves source', async () => {
    const image = { id: 'portrait', name: '头像', type: 'image', mimeType: 'image/png', source: 'upload',
      relPath: 'assets/images/portrait.png', refCount: 1 };
    const html = '<article data-component-id="card"><img data-asset-id="portrait" src="assets/images/portrait.png"><style>.avatar{background:url(assets/images/portrait.png)}</style></article>';
    await storage.writeTextAtomic('project.json', JSON.stringify({ ...source(html), assets: { portrait: image } }));
    await storage.writeBinary(image.relPath, 'dGVzdC1wbmc=');
    const copy = await readDesignLibraryCopy(storage);
    const importedAsset = copy.assets['lib-source-project-portrait'];
    expect(importedAsset.relPath).toStartWith('assets/images/lib-source-project-portrait-');
    expect(copy.components['lib-source-project-card'].templateHtml).toContain(`src="${importedAsset.relPath}"`);
    expect(copy.components['lib-source-project-card'].templateHtml).toContain('data-asset-id="lib-source-project-portrait"');
    useProjectStore.getState().initNewProject({ name: '目标工程', deviceProfile: 'mobile', createSpecimen: false });
    const target = new LocalStorageStorage(`design-library-target-${Date.now()}-${Math.random()}`);
    const rollback = await installDesignLibraryCopyFiles(copy, target);
    expect(await target.readBinary(importedAsset.relPath)).toBe('dGVzdC1wbmc=');
    const historyBefore = useHistoryStore.getState().past.length;
    useProjectStore.getState().applyDesignLibraryCopy(copy);
    expect(useHistoryStore.getState().past.length).toBe(historyBefore + 1);
    expect(useProjectStore.getState().assets[importedAsset.id]).toBeDefined();
    const saved = readProject(useProjectStore.getState().id)!;
    expect(saved).toContain(importedAsset.relPath);
    expect(saved).not.toContain('dGVzdC1wbmc=');
    useHistoryStore.getState().undo();
    expect(useProjectStore.getState().assets[importedAsset.id]).toBeUndefined();
    useHistoryStore.getState().redo();
    expect(useProjectStore.getState().assets[importedAsset.id]).toBeDefined();
    expect(await storage.readBinary(image.relPath)).toBe('dGVzdC1wbmc=');
    await rollback();
    expect(await target.exists(importedAsset.relPath)).toBe(false);
  });

  test('missing source file and failed target write keep metadata unchanged and remove partial files', async () => {
    const image = { id: 'portrait', name: '头像', type: 'image', mimeType: 'image/png', source: 'upload',
      relPath: 'assets/images/portrait.png', refCount: 1 };
    await storage.writeTextAtomic('project.json', JSON.stringify({ ...source('<article><img data-asset-id="portrait" src="assets/images/portrait.png"></article>'), assets: { portrait: image } }));
    await expect(readDesignLibraryCopy(storage)).rejects.toThrow('文件缺失');
    await storage.writeBinary(image.relPath, 'dGVzdA==');
    const copy = await readDesignLibraryCopy(storage);
    useProjectStore.getState().initNewProject({ name: '目标工程', deviceProfile: 'mobile', createSpecimen: false });
    const target = new LocalStorageStorage(`design-library-failure-${Date.now()}-${Math.random()}`);
    const originalWrite = target.writeBinary.bind(target);
    target.writeBinary = async (path, value) => { await originalWrite(path, value); throw new Error('write failed'); };
    await expect(installDesignLibraryCopyFiles(copy, target)).rejects.toThrow('write failed');
    expect(await target.exists(copy.assetFiles[0].relPath)).toBe(false);
    expect(useProjectStore.getState().designLibraryBinding).toBeUndefined();
  });

  test('copies tokens and components in one History transaction; legacy projects remain loadable', async () => {
    await storage.writeTextAtomic('project.json', JSON.stringify(source()));
    const copy = await readDesignLibraryCopy(storage);
    useProjectStore.getState().initNewProject({ name: 'PC 工程', deviceProfile: 'pc', createSpecimen: false });
    expect(() => useProjectStore.getState().applyDesignLibraryCopy(copy)).toThrow('设备档位');
    expect(useProjectStore.getState().designLibraryBinding).toBeUndefined();
    useProjectStore.getState().initNewProject({ name: '目标工程', deviceProfile: 'mobile', createSpecimen: false });
    const originalTheme = useProjectStore.getState().designSystem.id;
    const beforeHistory = useHistoryStore.getState().past.length;
    useProjectStore.getState().applyDesignLibraryCopy(copy);
    const imported = useProjectStore.getState();
    expect(imported.designLibraryBinding?.sourceFingerprint).toBe(copy.binding.sourceFingerprint);
    expect(imported.designSystem.id).toBe('library-theme');
    expect(imported.components['lib-source-project-card']).toBeDefined();
    expect(useHistoryStore.getState().past.length).toBe(beforeHistory + 1);
    useHistoryStore.getState().undo();
    expect(useProjectStore.getState().designSystem.id).toBe(originalTheme);
    expect(useProjectStore.getState().designLibraryBinding).toBeUndefined();
    useHistoryStore.getState().redo();
    expect(useProjectStore.getState().components['lib-source-project-card']).toBeDefined();
    await storage.writeTextAtomic('project.json', JSON.stringify({ ...source(), components: {} }));
    useProjectStore.getState().applyDesignLibraryCopy(await readDesignLibraryCopy(storage));
    expect(useProjectStore.getState().components['lib-source-project-card']).toBeDefined();
    const active = useProjectStore.getState();
    expect(buildProjectKnowledgeBundle(active, '创建页面').content).toContain('设计源');
    const manifest = buildDesignProjectManifest({ projectId: active.id, projectName: active.name, deviceProfile: 'mobile',
      screens: Object.values(active.screens), assets: Object.values(active.assets), components: Object.values(active.components),
      designSystem: active.designSystem, designSystemOrigin: active.designSystemOrigin, designLibraryBinding: active.designLibraryBinding });
    expect(renderProjectManifestContext(manifest)).toContain('设计库项目副本：设计源');
    const saved = readProject(active.id);
    expect(saved).toBeTruthy();
    active.loadProject(saved!);
    expect(useProjectStore.getState().designLibraryBinding?.sourceProjectId).toBe('source-project');
    expect(useProjectStore.getState().components['lib-source-project-card']).toBeDefined();
    const legacy = JSON.parse(saved!); delete legacy.designLibraryBinding;
    active.loadProject(JSON.stringify(legacy));
    expect(useProjectStore.getState().designLibraryBinding).toBeUndefined();
  });
});
