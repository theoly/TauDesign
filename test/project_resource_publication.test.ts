import {expect,spyOn,test} from 'bun:test';
import {LocalStorageStorage,TauriFolderStorage} from '../src/services/storage/projectStorage';
import {browserProjectSnapshotStore} from '../src/services/storage/browserProjectSnapshot';
import {browserResourceFileStore,validatePublicationResources} from '../src/services/storage/browserResourceStore';
import type {RenderResourceFile} from '../src/services/storage/renderResourceSnapshot';
const prefix=()=> 'resource-commit-'+crypto.randomUUID();
const path='assets/images/photo.png',original='AAEC/w==',replacement='AAED/w==';
async function dependency(value=original,relPath=path):Promise<RenderResourceFile>{const bytes=Uint8Array.from(atob(value),c=>c.charCodeAt(0)),hash=await crypto.subtle.digest('SHA-256',bytes.buffer);return {relPath,sha256:Array.from(new Uint8Array(hash),n=>n.toString(16).padStart(2,'0')).join('')};}
async function fixture(){const storage=new LocalStorageStorage(prefix());await storage.writeTextAtomic('project.json','{"id":"original"}');await storage.writeBinary(path,original);const before=await storage.readManagedSnapshot();return {storage,before,files:[await dependency()],changes:[{path:'project.json',contents:'{"id":"new"}'},{path:'screens/page.html',contents:`<main><img src="${path}" alt="图片"></main>`},{path:'history.json',contents:'synthetic paired History'}]};}

test('asset files migrate once into independent browser IO; root listing and tombstones never revive old backups',async()=>{
 const key=prefix();localStorage.setItem(key+':'+path,original);localStorage.setItem(key+':assets/icons/old.svg','PHN2Zy8+');const a=new LocalStorageStorage(key),b=new LocalStorageStorage(key);
 expect(await a.readBinary(path)).toBe(original);await b.writeBinary(path,replacement);expect(localStorage.getItem(key+':'+path)).toBe(original);localStorage.setItem(key+':'+path,'c3RhbGU=');expect(await a.readBinary(path)).toBe(replacement);expect(await a.listDir('')).toContain(path);expect(await a.listDir('assets')).toEqual(['icons/old.svg','images/photo.png']);
 await b.remove('assets/images');expect(await a.readBinary(path)).toBeNull();expect(await a.exists(path)).toBe(false);expect(await a.listDir('')).not.toContain(path);expect(await a.readBinary('assets/icons/old.svg')).toBe('PHN2Zy8+');expect(localStorage.getItem(key+':'+path)).toBe('c3RhbGU=');
});
for(const fault of ['replace','delete'] as const)test(`same project identity but resource ${fault} before final IO rejects pages and History together`,async()=>{
 const f=await fixture();if(fault==='replace')await f.storage.writeBinary(path,replacement);else await f.storage.remove(path);expect((await f.storage.readManagedSnapshot()).identity).toBe(f.before.identity);
 await expect(f.storage.publishManagedSnapshot(f.before.identity,f.changes,f.files)).rejects.toThrow(fault==='replace'?'已变化':'不存在');expect(await f.storage.readManagedSnapshot()).toEqual(f.before);
});
for(const fault of ['replace','delete'] as const)test(`resource ${fault} after hashing but before database CAS is detected inside the final transaction`,async()=>{
 const f=await fixture(),cas=(browserProjectSnapshotStore.compareExchange as any).getMockImplementation() as typeof browserProjectSnapshotStore.compareExchange;let intercepted=false;
 const spy=spyOn(browserProjectSnapshotStore,'compareExchange').mockImplementation(async(scope,expected,next,files)=>{
  if(scope===f.storage.scopeKey&&files?.length){intercepted=true;if(fault==='replace')await new LocalStorageStorage((f.storage as any).prefix).writeBinary(path,replacement);else await f.storage.remove(path);}
  return cas(scope,expected,next,files);
 });
 try{await expect(f.storage.publishManagedSnapshot(f.before.identity,f.changes,f.files)).rejects.toThrow('已变化');expect(intercepted).toBe(true);expect(await f.storage.readManagedSnapshot()).toEqual(f.before);}finally{spy.mockImplementation(cas);}
});
test('checked commit succeeds once with exact independent bytes, and a later resource edit is a subsequent operation',async()=>{
 const f=await fixture();await f.storage.publishManagedSnapshot(f.before.identity,f.changes,f.files);const committed=await f.storage.readManagedSnapshot();expect(committed.files['history.json']).toContain('paired History');expect(committed.files['screens/page.html']).toContain(path);expect(committed.files['project.json']).not.toContain(original);
 await f.storage.writeBinary(path,replacement);expect(await f.storage.readManagedSnapshot()).toEqual(committed);expect(await f.storage.readBinary(path)).toBe(replacement);
});
test('resource IO failure and first-import quota failure preserve prior resources and legacy data',async()=>{
 const f=await fixture(),originalWrite=(browserResourceFileStore.update as any).getMockImplementation(),write=spyOn(browserResourceFileStore,'update').mockRejectedValueOnce(Error('synthetic quota'));try{await expect(f.storage.writeBinary(path,replacement)).rejects.toThrow('quota');expect(await f.storage.readBinary(path)).toBe(original);}finally{write.mockImplementation(originalWrite);}
 const key=prefix(),storage=new LocalStorageStorage(key);localStorage.setItem(key+':'+path,original);const originalInit=(browserResourceFileStore.initialize as any).getMockImplementation(),init=spyOn(browserResourceFileStore,'initialize').mockRejectedValueOnce(Error('synthetic import quota'));try{await expect(storage.readBinary(path)).rejects.toThrow('quota');expect(localStorage.getItem(key+':'+path)).toBe(original);expect(await storage.readBinary(path)).toBe(original);}finally{init.mockImplementation(originalInit);}
});
test('unsafe dependency scopes, duplicate paths and unknown fields never reach native IO',async()=>{
 const valid=await dependency();for(const files of [[{...valid,relPath:'assets/images/../bad.png'}],[{...valid,relPath:'assets/images\\bad.png'}],[{...valid,relPath:'screens/page.html'}],[{...valid,extra:'synthetic'}],[valid,valid]])expect(()=>validatePublicationResources(files)).toThrow();
 const calls:any[]=[],native=new TauriFolderStorage('/synthetic/root',async(name,args)=>{calls.push({name,args});return 'hash' as any;});await native.publishManagedSnapshot('a'.repeat(64),[{path:'project.json',contents:'new'}],[valid]);expect(calls[0].name).toBe('project_publish_snapshot_checked');expect(calls[0].args.resources).toEqual([valid]);expect(JSON.stringify(calls[0].args)).not.toContain(original);
});

test('native string rejections retain their resource failure reason as Error for the shared delivery UI',async()=>{
 const storage=new TauriFolderStorage('/synthetic/root',async()=>{throw '页面资源内容已变化，请重新检查';});
 await expect(storage.publishManagedSnapshot('a'.repeat(64),[{path:'project.json',contents:'new'}],[await dependency()])).rejects.toThrow('资源内容已变化');
});
