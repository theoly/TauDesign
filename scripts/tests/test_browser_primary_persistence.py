#!/usr/bin/env python3
"""Ordinary no-folder project uses real IndexedDB and reopens in a fresh browser process.

Synthetic temporary browser profiles only, no Provider or user data. Not final candidate publication.
"""
import argparse
import asyncio
import json
import tempfile
import uuid
from pathlib import Path
from playwright.async_api import async_playwright


async def run(args):
    args.output.mkdir(parents=True,exist_ok=False);rows=[]
    async with async_playwright() as p:
        for engine in ['chromium','webkit']:
            with tempfile.TemporaryDirectory(prefix='designer-primary-reopen-',dir='/private/tmp') as profile:
                url='http://127.0.0.1:5174/test/fixtures/project-authoring.html?primary=1&group='+str(uuid.uuid4());errors=[]
                context=await getattr(p,engine).launch_persistent_context(profile,headless=True)
                try:
                    page=await context.new_page();page.on('pageerror',lambda error:errors.append(str(error)));await page.goto(url,wait_until='networkidle');await page.wait_for_function('Boolean(window.projectAuthoringFixture)')
                    created=await page.evaluate('projectAuthoringFixture.create()');assert created['author'] and created['status']=='saved' and created['originalKey'] is None,created
                    await page.evaluate('id=>projectAuthoringFixture.poisonCache(id)',created['id'])
                finally:await context.close()
                context=await getattr(p,engine).launch_persistent_context(profile,headless=True)
                try:
                    page=await context.new_page();page.on('pageerror',lambda error:errors.append(str(error)));await page.goto(url,wait_until='networkidle');await page.wait_for_function('Boolean(window.projectAuthoringFixture)')
                    restored=await page.evaluate('id=>projectAuthoringFixture.openSaved(id)',created['id']);assert restored['snapshot']==created['snapshot'] and restored['name']=='真实浏览器新建工程' and '新建完整正文' in restored['page'] and len(restored['history'])==1,restored
                    assert not errors,errors;rows.append({'engine':engine,'newBrowserProcess':True,'exactSnapshotReopen':True,'staleCacheIgnored':True,'pageHistoryPaired':True,'identity':restored['snapshot']['identity'],'pageErrors':errors})
                finally:await context.close()
    result={'status':'passed','scope':__doc__,'checks':rows};(args.output/'results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));print(json.dumps(result,ensure_ascii=False))


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--output',required=True,type=Path);asyncio.run(run(parser.parse_args()))
