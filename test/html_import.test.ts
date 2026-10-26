import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { analyzeHtmlImport, convertHtmlImport } from '../src/services/import/htmlImport';
import { defaultTheme, techBlueTheme } from '../src/utils/themePresets';
import { compileTokensToCss } from '../src/utils/cssCompiler';
import { prepareImportResources } from '../src/services/import/importResources';

const parse = (html: string) => new DOMParser().parseFromString(html, 'text/html');
// Happy DOM starts stylesheet fetches in DOMParser documents, unlike browser
// inert parsing. Keep this fixture suite offline without changing production.
const testSettings = (window as unknown as { happyDOM: { settings: { disableCSSFileLoading: boolean; handleDisabledFileLoadingAsSuccess: boolean } } }).happyDOM.settings;
const originalCSSLoading = testSettings.disableCSSFileLoading;
const originalDisabledLoading = testSettings.handleDisabledFileLoadingAsSuccess;
beforeAll(() => { testSettings.disableCSSFileLoading = true; testSettings.handleDisabledFileLoadingAsSuccess = true; });
afterAll(() => { testSettings.disableCSSFileLoading = originalCSSLoading; testSettings.handleDisabledFileLoadingAsSuccess = originalDisabledLoading; });
const convert = (html: string, categories?: Array<'colors' | 'typography' | 'spacing' | 'radius' | 'shadows'>) =>
  convertHtmlImport(analyzeHtmlImport(html, 'example.html'), {
    mode: categories ? 'selective' : 'unify', categories, designSystem: techBlueTheme, colorMode: 'light',
  });

