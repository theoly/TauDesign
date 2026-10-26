#!/usr/bin/env python3
"""Exercise the library dialog with a virtual read-only source IPC and real browser target storage/rendering."""
import argparse
import asyncio
import json
from pathlib import Path
from PIL import Image
from playwright.async_api import async_playwright

PNG='iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAGUlEQVR4nGP4z8DwnxLMMGrAqAGjBgwXAwAwxP4QHCfkAAAAAABJRU5ErkJggg=='
async def main(args):
    async with async_playwright() as p:
        browser=await getattr(p,args.browser).launch(headless=True)
        page=await browser.new_page(viewport={'width':1600,'height':1000},locale='zh-CN')
        errors=[]
        page.on('pageerror',lambda error:errors.append(str(error)))
        try:
            await page.goto(args.url,wait_until='networkidle')
            await page.wait_for_function('Boolean(window.__projectStore)')
            fixture=await page.evaluate('''async png=>{
              const mod=async path=>import(performance.getEntriesByType('resource').map(e=>e.name).find(url=>new URL(url).pathname===path)||path);
              const {neutralModernTheme,techIndigoTheme}=await mod('/src/utils/themePresets.ts');
              const {useWorkspaceStore}=await mod('/src/stores/useWorkspaceStore.ts');
              const store=window.__projectStore;
              const id=store.getState().initNewProject({name:'设计库导入浏览器验证',deviceProfile:'mobile',designSystem:neutralModernTheme,createSpecimen:false});
              store.getState().addScreen({name:'目标页面',htmlContent:'<main data-nid="root" class="col gap-4 p-4"><h1>会员资料</h1></main>'},'page');
              useWorkspaceStore.setState({view:'workspace',activeProjectId:id});
              window.__libraryFixture={source:{id:'source',name:'品牌设计库',settings:{deviceProfile:'mobile'},designSystem:techIndigoTheme,designSystemOrigin:{tokenVersion:5},
                components:{card:{id:'card',name:'品牌卡片',description:'带图卡片',version:2,createdAt:1,updatedAt:1,
                  templateHtml:'<article class="card p-4" data-component-id="card"><h2>品牌卡片</h2><img src="assets/images/logo.png" data-asset-id="logo" alt="品牌图" width="32" height="32"></article>'}},
                assets:{logo:{id:'logo',name:'品牌图',type:'image',mimeType:'image/png',source:'upload',relPath:'assets/images/logo.png',refCount:0}}},png,pickerCalls:0,sourceWrites:0,holdPicker:false,readCommands:[]};
              window.__TAURI_INTERNALS__={invoke:async(cmd,params)=>{
                const f=window.__libraryFixture;
                if(cmd==='plugin:dialog|open'){f.pickerCalls++;if(f.holdPicker)return new Promise(resolve=>f.releasePicker=resolve);return '/virtual/library.aidesign';}
                if(params?.root==='/virtual/library.aidesign'){
                  if(!['project_read_text','project_read_binary'].includes(cmd)){f.sourceWrites++;throw new Error('Source write or unexpected source command '+cmd);}
                  f.readCommands.push(cmd+':'+params.rel);
                  return cmd==='project_read_text'?(params.rel==='project.json'?JSON.stringify(f.source):null):(params.rel==='assets/images/logo.png'?f.png:null);
                }
                throw new Error('Unexpected native command '+cmd);
              }};
              return {id,beforeTheme:neutralModernTheme.id};
            }''',PNG)
            await page.get_by_role('button',name='设计系统',exact=True).click()
            await page.get_by_role('button',name='完整主题编辑器',exact=True).click()
            panel=page.get_by_role('region',name='设计库来源与使用方式',exact=True)
            await panel.get_by_role('button',name='从其他工程导入副本',exact=True).click()
            preview=page.get_by_label('设计库导入预览',exact=True)
            await preview.wait_for()
            prepared=await page.evaluate('''async()=>{
              const s=window.__projectStore.getState();
              const {createProjectStorage}=await import('/src/services/storage/projectStorage.ts');
              if(s.designLibraryBinding||Object.keys(s.components).length)throw new Error('Preview applied library');
              if((await createProjectStorage(s.id).listDir('assets/images')).length)throw new Error('Preview wrote files');
              return {sourceReads:window.__libraryFixture.readCommands.length,sourceWrites:window.__libraryFixture.sourceWrites};
            }''')
            await preview.get_by_text('查看组件与资源清单',exact=True).click()
            await preview.get_by_text('预览来源主题',exact=True).click()
            await preview.locator('iframe').wait_for()
            controls=await preview.get_by_role('button',name='可视化',exact=True).evaluate('(button)=>{const span=button.querySelector("span"),r=span.getBoundingClientRect();return {height:r.height,lineHeight:parseFloat(getComputedStyle(span).lineHeight),width:button.getBoundingClientRect().width};}')
            assert controls['height']<=controls['lineHeight']+1 and controls['width']>=65,controls
            args.screenshot.parent.mkdir(parents=True,exist_ok=True)
            await page.screenshot(path=str(args.screenshot.with_stem(args.screenshot.stem+'-preview')))
            await preview.get_by_role('button',name='确认导入项目副本',exact=True).click()
            await panel.get_by_text('查看上次导入检查',exact=True).wait_for()
            applied=await page.evaluate('''async()=>{
              const s=window.__projectStore.getState(),binding=s.designLibraryBinding;
              if(!binding?.importEvidence||binding.sourceFingerprintVersion!==2)throw new Error('No import receipt');
              const {createProjectStorage}=await import('/src/services/storage/projectStorage.ts');
              const storage=createProjectStorage(s.id);for(const file of binding.importEvidence.files)if(!(await storage.exists(file.relPath)))throw new Error('Missing target file');
              const loaded=performance.getEntriesByType('resource').map(e=>e.name).find(url=>new URL(url).pathname==='/src/stores/useHistoryStore.ts');
              const {useHistoryStore}=await import(loaded);
              useHistoryStore.getState().undo();if(window.__projectStore.getState().designLibraryBinding)throw new Error('Undo lost atomicity');
              useHistoryStore.getState().redo();if(!window.__projectStore.getState().components['lib-source-card'])throw new Error('Redo lost component');
              window.__projectStore.getState().insertComponent('page','lib-source-card');
              window.__projectStore.getState().saveProject();
              return {binding,sourceWrites:window.__libraryFixture.sourceWrites,pickerCalls:window.__libraryFixture.pickerCalls};
            }''')
            assert applied['sourceWrites']==0
            await panel.get_by_text('查看上次导入检查',exact=True).click()
            await page.screenshot(path=str(args.screenshot))
            # Changed source after preview is rejected by the actual confirmation button.
            await panel.get_by_role('button',name='从其他工程导入副本',exact=True).click()
            await preview.wait_for()
            await page.evaluate('window.__libraryFixture.source.components.card.description="新的来源说明"')
            await preview.get_by_role('button',name='确认导入项目副本',exact=True).click()
            await panel.get_by_text('来源设计库已变化，请重新分析并确认预览。',exact=True).wait_for()
            assert await page.evaluate('window.__projectStore.getState().designLibraryBinding.sourceFingerprint')==applied['binding']['sourceFingerprint']
            # Choosing a source holds the original destination across a project switch.
            await page.evaluate('window.__libraryFixture.holdPicker=true')
            await panel.get_by_role('button',name='从其他工程导入副本',exact=True).click()
            await page.wait_for_function('Boolean(window.__libraryFixture.releasePicker)')
            await page.evaluate('''()=>{
              const s=window.__projectStore;s.getState().initNewProject({name:'切换目标',deviceProfile:'mobile',createSpecimen:false});
              window.__libraryFixture.releasePicker('/virtual/library.aidesign');
            }''')
            await panel.get_by_text('目标工程已变化或导入已取消，请重新选择。',exact=True).wait_for()
            assert not await page.evaluate('Boolean(window.__projectStore.getState().designLibraryBinding)')
            await page.reload(wait_until='networkidle')
            await page.wait_for_function('Boolean(window.__projectStore)')
            reopened=await page.evaluate('''async fixture=>{
              const url=performance.getEntriesByType('resource').map(e=>e.name).find(url=>new URL(url).pathname==='/src/stores/useWorkspaceStore.ts');
              const {useWorkspaceStore}=await import(url);if(!useWorkspaceStore.getState().openProject(fixture.id))throw new Error('Reopen failed');
              const s=window.__projectStore.getState();s.setActiveScreen('page');
              const saved=localStorage.getItem('aidesign:project:'+fixture.id);
              if(JSON.stringify(s.designLibraryBinding).includes('/virtual/')||JSON.stringify(s.designLibraryBinding).includes('base64'))throw new Error('Receipt leaked source path or payload');
              if(!s.components['lib-source-card']||!s.designLibraryBinding.importEvidence)throw new Error('Reload lost library');
              return {binding:s.designLibraryBinding,componentId:'lib-source-card'};
            }''',fixture)
            assert reopened['binding']==applied['binding']
            frame=page.frame_locator('iframe[title="目标页面"]')
            image=frame.get_by_alt_text('品牌图',exact=True)
            await image.wait_for()
            decoded=await image.evaluate('''async img=>{await img.decode();const c=document.createElement('canvas');c.width=16;c.height=16;c.getContext('2d').drawImage(img,0,0);return {width:img.naturalWidth,height:img.naturalHeight,pixel:Array.from(c.getContext('2d').getImageData(0,0,1,1).data)};}''')
            assert decoded=={'width':16,'height':16,'pixel':[255,0,0,255]},decoded
            await page.get_by_role('button',name='交付导出',exact=True).click()
            async with page.expect_download() as html_download:
                await page.get_by_role('button',name='保存独立 HTML 文件',exact=True).click()
            html_file=args.screenshot.with_stem(args.screenshot.stem+'-export').with_suffix('.html')
            await (await html_download.value).save_as(str(html_file))
            exported_html=html_file.read_text(encoding='utf-8')
            assert 'data:image/png;base64,'+PNG in exported_html
            exported_page=await browser.new_page()
            await exported_page.set_content(exported_html,wait_until='load')
            html_decode=await exported_page.get_by_alt_text('品牌图',exact=True).evaluate('async img=>{await img.decode();return {width:img.naturalWidth,height:img.naturalHeight};}')
            assert html_decode=={'width':16,'height':16}
            assert await exported_page.locator('[data-taudesign-mobile-chrome]').count()==0
            await exported_page.close()
            await page.get_by_role('button',name='高保真 PNG 渲染图',exact=True).click()
            await page.evaluate('''()=>{const source=Object.getOwnPropertyDescriptor(HTMLImageElement.prototype,'src');Object.defineProperty(HTMLImageElement.prototype,'src',{get:source.get,set(value){if(value.startsWith('data:image/svg+xml;charset=utf-8,'))window.__lastPngSvg=decodeURIComponent(value.split('charset=utf-8,')[1]);source.set.call(this,value);},configurable:true});}''')
            async with page.expect_download(timeout=30000) as png_download:
                await page.get_by_role('button',name='下载高清 PNG 图片',exact=True).click()
            png_file=args.screenshot.with_stem(args.screenshot.stem+'-export')
            await (await png_download.value).save_as(str(png_file))
            svg=await page.evaluate('window.__lastPngSvg');args.screenshot.with_stem(args.screenshot.stem+'-render').with_suffix('.svg').write_text(svg,encoding='utf-8')
            with Image.open(png_file) as exported:
                png_size=list(exported.size)
                red_pixels=sum(1 for color in exported.convert('RGB').get_flattened_data() if color==(255,0,0))
            assert png_size[0]==780 and red_pixels==4096,{'size':png_size,'redPixels':red_pixels}
            scales=await page.evaluate('''async()=>{
              const s=window.__projectStore.getState();const {resolveImportedResources}=await import('/src/services/import/importResources.ts');
              const {createProjectStorage}=await import('/src/services/storage/projectStorage.ts');const {getBaseCss}=await import('/src/styles/baseCss.ts');
              const {compileTokensToCss}=await import('/src/utils/cssCompiler.ts');const {renderScreenToPngDataUrl}=await import('/src/utils/exportRenderer.ts');
              const resolved=await resolveImportedResources(s.screens.page.htmlContent,s.screens.page.scopedCss,createProjectStorage(s.id),new Set(Object.values(s.assets).map(a=>a.relPath)));
              const results=[];for(const scale of [1,2,3]){
                const url=await renderScreenToPngDataUrl({...s.screens.page,htmlContent:resolved.htmlContent},{tokensCss:compileTokensToCss(s.designSystem.tokens,s.settings.colorMode),baseCss:getBaseCss('mobile'),screenOverrides:'',width:390,height:286,scale,bgColor:'#f8fafc',deviceProfile:'mobile',viewportHeight:844});
                const img=new Image();img.src=url;await img.decode();const c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;const ctx=c.getContext('2d');ctx.drawImage(img,0,0);
                const pixels=ctx.getImageData(0,0,c.width,c.height).data;let red=0;const bounds={left:c.width,top:c.height,right:0,bottom:0};
                for(let i=0;i<pixels.length;i+=4)if(pixels[i]===255&&pixels[i+1]===0&&pixels[i+2]===0){red++;const index=i/4,x=index%c.width,y=Math.floor(index/c.width);bounds.left=Math.min(bounds.left,x);bounds.top=Math.min(bounds.top,y);bounds.right=Math.max(bounds.right,x);bounds.bottom=Math.max(bounds.bottom,y);}
                if(red!==1024*scale*scale||bounds.right-bounds.left+1!==32*scale||bounds.bottom-bounds.top+1!==32*scale)throw new Error(JSON.stringify({scale,red,bounds}));
                results.push({scale,width:c.width,height:c.height,red,bounds});
              }return results;
            }''')
            exports={'html':str(html_file),'htmlImage':html_decode,'png':str(png_file),'pngSize':png_size,'redPixels':red_pixels}
            exports['scales']=scales
            assert not errors,errors
            report={'status':'passed','browser':args.browser,'version':browser.version,'source':'virtual read-only native IPC fixture','target':'actual browser storage and iframe',
                    'prepared':prepared,'previewControls':controls,'applied':applied,'reopened':reopened,'decoded':decoded,'exports':exports,'pageErrors':errors,'screenshot':str(args.screenshot),'previewScreenshot':str(args.screenshot.with_stem(args.screenshot.stem+'-preview'))}
            if args.report:
                args.report.parent.mkdir(parents=True,exist_ok=True);args.report.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
            print(json.dumps({'status':'passed','browser':args.browser,'sourceWrites':0,'receiptFiles':len(applied['binding']['importEvidence']['files']),'decoded':decoded['pixel']},ensure_ascii=False))
        except Exception:
            args.screenshot.parent.mkdir(parents=True,exist_ok=True);await page.screenshot(path=str(args.screenshot.with_stem(args.screenshot.stem+'-failure')))
            print(json.dumps({'pageErrors':errors,'text':(await page.locator('body').inner_text())[-5000:]},ensure_ascii=False));raise
        finally:
            await browser.close()

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url',default='http://127.0.0.1:5174');parser.add_argument('--browser',choices=['chromium','webkit'],default='chromium')
    parser.add_argument('--screenshot',type=Path,default=Path('/tmp/taudesign-library-import.png'));parser.add_argument('--report',type=Path)
    asyncio.run(main(parser.parse_args()))
