#!/usr/bin/env python3
"""Actual resource-table migration and cross-realm resource changes at candidate final publication; no Provider."""
import argparse
import asyncio
import json
from pathlib import Path
from playwright.async_api import async_playwright
from test_final_publication_browser import ready, await_finish
from test_publication_reopen_browser import inputs

def page_closed(page):return page.is_closed()

async def upgrade(browser,engine,blocked):
    context=await browser.new_context();a=await context.new_page();b=await context.new_page();errors=[]
    for page in [a,b]:page.on('pageerror',lambda e:errors.append(str(e)))
    try:
        for page in [a,b]:await page.goto('http://127.0.0.1:5174/favicon.svg',wait_until='load')
        before=await a.evaluate('''async()=>{
            const {managedSnapshot}=await import('/src/services/storage/managedProjectSnapshot.ts'),snapshot=await managedSnapshot({'project.json':'original project','screens/page.html':'<main>original</main>','history.json':'original History'});
            const db=await new Promise((resolve,reject)=>{const request=indexedDB.open('taudesign-managed-projects-v1',1);request.onupgradeneeded=()=>request.result.createObjectStore('projects');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});window.legacyDB=db;
            await new Promise((resolve,reject)=>{const tx=db.transaction('projects','readwrite');tx.objectStore('projects').put({...snapshot,scopeVersion:2},'localStorage:resource-upgrade');tx.oncomplete=resolve;tx.onabort=reject;});
            localStorage.setItem('resource-upgrade:assets/images/legacy.png','AAEC/w==');return snapshot;
        }''')
        if not blocked:await a.evaluate('legacyDB.close()')
        first=await b.evaluate('''async()=>{const {LocalStorageStorage}=await import('/src/services/storage/projectStorage.ts');window.resourceStorage=new LocalStorageStorage('resource-upgrade');try{return {value:await resourceStorage.readBinary('assets/images/legacy.png')};}catch(error){return {error:error.message};}}''')
        if blocked:
            assert '升级被其它窗口占用' in first.get('error',''),first
            assert await a.evaluate("localStorage.getItem('resource-upgrade:assets/images/legacy.png')")=='AAEC/w=='
            await a.evaluate('legacyDB.close()')
        else:assert first['value']=='AAEC/w==',first
        result=await b.evaluate('''async()=>{
            const original=await resourceStorage.readBinary('assets/images/legacy.png');await resourceStorage.writeBinary('assets/images/legacy.png','AAED/w==');localStorage.setItem('resource-upgrade:assets/images/legacy.png','c3RhbGU=');
            const updated=await resourceStorage.readBinary('assets/images/legacy.png');await resourceStorage.remove('assets/images');const deleted=await resourceStorage.readBinary('assets/images/legacy.png');
            return {original,updated,deleted,snapshot:await resourceStorage.readManagedSnapshot(),backup:localStorage.getItem('resource-upgrade:assets/images/legacy.png'),files:await resourceStorage.listDir('')};
        }''')
        assert result['original']=='AAEC/w==' and result['updated']=='AAED/w==' and result['deleted'] is None and result['snapshot']==before and result['backup']=='c3RhbGU=' and 'assets/images/legacy.png' not in result['files'],result
        assert not errors,errors
        return {'engine':engine,'case':'blocked-upgrade' if blocked else 'v1-upgrade','status':'passed','projectAndHistoryUnchanged':True,'legacyBackupPreserved':True,'deletionDoesNotReviveBackup':True,'pageErrors':errors}
    finally:await context.close()

