import {expect,test} from 'bun:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {inspectPageTaskCoverage} from '../src/services/ai/pageTaskCoverage';
import {PageTaskCoverageCard} from '../src/components/chat/PageTaskCoverageCard';
import {preparePageTaskPlan} from '../src/services/ai/pageTaskPlan';
import {buildDesignTaskContract} from '../src/services/ai/designWorkflow';
import {TaskBudget} from '../src/services/ai/taskBudget';
import {DefaultAIEngineCore} from '../src/services/ai/engine/core/aiEngineCore';
import {MockTransport} from '../src/services/ai/engine/transport/mockTransport';
import {chatPageTaskPlan} from './fixtures/pageTaskPlan';
async function contract(){
 const c=buildDesignTaskContract({intent:'create_screen',request:'创建资料页',deviceProfile:'mobile',frameWidth:390});
 const transport=new MockTransport();transport.queueResponse(JSON.stringify({...chatPageTaskPlan,features:chatPageTaskPlan.features.map(f=>({...f,information:[{label:'邮箱',kind:'input'},{label:'资料说明',kind:'display'}]}))}));
 const budget=new TaskBudget({maxRequests:1,maxRequestedOutputTokens:3072,maxDurationMs:900000,maxRequestDurationMs:900000});
 try{c.pageTaskPlan=await preparePageTaskPlan(new DefaultAIEngineCore(transport),{contract:c,provider:{id:'fixture',protocol:'openai_compatible',name:'fixture',baseUrl:'http://mock',apiKey:''},model:'mock',budget,isCurrent:()=>true});}finally{budget.close();}
 return c;
}
test('actual controls and display source are indications; state scenarios and semantics remain unverified',async()=>{
 const c=await contract(),html='<main><p>资料说明</p><label for="email">邮箱</label><input id="email" data-nid="email001"/><button data-nid="more0001">查看详情</button></main>';
 const report=inspectPageTaskCoverage(c,html)!;expect(report.status).toBe('available');if(report.status!=='available')return;
 expect(report.items.map(i=>i.status)).toEqual(['source-indication','source-indication','source-indication','scenario-only']);
 expect(report.items[0].nids).toEqual(['email001']);expect(report.semanticStatus).toBe('unverified');
 expect(report.unlocatedCount).toBe(0);expect(c.pageTaskPlan?.plan.features[0].information).toHaveLength(2);
});
test('plain text cannot stand in for an input or action; hidden and non-content sources are excluded',async()=>{
 const c=await contract();
 const html='<main><p>邮箱 查看详情</p><script>资料说明</script><style>.资料说明{}</style><template>资料说明</template><p hidden>资料说明</p><div aria-hidden="true"><button>查看详情</button></div><input aria-label="邮箱" style="display:none"/></main>';
 const report=inspectPageTaskCoverage(c,html)!;expect(report.status).toBe('available');if(report.status!=='available')return;
 expect(report.unlocatedCount).toBe(3);expect(report.items.slice(0,3).every(i=>i.status==='not-located')).toBe(true);
});
test('coverage is recomputed for each HTML and corrupted/legacy plans cannot claim a report',async()=>{
 const c=await contract();const first=inspectPageTaskCoverage(c,'<main><p>资料说明</p></main>')!,second=inspectPageTaskCoverage(c,'<main/>')!;
 if(first.status!=='available'||second.status!=='available')throw Error('expected report');
 expect(first.htmlFingerprint).not.toBe(second.htmlFingerprint);expect(first.unlocatedCount).toBe(2);expect(second.unlocatedCount).toBe(3);
 expect(inspectPageTaskCoverage({...c,pageTaskPlan:undefined},'<main/>')).toBeUndefined();
 c.pageTaskPlan!.plan.goal='篡改';expect(inspectPageTaskCoverage(c,'<main/>')?.status).toBe('unavailable');
});
test('coverage card shows unlocated requirements and the limits of source indications',async()=>{
 const c=await contract(),html='<main><p>资料说明</p></main>';
 const markup=renderToStaticMarkup(<PageTaskCoverageCard contract={c} html={html}/>);
 const text=new DOMParser().parseFromString(markup,'text/html').body.textContent;
 for(const label of ['需求覆盖线索','未定位','源码线索','场景待核对','语义未验证'])expect(text).toContain(label);
 expect(text).not.toContain('全部功能已通过');
});
