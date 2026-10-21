import { describe, expect, test } from 'bun:test';
import { buildScreenDocument, projectCssForScreen, runtimeStyle } from '../src/utils/screenDocument';
import { buildStandaloneHtml } from '../src/utils/exportRenderer';
import { buildExportRenderDocument } from '../src/utils/pngExporter';
import type { Screen } from '../src/types/project';

const imported: Screen = { id: 'import', name: '<测试 & 页面>', position: { x: 0, y: 0 },
  htmlContent: '<!doctype html><html lang="en" class="source"><head><title>Source</title><style>:root{--color-bg:pink}.card{padding:23px}</style></head><body class="original" style="margin:13px"><main data-nid="abcdefgh" class="card"><button>继续</button></main></body></html>',
  scopedCss: '.card{border-radius:17px}',
  metadata: { importedHtml: { fileName: 'source.html', mode: 'preserve', categories: [], changes: [], retained: [], version: 1 } } };
const options = { tokensCss: ':root{--color-bg:gray;--space-4:16px}', baseCss: 'body{margin:0}.card{padding:16px}', screenOverrides: '[data-nid="abcdefgh"]{color:var(--color-primary)}' };

describe('共享画框文档组合', () => {
  test('原貌导入保留完整文档属性与样式，没有基座重置或嵌套文档', () => {
    const html = buildScreenDocument(imported, options);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    expect(doc.documentElement.className).toBe('source');
    expect(doc.body.className).toBe('original');
    expect(doc.body.style.margin).toBe('13px');
    expect(html.match(/<html\b/g)?.length).toBe(1);
    expect(html.match(/<body\b/g)?.length).toBe(1);
    expect(runtimeStyle(doc, 'base-css')?.textContent).toBe('');
    expect(runtimeStyle(doc, 'tokens')?.textContent).toContain('--td-import-color-bg:gray');
    expect(runtimeStyle(doc, 'tokens')?.textContent).not.toContain('--color-bg:gray');
    expect(doc.head.textContent).toContain('--color-bg:pink');
    expect(runtimeStyle(doc, 'overrides')?.textContent).toContain('var(--td-import-color-primary)');
    expect(doc.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content')).toContain("script-src 'none'");
  });
  test('原生页面继续使用基座与标准 Token，L4 最后覆盖', () => {
    const screen = { ...imported, metadata: undefined, htmlContent: '<main data-nid="abcdefgh">原生</main>' };
    const doc = new DOMParser().parseFromString(buildScreenDocument(screen, options), 'text/html');
    expect(runtimeStyle(doc, 'base-css')?.textContent).toBe(options.baseCss);
    expect(runtimeStyle(doc, 'tokens')?.textContent).toBe(options.tokensCss);
    expect(runtimeStyle(doc, 'overrides')?.textContent).toBe(options.screenOverrides);
    expect(doc.body.textContent).toBe('原生');
    expect(runtimeStyle(doc, 'import-compat')).toBeNull();
  });
  test('旧导入页在所有渲染出口补齐WebKit按钮默认对齐，兼容层先于来源层且不改存盘HTML', () => {
    const source = { ...imported, htmlContent: '<html><head><style>@layer base,utilities;@layer utilities{.items-center{align-items:center}}.narrow{width:32px;align-self:center}</style></head><body><button class="items-center" style="align-items:end"><span class="narrow">内容</span></button></body></html>' };
    const originalHtml = source.htmlContent;
    for (const html of [buildScreenDocument(source, options), buildStandaloneHtml(source, options), buildExportRenderDocument(source, { ...options, width: 390 })]) {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const compat = runtimeStyle(doc, 'import-compat')!;
      expect(compat.textContent).toBe('@layer taudesign-import-compat { :where(button) { align-items: normal; } }');
      expect(doc.head.querySelector('style')).toBe(compat);
      expect(doc.querySelector('button')?.getAttribute('style')).toBe('align-items:end');
      expect(doc.head.textContent).toContain('@layer utilities{.items-center{align-items:center}}');
      expect(doc.head.textContent).toContain('.narrow{width:32px;align-self:center}');
    }
    expect(source.htmlContent).toBe(originalHtml);
  });
  test('HTML 与 PNG 导出同样保留来源样式与文档属性', () => {
    for (const html of [buildStandaloneHtml(imported, options), buildExportRenderDocument(imported, { ...options, width: 390, bgColor: '#fff' })]) {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      expect(doc.body.className).toBe('original');
      expect(doc.head.textContent).toContain('.card{padding:23px}');
      expect(doc.head.textContent).toContain('border-radius:17px');
      expect(doc.head.textContent).not.toContain(options.baseCss);
      expect(doc.title).toBe(imported.name);
    }
  });
  test('样式正文不能逃逸 style 标签，运行时标记不与来源 id 冲突', () => {
    const source = { ...imported, htmlContent: '<html><head><style id="tokens">.x{color:red}</style></head><body><h1>安全</h1></body></html>', scopedCss: '.x::before{content:"</style><script>bad()</script>"}' };
    const doc = new DOMParser().parseFromString(buildScreenDocument(source, options), 'text/html');
    expect(doc.querySelectorAll('script').length).toBe(0);
    expect(runtimeStyle(doc, 'tokens')?.textContent).toContain('--td-import-color-bg');
    expect(projectCssForScreen(imported, '--color-bg:var(--color-primary);--my-custom:1')).toBe('--td-import-color-bg:var(--td-import-color-primary);--my-custom:1');
  });
});
