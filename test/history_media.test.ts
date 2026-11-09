import {afterEach,beforeEach,expect,test} from 'bun:test';
import {LocalStorageStorage,type ProjectStorage} from '../src/services/storage/projectStorage';
import {HistoryRepository,historyKey,readHistoryLocalChecked,saveHistoryLocalOrdered} from '../src/services/storage/historyRepository';
import {prepareHistoryMedia,hydrateHistoryMedia} from '../src/services/storage/historyMedia';
import {loadHistoryForProject,isHistoryPersistenceSuspended,resumeHistoryPersistence,suspendHistoryPersistence} from '../src/services/storage/historyPersistence';
import {useHistoryStore} from '../src/stores/useHistoryStore';

const svg='<svg viewBox="0 0 24 24" data-label="a > b"><!-- > --><g><svg viewBox="0 0 2 2"><path d="M0 0L2 2" /></svg></g></svg>';
function snapshot(html:string){return {past:[{id:'old',label:'转换媒体',timestamp:1,patches:[],inversePatches:[{op:'replace' as const,path:['screens','s','htmlContent'],value:html}]}],future:[],checkpoints:[{id:'c',label:'原稿',timestamp:1,screenSnapshot:{screenId:'s',htmlContent:html}}]};}
const rawValue=(value:Awaited<ReturnType<HistoryRepository['load']>>)=>value?.past[0].inversePatches[0].value;
let prior:ReturnType<typeof useHistoryStore.getState>;
beforeEach(()=>{prior=useHistoryStore.getState();localStorage.clear();});
afterEach(()=>{useHistoryStore.setState(prior,true);resumeHistoryPersistence();});

test('independent historical SVG + binary and percent resources restore exact original HTML/L4 without media JSON',async()=>{
 const storage=new LocalStorageStorage('history-media-test'),repo=new HistoryRepository(storage,'p');
 const percent=encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0L2 2"/></svg>');
 const html=`<main>${svg}<img src="data:image/png;base64,YWJjZA"><img src='data:image/svg+xml,${percent}'><i style="background:url(data:image/png;base64,YWJjZA==)">保留</i></main>`;
 const input=snapshot(html),original=JSON.stringify(input);await repo.save(input);
 const raw=(await storage.readText('history.json'))!;
 expect(raw).not.toContain('<path');expect(raw).not.toContain('base64,YWJjZA');expect(raw).not.toContain('YWJjZA');expect(JSON.parse(raw).schemaVersion).toBe(2);
 expect(await storage.listDir('assets/history')).toHaveLength(3);expect(rawValue(await repo.load())).toBe(html);expect((await repo.load())?.checkpoints[0].screenSnapshot.htmlContent).toBe(html);expect(JSON.stringify(input)).toBe(original);
});

test('legacy v1 remains readable and media-free history keeps its ordinary representation',async()=>{
 const storage=new LocalStorageStorage('history-media-v1'),repo=new HistoryRepository(storage,'p');await repo.save(snapshot('<main>普通文字</main>'));
 expect(JSON.parse((await storage.readText('history.json'))!).schemaVersion).toBe(1);expect(rawValue(await repo.load())).toBe('<main>普通文字</main>');expect(await storage.listDir('assets/history')).toHaveLength(0);
 expect(await new HistoryRepository(storage,'another').load()).toBeNull();
});

test('data URI srcset boundaries are preserved exactly and unsupported media never remains embedded in JSON',async()=>{
 const storage=new LocalStorageStorage('history-srcset'),repo=new HistoryRepository(storage,'p');
 const html='<img srcset="data:image/png;base64,YWJjZA== 1x,data:image/png;base64,YWJjZA== 2x">';await repo.save(snapshot(html));expect(rawValue(await repo.load())).toBe(html);expect(await storage.listDir('assets/history')).toHaveLength(1);
 const before=await storage.readText('history.json');await expect(repo.save(snapshot('<img src="data:application/unknown;base64,YQ==">'))).rejects.toThrow('尚不支持');expect(await storage.readText('history.json')).toBe(before);
});

test('percent SVGs keep literal apostrophes inside a double-quoted resource reference',async()=>{
 const storage=new LocalStorageStorage('history-apostrophe'),repo=new HistoryRepository(storage,'p'),encoded=encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg'><path d='M0 0L2 2'/></svg>");
 const html=`<img src="data:image/svg+xml,${encoded}">`;await repo.save(snapshot(html));expect(rawValue(await repo.load())).toBe(html);expect(await storage.readText('history.json')).not.toContain('%3Cpath');
});

for(const change of ['missing','replaced','path','duplicate','target','prefix'] as const)test(`historical media ${change} cannot become an executable undo patch`,async()=>{
 const storage=new LocalStorageStorage('history-damage-'+change),repo=new HistoryRepository(storage,'p');await repo.save(snapshot('<img src="data:image/png;base64,YWJjZA==">'));
 const raw=(await storage.readText('history.json'))!,doc=JSON.parse(raw),part=doc.mediaStrings[0].parts.find((v:unknown)=>typeof v==='object');
 if(change==='missing')await storage.remove(part.path);if(change==='replaced')await storage.writeBinary(part.path,'eA==');
 if(change==='path')part.path='../outside.png';if(change==='duplicate')doc.mediaStrings.push(doc.mediaStrings[0]);if(change==='target')doc.mediaStrings[0].path=['past',0,'label'];if(change==='prefix')part.prefix='javascript:alert(1),';
 if(!['missing','replaced'].includes(change))await storage.writeTextAtomic('history.json',JSON.stringify(doc));
 await expect(repo.load()).rejects.toThrow();expect(await storage.readText('history.json')).not.toBeNull();
});

