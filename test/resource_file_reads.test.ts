import {expect,test} from 'bun:test';
import {readProjectRenderResources,auditProjectAssets} from '../src/services/ai/projectAssetIntegrity';
import type {ProjectStorage} from '../src/services/storage/projectStorage';
import type {Asset,Screen} from '../src/types/project';
const font=`assets/imports/fonts/${'a'.repeat(64)}.woff2`,image='assets/images/photo.png',icon='assets/icons/icon.svg';
const assets:Asset[]=[{id:'image',name:'照片',type:'image',mimeType:'image/png',relPath:image,source:'upload',refCount:1},{id:'icon',name:'图标',type:'image',mimeType:'image/svg+xml',relPath:icon,source:'upload',refCount:1}];
const page=(htmlContent:string,scopedCss?:string):Screen=>({id:'page',name:'测试页',htmlContent,scopedCss,position:{x:0,y:0}});
function fixture(){const calls:string[]=[],files=new Map([[font,'dGVzdA=='],[image,'dGVzdA=='],[icon,'PHN2Zy8+']]);const storage={async exists(path:string){return files.has(path);},async readBinary(path:string){calls.push(path);return files.get(path)??null;}} as ProjectStorage;return {calls,files,storage};}
test('same parser reads actual HTML, inline/scoped CSS and L4, deduplicates per page and leaves source unchanged',async()=>{
 const f=fixture(),screen=page(`<main><img src="${image}"><span style="background:url(${image})">文字 ${font}</span></main>`,`@font-face{font-family:Imported;src:url('./${font}?v=1#font')}/*url(assets/images/not-real.png)*/.x{content:'url(assets/images/not-real.png)'}`);
 const overrides={'page:label':{nid:'label',declarations:{'background-image':`url(${icon})`}}},snapshot=JSON.stringify([screen,overrides]);
 const result=await readProjectRenderResources(f.storage,[screen],assets,overrides);
 expect(result.issues).toEqual([]);expect(f.calls.sort()).toEqual([font,image,icon].sort());expect(result.files.map(f=>f.relPath).sort()).toEqual([font,image,icon].sort());expect(JSON.stringify([screen,overrides])).toBe(snapshot);
});
test('font escaped CSS token is resolved exactly like canvas, not by another URL regex',async()=>{
 const f=fixture(),screen=page('<main>标题</main>',`@font-face{font-family:Imported;src:url('assets/\\69mports/fonts/${'a'.repeat(64)}.woff2')}`);
 expect((await readProjectRenderResources(f.storage,[screen],assets)).issues).toEqual([]);expect(f.calls).toEqual([font]);
});
for(const kind of ['image','font','l4'] as const)test(`missing ${kind} is not masked by a stale exists=true check`,async()=>{
 const f=fixture(),path=kind==='image'?image:font;f.files.delete(path);f.storage.exists=async()=>true;
 const screen=page(kind==='image'?`<main><img src="${path}"></main>`:'<main>页面</main>',kind==='font'?`@font-face{font-family:F;src:url(${font})}`:undefined);
 const overrides=kind==='l4'?{'page:title':{nid:'title',declarations:{src:`url(${font})`}}}:{};
 const result=await readProjectRenderResources(f.storage,[screen],assets,overrides);expect(result.issues[0].code).toBe('missing_asset_file');expect(result.issues[0].entityId).toBe('page');expect(result.issues[0].message).toContain('不存在');
});
test('read exceptions block and report the exact page/dependency',async()=>{
 const f=fixture();f.storage.readBinary=async()=>{throw Error('permission denied');};const result=await readProjectRenderResources(f.storage,[page(`<img src="${image}">`)],assets);
 expect(result.issues[0]).toMatchObject({code:'asset_check_unavailable',entityId:'page'});expect(result.issues[0].message).toContain(image);expect(result.issues[0].message).toContain('permission denied');
});
test('text/comments/data/remote/arbitrary paths are not read or fetched by the file audit',async()=>{
 const f=fixture(),result=await readProjectRenderResources(f.storage,[page(`<main>${font}<img src="https://fixture.invalid/photo.png"><img src="data:image/png;base64,dGVzdA=="></main>`,`/* url(${font}) */.x{content:'url(${font})';src:url(file:///etc/passwd)}`)],assets);
 expect(f.calls).toEqual([]);expect(result.files).toEqual([]);expect(result.issues).toEqual([]);
});
test('project audit includes imported fonts without registering them as image assets',async()=>{
 const f=fixture();f.files.delete(font);const result=await auditProjectAssets(f.storage,[page('<main>字体</main>',`@font-face{font-family:F;src:url(${font})}`)],[]);
 expect(result.files.map(f=>f.relPath)).toEqual([font]);expect(result.issues[0].message).toContain(font);expect(result.issues[0].entityId).toBe('page');
});
