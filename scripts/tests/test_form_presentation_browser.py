#!/usr/bin/env python3
"""Read-only form diagnostics against real engines; synthetic data, no Provider or project writes."""
import argparse,asyncio,json
from pathlib import Path
from playwright.async_api import async_playwright
ORIGIN='http://127.0.0.1:5174'
async def run(args):
 args.output.mkdir(parents=True,exist_ok=True);results=[]
 async with async_playwright() as p:
  for engine in ['chromium','webkit']:
   browser=await getattr(p,engine).launch(headless=True)
   try:
    page=await browser.new_page();errors=[];external=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    async def guard(route):
     if route.request.url.startswith(ORIGIN+'/') and '/api/ai-proxy' not in route.request.url:await route.continue_()
     else:external.append(route.request.url);await route.abort()
    await page.route('**/*',guard)
    await page.goto(ORIGIN+'/test/fixtures/design-experiment.html',wait_until='networkidle')
    cases=await page.evaluate('''async()=>{
     const {inspectCssTokenProperties}=await import('/src/services/ai/cssTokenPropertyValidation.ts');
     const {inspectRenderedQuality}=await import('/src/utils/renderedQuality.ts');
     const {checkGenerationQuality}=await import('/src/services/ai/generationQuality.ts');
     const frame=document.createElement('iframe');frame.style.cssText='width:390px;height:844px';document.body.append(frame);
     const common=':root{--color-border:#c5c7ca;--space-3:12px}*{box-sizing:border-box}body{margin:0;background:white;font:16px sans-serif;color:black}input{appearance:none;background:transparent;border:0;outline:0;min-height:40px}fieldset{margin:0;min-width:0}label{display:inline-block}';
     const input=style=>`<input data-nid="field" aria-label="姓名" style="${style}">`;
     const rows=aligned=>[48,72,96].map((width,i)=>`<div style="display:flex;align-items:center"><label for="f${i}" style="width:${aligned?96:width}px">字段${i}</label><input id="f${i}" data-nid="f${i}" style="width:160px;border-bottom:1px solid var(--color-border)"></div>`).join('');
     const readonly=padding=>`<fieldset data-nid="readonly" style="border:1px solid var(--color-border);padding:${padding}"><label>姓名<input readonly value="测试"></label><label>性别<input readonly value="女"></label></fieldset>`;
     const variants=[
      {id:'invalid-token',html:input('border-width:var(--color-border);border-style:var(--color-border)'),errors:2,warning:'render_form_input_affordance'},
      {id:'invalid-compound-token',html:input('border:1px solid;border-width:var(--color-border);border-style:var(--color-border);border-color:var(--color-border)'),errors:2,warning:'render_form_input_affordance'},
      {id:'inactive-media',html:'<style>@media(min-width:99999px){input{border-width:var(--color-border)}}</style>'+input('border:1px solid gray'),errors:0},
      {id:'cascade-width',html:'<style>input{border-width:var(--color-border)}input{border-width:2px;border-style:solid;border-color:gray}</style>'+input(''),errors:0},
      {id:'inline-width-override',html:'<style>input{border-width:var(--color-border)}</style>'+input('border-width:2px;border-style:solid;border-color:gray'),errors:0},
      {id:'inline-shorthand-override',html:'<style>input{border-width:var(--color-border)}</style>'+input('border:1px solid gray'),errors:0},
      {id:'later-shorthand',html:'<style>input{border-width:var(--color-border)}input{border:1px solid gray}</style>'+input(''),errors:0},
      {id:'important-shorthand-winner',html:input('border:1px solid gray!important;border-width:var(--color-border);border-style:var(--color-border)'),errors:0},
      {id:'important-width-winner',html:input('border-width:1px!important;border-width:var(--color-border);border-style:solid;border-color:gray'),errors:0},
      {id:'valid-underline',html:input('border-bottom:1px solid var(--color-border)'),errors:0},
      {id:'valid-frame',html:input('border:1px solid var(--color-border)'),errors:0},
      {id:'valid-fill',html:input('background:#e2e4e8'),errors:0},
      {id:'valid-variable-chain',html:input('--edge:var(--space-3);border-width:var(--edge);border-style:solid;border-color:var(--color-border)'),errors:0},
      {id:'valid-fallback',html:input('border-width:var(--unknown, 2px);border-style:solid;border-color:var(--color-border)'),errors:0},
      {id:'valid-local-override',html:input('--color-border:2px;border-width:var(--color-border);border-style:solid;border-color:gray'),errors:0},
      {id:'no-input-indication',html:input(''),errors:0,warning:'render_form_input_affordance'},
      {id:'readonly-zero-padding',html:readonly('0'),errors:0,warning:'render_form_group_padding'},
      {id:'readonly-token-padding',html:readonly('var(--space-3)'),errors:0},
      {id:'misaligned-columns',html:`<fieldset data-nid="group" style="border:0;padding:0">${rows(false)}</fieldset>`,errors:0,warning:'render_form_column_alignment'},
      {id:'shared-columns',html:`<fieldset data-nid="group" style="border:0;padding:0">${rows(true)}</fieldset>`,errors:0}
     ],result=[];
     for(const test of variants){
      await new Promise(resolve=>{frame.onload=resolve;frame.srcdoc=`<!doctype html><html><head><style>${common}</style></head><body>${test.html}</body></html>`});
      await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
      const doc=frame.contentDocument,staticDoc=new DOMParser().parseFromString(test.html,'text/html');
      const findings=inspectRenderedQuality(doc).findings,types=inspectCssTokenProperties(staticDoc);
      const el=doc.querySelector('input'),s=doc.defaultView.getComputedStyle(el);
      const form=findings.filter(f=>f.code.startsWith('render_form_'));
      result.push({id:test.id,expectedErrors:test.errors,expectedWarning:test.warning??null,types,form,quality:checkGenerationQuality(test.html).findings.filter(f=>f.code==='css_token_property_type'),computed:{width:s.borderTopWidth,style:s.borderTopStyle,bottomWidth:s.borderBottomWidth,bottomStyle:s.borderBottomStyle,fill:s.backgroundColor},status:inspectRenderedQuality(doc).status});
     }
     frame.remove();return result;
    }''')
    for row in cases:
     assert len(row['types'])==row['expectedErrors'],(engine,row)
     assert len(row['quality'])==row['expectedErrors'],(engine,row)
     form=[f['code'] for f in row['form']]
     if row['expectedWarning']:assert row['expectedWarning'] in form,(engine,row)
     else:assert not form,(engine,row)
     assert all(f['severity']=='warning' for f in row['form']),(engine,row)
     assert row['status']=='complete',(engine,row)
     if row['id'] in ('invalid-token','invalid-compound-token'):assert row['computed']['width']=='0px' and row['computed']['style']=='none',(engine,row)
     if row['id'] in ('inactive-media','inline-shorthand-override','later-shorthand','important-shorthand-winner','important-width-winner'):assert row['computed']['width']=='1px' and row['computed']['style']=='solid',(engine,row)
     if row['id'] in ('cascade-width','inline-width-override'):assert row['computed']['width']=='2px' and row['computed']['style']=='solid',(engine,row)
     if row['id']=='valid-underline':assert row['computed']['bottomWidth']=='1px' and row['computed']['bottomStyle']=='solid',(engine,row)
    assert not errors and not external,{'errors':errors,'external':external}
    results.append({'engine':engine,'cases':cases})
   finally:await browser.close()
 report={'status':'passed','scope':'synthetic-static-and-real-computed-form-presentation','modelRequests':0,'humanReviewPerformed':False,'combinations':sum(len(x['cases']) for x in results),'results':results}
 (args.output/'result.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps({k:v for k,v in report.items() if k!='results'}))
if __name__=='__main__':
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--output',type=Path,required=True);asyncio.run(run(parser.parse_args()))
