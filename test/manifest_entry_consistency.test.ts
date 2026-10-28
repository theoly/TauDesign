import { beforeEach, expect, test } from 'bun:test';
import { ProjectRepository, normalizeToArtifactManifest, type ProjectDocument } from '../src/services/storage/projectRepository';
import { LocalStorageStorage } from '../src/services/storage/projectStorage';
import { useProjectStore } from '../src/stores/useProjectStore';
import { useHistoryStore } from '../src/stores/useHistoryStore';
import { neutralModernTheme } from '../src/utils/themePresets';

const sourceHtml = '<main data-nid="original"><p data-nid="copytext">原页正文</p></main>';
const copyHtml = '<main data-nid="copyroot"><p data-nid="copytext">副本独立正文</p></main>';
const document = (): ProjectDocument => ({
  id: crypto.randomUUID(), name: '清单一致性回归',
  settings: { deviceProfile: 'mobile' }, designSystem: { id: neutralModernTheme.id },
  screens: {
    original: { id: 'original', name: '原页', entry: 'screens/original.html', position: { x: 0, y: 0 }, htmlContent: sourceHtml },
    copy: { id: 'copy', name: '旧副本', entry: 'screens/original.html', position: { x: 500, y: 0 }, htmlContent: copyHtml }
  },
  screenOrder: ['original', 'copy'], overrides: { 'copy:copytext': { display: 'block' } }
});

beforeEach(() => { localStorage.clear(); });

test('manifest entry always describes the canonical page body, including stale or external entries', () => {
  for (const entry of [undefined, '', 'screens/original.html', '../original.html', 'https://example.invalid/page.html']) {
    expect(normalizeToArtifactManifest({ id: 'copy', entry }, 'mobile').entry).toBe('screens/copy.html');
  }
});

test('copy entry belongs to the new id immediately and survives the same undo/redo transaction', () => {
  const store = useProjectStore;
  store.getState().initNewProject({ name: '副本路径', deviceProfile: 'mobile', designSystem: neutralModernTheme, createSpecimen: false });
  store.getState().addScreen({ name: '原页', htmlContent: sourceHtml, position: { x: 0, y: 0 }, entry: 'screens/original.html' }, 'original');
  const original = structuredClone(store.getState().screens.original);
  const before = useHistoryStore.getState().past.length;
  const id = store.getState().duplicateScreen('original')!;
  const copy = structuredClone(store.getState().screens[id]);
  expect(copy.entry).toBe(`screens/${id}.html`);
  expect(copy.htmlContent).not.toBe(original.htmlContent);
  expect(new DOMParser().parseFromString(copy.htmlContent, 'text/html').body.textContent).toBe('原页正文');
  expect(store.getState().screens.original).toEqual(original);
  expect(useHistoryStore.getState().past.length).toBe(before + 1);
  useHistoryStore.getState().undo();
  expect(store.getState().screens[id]).toBeUndefined();
  useHistoryStore.getState().redo();
  expect(store.getState().screens[id]).toEqual(copy);
  expect(store.getState().screens.original).toEqual(original);
});

test('save repairs stale entry in project metadata and sidecar, and their readers obtain the copy body', async () => {
  const storage = new LocalStorageStorage(crypto.randomUUID());
  const repo = new ProjectRepository(storage), doc = document();
  await repo.save(doc);
  const index = JSON.parse((await storage.readText('project.json'))!);
  const manifest = JSON.parse((await storage.readText('screens/copy.manifest.json'))!);
  expect(index.screens.copy.entry).toBe('screens/copy.html');
  expect(manifest.entry).toBe(index.screens.copy.entry);
  expect(await storage.readText(manifest.entry)).toBe(copyHtml);
  expect(await storage.readText(index.screens.original.entry)).toBe(sourceHtml);
  const reopened = (await repo.load())!;
  expect(reopened.screens.copy.htmlContent).toBe(copyHtml);
  expect(reopened.overrides).toEqual(doc.overrides);
  expect(doc.screens.copy.entry).toBe('screens/original.html'); // normalizing a saved snapshot cannot mutate its caller
});

test('load corrects legacy copied entry without writing or following it, next save repairs the index', async () => {
  const storage = new LocalStorageStorage(crypto.randomUUID()), repo = new ProjectRepository(storage);
  const legacy = document();
  await storage.writeTextAtomic('project.json', JSON.stringify(legacy));
  await storage.writeTextAtomic('screens/original.html', sourceHtml);
  await storage.writeTextAtomic('screens/copy.html', copyHtml);
  const originalIndex = await storage.readText('project.json');
  const loaded = (await repo.load())!;
  expect(loaded.screens.copy.entry).toBe('screens/copy.html');
  expect(loaded.screens.copy.htmlContent).toBe(copyHtml);
  expect(await storage.readText('project.json')).toBe(originalIndex);
  await repo.save(loaded);
  expect(JSON.parse((await storage.readText('project.json'))!).screens.copy.entry).toBe('screens/copy.html');
  expect(JSON.parse((await storage.readText('screens/copy.manifest.json'))!).entry).toBe('screens/copy.html');
  expect(await storage.readText('screens/original.html')).toBe(sourceHtml);
});

test('missing canonical copy body is not replaced with content from the inherited original entry', async () => {
  const storage = new LocalStorageStorage(crypto.randomUUID()), repo = new ProjectRepository(storage);
  await storage.writeTextAtomic('project.json', JSON.stringify(document()));
  await storage.writeTextAtomic('screens/original.html', sourceHtml);
  const loaded = (await repo.load())!;
  expect(loaded.screens.copy).toBeUndefined();
  expect(loaded.screens.original.htmlContent).toBe(sourceHtml);
});
