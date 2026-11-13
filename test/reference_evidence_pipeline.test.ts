import {test,expect} from 'bun:test';
import {DefaultAIEngineCore} from '../src/services/ai/engine/core/aiEngineCore';
import {prepareModelRequest} from '../src/services/ai/engine/core/protocolAdapter';
import {artifactThinkingOptions} from '../src/services/ai/structuredRequestPolicy';
import {endpointIdentity,requestOutputCap} from '../src/services/ai/modelCapabilities';
import {prepareReferenceEvidence,validReferenceEvidence,renderReferenceEvidence,withReferenceEvidence,type ReferenceObservation} from '../src/services/ai/referenceEvidence';
import {LocalStorageStorage} from '../src/services/storage/projectStorage';
import {TaskBudget,withTaskBudget} from '../src/services/ai/taskBudget';
import {streamWithContinuation} from '../src/services/ai/boundedContinuation';
import {finalizeModelHtml} from '../src/services/ai/modelHtmlResult';
import {referenceBytes,referenceDimensions,sha256} from '../src/utils/referenceImagePreparation';
import {buildDesignTaskContract,contentFingerprint} from '../src/services/ai/designWorkflow';
import {recordReferenceInput,inspectReferenceInput} from '../src/services/ai/workflowSources';
import {PipelineExecutor} from '../src/services/ai/engine/pipeline/executor';
import {chatPageTaskPlan} from './fixtures/pageTaskPlan';
import {PromptBuilder} from '../src/services/ai/promptBuilder';
import {neutralModernTheme} from '../src/utils/themePresets';
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const image={name:'form.png',dataUrl:png};
const provider={id:'prov-custom-test',name:'synthetic',protocol:'openai_compatible' as const,baseUrl:'https://gateway.example/v1',apiKey:'synthetic',isEnabled:true};
const vision={...provider,id:'vision',modelCapabilities:{'vision-test':{version:1 as const,revision:'v1',endpointIdentity:endpointIdentity(provider),source:'user' as const,mediaInput:'native-part' as const}}};
const observation:ReferenceObservation={summary:'资料表单',texts:['基础资料','身高','保存'],groups:[{title:'基础资料',items:['身高'],position:'顶部'}],fields:[{label:'身高',type:'number',required:true,group:'基础资料',value:''}],visual:['单列输入'],uncertainties:[]};
const budget=(requests=5)=>new TaskBudget({maxRequests:requests,maxRequestedOutputTokens:34568,maxDurationMs:900000,maxRequestDurationMs:900000});
test('actual generation prompt has one media policy even without registered icons',()=>{
 const prompt=PromptBuilder.buildSystemPrompt({designSystem:neutralModernTheme,deviceProfile:'mobile',frameWidth:390,intent:'create_screen',hasAttachment:true,mediaAssets:[]});
 expect(prompt).not.toContain('风格内联SVG');expect(prompt).not.toContain('无图标页面不合格');expect(prompt).not.toContain('<svg');expect(prompt).toContain('没有已登记资源时保留完整文字控件');
});
const prepare=async()=>{const h=await sha256(referenceBytes(png).bytes);return {version:1 as const,sourceSha256:h,width:1,height:1,parts:[{dataUrl:png,sha256:h,mime:'image/png',width:1,height:1,rect:{x:0,y:0,width:1,height:1}}]};};
function transport(outputs:Array<{text:string;reason?:string;reasoning?:string}>){const sent:any[]=[];const core=new DefaultAIEngineCore({id:'wire-replay',stream(request,event){sent.push(request);const o=outputs.shift();if(!o)throw Error('unexpected dispatch');event({type:'RequestStarted',requestId:String(sent.length),attemptId:String(sent.length),eventProtocol:'typed',at:Date.now()});if(o.reasoning)event({type:'ReasoningDelta',text:o.reasoning});event({type:'Delta',text:o.text});event({type:'Usage',input_tokens:10,output_tokens:20});event({type:'Done',finish_reason:o.reason??'stop'});return {abort(){},promise:Promise.resolve()};}});return {core,sent};}

test('custom IDs never grant thinking protocol; explicit endpoint-bound policy controls both JSON and HTML',()=>{
 const unknown=prepareModelRequest({provider,model:'deepseek-flash',messages:[{role:'user',content:'code'}],enableThinking:false,jsonSchema:{type:'object'}}).transportRequest.body as any;
 expect(unknown.thinking).toBeUndefined();expect(unknown.enable_thinking).toBeUndefined();expect(artifactThinkingOptions(provider,'deepseek-flash')).toEqual({});
 const configured={...provider,modelCapabilities:{'deepseek-flash':{version:1 as const,revision:'test',endpointIdentity:endpointIdentity(provider),source:'user' as const,thinkingControl:'deepseek' as const}}};
 for(const jsonSchema of [undefined,{type:'object'}]){const body=prepareModelRequest({provider:configured,model:'deepseek-flash',messages:[{role:'user',content:'code'}],...artifactThinkingOptions(configured,'deepseek-flash'),jsonSchema}).transportRequest.body as any;expect(body.thinking).toEqual({type:'disabled'});expect(body.enable_thinking).toBeUndefined();}
 expect(()=>artifactThinkingOptions({...configured,baseUrl:'https://other.example/v1'},'deepseek-flash')).toThrow('过期');
});

