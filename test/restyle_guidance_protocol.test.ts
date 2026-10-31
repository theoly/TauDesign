import {TaskBudget} from '../src/services/ai/taskBudget';
import {expect,test} from 'bun:test';
import {executeRestyleTarget} from '../src/services/ai/restyleExecutor';
import {buildPolishPrompt} from '../src/services/ai/polishPrompt';
import {DefaultAIEngineCore} from '../src/services/ai/engine/core/aiEngineCore';
import {MockTransport} from '../src/services/ai/engine/transport/mockTransport';
import {buildRestyleContract} from '../src/services/ai/designWorkflow';
import {techBlueTheme} from '../src/utils/themePresets';
import {guidancePacketIssue} from '../src/services/ai/designKnowledge/receipt';
import {createRestyleBudget} from '../src/services/ai/taskBudgetPolicy';
const provider={id:'fixture',name:'fixture',protocol:'openai_compatible' as const,baseUrl:'http://mock',apiKey:'RESTYLE_PROTOCOL_SECRET'};
const small='<main data-nid="root0001" class="container-max"><p data-nid="copy0001">长正文完整保留</p><button data-nid="save0001" class="btn btn-primary">保存</button></main>';
function options(html=small,imported=false){
 const target={id:'page',name:'资料页',kind:'screen' as const,html,imported,protectedNids:['save0001']};
 return {target,contract:buildRestyleContract({scope:'batch',target,confirmedScope:'长正文独立空间，保留全部文案',protectedNids:target.protectedNids,deviceProfile:'pc',frameWidth:1440,designSystem:techBlueTheme}),
  quality:{deviceProfile:'pc' as const,designSystem:techBlueTheme},request:{provider,model:'fixture',maxTokens:16384,messages:[{role:'system' as const,content:buildPolishPrompt({designSystem:techBlueTheme,deviceProfile:'pc',frameWidth:1440,protectedNids:target.protectedNids})},{role:'user' as const,content:html}]}};
}
function engine(response:(request:any)=>string){const requests:any[]=[],transport=new MockTransport();return {requests,core:new DefaultAIEngineCore({id:'capture',stream:(request,event)=>{requests.push(request);transport.queueResponse(response(request));return transport.stream(request,event);}})};}
test('small restyle replaces only the original craft window and keeps the strict HTML structural contract',async()=>{
 const plain=options(),guided=options(),a=engine(()=>small.replace('class="container-max"','class="container-max p-4"')),b=engine(()=>small.replace('class="container-max"','class="container-max p-4"'));
 const original=guided.request.messages[0].content;
 const before=await executeRestyleTarget(a.core,plain),after=await executeRestyleTarget(b.core,{...guided,contextualGuidance:{features:['long-copy']}});
 expect([before.status,after.status]).toEqual(['applied','applied']);expect(b.requests).toHaveLength(1);
 const baseline=a.requests[0].body.messages,actual=b.requests[0].body.messages;expect(JSON.stringify(actual).length).toBeLessThanOrEqual(JSON.stringify(baseline).length);
 expect(actual[1]).toEqual(baseline[1]);expect(actual[0].content).toContain('[LY-04@1]');expect(actual[0].content.slice(actual[0].content.indexOf('### OUTPUT CONTRACT'))).toBe(baseline[0].content.slice(baseline[0].content.indexOf('### OUTPUT CONTRACT')));
 expect(guidancePacketIssue(after.workflowContract!)).toBeUndefined();expect(after.workflowContract?.designGuidance?.protocol).toBe('html');expect(guided.request.messages[0].content).toBe(original);expect(guided.contract.designGuidance).toBeUndefined();
});
for(const imported of [false,true])test(`${imported?'imported variables':'native classes'} large restyle keeps JSON-only patch groups and uses the original parent ledger`,async()=>{
 const padding='<!--'+'source-preserved '.repeat(1800)+'-->';
 const html=imported?'<html><head><style>:root{--brand:#ff6600;--page:#fff7ef}'+padding.replace('<!--','/*').replace('-->','*/')+'</style></head><body data-nid="root0001"><button data-nid="save0001" class="btn btn-primary">保存</button></body></html>':small.replace('</main>',Array.from({length:26},(_,i)=>`<p data-nid="para${i}">保留段落${i}</p>`).join('')+padding+'</main>');
 const respond=(r:any)=>{const p=JSON.parse(r.body.messages[1].content);return JSON.stringify(imported?{bindings:p.items.map((item:any)=>({id:item.id,role:'primary'}))}:{operations:p.items.length?[{nid:p.items[0].nid,add:['p-4'],remove:[]}]:[]});};
 const a=engine(respond),b=engine(respond),plain=options(html,imported),guided=options(html,imported),budget=createRestyleBudget([guided.target]);
 try{
  const before=await executeRestyleTarget(a.core,plain),after=await executeRestyleTarget(b.core,{...guided,contextualGuidance:{features:['long-copy']},taskBudget:budget});
  expect([before.status,after.status]).toEqual(['applied','applied']);expect(b.requests.length).toBeGreaterThanOrEqual(imported?1:2);expect(b.requests).toHaveLength(a.requests.length);
  for(let i=0;i<b.requests.length;i++){
   const old=a.requests[i].body,next=b.requests[i].body;expect(next.max_tokens).toBe(2048);expect(next.response_format).toBeUndefined();expect(next.messages[1]).toEqual(old.messages[1]);expect(JSON.stringify(next.messages).length).toBeLessThanOrEqual(JSON.stringify(old.messages).length);
   expect(next.messages[0].content).toContain('[LY-04@1]');expect(next.messages[0].content).toContain('只返回JSON');expect(next.messages[0].content).not.toContain('OUTPUT CONTRACT — POLISH');
   expect(JSON.stringify(next.messages)).not.toContain('source-preserved');
  }
  expect(after.workflowContract?.designGuidance?.protocol).toBe('style-patch-json');expect(guidancePacketIssue(after.workflowContract!)).toBeUndefined();expect(after.workflowContract?.designGuidance?.requests).toHaveLength(b.requests.length);
  expect(after.workflowContract?.designGuidance?.requests.every(r=>r.status==='completed'&&r.outputProtocol==='stream-text'&&r.injectedRuleIds.includes('LY-04'))).toBe(true);
  expect(budget.snapshot().requests).toBe(b.requests.length);expect(budget.snapshot().closed).toBe(false);expect(guided.target.html).toBe(html);expect(after.html).toContain('保存');expect(after.diff?.textChanged).toBe(0);
 }finally{budget.close();}
});
test('a required rule packet cannot cross the HTML/patch boundary or run under an unrelated restyle target',async()=>{
 const f=options(),a=engine(()=>small.replace('class="container-max"','class="container-max p-4"'));const first=await executeRestyleTarget(a.core,{...f,contextualGuidance:{features:['long-copy']}});
 const mismatch=structuredClone(first.workflowContract!);mismatch.designGuidance!.protocol='style-patch-json';const b=engine(()=>small);
 const wrong=await executeRestyleTarget(b.core,{...options(),contract:mismatch});expect(wrong.status).toBe('failed');expect(b.requests).toHaveLength(0);
 const other=options();other.target.id='another';expect((await executeRestyleTarget(b.core,{...other,contextualGuidance:{features:['long-copy']}})).status).toBe('failed');expect(b.requests).toHaveLength(0);
});
test('missing craft window is rejected before a request and cancellation never produces a usable restyle',async()=>{
 const a=engine(()=>small),f=options();f.request.messages[0].content='ONLY HTML';const out=await executeRestyleTarget(a.core,{...f,contextualGuidance:{features:['long-copy']}});expect(out.status).toBe('failed');expect(a.requests).toHaveLength(0);
 const controller=new AbortController();controller.abort();const b=engine(()=>small);const cancelled=await executeRestyleTarget(b.core,{...options(),contextualGuidance:{features:['long-copy']},request:{...options().request,signal:controller.signal}});expect(cancelled.status).toBe('failed');expect(b.requests).toHaveLength(0);
});

test('restyle budget rejection creates neither a model receipt nor monitored request activity',async()=>{
 const f=options(),a=engine(()=>small),budget=new TaskBudget({maxRequests:1,maxRequestedOutputTokens:16384,maxDurationMs:10000,maxRequestDurationMs:10000});
 budget.reserve(16384).settle();const requests:number[]=[];
 const result=await executeRestyleTarget(a.core,{...f,contextualGuidance:{features:['long-copy']},taskBudget:budget,onProgress:p=>requests.push(p.requestCount??0)});
 expect(result.status).toBe('failed');expect(a.requests).toHaveLength(0);expect(result.workflowContract?.designGuidance?.requests).toEqual([]);
 expect(Math.max(...requests)).toBe(0);expect(result.target.html).toBe(small);expect(budget.snapshot().requests).toBe(1);
});
