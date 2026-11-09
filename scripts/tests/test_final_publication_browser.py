#!/usr/bin/env python3
"""Actual candidate UI/gates, real IndexedDB commit windows and two-realm races. Fault responses are synthetic after real IO; no Provider."""
import argparse
import asyncio
import json
from pathlib import Path
from playwright.async_api import async_playwright

URL='http://127.0.0.1:5174/test/fixtures/candidate-actions.html?mode=synthetic&device='


async def ready(page):
    await page.wait_for_function("window.fixture && fixture.report().checks.find(c=>c.id==='render')?.status==='passed' && fixture.report().checks.find(c=>c.id==='structure')?.status==='blocked'",timeout=30000)
    await page.get_by_role('checkbox',name='我已检查并接受这次结构变化',exact=True).check()


async def await_finish(page):
    await page.wait_for_function("!fixture.publication() && fixture.state().stagedAdoptionStatus!=='saving'",timeout=30000)


async def run(args):
    args.output.mkdir(parents=True,exist_ok=False)
    rows=[]
    async with async_playwright() as p:
        for engine in ['chromium','webkit']:
            browser=await getattr(p,engine).launch(headless=True)
            try:
                for device in ['mobile','pc']:
                    for fault in ['none','before','after','unknown']:
                        context=await browser.new_context(viewport={'width':1600,'height':1000})
                        page=await context.new_page();errors=[]
                        page.on('pageerror',lambda error:errors.append(str(error)))
                        try:
                            await page.goto(URL+device,wait_until='networkidle');await ready(page)
                            await page.wait_for_function("fixture.state().projectSaveStatus==='saved'")
                            before=await page.evaluate('async()=>({history:fixture.history(),snapshot:await fixture.snapshot(),html:fixture.state().screens[fixture.target].htmlContent})')
                            await page.evaluate('fault=>fixture.holdNext(fault)',fault)
                            await page.get_by_test_id('candidate-actions-toolbar').get_by_role('button',name='采纳新版 (替换原版)',exact=True).click()
                            await page.wait_for_function('fixture.held().entered')
                            overlay=page.get_by_role('status').filter(has_text='正在保存已确认的设计');await overlay.wait_for()
                            live=await page.evaluate('''()=>{
                                const blocked={};for(const [key,act]of Object.entries({edit:()=>fixture.state().setName('迟到编辑'),undo:()=>fixture.undo(),discard:()=>fixture.state().discardStagedChange()})){try{const result=act();blocked[key]=key==='undo'&&result===null&&fixture.history().past.length===0;}catch(error){blocked[key]=error.message.includes('正在保存');}}
                                return {history:fixture.history(),html:fixture.state().screens[fixture.target].htmlContent,blocked};
                            }''')
                            assert live['history']==before['history'] and live['html']==before['html'] and all(live['blocked'].values()),live
                            if fault=='none':await page.screenshot(path=str(args.output/f'{engine}-{device}-saving.png'))
                            await page.evaluate('fixture.release()');await await_finish(page);await page.evaluate('fixture.restoreIO()')
                            result=await page.evaluate('''async()=>{
                                const snapshot=await fixture.snapshot(),records=await fixture.archives(fixture.target),record=records[0];
                                const {createProjectStorage}=await import('/src/services/storage/projectStorage.ts'),{contentFingerprint}=await import('/src/services/ai/designWorkflow.ts');
                                const s=fixture.state(),raw=await createProjectStorage(s.id).readText('deliveries/screen-'+contentFingerprint(fixture.target)+'/'+record.id+'.json');
                                return {history:fixture.history(),snapshot,html:s.screens[fixture.target].htmlContent,status:s.projectSaveStatus,error:s.stagedAdoptionError,staged:!!s.stagedScreen,writes:fixture.held().writes,archiveStatus:record.status,physicalArchiveStatus:JSON.parse(raw).status,models:fixture.models()};
                            }''')
                            assert result['writes']==1 and result['models']==0,result
                            if fault=='before':
                                assert result['snapshot']==before['snapshot'] and result['history']==before['history'] and result['html']==before['html'],result
                                assert result['staged'] and result['archiveStatus']=='aborted' and 'disk full' in result['error'],result
                            elif fault=='unknown':
                                assert result['history']==before['history'] and result['html']==before['html'] and result['status']=='readonly' and result['staged'],result
                                assert result['snapshot']['files']['screens/page.html']!=before['html'] and result['archiveStatus']=='applied' and result['physicalArchiveStatus']=='prepared' and '尚未确认' in result['error'],result
                            else:
                                assert not result['staged'] and result['html']!=before['html'] and len(result['history']['past'])==len(before['history']['past'])+1 and result['archiveStatus']=='applied',result
                                await page.evaluate('fixture.undo()');await page.evaluate("async()=>{const {waitForProjectSave}=await import('/src/stores/useProjectStore.ts');await waitForProjectSave(fixture.state().id);}")
                                assert await page.evaluate('fixture.state().screens[fixture.target].htmlContent')==before['html']
                            assert not errors,errors
                            rows.append({'engine':engine,'device':device,'fault':fault,'status':'passed','writes':result['writes'],'pageAndHistoryBeforeCommitExact':True,'archiveStatus':result['archiveStatus'],'physicalArchiveStatus':result['physicalArchiveStatus'],'pageErrors':errors,'providerCalls':0})
                        finally:
                            await context.close()
                    # Independent realms: both actual gates pass, both reach final IO, only one may publish.
                    context=await browser.new_context(viewport={'width':1600,'height':1000});pages=[await context.new_page(),await context.new_page()];errors=[]
                    for page in pages:page.on('pageerror',lambda error:errors.append(str(error)))
                    try:
                        await pages[0].goto(URL+device,wait_until='networkidle');await ready(pages[0]);await pages[0].wait_for_function("fixture.state().projectSaveStatus==='saved'")
                        project_id=await pages[0].evaluate('fixture.state().id')
                        await pages[1].goto(URL+device+'&resume='+project_id,wait_until='networkidle');await pages[1].wait_for_function('Boolean(window.fixture)');await pages[1].evaluate('fixture.stage()');await ready(pages[1])
                        for page in pages:await page.evaluate('fixture.holdNext()')
                        await asyncio.gather(*[page.get_by_test_id('candidate-actions-toolbar').get_by_role('button',name='采纳新版 (替换原版)',exact=True).click() for page in pages])
                        await asyncio.gather(*[page.wait_for_function('fixture.held().entered') for page in pages])
                        await asyncio.gather(*[page.evaluate('fixture.release()') for page in pages]);await asyncio.gather(*[await_finish(page) for page in pages])
                        for page in pages:await page.evaluate('fixture.restoreIO()')
                        outcomes=await asyncio.gather(*[page.evaluate('({staged:!!fixture.state().stagedScreen,status:fixture.state().projectSaveStatus,history:fixture.history().past.length,writes:fixture.held().writes,models:fixture.models()})') for page in pages])
                        assert sum(not row['staged'] for row in outcomes)==1 and all(row['writes']==1 and row['models']==0 for row in outcomes),outcomes
                        snapshot=await pages[0].evaluate('fixture.snapshot()');root=json.loads(snapshot['files']['project.json']);history=json.loads(snapshot['files']['history.json'])
                        assert len(root['publicationCommits'])==1 and len(history['past'])==1,(root,history)
                        assert not errors,errors
                        rows.append({'engine':engine,'device':device,'fault':'two-realms-race','status':'passed','outcomes':outcomes,'singleDurableCommit':True,'pairedHistory':True,'pageErrors':errors,'providerCalls':0})
                    finally:
                        await context.close()
            finally:
                await browser.close()
    (args.output/'results.json').write_text(json.dumps({'status':'passed','scope':__doc__,'checks':rows},ensure_ascii=False,indent=2))
    print(json.dumps(rows,ensure_ascii=False))


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--output',required=True,type=Path)
    asyncio.run(run(parser.parse_args()))