test('reference bytes use SHA-256; header guard rejects pixel bombs before browser decode',async()=>{
 expect(referenceDimensions(referenceBytes(png).bytes)).toEqual({width:1,height:1});expect(await sha256(referenceBytes(png).bytes)).toHaveLength(64);
 const bomb=new Uint8Array(referenceBytes(png).bytes);new DataView(bomb.buffer).setUint32(16,30000);new DataView(bomb.buffer).setUint32(20,30000);expect(()=>referenceDimensions(bomb)).toThrow('像素');
});

test('actual Vision wire -> standalone files -> cached observations -> code wire without image parts or base64',async()=>{
 const {core,sent}=transport([{text:JSON.stringify(observation)},{text:'<artifact><main>保存</main></artifact>'}]);
 const storage=new LocalStorageStorage('ref-test-'+crypto.randomUUID()),b=budget();const processing={binding:{provider:vision,model:'vision-test'},storage};
 const evidence=await prepareReferenceEvidence(core,{attachment:image,processing,budget:b,taskId:'test',prepareImage:prepare});
 expect(validReferenceEvidence(evidence)).toBe(true);expect(sent).toHaveLength(1);expect(JSON.stringify(sent[0].body)).toContain('image_url');expect(evidence.sourcePath).toMatch(/assets\/images\/[a-f0-9]{64}\.png/);expect(JSON.stringify(evidence)).not.toContain('base64');
 const cached=await prepareReferenceEvidence(core,{attachment:image,processing,budget:b,taskId:'test2',prepareImage:async()=>{throw Error('cache should skip processing');}});expect(cached).toEqual(evidence);expect(sent).toHaveLength(1);
 const code=withReferenceEvidence(withTaskBudget(core,b),cached);const result=await streamWithContinuation(code,{provider,model:'code',messages:[{role:'user',content:'本页添加表单',imageUrl:png}]});expect(result.finishReason).toBe('stop');expect(sent).toHaveLength(2);
 const body=JSON.stringify(sent[1].body);expect(body).toContain('身高');expect(body).not.toContain('base64');expect(body).not.toContain('image_url');expect(b.snapshot().requests).toBe(2);
 const contract=buildDesignTaskContract({intent:'create_screen',request:'本页添加表单',deviceProfile:'mobile',frameWidth:390,referenceImage:evidence.image});contract.referenceImage!.evidence=evidence;
 const messages=[{role:'user' as const,content:'本页添加表单'+renderReferenceEvidence(evidence)}];expect(recordReferenceInput(contract,messages,provider.id,'code')).toBeUndefined();expect(inspectReferenceInput(contract).status).toBe('passed');messages[0].content='本页添加表单';expect(recordReferenceInput(contract,messages,provider.id,'code')).toContain('匹配');
 const altered=structuredClone(evidence);altered.observation.texts.push('未经证实');expect(validReferenceEvidence(altered)).toBe(false);
 const oldTransform={...evidence,transformVersion:99};const {fingerprint:_,...oldBody}=oldTransform;oldTransform.fingerprint=contentFingerprint(JSON.stringify(oldBody));expect(validReferenceEvidence(oldTransform)).toBe(false);expect(()=>withReferenceEvidence(core,oldTransform as any)).toThrow('无效');b.close();
});

test('a corrupt content-addressed source or cancelled parse never dispatches a model',async()=>{
 const {core,sent}=transport([]),storage=new LocalStorageStorage('ref-corrupt-'+crypto.randomUUID()),hash=await sha256(referenceBytes(png).bytes);
 await storage.writeBinary(`assets/images/${hash}.png`,'YWJj');await expect(prepareReferenceEvidence(core,{attachment:image,processing:{binding:{provider:vision,model:'vision-test'},storage},budget:budget(),taskId:'bad',prepareImage:prepare})).rejects.toThrow('内容校验');expect(sent).toHaveLength(0);
 const controller=new AbortController();controller.abort();await expect(prepareReferenceEvidence(core,{attachment:image,processing:{binding:{provider:vision,model:'vision-test'},storage},budget:budget(),taskId:'cancel',signal:controller.signal,prepareImage:prepare})).rejects.toThrow('取消');expect(sent).toHaveLength(0);
});

