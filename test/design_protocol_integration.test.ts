import {expect,test} from 'bun:test';
import {executeStructuredEdit,type StructuredEditOptions} from '../src/services/ai/structuredEditExecutor';
import {DefaultAIEngineCore} from '../src/services/ai/engine/core/aiEngineCore';
import {MockTransport} from '../src/services/ai/engine/transport/mockTransport';
import {buildDesignTaskContract} from '../src/services/ai/designWorkflow';
import {guidancePacketIssue} from '../src/services/ai/designKnowledge/receipt';
import {techBlueTheme} from '../src/utils/themePresets';
import {chatPageTaskPlan} from './fixtures/pageTaskPlan';
import {compactTokenCss} from '../src/services/ai/designKnowledge/tokenWindow';
const region='<section data-nid="region01"><h2 data-nid="title001">资料说明</h2><p data-nid="copy0001">长正文保持完整内容</p><button data-nid="save0001" class="btn btn-primary">保存</button></section>';
const filler='<aside>'+Array.from({length:24},(_,i)=>`<p data-nid="other${i}">保留外部${i}</p>`).join('')+'</aside>';
function fixture(mode:'element'|'region'|'local',device:'pc'|'mobile',functional=false){
 const html=`<main${device==='pc'?' class="container-max"':''}>${region}${filler}</main>`;
 const request=functional?'在卡片增加邮箱输入框，长正文仍保持完整':'长正文保持完整，调整文字层级';
 const target=mode==='element'?'region01':'region01';
 const options:StructuredEditOptions={mode,request,screen:{id:'page',name:'资料页',htmlContent:html},
  contract:buildDesignTaskContract({intent:'modify_screen',request,target:{id:'page',name:'资料页',htmlContent:html},...(mode==='element'?{elementNid:target}:{}),allowedChanges:[`element:${mode==='local'?'title001':target}`],deviceProfile:device,frameWidth:device==='pc'?1440:390}),
  settings:{deviceProfile:device,frameWidth:device==='pc'?1440:390},designSystem:techBlueTheme,colorMode:'light',binding:{provider:{id:'fixture',name:'fixture',protocol:'openai_compatible',baseUrl:'http://mock',apiKey:'PROTOCOL_SECRET'},model:'fixture'},isCurrent:()=>true,
  ...(mode==='element'?{elementNid:target}:mode==='region'?{regionNids:[target]}:{local:{allowedNids:['title001'],operations:[],supplement:true}})};
 const transport=new MockTransport(),requests:any[]=[];
 const core=new DefaultAIEngineCore({id:'capture',stream:(request,event)=>{requests.push(request);const schema=request.body.response_format?.json_schema?.schema;
  if(schema?.properties.features)transport.queueResponse(JSON.stringify({...chatPageTaskPlan,features:[{...chatPageTaskPlan.features[0],title:'邮箱',information:[{label:'邮箱',kind:'input'}]}]}));
  else if(mode==='local')transport.queueResponse(JSON.stringify({requiresPageRewrite:false,reason:'',operations:[{nid:'title001',type:'add_classes',value:'font-semibold'}]}));
  else transport.queueResponse(JSON.stringify({nid:target,html:region.replace('<section data-nid="region01">','<section data-nid="region01" class="col gap-4">').replace('</h2>',functional?'</h2><label>邮箱<input class="input"/></label>':mode==='element'?'</h2><p>提示</p>':'</h2>')}));
  return transport.stream(request,event);
 }});
 return {options,core,requests};
}
for(const device of ['mobile','pc'] as const)for(const mode of ['region','element','local'] as const)test(`${device} ${mode} protocol injects bounded rules without changing schema, sources, scope or baseline message length`,async()=>{
 // Explicit element structure is requested for this fixture. Finite element JSON remains covered separately.
 const plain=fixture(mode,device),guided=fixture(mode,device);
 if(mode==='element')for(const f of [plain,guided]){f.options.request='在卡片增加一行提示，长正文保持完整';f.options.contract.request=f.options.request;}
 guided.options.contextualGuidance={features:['long-copy']};
 const a=await executeStructuredEdit(plain.core,plain.options),b=await executeStructuredEdit(guided.core,guided.options);
 expect([a.status,b.status]).toEqual(['ready','ready']);expect(plain.requests).toHaveLength(1);expect(guided.requests).toHaveLength(1);
 const baseline=plain.requests[0].body,actual=guided.requests[0].body;expect(actual.response_format).toEqual(baseline.response_format);expect(actual.max_tokens).toBe(baseline.max_tokens);
 expect(JSON.stringify(actual.messages).length).toBeLessThanOrEqual(JSON.stringify(baseline.messages).length);
 const old=JSON.parse(baseline.messages.at(-1).content),next=JSON.parse(actual.messages.at(-1).content);
 expect(next).toEqual({...old,tokens:compactTokenCss(old.tokens)});expect(actual.messages[0].content).toStartWith(baseline.messages[0].content);
 expect(actual.messages[0].content).toContain('[LY-04@1]');expect(actual.messages[0].content).not.toContain('返回完整 HTML');
 expect(b.contract.designGuidance?.protocol).toBe(mode==='local'?'finite-json':'fragment-json');expect(guidancePacketIssue(b.contract)).toBeUndefined();
 expect(b.contract.designGuidance?.requests[0]).toMatchObject({status:'completed',outputProtocol:'json-object',injectedRuleIds:['LY-04']});expect(b.taskBudget?.requestedOutputTokens).toBe(mode==='local'?1800:4096);
 expect(guided.options.screen.htmlContent).toBe(plain.options.screen.htmlContent);expect(b.contract.allowedChanges).toEqual(a.contract.allowedChanges);
 expect(JSON.stringify(b.contract.designGuidance)).not.toContain('PROTOCOL_SECRET');
});
test('functional subtree freezes guidance after business planning and records only the eligible fragment request',async()=>{
 const f=fixture('element','mobile',true);f.options.contextualGuidance={features:['long-copy']};
 const result=await executeStructuredEdit(f.core,f.options);expect(result.status).toBe('ready');expect(f.requests).toHaveLength(2);expect(f.requests[0].body.messages[0].content).not.toContain('[LY-04@1]');expect(f.requests[1].body.messages[0].content).toContain('[LY-04@1]');
 expect(result.contract.pageTaskPlan).toBeDefined();expect(result.taskBudget?.requests).toBe(2);expect(result.contract.designGuidance?.requests).toHaveLength(1);expect(guidancePacketIssue(result.contract)).toBeUndefined();
});
test('a multi-region failure keeps independent call receipts and never returns the first replacement as a partial page',async()=>{
 const f=fixture('region','mobile');const second=region.replaceAll('region01','region02').replaceAll('title001','title002').replaceAll('copy0001','copy0002').replaceAll('save0001','save0002');
 f.options.screen.htmlContent=f.options.screen.htmlContent.replace('</aside>',second+'</aside>');f.options.regionNids=['region01','region02'];f.options.contract=buildDesignTaskContract({intent:'modify_screen',request:f.options.request,target:{id:'page',name:'资料页',htmlContent:f.options.screen.htmlContent},allowedChanges:['element:region01','element:region02'],deviceProfile:'mobile',frameWidth:390});f.options.contextualGuidance={features:['long-copy']};
 const transport=new MockTransport(),requests:any[]=[];transport.queueResponse(JSON.stringify({nid:'region01',html:region.replace('data-nid="region01"','data-nid="region01" class="col gap-4"')}));transport.enqueueScenario({events:[{type:'Error',kind:'network_error',message:'fixture second request failed'}]});
 const core=new DefaultAIEngineCore({id:'capture',stream:(request,event)=>{requests.push(request);return transport.stream(request,event);}});
 const result=await executeStructuredEdit(core,f.options);expect(result.status).toBe('failed');expect('html'in result).toBe(false);expect(requests).toHaveLength(2);expect(result.contract.designGuidance?.requests.map(r=>r.status)).toEqual(['completed','failed']);expect(new Set(result.contract.designGuidance?.requests.map(r=>r.requestId)).size).toBe(2);
 expect(result.contract.designGuidance?.requests.every(r=>r.injectedRuleIds.includes('LY-04'))).toBe(true);expect(result.taskBudget?.requests).toBe(2);
});
