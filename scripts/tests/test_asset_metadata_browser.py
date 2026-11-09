#!/usr/bin/env python3
import asyncio,argparse,json
from pathlib import Path
from playwright.async_api import async_playwright
async def run(args):
 args.output.mkdir(parents=True,exist_ok=True);rows=[]
 async with async_playwright() as p:
  for engine in ['chromium','webkit']:
   browser=await getattr(p,engine).launch(headless=True)
   try:
    for device in ['mobile','pc']:
     page=await browser.new_page(viewport={'width':1400,'height':1000});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
     try:
      await page.goto('http://127.0.0.1:5174/test/fixtures/asset-metadata.html',wait_until='networkidle');await page.evaluate('(device)=>assetCacheHarness.setup(device)',device)
      section=page.locator('section[aria-label="旧SVG资源缓存整理"]')
      await section.get_by_role('checkbox').check();assert (await page.evaluate('assetCacheHarness.report()'))['cache']
      await section.get_by_role('button',name='检查所选旧图标缓存',exact=True).click()
      await section.get_by_role('button',name='确认移除所选旧缓存',exact=True).wait_for();assert '与独立文件相同' in await section.inner_text();assert (await page.evaluate('assetCacheHarness.report()'))=={'cache':True,'pageExact':True,'fileExact':True,'past':0}
      await section.scroll_into_view_if_needed();await page.screenshot(path=str(args.output/f'{engine}-{device}-confirm.png'),full_page=True)
      await section.get_by_role('button',name='确认移除所选旧缓存',exact=True).click();await section.get_by_text('所选旧缓存已整理；页面和独立资源文件保持原样，可撤销。',exact=True).wait_for()
      result=await page.evaluate('assetCacheHarness.reopenUndoRedo()');assert result=={'undoExact':True,'redoExact':True,'historyHasDrawing':False,'projectHasDrawing':False,'cache':False,'pageExact':True,'fileExact':True,'past':1},result;assert not errors,errors
      rows.append({'engine':engine,'device':device,'errors':errors,**result})
     except Exception:
      (args.output/f'{engine}-{device}-failure.json').write_text(json.dumps({'body':await page.locator('body').inner_text(),'errors':errors},ensure_ascii=False,indent=2));raise
     finally:await page.close()
   finally:await browser.close()
 (args.output/'results.json').write_text(json.dumps({'scope':'actual-settings-metadata-cleanup-and-same-process-storage-not-native-restart','checks':rows},ensure_ascii=False,indent=2)+'\n');print(json.dumps({'checks':len(rows),'errors':sum(len(row['errors']) for row in rows)}))
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--output',type=Path,required=True);asyncio.run(run(parser.parse_args()))
