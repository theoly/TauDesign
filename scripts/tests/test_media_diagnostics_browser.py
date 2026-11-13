#!/usr/bin/env python3
"""Four isolated real-SW checks: explicit diagnostic download and canceled reads.

No original-project IO, Provider calls, media-content capture or natural-failure claim.
"""
import argparse,asyncio,hashlib,json
from pathlib import Path
from urllib.parse import urlparse
from playwright.async_api import async_playwright

ROOT=Path(__file__).resolve().parents[2]
INPUTS=['src/services/storage/mediaDiagnostics.ts','src/services/storage/mediaResourceSession.ts','src/hooks/useScreenResources.ts','src/components/common/MediaDiagnosticsButton.tsx','src/components/canvas/ScreenFrame.tsx','src/components/export/ExportModal.tsx','public/media-resource-worker.js','test/fixtures/media-recovery.html','scripts/tests/test_media_diagnostics_browser.py']
SNAPSHOT="async()=>{const m=await import('/src/services/storage/mediaDiagnostics.ts');return m.mediaDiagnosticsSnapshot();}"

async def poll(page,expression,predicate):
 end=asyncio.get_running_loop().time()+25
 while True:
  value=await page.evaluate(expression)
  if predicate(value):return value
  if asyncio.get_running_loop().time()>end:raise AssertionError({'expression':expression,'actual':value})
  await asyncio.sleep(.04)

async def run(args):
 args.output.mkdir(parents=True,exist_ok=False)
 source={name:hashlib.sha256((ROOT/name).read_bytes()).hexdigest() for name in INPUTS}
 results={'scope':__doc__.strip(),'checks':[],'blockedRequests':[],'sourceInputs':source}
 async with async_playwright() as p:
  for engine in ['chromium','webkit']:
   browser=await getattr(p,engine).launch()
   try:
    for mode in ['manual','cancel']:
     context=await browser.new_context(viewport={'width':1000,'height':1100},accept_downloads=True);page=await context.new_page();errors=[];downloads=[]
     async def guard(route):
      url=urlparse(route.request.url)
      if url.scheme in ['http','https','ws','wss'] and (url.hostname not in ['localhost','127.0.0.1'] or '/api/ai-' in url.path):
       results['blockedRequests'].append(route.request.url);await route.abort()
      else:await route.continue_()
     await context.route('**/*',guard);page.on('pageerror',lambda error:errors.append(str(error)));page.on('download',lambda download:downloads.append(download.suggested_filename))
     try:
      await page.goto(f'http://127.0.0.1:5174/test/fixtures/media-recovery.html?mode={mode}');await page.wait_for_function('window.mediaRecoveryFixture')
      export=None
      if mode=='manual':
       await page.get_by_role('button',name='导出资源诊断',exact=True).wait_for();assert not downloads
       async with page.expect_download() as info:await page.get_by_role('button',name='导出资源诊断',exact=True).click()
       download=await info.value;path=args.output/f'{engine}-explicit-diagnostics.json';await download.save_as(path);export=json.loads(path.read_text())
       assert any(e['stage']=='worker-start' and e['status']=='failed' and e['error']['name']=='TypeError' for e in export['events'])
       assert any(e['stage']=='retry' and e.get('attempt')==2 for e in export['events'])
       assert any(e['stage']=='resolve' and e['status']=='failed' for e in export['events'])
       await page.get_by_text('资源诊断已交由浏览器下载。',exact=True).wait_for()
       await page.get_by_role('button',name='重试页面资源',exact=True).click()
      else:
       await page.wait_for_function('mediaRecoveryFixture.starts===1');await page.evaluate('mediaRecoveryFixture.switch()');await page.evaluate('mediaRecoveryFixture.release()')
      await poll(page,"(()=>{const i=document.querySelector('iframe')?.contentDocument?.querySelector('img');return i?.complete&&i.naturalWidth===64;})()",bool)
      await poll(page,"mediaRecoveryFixture.reports.at(-1)?.status",lambda value:value=='complete')
      await page.evaluate('mediaRecoveryFixture.stop()');await poll(page,'mediaRecoveryFixture.cache()',lambda value:not value)
      diagnostic=await page.evaluate(SNAPSHOT);events=diagnostic['events'];text=json.dumps(diagnostic)
      assert any(e['stage']=='register' and e['status']=='completed' for e in events),'real worker acknowledgement not recorded'
      assert any(e['stage']=='release' and e['status']=='completed' for e in events),'real worker release not recorded'
      assert any(e['stage']=='close' and e['status']=='completed' for e in events)
      if mode=='cancel':assert any(e['status']=='canceled' for e in events)
      assert all(value not in text for value in ['assets/','data:','<svg','Injected registration','http:','https:','base64'])
      state=await page.evaluate('({sourceUnchanged:mediaRecoveryFixture.source()===mediaRecoveryFixture.original,history:mediaRecoveryFixture.history(),starts:mediaRecoveryFixture.starts})')
      assert state['sourceUnchanged'] and state['history']==0 and not errors
      results['checks'].append({'engine':engine,'mode':mode,'downloadCount':len(downloads),'explicitExport':export is not None,'diagnostic':diagnostic,'cacheAfterUnmount':[],'errors':errors,**state})
      print(engine,mode,'passed',len(events),'events',flush=True)
     finally:await asyncio.wait_for(context.close(),10)
   finally:await asyncio.wait_for(browser.close(),10)
 assert len(results['checks'])==4 and not results['blockedRequests']
 results['sourceInputsUnchanged']=source=={name:hashlib.sha256((ROOT/name).read_bytes()).hexdigest() for name in INPUTS};assert results['sourceInputsUnchanged']
 results['modelRequests']=0;results['status']='passed';(args.output/'result.json').write_text(json.dumps(results,ensure_ascii=False,indent=2)+'\n')

if __name__=='__main__':
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--output',type=Path,required=True);asyncio.run(asyncio.wait_for(run(parser.parse_args()),160))
