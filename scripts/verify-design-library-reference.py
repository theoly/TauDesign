#!/usr/bin/env python3
"""Verify pinned reference updates, offline cache, and editable-copy conversion in the library dialog with a virtual read-only source IPC and real browser target storage/rendering."""
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
              const id=store.getState().initNewProject({name:'固定版本参考浏览器验证',deviceProfile:'mobile',designSystem:neutralModernTheme,createSpecimen:false});
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
            async def editor():
                await page.get_by_role('button',name='设计系统',exact=True).click()
                await page.get_by_role('button',name='完整主题编辑器',exact=True).click()
                return page.get_by_role('region',name='设计库来源与使用方式',exact=True)
            panel=await editor()
            await panel.get_by_role('radio',name='固定版本只读参考',exact=True).check()
            await panel.get_by_role('button',name='从其他工程导入只读参考',exact=True).click()
            preview=page.get_by_label('设计库导入预览',exact=True)
            await preview.wait_for()
            assert not await page.evaluate('Boolean(window.__projectStore.getState().designLibraryBinding)')
            await preview.get_by_role('button',name='确认固定版本参考',exact=True).click()
            await panel.get_by_role('button',name='转为项目副本',exact=True).wait_for()
            assert await page.get_by_label('自定义品牌主色',exact=True).is_disabled()
            assert await page.get_by_role('button',name='并排对比采纳',exact=True).is_disabled()
            await page.get_by_text('选择主题风格预设',exact=True).click()
            presets=page.get_by_label('设计 Token 编辑',exact=True).locator('button')
            assert await presets.count()>4
            assert all([await button.is_disabled() for button in await presets.all()])
            applied=await page.evaluate('''async()=>{
              const s=window.__projectStore.getState();window.__firstBinding=structuredClone(s.designLibraryBinding);
              const firstAsset=Object.values(s.assets)[0];window.__firstAsset=firstAsset;
              const failures=[];for(const fn of [()=>s.setDesignSystem(s.designSystem),()=>s.updateComponent('lib-source-card',{name:'绕过'}),()=>s.deleteComponent('lib-source-card'),()=>s.removeAsset(firstAsset.id)]){try{fn();}catch(error){failures.push(error.message);}}
              if(failures.length!==4||failures.some(m=>!m.includes('只读')))throw Error('Readonly store bypass');
              s.insertComponent('page','lib-source-card');window.__oldPage=window.__projectStore.getState().screens.page.htmlContent;
              return {binding:s.designLibraryBinding,firstAsset,blockedMutations:failures.length,sourceWrites:window.__libraryFixture.sourceWrites};
            }''')
            # Change source resource bytes and definition version, then explicitly update the pinned cache.
            import base64
            import io
            image_buffer=io.BytesIO();Image.new('RGBA',(16,16),(0,255,0,255)).save(image_buffer,format='PNG')
            green=base64.b64encode(image_buffer.getvalue()).decode()
            await page.evaluate('''green=>{const f=window.__libraryFixture;f.png=green;f.source.designSystemOrigin.tokenVersion++;
              f.source.components.card.version++;f.source.components.card.description='版本三';}''',green)
            await panel.get_by_role('button',name='检查并更新参考',exact=True).click()
            await preview.wait_for()
            assert '替换 1 个组件' in await preview.inner_text()
            await preview.get_by_role('button',name='确认固定版本参考',exact=True).click()
            await panel.get_by_role('button',name='检查并更新参考',exact=True).wait_for()
            updated=await page.evaluate('''async()=>{
              const s=window.__projectStore.getState(),old=window.__firstAsset;
              if(s.screens.page.htmlContent!==window.__oldPage)throw Error('Update rewrote old instance');
              const assets=Object.values(s.assets);if(assets.length!==2||!s.assets[old.id])throw Error('Versioned assets lost');
              const load=performance.getEntriesByType('resource').map(e=>e.name).find(u=>new URL(u).pathname==='/src/stores/useHistoryStore.ts');
              const {useHistoryStore}=await import(load);const after=structuredClone(s.designLibraryBinding);
              useHistoryStore.getState().undo();if(window.__projectStore.getState().designLibraryBinding.sourceFingerprint!==window.__firstBinding.sourceFingerprint)throw Error('Update undo failed');
              useHistoryStore.getState().redo();if(window.__projectStore.getState().designLibraryBinding.sourceFingerprint!==after.sourceFingerprint)throw Error('Update redo failed');
              window.__projectStore.getState().insertComponent('page','lib-source-card');window.__projectStore.getState().saveProject();
              return {binding:after,assets,oldInstancePreserved:true,sourceWrites:window.__libraryFixture.sourceWrites};
            }''')
            assert updated['sourceWrites']==0
            args.screenshot.parent.mkdir(parents=True,exist_ok=True)
            await page.screenshot(path=str(args.screenshot.with_stem(args.screenshot.stem+'-locked')))
            await page.get_by_role('button',name='完成',exact=True).click()
            # Refresh and reopen without any source IPC: the pinned cache must remain useful offline.
            await page.reload(wait_until='networkidle')
            await page.wait_for_function('Boolean(window.__projectStore)')
            reopened=await page.evaluate('''async id=>{
              const load=performance.getEntriesByType('resource').map(e=>e.name).find(u=>new URL(u).pathname==='/src/stores/useWorkspaceStore.ts');
              const {useWorkspaceStore}=await import(load);if(!useWorkspaceStore.getState().openProject(id))throw Error('Reopen failed');
              const s=window.__projectStore.getState();s.setActiveScreen('page');
              const {libraryReferenceIssue,verifyLibraryReferenceFiles}=await import('/src/services/ai/designLibraryReference.ts');
              const {createProjectStorage}=await import('/src/services/storage/projectStorage.ts');
              if(libraryReferenceIssue(s)||(await verifyLibraryReferenceFiles(createProjectStorage(id),s)).length)throw Error('Invalid offline cache');
              if(s.designLibraryBinding.mode!=='pinned_reference')throw Error('Reference unlocked on reload');
              const json=JSON.stringify(s.designLibraryBinding);if(json.includes('/virtual/')||json.includes('base64'))throw Error('Leaked source path or binary');
              return {mode:s.designLibraryBinding.mode,files:Object.keys(s.designLibraryBinding.referenceSnapshot.files).length};
            }''',fixture['id'])
            frame=page.frame_locator('iframe[title="目标页面"]')
            await frame.get_by_alt_text('品牌图',exact=True).nth(1).wait_for()
            decoded=[]
            for img in await frame.get_by_alt_text('品牌图',exact=True).all():
                decoded.append(await img.evaluate('''async img=>{await img.decode();const c=document.createElement('canvas');c.width=c.height=16;c.getContext('2d').drawImage(img,0,0);return Array.from(c.getContext('2d').getImageData(0,0,1,1).data);}'''))
            assert decoded==[[255,0,0,255],[0,255,0,255]],decoded
            await page.screenshot(path=str(args.screenshot.with_stem(args.screenshot.stem+'-offline')))
            # Export the offline pinned cache via the real delivery UI.
            await page.get_by_role('button',name='交付导出',exact=True).click()
            async with page.expect_download() as download:
                await page.get_by_role('button',name='保存独立 HTML 文件',exact=True).click()
            html_file=args.screenshot.with_stem(args.screenshot.stem+'-export').with_suffix('.html')
            await (await download.value).save_as(str(html_file))
            exported_page=await browser.new_page();await exported_page.set_content(html_file.read_text(),wait_until='load')
            exported_pixels=[]
            for img in await exported_page.get_by_alt_text('品牌图',exact=True).all():
                exported_pixels.append(await img.evaluate('''async img=>{await img.decode();const c=document.createElement('canvas');c.width=c.height=16;c.getContext('2d').drawImage(img,0,0);return Array.from(c.getContext('2d').getImageData(0,0,1,1).data);}'''))
            assert exported_pixels==decoded,exported_pixels
            await exported_page.close()
            # A reload closes UI panels, open theme again and verify conversion changes only the lock.
            await page.reload(wait_until='networkidle')
            await page.wait_for_function('Boolean(window.__projectStore)')
            await page.evaluate('''async id=>{const url=performance.getEntriesByType('resource').map(e=>e.name).find(u=>new URL(u).pathname==='/src/stores/useWorkspaceStore.ts');const {useWorkspaceStore}=await import(url);useWorkspaceStore.getState().openProject(id);}''',fixture['id'])
            panel=await editor()
            assert await page.get_by_label('自定义品牌主色',exact=True).is_disabled()
            await panel.get_by_role('button',name='转为项目副本',exact=True).click()
            assert not await page.get_by_label('自定义品牌主色',exact=True).is_disabled()
            conversion=await page.evaluate('''async()=>{
              const s=window.__projectStore.getState();if(s.designLibraryBinding.mode!=='project_copy')throw Error('Conversion failed');
              const original=s.screens.page.htmlContent,load=performance.getEntriesByType('resource').map(e=>e.name).find(u=>new URL(u).pathname==='/src/stores/useHistoryStore.ts');
              const {useHistoryStore}=await import(load);useHistoryStore.getState().undo();
              if(window.__projectStore.getState().designLibraryBinding.mode!=='pinned_reference')throw Error('Conversion undo did not restore lock');
              useHistoryStore.getState().redo();if(window.__projectStore.getState().screens.page.htmlContent!==original)throw Error('Conversion changed appearance');
              window.__projectStore.getState().updateComponent('lib-source-card',{description:'独立副本可编辑'});return {undoRedo:true,editable:true,appearancePreserved:true};
            }''')
            await page.screenshot(path=str(args.screenshot))
            assert not errors,errors
            report={'status':'passed','browser':args.browser,'version':browser.version,'source':'virtual read-only native IPC fixture','target':'actual browser storage, iframe and HTML export',
                    'applied':applied,'updated':updated,'reopenedOffline':reopened,'decodedPixels':decoded,'exportedPixels':exported_pixels,'conversion':conversion,'pageErrors':errors}
            if args.report:
                args.report.parent.mkdir(parents=True,exist_ok=True);args.report.write_text(json.dumps(report,ensure_ascii=False,indent=2))
            print(json.dumps({'status':'passed','browser':args.browser,'sourceWrites':0,'pixels':decoded,'conversion':conversion},ensure_ascii=False))
        except Exception:
            args.screenshot.parent.mkdir(parents=True,exist_ok=True);await page.screenshot(path=str(args.screenshot.with_stem(args.screenshot.stem+'-failure')))
            print(json.dumps({'pageErrors':errors,'text':(await page.locator('body').inner_text())[-3500:]},ensure_ascii=False));raise
        finally:
            await browser.close()

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url',default='http://127.0.0.1:5174');parser.add_argument('--browser',choices=['chromium','webkit'],default='chromium')
    parser.add_argument('--screenshot',type=Path,default=Path('/tmp/taudesign-library-reference.png'));parser.add_argument('--report',type=Path)
    asyncio.run(main(parser.parse_args()))
