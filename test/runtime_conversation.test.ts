import {beforeEach,expect,test} from 'bun:test';
import {ConversationStore,type ConversationTurn} from '../src/services/storage/conversationStore';
import {LocalStorageStorage} from '../src/services/storage/projectStorage';
const ts=Date.UTC(2026,8,1),turn=(id:string,time=ts):ConversationTurn=>({turnId:id,ts:time,user:{text:`需求${id}`},assistant:{text:`回复${id}`}});
beforeEach(()=>localStorage.clear());
test('valid JSON with invalid basic fields is isolated per line and does not push good rows out of the recent page',async()=>{
 const storage=new LocalStorageStorage('runtime-lines'),store=new ConversationStore(storage);await store.appendTurn(turn('first'));
 const bad=[{...turn('x'),user:null},{...turn('x'),assistant:null},{...turn('x'),ts:'now'},{...turn('x'),ts:1e30},{...turn('x'),user:{text:4}},{...turn('x'),assistant:{text:[]}}];
 for(let i=0;i<40;i++)await storage.appendLine('conversations/2026-09.jsonl',JSON.stringify(bad[i%bad.length]));
 await storage.appendLine('conversations/2026-09.jsonl','{broken');await store.appendTurn(turn('last',ts+20));
 expect((await store.loadRecent(2)).map(t=>t.turnId)).toEqual(['first','last']);expect((await store.loadBefore(ts+20,1)).map(t=>t.turnId)).toEqual(['first']);
 expect((await store.exportMarkdown())).toContain('回复first');expect(await store.compactOldest(0)).toBe(2);expect((await store.loadRecent(2)).map(t=>t.turnId)).toEqual(['first','last']);
 expect(await store.appendTurn({...turn('bad'),user:null} as any)).toBe(false);
});
test('bad optional fields are removed without losing text or invalid-source diagnostics',async()=>{
 const storage=new LocalStorageStorage('runtime-optional'),store=new ConversationStore(storage),v:any=turn('optional');
 v.user.reviewRequest={bad:true};v.user.attachments='wrong';v.user.textFiles=[null];v.assistant.designGuidanceHistory={version:99};v.assistant.pageTaskHistory=null;
 v.changeSet={screens:{length:1},tokens:[{path:'color',from:'a',to:'b'}],decisions:[7],checkpointId:4};await storage.appendLine('conversations/2026-09.jsonl',JSON.stringify(v));
 const [read]=await store.loadRecent();expect(read.assistant.text).toBe(v.assistant.text);expect(read.user.reviewRequest).toBeUndefined();expect(read.user.attachments).toBeUndefined();expect(read.user.textFiles).toBeUndefined();
 expect(read.changeSet!.screens).toBeUndefined();expect(read.changeSet!.tokens).toHaveLength(1);expect(read.assistant.designGuidanceHistory as any).toEqual({version:99});expect(read.assistant.pageTaskHistory as any).toBeNull();
 expect(await store.exportMarkdown()).toContain('回复optional');
});
for(const kind of ['missing','syntax','shape','traversal','duplicate','omitted-month'] as const)test(`${kind} index recovers actual month files and append counts exactly once`,async()=>{
 const storage=new LocalStorageStorage(`runtime-index-${kind}`),store=new ConversationStore(storage);await store.appendTurn(turn('sep'));await store.appendTurn(turn('oct',Date.UTC(2026,9,1)));
 const original=JSON.parse((await storage.readText('conversations/index.json'))!);if(kind==='missing')await storage.remove('conversations/index.json');
 if(kind==='syntax')await storage.writeTextAtomic('conversations/index.json','{broken');if(kind==='shape')await storage.writeTextAtomic('conversations/index.json',JSON.stringify({shards:17}));
 if(kind==='traversal')await storage.writeTextAtomic('conversations/index.json',JSON.stringify({shards:[{...original.shards[0],shard:'../../outside'}]}));
 if(kind==='duplicate')await storage.writeTextAtomic('conversations/index.json',JSON.stringify({shards:[...original.shards,original.shards[0]]}));
 if(kind==='omitted-month')await storage.writeTextAtomic('conversations/index.json',JSON.stringify({shards:[original.shards[0]]}));
 await storage.writeTextAtomic('conversations/2026-99.jsonl',JSON.stringify(turn('ignored')));await storage.writeTextAtomic('conversations/nested/2026-09.jsonl',JSON.stringify(turn('nested')));
 const before=await storage.readText('conversations/2026-09.jsonl'),reopened=new ConversationStore(new LocalStorageStorage(`runtime-index-${kind}`));
 expect((await reopened.loadRecent()).map(t=>t.turnId)).toEqual(['sep','oct']);expect(await reopened.stats()).toEqual({shards:2,turns:2});
 expect(await reopened.appendTurn(turn('new',Date.UTC(2026,9,2)))).toBe(true);expect(await reopened.stats()).toEqual({shards:2,turns:3});expect(await storage.readText('conversations/2026-09.jsonl')).toBe(before);
});
test('concurrent instances writing one scope preserve every append and index count; read waits for scheduled writes',async()=>{
 const pending=Array.from({length:20},(_,i)=>new ConversationStore(new LocalStorageStorage('concurrent')).appendTurn(turn(`t${i}`,i%2?Date.UTC(2026,9,1):ts)));
 const reader=new ConversationStore(new LocalStorageStorage('concurrent')),all=await reader.loadRecent(50);expect(all).toHaveLength(20);expect(new Set(all.map(t=>t.turnId)).size).toBe(20);
 expect((await Promise.all(pending)).every(Boolean)).toBe(true);expect(await reader.stats()).toEqual({shards:2,turns:20});
});
test('a stalled write in one project cannot block another project',async()=>{
 const a=new LocalStorageStorage('held'),b=new LocalStorageStorage('free'),append=a.appendLine.bind(a);let release!:()=>void;
 a.appendLine=async(...args)=>{await new Promise<void>(r=>release=r);return append(...args);};const held=new ConversationStore(a).appendTurn(turn('held'));
 for(let i=0;i<20&&!release;i++)await new Promise(r=>setTimeout(r,0));expect(release).toBeDefined();
 expect(await new ConversationStore(b).appendTurn(turn('free'))).toBe(true);release();expect(await held).toBe(true);
});
