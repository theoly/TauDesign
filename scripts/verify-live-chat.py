#!/usr/bin/env python3
"""Opt-in live model -> actual chat UI -> candidate/adoption/history/reopen.

Uses the current native code binding in an isolated ephemeral browser context.
AIService sends real requests through Vite; this is not native Rust/UI evidence.
No model outputs, render gates or adoption results are mocked.
"""
import argparse
import asyncio
import importlib.util
import json
from pathlib import Path
from urllib.parse import urlparse

from playwright.async_api import async_playwright


async def main(args):
    spec = importlib.util.spec_from_file_location('current_live_binding', Path(__file__).with_name('verify-live-provider.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    binding, before_hash = module.current_binding()
    secret = binding['provider'].get('apiKey', '')
    def clean(value):
        if isinstance(value, dict):
            return {k: clean(v) for k, v in value.items() if k != 'apiKey'}
        if isinstance(value, list):
            return [clean(v) for v in value]
        return value.replace(secret, '[REDACTED]') if isinstance(value, str) and secret else value
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.screenshot.parent.mkdir(parents=True, exist_ok=True)
    report = {'status': 'running', 'scope': __doc__, 'browser': args.browser,
              'provider': binding['provider']['name'], 'model': binding['model'], 'phases': []}
    async with async_playwright() as p:
        browser = await getattr(p, args.browser).launch(headless=True)
        context = await browser.new_context(viewport={'width': 1700, 'height': 1100}, locale='zh-CN')
        page = await context.new_page()
        errors, direct, proxy = [], [], []
        page.on('pageerror', lambda error: errors.append(str(error)))
        async def route(request_route):
            request = request_route.request
            url = urlparse(request.url)
            if url.scheme in ('http','https') and url.hostname not in ('127.0.0.1','localhost'):
                direct.append({'host': url.hostname, 'path': url.path})
                await request_route.abort()
            else:
                if url.path == '/api/ai-proxy':
                    proxy.append({'method':request.method,'path':url.path})
                await request_route.continue_()
        await context.route('**/*', route)
        try:
            await page.goto(args.url, wait_until='networkidle')
            await page.wait_for_function('Boolean(window.__projectStore)')
            fixture = await page.evaluate('''async binding=>{
              window.__module=async path=>import(performance.getEntriesByType('resource').map(e=>e.name).find(url=>new URL(url).pathname===path)||path);
              const {useAIConfigStore}=await __module('/src/stores/useAIConfigStore.ts');
              const {useWorkspaceStore}=await __module('/src/stores/useWorkspaceStore.ts');
              const {neutralModernTheme}=await __module('/src/utils/themePresets.ts');
              const {AIService}=await __module('/src/services/ai/aiService.ts');
              const config=useAIConfigStore.getState();
              // Memory-only setup in an ephemeral context. Do not call persistence setters.
              useAIConfigStore.setState({providers:[binding.provider],bindings:{...config.bindings,
                code:{role:'code',providerId:binding.provider.id,modelId:binding.model},
                chat:{role:'chat',providerId:binding.provider.id,modelId:binding.model}}});
              window.__liveRequests=[];
              const original=AIService.stream;
              AIService.stream=function(provider,model,messages,onEvent,timeout,options){
                if(window.__liveRequests.length>=3)throw Error('Live UI request budget exhausted');
                const audit={model,protocol:provider.protocol,maxTokens:options?.maxTokens,startedAt:Date.now(),doneReasons:[]};window.__liveRequests.push(audit);
                const handle=original.call(this,provider,model,messages,event=>{
                  if(event.type==='Usage')audit.usage={inputTokens:event.input_tokens,outputTokens:event.output_tokens};
                  if(event.type==='Done')audit.doneReasons.push(event.finish_reason);
                  if(event.type==='Error')audit.error=event.message;
                  onEvent(event);
                },Math.min(timeout??180000,180000),options);
                return {...handle,promise:handle.promise.finally(()=>{audit.seconds=(Date.now()-audit.startedAt)/1000;})};
              };
              const name='在线聊天采纳验收 '+new Date().toISOString();
              const id=window.__projectStore.getState().initNewProject({name,deviceProfile:'mobile',designSystem:neutralModernTheme,createSpecimen:false});
              useWorkspaceStore.setState({view:'workspace',activeProjectId:id});
              if(localStorage.getItem('ai_designer_providers_v1'))throw Error('Credential configuration unexpectedly persisted');
              return {projectId:id,projectName:name};
            }''', binding)
            async def send(text):
                before_requests = await page.evaluate('window.__liveRequests.length')
                await page.locator('textarea[placeholder^="输入设计诉求"]').fill(text)
                await page.get_by_title('发送设计诉求 (Enter)', exact=True).click()
                await page.wait_for_function('(n)=>window.__liveRequests.length>n',arg=before_requests,timeout=10000)
                print(json.dumps({'phase':'real-model-started','browser':args.browser,'request':before_requests+1}),flush=True)
                await page.wait_for_function('(()=>{const input=document.querySelector("textarea[placeholder^=输入设计诉求]");return Boolean(input&&!input.disabled);})()',timeout=210000)
                print(json.dumps({'phase':'chat-finished','browser':args.browser,'request':before_requests+1}),flush=True)

            await send('新建一个移动端会员权益页，标题会员权益，展示普通会员、成长值128和三条简短权益说明，主按钮文字为查看会员权益。只生成这一页，不用图片或远程资源，主按钮只用文字，保留清晰的信息层级。')
            created = await page.evaluate('''async()=>{
              const s=window.__projectStore.getState(),pages=Object.values(s.screens);
              if(pages.length!==1)throw Error('Creation failed: expected one actual page');
              const screen=pages[0],e=screen.metadata?.creationEvidence;
              if(e?.workflow.status!=='ready'||e.render.status!=='complete')throw Error('Missing current creation proof');
              const {inspectText,setTextByNid}=await __module('/src/utils/textNode.ts');
              const doc=new DOMParser().parseFromString(screen.htmlContent,'text/html');
              const action=Array.from(doc.querySelectorAll('button,a')).find(el=>el.textContent.trim()==='查看会员权益');
              if(!action)throw Error('Model omitted requested primary action');
              const candidates=[action,...Array.from(action.querySelectorAll('*')).filter(el=>el.localName!=='svg'&&!el.closest('svg'))];
              const leaf=candidates.find(el=>el.textContent.trim()==='查看会员权益'&&inspectText(el).editable);
              if(!leaf)throw Error('Requested action has no safely editable text node');
              const targetNid=leaf.getAttribute('data-nid');
              const expected=setTextByNid(screen.htmlContent,targetNid,'立即查看权益');
              if(expected===null)throw Error('Cannot build safe expected DOM');
              return {screenId:screen.id,name:screen.name,beforeHtml:screen.htmlContent,targetNid,expectedHtml:expected,evidence:e};
            }''')
            report['phases'].append({'id':'create','status':'passed',**created})
            frame = page.frame_locator('iframe[data-inspector-screen="'+created['screenId']+'"]')
            await frame.locator('[data-nid="'+created['targetNid']+'"]').click()
            await page.wait_for_function('(nid)=>window.__projectStore.getState().selectedNid===nid',arg=created['targetNid'])
            await page.locator('button[title^="未引用元素"]').click()
            await page.wait_for_function('Boolean(window.__projectStore.getState().pendingNodeRef)')
            await send('仅将当前引用元素的文字从查看会员权益改为立即查看权益，其他文案、结构和样式全部保持。直接复制页面后局部修改。')
            assert await page.get_by_test_id('modification-review').count() == 0, 'Explicit edit unexpectedly routed through broad analysis'
            await page.wait_for_function("window.__projectStore.getState().getStagedDeliveryReport().status==='ready'",timeout=30000)
            await page.wait_for_function("window.__projectStore.getState().stagedPreview?.report?.status==='ready'&&!window.__projectStore.getState().stagedPreview.pending&&window.__projectStore.getState().stagedPreview.key===window.__projectStore.getState().getStagedRenderContextKey()",timeout=30000)
            candidate = await page.evaluate('''created=>{
              const s=window.__projectStore.getState();
              if(s.screens[created.screenId].htmlContent!==created.beforeHtml)throw Error('Original changed before adoption');
              if(s.stagedScreen.newHtml!==created.expectedHtml)throw Error('Model changed unrelated DOM or lost target text');
              if(s.stagedScreen.executionRecord.localEdit.mode!=='element')throw Error('Explicit element edit became page rewrite');
              return {delivery:s.getStagedDeliveryReport(),preview:s.stagedPreview.report,execution:s.stagedScreen.executionRecord};
            }''', created)
            await page.get_by_text('查看验收记录', exact=True).last.click()
            image = page.get_by_label('候选首屏预览', exact=True).get_by_role('img').first
            await image.wait_for()
            await image.evaluate('(img)=>img.decode()')
            await page.screenshot(path=str(args.screenshot.with_stem(args.screenshot.stem+'-candidate')))
            await page.get_by_text('查看验收记录', exact=True).last.click()
            await page.get_by_role('button', name='采纳新版 (替换原版)', exact=True).last.click()
            await page.wait_for_function('window.__projectStore.getState().stagedScreen===null')
            assert await page.evaluate('(id)=>window.__projectStore.getState().screens[id].htmlContent',created['screenId']) == created['expectedHtml']
            await page.get_by_title('撤销 (Cmd/Ctrl+Z)', exact=True).click()
            assert await page.evaluate('(id)=>window.__projectStore.getState().screens[id].htmlContent',created['screenId']) == created['beforeHtml']
            await page.get_by_title('重做 (Cmd/Ctrl+Shift+Z)', exact=True).click()
            assert await page.evaluate('(id)=>window.__projectStore.getState().screens[id].htmlContent',created['screenId']) == created['expectedHtml']
            report['phases'].append({'id':'candidate-adopt-undo-redo','status':'passed','originalPreservedUntilAdopt':True,'onlyRequestedTextChanged':True,**candidate})
            report['requests'] = await page.evaluate('window.__liveRequests')
            assert len(report['requests']) in (2,3) and not any(r.get('error') for r in report['requests']), report['requests']
            await page.evaluate('window.__projectStore.getState().saveProject()')
            await page.reload(wait_until='networkidle')
            await page.wait_for_function('Boolean(window.__projectStore)')
            if await page.evaluate('window.__projectStore.getState().id') != fixture['projectId']:
                await page.get_by_title(fixture['projectName'], exact=True).first.click()
            await page.wait_for_function('(id)=>window.__projectStore.getState().id===id',arg=fixture['projectId'])
            reopened = await page.evaluate('''async created=>{
              const s=window.__projectStore.getState(),screen=s.screens[created.screenId];
              if(screen.htmlContent!==created.expectedHtml||!screen.metadata.creationEvidence)throw Error('Reopen lost page or creation evidence');
              const {DeliveryRepository}=await import('/src/services/storage/deliveryRepository.ts');
              const {createProjectStorage}=await import('/src/services/storage/projectStorage.ts');
              const records=(await new DeliveryRepository(createProjectStorage(s.id),s.id).listForScreen(screen.id)).records;
              if(records.length!==1||records[0].status!=='applied'||records[0].preview.status!=='ready')throw Error('Reopen lost delivery evidence');
              if(localStorage.getItem('ai_designer_providers_v1'))throw Error('Credential configuration unexpectedly persisted');
              s.setActiveScreen(screen.id);
              return {record:records[0],credentialConfigPersisted:false};
            }''', created)
            properties = page.get_by_role('button', name='元素属性', exact=True)
            if await properties.get_attribute('aria-pressed') != 'true':
                await properties.click()
            history = page.get_by_label('页面交付历史')
            await history.get_by_text('替换原页 · 已应用', exact=False).wait_for()
            await history.locator('summary').first.click()
            await history.get_by_text('交付首屏预览', exact=True).click()
            preview = history.get_by_role('img').first
            await preview.wait_for()
            dimensions = await preview.evaluate('async img=>{await img.decode();return {width:img.naturalWidth,height:img.naturalHeight};}')
            assert dimensions == {'width':390,'height':844}, dimensions
            await preview.scroll_into_view_if_needed()
            await page.screenshot(path=str(args.screenshot))
            report['phases'].append({'id':'reload-open-history','status':'passed','previewDecoded':dimensions,**reopened})
            assert not errors and not direct and len(proxy)==len(report['requests']), {'pageErrors':errors,'direct':direct,'proxy':len(proxy)}
            report.update(status='passed',version=browser.version,pageErrors=errors,directProviderRequests=direct,proxyRequests=proxy,configUnchanged=module.current_binding()[1]==before_hash)
            assert report['configUnchanged']
            print(json.dumps({'status':'passed','browser':args.browser,'model':binding['model'],'liveRequests':len(report['requests']),'phases':[p['id'] for p in report['phases']]},ensure_ascii=False))
        except Exception as error:
            report.update(status='failed',error=str(error),pageErrors=errors,directProviderRequests=direct,proxyRequests=proxy)
            report['requests'] = await page.evaluate('window.__liveRequests||[]')
            report['diagnostic'] = await page.evaluate('''()=>{const s=window.__projectStore?.getState();return {pages:s?.screenOrder,candidate:s?.stagedScreen&&{id:s.stagedScreen.candidateId,target:s.stagedScreen.targetScreenId},adoptionError:s?.stagedAdoptionError,delivery:s?.getStagedDeliveryReport(),chat:document.body.innerText.slice(-7000)};}''')
            await page.screenshot(path=str(args.screenshot.with_stem(args.screenshot.stem+'-failure')))
            raise
        finally:
            args.report.write_text(json.dumps(clean(report),ensure_ascii=False,indent=2))
            await browser.close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--live-current-binding',action='store_true',help='Explicitly allow up to three paid requests using the current binding')
    parser.add_argument('--url',default='http://127.0.0.1:5174')
    parser.add_argument('--browser',choices=['chromium','webkit'],default='chromium')
    parser.add_argument('--report',type=Path,required=True)
    parser.add_argument('--screenshot',type=Path,required=True)
    args = parser.parse_args()
    if not args.live_current_binding:
        parser.error('This test calls a live provider; explicitly pass --live-current-binding')
    asyncio.run(main(args))
