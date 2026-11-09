#!/usr/bin/env python3
"""Real recharge fixture through runtime/CSS compilation, SVG externalization and independent preview transport."""
import argparse
import asyncio
import json
from pathlib import Path
from playwright.async_api import async_playwright


async def run(args):
    args.output.mkdir(parents=True, exist_ok=False)
    rows = []
    async with async_playwright() as p:
        for engine in ['chromium', 'webkit']:
            browser = await getattr(p, engine).launch(headless=True)
            try:
                page = await browser.new_page(viewport={'width': 1400, 'height': 1000})
                errors = []
                page.on('pageerror', lambda error: errors.append(str(error)))
                await page.goto('http://127.0.0.1:5174/test/fixtures/design-experiment.html', wait_until='networkidle')
                result = await page.evaluate('''async(original)=>{
                    const {prepareHtmlImportRuntime}=await import('/src/services/import/htmlImportRuntime.ts');
                    const {prepareImportResources,persistImportResources,resolveImportedResources}=await import('/src/services/import/importResources.ts');
                    const {SvgMediaExternalizer}=await import('/src/services/import/svgMediaExternalizer.ts');
                    const {analyzeHtmlImport,convertHtmlImport}=await import('/src/services/import/htmlImport.ts');
                    const {LocalStorageStorage}=await import('/src/services/storage/projectStorage.ts');
                    const {createMediaResourceSession}=await import('/src/services/storage/mediaResourceSession.ts');
                    const {defaultTheme}=await import('/src/utils/themePresets.ts');
                    const {buildScreenDocument}=await import('/src/utils/screenDocument.ts');
                    const {assertExternalMedia,embeddedMediaIssue}=await import('/src/services/ai/externalMedia.ts');
                    const {cssUrls}=await import('/src/services/import/htmlImportCss.ts');
                    const settings={deviceProfile:'mobile',frameWidth:390,viewportGuideHeight:844,showViewportGuide:true,colorMode:'light',lodBudget:12};
                    const runtime=await prepareHtmlImportRuntime(original,'充值魔方点.html');
                    const first=analyzeHtmlImport(runtime.html,'充值魔方点.html',{expandedResources:true});
                    const resources=await prepareImportResources(first.sanitizedHtml,'充值魔方点.html',[],{expandedRuntime:true});
                    const storage=new LocalStorageStorage('recharge-media-'+crypto.randomUUID());
                    const svg=await SvgMediaExternalizer.prepare({screen:{id:'import-source',name:first.title,position:{x:0,y:0},htmlContent:resources.html,metadata:{importedHtml:{version:1,fileName:'充值魔方点.html',mode:'preserve',categories:[],changes:[],retained:[]}}},settings,designSystem:defaultTheme,storage,sourceImport:true});
                    resources.html=svg.screen.htmlContent;resources.binaries.push(...svg.resources.binaries);resources.resources.push(...svg.resources.resources);
                    const converted=convertHtmlImport(analyzeHtmlImport(resources.html,'充值魔方点.html',{expandedResources:true}),{mode:'preserve',designSystem:defaultTheme,colorMode:'light',deviceProfile:'mobile'});
                    for(const [stage,html] of [['original',original],['runtime',runtime.html],['first',first.sanitizedHtml],['externalized',resources.html],['converted',converted.htmlContent]])if(!new DOMParser().parseFromString(html,'text/html').querySelector('.grid-cols-3'))throw Error('Recharge source grid missing at '+stage+'; body: '+new DOMParser().parseFromString(html,'text/html').body.innerHTML.slice(0,1600));
                    assertExternalMedia(converted.htmlContent,converted.scopedCss);
                    await persistImportResources(resources,storage);
                    for(const binary of resources.binaries)if(await storage.readBinary(binary.relPath)!==binary.base64)throw Error('Independent asset bytes changed');
                    const session=createMediaResourceSession();window.__rechargeSession=session;
                    const resolved=await resolveImportedResources(converted.htmlContent,converted.scopedCss,storage,new Set(),{referenceUrl:session.url});
                    if(embeddedMediaIssue(resolved.htmlContent,resolved.scopedCss))throw Error('Preview embeds media');
                    const frame=document.createElement('iframe');frame.title='充值页完整导入';frame.style.cssText='width:390px;height:844px;border:0;display:block';
                    const loaded=new Promise(resolve=>frame.onload=()=>{if(frame.contentDocument?.querySelector('.grid-cols-3'))resolve();});frame.srcdoc=buildScreenDocument({id:'recharge',name:'充值魔方点',position:{x:0,y:0},htmlContent:resolved.htmlContent,scopedCss:resolved.scopedCss,metadata:{importedHtml:converted.metadata}},{baseCss:'',tokensCss:'',screenOverrides:'',deviceProfile:'mobile',useCustomNavigation:false,includeMobileChrome:true,viewportWidth:390,viewportHeight:844});document.body.append(frame);await Promise.race([loaded,new Promise((_,reject)=>setTimeout(()=>reject(Error('Recharge frame missing source grid: '+frame.contentDocument?.body.innerHTML.slice(0,1200))),10000))]);
                    const doc=frame.contentDocument,win=frame.contentWindow,icons=Array.from(doc.querySelectorAll('svg[data-external-media]'));
                    const urls=icons.map(icon=>icon.querySelector('image')?.getAttribute('href')??cssUrls(icon.getAttribute('style')??'')[0]);
                    if(urls.some(url=>!url))throw Error('An icon has no independent resource reference');
                    await Promise.all(urls.map(async url=>{const image=new Image();image.src=new URL(url,location.href).href;await image.decode();if(!image.naturalWidth)throw Error('Independent icon failed to load');}));
                    const cards=Array.from(doc.querySelector('.grid-cols-3').children).map(el=>{const box=el.getBoundingClientRect(),style=win.getComputedStyle(el);return {x:box.x,y:box.y,width:box.width,height:box.height,background:win.getComputedStyle(el.querySelector('.pkg-body')).backgroundImage,footerBackground:win.getComputedStyle(el.querySelector('.pkg-footer')).backgroundImage,radius:style.borderRadius};});
                    const cta=doc.querySelector('.cta-btn'),gradient=win.getComputedStyle(doc.querySelector('.balance-gradient')).backgroundImage;
                    return {independentAssets:resources.binaries.length,loadedIcons:urls.length,cards,cta:cta.textContent,gradient,title:converted.metadata?.navigationTitle,hasSourceBack:!!doc.querySelector('[aria-label="返回"]'),retainsHistory:!!doc.querySelector('[aria-label="充值记录"]'),horizontalOverflow:doc.documentElement.scrollWidth>390,html:converted.htmlContent};
                }''', (Path(__file__).resolve().parents[2]/'test/fixtures/import-recharge.html').read_text())
                # Eleven source drawings: eight Lucide placeholders plus three watermarks.
                # Source back is stripped; identical checkmarks/watermarks share content-addressed files.
                assert result['independentAssets'] == 6 and result['loadedIcons'] == 10, result
                cards = result['cards']
                assert len(cards) == 3 and max(c['y'] for c in cards)-min(c['y'] for c in cards) <= 2.1, cards
                assert all(c['width'] > 90 and c['height'] > 100 and 'linear-gradient' in c['background'] and 'linear-gradient' in c['footerBackground'] for c in cards), cards
                assert cards[0]['x'] < cards[1]['x'] < cards[2]['x'], cards
                assert 'linear-gradient' in result['gradient'] and '获取魔方点 · ¥6.00' in result['cta'], result
                assert not result['hasSourceBack'] and result['retainsHistory'] and not result['horizontalOverflow'], result
                assert not errors, errors
                (args.output/f'{engine}-converted.html').write_text(result.pop('html'))
                await page.get_by_title('充值页完整导入').screenshot(path=str(args.output/f'{engine}-recharge.png'))
                await page.evaluate('window.__rechargeSession.close()')
                rows.append({'engine':engine, **result, 'pageErrors':errors})
            finally:
                await browser.close()
    (args.output/'results.json').write_text(json.dumps({'status':'passed','scope':__doc__,'checks':rows},ensure_ascii=False,indent=2))
    print(json.dumps(rows,ensure_ascii=False))


if __name__ == '__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--output',type=Path,required=True)
    asyncio.run(run(parser.parse_args()))
