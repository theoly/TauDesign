import { describe, expect, test } from 'bun:test';
import { prepareHtmlImportRuntime } from '../src/services/import/htmlImportRuntime';
import { analyzeHtmlImport, convertHtmlImport } from '../src/services/import/htmlImport';
import { defaultTheme } from '../src/utils/themePresets';
import { prepareImportResources } from '../src/services/import/importResources';
import { normalizeMobileNavigation } from '../src/utils/mobileNavigation';
const source = `<html><head><script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4.3.1/dist/index.global.js"></script>
<style type="text/tailwindcss">@theme inline{--color-primary:var(--brand)}@layer base{body{background:#fdf6ee}td{@apply break-words}}</style><style>.card{border-radius:18px}</style></head><body><div class="grid grid-cols-3 gap-3 px-4"><div class="card text-[40px] bg-primary">128<i data-lucide="check" class="h-2.5 w-2.5" style="stroke-width:3" data-nid="icon0001"></i></div></div><script>window.BAD=true</script></body></html>`;
const parse = (html: string) => new DOMParser().parseFromString(html, 'text/html');
describe('HTML导入静态运行时依赖', () => {
 test('先固化Tailwind4主题/布局/任意值/apply，再移除所有来源脚本', async () => {
   const result = await prepareHtmlImportRuntime(source, 'recharge.html'), doc = parse(result.html);
   expect(doc.querySelector('script')).toBeNull(); expect(doc.querySelector('style[type="text/tailwindcss"]')).toBeNull();
   const compiled = doc.querySelector('style[data-import-compiled="tailwind4"]')!.textContent!;
   expect(compiled).toContain('grid-template-columns: repeat(3, minmax(0, 1fr))');
   expect(compiled).toContain('font-size: 40px'); expect(compiled).toContain('background-color: var(--brand)');
   expect(compiled).toContain('overflow-wrap: break-word'); expect(doc.querySelectorAll('style')[1].textContent).toContain('.card{border-radius:18px}');
   expect((window as any).BAD).toBeUndefined();
   const final = analyzeHtmlImport(result.html, 'recharge.html', {expandedResources:true});
   expect(final.sanitizedHtml).toContain('grid-template-columns: repeat(3, minmax(0, 1fr))');
 });
 test('Lucide占位变成带原class/style/nid的SVG，未知图标提示且重入幂等', async () => {
   const result = await prepareHtmlImportRuntime(source + '<i data-lucide="not-a-real-icon"></i>', 'icons.html'), doc = parse(result.html);
   const icon = doc.querySelector('svg[data-lucide="check"]')!;
   expect(icon).not.toBeNull(); expect(icon.getAttribute('class')).toContain('h-2.5');
   expect(icon.getAttribute('data-nid')).toBe('icon0001'); expect(icon.getAttribute('style')).toContain('stroke-width:3'); expect(icon.querySelector('path')).not.toBeNull();
   expect(result.warnings.join(' ')).toContain('not-a-real-icon');
   expect((await prepareHtmlImportRuntime(result.html,'icons.html')).html).toBe(result.html);
 });
 test('不含运行时依赖的静态页不注入Tailwind reset，JS配置/插件不执行或静默丢弃', async () => {
   const result = await prepareHtmlImportRuntime('<style>body{margin:19px}</style><p>业务</p>', 'static.html');
   expect(result.html).not.toContain('data-import-compiled'); expect(result.html).toContain('margin:19px');
   await expect(prepareHtmlImportRuntime(source.replace('@theme inline', '@plugin "https://evil.test/plugin.js";@theme inline'),'unsafe.html')).rejects.toThrow();
   await expect(prepareHtmlImportRuntime(source.replace('<script>window.BAD=true</script>', '<script>tailwind.config={plugins:[bad()]}</script>'),'config.html')).rejects.toThrow();
 });
 test('真实充值页完整导入管道保留三列样式、8个图标与业务CTA，系统导航不重复', async () => {
   const original = await Bun.file(new URL('./fixtures/import-recharge.html', import.meta.url)).text();
   const runtime = await prepareHtmlImportRuntime(original, '充值魔方点.html');
   const resources = await prepareImportResources(runtime.html, '充值魔方点.html', []);
   const result = convertHtmlImport(analyzeHtmlImport(resources.html,'充值魔方点.html',{expandedResources:true}),{mode:'preserve',designSystem:defaultTheme,colorMode:'light',deviceProfile:'mobile'});
   const doc = parse(result.htmlContent);
   expect(doc.querySelector('.grid-cols-3')?.children.length).toBe(3);
   expect(doc.querySelector('style[data-import-compiled]')?.textContent).toContain('grid-template-columns: repeat(3, minmax(0, 1fr))');
   expect(doc.querySelector('.balance-gradient')?.getAttribute('class')).toContain('rounded-[22px]');
   expect(doc.querySelector('.cta-btn')?.textContent).toContain('获取魔方点 · ¥6.00');
   expect(doc.querySelectorAll('svg[data-lucide]').length).toBe(7); // Source back icon is removed; history icon is retained.
   expect(doc.querySelector('[aria-label="返回"]')).toBeNull(); expect(doc.querySelector('[aria-label="充值记录"]')).not.toBeNull();
   expect(result.metadata.navigationTitle).toBe('充值魔方点'); expect(doc.querySelector('script')).toBeNull();
 });
 test('编译的内容字符串不能闭合style标签或注入活动节点，v3运行时明确阻断', async () => {
   const html = source.replace('class="grid grid-cols-3 gap-3 px-4"', `class="grid grid-cols-3 gap-3 px-4 content-['&lt;/style&gt;&lt;script&gt;window.PWN=1&lt;/script&gt;']"`);
   const result = await prepareHtmlImportRuntime(html,'content.html');
   expect(parse(result.html).querySelector('script')).toBeNull(); expect((window as any).PWN).toBeUndefined();
   await expect(prepareHtmlImportRuntime('<script src="https://cdn.tailwindcss.com"></script><div class="grid">旧版</div>','legacy.html')).rejects.toThrow('Tailwind 3');
 });
 test('真实形态的div标题导航识别，剥离模拟留白且保留历史入口，不误删业务标题', () => {
   const input = '<main><header class="sticky top-0"><div class="h-11"></div><div class="flex h-11 items-center"><div><button aria-label="返回"><i></i></button></div><div class="flex-1 text-center font-semibold">充值魔方点</div><div><button aria-label="充值记录"><svg></svg></button></div></div></header><section>充值内容</section></main>';
   const result = normalizeMobileNavigation(input,{deviceProfile:'mobile'}), doc = parse(result.html);
   expect(result.title).toBe('充值魔方点'); expect(doc.querySelector('[aria-label="返回"]')).toBeNull();
   expect(doc.querySelector('[aria-label="充值记录"]')).not.toBeNull();
   expect(doc.querySelector('header')?.textContent).not.toContain('充值魔方点'); expect(doc.querySelector('.h-11')).toBeNull();
   const business = '<header><h1>业务概览</h1><input><button>新增</button></header><section>正文</section>';
   expect(normalizeMobileNavigation(business,{deviceProfile:'mobile'}).html).toBe(business);
   expect(normalizeMobileNavigation(input,{deviceProfile:'mobile',useCustomNavigation:true}).html).toBe(input);
 });
});
