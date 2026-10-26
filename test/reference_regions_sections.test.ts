import {expect,test} from 'bun:test';
import {parseSectionPlan,mergeSectionParts,generateSectionedPage} from '../src/services/ai/sectionedGeneration';
import {streamWithContinuation} from '../src/services/ai/boundedContinuation';
import {validReferenceRegion} from '../src/types/referenceImage';
import {referenceImageIdentity} from '../src/services/ai/workflowSources';
import {buildDesignTaskContract} from '../src/services/ai/designWorkflow';
import {PipelineExecutor} from '../src/services/ai/engine/pipeline/executor';
import {defaultProviders} from '../src/stores/useAIConfigStore';
import {defaultTheme} from '../src/utils/themePresets';
import type {StreamTextOptions,AIEngineCore} from '../src/services/ai/engine/core/types';
const provider=defaultProviders[0];
const plan=()=>({title:'会员中心',shellHtml:'<main class="container-max col gap-4 p-4"><h1 class="text-xl">会员中心</h1><section data-design-slot="section-1" class="card p-4"></section><section data-design-slot="section-2" class="card p-4"></section></main>',sections:[{id:'section-1',name:'推荐',requirements:'展示会员推荐'},{id:'section-2',name:'权益',requirements:'展示会员权益及查看按钮'}]});
function fake(response:(o:StreamTextOptions,n:number)=>{text:string;finish?:string}){const calls:StreamTextOptions[]=[];const core:AIEngineCore={streamText(o){calls.push(o);const r=response(o,calls.length);return {textStream:(async function*(){yield r.text;})(),reasoningStream:(async function*(){})(),textPromise:Promise.resolve(r.text),reasoningPromise:Promise.resolve(undefined),usagePromise:Promise.resolve({inputTokens:2,outputTokens:3}),finishReasonPromise:Promise.resolve(r.finish??'stop'),abort(){}};},async generateObject(){throw Error('unused');}};return {core,calls};}
const options={provider,model:'fixture',messages:[{role:'user' as const,content:'设计会员中心'}]};
const section=(text='查看权益')=>`<artifact><button class="btn btn-primary">${text}</button></artifact>`;

