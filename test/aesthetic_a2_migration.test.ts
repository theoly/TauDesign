/**
 * A2 §5.2 · 工程文件夹、迁移与崩溃恢复 验收测试 (T-AE-40/42/43/44)
 */
import { describe, test, expect, beforeEach } from 'bun:test';
import { LocalStorageStorage, type ProjectStorage } from '../src/services/storage/projectStorage';
import { ProjectRepository, migrateProjectToFolder } from '../src/services/storage/projectRepository';
import { folderDisplayName, isDesktopRuntime } from '../src/services/storage/folderPicker';
import {managedSnapshot} from '../src/services/storage/managedProjectSnapshot';

const doc = (screens: Record<string, { id: string; name: string; htmlContent: string; scopedCss?: string }>) => ({
  id: 'proj_x',
  name: '演示工程',
  schemaVersion: 1,
  createdAt: 1,
  settings: { deviceProfile: 'pc' as const, frameWidth: 1440 },
  designSystem: { id: 'ds', name: 'DS', tokens: {} },
  screens,
  decisions: [],
  assets: []
});

const SAMPLE = doc({
  s1: { id: 's1', name: '登录页', htmlContent: '<div class="card p-6">登录</div>', scopedCss: '.x{color:red}' },
  s2: { id: 's2', name: '仪表盘', htmlContent: '<main class="p-8">仪表盘</main>' }
});

let storage: ProjectStorage;
let repo: ProjectRepository;

beforeEach(() => {
  localStorage.clear();
  storage = new LocalStorageStorage('folder-'+crypto.randomUUID());
  repo = new ProjectRepository(storage);
});

describe('T-AE-40 · 工程文件夹结构 (PRD §2.7)', () => {
  test('画框正文外置为独立文件，project.json 不含 HTML', async () => {
    await repo.save(SAMPLE as never);
    expect(await storage.readText('screens/s1.html')).toBe('<div class="card p-6">登录</div>');
    expect(await storage.readText('screens/s1.css')).toBe('.x{color:red}');
    const pj = await storage.readText('project.json');
    expect(pj).not.toContain('<div class="card p-6">');
    // 画框元信息仍在 project.json 中
    expect(pj).toContain('登录页');
  });

  test('base.css 随工程落盘，供白名单解析 (PRD §2.3.1)', async () => {
    await repo.save(SAMPLE as never);
    const css = await storage.readText('base.css');
    expect(css).toContain('.card');
    expect(css).toContain('container-max'); // PC 档位切片
  });

  test('DESIGN.md 随工程落盘，形成设计散文副本 (REQ-OD-03 / CHK-OD-07)', async () => {
    await repo.save(SAMPLE as never);
    const prose = await repo.getDesignProseMarkdown();
    expect(prose).not.toBeNull();
    expect(prose).toContain('# DESIGN SPECIFICATION');
    expect(prose).toContain('60-30-10 配色法则');
  });

  test('存读往返后画框内容逐字节一致', async () => {
    await repo.save(SAMPLE as never);
    const back = await repo.load();
    expect(back!.screens.s1.htmlContent).toBe(SAMPLE.screens.s1.htmlContent);
    expect(back!.screens.s2.htmlContent).toBe(SAMPLE.screens.s2.htmlContent);
    expect(back!.screens.s1.scopedCss).toBe('.x{color:red}');
  });

  test('单个画框文件缺失只跳过该画框（局部损坏可局部恢复）', async () => {
    await repo.save(SAMPLE as never);
    await storage.remove('screens/s2.html');
    const back = await repo.load();
    expect(Object.keys(back!.screens)).toEqual(['s1']);
  });

  test('project.json 缺失或损坏时返回 null 而非抛出', async () => {
    expect(await repo.load()).toBeNull();
    await storage.writeTextAtomic('project.json', '{ 损坏');
    expect(await repo.load()).toBeNull();
    expect(await repo.isValidProjectFolder()).toBe(true);
  });
});

