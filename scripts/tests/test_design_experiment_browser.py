#!/usr/bin/env python3
"""Affected real-DOM regression with explicit synthetic transport, never live Provider data."""
import argparse
import asyncio
import importlib.util
import json
import sys
from pathlib import Path
from playwright.async_api import async_playwright
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT/'scripts'))
spec = importlib.util.spec_from_file_location('runner', ROOT/'scripts/run-design-experiment.py')
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)


async def run(args):
    args.output.mkdir(parents=True, exist_ok=True)
    cases = []
    async with async_playwright() as pw:
        for engine in ['chromium', 'webkit']:
            browser = await getattr(pw, engine).launch(headless=True)
            try:
                context = await browser.new_context(viewport={'width':1600,'height':1100})
                external, errors, proxy_calls = [], [], []
                async def guard(route):
                    if '/api/ai-proxy' in route.request.url:
                        proxy_calls.append('unexpected')
                        await route.abort()
                    elif route.request.url.startswith((runner.ORIGIN+'/', 'data:', 'blob:')):
                        await route.fallback()
                    else:
                        external.append(route.request.url)
                        await route.abort()
                await context.route('**/*', guard)
                await context.route('**/@vite/client',lambda route:route.fulfill(status=200,content_type='application/javascript',body=runner.HMR_STUB))
                page = await context.new_page()
                page.on('pageerror', lambda e: errors.append(str(e)))
                await page.goto(runner.ORIGIN+'/test/fixtures/design-experiment.html?controlled',wait_until='networkidle')
                await page.wait_for_function('!!window.startControlledTrial')
                for device in ['mobile', 'pc']:
                    for mode in ['create', 'local', 'local-svg', 'repair', 'source-reject']:
                        value = await page.evaluate('''async ({device,mode})=>{
                          const {makeExperimentPlan}=await import('/src/services/ai/designKnowledge/experiment.ts');
                          const binding={provider:{id:'synthetic-browser',name:'Controlled only',baseUrl:'https://invalid.example',apiKey:'synthetic-private-value',protocol:'openai_compatible',isEnabled:true},model:'no-network'};
                          let html='<main data-nid="root0001" class="'+(device==='pc'?'container-max ':'')+'col gap-4 p-4"><h1 data-nid="title001" class="text-xl">资料</h1><p data-nid="copy0001">请确认资料，再保存。</p><button data-nid="action01" class="btn btn-primary">保存</button></main>';
                          const local=mode==='local'||mode==='local-svg';
                          if(mode==='local-svg'){
                            const doc=new DOMParser().parseFromString(html,'text/html'),button=doc.querySelector('[data-nid=action01]'),svg=doc.createElementNS('http://www.w3.org/2000/svg','svg'),path=doc.createElementNS('http://www.w3.org/2000/svg','path'),label=doc.createElement('span');
                            for(const [k,v]of Object.entries({'data-nid':'icon0001',class:'icon',viewBox:'0 0 24 24',fill:'none',stroke:'currentColor'}))svg.setAttribute(k,v);
                            path.setAttribute('d','M5 12l4 4L19 6');path.setAttribute('data-nid','path0001');svg.append(path);label.setAttribute('data-nid','label001');label.append(doc.createTextNode('保存'));button.replaceChildren(svg,label);html=doc.body.innerHTML;
                          }
                          const scenario={id:'example',device,kind:local?'local':'create',request:local?'按钮文案改为“保存资料”':'创建资料页，展示资料和保存按钮',...(local?{baselineHtml:html,targetNid:'action01'}:{})};
                          const scenarios=Array.from({length:12},(_,i)=>({...scenario,id:'s'+i}));
                          const identity={providerId:binding.provider.id,model:binding.model,providerFingerprint:'synthetic',sourceFingerprint:'synthetic',themeFingerprint:'synthetic',checkerFingerprint:'synthetic',budgetFingerprint:'synthetic'};
                          const plan=makeExperimentPlan(scenarios,42,identity),run=plan.runs.find(r=>r.mode==='baseline');
                          const functional={goal:'保存资料',actor:'示例用户',completion:['展示资料'],questions:[],features:[{id:'f1',title:'资料',change:'add',basis:'user',sourceIds:['user:request'],information:[{label:'资料',kind:'display'}],interactions:[{label:'保存',precondition:'已填写',outcome:'展示结果',targetScreenId:''}],states:[{name:'默认',condition:'进入页面',feedback:'可查看资料'}]}]};
                          let body=html;if(mode==='repair')body=body.replace('class="btn btn-primary"','class="btn btn-primary" style="font-size:0px"');
                          if(mode==='source-reject')body=body.replace('<button ','<button onclick="void(0)" ');
                          const responses=local?[JSON.stringify({requiresPageRewrite:false,reason:'明确文案',operations:[{type:'set_text',nid:mode==='local-svg'?'label001':'action01',value:'保存资料'}]})]:[JSON.stringify(functional),'<artifact type="text/html" title="资料">'+body+'</artifact>',JSON.stringify({operations:[{nid:'action01',type:'remove_styles',value:'font-size'}]})];
                          startControlledTrial({plan,runId:run.id,binding},responses);return {runId:run.id};
                        }''',{'device':device,'mode':mode})
                        await page.wait_for_function('trialHarness.poll()?.done',timeout=60000)
                        result = await page.evaluate('trialHarness.result()')
                        folder = args.output/f'{engine}-{device}-{mode}'
                        folder.mkdir(exist_ok=True)
                        (folder/'result.json').write_text(json.dumps(result, ensure_ascii=False, indent=2))
                        assert result and result['scope']=='controlled-transport', value
                        assert 'synthetic-private-value' not in json.dumps(result)
                        if mode=='source-reject':
                            assert not result['record']['finalPassed'] and result['record']['requests']==2, result.get('errorMessage')
                        else:
                            assert result['record']['finalPassed'], result.get('errorMessage')
                            assert result['reports'] and result['reports'][-1]['report']['status']=='complete'
                            if mode=='local-svg':
                                assert result['inputPreparation']['kind']=='externalize-legacy-svg' and len(result['inputPreparation']['resourceFiles'])==1
                                assert '<path' not in result['screen']['htmlContent'] and 'data:image' not in result['screen']['htmlContent']
                                assert 'data-external-media="mask"' in result['screen']['htmlContent']
                                assert 'data:image/svg+xml;base64,' in result['standaloneHtml']
                            assert result['repairAttempted']==(mode=='repair')
                            assert result['record']['firstPassed']==(mode!='repair')
                            assert result['record']['measurementComplete']
                            if engine=='chromium':
                                await runner.capture_page(context,result['renderDocument'],device,folder)
                                assert (folder/'page.png').stat().st_size>1000
                        cases.append({'browser':engine,'device':device,'mode':mode,'status':result['record']['status'],'requests':result['record']['requests'],'realRenderReports':len(result['reports'])})
                assert not errors and not proxy_calls and not external, {'errors':errors,'proxyCalls':proxy_calls,'external':external}
            finally:
                await browser.close()
    (args.output/'result.json').write_text(json.dumps({'scope':'controlled-transport-real-DOM','liveProviderCalls':0,'humanReviewPerformed':False,'cases':cases},ensure_ascii=False,indent=2))
    print(json.dumps({'cases':len(cases),'passed':True,'liveProviderCalls':0}))


if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output',required=True,type=Path)
    asyncio.run(run(parser.parse_args()))
