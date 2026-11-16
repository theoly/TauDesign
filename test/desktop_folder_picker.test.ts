import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';
import { isDesktopRuntime, pickProjectFolder, folderDisplayName } from '../src/services/storage/folderPicker';
import { createProjectStorage, TauriFolderStorage, LocalStorageStorage } from '../src/services/storage/projectStorage';

describe('桌面运行时与文件夹选择器 (Desktop Folder Picker)', () => {
  const originalWindow = globalThis.window;

  afterEach(() => {
    // 恢复测试环境 window 上的 mock
    if (globalThis.window) {
      delete (globalThis.window as any).isTauri;
      delete (globalThis.window as any).__TAURI_INTERNALS__;
      delete (globalThis.window as any).__TAURI__;
    }
  });

  describe('isDesktopRuntime 运行时环境判定', () => {
    test('CHK-F-03: 默认测试/浏览器环境下严格返回 false', () => {
      expect(isDesktopRuntime()).toBe(false);
    });

    test('CHK-F-04: window.isTauri 为 true 时判定为桌面环境', () => {
      (globalThis.window as any).isTauri = true;
      expect(isDesktopRuntime()).toBe(true);
    });

    test('CHK-F-04: window.__TAURI_INTERNALS__ 注入时判定为桌面环境', () => {
      (globalThis.window as any).__TAURI_INTERNALS__ = { plugins: {} };
      expect(isDesktopRuntime()).toBe(true);
    });

    test('CHK-F-04: window.__TAURI__.core.invoke 存在时判定为桌面环境', () => {
      (globalThis.window as any).__TAURI__ = {
        core: {
          invoke: async () => {}
        }
      };
      expect(isDesktopRuntime()).toBe(true);
    });
  });

  describe('folderDisplayName 路径解析', () => {
    test('标准 .aidesign 工程路径提取主名', () => {
      expect(folderDisplayName('/Users/test/workspace/my-design.aidesign')).toBe('my-design');
      expect(folderDisplayName('C:\\Users\\test\\my-design.aidesign\\')).toBe('my-design');
    });

    test('普通目录路径提取末级目录名', () => {
      expect(folderDisplayName('/home/dev/projects/awesome-ui')).toBe('awesome-ui');
      expect(folderDisplayName('/home/dev/projects/awesome-ui/')).toBe('awesome-ui');
    });
  });

  describe('pickProjectFolder 文件夹选取行为', () => {
    test('CHK-F-05: 非桌面环境下安全返回 null', async () => {
      const result = await pickProjectFolder();
      expect(result).toBeNull();
    });

    test('CHK-F-06: 桌面环境下支持单选路径', async () => {
      (globalThis.window as any).isTauri = true;
      (globalThis.window as any).__TAURI_INTERNALS__ = {
        invoke: async (cmd: string, args: any) => {
          if (cmd === 'plugin:dialog|open') {
            return '/Users/test/workspace/test.aidesign';
          }
          return null;
        }
      };

      const result = await pickProjectFolder('选择测试工程');
      expect(result).toBe('/Users/test/workspace/test.aidesign');
    });

    test('CHK-F-06: 桌面环境下支持数组格式返回值解包', async () => {
      (globalThis.window as any).isTauri = true;
      (globalThis.window as any).__TAURI_INTERNALS__ = {
        invoke: async (cmd: string) => {
          if (cmd === 'plugin:dialog|open') {
            return ['/Users/test/workspace/array-path.aidesign'];
          }
          return null;
        }
      };

      const result = await pickProjectFolder();
      expect(result).toBe('/Users/test/workspace/array-path.aidesign');
    });

    test('CHK-F-06: 用户取消选择时返回 null', async () => {
      (globalThis.window as any).isTauri = true;
      (globalThis.window as any).__TAURI_INTERNALS__ = {
        invoke: async () => null
      };

      const result = await pickProjectFolder();
      expect(result).toBeNull();
    });

    test('CHK-F-06: 后端异常时安全捕获并返回 null', async () => {
      (globalThis.window as any).isTauri = true;
      (globalThis.window as any).__TAURI_INTERNALS__ = {
        invoke: async () => {
          throw new Error('IPC failed');
        }
      };

      const result = await pickProjectFolder();
      expect(result).toBeNull();
    });
  });

  describe('createProjectStorage 存储实现分发', () => {
    test('CHK-F-07: 非桌面环境即使带 folderPath 也回退 LocalStorageStorage', () => {
      const storage = createProjectStorage('proj_1', '/Users/test/dir');
      expect(storage.kind).toBe('localStorage');
      expect(storage instanceof LocalStorageStorage).toBe(true);
    });

    test('CHK-F-07: 桌面环境下带 folderPath 创建 TauriFolderStorage', () => {
      (globalThis.window as any).isTauri = true;
      (globalThis.window as any).__TAURI_INTERNALS__ = {
        invoke: async () => {}
      };

      const storage = createProjectStorage('proj_1', '/Users/test/dir');
      expect(storage.kind).toBe('folder');
      expect(storage instanceof TauriFolderStorage).toBe(true);
    });

    test('CHK-F-07: 桌面环境下不带 folderPath 回退 LocalStorageStorage', () => {
      (globalThis.window as any).isTauri = true;
      (globalThis.window as any).__TAURI_INTERNALS__ = {
        invoke: async () => {}
      };

      const storage = createProjectStorage('proj_1');
      expect(storage.kind).toBe('localStorage');
    });
  });
});
