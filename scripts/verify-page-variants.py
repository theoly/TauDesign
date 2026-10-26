"""Local deterministic multi-variant UI + real iframe gate acceptance; no online AI."""
import argparse,asyncio,json
from pathlib import Path
from playwright.async_api import async_playwright

async def main(args):
 async with async_playwright() as p:
  browser=await getattr(p,args.browser).launch(headless=True)
  page=await browser.new_page(viewport={'width':1700,'height':1050},locale='zh-CN')
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  args.screenshot.parent.mkdir(parents=True,exist_ok=True)
  try:
   await page.goto(args.url,wait_until='networkidle')
   await page.wait_for_function('Boolean(window.__projectStore)')
   await page.evaluate('''async()=>{
    window.__module=async path=>import(performance.getEntriesByType('resource').map(e=>e.name).find(url=>new URL(url).pathname===path)||path);
    const {useAIConfigStore,defaultProviders,defaultBindings}=await window.__module('/src/stores/useAIConfigStore.ts');
    const {DefaultAIEngineCore}=await window.__module('/src/services/ai/engine/core/index.ts');
    const {neutralModernTheme}=await window.__module('/src/utils/themePresets.ts');
    const {useWorkspaceStore}=await window.__module('/src/stores/useWorkspaceStore.ts');
    const {useHistoryStore}=await window.__module('/src/stores/useHistoryStore.ts');
    window.__history=useHistoryStore;
    useAIConfigStore.setState({providers:defaultProviders.map(p=>({...p,apiKey:'controlled-local-fixture'})),bindings:defaultBindings});
    DefaultAIEngineCore.prototype.generateObject=async(_schema,options)=>{
      const f=window.__variants;f.plans++;f.planning=options.messages;
      return {summary:'同一资料页的三个信息层级方案',pages:[
       {name:'重点方案',requirements:['个人资料与保存','突出主要信息'],links:[]},
       {name:'分组方案',requirements:['个人资料与保存','按组组织信息'],links:[]},
       {name:'步骤方案',requirements:['个人资料与保存','按步骤引导'],links:[]}]};
    };
    DefaultAIEngineCore.prototype.streamText=function(options){
      const f=window.__variants,scope=JSON.parse(options.messages.find(m=>m.role==='system').content.match(/confirmedMultiPageScope=(.*); output exactly this page/)[1]);
      const index=f.streams.length+1;f.streams.push({scope,pages:window.__projectStore.getState().screenOrder.length,messages:options.messages});
      const content=index===1?'<h1 class="text-xl font-bold">个人资料</h1><section class="card p-4"><h2 class="text-lg font-bold">基本信息</h2><p>姓名：测试用户</p></section>':'<h1 class="text-xl font-bold">个人资料</h1><section class="card p-4"><h2 class="text-lg font-bold">基本信息</h2></section><section class="card p-4"><p>姓名：测试用户</p></section>';
      const answer=f.fail===index?'未生成HTML':'<artifact identifier="screen_new" type="screen" title="'+scope.name+'"><main class="col gap-4 p-4">'+content+'<button class="btn btn-primary">保存资料</button></main></artifact>';
      const ready=f.hold===index?new Promise(resolve=>f.release=resolve):Promise.resolve();
      return {textStream:(async function*(){await ready;yield answer;})(),reasoningStream:(async function*(){})(),textPromise:ready.then(()=>{f.done++;return answer;}),reasoningPromise:Promise.resolve(undefined),usagePromise:Promise.resolve({inputTokens:100,outputTokens:200}),finishReasonPromise:Promise.resolve('stop'),abort(){}};
    };
    window.__resetVariants=()=>{
      const s=window.__projectStore;
      const id=s.getState().initNewProject({name:'同页方案验收',deviceProfile:'mobile',designSystem:neutralModernTheme,createSpecimen:false});
      s.getState().addScreen({name:'资料原页',htmlContent:'<main data-nid="original" class="p-4"><h1>个人资料</h1><p>姓名：测试用户</p><button class="btn">保存资料</button></main>'},'old');
      s.getState().setActiveScreen('old');useWorkspaceStore.setState({view:'workspace',activeProjectId:id});
      window.__variants={plans:0,streams:[],hold:0,fail:0,done:0};
      return {history:useHistoryStore.getState().past.length,original:s.getState().screens.old.htmlContent,theme:JSON.stringify(s.getState().designSystem)};
    };
   }''')
   async def send():
    await page.locator('textarea[placeholder^="输入设计诉求"]').fill('基于当前页面生成三个方案，保留个人资料和保存功能，仅比较信息层级与布局')
    await page.get_by_title('发送设计诉求 (Enter)',exact=True).click()
    card=page.locator('[data-testid="multi-page-plan"]').last
    await card.get_by_role('button',name='确认计划并生成 3 个方案',exact=True).wait_for()
    return card
   fixture=await page.evaluate('window.__resetVariants()');card=await send()
   assert await page.evaluate('window.__variants.streams.length')==0
   assert await card.locator('input[type=checkbox]').count()==0
   await card.get_by_label('第1方案要求',exact=True).fill('保留个人资料和保存功能，强调姓名与保存按钮')
   await card.locator('details').nth(2).locator('summary').click()
   await card.get_by_role('button',name='移除此方案：步骤方案',exact=True).click()
   assert await card.get_by_role('button',name='移除此方案：重点方案',exact=True).is_disabled()
   await page.screenshot(path=str(args.screenshot.with_stem(args.screenshot.stem+'-plan')))
   await card.get_by_role('button',name='确认计划并生成 2 个方案',exact=True).click()
   await card.get_by_text('已并排新增 2 个方案',exact=False).wait_for(timeout=30000)
   success=await page.evaluate('''async fixture=>{
    const s=window.__projectStore.getState(),f=window.__variants,pages=s.screenOrder.filter(id=>id!=='old').map(id=>s.screens[id]);
    if(pages.length!==2||f.streams.length!==2||f.streams.some(r=>r.pages!==1))throw Error('Partial or wrong count batch');
    if(s.screens.old.htmlContent!==fixture.original||JSON.stringify(s.designSystem)!==fixture.theme)throw Error('Source or theme mutated');
    if(window.__history.getState().past.length!==fixture.history+1)throw Error('Not one History operation');
    if(pages[0].position.y!==pages[1].position.y||pages[1].position.x<=pages[0].position.x+390)throw Error('Not side by side');
    for(const screen of pages){
      const e=screen.metadata.creationEvidence,d=screen.metadata.multiPageDelivery;
      if(e.render.status!=='complete'||e.workflow.status!=='ready'||e.contract.multiPage.kind!=='variants'||e.contract.referencePageId!=='old'||d.kind!=='variants'||d.pages.length!==2||d.originalPageCount!==3||d.planning.contract.workflowId!=='plan-page-variants')throw Error('Missing variant gate/source evidence');
      if(new DOMParser().parseFromString(screen.htmlContent,'text/html').querySelector('[data-target-screen-id]'))throw Error('Invented variant link');
    }
    if(f.streams.some(r=>!r.messages.some(m=>m.content.includes('姓名：测试用户'))))throw Error('Missing same original page input');
    if(!f.streams[0].messages.some(m=>m.content.includes('强调姓名与保存按钮')))throw Error('Missing user-edited difference');
    const persistent=items=>items.map(({measuredHeight,...screen})=>screen),snapshot=JSON.stringify(persistent(pages));
    window.__history.getState().undo();if(window.__projectStore.getState().screenOrder.length!==1)throw Error('Partial undo');
    window.__history.getState().redo();if(JSON.stringify(persistent(pages.map(p=>window.__projectStore.getState().screens[p.id])))!==snapshot)throw Error('Incomplete redo');
    const {readProject}=await window.__module('/src/utils/projectRegistry.ts');window.__projectStore.getState().loadProject(readProject(s.id));
    if(JSON.stringify(persistent(pages.map(p=>window.__projectStore.getState().screens[p.id])))!==snapshot)throw Error('Reopen lost evidence');
    window.__projectStore.getState().setViewportTransform({x:50,y:80,scale:0.7});
    return {screenIds:pages.map(p=>p.id),positions:pages.map(p=>p.position),historyDelta:1,delivery:pages[0].metadata.multiPageDelivery,evidence:pages.map(p=>p.metadata.creationEvidence)};
   }''',fixture)
   await page.frame_locator('iframe[title="重点方案"]').get_by_role('button',name='保存资料',exact=True).wait_for()
   await page.screenshot(path=str(args.screenshot))
   outcomes={}
   for mode in ['cancel','fail']:
    fixture=await page.evaluate('window.__resetVariants()');card=await send()
    await page.evaluate('(mode)=>{window.__variants[mode==="cancel"?"hold":"fail"]=2}',mode)
    await card.get_by_role('button',name='确认计划并生成 3 个方案',exact=True).click()
    if mode=='cancel':
     await page.wait_for_function('Boolean(window.__variants.release)')
     assert '已验收，等待统一加入' in await card.inner_text()
     await card.get_by_role('button',name='取消方案任务',exact=True).click()
     await page.evaluate('window.__variants.release()');await page.wait_for_function('window.__variants.done===2')
    else:await card.get_by_text('本批次未加入方案。',exact=False).wait_for(timeout=30000)
    await page.wait_for_function('!document.querySelector("textarea[placeholder^=输入设计诉求]").disabled')
    outcomes[mode]=await page.evaluate('''fixture=>{const s=window.__projectStore.getState();if(s.screenOrder.length!==1||s.screens.old.htmlContent!==fixture.original||window.__history.getState().past.length!==fixture.history)throw Error('Failed/cancelled batch left pages');return {pages:1,requests:window.__variants.streams.length,historyDelta:0};}''',fixture)
   await page.evaluate('window.__resetVariants()');card=await send()
   await page.evaluate('window.__projectStore.getState().addDecision("新要求","global")')
   assert await card.get_by_role('button',name='确认计划并生成 3 个方案',exact=True).is_disabled()
   assert await page.evaluate('window.__variants.streams.length')==0
   assert not errors,errors
   report={'status':'passed','browser':args.browser,'version':browser.version,'model':'Local deterministic core responses; no online provider','render':'Real independent iframe checks; static designs only; differences/common semantic correctness require user review','success':success,'outcomes':outcomes,'stalePlanBlocked':True,'pageErrors':errors}
   args.report.parent.mkdir(parents=True,exist_ok=True);args.report.write_text(json.dumps(report,ensure_ascii=False,indent=2))
   print(json.dumps({'status':'passed','browser':args.browser,'variants':2,'outcomes':outcomes},ensure_ascii=False))
  except Exception:
   await page.screenshot(path=str(args.screenshot.with_stem(args.screenshot.stem+'-failure')))
   print(json.dumps({'pageErrors':errors,'text':(await page.locator('body').inner_text())[-5000:]},ensure_ascii=False));raise
  finally:await browser.close()
if __name__=='__main__':
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--url',default='http://127.0.0.1:5174');parser.add_argument('--browser',choices=['chromium','webkit'],default='chromium');parser.add_argument('--screenshot',type=Path,default=Path('/tmp/page-variants.png'));parser.add_argument('--report',type=Path,default=Path('/tmp/page-variants.json'));asyncio.run(main(parser.parse_args()))
