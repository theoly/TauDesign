import {expect,test} from 'bun:test';
import {PipelineExecutor} from '../src/services/ai/engine/pipeline/executor';
import {DefaultAIEngineCore} from '../src/services/ai/engine/core/aiEngineCore';
import {MockTransport} from '../src/services/ai/engine/transport/mockTransport';
import {techBlueTheme} from '../src/utils/themePresets';
import {makeGuidancePacket,withGuidanceReceipts,guidancePacketIssue} from '../src/services/ai/designKnowledge/receipt';
import {buildDesignTaskContract} from '../src/services/ai/designWorkflow';
import {selectDesignRules,ruleFingerprint} from '../src/services/ai/designKnowledge/selector';
import {resolveWorkflowValidation} from '../src/services/ai/workflowValidation';
import type {AIEngineCore,EngineMessage,StreamTextResult} from '../src/services/ai/engine/core/types';
import type {AIProviderConfig} from '../src/types/provider';
import {saveStagedCandidate,loadStagedCandidate,removeStagedCandidate} from '../src/services/storage/candidateRepository';
import {analyzeHtmlImport,convertHtmlImport} from '../src/services/import/htmlImport';
import {streamWithContinuation} from '../src/services/ai/boundedContinuation';
import {TaskBudget} from '../src/services/ai/taskBudget';
import {useAIConfigStore} from '../src/stores/useAIConfigStore';

