#!/usr/bin/env python3
"""Verify candidate controls using real pointer events and gates; user project is copied first."""
import argparse, asyncio, base64, hashlib, json, shutil, tempfile
from pathlib import Path
from playwright.async_api import async_playwright

ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--project',type=Path,help='Optional existing project, copied to a temporary directory before testing')
parser.add_argument('--output',type=Path,default=Path('doc/candidate-action-feedback/evidence'))
parser.add_argument('--actions',nargs='+',choices=['discard','replace','keep','stale'],default=['discard','replace','keep','stale'])
parser.add_argument('--devices',nargs='+',choices=['mobile','pc'],default=['mobile','pc'])
ARGS=parser.parse_args();SOURCE=ARGS.project;OUT=(ROOT/ARGS.output).resolve();OUT.mkdir(parents=True,exist_ok=True)
URL='http://127.0.0.1:5174/test/fixtures/candidate-actions.html'

def hashes(folder):
    return {str(p.relative_to(folder)):hashlib.sha256(p.read_bytes()).hexdigest() for p in folder.rglob('*') if p.is_file()}

async def run():
    before=hashes(SOURCE) if SOURCE else None
    results=[]
    async with async_playwright() as pw:
      for engine in ['chromium','webkit']:
        browser=await getattr(pw,engine).launch(headless=True)
        try:
          cases=[('synthetic',action,device) for device in ARGS.devices for action in ARGS.actions]
          if SOURCE:cases.append(('real','stale-project','project'))
          for mode,action,device in cases:
            with tempfile.TemporaryDirectory(prefix='candidate-action-') as tmp:
              clone=Path(tmp)/'project'
              if mode=='real':shutil.copytree(SOURCE,clone)
              if mode=='real' and not (clone/'candidates/current.json').exists():
                results.append({'browser':engine,'mode':mode,'action':action,'status':'skipped','reason':'No saved candidate is currently present; original project is read only.'})
                continue
              context=await browser.new_context(viewport={'width':1800,'height':1100},locale='zh-CN')
              # A separate native build can emit HTML files observed by Vite.
              # Keep verification fixtures stable by disabling the HMR client.
              await context.route('**/@vite/client',lambda route:route.fulfill(status=200,content_type='application/javascript',body='''
                const styles=new Map();
                export const createHotContext=()=>({accept(){},dispose(){},prune(){},on(){},invalidate(){},data:{}});
                export const injectQuery=(url)=>url;
                export function updateStyle(id,css){let el=styles.get(id);if(!el){el=document.createElement('style');styles.set(id,el);document.head.append(el);}el.textContent=css;}
                export function removeStyle(id){styles.get(id)?.remove();styles.delete(id);}
              '''))
              external=[]
              async def restrict(route):
                if route.request.url.startswith(('http://127.0.0.1:5174/','data:','blob:')):await route.fallback()
                else:external.append(route.request.url);await route.abort()
              await context.route('**/*',restrict)
              page=await context.new_page();errors=[]
              page.on('pageerror',lambda e:errors.append(str(e)))
              def io(payload):
                if payload['op']=='inputs':return {'id':json.loads((clone/'project.json').read_text())['id'],'folder':str(clone)}
                cmd=payload['cmd'];args=payload.get('args') or {}
                if cmd=='export_screen_png':raise RuntimeError('Browser verification uses browser PNG renderer')
                if not cmd.startswith('project_'):raise RuntimeError('Unsupported isolated command '+cmd)
                if args.get('root')!=str(clone):raise RuntimeError('Write/read outside isolated copy denied')
                p=(clone/args.get('rel','')).resolve()
                if not p.is_relative_to(clone.resolve()):raise RuntimeError('Invalid relative path')
                if cmd=='project_exists':return p.exists()
                if cmd=='project_read_text':return p.read_text() if p.exists() else None
                if cmd=='project_read_binary':return base64.b64encode(p.read_bytes()).decode() if p.exists() else None
                if cmd=='project_list_dir':return sorted(x.name for x in p.iterdir()) if p.exists() else []
                if cmd=='project_ensure_dir':p.mkdir(parents=True,exist_ok=True);return
                if cmd in ['project_read_all_lines','project_read_tail_lines']:
                  lines=p.read_text().splitlines() if p.exists() else []
                  return lines[-args['limit']:] if cmd.endswith('tail_lines') else lines
                if cmd=='project_delete':
                  if p.is_file():p.unlink()
                  return
                p.parent.mkdir(parents=True,exist_ok=True)
                if cmd=='project_write_text_atomic':p.write_text(args['contents']);return
                if cmd=='project_write_binary':p.write_bytes(base64.b64decode(args['base64Data']));return
                if cmd=='project_append_line':
                  with p.open('a') as f:f.write(args['line']+'\n')
                  return
                raise RuntimeError('Unsupported command '+cmd)
              if mode=='real':
                await page.expose_function('fixtureIO',io)
                await page.add_init_script("window.__TAURI_INTERNALS__={invoke:(cmd,args)=>window.fixtureIO({op:'invoke',cmd,args})};window.__TAURI__={core:{invoke:window.__TAURI_INTERNALS__.invoke}};")
              try:
                await page.goto(URL+'?mode='+mode+'&device='+device,wait_until='networkidle')
                await page.wait_for_function("window.fixture && fixture.report().checks.find(c=>c.id==='render').status==='passed' && fixture.report().checks.find(c=>c.id==='structure').status==='blocked'",timeout=30000)
                if mode=='synthetic':await page.evaluate("fixture.state().setViewportTransform({x:40,y:220,scale:fixture.device==='pc'?0.45:0.85})")
                toolbar=page.get_by_test_id('candidate-actions-toolbar')
                replace=toolbar.get_by_role('button',name='采纳新版 (替换原版)',exact=True)
                keep=toolbar.get_by_role('button',name='两版都留',exact=True)
                ack=toolbar.get_by_role('checkbox',name='我已检查并接受这次结构变化',exact=True)
                assert await replace.is_disabled() and await keep.is_disabled()
                layers=await page.evaluate('''()=>{const mask=document.querySelector('[data-testid="comparison-backdrop"]'),target=document.getElementById('screen-frame-'+fixture.target),candidate=document.getElementById('screen-frame-staged-screen-preview'),other=document.getElementById('screen-frame-other'),toolbar=document.querySelector('[data-testid="candidate-actions-toolbar"]');if(!mask||!target||!candidate)throw Error('Comparison layers missing');return {mask:Number(getComputedStyle(mask).zIndex),target:Number(getComputedStyle(target).zIndex),candidate:Number(getComputedStyle(candidate).zIndex),toolbar:Number(getComputedStyle(toolbar).zIndex),other:other?Number(getComputedStyle(other).zIndex):null};}''')
                assert layers['toolbar']>layers['target']>layers['mask'] and layers['candidate']>layers['mask'],layers
                if mode=='synthetic':
                  assert layers['other']<layers['mask'],layers
                  hit=await page.evaluate('''()=>{const other=document.getElementById('screen-frame-other'),r=other.getBoundingClientRect(),x=Math.max(1,r.left+Math.min(30,r.width/2)),y=Math.min(innerHeight-5,r.top+15),top=document.elementFromPoint(x,y);return {within:y>=r.top&&y<=r.bottom,mask:top?.getAttribute('data-testid')==='comparison-backdrop',x,y};}''')
                  assert hit['within'] and hit['mask'],hit
                  await page.mouse.click(hit['x'],hit['y'])
                  assert await page.evaluate('fixture.state().activeScreenId===fixture.target && !!fixture.state().stagedScreen')

                assert '结构守卫' in await page.get_by_test_id('candidate-delivery-blockers').inner_text()
                if mode=='real':
                  # The saved user's candidate is now stale against the saved project.
                  # Preserve that block, rather than rewriting its contract to obtain a pass.
                  assert await page.evaluate("fixture.report().checks.find(c=>c.id==='task').status==='blocked'")
                  assert await ack.count()==0
                  await page.screenshot(path=str(OUT/f'{engine}-{device}-{mode}-{action}-before.png'))
                else:
                  assert await page.evaluate("fixture.report().checks.filter(c=>c.status!=='passed').length===1")
                if action in ['discard','stale-project']:
                  await toolbar.get_by_role('button',name='保留原版',exact=True).click()
                  assert await page.evaluate('fixture.state().stagedScreen===null && fixture.state().screens[fixture.target].htmlContent===fixture.original')
                else:
                  viewport=await page.evaluate('JSON.stringify(fixture.state().viewportTransform)')
                  await ack.focus();await page.keyboard.press('Space')
                  assert await ack.is_checked() and await replace.is_enabled() and await keep.is_enabled()
                  box=await toolbar.bounding_box();await page.mouse.move(box['x']+20,box['y']+20);await page.mouse.wheel(0,200)
                  assert await page.evaluate('JSON.stringify(fixture.state().viewportTransform)')==viewport
                  if action=='stale':
                    await page.evaluate('fixture.stage()')
                    await page.wait_for_function("fixture.report().checks.find(c=>c.id==='render').status==='passed'")
                    assert not await ack.is_checked() and await replace.is_disabled()
                  else:
                    count=await page.evaluate('Object.keys(fixture.state().screens).length')
                    await page.screenshot(path=str(OUT/f'{engine}-{device}-{mode}-{action}-before.png'))
                    await (replace if action=='replace' else keep).click()
                    await page.wait_for_function('fixture.state().stagedScreen===null',timeout=30000)
                    archive=await page.evaluate('''async action=>{
                      const s=fixture.state(),id=action==='replace'?fixture.target:s.activeScreenId;
                      const a=(await fixture.archives(id))[0];
                      if(!a||a.status!=='applied'||a.mode!==(action==='replace'?'confirm-structure-replace':'confirm-structure-keep-both'))throw Error('Wrong archive '+JSON.stringify(a));
                      return {mode:a.mode,status:a.status,preview:a.preview.status,id};
                    }''',action)
                    assert archive['preview']=='ready',archive
                    assert await page.evaluate('Object.keys(fixture.state().screens).length')==count+(action=='keep')
                    if action=='keep':assert await page.evaluate('fixture.state().screens[fixture.target].htmlContent===fixture.original')
                    await page.evaluate('fixture.undo()')
                    assert await page.evaluate('Object.keys(fixture.state().screens).length')==count
                    assert await page.evaluate('fixture.state().screens[fixture.target].htmlContent===fixture.original')
                    await page.evaluate('fixture.redo()')
                    assert await page.evaluate('Object.keys(fixture.state().screens).length')==count+(action=='keep')
                if mode=='synthetic' and action in ['replace','keep']:
                  saved=await page.evaluate('''async()=>{const s=fixture.state(),{flushHistorySaveChecked}=await import('/src/services/storage/historyPersistence.ts');await flushHistorySaveChecked(s.id,s.folderPath);await s.saveProjectChecked();return {id:s.id,pages:Object.fromEntries(Object.entries(fixture.state().screens).map(([id,page])=>[id,page.htmlContent])),resultId:s.activeScreenId};}''')
                  await page.goto(URL+'?mode=synthetic&device='+device+'&resume='+saved['id'],wait_until='networkidle')
                  await page.wait_for_function('!!window.fixture?.resumed')
                  reopened=await page.evaluate('''async saved=>{const s=fixture.state(),pages=Object.fromEntries(Object.entries(s.screens).map(([id,page])=>[id,page.htmlContent]));if(JSON.stringify(pages)!==JSON.stringify(saved.pages))throw Error('Reopen changed source pages');const records=await fixture.archives(saved.resultId);if(records.length!==1||records[0].status!=='applied')throw Error('Delivery archive not restored');const before=JSON.stringify(pages);fixture.undo();if(JSON.stringify(fixture.state().screens)===JSON.stringify(s.screens))throw Error('Reopened History could not undo');fixture.redo();if(JSON.stringify(Object.fromEntries(Object.entries(fixture.state().screens).map(([id,page])=>[id,page.htmlContent])))!==before)throw Error('Reopened History redo mismatch');return {sourcePreserved:true,archive:records[0].status,undoRedo:true};}''',saved)
                  assert reopened=={'sourcePreserved':True,'archive':'applied','undoRedo':True},reopened
                assert not errors,errors
                assert not external,external
                assert await page.evaluate('fixture.models()')==0
                await page.screenshot(path=str(OUT/f'{engine}-{device}-{mode}-{action}.png'))
                results.append({'browser':engine,'mode':mode,'device':device,'action':action,'status':'passed','pageErrors':errors,'externalRequests':external,'layers':layers,'reopenVerified':mode=='synthetic' and action in ['replace','keep']})
                print(json.dumps(results[-1]),flush=True)
              except Exception:
                print({'pageErrors':errors,'state':await page.evaluate('''async()=>{const {useHistoryStore}=await import('/src/stores/useHistoryStore.ts');return {report:window.fixture?.report(),error:window.fixture?.state().stagedAdoptionError,pages:Object.keys(window.fixture?.state().screens??{}),history:useHistoryStore.getState()};}''')},flush=True)
                await page.screenshot(path=str(OUT/f'{engine}-{device}-{mode}-{action}-failure.png'))
                raise
              finally:await context.close()
        finally:await browser.close()
    if SOURCE:assert hashes(SOURCE)==before,'Original project changed during validation'
    (OUT/'browser.json').write_text(json.dumps({'status':'passed','checks':results,'originalUnchanged':True if SOURCE else None,'scope':'Browser Chromium/WebKit; optional real project isolated copy; no model request or native PNG claim'},ensure_ascii=False,indent=2))

asyncio.run(run())
