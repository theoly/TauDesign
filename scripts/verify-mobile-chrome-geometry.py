#!/usr/bin/env python3
"""Read-only real mobile inputs: shared iframe/HTML/PNG documents and clipped decoration diagnostics.
Run --phase before before changing code, then --phase after against the same inputs/browser.
Does not simulate native dialogs or contact an AI provider.
"""
import argparse,asyncio,hashlib,json
from pathlib import Path
from PIL import Image,ImageChops
from playwright.async_api import async_playwright

def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
async def main(args):
 project=json.loads((args.project/'project.json').read_text()); source={}
 cases=[]
 for sid,title,status,nav,marker in [('screen-1791959703663-jupn','现场观察记录','vwyf256y','vwyf257a','保存现场观察标签'),('screen-1792046640135-n5t4','活动现场扫码核销调度台','xs1c25f2','xs1c25fe','点击扫码核销')]:
  path=args.project/'screens'/f'{sid}.html';source[str(path)]=sha(path)
  cases.append({'screen':{'id':sid,'name':title,'htmlContent':path.read_text()},'statusNid':status,'navNid':nav,'marker':marker})
 source[str(args.project/'project.json')]=sha(args.project/'project.json')
 imported_path=args.imported_page;source[str(imported_path)]=sha(imported_path)
 imported={'id':'decoration','name':'充值魔方点','htmlContent':imported_path.read_text(),'metadata':{'importedHtml':{'version':1,'fileName':'source.html','mode':'preserve','categories':[],'changes':[],'retained':[]}}}
 output=args.output/args.browser/args.phase;output.mkdir(parents=True,exist_ok=True)
 report={'status':'running','phase':args.phase,'scope':'Read-only real inputs; actual shared TypeScript document builders and iframe geometry; screenshot of PNG render document, not native rasterizer or AI.','sources':source,'cases':[]}
 async with async_playwright() as p:
  browser=await getattr(p,args.browser).launch(headless=True)
  page=await browser.new_page(viewport={'width':1200,'height':1300},locale='zh-CN',device_scale_factor=1)
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  await page.route('**/*',lambda route:route.continue_() if route.request.url.startswith(args.url) else route.abort())
  try:
   await page.goto(args.url,wait_until='networkidle')
   await page.evaluate('''async()=>{
    const {buildScreenDocument}=await import('/src/utils/screenDocument.ts');
    const {buildStandaloneHtml}=await import('/src/utils/exportRenderer.ts');
    const {buildExportRenderDocument}=await import('/src/utils/pngExporter.ts');
    const {normalizeMobileNavigation}=await import('/src/utils/mobileNavigation.ts');
    const {inspectRenderedQuality}=await import('/src/utils/renderedQuality.ts');
    const {compileTokensToCss}=await import('/src/utils/cssCompiler.ts');
    const {getBaseCss}=await import('/src/styles/baseCss.ts');
    window.__chromeGeometry={buildScreenDocument,buildStandaloneHtml,buildExportRenderDocument,normalizeMobileNavigation,inspectRenderedQuality,compileTokensToCss,getBaseCss};
   }''')
   for case in cases:
    result=await page.evaluate('''async({screen,statusNid,navNid,marker,project})=>{
     const a=window.__chromeGeometry,settings=project.settings;
     const opts={tokensCss:a.compileTokensToCss(project.designSystem.tokens,settings.colorMode,'mobile'),baseCss:a.getBaseCss('mobile'),screenOverrides:'',deviceProfile:'mobile',useCustomNavigation:false,viewportHeight:844,viewportWidth:390};
     const norm=a.normalizeMobileNavigation(screen.htmlContent,opts),canvas=a.buildScreenDocument(screen,{...opts,includeMobileChrome:true}),html=a.buildStandaloneHtml(screen,opts),png=a.buildExportRenderDocument(screen,{...opts,width:390,bgColor:'#fff'});
     const parser=new DOMParser(),read=s=>parser.parseFromString(s,'text/html');
     let frame=document.getElementById('geometry-frame');frame?.remove();frame=document.createElement('iframe');frame.id='geometry-frame';frame.style.cssText='position:fixed;left:0;top:0;width:390px;height:1100px;border:0;z-index:2147483647';
     const loaded=new Promise(resolve=>frame.onload=resolve);frame.srcdoc=canvas;document.body.append(frame);await loaded;await frame.contentDocument.fonts.ready;
     const d=frame.contentDocument;
     const count=(doc,selector)=>doc.querySelectorAll(selector).length;
     const custom=read(a.buildScreenDocument(screen,{...opts,useCustomNavigation:true,includeMobileChrome:true}));
     const n=read(norm.html),source=read(screen.htmlContent);
     const allowed=new Set([statusNid,navNid].flatMap(id=>{const root=source.querySelector(`[data-nid="${id}"]`);return root?[root,...root.querySelectorAll('[data-nid]')].map(el=>el.getAttribute('data-nid')):[]}));
     const unexpectedRemovedNids=Array.from(source.querySelectorAll('[data-nid]')).map(el=>el.getAttribute('data-nid')).filter(id=>!allowed.has(id)&&!n.querySelector(`[data-nid="${id}"]`));
     return {unexpectedRemovedNids,name:screen.name,title:norm.title,removedNids:norm.removedNids,canvasSourceStatus:count(d,`[data-nid="${statusNid}"]`),canvasSourceNav:count(d,`[data-nid="${navNid}"]`),chrome:count(d,'[data-taudesign-mobile-chrome="header"]'),
      htmlAppbars:count(read(html),'.appbar'),htmlSystemChrome:count(read(html),'[data-taudesign-mobile-chrome]'),pngAppbars:count(read(png),'.appbar'),pngChrome:count(read(png),'[data-taudesign-mobile-chrome="header"]'),
      customSourceStatus:count(custom,`[data-nid="${statusNid}"]`),customSourceNav:count(custom,`[data-nid="${navNid}"]`),customSystemNav:count(custom,'.td-mini-navigation'),businessMarker:!!d.body.textContent.includes(marker),
      radioBefore:count(source,'input[type="radio"]'),radioAfter:count(d,'input[type="radio"]'),radioChecked:count(d,'input[type="radio"]:checked'),firstPanel:d.getElementById('xs1c25panel1')?getComputedStyle(d.getElementById('xs1c25panel1')).display:null,
      secondPanel:d.getElementById('xs1c25panel2')?getComputedStyle(d.getElementById('xs1c25panel2')).display:null,
      businessH1Before:Array.from(source.querySelectorAll('section h1,article h1')).map(e=>e.textContent),businessH1After:Array.from(n.querySelectorAll('section h1,article h1')).map(e=>e.textContent),
      idempotent:a.normalizeMobileNavigation(norm.html,opts).html===norm.html,pcUnchanged:a.normalizeMobileNavigation(screen.htmlContent,{deviceProfile:'pc'}).html===screen.htmlContent};
    }''',{**case,'project':project})
    await page.locator('#geometry-frame').screenshot(path=str(output/(case['screen']['id']+'.png')))
    if args.phase=='after':
     assert result['canvasSourceStatus']==result['canvasSourceNav']==result['htmlAppbars']==result['htmlSystemChrome']==result['pngAppbars']==0,result
     assert result['chrome']==result['pngChrome']==result['customSourceNav']==1,result
     assert result['customSourceStatus']==result['customSystemNav']==0,result
     assert result['radioBefore']==result['radioAfter'] and result['businessMarker'] and result['businessH1Before']==result['businessH1After'],result
     assert result['idempotent'] and result['pcUnchanged'] and not result['unexpectedRemovedNids'],result
     if result['radioAfter']:assert result['radioChecked']==1 and result['firstPanel']!='none' and result['secondPanel']=='none',result
    report['cases'].append(result)
   decoration=await page.evaluate('''async({screen,project})=>{
    const a=window.__chromeGeometry,opts={tokensCss:a.compileTokensToCss(project.designSystem.tokens,project.settings.colorMode,'mobile'),baseCss:a.getBaseCss('mobile'),screenOverrides:'',deviceProfile:'mobile',useCustomNavigation:false,width:390,bgColor:'#fff',viewportHeight:844,viewportWidth:390};
    document.getElementById('geometry-frame')?.remove();const frame=document.createElement('iframe');frame.id='geometry-frame';frame.style.cssText='position:fixed;left:0;top:0;width:390px;height:906px;border:0;z-index:2147483647';
    const loaded=new Promise(resolve=>frame.onload=resolve);frame.srcdoc=a.buildExportRenderDocument(screen,opts);document.body.append(frame);await loaded;await frame.contentDocument.fonts.ready;
    const doc=frame.contentDocument,el=doc.querySelector('[data-nid="8a3b7114"]'),parent=el.parentElement,r=el.getBoundingClientRect(),p=parent.getBoundingClientRect();
    return {report:a.inspectRenderedQuality(doc),rect:{left:r.left,right:r.right},parent:{left:p.left,right:p.right,overflowX:getComputedStyle(parent).overflowX},mainAction:doc.body.textContent.includes('获取魔方点')};
   }''',{'screen':imported,'project':project})
   await page.locator('#geometry-frame').screenshot(path=str(output/'imported-png-document.png'))
   if args.phase=='after':
    assert not any(f['code']=='render_horizontal_overflow' and f.get('nid')=='8a3b7114' for f in decoration['report']['findings']),decoration
    before=args.output/args.browser/'before/imported-png-document.png'
    with Image.open(before) as b,Image.open(output/'imported-png-document.png') as a:
     assert a.size==b.size==(390,906)
     diff=ImageChops.difference(a.convert('RGB'),b.convert('RGB'));assert diff.getbbox() is None,'Decoration pixels changed'
    decoration['sameEngineImageUnchanged']=True
   else:assert any(f['code']=='render_horizontal_overflow' and f.get('nid')=='8a3b7114' for f in decoration['report']['findings']),decoration
   if args.phase=='after':
    report['negativeGeometry']=await page.evaluate('''async()=>{
     const a=window.__chromeGeometry,tests=[
      ['clipped','position:relative;overflow:hidden','div','position:absolute','',false],
      ['unclipped','position:relative','div','position:absolute','',true],
      ['fixed','position:relative;overflow:hidden','div','position:fixed','',true],
      ['escaping absolute','overflow:hidden','div','position:absolute','',true],
      ['clipped text','position:relative;overflow:hidden','p','position:absolute','保留完整业务文案',true],
      ['semantic media','position:relative;overflow:hidden','svg','position:absolute','<rect width="24" height="24"/>',true],
      ['transformed ancestor','position:relative;overflow:hidden;transform:scale(2);transform-origin:left top','div','position:absolute','',true]
     ],results=[];
     for(const [name,host,tag,style,content,expected] of tests){
      const frame=document.getElementById('geometry-frame'),loaded=new Promise(resolve=>frame.onload=resolve);
      frame.srcdoc=`<!doctype html><html><head><style>body{margin:0}</style></head><body><section style="width:358px;height:100px;margin-left:16px;${host}"><${tag} data-nid="outside" style="width:98px;height:40px;left:300px;top:0;${style}">${content}</${tag}></section></body></html>`;
      await loaded;const r=a.inspectRenderedQuality(frame.contentDocument),horizontal=r.findings.some(f=>f.nid==='outside'&&f.code==='render_horizontal_overflow');
      if(horizontal!==expected)throw new Error(JSON.stringify({name,expected,report:r}));
      if(name==='clipped text'&&!r.findings.some(f=>f.code==='render_clipped_text'))throw new Error('Text clipping was incorrectly suppressed');
      results.push({name,horizontal,findings:r.findings});
     }return results;
    }''')
   report['decoration']=decoration;assert decoration['mainAction'] and not errors,errors
   report.update(status='passed',browser=args.browser,version=browser.version,pageErrors=errors,sourceUnchanged=all(sha(Path(path))==value for path,value in source.items()))
   assert report['sourceUnchanged']
  finally:
   (output/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
   await browser.close()
 print(json.dumps({'status':report['status'],'phase':args.phase,'browser':args.browser,'sourceUnchanged':report['sourceUnchanged']},ensure_ascii=False))
if __name__=='__main__':
 parser=argparse.ArgumentParser(description=__doc__)
 parser.add_argument('--url',default='http://127.0.0.1:5174');parser.add_argument('--browser',choices=['chromium','webkit'],required=True);parser.add_argument('--phase',choices=['before','after'],required=True)
 parser.add_argument('--project',type=Path,default=Path('/Users/theoly/workspace/cowork/smatch'))
 parser.add_argument('--imported-page',type=Path,default=Path('/var/folders/7p/7d27k77s6b1cjhntn1gw95gh0000gn/T/taudesign-native-f08yskll/Mobile.aidesign/screens/a24ce991-6a3f-40df-bf54-3927008c8bc8.html'))
 parser.add_argument('--output',type=Path,default=Path('doc/design-workflow-refactor/evidence/mobile-chrome-geometry'))
 asyncio.run(main(parser.parse_args()))
