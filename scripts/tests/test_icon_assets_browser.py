#!/usr/bin/env python3
"""Actual resource-center UI and iframe file-backed masks; fake clipboard and AI transport only."""
import argparse,asyncio,json
from pathlib import Path
from playwright.async_api import async_playwright

async def run(args):
 args.output.mkdir(parents=True,exist_ok=True);rows=[]
 async with async_playwright() as p:
  for engine in ['chromium','webkit']:
   browser=await getattr(p,engine).launch(headless=True)
   try:
    for device in ['mobile','pc']:
     page=await browser.new_page(viewport={'width':1600,'height':1000});errors=[]
     page.on('pageerror',lambda error:errors.append(str(error)))
     try:
      await page.goto(f'http://127.0.0.1:5174/test/fixtures/icon-assets.html?device={device}',wait_until='networkidle')
      await page.get_by_role('button',name='内置矢量图标 (Lucide)',exact=True).click()
      await page.get_by_text('用户 (User)',exact=True).click();await page.wait_for_function('iconAssetFixture.copies.length===1')
      await page.get_by_role('button',name='AI 矢量图标设计器',exact=True).click();await page.get_by_placeholder('输入图标概念，例如：量子芯片计算核心、带对勾的认证勋章...').fill('认证圆形图标');await page.get_by_role('button',name='生成图标',exact=True).click()
      await page.get_by_role('button',name='保存图标并复制页面引用',exact=True).wait_for()
      assert await page.evaluate('Object.keys(iconAssetFixture.state().assets).length')==1
      await page.get_by_role('button',name='保存图标并复制页面引用',exact=True).click();await page.wait_for_function('iconAssetFixture.copies.length===2')
      result=await page.evaluate('iconAssetFixture.showPage()');assert not result['violations'] and result['calls']==1 and len(result['assets'])==2,result
      assert all('rawSvg' not in asset and asset['relPath'].startswith('assets/icons/') for asset in result['assets']),result
      await page.wait_for_function("iconAssetFixture.state().screens.page?.measuredHeight>0")
      await page.wait_for_timeout(500)
      frame=None
      for candidate in page.frames:
       if candidate!=page.main_frame and await candidate.locator('svg[data-asset-id]').count()==2:frame=candidate;break
      assert frame is not None,'file-backed icon iframe missing'
      icons=await frame.evaluate('''()=>Array.from(document.querySelectorAll('svg[data-asset-id]')).map(el=>{const c=getComputedStyle(el),b=el.getBoundingClientRect();return {width:b.width,height:b.height,mask:c.maskImage||c.webkitMaskImage,background:c.backgroundColor,drawings:el.querySelectorAll('path,circle,rect').length};})''')
      assert all(icon['width']>0 and icon['height']>0 and icon['mask']!='none' and 'data:' not in icon['mask'] and icon['drawings']==0 for icon in icons),icons
      assert not errors,errors
      await page.screenshot(path=str(args.output/f'{engine}-{device}.png'),full_page=True);rows.append({'engine':engine,'device':device,'modelCalls':result['calls'],'assetCount':len(result['assets']),'icons':icons,'errors':errors})
     except Exception:
      (args.output/f'{engine}-{device}-failure.json').write_text(json.dumps({'body':await page.locator('body').inner_text(),'errors':errors},ensure_ascii=False,indent=2));raise
     finally:await page.close()
   finally:await browser.close()
 (args.output/'results.json').write_text(json.dumps({'scope':'synthetic-resource-center-file-backed-icons','checks':rows},ensure_ascii=False,indent=2)+'\n');print(json.dumps(rows,ensure_ascii=False))

if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--output',type=Path,required=True);asyncio.run(run(parser.parse_args()))
