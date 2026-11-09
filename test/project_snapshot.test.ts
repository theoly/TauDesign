import {expect,test} from 'bun:test';
import {LocalStorageStorage,TauriFolderStorage} from '../src/services/storage/projectStorage';
import {managedSnapshot,PROJECT_TRANSACTION_STATE,type ProjectFileChange} from '../src/services/storage/managedProjectSnapshot';
import {browserProjectSnapshotStore,readBrowserProject,publishBrowserProject} from '../src/services/storage/browserProjectSnapshot';
const initial={'project.json':'{"id":"original"}','screens/page.html':'\ufeff<main>原文</main>\r\n','screens/page.css':'old CSS'};
const changes=(label:string):ProjectFileChange[]=>[{path:'project.json',contents:JSON.stringify({id:label})},{path:'screens/page.html',contents:`<main>${label}</main>`},{path:'screens/page.css',contents:null},{path:'documents/brief.md',contents:`${label} requirements`}];
const scope=()=> 'snapshot-'+crypto.randomUUID();
test('snapshot identity is deterministic and byte-sensitive, matching native SHA fixtures',async()=>{
 const before=await managedSnapshot(initial);expect(before.identity).toBe('039d5f966573c3ec4db5e053c74a4b31d92a1b71438d1cf06701258b9750b19d');expect((await managedSnapshot({...initial,'screens/page.css':'external change'})).identity).not.toBe(before.identity);
});
test('two storage instances can publish only one whole result for a captured baseline',async()=>{
 const prefix=scope(),a=new LocalStorageStorage(prefix),b=new LocalStorageStorage(prefix);for(const[path,text]of Object.entries(initial))await a.writeTextAtomic(path,text);const before=await a.readManagedSnapshot();
 const result=await Promise.allSettled([a.publishManagedSnapshot(before.identity,changes('one')),b.publishManagedSnapshot(before.identity,changes('two'))]);expect(result.filter(row=>row.status==='fulfilled')).toHaveLength(1);const winner=result[0].status==='fulfilled'?'one':'two',after=await b.readManagedSnapshot();expect(after.files['screens/page.html']).toBe(`<main>${winner}</main>`);expect(after.files['documents/brief.md']).toBe(`${winner} requirements`);expect(after.files['project.json']).toBe(JSON.stringify({id:winner}));expect(after.files['screens/page.css']).toBeUndefined();await expect(a.publishManagedSnapshot(before.identity,changes('stale'))).rejects.toThrow('其它实例');
});
test('ordinary managed writes invalidate the full baseline and cannot bypass a held project lock',async()=>{
 const prefix=scope(),storage=new LocalStorageStorage(prefix);await storage.writeTextAtomic('project.json','old');const before=await storage.readManagedSnapshot();let release!:()=>void,acquired!:()=>void;const ready=new Promise<void>(resolve=>acquired=resolve),gate=new Promise<void>(resolve=>release=resolve);
 const held=navigator.locks.request('design-project:'+prefix+':project',async()=>{acquired();await gate;});await ready;let finished=false;const write=storage.writeTextAtomic('project.json','external').then(()=>{finished=true;});await new Promise(resolve=>setTimeout(resolve,2));expect(finished).toBe(false);release();await Promise.all([held,write]);await expect(storage.publishManagedSnapshot(before.identity,changes('stale'))).rejects.toThrow('未覆盖');expect(await storage.readText('project.json')).toBe('external');
});
test('database commit failure leaves the old complete snapshot and read-only legacy bytes intact',async()=>{
 const key=scope(),legacy=JSON.stringify(initial),before=await readBrowserProject(key,()=>JSON.parse(legacy));
 (browserProjectSnapshotStore.compareExchange as any).mockRejectedValueOnce(Error('synthetic database quota'));
 await expect(publishBrowserProject(key,()=>initial,before.identity,changes('failed'))).rejects.toThrow('synthetic database quota');expect(await readBrowserProject(key,()=>initial)).toEqual(before);expect(JSON.stringify(initial)).toBe(legacy);
});
test('database CAS still rejects a stale publication without relying on the realm-local queue',async()=>{
 const key=scope(),before=await readBrowserProject(key,()=>initial);const results=await Promise.allSettled(['one','two'].map(label=>publishBrowserProject(key,()=>initial,before.identity,changes(label))));expect(results.filter(row=>row.status==='fulfilled')).toHaveLength(1);const after=await readBrowserProject(key,()=>initial);expect(after.files['project.json']).toBe(JSON.stringify({id:results[0].status==='fulfilled'?'one':'two'}));
});
test('legacy file keys are imported once, kept as backup, and never read or written as a second authority',async()=>{
 const prefix=scope();for(const[path,text]of Object.entries(initial))localStorage.setItem(prefix+':'+path,text);const storage=new LocalStorageStorage(prefix),before=await storage.readManagedSnapshot();expect(before.files).toEqual(initial);await storage.publishManagedSnapshot(before.identity,changes('new'));
 expect(localStorage.getItem(prefix+':project.json')).toBe(initial['project.json']);localStorage.setItem(prefix+':project.json','stale cached legacy edit');expect(await storage.readText('project.json')).toBe('{"id":"new"}');expect(await storage.listDir('screens')).not.toContain('page.css');expect(await storage.readText('screens/page.css')).toBeNull();expect(await storage.listDir('')).toContain('project.json');expect(await storage.listDir('')).not.toContain('screens/page.css');
});
test('damaged database rows remain diagnostic and cannot be overwritten through normal reads',async()=>{
 const key=scope(),before=await readBrowserProject(key,()=>initial);await browserProjectSnapshotStore.compareExchange(key,before,{...before,files:{...before.files,'screens/page.html':'tampered'}});await expect(readBrowserProject(key,()=>initial)).rejects.toThrow('完整性');expect((await browserProjectSnapshotStore.read(key))!.files['screens/page.html']).toBe('tampered');
});
test('the pre-History database scope imports only legacy History once without replacing its authoritative pages',async()=>{
 const key=scope(),old=await managedSnapshot(initial),raw='legacy history bytes';await browserProjectSnapshotStore.compareExchange(key,null,old);
 const upgraded=await readBrowserProject(key,()=>({'project.json':'stale backup','history.json':raw}));expect(upgraded.files).toEqual({...initial,'history.json':raw});
 await publishBrowserProject(key,()=>({'history.json':raw}),upgraded.identity,[{path:'history.json',contents:null}]);expect((await readBrowserProject(key,()=>{throw Error('Backup must not be read twice');})).files['history.json']).toBeUndefined();
});
test('private IO, invalid paths, duplicate files, extra fields and non-lossless strings are rejected',async()=>{
 const key=scope(),before=await readBrowserProject(key,()=>initial);for(const patch of [[{path:'../project.json',contents:'x'}],[{path:'.project-state/pending.json',contents:'x'}],[{path:'assets/images/a.png',contents:'x'}],[{path:'project.json',contents:'x',apiKey:'synthetic'}],[{path:'project.json',contents:'\ud800'}],[{path:'project.json',contents:'a'},{path:'project.json',contents:'b'}]])await expect(publishBrowserProject(key,()=>initial,before.identity,patch as any)).rejects.toThrow();expect((await readBrowserProject(key,()=>initial)).files).toEqual(before.files);
 const storage=new LocalStorageStorage(scope());for(const run of [()=>storage.readText('./.project-state/pending.json'),()=>storage.writeTextAtomic('.project-state/pending.json','{}'),()=>storage.remove('.project-state'),()=>storage.listDir('.project-state')])await expect(run()).rejects.toThrow('条件发布');
});
test('without Web Locks ordinary reads remain available, but writes are refused',async()=>{
 const storage=new LocalStorageStorage(scope());await storage.writeTextAtomic('project.json','old');const descriptor=Object.getOwnPropertyDescriptor(navigator,'locks');try{Object.defineProperty(navigator,'locks',{configurable:true,value:undefined});expect(await storage.readText('project.json')).toBe('old');await expect(storage.readManagedSnapshot()).rejects.toThrow('排他锁');await expect(storage.writeTextAtomic('project.json','new')).rejects.toThrow('排他锁');}finally{if(descriptor)Object.defineProperty(navigator,'locks',descriptor);}
});
test('an unpublished legacy localStorage journal is diagnosed before first import',async()=>{
 const prefix=scope();localStorage.setItem(prefix+':'+PROJECT_TRANSACTION_STATE,'{}');await expect(new LocalStorageStorage(prefix).readManagedSnapshot()).rejects.toThrow('待核对');
});
test('native bridge forwards the validated existing-file publication contract',async()=>{
 const calls:Array<{name:string;args:Record<string,unknown>}>=[],bridge=new TauriFolderStorage('/virtual/project',async(name,args)=>{calls.push({name,args});return 'hash' as any;});await bridge.readManagedSnapshot();await bridge.publishManagedSnapshot('a'.repeat(64),changes('new'));expect(calls.map(row=>row.name)).toEqual(['project_managed_snapshot','project_publish_snapshot']);expect(calls[1].args).toMatchObject({root:'/virtual/project',expected:'a'.repeat(64),changes:changes('new')});
});
