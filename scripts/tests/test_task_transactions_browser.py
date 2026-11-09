#!/usr/bin/env python3
"""Two browser realms use real Web Locks for task and managed-project publication."""
import argparse,asyncio,json,uuid
from pathlib import Path
from playwright.async_api import async_playwright

async def run(args):
 args.output.mkdir(parents=True,exist_ok=True);rows=[]
 async with async_playwright() as p:
  for engine in ['chromium','webkit']:
   browser=await getattr(p,engine).launch(headless=True)
   try:
    context=await browser.new_context();pages=[await context.new_page(),await context.new_page()];errors=[]
    for page in pages:page.on('pageerror',lambda error:errors.append(str(error)))
    group=str(uuid.uuid4());url='http://127.0.0.1:5174/test/fixtures/task-transactions.html?group='+group
    for page in pages:await page.goto(url,wait_until='networkidle');await page.wait_for_function('Boolean(window.taskTransactionFixture)')
    await pages[0].evaluate('taskTransactionFixture.seed()');identity=await pages[0].evaluate('taskTransactionFixture.identity()')
    publications=await asyncio.gather(*[page.evaluate('([hash,n])=>taskTransactionFixture.publish(hash,n)',[identity,n]) for n,page in enumerate(pages,1)])
    assert sum(row['ok'] for row in publications)==1,publications
    identity=await pages[0].evaluate('taskTransactionFixture.identity()');await pages[0].evaluate('(hash)=>taskTransactionFixture.remove(hash)',identity);late=await pages[1].evaluate('(hash)=>taskTransactionFixture.late(hash)',identity)
    assert all(not row['ok'] and '清理' in row['message'] for row in late['results']) and late['files']==[],late
    await pages[0].evaluate('taskTransactionFixture.quotaSeed()');quotas=await asyncio.gather(pages[0].evaluate('taskTransactionFixture.quotaPublish("a")'),pages[1].evaluate('taskTransactionFixture.quotaPublish("b")'));count=await pages[0].evaluate('taskTransactionFixture.count()');assert sum(row['ok'] for row in quotas)==1 and count==40,(quotas,count)
    imports=await asyncio.gather(pages[0].evaluate('taskTransactionFixture.importArchive(1)'),pages[1].evaluate('taskTransactionFixture.importArchive(2)'));assert sum(row['ok'] for row in imports)==1,imports
    archive=await pages[0].evaluate('taskTransactionFixture.archiveRead()');assert archive['manifest']==archive['part'],archive
    migration=await pages[0].evaluate('taskTransactionFixture.migrateArchive()');assert all(migration[key] for key in ['ok','sourceExact','manifestExact','partExact','tracesExact','deletedExact','pageExact']) and not migration['resurrected'],migration
    baseline=await pages[0].evaluate('taskTransactionFixture.projectSeed()');project_results=await asyncio.gather(*[page.evaluate('([expected,label])=>taskTransactionFixture.projectPublish(expected,label)',[baseline,label]) for page,label in zip(pages,['one','two'])]);assert sum(row['ok'] for row in project_results)==1,project_results
    winner='one' if project_results[0]['ok'] else 'two';saved=await pages[1].evaluate('taskTransactionFixture.projectRead()');assert saved['files']['screens/page.html']==f'<main>{winner}</main>' and saved['files']['project.json']==json.dumps({'id':winner},separators=(',',':')) and saved['files']['documents/brief.md']==winner+' requirements' and 'screens/page.css' not in saved['files'],saved
    stale=await pages[0].evaluate('([expected,label])=>taskTransactionFixture.projectPublish(expected,label)',[baseline,'stale']);assert not stale['ok'] and '未覆盖' in stale['message'],stale
    rounds=[]
    for index in range(20):
     current=await pages[0].evaluate('taskTransactionFixture.projectSeed()');race=await asyncio.gather(*[page.evaluate('([expected,label])=>taskTransactionFixture.projectPublish(expected,label)',[current,label]) for page,label in zip(pages,['one','two'])]);assert sum(row['ok'] for row in race)==1,(engine,index,race);rounds.append({'round':index,'successes':sum(row['ok'] for row in race)})
    aborted=await pages[0].evaluate('taskTransactionFixture.projectAbort()');assert aborted['aborted'] and aborted['unchanged'],aborted
    assert not errors,errors
    rows.append({'engine':engine,'publications':publications,'late':late,'quotas':quotas,'taskCount':count,'isolatedBrowserRealms':2,'imports':imports,'archive':archive,'migration':migration,'managedProject':{'results':project_results,'winner':winner,'snapshot':saved,'stale':stale,'stress':rounds,'aborted':aborted},'pageErrors':errors});await context.close()
   finally:await browser.close()
 (args.output/'results.json').write_text(json.dumps({'scope':'actual-two-realm-browser-web-lock-transactions','checks':rows},ensure_ascii=False,indent=2)+'\n');print(json.dumps(rows,ensure_ascii=False))

if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--output',type=Path,required=True);asyncio.run(run(parser.parse_args()))
