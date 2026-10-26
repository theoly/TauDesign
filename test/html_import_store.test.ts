import {seedImportedScreen} from './helpers/importFixture';
import { beforeEach, describe, expect, test } from 'bun:test';
import { useProjectStore } from '../src/stores/useProjectStore';
import { useHistoryStore } from '../src/stores/useHistoryStore';
import { defaultTheme, warmCoralTheme } from '../src/utils/themePresets';
import type { Asset } from '../src/types/project';
import { readProject } from '../src/utils/projectRegistry';

const screen = { name: '导入页', htmlContent: '<!doctype html><html><head><style>.card{padding:17px}</style></head><body><main data-nid="import01" class="card"><button data-nid="import02">确认提交</button></main></body></html>',
  scopedCss: '', metadata: { importedHtml: { fileName: 'test.html', mode: 'preserve' as const, categories: [], changes: [], retained: [], version: 1 as const } } };
const asset: Asset = { id: 'test-asset', name: 'a.png', type: 'image', mimeType: 'image/png', source: 'upload', relPath: 'assets/images/hash.png', refCount: 1 };

beforeEach(() => {
  localStorage.clear();
  useProjectStore.getState().initNewProject({ name: '导入工程', deviceProfile: 'mobile', designSystem: structuredClone(defaultTheme) });
  useHistoryStore.getState().restore(null);
});

