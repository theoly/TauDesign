import {expect,test} from 'bun:test';
import {archiveFailedConversation,backfillFailedConversations} from '../src/services/ai/failureConversationArchive';
import {ConversationStore} from '../src/services/storage/conversationStore';
import {LocalStorageStorage} from '../src/services/storage/projectStorage';
import {buildDesignTaskContract} from '../src/services/ai/designWorkflow';
import {TaskBudget} from '../src/services/ai/taskBudget';
import {DesignTaskJournal} from '../src/services/ai/designTaskJournal';
const provider={id:'failure-test',name:'test',protocol:'openai_compatible' as const,baseUrl:'https://invalid.example/v1',apiKey:'SYNTHETIC_ARCHIVE_SECRET',isEnabled:true};
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
function fixture(){const id='failed-'+crypto.randomUUID(),storage=new LocalStorageStorage(id),request='修改当前页，使用参考图的资料表单',contract=buildDesignTaskContract({intent:'create_screen',request,deviceProfile:'mobile',frameWidth:390});return {id,storage,request,contract,source:{storage,request,startedAt:Date.UTC(2026,10,12),model:'synthetic',apiKey:provider.apiKey},store:new ConversationStore(storage)};}
test('failed history preserves prompt/error/model and independent image path; concurrent saves of the same task are idempotent',async()=>{
 const f=fixture(),source={...f.source,attachment:{name:'test.png',dataUrl:png}},result={message:'failed using '+provider.apiKey,status:'failed' as const,contract:f.contract,phase:'generating'};
 expect((await Promise.all([archiveFailedConversation(source,result),archiveFailedConversation(source,result)])).every(Boolean)).toBe(true);
 const rows=await f.store.loadRecent();expect(rows).toHaveLength(1);expect(rows[0].user.text).toBe(f.request);expect(rows[0].assistant.failure?.status).toBe('failed');expect(rows[0].assistant.failure?.phase).toBe('generating');
 expect(rows[0].user.attachments?.[0]).toMatch(/^assets\/images\/[a-f0-9]{64}\.png$/);expect(await f.storage.readBinary(rows[0].user.attachments![0])).toBe(png.split(',')[1]);expect(JSON.stringify(rows)).not.toContain('base64');expect(JSON.stringify(rows)).not.toContain(provider.apiKey);
});
test('a failed image write still saves the failure text and explicitly records the missing attachment',async()=>{
 const f=fixture();f.storage.writeBinary=async()=>{throw Error('synthetic disk full');};expect(await archiveFailedConversation({...f.source,attachment:{name:'test.png',dataUrl:png}},{message:'generation failed',status:'failed'})).toBe(true);
 const [row]=await f.store.loadRecent();expect(row.assistant.text).toBe('generation failed');expect(row.assistant.failure?.attachmentUnavailable).toBe(true);expect(row.user.attachments).toBeUndefined();
});
test('a JSONL failure is reported rather than claiming the conversation was saved',async()=>{
 const f=fixture();f.storage.appendLine=async()=>{throw Error('synthetic JSONL full');};expect(await archiveFailedConversation(f.source,{message:'failed',status:'failed'})).toBe(false);
});
test('failure diagnostics survive compaction; corrupt optional metadata cannot erase conversation text',async()=>{
 const f=fixture();await archiveFailedConversation(f.source,{message:'specific failure',status:'failed',contract:f.contract});await f.store.compactOldest(0);
 const [row]=await new ConversationStore(f.storage).loadRecent();expect(row.assistant.text).toBe('specific failure');expect(row.user.text).toBe(f.request);expect(row.assistant.failure?.taskId).toBe(f.contract.taskId);
 await f.storage.appendLine('conversations/2026-11.jsonl',JSON.stringify({turnId:'bad-meta',ts:Date.UTC(2026,10,13),user:{text:'still readable'},assistant:{text:'failed text',failure:{version:99,apiKey:'must not become diagnostics'}}}));
 const [bad]=await f.store.loadRecent(1);expect(bad.assistant.failure).toBeUndefined();expect(bad.assistant.text).toBe('failed text');
});
test('recent failed task backfill is read-only, idempotent and shares task identity with live failure storage',async()=>{
 const f=fixture(),budget=new TaskBudget({maxRequests:4,maxRequestedOutputTokens:34568,maxDurationMs:10000,maxRequestDurationMs:10000});
 try{const journal=new DesignTaskJournal({storage:f.storage,projectId:f.id,contextFingerprint:'context',provider,model:'synthetic',isCurrent:()=>true});
  await journal.update({phase:'started',contract:f.contract,budget:budget.snapshot()});await journal.update({phase:'result',contract:f.contract,budget:budget.snapshot(),result:{error:'old failed attempt'}});
  const path=`tasks/${f.contract.taskId}/manifest.json`,before=await f.storage.readText(path);await backfillFailedConversations(f.storage,f.id);await backfillFailedConversations(f.storage,f.id);
  const rows=await f.store.loadRecent();expect(rows).toHaveLength(1);expect(rows[0].assistant.failure?.taskId).toBe(f.contract.taskId);expect(rows[0].assistant.failure?.requests).toBe(0);expect(await f.storage.readText(path)).toBe(before);
  expect(await archiveFailedConversation({...f.source,startedAt:Date.UTC(2026,11,1)},{message:'old failed attempt',status:'failed',contract:f.contract})).toBe(true);expect(await f.store.loadRecent()).toHaveLength(1);
 }finally{budget.close();}
});
