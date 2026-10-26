#!/usr/bin/env python3
"""Real iframe/preview/archive fault-and-retry checks; no AI/network fixtures."""
import argparse,asyncio,base64,hashlib,json
from pathlib import Path
from playwright.async_api import async_playwright
async def main(args):
 font_bytes=args.font.read_bytes();font={'path':f'assets/imports/fonts/{hashlib.sha256(font_bytes).hexdigest()}.ttf','bytes':base64.b64encode(font_bytes).decode()}
 async with async_playwright() as p:
  browser=await getattr(p,args.browser).launch(headless=True)
  page=await browser.new_page(viewport={'width':1600,'height':1000},locale='zh-CN');errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  args.screenshot.parent.mkdir(parents=True,exist_ok=True)
  try:
   await page.goto(args.url,wait_until='networkidle');await page.wait_for_function('Boolean(window.__projectStore)')
   result=await page.evaluate('''async font=>{
    const mod=async path=>import(performance.getEntriesByType('resource').map(e=>e.name).find(url=>new URL(url).pathname===path)||path);
    const {neutralModernTheme}=await mod('/src/utils/themePresets.ts'),{useWorkspaceStore}=await mod('/src/stores/useWorkspaceStore.ts'),{useHistoryStore}=await mod('/src/stores/useHistoryStore.ts');
    const {PageRenderCheck}=await mod('/src/services/ai/pageRenderCheck.ts'),{createProjectStorage}=await mod('/src/services/storage/projectStorage.ts'),{DeliveryRepository}=await mod('/src/services/storage/deliveryRepository.ts');
    const imagePath='assets/images/render-resource.svg',imageBytes=btoa('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#cbd5e1"/></svg>');
    const actualPrepare=DeliveryRepository.prototype.prepare,checks=[];
    const until=async predicate=>{for(let i=0;i<300;i++){if(predicate())return;await new Promise(r=>setTimeout(r,10));}throw Error('Audit did not settle');};
    for(const kind of ['image','font'])for(const mode of ['replace','force-replace','keep-both']){
     const store=window.__projectStore,id=store.getState().initNewProject({name:'提交资源复核 '+kind+'/'+mode,deviceProfile:'mobile',designSystem:neutralModernTheme,createSpecimen:false});
     const storage=createProjectStorage(id),scopedCss=`@font-face{font-family:AuditFont;src:url('${font.path}')}h1{font-family:AuditFont,sans-serif}`;
     const original='<main data-nid="root" class="col p-4 gap-4"><h1 data-nid="title" class="text-xl font-bold">资源检查</h1><button data-nid="action" class="btn btn-primary">保存资料</button></main>';
     await storage.writeBinary(imagePath,imageBytes);await storage.writeBinary(font.path,font.bytes);
     store.getState().addAsset({id:'image',name:'页面图片',type:'image',mimeType:'image/svg+xml',relPath:imagePath,source:'upload',refCount:1});
     store.getState().addScreen({name:'原页面',htmlContent:original,scopedCss},'target');useWorkspaceStore.setState({view:'workspace',activeProjectId:id});
     const candidate=original.replace('col p-4','col p-6').replace('</main>','<img data-nid="photo" src="'+imagePath+'" alt="示例图片" width="64" height="64"></main>');
     store.getState().stageScreenChange('target',candidate,'资源候选','增加图片并调整内边距');
     const inspect=async()=>{
      const s=store.getState(),key=s.getStagedRenderContextKey(),screen={...s.screens.target,htmlContent:s.stagedScreen.newHtml};
      const report=await PageRenderCheck.inspect({screen,settings:s.settings,designSystem:s.designSystem,assets:Object.values(s.assets),overrides:{}},storage);
      if(report.status!=='complete'||report.findings.some(f=>f.severity==='error'))throw Error('Real iframe did not pass: '+JSON.stringify(report));
      s.recheckStagedAssetFiles();await until(()=>store.getState().getStagedDeliveryReport().status==='ready'&&!store.getState().stagedPreview?.pending);return report;
     };
     const render=await inspect(),history=useHistoryStore.getState().past.length,checkpoint=useHistoryStore.getState().checkpoints.length;
     let failedRecord;const deletedPath=kind==='image'?imagePath:font.path;
     DeliveryRepository.prototype.prepare=async function(record){await actualPrepare.call(this,record);failedRecord=record;await storage.remove(deletedPath);};
     try{
      const applied=await store.getState().commitStagedDelivery(mode),s=store.getState();
      if(applied||s.screenOrder.length!==1||s.screens.target.htmlContent!==original||!s.stagedScreen||useHistoryStore.getState().past.length!==history||useHistoryStore.getState().checkpoints.length!==checkpoint)throw Error('Missing dependency was applied or candidate/history lost');
      if(!s.stagedAdoptionError?.includes('不存在')||s.getStagedDeliveryReport().status!=='blocked')throw Error('Missing resource not surfaced: '+JSON.stringify({kind,mode,archiveEntered:Boolean(failedRecord),adoptionError:s.stagedAdoptionError,delivery:s.getStagedDeliveryReport(),render:s.stagedRenderQuality}));
      const archived=await new DeliveryRepository(storage,id).get(failedRecord.after.id,failedRecord.id);
      if(archived?.status!=='aborted')throw Error('Prepared archive falsely applied');
      await storage.writeBinary(deletedPath,kind==='image'?imageBytes:font.bytes);DeliveryRepository.prototype.prepare=actualPrepare;
      const rerender=await inspect();
      if(!store.getState().stagedProjectAssetAudit.report.files.some(f=>f.relPath===font.path))throw Error('Font dependency absent from audit');
      if(!await store.getState().commitStagedDelivery(mode))throw Error('Restored resources could not be adopted: '+store.getState().stagedAdoptionError);
      const expected=mode==='keep-both'?2:1;if(store.getState().screenOrder.length!==expected||useHistoryStore.getState().past.length!==history+1)throw Error('Retry not one History operation');
      checks.push({kind,mode,initialRender:render.status,readFailureBlocked:true,archiveStatus:archived.status,originalAndHistoryPreserved:true,restoredRender:rerender.status,retryApplied:true,historyDelta:1,fontRecorded:true});
     }finally{DeliveryRepository.prototype.prepare=actualPrepare;}
    }
    return {checks,realFontPath:font.path};
   }''',font)
   assert len(result['checks'])==6 and not errors,errors
   await page.screenshot(path=str(args.screenshot));args.report.parent.mkdir(parents=True,exist_ok=True)
   report={'status':'passed','browser':args.browser,'version':browser.version,'scope':'Real iframe + local resource materialization + preview/archive writes + Store/History. Fault injected only after real archive prepare. No model calls or native IPC.','pageErrors':errors,'fontSource':str(args.font),'fontSha256':hashlib.sha256(font_bytes).hexdigest(),**result}
   args.report.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'status':'passed','browser':args.browser,'cases':len(result['checks'])}))
  except Exception:
   await page.screenshot(path=str(args.screenshot.with_stem(args.screenshot.stem+'-failure')));print(json.dumps({'pageErrors':errors,'text':(await page.locator('body').inner_text())[-4000:]},ensure_ascii=False));raise
  finally:await browser.close()
if __name__=='__main__':
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--url',default='http://127.0.0.1:5174');parser.add_argument('--browser',choices=['chromium','webkit'],default='chromium');parser.add_argument('--font',type=Path,default=Path('/System/Library/Fonts/Supplemental/NotoSansLycian-Regular.ttf'));parser.add_argument('--screenshot',type=Path,default=Path('/tmp/resource-final.png'));parser.add_argument('--report',type=Path,default=Path('/tmp/resource-final.json'));asyncio.run(main(parser.parse_args()))
