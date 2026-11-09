#!/usr/bin/env python3
"""Run the frozen 48-task design experiment through the real app engine/localhost proxy.

Requires Vite at 127.0.0.1:5174. Reads only the native current code binding;
credentials stay in memory. No user project is loaded. No selective retries.
"""
import argparse
import asyncio
import hashlib
import importlib.util
import json
import subprocess
import time
import struct
from pathlib import Path
from playwright.async_api import async_playwright
from lib.design_experiment_journal import exclusive_json, heartbeat, experiment_lock, dispatch_state

ROOT = Path(__file__).resolve().parents[1]
ORIGIN = 'http://127.0.0.1:5174'
HMR_STUB = """export const createHotContext=()=>({accept(){},dispose(){},prune(){},on(){},invalidate(){},data:{}});
export const injectQuery=(url)=>url;export const updateStyle=()=>{};export const removeStyle=()=>{};"""


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def current_binding():
    spec = importlib.util.spec_from_file_location('native_binding', ROOT/'scripts/verify-live-provider.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    binding, _ = module.current_binding()
    return binding, digest(json.dumps(binding, sort_keys=True, separators=(',', ':'), ensure_ascii=False))


def source_fingerprint():
    code = "import {captureDesignInputs,sha256} from './scripts/lib/designEvidenceInputs';process.stdout.write(sha256(JSON.stringify(await captureDesignInputs(process.cwd()))));"
    return subprocess.run(['bun', '-e', code], cwd=ROOT, capture_output=True, text=True, check=True).stdout.strip()


def read_plan(output):
    # Use the same plan validator/serialization as preparation; no Python JSON hash drift.
    code = "import{readFile}from'node:fs/promises';import{sha256}from'./scripts/lib/designEvidenceInputs';import{assertExperimentPlan}from'./src/services/ai/designKnowledge/experiment';const folder=process.argv[1],p=JSON.parse(await readFile(folder+'/plan.json','utf8')),m=JSON.parse(await readFile(folder+'/input-manifest.json','utf8'));assertExperimentPlan(p);if(sha256(JSON.stringify(p))!==m.planFingerprint)throw Error('Plan changed');process.stdout.write(JSON.stringify(p));"
    return json.loads(subprocess.run(['bun', '-e', code, str(output)], cwd=ROOT, capture_output=True, text=True, check=True).stdout)


def scrub(value, binding):
    raw = str(binding['provider'].get('apiKey') or '')
    clean = raw.strip()
    if clean.lower().startswith('bearer '):
        clean = clean[7:].strip()
    text = json.dumps(value, ensure_ascii=False)
    # Redact individual strings before JSON serialization to handle escaped credentials too.
    def visit(item):
        if isinstance(item, str):
            for secret in [raw, clean]:
                if secret:
                    item = item.replace(secret, '[REDACTED]')
            return item
        if isinstance(item, list):
            return [visit(v) for v in item]
        if isinstance(item, dict):
            return {k: visit(v) for k, v in item.items() if k.lower() not in ['apikey', 'authorization']}
        return item
    return visit(json.loads(text))


def fatal_provider_status(value):
    """A systemic account/rate failure is not a reason to dispatch every remaining task."""
    return next((request.get('httpStatus') for request in value.get('requests', []) if request.get('httpStatus') in [401,402,403,429]), None)


async def runtime_fingerprints(page):
    facts = await page.evaluate('trialHarness.facts()')
    return {name+'Fingerprint': digest(facts[name+'Json']) for name in ['theme', 'checker', 'budget']}


async def capture_page(context, document, device, directory):
    page = await context.new_page()
    try:
        await page.set_viewport_size({'width': 390 if device == 'mobile' else 1440, 'height': 844 if device == 'mobile' else 900})
        await page.set_content(document, wait_until='load')
        await page.evaluate('document.fonts.ready')
        dimensions = await page.evaluate('({width:innerWidth,height:Math.max(document.documentElement.scrollHeight,document.body.scrollHeight)})')
        if dimensions['height'] > 32760:
            raise ValueError('Preview exceeds screenshot limit; not cropped and claimed complete')
        png=await page.screenshot(path=str(directory/'page.png'), full_page=True, animations='disabled')
        width,height=struct.unpack('>II',png[16:24])
        exclusive_json(directory/'image.json', {'engine': 'playwright-chromium', 'scope': 'browser-export-document', 'viewport':dimensions,'width':width,'height':height,'sha256':hashlib.sha256(png).hexdigest()})
    finally:
        await page.close()


async def run(args):
    output = args.output.resolve()
    with experiment_lock(output):
        binding, provider_hash = current_binding()
        source_hash = source_fingerprint()
        async with async_playwright() as pw:
            browser = await pw.chromium.launch(headless=True)
            try:
                context = await browser.new_context(viewport={'width': 1600, 'height': 1100}, locale='zh-CN')
                external = []
                async def guard(route):
                    if route.request.url.startswith((ORIGIN+'/', 'data:', 'blob:')):
                        await route.fallback()
                    else:
                        external.append('blocked-external-resource')
                        await route.abort()
                await context.route('**/*', guard)
                await context.route('**/@vite/client', lambda route: route.fulfill(status=200, content_type='application/javascript', body=HMR_STUB))
                page = await context.new_page()
                await page.goto(ORIGIN+'/test/fixtures/design-experiment.html', wait_until='networkidle')
                await page.wait_for_function('!!window.trialHarness')
                fingerprints = await runtime_fingerprints(page)
                identity = {'providerId': binding['provider']['id'], 'model': binding['model'], 'providerFingerprint': provider_hash, 'sourceFingerprint': source_hash, **fingerprints}
                if not (output/'plan.json').exists():
                    subprocess.run(['bun', 'scripts/design-experiment.ts', 'prepare', '--output', str(output), '--seed', str(args.seed)], input=json.dumps(identity), cwd=ROOT, text=True, check=True, capture_output=True)
                plan = read_plan(output)
                if plan['identity'] != identity:
                    raise ValueError('Frozen identity changed; old experiment cannot resume with new inputs')
                async def verify():
                    if source_fingerprint() != source_hash or current_binding()[1] != provider_hash or await runtime_fingerprints(page) != fingerprints:
                        raise ValueError('Source, binding or runtime changed; experiment stopped')
                completed = 0
                for item in plan['runs']:
                    await verify()
                    state = dispatch_state(output, plan, item)
                    if state != 'new':
                        continue
                    directory = output/'runs'/item['id']
                    started = time.monotonic()
                    await page.evaluate('input=>trialHarness.start(input)', {'plan': plan, 'runId': item['id'], 'binding': binding})
                    while True:
                        poll = await page.evaluate('trialHarness.poll()')
                        heartbeat(directory/'progress.json', {'runId': item['id'], 'observedAt': time.time(), 'elapsedSeconds': time.monotonic()-started, **poll})
                        if poll['done']:
                            break
                        if time.monotonic()-started > 960:
                            await page.evaluate('trialHarness.cancel()')
                            raise TimeoutError('Trial did not settle after its parent deadline; retain incomplete dispatch')
                        await asyncio.sleep(1)
                    value = await page.evaluate('trialHarness.result()')
                    if not value or value['scope'] != 'live-current-binding':
                        raise ValueError('No genuine live trial result; retain incomplete dispatch')
                    value = scrub(value, binding)
                    await verify()
                    if value.get('standaloneHtml'):
                        (directory/'page.html').write_text(value['standaloneHtml'])
                    if value.get('renderDocument'):
                        (directory/'render.html').write_text(value['renderDocument'])
                        try:
                            scenario = next(s for s in plan['scenarios'] if s['id'] == item['scenarioId'])
                            await capture_page(context, value['renderDocument'], scenario['device'], directory)
                            value['record']['imageReady'] = True
                        except Exception as error:
                            value['imageError'] = type(error).__name__
                    await verify()
                    value['record']['durationMs'] = (time.monotonic()-started)*1000
                    value['network'] = {'blockedExternalResources': len(external)}
                    exclusive_json(directory/'evidence.json', value)
                    exclusive_json(directory/'record.json', value['record'])
                    completed += 1
                    print(json.dumps({'runId': item['id'], 'status': value['record']['status'], 'requests': value['record']['requests'], 'imageReady': value['record']['imageReady'], 'completedThisSession': completed}), flush=True)
                    fatal=fatal_provider_status(value)
                    if fatal:
                        exclusive_json(output/('provider-stop-'+str(time.time_ns())+'.json'), {'runId':item['id'],'httpStatus':fatal,'reason':'Account/access/rate issue; remaining tasks were not dispatched. Correct the provider before a new complete experiment.'})
                        print(json.dumps({'status':'provider-stopped','httpStatus':fatal,'remainingNotDispatched':len(plan['runs'])-sum((output/'runs'/row['id']/'record.json').exists() for row in plan['runs'])}),flush=True)
                        break
                    if args.max_runs and completed >= args.max_runs:
                        break
                subprocess.run(['bun', 'scripts/design-experiment.ts', 'bundle', '--output', str(output)], cwd=ROOT, check=True)
            finally:
                await browser.close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--seed', type=int, default=20261103)
    parser.add_argument('--max-runs', type=int, help='Bound a session only; no planned rows are removed')
    args = parser.parse_args()
    if args.max_runs is not None and args.max_runs < 1:
        parser.error('--max-runs must be positive')
    asyncio.run(run(args))
