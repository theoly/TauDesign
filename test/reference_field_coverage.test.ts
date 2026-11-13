import {expect,test} from 'bun:test';
import {referenceFieldCoverage,referenceFieldsForRequest,referencePlanningFields,validReferenceEvidence,withReferenceEvidence,type ReferenceEvidence} from '../src/services/ai/referenceEvidence';
import {buildDesignTaskContract,contentFingerprint} from '../src/services/ai/designWorkflow';
import {preparePageTaskPlan,type PageTaskPlan} from '../src/services/ai/pageTaskPlan';
import {DefaultAIEngineCore} from '../src/services/ai/engine/core/aiEngineCore';
import {MockTransport} from '../src/services/ai/engine/transport/mockTransport';
import {streamWithContinuation} from '../src/services/ai/boundedContinuation';
import {extractArtifact} from '../src/services/ai/engine/pipeline/interceptors/streamTransform';
import {checkGenerationQuality} from '../src/services/ai/generationQuality';
import {neutralModernTheme} from '../src/utils/themePresets';
import {TaskBudget,withTaskBudget} from '../src/services/ai/taskBudget';
import {PipelineExecutor} from '../src/services/ai/engine/pipeline/executor';
import {endpointIdentity} from '../src/services/ai/modelCapabilities';
import {referenceImageIdentity} from '../src/services/ai/workflowSources';
import {LocalStorageStorage} from '../src/services/storage/projectStorage';
import {installReferenceImageDecoder} from './helpers/referenceImageDecoder';
const provider={id:'field-coverage-replay',name:'Synthetic',protocol:'openai_compatible' as const,baseUrl:'https://api.openai.com/v1',apiKey:'SYNTHETIC_FIELD_TEST',isEnabled:true};
const fields=['昵称','姓名','性别','生日','民族','身高','居住地','家乡','有无婚史','接受对象婚育情况','未来生育想法'];
function evidence(labels=['居住地']):ReferenceEvidence{
 const hash='a'.repeat(64),body={version:1 as const,transformVersion:1 as const,image:{name:'synthetic-form.png',fingerprint:'12345678'},sourceSha256:hash,sourcePath:`assets/images/${hash}.png`,width:390,height:844,
  parts:[{sha256:hash,relPath:`assets/images/${hash}.png`,width:390,height:844,rect:{x:0,y:0,width:390,height:844}}],
  parser:{version:1 as const,providerId:'synthetic-vision',model:'observer',configurationFingerprint:'b'.repeat(64),inputFingerprint:'c'.repeat(64)},
  observation:{summary:'合成基础资料表单',texts:labels,groups:[],fields:labels.map(label=>({label,type:'text',required:true,group:'基础资料',value:''})),visual:[],uncertainties:[]}};
 const result={...body,fingerprint:contentFingerprint(JSON.stringify(body))};expect(validReferenceEvidence(result)).toBe(true);return result;
}
function fixture(labels=['居住地'],request='基础资料使用现居地字段，表单在当前页面填写，不跳转'){
 const e=evidence(labels),contract=buildDesignTaskContract({intent:'create_screen',request,deviceProfile:'mobile',frameWidth:390,referenceImage:e.image});contract.referenceImage!.evidence=e;
 const plan:PageTaskPlan={goal:'填写基础资料',actor:'当前用户',completion:['在当前页填写并保存'],questions:[],features:[]};
 for(let i=0;i<labels.length;i+=6)plan.features.push({id:`f${plan.features.length+1}`,title:`基础资料${plan.features.length+1}`,change:'add',basis:'image',sourceIds:[`image:${e.image.fingerprint}`],information:labels.slice(i,i+6).map(label=>({label:label==='居住地'?'现居地':label,kind:'input'})),interactions:[],states:[]});
 const transport=new MockTransport(),requests:any[]=[],core=new DefaultAIEngineCore({id:'field-coverage-wire',stream(r,event){requests.push(r);return transport.stream(r,event);}}),budget=new TaskBudget({maxRequests:4,maxRequestedOutputTokens:34568,maxDurationMs:10000,maxRequestDurationMs:10000});
 const html='<main class="p-4 col gap-3"><h1>基础资料</h1>'+labels.map((label,i)=>`<label for="f-${i}">${label==='居住地'?'现居地':label}</label><input id="f-${i}" class="input"/>`).join('')+'<button class="btn btn-primary">保存</button></main>';
 return {e,contract,plan,transport,requests,core,budget,html,prepare:()=>preparePageTaskPlan(core,{contract,provider,model:'synthetic',budget,isCurrent:()=>true})};
}
for(const label of ['现居地','现居住地','常住地','居住地','现 居 地（必填）*'])test(`reference residence equivalence: ${label}`,()=>{
 const e=evidence(),before=JSON.stringify(e);expect(referenceFieldCoverage(e,[label])).toBeUndefined();expect(JSON.stringify(e)).toBe(before);
});
for(const label of ['家乡','户籍地','籍贯','地区','择偶地区','意向地区','期望对象现居地','对象居住地'])test(`different location concept never covers residence: ${label}`,()=>expect(referenceFieldCoverage(evidence(),[label])).toContain('居住地'));
test('explicit deletion/rename via the equivalent user label does not mutate observations; negated deletion still protects it',()=>{
 const e=evidence(['居住地','家乡']);expect(referenceFieldsForRequest(e,'删除现居地字段')).toEqual(['家乡']);expect(referenceFieldsForRequest(e,'现居地改为工作城市')).toEqual(['家乡']);
 expect(referenceFieldsForRequest(e,'1. 将现居地标签改为工作城市')).toEqual(['家乡']);expect(referenceFieldsForRequest(e,'居住地文字改成工作城市')).toEqual(['家乡']);
 for(const request of ['不要删除现居地','禁止移除现居地','删除家乡，保留现居地','删除家乡并保留现居地','删除期望对象现居地字段','对象现居地改为择偶地区'])expect(referenceFieldsForRequest(e,request)).toContain('居住地');
 expect(e.observation.fields.map(f=>f.label)).toEqual(['居住地','家乡']);
});
test('11 observed fields reach actual planning wire as explicit requirements; same-meaning label proceeds through encoded HTML generation with no image replay',async()=>{
 const f=fixture(fields),before=JSON.stringify(f.e);f.transport.queueResponse(JSON.stringify(f.plan),1);f.transport.queueResponse(`<artifact type="screen" title="基础资料">${f.html}</artifact>`,1);
 try{const snapshot=await f.prepare();expect(snapshot.request.formatRepair).toBeUndefined();expect(f.requests).toHaveLength(1);
  const user=f.requests[0].body.messages.find((m:any)=>m.role==='user').content,payload=JSON.parse(user.split('\n[TAUDESIGN_REFERENCE_EVIDENCE ')[0]);
  expect(payload.requiredReferenceFields).toHaveLength(11);expect(payload.requiredReferenceFields.find((field:any)=>field.label==='居住地').equivalentLabels).toContain('现居地');
  const generated=await streamWithContinuation(withReferenceEvidence(withTaskBudget(f.core,f.budget),f.e),{provider,model:'synthetic',maxTokens:8192,messages:[{role:'user',content:f.contract.request}]});
  const artifact=extractArtifact(generated.rawResponse);expect(generated.finishReason).toBe('stop');expect(artifact?.isComplete).toBe(true);expect(checkGenerationQuality(artifact!.html,{designSystem:neutralModernTheme,contentTask:{...f.contract,pageTaskPlan:snapshot}}).passed).toBe(true);
  expect(f.requests).toHaveLength(2);expect(f.budget.snapshot().requests).toBe(2);expect(f.requests.every(r=>r.body.messages.every((m:any)=>typeof m.content==='string'))).toBe(true);expect(JSON.stringify(f.requests.map(r=>r.body))).not.toContain('image_url');
 }finally{f.budget.close();}
 expect(JSON.stringify(f.e)).toBe(before);
});
test('planning requirement list preserves source label and group while listing the accepted equivalent',()=>{
 const e=evidence(fields),requirements=referencePlanningFields(e,'基础资料使用现居地');expect(requirements).toHaveLength(11);expect(requirements.find(f=>f.label==='居住地')).toMatchObject({group:'基础资料',type:'text',required:true,equivalentLabels:['居住地','现居地','现居住地','常住地']});
});
test('full pipeline independently observes 11 fields, plans the user alias, then generates complete associated controls',async()=>{
 const restore=installReferenceImageDecoder(),f=fixture(fields),attachment={name:'synthetic.png',dataUrl:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='};
 const observed=structuredClone(f.e.observation),plan=structuredClone(f.plan);for(const feature of plan.features)feature.sourceIds=[`image:${referenceImageIdentity(attachment).fingerprint}`];
 const vision={...provider,modelCapabilities:{observer:{version:1 as const,revision:'1',source:'user' as const,endpointIdentity:endpointIdentity(provider),mediaInput:'native-part' as const}}};
 f.transport.queueResponse(JSON.stringify(observed),1);f.transport.queueResponse(JSON.stringify(plan),1);f.transport.queueResponse(`<artifact type="screen" title="基础资料">${f.html}</artifact>`,1);
 try{const result=await PipelineExecutor.execute({input:{rawPrompt:f.contract.request,activeScreenId:null,attachment},provider,model:'synthetic',engineCore:f.core,screens:{},deviceProfile:'mobile',frameWidth:390,designSystem:neutralModernTheme,baseSystemPrompt:'synthetic',pageTaskPlanning:{},taskBudget:f.budget,referenceProcessing:{binding:{provider:vision,model:'observer'},storage:new LocalStorageStorage('field-alias-'+crypto.randomUUID())}});
  expect(result.status).toBe('applied');expect(f.requests).toHaveLength(3);expect(f.requests[0].body.messages.some((m:any)=>Array.isArray(m.content))).toBe(true);expect(f.requests.slice(1).every(r=>r.body.messages.every((m:any)=>typeof m.content==='string'))).toBe(true);
  expect(result.workflowContract?.referenceImage?.evidence?.observation.fields.map(f=>f.label)).toContain('居住地');expect(result.workflowContract?.pageTaskPlan?.plan.features.flatMap(f=>f.information.map(i=>i.label))).toContain('现居地');expect(result.workflowContract?.pageTaskPlan?.request.formatRepair).toBeUndefined();expect(result.extractedHtml).toContain('现居地');expect(result.qualityReport?.passed).toBe(true);
 }finally{restore();f.budget.close();}
});
test('real omitted field gets exactly one correction on the same parent ledger, never a silent pass',async()=>{
 const f=fixture(fields),bad=structuredClone(f.plan);for(const group of bad.features)group.information=group.information.filter(i=>i.label!=='现居地');f.transport.queueResponse(JSON.stringify(bad),1);f.transport.queueResponse(JSON.stringify(bad),1);
 try{await expect(f.prepare()).rejects.toThrow('referenceImage.fields');expect(f.requests).toHaveLength(2);expect(f.budget.snapshot().requests).toBe(2);expect(f.budget.snapshot().requestedOutputTokens).toBe(6144);}finally{f.budget.close();}
});
test('missing-field correction can restore coverage without discarding the source evidence or adding a third attempt',async()=>{
 const f=fixture(),bad=structuredClone(f.plan);bad.features[0].information=[];f.transport.queueResponse(JSON.stringify(bad),1);f.transport.queueResponse(JSON.stringify(f.plan),1);
 try{const result=await f.prepare();expect(result.plan.features[0].information[0].label).toBe('现居地');expect(result.request.formatRepair?.firstIssue).toContain('居住地');expect(f.requests).toHaveLength(2);expect(JSON.stringify(f.requests.map(r=>r.body))).not.toContain('image_url');}finally{f.budget.close();}
});
test('a missing field cannot enlarge an exhausted one-request planning budget',async()=>{
 const f=fixture(),budget=new TaskBudget({maxRequests:1,maxRequestedOutputTokens:3072,maxDurationMs:10000,maxRequestDurationMs:10000}),bad=structuredClone(f.plan);bad.features[0].information=[];f.transport.queueResponse(JSON.stringify(bad),1);
 try{await expect(preparePageTaskPlan(f.core,{contract:f.contract,provider,model:'synthetic',budget,isCurrent:()=>true})).rejects.toThrow('referenceImage.fields');expect(f.requests).toHaveLength(1);expect(budget.snapshot().requests).toBe(1);expect(budget.snapshot().requestedOutputTokens).toBe(3072);}finally{budget.close();f.budget.close();}
});
test('native field labels share equivalence, but placeholders, nearby text and explicit exact wording cannot bypass delivery',()=>{
 const f=fixture();f.budget.close();const contract={...f.contract,pageTaskPlan:{plan:f.plan} as any};
 expect(checkGenerationQuality(f.html,{contentTask:contract}).findings.some(f=>f.code==='reference_field_missing')).toBe(false);
 for(const html of ['<main><p>现居地</p><input placeholder="现居地"/></main>','<main><label>家乡<input/></label></main>','<main><label>期望对象现居地<input/></label></main>'])expect(checkGenerationQuality(html,{contentTask:contract}).findings.some(f=>f.code==='reference_field_missing')).toBe(true);
 const exact={...contract,request:'字段标签文案必须为“居住地”'};expect(checkGenerationQuality(f.html,{contentTask:exact}).findings.some(f=>f.code==='required_field_label_missing')).toBe(true);
});

test('明确只读字段可用可见dt/dd展示，普通字段不能以旁文冒充可输入字段',()=>{
 const f=fixture();f.budget.close();const contract={...f.contract,pageTaskPlan:{plan:f.plan} as any,request:'居住地字段只读'};
 const readonly='<main><dl><dt>居住地</dt><dd>云岩区</dd></dl></main>';
 expect(checkGenerationQuality(readonly,{contentTask:contract}).findings.some(f=>f.code==='reference_field_missing')).toBe(false);
 expect(checkGenerationQuality(readonly,{contentTask:{...contract,request:'填写居住地'}}).findings.some(f=>f.code==='reference_field_missing')).toBe(true);
 for(const value of ['<dd hidden>云岩区</dd>','<dd></dd>','<dd><input value="云岩区"/></dd>'])expect(checkGenerationQuality('<dl><dt>居住地</dt>'+value+'</dl>',{contentTask:contract}).findings.some(f=>f.code==='reference_field_missing')).toBe(true);
 expect(checkGenerationQuality(readonly,{contentTask:{...contract,request:'居住地字段不要只读'}}).findings.some(f=>f.code==='reference_field_missing')).toBe(true);
});

test('只读字段合同沿有限同义标签生效，不能换同义词或星号绕开只读要求',()=>{
 const f=fixture();f.budget.close();const contract={...f.contract,pageTaskPlan:{plan:f.plan} as any,request:'居住地字段只读'};
 const editable='<main><label>现居地 *<input/></label></main>';
 expect(checkGenerationQuality(editable,{contentTask:contract}).findings.some(f=>f.code==='reference_field_missing')).toBe(true);
 expect(checkGenerationQuality(editable.replace('<input/>','<input readonly/>'),{contentTask:contract}).findings.some(f=>f.code==='reference_field_missing')).toBe(false);
 expect(checkGenerationQuality(editable.replace('<input/>','<input type="checkbox" readonly/>'),{contentTask:contract}).findings.some(f=>f.code==='reference_field_missing')).toBe(true);
});
