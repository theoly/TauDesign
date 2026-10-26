import {expect,test} from 'bun:test';
import {checkGenerationQuality,qualitySummary} from '../src/services/ai/generationQuality';
import {makeFailedPageDraft,draftRepairTargets,repairDraftLabels,suggestDraftLabels} from '../src/services/ai/qualityDraft';
import {saveQualityDraft,loadQualityDrafts,claimDraftSuggestion,type SavedQualityDraft} from '../src/services/storage/qualityDraftRepository';
import {createProjectStorage} from '../src/services/storage/projectStorage';
import {PipelineExecutor} from '../src/services/ai/engine/pipeline/executor';
import {defaultProviders} from '../src/stores/useAIConfigStore';
import {defaultTheme} from '../src/utils/themePresets';
import type {AIEngineCore,StreamTextOptions} from '../src/services/ai/engine/core/types';
import {NidEngine} from '../src/utils/nidEngine';
const bad='<main class="container-max relative"><h1>会员中心</h1><button class="btn btn-primary absolute"><svg class="icon"><path d="M1 1L2 2"/></svg><span></span></button></main>';
function core(text:(o:StreamTextOptions)=>string,finish='stop') {const calls:StreamTextOptions[]=[];const value:AIEngineCore={streamText(o){calls.push(o);const raw=text(o);return {textStream:(async function*(){yield raw;})(),reasoningStream:(async function*(){})(),textPromise:Promise.resolve(raw),reasoningPromise:Promise.resolve(undefined),usagePromise:Promise.resolve({inputTokens:11,outputTokens:7}),finishReasonPromise:Promise.resolve(finish),abort(){}};},async generateObject(){throw Error('unused');}};return {value,calls};}
const draft=()=>makeFailedPageDraft(bad,'context','binding',{designSystem:defaultTheme})!;
function saved():SavedQualityDraft {return {version:1,id:`draft-${crypto.randomUUID()}`,projectId:`project-${crypto.randomUUID()}`,createdAt:Date.now(),draft:draft(),request:'设计会员中心',projectContext:'project-context',decision:{action:'create_screen',targetScreenId:null,styleReferenceScreenId:null,elementNid:null,referenceSource:null,reason:'test'},status:'blocked'};}

