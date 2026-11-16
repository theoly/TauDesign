import {describe,expect,test,beforeEach,afterEach} from 'bun:test';
import {prepareBuiltinMediaAssets} from '../src/services/ai/builtinMediaAssets';
import {rewriteBuiltinIconAliases,builtinIconAliasMap} from '../src/services/ai/builtinIconAliases';
import {inspectProjectAssetReferences,readProjectRenderResources} from '../src/services/ai/projectAssetIntegrity';
import {prepareNewPage} from '../src/services/ai/pageCreationValidation';
import {buildDesignTaskContract} from '../src/services/ai/designWorkflow';
import {PageRenderCheck} from '../src/services/ai/pageRenderCheck';
import {createProjectStorage} from '../src/services/storage/projectStorage';
import {useProjectStore} from '../src/stores/useProjectStore';
import {useHistoryStore} from '../src/stores/useHistoryStore';
import {defaultTheme} from '../src/utils/themePresets';
import type {Asset, Screen} from '../src/types/project';

describe('builtin icon alias rewrite', () => {
  let prior: ReturnType<typeof useProjectStore.getState>;
  let history: ReturnType<typeof useHistoryStore.getState>;
  const inspect = PageRenderCheck.inspect;
  beforeEach(() => {
    prior = useProjectStore.getState();
    history = useHistoryStore.getState();
    useProjectStore.getState().initNewProject({ name: '图标别名', deviceProfile: 'mobile', designSystem: defaultTheme, createSpecimen: false });
  });
  afterEach(() => {
    PageRenderCheck.inspect = inspect;
    useProjectStore.setState(prior, true);
    useHistoryStore.setState(history, true);
  });

  test('rewrites friendly Lucide paths onto hashed registered builtins', async () => {
    await prepareBuiltinMediaAssets();
    const assets = Object.values(useProjectStore.getState().assets);
    const map = builtinIconAliasMap(assets);
    expect(map.get('assets/icons/map-pin.svg')).toMatch(/^assets\/icons\/[a-f0-9]{64}\.svg$/);
    const hashed = map.get('assets/icons/map-pin.svg')!;
    const html = `<main data-nid="root" class="col gap-4 p-4"><h1 data-nid="t">地点</h1><span class="icon icon-mask" style="mask-image:url(assets/icons/map-pin.svg);-webkit-mask-image:url('assets/icons/map-pin.svg')"></span><img src="assets/icons/map-pin.svg" alt=""><button class="btn btn-primary">继续</button></main>`;
    const rewritten = rewriteBuiltinIconAliases(html, assets);
    expect(rewritten.html).toContain(hashed);
    expect(rewritten.html).not.toContain('assets/icons/map-pin.svg');
    expect(rewritten.rewritten.some(entry => entry.startsWith('assets/icons/map-pin.svg→'))).toBe(true);
    const screen = { id: 'p', name: 'P02', htmlContent: rewritten.html, position: { x: 0, y: 0 } } satisfies Screen;
    expect(inspectProjectAssetReferences([screen], assets)).toEqual([]);
  });

  test('does not invent paths for unknown icon names', async () => {
    await prepareBuiltinMediaAssets();
    const assets = Object.values(useProjectStore.getState().assets);
    const html = `<main><img src="assets/icons/not-a-builtin.svg" alt="x"><button class="btn btn-primary">继续</button></main>`;
    const rewritten = rewriteBuiltinIconAliases(html, assets);
    expect(rewritten.html).toContain('assets/icons/not-a-builtin.svg');
    expect(rewritten.rewritten).toEqual([]);
  });

  test('prepareNewPage remaps map-pin.svg before asset registration gates', async () => {
    await prepareBuiltinMediaAssets();
    const state = useProjectStore.getState();
    const storage = createProjectStorage(state.id, state.folderPath);
    const assets = Object.values(state.assets) as Asset[];
    PageRenderCheck.inspect = async (request, storageArg) => ({
      status: 'complete',
      inspected: 3,
      findings: [],
      resourceFiles: (await readProjectRenderResources(storageArg, [request.screen], request.assets)).resourceFiles
    });
    const contract = buildDesignTaskContract({
      intent: 'create_screen',
      request: '创建材料与问题输入',
      deviceProfile: state.settings.deviceProfile,
      frameWidth: state.settings.frameWidth,
      designSystem: state.designSystem
    });
    const html = `<main data-nid="root" class="col gap-4 p-4"><h1 data-nid="t">材料与问题输入</h1><span class="icon icon-mask" style="mask-image:url(assets/icons/map-pin.svg)"></span><button data-nid="go" class="btn btn-primary">下一步</button></main>`;
    expect(inspectProjectAssetReferences([{ id: 'raw', name: 'P02', htmlContent: html, position: { x: 0, y: 0 } }], assets)[0]?.code).toBe('unregistered_asset_reference');
    const prepared = await prepareNewPage(state, { id: 'new-page', name: 'P02 材料与问题输入', htmlContent: html, position: { x: 0, y: 0 } }, contract, storage, { isCurrent: () => true });
    if (prepared.status !== 'ready') throw new Error(prepared.message);
    expect(prepared.screen.htmlContent).not.toContain('assets/icons/map-pin.svg');
    expect(prepared.screen.htmlContent).toMatch(/assets\/icons\/[a-f0-9]{64}\.svg/);
  });
});
