#!/usr/bin/env python3
"""Exercise the real HTML import dialog, preview receipt, render gates and persistence."""
import argparse
import asyncio
import json
from pathlib import Path
from playwright.async_api import async_playwright

PNG='iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAGUlEQVR4nGP4z8DwnxLMMGrAqAGjBgwXAwAwxP4QHCfkAAAAAABJRU5ErkJggg=='
HTML='''<!doctype html><html><head><title>导入卡片</title><style>
body{margin:0;background:#f8f2eb;color:#25302a;font-family:Arial,sans-serif}main{padding:18px}.source-card{background:#fff;border-radius:19px;padding:18px;margin-bottom:16px;box-shadow:0 6px 16px rgba(60,40,20,.06)}
h1{font-size:22px;margin:0 0 12px}p{font-size:14px;line-height:1.6}.packages{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.package{background:#f9dfbc;border-radius:14px;padding:12px;text-align:center}.illustration{width:36px;height:36px;object-fit:cover}
button{width:100%;padding:14px;border:0;border-radius:14px;background:#d6592e;color:#fff;font-size:15px}
</style></head><body><div class="status-bar">9:41</div><nav class="appbar"><span class="appbar-title">导入卡片</span></nav><main><section class="source-card"><h1>充值方案</h1><p style="border-radius:17px;color:#25302a">导入保留静态内容与样式</p><img class="illustration" src="data:image/png;base64,PNG_DATA" alt="示例图"></section><section class="source-card packages"><div class="package">60币</div><div class="package">300币</div><div class="package">980币</div></section><button>确认方案</button></main></body></html>'''.replace('PNG_DATA',PNG)

