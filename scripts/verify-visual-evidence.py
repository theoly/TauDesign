#!/usr/bin/env python3
"""Real UI export -> offline browser CLI -> local PNG recomputation -> persisted delivery evidence."""
import argparse,asyncio,hashlib,json,shutil,sys
from pathlib import Path
from PIL import Image,ImageDraw
from playwright.async_api import async_playwright

async def cli(job,browser,reference,output,initialize=False):
 command=[sys.executable,str(Path(__file__).with_name('verify-delivery-visual.py')),'--job',str(job),'--browser',browser,'--reference',str(reference),'--output',str(output)]
 if initialize:command.append('--update-reference')
 process=await asyncio.create_subprocess_exec(*command,stdout=asyncio.subprocess.PIPE,stderr=asyncio.subprocess.PIPE)
 stdout,stderr=await process.communicate()
 (output.parent/(output.name+'-runner.txt')).write_bytes(stdout+stderr)
 return process.returncode

async def main(args):
 args.artifacts=args.artifacts.resolve();args.artifacts.mkdir(parents=True,exist_ok=True)
 async with async_playwright() as p:
  browser=await getattr(p,args.browser).launch(headless=True);page=await browser.new_page(viewport={'width':1600,'height':1050},locale='zh-CN');errors=[]
  page.on('pageerror',lambda error:errors.append(str(error)))
  try:
   await page.goto(args.url,wait_until='networkidle');await page.wait_for_function('Boolean(window.__projectStore)')
   identity=await page.evaluate(r'''async()=>{
    window.__module=async path=>import(performance.getEntriesByType('resource').map(e=>e.name).find(url=>new URL(url).pathname===path)||path);
    const {neutralModernTheme}=await window.__module('/src/utils/themePresets.ts'),{useWorkspaceStore}=await window.__module('/src/stores/useWorkspaceStore.ts');
    const s=window.__projectStore,id=s.getState().initNewProject({name:'交付视觉基准',deviceProfile:'mobile',designSystem:neutralModernTheme,createSpecimen:false});
    const html='<main data-nid="root" class="col p-4 gap-4"><h1 data-nid="title" class="text-xl">视觉任务闭环</h1><p data-nid="intro">报告仅关联实际交付版本</p><button data-nid="action" class="btn btn-primary">提交</button></main>';
    s.getState().addScreen({name:'资料页',htmlContent:html,position:{x:0,y:0}},'page');useWorkspaceStore.setState({view:'workspace',activeProjectId:id});s.getState().stageScreenChange('page',html.replace('>提交</button>','>确认提交</button>'),'新版本','修改按钮文字');return {id};
   }''')
   await page.wait_for_function("window.__projectStore.getState().getStagedDeliveryReport().status==='ready'")
   await page.get_by_role('button',name='采纳新版 (替换原版)',exact=True).last.click();await page.wait_for_function('window.__projectStore.getState().stagedScreen===null')
   events=await page.evaluate(r'''async()=>{
    const s=window.__projectStore.getState(),{acceptRestyleResult}=await window.__module('/src/services/ai/restyleService.ts'),{DeliveryRepository}=await window.__module('/src/services/storage/deliveryRepository.ts'),{RestyleDeliveryRepository}=await window.__module('/src/services/storage/restyleDeliveryRepository.ts'),{createProjectStorage}=await window.__module('/src/services/storage/projectStorage.ts');
    const single=(await new DeliveryRepository(createProjectStorage(s.id),s.id).listForScreen('page')).records[0];const html=s.screens.page.htmlContent;
    const result=await s.applyRestyleOutcome(acceptRestyleResult({kind:'screen',id:'page',name:'资料页',html},html.replace('p-4','p-6'),{designSystem:s.designSystem,deviceProfile:'mobile'}));if(!result.applied)throw Error(JSON.stringify(result));
    const restyle=(await new RestyleDeliveryRepository(createProjectStorage(s.id),s.id).list()).records[0];
    const {useHistoryStore}=await window.__module('/src/stores/useHistoryStore.ts');return {single:single.id,restyle:restyle.id,html:window.__projectStore.getState().screens.page.htmlContent,history:useHistoryStore.getState().past.length};
   }''')
   async def show_single():
    inspector=page.get_by_role('button',name='元素属性',exact=True)
    if await inspector.get_attribute('aria-pressed')!='true':await inspector.click()
    history=page.get_by_label('页面交付历史',exact=True)
    entry=history.locator(':scope > details').first
    await entry.locator(':scope > summary').click()
    visual=entry.get_by_label('page · 视觉基准记录',exact=True)
    await visual.locator(':scope > summary').click();return visual
   single=await show_single()
   async def export_job(panel,path):
    async with page.expect_download() as download:await panel.get_by_role('button',name='导出视觉任务',exact=True).click()
    await(await download.value).save_as(str(path));task=json.loads(path.read_text());assert task['width']==390 and task['height']==844;return task
   async def upload(panel,directory):
    await panel.get_by_label('导入视觉结果文件',exact=True).set_input_files([str(directory/name) for name in ['result.json','reference.png','actual.png','diff.png']])
   job=args.artifacts/'single-task.json';task=await export_job(single,job)
   reference=args.artifacts/'baselines/single.png'
   initialized=args.artifacts/'initialized';assert await cli(job,args.browser,reference,initialized,True)==0
   await upload(single,initialized);await single.get_by_text('仅建立基准，已保存为历史证据。',exact=True).wait_for()
   passed=args.artifacts/'passed';assert await cli(job,args.browser,reference,passed)==0
   await upload(single,passed);await single.get_by_text('像素复核通过，已保存为历史证据。',exact=True).wait_for()
   await upload(single,passed);await single.get_by_text('这份视觉报告已经关联，没有重复保存。',exact=True).wait_for()
   negative=args.artifacts/'negative-baseline.png';shutil.copyfile(reference,negative)
   meta=reference.with_suffix('.png.metadata.json');negative_meta=negative.with_suffix('.png.metadata.json');baseline=json.loads(meta.read_text())
   with Image.open(negative) as image:
    image=image.convert('RGB');ImageDraw.Draw(image).rectangle((0,0,99,99),fill=(0,255,0));image.save(negative)
   baseline['sha256']=hashlib.sha256(negative.read_bytes()).hexdigest();negative_meta.write_text(json.dumps(baseline))
   failed=args.artifacts/'failed';assert await cli(job,args.browser,negative,failed)==1
   await upload(single,failed);await single.get_by_text('像素复核失败，已保存为历史证据。',exact=True).wait_for()
   summary=single.locator('article').first.get_by_text('查看基准、实际与差异图',exact=True);await summary.click()
   await single.locator('article').first.get_by_role('img').first.evaluate('(image)=>image.decode()')
   await page.screenshot(path=str(args.artifacts/'single.png'))
   # Restyle shares the same visible feature but binds to a different event and snapshot.
   await page.get_by_text('重塑交付历史',exact=True).click()
   await page.get_by_text('页面 · 资料页 · 已应用',exact=False).click()
   await page.get_by_text('资料页 · 前后版本与首屏图',exact=True).click()
   restyle=page.get_by_label('page · 视觉基准记录',exact=True).last
   await restyle.locator(':scope > summary').click()
   await upload(restyle,passed);await restyle.get_by_role('alert').get_by_text('报告与当前交付视觉任务不匹配',exact=False).wait_for()
   restyle_job=args.artifacts/'restyle-task.json';restyle_task=await export_job(restyle,restyle_job);assert restyle_task['fingerprint']!=task['fingerprint']
   restyle_reference=args.artifacts/'baselines/restyle.png';assert await cli(restyle_job,args.browser,restyle_reference,args.artifacts/'restyle-initialized',True)==0
   restyle_passed=args.artifacts/'restyle-passed';assert await cli(restyle_job,args.browser,restyle_reference,restyle_passed)==0
   await upload(restyle,restyle_passed);await restyle.get_by_text('像素复核通过，已保存为历史证据。',exact=True).wait_for()
   unchanged=await page.evaluate(r'''async events=>{
    const s=window.__projectStore.getState(),{useHistoryStore}=await window.__module('/src/stores/useHistoryStore.ts');if(s.screens.page.htmlContent!==events.html||useHistoryStore.getState().past.length!==events.history)throw Error('Evidence changed code/history');
    const {listVisualEvidence}=await window.__module('/src/services/storage/visualEvidence.ts'),{createProjectStorage}=await window.__module('/src/services/storage/projectStorage.ts');const storage=createProjectStorage(s.id);
    const single=(await listVisualEvidence(storage,{projectId:s.id,kind:'single',eventId:events.single,screenId:'page'})).records,restyle=(await listVisualEvidence(storage,{projectId:s.id,kind:'restyle',eventId:events.restyle,screenId:'page'})).records;
    if(single.length!==3||restyle.length!==1)throw Error('Evidence count');window.__visualEvents=events;
    s.stageScreenChange('page',s.screens.page.htmlContent.replace('class="btn btn-primary"','class="btn btn-primary" style="font-size:0"'),'不可见候选','不得用历史报告解锁');return {single:single.map(r=>r.status),restyle:restyle.map(r=>r.status),codeUnchanged:true,historyUnchanged:true};
   }''',events)
   await page.wait_for_function("window.__projectStore.getState().stagedRenderQuality?.report.status==='complete'")
   assert await page.evaluate("window.__projectStore.getState().getStagedDeliveryReport().status==='blocked'")
   await upload(restyle,restyle_passed);await restyle.get_by_text('这份视觉报告已经关联，没有重复保存。',exact=True).wait_for()
   assert not await page.evaluate('window.__projectStore.getState().forceAdoptStagedChange()')
   # Environment mismatch is rejected by the CLI before producing a report.
   env_reference=args.artifacts/'wrong-environment.png';shutil.copyfile(reference,env_reference);environment=json.loads(meta.read_text());environment['identity']['environment']['version']='wrong-version';env_reference.with_suffix('.png.metadata.json').write_text(json.dumps(environment))
   assert await cli(job,args.browser,env_reference,args.artifacts/'wrong-environment')!=0
   assert not(args.artifacts/'wrong-environment/result.json').exists()
   stale=args.artifacts/'stale-output';shutil.copytree(passed,stale,dirs_exist_ok=True)
   assert await cli(job,args.browser,env_reference,stale)!=0
   assert not(stale/'result.json').exists()
   offline_task=json.loads(job.read_text());offline_task['document']=offline_task['document'].replace('</body>','<img src="https://example.invalid/must-not-connect.png"></body>');offline_task['documentHash']=hashlib.sha256(offline_task['document'].encode()).hexdigest()
   offline_task['fingerprint']=hashlib.sha256(json.dumps([1,offline_task['owner']['projectId'],'single',events['single'],'page',offline_task['documentHash'],390,844,'first-screen'],ensure_ascii=False,separators=(',',':')).encode()).hexdigest();offline_job=args.artifacts/'offline-task.json';offline_job.write_text(json.dumps(offline_task,ensure_ascii=False))
   assert await cli(offline_job,args.browser,args.artifacts/'baselines/offline.png',args.artifacts/'offline',True)!=0
   assert not(args.artifacts/'offline/result.json').exists()
   await page.reload(wait_until='networkidle');await page.wait_for_function('Boolean(window.__projectStore)')
   await page.evaluate(r'''async id=>{const url=performance.getEntriesByType('resource').map(e=>e.name).find(url=>new URL(url).pathname==='/src/stores/useWorkspaceStore.ts');const {useWorkspaceStore}=await import(url);useWorkspaceStore.getState().openProject(id);}''',identity['id'])
   single=await show_single();await single.get_by_text('像素复核失败',exact=False).wait_for();assert await single.locator('article').count()==3
   await single.locator('article').first.get_by_text('查看基准、实际与差异图',exact=True).click();await single.locator('article').first.get_by_role('img').first.evaluate('(image)=>image.decode()')
   await page.screenshot(path=str(args.artifacts/'reopened.png'))
   assert not errors,errors
   report={'status':'passed','browser':args.browser,'version':browser.version,'scope':'real UI/store/iframe and real offline CLI browser screenshots, real local canvas pixel verification; browser storage, no native dialogs/capture and no AI','events':events,'results':unchanged,'baselineInitializedDistinct':True,'intentionalDriftRejectedByRunnerAndArchivedFailed':True,'wrongEventRejected':True,'wrongEnvironmentRejected':True,'networkBlocked':True,'staleRunnerResultCleared':True,'candidateNotUnlocked':True,'reopenedRecords':3,'pageErrors':errors}
   (args.artifacts/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps({'status':'passed','browser':args.browser,'singleReports':3,'restyleReports':1},ensure_ascii=False))
  except Exception:
   await page.screenshot(path=str(args.artifacts/'failure.png'));print(json.dumps({'pageErrors':errors,'text':(await page.locator('body').inner_text())[-5000:]},ensure_ascii=False));raise
  finally:await browser.close()
if __name__=='__main__':
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--url',default='http://127.0.0.1:5174');parser.add_argument('--browser',choices=['chromium','webkit'],default='chromium');parser.add_argument('--artifacts',type=Path,required=True);asyncio.run(main(parser.parse_args()))
