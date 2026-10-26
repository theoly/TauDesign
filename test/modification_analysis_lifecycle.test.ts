import { describe, expect, test } from 'bun:test';
import { analyzeScreenModification, buildModificationReviewReceipt } from '../src/services/ai/modificationReview';
import { buildDesignTaskContract } from '../src/services/ai/designWorkflow';
import { WORKFLOW_CATALOG } from '../src/services/ai/workflowCatalog';
import { createWorkflowValidationPlan, resolveWorkflowValidation } from '../src/services/ai/workflowValidation';
import { defaultTheme } from '../src/utils/themePresets';
import { defaultProviders } from '../src/stores/useAIConfigStore';
import type { AIEngineCore } from '../src/services/ai/engine/core/types';

const html = '<main data-nid="root"><h1 data-nid="title" class="text-sm">原标题</h1><aside>'+Array.from({length:16},(_,i)=>`<p data-nid="p${i}">保留</p>`).join('')+'</aside></main>';
const target = {id:'page',name:'原页',htmlContent:html};
const valid = {summary:'标题层次',items:[{title:'标题加粗',reason:'标题不突出',change:'加粗标题',scope:'local',operations:[{nid:'title',type:'add_classes',value:'font-bold'}]}]};
const options = () => ({provider:defaultProviders[0],model:'controlled',html,name:target.name,request:'优化页面',designSystem:structuredClone(defaultTheme),
  mode:'light' as const,deviceProfile:'mobile' as const,frameWidth:390,protectedNids:[] as string[],
  workflowContract:buildDesignTaskContract({intent:'modify_screen',reviewRequired:true,request:'优化页面',target,deviceProfile:'mobile',frameWidth:390,designSystem:{id:defaultTheme.id,name:defaultTheme.name}})});
function core(respond: (call:number, request:any)=>unknown|Promise<unknown>) {
  let calls=0;
  return {engine:{generateObject:async (_:unknown,request:unknown)=>respond(++calls,request)} as AIEngineCore,calls:()=>calls};
}