async def main(args):
    async with async_playwright() as p:
        browser=await getattr(p,args.browser).launch(headless=True)
        page=await browser.new_page(viewport={'width':1600,'height':1000},locale='zh-CN')
        errors=[]
        page.on('pageerror',lambda error:errors.append(str(error)))
        try:
            await page.goto(args.url,wait_until='networkidle')
            await page.wait_for_function('Boolean(window.__projectStore)')
            checks=[]
            for mode,label in [('preserve','保留原貌'),('unify','项目统一'),('selective','选择性统一')]:
                fixture=await page.evaluate('''async mode=>{
                  const {neutralModernTheme}=await import('/src/utils/themePresets.ts');
                  const loaded=performance.getEntriesByType('resource').map(entry=>entry.name).find(url=>new URL(url).pathname==='/src/stores/useWorkspaceStore.ts');
                  const {useWorkspaceStore}=await import(loaded),s=window.__projectStore;
                  const id=s.getState().initNewProject({name:'HTML 导入 '+mode,deviceProfile:'mobile',designSystem:neutralModernTheme,createSpecimen:false});
                  useWorkspaceStore.setState({view:'workspace',activeProjectId:id});return {id,beforeTheme:JSON.stringify(s.getState().designSystem.tokens)};
                }''',mode)
                screen_button=page.get_by_role('button',name='页面',exact=True)
                if await screen_button.get_attribute('aria-pressed')!='true':
                    await screen_button.click()
                await page.get_by_role('button',name='导入 HTML 页面',exact=True).click()
                dialog=page.get_by_role('dialog',name='导入 HTML 页面')
                await dialog.get_by_label('选择 HTML 文件',exact=True).set_input_files({'name':'source.html','mimeType':'text/html','buffer':HTML.encode()})
                await dialog.get_by_role('button',name='确认导入',exact=True).wait_for()
                await dialog.get_by_label(label,exact=True).check()
                if mode=='selective':
                    await dialog.get_by_label('统一字体与字号',exact=True).uncheck()
                if mode=='preserve':
                    await dialog.get_by_label('以此页面建立项目风格',exact=True).check()
                await page.wait_for_function("Boolean(document.querySelector('[role=dialog] button')&&Array.from(document.querySelectorAll('[role=dialog] button')).some(b=>b.textContent==='确认导入'&&!b.disabled))")
                preview=page.frame_locator('iframe[title="导入结果预览"]')
                preview_style=await preview.locator('.source-card').first.evaluate('(el)=>({radius:getComputedStyle(el).borderRadius,background:getComputedStyle(el).backgroundColor,padding:getComputedStyle(el).padding})')
                await dialog.get_by_role('button',name='确认导入',exact=True).click()
                await dialog.wait_for(state='detached',timeout=20000)
                record=await page.evaluate('''async fixture=>{
                  const s=window.__projectStore.getState(),screen=Object.values(s.screens)[0],e=screen.metadata.creationEvidence;
                  if(!e||e.workflow.status!=='ready'||e.render.status!=='complete'||!e.workflow.checks.some(c=>c.id==='import-preview'&&c.status==='passed'))throw new Error(JSON.stringify(e));
                  const unknown=e.quality.findings.filter(f=>f.code==='unknown_class');
                  if(!unknown.length||unknown.some(f=>f.message.includes('不会产生任何样式')||!f.message.includes('页面自带 CSS')))throw new Error('Unknown class diagnostic wording incorrect');
                  const radius=e.quality.findings.find(f=>f.code==='literal_radius');
                  if(screen.metadata.importedHtml.mode!=='unify'&&(!radius?.message.includes('保留源页面圆角')||!radius.expected.includes('无需替换')))throw new Error('Retained radius diagnostic missing');
                  const {createProjectStorage}=await import('/src/services/storage/projectStorage.ts'),storage=createProjectStorage(s.id);
                  for(const file of e.files)if(!(await storage.exists(file.relPath)))throw new Error('Physical asset missing');
                  if(screen.htmlContent.includes('base64,'))throw new Error('Import kept base64 in source');
                  const loaded=performance.getEntriesByType('resource').map(entry=>entry.name).find(url=>new URL(url).pathname==='/src/stores/useHistoryStore.ts');
                  const {useHistoryStore}=await import(loaded);useHistoryStore.getState().undo();
                  if(s.id!==window.__projectStore.getState().id||Object.keys(window.__projectStore.getState().screens).length!==0)throw new Error('Undo failed');
                  if(JSON.stringify(window.__projectStore.getState().designSystem.tokens)!==fixture.beforeTheme)throw new Error('Theme undo failed');
                  useHistoryStore.getState().redo();window.__projectStore.getState().saveProject();
                  return {projectId:s.id,screenId:screen.id,name:screen.name,workflow:e.workflow,render:e.render,files:e.files,diagnostics:e.quality.findings};
                }''',fixture)
                frame=page.frame_locator('iframe[title="导入卡片"]')
                await frame.locator('.source-card').first.wait_for()
                actual=await frame.locator('.source-card').first.evaluate('(el)=>({radius:getComputedStyle(el).borderRadius,background:getComputedStyle(el).backgroundColor,padding:getComputedStyle(el).padding})')
                assert actual==preview_style,{'mode':mode,'preview':preview_style,'canvas':actual}
                if mode=='preserve':
                    assert actual=={'radius':'19px','background':'rgb(255, 255, 255)','padding':'18px'},actual
                assert await frame.locator('.status-bar').count()==0
                # Undo/redo remounts the frame before its local asset URLs are resolved.
                await page.wait_for_function("""()=>{const frame=document.querySelector('iframe[title="导入卡片"]');const img=frame?.contentDocument?.querySelector('img');return img?.complete&&img.naturalWidth>0&&img.getAttribute('src')?.startsWith('data:image/');}""")
                await frame.locator('img').evaluate('(img)=>img.decode()')
                pixel=await frame.locator('img').evaluate('(img)=>{const c=document.createElement("canvas");c.width=c.height=1;const x=c.getContext("2d");x.drawImage(img,0,0,1,1);return Array.from(x.getImageData(0,0,1,1).data)}')
                assert pixel==[255,0,0,255],{'mode':mode,'pixel':pixel}
                checks.append({'mode':mode,'previewStyle':preview_style,'canvasStyle':actual,'decodedPixel':pixel,**record})
            rejected=[]
            for kind,source in [('invisible',HTML.replace('color:#fff;font-size:15px','color:transparent;-webkit-text-fill-color:transparent;font-size:15px')),
                                ('unnamed',HTML.replace('<button>确认方案</button>','<button><svg width="24" height="24" viewBox="0 0 24 24"><path d="M3 3L20 20"/></svg></button>')),
                                ('font',HTML.replace('</style>','@font-face{font-family:Missing;src:url("assets/imports/fonts/'+('c'*64)+'.woff2")}</style>'))]:
                before=await page.evaluate('Object.keys(window.__projectStore.getState().screens).length')
                await page.get_by_role('button',name='导入 HTML 页面',exact=True).click()
                dialog=page.get_by_role('dialog',name='导入 HTML 页面')
                await dialog.get_by_label('选择 HTML 文件',exact=True).set_input_files({'name':kind+'.html','mimeType':'text/html','buffer':source.encode()})
                if kind in ('invisible','unnamed'):
                    await page.wait_for_function("Array.from(document.querySelectorAll('[role=dialog] button')).some(b=>b.textContent==='确认导入'&&!b.disabled)")
                    await dialog.get_by_role('button',name='确认导入',exact=True).click()
                alert=dialog.get_by_role('alert')
                await alert.wait_for(timeout=20000)
                message=await alert.inner_text()
                after=await page.evaluate('Object.keys(window.__projectStore.getState().screens).length')
                assert after==before,{'kind':kind,'before':before,'after':after}
                if kind=='font':
                    assert await dialog.get_by_role('button',name='确认导入',exact=True).is_disabled()
                else:
                    assert '不可见' in message or '文案' in message or '名称' in message,message
                rejected.append({'kind':kind,'message':message,'screensUnchanged':True})
                await dialog.get_by_role('button',name='取消',exact=True).click()
            await page.reload(wait_until='networkidle')
            await page.wait_for_function('Boolean(window.__projectStore)')
            reopened=await page.evaluate('''async checks=>{
              const loaded=performance.getEntriesByType('resource').map(entry=>entry.name).find(url=>new URL(url).pathname==='/src/stores/useWorkspaceStore.ts');
              const {useWorkspaceStore}=await import(loaded);const result=[];
              for(const check of checks){
                if(!useWorkspaceStore.getState().openProject(check.projectId))throw new Error('Reopen failed');
                const screen=window.__projectStore.getState().screens[check.screenId];
                if(screen.metadata.creationEvidence.workflow.status!=='ready')throw new Error('Evidence lost');
                window.__projectStore.getState().setActiveScreen(screen.id);result.push(check.mode);
              }return result;
            }''',checks)
            await page.wait_for_function("""()=>{const frame=document.querySelector('iframe[title="导入卡片"]');const img=frame?.contentDocument?.querySelector('img');return img?.complete&&img.naturalWidth>0&&img.getAttribute('src')?.startsWith('data:image/');}""")
            await page.frame_locator('iframe[title="导入卡片"]').locator('img').evaluate('(img)=>img.decode()')
            inspector=page.get_by_role('button',name='元素属性',exact=True)
            if await inspector.get_attribute('aria-pressed')!='true':
                await inspector.click()
            note=page.get_by_text('导入页包含自带样式；Token 合规度仅衡量与项目基座的差异，不代表视觉还原度。保留原貌时无需自动统一这些差异。',exact=True)
            await note.wait_for(state='attached')
            title=await page.locator('[title^="Token 合规率:"]').get_attribute('title')
            assert '不代表视觉还原度' in title,title
            await page.get_by_text('页面创建验收记录',exact=True).click()
            await page.get_by_text('导入预览：通过',exact=False).wait_for()
            assert not errors,errors
            args.screenshot.parent.mkdir(parents=True,exist_ok=True)
            await page.screenshot(path=str(args.screenshot))
            report={'status':'passed','browser':args.browser,'version':browser.version,'checks':checks,'rejected':rejected,'reopened':reopened,'reopenedImageDecoded':True,'diagnosticUiNote':True,'pageErrors':errors,'screenshot':str(args.screenshot)}
            args.report.parent.mkdir(parents=True,exist_ok=True)
            args.report.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
            print(json.dumps({'status':'passed','browser':args.browser,'modes':reopened,'decodedImages':len(checks),'rejected':[entry['kind'] for entry in rejected]},ensure_ascii=False))
        except Exception:
            args.screenshot.parent.mkdir(parents=True,exist_ok=True)
            await page.screenshot(path=str(args.screenshot.with_stem(args.screenshot.stem+'-failure')))
            diagnostic=await page.evaluate('''async()=>{
              const frame=document.querySelector('iframe[title="导入卡片"]'),img=frame?.contentDocument?.querySelector('img'),s=window.__projectStore.getState();
              const {createProjectStorage}=await import('/src/services/storage/projectStorage.ts'),storage=createProjectStorage(s.id);
              return {projectId:s.id,assets:s.assets,srcDocHasDataImage:frame?.srcdoc.includes('data:image/'),srcDocImage:frame?.srcdoc.match(/<img[^>]+>/)?.[0],image:img?{src:img.getAttribute('src'),complete:img.complete,width:img.naturalWidth}:null,
                stored:await Promise.all(Object.values(s.assets).map(async a=>({path:a.relPath,binary:await storage.readBinary(a.relPath)}))),
                csp:frame?.contentDocument?.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content')};
            }''')
            print(json.dumps({'failureDiagnostic':diagnostic},ensure_ascii=False))
            raise
        finally:
            await browser.close()

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url',default='http://127.0.0.1:5174')
    parser.add_argument('--browser',choices=['chromium','webkit'],default='chromium')
    parser.add_argument('--screenshot',type=Path,default=Path('/tmp/taudesign-html-import.png'))
    parser.add_argument('--report',type=Path,default=Path('/tmp/taudesign-html-import.json'))
    asyncio.run(main(parser.parse_args()))
