#!/usr/bin/env python3
"""Focused synthetic UI regression only; no model calls or actual human evaluations."""
import argparse, asyncio, json, subprocess, tempfile
from pathlib import Path
from playwright.async_api import async_playwright, expect
ROOT=Path(__file__).resolve().parents[2]
async def run(args):
 args.output.mkdir(parents=True,exist_ok=True)
 with tempfile.TemporaryDirectory(prefix='taudesign-review-ui-') as directory:
  folder=Path(directory)
  index={'version':1,'planId':'synthetic-ui-only','pairs':[{'id':'p001','request':'<script>window.injectionExecuted=true</script>','device':'mobile','left':'a.svg','right':'b.svg','leftAvailable':False,'rightAvailable':True},{'id':'p002','request':'两份静态示例，请比较内容与层级','device':'pc','left':'a.svg','right':'b.svg'}]}
  built=subprocess.run(['pnpm','exec','tsx','-e',"import {buildBlindReviewHtml} from './src/services/ai/designKnowledge/experimentReview';let input='';for await(const chunk of process.stdin)input+=chunk;process.stdout.write(buildBlindReviewHtml(JSON.parse(input)));"],input=json.dumps(index),cwd=ROOT,text=True,capture_output=True,check=True)
  (folder/'review.html').write_text(built.stdout)
  for name in ['a.svg','b.svg']:(folder/name).write_text('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="120"><rect width="200" height="120" fill="#eee"/></svg>')
  reports=[]
  async with async_playwright() as p:
   for engine in ['chromium','webkit']:
    browser=await getattr(p,engine).launch(headless=True)
    try:
     page=await browser.new_page(viewport={'width':1280,'height':1000},accept_downloads=True);errors=[];external=[]
     page.on('pageerror',lambda e:errors.append(str(e)))
     async def guard(route):
      if route.request.url.startswith(('file:','data:','blob:')):await route.continue_()
      else:external.append(route.request.url);await route.abort()
     await page.route('**/*',guard)
     await page.goto((folder/'review.html').as_uri(),wait_until='networkidle')
     assert await page.locator('article').count()==1
     assert await page.evaluate('window.injectionExecuted===undefined')
     await expect(page.get_by_text('可评阅 1 / 2 组。',exact=False)).to_be_visible()
     await expect(page.get_by_text('生成未完成：1组（不评分）',exact=True)).to_be_visible()
     assert await page.locator('input[name="p001"]').count()==0
     await page.get_by_role('button',name='保存评分 JSON',exact=True).click()
     await expect(page.get_by_role('status')).to_contain_text('请填写评阅者代号')
     await page.get_by_label('评阅者代号',exact=False).fill('synthetic-reviewer')
     for text in ['我是真人评阅者，未使用AI代填','我未参与本次生成，独立完成评分','我未查看方案来源映射或他人的评分']:await page.get_by_label(text,exact=True).check()
     await page.get_by_role('button',name='保存评分 JSON',exact=True).click()
     await expect(page.get_by_role('status')).to_contain_text('请完成所有组')
     for article in await page.locator('article').all():
      for section in await article.locator('.pair > section').all():
       for select in (await section.locator('select').all())[:4]:await select.select_option('4')
       await section.locator('select').last.select_option('true')
      await article.get_by_role('radio',name='两份相当且均可用',exact=True).check()
     async with page.expect_download() as info:await page.get_by_role('button',name='保存评分 JSON',exact=True).click()
     download=await info.value;path=folder/(engine+'-synthetic-review.json');await download.save_as(path);review=json.loads(path.read_text())
     assert review['planId']=='synthetic-ui-only' and len(review['pairs'])==1 and review['pairs'][0]['pairId']=='p002' and all(row['left']==[4,4,4,4] for row in review['pairs'])
     foreign=folder/'foreign.json';foreign.write_text(json.dumps({**review,'planId':'foreign'}))
     await page.get_by_label('恢复本地评分',exact=False).set_input_files(foreign)
     await expect(page.get_by_role('status')).to_contain_text('不属于本次实验')
     await page.reload(wait_until='networkidle')
     await page.get_by_label('恢复本地评分',exact=False).set_input_files(path)
     await expect(page.get_by_role('status')).to_contain_text('已恢复本地评分')
     assert await page.get_by_label('评阅者代号',exact=False).input_value()=='synthetic-reviewer'
     assert await page.get_by_role('radio',name='两份相当且均可用',exact=True).first.is_checked()
     await page.screenshot(path=str(args.output/(engine+'-review-form.png')),full_page=True)
     assert not errors,errors
     assert not external,external
     reports.append({'engine':engine,'status':'passed','pageErrors':errors,'externalRequests':external,'allPairs':2,'reviewablePairs':1,'syntheticOnly':True,'humanReviewPerformed':False,'modelRequests':0})
    finally:await browser.close()
  (args.output/'result.json').write_text(json.dumps(reports,ensure_ascii=False,indent=2)+'\n');print(json.dumps(reports,ensure_ascii=False))
if __name__=='__main__':
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--output',type=Path,required=True);asyncio.run(run(parser.parse_args()))
