import { describe, expect, test } from 'bun:test';
import { LocalStorageStorage } from '../src/services/storage/projectStorage';
import { prepareImportResources, persistImportResources, resolveImportedResources, replaceCssResourceUrl } from '../src/services/import/importResources';
import { analyzeHtmlImport } from '../src/services/import/htmlImport';

const file = (path: string, content: string, type = '') => ({ path, file: new File([content], path.split('/').pop()!, { type }) });
const parse = (html: string) => new DOMParser().parseFromString(html, 'text/html');

describe('HTML import resource preparation', () => {
  test('inlines nested stylesheets in source order and resolves each stylesheet relative URLs', async () => {
    const result = await prepareImportResources('<html><head><style>.x{color:red}</style><link rel="stylesheet" href="css/main.css" media="screen"><style>.x{color:blue}</style></head><body><img src="img/photo.png"></body></html>', 'site/index.html', [
      file('site/css/main.css', '@import "nested/card.css" print; .x{background:url(../img/photo.png)}'),
      file('site/css/nested/card.css', '@font-face{font-family:Demo;src:url(../../fonts/demo.woff2)}.card{border:0}'),
      file('site/img/photo.png', 'raster', 'image/png'), file('site/fonts/demo.woff2', 'font', 'font/woff2'),
    ]);
    const doc = parse(result.html);
    const styles = [...doc.querySelectorAll('style')];
    expect(styles).toHaveLength(3);
    expect(styles[0].textContent).toContain('color:red');
    expect(styles[1].textContent).toContain('@media print');
    expect(styles[1].textContent).toContain('assets/imports/fonts/');
    expect(styles[1].getAttribute('media')).toBe('screen');
    expect(styles[2].textContent).toContain('color:blue');
    expect(result.binaries).toHaveLength(2);
    expect(doc.querySelector('img')!.getAttribute('src')).toMatch(/^assets\/images\/[a-f0-9]+\.png$/);
    expect(result.html).not.toContain('base64,');
    expect(result.resources.every((entry) => entry.status === 'resolved')).toBe(true);
  });

  test('never guesses a basename, rejects escaping paths, and reports missing and remote references', async () => {
    const result = await prepareImportResources('<img src="a.png"><img src="../../secret.png"><img src="https://example.com/remote.png"><link rel="stylesheet" href="absent.css">', 'site/index.html', [file('one/a.png', 'one'), file('two/a.png', 'two')]);
    expect(result.binaries).toHaveLength(0);
    expect(result.resources.filter((item) => item.status === 'missing')).toHaveLength(3);
    expect(result.resources.find((item) => item.status === 'remote')?.url).toBe('https://example.com/remote.png');
    expect(result.warnings.join(' ')).toMatch(/路径|path/i);
    expect(result.warnings.join(' ')).toMatch(/ambig|歧义|多个/i);
  });

  test('externalizes data URLs, deduplicates content, and sanitizes SVG before persistence', async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(1)</script><foreignObject><iframe src="https://evil.test"/></foreignObject><a href="javascript:alert(1)"><path d="M0 0"/></a></svg>';
    const data = `data:image/svg+xml,${encodeURIComponent(svg)}`;
    const result = await prepareImportResources(`<img src="${data}"><div style="background-image:url('${data}')"></div><img srcset="data:image/png;base64,eA== 1x, data:image/png;base64,eQ== 2x">`, 'index.html', []);
    expect(result.html).not.toContain('data:image');
    expect(result.binaries).toHaveLength(3);
    const savedSvg = atob(result.binaries.find((entry) => entry.mimeType === 'image/svg+xml')!.base64);
    expect(savedSvg).not.toMatch(/script|onload|foreignObject|javascript|iframe/i);
    expect(savedSvg).toContain('<path');
    expect(parse(result.html).querySelector('img[srcset]')!.getAttribute('srcset')).toContain(' 2x');
  });

  test('rejects resource size, HTML size, invalid bundle paths and excess file count before reading', async () => {
    await expect(prepareImportResources('x'.repeat(2 * 1024 * 1024 + 1), 'index.html', [])).rejects.toThrow(/2\s*MiB/);
    await expect(prepareImportResources('<img src="x.png">', 'index.html', [file('../x.png', 'x')])).rejects.toThrow(/路径|path/i);
    await expect(prepareImportResources('<p>x</p>', 'index.html', Array.from({ length: 257 }, (_, i) => file(`${i}.png`, 'x')))).rejects.toThrow(/256/);
    await expect(prepareImportResources('<p>x</p>', 'index.html', [file('large.png', 'x'.repeat(10 * 1024 * 1024 + 1))])).rejects.toThrow(/10\s*MiB/);
  });

  test('handles stylesheet cycles and reports unsupported import modifiers explicitly', async () => {
    const result = await prepareImportResources('<link rel="stylesheet" href="a.css">', 'index.html', [file('a.css', '@import "b.css";@import "c.css" supports(display:grid);a{color:red}'), file('b.css', '@import "a.css";b{color:blue}'), file('c.css', '.c{color:green}')]);
    expect(result.warnings.join(' ')).toMatch(/cycle|循环/i);
    expect(result.warnings.join(' ')).toMatch(/supports/);
    expect(result.html).toContain('color:red');
    expect(result.html).toContain('color:blue');
  });

  test('resolves imports with CSS comments around their URL token', async () => {
    const prepared = await prepareImportResources('<link rel="stylesheet" href="a.css">', 'index.html', [file('a.css', '@import /* note */ url( /* note */ "b.css" /* note */ ) screen;'), file('b.css', '.b{color:red}')]);
    expect(prepared.html).toContain('@media screen');
    expect(prepared.html).toContain('.b{color:red}');
    expect(prepared.html).not.toContain('@import');
  });

  test('rejects CSS that would escape a serialized style element', async () => {
    await expect(prepareImportResources('<link rel="stylesheet" href="unsafe.css">', 'index.html', [file('unsafe.css', '.x{content:"</style><img src=x onerror=alert(1)>"}')])).rejects.toThrow(/样式.*结束|style/i);
  });

  test('rejects unsupported binary assets instead of claiming resolution', async () => {
    const result = await prepareImportResources('<link rel="stylesheet" href="a.css"><img src="payload.html">', 'index.html', [file('a.css', '@import "a.css";'), file('payload.html', '<script>alert(1)</script>')]);
    expect(result.binaries).toHaveLength(0);
    expect(result.resources.find((entry) => entry.url === 'payload.html')?.status).toBe('missing');
    expect(result.warnings.join(' ')).toContain('不支持');
  });

  test('does not leak unsupported stylesheet data bodies into persisted reports', async () => {
    const data = 'data:text/css;base64,Ym9keXtjb2xvcjpyZWR9';
    const prepared = await prepareImportResources(`<link rel="stylesheet" href="${data}">`, 'index.html', []);
    expect(JSON.stringify({ html: prepared.html, warnings: prepared.warnings, resources: prepared.resources })).not.toContain('Ym9keXtjb2xvcjpyZWR9');
    expect(prepared.warnings.join(' ')).toContain('text/css');
  });

  test('safe SVG keeps internal paint references while deleting CSS execution and external references', async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="p"/></defs><path fill="url(#p)" style="width:expression(alert(1))"/><image href="https://evil.test/x.png"/><use href="#p"/></svg>';
    const prepared = await prepareImportResources('<img src="x.svg">', 'index.html', [file('x.svg', svg)]);
    const saved = atob(prepared.binaries[0].base64);
    expect(saved).toContain('fill="url(#p)"');
    expect(saved).toContain('href="#p"');
    expect(saved).not.toContain('expression');
    expect(saved).not.toContain('evil.test');
  });

  test('analyze then prepare externalizes legacy backgrounds and nested template resources', async () => {
    const source = '<html><body background="data:image/png;base64,eA=="><template><style>.x{background:url(data:image/png;base64,eA==)}</style><template><img src="data:image/png;base64,eA=="></template><link rel="stylesheet" href="nested.css"></template><a download href="data:image/png;base64,eA==">Save</a></body></html>';
    const analysis = analyzeHtmlImport(source, 'index.html');
    const prepared = await prepareImportResources(analysis.sanitizedHtml, 'index.html', [file('nested.css', '.nested{background:url(data:image/png;base64,eA==)}')]);
    expect(prepared.html).not.toContain('data:image');
    expect(prepared.binaries).toHaveLength(1);
    const doc = parse(prepared.html);
    const content = (doc.querySelector('template') as HTMLTemplateElement).content;
    expect(content.querySelector('link')).toBeNull();
    expect(content.querySelector('style[data-import-stylesheet]')!.textContent).toContain('assets/images/');
    expect(doc.body.getAttribute('background')).toContain('assets/images/');
  });

  test('preserves safe SVG class rules and paint URLs while removing unsafe declarations and imports', async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><style>@import "https://evil.test/a.css";.red{fill:red;stroke:url(#paint);background:url(https://evil.test/x.png);width:expression(alert(1))}</style><defs><linearGradient id="paint"/></defs><path class="red"/></svg>';
    const prepared = await prepareImportResources('<img src="x.svg">', 'index.html', [file('x.svg', svg)]);
    const saved = atob(prepared.binaries[0].base64);
    expect(saved).toContain('<style>');
    expect(saved).toContain('fill:red');
    expect(saved).toContain('url(#paint)');
    expect(saved).not.toMatch(/evil.test|expression|@import/);
  });

  test('SVG CSS rejects image functions that can load a quoted external URL', async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><style>.red{fill:red;background-image:image-set("https://evil.test/x.png" 1x)}</style><path class="red"/></svg>';
    const prepared = await prepareImportResources('<img src="x.svg">', 'index.html', [file('x.svg', svg)]);
    const saved = atob(prepared.binaries[0].base64);
    expect(saved).toContain('fill:red');
    expect(saved).not.toContain('evil.test');
  });

  test('rejects unsupported embedded media and data URL locations instead of persisting bodies', async () => {
    await expect(prepareImportResources('<video src="data:video/mp4;base64,eA=="></video>', 'index.html', [])).rejects.toThrow(/不支持/);
    await expect(prepareImportResources('<p cite="data:image/png;base64,eA==">x</p>', 'index.html', [])).rejects.toThrow(/不支持/);
  });
});