async def run(args):
    args.output.mkdir(parents=True,exist_ok=False);source=inputs();rows=[];result={'status':'running','scope':__doc__,'sourceInputs':source,'checks':rows}
    try:
        async with async_playwright() as p:
            for engine in ['chromium','webkit']:
                browser=await getattr(p,engine).launch(headless=True)
                try:
                    for blocked in [False,True]:rows.append(await upgrade(browser,engine,blocked))
                    for device in ['mobile','pc']:
                        for fault in ['none','replace-before','delete-before','replace-after-hash','delete-after-hash']:
                            context=await browser.new_context(viewport={'width':1600,'height':1000});pages=[await context.new_page(),await context.new_page()];a,b=pages;errors=[]
                            for page in pages:page.on('pageerror',lambda e:errors.append(str(e)))
                            try:
                                await a.goto('http://127.0.0.1:5174/test/fixtures/candidate-actions.html?mode=synthetic&resource=1&device='+device,wait_until='networkidle');await ready(a)
                                await b.goto('http://127.0.0.1:5174/favicon.svg',wait_until='load')
                                before=await a.evaluate('async()=>({id:fixture.state().id,html:fixture.state().screens.page.htmlContent,history:fixture.history(),snapshot:await fixture.snapshot(),resource:fixture.resource})')
                                if fault.endswith('after-hash'):
                                    await a.evaluate('''async()=>{
                                        const browserProjectSnapshotStore=fixture.resourceTransactionStore,original=browserProjectSnapshotStore.compareExchange;let release;const gate=new Promise(resolve=>release=resolve);window.resourceGate={entered:false,writes:0};
                                        browserProjectSnapshotStore.compareExchange=async function(scope,expected,next,resources){if(resources?.length){resourceGate.entered=true;resourceGate.writes++;resourceGate.dependencies=resources.length;await gate;}return original.call(this,scope,expected,next,resources);};
                                        resourceGate.release=release;resourceGate.restore=()=>{browserProjectSnapshotStore.compareExchange=original;};
                                    }''')
                                else:await a.evaluate('fixture.holdNext()')
                                await a.get_by_test_id('candidate-actions-toolbar').get_by_role('button',name='采纳新版 (替换原版)',exact=True).click()
                                if fault.endswith('after-hash'):await a.wait_for_function('resourceGate.entered')
                                else:await a.wait_for_function('fixture.held().entered')
                                if fault!='none':
                                    await b.evaluate('''async data=>{const {createProjectStorage}=await import('/src/services/storage/projectStorage.ts');const storage=createProjectStorage(data.id);if(data.remove)await storage.remove(data.path);else await storage.writeBinary(data.path,data.value);}''',{'id':before['id'],'path':before['resource']['path'],'value':before['resource']['replacement'],'remove':fault.startswith('delete')})
                                await a.evaluate('window.resourceGate?resourceGate.release():fixture.release()');await await_finish(a)
                                await a.evaluate('window.resourceGate?resourceGate.restore():fixture.restoreIO()')
                                after=await a.evaluate('async()=>({html:fixture.state().screens.page.htmlContent,history:fixture.history(),snapshot:await fixture.snapshot(),staged:!!fixture.state().stagedScreen,error:fixture.state().stagedAdoptionError,models:fixture.models(),dependencies:window.resourceGate?.dependencies})')
                                if fault=='none':assert not after['staged'] and after['html']!=before['html'] and len(after['history']['past'])==len(before['history']['past'])+1,after
                                else:
                                    assert after['staged'] and after['html']==before['html'] and after['history']==before['history'] and after['snapshot']==before['snapshot'],after
                                    assert ('不存在' if fault=='delete-before' else '已变化') in after['error'],after
                                    if fault.endswith('after-hash'):assert after['dependencies']==1,after
                                    if fault=='replace-after-hash':await a.screenshot(path=str(args.output/f'{engine}-{device}-resource-change-refused.png'))
                                assert after['models']==0 and not errors,(after,errors)
                                rows.append({'engine':engine,'device':device,'case':fault,'status':'passed','pageHistoryAndProjectUnchanged':fault!='none','resourceCheckInsideDatabaseTransaction':fault.endswith('after-hash'),'separateRealmResourceWriter':fault!='none','providerCalls':0,'pageErrors':errors})
                            except BaseException:
                                if not page_closed(a):
                                    await a.screenshot(path=str(args.output/f'{engine}-{device}-{fault}-failure.png'))
                                    (args.output/f'{engine}-{device}-{fault}-failure.json').write_text(json.dumps({'pageErrors':errors,'details':await a.evaluate('window.fixture?({report:fixture.report(),asset:fixture.state().stagedAssetFiles,render:fixture.state().stagedRenderQuality}):document.body.innerText')},ensure_ascii=False,indent=2))
                                raise
                            finally:await context.close()
                finally:await browser.close()
        result['status']='passed'
    except BaseException as error:result['status']='failed';result['error']=str(error);raise
    finally:
        result['inputsUnchanged']=inputs()==source
        if not result['inputsUnchanged']:result['status']='failed'
        (args.output/'results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
    if result['status']!='passed':raise RuntimeError('Executable inputs changed during verification')
    print(json.dumps({'status':'passed','groups':len(rows),'inputsUnchanged':True}))

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--output',required=True,type=Path)
    asyncio.run(run(parser.parse_args()))
