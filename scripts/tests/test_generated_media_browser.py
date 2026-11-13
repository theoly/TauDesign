#!/usr/bin/env python3
"""Generated radar/icon compilation, resource transport, creation History in real browsers."""
import argparse, asyncio, json, subprocess
from pathlib import Path
from playwright.async_api import async_playwright

def pixels(path):
 return subprocess.check_output(['/opt/homebrew/bin/ffmpeg','-v','error','-i',str(path),'-f','rawvideo','-pix_fmt','rgb24','-'])

async def main(args):
 args.output.mkdir(parents=True,exist_ok=True); rows=[]
 async with async_playwright() as p:
  for engine in ['chromium','webkit']:
   browser=await getattr(p,engine).launch(headless=True)
   try:
    page=await browser.new_page(viewport={'width':1300,'height':1000})
    await page.goto(args.base+'/test/fixtures/design-experiment.html',wait_until='networkidle')
    result=await page.evaluate('''async()=>{
     const {PipelineExecutor}=await import('/src/services/ai/engine/pipeline/executor.ts');
     const {DefaultAIEngineCore}=await import('/src/services/ai/engine/core/aiEngineCore.ts');
     const {MockTransport}=await import('/src/services/ai/engine/transport/mockTransport.ts');
     const {useProjectStore}=await import('/src/stores/useProjectStore.ts');
     const {useHistoryStore}=await import('/src/stores/useHistoryStore.ts');
     const {CanvasToolExecutor}=await import('/src/services/tools/canvasToolExecutor.ts');
     const {defaultTheme}=await import('/src/utils/themePresets.ts');
     const {LocalStorageStorage,createProjectStorage}=await import('/src/services/storage/projectStorage.ts');
     const {resolveImportedResources}=await import('/src/services/import/importResources.ts');
     const {createMediaResourceSession}=await import('/src/services/storage/mediaResourceSession.ts');
     const {assertExternalMedia}=await import('/src/services/ai/externalMedia.ts');
     const {buildScreenDocument}=await import('/src/utils/screenDocument.ts');
     const {compileTokensToCss}=await import('/src/utils/cssCompiler.ts');
     const {getBaseCss}=await import('/src/styles/baseCss.ts');
     const ds=structuredClone(defaultTheme);ds.tokens.colors.primary['500']='#5C8374';
     useProjectStore.getState().initNewProject({name:'隔离自动媒体验收',deviceProfile:'mobile',designSystem:ds,createSpecimen:false});
     const state=useProjectStore.getState(),storage=createProjectStorage(state.id,state.folderPath),settings=state.settings;
     const graphic=`<svg role="img" aria-label="五行能量分布" width="300" height="260" viewBox="0 0 300 260" style="color:var(--color-text-primary)"><title>五轴雷达图</title><defs><linearGradient id="energy" x1="0" y1="0" x2="1" y2="1"><stop offset="0" style="stop-color:var(--color-primary);stop-opacity:0.4"/><stop offset="1" style="stop-color:var(--color-primary);stop-opacity:0.1"/></linearGradient></defs><g fill="none" style="stroke:var(--color-border)"><polygon points="150,30 250,102 212,220 88,220 50,102"/><polygon points="150,70 210,114 187,185 113,185 90,114"/><path d="M150 30L150 135M250 102L150 135M212 220L150 135M88 220L150 135M50 102L150 135"/></g><polygon points="150,45 233,108 190,190 98,205 78,111" fill="url(#energy)" style="stroke:var(--color-primary);stroke-width:2"/><g fill="currentColor" style="font-size:14px;font-family:sans-serif;text-anchor:middle"><text x="150" y="20">金</text><text x="273" y="106">木</text><text x="222" y="244">水</text><text x="76" y="244">火</text><text x="28" y="106">土</text></g></svg>`;
     const icon=`<svg class="icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><title>发送</title><path d="M22 2L15 22L11 13L2 9Z M22 2L11 13"/></svg>`;
     const html=`<main class="p-4"><h1>今日决策</h1><p>今日能量指数 85 分</p><section class="card p-4">${graphic}<p>甲木 · 探险家人格</p></section><button class="btn btn-primary">${icon}<span>开始分析</span></button></main>`;
     const transport=new MockTransport();transport.queueResponse(`<artifact title="决策主页">${html}</artifact>`);let calls=0;
     const core=new DefaultAIEngineCore({id:'isolated',stream:(r,e)=>{calls++;return transport.stream(r,e);}});
     const output=await PipelineExecutor.execute({input:{rawPrompt:'创建决策助手主页，展示五行能量雷达图',activeScreenId:null},provider:{id:'isolated',name:'隔离测试',protocol:'openai_compatible',baseUrl:'http://mock',apiKey:''},model:'mock',engineCore:core,screens:{},deviceProfile:'mobile',frameWidth:390,designSystem:ds,baseSystemPrompt:'test',generatedMedia:{storage,settings,assets:[]}});
     if(output.status!=='applied')throw Error(JSON.stringify({status:output.status,error:output.errorMessage,quality:output.qualityReport}));
     assertExternalMedia(output.extractedHtml);if(calls!==1||output.generatedAssets.length!==2)throw Error('Unexpected code calls or media count');
     const session=createMediaResourceSession(),resolved=await resolveImportedResources(output.extractedHtml,undefined,storage,new Set(output.generatedAssets.map(a=>a.relPath)),{referenceUrl:session.url});
     document.body.replaceChildren();const frames=[];
     for(const [kind,body] of [['original',html],['compiled',resolved.htmlContent]]){
      const iframe=document.createElement('iframe');iframe.dataset.mediaTest=kind;iframe.style.cssText='width:390px;height:520px;display:block;border:0;margin:0';const loaded=new Promise(r=>iframe.onload=r);
      iframe.srcdoc=buildScreenDocument({id:'test',name:'测试',htmlContent:body,position:{x:0,y:0}},{screenOverrides:'',baseCss:getBaseCss('mobile'),tokensCss:compileTokensToCss(ds.tokens,'light'),deviceProfile:'mobile',includeMobileChrome:false,viewportWidth:390,viewportHeight:844});document.body.append(iframe);await loaded;await iframe.contentDocument.fonts.ready;frames.push(iframe);
     }
     await new Promise(r=>setTimeout(r,350));const boxes=frames.map(f=>Array.from(f.contentDocument.querySelectorAll('svg')).map(s=>{const b=s.getBoundingClientRect();return [b.x,b.y,b.width,b.height]}));
     const reads=[];const originalRead=LocalStorageStorage.prototype.readBinary;LocalStorageStorage.prototype.readBinary=async function(path){const value=await originalRead.call(this,path);reads.push({scope:this.scopeKey,path,size:value?.length});return value;};
     const created=await CanvasToolExecutor.executeAsync({tool:'create_screen',params:{title:'决策主页',html:output.extractedHtml,workflowContract:output.workflowContract,executionRecord:output.executionRecord,generatedAssets:output.generatedAssets}});
     if(!created.success)throw Error('Creation gate: '+JSON.stringify({reads,error:created.error,oldId:state.id,newId:useProjectStore.getState().id,files:await Promise.all(output.generatedAssets.map(async a=>({path:a.relPath,old:(await storage.readBinary(a.relPath))?.length,new:(await createProjectStorage(useProjectStore.getState().id,useProjectStore.getState().folderPath).readBinary(a.relPath))?.length})))}));
     LocalStorageStorage.prototype.readBinary=originalRead;
     const originalPaint=frames[0].contentDocument.defaultView.getComputedStyle(frames[0].contentDocument.querySelector('stop')).stopColor;if(originalPaint!=='rgb(92, 131, 116)')throw Error('Unexpected theme paint: '+originalPaint);
     await useProjectStore.getState().saveProjectChecked();const reopened=await useProjectStore.getState().loadProjectById(state.id);if(!reopened||Object.keys(useProjectStore.getState().assets).length!==2)throw Error('Saved assets did not reopen');
     const registered=Object.keys(useProjectStore.getState().assets).length;useHistoryStore.getState().undo();const undone=useProjectStore.getState().screenOrder.length===0&&Object.keys(useProjectStore.getState().assets).length===0;useHistoryStore.getState().redo();const redone=useProjectStore.getState().screenOrder.length===1&&Object.keys(useProjectStore.getState().assets).length===2;
     window.__generatedSession=session;
     return {calls,registered,reopened,undone,redone,boxes,originalPaint,html:output.extractedHtml,assets:output.generatedAssets,render:useProjectStore.getState().screens[created.screenId].metadata.creationEvidence.render};
    }''')
    shots=[]
    for kind in ['original','compiled']:
     path=args.output/f'{engine}-{kind}.png';await page.locator(f'iframe[data-media-test="{kind}"]').screenshot(path=str(path));shots.append(path)
    a,b=map(pixels,shots);assert len(a)==len(b);mae=sum(abs(x-y) for x,y in zip(a,b))/len(a)
    row={'engine':engine,**result,'meanPixelDifference':mae};rows.append(row)
    (args.output/f'{engine}-result.json').write_text(json.dumps(row,ensure_ascii=False,indent=2)+'\n')
    assert result['boxes'][0]==result['boxes'][1] and result['undone'] and result['redone'] and mae<2, row
    await page.evaluate('window.__generatedSession.close()')
   finally:await browser.close()
 (args.output/'results.json').write_text(json.dumps({'scope':'synthetic-response-production-media-and-publication','results':rows},ensure_ascii=False,indent=2)+'\n')
 print(json.dumps([{'engine':r['engine'],'meanPixelDifference':r['meanPixelDifference'],'calls':r['calls'],'registered':r['registered'],'undone':r['undone'],'redone':r['redone']} for r in rows]))
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--output',type=Path,required=True);parser.add_argument('--base',default='http://127.0.0.1:5178');asyncio.run(main(parser.parse_args()))
