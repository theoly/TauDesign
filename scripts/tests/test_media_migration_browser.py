#!/usr/bin/env python3
"""Actual settings UI + source-style capture + file-backed undo. Synthetic projects only."""
import argparse,asyncio,json
from pathlib import Path
from playwright.async_api import async_playwright
from PIL import Image,ImageChops,ImageStat

async def run(args):
 args.output.mkdir(parents=True,exist_ok=True);rows=[]
 async with async_playwright() as p:
  for engine in ['chromium','webkit']:
   browser=await getattr(p,engine).launch(headless=True)
   try:
    for device in ['mobile','pc']:
     page=await browser.new_page(viewport={'width':1600,'height':1000});errors=[]
     page.on('pageerror',lambda error:errors.append(str(error)))
     await page.goto('http://127.0.0.1:5174/test/fixtures/media-migration.html',wait_until='networkidle')
     await page.wait_for_function('Boolean(window.mediaMigrationHarness)')
     await page.evaluate('(device)=>window.mediaMigrationHarness.setup(device)',device)
     await page.get_by_role('checkbox').check();await page.get_by_role('button',name='准备转换并预览').click()
     try:
      await page.get_by_title('媒体转换后：媒体样张',exact=True).wait_for(timeout=35000)
      await page.wait_for_function("!Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='应用媒体转换')?.disabled")
     except Exception:
      (args.output/f'{engine}-{device}-failure.json').write_text(json.dumps({'body':await page.locator('body').inner_text(),'errors':errors},ensure_ascii=False,indent=2))
      raise
     await page.wait_for_timeout(400)
     frames=[]
     for kind,label in [('before','前'),('after','后')]:
      path=args.output/f'{engine}-{device}-{kind}.png';await page.get_by_title(f'媒体转换{label}：媒体样张',exact=True).screenshot(path=str(path));frames.append(Image.open(path).convert('RGB'))
     diff=sum(ImageStat.Stat(ImageChops.difference(*frames)).mean)/3
     await page.get_by_role('button',name='应用媒体转换',exact=True).click()
     await page.get_by_text('媒体已转换为独立文件；可通过撤销恢复原页面。',exact=True).wait_for()
     result=await page.evaluate('window.mediaMigrationHarness.saveReopenUndo()')
     row={'engine':engine,'device':device,'meanPixelDifference':diff,'errors':errors,**result};rows.append(row)
     if diff>1.5 or errors or not result['undoExact'] or not result['redoExact'] or result['historyHasDrawing'] or result['mediaCount'] or result['past']!=1:raise AssertionError(row)
     await page.close()
   finally:await browser.close()
 (args.output/'results.json').write_text(json.dumps({'scope':'synthetic-settings-migration-and-same-process-file-reload','checks':rows},ensure_ascii=False,indent=2)+'\n');print(json.dumps(rows,ensure_ascii=False))

if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--output',type=Path,required=True);asyncio.run(run(parser.parse_args()))