describe('HTML 导入原子历史', () => {
  test('新画框、主题、模式、资产在一次 undo/redo 中恢复，设备不改变', () => {
    const prev = useProjectStore.getState();
    const sid = seedImportedScreen(screen, { projectId: prev.id, designSystem: structuredClone(warmCoralTheme), colorMode: 'dark', assets: [asset] });
    expect(useHistoryStore.getState().past.length).toBe(1);
    expect(useProjectStore.getState().screens[sid].htmlContent).toBe(screen.htmlContent);
    expect(useProjectStore.getState().designSystem).toEqual(warmCoralTheme);
    expect(useProjectStore.getState().designSystemOrigin?.kind).toBe('html_import');
    expect(useProjectStore.getState().settings.colorMode).toBe('dark');
    expect(useProjectStore.getState().assets[asset.id]).toEqual(asset);
    useHistoryStore.getState().undo();
    expect(useProjectStore.getState().screens[sid]).toBeUndefined();
    expect(useProjectStore.getState().assets[asset.id]).toBeUndefined();
    expect(useProjectStore.getState().designSystem).toEqual(defaultTheme);
    expect(useProjectStore.getState().designSystemOrigin?.kind).toBe('project');
    expect(useProjectStore.getState().settings.colorMode).toBe(prev.settings.colorMode);
    useHistoryStore.getState().redo();
    expect(useProjectStore.getState().screenOrder).toContain(sid);
    expect(useProjectStore.getState().designSystem).toEqual(warmCoralTheme);
    expect(useProjectStore.getState().designSystemOrigin?.kind).toBe('html_import');
    expect(useProjectStore.getState().settings.colorMode).toBe('dark');
    expect(useProjectStore.getState().settings.deviceProfile).toBe('mobile');
  });
  test('已存在页面时拒绝覆盖全局主题，也拒绝异步串工程', () => {
    const store = useProjectStore.getState(); store.addBlankScreen('原页');
    const count = useProjectStore.getState().screenOrder.length;
    expect(() => seedImportedScreen(screen, { projectId: store.id, designSystem: warmCoralTheme })).toThrow();
    expect(() => seedImportedScreen(screen, { projectId: 'another-project' })).toThrow();
    expect(useProjectStore.getState().screenOrder.length).toBe(count);
    expect(useProjectStore.getState().designSystem).toEqual(defaultTheme);
  });
  test('保存重载保留模式、完整文档与样式，已存在资产撤销后不误删', () => {
    const store = useProjectStore.getState(); store.addAsset(asset);
    useHistoryStore.getState().restore(null);
    const sid = seedImportedScreen(screen, { projectId: store.id, assets: [asset] });
    const exported = JSON.stringify({ id: store.id, name: store.name, settings: store.settings, designSystem: store.designSystem, designSystemOrigin: useProjectStore.getState().designSystemOrigin, screens: useProjectStore.getState().screens, assets: useProjectStore.getState().assets, screenOrder: [sid] });
    useProjectStore.getState().loadProject(exported);
    // Importing a page without extracting/replacing the project theme keeps the project theme provenance.
    expect(useProjectStore.getState().designSystemOrigin?.kind).toBe('project');
    expect(useProjectStore.getState().screens[sid].metadata?.importedHtml?.mode).toBe('preserve');
    expect(useProjectStore.getState().screens[sid].htmlContent).toBe(screen.htmlContent);
    useHistoryStore.getState().undo();
    expect(useProjectStore.getState().assets[asset.id]).toEqual(asset);
  });

  test('主题编辑来源随项目保存并由History撤销恢复', () => {
    const store = useProjectStore.getState();
    const initialTokenVersion = store.designSystemOrigin?.tokenVersion;
    expect(store.designSystemOrigin?.kind).toBe('project');
    store.setDesignSystem(structuredClone(warmCoralTheme));
    expect(useProjectStore.getState().designSystemOrigin?.kind).toBe('project_override');
    const editedTokenVersion = useProjectStore.getState().designSystemOrigin?.tokenVersion;
    expect(editedTokenVersion).toBe((initialTokenVersion ?? 1) + 1);
    expect(useProjectStore.getState().designSystemOrigin?.tokenFingerprint).toBeTruthy();
    useHistoryStore.getState().undo();
    expect(useProjectStore.getState().designSystemOrigin?.kind).toBe('project');
    expect(useProjectStore.getState().designSystemOrigin?.tokenVersion).toBe(initialTokenVersion);
    useHistoryStore.getState().redo();
    expect(useProjectStore.getState().designSystemOrigin?.kind).toBe('project_override');
    expect(useProjectStore.getState().designSystemOrigin?.tokenVersion).toBe(editedTokenVersion);
    const serialized = readProject(store.id);
    expect(JSON.parse(serialized!).designSystemOrigin).toMatchObject({ kind: 'project_override', tokenVersion: editedTokenVersion });
  });
  test('导入素材全局替换匹配相对路径，保留全文档与 CSS 字面文案', () => {
    const doc = new DOMParser().parseFromString(screen.htmlContent, 'text/html');
    doc.documentElement.setAttribute('lang', 'zh'); doc.body.className = 'original-body';
    const style = doc.createElement('style'); style.textContent = `.hero{background-image:url("${asset.relPath}")}.label::before{content:"${asset.relPath}"}`; doc.head.append(style);
    const image = doc.createElement('img'); image.setAttribute('src', asset.relPath); doc.body.append(image);
    const store = useProjectStore.getState(), sid = seedImportedScreen({ ...screen, htmlContent: '<!doctype html>' + doc.documentElement.outerHTML }, { projectId: store.id, assets: [asset] });
    expect(store.replaceAssetGlobally(asset.id, 'https://example.com/replacement.png')).toBeGreaterThan(0);
    const updated = new DOMParser().parseFromString(useProjectStore.getState().screens[sid].htmlContent, 'text/html');
    expect(updated.querySelector('img')?.getAttribute('src')).toBe('https://example.com/replacement.png');
    expect(updated.head.textContent).toContain('background-image:url("https://example.com/replacement.png")');
    expect(updated.head.textContent).toContain(`content:"${asset.relPath}"`);
    expect(updated.body.className).toBe('original-body'); expect(updated.documentElement.lang).toBe('zh');
  });
  test('导入页面提取和分离组件不丢 head 或 body 属性', () => {
    const doc = new DOMParser().parseFromString(screen.htmlContent, 'text/html'); doc.body.className = 'source-body';
    const store = useProjectStore.getState(), sid = seedImportedScreen({ ...screen, htmlContent: '<!doctype html>' + doc.documentElement.outerHTML }, { projectId: store.id });
    const componentId = store.extractComponentFromNode(sid, 'import01', '导入卡片');
    expect(componentId).toBeTruthy();
    store.detachComponentInstance(sid, 'import01');
    const updated = new DOMParser().parseFromString(useProjectStore.getState().screens[sid].htmlContent, 'text/html');
    expect(updated.body.className).toBe('source-body'); expect(updated.head.textContent).toContain('.card{padding:17px}');
  });
});
