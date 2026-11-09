#!/usr/bin/env python3
"""Actual IndexedDB save and fresh browser-process reopen; no user profile or Provider."""
import argparse
import asyncio
import json
import tempfile
import uuid
from pathlib import Path
from playwright.async_api import async_playwright


async def run(args):
    args.output.mkdir(parents=True,exist_ok=False);results=[]
    async with async_playwright() as p:
        for engine in ['chromium','webkit']:
            with tempfile.TemporaryDirectory(prefix='designer-project-db-',dir='/private/tmp') as profile:
                group=str(uuid.uuid4());url='http://127.0.0.1:5174/test/fixtures/task-transactions.html?group='+group
                context=await getattr(p,engine).launch_persistent_context(profile,headless=True)
                try:
                    page=await context.new_page();await page.goto(url,wait_until='networkidle');await page.wait_for_function('Boolean(window.taskTransactionFixture)')
                    before=await page.evaluate('taskTransactionFixture.projectSeed()');published=await page.evaluate('expected=>taskTransactionFixture.projectPublish(expected,"saved")',before);assert published['ok'],published
                    saved=await page.evaluate('taskTransactionFixture.projectRead()')
                finally:await context.close()
                context=await getattr(p,engine).launch_persistent_context(profile,headless=True)
                try:
                    page=await context.new_page();await page.goto(url,wait_until='networkidle');await page.wait_for_function('Boolean(window.taskTransactionFixture)')
                    restored=await page.evaluate('taskTransactionFixture.projectRead()');assert restored==saved,(engine,saved,restored)
                    stale=await page.evaluate('expected=>taskTransactionFixture.projectPublish(expected,"stale")',before);assert not stale['ok'],stale
                    results.append({'engine':engine,'newBrowserProcess':True,'exactReopen':True,'identity':restored['identity'],'staleRejected':not stale['ok']})
                finally:await context.close()
    report={'scope':__doc__,'status':'passed','results':results};(args.output/'results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps(report,ensure_ascii=False))


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--output',type=Path,required=True);asyncio.run(run(parser.parse_args()))
