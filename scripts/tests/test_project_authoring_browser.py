#!/usr/bin/env python3
"""Actual repository, author sessions, store autosave and Header on two browser realms.

Includes paired page/History autosave, Undo/Redo and stale History flush. Not final candidate publication.
"""
import argparse
import asyncio
import json
import uuid
from pathlib import Path
from playwright.async_api import async_playwright


async def run(args):
    args.output.mkdir(parents=True,exist_ok=False);rows=[]
    async with async_playwright() as p:
        for engine in ['chromium','webkit']:
            browser=await getattr(p,engine).launch(headless=True)
            try:
                context=await browser.new_context(viewport={'width':1600,'height':800});pages=[await context.new_page(),await context.new_page()];errors=[]
                for page in pages:page.on('pageerror',lambda error:errors.append(str(error)))
                url='http://127.0.0.1:5174/test/fixtures/project-authoring.html?group='+str(uuid.uuid4())+('&primary=1' if args.primary else '')
                for page in pages:await page.goto(url,wait_until='networkidle');await page.wait_for_function('Boolean(window.projectAuthoringFixture)')
                await pages[0].evaluate('projectAuthoringFixture.seed()')
                original=await pages[0].evaluate('projectAuthoringFixture.originalKeys()')
                for page in pages:await page.evaluate('projectAuthoringFixture.open()')
                first=await pages[0].evaluate('projectAuthoringFixture.edit("窗口一保存")');assert first['ok'],first
                audit=await pages[1].evaluate('projectAuthoringFixture.audit()');assert audit['name']=='窗口一保存',audit
                stale=await pages[1].evaluate('projectAuthoringFixture.edit("窗口二未保存")');assert not stale['ok'] and stale['name']=='窗口二未保存' and stale['status']=='failed',stale
                await pages[1].get_by_text('保存未确认',exact=True).wait_for();await pages[1].get_by_label('查看工程保存问题').click();await pages[1].get_by_role('alert').filter(has_text='当前设计仍保留在窗口').wait_for()
                await pages[1].screenshot(path=str(args.output/(engine+'-stale-save.png')))
                saved=await pages[0].evaluate('projectAuthoringFixture.read()');assert saved['document']['name']=='窗口一保存' and saved['document']['createdAt']==1 and saved['document']['screenOrder']==['page'] and saved['document']['vendorExtension']=={'version':3,'source':'legacy'},saved
                assert 'projectAuthoringSession' not in saved['snapshot']['files']['project.json'],saved
                await pages[1].evaluate('projectAuthoringFixture.open()');reopened=await pages[1].evaluate('projectAuthoringFixture.edit("明确重开后保存")');assert reopened['ok'],reopened
                await pages[0].evaluate('projectAuthoringFixture.audit()');second_stale=await pages[0].evaluate('projectAuthoringFixture.edit("原窗口仍过期")');assert not second_stale['ok'],second_stale
                for page in pages:await page.evaluate('projectAuthoringFixture.open()')
                race=await asyncio.gather(*[page.evaluate('name=>projectAuthoringFixture.edit(name)',name) for page,name in zip(pages,['竞争一','竞争二'])]);assert sum(row['ok'] for row in race)==1,(engine,race)
                winner='竞争一' if race[0]['ok'] else '竞争二';final=await pages[0].evaluate('projectAuthoringFixture.read()');assert final['document']['name']==winner,(winner,final)
                for page in pages:await page.evaluate('projectAuthoringFixture.open()')
                await pages[0].evaluate('projectAuthoringFixture.editPage()');changed=await pages[0].evaluate('projectAuthoringFixture.read()');saved_history=json.loads(changed['snapshot']['files']['history.json']);assert saved_history['past'][-1]['label']=='修改正文' and '新的正文' in changed['document']['screens']['page']['htmlContent'],changed
                stale_flush=await pages[1].evaluate('projectAuthoringFixture.flush()');assert not stale_flush['ok'] and '其它实例' in stale_flush['message'],stale_flush
                assert await pages[0].evaluate('projectAuthoringFixture.read()')==changed
                await pages[0].evaluate('projectAuthoringFixture.undo()');undone=await pages[0].evaluate('projectAuthoringFixture.read()');assert '原文' in undone['document']['screens']['page']['htmlContent'] and len(json.loads(undone['snapshot']['files']['history.json'])['future'])==1,undone
                await pages[0].evaluate('projectAuthoringFixture.redo()');redone=await pages[0].evaluate('projectAuthoringFixture.read()');assert '新的正文' in redone['document']['screens']['page']['htmlContent'] and len(json.loads(redone['snapshot']['files']['history.json'])['future'])==0,redone
                await pages[1].evaluate('projectAuthoringFixture.open()');memory=await pages[1].evaluate('projectAuthoringFixture.state()');assert memory['history']==len(json.loads(redone['snapshot']['files']['history.json'])['past']),memory
                upgrade=await pages[0].evaluate('projectAuthoringFixture.upgradeHistoryScope()');assert all(upgrade.values()),upgrade
                primary_result=None
                if args.primary:
                    assert await pages[0].evaluate('projectAuthoringFixture.originalKeys()')==original
                    created=await pages[0].evaluate('projectAuthoringFixture.create()');assert created['status']=='saved' and created['author'] and created['originalKey'] is None,created
                    await pages[0].evaluate('id=>projectAuthoringFixture.poisonCache(id)',created['id']);opened=await pages[1].evaluate('id=>projectAuthoringFixture.openSaved(id)',created['id']);assert opened['name']=='真实浏览器新建工程' and '新建完整正文' in opened['page'] and len(opened['history'])==1,opened
                    deleted=await pages[1].evaluate('id=>projectAuthoringFixture.deleteSaved(id)',created['id']);assert not deleted['reopened'] and json.loads(deleted['snapshot']['files']['project.json'])['deleted'],deleted
                    primary_result={'originalLegacyKeysExact':True,'createHasAuthorAndNoLegacyRoot':True,'reopenIgnoresStaleCache':True,'deleteNeverRevivesLegacyBackup':True}
                assert not errors,errors
                rows.append({'engine':engine,'realms':2,'primaryBrowserProject':primary_result,'first':first,'auditDidNotRebase':stale,'reopened':reopened,'originalAuthorStillStale':second_stale,'race':race,'winner':winner,'finalIdentity':redone['snapshot']['identity'],'creationOrderAndUnknownMetadataPreserved':True,'staleHistoryFlush':stale_flush,'pageAndHistoryUndoRedoAndReopen':True,'historyScopeUpgrade':upgrade,'pageErrors':errors})
                await context.close()
            finally:await browser.close()
    result={'status':'passed','scope':__doc__,'checks':rows};(args.output/'results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));print(json.dumps(result,ensure_ascii=False))


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--output',type=Path,required=True);parser.add_argument('--primary',action='store_true');asyncio.run(run(parser.parse_args()))
