import {expect,test} from 'bun:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {userFacingMessage,generationProgressLabel,requestStageLabel,finishReasonLabel} from '../src/utils/userFacingMessage';
import {UserFacingNotice} from '../src/components/common/UserFacingNotice';
import {RequestActivityCard} from '../src/components/chat/RequestActivityCard';
import {TaskBudgetCard} from '../src/components/chat/TaskBudgetCard';
import {HistoricalFailureCard} from '../src/components/chat/HistoricalFailureCard';
import {TaskBudget,withTaskBudget} from '../src/services/ai/taskBudget';
import {generateTaskPage} from '../src/services/ai/pageTaskGeneration';
import {choosePageWriteStrategy} from '../src/services/ai/generationStrategy';
import {chatPageTaskPlan} from './fixtures/pageTaskPlan';
import {DefaultAIEngineCore} from '../src/services/ai/engine/core/aiEngineCore';
import {MockTransport} from '../src/services/ai/engine/transport/mockTransport';
const oldNotice='SkeletonMainAtomic：完整main已取得，仍须全部交付检查。';
function rendered(node:React.ReactNode){const doc=new DOMParser().parseFromString(renderToStaticMarkup(node),'text/html');return doc.body;}
function ordinaryText(node:Element){const copy=node.cloneNode(true) as Element;copy.querySelectorAll('[data-technical-details]').forEach(el=>el.remove());return copy.textContent??'';}
test('legacy internal-mode notice has clear ordinary copy and exact optional diagnostic text',()=>{
 const node=rendered(<UserFacingNotice message={oldNotice}/>);expect(ordinaryText(node)).toBe('页面内容已生成，请查看完整性和布局检查结果。');
 const details=node.querySelector('[data-technical-details]')!;expect(details.textContent).toContain(oldNotice);expect(details.hasAttribute('open')).toBe(false);expect(node.querySelector('script')).toBeNull();
});
test('unknown ordinary messages are left alone, with no unnecessary technical expander',()=>{
 const text='请先选择需要修改的页面。';expect(userFacingMessage(text)).toBe(text);expect(rendered(<UserFacingNotice message={text}/>).querySelector('details')).toBeNull();
});
test('notices preserve quoted business text, URLs, paths, model names and code',()=>{
 const text='DOM 检查未通过，必须保留“合同”与"DOM"、`main`；请核对 https://example.test/main?key=DOM 和 screens/main.html。';
 const result=userFacingMessage(text);expect(result).toContain('页面结构 检查未通过');for(const original of ['“合同”','"DOM"','`main`','https://example.test/main?key=DOM','screens/main.html'])expect(result).toContain(original);
 expect(userFacingMessage('合同权益暂未生效')).toBe('合同权益暂未生效');
 for(const code of ['<main class="col"><p>DOM CSS</p></main>','```html\n<main>HTML JSON</main>\n```'])expect(userFacingMessage(code)).toBe(code);
});
for(const mode of ['SkeletonMainAtomic','SectionPlanThenWrite','SectionedPatch','DerivedCopyMutableOnly'])test('generation mode is readable without exposing internal type: '+mode,()=>{
 expect(generationProgressLabel(mode)).not.toContain(mode);expect(userFacingMessage(mode)).not.toContain(mode);
});
test('continuation warning retains its actual limits and never claims successful completion',()=>{
 const text=userFacingMessage('续写达到2次或累计32768请求输出Token上限；请拆分修改。');expect(text).toContain('2次');expect(text).toContain('32768个用量单位');expect(text).toContain('缩小修改范围');expect(text).not.toMatch(/Token|HTML|原生|检查通过/);
});
test('step and finish mappings distinguish length, filtering and unknown from successful completion',()=>{
 expect(requestStageLabel('functional-plan')).toBe('梳理页面功能');expect(requestStageLabel('section-3')).toContain('3');expect(requestStageLabel('custom-step-id')).toBe('当前步骤');
 expect(finishReasonLabel('length')).toContain('长度上限');expect(finishReasonLabel('content_filter')).toContain('拦截');expect(finishReasonLabel('unknown')).toContain('尚未确认');expect(finishReasonLabel('future-vendor-state')).toBe('结束原因未识别');expect(finishReasonLabel('stop')).toBe('回复已结束');
});
test('communication card shows plain progress and retains wire details only in collapsed diagnostics',()=>{
 const activity={startedAt:100,lastActivityAt:5100,requests:2,active:0,textChars:80,reasoningChars:200,jsonChars:45,status:'returned' as const,providerId:'prov-internal-123',model:'qwen3.8-flash',networkAttempts:2,httpStatus:200,lastFinishReason:'length',stageId:'functional-plan',effectiveOutputTokens:3072};
 const before=JSON.stringify(activity),node=rendered(<RequestActivityCard activity={activity}/>),normal=ordinaryText(node);
 for(const text of ['已收到 AI 回复','请求尝试 2 次','梳理页面功能','达到回复长度上限','3,072','qwen3.8-flash','通信进度不代表页面已完成检查'])expect(normal).toContain(text);
 expect(normal).not.toMatch(/functional-plan|prov-internal|\blength\b|JSON|Provider/);expect(node.querySelector('[data-technical-details]')?.textContent).toContain('HTTP 200');expect(JSON.stringify(activity)).toBe(before);
 const cancelled=ordinaryText(rendered(<RequestActivityCard activity={{...activity,status:'cancelled',lastFinishReason:'stop'}}/>));expect(cancelled).toContain('已停止');expect(cancelled).not.toContain('回复已结束');
});
test('budget keeps real quotas and warns that its units are neither characters nor fees',()=>{
 const ledger=new TaskBudget({maxRequests:2,maxRequestedOutputTokens:8192,maxDurationMs:10000,maxRequestDurationMs:10000});ledger.reserve(4096).settle();ledger.close();const value=ledger.snapshot(),before=JSON.stringify(value),text=ordinaryText(rendered(<TaskBudgetCard value={value}/>));
 expect(text).toContain('请求 1/2');expect(text).toContain('4,096');expect(text).toContain('8,192');expect(text).toContain('不等同于字符数');expect(text).toContain('不等于实际消耗或费用');expect(JSON.stringify(value)).toBe(before);
});
test('history failure translates finish reason without restarting a task or hiding original diagnostics',()=>{
 const failure={version:1,status:'failed',message:'旧错误',phase:'generating',model:'fixture',finishReason:'length',httpStatus:200,taskId:'design-old',requests:2,requestLimit:4} as any;
 const node=rendered(<HistoricalFailureCard failure={failure} onReuse={()=>{throw Error('render must not reuse a task');}}/>);expect(ordinaryText(node)).toContain('达到回复长度上限');expect(ordinaryText(node)).not.toContain('design-old');expect(node.querySelector('[data-technical-details]')?.textContent).toContain('length');
});
test('ordinary completion is progress, not a persistent warning, and generation output/budget remain unchanged',async()=>{
 const transport=new MockTransport();transport.queueResponse('<artifact title="测试"><main class="col"><h1>DOM 合同</h1><button>保存</button></main></artifact>',1);
 const ledger=new TaskBudget({maxRequests:4,maxRequestedOutputTokens:32768,maxDurationMs:10000,maxRequestDurationMs:10000}),strategy=choosePageWriteStrategy({plan:chatPageTaskPlan,estimatedHtmlBytes:1000}),before=JSON.stringify(strategy),progress:string[]=[];
 try{const result=await generateTaskPage(withTaskBudget(new DefaultAIEngineCore(transport),ledger),{provider:{id:'fixture',name:'fixture',protocol:'openai_compatible',baseUrl:'http://mock',apiKey:''},model:'fixture',messages:[{role:'user',content:'设计新页面'}]},{strategy,plan:chatPageTaskPlan,device:'mobile',title:'测试',contextKey:'fixture',budget:ledger,onProgress:text=>progress.push(text)});
 expect(progress[0]).toBe('正在生成页面内容…');expect(progress.at(-1)).toBe('页面内容已生成，正在检查内容和布局…');expect(result.warnings.join(' ')).not.toMatch(/SkeletonMainAtomic|完整main/);expect(result.rawResponse).toContain('<h1>DOM 合同</h1>');expect(ledger.snapshot().requests).toBe(1);expect(JSON.stringify(strategy)).toBe(before);
 }finally{ledger.close();}
});
