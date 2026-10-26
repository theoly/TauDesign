import { expect, test } from 'bun:test';
import { resolveGenerationTarget } from '../src/services/ai/generationTargetResolver';
import { resolveMentions } from '../src/services/ai/engine/context/mentionResolver';
import { PipelineExecutor } from '../src/services/ai/engine/pipeline/executor';
import type { AIEngineCore, StreamTextOptions } from '../src/services/ai/engine/core/types';
import { enforceBudgetGuard } from '../src/services/ai/engine/context/budgetGuard';
import { buildPageReferenceSnapshot } from '../src/services/ai/engine/context/pageReferenceContext';
import { enrichContext } from '../src/services/ai/engine/context/contextEnricher';
import { buildConversationContext } from '../src/services/ai/engine/context/conversationContext';
const screens={source:{id:'source',name:'订单管理 Order Detail',htmlContent:'<!doctype html><html><head><style>.original-panel{background:var(--color-surface);border-radius:18px}</style></head><body><main data-nid="source-root" class="original-panel"><h1>原订单业务完整标题</h1><form><label>联系电话</label><input name="phone" required><button data-nid="submit">确认并提交订单</button></form><a href="/orders">返回订单列表</a></main></body></html>',scopedCss:'.original-panel{box-shadow:0 4px 16px #12345620}'},other:{id:'other',name:'其他页面',htmlContent:'<main>不可作为参考的页面</main>'}};
const provider={id:'mock',name:'Mock',protocol:'openai_compatible' as const,baseUrl:'https://example.invalid',apiKey:'test',enabled:true,models:[]};
function recorder(){const calls:StreamTextOptions[]=[];const text='<artifact identifier="screen_new" type="screen" title="订单详情"><main class="container-max"><h1>订单详情</h1><button class="btn-primary">查看订单</button></main></artifact>';const core:AIEngineCore={streamText(options){calls.push(options);return {textStream:(async function*(){yield text;})(),reasoningStream:(async function*(){})(),textPromise:Promise.resolve(text),reasoningPromise:Promise.resolve(undefined),usagePromise:Promise.resolve(undefined),abort(){}};},async generateObject(){throw Error('not expected');}};return {calls,core};}

test('plain page name and parameterized create phrase create a new page rather than modifying source',()=>{
 const decision=resolveGenerationTarget({rawPrompt:'参考订单管理 Order Detail，创建一个订单详情页',screens,activeScreenId:'other'});
 expect(decision.action).toBe('create_screen');expect(decision.targetScreenId).toBeNull();expect(decision.styleReferenceScreenId).toBe('source');
});
test('known names with spaces, punctuation and IDs resolve precisely instead of fuzzy matching',()=>{
 for(const prompt of ['参考 @订单管理 Order Detail，创建新页面','参考 @source，创建新页面','参考订单管理 Order Detail，创建新页面']){
 const refs=resolveMentions(prompt,screens);expect(refs.referencedScreens.map(r=>r.id)).toEqual(['source']);expect(refs.unmatchedMentions).toHaveLength(0);}
});
test('ambiguous and unknown explicit references stop without binding unrelated active page',()=>{
 const duplicate={...screens,copy:{...screens.source,id:'copy'}};
 expect(resolveGenerationTarget({rawPrompt:'参考订单管理 Order Detail，创建新页面',screens:duplicate,activeScreenId:'other'}).action).toBe('needs_reference');
 expect(resolveGenerationTarget({rawPrompt:'参考 @不存在的页面，创建新页面',screens,activeScreenId:'other'}).action).toBe('needs_reference');
 expect(resolveGenerationTarget({rawPrompt:'参考页面“找不到的页面”，创建新页面',screens,activeScreenId:'other'}).action).toBe('needs_reference');
 expect(resolveGenerationTarget({rawPrompt:'参考 @copy，创建新页面',screens:duplicate}).styleReferenceScreenId).toBe('copy');
});
test('read-only analysis by page name is a question, never implicit modification',()=>{
 const d=resolveGenerationTarget({rawPrompt:'分析订单管理 Order Detail的字段和操作逻辑',screens});expect(d.action).toBe('question');expect(d.targetScreenId).toBeNull();expect(d.styleReferenceScreenId).toBe('source');
});
test('actual engine request receives named source HTML, scoped CSS, L4 and business analysis',async()=>{
 const {calls,core}=recorder();const before=JSON.stringify(screens);
 const output=await PipelineExecutor.execute({input:{rawPrompt:'参考订单管理 Order Detail，创建新页面',activeScreenId:null,decision:{intent:'create_screen',targetScreenId:null,styleReferenceScreenId:'source',reason:'test'}},engineCore:core,provider,model:'mock',screens,overrides:{'source:submit':{nid:'submit',declarations:{'border-radius':'27px','background-color':'var(--color-primary)'}}},deviceProfile:'pc',frameWidth:1440,baseSystemPrompt:'Use the project design system.'});
 const prompt=calls[0].messages.map(m=>m.content).join('\n');
 expect(prompt).toContain('原订单业务完整标题');expect(prompt).toContain('确认并提交订单');expect(prompt).toContain('box-shadow:0 4px 16px');expect(prompt).toContain('27px');expect(prompt).toContain('phone');expect(prompt).toContain('业务结构分析');expect(prompt).toContain('只读参考');expect(prompt).toContain('screen_new');expect(prompt).not.toContain('不可作为参考的页面');expect(JSON.stringify(screens)).toBe(before);expect(output.changeSet?.screens?.[0]?.action).toBe('created');
});

