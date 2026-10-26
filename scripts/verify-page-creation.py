#!/usr/bin/env python3
"""Verify AI creation gates with real iframe rendering in an isolated browser project."""
import argparse
import asyncio
import json
from pathlib import Path
from playwright.async_api import async_playwright

async def main(args):
    async with async_playwright() as p:
        browser = await getattr(p, args.browser).launch(headless=True)
        page = await browser.new_page(viewport={'width':1600,'height':1000},locale='zh-CN')
        errors=[]
        page.on('pageerror',lambda error:errors.append(str(error)))
        try:
            await page.goto(args.url,wait_until='networkidle')
            await page.wait_for_function('Boolean(window.__projectStore)')
            result=await page.evaluate('''async()=>{
              const {neutralModernTheme}=await import('/src/utils/themePresets.ts');
              const {CanvasToolExecutor}=await import('/src/services/tools/canvasToolExecutor.ts');
              const {buildDesignTaskContract}=await import('/src/services/ai/designWorkflow.ts');
              const {pageCreationContext}=await import('/src/services/ai/pageCreationValidation.ts');
              const {createProjectStorage}=await import('/src/services/storage/projectStorage.ts');
              const {buildStandaloneHtml}=await import('/src/utils/exportRenderer.ts');
              const {compileTokensToCss}=await import('/src/utils/cssCompiler.ts');
              const {getBaseCss}=await import('/src/styles/baseCss.ts');
              const loaded=path=>performance.getEntriesByType('resource').map(entry=>entry.name).find(url=>new URL(url).pathname===path);
              const {useWorkspaceStore}=await import(loaded('/src/stores/useWorkspaceStore.ts'));
              const {useHistoryStore}=await import(loaded('/src/stores/useHistoryStore.ts'));
              const store=window.__projectStore,assert=(ok,details)=>{if(!ok)throw new Error(JSON.stringify(details));};
              const results=[];
              for(const profile of ['pc','mobile']){
                const id=store.getState().initNewProject({name:'新建验收 '+profile,deviceProfile:profile,designSystem:neutralModernTheme,createSpecimen:false});
                useWorkspaceStore.setState({view:'workspace',activeProjectId:id});
                store.getState().addScreen({name:'保留原页',htmlContent:'<main class="p-4"><h1>原页</h1></main>'},'original');
                const before=store.getState().screens.original.htmlContent;
                const html='<main class="col gap-4 p-4'+(profile==='pc'?' container-max':'')+'"><h1 class="text-xl font-bold">资料设置</h1><section class="card p-4"><p>修改资料后保存</p></section><button class="btn btn-primary">保存资料</button></main>';
                const create=async(content,contract)=>CanvasToolExecutor.executeAsync({tool:'create_screen',params:{title:'资料设置',html:content,workflowContract:contract}});
                let blocked=await create(html.replace('class="btn btn-primary"','class="btn btn-primary" style="color:transparent;-webkit-text-fill-color:transparent"'));
                assert(!blocked.success,blocked);
                blocked=await create(html.replace('</main>','<img src="assets/images/missing.png" alt="缺失图片"></main>'));
                assert(!blocked.success&&Object.keys(store.getState().screens).length===1,blocked);
                const s=store.getState(),contract=buildDesignTaskContract({intent:'create_screen',request:'创建资料设置',deviceProfile:profile,frameWidth:s.settings.frameWidth,designSystem:s.designSystem,designSystemOrigin:s.designSystemOrigin});
                const context=pageCreationContext(s),pending=create(html,contract),duplicate=await create(html,contract);
                assert(!duplicate.success,duplicate);
                const created=await pending;assert(created.success,created);
                const screen=store.getState().screens[created.screenId],e=screen.metadata.creationEvidence;
                assert(e.workflow.status==='ready'&&e.render.status==='complete'&&e.render.inspected>0,e);
                assert(e.contextFingerprint===context&&store.getState().screens.original.htmlContent===before,e);
                assert(!('rawResponse' in e)&&!('completeHtml' in e),e);
                useHistoryStore.getState().undo();assert(!store.getState().screens[screen.id],'undo failed');
                useHistoryStore.getState().redo();assert(store.getState().screens[screen.id].metadata.creationEvidence.workflow.status==='ready','redo failed');
                const exported=buildStandaloneHtml(screen,{tokensCss:compileTokensToCss(s.designSystem.tokens,'light'),baseCss:getBaseCss(profile),screenOverrides:'',deviceProfile:profile});
                assert(exported.includes('保存资料')&&!exported.includes('creationEvidence')&&!exported.includes('td-mini-chrome'),exported.slice(0,200));
                store.getState().setActiveScreen(screen.id);store.getState().saveProject();
                const storage=createProjectStorage(id),raw=await storage.readText('project.json');
                results.push({profile,projectId:id,screenId:screen.id,workflow:e.workflow,render:e.render,exportLength:exported.length,folderDocumentAvailable:Boolean(raw)});
              }
              return results;
            }''')
            await page.reload(wait_until='networkidle')
            await page.wait_for_function('Boolean(window.__projectStore)')
            reopened=await page.evaluate('''async results=>{
              const loaded=performance.getEntriesByType('resource').map(entry=>entry.name).find(url=>new URL(url).pathname==='/src/stores/useWorkspaceStore.ts');
              const {useWorkspaceStore}=await import(loaded);const found=[];
              for(const result of results){
                if(!useWorkspaceStore.getState().openProject(result.projectId))throw new Error('Project reopen failed');
                const state=window.__projectStore.getState(),screen=state.screens[result.screenId];
                if(screen.metadata.creationEvidence.workflow.status!=='ready')throw new Error('Creation evidence lost');
                state.setActiveScreen(screen.id);found.push({profile:result.profile,workflow:screen.metadata.creationEvidence.workflow.plan.workflowId});
              }return found;
            }''',result)
            inspector=page.get_by_role('button',name='元素属性',exact=True)
            if await inspector.get_attribute('aria-pressed')!='true':
                await inspector.click()
            await page.get_by_text('页面创建验收记录',exact=True).click()
            await page.get_by_text('仅记录创建时的检查，不代表当前页面已重新验收。',exact=False).wait_for()
            assert not errors,errors
            args.screenshot.parent.mkdir(parents=True,exist_ok=True)
            await page.screenshot(path=str(args.screenshot))
            report={'status':'passed','browser':args.browser,'version':browser.version,'checks':result,'reopened':reopened,'pageErrors':errors,'screenshot':str(args.screenshot)}
            args.report.parent.mkdir(parents=True,exist_ok=True)
            args.report.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
            print(json.dumps({'status':'passed','browser':args.browser,'profiles':[c['profile'] for c in result],'reopened':len(reopened)}))
        except Exception:
            args.screenshot.parent.mkdir(parents=True,exist_ok=True)
            await page.screenshot(path=str(args.screenshot.with_stem(args.screenshot.stem+'-failure')))
            raise
        finally:
            await browser.close()

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url',default='http://127.0.0.1:5174')
    parser.add_argument('--browser',choices=['chromium','webkit'],default='chromium')
    parser.add_argument('--screenshot',type=Path,default=Path('/tmp/taudesign-page-creation.png'))
    parser.add_argument('--report',type=Path,default=Path('/tmp/taudesign-page-creation.json'))
    asyncio.run(main(parser.parse_args()))
