import { beforeEach, describe, expect, test } from 'bun:test';
import { ProjectRepository, type ProjectDocument } from '../src/services/storage/projectRepository';
import { LocalStorageStorage } from '../src/services/storage/projectStorage';
import { useProjectStore } from '../src/stores/useProjectStore';
import { defaultTheme } from '../src/utils/themePresets';
import { readProject } from '../src/utils/projectRegistry';
import { useHistoryStore } from '../src/stores/useHistoryStore';

const entry = (id = 'requirements') => ({ id, title: '需求', content: '登录与订单', source: 'upload' as const, enabled: true, createdAt: 1, updatedAt: 1, originalContent: '原始需求' });
const project = () => ({ id: 'knowledge-test', name: 'test', settings: { deviceProfile: 'pc' }, designSystem: {}, screens: {}, projectDocuments: { requirements: entry() } }) as ProjectDocument;
let storage: LocalStorageStorage;
let repo: ProjectRepository;
beforeEach(() => {
  localStorage.clear();
  storage = new LocalStorageStorage('knowledge-test');
  repo = new ProjectRepository(storage);
  useProjectStore.getState().initNewProject({ name: 'test', deviceProfile: 'pc', designSystem: defaultTheme });
  useHistoryStore.getState().clear();
});

describe('项目文档存储', () => {
  test('正文和上传原文独立落盘，主文档只含元信息，重开完整恢复', async () => {
    await repo.save(project());
    const raw = JSON.parse((await storage.readText('project.json'))!);
    expect(raw.projectDocuments.requirements.content).toBeUndefined();
    expect(raw.projectDocuments.requirements.originalContent).toBeUndefined();
    expect(await storage.readText('documents/requirements.md')).toBe('登录与订单');
    expect(await storage.readText('documents/requirements.original.md')).toBe('原始需求');
    expect((await repo.load())?.projectDocuments?.requirements).toMatchObject(entry());
  });
  test('旧工程默认空文档且工程切换清除上一工程文档', async () => {
    const old = project(); delete old.projectDocuments;
    await repo.save(old);
    expect((await repo.load())?.projectDocuments).toEqual({});
    useProjectStore.getState().upsertProjectDocument(entry());
    useProjectStore.getState().loadProject(JSON.stringify(old));
    expect(useProjectStore.getState().projectDocuments).toEqual({});
  });
  test('缺失正文明确标记并禁用，重存不生成空白替代文件', async () => {
    await repo.save(project());
    const meta = JSON.parse((await storage.readText('project.json'))!).projectDocuments.requirements;
    await storage.remove(meta.contentFile || 'documents/requirements.md');
    const loaded = (await repo.load())!;
    expect(loaded.projectDocuments?.requirements).toMatchObject({ missing: true, enabled: false });
    await repo.save(loaded);
    expect(await storage.readText(meta.contentFile || 'documents/requirements.md')).toBeNull();
    expect((await repo.load())?.projectDocuments?.requirements.missing).toBe(true);
  });
  test('失败的元信息提交不会使之前的文档正文变成新版本', async () => {
    await repo.save(project());
    const write = storage.writeTextAtomic.bind(storage);
    storage.writeTextAtomic = async (rel, text) => { if (rel === 'project.json') throw new Error('disk full'); await write(rel, text); };
    const next = project(); next.projectDocuments!.requirements.content = '修改后的需求';
    await expect(repo.save(next)).rejects.toThrow('disk full');
    expect((await repo.load())?.projectDocuments?.requirements.content).toBe('登录与订单');
  });
  test('正文未变的连续自动保存复用版本且不重写正文文件', async () => {
    await repo.save(project());
    const beforeFiles = await storage.listDir('documents');
    const writes: string[] = [];
    const write = storage.writeTextAtomic.bind(storage);
    storage.writeTextAtomic = async (rel, text) => { writes.push(rel); await write(rel, text); };
    const next = project(); next.name = '仅修改工程名称';
    await repo.save(next);
    expect(await storage.listDir('documents')).toEqual(beforeFiles);
    expect(writes.filter((rel) => rel.startsWith('documents/'))).toEqual([]);
    next.projectDocuments!.requirements.content = '正文变化';
    await repo.save(next);
    expect((await storage.listDir('documents')).length).toBe(beforeFiles.length + 1);
    expect((await repo.load())?.projectDocuments?.requirements.content).toBe('正文变化');
  });
  test('并发自动保存按调用快照顺序提交且不同repository实例共享顺序', async () => {
    const first = project(); const second = project();
    second.projectDocuments!.requirements.content = '最后一次编辑';
    const firstSave = repo.save(first);
    first.projectDocuments!.requirements.content = '调用后的外部变更';
    const secondSave = new ProjectRepository(storage).save(second);
    await Promise.all([firstSave, secondSave]);
    expect((await repo.load())?.projectDocuments?.requirements.content).toBe('最后一次编辑');
  });
  test('新建工程重置文档，空正文与正文缺失有明确区别', async () => {
    const doc = project(); doc.projectDocuments!.requirements.content = '';
    await repo.save(doc);
    expect((await repo.load())?.projectDocuments?.requirements).toMatchObject({ content: '', enabled: true });
    expect((await repo.load())?.projectDocuments?.requirements.missing).not.toBe(true);
    useProjectStore.getState().upsertProjectDocument(entry());
    useProjectStore.getState().initNewProject({ name: '另一个项目', deviceProfile: 'pc', designSystem: defaultTheme });
    expect(useProjectStore.getState().projectDocuments).toEqual({});
  });
  test('持久化拒绝路径穿越，上传原文不可被后续保存覆盖', async () => {
    await repo.save(project());
    const next = project(); next.projectDocuments!.requirements.originalContent = '被篡改的原文';
    await repo.save(next);
    expect((await repo.load())?.projectDocuments?.requirements.originalContent).toBe('原始需求');
    const invalid = project(); invalid.projectDocuments = { '../bad': entry('../bad') };
    await expect(repo.save(invalid)).rejects.toThrow();
  });
});