describe('HTML import analysis', () => {
  test('rejects empty content and UTF-8 payloads over 2 MiB', () => {
    expect(() => analyzeHtmlImport('  ', 'empty.html')).toThrow();
    expect(() => analyzeHtmlImport('中'.repeat(700_000), 'big.html')).toThrow();
  });

  test('preserves full document attributes, styles in cascade order, nested text and SVG', () => {
    const source = '<!doctype html><html lang="zh" class="page"><head><title>账单</title><style>.x{color:red}</style></head><body id="app" style="margin:0"><div class="x">你好 <span>世界</span><svg viewBox="0 0 1 1"><path d="M0 0h1v1Z"/></svg></div><style>.x{color:blue}</style></body></html>';
    const analysis = analyzeHtmlImport(source, 'bill.html');
    const result = convertHtmlImport(analysis, { mode: 'preserve', designSystem: defaultTheme, colorMode: 'light' });
    const doc = parse(result.htmlContent);
    expect(doc.documentElement.getAttribute('lang')).toBe('zh');
    expect(doc.documentElement.className).toBe('page');
    expect(doc.body.id).toBe('app');
    expect(doc.body.style.margin).toBe('0px');
    expect(doc.querySelector('div')!.textContent).toBe('你好 世界');
    expect(doc.querySelectorAll('style')[0].textContent).toBe('.x{color:red}');
    expect(doc.querySelectorAll('style')[1].parentElement).toBe(doc.body);
    expect(doc.querySelector('path')!.getAttribute('d')).toBe('M0 0h1v1Z');
    expect(result.scopedCss).toBe('');
    expect(result.executionRecord).toMatchObject({ source: 'html-import', completeHtml: result.htmlContent, continuationCount: 0 });
    expect(result.changes).toEqual([]);
    expect(analysis.title).toBe('账单');
  });

  test('sanitizes active content, obfuscated dangerous URLs, nested templates and SVG animation', () => {
    const analysis = analyzeHtmlImport(`<meta http-equiv="refresh" content="0;url=https://evil.test"><base href="https://evil.test"><script>alert(1)</script>
      <div onclick="alert(1)"><a href="java&#10;script:alert(1)">文字</a><img src="data:text/html,unsafe" onerror="alert(1)">
      <iframe srcdoc="unsafe"></iframe><object data="x"></object><embed src="x"><template><script>x</script><img onerror="x" src="javascript:x"></template>
      <svg><a xlink:href="javascript:x">SVG</a><set attributeName="href" to="javascript:x" /></svg></div>`, 'unsafe.html');
    const doc = parse(analysis.sanitizedHtml);
    expect(doc.querySelector('script,iframe,object,embed,base,meta[http-equiv],set')).toBeNull();
    expect(doc.querySelector('[onclick],[onerror]')).toBeNull();
    expect(doc.querySelector('a')!.hasAttribute('href')).toBe(false);
    expect(doc.querySelector('img')!.hasAttribute('src')).toBe(false);
    const template = doc.querySelector('template') as HTMLTemplateElement;
    expect(template.content.querySelector('script,[onerror],img[src]')).toBeNull();
    expect(analysis.warnings.length).toBeGreaterThan(0);
  });

  test('removes unsafe CSS URLs even with escapes without discarding safe sibling rules', () => {
    const analysis = analyzeHtmlImport('<style>.safe{color:red}.bad{background:url("j\\61vascript:alert(1)")}</style><div style="background:url(javascript:x);color:blue">ok</div>', 'style.html');
    expect(analysis.sanitizedHtml).not.toContain('javascript:');
    expect(analysis.sanitizedHtml).not.toContain('j\\61vascript');
    expect(parse(analysis.sanitizedHtml).querySelector('style')!.textContent).toContain('.safe');
    expect(parse(analysis.sanitizedHtml).querySelector('div')!.style.color).toBe('blue');
  });

  test('repairs partial, duplicate and unsafe NIDs deterministically while keeping source selectors working', () => {
    const source = '<style>[data-nid="same"]{color:red}</style><div data-nid="same"><span data-nid="same">A</span><b data-nid="abcd1234">B</b><i data-nid="bad\'id">C</i><em>D</em></div>';
    const one = analyzeHtmlImport(source, 'nids.html');
    const two = analyzeHtmlImport(source, 'nids.html');
    const doc = parse(one.sanitizedHtml);
    const ids = Array.from(doc.querySelectorAll('body *')).map(el => el.getAttribute('data-nid'));
    expect(ids.every(id => /^[a-z0-9]{8}$/.test(id!))).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
    expect(doc.querySelector('b')!.getAttribute('data-nid')).toBe('abcd1234');
    expect(one.sanitizedHtml).toBe(two.sanitizedHtml);
    expect(doc.querySelectorAll('[data-import-source-nid="same"]').length).toBe(2);
    expect(doc.querySelector('style')!.textContent).toContain('data-import-source-nid');
  });

  test('re-analysis after resource resolution does not expand source NID selector matches', () => {
    const first = analyzeHtmlImport('<style>[data-nid]{color:red}</style><div data-nid="same">A<span>B</span></div>', 'nids.html');
    const second = analyzeHtmlImport(first.sanitizedHtml, 'nids.html');
    expect(parse(first.sanitizedHtml).querySelectorAll('[data-import-source-nid]').length).toBe(1);
    expect(parse(second.sanitizedHtml).querySelectorAll('[data-import-source-nid]').length).toBe(1);
    expect(second.sanitizedHtml).toBe(first.sanitizedHtml);
  });

  test('resolves case-sensitive root variables for theme inference without replacing source variables', () => {
    const analysis = analyzeHtmlImport('<style>:root{--PageBG:#121212;--Brand:#38bdf8}body{background:var(--PageBG);color:#eee}button{background:var(--Brand)}</style><button>Buy</button>', 'variables.html');
    expect(analysis.suggestedColorMode).toBe('dark');
    expect(analysis.suggestedTheme.tokens.colors.primary['500']).toBe('#38bdf8');
    expect(analysis.sanitizedHtml).toContain('--PageBG:#121212');
  });

  test('permits previously validated expanded resource bundles only with explicit prepared flag', () => {
    const expanded = '<style>/*' + 'x'.repeat(2 * 1024 * 1024) + '*/</style><p>ok</p>';
    expect(() => analyzeHtmlImport(expanded, 'large.html')).toThrow();
    expect(analyzeHtmlImport(expanded, 'large.html', { expandedResources: true }).title).toBe('large');
  });

  test('extracts dark semantic roles from body and actions instead of frequent decoration', () => {
    const analysis = analyzeHtmlImport('<style>body{background:#101820;color:rgb(240,240,240);font-family:Georgia,serif;width:390px}.decoration{background:#ff0000}button{background:#22cc88;color:#fff;border-radius:18px}</style><button>保存</button><i class="decoration"></i><i class="decoration"></i><i class="decoration"></i>', 'dark.html');
    expect(analysis.suggestedColorMode).toBe('dark');
    expect(analysis.suggestedTheme.tokens.colors.primary['500']).toBe('#22cc88');
    expect(analysis.suggestedTheme.tokens.colors.background.dark).toBe('#101820');
    expect(analysis.suggestedTheme.tokens.colors.textPrimary.dark).toBe('#f0f0f0');
    expect(analysis.suggestedTheme.tokens.typography.fontFamilySans).toContain('Georgia');
    expect(analysis.suggestedTheme.tokens.radius.md).toBe('18px');
    expect(analysis.detectedWidth).toBe(390);
    expect(() => compileTokensToCss(analysis.suggestedTheme.tokens, 'dark')).not.toThrow();
    expect(analysis.warnings.join(' ')).toContain('推断');
  });

  test('reports remote, local, embedded, CSS font/image and unresolved custom-property resources', () => {
    const analysis = analyzeHtmlImport('<link rel="stylesheet" href="https://cdn.test/x.css"><style>@font-face{font-family:X;src:url(fonts/a.woff2)}.x{background:url(./bg.png)}</style><img src="photos/a.png"><img src="https://cdn.test/a.png"><img src="data:image/png;base64,AAAA">', 'assets.html');
    expect(analysis.resources).toContainEqual({ url: 'https://cdn.test/x.css', type: 'stylesheet', status: 'external' });
    expect(analysis.resources).toContainEqual({ url: 'fonts/a.woff2', type: 'font', status: 'missing' });
    expect(analysis.resources).toContainEqual({ url: './bg.png', type: 'image', status: 'missing' });
    expect(analysis.resources.some(resource => resource.status === 'embedded')).toBe(true);
    expect(analysis.warnings.join(' ')).toContain('资源');
  });

  test('reports unquoted CSS imports, picture alternatives and document icons', () => {
    const analysis = analyzeHtmlImport('<link rel="icon" href="favicon.png"><style>@import url(theme.css);</style><picture><source srcset="small.webp 1x, large.webp 2x"><img src="fallback.png"></picture>', 'sources.html');
    expect(analysis.resources).toContainEqual({ url: 'theme.css', type: 'stylesheet', status: 'missing' });
    expect(analysis.resources).toContainEqual({ url: 'favicon.png', type: 'image', status: 'missing' });
    expect(analysis.resources).toContainEqual({ url: 'small.webp', type: 'image', status: 'missing' });
    expect(analysis.resources).toContainEqual({ url: 'large.webp', type: 'image', status: 'missing' });
  });

  test('analyze → prepare → analyze retains supported embedded SVG image contexts and their class CSS', async () => {
    const svgText = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><style>.paint{fill:#123456}</style><path class="paint" d="M0 0h8v8Z"/></svg>';
    const url = 'data:image/svg+xml;base64,' + btoa(svgText);
    const source = `<img id="icon" src="${url}"><svg><image id="svg-icon" href="${url}"/></svg><input id="image-input" type="image" src="${url}"><div id="background" style="background-image:url('${url}')"></div>`;
    const initial = analyzeHtmlImport(source, 'images.html');
    const prepared = await prepareImportResources(initial.sanitizedHtml, 'images.html', []);
    const final = analyzeHtmlImport(prepared.html, 'images.html', { expandedResources: true });
    const doc = parse(final.sanitizedHtml);
    expect(doc.querySelector('#icon')!.getAttribute('src')).toMatch(/^assets\/images\/.+\.svg$/);
    expect(doc.querySelector('#svg-icon')!.getAttribute('href')).toMatch(/^assets\/images\/.+\.svg$/);
    expect(doc.querySelector('#image-input')!.getAttribute('src')).toMatch(/^assets\/images\/.+\.svg$/);
    expect(doc.querySelector('#background')!.getAttribute('style')).toContain('assets/images/');
    expect(prepared.binaries.length).toBe(1);
    const stored = atob(prepared.binaries[0].base64);
    expect(stored).toContain('.paint{fill:#123456}');
    expect(stored).toContain('class="paint"');
    expect(final.sanitizedHtml).not.toContain('data:image/');
  });

  test('analyze → prepare sanitizes malicious embedded SVG before producing any runtime asset', async () => {
    const svgText = '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(1)</script><foreignObject><p>active</p></foreignObject><style>.safe{fill:#008000}</style><path class="safe" d="M0 0h1v1Z"/></svg>';
    const source = '<img id="untrusted" src="data:image/svg+xml;base64,' + btoa(svgText) + '">';
    const initial = analyzeHtmlImport(source, 'untrusted.html');
    const prepared = await prepareImportResources(initial.sanitizedHtml, 'untrusted.html', []);
    const final = analyzeHtmlImport(prepared.html, 'untrusted.html', { expandedResources: true });
    expect(parse(final.sanitizedHtml).querySelector('#untrusted')!.getAttribute('src')).toMatch(/^assets\/images\/.+\.svg$/);
    expect(prepared.binaries.length).toBe(1);
    const stored = new DOMParser().parseFromString(atob(prepared.binaries[0].base64), 'image/svg+xml');
    expect(stored.querySelector('script,foreignObject,[onload]')).toBeNull();
    expect(stored.querySelector('.safe')).not.toBeNull();
    expect(stored.querySelector('style')!.textContent).toBe('.safe{fill:#008000}');
  });

  test('analyze → prepare retains raster data srcset candidates and rejects active URL candidates', async () => {
    const data = 'data:image/png;base64,AQID';
    const source = `<picture><source id="alternatives" srcset="${data} 1x, javascript:alert(1) 2x, ${data} 3x, vbscript:bad 4x"><img id="fallback" src="${data}"></picture><a id="anchor" href="${data}">Download</a><a id="svg-anchor" href="data:image/svg+xml;base64,PHN2Zy8+">SVG</a>`;
    const initial = analyzeHtmlImport(source, 'srcset.html');
    const initialDoc = parse(initial.sanitizedHtml);
    expect(initialDoc.querySelector('#alternatives')!.getAttribute('srcset')).toContain(data);
    expect(initialDoc.querySelector('#alternatives')!.getAttribute('srcset')).not.toMatch(/javascript|vbscript/i);
    expect(initialDoc.querySelector('#anchor')!.hasAttribute('href')).toBe(false);
    expect(initialDoc.querySelector('#svg-anchor')!.hasAttribute('href')).toBe(false);
    const prepared = await prepareImportResources(initial.sanitizedHtml, 'srcset.html', []);
    const final = analyzeHtmlImport(prepared.html, 'srcset.html', { expandedResources: true });
    const srcset = parse(final.sanitizedHtml).querySelector('#alternatives')!.getAttribute('srcset')!;
    expect(srcset.match(/assets\/images\//g)?.length).toBe(2);
    expect(srcset).toContain('1x');
    expect(srcset).toContain('3x');
    expect(final.sanitizedHtml).not.toContain('base64');
  });

  test('analyze → prepare externalizes image downloads while blocking data-image navigation', async () => {
    const data = 'data:image/png;base64,AQID';
    const initial = analyzeHtmlImport(`<a id="download" download="image.png" href="${data}">Save</a><a id="navigate" href="${data}">Go</a>`, 'downloads.html');
    const prepared = await prepareImportResources(initial.sanitizedHtml, 'downloads.html', []);
    const final = analyzeHtmlImport(prepared.html, 'downloads.html', { expandedResources: true });
    const doc = parse(final.sanitizedHtml);
    expect(doc.querySelector('#download')!.getAttribute('href')).toMatch(/^assets\/images\/.+\.png$/);
    expect(doc.querySelector('#download')!.getAttribute('download')).toBe('image.png');
    expect(doc.querySelector('#navigate')!.hasAttribute('href')).toBe(false);
    expect(final.sanitizedHtml).not.toContain('base64');
  });
});

describe('HTML import conversion', () => {
  test('maps statically resolved root variable usages across categories without changing source definitions', () => {
    const source = '<style>:root{--brand:#b65378;--font:Georgia,serif;--size:18px;--space:24px;--curve:12px}.btn{background:var(--brand);font-family:var(--font);font-size:var(--size);padding:var(--space);border-radius:var(--curve)}</style><button class="btn">Save</button>';
    const result = convert(source), css = parse(result.htmlContent).querySelector('style')!.textContent!;
    expect(css).toContain('--brand:#b65378');
    expect(css).toContain('--font:Georgia,serif');
    expect(css).toContain('--space:24px');
    expect(css).toContain('background:var(--td-import-color-primary)');
    expect(css).toContain('font-family:var(--td-import-font-sans)');
    expect(css).toContain('font-size:var(--td-import-font-size-lg)');
    expect(css).toContain('padding:var(--td-import-space-6)');
    expect(css).toContain('border-radius:var(--td-import-radius-lg)');
    expect(result.changes.some(change => change.includes('var(--brand)'))).toBe(true);
    const colorsOnly = convert(source, ['colors']);
    const colorsCss = parse(colorsOnly.htmlContent).querySelector('style')!.textContent!;
    expect(colorsCss).toContain('background:var(--td-import-color-primary)');
    expect(colorsCss).toContain('font-size:var(--size)');
    expect(colorsCss).toContain('padding:var(--space)');
    expect(colorsCss).toContain('border-radius:var(--curve)');
  });

  test('retains a shared rule with differently scoped variables while converting inline usages independently', () => {
    const result = convert('<style>:root{--space:8px}.wide{--space:24px}.shared{padding:var(--space)}</style><div class="shared">A</div><div class="shared wide">B</div><p id="inline" class="wide" style="margin:var(--space)">C</p>');
    const doc = parse(result.htmlContent), css = doc.querySelector('style')!.textContent!;
    expect(css).toContain('.shared{padding:var(--space)}');
    expect(doc.querySelector('#inline')!.getAttribute('style')).toContain('margin:var(--td-import-space-6)');
    expect(result.retained.some(item => item.includes('padding: var(--space)'))).toBe(true);
  });

  test('converts finite variable fallbacks but retains conditional, dynamic, nested and expression values', () => {
    const result = convert('<style>:root{--brand:#b65378;--alias:var(--brand);--expr:calc(100% - 2px)}@media(min-width:600px){:root{--brand:#2255aa}}.x{background:var(--brand);color:var(--missing, #111);padding:var(--expr);border-color:var(--alias);margin:var(--missing, var(--expr))}.x:hover{--curve:12px}.x{border-radius:var(--curve, 8px)}</style><p class="x">Text</p>');
    const css = parse(result.htmlContent).querySelector('style')!.textContent!;
    expect(css).toContain('color:var(--td-import-color-text-primary)');
    expect(css).toContain('background:var(--brand)');
    expect(css).toContain('padding:var(--expr)');
    expect(css).toContain('border-color:var(--alias)');
    expect(css).toContain('margin:var(--missing, var(--expr))');
    expect(css).toContain('border-radius:var(--curve, 8px)');
    expect(result.retained.length).toBeGreaterThanOrEqual(5);
  });

  test('retains variables whose registered inheritance or unparsed nested scope cannot be inferred', () => {
    const result = convert('<style>@PROPERTY --tone{syntax:"<color>";inherits:false;initial-value:red}.outer{& .x{--gap:24px}}.x{color:var(--tone,#111);padding:var(--gap,8px)}</style><div class="outer"><p class="x">Text</p></div>');
    const css = parse(result.htmlContent).querySelector('style')!.textContent!;
    expect(css).toContain('color:var(--tone,#111)');
    expect(css).toContain('padding:var(--gap,8px)');
  });

  test('retains source variables while a stylesheet dependency is unresolved', () => {
    const result = convert('<link rel="stylesheet" href="missing.css"><style>:root{--space:24px}.x{padding:var(--space)}</style><p class="x">Text</p>');
    expect(parse(result.htmlContent).querySelector('style')!.textContent).toContain('padding:var(--space)');
  });

  test('maps selected colors while retaining layout, typography, spacing, radius and all text', () => {
    const result = convert('<style>.card{display:grid;grid-template-columns:1fr 2fr;color:#111;background:#fff;padding:19px;font-size:17px;border-radius:9px}</style><main class="card"><strong>Original</strong> text</main>', ['colors']);
    const doc = parse(result.htmlContent);
    const css = doc.querySelector('style')!.textContent!;
    expect(css).toContain('var(--td-import-color-text-primary)');
    expect(css).toContain('var(--td-import-color-surface)');
    expect(css).toContain('padding:19px');
    expect(css).toContain('font-size:17px');
    expect(css).toContain('border-radius:9px');
    expect(css).toContain('grid-template-columns:1fr 2fr');
    expect(doc.querySelector('main')!.textContent).toBe('Original text');
    expect(result.changes.length).toBeGreaterThan(0);
    expect(result.metadata.categories).toEqual(['colors']);
  });

  test('converts inline finite values and media declarations while retaining !important and rule order', () => {
    const result = convert('<style>@media(min-width:600px){.x{padding:24px 8px !important;border-radius:12px;color:blue}}.x{color:red}</style><p class="x" style="font-size:18px;margin:16px;box-shadow:0 2px 4px rgba(0,0,0,.1)">Text</p>');
    const doc = parse(result.htmlContent);
    const css = doc.querySelector('style')!.textContent!;
    expect(css).toContain('@media');
    expect(css).toContain('var(--td-import-space-6) var(--td-import-space-2) !important');
    expect(css).toContain('var(--td-import-radius-lg)');
    expect(doc.querySelector('p')!.style.getPropertyValue('font-size')).toBe('var(--td-import-font-size-lg)');
    expect(doc.querySelector('p')!.style.getPropertyValue('margin')).toBe('var(--td-import-space-4)');
    expect(doc.querySelector('p')!.style.getPropertyValue('box-shadow')).toMatch(/var\(--td-import-shadow-/);
    expect(css.indexOf('@media')).toBeLessThan(css.lastIndexOf('.x'));
  });

  test('keeps complex expressions, gradients and unknown at-rules with an explicit retained report', () => {
    const source = '<style>@layer special{.x{padding:20px}}.x{color:var(--source-ink);margin:calc(100% - 2rem);background:linear-gradient(red,blue);border-radius:50% 10px}</style><p class="x">Text</p>';
    const result = convert(source);
    const css = parse(result.htmlContent).querySelector('style')!.textContent!;
    expect(css).toContain('color:var(--source-ink)');
    expect(css).toContain('margin:calc(100% - 2rem)');
    expect(css).toContain('linear-gradient(red,blue)');
    expect(css).toContain('@layer special');
    expect(result.retained.some(item => item.includes('var('))).toBe(true);
    expect(result.retained.some(item => item.includes('calc('))).toBe(true);
  });

  test('does not mutate analysis or the supplied project theme', () => {
    const analysis = analyzeHtmlImport('<p style="color:red">A</p>', 'original.html');
    const before = JSON.stringify(analysis);
    const themeBefore = JSON.stringify(defaultTheme);
    convertHtmlImport(analysis, { mode: 'unify', designSystem: defaultTheme, colorMode: 'light' });
    expect(JSON.stringify(analysis)).toBe(before);
    expect(JSON.stringify(defaultTheme)).toBe(themeBefore);
  });

  test('selective typography isolates source variables and leaves colors, spacing and SVG untouched', () => {
    const result = convert('<style>:root{--color-bg:#123456}.x{background:var(--color-bg);padding:12px;font-family:Arial,sans-serif;font-size:14px}</style><p class="x">Hello<svg fill="#ff0000"><path/></svg></p>', ['typography']);
    const doc = parse(result.htmlContent), css = doc.querySelector('style')!.textContent!;
    expect(css).toContain('--color-bg:#123456');
    expect(css).toContain('background:var(--color-bg)');
    expect(css).toContain('padding:12px');
    expect(css).toContain('var(--td-import-font-sans)');
    expect(doc.querySelector('svg')!.getAttribute('fill')).toBe('#ff0000');
  });

  test('preserves fallback declarations, conditional structures and unknown at-rules around mapped values', () => {
    const result = convert('<style>@unknown weird{strange:value}.x{color:red;color:rgba(10,20,30,.4);font-size:16px!important}@supports(display:grid){.x{gap:8px}}</style><p>X</p>');
    const css = parse(result.htmlContent).querySelector('style')!.textContent!;
    expect(css).toContain('@unknown weird{strange:value}');
    expect(css).toContain('color:rgba(10,20,30,.4)');
    expect(css).toContain('font-size:var(--td-import-font-size-md) !important');
    expect(css).toContain('@supports(display:grid)');
    expect(css.indexOf('var(--td-import-color-')).toBeLessThan(css.indexOf('rgba(10,20,30,.4)'));
    expect(result.retained.some(item => item.includes('@unknown'))).toBe(true);
  });
});
