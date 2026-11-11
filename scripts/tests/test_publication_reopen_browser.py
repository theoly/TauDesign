#!/usr/bin/env python3
"""Read-only crash-leftover recognition and explicit historical task settlement on actual UI/IndexedDB; no model."""
import argparse
import asyncio
import json
import subprocess
from pathlib import Path
from playwright.async_api import async_playwright
from test_final_publication_browser import ready, await_finish

ROOT=Path(__file__).resolve().parents[2]

def inputs():
    code="import {captureDesignInputs} from './scripts/lib/designEvidenceInputs.ts'; console.log(JSON.stringify(await captureDesignInputs(process.cwd(),true)));"
    return json.loads(subprocess.check_output(['pnpm','exec','tsx','-e',code],cwd=ROOT,text=True))

async def run(args):
    args.output.mkdir(parents=True,exist_ok=False);before=inputs();rows=[]
    result={'status':'running','scope':__doc__,'sourceInputs':before,'checks':rows}
    try:
        async with async_playwright() as p:
            for engine in ['chromium','webkit']:
                browser=await getattr(p,engine).launch(headless=True)
                try:
                    for device in ['mobile','pc']:
                        context=await browser.new_context(viewport={'width':1600,'height':1000});page=await context.new_page();errors=[]
                        page.on('pageerror',lambda e:errors.append(str(e)))
                        try:
                            url='http://127.0.0.1:5174/test/fixtures/candidate-actions.html?mode=synthetic&device='+device
                            await page.goto(url+'&journal=1',wait_until='networkidle');await ready(page)
                            project_id,task_id=await page.evaluate('[fixture.state().id,fixture.taskId]')
                            await page.get_by_test_id('candidate-actions-toolbar').get_by_role('button',name='采纳新版 (替换原版)',exact=True).click();await await_finish(page)
                            await page.wait_for_function('fixture.state().stagedScreen===null')
                            record=await page.evaluate('async()=>{const r=(await fixture.archives(fixture.target))[0],{saveStagedCandidate}=await import("/src/services/storage/candidateRepository.ts");await saveStagedCandidate(fixture.state().id,undefined,r.candidate);return {id:r.id,request:r.candidate.modificationRequest};}')
                            # A new realm opens the durable source, with both old sidecars left behind.
                            reopened=await context.new_page();reopened.on('pageerror',lambda e:errors.append(str(e)))
                            await reopened.goto(url+'&resume='+project_id,wait_until='networkidle');await reopened.wait_for_function('Boolean(window.fixture)')
                            proof=await reopened.evaluate('''async taskId=>{
                                const {createProjectStorage}=await import('/src/services/storage/projectStorage.ts'),{loadStagedCandidate}=await import('/src/services/storage/candidateRepository.ts'),{readDesignTask,listDesignTaskIndex}=await import('/src/services/storage/designTaskRepository.ts');
                                const s=fixture.state(),storage=createProjectStorage(s.id),path='tasks/'+taskId+'/manifest.json',before=await storage.readText(path),candidateBefore=await storage.readText('candidates/current.json');
                                const candidate=await loadStagedCandidate(s.id),task=await readDesignTask(storage,s.id,taskId),pending=await listDesignTaskIndex(storage,s.id);
                                return {candidate,taskState:task.task.state,publication:task.publication,pending:pending.tasks.length,manifestUnchanged:before===await storage.readText(path),candidateUnchanged:candidateBefore===await storage.readText('candidates/current.json'),history:fixture.history()};
                            }''',task_id)
                            assert proof['candidate'] is None and proof['taskState']=='draft' and proof['publication']['id']==record['id'] and proof['pending']==0 and proof['manifestUnchanged'] and proof['candidateUnchanged'],proof
                            await reopened.evaluate('fixture.openTasks()');dialog=reopened.get_by_role('dialog',name='设计任务记录');await dialog.get_by_role('button').filter(has_text=record['request']).click()
                            await dialog.get_by_role('button',name='同步已保存的交付状态',exact=True).wait_for()
                            assert await dialog.get_by_role('button',name='恢复草稿（新任务）',exact=True).count()==0
                            await reopened.screenshot(path=str(args.output/f'{engine}-{device}-saved-awaiting-marker.png'))
                            await dialog.get_by_role('button',name='同步已保存的交付状态',exact=True).click();await dialog.get_by_role('status').filter(has_text='已同步历史交付状态').wait_for()
                            after=await reopened.evaluate('''async taskId=>{const {createProjectStorage}=await import('/src/services/storage/projectStorage.ts'),{readDesignTask}=await import('/src/services/storage/designTaskRepository.ts');return {saved:await readDesignTask(createProjectStorage(fixture.state().id),fixture.state().id,taskId),history:fixture.history(),models:fixture.models()};}''',task_id)
                            assert after['saved']['task']['state']=='completed' and after['history']==proof['history'] and after['models']==0,after
                            await dialog.get_by_role('button',name='关闭',exact=True).click();await reopened.evaluate('fixture.undo()');await reopened.evaluate('async()=>{await fixture.state().saveProjectChecked();}')
                            assert await reopened.evaluate('async()=>{const {loadStagedCandidate}=await import("/src/services/storage/candidateRepository.ts");return await loadStagedCandidate(fixture.state().id);} ') is None
                            assert not errors,errors
                            rows.append({'engine':engine,'device':device,'status':'passed','readOnlyRecognition':True,'sidecarsPreserved':True,'explicitSettlement':True,'pairedHistoryUnchanged':True,'undoDoesNotReviveCandidate':True,'providerCalls':0,'pageErrors':errors})
                        finally:
                            await context.close()
                finally:
                    await browser.close()
        result['status']='passed'
    except BaseException as error:
        result['status']='failed';result['error']=str(error);raise
    finally:
        result['inputsUnchanged']=inputs()==before
        if not result['inputsUnchanged']:result['status']='failed'
        (args.output/'results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
    if result['status']!='passed':raise RuntimeError('Executable inputs changed during verification')
    print(json.dumps({'status':'passed','groups':len(rows),'inputsUnchanged':True}))

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--output',type=Path,required=True)
    asyncio.run(run(parser.parse_args()))
