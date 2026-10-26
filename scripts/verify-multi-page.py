#!/usr/bin/env python3
"""Exercise multi-page chat planning and atomic delivery with controlled model output and real iframe gates."""
import argparse
import asyncio
import json
from pathlib import Path
from playwright.async_api import async_playwright


async def main(args):
    async with async_playwright() as p:
        browser = await getattr(p, args.browser).launch(headless=True)
        page = await browser.new_page(viewport={'width': 1600, 'height': 1050}, locale='zh-CN')
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        args.screenshot.parent.mkdir(parents=True, exist_ok=True)
        try:
            await page.goto(args.url, wait_until='networkidle')
            await page.wait_for_function('Boolean(window.__projectStore)')
            await page.evaluate('''async()=>{
              window.__module=async path=>import(performance.getEntriesByType('resource').map(e=>e.name).find(url=>new URL(url).pathname===path)||path);
              const {useAIConfigStore,defaultProviders,defaultBindings}=await window.__module('/src/stores/useAIConfigStore.ts');
              const {DefaultAIEngineCore}=await window.__module('/src/services/ai/engine/core/index.ts');
              useAIConfigStore.setState({providers:defaultProviders.map(p=>({...p,apiKey:'controlled-local-fixture'})),bindings:defaultBindings});
              window.__multi={plans:0,streams:[],holdIndex:0,failIndex:0,done:0};
              DefaultAIEngineCore.prototype.generateObject=async()=>{
                window.__multi.plans++;
                return {summary:'会员三页静态设计，保留已有页面',pages:[
                  {name:'会员首页',requirements:['会员信息与清晰主按钮'],links:['会员列表']},
                  {name:'会员列表',requirements:['会员列表与详情入口'],links:['会员详情']},
                  {name:'会员详情',requirements:['资料卡片和保存按钮'],links:[]}]};
              };
              DefaultAIEngineCore.prototype.streamText=function(options){
                const f=window.__multi,scope=JSON.parse(options.messages.find(m=>m.role==='system').content.match(/confirmedMultiPageScope=(.*); output exactly this page/)[1]);
                const index=f.streams.length+1;
                f.streams.push({scope,pagesAtRequest:window.__projectStore.getState().screenOrder.length,request:options.messages.at(-1).content});
                const links=scope.requiredTargetIds.map((id,i)=>'<button class="btn" data-target-screen-id="'+id+'">查看关联 '+(i+1)+'</button>').join('');
                const answer=f.failIndex===index?'模型未返回有效页面':'<artifact identifier="screen_new" type="screen" title="'+scope.name+'"><main class="col gap-4 p-4"><h1 class="text-xl font-bold">'+scope.name+'</h1><section class="card p-4"><h2 class="text-lg font-bold">会员资料</h2><p class="text-muted">当前页面静态设计</p></section><button class="btn btn-primary">保存资料</button>'+links+'</main></artifact>';
                const ready=f.holdIndex===index?new Promise(resolve=>f.release=resolve):Promise.resolve();
                return {textStream:(async function*(){await ready;yield answer;})(),reasoningStream:(async function*(){})(),textPromise:ready.then(()=>{f.done++;return answer;}),reasoningPromise:Promise.resolve(undefined),usagePromise:Promise.resolve({inputTokens:100,outputTokens:200}),finishReasonPromise:Promise.resolve('stop'),abort(){}};
              };
              window.__resetMulti=async()=>{
                const {neutralModernTheme}=await window.__module('/src/utils/themePresets.ts');
                const {useWorkspaceStore}=await window.__module('/src/stores/useWorkspaceStore.ts');
                const s=window.__projectStore;
                const id=s.getState().initNewProject({name:'多页面验证',deviceProfile:'mobile',designSystem:neutralModernTheme,createSpecimen:false});
                s.getState().addScreen({name:'保留原页',htmlContent:'<main data-nid="keep" class="p-4"><h1>保留原页</h1></main>'},'old');
                useWorkspaceStore.setState({view:'workspace',activeProjectId:id});
                window.__multi={plans:0,streams:[],holdIndex:0,failIndex:0,done:0};
                const {useHistoryStore}=await window.__module('/src/stores/useHistoryStore.ts');
                return {id,history:useHistoryStore.getState().past.length,original:s.getState().screens.old.htmlContent};
              };
            }''')

            async def send():
                await page.locator('textarea[placeholder^="输入设计诉求"]').fill('新建会员首页、会员列表、会员详情三个页面，保留已有页面')
                await page.get_by_title('发送设计诉求 (Enter)', exact=True).click()
                await page.locator('[data-testid="multi-page-plan"]').last.get_by_role('button', name='确认计划并生成 3 页', exact=True).wait_for()

            fixture = await page.evaluate('window.__resetMulti()')
            await send()
            assert await page.evaluate('window.__multi.streams.length') == 0
            assert await page.evaluate('window.__projectStore.getState().screenOrder') == ['old']
            card = page.locator('[data-testid="multi-page-plan"]').last
            await card.get_by_label('第1页名称', exact=True).fill('会员工作台')
            await card.get_by_label('第1页要求', exact=True).fill('展示会员概况，提供清晰的查看列表入口')
            await card.locator('details').nth(2).locator('summary').click()
            await card.get_by_role('button', name='移除此页：会员详情', exact=True).click()
            await card.locator('details').nth(1).locator('summary').click()
            await card.get_by_label('会员列表 → 会员工作台', exact=True).check()
            await card.get_by_role('button', name='确认计划并生成 2 页', exact=True).click()
            await card.get_by_text('已按确认计划新增 2 页', exact=False).wait_for(timeout=30000)
            success = await page.evaluate('''async fixture=>{
              const s=window.__projectStore.getState(),f=window.__multi;
              const {useHistoryStore}=await window.__module('/src/stores/useHistoryStore.ts');
              const pages=s.screenOrder.filter(id=>id!=='old').map(id=>s.screens[id]);
              if(f.streams.length!==2||f.streams.some(r=>r.pagesAtRequest!==1)||s.screenOrder.length!==3||s.screens.old.htmlContent!==fixture.original)throw Error('Non-atomic delivery or source changed');
              if(useHistoryStore.getState().past.length!==fixture.history+1)throw Error('Batch did not use one History entry');
              for(const screen of pages){
                const evidence=screen.metadata.creationEvidence,delivery=screen.metadata.multiPageDelivery;
                if(evidence.render.status!=='complete'||evidence.workflow.status!=='ready'||!evidence.workflow.checks.some(c=>c.id==='multi-page-scope'&&c.status==='passed'))throw Error('Missing actual gate evidence');
                if(delivery.originalPageCount!==3||delivery.pages.length!==2||delivery.planning.evidence.status!=='ready')throw Error('Missing confirmed scope/planning proof');
                if(!screen.htmlContent.includes('data-target-screen-id="'+pages.find(p=>p.id!==screen.id).id+'"'))throw Error('Static links do not resolve to planned pages');
              }
              if(!f.streams[0].request.includes('展示会员概况'))throw Error('User edits did not reach model');
              // Canvas measurement is recalculated asynchronously after remount; compare all persistent design fields.
              const designPages=items=>items.map(({measuredHeight,...screen})=>screen);
              const snapshot=JSON.stringify(designPages(pages));
              useHistoryStore.getState().undo();
              if(JSON.stringify(window.__projectStore.getState().screenOrder)!=='["old"]'||Object.keys(window.__projectStore.getState().screens).length!==1)throw Error('Undo left partial batch');
              useHistoryStore.getState().redo();
              if(JSON.stringify(designPages(pages.map(p=>window.__projectStore.getState().screens[p.id])))!==snapshot)throw Error('Redo lost batch metadata');
              const {readProject}=await window.__module('/src/utils/projectRegistry.ts');
              const saved=readProject(s.id);window.__projectStore.getState().loadProject(saved);
              if(JSON.stringify(designPages(pages.map(p=>window.__projectStore.getState().screens[p.id])))!==snapshot)throw Error('Reopen lost batch metadata');
              window.__projectStore.getState().setActiveScreen(pages[0].id);
              return {projectId:s.id,screenIds:pages.map(p=>p.id),names:pages.map(p=>p.name),historyDelta:1,streams:f.streams.map(r=>({scope:r.scope,pagesAtRequest:r.pagesAtRequest})),evidence:pages.map(p=>p.metadata.creationEvidence),delivery:pages[0].metadata.multiPageDelivery};
            }''', fixture)
            await page.frame_locator('iframe[title="会员工作台"]').get_by_role('button', name='保存资料', exact=True).wait_for()
            properties = page.get_by_role('button', name='元素属性', exact=True)
            if await properties.get_attribute('aria-pressed') != 'true':
                await properties.click()
            record = page.get_by_text('页面创建验收记录', exact=True)
            await record.wait_for()
            if await record.locator('..').get_attribute('open') is None:
                await record.click()
            plan = page.get_by_text('多页面确认计划', exact=True)
            if await plan.locator('..').get_attribute('open') is None:
                await plan.click()
            assert '原计划 3 页' in await plan.locator('..').inner_text()
            await plan.scroll_into_view_if_needed()
            await page.screenshot(path=str(args.screenshot))

            # The second non-cooperative response is cancelled after page one passed the real gate.
            cancel_fixture = await page.evaluate('window.__resetMulti()')
            await send()
            await page.evaluate('window.__multi.holdIndex=2')
            card = page.locator('[data-testid="multi-page-plan"]').last
            await card.get_by_role('button', name='确认计划并生成 3 页', exact=True).click()
            await page.wait_for_function('Boolean(window.__multi.release)')
            assert '已验收，等待统一加入' in await card.inner_text()
            assert await page.evaluate('window.__projectStore.getState().screenOrder') == ['old']
            await card.get_by_role('button', name='取消多页面任务', exact=True).click()
            await page.evaluate('window.__multi.release()')
            await page.wait_for_function('window.__multi.done===2')
            await page.wait_for_function('!document.querySelector("textarea[placeholder^=输入设计诉求]").disabled')
            cancelled = await page.evaluate('''async fixture=>{
              const s=window.__projectStore.getState(),{useHistoryStore}=await window.__module('/src/stores/useHistoryStore.ts');
              if(s.screenOrder.length!==1||s.screens.old.htmlContent!==fixture.original||useHistoryStore.getState().past.length!==fixture.history)throw Error('Cancelled batch left partial screens/history');
              return {pages:s.screenOrder.length,requests:window.__multi.streams.length,historyDelta:0};
            }''', cancel_fixture)
            await page.screenshot(path=str(args.screenshot.with_stem(args.screenshot.stem+'-cancelled')))

            # A rejected second output also cannot deliver page one.
            failed_fixture = await page.evaluate('window.__resetMulti()')
            await send()
            await page.evaluate('window.__multi.failIndex=2')
            card = page.locator('[data-testid="multi-page-plan"]').last
            await card.get_by_role('button', name='确认计划并生成 3 页', exact=True).click()
            await card.get_by_text('本批次未加入页面。', exact=False).wait_for(timeout=30000)
            failed = await page.evaluate('''async fixture=>{
              const s=window.__projectStore.getState(),{useHistoryStore}=await window.__module('/src/stores/useHistoryStore.ts');
              if(s.screenOrder.length!==1||s.screens.old.htmlContent!==fixture.original||useHistoryStore.getState().past.length!==fixture.history)throw Error('Failed batch left partial screens/history');
              return {pages:s.screenOrder.length,requests:window.__multi.streams.length,historyDelta:0};
            }''', failed_fixture)
            assert '已验收，等待统一加入' in await card.inner_text()
            assert '未通过' in await card.inner_text()
            await page.screenshot(path=str(args.screenshot.with_stem(args.screenshot.stem+'-blocked')))

            # A changed project invalidates the visible plan before any HTML request.
            await page.evaluate('window.__resetMulti()')
            await send()
            await page.evaluate("window.__projectStore.getState().addDecision('新的项目要求','global')")
            card = page.locator('[data-testid="multi-page-plan"]').last
            await card.get_by_role('alert').get_by_text('工程或设计上下文已变化', exact=False).wait_for()
            assert await card.get_by_role('button', name='确认计划并生成 3 页', exact=True).is_disabled()
            assert await page.evaluate('window.__multi.streams.length') == 0
            assert not errors, errors
            report = {'status':'passed','browser':args.browser,'version':browser.version,
                      'model':'controlled local model responses; no online provider calls',
                      'render':'real iframe gates; no runtime business behavior or screenshot similarity claim',
                      'success':success,'cancelled':cancelled,'failed':failed,'stalePlanBlocked':True,'pageErrors':errors}
            args.report.parent.mkdir(parents=True, exist_ok=True)
            args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2))
            print(json.dumps({'status':'passed','browser':args.browser,'pages':success['names'],'cancelled':cancelled,'failed':failed,'stalePlanBlocked':True}, ensure_ascii=False))
        except Exception:
            await page.screenshot(path=str(args.screenshot.with_stem(args.screenshot.stem+'-failure')))
            print(json.dumps({'pageErrors':errors,'text':(await page.locator('body').inner_text())[-5000:]}, ensure_ascii=False))
            raise
        finally:
            await browser.close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url', default='http://127.0.0.1:5174')
    parser.add_argument('--browser', choices=['chromium','webkit'], default='chromium')
    parser.add_argument('--screenshot', type=Path, default=Path('/tmp/multi-page.png'))
    parser.add_argument('--report', type=Path, default=Path('/tmp/multi-page.json'))
    asyncio.run(main(parser.parse_args()))
