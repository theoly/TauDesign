#!/usr/bin/env python3
"""Actual store, iframe and archive boundaries; no model or external network traffic."""
import argparse,asyncio,json
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output',required=True)
OUT=(ROOT/parser.parse_args().output).resolve()
async def main():
    OUT.mkdir(parents=True,exist_ok=True)
    (OUT/'result.json').unlink(missing_ok=True)
    results=[]
    async with async_playwright() as p:
        for engine in ['chromium','webkit']:
            browser=await getattr(p,engine).launch(headless=True)
            page=await browser.new_page(viewport={'width':1500,'height':1000})
            errors=[];external=[]
            page.on('pageerror',lambda error:errors.append(str(error)))
            async def route(request):
                if request.request.url.startswith(('http://127.0.0.1:5174/','data:','blob:')):await request.continue_()
                else:external.append(request.request.url);await request.abort()
            await page.route('**/*',route)
            try:
                for device in ['mobile','pc']:
                    for phase in ['render','prepare','finish']:
                        await page.goto(f'http://127.0.0.1:5174/test/fixtures/restyle-lifetime.html?device={device}&phase={phase}',wait_until='networkidle')
                        await page.wait_for_function('lifetimeFixture.ready')
                        await page.evaluate('lifetimeFixture.run()')
                        await page.wait_for_function('lifetimeFixture.entered',timeout=15000)
                        await page.wait_for_function('lifetimeFixture.finished',timeout=10000)
                        state=await page.evaluate('''()=>{const f=lifetimeFixture;return {status:f.result.status,remaining:f.result.remaining,generated:f.generated,requests:f.budget.snapshot().requests,
                          outcomes:f.result.outcomes.map(o=>o.status),history:f.history().past.length-f.before,
                          original:f.state().screens.a.htmlContent===f.original,other:f.state().screens.b.htmlContent.includes('p-4')};}''')
                        committed=phase=='finish'
                        assert state=={'status':'cancelled','remaining':1,'generated':0,'requests':0,'outcomes':['applied' if committed else 'failed'],'history':1 if committed else 0,'original':not committed,'other':True},state
                        if committed:
                            await page.evaluate('lifetimeFixture.history().undo()')
                            assert await page.evaluate('lifetimeFixture.state().screens.a.htmlContent===lifetimeFixture.original')
                            await page.evaluate('lifetimeFixture.history().redo()')
                        await page.evaluate('lifetimeFixture.release()')
                        await page.wait_for_function('lifetimeFixture.applicationSettled',timeout=15000)
                        assert await page.evaluate('lifetimeFixture.history().past.length-lifetimeFixture.before')==(1 if committed else 0)
                        assert await page.evaluate('lifetimeFixture.state().screens.a.htmlContent===lifetimeFixture.original')== (not committed)
                        assert await page.evaluate('lifetimeFixture.state().screens.b.htmlContent.includes("p-4")')
                        records=await page.evaluate('lifetimeFixture.records()')
                        assert records['invalidFiles']==0,records
                        assert [r['status'] for r in records['records']]==([] if phase=='render' else ['applied' if committed else 'aborted']),records
                        assert not errors and not external,(errors,external)
                        await page.screenshot(path=str(OUT/f'{engine}-{device}-{phase}.png'))
                        result={'engine':engine,'device':device,'phase':phase,'status':'passed','lateApplicationSettled':True,'archiveStatuses':[r['status'] for r in records['records']],**state}
                        result['status']='passed';results.append(result)
                        print(json.dumps(result),flush=True)
            except Exception:
                await page.screenshot(path=str(OUT/f'{engine}-failed.png'),full_page=True)
                raise
            finally:await browser.close()
    (OUT/'result.json').write_text(json.dumps(results,indent=2)+'\n')
if __name__=='__main__':asyncio.run(main())
