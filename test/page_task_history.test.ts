import {beforeEach,expect,test} from 'bun:test';
import {buildDesignTaskContract} from '../src/services/ai/designWorkflow';
import {preparePageTaskPlan} from '../src/services/ai/pageTaskPlan';
import {capturePageTaskHistory,readPageTaskHistory} from '../src/services/ai/pageTaskHistory';
import {TaskBudget} from '../src/services/ai/taskBudget';
import {DefaultAIEngineCore} from '../src/services/ai/engine/core/aiEngineCore';
import {MockTransport} from '../src/services/ai/engine/transport/mockTransport';
import {ConversationStore} from '../src/services/storage/conversationStore';
import {LocalStorageStorage} from '../src/services/storage/projectStorage';
import {chatPageTaskPlan} from './fixtures/pageTaskPlan';
beforeEach(()=>localStorage.clear());
async function planned(request='创建资料页'){
 const c=buildDesignTaskContract({intent:'create_screen',request,deviceProfile:'mobile',frameWidth:390});
 const transport=new MockTransport();transport.queueResponse(JSON.stringify({...chatPageTaskPlan,goal:request}));
 const budget=new TaskBudget({maxRequests:1,maxRequestedOutputTokens:3072,maxDurationMs:900000,maxRequestDurationMs:900000});
 try{c.pageTaskPlan=await preparePageTaskPlan(new DefaultAIEngineCore(transport),{contract:c,provider:{id:'fixture',protocol:'openai_compatible',name:'fixture',baseUrl:'http://mock',apiKey:'PRIVATE_PROVIDER_KEY'},model:'mock',budget,isCurrent:()=>true});}finally{budget.close();}
 return c;
}
test('conversation provenance is bounded, detached, and excludes non-plan packets and caller secrets',async()=>{
 const c=await planned();(c as any).apiKey='SECRET';(c as any).html='<main>HTML_NOT_HISTORY</main>';
 const record=capturePageTaskHistory(c,c.request)!;
 expect(record.contract.pageTaskPlan).toEqual(c.pageTaskPlan);expect(record.contract).not.toBe(c);
 const json=JSON.stringify(record);for(const value of ['PRIVATE_PROVIDER_KEY','SECRET','HTML_NOT_HISTORY'])expect(json).not.toContain(value);
 c.pageTaskPlan!.plan.goal='后来改动';expect(record.contract.pageTaskPlan!.plan.goal).toBe('创建资料页');
 expect(readPageTaskHistory(JSON.parse(json),'另一轮')).toBeUndefined();
 expect(readPageTaskHistory(undefined,c.request)).toBeUndefined();
});
test('invalid history cannot produce a plan; legacy conversation text remains readable',async()=>{
 const c=await planned(),record=capturePageTaskHistory(c,c.request)!;
 const corrupt=structuredClone(record);corrupt.contract.pageTaskPlan!.plan.goal='篡改';
 expect(readPageTaskHistory(corrupt,c.request)).toBeUndefined();
 expect(readPageTaskHistory({...record,version:2},c.request)).toBeUndefined();
 expect(readPageTaskHistory({...record,extra:'x'.repeat(80001)},c.request)).toBeUndefined();
 const storage=new LocalStorageStorage('history'),store=new ConversationStore(storage);
 await store.appendTurn({turnId:'broken-metadata',ts:Date.now(),user:{text:c.request},assistant:{text:'正文仍可读',pageTaskHistory:corrupt}});
 await store.appendTurn({turnId:'legacy',ts:Date.now()+1,user:{text:'旧请求'},assistant:{text:'旧回复'}});
 const turns=await store.loadRecent();expect(turns.map(t=>t.assistant.text)).toEqual(['正文仍可读','旧回复']);
 expect(readPageTaskHistory(turns[0].assistant.pageTaskHistory,turns[0].user.text)).toBeUndefined();
 expect(turns[1].assistant.pageTaskHistory).toBeUndefined();
});
test('two JSONL turns reopen with independent frozen plans; summary compaction drops details',async()=>{
 const store=new ConversationStore(new LocalStorageStorage('history'));
 const first=await planned('创建资料页'),second=await planned('创建预约页');
 for(const [i,c] of [first,second].entries())expect(await store.appendTurn({turnId:`turn${i}`,ts:Date.UTC(2026,8+i,1),user:{text:c.request},assistant:{text:'已完成',pageTaskHistory:capturePageTaskHistory(c,c.request)}})).toBe(true);
 const reopened=new ConversationStore(new LocalStorageStorage('history')),turns=await reopened.loadRecent();
 expect(turns.map(t=>readPageTaskHistory(t.assistant.pageTaskHistory,t.user.text)?.contract.pageTaskPlan!.plan.goal)).toEqual(['创建资料页','创建预约页']);
 expect(await reopened.compactOldest(1)).toBe(1);
 const compacted=await reopened.loadRecent();expect(compacted[0].assistant.pageTaskHistory).toBeUndefined();expect(compacted[1].assistant.pageTaskHistory).toBeDefined();
});
