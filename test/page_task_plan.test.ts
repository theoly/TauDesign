import {expect,test} from 'bun:test';
import {preparePageTaskPlan,pageTaskPlanIssue} from '../src/services/ai/pageTaskPlan';
import {buildDesignTaskContract} from '../src/services/ai/designWorkflow';
import {DefaultAIEngineCore} from '../src/services/ai/engine/core/aiEngineCore';
import {MockTransport} from '../src/services/ai/engine/transport/mockTransport';
import {TaskBudget} from '../src/services/ai/taskBudget';
import {defaultProviders} from '../src/stores/useAIConfigStore';

const provider={...defaultProviders[0],id:'plan-provider',protocol:'openai_compatible' as const,baseUrl:'http://mock',apiKey:'PLAN_SECRET'};
const raw=()=>({goal:'用户选择预约时间并确认预约',actor:'预约用户',completion:['显示预约确认结果'],features:[{id:'f1',title:'预约时间选择',change:'add',basis:'user',sourceIds:['user:request'],
  information:[{label:'预约时间',kind:'input'}],interactions:[{label:'确认预约',precondition:'已选择时间',outcome:'展示预约确认结果',targetScreenId:''}],
  states:[{name:'未选时间',condition:'尚未选择',feedback:'提示选择预约时间'}]}],questions:[]});
function input(){return {contract:buildDesignTaskContract({intent:'create_screen',request:'新建预约页面，用户选择预约时间并确认预约',deviceProfile:'mobile',frameWidth:390}),
  provider,model:'mock',budget:new TaskBudget({maxRequests:2,maxRequestedOutputTokens:8192,maxDurationMs:900000,maxRequestDurationMs:900000}),isCurrent:()=>true};}
