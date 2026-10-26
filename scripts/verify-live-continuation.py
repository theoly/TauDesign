#!/usr/bin/env python3
"""Opt-in, at most one real suffix request on a synthetic prefix; never sends user projects."""
import argparse
import asyncio
import importlib.util
import json
from pathlib import Path
from urllib.parse import urlparse
from playwright.async_api import async_playwright

async def main(args):
    spec = importlib.util.spec_from_file_location('binding', Path(__file__).with_name('verify-live-provider.py'))
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    binding, before_hash = module.current_binding()
    secret = binding['provider'].get('apiKey', '')
    args.report.parent.mkdir(parents=True, exist_ok=True)
    report = {'status': 'running', 'scope': __doc__, 'provider': binding['provider']['name'], 'model': binding['model']}
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={'width': 1600, 'height': 1000})
        page = await context.new_page()
        proxy, direct = [], []
        async def route(r):
            url = urlparse(r.request.url)
            if url.scheme in ('http','https') and url.hostname not in ('127.0.0.1','localhost'):
                direct.append(url.hostname); await r.abort()
            else:
                if url.path == '/api/ai-proxy': proxy.append({'method': r.request.method})
                await r.continue_()
        await context.route('**/*', route)
        try:
            await page.goto(args.url, wait_until='networkidle')
            # Keep the actual pending protocol operation rooted, including while Chromium collects garbage.
            result = await page.evaluate('''binding=>window.__liveSuffixTask=(async()=>{
              const {streamWithContinuation}=await import('/src/services/ai/boundedContinuation.ts');
              const {continuationBindingKey,continuationContextKey}=await import('/src/services/ai/generationContinuation.ts');
              const {contentFingerprint}=await import('/src/services/ai/designWorkflow.ts');
              const {DefaultAIEngineCore}=await import('/src/services/ai/engine/core/aiEngineCore.ts');
              const {AIServiceTransport}=await import('/src/services/ai/engine/transport/aiServiceTransport.ts');
              const {finalizeModelHtml}=await import('/src/services/ai/modelHtmlResult.ts');
              const {PageRenderCheck}=await import('/src/services/ai/pageRenderCheck.ts');
              const {neutralModernTheme}=await import('/src/utils/themePresets.ts');
              const {createProjectStorage}=await import('/src/services/storage/projectStorage.ts');
              const prefix='<artifact type="screen" title="续写验证"><main class="container-max col gap-4 p-4"><h1 class="text-xl font-bold">会员权益</h1><p class="text-sm">认真交友，';
              const messages=[{role:'system',content:'你是静态HTML编辑器，直接执行最后一条续写协议，不解释。只使用已有class：container-max col gap-4 p-4 text-xl font-bold text-sm btn btn-primary。不要写CSS、脚本或图片。'},
                {role:'user',content:'做一个简单会员页，标题会员权益，段落认真交友，真诚相遇，最后一个主按钮文字查看权益。保留已经写出的内容，接完剩余段落、按钮并闭合main和artifact。'}];
              const options={provider:binding.provider,model:binding.model,messages,maxTokens:8192};
              const checkpoint={version:1,prefix,prefixFingerprint:contentFingerprint(prefix),contextKey:continuationContextKey(messages),bindingKey:continuationBindingKey(options),messages,messagesFingerprint:continuationContextKey(messages),previousContinuations:2};
              const core=new DefaultAIEngineCore(new AIServiceTransport()),original=core.streamText.bind(core);let requests=0;
              core.streamText=o=>{if(++requests>1)throw Error('One live request limit reached; no additional provider call');const stream=original(o);void stream.textPromise.then(text=>window.__liveSuffixRaw=text,()=>{});return stream;};
              const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),120000),start=Date.now();
              try{
                const result=await streamWithContinuation(core,{...options,signal:controller.signal},{resume:checkpoint});
                window.__liveSuffixResult={finishReason:result.finishReason,usage:result.usage,error:result.errorMessage};
                const final=finalizeModelHtml(result,{deviceProfile:'pc',designSystem:neutralModernTheme});
                if(result.errorMessage||final.status!=='valid'||!result.rawResponse.startsWith(prefix)||!final.html.includes('查看权益'))throw Error(JSON.stringify({error:result.errorMessage,status:final.status,message:final.message}));
                const settings={deviceProfile:'pc',frameWidth:1440,colorMode:'light',referenceDevice:{id:'pc-standard',name:'桌面标准',deviceProfile:'pc',width:1440,height:900},lodBudget:12};
                const render=await PageRenderCheck.inspect({screen:{id:'live-suffix-only',name:'续写验证',htmlContent:final.html,position:{x:0,y:0}},designSystem:neutralModernTheme,settings,assets:[],overrides:{}},createProjectStorage('live-suffix-only'));
                if(render.status!=='complete'||render.findings.some(f=>f.severity==='error'))throw Error(JSON.stringify(render));
                return {requests:1,seconds:(Date.now()-start)/1000,finishReason:result.finishReason,continuationCount:result.continuationCount,usage:result.usage,html:final.html,prefixPreserved:true,render,credentialsPersisted:!!localStorage.getItem('ai_designer_providers_v1')};
              }finally{clearTimeout(timer);}
            })()''', binding)
            assert not result['credentialsPersisted']
            assert len(proxy) == 1 and not direct
            report.update(status='passed', **result)
        except Exception as error:
            report.update(status='failed', error=str(error))
            report['diagnostic']=await page.evaluate('({raw:window.__liveSuffixRaw,result:window.__liveSuffixResult})')
            raise
        finally:
            report.update(proxyRequests=len(proxy), directRequests=direct, configUnchanged=module.current_binding()[1]==before_hash)
            raw = json.dumps(report, ensure_ascii=False, indent=2)
            if secret: raw = raw.replace(secret, '[REDACTED]')
            args.report.write_text(raw+'\n')
            await browser.close()
    print(json.dumps({'status': report['status'], 'proxyRequests': len(proxy), 'configUnchanged': report['configUnchanged']}))

if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--live-current-binding', action='store_true')
    parser.add_argument('--url', default='http://127.0.0.1:5174')
    parser.add_argument('--report', type=Path, required=True)
    args=parser.parse_args()
    if not args.live_current_binding: parser.error('Explicit --live-current-binding required before reading credentials or calling a provider')
    asyncio.run(main(args))