describe('HTML import resource storage and runtime materialization', () => {
  test('CSS asset replacement changes only matching URL tokens and preserves fragments', () => {
    const css = '.a{background:url("assets/images/old.svg#paint");content:"url(assets/images/old.svg)"}.b{background:url(other.svg)}';
    expect(replaceCssResourceUrl(css, 'assets/images/old.svg', 'assets/images/new.svg')).toBe('.a{background:url("assets/images/new.svg#paint");content:"url(assets/images/old.svg)"}.b{background:url(other.svg)}');
    expect(replaceCssResourceUrl('@import url("assets/images/old.svg");', 'assets/images/old.svg', 'new.svg')).toBe('@import url("assets/images/old.svg");');
  });

  test('persists content once, then resolves URL locations without touching text or CSS strings', async () => {
    const prepared = await prepareImportResources('<img src="x.png"><p>assets/images/example.png</p>', 'index.html', [file('x.png', 'image', 'image/png')]);
    const storage = new LocalStorageStorage(`import-resources-${crypto.randomUUID()}`);
    await persistImportResources(prepared, storage);
    await persistImportResources(prepared, storage);
    const path = prepared.binaries[0].relPath;
    const resolved = await resolveImportedResources(`<p>${path}</p><img src="${path}"><div style="background:url('${path}')"></div>`, `.a{background:url('${path}')} .a:after{content:"url('${path}')"}`, storage);
    expect(parse(resolved.htmlContent).querySelector('p')!.textContent).toBe(path);
    expect(parse(resolved.htmlContent).querySelector('img')!.getAttribute('src')).toBe('data:image/png;base64,aW1hZ2U=');
    expect(resolved.scopedCss).toContain('background:url("data:image/png;base64,aW1hZ2U=")');
    expect(resolved.scopedCss).toContain(`content:"url('${path}')"`);
    expect(await storage.listDir('assets/images')).toHaveLength(1);
  });

  test('propagates storage failures and never reads arbitrary non-import paths', async () => {
    const storage = new LocalStorageStorage(`import-resources-${crypto.randomUUID()}`);
    storage.writeBinary = async () => { throw new Error('disk full'); };
    const prepared = await prepareImportResources('<img src="x.png">', 'index.html', [file('x.png', 'x')]);
    await expect(persistImportResources(prepared, storage)).rejects.toThrow(/disk full/);
    const reads: string[] = [];
    storage.readBinary = async (path) => { reads.push(path); return null; };
    await resolveImportedResources('<img src="assets/images/../../project.json"><img src="project.json">', undefined, storage);
    expect(reads).toHaveLength(0);
  });

  test('fails with the asset path when a referenced imported binary is missing', async () => {
    const prepared = await prepareImportResources('<img src="x.png">', 'index.html', [file('x.png', 'x')]);
    const storage = new LocalStorageStorage(`import-resources-${crypto.randomUUID()}`);
    await expect(resolveImportedResources(prepared.html, undefined, storage)).rejects.toThrow(prepared.binaries[0].relPath);
  });

  test('runtime resolves background and nested template URL locations', async () => {
    const prepared = await prepareImportResources('<img src="x.png">', 'index.html', [file('x.png', 'x')]);
    const path = prepared.binaries[0].relPath;
    const storage = new LocalStorageStorage(`import-resources-${crypto.randomUUID()}`);
    await persistImportResources(prepared, storage);
    const resolved = await resolveImportedResources(`<body background="${path}"><template><img src="${path}"><style>.x{background:url(${path})}</style></template></body>`, undefined, storage);
    const doc = parse(resolved.htmlContent);
    expect(doc.body.getAttribute('background')).toContain('data:image/png;base64,eA==');
    expect((doc.querySelector('template') as HTMLTemplateElement).content.querySelector('img')!.getAttribute('src')).toContain('data:image/png;base64,eA==');
    expect((doc.querySelector('template') as HTMLTemplateElement).content.querySelector('style')!.textContent).toContain('data:image/png;base64,eA==');
  });
});