test('pure reasoning length is not HTML continuation; one different compact recovery shares effective parent caps',async()=>{
 const {core,sent}=transport([{text:'',reasoning:'thinking',reason:'length'},{text:'<artifact><main>保存</main></artifact>'}]);const b=budget(2);
 const configured={...provider,modelCapabilities:{code:{version:1 as const,revision:'v1',endpointIdentity:endpointIdentity(provider),source:'user' as const,maxOutputTokens:4096,thinkingControl:'deepseek' as const}}};
 const result=await streamWithContinuation(withTaskBudget(core,b),{provider:configured,model:'code',messages:[{role:'user',content:'完整表单'}],maxTokens:16384,...artifactThinkingOptions(configured,'code')});
 expect(result.emptyOutputRecoveryCount).toBe(1);expect(result.continuationCount).toBe(0);expect(result.usage?.outputTokens).toBe(40);expect(sent).toHaveLength(2);expect((sent[1].body as any).messages.at(-1).content).toContain('一次受控');expect(b.snapshot().requestedOutputTokens).toBe(8192);expect(requestOutputCap(configured,'code',16384)).toBe(4096);b.close();
});

test('unknown thinking protocol stops even when a caller requests disabled thinking; repeated configured empty output stops after one recovery',async()=>{
 const configured={...provider,modelCapabilities:{code:{version:1 as const,revision:'v1',endpointIdentity:endpointIdentity(provider),source:'user' as const,thinkingControl:'deepseek' as const}}};
 for(const [binding,enableThinking,attempts] of [[provider,undefined,1],[provider,false,1],[configured,false,2]] as const){const {core,sent}=transport([{text:'',reasoning:'推理',reason:'length'},{text:'',reasoning:'仍推理',reason:'length'}]);const result=await streamWithContinuation(core,{provider:binding,model:'code',messages:[{role:'user',content:'表单'}],enableThinking});expect(sent).toHaveLength(attempts);const finalized=finalizeModelHtml(result);expect(finalized.status).toBe('no_html');expect(finalized.message).toContain('正文为0');expect(result.checkpoint).toBeUndefined();}
});

test('inactivity timeout settles an uncooperative native-like transport and retains observed cost',async()=>{
 let aborts=0;const core=new DefaultAIEngineCore({id:'stalled',stream(_request,event){event({type:'Usage',input_tokens:10,output_tokens:5});return {abort(){aborts++;},promise:new Promise<void>(()=>{})};}});
 const result=core.streamText({provider,model:'test',messages:[{role:'user',content:'test'}],idleTimeoutMs:15});await expect(result.textPromise).rejects.toThrow('[timeout]');expect(aborts).toBe(1);expect(await result.usagePromise).toEqual({inputTokens:10,outputTokens:5});expect((await result.transportEvidencePromise)?.errorKind).toBe('timeout');
});

import {functionalRegionTarget} from '../src/services/ai/functionalRegionTarget';
test('page function changes prefer a unique form subtree but never guess between forms or touch protected fields',()=>{
 const html='<main data-nid="root"><h1>资料</h1><form data-nid="form"><fieldset data-nid="group"><input data-nid="field"/></fieldset></form><footer>保留</footer></main>';
 expect(functionalRegionTarget(html)).toBe('form');expect(functionalRegionTarget(html,['field'])).toBeUndefined();expect(functionalRegionTarget(html+'<form data-nid="second"></form>')).toBeUndefined();expect(functionalRegionTarget('<main data-nid="root">没有可定位表单</main>')).toBeUndefined();
});

test('a stalled pre-model image storage operation is bounded by the same parent deadline',async()=>{
 const {core,sent}=transport([]),storage=new LocalStorageStorage('ref-deadline-'+crypto.randomUUID());
 storage.readBinary=()=>new Promise(()=>{});const b=new TaskBudget({maxRequests:2,maxRequestedOutputTokens:8192,maxDurationMs:20,maxRequestDurationMs:20});
 await expect(prepareReferenceEvidence(core,{attachment:image,processing:{binding:{provider:vision,model:'vision-test'},storage},budget:b,taskId:'hung',prepareImage:prepare})).rejects.toThrow('时限');expect(sent).toHaveLength(0);expect(b.signal.aborted).toBe(true);
});

test('documented Tencent TokenHub routes disable thinking for the current DeepSeek alias without changing user settings',()=>{
 for(const baseUrl of ['https://tokenhub.tencentmaas.com/plan/v3','https://tokenhub.tencentmaas.com/plan/v3/chat/completions','https://tokenhub-intl.tencentmaas.com/v1']){
  const p={...provider,baseUrl};const options=artifactThinkingOptions(p,'deepseek/deepseek-flash');expect(options).toEqual({enableThinking:false});
  const body=prepareModelRequest({provider:p,model:'deepseek/deepseek-flash',messages:[{role:'user',content:'page'}],...options}).transportRequest.body as any;expect(body.thinking).toEqual({type:'disabled'});expect(body.enable_thinking).toBeUndefined();
 }
 for(const baseUrl of ['http://tokenhub.tencentmaas.com/plan/v3','https://tokenhub.tencentmaas.com.evil.example/plan/v3','https://tokenhub.tencentmaas.com/other','https://tokenhub.tencentmaas.com/plan/v3?token=x'])expect(artifactThinkingOptions({...provider,baseUrl},'deepseek/deepseek-flash')).toEqual({});
 expect(artifactThinkingOptions({...provider,baseUrl:'https://tokenhub.tencentmaas.com/plan/v3'},'glm-5.3')).toEqual({});
});
