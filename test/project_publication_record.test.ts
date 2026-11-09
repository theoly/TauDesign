import {expect,spyOn,test} from 'bun:test';
import {LocalStorageStorage} from '../src/services/storage/projectStorage';
import {ProjectRepository,projectReceiptMatches,type ProjectDocument} from '../src/services/storage/projectRepository';
import {readPublicationCommits,matchesPublicationCommit,parsePublicationCommits} from '../src/services/storage/projectPublicationRecord';
import {neutralModernTheme} from '../src/utils/themePresets';

async function fixture(){
 const storage=new LocalStorageStorage('publication-record-'+crypto.randomUUID()),repo=new ProjectRepository(storage),doc:ProjectDocument={id:'synthetic',name:'提交事实',settings:{deviceProfile:'pc'},designSystem:neutralModernTheme as any,screenOrder:['page'],screens:{page:{id:'page',name:'页面',htmlContent:'<main>原文</main>',position:{x:0,y:0}}},components:{card:{id:'card',name:'组件',templateHtml:'<article>组件原文</article>'}}};
 await repo.save(doc);return {storage,repo,doc};
}
const publication={id:'restyle-fixture-record',kind:'restyle' as const,screenIds:['page'],componentIds:['card']};
test('the project commit fact binds all changed page CSS and component HTML in the same publication',async()=>{
 const f=await fixture(),before=await f.storage.readManagedSnapshot();f.doc.screens.page.htmlContent='<main>新版正文</main>';f.doc.screens.page.scopedCss='main{color:var(--color-text-primary)}';(f.doc.components as any).card.templateHtml='<article>组件新版</article>';
 const history={past:[{id:'new',label:'整次修改',timestamp:1,patches:[],inversePatches:[]}],future:[],checkpoints:[]},spy=spyOn(f.storage,'publishManagedSnapshot');
 try{await f.repo.save(f.doc,{publication,history});expect(spy).toHaveBeenCalledTimes(1);const commits=await readPublicationCommits(f.storage,f.doc.id);expect(commits).toHaveLength(1);expect(commits[0].beforeIdentity).toBe(before.identity);
  const expected={id:publication.id,kind:publication.kind,screens:[f.doc.screens.page as any],components:[(f.doc.components as any).card]};expect(await matchesPublicationCommit(commits[0],expected)).toBe(true);expect(await matchesPublicationCommit(commits[0],{...expected,screens:[{...expected.screens[0],scopedCss:'different'}]})).toBe(false);expect(await matchesPublicationCommit(commits[0],{...expected,components:[{id:'card',templateHtml:'changed'}]})).toBe(false);expect(await matchesPublicationCommit(commits[0],{...expected,screens:[]})).toBe(false);expect(await f.storage.readText('history.json')).toContain('整次修改');
 }finally{spy.mockRestore();}
});
test('ordinary saves and reused document objects cannot erase/replace earlier commit facts; duplicate result IDs never publish',async()=>{
 const f=await fixture();await f.repo.save(f.doc,{publication});const commits=await readPublicationCommits(f.storage,f.doc.id);(f.doc as any).publicationCommits=[];f.doc.name='旧文档对象继续';await f.repo.save(f.doc);expect(await readPublicationCommits(f.storage,f.doc.id)).toEqual(commits);
 delete (f.doc as any).publicationCommits;await f.repo.save(f.doc);expect(await readPublicationCommits(f.storage,f.doc.id)).toEqual(commits);const before=await f.storage.readManagedSnapshot();await expect(f.repo.save(f.doc,{publication})).rejects.toThrow('重复');expect(await f.storage.readManagedSnapshot()).toEqual(before);
});
test('serialized receipts and historical facts cannot stand in for a live process publication receipt',async()=>{
 const f=await fixture(),receipt=await f.repo.save(f.doc,{publication}),screens=[f.doc.screens.page as any];expect(projectReceiptMatches(receipt,f.doc.id,publication.id,'restyle',screens)).toBe(true);expect(projectReceiptMatches(structuredClone(receipt),f.doc.id,publication.id,'restyle',screens)).toBe(false);expect(projectReceiptMatches(receipt,f.doc.id,publication.id,'batch',screens)).toBe(false);expect(projectReceiptMatches(receipt,f.doc.id,publication.id,'restyle',[{...screens[0],htmlContent:'different'}])).toBe(false);
});
test('an IO failure cannot publish a fact independently of the page and History',async()=>{
 const f=await fixture(),before=await f.storage.readManagedSnapshot(),spy=spyOn(f.storage,'publishManagedSnapshot').mockRejectedValueOnce(Error('synthetic no space'));f.doc.screens.page.htmlContent='<main>未提交</main>';
 try{await expect(f.repo.save(f.doc,{publication,history:{past:[],future:[],checkpoints:[]}})).rejects.toThrow('no space');expect(await f.storage.readManagedSnapshot()).toEqual(before);expect(await readPublicationCommits(f.storage,f.doc.id)).toEqual([]);}finally{spy.mockRestore();}
});
test('partial scopes and component IDs outside the proposed full project are refused before any managed write',async()=>{
 const f=await fixture(),before=await f.storage.readManagedSnapshot();for(const bad of [{...publication,screenIds:['missing']},{...publication,screenIds:['page','page']},{...publication,componentIds:['missing']},{...publication,screenIds:[],componentIds:[]},{...publication,extra:'synthetic-untrusted'}])await expect(f.repo.save(f.doc,{publication:bad as any})).rejects.toThrow();expect(await f.storage.readManagedSnapshot()).toEqual(before);
});
test('malformed publication facts are preserved and make a reopened author read-only instead of being repaired or dropped',async()=>{
 const f=await fixture();await f.repo.save(f.doc,{publication});const valid=(await readPublicationCommits(f.storage,f.doc.id))[0];
 for(const changed of [{...valid,beforeIdentity:[valid.beforeIdentity]},{...valid,screens:[{...valid.screens[0],htmlSha256:[valid.screens[0].htmlSha256]}]},{...valid,extra:'synthetic-unknown'},null])expect(()=>parsePublicationCommits([changed],f.doc.id)).toThrow('损坏');
 const root=JSON.parse((await f.storage.readText('project.json'))!);root.publicationCommits=[{...valid,beforeIdentity:[valid.beforeIdentity]}];await f.storage.writeTextAtomic('project.json',JSON.stringify(root));const before=await f.storage.readManagedSnapshot(),opened=(await new ProjectRepository(f.storage).load())!;await expect(new ProjectRepository(f.storage).save(opened)).rejects.toThrow('提交事实损坏');expect(await f.storage.readManagedSnapshot()).toEqual(before);
});
