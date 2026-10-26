#!/usr/bin/env python3
"""Verify review UI, strict correction, actual candidate render/archive and stale-result cancellation using controlled model responses."""
import argparse
import asyncio
import json
from pathlib import Path
from playwright.async_api import async_playwright

async def main(args):
    async with async_playwright() as p:
        browser=await getattr(p,args.browser).launch(headless=True)
        page=await browser.new_page(viewport={'width':1600,'height':1000},locale='zh-CN')
        errors=[]
        page.on('pageerror',lambda error:errors.append(str(error)))
        try:
            await page.goto(args.url,wait_until='networkidle')
            await page.wait_for_function('Boolean(window.__projectStore)')
            fixture=await page.evaluate('''async()=>{
              const module=async path=>import(performance.getEntriesByType('resource').map(e=>e.name).find(url=>new URL(url).pathname===path)||path);
              const {neutralModernTheme}=await module('/src/utils/themePresets.ts');
              const {useWorkspaceStore}=await module('/src/stores/useWorkspaceStore.ts');
              const {useAIConfigStore,defaultProviders,defaultBindings}=await module('/src/stores/useAIConfigStore.ts');
              const {DefaultAIEngineCore}=await module('/src/services/ai/engine/core/index.ts');
              const store=window.__projectStore;
              const id=store.getState().initNewProject({name:'修改分析生命周期验证',deviceProfile:'mobile',designSystem:neutralModernTheme,createSpecimen:false});
              const html='<main data-nid="root" class="col gap-4 p-4"><section data-nid="card" class="card p-4"><h1 data-nid="title" class="text-sm">会员档案</h1><p class="text-muted">静态设计验证</p></section><section class="col gap-2">'+Array.from({length:12},(_,i)=>'<p data-nid="keep'+i+'">保留资料 '+i+'</p>').join('')+'</section><button class="btn btn-primary">保存资料</button></main>';
              store.getState().addScreen({name:'分析原页',htmlContent:html,position:{x:0,y:0}},'page');store.getState().setActiveScreen('page');
              useAIConfigStore.setState({providers:defaultProviders.map(p=>({...p,apiKey:'controlled-local-fixture'})),bindings:defaultBindings});
              useWorkspaceStore.setState({view:'workspace',activeProjectId:id});
              window.__analysisTest={calls:0,streamCalls:0,hold:false,renderStates:[]};
              let last='';store.subscribe(state=>{const status=state.stagedScreen ? state.getStagedDeliveryReport().status+':'+(state.stagedRenderQuality?.report.status??'none') : 'no-candidate';
                if(status!==last){last=status;window.__analysisTest.renderStates.push(status);}});
              DefaultAIEngineCore.prototype.generateObject=async()=>{
                const test=window.__analysisTest;test.calls++;
                if(test.hold)return new Promise(resolve=>test.release=resolve);
                if(test.calls===1)return {analysis:'wrong output protocol'};
                return {summary:'原页结构可保留，建议改善标题层级。',items:[
                  {title:'标题加粗',reason:'标题与正文层级接近',change:'为标题增加font-bold',scope:'local',operations:[{nid:'title',type:'add_classes',value:'font-bold'}]},
                  {title:'无法定位的建议',reason:'测试不可靠局部定位',change:'不执行此项',scope:'local',operations:[{nid:'missing',type:'add_classes',value:'font-bold'}]}]};
              };
              DefaultAIEngineCore.prototype.streamText=()=>{window.__analysisTest.streamCalls++;throw new Error('Unexpected full-page generation');};
              return {id,html};
            }''')
            composer=page.locator('textarea[placeholder^="输入设计诉求"]')
            await composer.fill('修改当前页面，优化信息层级')
            await page.get_by_title('发送设计诉求 (Enter)',exact=True).click()
            review=page.get_by_test_id('modification-review').last
            await review.get_by_role('checkbox').first.wait_for()
            await review.get_by_text('查看分析检查记录',exact=True).click()
            assert await review.get_by_text('共请求 2 次',exact=False).count()==1
            assert await review.get_by_text('需由用户选择其它执行方式',exact=False).count()==1
            assert await review.get_by_role('button',name='按所选内容生成新版',exact=True).is_disabled()
            await page.screenshot(path=str(args.screenshot.with_stem(args.screenshot.stem+'-review')))
            await review.get_by_role('checkbox').first.check()
            await review.get_by_role('button',name='按所选内容生成新版',exact=True).click()
            await page.wait_for_function("window.__projectStore.getState().getStagedDeliveryReport().status==='ready'")
            candidate=await page.evaluate('''async fixture=>{
              const store=window.__projectStore,s=store.getState(),c=s.stagedScreen;
              if(s.screens.page.htmlContent!==fixture.html)throw new Error('Review modified original');
              if(window.__analysisTest.calls!==2||window.__analysisTest.streamCalls)throw new Error('Confirmation requested more AI output');
              const receipt=c.workflowContract?.modificationReview;
              if(receipt?.selectedIds.join()!=='suggestion-1'||receipt.analysis.evidence.attempts!==2)throw new Error('Missing reviewed provenance');
              const {loadStagedCandidate}=await import('/src/services/storage/candidateRepository.ts');
              const saved=await loadStagedCandidate(s.id);
              if(JSON.stringify(saved.workflowContract.modificationReview)!==JSON.stringify(receipt))throw new Error('Candidate lost provenance');
              return {receipt,workflow:s.getStagedDeliveryReport().workflow};
            }''',fixture)
            await page.get_by_text('查看验收记录',exact=True).click()
            await page.get_by_text('已确认的分析来源',exact=True).click()
            args.screenshot.parent.mkdir(parents=True,exist_ok=True)
            await page.screenshot(path=str(args.screenshot))
            await page.wait_for_function("window.__projectStore.getState().getStagedDeliveryReport().status==='ready'")
            delivery=await page.evaluate('''async()=>{
              const s=window.__projectStore.getState();
              if(!(await s.adoptStagedChange()))throw new Error(JSON.stringify({reason:window.__projectStore.getState().stagedAdoptionError,report:window.__projectStore.getState().getStagedDeliveryReport()}));
              const {DeliveryRepository}=await import('/src/services/storage/deliveryRepository.ts');
              const {createProjectStorage}=await import('/src/services/storage/projectStorage.ts');
              const records=(await new DeliveryRepository(createProjectStorage(s.id),s.id).listForScreen('page')).records;
              if(records.length!==1||!records[0].candidate.workflowContract.modificationReview)throw new Error('Archive lost analysis');
              window.__projectStore.getState().saveProject();
              return {id:records[0].id,receipt:records[0].candidate.workflowContract.modificationReview,renderStates:window.__analysisTest.renderStates};
            }''')
            assert delivery['receipt']==candidate['receipt']
            # Same UI entry, non-cooperative model returns invalid JSON after the page changes.
            await page.evaluate('window.__analysisTest.hold=true')
            await composer.fill('修改当前页面，优化信息层级')
            await page.get_by_title('发送设计诉求 (Enter)',exact=True).click()
            await page.wait_for_function('Boolean(window.__analysisTest.release)')
            await page.evaluate('''()=>{
              const store=window.__projectStore,s=store.getState();
              store.getState().updateScreenHtml('page',s.screens.page.htmlContent+'<!-- changed during analysis -->');
              window.__analysisTest.release({invalid:true});
            }''')
            await page.get_by_test_id('modification-review').last.get_by_text('原页面或工程已变化，请重新分析。',exact=True).wait_for()
            stale=await page.evaluate('({calls:window.__analysisTest.calls,streams:window.__analysisTest.streamCalls,staged:Boolean(window.__projectStore.getState().stagedScreen)})')
            assert stale=={'calls':3,'streams':0,'staged':False},stale
            await page.reload(wait_until='networkidle')
            await page.wait_for_function('Boolean(window.__projectStore)')
            reopened=await page.evaluate('''async fixture=>{
              const url=performance.getEntriesByType('resource').map(e=>e.name).find(url=>new URL(url).pathname==='/src/stores/useWorkspaceStore.ts');
              const {useWorkspaceStore}=await import(url);if(!useWorkspaceStore.getState().openProject(fixture.id))throw new Error('Reopen failed');
              const {DeliveryRepository}=await import('/src/services/storage/deliveryRepository.ts');
              const {createProjectStorage}=await import('/src/services/storage/projectStorage.ts');
              const records=(await new DeliveryRepository(createProjectStorage(fixture.id),fixture.id).listForScreen('page')).records;
              if(records.length!==1||records[0].candidate.workflowContract.modificationReview.analysis.evidence.workflow.status!=='ready')throw new Error('Reload lost diagnostic');
              return {count:records.length,receipt:records[0].candidate.workflowContract.modificationReview};
            }''',fixture)
            assert reopened['receipt']==delivery['receipt']
            assert not errors,errors
            report={'status':'passed','browser':args.browser,'version':browser.version,'controlledModel':True,'candidate':candidate,'delivery':delivery,'stale':stale,'reopened':reopened,'pageErrors':errors,'screenshot':str(args.screenshot),'reviewScreenshot':str(args.screenshot.with_stem(args.screenshot.stem+'-review'))}
            if args.report:
                args.report.parent.mkdir(parents=True,exist_ok=True)
                args.report.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
            print(json.dumps({'status':'passed','browser':args.browser,'calls':stale['calls'],'archived':reopened['count']},ensure_ascii=False))
        except Exception:
            args.screenshot.parent.mkdir(parents=True,exist_ok=True)
            await page.screenshot(path=str(args.screenshot.with_stem(args.screenshot.stem+'-failure')))
            print(json.dumps({'pageErrors':errors,'text':(await page.locator('body').inner_text())[-6000:]},ensure_ascii=False))
            raise
        finally:
            await browser.close()

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url',default='http://127.0.0.1:5174')
    parser.add_argument('--browser',choices=['chromium','webkit'],default='chromium')
    parser.add_argument('--screenshot',type=Path,default=Path('/tmp/taudesign-modification-analysis.png'))
    parser.add_argument('--report',type=Path)
    asyncio.run(main(parser.parse_args()))
