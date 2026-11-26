import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  LUCIDE_ICON_ALIAS_MAP,
  candidateLucideIconNames,
  normalizeIconStem
} from '../src/services/ai/builtinIconAliases';
import {
  resolveMissingBundledIcons,
  verifyGeneratedMediaAssets
} from '../src/services/ai/generatedMedia';
import { importedLucideSvg } from '../src/services/import/importLucideIcons';
import {
  inspectProjectAssetReferences,
  readProjectRenderResources
} from '../src/services/ai/projectAssetIntegrity';
import { PipelineExecutor } from '../src/services/ai/engine/pipeline/executor';
import { DefaultAIEngineCore } from '../src/services/ai/engine/core/aiEngineCore';
import { MockTransport } from '../src/services/ai/engine/transport/mockTransport';
import { CanvasToolExecutor } from '../src/services/tools/canvasToolExecutor';
import { PageRenderCheck } from '../src/services/ai/pageRenderCheck';
import { createProjectStorage } from '../src/services/storage/projectStorage';
import { useProjectStore } from '../src/stores/useProjectStore';
import { useHistoryStore } from '../src/stores/useHistoryStore';
import { defaultTheme } from '../src/utils/themePresets';
import { buildDesignTaskContract } from '../src/services/ai/designWorkflow';
import type { Screen } from '../src/types/project';

const provider = {
  id: 'auto-icon-test',
  name: 'AutoIconTest',
  protocol: 'openai_compatible' as const,
  baseUrl: 'https://api.openai.com/v1',
  apiKey: 'unit-only',
  enabled: true
};

