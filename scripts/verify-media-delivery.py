"""Photo-only real product delivery verification. User explicitly excluded video.

Requires localhost Vite :5174 and local Playwright; no Provider/network service.
 /private/tmp/taudesign-rp-venv/bin/python -u scripts/verify-media-delivery.py
"""
import asyncio,base64,hashlib,json,os
from pathlib import Path
from urllib.parse import urlparse
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'doc/draft-targeted-repair/evidence/media-delivery'
BASE='http://127.0.0.1:5174/test/fixtures/media-delivery.html'
sha=lambda b:hashlib.sha256(b).hexdigest()

async def main():
 manifest=json.loads((OUT/'media-manifest.json').read_text());photo=next(f for f in manifest['files'] if f['mimeType']=='image/png');photo_bytes=(OUT/photo['file']).read_bytes();assert sha(photo_bytes)==photo['sha256']
 reports=[];outbound=[];errors=[];warnings=[]
 def save():
  (OUT/'result.json').write_text(json.dumps({'scope':'photo-only; video excluded by user','sourcePhoto':photo,'sourceBytesUnchanged':sha((OUT/photo['file']).read_bytes())==photo['sha256'],'reports':reports,'blockedRequests':outbound,'pageErrors':errors,'browserWarnings':warnings},ensure_ascii=False,indent=2))
 async with async_playwright() as p:
  for engine in os.environ.get('MEDIA_DELIVERY_ENGINES','chromium,webkit').split(','):
   print('Starting',engine,'photo',flush=True);browser=await getattr(p,engine).launch();context=await browser.new_context(viewport={'width':1500,'height':1100},accept_downloads=True)
   async def route(r):
    u=urlparse(r.request.url)
    if u.scheme in ('http','https','ws','wss') and (u.hostname not in ('127.0.0.1','localhost') or '/api/ai-' in u.path):outbound.append(r.request.url);await r.abort();return
    await r.continue_()
   await context.route('**/*',route)
   async def io(payload):
    assert payload['op']=='photo-input'
    return {'file':{**photo,'bytes':base64.b64encode(photo_bytes).decode()},'excluded':['video']}
   await context.expose_function('fixtureIO',io)
   page=await context.new_page();page.set_default_timeout(15000)
   def onerror(e):
    row={'engine':engine,'message':str(e)};(warnings if str(e).startswith('ResizeObserver loop') else errors).append(row)
   page.on('pageerror',onerror);row={'engine':engine,'scope':'fresh-local-photo-only-contract-no-model'};reports.append(row)
   try:
    await page.goto(BASE);await page.wait_for_function('window.fixture');await page.wait_for_function("fixture.state().stagedCandidateSaveStatus==='saved'");row['projectId']=await page.evaluate('fixture.state().id');row['candidateId']=json.loads(await page.evaluate('fixture.candidateFile()'))['candidate']['candidateId']
    await page.wait_for_function("fixture.report().status==='ready'",timeout=30000);row['initialReport']=await page.evaluate('fixture.report()');assert row['initialReport']['status']=='ready',row['initialReport']
    row['persistedBefore']=await page.evaluate('fixture.snapshot()');assert 'data:image/' not in json.dumps(row['persistedBefore']) and 'base64,' not in json.dumps(row['persistedBefore'])
    await page.goto(BASE+'?resume='+row['projectId']);await page.wait_for_function('window.fixture');await page.wait_for_function('fixture.state().stagedScreen?.restoredFromDisk===true');assert await page.evaluate('fixture.state().stagedScreen.candidateId')==row['candidateId']
    await page.wait_for_function("fixture.report().status==='ready'",timeout=30000);row['reopenedReport']=await page.evaluate('fixture.report()');assert row['reopenedReport']['status']=='ready',row['reopenedReport']
    row['candidateReopened']=True
    async def preview_photo():
     return await page.evaluate('''async()=>{const frames=[...document.querySelectorAll('iframe')].filter(f=>f.getBoundingClientRect().width>100);const doc=frames.map(f=>f.contentDocument).find(d=>d?.querySelector('h1')?.textContent==='独立照片交付验证');if(!doc)throw Error('Real candidate iframe missing');const img=doc.querySelector('img');await img.decode();const response=await fetch(img.currentSrc),bytes=await response.arrayBuffer(),digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(x=>x.toString(16).padStart(2,'0')).join('');const canvas=doc.createElement('canvas');canvas.width=16;canvas.height=16;canvas.getContext('2d').drawImage(img,0,0,16,16);const pixels=canvas.getContext('2d').getImageData(0,0,16,16).data;const values=[...pixels].filter((_,i)=>i%4!==3),mean=values.reduce((a,b)=>a+b,0)/values.length,variance=values.reduce((a,b)=>a+(b-mean)**2,0)/values.length;return {src:img.currentSrc,naturalWidth:img.naturalWidth,naturalHeight:img.naturalHeight,viewportWidth:doc.documentElement.clientWidth,sha256:digest,bytes:bytes.byteLength,pixelVariance:variance};}''')
    row['previewPhoto']=await preview_photo();assert row['previewPhoto']['naturalWidth']==356 and row['previewPhoto']['sha256']==photo['sha256'] and row['previewPhoto']['pixelVariance']>100 and '/__aidesign_media/' in row['previewPhoto']['src']
    baseline=await page.evaluate('fixture.state().screens[fixture.target].htmlContent');replacement=await page.evaluate('fixture.state().stagedScreen.newHtml')
    assert photo['relPath'] in replacement and 'data:' not in replacement and 'base64' not in replacement
    await page.get_by_role('button',name='采纳新版 (替换原版)',exact=True).click();await page.wait_for_function('fixture.state().stagedScreen===null',timeout=60000);assert await page.evaluate('fixture.state().screens[fixture.target].htmlContent')==replacement;row['adopted']=True
    await page.evaluate('fixture.undo()');assert await page.evaluate('fixture.state().screens[fixture.target].htmlContent')==baseline;row['undoRestoresOriginal']=True
    await page.evaluate('fixture.redo()');assert await page.evaluate('fixture.state().screens[fixture.target].htmlContent')==replacement;row['redoRestoresCandidate']=True
    await page.evaluate('fixture.save()');await page.goto(BASE+'?resume='+row['projectId']);await page.wait_for_function('window.fixture');assert await page.evaluate('fixture.state().screens[fixture.target].htmlContent')==replacement and await page.evaluate('fixture.state().stagedScreen===null');row['adoptedProjectReopened']=True
    stored=await page.evaluate('fixture.photoBytes()');assert sha(base64.b64decode(stored))==photo['sha256'];row['storedPhotoSha256']=sha(base64.b64decode(stored));row['deliveryArchives']=await page.evaluate('fixture.archives()')
    await page.evaluate('fixture.openExport()');button=page.get_by_role('button',name='保存独立 HTML 文件',exact=True);await button.wait_for();await page.wait_for_function("[...document.querySelectorAll('button')].some(e=>e.textContent.includes('保存独立 HTML 文件')&&!e.disabled)")
    async with page.expect_download(timeout=60000) as event:await button.click()
    download=await event.value;htmlfile=OUT/f'{engine}-photo-export.html';await download.save_as(htmlfile);html=htmlfile.read_text();assert 'data-taudesign-mobile-chrome' not in html and '__aidesign_media' not in html and 'blob:' not in html
    row['htmlExport']={'file':str(htmlfile.relative_to(ROOT)),'bytes':htmlfile.stat().st_size,'sha256':sha(htmlfile.read_bytes())}
    offline=await context.new_page();await offline.set_viewport_size({'width':390,'height':844});await offline.goto(htmlfile.as_uri())
    row['offlinePhoto']=await offline.evaluate('''async()=>{const i=document.querySelector('img');await i.decode();const b=Uint8Array.from(atob(i.src.split(',')[1]),c=>c.charCodeAt(0));const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',b))].map(n=>n.toString(16).padStart(2,'0')).join('');return {naturalWidth:i.naturalWidth,naturalHeight:i.naturalHeight,srcScheme:i.src.slice(0,22),sha256:hash,bytes:b.length,viewportWidth:document.documentElement.clientWidth,chrome:document.querySelectorAll('[data-taudesign-mobile-chrome]').length,title:document.querySelector('h1').textContent};}''');assert row['offlinePhoto']['sha256']==photo['sha256'] and row['offlinePhoto']['naturalWidth']==356 and row['offlinePhoto']['viewportWidth']==390 and row['offlinePhoto']['chrome']==0
    await page.get_by_role('button',name='高保真 PNG 渲染图',exact=True).click();await page.get_by_role('button',name='1x',exact=True).click()
    async with page.expect_download(timeout=60000) as event:await page.get_by_role('button',name='下载高清 PNG 图片',exact=True).click()
    download=await event.value;pngfile=OUT/f'{engine}-photo-product-export.png';await download.save_as(pngfile)
    renderdoc=await page.evaluate('fixture.exportDocument()');renderfile=OUT/f'{engine}-photo-png-render-document.html';renderfile.write_text(renderdoc);await offline.goto(renderfile.as_uri());await offline.evaluate('document.fonts.ready')
    row['renderPhoto']=await offline.evaluate('''async()=>{const i=document.querySelector('img');await i.decode();const r=i.getBoundingClientRect(),cta=[...document.querySelectorAll('button')].find(b=>b.textContent==='确认照片');return {left:r.left,top:r.top,width:r.width,height:r.height,naturalWidth:i.naturalWidth,chromeHeight:document.querySelector('.td-mini-chrome').getBoundingClientRect().height,bodyHeight:document.body.getBoundingClientRect().height,ctaBottom:cta.getBoundingClientRect().bottom,docViewportHeight:Math.max(document.documentElement.scrollHeight,document.body.scrollHeight)};}''')
    row['pngPixels']=await page.evaluate('''async({png,photo,rect})=>{const a=new Image(),b=new Image();a.src='data:image/png;base64,'+png;b.src='data:image/png;base64,'+photo;await Promise.all([a.decode(),b.decode()]);const ca=document.createElement('canvas'),cb=document.createElement('canvas');ca.width=a.width;ca.height=a.height;cb.width=b.width;cb.height=b.height;ca.getContext('2d').drawImage(a,0,0);cb.getContext('2d').drawImage(b,0,0);let error=0,values=[];for(let y=0;y<8;y++)for(let x=0;x<8;x++){const u=(x+.5)/8,v=(y+.5)/8,p=ca.getContext('2d').getImageData(Math.floor(rect.left+u*rect.width),Math.floor(rect.top+v*rect.height),1,1).data,q=cb.getContext('2d').getImageData(Math.floor(u*b.width),Math.floor(v*b.height),1,1).data;for(let k=0;k<3;k++){error+=Math.abs(p[k]-q[k]);values.push(p[k]);}}const mean=values.reduce((a,b)=>a+b,0)/values.length;return {width:a.width,height:a.height,photoMeanAbsoluteError:error/values.length,photoVariance:values.reduce((a,b)=>a+(b-mean)**2,0)/values.length};}''',{'png':base64.b64encode(pngfile.read_bytes()).decode(),'photo':base64.b64encode(photo_bytes).decode(),'rect':row['renderPhoto']})
    row['pngExport']={'file':str(pngfile.relative_to(ROOT)),'bytes':pngfile.stat().st_size,'sha256':sha(pngfile.read_bytes()),'engine':'foreign-object' if '兼容渲染' in await page.locator('#export-root').inner_text() else 'native'}
    assert row['pngPixels']['width']==390 and row['pngPixels']['photoVariance']>100 and row['pngPixels']['photoMeanAbsoluteError']<20, row['pngPixels']
    assert row['renderPhoto']['chromeHeight']==92 and abs(row['renderPhoto']['bodyHeight']-row['pngPixels']['height'])<=1, row['renderPhoto']
    assert row['renderPhoto']['top']+row['renderPhoto']['height']<=row['pngPixels']['height'] and row['renderPhoto']['ctaBottom']<=row['pngPixels']['height']
    row['persistedAfter']=await page.evaluate('fixture.snapshot()');assert 'data:image/' not in json.dumps(row['persistedAfter']) and 'base64,' not in json.dumps(row['persistedAfter'])
    row['modelCalls']=await page.evaluate('fixture.models()');assert row['modelCalls']==0;row['passed']=True;await offline.close();print('Passed',engine,'photo',flush=True)
   except Exception as e:
    row['passed']=False;row['error']=repr(e);print('Failed',engine,repr(e)[:300],flush=True)
    try:row['lastReport']=await page.evaluate('window.fixture?.report()');await page.screenshot(path=str(OUT/f'{engine}-photo-failure.png'))
    except Exception:pass
   finally:
    save();await page.close();await context.close();await browser.close()
 save();print(json.dumps([{'engine':r['engine'],'passed':r['passed'],'error':r.get('error')} for r in reports],ensure_ascii=False));assert all(r['passed'] for r in reports) and not outbound and not errors,'See media-delivery/result.json'
asyncio.run(main())
