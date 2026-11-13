"""Local real-copy delivery/export verification. Never writes the source project.

Run with the local Vite server on 127.0.0.1:5174:
 /private/tmp/taudesign-rp-venv/bin/python scripts/verify-draft-delivery.py
No Provider calls or external network requests are permitted.
"""
import asyncio,base64,hashlib,json,os
from pathlib import Path
from urllib.parse import urlparse
from playwright.async_api import async_playwright

ROOT=Path(__file__).resolve().parents[1]
SOURCE=Path('/Users/theoly/workspace/aqmf/aqmf-app-pub-design')
SAMPLES=ROOT/'doc/draft-targeted-repair/evidence/real-samples/2026-11-13'
OUT=SAMPLES/os.environ.get('DRAFT_DELIVERY_OUTPUT','delivery')
OUT.mkdir(exist_ok=True)
BASE='http://127.0.0.1:5174/test/fixtures/draft-delivery.html'
sha=lambda b:hashlib.sha256(b).hexdigest()

async def main():
 manifest=json.loads((SOURCE/'project.json').read_text())
 input_files=[p for p in (SAMPLES/'assets').rglob('*') if p.is_file()]
 source_files=[SOURCE/name for name in json.loads((SAMPLES/'source-integrity.json').read_text())['before']]
 original={str(p):sha(p.read_bytes()) for p in source_files}
 reports=[];blocked=[];errors=[];browser_warnings=[];worker_events=[]
 async with async_playwright() as p:
  for engine in os.environ.get('DRAFT_DELIVERY_ENGINES','chromium,webkit').split(','):
   browser=await getattr(p,engine).launch();context=await browser.new_context(viewport={'width':1500,'height':1100},accept_downloads=True)
   async def route(r):
    u=urlparse(r.request.url)
    if u.scheme in ('http','https','ws','wss') and (u.hostname not in ('localhost','127.0.0.1') or '/api/ai-' in u.path):
     blocked.append(r.request.url);await r.abort();return
    await r.continue_()
   await context.route('**/*',route)
   async def io(payload):
    assert payload['op']=='inputs' and payload['sample'] in os.environ.get('DRAFT_DELIVERY_SAMPLES','a,b').split(',')
    d=Path(os.environ['DRAFT_DELIVERY_SAMPLE_DIR']).resolve() if os.environ.get('DRAFT_DELIVERY_SAMPLE_DIR') else SAMPLES/payload['sample']
    return {'context':json.loads((d/'context.json').read_text()),'repaired':(d/'repaired.html').read_text(),
     'assets':[v for v in manifest['assets'].values() if (SAMPLES/v['relPath']).is_file()],
     'files':[{'relPath':str(f.relative_to(SAMPLES)),'bytes':base64.b64encode(f.read_bytes()).decode()} for f in input_files]}
   await context.expose_function('fixtureIO',io)
   for key in os.environ.get('DRAFT_DELIVERY_SAMPLES','a,b').split(','):
    print('Starting',engine,key,flush=True)
    page=await context.new_page()
    page.on('requestfailed',lambda r:worker_events.append({'engine':engine,'sample':key,'url':r.url,'failure':r.failure}) if 'media-resource-worker' in r.url else None)
    page.on('response',lambda r:worker_events.append({'engine':engine,'sample':key,'url':r.url,'status':r.status}) if 'media-resource-worker' in r.url else None)
    page.on('console',lambda m:worker_events.append({'engine':engine,'sample':key,'console':m.text}) if 'media-resource' in m.text or 'ServiceWorker' in m.text else None)
    def pageerror(e):
     record={'engine':engine,'sample':key,'message':str(e)}
     (browser_warnings if str(e).startswith('ResizeObserver loop') else errors).append(record)
    page.on('pageerror',pageerror)
    row={'engine':engine,'sample':key,'scope':'fresh-local-copy-contract-no-model'};reports.append(row)
    try:
     await page.goto(BASE+'?sample='+key);await page.wait_for_function('window.fixture',timeout=30000)
     await page.wait_for_function("fixture.state().stagedCandidateSaveStatus==='saved'",timeout=30000)
     row['projectId']=await page.evaluate('fixture.state().id')
     row['candidateSaved']=json.loads(await page.evaluate('fixture.candidateFile()'))['candidate']['candidateId']
     row['initialReport']=await page.evaluate('fixture.report()')
     # Wait for the first real iframe/media render before exercising reopening.
     # This observes production readiness, never injects a forged render result.
     if not os.environ.get('DRAFT_DELIVERY_IMMEDIATE_REOPEN'):
      await page.wait_for_function("fixture.report().status!=='pending'",timeout=30000)
      row['initialSettledReport']=await page.evaluate('fixture.report()')
      assert row['initialSettledReport']['status']=='ready',row['initialSettledReport']
     await page.goto(BASE+'?sample='+key+'&resume='+row['projectId']);await page.wait_for_function('window.fixture',timeout=30000)
     await page.wait_for_function('fixture.state().stagedScreen?.restoredFromDisk===true',timeout=30000)
     row['candidateReopened']=await page.evaluate('fixture.state().stagedScreen.candidateId')==row['candidateSaved']
     # Real iframe render and file evidence are produced by InfiniteCanvas.
     for _ in range(120):
      report=await page.evaluate('fixture.report()')
      if report and report.get('status')=='ready':break
      await asyncio.sleep(.5)
     row['adoptionReport']=report
     row['browserWorkerState']=await page.evaluate('''async()=>({controller:navigator.serviceWorker.controller?.scriptURL,workers:(await navigator.serviceWorker.getRegistrations()).map(r=>({scope:r.scope,active:r.active?.scriptURL}))})''')
     await page.screenshot(path=str(OUT/f'{engine}-{key}-candidate-ui.png'),full_page=False)
     assert report and report.get('status')=='ready',report
     baseline=await page.evaluate('fixture.state().screens[fixture.target].htmlContent')
     replacement=await page.evaluate('fixture.state().stagedScreen.newHtml')
     await page.get_by_role('button',name='采纳新版 (替换原版)',exact=True).click()
     await page.wait_for_function('fixture.state().stagedScreen===null',timeout=60000)
     assert await page.evaluate('fixture.state().screens[fixture.target].htmlContent')==replacement
     row['adopted']=True;row['historyAfterAdopt']=await page.evaluate('fixture.history()')
     row['deliveryArchives']=await page.evaluate('fixture.archives()')
     await page.evaluate('fixture.undo()');assert await page.evaluate('fixture.state().screens[fixture.target].htmlContent')==baseline
     row['undoRestoresOriginal']=True
     await page.evaluate('fixture.redo()');assert await page.evaluate('fixture.state().screens[fixture.target].htmlContent')==replacement
     row['redoRestoresRepair']=True
     await page.evaluate('fixture.save()')
     await page.goto(BASE+'?sample='+key+'&resume='+row['projectId']);await page.wait_for_function('window.fixture',timeout=30000)
     assert await page.evaluate('fixture.state().screens[fixture.target].htmlContent')==replacement
     assert await page.evaluate('fixture.state().stagedScreen===null')
     row['adoptedProjectReopened']=True
     # Download using the actual product ExportModal handlers, never screenshots.
     await page.evaluate('fixture.openExport()')
     html_button=page.get_by_role('button',name='保存独立 HTML 文件',exact=True)
     await html_button.wait_for();await page.wait_for_function("[...document.querySelectorAll('button')].some(e=>e.textContent.includes('保存独立 HTML 文件')&&!e.disabled)")
     async with page.expect_download(timeout=120000) as event:await html_button.click()
     download=await event.value;htmlfile=OUT/f'{engine}-{key}-export.html';await download.save_as(htmlfile)
     exported=htmlfile.read_text();assert 'data-taudesign-mobile-chrome' not in exported and '__aidesign_media' not in exported and 'blob:' not in exported
     row['htmlExport']={'file':str(htmlfile.relative_to(ROOT)),'sha256':sha(htmlfile.read_bytes()),'bytes':htmlfile.stat().st_size,'defaultNavigationAbsent':True}
     await page.get_by_role('button',name='高保真 PNG 渲染图',exact=True).click()
     await page.get_by_role('button',name='1x',exact=True).click()
     async with page.expect_download(timeout=120000) as event:await page.get_by_role('button',name='下载高清 PNG 图片',exact=True).click()
     download=await event.value;pngfile=OUT/f'{engine}-{key}-product-export.png';await download.save_as(pngfile)
     pixels=await page.evaluate('''async b64=>{const i=new Image();i.src='data:image/png;base64,'+b64;await i.decode();const c=document.createElement('canvas');c.width=i.width;c.height=i.height;const x=c.getContext('2d');x.drawImage(i,0,0);function stats(h){const p=x.getImageData(0,0,c.width,h).data,sum=[0,0,0],sum2=[0,0,0],n=p.length/4;for(let j=0;j<p.length;j+=4)for(let k=0;k<3;k++){sum[k]+=p[j+k];sum2[k]+=p[j+k]*p[j+k];}return sum.map((v,k)=>Math.sqrt(sum2[k]/n-(v/n)**2));}return {width:i.width,height:i.height,stddev:stats(c.height),top88Stddev:stats(88)};}''',base64.b64encode(pngfile.read_bytes()).decode())
     assert pixels['width']==390 and pixels['height']>1000 and max(pixels['stddev'])>20
     # The first 88px are the mobile status + WeChat navigation in the PNG.
     assert max(pixels['top88Stddev'])>10
     notice=await page.locator('#export-root').inner_text()
     row['pngExport']={'file':str(pngfile.relative_to(ROOT)),'sha256':sha(pngfile.read_bytes()),'bytes':pngfile.stat().st_size,**pixels,'engine':'foreign-object' if '兼容渲染' in notice else 'native','notice':notice}
     # Offline HTML view: no external fetches, real editable input and media.
     offline=await context.new_page();await offline.set_viewport_size({'width':390,'height':844});await offline.goto(htmlfile.as_uri());await offline.wait_for_load_state('load');await offline.evaluate('document.fonts.ready')
     row['offlineHtml']=await offline.evaluate('''async()=>{const masks=[...document.querySelectorAll('.icon-mask')].map(el=>({width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height,src:getComputedStyle(el).maskImage||getComputedStyle(el).webkitMaskImage}));for(const m of masks){const u=/^url\(["']?(.*?)["']?\)$/.exec(m.src)?.[1];m.inlineSvg=Boolean(u?.startsWith('data:image/svg+xml'));m.loaded=false;if(u){const i=new Image();i.src=u;try{await i.decode();m.loaded=i.naturalWidth>0;}catch{}}delete m.src;}return {viewportWidth:document.documentElement.clientWidth,height:Math.max(document.documentElement.scrollHeight,document.body.scrollHeight),images:[...document.images].map(i=>({loaded:i.complete&&i.naturalWidth>0,src:i.src.slice(0,30)})),masks,readonlyLabels:[...document.querySelectorAll('dt')].map(e=>e.textContent.trim()),chrome:document.querySelectorAll('[data-taudesign-mobile-chrome]').length,mainCta:[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='保存并完善'),secondaryCta:[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='稍后再说'),headings:[...document.querySelectorAll('h1,h2,h3,summary')].map(e=>e.textContent.trim())};}''')
     field=offline.get_by_label('昵称',exact=True);before=await field.input_value();await field.fill('本机交付验收');assert await field.input_value()=='本机交付验收';await field.fill(before)
     row['offlineHtml']['inputEditable']=True
     assert all(i['loaded'] for i in row['offlineHtml']['images'])
     assert row['offlineHtml']['masks'] and all(m['loaded'] and m['width']>0 and m['height']>0 for m in row['offlineHtml']['masks'])
     assert row['offlineHtml']['readonlyLabels']==['姓名','性别','生日','民族'] and row['offlineHtml']['mainCta'] and row['offlineHtml']['secondaryCta'] and row['offlineHtml']['viewportWidth']==390
     render_doc=await page.evaluate('fixture.exportDocument()');renderfile=OUT/f'{engine}-{key}-png-render-document.html';renderfile.write_text(render_doc)
     await offline.goto(renderfile.as_uri());await offline.evaluate('document.fonts.ready')
     row['pngDocument']=await offline.evaluate('''()=>({headerCount:document.querySelectorAll('[data-taudesign-mobile-chrome="header"]').length,status:document.querySelector('.td-mini-status')?.textContent,title:document.querySelector('.td-mini-title')?.textContent,chromeHeight:document.querySelector('.td-mini-chrome')?.getBoundingClientRect().height,height:Math.max(document.documentElement.scrollHeight,document.body.scrollHeight)})''')
     assert row['pngDocument']['headerCount']==1 and row['pngDocument']['status']=='9:41' and row['pngDocument']['chromeHeight']==92
     assert abs(row['pngDocument']['height']-row['pngExport']['height'])<=1
     row['pngDocument']['htmlToPngHeightDifference']=row['pngExport']['height']-row['offlineHtml']['height']
     assert abs(row['pngDocument']['htmlToPngHeightDifference']-92)<=2
     row['modelCalls']=await page.evaluate('fixture.models()');assert row['modelCalls']==0
     row['passed']=True;await offline.close()
     print('Passed',engine,key,flush=True)
    except Exception as e:
     row['error']=str(e);row['passed']=False
     print('Failed',engine,key,str(e)[:160],flush=True)
     try:row['lastReport']=await page.evaluate('window.fixture?.report()');row['browserDiagnostics']=await page.evaluate('''async()=>({url:location.href,alerts:[...document.querySelectorAll('[role="alert"]')].map(e=>e.textContent),controller:navigator.serviceWorker.controller?.scriptURL,workers:(await navigator.serviceWorker.getRegistrations()).map(r=>({scope:r.scope,active:r.active?.scriptURL,installing:r.installing?.scriptURL})),frames:[...document.querySelectorAll('iframe')].map(f=>({title:f.title,loaded:Boolean(f.contentDocument?.body),text:f.contentDocument?.body?.innerText?.slice(0,150)}))})''');await page.screenshot(path=str(OUT/f'{engine}-{key}-failure.png'))
     except Exception:pass
    finally:
     (OUT/'result.json').write_text(json.dumps({'reports':reports,'blockedRequests':blocked,'pageErrors':errors,'browserWarnings':browser_warnings,'workerEvents':worker_events},ensure_ascii=False,indent=2))
     await page.close()
   await context.close();await browser.close()
 after={str(f):sha(f.read_bytes()) for f in source_files}
 result={'reports':reports,'blockedRequests':blocked,'pageErrors':errors,'browserWarnings':browser_warnings,'workerEvents':worker_events,'immediateReopen':bool(os.environ.get('DRAFT_DELIVERY_IMMEDIATE_REOPEN')),'selectedSourceFilesUnchanged':original==after,'selectedSourceFileCount':len(original),'sourceHashesBefore':original,'sourceHashesAfter':after}
 (OUT/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
 print(json.dumps([{'engine':r['engine'],'sample':r['sample'],'passed':r['passed'],'error':r.get('error')} for r in reports],ensure_ascii=False))
 assert original==after and not blocked and not errors and all(r['passed'] for r in reports), 'See delivery/result.json for exact failures'

asyncio.run(main())
