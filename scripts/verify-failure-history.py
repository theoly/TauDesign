#!/usr/bin/env python3
"""Isolated browser replay: real codec/image processing + monthly history + chat remount, no Provider traffic."""
import argparse, asyncio, json
from pathlib import Path
from playwright.async_api import async_playwright

parser = argparse.ArgumentParser()
parser.add_argument('--output', default='doc/failure-conversation-history/evidence/2026-11-12-browser')
args = parser.parse_args()
out = Path(args.output)
out.mkdir(parents=True, exist_ok=True)

async def main():
    results = []
    async with async_playwright() as p:
        for name in ['chromium', 'webkit']:
            browser = await getattr(p, name).launch(headless=True)
            try:
                for device in ['mobile', 'pc']:
                    page = await browser.new_page(viewport={'width': 1120, 'height': 1000})
                    errors, external = [], []
                    page.on('pageerror', lambda error: errors.append(str(error)))
                    async def route(r):
                        if r.request.url.startswith(('http://127.0.0.1:5174/', 'data:', 'blob:', 'about:')):
                            await r.continue_()
                        else:
                            external.append(r.request.url)
                            await r.abort()
                    await page.route('**/*', route)
                    await page.goto(f'http://127.0.0.1:5174/test/fixtures/retry-reference.html?device={device}')
                    await page.wait_for_function('window.retryReferenceFixture?.ready')
                    await page.locator('#run').click()
                    await page.wait_for_function("document.querySelector('input[type=file]').files.length===0 && document.querySelector('textarea').value.includes('基础资料')")
                    request = await page.locator('textarea').input_value()
                    await page.get_by_title('发送设计诉求 (Enter)').click()
                    await page.get_by_text('失败记录已保存到对话历史。', exact=True).wait_for(timeout=30000)
                    rows = await page.evaluate('retryReferenceFixture.state().getConversationStore().loadRecent()')
                    assert len(rows) == 1 and rows[0]['assistant']['failure']['status'] == 'failed', rows
                    assert rows[0]['user']['text'] == request
                    assert rows[0]['user']['attachments'][0].startswith('assets/images/')
                    serialized = json.dumps(rows)
                    assert not any(v in serialized for v in ['SYNTHETIC_NOT_A_KEY', 'data:image', 'image_url'])
                    assert await page.evaluate("retryReferenceFixture.requests.map(r=>r.kind)") == ['vision', 'plan', 'code', 'code']
                    await page.evaluate('retryReferenceFixture.reopenChat()')
                    await page.get_by_text('历史失败记录', exact=False).wait_for(timeout=10000)
                    await page.get_by_text('查看失败诊断', exact=True).click()
                    await page.get_by_text('重新使用该需求', exact=True).click()
                    assert await page.locator('textarea').input_value() == request
                    value = await page.evaluate('''async()=>({
                      calls:retryReferenceFixture.requests.map(r=>r.kind),
                      sourceUnchanged:retryReferenceFixture.state().screens.source.htmlContent===retryReferenceFixture.original,
                      historyUnchanged:retryReferenceFixture.history().past.length===retryReferenceFixture.before,
                      noCandidate:!retryReferenceFixture.state().stagedScreen,
                      turns:(await retryReferenceFixture.state().getConversationStore().loadRecent()).length,
                      attachmentCount:document.querySelector('input[type=file]').files.length,
                      autoRetryActions:[...document.querySelectorAll('button')].filter(b=>/继续生成（保留图片解析）|直接重试（复用规划）/.test(b.textContent)).length
                    })''')
                    assert value['calls'] == ['vision', 'plan', 'code', 'code']
                    assert all(value[k] for k in ['sourceUnchanged', 'historyUnchanged', 'noCandidate'])
                    assert value['turns'] == 1 and value['attachmentCount'] == 0 and value['autoRetryActions'] == 0, value
                    assert not errors and not external, (errors, external)
                    await page.screenshot(path=str(out / f'{name}-{device}-restored.png'), full_page=True)
                    results.append({'engine': name, 'device': device, 'status': 'passed', **value, 'pageErrors': errors, 'externalRequests': external})
                    await page.close()
            finally:
                await browser.close()
    (out / 'result.json').write_text(json.dumps({'status': 'passed', 'scope': 'synthetic transport; actual browser image/codec/pipeline, monthly JSONL, ChatDrawer remount and text-only reuse', 'results': results}, ensure_ascii=False, indent=2))
    print(json.dumps({'passed': len(results)}))

try:
    asyncio.run(main())
except Exception as error:
    (out / 'failure.txt').write_text(str(error))
    raise