describe('auto icon resource resolution', () => {
  let priorProject: ReturnType<typeof useProjectStore.getState>;
  let priorHistory: ReturnType<typeof useHistoryStore.getState>;
  const originalInspect = PageRenderCheck.inspect;

  beforeEach(() => {
    priorProject = useProjectStore.getState();
    priorHistory = useHistoryStore.getState();
    useProjectStore.getState().initNewProject({
      name: '纠结粉碎机',
      deviceProfile: 'mobile',
      designSystem: defaultTheme,
      createSpecimen: false
    });
    PageRenderCheck.inspect = async (request, storage) => ({
      status: 'complete',
      inspected: 6,
      findings: [],
      resourceFiles: (await readProjectRenderResources(storage, [request.screen], request.assets)).resourceFiles
    });
  });

  afterEach(() => {
    PageRenderCheck.inspect = originalInspect;
    useProjectStore.setState(priorProject, true);
    useHistoryStore.setState(priorHistory, true);
  });

  test('every LUCIDE_ICON_ALIAS_MAP target exists in lucide-react and stem normalization works', () => {
    for (const [alias, target] of Object.entries(LUCIDE_ICON_ALIAS_MAP)) {
      const svg = importedLucideSvg(target);
      expect(svg, `alias ${alias} -> ${target} should exist in lucide-react`).toStartWith('<svg');
    }
    expect(normalizeIconStem('ic_sparkles_24')).toBe('sparkles');
    expect(normalizeIconStem('layoutGrid')).toBe('layout-grid');
    expect(candidateLucideIconNames('grid')).toContain('layout-grid');
    expect(candidateLucideIconNames('tab-grid')).toContain('layout-grid');
    expect(candidateLucideIconNames('home')).toContain('house');
  });

  test('materializes grid/home/sparkles/compass/layoutGrid/tab-grid across HTML & CSS and reuses registered icons', async () => {
    const state = useProjectStore.getState();
    const storage = createProjectStorage(state.id, state.folderPath);
    const html = [
      '<style>.grid-bg{background-image:url(assets/icons/tab-grid.svg#icon)}</style>',
      '<main data-nid="root" class="col gap-4 p-4">',
      '<h1 data-nid="title">纠结粉碎机首页</h1>',
      '<span class="icon icon-mask" style="mask-image:url(assets/icons/grid.svg?v=1);-webkit-mask-image:url(\'assets/icons/grid.svg?v=1\')"></span>',
      '<img src="assets/icons/home.svg#nav" alt="首页">',
      '<svg class="icon" data-icon-src="assets/icons/sparkles.svg"><use href="assets/icons/compass.svg#shape"></use></svg>',
      '<img src="assets/icons/layoutGrid.svg" alt="网格">',
      '<button class="btn btn-primary">立即分析</button>',
      '</main>'
    ].join('');
    const scopedCss = '.tab-home{mask-image:url("assets/icons/home.svg#mask")}';

    const resolved = await resolveMissingBundledIcons({
      html,
      scopedCss,
      storage,
      assets: []
    });

    expect(resolved.rewritten.length).toBeGreaterThanOrEqual(5);
    expect(resolved.html).not.toContain('assets/icons/grid.svg');
    expect(resolved.html).not.toContain('assets/icons/home.svg');
    expect(resolved.html).not.toContain('assets/icons/sparkles.svg');
    expect(resolved.html).not.toContain('assets/icons/compass.svg');
    expect(resolved.html).not.toContain('assets/icons/layoutGrid.svg');
    expect(resolved.html).not.toContain('assets/icons/tab-grid.svg');
    expect(resolved.html).toContain('?v=1');
    expect(resolved.html).toContain('#nav');
    expect(resolved.html).toContain('#shape');
    expect(resolved.html).toContain('#icon');
    expect(resolved.scopedCss).not.toContain('assets/icons/home.svg');
    expect(resolved.scopedCss).toContain('#mask');

    // grid.svg, tab-grid.svg, and layoutGrid.svg all map onto layout-grid -> deduplicated into 1 asset
    expect(resolved.assets).toHaveLength(4);
    await verifyGeneratedMediaAssets(storage, resolved.assets);

    const screen: Screen = {
      id: 'p1',
      name: '纠结粉碎机首页',
      htmlContent: resolved.html,
      scopedCss: resolved.scopedCss,
      position: { x: 0, y: 0 }
    };
    expect(inspectProjectAssetReferences([screen], resolved.assets)).toEqual([]);

    // Re-running with already-registered assets reuses them without producing duplicate assets
    const second = await resolveMissingBundledIcons({
      html: '<main><img src="assets/icons/grid.svg" alt=""><img src="assets/icons/home.svg" alt=""></main>',
      storage,
      assets: resolved.assets
    });
    expect(second.assets).toEqual([]);
    expect(second.rewritten).toHaveLength(2);
    expect(second.html).not.toContain('assets/icons/grid.svg');
  });

  test('does not fabricate unknown icon names, bitmaps, fonts, or traversal paths', async () => {
    const state = useProjectStore.getState();
    const storage = createProjectStorage(state.id, state.folderPath);
    const html = [
      '<main data-nid="root" class="col">',
      '<img src="assets/icons/not-a-builtin.svg" alt="x">',
      '<img src="assets/images/fake-photo.png" alt="y">',
      '<img src="assets/icons/../secret.svg" alt="z">',
      '<style>@font-face{font-family:X;src:url(assets/imports/fonts/missing.woff2)}</style>',
      '</main>'
    ].join('');

    const resolved = await resolveMissingBundledIcons({ html, storage, assets: [] });
    expect(resolved.assets).toEqual([]);
    expect(resolved.rewritten).toEqual([]);
    expect(resolved.html).toContain('assets/icons/not-a-builtin.svg');
    expect(resolved.html).toContain('assets/images/fake-photo.png');
    expect(resolved.html).toContain('assets/icons/../secret.svg');
    expect(resolved.html).toContain('assets/imports/fonts/missing.woff2');

    const issues = inspectProjectAssetReferences(
      [{ id: 'p', name: 'P', htmlContent: resolved.html, position: { x: 0, y: 0 } }],
      []
    );
    expect(issues.some(i => i.code === 'unregistered_asset_reference')).toBe(true);
  });

  test('PipelineExecutor + CanvasToolExecutor create_screen resolves grid.svg end-to-end with atomic History and render guard', async () => {
    const state = useProjectStore.getState();
    const storage = createProjectStorage(state.id, state.folderPath);
    const transport = new MockTransport();
    const rawHtml =
      '<main data-nid="root" class="col gap-4 p-4">' +
      '<h1 data-nid="title">纠结粉碎机首页</h1>' +
      '<span class="icon icon-mask" style="mask-image:url(assets/icons/grid.svg)"></span>' +
      '<button data-nid="go" class="btn btn-primary">开始粉碎</button>' +
      '</main>';
    transport.queueResponse(`<artifact type="screen" title="纠结粉碎机首页">${rawHtml}</artifact>`);
    const core = new DefaultAIEngineCore(transport);

    const output = await PipelineExecutor.execute({
      input: {
        rawPrompt: '创建纠结粉碎机首页',
        activeScreenId: null,
        decision: { intent: 'create_screen', targetScreenId: null, reason: '新建首页' }
      },
      provider,
      model: 'mock',
      engineCore: core,
      screens: {},
      deviceProfile: 'mobile',
      frameWidth: 390,
      designSystem: defaultTheme,
      baseSystemPrompt: 'test',
      generatedMedia: { storage, settings: state.settings, assets: Object.values(state.assets) }
    });

    expect(output.status).toBe('applied');
    expect(output.extractedHtml).toBeDefined();
    expect(output.extractedHtml).not.toContain('assets/icons/grid.svg');
    expect(output.extractedHtml).toMatch(/assets\/icons\/[a-f0-9]{64}\.svg/);
    expect(output.generatedAssets).toHaveLength(1);
    expect(output.generatedAssets![0].type).toBe('svg_icon');

    const historyBefore = useHistoryStore.getState().past.length;
    const created = await CanvasToolExecutor.executeAsync({
      tool: 'create_screen',
      params: {
        title: '纠结粉碎机首页',
        html: output.extractedHtml!,
        workflowContract: output.workflowContract,
        executionRecord: output.executionRecord,
        generatedAssets: output.generatedAssets
      }
    });

    expect(created.success).toBe(true);
    expect(useHistoryStore.getState().past.length).toBe(historyBefore + 1);
    expect(useProjectStore.getState().screenOrder).toHaveLength(1);
    expect(Object.keys(useProjectStore.getState().assets)).toHaveLength(1);

    useHistoryStore.getState().undo();
    expect(useProjectStore.getState().screenOrder).toHaveLength(0);
    expect(Object.keys(useProjectStore.getState().assets)).toHaveLength(0);

    useHistoryStore.getState().redo();
    expect(useProjectStore.getState().screenOrder).toHaveLength(1);
    expect(Object.keys(useProjectStore.getState().assets)).toHaveLength(1);

    // Render failure adds neither screen nor asset metadata
    useHistoryStore.getState().undo();
    PageRenderCheck.inspect = async () => ({ status: 'unavailable', inspected: 0, findings: [] });
    const rejected = await CanvasToolExecutor.executeAsync({
      tool: 'create_screen',
      params: {
        title: '纠结粉碎机首页',
        html: rawHtml,
        workflowContract: buildDesignTaskContract({
          intent: 'create_screen',
          request: '创建纠结粉碎机首页',
          deviceProfile: 'mobile',
          frameWidth: 390,
          designSystem: defaultTheme
        })
      }
    });
    expect(rejected.success).toBe(false);
    expect(useProjectStore.getState().screenOrder).toHaveLength(0);
    expect(Object.keys(useProjectStore.getState().assets)).toHaveLength(0);
  });

  test('remount via CanvasToolExecutor.executeAsync resolves grid.svg and existing hashed image on disk', async () => {
    const state = useProjectStore.getState();
    const storage = createProjectStorage(state.id, state.folderPath);
    const chartSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M2 2h20v20H2z"/></svg>';
    const bytes = new TextEncoder().encode(chartSvg);
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
    const imagePath = `assets/images/${hash}.svg`;
    await storage.ensureDir('assets/images');
    await storage.writeBinary(imagePath, btoa(chartSvg));

    const blockedHtml =
      '<main data-nid="root" class="col gap-4 p-4">' +
      '<h1 data-nid="title">纠结粉碎机首页</h1>' +
      `<span class="icon icon-mask" style="mask-image:url(assets/icons/grid.svg)"></span><img src="${imagePath}" alt="雷达图">` +
      '<button data-nid="go" class="btn btn-primary">开始</button>' +
      '</main>';

    const contract = buildDesignTaskContract({
      intent: 'create_screen',
      request: '重新检查并挂载纠结粉碎机首页',
      deviceProfile: 'mobile',
      frameWidth: 390,
      designSystem: defaultTheme
    });

    const remounted = await CanvasToolExecutor.executeAsync({
      tool: 'create_screen',
      params: {
        title: '纠结粉碎机首页',
        html: blockedHtml,
        workflowContract: contract
      }
    });

    expect(remounted.success).toBe(true);
    expect(remounted.createdHtml).not.toContain('assets/icons/grid.svg');
    expect(remounted.createdHtml).toContain(imagePath);
    expect(Object.keys(useProjectStore.getState().assets)).toHaveLength(2);
  });

  test('CanvasToolExecutor.executeAsync modify_screen resolves grid.svg, registers via History, and stages hashed candidate', async () => {
    const state = useProjectStore.getState();
    const originalHtml = '<main data-nid="root" class="col p-4"><h1 data-nid="t">原页面</h1><button data-nid="b" class="btn btn-primary">确定</button></main>';
    const screenId = state.addScreen({ name: '原页面', htmlContent: originalHtml }, 'screen-orig');
    const historyBefore = useHistoryStore.getState().past.length;

    const candidateHtml =
      '<main data-nid="root" class="col p-4">' +
      '<h1 data-nid="t">原页面</h1>' +
      '<span class="icon icon-mask" style="mask-image:url(assets/icons/grid.svg)"></span>' +
      '<button data-nid="b" class="btn btn-primary">确定</button>' +
      '</main>';

    const result = await CanvasToolExecutor.executeAsync({
      tool: 'modify_screen',
      params: {
        screenId,
        html: candidateHtml,
        modificationRequest: '添加九宫格图标'
      }
    });

    expect(result.success).toBe(true);
    expect(result.status).toBe('screen_staged');
    expect(result.candidateHtml).not.toContain('assets/icons/grid.svg');
    expect(result.candidateHtml).toMatch(/assets\/icons\/[a-f0-9]{64}\.svg/);
    expect(useProjectStore.getState().screens[screenId].htmlContent).toBe(originalHtml);
    expect(useProjectStore.getState().stagedScreen?.newHtml).toMatch(/assets\/icons\/[a-f0-9]{64}\.svg/);
    expect(Object.keys(useProjectStore.getState().assets)).toHaveLength(1);
    expect(useHistoryStore.getState().past.length).toBeGreaterThan(historyBefore);
  });

  test('rejects tampered/conflicting disk files and respects cancellation/stale contexts without registering assets', async () => {
    const state = useProjectStore.getState();
    const storage = createProjectStorage(state.id, state.folderPath);
    const svg = importedLucideSvg('layout-grid')!;
    const bytes = new TextEncoder().encode(svg);
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
    const targetPath = `assets/icons/${hash}.svg`;
    await storage.ensureDir('assets/icons');
    await storage.writeBinary(targetPath, btoa('tampered-content'));

    const html = '<main><span class="icon icon-mask" style="mask-image:url(assets/icons/grid.svg)"></span></main>';
    await expect(resolveMissingBundledIcons({ html, storage, assets: [] })).rejects.toThrow('冲突');
    expect(await storage.readBinary(targetPath)).toBe(btoa('tampered-content'));
    expect(Object.keys(useProjectStore.getState().assets)).toHaveLength(0);

    const aborted = new AbortController();
    aborted.abort();
    await expect(
      resolveMissingBundledIcons({ html, storage, assets: [], signal: aborted.signal })
    ).rejects.toThrow('取消');

    await expect(
      resolveMissingBundledIcons({ html, storage, assets: [], isCurrent: () => false })
    ).rejects.toThrow('已变化');
    expect(Object.keys(useProjectStore.getState().assets)).toHaveLength(0);
  });
});
