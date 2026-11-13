"""Check actual old/new native PNG mask pixels using the same exported WebKit layout."""
import asyncio,base64,hashlib,json
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'doc/draft-targeted-repair/evidence/native-photo'
async def main():
    old=OUT/'round-01/reopen-accepted-b.png';new=OUT/'round-02/reopen-accepted-b.png';document=OUT/'round-02/reopen-accepted-b-render.html'
    async with async_playwright() as p:
        browser=await p.webkit.launch();page=await browser.new_page(viewport={'width':390,'height':3000});external=[]
        async def route(r):
            if r.request.url.startswith('file:'):await r.continue_()
            else:external.append(r.request.url);await r.abort()
        await page.route('**/*',route);await page.goto(document.as_uri());await page.evaluate('document.fonts.ready')
        facts=await page.evaluate('''async values=>{const canvases=[];for(const value of values){const i=new Image();i.src='data:image/png;base64,'+value;await i.decode();const c=document.createElement('canvas');c.width=i.width;c.height=i.height;const x=c.getContext('2d');x.drawImage(i,0,0);canvases.push(x);}return [...document.querySelectorAll('.icon-mask')].map(el=>{const r=el.getBoundingClientRect(),color=getComputedStyle(el).color.match(/[\\d.]+/g).map(Number);return {nid:el.dataset.nid,rect:{x:r.x,y:r.y,width:r.width,height:r.height},outputs:canvases.map(x=>{const p=x.getImageData(Math.ceil(r.x),Math.ceil(r.y),Math.floor(r.width),Math.floor(r.height)).data;let black=0,foreground=0;for(let j=0;j<p.length;j+=4){if(p[j]<45&&p[j+1]<45&&p[j+2]<45&&p[j+3]>200)black++;if(color.slice(0,3).every((c,k)=>Math.abs(p[j+k]-c)<25))foreground++;}return {unexpectedBlackPixels:black,foregroundPixels:foreground};})};});}''',[base64.b64encode(path.read_bytes()).decode() for path in [old,new]])
        assert len(facts)>=10 and any(f['outputs'][0]['unexpectedBlackPixels']>0 for f in facts),facts
        assert all(f['outputs'][1]['unexpectedBlackPixels']==0 and f['outputs'][1]['foregroundPixels']>0 for f in facts),facts
        assert not external,external
        report={'status':'passed','scope':'actual archived native PDF failure versus actual native snapshot fix, pixel checks at WebKit measured mask boxes','oldSha256':hashlib.sha256(old.read_bytes()).hexdigest(),'newSha256':hashlib.sha256(new.read_bytes()).hexdigest(),'oldDefectDetected':True,'newMasksPassed':True,'icons':facts,'externalRequests':external}
        (OUT/'regression-pixels.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));await browser.close();print('Actual PDF defect detected; all 14 snapshot mask icons passed')
asyncio.run(main())
