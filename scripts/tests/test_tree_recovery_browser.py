#!/usr/bin/env python3
"""Real chat/tree/task UI/History/render gates; transport responses are controlled, no Provider network."""
import argparse,asyncio,json
from pathlib import Path
from playwright.async_api import async_playwright
async def wait_records(page,state,timeout=45):
 loop=asyncio.get_running_loop();end=loop.time()+timeout
 while loop.time()<end:
  rows=await page.evaluate('treeRecoveryFixture.records()')
  if any(row['state']==state for row in rows):return rows
  await asyncio.sleep(.1)
 raise AssertionError({'missingState':state,'records':rows,'body':await page.locator('body').inner_text()})
async def run(args):
 args.output.mkdir(parents=True,exist_ok=True);rows=[]
 async with async_playwright() as p:
  for engine in ['chromium','webkit']:
   browser=await getattr(p,engine).launch(headless=True)
   try:
    for device in ['mobile','pc']:
     page=await browser.new_page(viewport={'width':1800,'height':1100});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
     try:
      await page.goto(f'http://127.0.0.1:5174/test/fixtures/tree-recovery.html?device={device}',wait_until='networkidle');await page.wait_for_function('Boolean(window.treeRecoveryFixture)')
      await page.locator('textarea[placeholder^="输入设计诉求"]').fill('生成登录页、注册页两个页面');await page.locator('button[title*="发送设计诉求"]').click()
      await page.get_by_label('使用共享生成树',exact=True).check();await page.get_by_role('button',name='确认计划并生成 2 页',exact=True).click()
      await wait_records(page,'blocked')
      await page.wait_for_function("!document.querySelector('button[title*=\"(Stop)\"]')",timeout=45000)
      initial=await page.evaluate('''async()=>({records:await treeRecoveryFixture.records(),requests:treeRecoveryFixture.requests,pages:treeRecoveryFixture.state().screenOrder,past:treeRecoveryFixture.history().past.length})''')
      assert initial['pages']==['old'] and initial['past']==0,initial
      assert [r['stage'] for r in initial['requests']]==['batch-plan','tree-plan','root','branch-form','branch-inner','leaf','leaf'],initial
      await page.evaluate('treeRecoveryFixture.remount()');await page.get_by_role('button',name='查看设计任务记录',exact=True).click();dialog=page.get_by_role('dialog',name='设计任务记录',exact=True)
      await dialog.locator('nav button').filter(has_text='生成登录页、注册页两个页面').click();await dialog.get_by_role('button',name='恢复草稿（新任务）',exact=True).click()
      await dialog.get_by_role('button',name='确认新预算并恢复',exact=True).wait_for();assert '本次实际可复用 3 个共享父节点、1 个完整页面' in await dialog.inner_text()
      assert len(await page.evaluate('treeRecoveryFixture.requests'))==7
      await page.screenshot(path=str(args.output/f'{engine}-{device}-confirmation.png'),full_page=True)
      await dialog.get_by_role('button',name='确认新预算并恢复',exact=True).click();await page.wait_for_function('treeRecoveryFixture.state().screenOrder.length===3',timeout=45000)
      await wait_records(page,'completed',15)
      result=await page.evaluate('''async()=>{const f=treeRecoveryFixture,s=f.state(),ids=s.screenOrder.filter(id=>id!=='old'),html=ids.map(id=>s.screens[id].htmlContent),past=f.history().past.length,sourceExact=s.screens.old.htmlContent===f.original,evidence=ids.map(id=>s.screens[id].metadata.creationEvidence);f.undo();const undoExact=f.state().screenOrder.join(',')==='old'&&f.state().screens.old.htmlContent===f.original;f.redo();return {requests:f.requests,records:await f.records(),ids,past,sourceExact,undoExact,redoExact:ids.every((id,index)=>f.state().screens[id].htmlContent===html[index]),evidence:evidence.map(e=>({ready:e.workflow.status,recovery:e.recovery,contractTaskId:e.contract.taskId}))};}''')
      assert result['sourceExact'] and result['undoExact'] and result['redoExact'] and result['past']==1,result
      assert len(result['requests'])==8 and result['requests'][-1]=={'stage':'leaf','index':1,'failed':False},result
      source=next(t for t in result['records'] if t['state']=='blocked');finished=next(t for t in result['records'] if t['state']=='completed')
      assert finished['budget']['requests']==1 and [p['screenId'] for p in source['pages']]==result['ids'],result
      assert finished['recovery']['reusedStepIds']==['root','branch-form','branch-inner','page-1'],result
      assert result['evidence'][0]['recovery']['rootTaskId']==finished['id'] and result['evidence'][0]['recovery']['sourceRootTaskId']==source['id'],result
      assert all(e['ready']=='ready' for e in result['evidence']) and not errors,result
      await page.wait_for_function("!document.querySelector('[aria-label=\"未完成设计提示\"]')",timeout=10000)
      await page.screenshot(path=str(args.output/f'{engine}-{device}-restored.png'),full_page=True);rows.append({'engine':engine,'device':device,'errors':errors,**result})
     except Exception:
      (args.output/f'{engine}-{device}-failure.json').write_text(json.dumps({'body':await page.locator('body').inner_text(),'report':await page.evaluate('window.treeRecoveryFixture?treeRecoveryFixture.records():null'),'requests':await page.evaluate('window.treeRecoveryFixture?treeRecoveryFixture.requests:null'),'errors':errors},ensure_ascii=False,indent=2));raise
     finally:await page.close()
   finally:await browser.close()
 (args.output/'results.json').write_text(json.dumps({'scope':'synthetic-tree-recovery-controlled-transport','checks':rows},ensure_ascii=False,indent=2)+'\n');print(json.dumps({'checks':len(rows),'errors':sum(len(row['errors']) for row in rows)}))
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--output',type=Path,required=True);asyncio.run(run(parser.parse_args()))