const provider={id:'pilot-provider',protocol:'openai_compatible',baseUrl:'http://mock',apiKey:'never-persist-this-secret',models:[]} as unknown as AIProviderConfig;
const html='<artifact type="screen" title="说明"><main class="p-4"><h1 class="text-xl">说明</h1><p>这是完整的内容说明。</p></main></artifact>';
async function run(request:string,decision?:any,features?:any){
  const transport=new MockTransport();transport.queueResponse(html);
  const core=new DefaultAIEngineCore(transport);let messages:EngineMessage[]=[];
  const spy:AIEngineCore={generateObject:core.generateObject.bind(core),streamText:o=>{messages=structuredClone(o.messages);return core.streamText(o);}};
  const output=await PipelineExecutor.execute({input:{rawPrompt:request,activeScreenId:null,decision},provider,model:'mock',engineCore:spy,
    screens:{old:{id:'old',name:'入口',htmlContent:'<main data-nid="root0001"><a data-nid="badge001" class="badge">3</a></main>'}},
    designSystem:techBlueTheme,deviceProfile:'mobile',frameWidth:390,baseSystemPrompt:'baseline',contextualGuidance:{features}});
  return {output,messages};
}
test('create pilot records the actual core-boundary messages and no credentials',async()=>{
  const {output,messages}=await run('新建长正文说明页面');
  expect(output.status).not.toBe('error');
  const contract=output.workflowContract!,packet=contract.designGuidance!;
  expect(packet.selection.selected[0].rule.id).toBe('LY-04');
  expect(messages.find(m=>m.role==='system')?.content).toContain('[LY-04@1]');
  expect(packet.requests).toHaveLength(1);expect(packet.requests[0].status).toBe('completed');
  expect(packet.requests[0].injectedRuleIds).toEqual(packet.selection.selected.map(s=>s.rule.id));
  expect(guidancePacketIssue(contract)).toBeUndefined();
  expect(JSON.stringify(packet)).not.toContain(provider.apiKey);
});
test('explicit element pilot remains local and never loads unrelated pricing rules',async()=>{
  const {output}=await run('放大铃铛，缩小角标',{intent:'modify_screen',targetScreenId:'old',elementNid:'badge001',reason:'明确目标'},['badge']);
  const contract=output.workflowContract!;
  expect(contract.workflowId).toBe('edit-element-copy');expect(contract.allowedChanges).toEqual(['element:badge001']);
  expect(contract.designGuidance?.selection.selected.map(s=>s.rule.id)).toEqual(['CP-02']);
  expect(contract.designGuidance?.requests[0].status).toBe('completed');
});
test('question pilot does not inject or manufacture a design-rule receipt',async()=>{
  const {output,messages}=await run('请解释这段文字',{intent:'question',targetScreenId:null,reason:'问答'});
  expect(output.status).toBe('answered_question');expect(output.workflowContract?.designGuidance).toBeUndefined();
  expect(messages.some(m=>m.content.includes('[LY-04@1]'))).toBe(false);
});
function fixture(){
  const contract=buildDesignTaskContract({intent:'create_screen',request:'长正文',deviceProfile:'mobile',frameWidth:390});
  contract.designGuidance=makeGuidancePacket(contract,selectDesignRules({request:'长正文',operation:'create',device:'mobile',scope:'page',maxChars:800}));
  return contract;
}
test('assembled selection cannot satisfy delivery validation and legacy contracts remain compatible',()=>{
  const contract=fixture();expect(resolveWorkflowValidation(contract,'create',{preflight:true}).ok).toBe(true);
  expect(resolveWorkflowValidation(contract,'create').ok).toBe(false);
  delete contract.designGuidance;expect(resolveWorkflowValidation(contract,'create').ok).toBe(true);
});
test('pre-task-planning guidance bindings keep their original identity when the optional plan is absent',()=>{
  const c=fixture();
  c.designGuidance!.bindingFingerprint=ruleFingerprint([c.taskId,c.request,c.workflowId,c.operation,c.strategy,c.target,
    c.elementNid,c.device,c.designSystem,c.designSystemOrigin,c.librarySource,c.allowedChanges,c.protectedNids,c.knowledgeSources,
    c.knowledgeFingerprint,c.generationMode,c.multiPage,c.referenceImage?[c.referenceImage.name,c.referenceImage.fingerprint,c.referenceImage.region]:undefined]);
  expect(guidancePacketIssue(c,false)).toBeUndefined();
});
test('restored rule metadata cannot bypass operation or immutable device applicability',()=>{
  for(const change of ['device','operation'] as const){
    const contract=fixture(),selected=contract.designGuidance!.selection.selected[0];
    if(change==='device')selected.rule.scope.devices=['pc'];else selected.rule.scope.operations=['restyle'];
    selected.fingerprint=ruleFingerprint(selected.rule);
    expect(guidancePacketIssue(contract,false)).toContain('不适用');
  }
  const malformed=fixture();(malformed.designGuidance!.selection.selected as unknown[])[0]=null;
  expect(guidancePacketIssue(malformed,false)).toBeDefined();
});
test('cancelled request cannot become completed from a late successful response',async()=>{
  const contract=fixture(),packet=contract.designGuidance!;let complete!:(s:string)=>void;
  const text=new Promise<string>(resolve=>{complete=resolve;});
  async function* empty(){}
  const core={generateObject:async()=>({}),streamText:()=>({textPromise:text,textStream:empty(),reasoningStream:empty(),reasoningPromise:Promise.resolve(undefined),usagePromise:Promise.resolve(undefined),abort:()=>{}} as StreamTextResult)} as AIEngineCore;
  const controller=new AbortController();
  const response=withGuidanceReceipts(core,contract,packet).streamText({provider,model:'mock',messages:[{role:'system',content:packet.selection.body}],signal:controller.signal});
  expect(packet.requests[0].status).toBe('dispatched');controller.abort();expect(packet.requests[0].status).toBe('cancelled');
  complete('late');await response.textPromise;expect(packet.requests[0].status).toBe('cancelled');
  expect(guidancePacketIssue(contract)).toBeDefined();
});
test('thrown transport and missing injected rules cannot satisfy provenance',async()=>{
  const contract=fixture(),packet=contract.designGuidance!;
  const core={generateObject:async()=>({}),streamText:()=>{throw Error('unavailable');}} as AIEngineCore;
  expect(()=>withGuidanceReceipts(core,contract,packet).streamText({provider,model:'mock',messages:[]})).toThrow('unavailable');
  expect(packet.requests[0].status).toBe('failed');
  packet.requests[0].status='completed';expect(guidancePacketIssue(contract)).toBeDefined();
});
test('roundtrip preserves frozen evidence; changed scope or rule content is rejected',async()=>{
  const {output}=await run('新建长正文');const contract=JSON.parse(JSON.stringify(output.workflowContract));
  expect(guidancePacketIssue(contract)).toBeUndefined();
  const original=contract.designGuidance.bindingFingerprint;
  contract.allowedChanges=['screen:someone-else'];expect(guidancePacketIssue(contract)).toBeDefined();
  contract.allowedChanges=['new-screen'];expect(contract.designGuidance.bindingFingerprint).toBe(original);
  expect(guidancePacketIssue(contract)).toBeUndefined();
  contract.designGuidance.selection.selected[0].rule.guidance='modified';expect(guidancePacketIssue(contract)).toBeDefined();
});
test('request receipt reflects each actual dispatch; image data is represented only by a fingerprint',async()=>{
  const contract=fixture(),packet=contract.designGuidance!;
  const transport=new MockTransport();transport.queueResponse('first');transport.queueResponse('second');
  const core=withGuidanceReceipts(new DefaultAIEngineCore(transport),contract,packet);
  for(let n=0;n<2;n++)await core.streamText({provider,model:'mock',messages:[{role:'system',content:packet.selection.body},{role:'user',content:'reference',imageUrl:'data:image/png;base64,private-image'}]}).textPromise;
  expect(packet.requests).toHaveLength(2);expect(packet.requests[0].requestId).not.toBe(packet.requests[1].requestId);
  expect(JSON.stringify(packet)).not.toContain('private-image');
  expect(guidancePacketIssue(contract)).toBeUndefined();
  expect(ruleFingerprint(packet.selection.selected[0].rule)).toBe(packet.selection.selected[0].fingerprint);
});
test('preserve import retains gradient and source CSS without rule provenance fabrication',()=>{
  const config=useAIConfigStore.getState();useAIConfigStore.setState({autoReferenceDesignRules:true});try{
  const source='<html><head><style>.source-card{background:linear-gradient(90deg,#fff,#ffeedd);border-radius:12px}</style></head><body><article class="source-card">原始内容</article></body></html>';
  const result=convertHtmlImport(analyzeHtmlImport(source,'gradient.html'),{mode:'preserve',designSystem:techBlueTheme,colorMode:'light'});
  expect(result.htmlContent).toContain('linear-gradient(90deg,#fff,#ffeedd)');expect(result.htmlContent).toContain('source-card');
  expect(result.workflowContract?.workflowId).toBe('import-html-preserve');expect(result.workflowContract?.designGuidance).toBeUndefined();
  }finally{useAIConfigStore.setState(config,true);}
});
test('candidate repository roundtrip preserves rule snapshot and never upgrades historical evidence',async()=>{
  const {output}=await run('创建长正文说明');const id=`guidance-repository-${crypto.randomUUID()}`;
  try {
    await saveStagedCandidate(id,undefined,{targetScreenId:'target',screenName:'候选',newHtml:'<main>正文</main>',baselineFingerprint:'baseline',projectFingerprint:'project',designOriginFingerprint:'origin',workflowContract:output.workflowContract});
    const restored=await loadStagedCandidate(id);
    expect(restored?.workflowContract?.designGuidance).toEqual(output.workflowContract?.designGuidance);
    expect(guidancePacketIssue(restored!.workflowContract!)).toBeUndefined();
    expect(restored?.validationEvidence).toBeUndefined();
  } finally {await removeStagedCandidate(id);}
});
test('real bounded continuation records each child request using the frozen rule snapshot',async()=>{
  const contract=fixture(),packet=contract.designGuidance!;let calls=0;
  const core:AIEngineCore={async generateObject(){throw Error('unused');},streamText(o){
    calls++;const marker=o.messages.at(-1)?.content.match(/TAUDESIGN_CONTINUE_[\w-]+/)?.[0];
    const text=calls===1?'<artifact><main><p>完整正文':`${marker}\n</p></main></artifact>`;
    return {textStream:(async function*(){yield text;})(),reasoningStream:(async function*(){})(),textPromise:Promise.resolve(text),
      reasoningPromise:Promise.resolve(undefined),usagePromise:Promise.resolve({inputTokens:1,outputTokens:1}),finishReasonPromise:Promise.resolve(calls===1?'length':'stop'),abort(){}};
  }};
  const result=await streamWithContinuation(withGuidanceReceipts(core,contract,packet),{provider,model:'mock',messages:[{role:'system',content:packet.selection.body},{role:'user',content:'生成长正文'}]});
  expect(result.errorMessage).toBeUndefined();expect(result.continuationCount).toBe(1);
  expect(packet.requests).toHaveLength(2);expect(guidancePacketIssue(contract)).toBeUndefined();
});

for(const kind of ['exhausted','cancelled','closed'] as const)test(`Pipeline ${kind} budget does not manufacture a request receipt`,async()=>{
 const budget=new TaskBudget({maxRequests:1,maxRequestedOutputTokens:8192,maxDurationMs:10000,maxRequestDurationMs:10000});
 if(kind==='exhausted')budget.reserve(8192).settle();else if(kind==='cancelled')budget.cancel();else budget.close();
 const transport=new MockTransport();let calls=0;
 const core=new DefaultAIEngineCore({id:'capture',stream(request,event){calls++;return transport.stream(request,event);}});
 const output=await PipelineExecutor.execute({input:{rawPrompt:'新建长正文说明',activeScreenId:null},provider,model:'mock',engineCore:core,screens:{},
  designSystem:techBlueTheme,deviceProfile:'mobile',frameWidth:390,baseSystemPrompt:'baseline',contextualGuidance:{},taskBudget:budget});
 expect(output.status).toBe('error');expect(calls).toBe(0);expect(output.workflowContract?.designGuidance?.requests).toEqual([]);
});