describe('修改分析生命周期',()=>{
  for (const kind of ['workflow','operation','strategy','baseline','request','device','width','theme','tokens','protected','scope','plan'] as const) test(`${kind}不一致在请求前阻断`,async()=>{
    const input=options(),task=input.workflowContract;
    if(kind==='workflow')task.workflowId='unknown' as any;
    if(kind==='operation')task.operation='modify';
    if(kind==='strategy')task.strategy='candidate-copy';
    if(kind==='baseline')task.target!.baselineFingerprint='old';
    if(kind==='request')task.request='其它要求';
    if(kind==='device')task.device.profile='pc';
    if(kind==='width')task.device.frameWidth=320;
    if(kind==='theme')task.designSystem!.id='other';
    if(kind==='tokens')task.designSystem!.tokenFingerprint='stale';
    if(kind==='protected')task.protectedNids=['title'];
    if(kind==='scope')task.allowedChanges=['screen:page'];
    if(kind==='plan')task.validationPlan!.fingerprint='forged';
    const fake=core(()=>valid);await expect(analyzeScreenModification(fake.engine,input)).rejects.toThrow();expect(fake.calls()).toBe(0);
  });
  test('分析底线不能被目录删除，不支持的阶段在调用前拒绝',async()=>{
    const descriptor=WORKFLOW_CATALOG['review-page-modification'],old=descriptor.validationStages;
    try {
      descriptor.validationStages=[];
      expect(createWorkflowValidationPlan(descriptor).stages).toEqual(['analysis-schema']);
      descriptor.validationStages=['render'];
      const fake=core(()=>valid);await expect(analyzeScreenModification(fake.engine,options())).rejects.toThrow('尚无执行器');expect(fake.calls()).toBe(0);
    }finally{descriptor.validationStages=old;}
  });
  test('分析合同不能作为修改合同，反之亦然',()=>{
    const task=options().workflowContract;
    expect(resolveWorkflowValidation(task,'analysis').ok).toBe(true);
    expect(resolveWorkflowValidation(task,'structured').ok).toBe(false);
    task.workflowId='edit-page-copy';task.operation='modify';task.strategy='candidate-copy';delete task.validationPlan;
    expect(resolveWorkflowValidation(task,'analysis').ok).toBe(false);
    expect(resolveWorkflowValidation(undefined,'analysis').ok).toBe(false);
  });
  for (const [name,invalid] of [
    ['未知字段',{...valid,approved:true}],['建议额外字段',{...valid,items:[{...valid.items[0],id:'model-id'}]}],
    ['缺scope',{summary:'分析',items:[{title:'标题',reason:'依据',change:'改法',operations:[]}]}],
    ['非法scope',{...valid,items:[{...valid.items[0],scope:'rewrite-all'}]}],
    ['操作类型',{...valid,items:[{...valid.items[0],operations:[{nid:'title',type:'innerHTML',value:'x'}]}]}],
    ['操作上限',{...valid,items:[{...valid.items[0],operations:Array(13).fill(valid.items[0].operations[0])}]}],
    ['目标类型',{...valid,items:[{...valid.items[0],targetNids:[null]}]}],
    ['目标数量',{...valid,items:[{...valid.items[0],targetNids:['a','b','c','d']}]}]
  ] as const) test(`${name}实际检查后仅纠正一次`,async()=>{
    const fake=core(call=>call===1?invalid:structuredClone(valid));
    const result=await analyzeScreenModification(fake.engine,options());
    expect(fake.calls()).toBe(2);expect(result.evidence?.attempts).toBe(2);expect(result.evidence?.workflow.status).toBe('ready');
    expect(result.items[0].scope).toBe('local');
  });
  for(const raw of [valid,{wrong:'format'}]) for(const stop of ['stale','abort'] as const) test(`${stop}在非协作模型返回后阻断${raw===valid?'有效结果':'纠正请求'}`,async()=>{
    let current=true,release!:(value:unknown)=>void;const controller=new AbortController();
    const fake=core(()=>new Promise(resolve=>{release=resolve;}));
    const pending=analyzeScreenModification(fake.engine,{...options(),signal:controller.signal,isCurrent:()=>current});
    if(stop==='stale')current=false;else controller.abort();release(structuredClone(raw));
    await expect(pending).rejects.toThrow(stop==='stale'?'已变化':'取消');expect(fake.calls()).toBe(1);
  });
  test('开始前过期不调用模型，第二次纠正返回后仍再检查上下文',async()=>{
    let current=false;const fake=core(call=>{if(call===2)current=false;return call===1?{}:valid;});
    await expect(analyzeScreenModification(fake.engine,{...options(),isCurrent:()=>current})).rejects.toThrow('已变化');expect(fake.calls()).toBe(0);
    current=true;await expect(analyzeScreenModification(fake.engine,{...options(),isCurrent:()=>current})).rejects.toThrow('已变化');expect(fake.calls()).toBe(2);
  });
  test('冻结调用输入，纠正和安全定位始终使用原始页面/保护范围',async()=>{
    const input=options();let release!:(value:unknown)=>void;
    const fake=core((call,request)=>{if(call===1)return new Promise(resolve=>{release=resolve;});
      expect(JSON.parse(request.messages[1].content).html).toContain('原标题');return structuredClone(valid);});
    const pending=analyzeScreenModification(fake.engine,input);
    input.html='<main>外部改变</main>';input.protectedNids.push('title');input.workflowContract.target!.baselineFingerprint='changed';
    input.designSystem.tokens=structuredClone(defaultTheme.tokens);
    release({invalid:true});const result=await pending;
    expect(result.items[0].scope).toBe('local');expect(result.evidence?.baselineFingerprint).not.toBe('changed');
    expect(result.evidence?.context.designSystem.tokenFingerprint).toBeTruthy();expect(JSON.stringify(result.evidence)).not.toContain('原标题');
    expect(buildModificationReviewReceipt(result,['suggestion-1'],'',target).selectedIds).toEqual(['suggestion-1']);
  });
  test('不安全局部建议降级有实际原因，纯润色拒绝区块结构授权',async()=>{
    const fake=core(()=>({...valid,items:[{...valid.items[0],operations:[{nid:'missing',type:'add_classes',value:'font-bold'}]}]}));
    const result=await analyzeScreenModification(fake.engine,options());
    expect(result.items[0].scope).toBe('page');expect(result.evidence?.downgrades[0].reason).toBeTruthy();
    const region=core(()=>({...valid,items:[{...valid.items[0],scope:'region',targetNids:['title'],operations:[]}]}));
    const pure=await analyzeScreenModification(region.engine,{...options(),allowText:false});
    expect(pure.items[0].scope).toBe('page');expect(pure.evidence?.downgrades[0].reason).toContain('纯润色');
  });
  test('确认核对建议内容/基线/计划/尝试证据，拒绝未知或重复选择，回执冻结',async()=>{
    const result=await analyzeScreenModification(core(()=>structuredClone(valid)).engine,options());
    const receipt=buildModificationReviewReceipt(result,['suggestion-1'],'保留配色',target);
    result.items[0].title='后来改变';expect(receipt.analysis.items[0].title).toBe('标题加粗');
    expect(()=>buildModificationReviewReceipt(result,['suggestion-1'],'',target)).toThrow('分析证据');
    const original=receipt.analysis;
    expect(()=>buildModificationReviewReceipt(original,['unknown'],'补充',target)).toThrow('未知');
    expect(()=>buildModificationReviewReceipt(original,['suggestion-1','suggestion-1'],'',target)).toThrow('重复');
    expect(()=>buildModificationReviewReceipt(original,[], ' ',target)).toThrow('至少');
    expect(buildModificationReviewReceipt(original,[],'只改间距',target).selectedIds).toEqual([]);
    expect(()=>buildModificationReviewReceipt(original,['suggestion-1'],'',{...target,htmlContent:'changed'})).toThrow('分析证据');
    const corrupt=structuredClone(original);corrupt.evidence.attempts=3;
    expect(()=>buildModificationReviewReceipt(corrupt,['suggestion-1'],'',target)).toThrow('分析证据');
    corrupt.evidence.attempts=1;corrupt.evidence.workflow.checks[0].status='blocked';
    expect(()=>buildModificationReviewReceipt(corrupt,['suggestion-1'],'',target)).toThrow('分析证据');
  });
});

for(const custom of [false,true])test(`移动导航分析操作域与实际执行域一致，原始合同仍可确认（custom=${custom}）`,async()=>{
  const input=options();
  input.html='<div class="status-bar" data-nid="status">9:41</div><nav class="appbar" data-nid="nav"><span data-nid="navtitle" class="appbar-title">页面标题</span></nav>'+html;
  input.workflowContract.target!.baselineFingerprint=(await import('../src/services/ai/designWorkflow')).contentFingerprint(input.html);
  const fake=core((_,request)=>{const source=JSON.parse(request.messages[1].content).html;expect(source).not.toContain('9:41');expect(source.includes('navtitle')).toBe(custom);return structuredClone(valid);});
  const result=await analyzeScreenModification(fake.engine,{...input,useCustomNavigation:custom});
  expect(result.elementCount).toBe(custom?21:19);
  expect(buildModificationReviewReceipt(result,['suggestion-1'],'',{...target,htmlContent:input.html}).analysis.evidence.targetId).toBe('page');
});
