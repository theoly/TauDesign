#!/usr/bin/env python3
"""Actual project-open notice/task UI with damaged files; no model traffic or automatic recovery."""
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
     page=await browser.new_page(viewport={'width':1400,'height':1000});errors=[]
     page.on('pageerror',lambda error:errors.append(str(error)))
     try:
      await page.goto(f'http://127.0.0.1:5174/test/fixtures/design-task-records.html?device={device}',wait_until='networkidle')
      notice=page.get_by_role('complementary',name='未完成设计提示');await notice.get_by_text('本工程有 1 项未完成设计、1 项无法读取的记录。',exact=True).wait_for()
      assert 'SYNTHETIC_SECRET' not in await page.locator('body').inner_text()
      await notice.get_by_role('button',name='查看任务记录',exact=True).click();dialog=page.get_by_role('dialog',name='设计任务记录',exact=True)
      await dialog.get_by_role('button',name='未完成的资料设计',exact=False).click();await dialog.get_by_text('section-1 · 完整片段',exact=True).click();assert '<section>只读旧草稿</section>' in await dialog.inner_text()
      await dialog.get_by_role('button',name='无法读取的任务',exact=False).click();assert 'SYNTHETIC_SECRET' not in await dialog.inner_text();await dialog.get_by_role('button',name='清理损坏记录',exact=True).click()
      assert (await page.evaluate('taskRecordFixture.report()'))['broken']
      await page.screenshot(path=str(args.output/f'{engine}-{device}-confirmation.png'),full_page=True)
      await dialog.get_by_role('button',name='确认清理损坏记录',exact=True).click();await dialog.get_by_text('损坏任务目录已清理；页面、交付历史和独立素材保留。',exact=True).wait_for()
      await dialog.get_by_role('button',name='关闭',exact=True).click();await notice.get_by_text('本工程有 1 项未完成设计。',exact=True).wait_for();await page.evaluate('taskRecordFixture.open()');await page.get_by_role('dialog',name='设计任务记录',exact=True).wait_for()
      result=await page.evaluate('taskRecordFixture.report()');assert result=={'calls':0,'past':0,'source':'<main data-nid="kept">保留页面</main>','kept':'YQ==','broken':[]},result
      assert not errors,errors
      rows.append({'engine':engine,'device':device,'errors':errors,**result})
     except Exception:
      (args.output/f'{engine}-{device}-failure.json').write_text(json.dumps({'body':await page.locator('body').inner_text(),'errors':errors},ensure_ascii=False,indent=2));raise
     finally:await page.close()
   finally:await browser.close()
 (args.output/'results.json').write_text(json.dumps({'scope':'synthetic-task-records-and-project-open-notice','checks':rows},ensure_ascii=False,indent=2)+'\n');print(json.dumps(rows,ensure_ascii=False))

if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--output',type=Path,required=True);asyncio.run(run(parser.parse_args()))
