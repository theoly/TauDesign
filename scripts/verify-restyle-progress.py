#!/usr/bin/env python3
"""Controlled transport, real engine/executor/UI, no model network requests."""
import asyncio,json
from pathlib import Path
from playwright.async_api import async_playwright
OUT=Path(__file__).resolve().parents[1]/'doc/restyle-progress/evidence'

async def main():
 results=[]
 async with async_playwright() as pw:
  for name in ['chromium','webkit']:
   browser=await getattr(pw,name).launch(headless=True)
   page=await browser.new_page(viewport={'width':1200,'height':950},locale='zh-CN');errors=[]
   page.on('pageerror',lambda e:errors.append(str(e)))
   try:
    await page.goto('http://127.0.0.1:5174/test/fixtures/restyle-progress.html',wait_until='networkidle')
    token=page.get_by_role('checkbox',name='已跟随主题页',exact=False)
    custom=page.get_by_role('checkbox',name='来源独立样式页',exact=False)
    assert not await token.is_checked() and await custom.is_checked()
    before=await page.evaluate('Object.fromEntries(Object.entries(fixture.state().screens).map(([id,s])=>[id,s.htmlContent]))')
    await page.get_by_role('button',name='试跑单个目标',exact=True).click()
    await page.get_by_text('正文 3 字符 · 推理 17 字符 · 续写 0 次',exact=True).wait_for()
    assert '本地受控流 / stream-fixture' in await page.locator('body').inner_text()
    assert 'private reasoning' not in await page.locator('body').inner_text()
    assert 'TEST_KEY_NOT_FOR_DISPLAY' not in await page.locator('body').inner_text()
    await page.get_by_text('耗时 1 秒',exact=False).wait_for()
    await page.screenshot(path=str(OUT/f'{name}-receiving.png'))
    await page.get_by_role('button',name='停止重塑',exact=True).click()
    await page.wait_for_function('fixture.aborts===1')
    trial=page.get_by_role('button',name='试跑单个目标',exact=True)
    assert await trial.is_enabled()
    assert await page.evaluate('Object.fromEntries(Object.entries(fixture.state().screens).map(([id,s])=>[id,s.htmlContent]))')==before
    await trial.click();await page.wait_for_function('fixture.calls===2')
    await page.get_by_role('button',name='停止重塑',exact=True).click()
    await page.wait_for_function('fixture.aborts===2')
    await custom.uncheck();assert await trial.is_disabled()
    await token.check();assert await trial.is_enabled()
    assert not errors,errors
    await page.screenshot(path=str(OUT/f'{name}-stopped.png'))
    results.append({'browser':name,'status':'passed','calls':2,'aborts':2,'defaultTokenSkipped':True,'customRecommended':True,'retry':True,'originalUnchanged':True,'pageErrors':errors})
    print(json.dumps(results[-1]),flush=True)
   except Exception:
    await page.screenshot(path=str(OUT/f'{name}-failure.png'))
    print(json.dumps({'errors':errors,'body':await page.locator('body').inner_text()},ensure_ascii=False),flush=True)
    raise
   finally:await browser.close()
 (OUT/'browser.json').write_text(json.dumps({'status':'passed','scope':'Controlled transport only; real core, executor, UI; no live Provider request','results':results},ensure_ascii=False,indent=2))

asyncio.run(main())
