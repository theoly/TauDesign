import {test,expect} from 'bun:test';
import {executeStructuredEdit,type StructuredEditOptions} from '../src/services/ai/structuredEditExecutor';
import {buildDesignTaskContract,contentFingerprint} from '../src/services/ai/designWorkflow';
import {neutralModernTheme} from '../src/utils/themePresets';
import {TaskBudget} from '../src/services/ai/taskBudget';
import {validateRegionSubdivisionScope,regionNeedsSubdivision,REGION_ATOMIC_BYTES} from '../src/services/ai/regionSubdivision';
import type {AIEngineCore,StreamTextOptions} from '../src/services/ai/engine/core/types';
import {preparePageTaskPlan,pageTaskPlanIssue} from '../src/services/ai/pageTaskPlan';
import {capturePageTaskHistory,readPageTaskHistory} from '../src/services/ai/pageTaskHistory';
const provider={id:'subdivision',name:'fixture',protocol:'openai_compatible' as const,baseUrl:'https://example.test/v1',apiKey:'fixture',isEnabled:true};
const task={goal:'填写邮箱并查看反馈',actor:'会员',completion:['填写邮箱后保存'],questions:[],features:[{id:'f1',title:'邮箱资料',change:'add' as const,basis:'user' as const,sourceIds:['user:request'],information:[{label:'邮箱',kind:'input' as const}],interactions:[{label:'保存资料',precondition:'邮箱已填写',outcome:'显示校验结果',targetScreenId:''}],states:[]}]};
function fixture(size=50000){
 const inner='<article data-nid="fields"><h2 data-nid="title">资料</h2><button data-nid="save" class="btn btn-primary">保存资料</button></article>';
 const html='<main data-nid="page"><section data-nid="region"><article data-nid="unchanged"><p data-nid="long">'+('原文'.repeat(size/2))+'TAIL_PRIVATE_UNSENT</p></article>'+inner+'</section><aside data-nid="outside">'+Array.from({length:30},(_,i)=>`<p data-nid="aside${i}">原页外围${i}</p>`).join('')+'</aside></main>';
 const request='在资料区增加邮箱输入框，提交后显示校验反馈';
 const options:StructuredEditOptions={mode:'region',screen:{id:'source',name:'资料',htmlContent:html,scopedCss:'.legacy{display:flex}'},request,regionNids:['region'],settings:{deviceProfile:'mobile',frameWidth:390},designSystem:neutralModernTheme,colorMode:'light',binding:{provider,model:'model'},isCurrent:()=>true,
  contract:buildDesignTaskContract({intent:'modify_screen',request,target:{id:'source',name:'资料',htmlContent:html},deviceProfile:'mobile',frameWidth:390,allowedChanges:['element:region']})};
 return {html,inner,options};
}
for(const size of [30000,50000,100000])test(`large ${size}-character authorized region plans bounded inner targets, keeps required originals and commits no partial result`,async()=>{
 const f=fixture(size),calls:StreamTextOptions[]=[];
 const core:AIEngineCore={streamText(){throw Error('full-page rewrite is forbidden');},async generateObject(schema,options){calls.push(options);
  if((schema.properties as any)?.shellOperations)return {fragments:[{nid:'fields',requirements:'在现有资料输入组补邮箱，不修改其它区域'}],shellOperations:[{nid:'region',type:'add_classes',value:'col gap-4'}]} as any;
  if((schema.properties as any)?.features)return task as any;
  return {nid:'fields',html:f.inner.replace('</article>','<label>邮箱<input data-nid="email" class="input"/></label></article>')} as any;
 }};
 const result=await executeStructuredEdit(core,f.options);expect(result.status).toBe('ready');if(result.status!=='ready')throw Error(result.message);
 expect(calls).toHaveLength(3);expect(calls[0].provenance?.stepId).toBe('region-subdivision');expect(calls[1].messages.at(-1)!.content).toContain('fields');expect(calls[1].messages.at(-1)!.content).not.toContain('TAIL_PRIVATE_UNSENT');expect(calls[2].messages.at(-1)!.content).not.toContain('TAIL_PRIVATE_UNSENT');
 const original=new DOMParser().parseFromString(f.html,'text/html'),updated=new DOMParser().parseFromString(result.html,'text/html');
 for(const nid of ['unchanged','outside'])expect(original.querySelector(`[data-nid="${nid}"]`)!.isEqualNode(updated.querySelector(`[data-nid="${nid}"]`)!)).toBe(true);
 expect(Boolean(updated.querySelector('input[data-nid="email"]'))).toBe(true);expect(updated.querySelector('[data-nid="region"]')!.getAttribute('class')).toBe('col gap-4');expect(result.targetNids).toEqual(['region']);expect(result.contract.regionSubdivision?.roots).toEqual(['region']);expect(result.taskBudget?.requests).toBe(3);expect(result.taskBudget?.limits.maxRequests).toBe(14);expect(f.options.contract.regionSubdivision).toBeUndefined();
});
for(const bad of ['outside','nested','shell-sibling','fourth','missing'])test(`invalid internal subdivision ${bad} stops before functional planning or HTML`,async()=>{
 const f=fixture();let calls=0;
 const core:AIEngineCore={streamText(){throw Error('unused');},async generateObject(){calls++;return {fragments:bad==='fourth'?Array.from({length:4},()=>({nid:'fields',requirements:'x'})):bad==='nested'?[{nid:'fields',requirements:'x'},{nid:'title',requirements:'x'}]:[{nid:bad==='outside'?'outside':bad==='missing'?'absent':'fields',requirements:'x'}],shellOperations:bad==='shell-sibling'?[{nid:'unchanged',type:'add_classes',value:'p-4'}]:[]} as any;}};
 const result=await executeStructuredEdit(core,f.options);expect(result.status).toBe('failed');expect(calls).toBe(1);expect('html'in result).toBe(false);
});
test('an indivisible text leaf refuses before a model call, and disk scope identities cannot broaden authority',async()=>{
 const f=fixture(),doc=new DOMParser().parseFromString(f.html,'text/html'),replacement=doc.createElement('section');replacement.setAttribute('data-nid','region');replacement.appendChild(doc.createTextNode('完整原文'.repeat(10000)));doc.querySelector('[data-nid="region"]')!.replaceWith(replacement);const html=doc.body.innerHTML;let calls=0;
 const options={...f.options,screen:{...f.options.screen,htmlContent:html},contract:buildDesignTaskContract({intent:'modify_screen',request:f.options.request,target:{id:'source',name:'资料',htmlContent:html},deviceProfile:'mobile',frameWidth:390,allowedChanges:['element:region']})};
 const result=await executeStructuredEdit({streamText(){throw Error('unused');},async generateObject(){calls++;throw Error('must not call');}},options);expect(result.status).toBe('failed');expect(calls).toBe(0);
 const scope={version:1 as const,baselineFingerprint:contentFingerprint(f.html),roots:['region'],fragments:[{nid:'outside',rootNid:'region',requirements:'x'}],shellOperations:[],inputFingerprint:'hash'};expect(()=>validateRegionSubdivisionScope(f.html,['region'],scope)).toThrow('扩大范围');
 expect(regionNeedsSubdivision(f.html,['region'])).toBe(true);expect(REGION_ATOMIC_BYTES).toBe(16384);
});
test('cancellation after the internal plan cannot send the business planner or modify original data',async()=>{
 const f=fixture(),controller=new AbortController();let calls=0;f.options.signal=controller.signal;
 const result=await executeStructuredEdit({streamText(){throw Error('unused');},async generateObject(){calls++;controller.abort();return {fragments:[{nid:'fields',requirements:'邮箱'}],shellOperations:[]} as any;}},f.options);
 expect(result.status).toBe('cancelled');expect(calls).toBe(1);expect(f.options.screen.htmlContent).toBe(f.html);
});

