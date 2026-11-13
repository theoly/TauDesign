#!/usr/bin/env python3
"""Actual chat/canvas + controlled model responses; no external Provider requests."""
import argparse, asyncio, json
from pathlib import Path
from playwright.async_api import async_playwright

async def wait_for_tasks(page,predicate,timeout=20):
 """Await the actual repository result, not a Promise-valued browser poll."""
 deadline=asyncio.get_running_loop().time()+timeout
 while True:
  tasks=await page.evaluate('redesignFixture.tasks()')
  if predicate(tasks):return tasks
  if asyncio.get_running_loop().time()>=deadline:raise AssertionError({'message':'Task manifests did not reach the expected durable state','tasks':tasks})
  await asyncio.sleep(0.05)

async def run(args):
 args.output.mkdir(parents=True,exist_ok=True);rows=[]
 async with async_playwright() as p:
  for engine in ['chromium','webkit']:
   browser=await getattr(p,engine).launch(headless=True)
   try:
    for device in ['mobile','pc']:
     for invalid in ([False] if args.recovery else [False,True]):
      page=await browser.new_page(viewport={'width':1800,'height':1100});errors=[]
      page.on('pageerror',lambda error:errors.append(str(error)))
      kind=f'{engine}-{device}-'+('media-rejection' if invalid else 'adoption')
      try:
       await page.goto(f'http://127.0.0.1:5174/test/fixtures/page-redesign.html?device={device}'+('&invalid=1' if invalid else '')+('&recovery=1' if args.recovery else ''),wait_until='networkidle')
       await page.wait_for_function('Boolean(window.redesignFixture)')
       await page.locator('textarea[placeholder^="输入设计诉求"]').fill('重新设计整页，保留全部业务信息和邮箱必填规则，改为独立卡片分组、加大留白并保留保存资料按钮')
       await page.locator('button[title*="发送设计诉求"]').click()
       if args.recovery:
        await page.wait_for_function("redesignFixture.requests.length===5 && !document.querySelector('button[title*=\"(Stop)\"]')",timeout=45000)
        await wait_for_tasks(page,lambda tasks:any(t['state']=='blocked' for t in tasks),timeout=15)
        assert await page.evaluate('redesignFixture.state().screens.source.htmlContent===redesignFixture.original')
        await page.evaluate('redesignFixture.remount()')
        await page.get_by_role('button',name='查看设计任务记录',exact=True).click()
        dialog=page.get_by_role('dialog',name='设计任务记录',exact=True)
        await dialog.get_by_role('button').filter(has_text='重新设计整页，保留全部业务信息').click()
        await dialog.get_by_role('button',name='恢复草稿（新任务）',exact=True).click()
        await dialog.get_by_role('button',name='确认新预算并恢复',exact=True).wait_for()
        assert await page.evaluate('redesignFixture.requests.length')==5
        assert '本次实际可复用 1 个完整区域' in await dialog.inner_text()
        await page.screenshot(path=str(args.output/f'{engine}-{device}-recovery-confirm.png'),full_page=True)
        await dialog.get_by_role('button',name='确认新预算并恢复',exact=True).click()
       if invalid:
        await page.wait_for_function("redesignFixture.requests.length>=6 && !document.querySelector('button[title*=\"(Stop)\"]')",timeout=45000)
        await page.wait_for_timeout(700)
        result=await page.evaluate('''()=>{const f=redesignFixture,s=f.state();return {requests:f.requests,unchanged:s.screens.source.htmlContent===f.original,hasCandidate:!!s.stagedScreen,past:f.history().past.length,body:document.body.innerText};}''')
        assert result['unchanged'] and not result['hasCandidate'] and result['past']==0,result
        assert 'SVG' in result['body'] or '媒体' in result['body'],result
        del result['body']
       else:
        await page.get_by_test_id('candidate-actions-toolbar').wait_for(timeout=45000)
        await page.wait_for_function("redesignFixture.state().stagedRenderQuality?.report?.status==='complete'",timeout=20000)
        assert await page.get_by_label('我已检查并接受这次结构变化',exact=True).count()==0,'Explicit whole-page redesign must not require another structure confirmation'
        button=page.get_by_test_id('candidate-actions-toolbar').get_by_role('button',name='采纳新版 (替换原版)',exact=True)
        await page.wait_for_function("!Array.from(document.querySelectorAll('[data-testid=\"candidate-actions-toolbar\"] button')).find(b=>b.textContent.includes('采纳新版 (替换原版)'))?.disabled",timeout=20000)
        before=await page.evaluate('''()=>{const f=redesignFixture,s=f.state();return {requests:f.requests,unchanged:s.screens.source.htmlContent===f.original,plan:s.stagedScreen.workflowContract.pageWriteStrategy.mode,business:s.stagedScreen.newHtml.includes('业务信息7'),head:s.stagedScreen.newHtml.includes('source-identity'),delivery:s.getStagedDeliveryReport()};}''')
        assert before['delivery']['status']=='ready',before['delivery']
        await page.screenshot(path=str(args.output/f'{kind}.png'),full_page=True)
        await button.click();await page.wait_for_function('!redesignFixture.state().stagedScreen',timeout=20000)
        adopted_tasks=await wait_for_tasks(page,lambda tasks:any(t['state']=='completed' and t.get('delivery') for t in tasks))
        result=await page.evaluate('''()=>{const f=redesignFixture,s=f.state(),adopted=s.screens.source.htmlContent,past=f.history().past.length;f.undo();const undoExact=f.state().screens.source.htmlContent===f.original;f.redo();return {adopted:adopted!==f.original,past,undoExact,redoExact:f.state().screens.source.htmlContent===adopted};}''')
        # History mutates live state immediately, while its project save is async.
        # Cross that exact persistence boundary before verifying a fresh load.
        reopened=await page.evaluate('''async()=>{const f=redesignFixture,s=f.state(),adopted=s.screens.source.htmlContent;await s.saveProjectChecked();const loaded=await f.state().loadProjectById(s.id);return {loaded,htmlExact:f.state().screens.source.htmlContent===adopted,past:f.history().past.length};}''')
        tasks=await page.evaluate('redesignFixture.tasks()')
        assert tasks==adopted_tasks,{'message':'History/save/reopen changed completed task facts','adopted':adopted_tasks,'reopened':tasks}
        assert reopened=={'loaded':True,'htmlExact':True,'past':1},reopened
        completion=await page.evaluate('''async()=>{const f=redesignFixture,s=f.state(),{createProjectStorage}=await import('/src/services/storage/projectStorage.ts'),{DeliveryRepository}=await import('/src/services/storage/deliveryRepository.ts');const storage=createProjectStorage(s.id,s.folderPath),tasks=await f.tasks(),done=tasks.find(t=>t.state==='completed'&&t.delivery),raw=JSON.parse(await storage.readText(`tasks/${done.id}/manifest.json`)),record=await new DeliveryRepository(storage,s.id).get(done.delivery.screenId,done.delivery.id);return {manifestMatches:raw.state==='completed'&&JSON.stringify(raw.delivery)===JSON.stringify(done.delivery),deliveryApplied:record?.status==='applied',fingerprintMatches:record?.resultFingerprint===done.delivery.resultFingerprint,bodyMatches:record?.after.htmlContent===s.screens.source.htmlContent};}''')
        assert all(completion.values()),completion
        result={**before,**result,'tasks':tasks,'reopened':reopened,'completion':completion};assert result['adopted'] and result['undoExact'] and result['redoExact'] and result['past']==1 and result['unchanged'] and result['business'] and result['head'],result
       assert [r['stage'] for r in result['requests']]==(['function-plan','composition','ownership','region','region','region','region'] if args.recovery else ['function-plan','composition','ownership','region','region','region']),result
       if not invalid:assert sorted(t['state'] for t in result['tasks'])==(['blocked','completed'] if args.recovery else ['completed']),result
       assert all(not r['hasRawLayout'] for r in result['requests']),result
       assert not errors,errors
       rows.append({'engine':engine,'device':device,'invalidMedia':invalid,'errors':errors,**result})
      except Exception:
       (args.output/f'{kind}-failure.json').write_text(json.dumps({'body':await page.locator('body').inner_text(),'state':await page.evaluate('''()=>window.redesignFixture?{requests:redesignFixture.requests,staged:redesignFixture.state().stagedScreen,render:redesignFixture.state().stagedRenderQuality,report:redesignFixture.state().getStagedDeliveryReport()}:null'''),'errors':errors},ensure_ascii=False,indent=2));raise
      finally:await page.close()
   finally:await browser.close()
 (args.output/'results.json').write_text(json.dumps({'scope':'synthetic-chat-canvas-controlled-model','checks':rows},ensure_ascii=False,indent=2)+'\n');print(json.dumps(rows,ensure_ascii=False))

if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--output',type=Path,required=True);parser.add_argument('--recovery',action='store_true');asyncio.run(run(parser.parse_args()))