test('oversized references preserve CSS and final L4, are bounded and report omissions without mutating source',()=>{
 const large={...screens.source,htmlContent:screens.source.htmlContent.replace('</main>', '<p>'+('业务内容'.repeat(10000))+'</p></main>'),scopedCss:'.theme-rule{padding:16px}'.repeat(1000)};
 const ref=buildPageReferenceSnapshot(large,{'source:submit':{nid:'submit',declarations:{'border-radius':'29px'}}});
 const original=JSON.stringify(ref);
 const result=enforceBudgetGuard({referencedScreens:Array.from({length:4},(_,i)=>({...ref,id:'ref'+i})),skeletonizeFn:v=>v});
 expect(result.isContextTrimmed).toBe(true);expect(result.warnings.length).toBeGreaterThan(0);
 expect(result.referencedScreens[0].styles).toContain('29px');expect(result.referencedScreens[0].styles).toContain('theme-rule');
 const size=result.referencedScreens.reduce((n,r)=>n+r.skeletonHtml.length+(r.styles?.length??0)+(r.analysis?.length??0),0);
 expect(size).toBeLessThanOrEqual(30000);expect(JSON.stringify(ref)).toBe(original);
 for(const r of result.referencedScreens)expect(r.skeletonHtml).toEndWith('</html>');
});
test('unknown explicit reference aborts before the engine is called',async()=>{
 const r=recorder();const output=await PipelineExecutor.execute({input:{rawPrompt:'参考 @不存在，创建新页面',activeScreenId:null},engineCore:r.core,provider,model:'mock',screens,deviceProfile:'pc',frameWidth:1440,baseSystemPrompt:'System'});
 expect(output.status).toBe('error');expect(output.errorMessage).toContain('未找到');expect(r.calls).toHaveLength(0);
});
test('read-only analysis receives page context and no artifact output contract',()=>{
 const result=enrichContext({rawPrompt:'分析订单管理 Order Detail的字段',intent:'question',activeScreenId:null,targetScreenOverride:{id:null},referenceScreenId:'source',screens,deviceProfile:'pc',frameWidth:1440,baseSystemPrompt:'System\n### OUTPUT CONTRACT\nMUST output artifact'});
 expect(result.messages[0].content).not.toContain('MUST output artifact');expect(result.messages[1].content).toContain('联系电话');expect(result.messages[1].content).not.toContain('必须且仅输出');
});
test('a complete mention name wins over a shorter matching ID and toggle resolves same-name ambiguity',()=>{
 const pages={...screens,named:{id:'named',name:'source detail',htmlContent:'<main>Named page</main>'},copy:{...screens.source,id:'copy'}};
 expect(resolveGenerationTarget({rawPrompt:'参考 @source detail，创建新页面',screens:pages}).styleReferenceScreenId).toBe('named');
 const context=enrichContext({rawPrompt:'参考订单管理 Order Detail，创建新页面',intent:'create_screen',activeScreenId:null,targetScreenOverride:{id:null},referenceScreenId:'copy',screens:pages,deviceProfile:'pc',frameWidth:1440,baseSystemPrompt:'System'});
 expect(context.referenceErrors).toHaveLength(0);expect(context.referencedScreens[0].id).toBe('copy');
});
test('creation requests phrased as a question still create, analysis followed by edit still modifies',()=>{
 expect(resolveGenerationTarget({rawPrompt:'参考订单管理 Order Detail，做一张新的详情页可以吗？',screens}).action).toBe('create_screen');
 expect(resolveGenerationTarget({rawPrompt:'分析订单管理 Order Detail并修改其中的按钮',screens}).action).toBe('modify_screen');
});
test('bounded conversation memory keeps prior requirements without replaying old generated HTML',async()=>{
 const history=buildConversationContext([{sender:'user',text:'新页面也需要显示订单编号'}, {sender:'assistant',text:'<artifact>'+('x'.repeat(10000))+'</artifact>',screenName:'订单管理',htmlOutput:'<main>old</main>'}]);
 expect(history.map(m=>m.content).join('')).toContain('订单编号');expect(history.map(m=>m.content).join('')).not.toContain('<artifact>');
 const r=recorder();await PipelineExecutor.execute({input:{rawPrompt:'参考订单管理 Order Detail，创建新页面',activeScreenId:null,decision:{intent:'create_screen',targetScreenId:null,styleReferenceScreenId:'source',reason:'test'}},engineCore:r.core,conversationHistory:history,provider,model:'mock',screens,deviceProfile:'pc',frameWidth:1440,baseSystemPrompt:'System'});
 expect(r.calls[0].messages[1]).toMatchObject({role:'user',content:'新页面也需要显示订单编号'});expect(r.calls[0].messages.at(-1)?.content).toContain('原订单业务完整标题');
});
