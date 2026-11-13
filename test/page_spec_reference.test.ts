import {expect,test} from 'bun:test';
import {aiChatDesignPrompt} from './fixtures/aiChatDesignPrompt';
import {resolveScreenReferences} from '../src/services/ai/screenReferenceResolver';
import {resolveGenerationTarget} from '../src/services/ai/generationTargetResolver';
import {resolveMentions} from '../src/services/ai/engine/context/mentionResolver';
import {enrichContext} from '../src/services/ai/engine/context/contextEnricher';
import {PipelineExecutor} from '../src/services/ai/engine/pipeline/executor';
import {DefaultAIEngineCore} from '../src/services/ai/engine/core/aiEngineCore';
import {MockTransport} from '../src/services/ai/engine/transport/mockTransport';
const screens={home:{id:'home',name:'仪表盘主页',htmlContent:'<main><h1>保留仪表盘原页</h1></main>'},analysis:{id:'analysis',name:'AI 决策分析',htmlContent:'<main><h1>保留分析原页</h1></main>'},chat:{id:'chat',name:'AI 决策对话页',htmlContent:'<main><h1>保留对话原页</h1></main>'},detail:{id:'detail',name:'订单详情 Order Detail',htmlContent:'<main><h1>保留订单原页</h1></main>'}};
test('exact user specification creates a new page, without treating UI captions or the page heading as old-page references',()=>{
 const before=JSON.stringify(screens),refs=resolveScreenReferences(aiChatDesignPrompt,screens);
 expect(refs).toEqual({ids:[],mentionIds:[],unmatchedNames:[],ambiguousNames:[]});
 const target=resolveGenerationTarget({rawPrompt:aiChatDesignPrompt,screens,activeScreenId:'home'});expect(target.action).toBe('create_screen');expect(target.targetScreenId).toBeNull();
 expect(resolveMentions(aiChatDesignPrompt,screens).referencedScreens).toEqual([]);expect(JSON.stringify(screens)).toBe(before);
});
for(const [opening,closing] of [['"','"'],['“','”'],['「','」'],['『','』'],['《','》']])test(`UI copy ending in 分析 is data; genuine ${opening}…${closing} page references still resolve`,()=>{
 const prompt=`中间显示当前会话标题${opening}AI 决策分析${closing}，按钮文案${opening}继续分析${closing}。`;
 expect(resolveScreenReferences(prompt,{}).unmatchedNames).toEqual([]);
 expect(resolveScreenReferences(`参考页面${opening}订单详情 Order Detail${closing}，创建新页面`,screens).ids).toEqual(['detail']);
 expect(resolveScreenReferences(`参考 @${opening}订单详情 Order Detail${closing}`,screens).mentionIds).toEqual(['detail']);
 expect(resolveGenerationTarget({rawPrompt:`参考页面${opening}不存在的页${closing}，创建新页面`,screens}).action).toBe('needs_reference');
});
test('plain-text and bold page-spec headings retain the same safe creation behavior',()=>{
 for(const prompt of [aiChatDesignPrompt.replace(/^## /,''),aiChatDesignPrompt.replace(/^## (.*)/,'**$1**')])expect(resolveGenerationTarget({rawPrompt:prompt,screens,activeScreenId:'home'})).toMatchObject({action:'create_screen',targetScreenId:null});
});
test('quotation boundaries do not bridge lines or reinterpret escaped/nested closing quotes',()=>{
 for(const prompt of ['标题"AI 决策分析"，说明\n下一行"按钮"。','标题"AI \\"决策\\" 分析"，按钮"发送"。','标题“AI「决策分析」”，按钮“发送”。']){
  expect(resolveScreenReferences(prompt,{}).unmatchedNames).toEqual([]);
 }
});
test('genuine reference with missing closing quotes remains blocked without capturing the next line',()=>{
 for(const prompt of ['参考页面"缺少结束引号\n"下一行的文案"','参考页面“订单详情 Order Detail','@"订单详情 Order Detail']){
  const refs=resolveScreenReferences(prompt,screens);expect(refs.unmatchedNames).toEqual(['页名引号未闭合，请补全后重试']);expect(resolveGenerationTarget({rawPrompt:prompt,screens,activeScreenId:'home'}).action).toBe('needs_reference');
 }
});
test('page specs retain explicit mentions, reference verbs, toggle and modification intent',()=>{
 for(const prefix of ['参考页面"订单详情 Order Detail"\n','参考订单详情 Order Detail，\n','@detail\n']){
  const target=resolveGenerationTarget({rawPrompt:prefix+aiChatDesignPrompt,screens});expect(target.action).toBe('modify_screen');expect(target.targetScreenId).toBe('detail');
 }
 for(const suffix of ['请修改订单详情 Order Detail的按钮','请修改页面“订单详情 Order Detail”的按钮','把“订单详情 Order Detail”的按钮改大'])expect(resolveGenerationTarget({rawPrompt:aiChatDesignPrompt+'\n'+suffix,screens})).toMatchObject({action:'modify_screen',targetScreenId:'detail'});
 expect(resolveGenerationTarget({rawPrompt:aiChatDesignPrompt,screens,referenceToggleScreenId:'home'})).toMatchObject({action:'modify_screen',targetScreenId:'home'});
 expect(resolveGenerationTarget({rawPrompt:'修改当前页面，按以下规格调整：\n'+aiChatDesignPrompt,screens,activeScreenId:'home'})).toMatchObject({action:'modify_screen',targetScreenId:'home'});
 for(const prompt of ['@missing\n'+aiChatDesignPrompt,aiChatDesignPrompt+'\n参考页面"不存在的页"'])expect(resolveGenerationTarget({rawPrompt:prompt,screens,activeScreenId:'home'}).action).toBe('needs_reference');
 const duplicate={...screens,copy:{...screens.detail,id:'copy'}};
 expect(resolveGenerationTarget({rawPrompt:'参考页面"订单详情 Order Detail"\n'+aiChatDesignPrompt,screens:duplicate}).action).toBe('needs_reference');
});
test('the original design specification survives context enrichment without bogus references',()=>{
 const context=enrichContext({rawPrompt:aiChatDesignPrompt,intent:'create_screen',activeScreenId:'home',targetScreenOverride:{id:null},screens,deviceProfile:'mobile',frameWidth:390,baseSystemPrompt:'Test'});
 expect(context.referenceErrors).toEqual([]);expect(context.referencedScreens).toEqual([]);expect(context.targetScreen).toBeUndefined();expect(context.messages.at(-1)?.content).toContain(aiChatDesignPrompt);
});
test('real pipeline proceeds to a single page request and leaves all existing pages unchanged',async()=>{
 const transport=new MockTransport(),requests:any[]=[],before=JSON.stringify(screens);
 transport.queueResponse('<artifact title="AI 决策对话页"><main class="p-4"><h1>AI 决策分析</h1><p>这里显示决策建议</p><button class="btn btn-primary">发送消息</button></main></artifact>');
 const core=new DefaultAIEngineCore({id:'fixture',stream:(request,event)=>{requests.push(request);return transport.stream(request,event);}});
 const output=await PipelineExecutor.execute({input:{rawPrompt:aiChatDesignPrompt,activeScreenId:'home'},provider:{id:'fixture',name:'fixture',protocol:'openai_compatible',baseUrl:'https://example.invalid',apiKey:''},model:'fixture',engineCore:core,screens,deviceProfile:'mobile',frameWidth:390,baseSystemPrompt:'Test'});
 expect(output.status).toBe('applied');expect(requests).toHaveLength(1);expect(output.changeSet?.screens?.[0]?.action).toBe('created');expect(JSON.stringify(screens)).toBe(before);expect(requests[0].messages.at(-1).content).toContain(aiChatDesignPrompt);
});
