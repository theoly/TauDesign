#!/usr/bin/env python3
"""Real browser AIService parser/core/structured executor with local wire fixtures; no live Provider."""
import argparse,asyncio,json
from pathlib import Path
from playwright.async_api import async_playwright
async def main(args):
 async with async_playwright() as p:
  browser=await getattr(p,args.browser).launch(headless=True)
  page=await browser.new_page(viewport={'width':1500,'height':1000},locale='zh-CN');errors=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  try:
   await page.goto(args.url,wait_until='networkidle');await page.wait_for_function('Boolean(window.__projectStore)')
   result=await page.evaluate('''async()=>{
    const {DefaultAIEngineCore}=await import('/src/services/ai/engine/core/aiEngineCore.ts');
    const {AIServiceTransport}=await import('/src/services/ai/engine/transport/aiServiceTransport.ts');
    const {executeStructuredEdit}=await import('/src/services/ai/structuredEditExecutor.ts');
    const {buildDesignTaskContract}=await import('/src/services/ai/designWorkflow.ts');
    const {neutralModernTheme}=await import('/src/utils/themePresets.ts');
    const {proposeStyleRepair}=await import('/src/services/ai/controlledStyleRepair.ts');
    const {PageRenderCheck}=await import('/src/services/ai/pageRenderCheck.ts');
    const {createProjectStorage}=await import('/src/services/storage/projectStorage.ts');
    const {pageCreationContext}=await import('/src/services/ai/pageCreationValidation.ts');
    const historyUrl=performance.getEntriesByType('resource').map(e=>e.name).find(u=>new URL(u).pathname==='/src/stores/useHistoryStore.ts');
    const workspaceUrl=performance.getEntriesByType('resource').map(e=>e.name).find(u=>new URL(u).pathname==='/src/stores/useWorkspaceStore.ts');
    const {useHistoryStore}=await import(historyUrl),{useWorkspaceStore}=await import(workspaceUrl),store=window.__projectStore;
    const id=store.getState().initNewProject({name:'结构化输出结束状态验收',deviceProfile:'mobile',designSystem:neutralModernTheme,createSpecimen:false});
    useWorkspaceStore.setState({view:'workspace',activeProjectId:id});
    const html='<main data-nid="root" class="col p-4 gap-4"><h1 data-nid="title" class="text-sm">资料标题</h1><p data-nid="body">原有业务内容</p><button data-nid="action" class="btn btn-primary">保存资料</button></main>';
    store.getState().addScreen({name:'验证原页',htmlContent:html},'original');store.getState().setActiveScreen('original');
    const designSnapshot=()=>JSON.stringify(Object.fromEntries(Object.entries(store.getState().screens).map(([id,{measuredHeight,...screen}])=>[id,screen])));
    const state=store.getState(),screen=state.screens.original,baseline=designSnapshot(),past=useHistoryStore.getState().past.length;
    const fetchOriginal=window.fetch,checks=[];let wire='',requests=0,networkEscapes=0;
    const response=(protocol,raw,reason)=>{
     if(protocol==='openai_compatible')return 'data: '+JSON.stringify({choices:[{delta:{content:raw},finish_reason:reason}]})+'\\n\\ndata: [DONE]\\n\\n';
     if(protocol==='anthropic')return 'event: content_block_delta\\ndata: '+JSON.stringify({type:'content_block_delta',delta:{type:'text_delta',text:raw}})+'\\n\\nevent: message_delta\\ndata: '+JSON.stringify({type:'message_delta',delta:{stop_reason:reason}})+'\\n\\nevent: message_stop\\ndata: {"type":"message_stop"}\\n\\n';
     if(protocol==='gemini')return 'data: '+JSON.stringify({candidates:[{content:{parts:[{text:raw}]},finishReason:reason}]})+'\\n\\n';
     return JSON.stringify({message:{content:raw}})+'\\n'+JSON.stringify({done:true,done_reason:reason})+'\\n';
    };
    window.fetch=async(url,init)=>{
     if(String(url)!=='/api/ai-proxy'){networkEscapes++;throw new Error('Unexpected network request');}
     requests++;return new Response(new ReadableStream({start(controller){const encoded=new TextEncoder().encode(wire);for(let i=0;i<encoded.length;i+=13)controller.enqueue(encoded.slice(i,i+13));controller.close();}}),{status:200,headers:{'content-type':'text/event-stream'}});
    };
    try{
     for(const protocol of ['openai_compatible','anthropic','gemini','ollama_native'])for(const limited of [true,false]){
      const provider={id:'wire-'+protocol,name:'本地协议夹具',protocol,baseUrl:'https://fixture.invalid/v1',apiKey:'',isEnabled:true},core=new DefaultAIEngineCore(new AIServiceTransport());
      const reason=limited?(protocol==='anthropic'?'max_tokens':protocol==='gemini'?'MAX_TOKENS':'length'):(protocol==='anthropic'?'end_turn':'stop');
      const answer={requiresPageRewrite:false,reason:'fixture',operations:[{nid:'title',type:'add_classes',value:'font-bold'}]};
      wire=response(protocol,JSON.stringify(answer),reason);const before=requests;
      const contract=buildDesignTaskContract({intent:'modify_screen',request:'加粗指定标题',target:screen,elementNid:'title',deviceProfile:'mobile',frameWidth:390,designSystem:state.designSystem});
      const result=await executeStructuredEdit(core,{mode:'element',screen,request:contract.request,contract,settings:state.settings,designSystem:state.designSystem,colorMode:'light',elementNid:'title',binding:{provider,model:'fixture'},isCurrent:()=>true});
      if(limited){if(result.status!=='failed'||'html' in result||!result.executionRecord.errorMessage?.includes('输出上限'))throw Error(JSON.stringify(result));}
      else if(result.status!=='ready'||!result.html.includes('font-bold'))throw Error(JSON.stringify(result));
      if(requests-before!==1||designSnapshot()!==baseline||useHistoryStore.getState().past.length!==past||store.getState().stagedScreen)throw Error(JSON.stringify({kind:'State changed',protocol,limited,requests:requests-before,past,afterPast:useHistoryStore.getState().past.length,baseline:JSON.parse(baseline),after:store.getState().screens,staged:store.getState().stagedScreen}));
      checks.push({protocol,reason,status:result.status,error:result.status==='ready'?undefined:result.message,requests:requests-before,designStateUnchanged:true,historyUnchanged:true});
     }
     const repairHtml='<main data-nid="repair-root"><button data-nid="repair-action" class="btn btn-primary" style="font-size:0px">保存资料</button></main>';
     const repairScreen={id:'repair',name:'修复输入',position:{x:0,y:0},htmlContent:repairHtml};
     const render=await PageRenderCheck.inspect({screen:repairScreen,settings:state.settings,designSystem:state.designSystem,assets:[],overrides:{}},createProjectStorage(id));
     if(render.status!=='complete'||!render.findings.some(f=>f.severity==='error'))throw Error('Actual failing render was not measured');
     const provider={id:'repair-wire',name:'本地协议夹具',protocol:'openai_compatible',baseUrl:'https://fixture.invalid/v1',apiKey:'',isEnabled:true};
     const contract=buildDesignTaskContract({intent:'create_screen',request:'创建表单',deviceProfile:'mobile',frameWidth:390,designSystem:state.designSystem});
     wire=response(provider.protocol,JSON.stringify({operations:[{nid:'repair-action',type:'remove_styles',value:'font-size'}]}),'content_filter');const before=requests;
     const input={state,html:repairHtml,contract,render,context:pageCreationContext(state)},opts={model:{core:new DefaultAIEngineCore(new AIServiceTransport()),provider,model:'fixture'},isCurrent:()=>true};
     const first=await proposeStyleRepair(input,opts),second=await proposeStyleRepair(input,opts);
     if(first.status!=='blocked'||second.status!=='blocked'||requests-before!==1||!first.message.includes('过滤'))throw Error('Repair accepted filtered JSON or retried');
     if(designSnapshot()!==baseline||useHistoryStore.getState().past.length!==past)throw Error('Repair changed original');
     return {checks,repair:{status:first.status,message:first.message,requests:requests-before,actualRender:render,secondAttemptBlocked:true},requests,networkEscapes,designStateUnchanged:true,historyUnchanged:true,ignoredRuntimeMeasurement:"measuredHeight"};
    }finally{window.fetch=fetchOriginal;}
   }''')
   assert result['networkEscapes']==0 and result['requests']==9
   assert not errors,errors
   args.output.mkdir(parents=True,exist_ok=True)
   await page.screenshot(path=str(args.output/'screen.png'))
   report={'status':'passed','browser':args.browser,'version':browser.version,'scope':'Local protocol byte fixtures through real AIServiceTransport/DefaultAIEngineCore and structured edit executor; real iframe repair diagnosis. No live Provider/native IPC validation.','pageErrors':errors,**result}
   (args.output/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
   print(json.dumps({'status':'passed','browser':args.browser,'cases':len(result['checks']),'requests':result['requests'],'networkEscapes':0},ensure_ascii=False))
  finally:await browser.close()
if __name__=='__main__':
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--url',default='http://127.0.0.1:5174');parser.add_argument('--browser',choices=['chromium','webkit'],required=True);parser.add_argument('--output',type=Path,required=True)
 asyncio.run(main(parser.parse_args()))