test('参考区域身份严格校验且合同不携带原图二进制',()=>{
 const region={sourceFingerprint:'abcdef01',sourceWidth:100,sourceHeight:80,x:10,y:20,width:40,height:30};
 expect(validReferenceRegion(region)).toBe(true);
 for(const patch of [{x:-1},{width:0},{height:7},{x:90},{width:1.5},{sourceFingerprint:'bad'},{width:4000,height:5000,sourceWidth:5000,sourceHeight:6000}])expect(validReferenceRegion({...region,...patch})).toBe(false);
 const image=referenceImageIdentity({name:'界面.png',dataUrl:'data:image/png;base64,YQ==',region});
 const task=buildDesignTaskContract({intent:'create_screen',request:'按图设计',deviceProfile:'pc',frameWidth:1440,referenceImage:image});
 expect(task.referenceImage?.region).toEqual(region);expect(JSON.stringify(task)).not.toContain('data:image');
 expect(()=>referenceImageIdentity({name:'x',dataUrl:'data:image/png;base64,YQ==',region:{...region,x:100}})).toThrow('选区');
});
test('公共骨架插槽严格解析，未知/嵌套/非空/重复/不安全拒绝',()=>{
 const p=parseSectionPlan(plan());expect(p.shellHtml).toContain('data-nid');
 for(const shellHtml of ['<main><section data-design-slot="section-1"></section></main>','<main><section data-design-slot="section-1"><section data-design-slot="section-2"></section></section></main>','<main><section data-design-slot="section-1">未完成</section><section data-design-slot="section-2"></section></main>','<main><button data-design-slot="section-1"></button><section data-design-slot="section-2"></section></main>',plan().shellHtml+'<script>alert(1)</script>'])expect(()=>parseSectionPlan({...plan(),shellHtml})).toThrow();
 expect(()=>parseSectionPlan({...plan(),sections:[plan().sections[0],plan().sections[0]]})).toThrow();
});
test('受控合并保留公共结构，只产生一个完整页，破损/样式/其它插槽/nid冲突拒绝',()=>{
 const p=parseSectionPlan(plan());const html=mergeSectionParts(p,[{id:'section-1',html:'<p>推荐会员</p>'},{id:'section-2',html:'<button class="btn">查看权益</button>'}]);
 expect(html).toContain('推荐会员');expect(html).toContain('查看权益');expect(html).not.toContain('data-design-slot');expect(new DOMParser().parseFromString(html,'text/html').querySelectorAll('main')).toHaveLength(1);
 for(const part of ['<div>未闭合','<style>.x{color:red}</style><p>文字</p>','<section data-design-slot="other"></section>','<p onclick="alert(1)">X</p>'])expect(()=>mergeSectionParts(p,[{id:'section-1',html:part}],false)).toThrow();
 const nid=new DOMParser().parseFromString(p.shellHtml,'text/html').querySelector('main')!.getAttribute('data-nid');
 expect(()=>mergeSectionParts(p,[{id:'section-1',html:`<p data-nid="${nid}">重复</p>`}],false)).toThrow('冲突');
 expect(()=>mergeSectionParts(p,[{id:'section-1',html:'<p>一</p>'}])).toThrow('半页');
});
test('计划后逐块请求，不发送已完成兄弟HTML，真实用量与预算分步记录',async()=>{
 const f=fake((o,n)=>({text:n===1?JSON.stringify(plan()):section(n===2?'推荐独特内容':'查看权益')}));
 const r=await generateSectionedPage(f.core,options,'context');expect(r.errorMessage).toBeUndefined();expect(f.calls).toHaveLength(3);expect(r.sectioned?.completed).toBe(2);expect(r.requestedOutputTokens).toBe(12288);expect(r.usage).toEqual({inputTokens:6,outputTokens:9});
 expect(f.calls[2].messages.at(-1)?.content).not.toContain('推荐独特内容');expect(r.rawResponse).toContain('推荐独特内容');expect(r.rawResponse).toContain('查看权益');expect(r.rawResponse).not.toContain('data-design-slot');
});
test('区块失败继续不重做已完成部分；过期、篡改或换模型在请求前拒绝',async()=>{
 const f=fake((_o,n)=>({text:n===1?JSON.stringify(plan()):n===2?section('第一块已完成'):n===3?'<artifact><style>.x{}</style><p>违规样式</p></artifact>':section('第二块恢复')}));
 const first=await generateSectionedPage(f.core,options,'context');expect(first.sectionedCheckpoint?.completed).toHaveLength(1);expect(first.rawResponse).toBe('');
 for(const change of [{contextKey:'other'},{fingerprint:'bad'},{bindingKey:'bad'}]){
  const bad=await generateSectionedPage(f.core,options,'context',{resume:{...first.sectionedCheckpoint!,...change}});expect(bad.errorMessage).toBeTruthy();
 }
 expect(f.calls).toHaveLength(3);
 const next=await generateSectionedPage(f.core,options,'context',{resume:first.sectionedCheckpoint});expect(next.errorMessage).toBeUndefined();expect(f.calls).toHaveLength(4);expect(f.calls[3].messages.at(-1)?.content).toContain('section-2');expect(next.rawResponse).toContain('第一块已完成');expect(next.rawResponse).toContain('第二块恢复');
});
test('小预算只允许一次有界续写；分区过滤/取消/闭合但length不假成功',async()=>{
 const f=fake((o,n)=>({text:n===1?'<artifact><main>':o.messages.at(-1)!.content.match(/TAUDESIGN_CONTINUE_[\w-]+/)![0]+'\n<p>仍未结束</p>',finish:'length'}));
 const r=await streamWithContinuation(f.core,{...options,maxTokens:4096},{budget:{maxRequestedTokens:8192,continuationTokens:4096,autoContinuations:1}});expect(f.calls).toHaveLength(2);expect(r.requestedOutputTokens).toBe(8192);expect(f.calls.every(c=>c.maxTokens===4096)).toBe(true);
 const closed=fake((_o,n)=>({text:n===1?JSON.stringify(plan()):section(),finish:n===1?'stop':'length'}));
 expect((await generateSectionedPage(closed.core,options,'c')).errorMessage).toContain('上限');
 const filtered=fake((_o,n)=>({text:n===1?JSON.stringify(plan()):'',finish:n===1?'stop':'content_filter'}));expect((await generateSectionedPage(filtered.core,options,'c')).sectionedCheckpoint).toBeUndefined();
 const controller=new AbortController();controller.abort();const empty=fake(()=>({text:'unused'}));expect((await generateSectionedPage(empty.core,{...options,signal:controller.signal},'c')).sectionedCheckpoint).toBeUndefined();expect(empty.calls).toHaveLength(0);
});
test('同页模式走统一Pipeline，记录分步来源；旧页/多页需求在模型调用前拒绝',async()=>{
 const f=fake((_o,n)=>({text:n===1?JSON.stringify(plan()):section()}));
 const p={input:{rawPrompt:'新建一个会员中心页面',activeScreenId:null,decision:{intent:'create_screen' as const,targetScreenId:null,reason:'fixture'}},provider,model:'fixture',engineCore:f.core,screens:{},deviceProfile:'pc' as const,frameWidth:1440,baseSystemPrompt:'设计页面',designSystem:defaultTheme,sectioned:{}};
 const r=await PipelineExecutor.execute(p);expect(r.status).toBe('applied');expect(r.executionRecord?.source).toBe('sectioned-model');expect(r.executionRecord?.rawResponse).toBe('');expect(r.executionRecord?.sectioned?.requests).toHaveLength(3);
 expect((await PipelineExecutor.execute({...p,input:{...p.input,decision:{intent:'modify_screen',targetScreenId:'old',reason:'fixture'}}})).status).toBe('error');
 expect((await PipelineExecutor.execute({...p,input:{...p.input,rawPrompt:'创建两个页面'}})).status).toBe('error');expect(f.calls).toHaveLength(3);
});

