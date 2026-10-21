import { compile } from 'tailwindcss-import';
import indexCss from 'tailwindcss-import/index.css?raw';
import themeCss from 'tailwindcss-import/theme.css?raw';
import preflightCss from 'tailwindcss-import/preflight.css?raw';
import utilitiesCss from 'tailwindcss-import/utilities.css?raw';

/** Browser-safe compiler core: only bundled CSS is resolvable; no source JS ever loads. */
export async function compileImportedTailwind(css: string, candidates: string[]): Promise<string> {
  if (candidates.length > 20000) throw new Error('Tailwind class 数量超过 20000，无法安全完成静态编译。');
  const builtins: Record<string, string> = {
    tailwindcss: indexCss, 'tailwindcss/index.css': indexCss,
    'tailwindcss/theme.css': themeCss, 'tailwindcss/preflight.css': preflightCss, 'tailwindcss/utilities.css': utilitiesCss,
  };
  const compiled = await compile(`@import "tailwindcss";\n${css}`, {
    loadModule: async () => { throw new Error('导入不执行 Tailwind JavaScript 配置或插件，请先导出编译后的静态 CSS。'); },
    loadStylesheet: async id => {
      if (!Object.hasOwn(builtins, id)) throw new Error(`Tailwind 样式引用尚未固化：${id}；请先内联静态 CSS。`);
      return { content: builtins[id], base: '', path: id };
    }
  });
  const output = compiled.build(candidates);
  if (new TextEncoder().encode(output).length > 4 * 1024 * 1024) throw new Error('Tailwind 编译结果超过 4 MiB，请精简页面后重试。');
  return output;
}
