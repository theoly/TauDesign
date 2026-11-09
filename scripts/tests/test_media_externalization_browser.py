#!/usr/bin/env python3
"""Real SVG styles and external preview transport; no Provider/user project inputs."""
import argparse,asyncio,json
from pathlib import Path
from playwright.async_api import async_playwright

async def run(args):
 args.output.mkdir(parents=True,exist_ok=True);rows=[]
 async with async_playwright() as p:
  for engine in ['chromium','webkit']:
   browser=await getattr(p,engine).launch(headless=True)
   try:
    page=await browser.new_page(viewport={'width':1600,'height':1000})
    await page.goto('http://127.0.0.1:5174/test/fixtures/design-experiment.html',wait_until='networkidle')
    for device,mode in [(device,mode) for device in ['mobile','pc'] for mode in ['rendered','static']]:
     result=await page.evaluate('''async({device,mode})=>{
      const {SvgMediaExternalizer}=await import('/src/services/import/svgMediaExternalizer.ts');
      const {LocalStorageStorage}=await import('/src/services/storage/projectStorage.ts');
      const {persistImportResources,resolveImportedResources}=await import('/src/services/import/importResources.ts');
      const {createMediaResourceSession}=await import('/src/services/storage/mediaResourceSession.ts');
      const {neutralModernTheme}=await import('/src/utils/themePresets.ts');
      const {buildScreenDocument}=await import('/src/utils/screenDocument.ts');
      const {assertExternalMedia}=await import('/src/services/ai/externalMedia.ts');
      const settings={deviceProfile:device,frameWidth:device==='mobile'?390:1440,viewportGuideHeight:844,showViewportGuide:true,colorMode:'light',lodBudget:12};
      let html=`<style>body{margin:0;background:white}.samples{display:flex;gap:24px;padding:32px}.icon{width:64px;height:64px;color:rgb(223,63,78)}.css-icon path{stroke:rgb(16,130,180);stroke-width:3;fill:none}.multi{width:80px;height:64px}.multi .warm{fill:rgb(245,90,31)}.multi .cool{fill:rgb(30,115,200)}</style><main class="samples"><svg id="simple" class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="opacity:0.6"><path d="M12 3L21 20H3Z"/></svg><svg id="computed" class="icon css-icon" viewBox="0 0 24 24"><path d="M3 3L20 20M20 3L3 20"/></svg><svg id="multi" class="multi" viewBox="10 10 40 30"><rect class="warm" x="10" y="10" width="20" height="30"/><rect class="cool" x="30" y="10" width="20" height="30"/></svg></main>`;
      if(mode==='static'){const parsed=new DOMParser().parseFromString(html,'text/html');parsed.querySelector('#computed').remove();parsed.querySelector('#multi').remove();parsed.querySelector('style').textContent='body{margin:0;background:white}.samples{display:flex;gap:24px;padding:32px}.icon{width:64px;height:64px;color:rgb(223,63,78)}';html=parsed.body.innerHTML+parsed.head.innerHTML;}
      const screen={id:'svg-parity',name:'SVG检查',htmlContent:html,position:{x:0,y:0},metadata:{importedHtml:{version:1,fileName:'source.html',mode:'preserve',categories:[],changes:[],retained:[]}}};
      const storage=new LocalStorageStorage('svg-browser-'+crypto.randomUUID());
      const prepared=await SvgMediaExternalizer.prepare({screen,settings,designSystem:neutralModernTheme,storage,sourceImport:true,forceRendered:mode==='rendered'});assertExternalMedia(prepared.screen.htmlContent);
      if(/<(?:path|rect)\\b/.test(prepared.screen.htmlContent)||prepared.resources.binaries.length!==(mode==='rendered'?3:1))throw Error('SVG drawing still inline or assets missing');
      await persistImportResources(prepared.resources,storage);const session=createMediaResourceSession();
      const resolved=await resolveImportedResources(prepared.screen.htmlContent,undefined,storage,new Set(),{referenceUrl:session.url});
      if(/data:|blob:/.test(resolved.htmlContent))throw Error('Ordinary preview embedded media');
      document.querySelectorAll('[data-svg-check]').forEach(el=>el.remove());const frames=[];
      for(const [kind,body] of [['original',html],['converted',resolved.htmlContent]]){
       const frame=document.createElement('iframe');frame.dataset.svgCheck=kind;frame.title=kind;frame.style.cssText='width:'+settings.frameWidth+'px;height:180px;display:block;border:0;margin-bottom:12px';
       const loaded=new Promise(resolve=>frame.onload=resolve);frame.srcdoc=buildScreenDocument({...screen,htmlContent:body},{baseCss:'',tokensCss:'',screenOverrides:'',deviceProfile:device,useCustomNavigation:true,includeMobileChrome:false,viewportWidth:settings.frameWidth,viewportHeight:844});document.body.append(frame);await loaded;
       await Promise.all(Array.from(frame.contentDocument.querySelectorAll('image,img')).map(img=>img.decode?.().catch(()=>{})));frames.push(frame);
      }
      await new Promise(r=>setTimeout(r,250));const boxes=frames.map(frame=>Array.from(frame.contentDocument.querySelectorAll('svg')).map(svg=>{const b=svg.getBoundingClientRect();return {id:svg.id,width:b.width,height:b.height,opacity:frame.contentWindow.getComputedStyle(svg).opacity};}));
      window.__svgSession=session;return {boxes,assetCount:prepared.resources.binaries.length,sourceUnchanged:screen.htmlContent===html,convertedSource:prepared.screen.htmlContent};
     }''',{'device':device,'mode':mode})
     shots=[]
     for kind in ['original','converted']:
      path=args.output/f'{engine}-{device}-{mode}-{kind}.png'
      await page.locator(f'iframe[data-svg-check="{kind}"]').screenshot(path=str(path));shots.append(path)
     from PIL import Image,ImageChops,ImageStat
     a,b=[Image.open(path).convert('RGB') for path in shots]
     diff=ImageChops.difference(a,b);mean=sum(ImageStat.Stat(diff).mean)/3
     row={'engine':engine,'device':device,'mode':mode,'meanPixelDifference':mean,'boxesEqual':result['boxes'][0]==result['boxes'][1],'assetCount':result['assetCount'],'sourceUnchanged':result['sourceUnchanged']}
     (args.output/f'{engine}-{device}-{mode}-converted.html').write_text(result['convertedSource'])
     rows.append(row)
     if not row['boxesEqual'] or not row['sourceUnchanged'] or mean>1.5:raise AssertionError(row)
     await page.evaluate('window.__svgSession.close()')
   finally:await browser.close()
 (args.output/'results.json').write_text(json.dumps({'scope':'svg-static-and-rendered-externalization-only','checks':rows},ensure_ascii=False,indent=2)+'\n')
 print(json.dumps(rows,ensure_ascii=False))

if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--output',type=Path,required=True)
 asyncio.run(run(parser.parse_args()))
