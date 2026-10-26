#!/usr/bin/env python3
"""Exercise structured edits, real candidate gates, adoption and reload in an isolated browser project."""
import argparse
import asyncio
import json
from pathlib import Path
from playwright.async_api import async_playwright

async def main(args):
    async with async_playwright() as playwright:
        browser=await getattr(playwright,args.browser).launch(headless=True)
        page=await browser.new_page(viewport={'width':1600,'height':1000},locale='zh-CN')
        errors=[];navigations=[];console=[]
        page.on('pageerror',lambda error:errors.append(str(error)))
        page.on('framenavigated',lambda frame:navigations.append({'main':frame==page.main_frame,'url':frame.url}))
        page.on('console',lambda message:console.append(message.text) if message.type in ('error','warning') else None)
        try:
            await page.goto(args.url,wait_until='networkidle')
            await page.wait_for_function('Boolean(window.__projectStore)')
            fixture=await page.evaluate('''async()=>{
              const {neutralModernTheme}=await import('/src/utils/themePresets.ts');
              const url=performance.getEntriesByType('resource').map(entry=>entry.name).find(url=>new URL(url).pathname==='/src/stores/useWorkspaceStore.ts');
              const {useWorkspaceStore}=await import(url),store=window.__projectStore;
              const id=store.getState().initNewProject({name:'结构化修改浏览器验证',deviceProfile:'mobile',designSystem:neutralModernTheme,createSpecimen:false});
              useWorkspaceStore.setState({view:'workspace',activeProjectId:id});
              const source='<main data-nid="root" class="col gap-4 p-4"><section data-nid="region" class="card p-4"><h1 data-nid="title" class="text-sm">资料标题</h1></section><aside data-nid="other">'+Array.from({length:12},(_,i)=>'<p data-nid="keep'+i+'">保留内容 '+i+'</p>').join('')+'</aside><button data-nid="action" class="btn btn-primary">保存资料</button></main>';
              for(const [index,mode] of ['local','element','region'].entries())store.getState().addScreen({name:mode,htmlContent:source,position:{x:index*440,y:0}},mode);
              return {id,source};
            }''')
            checks=[]
            for mode in ['local','element','region']:
                result=await page.evaluate('''async({mode,fixture})=>{
                  window.__structuredDebug={mode,stage:'imports'};
                  const {executeStructuredEdit}=await import('/src/services/ai/structuredEditExecutor.ts');
                  const {buildDesignTaskContract}=await import('/src/services/ai/designWorkflow.ts');
                  const {captureModificationSnapshot,isModificationSnapshotCurrent}=await import('/src/services/ai/modificationReview.ts');
                  const store=window.__projectStore,s=store.getState(),screen=s.screens[mode],snapshot=captureModificationSnapshot(s,mode);
                  const contract=buildDesignTaskContract({intent:'modify_screen',request:'只调整标题区域的间距与字重',target:screen,
                    elementNid:mode==='element'?'region':undefined,deviceProfile:'mobile',frameWidth:390,
                    designSystem:s.designSystem,designSystemOrigin:s.designSystemOrigin,allowedChanges:[mode==='element'?'element:region':mode==='local'?'element:title':'element:region']});
                  let requests=0;
                  const core={streamText(){throw new Error('Structured flow requested full-page text');},async generateObject(){requests++;
                    return mode==='region'?{nid:'region',html:'<section data-nid="region" class="card p-6"><h1 data-nid="title" class="text-sm">资料标题</h1></section>'}
                      :{requiresPageRewrite:false,reason:'',operations:[{nid:'title',type:'add_classes',value:'font-bold'}]};}};
                  window.__structuredDebug.stage='execute';
                  const result=await executeStructuredEdit(core,{mode,screen,request:contract.request,contract,settings:s.settings,designSystem:s.designSystem,colorMode:s.settings.colorMode,
                    elementNid:mode==='element'?'region':undefined,regionNids:mode==='region'?['region']:undefined,
                    local:{operations:[{nid:'title',type:'add_classes',value:'font-bold'}],allowedNids:['title']},
                    binding:mode==='local'?undefined:{provider:{id:'isolated',name:'Controlled test response',protocol:'openai_compatible',baseUrl:'http://127.0.0.1',apiKey:''},model:'controlled'},
                    isCurrent:()=>isModificationSnapshotCurrent(store.getState(),snapshot)});
                  if(result.status!=='ready')throw new Error(JSON.stringify(result));
                  if(store.getState().screens[mode].htmlContent!==fixture.source)throw new Error('Executor changed original page');
                  window.__structuredDebug.stage='stage-candidate';
                  store.getState().stageScreenChange(mode,result.html,mode+'候选',contract.request,result.contract,result.executionRecord);
                  window.__structuredDebug.stage='return-result';
                  return {mode,requests,execution:result.executionRecord,html:result.html};
                }''',{'mode':mode,'fixture':fixture})
                await page.wait_for_function("window.__projectStore.getState().getStagedDeliveryReport().status==='ready'")
                archive=await page.evaluate('''async mode=>{
                  const store=window.__projectStore;
                  if(!(await store.getState().adoptStagedChange()))throw new Error(store.getState().stagedAdoptionError||'Adoption failed');
                  const {DeliveryRepository}=await import('/src/services/storage/deliveryRepository.ts');
                  const {createProjectStorage}=await import('/src/services/storage/projectStorage.ts');
                  const s=store.getState(),records=(await new DeliveryRepository(createProjectStorage(s.id),s.id).listForScreen(mode)).records;
                  const record=records[0];
                  if(record.status!=='applied'||record.candidate.executionRecord.localEdit.mode!==mode)throw new Error('Wrong archived execution');
                  const workflow=record.candidate.validationEvidence.delivery.workflow;
                  if(workflow?.status!=='ready'||!workflow.checks.some(check=>check.id==='structure'&&check.status==='passed'))throw new Error('Actual workflow stages were not archived');
                  if(record.preview.status!=='ready')throw new Error(record.preview.reason);
                  const img=new Image();img.src='data:image/png;base64,'+await createProjectStorage(s.id).readBinary(record.preview.relPath);await img.decode();
                  return {id:record.id,status:record.status,workflow,preview:record.preview,decoded:img.naturalWidth===390&&img.naturalHeight===844};
                }''',mode)
                assert result['requests']==(0 if mode=='local' else 1),result
                assert archive['decoded'],archive
                checks.append({**result,'archive':archive})
            await page.reload(wait_until='networkidle')
            await page.wait_for_function('Boolean(window.__projectStore)')
            reopened=await page.evaluate('''async fixture=>{
              const url=performance.getEntriesByType('resource').map(entry=>entry.name).find(url=>new URL(url).pathname==='/src/stores/useWorkspaceStore.ts');
              const {useWorkspaceStore}=await import(url);if(!useWorkspaceStore.getState().openProject(fixture.id))throw new Error('Reopen failed');
              const store=window.__projectStore;store.getState().setActiveScreen('local');
              const {DeliveryRepository}=await import('/src/services/storage/deliveryRepository.ts');
              const {createProjectStorage}=await import('/src/services/storage/projectStorage.ts');
              const result=[];
              for(const mode of ['local','element','region']){
                const records=(await new DeliveryRepository(createProjectStorage(fixture.id),fixture.id).listForScreen(mode)).records;
                if(records.length!==1||records[0].status!=='applied'||store.getState().screens[mode].htmlContent!==records[0].after.htmlContent)throw new Error('Reload lost delivery '+mode);
                result.push({mode,id:records[0].id});
              }
              return result;
            }''',fixture)
            assert not errors,errors
            args.screenshot.parent.mkdir(parents=True,exist_ok=True)
            await page.screenshot(path=str(args.screenshot))
            report={'status':'passed','browser':args.browser,'version':browser.version,'checks':checks,'reopened':reopened,'pageErrors':errors,'screenshot':str(args.screenshot)}
            if args.report:
                args.report.parent.mkdir(parents=True,exist_ok=True)
                args.report.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
            print(json.dumps({'status':'passed','browser':args.browser,'modes':[entry['mode'] for entry in checks],'reopened':len(reopened)},ensure_ascii=False))
        except Exception:
            args.screenshot.parent.mkdir(parents=True,exist_ok=True)
            await page.screenshot(path=str(args.screenshot.with_stem(args.screenshot.stem+'-failure')))
            try:
                debug=await page.evaluate('({debug:window.__structuredDebug,projectId:window.__projectStore?.getState().id,staged:window.__projectStore?.getState().stagedScreen?.targetScreenId})')
            except Exception as error:
                debug={'unavailable':str(error)}
            print(json.dumps({'status':'failed','pageErrors':errors,'navigations':navigations[-20:],'console':console[-20:],'state':debug},ensure_ascii=False))
            raise
        finally:
            await browser.close()

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url',default='http://127.0.0.1:5174')
    parser.add_argument('--browser',choices=['chromium','webkit'],default='chromium')
    parser.add_argument('--screenshot',type=Path,default=Path('/tmp/taudesign-structured-edits.png'))
    parser.add_argument('--report',type=Path)
    asyncio.run(main(parser.parse_args()))
