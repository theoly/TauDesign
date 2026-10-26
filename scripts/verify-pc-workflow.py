#!/usr/bin/env python3
"""Synthetic complex PC static workflow, real stores/iframes/history/import/export.

No user project, online model, native file chooser or live business interaction is used.
"""
import argparse
import asyncio
import base64
import hashlib
import json
import uuid
from pathlib import Path

from PIL import Image, ImageChops
from playwright.async_api import async_playwright


async def evaluate_task(page, expression, arg=None):
    """Keep the exact awaited CDP operation alive; do not retry stateful edits."""
    task_id = uuid.uuid4().hex
    script = '''payload => {
      const tasks = window.__pcWorkflowTasks ??= Object.create(null);
      const task = Promise.resolve().then(() => (EXPRESSION)(payload.arg));
      tasks[payload.id] = task;
      return task;
    }'''.replace('EXPRESSION', expression)
    try:
        return await page.evaluate(script, {'id': task_id, 'arg': arg})
    finally:
        if not page.is_closed():
            await page.evaluate('''id => {
              const tasks = window.__pcWorkflowTasks;
              if (tasks) {
                delete tasks[id];
                if (!Object.keys(tasks).length) delete window.__pcWorkflowTasks;
              }
            }''', task_id)


async def main(args):
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.screenshot.parent.mkdir(parents=True, exist_ok=True)
    artifacts = args.report.parent / 'pc-artifacts'
    artifacts.mkdir(exist_ok=True)
    report = {'status': 'running', 'scope': __doc__, 'browser': args.browser, 'cases': []}
    async with async_playwright() as p:
        browser = await getattr(p, args.browser).launch(headless=True)
        context = await browser.new_context(viewport={'width': 1680, 'height': 1050}, locale='zh-CN', device_scale_factor=1)
        page = await context.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        report['version'] = browser.version
        try:
            await page.goto(args.url, wait_until='networkidle')
            await page.wait_for_function('Boolean(window.__projectStore)')
            fixture = await evaluate_task(page, '''async()=>{
              window.__module=async path=>import(performance.getEntriesByType('resource').map(e=>e.name).find(url=>new URL(url).pathname===path)||path);
              const {neutralModernTheme}=await __module('/src/utils/themePresets.ts');
              const {useWorkspaceStore}=await __module('/src/stores/useWorkspaceStore.ts');
              const {CanvasToolExecutor}=await __module('/src/services/tools/canvasToolExecutor.ts');
              const store=window.__projectStore;
              const id=store.getState().initNewProject({name:'合成复杂PC静态验收',deviceProfile:'pc',designSystem:neutralModernTheme,createSpecimen:false});
              useWorkspaceStore.setState({view:'workspace',activeProjectId:id});
              const rows=Array.from({length:12},(_,i)=>`<tr class="border-b"><td class="p-3">C202610${String(i+1).padStart(2,'0')}</td><td class="p-3 break-words">${i===0?'跨区域研发协同与长期服务合同复核项目（包含补充材料）':'企业客户项目 '+(i+1)}</td><td class="p-3">王老师</td><td class="p-3"><span class="badge-soft text-success">已确认</span></td><td class="p-3"><button class="btn btn-ghost btn-sm" type="button">查看详情</button></td></tr>`).join('');
              const source=`<main data-nid="pcroot01" class="container-max col gap-6 p-6">
                <header class="row items-center justify-between gap-4"><div><p class="text-sm text-secondary">项目协作中心</p><h1 data-nid="pctitle1" class="text-2xl font-bold">客户项目管理</h1></div><button data-nid="pcaction" class="btn btn-primary" type="button">新增客户项目</button></header>
                <div class="row gap-6 items-start"><aside data-nid="pcaside1" class="card p-4 col gap-3 flex-none" style="width:calc(var(--space-8) * 5)"><h2 class="text-md font-semibold">工作空间</h2><button class="btn btn-secondary" type="button">客户项目</button><button class="btn btn-ghost" type="button">团队成员</button><button class="btn btn-ghost" type="button">交付档案</button><p class="text-sm text-secondary break-words">华东与华南跨区域联合项目工作组</p></aside>
                <section class="col gap-4 flex-1 min-w-0"><div class="grid-3 gap-4"><article class="card p-4"><p class="text-sm text-secondary">当前项目</p><strong class="text-2xl">128</strong></article><article class="card p-4"><p class="text-sm text-secondary">本周待复核</p><strong class="text-2xl">12</strong></article><article class="card p-4"><p class="text-sm text-secondary">本月完成率</p><strong class="text-2xl">86%</strong></article></div>
                <form data-nid="pcform01" class="card p-4 col gap-4"><h2 class="text-lg font-semibold">筛选项目</h2><div class="row gap-3 items-end"><label class="col gap-2 flex-1 min-w-0">客户或项目名称<input class="input" name="query" placeholder="输入客户名称或合同编号"></label><label class="col gap-2 flex-1 min-w-0">负责团队<select class="select" name="team"><option>全部团队</option><option>企业服务组</option></select></label><button class="btn btn-secondary" type="submit">查询项目</button></div></form>
                <section data-nid="pctable1" class="card p-4 col gap-3"><div class="row items-center justify-between"><h2 class="text-lg font-semibold">客户项目列表</h2><span class="text-sm text-secondary">共 12 项</span></div><table class="text-sm text-left" style="width:100%;table-layout:fixed;border-collapse:collapse"><colgroup><col style="width:18%"><col style="width:35%"><col style="width:12%"><col style="width:16%"><col style="width:19%"></colgroup><thead class="bg-surface-alt"><tr><th class="p-3">合同编号</th><th class="p-3">项目名称</th><th class="p-3">负责人</th><th class="p-3">状态</th><th class="p-3">操作</th></tr></thead><tbody>${rows}</tbody></table></section>
                <footer class="row justify-between items-center gap-3"><p class="text-sm text-secondary">第 1 页，共 1 页</p><button class="btn btn-outline" type="button">导出当前列表</button></footer></section></div></main>`;
              const result=await CanvasToolExecutor.executeAsync({tool:'create_screen',params:{title:'复杂PC项目管理',html:source}});
              if(!result.success)throw Error(JSON.stringify(result));
              const screen=store.getState().screens[result.screenId];
              if(screen.metadata.creationEvidence.workflow.status!=='ready')throw Error('Creation gate incomplete');
              return {projectId:id,screenId:screen.id,source:screen.htmlContent,evidence:screen.metadata.creationEvidence};
            }''')
            report['fixture'] = {key: value for key, value in fixture.items() if key != 'source'}
            edit = await evaluate_task(page, '''async fixture=>{
              const {executeStructuredEdit}=await __module('/src/services/ai/structuredEditExecutor.ts');
              const {buildDesignTaskContract}=await __module('/src/services/ai/designWorkflow.ts');
              const {captureModificationSnapshot,isModificationSnapshotCurrent}=await __module('/src/services/ai/modificationReview.ts');
              const store=window.__projectStore,s=store.getState(),screen=s.screens[fixture.screenId],snapshot=captureModificationSnapshot(s,screen.id);
              const contract=buildDesignTaskContract({intent:'modify_screen',request:'仅把主按钮文案改为新增企业客户项目',target:screen,deviceProfile:'pc',frameWidth:1440,designSystem:s.designSystem,designSystemOrigin:s.designSystemOrigin,allowedChanges:['element:pcaction']});
              const core={streamText(){throw Error('Unexpected model request');},generateObject(){throw Error('Unexpected model request');}};
              const result=await executeStructuredEdit(core,{mode:'local',screen,request:contract.request,contract,settings:s.settings,designSystem:s.designSystem,colorMode:s.settings.colorMode,local:{operations:[{nid:'pcaction',type:'set_text',value:'新增企业客户项目'}],allowedNids:['pcaction']},isCurrent:()=>isModificationSnapshotCurrent(store.getState(),snapshot)});
              if(result.status!=='ready'||store.getState().screens[screen.id].htmlContent!==fixture.source)throw Error(JSON.stringify(result));
              store.getState().stageScreenChange(screen.id,result.html,'局部修改PC主按钮',contract.request,result.contract,result.executionRecord);
              return {status:result.status,execution:result.executionRecord};
            }''', fixture)
            await page.wait_for_function("window.__projectStore.getState().getStagedDeliveryReport().status==='ready'")
            report['localEdit'] = await evaluate_task(page, '''async fixture=>{
              const store=window.__projectStore;
              if(!await store.getState().adoptStagedChange())throw Error(store.getState().stagedAdoptionError);
              const after=store.getState().screens[fixture.screenId].htmlContent;
              const {useHistoryStore}=await __module('/src/stores/useHistoryStore.ts');
              useHistoryStore.getState().undo();if(store.getState().screens[fixture.screenId].htmlContent!==fixture.source)throw Error('Undo changed unrelated nodes');
              useHistoryStore.getState().redo();if(store.getState().screens[fixture.screenId].htmlContent!==after)throw Error('Redo failed');
              const beforeDoc=new DOMParser().parseFromString(fixture.source,'text/html'),afterDoc=new DOMParser().parseFromString(after,'text/html');
              beforeDoc.querySelector('[data-nid="pcaction"]').firstChild.nodeValue='新增企业客户项目';
              if(beforeDoc.documentElement.outerHTML!==afterDoc.documentElement.outerHTML)throw Error('Local edit changed unrelated content');
              const {DeliveryRepository}=await __module('/src/services/storage/deliveryRepository.ts');
              const {createProjectStorage}=await __module('/src/services/storage/projectStorage.ts');
              const records=(await new DeliveryRepository(createProjectStorage(fixture.projectId),fixture.projectId).listForScreen(fixture.screenId)).records;
              if(records.length!==1||records[0].status!=='applied'||records[0].preview.status!=='ready')throw Error('Delivery evidence missing');
              return {status:'passed',undoRedo:true,unchangedOutsideTarget:true,archiveId:records[0].id,preview:records[0].preview};
            }''', fixture)
            report['localEdit']['execution'] = edit['execution']
            report['restyle'] = await evaluate_task(page, '''async fixture=>{
              const {acceptRestyleResult}=await __module('/src/services/ai/restyleService.ts');
              const store=window.__projectStore,s=store.getState(),screen=s.screens[fixture.screenId];
              const doc=new DOMParser().parseFromString(screen.htmlContent,'text/html');doc.querySelector('[data-nid="pctitle1"]').classList.add('text-primary');
              const result=await store.getState().applyRestyleOutcome(acceptRestyleResult({kind:'screen',id:screen.id,name:screen.name,html:screen.htmlContent},doc.body.innerHTML,{designSystem:s.designSystem,deviceProfile:'pc'}));
              if(!result.applied)throw Error(JSON.stringify(result));
              return result;
            }''', fixture)
            # Real documents and browser PNG exporter at each immutable-PC reference preset.
            for device in ['pc-laptop', 'pc-standard', 'pc-wide']:
                built = await evaluate_task(page, '''async({fixture,device})=>{
                  const store=window.__projectStore;store.getState().setReferenceDevice(device);
                  const s=store.getState(),screen=s.screens[fixture.screenId];
                  const {resolveProjectViewport}=await __module('/src/utils/referenceDevice.ts');
                  const {compileTokensToCss}=await __module('/src/utils/cssCompiler.ts');
                  const {getBaseCss}=await __module('/src/styles/baseCss.ts');
                  const {buildScreenDocument}=await __module('/src/utils/screenDocument.ts');
                  const {buildStandaloneHtml}=await __module('/src/utils/exportRenderer.ts');
                  const {exportScreenPng}=await __module('/src/utils/pngExporter.ts');
                  const {PageRenderCheck}=await __module('/src/services/ai/pageRenderCheck.ts');
                  const {createProjectStorage}=await __module('/src/services/storage/projectStorage.ts');
                  const viewport=resolveProjectViewport(s.settings),options={tokensCss:compileTokensToCss(s.designSystem.tokens,s.settings.colorMode),baseCss:getBaseCss('pc'),screenOverrides:'',deviceProfile:'pc',viewportWidth:viewport.width,viewportHeight:viewport.height};
                  if(s.settings.deviceProfile!=='pc'||s.settings.frameWidth!==1440)throw Error('Device profile changed');
                  const quality=await PageRenderCheck.inspect({screen,designSystem:s.designSystem,settings:s.settings,assets:[],overrides:{}},createProjectStorage(s.id));
                  if(quality.status!=='complete'||quality.findings.some(f=>f.severity==='error'))throw Error(JSON.stringify(quality));
                  const canvas=buildScreenDocument(screen,{...options,includeMobileChrome:true,staticImage:true}),html=buildStandaloneHtml(screen,options);
                  const png=await exportScreenPng(screen,{...options,width:1440,scale:1,clipToHeight:true,clipHeight:viewport.height,bgColor:'white'},{isNativeAvailable:()=>false});
                  return {canvas,html,png:png.dataUrl,engine:png.engine,viewport,quality,source:screen.htmlContent};
                }''', {'fixture': fixture, 'device': device})
                case_dir = artifacts / device
                case_dir.mkdir(exist_ok=True)
                (case_dir / 'export.html').write_text(built['html'])
                png_path = case_dir / 'export.png'
                png_path.write_bytes(base64.b64decode(built['png'].split(',', 1)[1]))
                render = await context.new_page()
                await render.set_viewport_size({'width': 1440, 'height': built['viewport']['height']})
                geometry = []
                for kind in ['canvas', 'html']:
                    await render.set_content(built[kind], wait_until='load')
                    await render.evaluate('document.fonts.ready')
                    actual = await render.evaluate('''()=>{
                      const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};};
                      return {width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,
                        chrome:document.querySelectorAll('[data-taudesign-mobile-chrome]').length,rows:document.querySelectorAll('tbody tr').length,fields:document.querySelectorAll('input,select').length,
                        text:document.body.innerText,main:rect(document.querySelector('main')),aside:rect(document.querySelector('aside')),table:rect(document.querySelector('table')),
                        actions:Array.from(document.querySelectorAll('button')).map(e=>({text:e.textContent.trim(),...rect(e),fontSize:getComputedStyle(e).fontSize}))};
                    }''')
                    assert actual['width'] == 1440 and actual['scrollWidth'] == 1440 and not actual['chrome'], actual
                    assert actual['rows'] == 12 and actual['fields'] == 2 and actual['main']['width'] <= 1200, actual
                    assert '新增企业客户项目' in actual['text'] and '跨区域研发协同' in actual['text'], actual
                    assert all(a['text'] and a['width'] > 0 and a['height'] >= 24 and a['x'] >= 0 and a['x']+a['width'] <= 1441 for a in actual['actions']), actual
                    await render.screenshot(path=str(case_dir / (kind+'.png')), full_page=True, animations='disabled', caret='hide')
                    geometry.append(actual)
                assert geometry[0] == geometry[1], 'Canvas/HTML layout or text changed'
                with Image.open(case_dir/'canvas.png') as canvas, Image.open(case_dir/'html.png') as html, Image.open(png_path) as png:
                    assert canvas.size == html.size and ImageChops.difference(canvas.convert('RGB'),html.convert('RGB')).getbbox() is None
                    assert png.size == (1440, built['viewport']['height']) and png.convert('RGB').getextrema() != ((255,255),)*3
                report['cases'].append({'device':device,'viewport':built['viewport'],'quality':built['quality'],'geometry':geometry[0],'canvasHtmlPixelsEqual':True,'pngEngine':built['engine'],'artifacts':str(case_dir)})
                await render.close()
            # Feed the actual exported complex page through the user's import dialog.
            source_html = built['html']
            screen_button = page.get_by_role('button', name='页面', exact=True)
            if await screen_button.get_attribute('aria-pressed') != 'true':
                await screen_button.click()
            await page.get_by_role('button', name='导入 HTML 页面', exact=True).click()
            dialog = page.get_by_role('dialog', name='导入 HTML 页面')
            await dialog.get_by_label('选择 HTML 文件', exact=True).set_input_files({'name':'复杂PC项目管理.html','mimeType':'text/html','buffer':source_html.encode()})
            await dialog.get_by_label('保留原貌', exact=True).check()
            await page.wait_for_function("Array.from(document.querySelectorAll('[role=dialog] button')).some(b=>b.textContent==='确认导入'&&!b.disabled)")
            await dialog.get_by_role('button', name='确认导入', exact=True).click()
            await dialog.wait_for(state='detached', timeout=30000)
            report['import'] = await evaluate_task(page, '''async fixture=>{
              const store=window.__projectStore,s=store.getState(),imported=Object.values(s.screens).find(screen=>screen.id!==fixture.screenId);
              if(!imported||imported.metadata.creationEvidence.workflow.status!=='ready')throw Error('Import did not pass actual gates');
              if(s.settings.deviceProfile!=='pc'||s.settings.frameWidth!==1440)throw Error('Import changed profile');
              s.setActiveScreen(imported.id);s.saveProject();
              const {buildStandaloneHtml}=await __module('/src/utils/exportRenderer.ts');
              const {compileTokensToCss}=await __module('/src/utils/cssCompiler.ts');
              const {getBaseCss}=await __module('/src/styles/baseCss.ts');
              return {id:imported.id,name:imported.name,evidence:imported.metadata.creationEvidence,
                html:buildStandaloneHtml(imported,{tokensCss:compileTokensToCss(s.designSystem.tokens,s.settings.colorMode),baseCss:getBaseCss('pc'),screenOverrides:'',deviceProfile:'pc',viewportWidth:1440,viewportHeight:810})};
            }''', fixture)
            imported_frame = page.frame_locator('iframe[data-inspector-screen="'+report['import']['id']+'"]')
            await imported_frame.locator('tbody tr').first.wait_for()
            assert await imported_frame.locator('tbody tr').count() == 12
            assert await imported_frame.get_by_role('button', name='新增企业客户项目', exact=True).count() == 1
            report['import']['liveCanvasVerified'] = True
            imported_html = report['import'].pop('html')
            (artifacts/'import-export.html').write_text(imported_html)
            render = await context.new_page()
            await render.set_viewport_size({'width':1440,'height':810})
            await render.set_content(imported_html,wait_until='load')
            await render.evaluate('document.fonts.ready')
            await render.screenshot(path=str(artifacts/'import-export.png'),full_page=True,animations='disabled',caret='hide')
            with Image.open(artifacts/'pc-wide/html.png') as original, Image.open(artifacts/'import-export.png') as imported:
                assert original.size == imported.size and ImageChops.difference(original.convert('RGB'),imported.convert('RGB')).getbbox() is None, 'Preserve import changed PC pixels'
            report['import']['sourceExportPixelsEqual'] = True
            await render.close()
            await page.reload(wait_until='networkidle')
            await page.wait_for_function('Boolean(window.__projectStore)')
            report['reopen'] = await evaluate_task(page, '''async({fixture,importedId})=>{
              const {useWorkspaceStore}=await import(performance.getEntriesByType('resource').map(e=>e.name).find(url=>new URL(url).pathname==='/src/stores/useWorkspaceStore.ts'));
              if(!useWorkspaceStore.getState().openProject(fixture.projectId))throw Error('Reopen failed');
              const s=window.__projectStore.getState();
              if(!s.screens[importedId]?.metadata.creationEvidence||!s.screens[fixture.screenId].htmlContent.includes('新增企业客户项目'))throw Error('Reopen lost content/evidence');
              s.setActiveScreen(importedId);
              const {DeliveryRepository}=await import('/src/services/storage/deliveryRepository.ts');
              const {RestyleDeliveryRepository}=await import('/src/services/storage/restyleDeliveryRepository.ts');
              const {createProjectStorage}=await import('/src/services/storage/projectStorage.ts'),storage=createProjectStorage(s.id);
              const deliveries=(await new DeliveryRepository(storage,s.id).listForScreen(fixture.screenId)).records;
              const restyles=(await new RestyleDeliveryRepository(storage,s.id).list()).records;
              if(deliveries.length!==1||restyles.length!==1)throw Error('Reopen lost archives');
              return {screenCount:Object.keys(s.screens).length,profile:s.settings.deviceProfile,reference:s.settings.referenceDevice,deliveries:deliveries.length,restyles:restyles.length};
            }''', {'fixture': fixture, 'importedId': report['import']['id']})
            assert not errors, errors
            await page.screenshot(path=str(args.screenshot))
            report.update(status='passed', pageErrors=errors, screenshot=str(args.screenshot), sourceHtmlSha256=hashlib.sha256(source_html.encode()).hexdigest())
            print(json.dumps({'status':'passed','browser':args.browser,'deviceCases':len(report['cases']),'reopened':report['reopen']},ensure_ascii=False))
        except Exception as error:
            report.update(status='failed', error=str(error), pageErrors=errors)
            await page.screenshot(path=str(args.screenshot.with_stem(args.screenshot.stem+'-failure')))
            raise
        finally:
            args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2))
            await browser.close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url', default='http://127.0.0.1:5174')
    parser.add_argument('--browser', choices=['chromium','webkit'], default='chromium')
    parser.add_argument('--screenshot', type=Path, default=Path('/tmp/taudesign-pc-workflow.png'))
    parser.add_argument('--report', type=Path, default=Path('/tmp/taudesign-pc-workflow.json'))
    asyncio.run(main(parser.parse_args()))
