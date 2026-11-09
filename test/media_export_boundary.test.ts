import {test,expect} from 'bun:test';
import {resolveImportedResources} from '../src/services/import/importResources';
import {inspectExternalMedia,assertExternalMedia} from '../src/services/ai/externalMedia';
import {LocalStorageStorage} from '../src/services/storage/projectStorage';
import {buildStandaloneHtml,buildExportSvg} from '../src/utils/exportRenderer';
import {buildDesignProjectManifest,renderProjectManifestContext} from '../src/services/ai/projectManifest';
import {PromptBuilder} from '../src/services/ai/promptBuilder';
import {techBlueTheme} from '../src/utils/themePresets';
import type {Screen} from '../src/types/project';

test('preview references independent bytes; HTML/PNG export inlines only a copy and leaves source untouched',async()=>{
 const storage=new LocalStorageStorage('media-boundary-'+crypto.randomUUID()),path='assets/images/source.png';
 await storage.ensureDir('assets/images');await storage.writeBinary(path,'aW1hZ2U=');
 const screen:Screen={id:'external-source',name:'封面',position:{x:0,y:0},htmlContent:`<main><img src="${path}" alt="独立封面"></main>`,scopedCss:`main{background-image:url("${path}")}`};
 const before=JSON.stringify(screen),paths=new Set([path]),seen:string[]=[];
 const preview=await resolveImportedResources(screen.htmlContent,screen.scopedCss,storage,paths,{async referenceUrl(p,bytes,mime){seen.push(p);expect(bytes).toBe('aW1hZ2U=');expect(mime).toBe('image/png');return 'https://preview.example.test/opaque-token';}});
 expect(preview.htmlContent).toContain('https://preview.example.test/opaque-token');expect(preview.scopedCss).toContain('https://preview.example.test/opaque-token');assertExternalMedia(preview.htmlContent,preview.scopedCss);expect(seen).toHaveLength(2);
 const exported=await resolveImportedResources(screen.htmlContent,screen.scopedCss,storage,paths);
 expect(exported.htmlContent).toContain('data:image/png;base64,aW1hZ2U=');expect(exported.scopedCss).toContain('data:image/png;base64,aW1hZ2U=');
 const exportScreen={...screen,...exported};
 const options={tokensCss:'',baseCss:'',screenOverrides:''};
 expect(buildStandaloneHtml(exportScreen,options)).toContain('data:image/png;base64,aW1hZ2U=');
 expect(buildExportSvg(exportScreen,{...options,width:390,height:844,bgColor:'#fff'})).toContain('data:image/png;base64,aW1hZ2U=');
 expect(inspectExternalMedia(exported.htmlContent).violations.length).toBeGreaterThan(0); // Export exception never changes the source gate.
 expect(JSON.stringify(screen)).toBe(before);expect(await storage.readBinary(path)).toBe('aW1hZ2U=');assertExternalMedia(screen.htmlContent,screen.scopedCss);
});
test('asset manifest is present once even before any business pages exist; model examples contain external icons',()=>{
 const path='assets/icons/'+'a'.repeat(64)+'.svg',asset={id:'bell',name:'图标 · bell',type:'svg_icon' as const,source:'builtin' as const,mimeType:'image/svg+xml',relPath:path,refCount:0};
 const manifest=buildDesignProjectManifest({projectId:'p',projectName:'empty',deviceProfile:'mobile',screens:[],assets:[asset]});
 const context=renderProjectManifestContext(manifest);expect(context.split(path)).toHaveLength(2);
 const prompt=PromptBuilder.buildSystemPrompt({designSystem:techBlueTheme,deviceProfile:'mobile',frameWidth:390,componentRequest:'通知角标',mediaAssets:[asset]});
 expect(prompt).toContain(path);expect(prompt).toContain('icon-mask');expect(prompt).not.toContain('<svg');expect(prompt).not.toContain('<path');
 const noAssets=PromptBuilder.buildSystemPrompt({designSystem:techBlueTheme,deviceProfile:'mobile',frameWidth:390,componentRequest:'通知角标'});
 expect(noAssets).not.toContain('<svg');expect(noAssets).toContain('当前未登记对应独立资源');
});
