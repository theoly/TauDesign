#!/usr/bin/env python3
"""Replay real image decoding + encoded model streams through ChatDrawer, no external Provider calls."""
import asyncio,json,argparse
from pathlib import Path
from playwright.async_api import async_playwright
parser=argparse.ArgumentParser();parser.add_argument('--output',default='doc/retry-reuse-planning/evidence/2026-11-11-browser');parser.add_argument('--long',action='store_true');args=parser.parse_args();out=Path(args.output);out.mkdir(parents=True,exist_ok=True)
async def main():
 results=[]
 async with async_playwright() as p:
  for name in ['chromium','webkit']:
   browser=await getattr(p,name).launch(headless=True)
   try:
    for device in ['mobile','pc']:
     page=await browser.new_page(viewport={'width':1120,'height':1000});errors=[];external=[]
     page.on('pageerror',lambda e:(errors.append(str(e)),print('PAGEERROR',str(e),flush=True)))
     page.on('console',lambda m:print('CONSOLE',m.text,flush=True) if m.type=='error' else None)
     async def route(r):
      if r.request.url.startswith(('http://127.0.0.1:5174/','data:','blob:','about:')):await r.continue_()
      else:external.append(r.request.url);await r.abort()
     await page.route('**/*',route)
     await page.goto(f'http://127.0.0.1:5174/test/fixtures/retry-reference.html?device={device}'+('&long=1' if args.long else ''))
     await page.wait_for_function('window.retryReferenceFixture?.ready')
     await page.locator('#run').click();await page.get_by_alt_text('参考图预览',exact=False).wait_for(timeout=5000) if await page.get_by_alt_text('参考图预览',exact=False).count() else await asyncio.sleep(0)
     await page.wait_for_function("document.querySelector('input[type=file]').files.length===0 && document.querySelector('textarea').value.includes('基础资料')")
     await page.get_by_title('发送设计诉求 (Enter)').click()
     await page.wait_for_function('retryReferenceFixture.outputs.length===1',timeout=30000)
     await page.get_by_text('继续生成（保留图片解析）',exact=True).wait_for()
     await page.screenshot(path=str(out/f'{name}-{device}-failed.png'),full_page=True)
     before=await page.evaluate("()=>({kinds:retryReferenceFixture.requests.map(r=>r.kind),source:retryReferenceFixture.state().screens.source.htmlContent,history:retryReferenceFixture.history().past.length})")
     assert before['kinds']==['vision','plan','code','code'],before
     assert before['source']==await page.evaluate('retryReferenceFixture.original')
     await page.get_by_text('继续生成（保留图片解析）',exact=True).click()
     await page.wait_for_function('retryReferenceFixture.outputs.length===2',timeout=30000)
     await page.wait_for_function('!!retryReferenceFixture.state().stagedScreen',timeout=10000)
     value=await page.evaluate(r"""()=>({kinds:retryReferenceFixture.requests.map(r=>r.kind),codeNoImages:retryReferenceFixture.requests.filter(r=>r.kind!=='vision').every(r=>r.body.messages.every(m=>typeof m.content==='string')&&!/data:image\/[^;]+;base64,[A-Za-z0-9+/]{16}/.test(JSON.stringify(r.body))),sourceUnchanged:retryReferenceFixture.state().screens.source.htmlContent===retryReferenceFixture.original,historyUnchanged:retryReferenceFixture.history().past.length===retryReferenceFixture.before,fieldsPreserved:retryReferenceFixture.state().stagedScreen.newHtml.includes('身高'),evidence:!!retryReferenceFixture.outputs[1].workflowContract.referenceImage.evidence})""")
     assert value['kinds']==['vision','plan','code','code','code'],value
     assert all(value[k] for k in ['codeNoImages','sourceUnchanged','historyUnchanged','fieldsPreserved','evidence']),value
     files=await page.evaluate('retryReferenceFixture.verifyFiles()');assert len(files)>=2,files
     value['independentTaskFiles']=files
     parts=await page.evaluate('retryReferenceFixture.outputs[1].workflowContract.referenceImage.evidence.parts');assert len(parts)==(4 if args.long else 1),parts
     value['imageParts']=len(parts)
     await page.locator('summary').filter(has_text='参考图解析').last.click()
     await page.get_by_role('button',name='查看发送片段 4' if args.long else '查看发送片段 1',exact=True).last.click()
     preview=page.locator('img[alt^="细节 "]').last
     await preview.wait_for()
     await page.wait_for_function("()=>[...document.querySelectorAll('img[alt^=\"细节 \"]')].some(i=>i.complete&&i.naturalWidth>0)")
     value['sendPreview']=await preview.evaluate('(i)=>({source:i.getAttribute("src"),width:i.naturalWidth,height:i.naturalHeight,region:i.alt})')
     assert value['sendPreview']['source'].startswith('http://127.0.0.1:5174/__aidesign_media/'),value
     assert value['sendPreview']['height']==(1032 if args.long else 640),value
     assert not errors,errors
     assert not external,external
     await page.screenshot(path=str(out/f'{name}-{device}-recovered.png'),full_page=True)
     results.append({'engine':name,'device':device,'status':'passed',**value,'pageErrors':errors,'externalRequests':external});await page.close()
   finally:await browser.close()
 (out/'result.json').write_text(json.dumps({'status':'passed','scope':'synthetic transport, actual browser decoding/codec/pipeline/ChatDrawer/candidate','results':results},ensure_ascii=False,indent=2));print(json.dumps({'passed':len(results)}))
try:asyncio.run(main())
except Exception as e:
 (out/'failure.txt').write_text(str(e));raise
