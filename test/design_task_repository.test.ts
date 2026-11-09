import {test,expect} from 'bun:test';
import {saveDesignTask,readDesignTask,claimDesignTaskRecovery,removeDesignTask,listDesignTaskIndex,removeCorruptDesignTask,type SavedDesignTask} from '../src/services/storage/designTaskRepository';
import type {ProjectStorage} from '../src/services/storage/projectStorage';
import {buildDesignTaskContract} from '../src/services/ai/designWorkflow';
import {TaskBudget} from '../src/services/ai/taskBudget';
function memory(){const files=new Map<string,string>();let failManifest=false;const storage={kind:'localStorage',scopeKey:crypto.randomUUID(),async ensureDir(){},async exists(p:string){return files.has(p);},async readText(p:string){return files.get(p)??null;},async writeTextAtomic(p:string,s:string){if(failManifest&&p.endsWith('/manifest.json'))throw Error('disk full');files.set(p,s);},async listDir(p:string){return [...new Set([...files.keys()].filter(k=>k.startsWith(p+'/')).map(k=>k.slice(p.length+1).split('/')[0]))];},async remove(p:string){for(const key of files.keys())if(key===p||key.startsWith(p+'/'))files.delete(key);},async createTextExclusive(p:string,s:string){if(files.has(p))return false;files.set(p,s);return true;}} as ProjectStorage;return {storage,files,fail(){failManifest=true;}};}
function input():Omit<SavedDesignTask,'artifacts'>{const contract=buildDesignTaskContract({intent:'create_screen',request:'新建资料页',deviceProfile:'mobile',frameWidth:390});return {version:1,id:contract.taskId,projectId:'p',createdAt:1,updatedAt:1,state:'blocked',request:contract.request,contextFingerprint:'current',binding:{providerId:'test',model:'m',endpointIdentity:'endpoint-1234'},contract};}
for(const location of ['budget','limits','previous','ancestor'] as const)test(`unknown ${location} budget fields cannot enter a task or become recovery cost evidence`,async()=>{
 const m=memory(),i=input(),budget=new TaskBudget({maxRequests:2,maxRequestedOutputTokens:4000,maxDurationMs:10000,maxRequestDurationMs:10000});budget.reserve(2000).settle();budget.close();
 const valid={...i,budget:budget.snapshot()};const bad=structuredClone(valid) as any;
 if(location==='budget')bad.budget.apiKey='SYNTHETIC_SECRET';
 if(location==='limits')bad.budget.limits.apiKey='SYNTHETIC_SECRET';
 if(location==='previous'||location==='ancestor'){bad.originTaskId='design-original';bad.recovery={version:1,kind:'create',sourceFingerprint:'1234abcd',reusedStepIds:[],...(location==='previous'?{previousBudget:{...budget.snapshot(),apiKey:'SYNTHETIC_SECRET'}}:{ancestors:[{taskId:'design-original',budget:{...budget.snapshot(),apiKey:'SYNTHETIC_SECRET'}}]})};}
 await expect(saveDesignTask(m.storage,bad,[])).rejects.toThrow('清单无效');expect(m.files.size).toBe(0);
 await saveDesignTask(m.storage,valid,[]);const path=`tasks/${i.id}/manifest.json`,raw=JSON.stringify({...bad,artifacts:[]});m.files.set(path,raw);
 expect(await readDesignTask(m.storage,'p',i.id)).toBeUndefined();const index=await listDesignTaskIndex(m.storage,'p',true);expect(index.invalid.map(row=>row.id)).toContain(i.id);expect(JSON.stringify(index)).not.toContain('SYNTHETIC_SECRET');expect(m.files.get(path)).toBe(raw);
});
test('immutable artifact before atomic manifest, exact bytes survive reopen; tampering is isolated',async()=>{
 const m=memory(),i=input();const saved=await saveDesignTask(m.storage,i,[{stepId:'section-1',html:'<article>完整原文</article>',complete:true}]);const reopened=await readDesignTask(m.storage,'p',i.id);
 expect(reopened?.parts[0].html).toBe('<article>完整原文</article>');expect(reopened?.task.id).toBe(i.id);
 m.files.set(saved.artifacts[0].path,'<article>changed</article>');expect(await readDesignTask(m.storage,'p',i.id)).toBeUndefined();
});
test('failed manifest write keeps previous complete manifest and artifacts readable',async()=>{
 const m=memory(),i=input();await saveDesignTask(m.storage,i,[{stepId:'section-1',html:'<article>first</article>',complete:true}]);m.fail();
 await expect(saveDesignTask(m.storage,{...i,updatedAt:2},[{stepId:'section-1',html:'<article>second</article>',complete:true}])).rejects.toThrow('disk full');expect((await readDesignTask(m.storage,'p',i.id))?.parts[0].html).toContain('first');
});
test('two explicit recovery attempts claim once, never authorize the original task or another project',async()=>{
 const m=memory(),i=input(),task=await saveDesignTask(m.storage,i,[]);const result=await Promise.all([claimDesignTaskRecovery(m.storage,task,'design-recovery-a'),claimDesignTaskRecovery(m.storage,task,'design-recovery-b')]);expect(result.filter(Boolean)).toHaveLength(1);
 await expect(claimDesignTaskRecovery(m.storage,task,task.id)).rejects.toThrow('新任务');expect(await readDesignTask(m.storage,'other-project',i.id)).toBeUndefined();
});
test('embedded media rejected and delete only removes a valid owned task',async()=>{
 const m=memory(),i=input();await expect(saveDesignTask(m.storage,i,[{stepId:'part',html:'<img src="data:image/png;base64,YQ==">',complete:true}])).rejects.toThrow();
 await saveDesignTask(m.storage,i,[{stepId:'part',html:'<main>valid</main>',complete:true}]);await removeDesignTask(m.storage,'p',i.id);expect(await readDesignTask(m.storage,'p',i.id)).toBeUndefined();await expect(removeDesignTask(m.storage,'p','../other')).rejects.toThrow();
});
test('partial SVG and incomplete encoded attributes are rejected before writing any draft bytes',async()=>{
 const m=memory(),i=input();for(const html of ['<svg><path d="M0 0','<img src="data:image/png;base64,YQ==','<div style="background:url(data:image/svg+xml,%3Csvg'])await expect(saveDesignTask(m.storage,i,[{stepId:'partial',html,complete:false}])).rejects.toThrow();
 expect(m.files.size).toBe(0);
 await expect(saveDesignTask(m.storage,{...i,binding:{...i.binding,apiKey:'SYNTHETIC_SECRET'}} as any,[])).rejects.toThrow();expect(m.files.size).toBe(0);
});
test('manifest directory identity cannot alias another valid task; bounded IO is used before parsing',async()=>{
 const m=memory(),i=input();await saveDesignTask(m.storage,i,[]);
 m.files.set('tasks/design-alias/manifest.json',m.files.get(`tasks/${i.id}/manifest.json`)!);
 expect(await readDesignTask(m.storage,'p','design-alias')).toBeUndefined();
 const reads:Array<[string,number]>=[];m.storage.readTextLimited=async(path,cap)=>{reads.push([path,cap]);const text=m.files.get(path)??null;if(text!==null&&new TextEncoder().encode(text).length>cap)throw Error('oversize');return text;};
 expect((await readDesignTask(m.storage,'p',i.id))?.task.id).toBe(i.id);expect(reads[0][1]).toBe(800000);
 m.files.set(`tasks/${i.id}/manifest.json`,'中'.repeat(300000));expect(await readDesignTask(m.storage,'p',i.id)).toBeUndefined();
});
test('invalid tasks remain visible as fixed diagnostics; explicit cleanup leaves pages, assets, deliveries and other tasks intact',async()=>{
 const m=memory(),i=input();await saveDesignTask(m.storage,i,[]);
 m.files.set('tasks/design-broken/manifest.json','{"request":"SYNTHETIC_SECRET <svg><path d=hidden');m.files.set('tasks/design-broken/artifacts/unfinished.html','partial');m.files.set('screens/page.html','page');m.files.set('assets/images/a.png','asset');m.files.set('deliveries/a.json','delivery');
 const index=await listDesignTaskIndex(m.storage,'p',true);expect(index.tasks.map(t=>t.id)).toContain(i.id);expect(index.invalid.map(t=>t.id)).toEqual(['design-broken']);expect(JSON.stringify(index)).not.toContain('SYNTHETIC_SECRET');expect(index.hasMore).toBe(false);
 await expect(removeCorruptDesignTask(m.storage,'p','../screens')).rejects.toThrow();await expect(removeCorruptDesignTask(m.storage,'p',i.id)).rejects.toThrow('有效');
 await expect(removeCorruptDesignTask(m.storage,'p','design-broken',()=>false)).rejects.toThrow('变化');expect(m.files.has('tasks/design-broken/manifest.json')).toBe(true);
 await removeCorruptDesignTask(m.storage,'p','design-broken');expect(m.files.has('tasks/design-broken/manifest.json')).toBe(false);expect(m.files.get('screens/page.html')).toBe('page');expect(m.files.get('assets/images/a.png')).toBe('asset');expect(m.files.get('deliveries/a.json')).toBe('delivery');expect((await readDesignTask(m.storage,'p',i.id))?.task.id).toBe(i.id);
});
test('a repaired record cannot be deleted through the broken-record action and scan limits are explicit',async()=>{
 const m=memory(),i=input();m.files.set(`tasks/${i.id}/manifest.json`,'broken');expect((await listDesignTaskIndex(m.storage,'p')).invalid).toHaveLength(1);await saveDesignTask(m.storage,i,[]);await expect(removeCorruptDesignTask(m.storage,'p',i.id)).rejects.toThrow('有效');
 for(let n=0;n<101;n++)m.files.set(`tasks/design-corrupt-${n}/manifest.json`,'broken');const index=await listDesignTaskIndex(m.storage,'p');expect(index.hasMore).toBe(true);expect(index.tasks.length+index.invalid.length).toBe(100);
});