test('错误摘要不夹带警告；unknown class仍为警告且不会删除定位类',()=>{
 const q=checkGenerationQuality(bad);expect(q.passed).toBe(false);expect(q.findings.filter(f=>f.severity==='error')).toHaveLength(1);
 expect(qualitySummary(q)).toContain('主操作');expect(qualitySummary(q)).not.toContain('relative');
 const d=draft(),targets=draftRepairTargets(d);expect(targets).toHaveLength(1);expect(targets[0].nid).toBeTruthy();
 const html=repairDraftLabels(d,[{nid:targets[0].nid,text:'查看会员权益'}],{});
 expect(html).toContain('relative');expect(html).toContain('absolute');expect(html).toContain('<svg');expect(html).toContain('<span');expect(checkGenerationQuality(html).passed).toBe(true);
});
test('合法具名图标接受，缺失/重复命名引用和无图标空CTA拒绝，原文丢失不被ARIA掩盖',()=>{
 expect(checkGenerationQuality('<span id="caption">搜索</span><button class="btn-primary" aria-labelledby="caption"><svg/></button>').passed).toBe(true);
 for(const html of ['<button class="btn-primary" aria-labelledby="missing"><svg/></button>','<span id="a">A</span><span id="a">B</span><button class="btn-primary" aria-labelledby="a"><svg/></button>','<button class="btn-primary" aria-label="提交"></button>'])expect(checkGenerationQuality(html).passed).toBe(false);
 expect(checkGenerationQuality('<button data-nid="cta" class="btn-primary" aria-label="支付"><svg/></button>',{baselineHtml:'<button data-nid="cta" class="btn-primary">支付</button>'}).passed).toBe(false);
});
test('图标旁补文字保留子树；未知节点、空白、超长、保护节点、损坏和不安全源拒绝',()=>{
 const d=makeFailedPageDraft('<button class="btn-primary"><svg><path d="M0 0"/></svg></button>','c','b',{})!,target=draftRepairTargets(d)[0];
 const fixed=repairDraftLabels(d,[{nid:target.nid,text:'继续'}],{});expect(fixed).toContain('<path');expect(fixed).toContain('继续');
 for(const labels of [[{nid:'unknown',text:'X'}],[{nid:target.nid,text:''}],[{nid:target.nid,text:'X'.repeat(161)}]])expect(()=>repairDraftLabels(d,labels,{})).toThrow();
 expect(()=>repairDraftLabels(d,[{nid:target.nid,text:'继续'}],{protectedNids:[target.nid]})).toThrow('保护');
 expect(()=>repairDraftLabels({...d,html:d.html+'changed'},[{nid:target.nid,text:'继续'}],{})).toThrow('损坏');
 for(const html of ['<main><button>','<script>alert(1)</script>','<a href="javascript:alert(1)">X</a>'])expect(makeFailedPageDraft(html,'c','b',{})).toBeUndefined();
});
test('完整失败HTML与断流区分；Pipeline文本修复不调用整页模型且保持全量检查',async()=>{
 const f=core(()=>`<artifact title="会员中心">${bad}</artifact>`);
 const options={input:{rawPrompt:'新建一个会员中心页面',activeScreenId:null,decision:{intent:'create_screen' as const,targetScreenId:null,reason:'test'}},provider:defaultProviders[0],model:'test',engineCore:f.value,screens:{},deviceProfile:'pc' as const,frameWidth:1440,baseSystemPrompt:'设计页面',designSystem:defaultTheme};
 const first=await PipelineExecutor.execute(options);expect(first.status).toBe('rejected_by_quality');expect(first.failedDraft).toBeDefined();expect(first.extractedHtml).toBeUndefined();
 const target=draftRepairTargets(first.failedDraft!)[0],labels=[{nid:target.nid,text:'查看权益'}];
 const result=await PipelineExecutor.execute({...options,qualityRepair:{draft:first.failedDraft!,labels}});
 expect(result.status).toBe('applied');expect(f.calls).toHaveLength(1);expect(result.usage).toEqual({inputTokens:0,outputTokens:0});expect(result.executionRecord?.source).toBe('local-edit');expect(result.executionRecord?.draftRepair?.confirmedLabels).toEqual(labels);
 const stale=await PipelineExecutor.execute({...options,frameWidth:1500,qualityRepair:{draft:first.failedDraft!,labels}});expect(stale.status).toBe('error');expect(f.calls).toHaveLength(1);
 const cut=core(()=>'<artifact><main>');expect((await PipelineExecutor.execute({...options,engineCore:cut.value})).failedDraft).toBeUndefined();
});
test('独立保存重开，AI建议原子领取一次，旧记录不能重置；损坏文件不影响其它草稿',async()=>{
 const value=saved();await saveQualityDraft(value);expect((await loadQualityDrafts(value.projectId))[0].draft.html).toBe(value.draft.html);
 const claims=await Promise.all([claimDraftSuggestion(value),claimDraftSuggestion(value)]);expect(claims.filter(Boolean)).toHaveLength(1);
 await saveQualityDraft({...value,aiAttempted:false});expect((await loadQualityDrafts(value.projectId))[0].aiAttempted).toBe(true);
 const storage=createProjectStorage(value.projectId);await storage.writeTextAtomic('drafts/draft-corrupt.json','bad json');expect(await loadQualityDrafts(value.projectId)).toHaveLength(1);
 await saveQualityDraft({...value,status:'resolved'});expect(await loadQualityDrafts(value.projectId)).toHaveLength(0);
 await expect(saveQualityDraft({...value,draft:{...value.draft,html:'<script/>'}})).rejects.toThrow();
});
test('AI仅请求问题节点且不续写，建议需确认；上限/乱格式/超范围拒绝并保留用量',async()=>{
 const targets=draftRepairTargets(draft());const nid=targets[0].nid;
 const f=core(()=>JSON.stringify({labels:[{nid,text:'查看权益'}]}));const r=await suggestDraftLabels(f.value,{provider:defaultProviders[0],model:'test'},'设计会员中心',targets);
 expect(r.labels[0].text).toBe('查看权益');expect(f.calls).toHaveLength(1);expect(f.calls[0].maxTokens).toBe(1800);expect(f.calls[0].messages.at(-1)?.content).not.toContain('<h1>');
 for(const response of ['{}',JSON.stringify({labels:[{nid:'other',text:'支付'}]}),JSON.stringify({labels:[{nid,text:'查看'}],html:'changed'})]){
  const bad=core(()=>response);const result=await suggestDraftLabels(bad.value,{provider:defaultProviders[0],model:'test'},'请求',targets);expect(result.error).toBeTruthy();expect(result.usage?.outputTokens).toBe(7);
 }
 const limited=core(()=>JSON.stringify({labels:[{nid,text:'查看'}]}),'length');expect((await suggestDraftLabels(limited.value,{provider:defaultProviders[0],model:'test'},'请求',targets)).error).toBeTruthy();expect(limited.calls).toHaveLength(1);
});

test('草稿身份注入避开原有nid，损坏建议记录不能导致重开崩溃',async()=>{
 const generate=NidEngine.generateNid;let calls=0;
 try {
  NidEngine.generateNid=()=>++calls===1?'same':`new${calls}`;
  const d=makeFailedPageDraft('<main data-nid="same"><button class="btn-primary"></button></main>','c','b',{})!;
  expect(d.quality.findings.some(f=>f.code==='duplicate_nid')).toBe(false);expect(d.html).toContain('data-nid="new2"');
 }finally{NidEngine.generateNid=generate;}
 const value=saved(),storage=createProjectStorage(value.projectId);await storage.ensureDir('drafts');
 await storage.writeTextAtomic(`drafts/${value.id}.json`,JSON.stringify({...value,suggestions:'invalid'}));
 expect(await loadQualityDrafts(value.projectId)).toHaveLength(0);
});
