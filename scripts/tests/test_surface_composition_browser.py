#!/usr/bin/env python3
"""Check real base component/utility cascade; no Provider or user project input."""
import argparse,asyncio,json
from pathlib import Path
from playwright.async_api import async_playwright
async def run(args):
 args.output.mkdir(parents=True,exist_ok=True);results=[]
 async with async_playwright() as p:
  for engine in ['chromium','webkit']:
   browser=await getattr(p,engine).launch(headless=True)
   try:
    page=await browser.new_page();await page.goto('http://127.0.0.1:5174/test/fixtures/design-experiment.html',wait_until='networkidle')
    rows=await page.evaluate('''async()=>{
      const {getBaseCss}=await import('/src/styles/baseCss.ts');const {compileTokensToCss}=await import('/src/utils/cssCompiler.ts');const {neutralModernTheme}=await import('/src/utils/themePresets.ts');const {inspectRenderedQuality}=await import('/src/utils/renderedQuality.ts');
      const frame=document.createElement('iframe');document.body.append(frame);const rows=[];
      for(const device of ['mobile','pc'])for(const mode of ['light','dark']){
       frame.style.cssText=`width:${device==='pc'?1440:390}px;height:400px`;
       await new Promise(r=>{frame.onload=r;frame.srcdoc='<!doctype html><html><head><style>'+getBaseCss(device)+compileTokensToCss(neutralModernTheme.tokens,mode,device)+'</style></head><body></body></html>'});
       const doc=frame.contentDocument,style=e=>doc.defaultView.getComputedStyle(e);
       for(const component of ['card','sheet-card','panel'])for(const bg of ['', 'bg-primary','bg-primary-light','bg-surface-alt','bg-ambient-cool']){
        const actual=doc.createElement('section'),ref=doc.createElement('div');actual.className=component+' '+bg;ref.className=bg;doc.body.replaceChildren(actual,ref);
        const name=bg==='bg-primary'?'var(--color-on-primary)':'var(--color-text-primary)';actual.innerHTML='<p data-nid="message" style="color:'+name+'">这是一条必须能够阅读的消息。</p>';
        const root=style(doc.documentElement),expected=bg?style(ref).backgroundColor:(component==='panel'?root.getPropertyValue('--color-surface-alt'):root.getPropertyValue('--color-surface'));
        if(!bg){ref.style.backgroundColor=expected;}
        rows.push({engine:'css',device,mode,component,bg,actual:style(actual).backgroundColor,expected:style(ref).backgroundColor,image:style(actual).backgroundImage,expectedImage:style(ref).backgroundImage,contrast:inspectRenderedQuality(doc).findings.filter(f=>f.code==='render_contrast')});
        actual.className=component+' r-sm shadow-none p-2';ref.className='r-sm shadow-none p-2';
        rows.push({device,mode,component,case:'explicit-utilities',actual:[style(actual).borderRadius,style(actual).boxShadow,style(actual).padding],expected:[style(ref).borderRadius,style(ref).boxShadow,style(ref).padding]});
       }
       doc.body.innerHTML='<section class="card bg-primary source">来源样式</section><section class="card bg-primary" data-nid="manual">手动样式</section><style>.source{background-color:rgb(12,34,56)}[data-nid="manual"]{background-color:rgb(65,43,21)!important}</style>';
       rows.push({device,mode,case:'source-and-manual',actual:[style(doc.querySelector('.source')).backgroundColor,style(doc.querySelector('[data-nid=manual]')).backgroundColor],expected:['rgb(12, 34, 56)','rgb(65, 43, 21)']});
      }frame.remove();return rows;
    }''')
    failures=[row for row in rows if row['actual']!=row['expected'] or ('image'in row and row['image']!=row['expectedImage']) or row.get('contrast')]
    results.append({'engine':engine,'cases':len(rows),'failures':failures})
   finally:await browser.close()
 report={'scope':'surface-utility-real-cascade','results':results,'modelRequests':0,'status':'passed'if all(not r['failures']for r in results)else'failed'}
 (args.output/'result.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'status':report['status'],'cases':sum(r['cases']for r in results),'failureCounts':{r['engine']:len(r['failures'])for r in results}}));assert report['status']=='passed'
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--output',type=Path,required=True);asyncio.run(run(parser.parse_args()))
