import {expect,test,spyOn} from 'bun:test';
import {LocalStorageStorage,TauriFolderStorage} from '../src/services/storage/projectStorage';
import {readTaskArchiveText} from '../src/services/storage/taskArchiveMigration';
const storage=()=>new LocalStorageStorage('task-import-'+crypto.randomUUID());
test('dedicated import is exclusive and publishes the manifest last, including damaged text; ordinary writes cannot bypass it',async()=>{
 const target=storage(),files=[{path:'manifest.json',contents:'{broken'},{path:'artifacts/raw.html',contents:'<main>incomplete'}],events:string[]=[],set=(target as any).setItem.bind(target);const mock=spyOn(target as any,'setItem').mockImplementation(function(key,value){events.push(key);return set(key,value);});
 try{const jobs=await Promise.allSettled([target.importTaskArchive('design-one',files),target.importTaskArchive('design-one',files)]);expect(jobs.filter(job=>job.status==='fulfilled')).toHaveLength(1);expect(events.at(-1)).toEndWith('/manifest.json');expect(await target.readText('tasks/design-one/manifest.json')).toBe('{broken');await expect(target.writeTextAtomic('tasks/design-one/manifest.json','overwrite')).rejects.toThrow('原子任务事务');}finally{mock.mockRestore();}
});
test('quota failure rolls back only this import and leaves existing tasks unchanged',async()=>{
 const target=storage();await target.importTaskArchive('design-kept',[{path:'manifest.json',contents:'kept'}]);const set=(target as any).setItem.bind(target);let count=0;const mock=spyOn(target as any,'setItem').mockImplementation(function(key,value){if(key.includes('design-failed')&&++count===2)throw Error('quota failure');return set(key,value);});
 try{await expect(target.importTaskArchive('design-failed',[{path:'manifest.json',contents:'new'},{path:'artifacts/output.html',contents:'part'}])).rejects.toThrow();expect(await target.listDir('tasks/design-failed')).toEqual([]);expect(await target.readText('tasks/design-kept/manifest.json')).toBe('kept');}finally{mock.mockRestore();}
});
for(const path of ['../outside.json','artifacts/../a.html','artifacts/deeper/a.html','/absolute.json','a\\b.json','.hidden.json'])test(`rejects archive path ${path}`,async()=>{await expect(storage().importTaskArchive('design-safe',[{path,contents:'x'}])).rejects.toThrow();});
test('empty tasks remain diagnosable and cleanup removes their directory marker; standalone tombstones do not use live quota',async()=>{
 const target=storage();for(let i=0;i<40;i++)await target.importTaskArchive('design-empty-'+i,[]);await expect(target.importTaskArchive('design-extra',[])).rejects.toThrow('40');await target.importTaskArchive('design-deleted',[],'marker',false);expect(await target.exists('tasks/.locks/design-deleted.deleted')).toBe(true);await target.deleteDesignTask('design-empty-0',null);expect((await target.listDir('tasks')).some(path=>path==='design-empty-0')).toBe(false);await expect(target.importTaskArchive('design-deleted',[])).rejects.toThrow('删除标记');
});
test('native bridge receives migration-only payload and text reads preserve BOM and reject invalid UTF-8',async()=>{
 const calls:Array<{name:string;args:Record<string,unknown>}>=[];const bridge=new TauriFolderStorage('/virtual/project',async(name,args)=>{calls.push({name,args});return null as any;});await bridge.importTaskArchive('design-native',[{path:'manifest.json',contents:'raw'}],undefined,true);expect(calls[0].name).toBe('project_import_task_archive');expect(calls[0].args.directory).toBe(true);
 const valid={...storage(),kind:'folder' as const,readBinaryLimited:async()=>btoa('\xef\xbb\xbfhello')} as any;expect(await readTaskArchiveText(valid,'tasks/design-one/manifest.json',100)).toBe('\ufeffhello');valid.readBinaryLimited=async()=>'/w==';await expect(readTaskArchiveText(valid,'tasks/design-one/manifest.json',100)).rejects.toThrow('UTF-8');
});
