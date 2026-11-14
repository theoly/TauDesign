import {expect,test} from 'bun:test';
import {readFileSync} from 'node:fs';
import {requiresMultiPagePlan,requestedPageCount,requiresPageVariantPlan} from '../src/services/ai/multiPageContract';
import {pageSpecificationStart,pageCountRoutingText} from '../src/services/ai/pageRequestScope';
import {resolveGenerationTarget} from '../src/services/ai/generationTargetResolver';
import {enrichContext} from '../src/services/ai/engine/context/contextEnricher';
import {prepareMultiPagePlan} from '../src/services/ai/multiPageService';
import {useProjectStore} from '../src/stores/useProjectStore';

export const birthPrompt=readFileSync(new URL('./fixtures/starFateBirthPrompt.txt',import.meta.url),'utf8').trim();
const spec=(id:string)=>`## ${id} 示例页\n### 展示内容\n姓名和提交按钮。\n### 用户操作与结果\n提交后反馈。`;
const screens={birth:{id:'birth',name:'排盘资料录入',htmlContent:'<main>已有页面不能自动覆盖</main>'}};
for(const [name,prompt] of [
 ['完整原文',birthPrompt],
 ['转义Markdown',birthPrompt.replace(/([#*`|.\-])/g,'\\$1').split('\n').join('\\\n')],
 ['普通标题',birthPrompt.replace('## P08 排盘资料录入','P08 排盘资料录入')],
 ['中文页面标题',birthPrompt.replace('## P08 排盘资料录入','## 页面8：排盘资料录入')],
 ['同页多状态',birthPrompt+'\n请给本页正常、错误和计算中状态，不生成其他页面。'],
 ['显式否定批量',birthPrompt+'\n请按以下规范不要生成28个页面。'],
] as const)test(`单页规格忽略项目和材料页数：${name}`,()=>{
 const before=prompt;expect(requiresMultiPagePlan(prompt)).toBe(false);expect(requestedPageCount(prompt)).toBe(1);
 expect(pageSpecificationStart(prompt)).toBeGreaterThan(0);expect(requiresPageVariantPlan(prompt)).toBe(false);
 expect(resolveGenerationTarget({rawPrompt:prompt,screens,activeScreenId:'birth'}).action).toBe('create_screen');expect(prompt).toBe(before);
});
test('完整要求、关联页和全局限制保留在模型上下文中',()=>{
 const context=enrichContext({rawPrompt:birthPrompt,intent:'create_screen',activeScreenId:'birth',targetScreenOverride:{id:null},screens,deviceProfile:'mobile',frameWidth:390,baseSystemPrompt:'fixture'});
 expect(context.referenceErrors).toEqual([]);expect(context.targetScreen).toBeUndefined();expect(context.messages.at(-1)?.content).toContain(birthPrompt);
 for(const required of ['交付共28页','Offer_A.png共1页','批20页／会话40页','不填默认午时','P23目标页'])expect(context.messages.at(-1)?.content).toContain(required);
});
test('多个完整目标规格按实际页面数量规划，材料页数不能取代它',()=>{
 const request='项目交付共28页，参考PDF共20页。\n'+spec('P08')+'\n'+spec('P09');
 expect(requiresMultiPagePlan(request)).toBe(true);expect(requestedPageCount(request)).toBe(2);
});
for(const command of ['请生成28个页面','本轮请一次性生成28个页面','生成登录页、注册页和首页','创建所有关联页面','Please generate 28 pages','本次请按以下规格生成9个页面','请将以下规格拆分成3个页面'])test(`独立批量指令不被单页规格吞掉：${command}`,()=>{
 expect(requiresMultiPagePlan(command+'\n'+birthPrompt)).toBe(true);
});
test('真正超限仍在模型请求前拒绝，没有提高8页限制',async()=>{
 let calls=0;const core={generateObject:async()=>{calls++;throw Error('must not call');},streamText:()=>{throw Error('must not call');}} as any;
 const request='本次请生成28个页面。\n'+birthPrompt;
 expect(requestedPageCount(request)).toBe(28);
 await expect(prepareMultiPagePlan({state:useProjectStore.getState(),request,provider:{id:'fixture',name:'fixture',baseUrl:'https://example.invalid',apiKey:'',protocol:'openai_compatible'},model:'fixture',core,isCurrent:()=>true})).rejects.toThrow('一次最多规划8页');
 expect(calls).toBe(0);
});
test('参考附录、代码及引用块中的完整规格不能扩大生成范围',()=>{
 for(const suffix of ['\n## 参考页面\n'+spec('P09').replace('## P09','### P09'),'\n```md\n'+spec('P09')+'\n```','\n'+spec('P09').split('\n').map(line=>'> '+line).join('\n')]){
  const request=spec('P08')+suffix;expect(requiresMultiPagePlan(request)).toBe(false);expect(requestedPageCount(request)).toBe(1);
 }
});
test('真实多方案要求及明确引用继续有效',()=>{
 const request='为P08页面生成3个设计方案。\n'+birthPrompt;
 expect(requiresPageVariantPlan(request)).toBe(true);expect(requiresMultiPagePlan(request)).toBe(false);
 expect(resolveGenerationTarget({rawPrompt:'@birth\n'+birthPrompt,screens})).toMatchObject({action:'create_screen',styleReferenceScreenId:'birth'});
 expect(resolveGenerationTarget({rawPrompt:'参考页面“缺失页”\n'+birthPrompt,screens}).action).toBe('needs_reference');
});
test('不完整规格不擅自缩小范围，原有一般多页指令仍被保留',()=>{
 const request='请生成28个页面。\n## P08 排盘资料录入\n只有一个标题。';
 expect(pageCountRoutingText(request)).toBe(request);expect(requiresMultiPagePlan(request)).toBe(true);expect(requestedPageCount(request)).toBe(28);
});
