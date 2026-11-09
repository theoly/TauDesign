import {defaultPageComposition,parsePageComposition,buildCompositionShell,type PageComposition} from '../src/services/ai/pageComposition';
import {test,expect} from 'bun:test';
import {compileTraeSectionPlan,generateTraePage} from '../src/services/ai/traePageGeneration';
import {choosePageWriteStrategy} from '../src/services/ai/generationStrategy';
import {DefaultAIEngineCore} from '../src/services/ai/engine/core/aiEngineCore';
import {MockTransport} from '../src/services/ai/engine/transport/mockTransport';
import {TaskBudget,withTaskBudget} from '../src/services/ai/taskBudget';
import type {PageTaskPlan} from '../src/services/ai/pageTaskPlan';
import type {AIProviderConfig} from '../src/types/provider';
const provider:AIProviderConfig={id:'trae-test',name:'test',protocol:'openai_compatible',baseUrl:'https://example.test/v1',apiKey:'',isEnabled:true};
const plan=(count:number):PageTaskPlan=>({goal:'工作台',actor:'用户',completion:['可读'],questions:[],features:Array.from({length:count},(_,i)=>({id:`f${i+1}`,title:`功能${i+1}`,change:'add',basis:'user',sourceIds:['user:request'],information:[{label:`完整内容${i+1}`,kind:'display'}],interactions:[],states:[]}))});
const budget=()=>new TaskBudget({maxRequests:14,maxRequestedOutputTokens:34568,maxDurationMs:10000,maxRequestDurationMs:10000});
test('seven semantic features compile into three non-nested program slots, each feature owned once',()=>{
 const p=compileTraeSectionPlan(plan(7),'pc','工作台');expect(p.version).toBe(2);expect(p.sections).toHaveLength(3);
 const all=p.sections.flatMap(s=>JSON.parse(s.requirements).features.map((f:any)=>f.id));expect(all).toEqual(['f1','f2','f3','f4','f5','f6','f7']);
 const d=new DOMParser().parseFromString(p.shellHtml,'text/html');expect(d.querySelectorAll('[data-design-slot]')).toHaveLength(3);expect(d.querySelector('[data-design-slot] [data-design-slot]')).toBeNull();
});
test('SectionedPatch makes only three body calls without asking the model to create shellHtml',async()=>{
 const transport=new MockTransport();for(let i=1;i<=3;i++)transport.queueResponse(`<artifact type="screen"><article data-nid="part000${i}">完整内容${i}</article></artifact>`,1);
 const ledger=budget(),p=plan(7),strategy=choosePageWriteStrategy({plan:p,estimatedHtmlBytes:100});const calls:any[]=[];
 const real=withTaskBudget(new DefaultAIEngineCore(transport),ledger);const core={...real,streamText(o:any){calls.push(o);return real.streamText(o);}};
 const result=await generateTraePage(core,{provider,model:'test',messages:[{role:'system',content:'只用Token'},{role:'user',content:'设计工作台'}]}, {strategy,plan:p,composition:defaultPageComposition(p),device:'pc',title:'工作台',contextKey:'one',budget:ledger});
 expect(result.errorMessage).toBeUndefined();expect(calls).toHaveLength(3);expect(ledger.snapshot().requests).toBe(3);expect(result.sectioned?.total).toBe(3);expect(result.rawResponse).not.toContain('data-design-slot');
 expect(new DOMParser().parseFromString(result.rawResponse,'text/html').querySelectorAll('article')).toHaveLength(3);ledger.close();
});
test('atomic main preserves authored main attributes and does not silently drop extra text',async()=>{
 const transport=new MockTransport();transport.queueResponse('<artifact type="screen" title="工作台"><main class="col gap-4" data-nid="main0001"><h1>完整标题</h1></main></artifact>',1);
 const ledger=budget(),p=plan(4),result=await generateTraePage(withTaskBudget(new DefaultAIEngineCore(transport),ledger),{provider,model:'test',messages:[{role:'user',content:'design'}]}, {strategy:choosePageWriteStrategy({plan:p,estimatedHtmlBytes:100}),plan:p,device:'pc',title:'工作台',contextKey:'two',budget:ledger});
 expect(result.rawResponse).toContain('col gap-4 container-max');expect(result.rawResponse).toContain('main0001');expect(result.rawResponse).toContain('完整标题');expect(ledger.snapshot().requests).toBe(1);ledger.close();
});
test('embedded media and full head rewrite cannot pass the body writer',async()=>{
 for(const body of ['<img src="data:image/png;base64,YQ==">','<html><head><style>body{color:red}</style></head><body>内容</body></html>']){
  const t=new MockTransport();t.queueResponse(`<artifact type="screen">${body}</artifact>`,1);const ledger=budget(),p=plan(1);
  try{const r=await generateTraePage(withTaskBudget(new DefaultAIEngineCore(t),ledger),{provider,model:'test',messages:[{role:'user',content:'design'}]},{strategy:choosePageWriteStrategy({plan:p,estimatedHtmlBytes:1}),plan:p,device:'mobile',title:'test',contextKey:'bad',budget:ledger});expect(r.errorMessage).toMatch(/head|媒体/);}catch(error){expect(String(error)).toContain('媒体');}finally{ledger.close();}
 }
});
test('layout ownership supports PC sidebar/full-width header and mobile footer without model shell HTML',()=>{
 const p=plan(7),pc:PageComposition={version:1,layout:'sidebar-main',footer:'flow',regions:[{id:'section-1',role:'header',featureIds:['f1']},{id:'section-2',role:'sidebar',featureIds:['f2']},{id:'section-3',role:'main',featureIds:['f3','f4','f5','f6','f7']}]};
 const parsed=compileTraeSectionPlan(p,'pc','工作台',pc),doc=new DOMParser().parseFromString(parsed.shellHtml,'text/html');
 expect(doc.querySelectorAll('[data-design-slot]')).toHaveLength(3);expect(doc.querySelector('header')?.parentElement).toBe(doc.querySelector('main')?.parentElement);expect(doc.querySelector('main.row > aside')).not.toBeNull();expect(doc.querySelector('main.row > section.flex-1')).not.toBeNull();
 const mobile:PageComposition={version:1,layout:'flow',footer:'cta',regions:[{id:'section-1',role:'main',featureIds:['f1','f2','f3','f4','f5','f6']},{id:'section-2',role:'footer',featureIds:['f7']}]};
 expect(buildCompositionShell(parsePageComposition(mobile,p,'mobile'),'mobile')).toContain('cta-fixed');
 expect(()=>parsePageComposition(pc,p,'mobile')).toThrow('单列');
 expect(()=>parsePageComposition({...pc,regions:[...pc.regions,{id:'section-4',role:'footer',featureIds:['f7']}]},p,'pc')).toThrow('1–3');
 expect(()=>parsePageComposition({...mobile,regions:mobile.regions.map(r=>({...r,featureIds:['f1']}))},p,'mobile')).toThrow('遗漏');
 expect(()=>parsePageComposition({...pc,shellHtml:'<main></main>'},p,'pc')).toThrow('公共壳');
});
test('actual section writer spends one bounded layout call and at most three region calls from the same ledger',async()=>{
 const p=plan(7),composition=defaultPageComposition(p),transport=new MockTransport();transport.queueResponse(JSON.stringify(composition),1);
 for(let i=1;i<=3;i++)transport.queueResponse(`<artifact type="screen"><article>完整内容${i}</article></artifact>`,1);
 const ledger=budget(),calls:any[]=[],real=withTaskBudget(new DefaultAIEngineCore(transport),ledger),core={...real,streamText(o:any){calls.push(o);return real.streamText(o);}};
 const result=await generateTraePage(core,{provider,model:'test',messages:[{role:'user',content:'原始\n多行要求',imageUrl:'data:image/png;base64,YQ=='}]}, {request:'原始\n多行要求',strategy:choosePageWriteStrategy({plan:p,estimatedHtmlBytes:100}),plan:p,device:'pc',title:'工作台',contextKey:'composition',budget:ledger,onRequest:messages=>{expect(messages.at(-1)?.imageUrl).toBe('data:image/png;base64,YQ==');expect(messages.at(-1)?.content).toContain('原始\n多行要求');}});
 expect(result.errorMessage).toBeUndefined();expect(calls).toHaveLength(4);expect(ledger.snapshot().requests).toBe(4);expect(calls[0].maxTokens).toBe(1024);expect(result.sectioned?.requests.map(r=>r.stage)).toEqual(['composition-plan','section-1','section-2','section-3']);
 expect(result.sectioned?.requestedOutputTokens).toBe(ledger.snapshot().requestedOutputTokens);ledger.close();
});
