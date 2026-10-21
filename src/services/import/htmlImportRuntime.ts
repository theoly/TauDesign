import { analyzeHtmlImport } from './htmlImport';

/** Materialize known visual runtimes as static assets before the regular import pipeline. */
export async function prepareHtmlImportRuntime(html: string, fileName: string): Promise<{ html: string; warnings: string[] }> {
  const initial = analyzeHtmlImport(html, fileName);
  const original = new DOMParser().parseFromString(html, 'text/html');
  const scripts = Array.from(original.querySelectorAll('script'));
  const tailwind4 = scripts.some(script => /(?:^|\/)@tailwindcss\/browser(?:@4(?:\.[\d]+)*)?(?:\/|$)/.test(script.getAttribute('src') || ''));
  const tailwind3 = scripts.some(script => /^https?:\/\/cdn\.tailwindcss\.com(?:\/|$)/i.test(script.getAttribute('src') || ''));
  const doc = new DOMParser().parseFromString(initial.sanitizedHtml, 'text/html');
  const sources = Array.from(doc.querySelectorAll<HTMLStyleElement>('style[type="text/tailwindcss"]'));
  const warnings = [...initial.warnings];
  if (tailwind3) throw new Error('检测到 Tailwind 3 浏览器运行时；请先导出包含编译后 CSS 的 HTML，避免原貌丢失。');
  if ((tailwind4 || sources.length) && scripts.some(script => /\btailwind\s*\.\s*config\s*=/.test(script.textContent || ''))) {
    throw new Error('检测到 Tailwind JavaScript 配置，导入不会执行它；请先将配置和样式编译为静态 CSS。');
  }
  if (tailwind4 || sources.length) {
    const { compileImportedTailwind } = await import('./importTailwindCompiler');
    const classes = new Set<string>();
    const collect = (root: ParentNode) => {
      for (const node of Array.from(root.querySelectorAll('*'))) {
        for (const name of Array.from(node.classList)) classes.add(name);
        if (node.localName === 'template') collect((node as HTMLTemplateElement).content);
      }
    };
    collect(doc);
    try {
      const css = await compileImportedTailwind(sources.map(style => style.textContent || '').join('\n'), [...classes]);
      const style = doc.createElement('style'); style.setAttribute('data-import-compiled', 'tailwind4'); style.textContent = css.replace(/<\/style/gi, '<\\/style');
      if (sources[0]) { sources[0].replaceWith(style); sources.slice(1).forEach(source => source.remove()); }
      else doc.head.append(style);
      warnings.push('已用本地 Tailwind 4 编译器固化布局、字体、主题与任意值样式，页面不再依赖浏览器编译脚本。');
    } catch (error) { throw new Error(`无法保留原页面的 Tailwind 样式：${error instanceof Error ? error.message : String(error)}`); }
  }
  const placeholders = Array.from(doc.querySelectorAll('[data-lucide]')).filter(el => el.localName !== 'svg');
  if (placeholders.length) {
    const { importedLucideSvg } = await import('./importLucideIcons');
    let count = 0;
    for (const placeholder of placeholders) {
      const name = placeholder.getAttribute('data-lucide') || '';
      const markup = importedLucideSvg(name);
      if (!markup) { warnings.push(`未找到内置 Lucide 图标：${name}，请补充静态 SVG。`); continue; }
      const svg = new DOMParser().parseFromString(markup, 'image/svg+xml').documentElement;
      for (const attribute of Array.from(placeholder.attributes)) svg.setAttribute(attribute.name, attribute.value);
      svg.classList.add('lucide', `lucide-${name}`);
      placeholder.replaceWith(doc.importNode(svg, true)); count++;
    }
    if (count) warnings.push(`已将 ${count} 个 Lucide 图标固化为静态 SVG。`);
  }
  // Re-sanitize compiler/icon output and assign stable NIDs to newly materialized nodes.
  const final = analyzeHtmlImport('<!DOCTYPE html>\n' + doc.documentElement.outerHTML, fileName, { expandedResources: true });
  return { html: final.sanitizedHtml, warnings: [...new Set(warnings)] };
}