async function run(value=raw(),options=input()){
  const transport=new MockTransport();transport.queueResponse(JSON.stringify(value));
  try{return {snapshot:await preparePageTaskPlan(new DefaultAIEngineCore(transport),options),transport,options};}finally{options.budget.close();}
}
test('planning produces functional information, interactions and states using the existing JSON core and caller budget',async()=>{
  const {snapshot,transport,options}=await run();
  expect(snapshot.plan.features[0].information).toEqual([{label:'预约时间',kind:'input'}]);
  expect(snapshot.plan.features[0].interactions[0].outcome).toBe('展示预约确认结果');
  expect(snapshot.plan.features[0].states[0].condition).toBe('尚未选择');
  expect((transport.lastRequest!.body as any).response_format.type).toBe('json_schema');
  expect(options.budget.snapshot().requests).toBe(1);
  expect(JSON.stringify(snapshot)).not.toContain('PLAN_SECRET');
  expect(pageTaskPlanIssue({...options.contract,pageTaskPlan:snapshot})).toBeUndefined();
});
test('task snapshot cannot be reused for another request, baseline, source or protected scope',async()=>{
  const {snapshot,options}=await run();
  for(const mutate of [(c:any)=>c.request='改为充值页面',(c:any)=>c.target={id:'a',name:'改动页',baselineFingerprint:'other'},(c:any)=>c.allowedChanges=['element:other'],(c:any)=>c.protectedNids=['node'],(c:any)=>c.knowledgeFingerprint='different']){
    const contract=structuredClone(options.contract);mutate(contract);
    expect(pageTaskPlanIssue({...contract,pageTaskPlan:snapshot})).toBeDefined();
  }
});
test('unknown source IDs and fabricated page targets cannot be saved as usable plans',async()=>{
  for(const kind of ['source','target'] as const){const value=raw();
    if(kind==='source')value.features[0].sourceIds=['doc:not-provided'];else value.features[0].interactions[0].targetScreenId='missing';
    await expect(run(value)).rejects.toThrow();
  }
});
test('creation cannot be used to authorize deletion, and malformed duplicate features are refused',async()=>{
  const deleted=raw();deleted.features[0].change='remove';await expect(run(deleted)).rejects.toThrow();
  const duplicates=raw();duplicates.features.push(structuredClone(duplicates.features[0]));await expect(run(duplicates)).rejects.toThrow();
});
test('inference remains distinct from reported source attribution',async()=>{
  const value=raw();value.features[0].basis='inference';value.features[0].sourceIds=[];
  const {snapshot}=await run(value);expect(snapshot.plan.features[0].basis).toBe('inference');
});
test('output limits cannot produce an apparently completed plan',async()=>{
  const transport=new MockTransport();transport.enqueueScenario({events:[{type:'Delta',text:JSON.stringify(raw())},{type:'Done',finish_reason:'length'}]});
  const options=input();try{await expect(preparePageTaskPlan(new DefaultAIEngineCore(transport),options)).rejects.toThrow();
    expect(options.budget.snapshot().requests).toBe(1);
  }finally{options.budget.close();}
});
test('exhausted parent budget and pre-cancelled work never dispatch a planner request',async()=>{
  for(const kind of ['budget','cancel'] as const){const options=input(),transport=new MockTransport(),signal=new AbortController();
    if(kind==='budget'){options.budget.reserve(8192).settle();}else signal.abort();
    try{await expect(preparePageTaskPlan(new DefaultAIEngineCore(transport),{...options,signal:signal.signal})).rejects.toThrow();expect(transport.lastRequest).toBeUndefined();}
    finally{options.budget.close();}
  }
});
test('late successful planning after project changes cannot return a usable snapshot',async()=>{
  const options=input(),transport=new MockTransport();let current=true;
  options.isCurrent=()=>current;
  const core={streamText(){throw Error('unused');},async generateObject<T>(){current=false;return raw() as T;}};
  try{await expect(preparePageTaskPlan(core,options)).rejects.toThrow();}finally{options.budget.close();}
});
test('old contracts remain compatible and corrupted restored plan data cannot satisfy validation',async()=>{
  expect(pageTaskPlanIssue(input().contract)).toBeUndefined();
  const {snapshot,options}=await run();(snapshot.plan.features[0].information as any)='invalid';
  expect(pageTaskPlanIssue({...options.contract,pageTaskPlan:snapshot})).toBeDefined();
});
test('functional modification requires its exact baseline and cannot infer authorization to remove a feature',async()=>{
  const html='<main data-nid="root0001"><label>预约时间<input/></label></main>';
  const options={...input(),contract:buildDesignTaskContract({intent:'modify_screen',request:'新增预约备注',target:{id:'a',name:'预约',htmlContent:html},deviceProfile:'mobile',frameWidth:390}),baselineHtml:html};
  const value=raw();value.features[0].change='remove';
  await expect(run(value,options)).rejects.toThrow();
});
test('restored request metadata must be bounded strings rather than truthy objects',async()=>{
  const {snapshot,options}=await run();(snapshot.request as any).providerId={apiKey:'unsafe'};
  expect(pageTaskPlanIssue({...options.contract,pageTaskPlan:snapshot})).toBeDefined();
});
test('a valid-looking edit to frozen business requirements invalidates its fingerprint',async()=>{
  const {snapshot,options}=await run();snapshot.plan.goal='悄悄改成购买会员';
  expect(pageTaskPlanIssue({...options.contract,pageTaskPlan:snapshot})).toBeDefined();
});
test('modification can retain existing functionality but missing baseline stops before dispatch',async()=>{
  const html='<main>预约时间</main>',options={...input(),contract:buildDesignTaskContract({intent:'modify_screen',request:'保留预约时间，新增备注',target:{id:'a',name:'预约',htmlContent:html},deviceProfile:'mobile',frameWidth:390}),baselineHtml:html};
  const value=raw();value.features[0].change='retain';const {snapshot}=await run(value,options);
  expect(snapshot.plan.features[0].change).toBe('retain');
  const missing={...options,budget:input().budget,baselineHtml:undefined},transport=new MockTransport();
  try{await expect(preparePageTaskPlan(new DefaultAIEngineCore(transport),missing)).rejects.toThrow();expect(transport.lastRequest).toBeUndefined();}
  finally{missing.budget.close();}
});
