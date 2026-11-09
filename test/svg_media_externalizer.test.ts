import {test,expect} from 'bun:test';
import {SvgMediaExternalizer} from '../src/services/import/svgMediaExternalizer';
import {LocalStorageStorage} from '../src/services/storage/projectStorage';
import {neutralModernTheme} from '../src/utils/themePresets';
import {assertExternalMedia,embeddedMediaIssue} from '../src/services/ai/externalMedia';
import {persistImportResources,resolveImportedResources} from '../src/services/import/importResources';
const settings={deviceProfile:'mobile' as const,frameWidth:390,viewportGuideHeight:844,showViewportGuide:true,colorMode:'light' as const,lodBudget:12};
test('simple SVG paths become a separate immutable file; only the layout and external mask remain in the page',async()=>{
 const html='<main data-nid="page"><button data-nid="button" class="btn"><svg data-nid="bell" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" style="color:var(--color-primary);opacity:0.5"><title>通知</title><path data-nid="path" d="M12 2 L20 20 L4 20Z"/></svg><span>消息入口</span></button></main>';
 const storage=new LocalStorageStorage('svg-media:'+crypto.randomUUID()),source={id:'page',name:'消息',htmlContent:html,position:{x:0,y:0}};
 const result=await SvgMediaExternalizer.prepare({screen:source,settings,designSystem:neutralModernTheme,storage});
 expect(result.resources.binaries).toHaveLength(1);expect(result.removedNids).toEqual(['path']);expect(result.screen.htmlContent).not.toContain('<path');expect(result.screen.htmlContent).not.toContain('data:image');expect(result.screen.htmlContent).toContain('assets/images/');expect(result.screen.htmlContent).toContain('currentColor');expect(source.htmlContent).toBe(html);expect(await storage.listDir('assets')).toEqual([]);
 const file=result.resources.binaries[0],svg=atob(file.base64);expect(svg).toContain('M12 2 L20 20 L4 20Z');expect(svg).not.toContain('data-nid');expect(svg).not.toContain('opacity:0.5');expect(()=>assertExternalMedia(result.screen.htmlContent)).not.toThrow();
 await persistImportResources(result.resources,storage);const resolved=await resolveImportedResources(result.screen.htmlContent,undefined,storage,new Set(),{async referenceUrl(){return 'https://preview.example.test/icon.svg';}});expect(resolved.htmlContent).toContain('https://preview.example.test/icon.svg');expect(result.screen.htmlContent).not.toContain('https://preview.example.test/');
});
test('SVG external image wrappers and empty CSS masks contain no inline drawing; incomplete paths are still blocked',()=>{
 for(const html of ['<svg viewBox="10 10 24 24"><image href="assets/images/a.svg" x="10" y="10" width="24" height="24"/></svg>','<svg style="mask-image:url(assets/images/b.svg);background-color:currentColor"></svg>'])expect(()=>assertExternalMedia(html)).not.toThrow();
 for(const source of ['<svg><path d="M0 0','<svg><defs><path','<svg><image href="data:image/png;base64,YQ=="/></svg>'])expect(Boolean(embeddedMediaIssue(source))).toBe(true);
});
test('CSS-dependent/gradient SVG refuses unavailable rendering instead of dropping paint or pretending to preserve appearance',async()=>{
 const storage=new LocalStorageStorage('svg-media:'+crypto.randomUUID());
 const html='<style>svg path{stroke:red}</style><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M0 0L24 24"/></svg>';
 await expect(SvgMediaExternalizer.prepare({screen:{id:'page',name:'复杂样式',htmlContent:html,position:{x:0,y:0}},settings,designSystem:neutralModernTheme,storage})).rejects.toThrow('实际渲染');expect(await storage.listDir('assets')).toEqual([]);
});
