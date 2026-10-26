#!/usr/bin/env python3
"""Verify shared component/page reference gates with actual canvas iframes, UI and delivery archives."""
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
            fixture=await page.evaluate('''async()=>{
              window.__module=async path=>import(performance.getEntriesByType('resource').map(e=>e.name).find(url=>new URL(url).pathname===path)||path);
              const {neutralModernTheme}=await window.__module('/src/utils/themePresets.ts');
              const {useWorkspaceStore}=await window.__module('/src/stores/useWorkspaceStore.ts');
              const s=window.__projectStore,id=s.getState().initNewProject({name:'设计实体门禁',deviceProfile:'mobile',designSystem:neutralModernTheme,createSpecimen:false});
              const comp=s.getState().createComponent('资料卡片','<article class="card p-4"><p>资料</p></article>');
              s.getState().updateComponent(comp,{templateHtml:'<article class="card p-5"><p>资料</p></article>'});
              s.getState().updateComponent(comp,{templateHtml:'<article class="card p-6"><p>资料</p></article>'});
              if(s.getState().components[comp].version!==3)throw Error('Fixture must use actual component version updates');
              const source='<main data-nid="root" class="col gap-4 p-4"><h1 data-nid="title" class="text-xl font-bold">会员资料</h1><article data-nid="instance" data-component-id="'+comp+'" data-component-version="1" class="card p-4"><p data-nid="label">用户保留的资料</p></article><button data-nid="action" class="btn btn-primary" data-target-screen-id="detail">查看详情</button></main>';
              s.getState().addScreen({name:'原页面',htmlContent:source},'old');
              s.getState().addScreen({name:'详情页面',htmlContent:'<main class="p-4"><h1>会员详情</h1></main>'},'detail');
              useWorkspaceStore.setState({view:'workspace',activeProjectId:id});
              window.__entities={id,comp,source};return window.__entities;
            }''')
            # Three independent creation/import lanes reject invalid references before project writes.
            blocked=await page.evaluate('''async()=>{
              const {CanvasToolExecutor}=await window.__module('/src/services/tools/canvasToolExecutor.ts');
              const {analyzeHtmlImport,convertHtmlImport}=await window.__module('/src/services/import/htmlImport.ts');
              const {importPreviewFingerprint}=await window.__module('/src/services/ai/pageCreationValidation.ts');
              const {acceptRestyleResult}=await window.__module('/src/services/ai/restyleService.ts');
              const {useHistoryStore}=await window.__module('/src/stores/useHistoryStore.ts');
              const store=window.__projectStore,before=useHistoryStore.getState().past.length,results=[];
              const invalid='<main class="p-4"><div data-component-id="missing">资料</div><button class="btn btn-primary">保存</button></main>';
              const created=await CanvasToolExecutor.executeAsync({tool:'create_screen',params:{title:'错误引用',html:invalid}});
              if(created.success)throw Error('Unknown component created');results.push({lane:'create',blocked:true,message:created.message||created.error});
              for(const mode of ['preserve','unify','selective']){
                const s=store.getState(),converted=convertHtmlImport(analyzeHtmlImport(invalid,'source.html'),{mode,categories:['colors'],designSystem:s.designSystem,colorMode:s.settings.colorMode,deviceProfile:'mobile',frameWidth:390});
                const screen={name:'导入',htmlContent:converted.htmlContent,scopedCss:converted.scopedCss,metadata:{importedHtml:converted.metadata}};
                try{await s.importHtmlScreen(screen,{projectId:s.id},{contract:converted.workflowContract,preview:{version:1,fingerprint:importPreviewFingerprint(screen,s.settings,s.designSystem)}});throw Error('Unexpected successful import');}
                catch(error){if(!error.message.includes('不存在的组件'))throw error;results.push({lane:'import-'+mode,blocked:true,message:error.message});}
              }
              const f=window.__entities,target={kind:'screen',id:'old',name:'原页面',html:f.source};
              const outcome=acceptRestyleResult(target,f.source.replace('data-target-screen-id="detail"','data-target-screen-id="missing"'));
              const restyle=await store.getState().applyRestyleOutcome(outcome);
              if(restyle.applied||!restyle.message.includes('不存在的页面'))throw Error('Restyle invalid target passed');results.push({lane:'restyle',blocked:true,message:restyle.message});
              if(store.getState().screenOrder.length!==2||useHistoryStore.getState().past.length!==before)throw Error('Invalid outputs changed project/history');
              return results;
            }''')
            # An invalid candidate remains inspectable; every adoption API and the actual buttons are blocked.
            await page.evaluate('''()=>{const f=window.__entities;window.__projectStore.getState().stageScreenChange('old',f.source.replace('data-target-screen-id="detail"','data-target-screen-id="missing"'),'引用错误候选');}''')
            await page.wait_for_function('window.__projectStore.getState().stagedRenderQuality?.report.status==="complete"')
            await page.get_by_role('alert').get_by_text('设计实体引用未通过',exact=False).wait_for()
            for label in ['采纳新版 (替换原版)','两版都留']:
                buttons=page.get_by_role('button',name=label,exact=True)
                assert await buttons.count()>=1
                for button in await buttons.all():assert await button.is_disabled()
            rejected=await page.evaluate('''async()=>{
              const s=window.__projectStore.getState(),report=s.getStagedDeliveryReport();
              if(report.status!=='blocked'||report.checks.find(c=>c.id==='entities').status!=='blocked')throw Error('Candidate entity stage missing');
              if(await s.adoptStagedChange()||await s.forceAdoptStagedChange()||await s.keepBothScreens())throw Error('Adoption bypass');
              if(window.__projectStore.getState().screens.old.htmlContent!==window.__entities.source)throw Error('Source changed');
              return report;
            }''')
            summary=page.get_by_text('查看验收记录',exact=True)
            if await summary.locator('..').get_attribute('open') is None:await summary.click()
            await page.get_by_text('设计实体引用：未通过',exact=True).wait_for()
            await page.screenshot(path=str(args.screenshot.with_stem(args.screenshot.stem+'-blocked')))
            # The existing v1 instance may keep its text and layout after the library reaches v3.
            await page.evaluate('''()=>{const s=window.__projectStore.getState(),f=window.__entities;s.discardStagedChange();s.stageScreenChange('old',f.source.replace('gap-4','gap-6'),'保留旧实例候选');}''')
            await page.wait_for_function('window.__projectStore.getState().getStagedDeliveryReport().status==="ready"')
            summary=page.get_by_text('查看验收记录',exact=True)
            if await summary.locator('..').get_attribute('open') is None:await summary.click()
            panel=page.get_by_label('候选验收记录',exact=True)
            await panel.get_by_text('本次未同步模板',exact=False).first.wait_for()
            await page.screenshot(path=str(args.screenshot.with_stem(args.screenshot.stem+'-compatible')))
            # Opening evidence may remount the canvas in WebKit; wait for the current real report.
            await page.wait_for_function('window.__projectStore.getState().getStagedDeliveryReport().status==="ready"')
            adopted=await page.evaluate('''async()=>{
              const store=window.__projectStore,{useHistoryStore}=await window.__module('/src/stores/useHistoryStore.ts');
              const before=useHistoryStore.getState().past.length,expected=store.getState().stagedScreen.newHtml;
              if(!await store.getState().adoptStagedChange())throw Error(store.getState().stagedAdoptionError||'Valid old instance could not adopt');
              if(store.getState().screens.old.htmlContent!==expected||!expected.includes('data-component-version="1"')||useHistoryStore.getState().past.length!==before+1)throw Error('Adoption changed old instance identity or History');
              useHistoryStore.getState().undo();if(store.getState().screens.old.htmlContent!==window.__entities.source)throw Error('Undo failed');
              useHistoryStore.getState().redo();if(store.getState().screens.old.htmlContent!==expected)throw Error('Redo failed');
              const {DeliveryRepository}=await window.__module('/src/services/storage/deliveryRepository.ts');
              const {createProjectStorage}=await window.__module('/src/services/storage/projectStorage.ts');
              const record=(await new DeliveryRepository(createProjectStorage(store.getState().id),store.getState().id).listForScreen('old')).records[0];
              const check=record.candidate.validationEvidence.delivery.workflow.checks.find(c=>c.id==='design-entities');
              if(check.status!=='passed'||!check.message.includes('本次未同步模板'))throw Error('Lost actual entity check in delivery archive');
              return {expected,recordId:record.id,check,render:record.candidate.validationEvidence.render,historyDelta:1};
            }''')
            # New pages must explicitly use the current component version (old-instance exception cannot leak).
            created=await page.evaluate('''async()=>{
              const {CanvasToolExecutor}=await window.__module('/src/services/tools/canvasToolExecutor.ts');
              const f=window.__entities,result=await CanvasToolExecutor.executeAsync({tool:'create_screen',params:{title:'当前组件新页面',html:f.source.replace('data-component-version="1"','data-component-version="3"')}});
              if(!result.success)throw Error(JSON.stringify(result));const s=window.__projectStore.getState(),e=s.screens[result.screenId].metadata.creationEvidence;
              if(e.render.status!=='complete'||e.workflow.checks.find(c=>c.id==='design-entities')?.status!=='passed')throw Error('Missing actual creation evidence');
              s.setActiveScreen(result.screenId);return {screenId:result.screenId,evidence:e};
            }''')
            await page.reload(wait_until='networkidle')
            await page.wait_for_function('Boolean(window.__projectStore)')
            reopened=await page.evaluate('''async data=>{
              const module=async path=>import(performance.getEntriesByType('resource').map(e=>e.name).find(url=>new URL(url).pathname===path)||path);
              const {useWorkspaceStore}=await module('/src/stores/useWorkspaceStore.ts');
              if(!useWorkspaceStore.getState().openProject(data.fixture.id))throw Error('Reopen failed');
              const s=window.__projectStore.getState();if(s.screens.old.htmlContent!==data.adopted.expected||s.components[data.fixture.comp].version!==3)throw Error('Reopen lost versions');
              const {DeliveryRepository}=await module('/src/services/storage/deliveryRepository.ts'),{createProjectStorage}=await module('/src/services/storage/projectStorage.ts');
              const records=(await new DeliveryRepository(createProjectStorage(s.id),s.id).listForScreen('old')).records;
              if(!records.some(r=>r.id===data.adopted.recordId&&r.candidate.validationEvidence.delivery.checks.some(c=>c.id==='entities'&&c.status==='passed')))throw Error('Archived gate lost on reopen');
              s.setActiveScreen(data.created.screenId);return {pages:s.screenOrder.length,recordId:data.adopted.recordId};
            }''',{'fixture':fixture,'adopted':adopted,'created':created})
            await page.frame_locator('iframe[title="当前组件新页面"]').get_by_role('button',name='查看详情',exact=True).wait_for()
            properties=page.get_by_role('button',name='元素属性',exact=True)
            if await properties.get_attribute('aria-pressed')!='true':await properties.click()
            record=page.get_by_text('页面创建验收记录',exact=True)
            if await record.locator('..').get_attribute('open') is None:await record.click()
            await page.get_by_text('设计实体引用：通过',exact=False).wait_for()
            await page.screenshot(path=str(args.screenshot))
            assert not errors,errors
            report={'status':'passed','browser':args.browser,'version':browser.version,'model':'no AI provider calls; controlled static input with real iframe gates',
                    'blocked':blocked,'rejectedCandidate':rejected,'adopted':adopted,'created':created,'reopened':reopened,'pageErrors':errors}
            args.report.parent.mkdir(parents=True,exist_ok=True);args.report.write_text(json.dumps(report,ensure_ascii=False,indent=2))
            print(json.dumps({'status':'passed','browser':args.browser,'blockedLanes':[r['lane'] for r in blocked],'reopened':reopened,'pageErrors':errors},ensure_ascii=False))
        except Exception:
            await page.screenshot(path=str(args.screenshot.with_stem(args.screenshot.stem+'-failure')))
            print(json.dumps({'pageErrors':errors,'text':(await page.locator('body').inner_text())[-4500:]},ensure_ascii=False))
            raise
        finally:
            await browser.close()


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url',default='http://127.0.0.1:5174')
    parser.add_argument('--browser',choices=['chromium','webkit'],default='chromium')
    parser.add_argument('--screenshot',type=Path,default=Path('/tmp/design-entities.png'))
    parser.add_argument('--report',type=Path,default=Path('/tmp/design-entities.json'))
    asyncio.run(main(parser.parse_args()))
