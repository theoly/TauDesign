import {expect,test} from 'bun:test';
import {LocalStorageStorage} from '../src/services/storage/projectStorage';
import {saveDesignTask,readDesignTask,removeDesignTask,claimDesignTaskRecovery,type SavedDesignTask} from '../src/services/storage/designTaskRepository';
import {buildDesignTaskContract} from '../src/services/ai/designWorkflow';
function fixture(){const prefix='transaction-'+crypto.randomUUID(),a=new LocalStorageStorage(prefix),b=new LocalStorageStorage(prefix),contract=buildDesignTaskContract({intent:'create_screen',request:'新建资料页',deviceProfile:'mobile',frameWidth:390});const task:Omit<SavedDesignTask,'artifacts'>={version:1,id:contract.taskId,projectId:'p',createdAt:1,updatedAt:1,state:'blocked',request:contract.request,contextFingerprint:'source',binding:{providerId:'test',model:'m',endpointIdentity:'test'},contract};return {a,b,task,prefix};}
test('two storage instances using one manifest identity cannot both overwrite it',async()=>{
 const f=fixture(),saved=await saveDesignTask(f.a,f.task,[]),expected=await f.a.taskManifestIdentity(saved.id),results=await Promise.allSettled([f.a.publishTaskManifest(saved.id,expected,JSON.stringify({...saved,updatedAt:2,error:'A'})),f.b.publishTaskManifest(saved.id,expected,JSON.stringify({...saved,updatedAt:3,error:'B'}))]);
 expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(results.filter(r=>r.status==='rejected')).toHaveLength(1);expect((await readDesignTask(f.a,'p',saved.id))?.task.error).toBe('A');
});
test('publication racing cleanup cannot resurrect parts, logs or a cleaned authority manifest',async()=>{
 const f=fixture(),saved=await saveDesignTask(f.a,f.task,[{stepId:'section-1',html:'<main>private</main>',complete:true}]),expected=await f.b.taskManifestIdentity(saved.id);await f.a.writeBinary('assets/images/kept.png','YQ==');
 await removeDesignTask(f.a,'p',saved.id);
 for(const write of [()=>f.b.publishTaskManifest(saved.id,expected,JSON.stringify(saved)),()=>f.b.writeTextAtomic(`tasks/${saved.id}/artifacts/late.html`,'<main>late</main>'),()=>f.b.appendLine(`tasks/${saved.id}/attempts.jsonl`,'{}'),()=>f.b.createTextExclusive(`tasks/${saved.id}/recovery-claim.json`,JSON.stringify({version:1,originTaskId:saved.id,newTaskId:'design-next',createdAt:1}),null)])await expect(write()).rejects.toThrow('清理');
 expect(await f.a.listDir(`tasks/${saved.id}`)).toEqual([]);expect(await f.a.readBinary('assets/images/kept.png')).toBe('YQ==');expect(await readDesignTask(f.b,'p',saved.id)).toBeUndefined();
});
test('recovery claim is single-use, source-bound and blocks old code while allowing recorded late costs',async()=>{
 const f=fixture(),saved=await saveDesignTask(f.a,f.task,[]),expected=await f.a.taskManifestIdentity(saved.id);
 const claimed=await Promise.all([claimDesignTaskRecovery(f.a,saved,'design-recovery-a'),claimDesignTaskRecovery(f.b,saved,'design-recovery-b')]);expect(claimed.filter(Boolean)).toHaveLength(1);
 await expect(f.b.publishTaskManifest(saved.id,expected,JSON.stringify(saved))).rejects.toThrow('接替');await expect(f.b.writeTextAtomic(`tasks/${saved.id}/artifacts/late.html`,'<main>old</main>')).rejects.toThrow('接替');await f.b.appendLine(`tasks/${saved.id}/attempts.jsonl`,'{"kind":"superseded-settlement"}');expect(await f.a.readText(`tasks/${saved.id}/attempts.jsonl`)).toContain('superseded-settlement');
});
test('stale delete and completed-task downgrade are rejected, and ordinary APIs cannot bypass task transactions',async()=>{
 const f=fixture(),saved=await saveDesignTask(f.a,f.task,[]),old=await f.a.taskManifestIdentity(saved.id);await f.b.publishTaskManifest(saved.id,old,JSON.stringify({...saved,updatedAt:2,state:'completed'}));
 await expect(f.a.deleteDesignTask(saved.id,old)).rejects.toThrow('变化');await expect(f.a.publishTaskManifest(saved.id,await f.a.taskManifestIdentity(saved.id),JSON.stringify(saved))).rejects.toThrow('已完成');
 for(const path of [`tasks/${saved.id}/manifest.json`,`tasks/${saved.id}/recovery-claim.json`,'tasks/.locks/x'])await expect(f.a.writeTextAtomic(path,'{}')).rejects.toThrow();await expect(f.a.remove(`tasks/${saved.id}`)).rejects.toThrow();expect((await readDesignTask(f.a,'p',saved.id))?.task.state).toBe('completed');
});
test('without Web Locks the browser keeps drafts readable but refuses unsafe writes',async()=>{
 const f=fixture(),saved=await saveDesignTask(f.a,f.task,[]),descriptor=Object.getOwnPropertyDescriptor(navigator,'locks');try{
  Object.defineProperty(navigator,'locks',{configurable:true,value:undefined});expect((await readDesignTask(f.a,'p',saved.id))?.task.id).toBe(saved.id);await expect(f.a.publishTaskManifest(saved.id,await f.a.taskManifestIdentity(saved.id),JSON.stringify(saved))).rejects.toThrow('跨实例排他锁');await expect(removeDesignTask(f.a,'p',saved.id)).rejects.toThrow('跨实例排他锁');
 }finally{if(descriptor)Object.defineProperty(navigator,'locks',descriptor);}
});
test('separate-realm queue simulation still reaches real storage CAS and permits only one initial publication',async()=>{
 const f=fixture();class RealmA extends LocalStorageStorage{get scopeKey(){return 'realm-A-'+f.prefix;}}class RealmB extends LocalStorageStorage{get scopeKey(){return 'realm-B-'+f.prefix;}}
 const a=new RealmA(f.prefix),b=new RealmB(f.prefix),results=await Promise.allSettled([saveDesignTask(a,f.task,[{stepId:'body',html:'<main>A</main>',complete:true}]),saveDesignTask(b,f.task,[{stepId:'body',html:'<main>B</main>',complete:true}])]);expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(results.filter(r=>r.status==='rejected')).toHaveLength(1);expect(await readDesignTask(a,'p',f.task.id)).toBeDefined();
});
test('the 40-task quota is serialized across different task identities as well',async()=>{
 const f=fixture();for(let i=0;i<39;i++)await f.a.writeTextAtomic(`tasks/design-quota-${i}/reserved.txt`,'reserved');
 const body=(id:string)=>JSON.stringify({version:1,id,projectId:'p',state:'draft'}),results=await Promise.allSettled([f.a.publishTaskManifest('design-quota-a',null,body('design-quota-a')),f.b.publishTaskManifest('design-quota-b',null,body('design-quota-b'))]);expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
 const identities=new Set((await f.a.listDir('tasks')).map(path=>path.split('/')[0]).filter(id=>id.startsWith('design-')));expect(identities.size).toBe(40);
});
