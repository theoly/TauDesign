import {seedImportedScreen} from './helpers/importFixture';
import { beforeEach, describe, expect, it } from 'bun:test';
import { useHistoryStore } from '../src/stores/useHistoryStore';
import { useProjectStore } from '../src/stores/useProjectStore';
import { defaultTheme } from '../src/utils/themePresets';
import { buildDesignProjectManifest, renderProjectManifestContext } from '../src/services/ai/projectManifest';

beforeEach(() => {
  localStorage.clear();
  useProjectStore.getState().initNewProject({ name: '样式资产工程', deviceProfile: 'pc', designSystem: structuredClone(defaultTheme) });
  useHistoryStore.getState().clear();
});

describe('scoped CSS asset identity', () => {
  it('tracks imported style identity and versions CSS edits through undo and redo', () => {
    const store = useProjectStore.getState();
    const imported = { name: '导入详情', htmlContent: '<main>详情</main>', scopedCss: '.card { color: red; }', metadata: { importedHtml: {
      fileName: 'detail.html', mode: 'preserve', categories: [], changes: [], retained: [], version: 1
    } } };
    const id = seedImportedScreen(imported, { projectId: store.id });
    const original = useProjectStore.getState().screens[id].metadata?.scopedStyleAsset;
    expect(original).toMatchObject({ id: `${id}:scoped-css`, version: 1, source: 'imported' });

    useProjectStore.getState().updateScreen(id, { scopedCss: '.card { color: blue; }' }, '编辑页面 CSS');
    const edited = useProjectStore.getState().screens[id].metadata?.scopedStyleAsset;
    expect(edited?.version).toBe(2);
    expect(edited?.fingerprint).not.toBe(original?.fingerprint);
    expect(edited?.source).toBe('edited');

    useHistoryStore.getState().undo();
    expect(useProjectStore.getState().screens[id].metadata?.scopedStyleAsset).toEqual(original);
    useHistoryStore.getState().redo();
    expect(useProjectStore.getState().screens[id].metadata?.scopedStyleAsset).toEqual(edited);

    const manifest = buildDesignProjectManifest({ projectId: store.id, projectName: store.name, deviceProfile: 'pc',
      screens: Object.values(useProjectStore.getState().screens), assets: [], components: [], designSystem: store.designSystem,
      designSystemOrigin: useProjectStore.getState().designSystemOrigin });
    expect(manifest.pages.find(page => page.id === id)?.scopedStyleAsset).toEqual(edited);
    expect(renderProjectManifestContext(manifest)).toContain(`${id}:scoped-css v2`);
  });
});