async function prepareExistingPlan(f:ReturnType<typeof fixture>){
 const budget=new TaskBudget({maxRequests:14,maxRequestedOutputTokens:34568,maxDurationMs:900000,maxRequestDurationMs:900000});f.options.taskBudget=budget;
 const snapshot=await preparePageTaskPlan({streamText(){throw Error('unused');},async generateObject(){return task as any;}},{contract:f.options.contract,provider,model:'model',budget,baselineHtml:f.html,regionNids:['region'],isCurrent:()=>true});f.options.contract.pageTaskPlan=snapshot;return {snapshot,budget};
}
test('a previously confirmed functional plan survives narrower internal execution without another business planning request',async()=>{
 const f=fixture(),{snapshot,budget}=await prepareExistingPlan(f);
 let calls=0;
 const result=await executeStructuredEdit({streamText(){throw Error('unused');},async generateObject(schema){calls++;
  if((schema.properties as any)?.shellOperations)return {fragments:[{nid:'fields',requirements:'补充邮箱输入'}],shellOperations:[]} as any;
  if((schema.properties as any)?.features)throw Error('不能重复规划已经确认的业务');
  return {nid:'fields',html:f.inner.replace('</article>','<label>邮箱<input data-nid="email" class="input"/></label></article>')} as any;
 }},f.options);
 budget.close();expect(result.status).toBe('ready');expect(calls).toBe(2);expect(result.taskBudget?.requests).toBe(3);expect(result.contract.pageTaskPlan?.plan).toEqual(snapshot.plan);expect(result.contract.pageTaskPlan?.request.inputFingerprint).toBe(snapshot.request.inputFingerprint);expect(result.contract.pageTaskPlan?.request.scopeRefinement?.originalBindingFingerprint).toBe(snapshot.bindingFingerprint);expect(pageTaskPlanIssue(result.contract)).toBeUndefined();expect(snapshot.request.scopeRefinement).toBeUndefined();
 const tampered=structuredClone(result.contract);tampered.regionSubdivision!.fragments[0].requirements='换成别的任务';expect(pageTaskPlanIssue(tampered)).toContain('范围细化');
 const historical=capturePageTaskHistory(result.contract,f.options.request);expect(historical).toBeDefined();expect(readPageTaskHistory(historical,f.options.request)?.contract.pageTaskPlan?.request.scopeRefinement).toEqual(result.contract.pageTaskPlan!.request.scopeRefinement);expect(JSON.stringify(historical)).not.toContain('TAIL_PRIVATE_UNSENT');
});

test('stale confirmed business plans are rejected before even the internal subdivision request',async()=>{
 const f=fixture(),{budget}=await prepareExistingPlan(f);f.options.contract.pageTaskPlan!.plan.goal='已经被改动';let calls=0;
 const result=await executeStructuredEdit({streamText(){throw Error('unused');},async generateObject(){calls++;throw Error('不应发送');}},f.options);budget.close();expect(result.status).toBe('failed');expect(calls).toBe(0);
});
