import { beforeEach, describe, expect, test } from 'bun:test';
import { defaultTheme } from '../src/utils/themePresets';
import { REFERENCE_DEVICES, defaultReferenceDevice, resolveProjectViewport, validReferenceDevice } from '../src/utils/referenceDevice';
import { useProjectStore } from '../src/stores/useProjectStore';
import { useHistoryStore } from '../src/stores/useHistoryStore';
import { readProject, listProjects } from '../src/utils/projectRegistry';
import { PromptBuilder } from '../src/services/ai/promptBuilder';
import { buildPolishPrompt } from '../src/services/ai/polishPrompt';
import { resolveViewportCss } from '../src/utils/importViewport';
import { buildScreenDocument } from '../src/utils/screenDocument';
import { buildStandaloneHtml, buildExportSvg } from '../src/utils/exportRenderer';
import { buildExportRenderDocument, exportScreenPng } from '../src/utils/pngExporter';
import type { Screen } from '../src/types/project';

beforeEach(() => {
  localStorage.clear();
  useProjectStore.getState().initNewProject({ name: '设备测试', deviceProfile: 'mobile', designSystem: defaultTheme });
  useHistoryStore.getState().restore(null);
});
const state = () => useProjectStore.getState();
const screen: Screen = { id: 'ref', name: '参考页', position: { x: 0, y: 0 }, htmlContent: '<html><head><style>body{margin:0;min-height:100vh}.box{width:50vw;height:25vmin}</style></head><body><main class="box">内容</main></body></html>' };