test('binary write failure or noncanonical encoding retains the last complete history manifest',async()=>{
 const storage=new LocalStorageStorage('history-write-fail'),repo=new HistoryRepository(storage,'p');await repo.save(snapshot('原归档'));const previous=await storage.readText('history.json');
 const broken=Object.create(storage) as ProjectStorage;broken.writeBinary=async()=>{throw Error('写入失败');};
 await expect(new HistoryRepository(broken,'p').save(snapshot(svg))).rejects.toThrow('写入失败');expect(await storage.readText('history.json')).toBe(previous);
 await expect(repo.save(snapshot('<img src="data:image/png;base64,%%%">'))).rejects.toThrow('精确还原');expect(await storage.readText('history.json')).toBe(previous);
});

test('local History publication is ordered across slow media and subsequent ordinary snapshots',async()=>{
 const first=saveHistoryLocalOrdered('local-p',snapshot(svg)),second=saveHistoryLocalOrdered('local-p',snapshot('较新的动作'));await Promise.all([first,second]);
 expect((await readHistoryLocalChecked('local-p'))?.past[0].inversePatches[0].value).toBe('较新的动作');
 await saveHistoryLocalOrdered('local-p',snapshot(svg));expect(localStorage.getItem(historyKey('local-p'))).not.toContain('<path');expect(rawValue(await readHistoryLocalChecked('local-p'))).toBe(svg);
});

test('unrestorable media reports an explicit diagnostic and does not erase memory or overwrite its archive',async()=>{
 await saveHistoryLocalOrdered('broken-local',snapshot(svg));const original=localStorage.getItem(historyKey('broken-local'))!,doc=JSON.parse(original),resource=doc.mediaStrings[0].parts.find((v:unknown)=>typeof v==='object');
 await new LocalStorageStorage('aidesign:fs:broken-local').remove(resource.path);
 useHistoryStore.getState().restore(snapshot('当前内存动作'));suspendHistoryPersistence();
 expect(await loadHistoryForProject('broken-local')).toBe(false);expect(useHistoryStore.getState().archiveError).toContain('历史媒体恢复失败');expect(rawValue(useHistoryStore.getState())).toBe('当前内存动作');expect(isHistoryPersistenceSuspended()).toBe(true);expect(localStorage.getItem(historyKey('broken-local'))).toBe(original);
});

test('legacy malformed SVG is preserved in independent opaque text, never repaired, discarded or embedded',async()=>{
 const storage=new LocalStorageStorage('history-opaque'),html='<main>原始正文<svg><path d="M0 0"></main>',input=snapshot(html),before=JSON.stringify(input),repo=new HistoryRepository(storage,'p');
 await repo.save(input);const raw=(await storage.readText('history.json'))!,doc=JSON.parse(raw);
 expect(doc.schemaVersion).toBe(3);expect(raw).not.toContain('<svg');expect(raw).not.toContain('<path');expect(await storage.listDir('assets/history')).toHaveLength(1);
 expect(doc.mediaStrings[0].parts[0].kind).toBe('utf8');expect(doc.mediaStrings[0].parts[0].path).toEndWith('.txt');expect(rawValue(await repo.load())).toBe(html);expect(JSON.stringify(input)).toBe(before);
 await expect(hydrateHistoryMedia(JSON.stringify({schemaVersion:3,projectId:'other',mediaStrings:[]}), 'p',storage)).rejects.toThrow('当前工程');
});
for(const fault of ['missing','bytes','version','extension','descriptor'] as const)test(`opaque legacy History ${fault} refuses hydration and preserves its original archive`,async()=>{
 const storage=new LocalStorageStorage('history-opaque-'+fault),repo=new HistoryRepository(storage,'p');await repo.save(snapshot('<svg><path>'));
 const raw=(await storage.readText('history.json'))!,doc=JSON.parse(raw),part=doc.mediaStrings[0].parts[0];
 if(fault==='missing')await storage.remove(part.path);else if(fault==='bytes')await storage.writeBinary(part.path,'dGFtcGVy');else{
  if(fault==='version')doc.schemaVersion=2;if(fault==='extension')part.path=part.path.replace('.txt','.svg');if(fault==='descriptor')part.prefix='data:image/png;base64,';
  await expect(hydrateHistoryMedia(JSON.stringify(doc),'p',storage)).rejects.toThrow();return;
 }
 await expect(repo.load()).rejects.toThrow();expect(await storage.readText('history.json')).toBe(raw);
});
test('opaque archival validates exact UTF8 and discards unused partial extraction outputs',async()=>{
 const storage=new LocalStorageStorage('history-opaque-bounds'),html=svg+'<svg><path>',raw=await prepareHistoryMedia({projectId:'p',savedAt:1,...snapshot(html)},storage);
 expect(await storage.listDir('assets/history')).toHaveLength(1);expect(rawValue(JSON.parse(await hydrateHistoryMedia(raw,'p',storage)))).toBe(html);
 await expect(prepareHistoryMedia({projectId:'p',savedAt:1,...snapshot('<svg>\ud800')},storage)).rejects.toThrow('UTF-8');
});


test('opaque and percent-encoded historical media retain leading UTF8 BOMs byte for byte',async()=>{
 const storage=new LocalStorageStorage('history-bom'),repo=new HistoryRepository(storage,'p');
 const malformed='\uFEFF<main>原文<svg><path>',percent='<img src="data:image/svg+xml,'+encodeURIComponent('\uFEFF<svg xmlns="http://www.w3.org/2000/svg"></svg>')+'">';
 for(const text of [malformed,percent]){await repo.save(snapshot(text));expect(rawValue(await repo.load())).toBe(text);}
});
