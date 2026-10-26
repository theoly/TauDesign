#!/usr/bin/env python3
"""Verify real iframe restyle gates in an isolated browser project. Requires a running Vite server."""
import argparse
import asyncio
import json
from pathlib import Path
from playwright.async_api import async_playwright

async def main(args):
    async with async_playwright() as playwright:
        browser = await getattr(playwright, args.browser).launch(headless=True)
        page = await browser.new_page(viewport={'width':1600,'height':1000}, locale='zh-CN')
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        try:
            await page.goto(args.url, wait_until='networkidle')
            await page.wait_for_function('Boolean(window.__projectStore)')
            result = await page.evaluate('''async () => {
              const {neutralModernTheme}=await import('/src/utils/themePresets.ts');
              const {acceptRestyleResult,summarizeOutcomes}=await import('/src/services/ai/restyleService.ts');
              const {executeRestyleBatch,restyleContextKey}=await import('/src/services/ai/restyleBatch.ts');
              const {buildRestyleContract}=await import('/src/services/ai/designWorkflow.ts');
              const {createProjectStorage}=await import('/src/services/storage/projectStorage.ts');
              const moduleUrl=path=>performance.getEntriesByType('resource').map(entry=>entry.name).find(url=>new URL(url).pathname===path);
              const {useWorkspaceStore}=await import(moduleUrl('/src/stores/useWorkspaceStore.ts'));
              const {useHistoryStore}=await import(moduleUrl('/src/stores/useHistoryStore.ts'));
              const store=window.__projectStore;
              const assert=(ok,detail)=>{if(!ok)throw new Error(JSON.stringify(detail));};
              const source='<main data-nid="page" class="col gap-4 p-4"><h1 data-nid="title" class="text-xl">重塑验收</h1><button data-nid="button" class="btn btn-primary">提交</button></main>';
              const id=store.getState().initNewProject({name:'重塑门禁浏览器验证',deviceProfile:'mobile',designSystem:neutralModernTheme,createSpecimen:false});
              useWorkspaceStore.setState({view:'workspace',activeProjectId:id});
              store.getState().addScreen({name:'提交页面',htmlContent:source,position:{x:0,y:0}},'a');
              const make=(html)=>{const s=store.getState();return acceptRestyleResult({kind:'screen',id:'a',name:'提交页面',html:s.screens.a.htmlContent},html,{designSystem:s.designSystem,deviceProfile:'mobile'});};
              const valid=await store.getState().applyRestyleOutcome(make(source.replace('p-4','p-6')));
              assert(valid.applied,valid);
              const before=store.getState().screens.a.htmlContent, checkpoint=useHistoryStore.getState().checkpoints.length;
              const invisible=before.replace('class="btn btn-primary"','class="btn btn-primary" style="color:transparent;-webkit-text-fill-color:transparent"');
              const blocked=await store.getState().applyRestyleOutcome(make(invisible));
              assert(!blocked.applied && blocked.validation.pages[0].render.findings.some(f=>f.code==='render_action_invisible_label'),blocked);
              assert(store.getState().screens.a.htmlContent===before && useHistoryStore.getState().checkpoints.length===checkpoint,'Blocked page changed history');
              const withImage=before.replace('</main>','<img data-nid="image" src="assets/images/no-file.png" alt="测试图片"></main>');
              store.getState().updateScreenHtml('a',withImage);
              store.getState().addAsset({id:'missing-image',name:'缺失资源',type:'image',mimeType:'image/png',source:'upload',relPath:'assets/images/no-file.png',refCount:1});
              const missing=await store.getState().applyRestyleOutcome(make(withImage.replace('p-6','p-8')));
              assert(!missing.applied && missing.validation.assetIssues.some(i=>i.code==='missing_asset_file'),missing);
              const image=document.createElement('canvas');image.width=16;image.height=16;
              const context=image.getContext('2d');context.fillStyle='#3578c4';context.fillRect(0,0,16,16);
              await createProjectStorage(id).writeBinary('assets/images/no-file.png',image.toDataURL('image/png').split(',')[1]);
              const restored=await store.getState().applyRestyleOutcome(make(withImage.replace('p-6','p-8')));
              assert(restored.applied && restored.validation.pages[0].render.status==='complete',restored);
              const lazyHtml=store.getState().screens.a.htmlContent.replace('<img ', '<img loading="lazy" ');
              store.getState().updateScreenHtml('a',lazyHtml);
              const lazy=await store.getState().applyRestyleOutcome(make(lazyHtml.replace('p-8','p-6')));
              assert(lazy.applied && lazy.validation.pages[0].render.status==='complete',lazy);
              assert(new DOMParser().parseFromString(store.getState().screens.a.htmlContent,'text/html').querySelector('img').getAttribute('loading')==='lazy','Inspection changed authored loading attribute');
              store.getState().initNewProject({name:'PC门禁验证',deviceProfile:'pc',designSystem:neutralModernTheme,createSpecimen:false});
              store.getState().addScreen({name:'PC页面',htmlContent:source,position:{x:0,y:0}},'a');
              const pc=await store.getState().applyRestyleOutcome(acceptRestyleResult({kind:'screen',id:'a',name:'PC页面',html:source},source.replace('p-4','p-6'),{designSystem:neutralModernTheme,deviceProfile:'pc'}));
              assert(pc.applied,pc);
              const batchId=store.getState().initNewProject({name:'批量组件门禁验证',deviceProfile:'mobile',designSystem:neutralModernTheme,createSpecimen:false});
              useWorkspaceStore.setState({view:'workspace',activeProjectId:batchId});
              for(const name of ['a','b'])store.getState().addScreen({name:'页面'+name,htmlContent:source,position:{x:name==='a'?0:450,y:0}},name);
              const component=store.getState().createComponent('复用操作','<section data-nid="component" class="card p-4"><button data-nid="component-button" class="btn btn-primary">继续</button></section>');
              for(const name of ['a','b'])store.getState().insertComponent(name,component);
              const snapshot=JSON.parse(JSON.stringify({screens:store.getState().screens,components:store.getState().components}));
              const plan=store.getState().buildRestylePlan();
              const generate=async target=>{
                const s=store.getState(),contract=buildRestyleContract({scope:'batch',target,deviceProfile:'mobile',frameWidth:390,designSystem:s.designSystem,designSystemOrigin:s.designSystemOrigin});
                return acceptRestyleResult(target,target.html.replaceAll('p-4','p-6'),{designSystem:s.designSystem,deviceProfile:'mobile'},contract);
              };
              const dryRun=await generate(plan.dryRun);
              const batch=await executeRestyleBatch({plan,dryRun,confirmedContextKey:restyleContextKey(store.getState()),getContextKey:()=>restyleContextKey(store.getState()),
                resolveTarget:target=>({...target,html:target.kind==='component'?store.getState().components[target.id].templateHtml:store.getState().screens[target.id].htmlContent}),
                generate,apply:outcome=>store.getState().applyRestyleOutcome(outcome)});
              assert(batch.status==='completed' && batch.outcomes.every(o=>o.status==='applied' && o.validation.status==='passed' && o.validation.workflow?.status==='ready'),batch);
              assert(batch.outcomes[0].validation.pages.length===3,'Component instances not checked');
              for(let i=0;i<plan.queue.length;i++)useHistoryStore.getState().undo();
              for(const name of ['a','b'])assert(store.getState().screens[name].htmlContent===snapshot.screens[name].htmlContent,'Undo lost page '+name);
              assert(store.getState().components[component].templateHtml===snapshot.components[component].templateHtml,'Undo lost component');
              for(let i=0;i<plan.queue.length;i++)useHistoryStore.getState().redo();
              assert(document.querySelectorAll('iframe[title^="重塑核验"]').length===0,'Detached validation iframe leaked');
              const {RestyleDeliveryRepository}=await import('/src/services/storage/restyleDeliveryRepository.ts');
              const storage=createProjectStorage(batchId),archives=(await new RestyleDeliveryRepository(storage,batchId).list()).records;
              assert(archives.length===3 && archives.every(record=>record.status==='applied'),archives);
              assert(new Set(archives.map(record=>record.batchId)).size===1,'Batch identity was lost');
              const shared=archives.find(record=>record.component);
              assert(shared.pages.length===2 && shared.validation.pages.length===3,'Component write set was not archived');
              let decoded=0;
              for(const record of archives)for(const entry of record.pages){
                assert(entry.preview?.status==='ready',entry.preview);
                const binary=await storage.readBinary(entry.preview.relPath),img=new Image();img.src='data:image/png;base64,'+binary;await img.decode();
                assert(img.naturalWidth===390 && img.naturalHeight===844,'Archived PNG dimensions do not match device');decoded++;
              }
              assert(decoded===4,'Missing page preview');
              return {projectId:batchId,archive:{ids:archives.map(record=>record.id),decodedPreviews:decoded,sharedPages:shared.pages.length},
                valid,blocked,missing,restored,lazy,pc,batch:{status:batch.status,summary:summarizeOutcomes(batch.outcomes),validations:batch.outcomes.map(o=>o.validation)},undoRedo:'passed',leakedSurfaces:0};
            }''')
            await page.reload(wait_until='networkidle')
            await page.wait_for_function('Boolean(window.__projectStore)')
            result['archive']['reopened'] = await page.evaluate('''async fixture => {
              const moduleUrl=performance.getEntriesByType('resource').map(entry=>entry.name).find(url=>new URL(url).pathname==='/src/stores/useWorkspaceStore.ts');
              const {useWorkspaceStore}=await import(moduleUrl);
              if(!useWorkspaceStore.getState().openProject(fixture.projectId))throw new Error('Reopening project failed');
              window.__projectStore.getState().setActiveScreen('a');
              const {RestyleDeliveryRepository}=await import('/src/services/storage/restyleDeliveryRepository.ts');
              const {createProjectStorage}=await import('/src/services/storage/projectStorage.ts');
              const storage=createProjectStorage(fixture.projectId),archives=(await new RestyleDeliveryRepository(storage,fixture.projectId).list()).records;
              if(archives.length!==3 || !fixture.archive.ids.every(id=>archives.some(record=>record.id===id && record.status==='applied')))throw new Error('Archives lost after reload');
              let decoded=0;
              for(const record of archives)for(const entry of record.pages){
                const img=new Image();img.src='data:image/png;base64,'+await storage.readBinary(entry.preview.relPath);await img.decode();
                if(img.naturalWidth!==390 || img.naturalHeight!==844)throw new Error('Reloaded image dimensions changed');decoded++;
              }
              return {records:archives.length,decodedPreviews:decoded};
            }''', result)
            inspector=page.get_by_role('button',name='元素属性',exact=True)
            if await inspector.get_attribute('aria-pressed') != 'true':
                await inspector.click()
            history_title=page.get_by_text('重塑交付历史',exact=True)
            await history_title.click()
            history=history_title.locator('..')
            await history.get_by_text('页面 · 页面a · 已应用',exact=False).click()
            await history.get_by_text('页面a · 前后版本与首屏图',exact=True).first.click()
            preview=history.get_by_role('img',name='页面a · 重塑交付首屏预览',exact=True).first
            await preview.wait_for()
            await preview.evaluate('(img)=>img.decode()')
            await preview.scroll_into_view_if_needed()
            result['archive']['visiblePreviewDecoded']=True
            assert not errors, errors
            args.screenshot.parent.mkdir(parents=True, exist_ok=True)
            await page.screenshot(path=str(args.screenshot))
            report={'status':'passed','browser':args.browser,'version':browser.version,'checks':result,'pageErrors':errors,'screenshot':str(args.screenshot)}
            if args.report:
                args.report.parent.mkdir(parents=True, exist_ok=True)
                args.report.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
            print(json.dumps({'status':'passed','browser':args.browser,'version':browser.version,'batch':result['batch']['summary'],'screenshot':str(args.screenshot)},ensure_ascii=False))
        except Exception:
            args.screenshot.parent.mkdir(parents=True, exist_ok=True)
            await page.screenshot(path=str(args.screenshot.with_stem(args.screenshot.stem+'-failure')))
            print(json.dumps({'status':'failed','browser':args.browser,'pageErrors':errors},ensure_ascii=False))
            raise
        finally:
            await browser.close()

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url',default='http://127.0.0.1:5174')
    parser.add_argument('--browser',choices=['chromium','webkit'],default='chromium')
    parser.add_argument('--screenshot',type=Path,default=Path('/tmp/taudesign-restyle-gates.png'))
    parser.add_argument('--report',type=Path)
    asyncio.run(main(parser.parse_args()))
