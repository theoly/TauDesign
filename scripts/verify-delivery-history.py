#!/usr/bin/env python3
"""Optional local-browser regression. Requires requirements-visual-regression.txt and a running Vite server."""
import argparse
import asyncio
import json
from pathlib import Path
from playwright.async_api import async_playwright

def arguments():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url', default='http://127.0.0.1:5174')
    parser.add_argument('--browser', choices=['chromium', 'webkit'], default='chromium')
    parser.add_argument('--screenshot', type=Path, default=Path('/tmp/taudesign-delivery-history.png'))
    parser.add_argument('--report', type=Path)
    parser.add_argument('--candidate-preview', action='store_true', help='Also verify unadopted preview save/reopen/fresh checks and temporary-image cleanup')
    return parser.parse_args()

async def main(args):
    async with async_playwright() as playwright:
        browser = await getattr(playwright, args.browser).launch(headless=True)
        page_errors = []
        try:
            page = await browser.new_page(viewport={'width': 1600, 'height': 1000}, locale='zh-CN')
            page.on('pageerror', lambda error: page_errors.append(str(error)))
            await page.goto(args.url, wait_until='networkidle')
            await page.wait_for_function('Boolean(window.__projectStore)')
            # The isolated browser context creates its own fixture; it does not touch existing user projects.
            project_id = await page.evaluate('''async () => {
              const {neutralModernTheme} = await import('/src/utils/themePresets.ts');
              const workspaceUrl=performance.getEntriesByType('resource').map(entry=>entry.name)
                .find(url=>new URL(url).pathname==='/src/stores/useWorkspaceStore.ts');
              if(!workspaceUrl) throw new Error('The application workspace module has not loaded');
              const {useWorkspaceStore} = await import(workspaceUrl);
              const store = window.__projectStore.getState();
              const id = store.initNewProject({name:'交付历史浏览器验证',deviceProfile:'pc',designSystem:neutralModernTheme,createSpecimen:false});
              const html = '<main data-nid="root0001" class="col gap-4 p-6"><h1 data-nid="title001" class="text-xl font-bold">页面交付验证</h1><button data-nid="action01" class="btn btn-primary">提交</button></main>';
              store.addScreen({name:'提交页',htmlContent:html,position:{x:0,y:0}},'delivery-screen');
              useWorkspaceStore.setState({view:'workspace',activeProjectId:id});
              store.stageScreenChange('delivery-screen',html.replace('>提交</button>','>确认提交</button>'),'交付候选','将按钮文案改为确认提交');
              return id;
            }''')
            await page.wait_for_function("window.__projectStore.getState().stagedRenderQuality?.report.status === 'complete'", timeout=20000)
            report = await page.evaluate('window.__projectStore.getState().getStagedDeliveryReport()')
            assert report['status'] == 'ready', report
            candidate_result = None
            if args.candidate_preview:
                await page.wait_for_function("window.__projectStore.getState().stagedPreview?.report?.status === 'ready' && !window.__projectStore.getState().stagedPreview?.pending && window.__projectStore.getState().stagedPreview?.key === window.__projectStore.getState().getStagedRenderContextKey() && window.__projectStore.getState().stagedCandidateSaveStatus === 'saved'")
                initial = await page.evaluate("({id:window.__projectStore.getState().stagedScreen.candidateId,preview:window.__projectStore.getState().stagedPreview.report})")
                await page.get_by_text('查看验收记录', exact=True).click()
                candidate_panel = page.get_by_label('候选首屏预览', exact=True)
                candidate_image = candidate_panel.get_by_role('img', name='交付候选 · 候选首屏预览', exact=True)
                await candidate_image.wait_for()
                await candidate_image.evaluate('(img) => img.decode()')
                await candidate_image.scroll_into_view_if_needed()
                candidate_screenshot = args.screenshot.with_stem(args.screenshot.stem + '-candidate')
                candidate_screenshot.parent.mkdir(parents=True, exist_ok=True)
                await page.screenshot(path=str(candidate_screenshot))
                await page.reload(wait_until='networkidle')
                await page.wait_for_function('Boolean(window.__projectStore)')
                await page.evaluate('''async id => {
                  const workspaceUrl=performance.getEntriesByType('resource').map(entry=>entry.name)
                .find(url=>new URL(url).pathname==='/src/stores/useWorkspaceStore.ts');
              if(!workspaceUrl) throw new Error('The application workspace module has not loaded');
              const {useWorkspaceStore} = await import(workspaceUrl);
                  const store=window.__projectStore;
                  const restore=store.getState().restoreStagedCandidate;
                  // Observe the real restore result synchronously, before the new iframe can finish.
                  store.setState({restoreStagedCandidate:(...args)=>{
                    const result=restore(...args), s=store.getState();
                    window.__previewRestoration={hadHistoricalImage:s.stagedScreen?.preview?.status==='ready',
                      liveRenderCleared:s.stagedRenderQuality===null,delivery:s.getStagedDeliveryReport().status};
                    return result;
                  }});
                  useWorkspaceStore.getState().openProject(id);
                }''', project_id)
                await page.wait_for_function('Boolean(window.__previewRestoration)')
                restoration = await page.evaluate('window.__previewRestoration')
                assert restoration == {'hadHistoricalImage': True, 'liveRenderCleared': True, 'delivery': 'pending'}, restoration
                await page.wait_for_function("window.__projectStore.getState().stagedPreview?.report?.status === 'ready' && !window.__projectStore.getState().stagedPreview?.pending && window.__projectStore.getState().stagedPreview?.key === window.__projectStore.getState().getStagedRenderContextKey() && window.__projectStore.getState().stagedCandidateSaveStatus === 'saved'")
                reopened = await page.evaluate("({id:window.__projectStore.getState().stagedScreen.candidateId,preview:window.__projectStore.getState().stagedPreview.report})")
                assert reopened['id'] == initial['id']
                assert reopened['preview']['relPath'] != initial['preview']['relPath']
                await page.get_by_text('查看验收记录', exact=True).click()
                await candidate_image.wait_for()
                await candidate_image.evaluate('(img) => img.decode()')
                assert await page.evaluate('''async path => {
                  const {createProjectStorage}=await import('/src/services/storage/projectStorage.ts');
                  return !(await createProjectStorage(window.__projectStore.getState().id).exists(path));
                }''', initial['preview']['relPath'])
                candidate_result = {'initial': initial, 'reopened': reopened, 'restoration': restoration,
                                    'screenshot': str(candidate_screenshot)}
                await page.get_by_text('查看验收记录', exact=True).click()
            await page.get_by_role('button', name='采纳新版 (替换原版)', exact=True).last.click()
            await page.wait_for_function('window.__projectStore.getState().stagedScreen === null')
            inspector = page.get_by_role('button', name='元素属性', exact=True)
            if await inspector.get_attribute('aria-pressed') != 'true':
                await inspector.click()
            history = page.get_by_label('页面交付历史')
            await history.get_by_text('替换原页 · 已应用', exact=False).wait_for()
            await history.locator('summary').first.click()
            await history.get_by_text('将按钮文案改为确认提交', exact=True).wait_for()
            await history.get_by_text('交付首屏预览', exact=True).click()
            preview = history.get_by_role('img', name='提交页 · 交付首屏预览', exact=True)
            await preview.wait_for()
            await preview.evaluate('(img) => img.decode()')
            assert await preview.evaluate('(img) => img.naturalWidth === 1440 && img.naturalHeight === 900')
            preview_record = await page.evaluate('''async () => {
              const {DeliveryRepository} = await import('/src/services/storage/deliveryRepository.ts');
              const {createProjectStorage} = await import('/src/services/storage/projectStorage.ts');
              const s=window.__projectStore.getState();
              const records=await new DeliveryRepository(createProjectStorage(s.id),s.id).listForScreen('delivery-screen');
              return records.records[0].preview;
            }''')
            assert preview_record['status'] == 'ready', preview_record
            if candidate_result:
                assert await page.evaluate('''async path => {
                  const {createProjectStorage}=await import('/src/services/storage/projectStorage.ts');
                  return !(await createProjectStorage(window.__projectStore.getState().id).exists(path));
                }''', candidate_result['reopened']['preview']['relPath'])
            args.screenshot.parent.mkdir(parents=True, exist_ok=True)
            await page.screenshot(path=str(args.screenshot))
            await page.reload(wait_until='networkidle')
            await page.wait_for_function('Boolean(window.__projectStore)')
            await page.evaluate('''async id => {
              const workspaceUrl=performance.getEntriesByType('resource').map(entry=>entry.name)
                .find(url=>new URL(url).pathname==='/src/stores/useWorkspaceStore.ts');
              if(!workspaceUrl) throw new Error('The application workspace module has not loaded');
              const {useWorkspaceStore} = await import(workspaceUrl);
              useWorkspaceStore.getState().openProject(id);
            }''', project_id)
            if await inspector.get_attribute('aria-pressed') != 'true':
                await inspector.click()
            await page.get_by_label('页面交付历史').get_by_text('替换原页 · 已应用', exact=False).wait_for()
            await history.locator('summary').first.click()
            await history.get_by_text('交付首屏预览', exact=True).click()
            await preview.wait_for()
            await preview.evaluate('(img) => img.decode()')
            assert await page.evaluate("window.__projectStore.getState().screens['delivery-screen'].htmlContent.includes('确认提交')")
            assert await page.evaluate('window.__projectStore.getState().stagedScreen === null')
            result = {'status': 'passed', 'browser': args.browser, 'version': browser.version,
                      'renderChecks': report, 'preview': preview_record,
                      'candidatePreview': candidate_result,
                      'reopen': 'delivery history and decodable PNG retained', 'screenshot': str(args.screenshot)}
            if args.report:
                args.report.parent.mkdir(parents=True, exist_ok=True)
                args.report.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
            print(json.dumps(result, ensure_ascii=False))
        except Exception:
            diagnostic = await page.evaluate('''() => {
              const s=window.__projectStore?.getState();
              return s ? {projectId:s.id,screenOrder:s.screenOrder,candidate:s.stagedScreen?.candidateId,
                render:s.stagedRenderQuality,preview:s.stagedPreview && {pending:s.stagedPreview.pending,report:s.stagedPreview.report},
                save:s.stagedCandidateSaveStatus,delivery:s.getStagedDeliveryReport(),iframes:document.querySelectorAll('iframe').length} : {};
            }''')
            print(json.dumps({'status':'failed','browser':args.browser,'pageErrors':page_errors,'diagnostic':diagnostic}, ensure_ascii=False))
            args.screenshot.parent.mkdir(parents=True, exist_ok=True)
            await page.screenshot(path=str(args.screenshot.with_stem(args.screenshot.stem + '-failure')))
            raise
        finally:
            await browser.close()

if __name__ == '__main__':
    asyncio.run(main(arguments()))
