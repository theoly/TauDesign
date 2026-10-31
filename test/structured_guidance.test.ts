import {expect,test} from 'bun:test';
import {DefaultAIEngineCore} from '../src/services/ai/engine/core/aiEngineCore';
import {MockTransport} from '../src/services/ai/engine/transport/mockTransport';
import type {AIEngineCore} from '../src/services/ai/engine/core/types';
import {buildDesignTaskContract} from '../src/services/ai/designWorkflow';
import {makeGuidancePacket,withGuidanceReceipts,guidancePacketIssue} from '../src/services/ai/designKnowledge/receipt';
import {selectDesignRules} from '../src/services/ai/designKnowledge/selector';
import {executeStructuredEdit,type StructuredEditOptions} from '../src/services/ai/structuredEditExecutor';
import {neutralModernTheme} from '../src/utils/themePresets';
import {defaultProviders} from '../src/stores/useAIConfigStore';

const provider={...defaultProviders[0],id:'json-pilot',protocol:'openai_compatible' as const,baseUrl:'http://mock',apiKey:'json-private-key'};
const source='<main data-nid="root0001"><button data-nid="notify01" class="btn btn-ghost notification-control" aria-label="通知，3条未读"><svg data-nid="icon0001" class="icon" viewBox="0 0 24 24" aria-hidden="true"><path data-nid="path0001" d="M4 4h16v16H4z"/></svg><span data-nid="count001" class="badge-count" aria-hidden="true">3</span></button><p data-nid="keep0001">保留全部业务信息</p></main>';
const request='放大铃铛，缩小角标';
function options():StructuredEditOptions & {contextualGuidance?:{features?:Array<'badge'>}} {
  return {mode:'element',screen:{id:'a',name:'工作台',htmlContent:source},request,
    contract:buildDesignTaskContract({intent:'modify_screen',request,target:{id:'a',name:'工作台',htmlContent:source},elementNid:'notify01',deviceProfile:'mobile',frameWidth:390}),
    elementNid:'notify01',settings:{deviceProfile:'mobile',frameWidth:390,useCustomNavigation:false},
    designSystem:neutralModernTheme,colorMode:'light',binding:{provider,model:'mock'},isCurrent:()=>true};
}
const operations={requiresPageRewrite:false,reason:'仅调整授权元素尺寸',operations:[{nid:'icon0001',type:'set_styles',value:'width:28px;height:28px'}]};
function packetFixture(){
  const contract=options().contract;
  contract.designGuidance=makeGuidancePacket(contract,selectDesignRules({request,operation:'modify',device:'mobile',scope:'element',features:['badge'],maxChars:800}));
  return contract;
}
test('JSON core requests preserve the existing schema parser and record each real application call',async()=>{
  const contract=packetFixture(),packet=contract.designGuidance!,transport=new MockTransport();
  transport.queueResponse('{"value":1}');transport.queueResponse('{"value":2}');
  const core=withGuidanceReceipts(new DefaultAIEngineCore(transport),contract,packet);
  const messages=[{role:'system' as const,content:packet.selection.body},{role:'user' as const,content:'private document',imageUrl:'data:image/png;base64,private-image'}];
  expect(await core.generateObject({type:'object'},{provider,model:'mock',messages,maxTokens:2048})).toEqual({value:1});
  expect(await core.generateObject({type:'object',required:['value']},{provider,model:'mock',messages,maxTokens:2048})).toEqual({value:2});
  expect(packet.requests).toHaveLength(2);
  expect(packet.requests.every(r=>r.status==='completed'&&r.injectedRuleIds.includes('CP-02'))).toBe(true);
  expect(packet.requests[0].messageFingerprint).not.toBe(packet.requests[1].messageFingerprint);
  expect(packet.requests[0].requestId).not.toBe(packet.requests[1].requestId);
  expect(guidancePacketIssue(contract)).toBeUndefined();
  for(const secret of ['json-private-key','private document','private-image'])expect(JSON.stringify(packet)).not.toContain(secret);
});
test('JSON parse errors are failed receipts, and pre-aborted calls never mint a dispatch',async()=>{
  const contract=packetFixture(),packet=contract.designGuidance!,transport=new MockTransport();transport.queueResponse('not JSON');
  const core=withGuidanceReceipts(new DefaultAIEngineCore(transport),contract,packet);
  await expect(core.generateObject({}, {provider,model:'mock',messages:[]})).rejects.toThrow();
  expect(packet.requests[0]?.status).toBe('failed');
  const abort=new AbortController();abort.abort();
  await expect(core.generateObject({}, {provider,model:'mock',messages:[],signal:abort.signal})).rejects.toThrow();
  expect(packet.requests).toHaveLength(1);expect(guidancePacketIssue(contract)).toBeDefined();
});
test('cancelled JSON call cannot be promoted by a non-cooperating late result',async()=>{
  const contract=packetFixture(),packet=contract.designGuidance!,abort=new AbortController();let resolve!:(v:any)=>void;
  const raw:AIEngineCore={streamText(){throw Error('unused');},generateObject:()=>new Promise<any>(done=>{resolve=done;})};
  const pending=withGuidanceReceipts(raw,contract,packet).generateObject({}, {provider,model:'mock',messages:[],signal:abort.signal});
  expect(packet.requests[0]?.status).toBe('dispatched');abort.abort();resolve({late:true});
  await expect(pending).rejects.toThrow();expect(packet.requests[0]?.status).toBe('cancelled');
});
test('explicit element pilot sends scoped JSON once, replaces the reference window and preserves original content',async()=>{
  async function run(enabled:boolean){const input=options(),transport=new MockTransport();transport.queueResponse(JSON.stringify(operations));
    if(enabled)input.contextualGuidance={features:['badge']};
    const result=await executeStructuredEdit(new DefaultAIEngineCore(transport),input);
    return {result,input,body:transport.lastRequest!.body as any};}
  const baseline=await run(false),pilot=await run(true);
  expect(pilot.result.status).toBe('ready');expect(pilot.input.screen.htmlContent).toBe(source);
  const contract=pilot.result.contract,packet=contract.designGuidance;
  expect(packet?.selection.selected.map(s=>s.rule.id)).toEqual(['CP-02']);
  expect(packet?.requests).toHaveLength(1);expect(guidancePacketIssue(contract)).toBeUndefined();
  expect(contract.allowedChanges).toEqual(['element:notify01']);expect(pilot.input.contract.designGuidance).toBeUndefined();
  const system=pilot.body.messages[0].content;
  expect(system).toContain('[CP-02@1]');expect(system).toContain('不生成HTML');expect(system).toContain('protectedNids');
  expect(system).not.toContain('### COMPONENT CONTRACTS');expect(system).not.toContain('返回完整HTML');
  expect(system.length).toBeLessThanOrEqual(baseline.body.messages[0].content.length);
  expect(pilot.body.response_format).toEqual(baseline.body.response_format);expect(pilot.body.max_tokens).toBe(2048);
  expect(pilot.body.messages[1]).toEqual(baseline.body.messages[1]);
  if(pilot.result.status==='ready'){
    const doc=new DOMParser().parseFromString(pilot.result.html,'text/html');
    expect(doc.querySelector('[data-nid="icon0001"]')?.getAttribute('style')).toContain('28px');
    expect(doc.querySelector('[data-nid="count001"]')?.textContent).toBe('3');
    expect(doc.querySelector('[data-nid="keep0001"]')?.outerHTML).toBe('<p data-nid="keep0001">保留全部业务信息</p>');
  }
  expect(baseline.result.contract.designGuidance).toBeUndefined();
});
test('unknown target semantics keep original references and explicitly record fallback',async()=>{
  const input=options(),transport=new MockTransport();transport.queueResponse(JSON.stringify(operations));input.contextualGuidance={features:[]};
  const result=await executeStructuredEdit(new DefaultAIEngineCore(transport),input);
  expect(result.status).toBe('ready');expect(result.contract.designGuidance?.selection.fallback).toBe('unknown-target');
  expect(result.contract.designGuidance?.requests[0]?.injectedRuleIds).toEqual([]);
  expect((transport.lastRequest!.body as any).messages[0].content).toContain('### COMPONENT CONTRACTS');
});
test('structured execution records failed generation and never publishes a partial edit',async()=>{
  const input=options(),transport=new MockTransport();input.contextualGuidance={features:['badge']};
  transport.enqueueScenario({events:[{type:'Delta',text:JSON.stringify(operations)},{type:'Done',finish_reason:'length'}]});
  const result=await executeStructuredEdit(new DefaultAIEngineCore(transport),input);
  expect(result.status).toBe('failed');expect('html'in result).toBe(false);
  expect(result.contract.designGuidance?.requests[0]?.status).toBe('failed');expect(input.screen.htmlContent).toBe(source);
});
test('corrupt supplied rule packet is rejected before structured model execution',async()=>{
  const input=options();input.contract=packetFixture();input.contract.designGuidance!.selection.selected[0].rule.guidance='changed';
  const transport=new MockTransport(),result=await executeStructuredEdit(new DefaultAIEngineCore(transport),input);
  expect(result.status).toBe('failed');expect(transport.lastRequest).toBeUndefined();
});
test('pure local edits do not manufacture a model request or guidance package',async()=>{
  const input=options();input.mode='local';input.elementNid=undefined;input.binding=undefined;input.contextualGuidance={features:['badge']};
  input.contract=buildDesignTaskContract({intent:'modify_screen',request:'仅加粗说明',target:input.screen,deviceProfile:'mobile',frameWidth:390,allowedChanges:['element:keep0001']});
  input.local={operations:[{nid:'keep0001',type:'add_classes',value:'font-bold'}],allowedNids:['keep0001']};
  const result=await executeStructuredEdit(undefined,input);
  expect(result.status).toBe('ready');expect(result.contract.designGuidance).toBeUndefined();
});
test('pilot cannot expand authorization or change protected icon styles',async()=>{
  for(const nid of ['keep0001','icon0001']){
    const input=options(),transport=new MockTransport();input.contextualGuidance={features:['badge']};
    input.contract.protectedNids=['icon0001'];
    transport.queueResponse(JSON.stringify({...operations,operations:[{nid,type:'add_classes',value:'font-bold'}]}));
    const result=await executeStructuredEdit(new DefaultAIEngineCore(transport),input);
    expect(result.status).toBe('failed');expect('html'in result).toBe(false);
    expect(result.contract.designGuidance?.requests[0]?.status).toBe('completed');
    // A completed input call is explicitly insufficient for a valid candidate.
    expect(input.screen.htmlContent).toBe(source);
  }
});
test('stale JSON result retains its call record but never produces an applicable page',async()=>{
  const input=options();input.contextualGuidance={features:['badge']};let current=true;
  input.isCurrent=()=>current;
  const core:AIEngineCore={streamText(){throw Error('unused');},async generateObject<T>(){current=false;return operations as T;}};
  const result=await executeStructuredEdit(core,input);
  expect(result.status).toBe('stale');expect('html'in result).toBe(false);
  expect(result.contract.designGuidance?.requests[0]?.status).toBe('completed');
});
test('JSON output protocol metadata is checked, while old receipts without that field stay readable',async()=>{
  const contract=packetFixture(),packet=contract.designGuidance!,transport=new MockTransport();transport.queueResponse('{}');
  await withGuidanceReceipts(new DefaultAIEngineCore(transport),contract,packet).generateObject({}, {provider,model:'mock',messages:[{role:'system',content:packet.selection.body}]});
  expect(packet.requests[0].outputProtocol).toBe('json-object');expect(guidancePacketIssue(contract)).toBeUndefined();
  delete packet.requests[0].outputProtocol;expect(guidancePacketIssue(contract)).toBeUndefined();
  (packet.requests[0] as any).outputProtocol='untrusted-code';expect(guidancePacketIssue(contract)).toContain('无效');
});
test('a frozen element contract cannot attest a different outgoing user instruction',async()=>{
  const input=options();input.contract=packetFixture();input.request='将按钮文字改成删除';
  const transport=new MockTransport();transport.queueResponse(JSON.stringify(operations));
  const result=await executeStructuredEdit(new DefaultAIEngineCore(transport),input);
  expect(result.status).toBe('failed');expect(transport.lastRequest).toBeUndefined();
});
