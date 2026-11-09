#!/usr/bin/env python3
"""Real-engine badge geometry checks; local source CSS/checker, no Provider requests."""
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
     if route.request.url.startswith((ORIGIN+'/','data:','blob:')) and '/api/ai-proxy' not in route.request.url:await route.continue_()
     else:external.append(route.request.url);await route.abort()
    await page.route('**/*',guard)
    await page.goto(ORIGIN+'/test/fixtures/design-experiment.html',wait_until='networkidle')
    for device,width in [('mobile',390),('pc',1440)]:
     value=await page.evaluate('''async({device,width})=>{
      const {getBaseCss}=await import('/src/styles/baseCss.ts');const {compileTokensToCss}=await import('/src/utils/cssCompiler.ts');const {techBlueTheme}=await import('/src/utils/themePresets.ts');const {inspectRenderedQuality}=await import('/src/utils/renderedQuality.ts');
      const frame=document.createElement('iframe');frame.style.cssText=`width:${width}px;height:400px`;document.body.append(frame);
      const icon='<svg data-nid="bell" class="icon" style="width:28px;height:28px" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg>';
      const variants=[{id:'col',parent:'col',style:''},{id:'row',parent:'row',style:''},{id:'grid',parent:'grid-1',style:''},{id:'wide',parent:'col',style:'width:100%'},{id:'99plus',parent:'col',style:'',count:'99+'},{id:'dot',parent:'col',style:'',dot:true},{id:'button',parent:'row',style:'',button:true},{id:'large-icon',parent:'col',style:'',large:true},{id:'old-row-anchor',parent:'col',style:'display:flex;width:100%',bad:true},{id:'inline-counter',parent:'row',style:'display:flex',bad:true,inline:true},{id:'left-corner',parent:'col',style:'',bad:true,left:true}];
      const rows=[];
      for(const v of variants){
       const tag=v.button?'button':'a',cls=v.button?'btn btn-ghost notification-control':'notification-control';
       const glyph=v.large?icon.replaceAll('28px','40px'):icon;
       const html=`<main class="${v.parent} p-4"><${tag} href="#messages" aria-label="消息" class="${cls}" style="${v.style}">${glyph}<span data-nid="count" class="${v.dot?'badge-dot':'badge-count'} text-primary" style="${v.inline?'position:static;transform:none;':''}${v.left?'left:0;right:auto;':''}${v.dot?'':'font-size:10px'}">${v.dot?'':v.count??'3'}</span></${tag}></main>`;
       await new Promise(resolve=>{frame.onload=resolve;frame.srcdoc='<!doctype html><html><head><style>'+getBaseCss(device)+compileTokensToCss(techBlueTheme.tokens,'light',device)+'</style></head><body>'+html+'</body></html>'});
       await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
       const doc=frame.contentDocument,box=el=>{const r=el.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height}};
       rows.push({id:v.id,expectedDetached:!!v.bad,icon:box(doc.querySelector('[data-nid=bell]')),badge:box(doc.querySelector('[data-nid=count]')),host:box(doc.querySelector('.notification-control')),findings:inspectRenderedQuality(doc).findings});
      }
      frame.remove();return rows;
     }''',{'device':device,'width':width})
     for row in value:
      detached=any(x['code']=='render_badge_detached' for x in row['findings'])
      assert detached==row['expectedDetached'],(engine,device,row)
      if not row['expectedDetached']:
       b,i,h=row['badge'],row['icon'],row['host'];cx=(i['left']+i['right'])/2;cy=(i['top']+i['bottom'])/2
       assert not(b['left']<cx<b['right'] and b['top']<cy<b['bottom']),(engine,device,row)
       assert not any(x['code'] in ['render_badge_overlap','render_badge_oversized'] for x in row['findings']),(engine,device,row)
       assert h['width']>=44 and h['height']>=44,(engine,device,row)
     results.append({'engine':engine,'device':device,'cases':value})
    assert not errors and not external,{'errors':errors,'external':external}
   finally:await browser.close()
 report={'scope':'real-browser-base-css-and-checker','modelRequests':0,'humanReviewPerformed':False,'status':'passed','combinations':sum(len(x['cases']) for x in results),'results':results}
 (args.output/'result.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps({k:v for k,v in report.items() if k!='results'}))
if __name__=='__main__':
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--output',type=Path,required=True);asyncio.run(run(parser.parse_args()))
