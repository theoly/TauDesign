#!/usr/bin/env python3
"""Readonly real page; controlled responses through real core/executor/panel. No Provider request."""
import asyncio,json,hashlib
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'doc/restyle-bounded/evidence'
PROJECT=Path('/Users/theoly/workspace/aqmf/aqmf-app-pub-design')
async def main():
 data=json.loads((PROJECT/'project.json').read_text())
 screen=next(s for s in data['screens'].values() if s['name']=='TA 的主页')
 source=PROJECT/screen['entry'];before=hashlib.sha256(source.read_bytes()).hexdigest()
 sample={'html':source.read_text(),'metadata':screen['metadata'],'designSystem':data['designSystem']}
 results=[]
 async with async_playwright() as pw:
  for name in ['chromium','webkit']:
   browser=await getattr(pw,name).launch(headless=True)
   page=await browser.new_page(viewport={'width':1200,'height':950},locale='zh-CN');errors=[]
   page.on('pageerror',lambda e:errors.append(str(e)))
   try:
    await page.add_init_script('window.fixtureSource='+json.dumps(sample,ensure_ascii=False))
    await page.goto('http://127.0.0.1:5174/test/fixtures/restyle-bounded.html',wait_until='networkidle')
    groups=await page.evaluate('fixture.groups');assert groups>1
    body=await page.locator('body').inner_text();assert f'预计 {groups} 次 AI 调用' in body
    await page.get_by_role('button',name='试跑单个目标',exact=True).click()
    await page.get_by_text('样式补丁',exact=False).wait_for()
    await page.screenshot(path=str(OUT/f'{name}-groups.png'))
    await page.get_by_text('结构校验通过（节点增删为 0）',exact=True).wait_for(timeout=30000)
    body=await page.locator('body').inner_text()
    assert f'样式补丁 {groups}/{groups} 组' in body and '续写 0 次' in body
    state=await page.evaluate('({calls:fixture.calls,groups:fixture.groups,requests:fixture.requests,originalUnchanged:fixture.originalUnchanged()})')
    assert state['calls']==groups and state['originalUnchanged']
    assert all(r['maxTokens']==2048 and r['thinking'] is False and r['items']<=12 and r['chars']<20000 for r in state['requests'])
    assert not errors,errors
    await page.screenshot(path=str(OUT/f'{name}-complete.png'))
    results.append({'browser':name,'status':'passed',**state,'pageErrors':errors})
    print(json.dumps(results[-1]),flush=True)
   except Exception:
    await page.screenshot(path=str(OUT/f'{name}-failure.png'));print(await page.locator('body').inner_text(),flush=True);raise
   finally:await browser.close()
 assert hashlib.sha256(source.read_bytes()).hexdigest()==before
 (OUT/'browser.json').write_text(json.dumps({'scope':'Readonly real source; controlled transport; no live Provider request','sourceChars':len(sample['html']),'sourceSha256':before,'results':results},ensure_ascii=False,indent=2))
asyncio.run(main())
