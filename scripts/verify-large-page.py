#!/usr/bin/env python3
"""Deterministic large-page recovery UI; real pipeline/iframe/History, synthetic model chunks."""
import argparse
import asyncio
import importlib.util
import json
from pathlib import Path
from playwright.async_api import async_playwright

spec = importlib.util.spec_from_file_location('pc_tasks', Path(__file__).with_name('verify-pc-workflow.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
async def evaluate(page, expression, arg=None):
    fn = expression if expression.lstrip().startswith('async ') else '()=>(' + expression + ')'
    return await module.evaluate_task(page, fn, arg)

async def main(args):
    args.report.parent.mkdir(parents=True, exist_ok=True)
    results = []
    async with async_playwright() as p:
        browser = await getattr(p, args.browser).launch(headless=True)
        try:
            for mode in ['auto', 'manual', 'stale', 'split']:
                context = await browser.new_context(viewport={'width': 1600, 'height': 1000}, locale='zh-CN')
                page = await context.new_page()
                errors = []
                page.on('pageerror', lambda error: errors.append(str(error)))
                await page.goto(args.url, wait_until='networkidle')
                await page.wait_for_function('Boolean(window.__projectStore)')
                fixture = await evaluate(page, '''async mode=>{
                  window.__module=async path=>import(performance.getEntriesByType('resource').map(e=>e.name).find(url=>new URL(url).pathname===path)||path);
                  const {useAIConfigStore,defaultProviders,defaultBindings}=await __module('/src/stores/useAIConfigStore.ts');
                  const {DefaultAIEngineCore}=await __module('/src/services/ai/engine/core/index.ts');
                  const {useWorkspaceStore}=await __module('/src/stores/useWorkspaceStore.ts');
                  const {useHistoryStore}=await __module('/src/stores/useHistoryStore.ts');
                  const {neutralModernTheme}=await __module('/src/utils/themePresets.ts');
                  useAIConfigStore.setState({providers:defaultProviders.map(p=>({...p,apiKey:'local-fixture-only'})),bindings:defaultBindings});
                  window.__large={calls:[],plans:0};
                  DefaultAIEngineCore.prototype.generateObject=async()=>{__large.plans++;return {summary:'主页拆分为两个业务页面',pages:[{name:'发现首页',requirements:['展示推荐会员'],links:['会员资料']},{name:'会员资料',requirements:['展示个人资料'],links:[]}]};};
                  DefaultAIEngineCore.prototype.streamText=function(o){
                    const f=window.__large,n=f.calls.length+1,scopeText=o.messages.find(m=>m.role==='system')?.content.match(/confirmedMultiPageScope=(.*); output exactly this page/)?.[1];
                    const marker=o.messages.at(-1)?.content.match(/TAUDESIGN_CONTINUE_[\\w-]+/)?.[0];
                    f.calls.push({partial:o.messages.some(m=>m.partial),prefix:o.messages.at(-2)?.role==='assistant'?o.messages.at(-2).content:undefined});
                    let fragment,reason='stop';
                    if(scopeText){const s=JSON.parse(scopeText);fragment='<artifact type="screen" title="'+s.name+'"><main class="container-max col gap-4 p-4"><h1 class="text-xl">'+s.name+'</h1><button class="btn btn-primary">查看会员</button>'+s.requiredTargetIds.map(id=>'<button class="btn" data-target-screen-id="'+id+'">查看关联</button>').join('')+'</main></artifact>';}
                    else if(n===1){fragment='<artifact type="screen" title="爱情魔方"><main class="container-max col gap-4 p-4"><h1 class="text-xl font-bold">爱情魔方</h1>';reason='length';}
                    else if(mode!=='auto'&&n<4){fragment='<section class="card p-4"><h2 class="text-lg">会员推荐</h2><p>认真交友，发现合适的人</p></section>';reason='length';}
                    else fragment='<button class="btn btn-primary">开始匹配</button></main></artifact>';
                    const text=(marker?marker+'\\n':'')+fragment;
                    return {textStream:(async function*(){yield text;})(),reasoningStream:(async function*(){})(),textPromise:Promise.resolve(text),reasoningPromise:Promise.resolve(undefined),usagePromise:Promise.resolve({inputTokens:100,outputTokens:200}),finishReasonPromise:Promise.resolve(reason),abort(){}};
                  };
                  const store=window.__projectStore,id=store.getState().initNewProject({name:'长页面 '+mode,deviceProfile:'pc',designSystem:neutralModernTheme,createSpecimen:false});
                  store.getState().addScreen({name:'保留原页',htmlContent:'<main class="container-max p-4"><h1>原页</h1></main>'},'old');
                  useWorkspaceStore.setState({view:'workspace',activeProjectId:id});
                  return {id,original:store.getState().screens.old.htmlContent,history:useHistoryStore.getState().past.length};
                }''', mode)
                await page.locator('textarea[placeholder^="输入设计诉求"]').fill('为爱情魔方设计一个简单大气的主页')
                await page.get_by_title('发送设计诉求 (Enter)', exact=True).click()
                if mode == 'auto':
                    await page.wait_for_function('window.__projectStore.getState().screenOrder.length===2')
                    assert await evaluate(page, 'window.__large.calls.length') == 2
                else:
                    await page.get_by_role('button', name='继续未完成设计', exact=True).wait_for()
                    assert await evaluate(page, 'window.__projectStore.getState().screenOrder') == ['old']
                    assert await evaluate(page, 'window.__large.calls.length') == 3
                    if mode == 'manual':
                        await page.get_by_role('button', name='继续未完成设计', exact=True).click()
                        await page.wait_for_function('window.__projectStore.getState().screenOrder.length===2')
                        assert await evaluate(page, 'window.__large.calls.length') == 4
                        assert '会员推荐' in await evaluate(page, 'window.__large.calls[3].prefix')
                    elif mode == 'stale':
                        await evaluate(page, "window.__projectStore.getState().addDecision('新的设计约束','global')")
                        await page.get_by_role('button', name='继续未完成设计', exact=True).click()
                        await page.get_by_text('工程、原页或设计约束已变化，旧片段不能继续使用；请重新生成。', exact=True).wait_for()
                        assert await evaluate(page, 'window.__large.calls.length') == 3
                    else:
                        await page.get_by_role('button', name='拆分为多页设计', exact=True).click()
                        plan = page.locator('[data-testid="multi-page-plan"]').last
                        await plan.get_by_role('button', name='确认计划并生成 2 页', exact=True).wait_for()
                        assert await evaluate(page, 'window.__large.calls.length') == 3
                        assert await evaluate(page, 'window.__projectStore.getState().screenOrder') == ['old']
                        assert await evaluate(page, "(async()=>{const {useHistoryStore}=await __module('/src/stores/useHistoryStore.ts');return useHistoryStore.getState().past.length})()") == fixture['history']
                        await plan.get_by_role('button', name='确认计划并生成 2 页', exact=True).click()
                        await page.wait_for_function('window.__projectStore.getState().screenOrder.length===3')
                        assert await evaluate(page, 'window.__large.calls.length') == 5
                proof = await evaluate(page, '''async fixture=>{
                  const store=window.__projectStore;
                  if(store.getState().screens.old.htmlContent!==fixture.original)throw Error('original changed');
                  const pages=Object.values(store.getState().screens).filter(s=>s.id!=='old');
                  for(const page of pages)if(page.metadata?.creationEvidence?.workflow.status!=='ready'||page.htmlContent.includes('TAUDESIGN_CONTINUE'))throw Error('invalid page evidence');
                  if(__large.calls.some(c=>c.partial))throw Error('unverified native partial request');
                  const {useHistoryStore}=await __module('/src/stores/useHistoryStore.ts');
                  if(pages.length){useHistoryStore.getState().undo();if(store.getState().screenOrder.length!==1)throw Error('Undo not atomic');useHistoryStore.getState().redo();if(store.getState().screenOrder.length!==pages.length+1)throw Error('Redo failed');}
                  return {pages:pages.map(p=>({id:p.id,name:p.name,html:p.htmlContent})),calls:__large.calls.length,plans:__large.plans,originalPreserved:true,undoRedo:pages.length>0};
                }''', fixture)
                for created in proof['pages']:
                    frame = page.frame_locator('iframe[data-inspector-screen="'+created['id']+'"]')
                    await frame.locator('button').first.wait_for()
                    assert await frame.locator('h1').count() == 1
                assert not errors, errors
                await page.screenshot(path=str(args.report.parent/(mode+'.png')))
                results.append({'mode': mode, 'status': 'passed', **proof, 'pageErrors': errors})
                args.report.write_text(json.dumps({'status': 'running', 'browser': args.browser, 'cases': results}, ensure_ascii=False, indent=2))
                await context.close()
            args.report.write_text(json.dumps({'status': 'passed', 'scope': __doc__, 'browser': args.browser, 'version': browser.version, 'cases': results}, ensure_ascii=False, indent=2))
            print(json.dumps({'status': 'passed', 'browser': args.browser, 'cases': len(results)}))
        finally:
            await browser.close()

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url', default='http://127.0.0.1:5174')
    parser.add_argument('--browser', choices=['chromium', 'webkit'], default='chromium')
    parser.add_argument('--report', type=Path, required=True)
    asyncio.run(main(parser.parse_args()))
