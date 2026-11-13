#!/usr/bin/env python3
"""Bounded photo-only cold/warm navigation audit of the real candidate canvas.

No failure injection, Provider calls, original-project IO, adoption or exports.
Register promises are observed without suppressing their rejection. Old-document
events are retained separately from failures in the current document.
"""
import argparse,asyncio,base64,hashlib,json,time
from pathlib import Path
from urllib.parse import urlparse
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[1]
BASE='http://127.0.0.1:5174/test/fixtures/media-delivery.html'
MEDIA=ROOT/'doc/draft-targeted-repair/evidence/media-delivery'
INPUTS=['scripts/verify-media-reopen.py','test/fixtures/media-delivery.html','src/services/storage/mediaResourceSession.ts','src/hooks/useScreenResources.ts','src/components/canvas/ScreenFrame.tsx','public/media-resource-worker.js']
digest=lambda value:hashlib.sha256(value).hexdigest()
TRACE="""(()=>{const d={id:crypto.randomUUID(),url:location.href};window.mediaDocument=d;
 const log=(type,extra={})=>console.log('MEDIAREOPEN:'+JSON.stringify({...d,type,...extra}));
 if(navigator.serviceWorker){const original=navigator.serviceWorker.register.bind(navigator.serviceWorker);navigator.serviceWorker.register=(...args)=>{log('register-start');return original(...args).then(r=>{log('register-resolved');return r;},e=>{log('register-rejected',{name:e.name,message:e.message});throw e;});}}
 addEventListener('unhandledrejection',e=>log('unhandled-rejection',{name:e.reason?.name,message:String(e.reason?.message??e.reason)}));})();"""

async def until(page,expression,predicate,seconds=25):
    end=time.monotonic()+seconds
    while True:
        value=await page.evaluate(expression)
        if predicate(value):return value
        if time.monotonic()>end:raise AssertionError({'expression':expression,'last':value})
        await asyncio.sleep(.04)

