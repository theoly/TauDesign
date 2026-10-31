import {beforeEach,afterEach,expect,test} from 'bun:test';
import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {TaskBudgetCard} from '../src/components/chat/TaskBudgetCard';
import {DesignGuidanceCard} from '../src/components/chat/DesignGuidanceCard';
import {DesignBriefCard} from '../src/components/chat/DesignBriefCard';
import {TaskBudget} from '../src/services/ai/taskBudget';
import {buildDesignTaskContract} from '../src/services/ai/designWorkflow';
import {makeGuidancePacket} from '../src/services/ai/designKnowledge/receipt';
import {selectDesignRules} from '../src/services/ai/designKnowledge/selector';
import {buildDesignBrief} from '../src/services/ai/designBrief';
import {techBlueTheme} from '../src/utils/themePresets';
import {PageTaskPlanCard} from '../src/components/chat/PageTaskPlanCard';
let root:Root|undefined,host:HTMLDivElement|undefined;
let priorAct:unknown;
beforeEach(()=>{priorAct=(globalThis as any).IS_REACT_ACT_ENVIRONMENT;(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;});
afterEach(()=>{if(root)act(()=>root!.unmount());host?.remove();root=undefined;host=undefined;(globalThis as any).IS_REACT_ACT_ENVIRONMENT=priorAct;});
function render(node:React.ReactNode){host=document.createElement('div');document.body.append(host);root=createRoot(host);act(()=>root!.render(node));return host;}
test('budget card distinguishes request quotas from reported or unreported usage',()=>{
  const ledger=new TaskBudget({maxRequests:1,maxRequestedOutputTokens:8,maxDurationMs:1000,maxRequestDurationMs:1000});ledger.reserve(8).settle();ledger.close();
  const node=render(<TaskBudgetCard value={ledger.snapshot()}/>);
  expect(node.textContent).toContain('请求 1/1');expect(node.textContent).toContain('已结束');expect(node.textContent).toContain('未报告用量');
  expect(node.textContent).toContain('不等于实际消耗或费用');expect(node.textContent).not.toContain('质量通过');
});
test('legacy records stay quiet; malformed budget and guidance data are visible without crashing',()=>{
  const node=render(<><TaskBudgetCard value={undefined}/><DesignGuidanceCard/></>);expect(node.textContent).toBe('');
  act(()=>root!.render(<><TaskBudgetCard value={{version:1,requests:'bad'}}/><DesignGuidanceCard contract={{designGuidance:{version:1}} as any}/></>));
  expect(node.textContent).toContain('预算记录不可用');expect(node.textContent).toContain('设计依据记录不可用');
});
test('guidance card displays selected advice without claiming it was sent or verified',()=>{
  const contract=buildDesignTaskContract({intent:'create_screen',request:'长正文',deviceProfile:'mobile',frameWidth:390});
  contract.designGuidance=makeGuidancePacket(contract,selectDesignRules({request:'长正文',operation:'create',device:'mobile',scope:'page',maxChars:800}));
  const node=render(<DesignGuidanceCard contract={contract}/>);
  expect(node.textContent).toContain('本次设计依据');expect(node.textContent).toContain('长正文空间');
  expect(node.textContent).toContain('尚无实际调用记录');expect(node.textContent).toContain('不表示 Provider 已确认收到');
  expect(node.querySelector('script')).toBeNull();
});
test('brief labels scene inference and preserves exact versus semantic content requirements',()=>{
  const brief=buildDesignBrief({request:'会员档案',device:'mobile',mode:'light',designSystem:techBlueTheme,globalDecisions:[],components:[],
    contentObligations:[{kind:'exact',text:'确认提交',source:'user'},{kind:'semantic',text:'说明权益',source:'document'}]});
  const node=render(<DesignBriefCard brief={brief}/>);
  expect(node.textContent).toContain('系统推断，非已确认业务事实');expect(node.textContent).toContain('详情/档案');
  expect(node.textContent).toContain('保留原文：确认提交');expect(node.textContent).toContain('保留语义：说明权益');
});
test('negative and nonfinite budget values cannot become convincing cost summaries',()=>{
  const valid=new TaskBudget({maxRequests:1,maxRequestedOutputTokens:8,maxDurationMs:1000,maxRequestDurationMs:1000}).snapshot();
  const node=render(<TaskBudgetCard value={{...valid,requestedOutputTokens:-1}}/>);expect(node.textContent).toContain('不可用');
  act(()=>root!.render(<TaskBudgetCard value={{...valid,reportedInputTokens:Infinity}}/>));expect(node.textContent).toContain('不可用');
});
test('functional planning card keeps legacy records quiet and rejects malformed restored data',()=>{
  const node=render(<PageTaskPlanCard/>);expect(node.textContent).toBe('');
  act(()=>root!.render(<PageTaskPlanCard contract={{pageTaskPlan:{version:1}} as any}/>));
  expect(node.textContent).toContain('业务规划记录不可用');
});
