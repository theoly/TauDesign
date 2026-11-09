#!/usr/bin/env python3
"""Real IndexedDB transactions with synthetic dropped responses; not final candidate publication."""
import argparse
import asyncio
import json
from pathlib import Path
from playwright.async_api import async_playwright


async def run(args):
    args.output.mkdir(parents=True,exist_ok=False)
    rows=[]
    async with async_playwright() as p:
        for engine in ['chromium','webkit']:
            browser=await getattr(p,engine).launch(headless=True)
            try:
                page=await browser.new_page()
                errors=[]
                page.on('pageerror',lambda error:errors.append(str(error)))
                await page.goto('http://127.0.0.1:5174/test/fixtures/project-publication-ack.html',wait_until='networkidle')
                await page.wait_for_function('Boolean(window.checkPublicationAck)')
                result=await page.evaluate('checkPublicationAck()')
                assert len(result['checks'])==4 and all(c['writes']==1 and c['explicitReopen'] for c in result['checks']),result
                assert not errors,errors
                rows.append({'engine':engine,**result,'pageErrors':errors})
            finally:
                await browser.close()
    (args.output/'results.json').write_text(json.dumps({'status':'passed','scope':__doc__,'checks':rows},ensure_ascii=False,indent=2))
    print(json.dumps(rows,ensure_ascii=False))


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--output',type=Path,required=True)
    asyncio.run(run(parser.parse_args()))
