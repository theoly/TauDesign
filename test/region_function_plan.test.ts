import {expect,test} from 'bun:test';
import {executeStructuredEdit,type StructuredEditOptions} from '../src/services/ai/structuredEditExecutor';
import {buildDesignTaskContract} from '../src/services/ai/designWorkflow';
import {DefaultAIEngineCore} from '../src/services/ai/engine/core/aiEngineCore';
import {MockTransport} from '../src/services/ai/engine/transport/mockTransport';
import {TaskBudget} from '../src/services/ai/taskBudget';
import {referenceImageIdentity} from '../src/services/ai/workflowSources';
import {capturePageTaskHistory} from '../src/services/ai/pageTaskHistory';
import {neutralModernTheme} from '../src/utils/themePresets';
import {chatPageTaskPlan} from './fixtures/pageTaskPlan';
const source='<main data-nid="page0001"><section data-nid="form0001"><h2 data-nid="title001">会员资料</h2><button data-nid="save0001" class="btn btn-primary">保存资料</button></section><aside data-nid="aside001">'+Array.from({length:18},(_,i)=>`<p data-nid="keep${i}">OUTSIDE_PRIVATE_NOT_FOR_PLANNER_${i}</p>`).join('')+'</aside></main>';
const replacement='<section data-nid="form0001" class="col gap-4"><h2 data-nid="title001">会员资料</h2><label>邮箱<input data-nid="email001" class="input"/></label><button data-nid="save0001" class="btn btn-primary">保存资料</button></section>';
const plan={...chatPageTaskPlan,goal:'填写邮箱并查看反馈',features:[{...chatPageTaskPlan.features[0],title:'邮箱资料',information:[{label:'邮箱',kind:'input' as const}],interactions:[{label:'保存资料',precondition:'邮箱已填写',outcome:'显示校验结果',targetScreenId:''}]}]};
function fixture(image=false){
 const request='在资料区增加邮箱输入框，提交后显示校验反馈';
 const provider={id:'fixture',protocol:'openai_compatible' as const,name:'fixture',baseUrl:'http://mock',apiKey:'REGION_SECRET'};
 const options:StructuredEditOptions={mode:'region',screen:{id:'page',name:'资料',htmlContent:source},request,
  contract:buildDesignTaskContract({intent:'modify_screen',request,target:{id:'page',name:'资料',htmlContent:source},deviceProfile:'mobile',frameWidth:390,allowedChanges:['element:form0001']}),
  settings:{deviceProfile:'mobile',frameWidth:390,useCustomNavigation:false},designSystem:neutralModernTheme,colorMode:'light',regionNids:['form0001'],binding:{provider,model:image?'fixture-vision':'fixture'},isCurrent:()=>true};
 if(image){options.attachment={name:'参考.png',dataUrl:'data:image/png;base64,YQ==',region:{sourceFingerprint:'abcdef01',sourceWidth:100,sourceHeight:100,x:0,y:0,width:50,height:50}};options.imageUrl=options.attachment.dataUrl;}
 const transport=new MockTransport(),requests:any[]=[];const core=new DefaultAIEngineCore({id:'capture',stream:(request,event)=>{requests.push(request);return transport.stream(request,event);}});
 const response=image?{...plan,features:plan.features.map(f=>({...f,basis:'image',sourceIds:[`image:${referenceImageIdentity(options.attachment!).fingerprint}`]}))}:plan;
 return {options,transport,core,requests,response};
}
for(const image of [false,true])test(`confirmed functional region (${image?'image':'text'}) plans only authorized source before scoped JSON and preserves outside DOM`,async()=>{
 const f=fixture(image);f.transport.queueResponse(JSON.stringify(f.response));f.transport.queueResponse(JSON.stringify({nid:'form0001',html:replacement}));
 const result=await executeStructuredEdit(f.core,f.options);expect(result.status).toBe('ready');if(result.status!=='ready')throw Error(result.message);
 expect(f.requests).toHaveLength(2);expect(f.requests[0].body.response_format.json_schema.schema.properties.features).toBeDefined();
 expect(f.requests[1].body.response_format.json_schema.schema.properties.nid.enum).toEqual(['form0001']);
 expect(f.requests[1].body.messages[0].content).toContain('PAGE TASK PLAN');
 const plannerContent=JSON.stringify(f.requests[0].body.messages);expect(plannerContent).toContain('form0001');expect(plannerContent).not.toContain('OUTSIDE_PRIVATE_NOT_FOR_PLANNER');const last=f.requests[0].body.messages.at(-1).content;expect(JSON.parse(Array.isArray(last)?last.find((c:any)=>c.type==='text').text:last).baselineHtml).toBeUndefined();
 const doc=(html:string)=>new DOMParser().parseFromString(html,'text/html');
 expect(doc(result.html).querySelector('aside')!.isEqualNode(doc(source).querySelector('aside')!)).toBe(true);expect(doc(result.html).querySelector('input')).not.toBeNull();expect(doc(result.html).querySelector('[data-nid="save0001"]')?.textContent).toBe('保存资料');
 expect(result.taskBudget).toMatchObject({requests:2,requestedOutputTokens:7168,closed:true});expect(result.taskBudget?.limits.maxRequests).toBe(4);
 expect(f.options.contract.pageTaskPlan).toBeUndefined();const history=capturePageTaskHistory(result.contract,f.options.request)!;expect(history).toBeDefined();expect(JSON.stringify(history)).not.toContain('REGION_SECRET');
 if(image){expect(result.contract.pageTaskPlan?.request.imageFingerprint).toBe(referenceImageIdentity(f.options.attachment!).fingerprint);expect(JSON.stringify(history)).not.toContain(f.options.attachment!.dataUrl);
  for(const request of f.requests)expect(request.body.messages.at(-1).content.find((c:any)=>c.type==='image_url').image_url.url).toBe(f.options.attachment!.dataUrl);
 }
});
test('visual region changes keep one existing JSON request and do not manufacture business planning',async()=>{
 const f=fixture();f.options.request='资料区增加内边距';f.options.contract.request=f.options.request;
 f.transport.queueResponse(JSON.stringify({nid:'form0001',html:replacement.replace('<label>邮箱<input data-nid="email001" class="input"/></label>','')}));
 const result=await executeStructuredEdit(f.core,f.options);expect(result.status).toBe('ready');expect(f.requests).toHaveLength(1);expect(result.contract.pageTaskPlan).toBeUndefined();expect(result.taskBudget?.limits.maxRequestedOutputTokens).toBe(4096);
});
test('critical functional questions stop before replacement, while keeping the plan inspectable',async()=>{
 const f=fixture();f.transport.queueResponse(JSON.stringify({...plan,questions:['请确认邮箱是否必填']}));
 const result=await executeStructuredEdit(f.core,f.options);expect(result.status).toBe('failed');expect('html'in result).toBe(false);expect(f.requests).toHaveLength(1);expect(result.contract.pageTaskPlan?.plan.questions).toContain('请确认邮箱是否必填');expect(result.executionRecord.errorMessage).toContain('待确认');
});
test('invalid/protected/oversized/nonnested region authority is checked before spending a planning request',async()=>{
 for(const kind of ['protected','whole-page','missing','scope','request'] as const){const f=fixture();
  if(kind==='protected')f.options.contract.protectedNids=['save0001'];
  if(kind==='whole-page'){f.options.regionNids=['page0001'];f.options.contract.allowedChanges=['element:page0001'];}
  if(kind==='missing'){f.options.regionNids=['missing'];f.options.contract.allowedChanges=['element:missing'];}
  if(kind==='scope')f.options.contract.allowedChanges=['element:aside001'];
  if(kind==='request')f.options.contract.request='另一项任务';
  const result=await executeStructuredEdit(f.core,f.options);expect(result.status).toBe('failed');expect(f.requests).toHaveLength(0);
 }
});
for(const interrupt of ['cancel','stale'] as const)test(`${interrupt} after planning prevents replacement or a partial candidate`,async()=>{
 const f=fixture(),controller=new AbortController();let current=true,calls=0;f.options.signal=controller.signal;f.options.isCurrent=()=>current;
 const result=await executeStructuredEdit({streamText(){throw Error('unused');},async generateObject<T>(){calls++;if(interrupt==='cancel')controller.abort();else current=false;return plan as T;}},f.options);
 expect(result.status).toBe(interrupt==='cancel'?'cancelled':'stale');expect(calls).toBe(1);expect('html'in result).toBe(false);
});
test('an exhausted supplied parent is neither closed nor reset to fund a replacement or retry',async()=>{
 const f=fixture(),parent=new TaskBudget({maxRequests:1,maxRequestedOutputTokens:3072,maxDurationMs:900000,maxRequestDurationMs:900000});f.options.taskBudget=parent;
 f.transport.queueResponse(JSON.stringify(plan));const first=await executeStructuredEdit(f.core,f.options);
 expect(first.status).toBe('failed');expect(first.taskBudget).toMatchObject({requests:1,closed:false,exhausted:true});expect(f.requests).toHaveLength(1);
 expect((await executeStructuredEdit(f.core,f.options)).status).toBe('failed');expect(f.requests).toHaveLength(1);expect(parent.snapshot().closed).toBe(false);parent.close();
});
test('finite local mode and an element request without its exact reference cannot become a wider edit',async()=>{
 for(const mode of ['element','local'] as const){const f=fixture();f.options.mode=mode;
  const result=await executeStructuredEdit(f.core,f.options);expect(result.status).toBe('failed');expect(result.executionRecord.errorMessage).toContain(mode==='local'?'完整区块':'授权目标');expect(f.requests).toHaveLength(0);
 }
});
test('a changed image cannot reuse a frozen region plan',async()=>{
 const f=fixture(true);f.transport.queueResponse(JSON.stringify(f.response));f.transport.queueResponse(JSON.stringify({nid:'form0001',html:replacement}));const first=await executeStructuredEdit(f.core,f.options);expect(first.status).toBe('ready');
 f.options.contract=first.contract;f.options.attachment={...f.options.attachment!,dataUrl:'data:image/png;base64,Yg=='};f.options.imageUrl=f.options.attachment.dataUrl;
 expect((await executeStructuredEdit(f.core,f.options)).status).toBe('failed');expect(f.requests).toHaveLength(2);
 f.options.attachment=undefined;f.options.imageUrl=undefined;
 expect((await executeStructuredEdit(f.core,f.options)).status).toBe('failed');expect(f.requests).toHaveLength(2);
});
test('a later region failure does not return the earlier completed replacement',async()=>{
 const f=fixture();f.options.regionNids=['form0001','keep0'];f.options.contract.allowedChanges=['element:form0001','element:keep0'];
 f.transport.queueResponse(JSON.stringify(plan));f.transport.queueResponse(JSON.stringify({nid:'form0001',html:replacement}));f.transport.queueResponse(JSON.stringify({nid:'other',html:'<p>越界</p>'}));
 const result=await executeStructuredEdit(f.core,f.options);expect(result.status).toBe('failed');expect('html'in result).toBe(false);expect(f.requests).toHaveLength(3);
});
