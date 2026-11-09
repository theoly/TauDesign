import {test,expect} from 'bun:test';
import {enforceBudgetGuard} from '../src/services/ai/engine/context/budgetGuard';
import {buildScopedPageContext} from '../src/services/ai/engine/context/scopedPageContext';
import {executeStructuredEdit} from '../src/services/ai/structuredEditExecutor';
import {buildDesignTaskContract,contentFingerprint} from '../src/services/ai/designWorkflow';
import {techBlueTheme} from '../src/utils/themePresets';
import type {AIEngineCore} from '../src/services/ai/engine/core/types';

for(const size of [10000,30000,50000,100000])test(`${size} character required baseline is never replaced by a text-stripped skeleton`,()=>{
 const html='<main><p data-nid="keep">'+('完整原文'.repeat(Math.ceil(size/4)))+'</p><button>提交并保留全部原文</button></main>';
 let skeletonCalls=0;const result=enforceBudgetGuard({targetHtml:html,targetId:'p',referencedScreens:[],skeletonizeFn(){skeletonCalls++;return '<main>...</main>';}});
 expect(result.targetScreenHtml).toBe(html);expect(result.targetIsSkeleton).toBe(false);expect(skeletonCalls).toBe(0);
});
test('scoped dependencies preserve ancestor layout, all source CSS and L4 without sending the whole unrelated DOM',async()=>{
 const html='<html><head><style>.layout{display:flex}.target{min-width:0}</style></head><body><main data-nid="root" class="layout" style="gap:16px"><section data-nid="region" class="target"><h2 data-nid="title">待改标题</h2><button data-nid="button" class="btn btn-primary">查看详情</button></section><aside data-nid="outside">'+Array.from({length:30},(_,i)=>`<p data-nid="keep${i}">保留外部第${i}条正文${'长文本'.repeat(300)}</p>`).join('')+'</aside></main></body></html>';
 const overrides={'p:root':{nid:'root',declarations:{'align-items':'center'}},'other:x':{nid:'x',declarations:{color:'red'}}},css='.target button{border-radius:var(--radius-lg)}';
 const dependencies=buildScopedPageContext({screenId:'p',html,targetNids:['region'],scopedCss:css,overrides});
 expect(dependencies.baselineFingerprint).toBe(contentFingerprint(html));expect(dependencies.ancestors.some(a=>a.attributes.class==='layout'&&a.attributes.style==='gap:16px')).toBe(true);
 expect(dependencies.sourceCss).toContain('.layout{display:flex}');expect(dependencies.sourceCss).toContain(css);expect(dependencies.overrides).toEqual([overrides['p:root']]);expect(JSON.stringify(dependencies).length).toBeLessThan(4000);
 const request='将此区块的按钮加粗，保持原文和布局',contract=buildDesignTaskContract({intent:'modify_screen',request,target:{id:'p',name:'原页',htmlContent:html},deviceProfile:'mobile',frameWidth:390,allowedChanges:['element:region']});
 let payload:any;const core:AIEngineCore={streamText(){throw Error('no full-page stream');},async generateObject(_schema,options){payload=JSON.parse(options.messages.at(-1)!.content);return {nid:'region',html:'<section data-nid="region" class="target"><h2 data-nid="title">待改标题</h2><button data-nid="button" class="btn btn-primary font-semibold">查看详情</button></section>'} as any;}};
 const result=await executeStructuredEdit(core,{mode:'region',screen:{id:'p',name:'原页',htmlContent:html,scopedCss:css},styleOverrides:overrides,request,contract,settings:{deviceProfile:'mobile',frameWidth:390},designSystem:techBlueTheme,colorMode:'light',regionNids:['region'],binding:{provider:{id:'test',name:'test',protocol:'openai_compatible',baseUrl:'https://example.test',apiKey:'test-key',isEnabled:true},model:'m'},isCurrent:()=>true});
 expect(result.status).toBe('ready');expect(payload.html).toContain('待改标题');expect(payload.html).not.toContain('保留外部第29条');expect(payload.readOnlySourceContext.sourceCss).toContain(css);expect(payload.readOnlySourceContext.overrides).toEqual([overrides['p:root']]);
 if(result.status==='ready'){expect(result.html).toContain('保留外部第29条');expect(result.html).toContain('<style>.layout{display:flex}.target{min-width:0}</style>');expect(result.html).toContain('class="target"');}
 expect(html).toContain('class="btn btn-primary">查看详情');
});