describe('项目参考设备', () => {
  test('两档默认及多个预设，按固定工程宽度适配，扣除顶部栏', () => {
    expect(REFERENCE_DEVICES.filter(d => d.deviceProfile === 'mobile')).toHaveLength(3);
    expect(REFERENCE_DEVICES.filter(d => d.deviceProfile === 'pc')).toHaveLength(3);
    expect(state().settings.referenceDevice).toEqual(defaultReferenceDevice('mobile'));
    expect(resolveProjectViewport(state().settings)).toMatchObject({ width: 390, height: 844, contentHeight: 752 });
    state().setReferenceDevice('mobile-compact');
    expect(resolveProjectViewport(state().settings)).toMatchObject({ width: 390, height: 694, contentHeight: 602 });
    state().setUseCustomNavigation(true);
    expect(resolveProjectViewport(state().settings).contentHeight).toBe(650);
    state().initNewProject({ name: 'PC', deviceProfile: 'pc', designSystem: defaultTheme, referenceDeviceId: 'pc-laptop' });
    expect(resolveProjectViewport(state().settings)).toMatchObject({ width: 1440, height: 810, contentHeight: 810 });
  });
  test('切换、撤销重做、重新打开保留设备与首屏，正文不变', () => {
    const id = state().addScreen(screen); const html = state().screens[id].htmlContent;
    useHistoryStore.getState().restore(null);
    state().setReferenceDevice('mobile-compact');
    expect(state().settings.viewportGuideHeight).toBe(694);
    expect(useHistoryStore.getState().past).toHaveLength(1);
    useHistoryStore.getState().undo(); expect(state().settings.referenceDevice?.id).toBe('mobile-standard'); expect(state().settings.viewportGuideHeight).toBe(844);
    useHistoryStore.getState().redo(); expect(state().settings.referenceDevice?.id).toBe('mobile-compact');
    const saved = readProject(state().id)!; state().setReferenceDevice('mobile-tall'); state().loadProject(saved);
    expect(resolveProjectViewport(state().settings).height).toBe(694); expect(state().screens[id].htmlContent).toBe(html);
    expect(listProjects()[0].referenceViewportHeight).toBe(866);
    state().saveProject(); expect(listProjects()[0].referenceViewportHeight).toBe(694);
    expect(listProjects()[0].previewHtml).toContain('min-height:602px');
  });
  test('未知/跨档预设不可修改设置、历史或D8宽度；重复选择不新增历史', () => {
    const previous = state().settings;
    state().setReferenceDevice('pc-standard'); state().setReferenceDevice('missing'); state().setReferenceDevice('mobile-standard');
    expect(state().settings).toEqual(previous); expect(useHistoryStore.getState().past).toHaveLength(0);
    state().applyPatches([{ op: 'replace', path: ['settings'], value: { ...previous, deviceProfile: 'pc', frameWidth: 1920, referenceDevice: defaultReferenceDevice('pc') } }]);
    expect(state().settings.deviceProfile).toBe('mobile'); expect(state().settings.frameWidth).toBe(390);
    expect(state().settings.referenceDevice).toBeUndefined();
  });
  test('旧项目保留原有高度，坏数据/跨档快照回退；快照不依赖预设当前尺寸', () => {
    const data = { ...state(), settings: { ...state().settings, referenceDevice: undefined, viewportGuideHeight: 720 } };
    state().loadProject(JSON.stringify(data)); expect(resolveProjectViewport(state().settings)).toMatchObject({ height: 720, reference: { id: 'legacy' } });
    for (const referenceDevice of [{ ...defaultReferenceDevice('mobile'), width: 0 }, defaultReferenceDevice('pc'), { id: 'bad' }]) {
      state().loadProject(JSON.stringify({ ...data, settings: { ...data.settings, referenceDevice } }));
      expect(resolveProjectViewport(state().settings).height).toBe(720);
    }
    const referenceDevice = { ...defaultReferenceDevice('mobile'), height: 860 };
    state().loadProject(JSON.stringify({ ...data, settings: { ...data.settings, referenceDevice } }));
    expect(resolveProjectViewport(state().settings).height).toBe(860);
    expect(validReferenceDevice({ ...referenceDevice, width: '390' }, 'mobile')).toBe(false);
  });
  test('AI新建/修改/参考图与润色共用生效视口，禁止锁死长页', () => {
    state().setReferenceDevice('mobile-compact');
    const options = { ...state().settings, designSystem: defaultTheme };
    for (const intent of ['create_screen', 'modify_screen'] as const) {
      const prompt = PromptBuilder.buildSystemPrompt({ ...options, intent, hasAttachment: true });
      expect(prompt).toContain('375×667'); expect(prompt).toContain('390×694px'); expect(prompt).toContain('业务可用高度 602px'); expect(prompt).toContain('禁止将整页高度锁死');
    }
    expect(buildPolishPrompt(options)).toContain('390×694px');
    expect(PromptBuilder.buildSystemPrompt({ ...options, deviceProfile: 'pc', frameWidth: 1440, referenceDevice: defaultReferenceDevice('pc'), viewportGuideHeight: 900, intent: 'create_screen' }).length).toBeLessThan(12000);
  });
  test('CSS vw/vmin/vmax及变体解析，只修改声明不误伤字符串URL/选择器', () => {
    const css = '.w-\\[50vw\\]{width:50vw;height:20dvw;padding:10vmin;margin:5svmax;--h:100lvh;content:"50vw";background:url(/50vw.svg)}';
    const resolved = resolveViewportCss(css, 602, 390);
    expect(resolved).toContain('.w-\\[50vw\\]'); expect(resolved).toContain('width:195px'); expect(resolved).toContain('height:78px'); expect(resolved).toContain('padding:39px'); expect(resolved).toContain('margin:30.1px'); expect(resolved).toContain('--h:602px'); expect(resolved).toContain('content:"50vw"'); expect(resolved).toContain('/50vw.svg');
  });
  test('画布/导入/PNG双路径对齐参考高度，HTML保持响应式，长页不裁切', async () => {
    state().setReferenceDevice('mobile-compact');
    const viewport = resolveProjectViewport(state().settings);
    const options = { tokensCss: '', baseCss: '', screenOverrides: '', deviceProfile: 'mobile' as const, viewportWidth: viewport.width, viewportHeight: viewport.height, includeMobileChrome: true, width: 390, height: 1400, scale: 1 as const, bgColor: '#fff' };
    for (const imported of [false, true]) {
      const target: Screen = imported ? { ...screen, metadata: { importedHtml: { version: 1, fileName: 'test.html', mode: 'preserve', categories: [], changes: [], retained: [] } } } : screen;
      for (const result of [buildScreenDocument(target, options), buildExportRenderDocument(target, options), buildExportSvg(target, options)]) {
        expect(result).toContain('min-height:602px'); expect(result).toContain('width:195px'); expect(result).toContain('height:97.5px');
      }
      const exported = buildStandaloneHtml(target, options); expect(exported).toContain('100vh'); expect(exported).toContain('50vw'); expect(exported).not.toContain('data-viewport-height'); expect(exported).not.toContain('data-taudesign-mobile-chrome');
      const outcome = await exportScreenPng(target, options, { isNativeAvailable: () => true, measureHeight: async html => { expect(html).toContain('data-viewport-height="694"'); return 1400; }, nativeExport: async args => { expect(args.height).toBe(1400); return { engine: 'native-webview-snapshot', dataUrl: 'data:image/png;base64,ok', width: 390, height: 1400 }; } });
      expect(outcome.cssHeight).toBe(1400);
      await exportScreenPng(target, options, { isNativeAvailable: () => false, measureHeight: async () => 1400, legacyExport: async (_screen, args) => { expect(args.viewportHeight).toBe(694); return 'data:image/png;base64,ok'; } });
    }
  });
});
