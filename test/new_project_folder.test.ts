/**
 * 本地工程文件夹新建与未初始化目录处理测试 (T-NPF-04)
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { useProjectStore } from '../src/stores/useProjectStore';
import { useWorkspaceStore } from '../src/stores/useWorkspaceStore';
import { listProjects } from '../src/utils/projectRegistry';
import { techBlueTheme } from '../src/utils/themePresets';
import { createProjectStorage } from '../src/services/storage/projectStorage';
import { ProjectRepository } from '../src/services/storage/projectRepository';
import { folderDisplayName } from '../src/services/storage/folderPicker';

beforeEach(() => {
  localStorage.clear();
  useWorkspaceStore.setState({
    view: 'manager',
    projects: [],
    activeProjectId: null,
    missingIds: [],
    uncleanShutdownAt: null
  });
});

afterEach(() => {
  localStorage.clear();
});

describe('T-NPF-01 · useProjectStore.initNewProject 带 folderPath 支持', () => {
  test('传入 folderPath 时，状态记录 folderPath 并落盘工程文件', async () => {
    const folderPath = '/Users/test/Desktop/my-new-app';
    const id = useProjectStore.getState().initNewProject({
      name: '我的新应用',
      deviceProfile: 'pc',
      designSystem: techBlueTheme,
      initialDecisions: ['保持统一的主色与规范圆角'],
      folderPath,
      createSpecimen: true
    });

    // 等待异步文件写入与锁写入完成
    await new Promise((r) => setTimeout(r, 20));

    const state = useProjectStore.getState();
    expect(state.id).toBe(id);
    expect(state.name).toBe('我的新应用');
    expect(state.folderPath).toBe(folderPath);

    // 验证注册表已写入并且带有 folderPath
    const all = listProjects();
    const currentMeta = all.find((p) => p.id === id);
    expect(currentMeta).toBeDefined();
    expect(currentMeta?.name).toBe('我的新应用');
    expect(currentMeta?.folderPath).toBe(folderPath);

    // 验证 storage 中已生成 project.json 与锁文件
    const storage = createProjectStorage(id, folderPath);
    const repo = new ProjectRepository(storage);
    expect(await repo.isValidProjectFolder()).toBe(true);

    const doc = await repo.load();
    expect(doc).not.toBeNull();
    expect(doc?.name).toBe('我的新应用');
    expect(Object.keys(doc?.screens ?? {}).length).toBe(1);

    // 验证样张画框正文独立成文件
    const firstScreenId = state.screenOrder[0];
    const html = await storage.readText(`screens/${firstScreenId}.html`);
    expect(html).not.toBeNull();
    expect(html).toContain('风格样张');

    // 验证锁文件存在（表示正在被当前 session 占用）
    const lock = await storage.readText('.session.lock');
    expect(lock).not.toBeNull();
    expect(JSON.parse(lock!).openedAt).toBeGreaterThan(0);
  });
});

describe('T-NPF-02 · useWorkspaceStore.createProject 透传 folderPath', () => {
  test('调用 createProject 传入 folderPath 时直接进入工作区并保存到目标路径', async () => {
    const folderPath = '/Users/test/Desktop/a1';
    useWorkspaceStore.getState().createProject(
      'a1',
      'mobile',
      techBlueTheme,
      ['移动端单列流'],
      folderPath
    );

    await new Promise((r) => setTimeout(r, 20));

    const wsState = useWorkspaceStore.getState();
    expect(wsState.view).toBe('workspace');
    expect(wsState.activeProjectId).toBeTruthy();

    const projState = useProjectStore.getState();
    expect(projState.name).toBe('a1');
    expect(projState.folderPath).toBe(folderPath);
    expect(projState.settings.deviceProfile).toBe('mobile');

    // 返回管理页并释放锁
    useWorkspaceStore.getState().backToManager();
    expect(useWorkspaceStore.getState().view).toBe('manager');

    // 验证 lock 已被释放
    const storage = createProjectStorage(projState.id, folderPath);
    expect(await storage.readText('.session.lock')).toBeNull();
  });
});

describe('T-NPF-03 · 目录名称与未初始化检测', () => {
  test('folderDisplayName 正确提取未初始化文件夹名称', () => {
    expect(folderDisplayName('/Users/test/Desktop/a1')).toBe('a1');
    expect(folderDisplayName('/Users/test/Desktop/a1/')).toBe('a1');
    expect(folderDisplayName('C:\\Users\\test\\Desktop\\my_project.aidesign')).toBe('my_project');
  });

  test('缺少 project.json 的目录经 openLocalFolder 检测时返回 notProject: true 与 folderPath', async () => {
    const mockFolder = '/Users/test/Desktop/empty_folder';
    const originalWindow = (globalThis as any).window;
    (globalThis as any).window = {
      isTauri: true,
      __TAURI_INTERNALS__: {
        invoke: async (cmd: string) => {
          if (cmd === 'plugin:dialog|open') {
            return mockFolder;
          }
          return null;
        }
      }
    };

    const result = await useWorkspaceStore.getState().openLocalFolder();
    expect(result.ok).toBe(false);
    expect(result.notProject).toBe(true);
    expect(result.folderPath).toBe(mockFolder);
    expect(result.message).toContain('缺少 project.json');

    (globalThis as any).window = originalWindow;
  });
});
