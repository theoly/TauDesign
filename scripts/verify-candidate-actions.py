#!/usr/bin/env python3
"""Verify candidate controls using real pointer events and gates; user project is copied first."""
import argparse, asyncio, base64, hashlib, json, shutil, tempfile
from pathlib import Path
from playwright.async_api import async_playwright

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'doc/candidate-action-feedback/evidence'
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--project',type=Path,help='Optional existing project, copied to a temporary directory before testing')
SOURCE=parser.parse_args().project
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
          cases=[('synthetic','discard'),('synthetic','replace'),('synthetic','keep'),('synthetic','stale')]
          if SOURCE:cases.append(('real','stale-project'))
          for mode,action in cases:
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
                await page.goto(URL+'?mode='+mode,wait_until='networkidle')
                await page.wait_for_function("window.fixture && fixture.report().checks.find(c=>c.id==='render').status==='passed' && fixture.report().checks.find(c=>c.id==='structure').status==='blocked'",timeout=30000)
                toolbar=page.get_by_test_id('candidate-actions-toolbar')
                replace=toolbar.get_by_role('button',name='采纳新版 (替换原版)',exact=True)
                keep=toolbar.get_by_role('button',name='两版都留',exact=True)
                ack=toolbar.get_by_role('checkbox',name='我已检查并接受这次结构变化',exact=True)
                assert await replace.is_disabled() and await keep.is_disabled()
                assert '结构守卫' in await page.get_by_test_id('candidate-delivery-blockers').inner_text()
                if mode=='real':
                  # The saved user's candidate is now stale against the saved project.
                  # Preserve that block, rather than rewriting its contract to obtain a pass.
                  assert await page.evaluate("fixture.report().checks.find(c=>c.id==='task').status==='blocked'")
                  assert await ack.count()==0
                  await page.screenshot(path=str(OUT/f'{engine}-{mode}-{action}-before.png'))
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
                    await page.screenshot(path=str(OUT/f'{engine}-{mode}-{action}-before.png'))
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
                assert not errors,errors
                await page.screenshot(path=str(OUT/f'{engine}-{mode}-{action}.png'))
                results.append({'browser':engine,'mode':mode,'action':action,'status':'passed','pageErrors':errors})
                print(json.dumps(results[-1]),flush=True)
              except Exception:
                print({'pageErrors':errors,'state':await page.evaluate('({report:window.fixture?.report(),error:window.fixture?.state().stagedAdoptionError})')},flush=True)
                await page.screenshot(path=str(OUT/f'{engine}-{mode}-{action}-failure.png'))
                raise
              finally:await context.close()
        finally:await browser.close()
    if SOURCE:assert hashes(SOURCE)==before,'Original project changed during validation'
    (OUT/'browser.json').write_text(json.dumps({'status':'passed','checks':results,'originalUnchanged':True if SOURCE else None,'scope':'Browser Chromium/WebKit; optional real project isolated copy; no model request or native PNG claim'},ensure_ascii=False,indent=2))

asyncio.run(run())
