#!/usr/bin/env python3
"""Verify source-specific creation via actual chat/file upload with controlled model output and real iframe gates."""
import argparse
import asyncio
import base64
import json
from pathlib import Path
from playwright.async_api import async_playwright

PNG='iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAGUlEQVR4nGP4z8DwnxLMMGrAqAGjBgwXAwAwxP4QHCfkAAAAAABJRU5ErkJggg=='
async def main(args):
    async with async_playwright() as p:
        browser=await getattr(p,args.browser).launch(headless=True)
        page=await browser.new_page(viewport={'width':1600,'height':1000},locale='zh-CN')
        errors=[]
        page.on('pageerror',lambda error:errors.append(str(error)))
        try:
            await page.goto(args.url,wait_until='networkidle')
            await page.wait_for_function('Boolean(window.__projectStore)')
            await page.evaluate('''async()=>{
              const module=async path=>import(performance.getEntriesByType('resource').map(e=>e.name).find(url=>new URL(url).pathname===path)||path);
              const {useAIConfigStore,defaultProviders,defaultBindings}=await module('/src/stores/useAIConfigStore.ts');
              const {DefaultAIEngineCore}=await module('/src/services/ai/engine/core/index.ts');
              const {contentFingerprint}=await module('/src/services/ai/designWorkflow.ts');
              useAIConfigStore.setState({providers:defaultProviders.map(p=>({...p,apiKey:'controlled-local-fixture'})),bindings:defaultBindings});
              window.__sourcesFixture={requests:[],hold:false,done:0};
              DefaultAIEngineCore.prototype.generateObject=async()=>{throw Error('Unexpected model analysis');};
              DefaultAIEngineCore.prototype.streamText=function(options){
                const f=window.__sourcesFixture,s=window.__projectStore.getState(),last=options.messages.at(-1);
                const system=options.messages.find(m=>m.role==='system').content;
                const route=(system.match(/workflow=([^;]+)/)||[])[1];
                f.requests.push({route,hasCurrentImage:Boolean(last.imageUrl),imageFingerprint:last.imageUrl?contentFingerprint(last.imageUrl):null,
                  userMessageFingerprint:contentFingerprint(last.content),hasProjectPriority:last.content.includes('SOURCE PRIORITY'),historyImageCount:options.messages.slice(0,-1).filter(m=>m.imageUrl).length});
                const component=s.designLibraryBinding?'<article data-component-id="lib-source-card" data-component-version="3" class="card p-4"><h2 class="text-lg font-bold">资料卡片</h2><p class="text-muted">使用项目组件</p></article>':'<section class="card p-4"><h2 class="text-lg font-bold">资料卡片</h2><p class="text-muted">独立页面</p></section>';
                const answer='<artifact identifier="screen_new" type="screen" title="来源工作流资料页"><main class="col gap-4 p-4"><h1 class="text-xl font-bold">会员资料</h1>'+component+'<button class="btn btn-primary">保存资料</button></main></artifact>';
                const ready=f.hold?new Promise(resolve=>f.release=resolve):Promise.resolve();
                return {textStream:(async function*(){await ready;yield answer;})(),reasoningStream:(async function*(){})(),textPromise:ready.then(()=>{f.done++;return answer;}),reasoningPromise:Promise.resolve(undefined),usagePromise:Promise.resolve({inputTokens:100,outputTokens:200}),finishReasonPromise:Promise.resolve('stop'),abort(){f.release?.();}};
              };
            }''')
            results=[]
            modes=[(False,False,'create-page'),(True,False,'create-page-from-reference'),(False,True,'create-page-from-library'),(True,True,'create-page-from-reference-library')]
            args.screenshot.parent.mkdir(parents=True,exist_ok=True)
            for with_image,with_library,route in modes:
                fixture=await page.evaluate('''async params=>{
                  const module=async path=>import(performance.getEntriesByType('resource').map(e=>e.name).find(url=>new URL(url).pathname===path)||path);
                  const {neutralModernTheme}=await module('/src/utils/themePresets.ts');
                  const {useWorkspaceStore}=await module('/src/stores/useWorkspaceStore.ts');
                  const store=window.__projectStore;
                  const id=store.getState().initNewProject({name:params.route,deviceProfile:'mobile',designSystem:neutralModernTheme,createSpecimen:false});
                  store.getState().addScreen({name:'保留原页',htmlContent:'<main data-nid="keep" class="p-4"><h1>原页保留</h1></main>'},'old');
                  if(params.library){
                    const {LocalStorageStorage}=await module('/src/services/storage/projectStorage.ts');
                    const {readDesignLibraryCopy}=await module('/src/services/ai/designLibraryCopy.ts');
                    const source=new LocalStorageStorage('browser-source-'+crypto.randomUUID());
                    await source.writeTextAtomic('project.json',JSON.stringify({id:'source',name:'品牌设计库',settings:{deviceProfile:'mobile'},designSystem:neutralModernTheme,designSystemOrigin:{tokenVersion:3},
                      components:{card:{id:'card',name:'资料卡片',templateHtml:'<article class="card p-4"><h2 class="text-lg font-bold">资料卡片</h2><p class="text-muted">使用项目组件</p></article>',version:3,createdAt:1,updatedAt:1}}}));
                    store.getState().applyDesignLibraryCopy(await readDesignLibraryCopy(source,()=>{},'pinned_reference'));
                  }
                  useWorkspaceStore.setState({view:'workspace',activeProjectId:id});
                  return {id,before:store.getState().screens.old.htmlContent};
                }''',{'library':with_library,'route':route})
                composer=page.locator('textarea[placeholder^="输入设计诉求"]')
                await composer.wait_for()
                if with_image:
                    await page.locator('input[type="file"][accept^="image/*"]').set_input_files({'name':'reference.png','mimeType':'image/png','buffer':base64.b64decode(PNG)})
                    await page.get_by_text('reference.png',exact=True).last.wait_for()
                await composer.fill('新建一个资料页面，保留原页，按当前项目规范设计')
                await page.get_by_title('发送设计诉求 (Enter)',exact=True).click()
                await page.wait_for_function('Object.values(window.__projectStore.getState().screens).some(s=>s.id!=="old"&&s.metadata?.creationEvidence)')
                result=await page.evaluate('''params=>{
                  const s=window.__projectStore.getState(),page=Object.values(s.screens).find(p=>p.id!=='old'),e=page.metadata.creationEvidence,request=window.__sourcesFixture.requests.at(-1);
                  if(s.screens.old.htmlContent!==params.before||s.screenOrder.length!==2)throw Error('Source page was overwritten or duplicate created');
                  if(e.contract.workflowId!==params.route||e.workflow.status!=='ready'||e.render.status!=='complete')throw Error('Wrong workflow or incomplete evidence '+JSON.stringify(e));
                  if(request.hasCurrentImage!==params.image||request.route!==params.route||request.historyImageCount!==0)throw Error('Wrong actual model input');
                  if(params.image&&(e.contract.referenceImage.fingerprint!==request.imageFingerprint||e.contract.referenceImage.inputReceipt.messageFingerprint!==request.userMessageFingerprint||!request.hasProjectPriority))throw Error('Input receipt is not based on actual request');
                  if(params.library&&e.contract.librarySource.sourceProjectId!=='source')throw Error('Chat did not forward binding');
                  if(JSON.stringify(e).includes('data:image'))throw Error('Evidence embedded image payload');
                  s.setActiveScreen(page.id);return {projectId:s.id,screenId:page.id,evidence:JSON.parse(JSON.stringify(e)),request,originalUnchanged:true};
                }''',{'before':fixture['before'],'route':route,'image':with_image,'library':with_library})
                frame=page.frame_locator('iframe[title="来源工作流资料页"]')
                await frame.get_by_role('button',name='保存资料',exact=True).wait_for()
                properties=page.get_by_role('button',name='元素属性',exact=True)
                if await properties.get_attribute('aria-pressed')!='true':
                    await properties.click()
                record=page.get_by_text('页面创建验收记录',exact=True)
                await record.wait_for()
                details=record.locator('..')
                if await details.get_attribute('open') is None:
                    await record.click()
                record_text=await details.inner_text()
                if with_image:
                    assert '参考图片输入：通过' in record_text and '不代表已通过图片视觉相似度检查' in record_text,record_text
                if with_library:
                    assert '设计库绑定与组件：通过' in record_text and '固定版本只读参考' in record_text,record_text
                await details.scroll_into_view_if_needed()
                await page.screenshot(path=str(args.screenshot.with_stem(args.screenshot.stem+'-'+route)))
                results.append(result)
                # Reopening uses real saved project metadata; historical input proof stays available.
                await page.evaluate('''async result=>{
                  const module=async path=>import(performance.getEntriesByType('resource').map(e=>e.name).find(url=>new URL(url).pathname===path)||path);
                  const {readProject}=await module('/src/utils/projectRegistry.ts'),{isPageCreationEvidence}=await module('/src/services/ai/pageCreationValidation.ts');
                  const saved=readProject(result.projectId);window.__projectStore.getState().loadProject(saved);
                  const e=window.__projectStore.getState().screens[result.screenId].metadata.creationEvidence;
                  if(!isPageCreationEvidence(e)||JSON.stringify(e)!==JSON.stringify(result.evidence))throw Error('Save/reopen lost source evidence '+JSON.stringify({valid:isPageCreationEvidence(e),same:JSON.stringify(e)===JSON.stringify(result.evidence),actual:e,expected:result.evidence}));
                }''',result)
            # A library version change during a non-cooperative model response cannot create a page.
            await page.evaluate('window.__sourcesFixture.hold=true')
            await page.locator('textarea[placeholder^="输入设计诉求"]').fill('新建另一个资料页面')
            await page.get_by_title('发送设计诉求 (Enter)',exact=True).click()
            await page.wait_for_function('Boolean(window.__sourcesFixture.release)')
            await page.evaluate('''()=>{window.__projectStore.getState().detachDesignLibraryReference();window.__sourcesFixture.release();}''')
            await page.wait_for_function('window.__sourcesFixture.done===5')
            await page.wait_for_function('()=>{const input=document.querySelector("textarea[placeholder^=输入设计诉求]");return input&&!input.disabled;}')
            stale=await page.evaluate('''()=>{const s=window.__projectStore.getState();if(s.screenOrder.length!==2||s.stagedScreen)throw Error('Stale library result was applied');return {pages:s.screenOrder.length,mode:s.designLibraryBinding.mode,requests:window.__sourcesFixture.requests.length};}''')
            await page.screenshot(path=str(args.screenshot))
            assert not errors,errors
            report={'status':'passed','browser':args.browser,'version':browser.version,'model':'controlled local stream fixture; no online provider calls','render':'actual iframe gate; no screenshot similarity claim',
                    'results':results,'stale':stale,'pageErrors':errors}
            if args.report:
                args.report.parent.mkdir(parents=True,exist_ok=True);args.report.write_text(json.dumps(report,ensure_ascii=False,indent=2))
            print(json.dumps({'status':'passed','browser':args.browser,'routes':[r['evidence']['contract']['workflowId'] for r in results],'stale':stale},ensure_ascii=False))
        except Exception:
            args.screenshot.parent.mkdir(parents=True,exist_ok=True);await page.screenshot(path=str(args.screenshot.with_stem(args.screenshot.stem+'-failure')))
            print(json.dumps({'pageErrors':errors,'text':(await page.locator('body').inner_text())[-4500:]},ensure_ascii=False));raise
        finally:
            await browser.close()

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url',default='http://127.0.0.1:5174');parser.add_argument('--browser',choices=['chromium','webkit'],default='chromium')
    parser.add_argument('--screenshot',type=Path,default=Path('/tmp/workflow-sources.png'));parser.add_argument('--report',type=Path)
    asyncio.run(main(parser.parse_args()))
