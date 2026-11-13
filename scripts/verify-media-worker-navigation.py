"""Bounded synthetic WebKit SW navigation comparison, route on/off, no business data."""
import asyncio,json,os
from pathlib import Path
from urllib.parse import urlparse
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'doc/draft-targeted-repair/evidence/real-samples/2026-11-13/delivery/media-worker-navigation.json'
URL='http://127.0.0.1:5174/test/fixtures/media-worker-navigation.html'
async def main():
 rows=[]
 async with async_playwright() as p:
  browser=await p.webkit.launch()
  for routed in (False,) if os.environ.get('SW_ROUTE_OFF_ONLY') else (True,False):
   context=await browser.new_context();row={'engine':'webkit','routeEnabled':routed,'pageErrors':[],'events':[],'responses':[],'outbound':[]};rows.append(row)
   if routed:
    async def route(r):
     if urlparse(r.request.url).hostname not in ('127.0.0.1','localhost'):row['outbound'].append(r.request.url);await r.abort();return
     await r.continue_()
    await context.route('**/*',route)
   context.on('request',lambda r:row['outbound'].append(r.url) if urlparse(r.url).scheme in ('http','https') and urlparse(r.url).hostname not in ('127.0.0.1','localhost') else None)
   context.on('response',lambda r:row['responses'].append({'url':r.url,'status':r.status}) if 'media-resource-worker' in r.url or '__aidesign_media' in r.url else None)
   page=await context.new_page()
   page.on('pageerror',lambda e:row['pageErrors'].append({'message':str(e),'stack':e.stack}))
   page.on('console',lambda m:row['events'].append(json.loads(m.text[8:])) if m.text.startswith('SWTRACE:') else None)
   await page.add_init_script('''(()=>{const documentUrl=location.href;const report=(type,extra={})=>console.log('SWTRACE:'+JSON.stringify({documentUrl,type,...extra}));addEventListener('error',e=>report('window-error',{message:e.message}));addEventListener('unhandledrejection',e=>report('unhandled-rejection',{name:e.reason?.name,message:String(e.reason?.message??e.reason)}));window.swTrace=report;})();''')
   await page.goto(URL+'?phase=old')
   await page.evaluate('''()=>{const oldUrl=location.href;swTrace('register-start');navigator.serviceWorker.register('/media-resource-worker.js',{scope:'/'}).then(r=>console.log('SWTRACE:'+JSON.stringify({documentUrl:oldUrl,type:'register-resolved',scope:r.scope}))).catch(e=>console.log('SWTRACE:'+JSON.stringify({documentUrl:oldUrl,type:'register-rejected',name:e.name,message:e.message,stack:e.stack})));}''')
   await page.goto(URL+'?phase=new')
   try:
    row['activeDocument']=await asyncio.wait_for(page.evaluate('''async()=>{const {createMediaResourceSession}=await import('/src/services/storage/mediaResourceSession.ts');const session=createMediaResourceSession();window.testSession=session;const url=await session.url('synthetic-navigation.svg',btoa('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><rect width="24" height="24" fill="red"/></svg>'),'image/svg+xml');const image=new Image();image.src=url;document.body.append(image);await image.decode();const registrations=await navigator.serviceWorker.getRegistrations();return {url:location.href,mediaUrl:url,mediaWidth:image.naturalWidth,controller:navigator.serviceWorker.controller?.scriptURL,registrations:registrations.map(r=>({scope:r.scope,active:r.active?.scriptURL,installing:r.installing?.scriptURL}))};}'''),25)
    row['activeDocumentPassed']=row['activeDocument']['mediaWidth']==24 and row['activeDocument']['controller']=='http://127.0.0.1:5174/media-resource-worker.js'
    await page.evaluate('window.testSession.close()')
   except Exception as e:row['activeDocumentPassed']=False;row['activeDocumentError']=str(e)
   await page.wait_for_timeout(200)
   print(json.dumps(row,ensure_ascii=False),flush=True)
   OUT.write_text(json.dumps({'scope':'bounded synthetic cold-context WebKit run, immediately navigating while registration is pending','reports':rows},ensure_ascii=False,indent=2))
   try:await asyncio.wait_for(context.close(),5)
   except asyncio.TimeoutError:row['contextCloseTimedOut']=True
  try:await asyncio.wait_for(browser.close(),5)
  except asyncio.TimeoutError:pass
 OUT.write_text(json.dumps({'scope':'two bounded synthetic cold-context WebKit runs, immediately navigating while registration is pending','reports':rows},ensure_ascii=False,indent=2))
 assert all(r['activeDocumentPassed'] and not r['outbound'] for r in rows),'Active document failed; inspect saved diagnostics'
asyncio.run(main())
