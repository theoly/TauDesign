import { describe, expect, test } from 'bun:test';
import { resolveViewportCss, resolveImportedViewport, importedViewportHeight } from '../src/utils/importViewport';
import { buildScreenDocument } from '../src/utils/screenDocument';
import { buildStandaloneHtml } from '../src/utils/exportRenderer';
import { buildExportRenderDocument } from '../src/utils/pngExporter';
import type { Screen } from '../src/types/project';
const imported: Screen = { id:'viewport',name:'test',position:{x:0,y:0},htmlContent:'<html><head><style>@layer utilities{.min-h-screen{min-height:100vh}.half{height:50dvh}}.label:before{content:"100vh"}</style></head><body class="min-h-screen"><main><div class="min-h-screen"><div class="min-h-screen" style="height:calc(50svh - 2px)">内容</div></div></main></body></html>',metadata:{importedHtml:{fileName:'v.html',mode:'preserve',categories:[],changes:[],retained:[],version:1}} };
const options = { tokensCss:'',baseCss:'',screenOverrides:'',deviceProfile:'mobile' as const,viewportHeight:844,includeMobileChrome:true };
describe('导入页稳定参考视口',()=>{
 test('转换嵌套vh/svh/dvh/lvh、calc、自定义变量，保留选择器/字符串/URL/普通尺寸',()=>{
  const css='.h-\\[100vh\\]{height:100vh;min-height:50dvh;max-height:25svh;top:10lvh;padding:calc(20vh - 4px);--size:1.5vh;content:"100vh";background:url(data:image/svg+xml,100vh);width:30vw;margin:8px}';
  const result=resolveViewportCss(css,752);
  expect(result).toContain('.h-\\[100vh\\]');expect(result).toContain('height:752px');expect(result).toContain('min-height:376px');expect(result).toContain('max-height:188px');expect(result).toContain('top:75.2px');expect(result).toContain('calc(150.4px - 4px)');expect(result).toContain('--size:11.28px');expect(result).toContain('content:"100vh"');expect(result).toContain('url(data:image/svg+xml,100vh)');expect(result).toContain('width:30vw;margin:8px');
  const nested='.parent{&:hover .h-\\[100vh\\]{height:100vh}}';
  expect(resolveViewportCss(nested,752)).toBe(nested);
 });
 test('默认/自定义导航分别扣除92/44px，所有嵌套层同基准且不双扣，原HTML不变',()=>{
  for(const [custom,height] of [[false,752],[true,800]] as const){
   const doc=new DOMParser().parseFromString(buildScreenDocument(imported,{...options,useCustomNavigation:custom}),'text/html');
   expect(importedViewportHeight(doc)).toBe(844);expect(doc.head.textContent).toContain(`min-height:${height}px`);expect(doc.head.textContent).not.toContain('min-height:calc(100vh -');expect(doc.querySelector('[style]')?.getAttribute('style')).toContain(`${height/2}px`);expect(doc.querySelectorAll('.min-h-screen').length).toBe(3);
  }
  expect(imported.htmlContent).toContain('min-height:100vh');
 });
 test('HTML单页导出保留真实响应式单位、无运行时视口标记；普通生成页也使用同一参考视口',()=>{
  const exported=buildStandaloneHtml(imported,options);expect(exported).toContain('min-height:100vh');expect(exported).not.toContain('data-viewport-height');
  const generated=buildScreenDocument({...imported,metadata:undefined},options);expect(generated).toContain('min-height:752px');expect(generated).toContain('data-viewport-height');
 });
 test('渲染副本转换幂等且只改CSS声明',()=>{
  const doc=new DOMParser().parseFromString(imported.htmlContent,'text/html');resolveImportedViewport(doc,752);const first=doc.documentElement.outerHTML;resolveImportedViewport(doc,752);expect(doc.documentElement.outerHTML).toBe(first);expect(doc.body.textContent).toBe('内容');expect(doc.head.textContent).toContain('content:"100vh"');
 });
 test('仅图片副本关闭入场动画，预览与HTML保留动画',()=>{
  const image=buildExportRenderDocument(imported,{...options,width:390});expect(image).toContain('image-resting');expect(image).toContain('animation:none!important');
  expect(buildScreenDocument(imported,options)).not.toContain('image-resting');
  expect(buildStandaloneHtml(imported,{...options,staticImage:true} as any)).not.toContain('image-resting');
 });
});
