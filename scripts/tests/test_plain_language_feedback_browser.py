#!/usr/bin/env python3
"""Real browser notice copy, collapsed diagnostics, and narrow-panel wrapping; no model calls."""
import argparse,asyncio,json
from pathlib import Path
from playwright.async_api import async_playwright
async def main(args):
 args.output.mkdir(parents=True,exist_ok=True);rows=[]
 async with async_playwright() as p:
  for name in ['chromium','webkit']:
   browser=await getattr(p,name).launch(headless=True)
   try:
    page=await browser.new_page(viewport={'width':390,'height':1000});errors=[];external=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    async def route(r):
     if r.request.url.startswith(args.base+'/'):await r.continue_()
     else:external.append(r.request.url);await r.abort()
    await page.route('**/*',route)
    await page.goto(args.base+'/test/fixtures/plain-language-feedback.html',wait_until='networkidle')
    await page.locator('[data-notice="legacy"]').wait_for()
    await page.locator('[aria-label="应用调用摘要"] > summary').click();await page.locator('[aria-label="本轮预算记录"] > summary').click()
    text=await page.locator('body').inner_text()
    for forbidden in ['SkeletonMainAtomic','完整main','functional-plan','prov-internal-fixture','结束：length','referenceImage.fields']:
     assert forbidden not in text,(name,forbidden,text)
    for expected in ['页面内容已生成','参考图字段尚未完整覆盖：居住地','梳理页面功能','达到回复长度上限','3,072','用量单位','不等同于字符数']:
     assert expected in text,(name,expected,text)
    assert not await page.evaluate('document.documentElement.scrollWidth>innerWidth')
    await page.screenshot(path=str(args.output/f'{name}-ordinary.png'),full_page=True)
    await page.locator('[data-notice="legacy"] [data-technical-details] > summary').click()
    assert await page.get_by_text('SkeletonMainAtomic：完整main已取得，仍须全部交付检查。',exact=True).is_visible()
    await page.locator('[aria-label="应用调用摘要"] [data-technical-details] > summary').click()
    advanced=await page.locator('body').inner_text();assert 'functional-plan' in advanced and 'HTTP 200' in advanced and 'prov-internal-fixture' in advanced
    assert not await page.evaluate('document.documentElement.scrollWidth>innerWidth')
    assert not errors,errors;assert not external,external
    rows.append({'browser':name,'ordinaryLanguage':True,'rawDiagnosticsPreserved':True,'horizontalOverflow':False,'pageErrors':errors,'externalRequests':external})
   finally:await browser.close()
 (args.output/'results.json').write_text(json.dumps({'scope':'production-notice-components-controlled-data-no-model','results':rows},ensure_ascii=False,indent=2)+'\n');print(json.dumps(rows))
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--base',default='http://127.0.0.1:5178');parser.add_argument('--output',type=Path,required=True);asyncio.run(main(parser.parse_args()))