test('六块达到批次32768预算时保留进度，继续从当前区块前缀开始且不重新规划',async()=>{
 const six={title:'长首页',shellHtml:'<main class="container-max col gap-4">'+Array.from({length:6},(_,i)=>`<section data-design-slot="section-${i+1}"></section>`).join('')+'</main>',sections:Array.from({length:6},(_,i)=>({id:`section-${i+1}`,name:`区块${i+1}`,requirements:`展示第${i+1}区块`}))};
 const f=fake((o,n)=>{
  if(n===1)return {text:JSON.stringify(six)};
  const last=o.messages.at(-1)!.content,marker=last.match(/TAUDESIGN_CONTINUE_[\w-]+/)?.[0];
  if(marker)return {text:marker+'\n</p></article></artifact>'};
  const section=JSON.parse(last.split('当前区块：')[1].split('\n')[0]);return {text:`<artifact><article class="card p-4"><p>${section.id}的业务内容`,finish:'length'};
 });
 const first=await generateSectionedPage(f.core,options,'c');expect(first.requestedOutputTokens).toBe(32768);expect(first.sectionedCheckpoint?.completed).toHaveLength(3);expect(f.calls).toHaveLength(8);expect(first.rawResponse).toBe('');
 const stable=first.sectionedCheckpoint!.completed[0].html;
 const next=await generateSectionedPage(f.core,options,'c',{resume:first.sectionedCheckpoint});expect(next.errorMessage).toBeUndefined();expect(next.requestedOutputTokens).toBeLessThanOrEqual(32768);expect(f.calls.filter(c=>!!c.jsonSchema)).toHaveLength(1);expect(f.calls).toHaveLength(13);expect(next.rawResponse).toContain(stable);expect(next.rawResponse).toContain('section-6的业务内容');
});
test('生成中上下文改变立即停下，不发后续请求或提供旧检查点',async()=>{
 let current=true;const f=fake((_o,n)=>{if(n===2)current=false;return {text:n===1?JSON.stringify(plan()):section()};});
 const r=await generateSectionedPage(f.core,options,'c',{isCurrent:()=>current});expect(f.calls).toHaveLength(2);expect(r.errorMessage).toContain('上下文已变化');expect(r.sectionedCheckpoint).toBeUndefined();expect(r.rawResponse).toBe('');
});
