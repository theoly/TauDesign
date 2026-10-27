#!/usr/bin/env python3
"""Real UI, iframe, HTML and PNG verification of selective gradient themes."""
import argparse,asyncio,base64,json
from pathlib import Path
from playwright.async_api import async_playwright

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'doc/import-gradient-theme/evidence'
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--project',type=Path,help='Optional read-only project used for style analysis only')
args=parser.parse_args()

async def run():
 results=[]
 async with async_playwright() as pw:
  for engine in ['chromium','webkit']:
   browser=await getattr(pw,engine).launch(headless=True)
   context=await browser.new_context(viewport={'width':1800,'height':1100},locale='zh-CN')
   # Do not let another native build's generated HTML interrupt this isolated fixture.
   await context.route('**/@vite/client',lambda r:r.fulfill(status=200,content_type='application/javascript',body="const s=new Map();export const createHotContext=()=>({accept(){},dispose(){},prune(){},on(){},invalidate(){},data:{}});export const injectQuery=u=>u;export function updateStyle(id,css){let el=s.get(id);if(!el){el=document.createElement('style');s.set(id,el);document.head.append(el);}el.textContent=css;}export function removeStyle(id){s.get(id)?.remove();s.delete(id);}"))
   page=await context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   try:
    await page.goto('http://127.0.0.1:5174/test/fixtures/style-extraction.html',wait_until='networkidle')
    await page.wait_for_function("window.fixture&&document.querySelector('iframe[data-inspector-screen=target]')?.contentDocument?.querySelector('[data-nid=target01]')")
    await page.evaluate("document.querySelector('iframe[data-inspector-screen=target]').contentDocument.__identity='unchanged'")
    await page.get_by_role('button',name='从已有页面提取风格',exact=True).click()
    dialog=page.get_by_role('dialog',name='从已有页面提取风格',exact=True)
    await dialog.get_by_label('参考页面',exact=True).select_option('source')
    await dialog.get_by_role('checkbox',name='选择页面背景 · [data-nid="refer001"]',exact=True).check()
    await dialog.get_by_role('checkbox',name='选择主操作背景 · [data-nid="refer002"]',exact=True).check()
    await dialog.get_by_text('同步已有页面背景 · 已选择0页',exact=True).click()
    await dialog.get_by_role('checkbox',name='同步页面',exact=True).check()
    await dialog.get_by_role('button',name='应用所选风格',exact=True).click()
    await page.wait_for_function("fixture.state().designSystem.tokens.backgrounds?.page?.light?.kind==='gradient'")
    actual=await page.evaluate('''()=>{
      const frame=id=>document.querySelector('iframe[data-inspector-screen="'+id+'"]').contentDocument;
      const t=frame('target'),old=frame('untouched');
      return {page:t.defaultView.getComputedStyle(t.querySelector('[data-nid=target01]')).backgroundImage,button:t.defaultView.getComputedStyle(t.querySelector('[data-nid=target02]')).backgroundImage,old:old.defaultView.getComputedStyle(old.querySelector('[data-nid=oldpage1]')).backgroundImage,identity:t.__identity};
    }''')
    assert 'gradient' in actual['page'] and 'gradient' in actual['button'],actual
    assert actual['old']=='none' and actual['identity']=='unchanged',actual
    await page.evaluate('fixture.undo()')
    assert await page.evaluate("!fixture.state().designSystem.tokens.backgrounds?.page?.light")
    await page.evaluate('fixture.redo()')
    html=await page.evaluate("fixture.exportHtml('target')")
    exported=await context.new_page();await exported.set_content(html)
    standalone=await exported.locator('[data-export-id=target01]').evaluate('(el)=>getComputedStyle(el).backgroundImage')
    assert standalone==actual['page'],(standalone,actual)
    assert await exported.locator('[data-nid]').count()==0
    png=await page.evaluate("fixture.exportPng('target')")
    assert png['dataUrl'].startswith('data:image/png;base64,'),png
    png_path=OUT/f'{engine}-gradient-export.png';png_path.write_bytes(base64.b64decode(png['dataUrl'].split(',')[1]))
    assert len(png_path.read_bytes())>1000
    await page.get_by_role('button',name='完整主题编辑器',exact=True).click()
    await page.get_by_role('button',name='从已有页面提取风格',exact=True).last.click()
    assert await dialog.is_visible()
    await dialog.get_by_role('button',name='取消',exact=True).click()
    await page.get_by_role('group',name='背景与渐变',exact=True).get_by_role('button').first.click()
    await page.get_by_label('背景表达式',exact=True).fill('linear-gradient(180deg, #fff0e0 0%, #ffffff 100%)')
    await page.get_by_role('button',name='保存背景',exact=True).click()
    assert await page.evaluate("JSON.stringify(fixture.state().designSystem.tokens.backgrounds.page.light).includes('#fff0e0')")
    await page.evaluate('fixture.undo()')
    assert await page.evaluate("!JSON.stringify(fixture.state().designSystem.tokens.backgrounds.page.light).includes('#fff0e0')")
    await page.get_by_role('button',name='完成',exact=True).click()
    # Inspector's solid color remains authoritative over a themed gradient.
    await page.evaluate("fixture.state().setOverride('target','target01',{'background-color':'#ff0000'},true)")
    await page.wait_for_function("(()=>{const d=document.querySelector('iframe[data-inspector-screen=target]').contentDocument;return d.defaultView.getComputedStyle(d.querySelector('[data-nid=target01]')).backgroundImage==='none'})()")
    # Existing projects expose the optional import theme update, default off.
    await page.get_by_role('button',name='导入HTML',exact=True).click()
    await page.get_by_label('选择 HTML 文件',exact=True).set_input_files({'name':'warm.html','mimeType':'text/html','buffer':b'<html><head><style>body{margin:0;background:linear-gradient(180deg,#ffe0c0,#ffffff)}button{background:linear-gradient(90deg,#ff8040,#ee6020);padding:12px}</style></head><body><h1>Warm</h1><button>Confirm</button></body></html>'})
    await page.get_by_text('检测页面风格 · 可选择更新项目主题',exact=True).click()
    choices=page.get_by_role('group',name='选择提取的风格项',exact=True)
    await choices.get_by_role('checkbox').first.wait_for()
    assert await choices.get_by_role('checkbox').first.is_checked() is False
    await choices.get_by_role('checkbox').first.check()
    await page.get_by_role('button',name='确认导入',exact=True).wait_for(state='visible')
    await page.wait_for_function("[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='确认导入'&&!b.disabled)")
    count=await page.evaluate('fixture.state().screenOrder.length')
    await page.get_by_role('button',name='确认导入',exact=True).click()
    await page.wait_for_function('(count)=>fixture.state().screenOrder.length===count+1',arg=count,timeout=30000)
    await page.evaluate('fixture.undo()')
    assert await page.evaluate('fixture.state().screenOrder.length')==count
    real=[]
    if args.project:
      document=json.loads((args.project/'project.json').read_text())
      for sid,screen in document['screens'].items():
        if screen['name'] not in ['编辑资料','网络异常','充值魔方点']:continue
        source={**screen,'id':sid,'htmlContent':(args.project/'screens'/f'{sid}.html').read_text()}
        analysis=await page.evaluate('({screen,theme})=>fixture.analyze(screen,theme)',{'screen':source,'theme':document['designSystem']})
        real.append({'name':screen['name'],'roles':[{'role':c['role'],'kind':c['paint']['kind'],'confidence':c['confidence']} for c in analysis['backgrounds']],'warnings':analysis['warnings']})
      assert real and any(c['kind']=='gradient' for entry in real for c in entry['roles']),real
    await exported.close()
    # PC-only interaction feedback uses actual compiled CSS, without changing project device.
    pc=await context.new_page();pc_html=html
    # Insert the PC device sheet into a standalone copy to exercise desktop hover rules.
    pc_css=await page.evaluate("async()=>{const {getBaseCss}=await import('/src/styles/baseCss.ts');return getBaseCss('pc')}")
    await pc.set_content(pc_html);await pc.add_style_tag(content=pc_css)
    action=pc.locator('[data-export-id=target02]');await action.hover()
    hover=await action.evaluate('(el)=>getComputedStyle(el).filter')
    await pc.mouse.down();active=await action.evaluate('(el)=>getComputedStyle(el).filter');await pc.mouse.up()
    assert '0.94' in hover and '0.86' in active,(hover,active)
    await pc.close()
    assert not errors,errors
    await page.screenshot(path=str(OUT/f'{engine}-final.png'))
    result={'browser':engine,'status':'passed','computed':actual,'htmlMatches':True,'pngEngine':png['engine'],'pngBytes':png_path.stat().st_size,'hover':hover,'active':active,'realProjectAnalysis':real,'pageErrors':errors}
    results.append(result);print(json.dumps(result,ensure_ascii=False),flush=True)
   except Exception:
    await page.screenshot(path=str(OUT/f'{engine}-failure.png'))
    print(json.dumps({'browser':engine,'errors':errors,'alerts':await page.get_by_role('alert').all_text_contents()},ensure_ascii=False),flush=True)
    raise
   finally:await browser.close()
 (OUT/'browser.json').write_text(json.dumps({'status':'passed','results':results,'sourceProject':'read only; analysis only; no model requests'},ensure_ascii=False,indent=2))

asyncio.run(run())
