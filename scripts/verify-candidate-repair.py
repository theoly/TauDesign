#!/usr/bin/env python3
"""Explicit old-page repair: real candidate iframe, bounded fixture model, adoption, cancellation and reopen."""
import argparse
import asyncio
import json
from pathlib import Path
from playwright.async_api import async_playwright

async def main(args):
 async with async_playwright() as p:
  browser=await getattr(p,args.browser).launch(headless=True)
  page=await browser.new_page(viewport={'width':1600,'height':1050},locale='zh-CN')
  errors=[];navigations=[]
  page.on('pageerror',lambda error:errors.append(str(error)))
  page.on('framenavigated',lambda frame:navigations.append({'url':frame.url,'main':frame==page.main_frame}))
  args.screenshot.parent.mkdir(parents=True,exist_ok=True)
  try:
   await page.goto(args.url,wait_until='networkidle')
   await page.wait_for_function('Boolean(window.__projectStore)')
   await page.evaluate('''async()=>{
    window.__module=async path=>import(performance.getEntriesByType('resource').map(e=>e.name).find(url=>new URL(url).pathname===path)||path);
    const {useAIConfigStore,defaultProviders,defaultBindings}=await window.__module('/src/stores/useAIConfigStore.ts');
    const {DefaultAIEngineCore}=await window.__module('/src/services/ai/engine/core/index.ts');
    const {PageRenderCheck}=await window.__module('/src/services/ai/pageRenderCheck.ts');
    useAIConfigStore.setState({providers:defaultProviders.map(p=>({...p,apiKey:'local-fixture-secret'})),bindings:defaultBindings});
    const inspect=PageRenderCheck.inspect;
    PageRenderCheck.inspect=async function(request,...args){const report=await inspect.call(this,request,...args);window.__repair.checks.push({html:request.screen.htmlContent,overrides:request.overrides,report});return report;};
    DefaultAIEngineCore.prototype.streamText=function(options){
     const f=window.__repair;f.requests.push({maxTokens:options.maxTokens,jsonSchema:Boolean(options.jsonSchema)});
     const text=JSON.stringify({operations:[{nid:'save',type:f.invalid?'set_text':'remove_styles',value:f.invalid?'删除按钮':'font-size'}]});
     const ready=new Promise(resolve=>f.release=resolve);
     return {textStream:(async function*(){await ready;yield text;})(),reasoningStream:(async function*(){})(),textPromise:ready.then(()=>text),reasoningPromise:Promise.resolve(undefined),usagePromise:Promise.resolve({inputTokens:123,outputTokens:45}),finishReasonPromise:Promise.resolve('stop'),abort(){}};
    };
    const {neutralModernTheme}=await window.__module('/src/utils/themePresets.ts');
    const {useWorkspaceStore}=await window.__module('/src/stores/useWorkspaceStore.ts');
    const {useHistoryStore}=await window.__module('/src/stores/useHistoryStore.ts');
    const {buildDesignTaskContract}=await window.__module('/src/services/ai/designWorkflow.ts');
    // Resolve fixture imports before replacing the workspace and its child frames.
    window.__reset=(options={})=>{
     const s=window.__projectStore,id=s.getState().initNewProject({name:'候选修复验证',deviceProfile:'mobile',designSystem:neutralModernTheme,createSpecimen:false});
     const html='<main data-nid="root" class="col gap-4 p-4"><h1 data-nid="title" class="text-xl font-bold">会员资料</h1><p data-nid="description" class="text-secondary">编辑后保存资料</p><section data-nid="region"><button data-nid="save" class="btn btn-primary"><svg data-nid="icon" class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path data-nid="path" d="M5 12l4 4L19 6"/></svg><span data-nid="label">保存资料</span></button></section><button data-nid="other" class="btn">暂存</button></main>';
     s.getState().addScreen({name:'会员资料',htmlContent:html},'page');
     if(options.protected)s.setState({overrides:{'page:region':{nid:'region',declarations:{'border-radius':'8px'}}}});
     else s.setState({overrides:{'page:other':{nid:'other',declarations:{'border-radius':'8px'}}}});
     const contract=buildDesignTaskContract({intent:'modify_screen',request:'调整保存按钮的尺寸与字号',target:s.getState().screens.page,elementNid:options.outside?'other':'region',deviceProfile:'mobile',frameWidth:390,designSystem:s.getState().designSystem});
     window.__repair={requests:[],checks:[],invalid:Boolean(options.invalid)};
     s.getState().stageScreenChange('page',html.replace('data-nid="save"','style="font-size:0px" data-nid="save"'),'会员资料','调整保存按钮的尺寸与字号',contract,{source:'local-edit',rawResponse:'',completeHtml:html,continuationCount:0,warnings:[],localEdit:{mode:'element',targetNids:options.outside?['other']:['save'],operationCount:1}});
     useWorkspaceStore.setState({view:'workspace',activeProjectId:id});
     return {id,html,history:useHistoryStore.getState().past.length};
    };
   }''')
   async def panel():
    summary=page.get_by_text('查看验收记录',exact=True).first
    if await summary.locator('..').get_attribute('open') is None:await summary.click()
   async def ready():
    await page.wait_for_function('window.__projectStore.getState().stagedRenderQuality?.report.status==="complete"')
    await panel()
   fixture=await page.evaluate('window.__reset()')
   await ready()
   await page.get_by_role('button',name='修复一次并重新检查',exact=True).click()
   await page.wait_for_function('Boolean(window.__repair.release)')
   busy=await page.evaluate('''async fixture=>{
    const s=window.__projectStore.getState(),{loadStagedCandidate}=await window.__module('/src/services/storage/candidateRepository.ts');
    if(s.screens.page.htmlContent!==fixture.html||s.stagedRepairStatus!=='repairing')throw Error('Original changed before adoption');
    if(await s.adoptStagedChange()||await s.forceAdoptStagedChange()||await s.keepBothScreens())throw Error('Busy adoption unlocked');
    const stored=await loadStagedCandidate(s.id);if(!stored.repair)throw Error('Attempt not durably reserved');
    return {status:s.stagedRepairStatus,attemptStored:true,allAdoptionLocked:true,initial:s.stagedRenderQuality.report};
   }''',fixture)
   await page.screenshot(path=str(args.screenshot.with_stem(args.screenshot.stem+'-repairing')))
   await page.evaluate('window.__repair.release()')
   await page.wait_for_function('window.__projectStore.getState().stagedScreen?.repair?.status==="repaired"')
   await page.wait_for_function('window.__projectStore.getState().getStagedDeliveryReport().status==="ready"')
   await panel()
   await page.get_by_text('一次修复记录 · 复验通过',exact=True).first.click()
   await page.get_by_text('额外用量：输入 123 / 输出 45 Token',exact=True).first.wait_for()
   success=await page.evaluate('''async fixture=>{
    const s=window.__projectStore.getState(),f=window.__repair,{useHistoryStore}=await window.__module('/src/stores/useHistoryStore.ts');
    if(s.screens.page.htmlContent!==fixture.html||useHistoryStore.getState().past.length!==fixture.history)throw Error('Candidate repair altered original or History');
    if(f.requests.length!==1||!f.requests[0].jsonSchema||f.requests[0].maxTokens!==1800)throw Error('Wrong model bounds');
    if(f.checks.length!==1||f.checks[0].report.status!=='complete'||f.checks[0].report.findings.some(f=>f.severity==='error'))throw Error('No independent render proof');
    if(!f.checks[0].overrides['page:other'])throw Error('Exact L4 omitted');
    const before=new DOMParser().parseFromString(fixture.html,'text/html'),after=new DOMParser().parseFromString(s.stagedScreen.newHtml,'text/html');
    for(const nid of ['title','description','icon','path','label','other'])if(!before.querySelector('[data-nid="'+nid+'"]').isEqualNode(after.querySelector('[data-nid="'+nid+'"]')))throw Error('Unauthorized mutation '+nid);
    if(s.getStagedRepairEligibility().allowed)throw Error('Second request available');
    return {projectId:s.id,candidate:s.stagedScreen,checks:f.checks,requests:f.requests,current:s.stagedRenderQuality.report,historyDelta:0};
   }''',fixture)
   await page.screenshot(path=str(args.screenshot))
   await page.get_by_role('button',name='采纳新版 (替换原版)',exact=True).first.click()
   await page.wait_for_function('!window.__projectStore.getState().stagedScreen')
   adopted=await page.evaluate('''async fixture=>{
    const s=window.__projectStore.getState(),{useHistoryStore}=await window.__module('/src/stores/useHistoryStore.ts');
    const {DeliveryRepository}=await window.__module('/src/services/storage/deliveryRepository.ts'),{createProjectStorage}=await window.__module('/src/services/storage/projectStorage.ts');
    const archive=(await new DeliveryRepository(createProjectStorage(s.id),s.id).listForScreen('page',10)).records[0];
    if(archive.status!=='applied'||archive.candidate.repair.status!=='repaired'||JSON.stringify(archive).includes('local-fixture-secret'))throw Error('Wrong persisted repair proof');
    if(useHistoryStore.getState().past.length!==fixture.history+1)throw Error('Extra History');
    const result=s.screens.page.htmlContent;useHistoryStore.getState().undo();if(window.__projectStore.getState().screens.page.htmlContent!==fixture.html)throw Error('Undo');
    useHistoryStore.getState().redo();if(window.__projectStore.getState().screens.page.htmlContent!==result)throw Error('Redo');
    return {historyDelta:1,receipt:archive.candidate.repair,archiveId:archive.id};
   }''',fixture)
   rejected=[]
   for kind in ['invalid','cancel','protected','outside']:
    case=await page.evaluate('options=>window.__reset(options)',{kind:True})
    await ready()
    button=page.get_by_role('button',name='修复一次并重新检查',exact=True)
    if kind in ['protected','outside']:
     assert await button.is_disabled()
     result=await page.evaluate('''()=>({allowed:window.__projectStore.getState().getStagedRepairEligibility().allowed,requests:window.__repair.requests.length,reason:window.__projectStore.getState().getStagedRepairEligibility().message})''')
     assert result['allowed'] is False and result['requests']==0
    else:
     await button.click();await page.wait_for_function('Boolean(window.__repair.release)')
     if kind=='cancel':await page.get_by_role('button',name='取消修复',exact=True).click()
     await page.evaluate('window.__repair.release()')
     await page.wait_for_function('!window.__projectStore.getState().stagedRepairStatus')
     result=await page.evaluate('''async fixture=>{
      const s=window.__projectStore.getState(),{loadStagedCandidate}=await window.__module('/src/services/storage/candidateRepository.ts');
      const saved=await loadStagedCandidate(s.id);
      if(s.screens.page.htmlContent!==fixture.html||s.stagedScreen.repair.status==='repaired'||window.__repair.requests.length!==1)throw Error('Failed/cancelled repair changed original or retried');
      s.restoreStagedCandidate(saved,s.id);
      if(s.getStagedRepairEligibility().allowed)throw Error('Reopen allows retry');
      return {receipt:saved.repair,requests:window.__repair.requests.length,originalUntouched:true,reopenedRetryBlocked:true};
     }''',case)
    rejected.append({'kind':kind,**result})
   await page.screenshot(path=str(args.screenshot.with_stem(args.screenshot.stem+'-rejected')))
   await page.reload(wait_until='networkidle')
   await page.wait_for_function('Boolean(window.__projectStore)')
   await page.evaluate('''async id=>{
    const module=async path=>import(performance.getEntriesByType('resource').map(e=>e.name).find(url=>new URL(url).pathname===path)||path);
    const {useWorkspaceStore}=await module('/src/stores/useWorkspaceStore.ts');if(!useWorkspaceStore.getState().openProject(id))throw Error('Reopen');
   }''',fixture['id'])
   await page.frame_locator('iframe[title="会员资料"]').get_by_role('button',name='保存资料',exact=True).wait_for()
   # A real reload has no model fixture patch; restore it by navigating back through the same setup.
   reopened=await page.evaluate('''async()=>{
    const module=async path=>import(performance.getEntriesByType('resource').map(e=>e.name).find(url=>new URL(url).pathname===path)||path);
    const {DeliveryRepository}=await module('/src/services/storage/deliveryRepository.ts'),{createProjectStorage}=await module('/src/services/storage/projectStorage.ts');
    const s=window.__projectStore.getState(),records=(await new DeliveryRepository(createProjectStorage(s.id),s.id).listForScreen('page',10)).records;
    if(records[0].candidate.repair.status!=='repaired')throw Error('Reload lost receipt');return {archivedRepair:true,originalNowMatchesAdopted:true};
   }''')
   await page.screenshot(path=str(args.screenshot.with_stem(args.screenshot.stem+'-reopened')))
   assert not errors,errors
   report={'status':'passed','browser':args.browser,'version':browser.version,'model':'controlled local model stream; actual candidate and independent iframe; no online Provider calls','busy':busy,'success':success,'adopted':adopted,'reopened':reopened,'rejected':rejected,'pageErrors':errors}
   args.report.parent.mkdir(parents=True,exist_ok=True);args.report.write_text(json.dumps(report,ensure_ascii=False,indent=2))
   print(json.dumps({'status':'passed','browser':args.browser,'requests':len(success['requests']),'renderChecks':len(success['checks']),'historyDelta':adopted['historyDelta'],'pageErrors':errors},ensure_ascii=False))
  except Exception:
   await page.screenshot(path=str(args.screenshot.with_stem(args.screenshot.stem+'-failure')))
   print(json.dumps({'pageErrors':errors,'navigations':navigations[-80:],'text':(await page.locator('body').inner_text())[-4500:]},ensure_ascii=False));raise
  finally:await browser.close()
if __name__=='__main__':
 parser=argparse.ArgumentParser(description=__doc__)
 parser.add_argument('--url',default='http://127.0.0.1:5174')
 parser.add_argument('--browser',choices=['chromium','webkit'],default='chromium')
 parser.add_argument('--screenshot',type=Path,default=Path('/tmp/candidate-repair.png'))
 parser.add_argument('--report',type=Path,default=Path('/tmp/candidate-repair.json'))
 asyncio.run(main(parser.parse_args()))
