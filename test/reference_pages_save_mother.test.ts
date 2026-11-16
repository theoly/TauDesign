import { beforeEach, describe, expect, test } from 'bun:test';
import { listActiveMothers } from '../src/reference-pages/catalog';
import { listActiveBuiltinMotherMeta } from '../src/reference-pages/builtinMetaIndex';
import {
  draftMotherFromScreen,
  listProjectLocalMothers,
  loadProjectLocalMother,
  MOTHERS_INDEX,
  saveActiveScreenAsProjectMother,
  saveMotherProjectLocal,
  saveMotherUserGlobal
} from '../src/reference-pages/saveMother';
import { ProjectRepository } from '../src/services/storage/projectRepository';
import { LocalStorageStorage } from '../src/services/storage/projectStorage';

describe('reference-pages project-local mother save/load (E4c)', () => {
  let storage: LocalStorageStorage;

  beforeEach(() => {
    localStorage.clear();
    storage = new LocalStorageStorage(`mother-e4c-${crypto.randomUUID()}`);
  });

  test('missing mothers/ directory loads as empty (legacy projects)', async () => {
    expect(await listProjectLocalMothers(storage)).toEqual([]);
    expect(await storage.readText(MOTHERS_INDEX)).toBeNull();
    const repo = new ProjectRepository(storage);
    expect(await repo.listProjectMothers()).toEqual([]);
  });

  test('save then load project-local mother via storage helpers', async () => {
    const fixture = listActiveMothers({ forceReload: true }).find((m) => m.meta.id === 'pc-list-cards');
    expect(fixture).toBeTruthy();
    const { mother, ingest } = draftMotherFromScreen({
      bodyHtml: fixture!.bodyHtml,
      device: 'pc',
      pageKind: 'list',
      title: '订单列表',
      id: 'local-order-list'
    });
    expect(ingest.ok).toBe(true);
    expect(mother.meta.origin).toBe('project-local');

    const saved = await saveMotherProjectLocal(storage, mother);
    expect(saved.ok).toBe(true);
    expect(saved.mother?.meta.id).toBe('local-order-list');

    const indexRaw = await storage.readText(MOTHERS_INDEX);
    expect(indexRaw).toContain('local-order-list');
    expect(await storage.readText('mothers/local-order-list/body.html')).toBe(fixture!.bodyHtml);

    const loaded = await loadProjectLocalMother(storage, 'local-order-list');
    expect(loaded?.meta.id).toBe('local-order-list');
    expect(loaded?.meta.origin).toBe('project-local');
    expect(loaded?.bodyHtml).toBe(fixture!.bodyHtml);

    const listed = await listProjectLocalMothers(storage);
    expect(listed.map((m) => m.meta.id)).toEqual(['local-order-list']);
  });

  test('ProjectRepository.saveProjectMother round-trips', async () => {
    const fixture = listActiveMothers({ forceReload: true })[0]!;
    const draft = draftMotherFromScreen({
      bodyHtml: fixture.bodyHtml,
      device: fixture.meta.device,
      pageKind: fixture.meta.pageKind,
      id: 'local-repo-roundtrip'
    });
    expect(draft.ingest.ok).toBe(true);

    const repo = new ProjectRepository(storage);
    const result = await repo.saveProjectMother(draft.mother);
    expect(result.ok).toBe(true);
    const listed = await repo.listProjectMothers();
    expect(listed).toHaveLength(1);
    expect(listed[0]!.meta.id).toBe('local-repo-roundtrip');
    expect((await repo.loadProjectMother('local-repo-roundtrip'))?.bodyHtml).toBe(fixture.bodyHtml);
  });

  test('saveActiveScreenAsProjectMother rejects unknown classes', async () => {
    const result = await saveActiveScreenAsProjectMother(storage, {
      bodyHtml: '<main class="p-4 totally-fake-class">x</main>',
      device: 'pc',
      title: 'bad'
    });
    expect(result.ok).toBe(false);
    expect(result.ingest.unknownClassCount).toBeGreaterThan(0);
    expect(await listProjectLocalMothers(storage)).toEqual([]);
  });

  test('user-global save is stubbed until appData helper exists', async () => {
    const fixture = listActiveMothers({ forceReload: true })[0]!;
    const draft = draftMotherFromScreen({
      bodyHtml: fixture.bodyHtml,
      device: fixture.meta.device,
      id: 'local-should-not-global'
    });
    draft.mother.meta.origin = 'user-global';
    const result = await saveMotherUserGlobal(draft.mother);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/user-global/);
  });

  test('browser-safe builtin meta index matches active catalog ids', () => {
    const catalogIds = listActiveMothers({ forceReload: true }).map((m) => m.meta.id).sort();
    const metaIds = listActiveBuiltinMotherMeta().map((m) => m.id).sort();
    expect(metaIds).toEqual(catalogIds);
    expect(metaIds.length).toBeGreaterThanOrEqual(1);
  });
});
