#!/usr/bin/env python3
"""Controlled transport with real core/executor/UI. No live Provider traffic."""
import argparse,asyncio,json
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output',default='doc/restyle-progress/evidence')
OUT=(ROOT/parser.parse_args().output).resolve()
async def verify(page,engine,device):
 await page.goto('http://127.0.0.1:5174/test/fixtures/restyle-progress.html?device='+device,wait_until='networkidle')
 token=page.get_by_role('checkbox',name='已跟随主题页',exact=False)
 custom=page.get_by_role('checkbox',name='来源独立样式页',exact=False)
 assert not await token.is_checked() and await custom.is_checked()
 before=await page.evaluate('Object.fromEntries(Object.entries(fixture.state().screens).map(([id,s])=>[id,s.htmlContent]))')
 trial=page.get_by_role('button',name='试跑单个目标',exact=True)
 await trial.click()
 await page.get_by_text('正文 3 字符 · 推理 17 字符 · 续写 0 次',exact=True).wait_for()
 assert '本地受控流 / stream-fixture' in await page.locator('body').inner_text()
 await page.get_by_role('button',name='停止重塑',exact=True).click()
 await trial.click()
 await page.wait_for_function('fixture.calls===2')
 await page.evaluate('fixture.late(0)')
 await page.get_by_text('正文 3 字符 · 推理 17 字符 · 续写 0 次',exact=True).wait_for()
 assert await page.get_by_role('button',name='停止重塑',exact=True).count()==1
 await page.screenshot(path=str(OUT/f'{engine}-{device}-retry-waiting.png'))
 await page.evaluate('fixture.finish(1)')
 await page.get_by_text('试跑结果：来源独立样式页',exact=True).wait_for()
 assert '结构校验通过' in await page.locator('body').inner_text()
 assert await page.evaluate('Object.fromEntries(Object.entries(fixture.state().screens).map(([id,s])=>[id,s.htmlContent]))')==before
 await page.get_by_role('button',name='重新试跑',exact=True).click()
 await trial.click()
 await page.wait_for_function('fixture.calls===3')
 await page.get_by_role('button',name='停止并关闭重塑',exact=True).click()
 await page.evaluate('fixture.late(2);fixture.finish(2)')
 await page.wait_for_function('document.body.dataset.closed==="true"')
 assert await page.get_by_text('试跑结果：来源独立样式页',exact=True).count()==0
 await page.evaluate('fixture.reopen()')
 await trial.click()
 await page.wait_for_function('fixture.calls===4')
 await page.evaluate('fixture.changeModel()')
 await page.get_by_text('模型已变化，请重新试跑后确认。',exact=True).wait_for()
 await page.evaluate('fixture.finish(3)')
 assert await page.get_by_text('试跑结果：来源独立样式页',exact=True).count()==0
 await trial.click()
 await page.wait_for_function('fixture.calls===5')
 await page.evaluate('fixture.changeProject()')
 await page.wait_for_function('fixture.aborts===4')
 await page.evaluate('fixture.late(4);fixture.finish(4)')
 assert await page.get_by_text('试跑结果：来源独立样式页',exact=True).count()==0
 assert await page.evaluate('Object.fromEntries(Object.entries(fixture.state().screens).map(([id,s])=>[id,s.htmlContent]))')==before
 assert 'private reasoning' not in await page.locator('body').inner_text()
 assert 'LATE_PRIVATE_OUTPUT' not in await page.locator('body').inner_text()
 assert 'TEST_KEY_NOT_FOR_DISPLAY' not in await page.locator('body').inner_text()
 await page.screenshot(path=str(OUT/f'{engine}-{device}-stale-suppressed.png'))
 return {'calls':5,'aborts':4,'defaultTokenSkipped':True,'customRecommended':True,'immediateRetry':True,'trialReady':True,'closeLateSuppressed':True,'modelChangeBlocked':True,'projectChangeBlocked':True,'originalUnchanged':True}
async def main():
 OUT.mkdir(parents=True,exist_ok=True);results=[]
 (OUT/'browser.json').unlink(missing_ok=True)
 async with async_playwright() as pw:
  for engine in ['chromium','webkit']:
   browser=await getattr(pw,engine).launch(headless=True)
   try:
    for device in ['pc','mobile']:
     page=await browser.new_page(viewport={'width':1200,'height':950},locale='zh-CN');errors=[];external=[]
     page.on('pageerror',lambda error:errors.append(str(error)))
     async def route(request):
      if request.request.url.startswith(('http://127.0.0.1:5174/','data:','blob:')):await request.continue_()
      else:external.append(request.request.url);await request.abort()
     await page.route('**/*',route)
     try:
      result=await verify(page,engine,device)
      assert not errors,errors
      assert not external,external
      results.append({'engine':engine,'device':device,'status':'passed',**result,'pageErrors':errors,'externalRequests':external});print(json.dumps(results[-1]),flush=True)
     except Exception:
      await page.screenshot(path=str(OUT/f'{engine}-{device}-failure.png'))
      raise
     finally:await page.context.close()
   finally:await browser.close()
 (OUT/'browser.json').write_text(json.dumps({'status':'passed','scope':'Controlled transport only; real core, executor, UI; no live Provider request','results':results},ensure_ascii=False,indent=2)+'\n')
if __name__=='__main__':asyncio.run(main())