describe('项目文档历史动作', () => {
  test('新增、编辑、启停、删除均支持Undo/Redo，原文保持不变', () => {
    const store = useProjectStore.getState();
    store.upsertProjectDocument(entry());
    store.upsertProjectDocument({ ...entry(), content: '新正文', originalContent: '篡改', enabled: false });
    expect(useProjectStore.getState().projectDocuments.requirements.originalContent).toBe('原始需求');
    useHistoryStore.getState().undo();
    expect(useProjectStore.getState().projectDocuments.requirements.content).toBe('登录与订单');
    useHistoryStore.getState().redo();
    expect(useProjectStore.getState().projectDocuments.requirements.enabled).toBe(false);
    store.removeProjectDocument('requirements');
    expect(useProjectStore.getState().projectDocuments).toEqual({});
    useHistoryStore.getState().undo();
    expect(useProjectStore.getState().projectDocuments.requirements.content).toBe('新正文');
    const saved = readProject(useProjectStore.getState().id);
    expect(JSON.parse(saved!).projectDocuments.requirements.content).toBe('新正文');
  });
  test('标题、ID、UTF8字节上限、最多20份受保护，拒绝不会创建历史', () => {
    const store = useProjectStore.getState();
    expect(() => store.upsertProjectDocument({ ...entry(), title: ' ' })).toThrow();
    expect(() => store.upsertProjectDocument(entry('../bad'))).toThrow();
    expect(() => store.upsertProjectDocument({ ...entry(), content: '汉'.repeat(22000) })).toThrow();
    expect(useHistoryStore.getState().past.length).toBe(0);
    for (let i = 0; i < 20; i++) store.upsertProjectDocument(entry(`doc-${i}`));
    expect(() => store.upsertProjectDocument(entry('overflow'))).toThrow();
    store.upsertProjectDocument({ ...entry('doc-0'), content: '编辑现有' });
    expect(Object.keys(useProjectStore.getState().projectDocuments).length).toBe(20);
  });
});