async def main(args):
    args.output.mkdir(parents=True,exist_ok=False)
    manifest=json.loads((MEDIA/'media-manifest.json').read_text());photo=next(f for f in manifest['files'] if f['mimeType']=='image/png');data=(MEDIA/photo['file']).read_bytes();assert digest(data)==photo['sha256']
    inputs={name:digest((ROOT/name).read_bytes()) for name in INPUTS}
    report={'status':'running','scope':__doc__.strip(),'video':'excluded','checks':[],'initialDocuments':[],'events':[],'pageErrors':[],'blockedRequests':[],'cleanupWarnings':[],'sourceInputs':inputs}
    def save():
        report['sourceInputsUnchanged']=inputs=={name:digest((ROOT/name).read_bytes()) for name in INPUTS}
        (args.output/'result.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
    async with async_playwright() as p:
        for engine in ['chromium','webkit']:
            browser=await getattr(p,engine).launch()
            try:
                for trigger in ['register','image']:
                    context=await browser.new_context(viewport={'width':1500,'height':1100});state={'document':None,'navigation':None};events=[];errors=[]
                    async def guard(route):
                        url=urlparse(route.request.url)
                        if url.scheme in ['http','https','ws','wss'] and (url.hostname not in ['localhost','127.0.0.1'] or '/api/ai-' in url.path):
                            report['blockedRequests'].append(route.request.url);await route.abort()
                        else:await route.continue_()
                    await context.route('**/*',guard)
                    async def io(payload):
                        assert payload=={'op':'photo-input'}
                        return {'file':{**photo,'bytes':base64.b64encode(data).decode()},'excluded':['video']}
                    await context.expose_function('fixtureIO',io);await context.add_init_script(TRACE)
                    async def new_page():
                        page=await context.new_page();page.set_default_timeout(20000)
                        def console(message,_engine=engine,_trigger=trigger):
                            if message.text.startswith('MEDIAREOPEN:'):
                                row={'engine':_engine,'trigger':_trigger,'observedAt':time.monotonic(),**json.loads(message.text[12:])};events.append(row);report['events'].append(row)
                        page.on('console',console)
                        def onerror(error,_engine=engine,_trigger=trigger,_state=state):
                            errors.append({'engine':_engine,'trigger':_trigger,'observedAt':time.monotonic(),'observedUrl':page.url,'message':str(error),'lastCommittedDocument':_state['document'],'navigation':dict(_state['navigation']) if _state['navigation'] else None})
                        page.on('pageerror',onerror)
                        return page
                    page=await new_page()
                    try:
                        await page.goto(BASE);await page.wait_for_function('window.fixture')
                        await until(page,"fixture.state().stagedCandidateSaveStatus",lambda v:v=='saved')
                        seed=await page.evaluate("async()=>{const h=(await import('/src/stores/useHistoryStore.ts')).useHistoryStore.getState();return {projectId:fixture.state().id,candidateId:fixture.state().stagedScreen.candidateId,html:fixture.state().screens[fixture.target].htmlContent,history:{past:h.past.length,future:h.future.length},document:mediaDocument};}")
                        state['document']=seed['document'];report['initialDocuments'].append({'engine':engine,'trigger':trigger,**seed['document']})
                        if trigger=='register':
                            await until(page,"!!navigator.serviceWorker.controller || !!navigator.serviceWorker.getRegistration",bool)
                            end=time.monotonic()+10
                            while not any(e['type']=='register-start' and e['id']==seed['document']['id'] for e in events):
                                if time.monotonic()>end:raise AssertionError('No actual register call observed before navigation')
                                await asyncio.sleep(.01)
                        else:
                            await page.wait_for_function("[...document.querySelectorAll('iframe')].some(f=>f.contentDocument?.querySelector('img')?.src.includes('/__aidesign_media/'))")
                        url=BASE+'?resume='+seed['projectId'];previous_urls=[]
                        for index,mode in enumerate(['cold-reopen','reload','goto','replace-tab']):
                            state['navigation']={'mode':mode,'sourceDocument':state['document'],'targetUrl':url,'requestedAt':time.monotonic()}
                            if mode=='reload':await page.reload()
                            elif mode=='replace-tab':await page.close();page=await new_page();await page.goto(url)
                            else:await page.goto(url)
                            await page.wait_for_function('window.fixture');active=await page.evaluate('mediaDocument')
                            state['document']=active;state['navigation']['committedAt']=time.monotonic();state['navigation']['activeDocument']=active
                            await until(page,'fixture.report().status',lambda v:v=='ready')
                            result=await page.evaluate('''async()=>{const s=fixture.state(),doc=[...document.querySelectorAll('iframe')].map(f=>f.contentDocument).find(d=>d?.querySelector('h1')?.textContent==='独立照片交付验证');if(!doc)throw Error('Current candidate iframe missing');const image=doc.querySelector('img');await image.decode();const response=await fetch(image.currentSrc),bytes=await response.arrayBuffer(),sha=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');const cache=await caches.open('taudesign-preview-media-v1');return {candidateId:s.stagedScreen.candidateId,restored:s.stagedScreen.restoredFromDisk,html:s.screens[fixture.target].htmlContent,render:s.stagedRenderQuality.report.status,modelCalls:fixture.models(),image:{url:image.currentSrc,width:image.naturalWidth,height:image.naturalHeight,status:response.status,sha256:sha},cacheUrls:(await cache.keys()).map(r=>r.url),controller:navigator.serviceWorker.controller?.scriptURL};}''')
                            assert result['candidateId']==seed['candidateId'] and result['restored'] and result['html']==seed['html']
                            history=await page.evaluate("async()=>{const h=(await import('/src/stores/useHistoryStore.ts')).useHistoryStore.getState();return {past:h.past.length,future:h.future.length};}")
                            assert history==seed['history'],'Navigation changed History'
                            assert result['render']=='complete' and result['modelCalls']==0 and result['image']['sha256']==photo['sha256'] and result['image']['width']==356 and result['image']['status']==200
                            assert '/__aidesign_media/' in result['image']['url'] and result['image']['url'] in result['cacheUrls']
                            assert not await page.get_by_role('button',name='重试页面资源',exact=True).count(),'Natural navigation required manual recovery'
                            row={'engine':engine,'trigger':trigger,'mode':mode,'navigation':dict(state['navigation']),'activeDocument':active,'history':history,'candidateRevalidated':True,'sourceHtmlSha256':digest(result.pop('html').encode()),'oldUrlsStillCached':[u for u in previous_urls if u in result['cacheUrls']],**result}
                            previous_urls=result['cacheUrls'];report['checks'].append(row);save();print(engine,trigger,mode,'ready',len(result['cacheUrls']),'cache entries',flush=True)
                        actual_errors=[e for e in errors if not e['message'].startswith('ResizeObserver loop')]
                        report['pageErrors'].extend(errors)
                        # Registration rejection can belong to a discarded document;
                        # its pageerror lacks provenance, so retain it for review.
                        if actual_errors:report.setdefault('unclassifiedBrowserErrors',[]).extend(actual_errors)
                    except Exception as error:
                        report['status']='failed';report['error']=str(error)
                        try:report['lastState']=await page.evaluate('({document:window.mediaDocument,report:window.fixture?.report(),body:document.body.innerText})');await page.screenshot(path=str(args.output/f'{engine}-{trigger}-failure.png'))
                        except Exception:pass
                        save();raise
                    finally:
                        try:await asyncio.wait_for(context.close(),5)
                        except asyncio.TimeoutError:report['cleanupWarnings'].append({'engine':engine,'trigger':trigger,'contextCloseTimedOut':True})
            finally:
                try:await asyncio.wait_for(browser.close(),5)
                except asyncio.TimeoutError:report['cleanupWarnings'].append({'engine':engine,'browserCloseTimedOut':True})
    assert len(report['checks'])==16 and not report['blockedRequests'] and report['sourceInputsUnchanged']
    report['status']='passed-with-browser-errors' if report.get('unclassifiedBrowserErrors') else 'passed';save();print(report['status'],len(report['checks']),'checks',flush=True)

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--output',required=True,type=Path)
    asyncio.run(asyncio.wait_for(main(parser.parse_args()),240))
