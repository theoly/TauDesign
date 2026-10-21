import { describe, test, expect } from 'bun:test';
import {
  buildExportRenderDocument,
  exportScreenPng,
  resolveExportHeight,
  PngExportDeps,
  PngExportOptions
} from '../src/utils/pngExporter';
import { Screen } from '../src/types/project';

const SCREEN: Screen = {
  id: 'sc-1',
  name: '编辑资料',
  position: { x: 0, y: 0 },
  measuredHeight: 900,
  htmlContent:
    '<main data-nid="r1" class="card"><h1 data-nid="h1">编辑资料</h1><button data-nid="b1" class="aidesign-selected">保存修改</button></main>'
};

const BASE_OPTIONS: PngExportOptions = {
  tokensCss: ':root { --color-primary: #ff4d4f; }',
  baseCss: '.card { padding: 16px; }',
  screenOverrides: '[data-nid="h1"] { font-weight: 700; }',
  width: 390,
  fallbackHeight: 900,
  scale: 2,
  bgColor: '#ffffff'
};

const PNG_DATA_URL = 'data:image/png;base64,AAAA';
const LEGACY_DATA_URL = 'data:image/png;base64,BBBB';

describe('高保真 PNG 导出 (High-Fidelity PNG Export)', () => {
  describe('CHK-F-01: 导出文档组装 (BR-PX-01)', () => {
    test('剥离内部标记与编辑器装饰，内联 base/tokens/overrides 并铺底色', () => {
      const doc = buildExportRenderDocument(SCREEN, {
        tokensCss: BASE_OPTIONS.tokensCss,
        baseCss: BASE_OPTIONS.baseCss,
        screenOverrides: BASE_OPTIONS.screenOverrides,
        bgColor: '#101418',
        width: 390
      });

      // 编辑器装饰必须剥离
      expect(doc).not.toContain('aidesign-selected');
      expect(doc).not.toContain('aidesign-hovered');
      expect(doc).not.toContain('editor-chrome');

      // data-nid 必须保留：overrides 以它作选择器，剥离会丢掉全部 L4 手动样式
      const body = doc.slice(doc.indexOf('<body>'), doc.indexOf('</body>'));
      expect(body).toContain('data-nid="h1"');
      expect(body).toContain('class="card"');

      // 三段样式与底色、margin 重置齐备
      expect(doc).toContain('--color-primary: #ff4d4f');
      expect(doc).toContain('.card { padding: 16px; }');
      expect(doc).toContain('[data-nid="h1"] { font-weight: 700; }');
      expect(doc).toContain('background-color: #101418');
      expect(doc).toContain('margin: 0');
      expect(doc).toContain('width: 390px');

      // 正文内容保留
      expect(doc).toContain('编辑资料');
      expect(doc).toContain('保存修改');
    });
  });

  describe('CHK-F-02 & CHK-F-03: 导出高度裁决 (BR-PX-03)', () => {
    test('整页模式取实测值，忽略可能过期的兜底高度', () => {
      expect(resolveExportHeight(4469, { fallbackHeight: 900 })).toBe(4469);
    });

    test('实测失败时才退回兜底高度', () => {
      expect(resolveExportHeight(null, { fallbackHeight: 900 })).toBe(900);
      expect(resolveExportHeight(0, { fallbackHeight: 900 })).toBe(900);
      expect(resolveExportHeight(null, {})).toBe(800);
    });

    test('首屏裁切模式严格取参考线高度，不受实测值影响', () => {
      expect(
        resolveExportHeight(4469, { clipToHeight: true, clipHeight: 844, fallbackHeight: 900 })
      ).toBe(844);
    });

    test('整页导出会把实测高度传给原生渲染器', async () => {
      let receivedHeight = 0;
      const deps: PngExportDeps = {
        isNativeAvailable: () => true,
        measureHeight: async () => 4469,
        nativeExport: async (args) => {
          receivedHeight = args.height;
          return { dataUrl: PNG_DATA_URL, width: args.width * args.scale, height: args.height * args.scale, engine: 'native-webview-pdf' };
        }
      };

      const outcome = await exportScreenPng(SCREEN, BASE_OPTIONS, deps);
      expect(receivedHeight).toBe(4469);
      expect(outcome.cssHeight).toBe(4469);
    });

    test('裁切模式不触发实测，直接按参考线出图', async () => {
      let measured = false;
      const deps: PngExportDeps = {
        isNativeAvailable: () => true,
        measureHeight: async () => {
          measured = true;
          return 4469;
        },
        nativeExport: async (args) => ({
          dataUrl: PNG_DATA_URL,
          width: args.width,
          height: args.height,
          engine: 'native-webview-pdf'
        })
      };

      const outcome = await exportScreenPng(
        SCREEN,
        { ...BASE_OPTIONS, clipToHeight: true, clipHeight: 844 },
        deps
      );
      expect(measured).toBe(false);
      expect(outcome.cssHeight).toBe(844);
    });
  });

  describe('CHK-F-04 ~ CHK-F-06: 引擎选择与回退链 (BR-PX-04/05)', () => {
    test('导入页请求屏幕快照保留复杂背景，并如实回显引擎；普通页保留PDF路径', async () => {
      const imported: Screen = { ...SCREEN, metadata: { importedHtml: { fileName: 'gradient.html', mode: 'preserve', categories: [], changes: [], retained: [], version: 1 } } };
      const preferences: boolean[] = [];
      const deps: PngExportDeps = {
        isNativeAvailable: () => true,
        measureHeight: async () => 1200,
        nativeExport: async args => {
          preferences.push(!!args.preferSnapshot);
          return { dataUrl: PNG_DATA_URL, width: args.width * args.scale, height: args.height * args.scale,
            engine: args.preferSnapshot ? 'native-webview-snapshot' : 'native-webview-pdf' };
        },
        legacyExport: async () => { throw new Error('不应降级'); }
      };
      expect((await exportScreenPng(imported, BASE_OPTIONS, deps)).engine).toBe('native-webview-snapshot');
      expect((await exportScreenPng(SCREEN, BASE_OPTIONS, deps)).engine).toBe('native-webview-pdf');
      expect(preferences).toEqual([true, false]);
    });

    test('导入页快照失败时保留兼容回退和明确原因，不返回已知会失真的PDF', async () => {
      const imported = { ...SCREEN, metadata: { importedHtml: {} as any } };
      const result = await exportScreenPng(imported, BASE_OPTIONS, {
        isNativeAvailable: () => true,
        measureHeight: async () => 1200,
        nativeExport: async args => { expect(args.preferSnapshot).toBe(true); throw new Error('原生整页快照超时'); },
        legacyExport: async () => LEGACY_DATA_URL
      });
      expect(result.engine).toBe('foreign-object');
      expect(result.fallbackReason).toContain('原生整页快照超时');
    });

    test('桌面端优先走原生渲染，结果标记为 native-webview-pdf', async () => {
      const deps: PngExportDeps = {
        isNativeAvailable: () => true,
        measureHeight: async () => 1200,
        nativeExport: async (args) => ({
          dataUrl: PNG_DATA_URL,
          width: args.width * args.scale,
          height: args.height * args.scale,
          engine: 'native-webview-pdf'
        }),
        legacyExport: async () => {
          throw new Error('不应走到兼容路径');
        }
      };

      const outcome = await exportScreenPng(SCREEN, BASE_OPTIONS, deps);
      expect(outcome.engine).toBe('native-webview-pdf');
      expect(outcome.dataUrl).toBe(PNG_DATA_URL);
      expect(outcome.fallbackReason).toBeUndefined();
    });

    test('原生渲染失败时自动回退兼容路径，并记录降级原因', async () => {
      const deps: PngExportDeps = {
        isNativeAvailable: () => true,
        measureHeight: async () => 1200,
        nativeExport: async () => {
          throw new Error('离屏页面加载超时');
        },
        legacyExport: async () => LEGACY_DATA_URL
      };

      const outcome = await exportScreenPng(SCREEN, BASE_OPTIONS, deps);
      expect(outcome.engine).toBe('foreign-object');
      expect(outcome.dataUrl).toBe(LEGACY_DATA_URL);
      expect(outcome.fallbackReason).toContain('离屏页面加载超时');
    });

    test('浏览器环境直接走兼容路径并说明原因', async () => {
      const deps: PngExportDeps = {
        isNativeAvailable: () => false,
        measureHeight: async () => 1200,
        nativeExport: async () => {
          throw new Error('不应调用原生');
        },
        legacyExport: async () => LEGACY_DATA_URL
      };

      const outcome = await exportScreenPng(SCREEN, BASE_OPTIONS, deps);
      expect(outcome.engine).toBe('foreign-object');
      expect(outcome.fallbackReason).toContain('浏览器环境');
    });

    test('两条路径都失败时抛出含双方原因的错误，绝不返回空白图', async () => {
      const deps: PngExportDeps = {
        isNativeAvailable: () => true,
        measureHeight: async () => 1200,
        nativeExport: async () => {
          throw new Error('原生整页渲染超时');
        },
        legacyExport: async () => {
          throw new Error('SVG 结构解码被浏览器拦截');
        }
      };

      await expect(exportScreenPng(SCREEN, BASE_OPTIONS, deps)).rejects.toThrow(
        /原生整页渲染超时[\s\S]*SVG 结构解码被浏览器拦截/
      );
    });

    test('实测高度抛错不致命，回退兜底高度后继续导出', async () => {
      let receivedHeight = 0;
      const deps: PngExportDeps = {
        isNativeAvailable: () => true,
        measureHeight: async () => {
          throw new Error('离屏测量失败');
        },
        nativeExport: async (args) => {
          receivedHeight = args.height;
          return { dataUrl: PNG_DATA_URL, width: args.width, height: args.height, engine: 'native-webview-pdf' };
        }
      };

      const outcome = await exportScreenPng(SCREEN, BASE_OPTIONS, deps);
      expect(receivedHeight).toBe(900);
      expect(outcome.engine).toBe('native-webview-pdf');
    });
  });

  describe('CHK-F-07: 离屏资源清理 (BR-PX-07)', () => {
    test('measureDocumentHeight 无论成败都会摘掉离屏 iframe', async () => {
      const { measureDocumentHeight } = await import('../src/utils/nativeExport');
      const before = document.querySelectorAll('iframe').length;

      await measureDocumentHeight('<!DOCTYPE html><html><body><div>x</div></body></html>', 390, 50);

      expect(document.querySelectorAll('iframe').length).toBe(before);
    });
  });
});
