#!/usr/bin/env python3
"""At most four calls using the current native code binding, synthetic image only; credentials never written."""
import asyncio,argparse,importlib.util,json,time
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--output',type=Path,default=ROOT/'doc/retry-reuse-planning/evidence/2026-11-12-live-01');parser.add_argument('--field-alias',action='store_true');args=parser.parse_args();OUT=args.output.resolve()
async def main():
 if (OUT/'result.json').exists():raise RuntimeError('Existing live result retained; choose a new output directory')
 spec=importlib.util.spec_from_file_location('binding',ROOT/'scripts/verify-live-provider.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);binding,before=module.current_binding();secret=binding['provider'].get('apiKey','')
 OUT.mkdir(parents=True,exist_ok=True)
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True);page=await browser.new_page();external=[];proxy=[]
  async def route(r):
   if r.request.url.startswith('http://127.0.0.1:5174/'):
    if '/api/ai-proxy' in r.request.url:proxy.append('proxy')
    await r.continue_()
   elif r.request.url.startswith(('data:','blob:','about:')):await r.continue_()
   else:external.append('blocked-direct');await r.abort()
  await page.route('**/*',route)
  try:
   await page.goto('http://127.0.0.1:5174/');
   result=await page.evaluate('''({binding,fieldAlias})=>window.__referenceLive=(async()=>{
    const {PipelineExecutor}=await import('/src/services/ai/engine/pipeline/executor.ts');
    const {DefaultAIEngineCore}=await import('/src/services/ai/engine/core/aiEngineCore.ts');
    const {AIServiceTransport}=await import('/src/services/ai/engine/transport/aiServiceTransport.ts');
    const {createProjectStorage}=await import('/src/services/storage/projectStorage.ts');
    const {TaskBudget}=await import('/src/services/ai/taskBudget.ts');
    const {neutralModernTheme}=await import('/src/utils/themePresets.ts');
    const {safeModelDiagnostic}=await import('/src/services/ai/transportFailure.ts');
    const {nativeFieldLabels}=await import('/src/services/ai/explicitFieldContent.ts');
    const core=new DefaultAIEngineCore(new AIServiceTransport()),stream=core.streamText.bind(core),calls=[];
    core.streamText=o=>{if(calls.length>=4)throw Error('Live four-call limit; no additional request');calls.push({stage:o.provenance?.stepId,model:o.model,images:o.messages.filter(m=>m.imageUrl).length,thinking:o.enableThinking,maxTokens:o.maxTokens});return stream(o);};
    const canvas=document.createElement('canvas');canvas.width=390;canvas.height=320;const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,390,320);ctx.fillStyle='#111';ctx.font='24px sans-serif';ctx.fillText('基础资料',24,48);ctx.fillText('邮箱',24,102);ctx.strokeRect(24,120,340,48);ctx.fillText('保存',24,230);
    if(fieldAlias){canvas.height=840;ctx.fillStyle='white';ctx.fillRect(0,0,390,840);ctx.fillStyle='#111';ctx.font='22px sans-serif';ctx.fillText('基础资料',24,42);ctx.font='18px sans-serif';['昵称','姓名','性别','生日','民族','身高','居住地','家乡','有无婚史','接受对象婚育情况','未来生育想法'].forEach((label,i)=>{ctx.fillText(label,24,78+i*60);ctx.strokeRect(24,86+i*60,340,30);});ctx.fillText('保存',24,782);}
    const prompt=fieldAlias?'新建一个基础资料页，完整包含参考图的11个字段和保存按钮；基础资料表单使用现居地字段名称，其他字段标签保持图中原文。全部在当前页填写，不跳转，不插入图片，不新增其他业务。':'新建一个基础资料页，包含参考图中的邮箱输入框和保存按钮，在当前页填写，不跳转。不插入图片，不新增其他业务。';
    const storage=createProjectStorage('live-reference-'+crypto.randomUUID()),budget=new TaskBudget({maxRequests:4,maxRequestedOutputTokens:34568,maxDurationMs:180000,maxRequestDurationMs:90000});
    const start=Date.now(),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),180000);
    try{const output=await PipelineExecutor.execute({input:{rawPrompt:prompt,attachment:{name:'synthetic-form.png',dataUrl:canvas.toDataURL('image/png')},activeScreenId:null,decision:{intent:'create_screen',targetScreenId:null,reason:'独立合成验收'}},screens:{},provider:binding.provider,model:binding.model,engineCore:core,taskBudget:budget,referenceProcessing:{binding,storage},pageTaskPlanning:{},writeStrategy:'auto',deviceProfile:'mobile',frameWidth:390,designSystem:neutralModernTheme,baseSystemPrompt:'只输出当前页完整artifact，媒体使用外部资源，不输出推理。',signal:controller.signal});
     const renderedLabels=nativeFieldLabels(new DOMParser().parseFromString(output.extractedHtml??'','text/html'));
     return {status:output.status==='applied'?'passed':'failed',pipelineStatus:output.status,message:safeModelDiagnostic(output.errorMessage??'',binding.provider.apiKey),seconds:(Date.now()-start)/1000,calls,budget:budget.snapshot(),imageParsed:!!output.workflowContract?.referenceImage?.evidence,planningComplete:!!output.workflowContract?.pageTaskPlan,codeNoImages:calls.filter(c=>c.stage!=='reference-observation').every(c=>c.images===0),fieldsKept:fieldAlias?renderedLabels.includes('现居地'):!!output.extractedHtml?.includes('邮箱'),...(fieldAlias?{observedLabels:output.workflowContract?.referenceImage?.evidence?.observation.fields.map(f=>f.label),plannedLabels:output.workflowContract?.pageTaskPlan?.plan.features.flatMap(f=>f.information.map(i=>i.label)),renderedLabels}:{}),finishReason:output.executionRecord?.finishReason,usage:output.usage};
    }catch(error){return {status:'failed',message:safeModelDiagnostic(error instanceof Error?error.message:String(error),binding.provider.apiKey),calls,budget:budget.snapshot(),seconds:(Date.now()-start)/1000};}finally{clearTimeout(timer);budget.close();}
   })()''',{'binding':binding,'fieldAlias':args.field_alias})
   _,after=module.current_binding();report={**result,'scope':__doc__,'provider':binding['provider']['name'],'model':binding['model'],'bindingUnchanged':before==after,'directRequests':external,'proxyRequests':len(proxy)}
   encoded=json.dumps(report,ensure_ascii=False,indent=2)
   if secret and secret in encoded:raise RuntimeError('Credential redaction failed; report not written')
   (OUT/'result.json').write_text(encoded);print(json.dumps({k:report.get(k) for k in ['status','pipelineStatus','seconds','imageParsed','planningComplete','codeNoImages','fieldsKept','bindingUnchanged','proxyRequests']},ensure_ascii=False))
  finally:await browser.close()
asyncio.run(main())