describe('T-AE-42 · 迁移零丢失（门禁项）', () => {
  test('迁移后逐画框读回验证通过', async () => {
    const r = await migrateProjectToFolder(JSON.stringify(SAMPLE), storage);
    expect(r.ok).toBe(true);
    expect(r.screenCount).toBe(2);
    const back = await repo.load();
    expect(back!.screens.s1.htmlContent).toBe(SAMPLE.screens.s1.htmlContent);
  });

  test('始终保留备份，源数据不在验证通过前被触碰', async () => {
    const source = JSON.stringify(SAMPLE);
    const r = await migrateProjectToFolder(source, storage);
    expect(r.backup).toBe(source);
  });

  test('源数据损坏时判定失败且不写出半成品', async () => {
    const r = await migrateProjectToFolder('{ 不是合法 JSON', storage);
    expect(r.ok).toBe(false);
    expect(r.error).toContain('解析失败');
    expect(await storage.readText('project.json')).toBeNull();
  });

  test('读回不一致时判定失败（验证确实在做事）', async () => {
    // 用一个会静默丢内容的存储模拟写入异常
    const lossy: ProjectStorage = {
      ...storage,
      kind: 'localStorage',
      scopeKey:storage.scopeKey,
      readManagedSnapshot:async()=>{const snapshot=await storage.readManagedSnapshot!();if(snapshot.files['screens/s2.html'])snapshot.files['screens/s2.html']='被篡改';return managedSnapshot(snapshot.files);},
      publishManagedSnapshot:(expected,changes,resources)=>storage.publishManagedSnapshot!(expected,changes,resources),
      ensureDir: () => storage.ensureDir(''),
      exists: (r) => storage.exists(r),
      readText: (r) => storage.readText(r),
      writeTextAtomic: (r, c) => storage.writeTextAtomic(r, r.endsWith('s2.html') ? '被篡改' : c),
      appendLine: (r, l) => storage.appendLine(r, l),
      readTailLines: (r, n) => storage.readTailLines(r, n),
      readAllLines: (r) => storage.readAllLines(r),
      writeBinary: (r, b) => storage.writeBinary(r, b),
      listDir: (r) => storage.listDir(r),
      remove: (r) => storage.remove(r)
    };
    const r = await migrateProjectToFolder(JSON.stringify(SAMPLE), lossy);
    expect(r.ok).toBe(false);
    expect(r.error).toContain('内容不一致');
  });
});

describe('T-AE-43 · 打开本地工程', () => {
  test('有效工程文件夹可识别', async () => {
    expect(await repo.isValidProjectFolder()).toBe(false);
    await repo.save(SAMPLE as never);
    expect(await repo.isValidProjectFolder()).toBe(true);
  });

  test('浏览器环境下不冒充桌面能力', () => {
    expect(isDesktopRuntime()).toBe(false);
  });

  test('从路径取工程显示名', () => {
    expect(folderDisplayName('/Users/a/Design/MyProject.aidesign')).toBe('MyProject');
    expect(folderDisplayName('/Users/a/Design/Plain/')).toBe('Plain');
  });
});

describe('T-AE-44 · 崩溃恢复 (PRD §3.8.5)', () => {
  test('正常关闭后不报异常退出', async () => {
    await repo.acquireLock();
    await repo.releaseLock();
    expect(await repo.detectUncleanShutdown()).toBeNull();
  });

  test('未释放 lock 即判定为异常退出，并给出时间', async () => {
    await repo.acquireLock();
    const at = await repo.detectUncleanShutdown();
    expect(typeof at).toBe('number');
    expect(at!).toBeLessThanOrEqual(Date.now());
  });

  test('lock 内容损坏时仍判定为异常退出，不静默放过', async () => {
    await storage.writeTextAtomic('.session.lock', '损坏内容');
    expect(await repo.detectUncleanShutdown()).not.toBeNull();
  });
});
