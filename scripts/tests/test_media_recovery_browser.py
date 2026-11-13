#!/usr/bin/env python3
"""Real service worker, synthetic independent SVGs; no Provider or user project."""
import argparse,asyncio,json
from pathlib import Path
from playwright.async_api import async_playwright

async def poll(page,expression,predicate,timeout=20):
 end=asyncio.get_running_loop().time()+timeout
 while True:
  value=await page.evaluate(expression)
  if predicate(value):return value
  if asyncio.get_running_loop().time()>=end:raise AssertionError({'expression':expression,'actual':value})
  await asyncio.sleep(.05)

async def run(args):
 args.output.mkdir(parents=True,exist_ok=True);rows=[]
 async with async_playwright() as p:
  for engine in ['chromium','webkit']:
   browser=await getattr(p,engine).launch(headless=True)
   try:
    for mode in ['automatic','manual','cancel','ack']:
     page=await browser.new_page(viewport={'width':900,'height':1100});errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
     try:
      await page.goto(f'http://127.0.0.1:5174/test/fixtures/media-recovery.html?mode={mode}',wait_until='networkidle');await page.wait_for_function('Boolean(window.mediaRecoveryFixture)')
      if mode=='manual':
       await page.get_by_role('button',name='重试页面资源',exact=True).wait_for();assert await page.evaluate('mediaRecoveryFixture.starts')==2
       assert await page.locator('iframe').count()==0
       assert await page.evaluate("mediaRecoveryFixture.reports.at(-1)?.status")== 'unavailable'
       await page.screenshot(path=str(args.output/f'{engine}-manual-failure.png'),full_page=True)
       await page.get_by_role('button',name='重试页面资源',exact=True).click()
      if mode=='cancel':
       await page.wait_for_function('mediaRecoveryFixture.starts===1');await page.evaluate('mediaRecoveryFixture.switch()');await page.evaluate('mediaRecoveryFixture.release()')
      await page.locator('iframe').wait_for(timeout=25000)
      image=await poll(page,"(()=>{const f=document.querySelector('iframe'),i=f?.contentDocument?.querySelector('img');return i?{src:i.src,width:i.naturalWidth,complete:i.complete}:null})()",lambda value:value and value['complete'] and value['width']==64)
      assert '/__aidesign_media/' in image['src'] and not image['src'].startswith(('data:','blob:')),image
      rendered=await poll(page,'mediaRecoveryFixture.reports.at(-1)',lambda value:value and value['status']=='complete')
      assert [file['relPath'] for file in rendered['resourceFiles']]==['assets/icons/recovery-'+('two' if mode=='cancel' else 'one')+'.svg'],rendered
      snapshot=await page.evaluate('''async()=>{const f=mediaRecoveryFixture;return {starts:f.starts,messages:f.messages,reports:f.reports,sourceUnchanged:f.source()===f.original,history:f.history(),cache:await f.cache(),controller:!!navigator.serviceWorker.controller};}''')
      assert snapshot['sourceUnchanged'] and snapshot['history']==0 and snapshot['controller'],snapshot
      assert snapshot['starts']==({'automatic':2,'manual':3,'cancel':1,'ack':2}[mode]),snapshot
      assert len([m for m in snapshot['messages'] if m['type']=='register'])==(2 if mode=='ack' else 1),snapshot
      if mode=='ack':assert len([m for m in snapshot['messages'] if m['type']=='release'])==1,snapshot
      assert len(snapshot['cache'])==1,snapshot
      await page.screenshot(path=str(args.output/f'{engine}-{mode}-recovered.png'),full_page=True)
      await page.evaluate('mediaRecoveryFixture.stop()');assert await poll(page,'mediaRecoveryFixture.cache()',lambda value:not value)==[]
      assert not errors,errors
      rows.append({'engine':engine,'mode':mode,'image':image,'rendered':rendered,'releasedAfterUnmount':True,'errors':errors,**snapshot})
     except Exception:
      (args.output/f'{engine}-{mode}-failure.json').write_text(json.dumps({'body':await page.locator('body').inner_text(),'fixture':await page.evaluate('window.mediaRecoveryFixture?{starts:mediaRecoveryFixture.starts,messages:mediaRecoveryFixture.messages,reports:mediaRecoveryFixture.reports}:null'),'errors':errors},ensure_ascii=False,indent=2));raise
     finally:await page.close()
   finally:await browser.close()
 (args.output/'results.json').write_text(json.dumps({'scope':'real-service-worker-injected-transient-start-failure-and-isolated-svg','checks':rows},ensure_ascii=False,indent=2)+'\n');print(json.dumps(rows,ensure_ascii=False))
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--output',type=Path,required=True);asyncio.run(run(parser.parse_args()))
