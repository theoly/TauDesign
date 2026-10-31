import {expect,test} from 'bun:test';
import {analyzeScreenModification,buildModificationReviewReceipt,isModificationReviewReceipt} from '../src/services/ai/modificationReview';
import {buildDesignTaskContract,type DesignTaskContract} from '../src/services/ai/designWorkflow';
import {DefaultAIEngineCore} from '../src/services/ai/engine/core/aiEngineCore';
import {MockTransport} from '../src/services/ai/engine/transport/mockTransport';
import {guidancePacketIssue} from '../src/services/ai/designKnowledge/receipt';
import {compactTokenCss} from '../src/services/ai/designKnowledge/tokenWindow';
import {techBlueTheme} from '../src/utils/themePresets';
const valid={summary:'长正文可增加层级',items:[{title:'正文层级',reason:'原正文层级不明显',change:'调整正文间距并完整保留',scope:'page',operations:[]}]};
const html='<main data-nid="root0001"><p data-nid="text0001">原正文完整保留</p></main>';
const provider={id:'analysis-fixture',name:'本地夹具',protocol:'openai_compatible' as const,baseUrl:'http://mock',apiKey:'ANALYSIS_SYNTHETIC_SECRET',isEnabled:true};
function fixture(device:'pc'|'mobile'='mobile',responses=[JSON.stringify(valid)]){
 const contract=buildDesignTaskContract({intent:'modify_screen',reviewRequired:true,request:'优化长正文的层级',target:{id:'page',name:'说明页',htmlContent:html},deviceProfile:device,frameWidth:device==='pc'?1440:390,designSystem:{id:techBlueTheme.id,name:techBlueTheme.name}});
 const requests:any[]=[],snapshots:DesignTaskContract[]=[],transport=new MockTransport();responses.forEach(text=>transport.queueResponse(text));
 const core=new DefaultAIEngineCore({id:'capture-analysis',stream:(request,event)=>{requests.push(request.body);return transport.stream(request,event);}});
 return {contract,transport,requests,snapshots,core,options:{provider,model:'fixture',name:'说明页',html,request:contract.request,designSystem:techBlueTheme,mode:'light' as const,deviceProfile:device,frameWidth:contract.device.frameWidth,workflowContract:contract,onContract:(c:DesignTaskContract)=>snapshots.push(c)}};
}
for(const device of ['pc','mobile'] as const)test(`${device} analysis preserves schema, sources and final character window while recording real JSON calls`,async()=>{
 const a=fixture(device),b=fixture(device);await analyzeScreenModification(a.core,a.options);const result=await analyzeScreenModification(b.core,{...b.options,contextualGuidance:{}});
 expect(b.requests).toHaveLength(1);expect(b.requests[0].response_format).toEqual(a.requests[0].response_format);expect(b.requests[0].max_tokens).toBe(4096);expect(JSON.stringify(b.requests[0].messages).length).toBeLessThanOrEqual(JSON.stringify(a.requests[0].messages).length);
 const before=JSON.parse(a.requests[0].messages[1].content),after=JSON.parse(b.requests[0].messages[1].content);expect(after).toEqual({...before,tokens:compactTokenCss(before.tokens)});
 expect(b.requests[0].messages[0].content).toContain('[LY-04@1]');expect(b.requests[0].messages[0].content).toContain('只分析，不生成HTML');
 const c=result.workflowContract!;expect(c.designGuidance!.protocol).toBe('analysis-json');expect(c.designGuidance!.requests[0]).toMatchObject({status:'completed',outputProtocol:'json-object',injectedRuleIds:['LY-04']});expect(guidancePacketIssue(c)).toBeUndefined();
 expect(b.contract.designGuidance).toBeUndefined();expect(b.snapshots[0].designGuidance!.requests).toEqual([]);expect(JSON.stringify(c)).not.toContain(provider.apiKey);
 const receipt=buildModificationReviewReceipt(result,['suggestion-1'],'保留原文',{id:'page',htmlContent:html});expect(isModificationReviewReceipt(JSON.parse(JSON.stringify(receipt)))).toBe(true);
});
test('a failed JSON parse remains failed and only a later schema-valid analysis correction can supersede it',async()=>{
 const f=fixture('mobile',['not JSON',JSON.stringify(valid)]),result=await analyzeScreenModification(f.core,{...f.options,contextualGuidance:{}}),c=result.workflowContract!,requests=c.designGuidance!.requests;
 expect(f.requests).toHaveLength(2);expect(result.evidence!.attempts).toBe(2);expect(f.requests.every(r=>r.max_tokens===4096)).toBe(true);
 expect(requests.map(r=>r.status)).toEqual(['failed','completed']);expect(requests[0].supersededByRequestId).toBe(requests[1].requestId);expect(guidancePacketIssue(c)).toBeUndefined();
 for(const mutate of [(p:any)=>p[0].supersededByRequestId=p[0].requestId,(p:any)=>p[0].supersededByRequestId='missing',(p:any)=>p[0].status='cancelled',(p:any)=>p[1].model='other',(p:any)=>p[0].outputProtocol='stream-text',(p:any)=>p[1].supersededByRequestId=p[0].requestId]){
  const bad=structuredClone(c);mutate(bad.designGuidance!.requests);expect(guidancePacketIssue(bad,false)).toBeDefined();
 }
 const receipt=buildModificationReviewReceipt(result,['suggestion-1'],'',{id:'page',htmlContent:html});receipt.analysis.workflowContract!.allowedChanges=['screen:other'];expect(isModificationReviewReceipt(receipt)).toBe(false);
});
test('network failure and cancellation never trigger a format retry or usable completion evidence',async()=>{
 const f=fixture('mobile',[]);f.transport.enqueueScenario({events:[{type:'Error',kind:'network_error',message:'fixture network failed'}]});
 await expect(analyzeScreenModification(f.core,{...f.options,contextualGuidance:{}})).rejects.toThrow('fixture network failed');expect(f.requests).toHaveLength(1);
 expect(f.snapshots.at(-1)!.designGuidance!.requests[0]).toMatchObject({status:'failed'});expect(f.snapshots.at(-1)!.designGuidance!.requests[0].supersededByRequestId).toBeUndefined();expect(guidancePacketIssue(f.snapshots.at(-1)!)).toBeDefined();
 const controller=new AbortController();controller.abort();const before=fixture();await expect(analyzeScreenModification(before.core,{...before.options,contextualGuidance:{},signal:controller.signal})).rejects.toThrow('取消');expect(before.requests).toHaveLength(0);
});
test('default analysis has no fabricated guidance source and rejected frozen protocol dispatches nothing',async()=>{
 const plain=fixture(),result=await analyzeScreenModification(plain.core,plain.options);expect(result.workflowContract).toBeUndefined();expect(plain.snapshots).toEqual([]);
 const f=fixture(),guided=await analyzeScreenModification(f.core,{...f.options,contextualGuidance:{}});const c=structuredClone(guided.workflowContract!);c.designGuidance!.protocol='html';
 await expect(analyzeScreenModification(f.core,{...f.options,workflowContract:c,contextualGuidance:{}})).rejects.toThrow();expect(f.requests).toHaveLength(1);
});
