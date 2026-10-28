#!/usr/bin/env python3
"""Real source read only; actual canvas, candidate gates/history plus three render widths."""
import asyncio,hashlib,json
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'doc/text-layout/evidence'
PROJECT=Path('/Users/theoly/workspace/aqmf/aqmf-app-pub-design')
async def main():
 data=json.loads((PROJECT/'project.json').read_text());screen=data['screens']['c8c9bf4e-f4a6-432b-b3de-1ab59094446f'];source=PROJECT/screen['entry'];before=hashlib.sha256(source.read_bytes()).hexdigest()
 results=[]
 async with async_playwright() as pw:
  for engine in ['chromium','webkit']:
   browser=await getattr(pw,engine).launch(headless=True);page=await browser.new_page(viewport={'width':1500,'height':1100},locale='zh-CN');errors=[]
   page.on('pageerror',lambda e:errors.append(str(e)))
   try:
    await page.add_init_script('window.fixtureSource='+json.dumps({'html':source.read_text(),'designSystem':data['designSystem']}))
    await page.goto('http://127.0.0.1:5174/test/fixtures/text-layout.html',wait_until='networkidle')
    await page.wait_for_function('window.fixture&&fixture.textNids.length===3')
    measurements=[]
    for width in [320,390,430]:
     old=await page.evaluate('(w)=>fixture.inspect(w)',width)
     issues=[f for f in old['report']['findings'] if f['code']=='render_compressed_body']
     assert len(issues)==3,(engine,width,issues,old['cards'])
     new=await page.evaluate('(w)=>fixture.inspect(w,fixture.repaired.html)',width)
     assert not [f for f in new['report']['findings'] if f['code']=='render_compressed_body'],new
     assert all(c['width']/c['parentWidth']>.7 for c in new['cards']),new['cards']
     stress=await page.evaluate('(w)=>fixture.inspect(w,fixture.stress())',width)
     assert all(c['actionsFit'] and c['width']/c['parentWidth']>.7 for c in stress['cards']),stress['cards']
     assert not [f for f in stress['report']['findings'] if f['code']=='render_compressed_body'],stress
     measurements.append({'width':width,'before':old,'after':new,'longCopyAndActions':stress})
    await page.evaluate('fixture.stageBad()')
    await page.wait_for_function('fixture.state().getStagedDeliveryReport().checks.some(c=>c.id==="render"&&c.status==="blocked")')
    assert await page.get_by_role('button',name='采纳新版 (替换原版)',exact=True).is_disabled()
    await page.evaluate('fixture.state().discardStagedChange()')
    panel=page.get_by_test_id('render-quality-report');await panel.locator('summary').click()
    await page.get_by_role('button',name='预览本页纵向布局修复',exact=True).click()
    await page.get_by_role('dialog',name='预览纵向布局修复').wait_for()
    assert '3 张卡片' in await page.get_by_role('dialog').inner_text()
    await page.get_by_role('button',name='生成修复副本',exact=True).click()
    await page.wait_for_function('fixture.state().stagedScreen!==null')
    assert await page.evaluate('fixture.state().screens.s.htmlContent===fixture.source')
    adopt=page.get_by_role('button',name='采纳新版 (替换原版)',exact=True)
    await page.wait_for_function('fixture.state().getStagedDeliveryReport().status==="ready"',timeout=30000)
    await page.screenshot(path=str(OUT/f'{engine}-candidate.png'))
    await adopt.click();await page.wait_for_function('fixture.state().stagedScreen===null')
    assert await page.evaluate('fixture.state().screens.s.htmlContent===fixture.repaired.html')
    assert await page.evaluate('fixture.history()')==1
    await page.evaluate('fixture.undo()');assert await page.evaluate('fixture.state().screens.s.htmlContent===fixture.source')
    await page.evaluate('fixture.redo()');assert await page.evaluate('fixture.state().screens.s.htmlContent===fixture.repaired.html')
    assert not errors,errors
    await page.screenshot(path=str(OUT/f'{engine}-fixed.png'))
    results.append({'browser':engine,'status':'passed','widths':measurements,'candidateOriginalPreserved':True,'adoptionHistoryEntries':1,'undoRedo':True,'pageErrors':errors})
    print(json.dumps({'browser':engine,'status':'passed','widths':[m['width'] for m in measurements]}),flush=True)
   except Exception:
    await page.screenshot(path=str(OUT/f'{engine}-failure.png'));print(await page.locator('body').inner_text(),flush=True);print(errors,flush=True);raise
   finally:await browser.close()
 assert hashlib.sha256(source.read_bytes()).hexdigest()==before
 (OUT/'browser.json').write_text(json.dumps({'sourceSha256':before,'originalReadOnly':True,'results':results},ensure_ascii=False,indent=2))
asyncio.run(main())
