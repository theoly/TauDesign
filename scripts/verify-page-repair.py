#!/usr/bin/env python3
"""Verify one bounded style repair via real chat, actual iframe reports, token totals and persisted proof."""
import argparse
import asyncio
import json
from pathlib import Path
from playwright.async_api import async_playwright


async def main(args):
    async with async_playwright() as p:
        browser=await getattr(p,args.browser).launch(headless=True)
        page=await browser.new_page(viewport={'width':1600,'height':1050},locale='zh-CN')
        errors=[]
        page.on('pageerror',lambda error:errors.append(str(error)))
        args.screenshot.parent.mkdir(parents=True,exist_ok=True)
        try:
            await page.goto(args.url,wait_until='networkidle')
            await page.wait_for_function('Boolean(window.__projectStore)')
            await page.evaluate('''async()=>{
              window.__module=async path=>import(performance.getEntriesByType('resource').map(e=>e.name).find(url=>new URL(url).pathname===path)||path);
              const {useAIConfigStore,defaultProviders,defaultBindings}=await window.__module('/src/stores/useAIConfigStore.ts');
              const {DefaultAIEngineCore}=await window.__module('/src/services/ai/engine/core/index.ts');
              const {PageRenderCheck}=await window.__module('/src/services/ai/pageRenderCheck.ts');
              const {contentFingerprint}=await window.__module('/src/services/ai/designWorkflow.ts');
              useAIConfigStore.setState({providers:defaultProviders.map(p=>({...p,apiKey:'local-fixture-secret'})),bindings:defaultBindings});
              const actual=PageRenderCheck.inspect;
              PageRenderCheck.inspect=async function(request,...args){const result=await actual.call(this,request,...args);window.__repair.checks.push({html:request.screen.htmlContent,fingerprint:contentFingerprint(request.screen.htmlContent),report:result});return result;};
              DefaultAIEngineCore.prototype.streamText=function(options){
                const f=window.__repair,repair=Boolean(options.jsonSchema);
                f.requests.push({repair,maxTokens:options.maxTokens,pages:window.__projectStore.getState().screenOrder.length});
                const text=repair?JSON.stringify({operations:[{nid:'save',type:f.invalid?'set_text':'remove_styles',value:f.invalid?'替换按钮':'font-size'}]}):'<artifact identifier="screen_new" type="screen" title="会员资料"><main data-nid="root" class="col gap-4 p-4"><h1 data-nid="title" class="text-xl font-bold">会员资料</h1><p data-nid="description" class="text-secondary">编辑后保存资料</p><button data-nid="save" class="btn btn-primary" style="font-size:0px"><svg data-nid="icon" class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path data-nid="path" d="M5 12l4 4L19 6"/></svg><span data-nid="label">保存资料</span></button></main></artifact>';
                const ready=repair&&f.hold?new Promise(resolve=>f.release=resolve):Promise.resolve();
                return {textStream:(async function*(){await ready;yield text;})(),reasoningStream:(async function*(){})(),textPromise:ready.then(()=>{f.done++;return text;}),reasoningPromise:Promise.resolve(undefined),usagePromise:Promise.resolve(repair?{inputTokens:123,outputTokens:45}:{inputTokens:100,outputTokens:200}),finishReasonPromise:Promise.resolve('stop'),abort(){}};
              };
              window.__resetRepair=async()=>{
                const {neutralModernTheme}=await window.__module('/src/utils/themePresets.ts');
                const {useWorkspaceStore}=await window.__module('/src/stores/useWorkspaceStore.ts');
                const {useHistoryStore}=await window.__module('/src/stores/useHistoryStore.ts');
                const s=window.__projectStore,id=s.getState().initNewProject({name:'受控修复验证',deviceProfile:'mobile',designSystem:neutralModernTheme,createSpecimen:false});
                s.getState().addScreen({name:'保留原页',htmlContent:'<main data-nid="old" class="p-4">保留原页内容</main>'},'old');
                window.__repair={requests:[],checks:[],hold:true,invalid:false,done:0};
                useWorkspaceStore.setState({view:'workspace',activeProjectId:id});return {id,history:useHistoryStore.getState().past.length};
              };
            }''')
            async def send():
                await page.locator('textarea[placeholder^="输入设计诉求"]').fill('新建一个会员资料页面')
                await page.get_by_title('发送设计诉求 (Enter)',exact=True).click()
                await page.wait_for_function('Boolean(window.__repair.release)')

            fixture=await page.evaluate('window.__resetRepair()')
            await send()
            await page.get_by_text('检查发现控件渲染问题，正在尝试一次受控样式修复…',exact=True).wait_for()
            assert await page.evaluate('window.__projectStore.getState().screenOrder')==['old']
            await page.screenshot(path=str(args.screenshot.with_stem(args.screenshot.stem+'-repairing')))
            await page.evaluate('window.__repair.release()')
            await page.wait_for_function('Object.values(window.__projectStore.getState().screens).some(s=>s.metadata?.creationEvidence?.repair?.status==="repaired")')
            await page.get_by_text('已完成一次控件样式修复',exact=False).wait_for()
            assert await page.get_by_text('468 tokens',exact=True).count()==1
            success=await page.evaluate('''async fixture=>{
              const s=window.__projectStore.getState(),f=window.__repair,screen=Object.values(s.screens).find(p=>p.id!=='old');
              const {useHistoryStore}=await window.__module('/src/stores/useHistoryStore.ts');
              const {contentFingerprint}=await window.__module('/src/services/ai/designWorkflow.ts');
              const e=screen.metadata.creationEvidence;
              if(f.requests.length!==2||f.requests[0].repair||!f.requests[1].repair||f.requests[1].maxTokens!==1800||f.requests.some(r=>r.pages!==1))throw Error('Repair was not bounded before commit');
              if(f.checks.length!==2||f.checks[0].report.status!=='complete'||!f.checks[0].report.findings.some(f=>f.code==='render_action_invisible_label'&&f.severity==='error')||f.checks[1].report.findings.some(f=>f.severity==='error'))throw Error('No actual before/after render evidence');
              const before=new DOMParser().parseFromString(f.checks[0].html,'text/html'),after=new DOMParser().parseFromString(screen.htmlContent,'text/html');
              for(const nid of ['title','description','icon','path','label'])if(!before.querySelector('[data-nid="'+nid+'"]').isEqualNode(after.querySelector('[data-nid="'+nid+'"]')))throw Error('Unauthorized node changed '+nid);
              if(e.repair.afterHtmlFingerprint!==contentFingerprint(screen.htmlContent)||e.repair.usage.inputTokens!==123||e.repair.usage.outputTokens!==45||JSON.stringify(e).includes('local-fixture-secret'))throw Error('Wrong repair proof');
              if(useHistoryStore.getState().past.length!==fixture.history+1)throw Error('Repair caused extra History');
              const turns=await s.getConversationStore().loadRecent(1);
              if(turns[0].assistant.text.includes('font-size:0')||!turns[0].assistant.text.includes(screen.htmlContent))throw Error('Conversation restored old broken HTML');
              useHistoryStore.getState().undo();if(window.__projectStore.getState().screenOrder.length!==1)throw Error('Undo failed');
              useHistoryStore.getState().redo();if(window.__projectStore.getState().screens[screen.id].metadata.creationEvidence.repair.status!=='repaired')throw Error('Redo lost proof');
              const {readProject}=await window.__module('/src/utils/projectRegistry.ts');s.loadProject(readProject(s.id));
              if(JSON.stringify(window.__projectStore.getState().screens[screen.id].metadata.creationEvidence.repair)!==JSON.stringify(e.repair))throw Error('Save/reopen lost repair proof');
              window.__projectStore.getState().setActiveScreen(screen.id);return {projectId:s.id,screenId:screen.id,evidence:e,checks:f.checks,requests:f.requests,historyDelta:1};
            }''',fixture)
            await page.frame_locator('iframe[title="会员资料"]').get_by_role('button',name='保存资料',exact=True).wait_for()
            properties=page.get_by_role('button',name='元素属性',exact=True)
            if await properties.get_attribute('aria-pressed')!='true':await properties.click()
            summary=page.get_by_text('页面创建验收记录',exact=True)
            if await summary.locator('..').get_attribute('open') is None:await summary.click()
            repair_summary=page.get_by_text('受控样式修复 1 次（已完整复验）',exact=True)
            if await repair_summary.locator('..').get_attribute('open') is None:await repair_summary.click()
            await repair_summary.scroll_into_view_if_needed()
            await page.screenshot(path=str(args.screenshot))

            failed_fixture=await page.evaluate('window.__resetRepair()')
            await page.evaluate('window.__repair.invalid=true')
            await send();await page.evaluate('window.__repair.release()')
            await page.get_by_text('本次结果未应用：已尝试一次受控修复',exact=False).wait_for()
            failed=await page.evaluate('''async fixture=>{const s=window.__projectStore.getState(),{useHistoryStore}=await window.__module('/src/stores/useHistoryStore.ts');if(s.screenOrder.length!==1||useHistoryStore.getState().past.length!==fixture.history||window.__repair.requests.length!==2)throw Error('Invalid repair partially applied/retried');return {requests:window.__repair.requests,checks:window.__repair.checks,historyDelta:0,pages:1};}''',failed_fixture)
            await page.screenshot(path=str(args.screenshot.with_stem(args.screenshot.stem+'-blocked')))

            cancelled_fixture=await page.evaluate('window.__resetRepair()')
            await send()
            await page.evaluate('''()=>{window.__projectStore.getState().addDecision('修复期间新的项目要求','global');window.__repair.release();}''')
            await page.get_by_text('本次结果未应用：已尝试一次受控修复',exact=False).wait_for()
            stale=await page.evaluate('''async fixture=>{const s=window.__projectStore.getState(),{useHistoryStore}=await window.__module('/src/stores/useHistoryStore.ts');if(s.screenOrder.length!==1||useHistoryStore.getState().past.length!==fixture.history+1||window.__repair.checks.length!==1)throw Error('Stale repair applied or revalidated');return {requests:window.__repair.requests.length,renderChecks:window.__repair.checks.length,pages:1,onlyUserDecisionHistory:true};}''',cancelled_fixture)
            await page.reload(wait_until='networkidle')
            await page.wait_for_function('Boolean(window.__projectStore)')
            await page.evaluate('''async success=>{
              const module=async path=>import(performance.getEntriesByType('resource').map(e=>e.name).find(url=>new URL(url).pathname===path)||path);
              const {useWorkspaceStore}=await module('/src/stores/useWorkspaceStore.ts');
              if(!useWorkspaceStore.getState().openProject(success.projectId))throw Error('Cannot reopen repaired project');
              window.__projectStore.getState().setActiveScreen(success.screenId);
            }''',success)
            await page.get_by_text('此轮曾完成一次控件样式修复；历史结果不代表当前页面已复验。',exact=True).wait_for()
            await page.frame_locator('iframe[title="会员资料"]').get_by_role('button',name='保存资料',exact=True).wait_for()
            await page.screenshot(path=str(args.screenshot.with_stem(args.screenshot.stem+'-reopened')))
            assert not errors,errors
            report={'status':'passed','browser':args.browser,'version':browser.version,'model':'controlled local model streams; real iframe checks, no online Provider calls','success':success,'failed':failed,'stale':stale,'reopenedHistoricalNotice':True,'pageErrors':errors}
            args.report.parent.mkdir(parents=True,exist_ok=True);args.report.write_text(json.dumps(report,ensure_ascii=False,indent=2))
            print(json.dumps({'status':'passed','browser':args.browser,'successRenderChecks':len(success['checks']),'requests':len(success['requests']),'failedPages':failed['pages'],'stale':stale,'pageErrors':errors},ensure_ascii=False))
        except Exception:
            await page.screenshot(path=str(args.screenshot.with_stem(args.screenshot.stem+'-failure')))
            print(json.dumps({'pageErrors':errors,'text':(await page.locator('body').inner_text())[-4500:]},ensure_ascii=False));raise
        finally:await browser.close()


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url',default='http://127.0.0.1:5174')
    parser.add_argument('--browser',choices=['chromium','webkit'],default='chromium')
    parser.add_argument('--screenshot',type=Path,default=Path('/tmp/page-repair.png'))
    parser.add_argument('--report',type=Path,default=Path('/tmp/page-repair.json'))
    asyncio.run(main(parser.parse_args()))
