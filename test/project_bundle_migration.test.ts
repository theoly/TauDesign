import {afterEach,expect,spyOn,test} from 'bun:test';
import {migrateProjectBundle} from '../src/services/storage/projectBundleMigration';
import * as storageModule from '../src/services/storage/projectStorage';
import type {ProjectStorage} from '../src/services/storage/projectStorage';
import {ConversationStore} from '../src/services/storage/conversationStore';
import {ProjectRepository} from '../src/services/storage/projectRepository';
import {neutralModernTheme} from '../src/utils/themePresets';
import {useProjectStore} from '../src/stores/useProjectStore';
import {useWorkspaceStore} from '../src/stores/useWorkspaceStore';
import {useHistoryStore} from '../src/stores/useHistoryStore';
import * as folder from '../src/services/storage/folderPicker';
import {listProjects,readProject} from '../src/utils/projectRegistry';
import * as registry from '../src/utils/projectRegistry';
import {createProjectStorage} from '../src/services/storage/projectStorage';
import {loadStagedCandidate} from '../src/services/storage/candidateRepository';
import {resumeHistoryPersistence} from '../src/services/storage/historyPersistence';
const fresh=()=>new storageModule.LocalStorageStorage('bundle-'+crypto.randomUUID());
async function fixture(){
 const source=fresh(),target=fresh(),doc={id:'bundle-'+crypto.randomUUID(),name:'旧完整工程',settings:{deviceProfile:'mobile',frameWidth:390,viewportGuideHeight:844,colorMode:'light',lodBudget:12},designSystem:neutralModernTheme,screens:{page:{id:'page',name:'资料页',position:{x:0,y:0},htmlContent:'<main><button>保存</button></main>'}},components:{},assets:{},overrides:{}};
 const turn={turnId:'t1',ts:new Date(2026,9,25).getTime(),user:{text:'保留原文',attachments:['assets/images/attachment.png']},assistant:{text:'已完成'}};
 await source.writeTextAtomic('candidates/current.json',JSON.stringify({schemaVersion:1,projectId:doc.id,candidate:{preview:{status:'ready',relPath:'assets/images/candidate-preview-candidate-one-123.png'}}}));
 await source.writeTextAtomic('deliveries/screen-abcdef01/delivery-removed-page.json','{"deletedPage":true}');
 await source.writeTextAtomic('deliveries/restyle/restyle-sample.json','{"history":"keep"}');
 await source.writeTextAtomic('conversations/index.json',JSON.stringify({shards:[{shard:'2026-10',turns:2,firstTs:turn.ts,lastTs:turn.ts}]}));
 const lines=JSON.stringify(turn)+'\n{broken row\n'+JSON.stringify({...turn,turnId:'t2'});await source.writeTextAtomic('conversations/2026-10.jsonl',lines);
 await source.writeBinary('assets/images/attachment.png','aW1hZ2U=');await source.writeBinary('assets/images/candidate-preview-candidate-one-123.png','cHJldmlldw==');
 const historyRaw=JSON.stringify({schemaVersion:1,projectId:doc.id,past:[],future:[],checkpoints:[]});
 const input={sourceJson:JSON.stringify(doc),source,target,historyRaw,readHistory:()=>historyRaw,checkCurrent:()=>{}};
 return {source,target,doc,input,lines};
}
test('完整档案原文与未登记图片复制，坏JSONL行不损坏其它会话',async()=>{
 const f=await fixture(),before=await f.source.readText('conversations/2026-10.jsonl'),r=await migrateProjectBundle(f.input);expect(r.ok).toBe(true);expect(r.archiveFiles).toBe(8);expect(r.warnings.some(w=>w.includes('损坏记录'))).toBe(true);expect(r.warnings.some(w=>w.includes('候选原文'))).toBe(true);
 expect(await f.target.readText('conversations/2026-10.jsonl')).toBe(f.lines);expect(await f.source.readText('conversations/2026-10.jsonl')).toBe(before);
 expect((await new ConversationStore(f.target).loadRecent()).map(t=>t.turnId)).toEqual(['t1','t2']);
 expect(await f.target.readText('deliveries/screen-abcdef01/delivery-removed-page.json')).toBe('{"deletedPage":true}');expect(await f.target.readText('deliveries/restyle/restyle-sample.json')).toBe('{"history":"keep"}');
 expect(await f.target.readBinary('assets/images/attachment.png')).toBe('aW1hZ2U=');expect(await f.target.readText('history.json')).toBe(f.input.historyRaw);expect((await new ProjectRepository(f.target).load())!.screens.page.htmlContent).toBe(f.doc.screens.page.htmlContent);
});
test('无附属档案的旧工程正常迁移，不新增伪候选或会话',async()=>{const f=await fixture();f.input.source=fresh();f.input.historyRaw=null;f.input.readHistory=()=>null as any;const r=await migrateProjectBundle(f.input);expect(r.ok).toBe(true);expect(r.archiveFiles).toBe(0);expect(await f.target.readText('candidates/current.json')).toBeNull();});
for(const path of ['candidates/current.json','deliveries/restyle/restyle-sample.json','conversations/index.json','history.json'])test(`${path}损坏时保留原文和明确诊断`,async()=>{
 const f=await fixture();if(path==='history.json'){f.input.historyRaw='{bad';f.input.readHistory=()=>'{bad';}else await f.source.writeTextAtomic(path,'{bad');const r=await migrateProjectBundle(f.input);expect(r.ok).toBe(true);expect(r.warnings.some(w=>w.includes(path))).toBe(true);expect(await f.target.readText(path)).toBe('{bad');
});
for(const kind of ['missing','unsafe','empty','unknown','month-missing'] as const)test(`${kind}附属资源不静默丢失`,async()=>{
 const f=await fixture();if(kind==='missing')await f.source.remove('assets/images/attachment.png');if(kind==='empty')await f.source.writeBinary('assets/images/attachment.png','');if(kind==='unsafe')await f.source.writeTextAtomic('candidates/current.json','{"preview":{"relPath":"assets/images/../secret.png"}}');if(kind==='unknown')await f.source.writeTextAtomic('deliveries/../outside.json','x');if(kind==='month-missing')await f.source.remove('conversations/2026-10.jsonl');
 const r=await migrateProjectBundle(f.input);expect(r.ok).toBe(false);expect(r.backup).toBe(f.input.sourceJson);expect(await f.target.readText('project.json')).toBeNull();
});
for(const path of ['project.json','candidates/current.json','assets/images/attachment.png','screens/page.html'])test(`目标${path}已存在时零覆盖`,async()=>{
 const f=await fixture();await f.target.writeTextAtomic(path,'DO NOT OVERWRITE');const r=await migrateProjectBundle(f.input);expect(r.ok).toBe(false);expect(r.error).toContain('目标已有');expect(await f.target.readText(path)).toBe('DO NOT OVERWRITE');expect(await f.target.readText('conversations/index.json')).toBeNull();
});
for(const kind of ['write','readback','source-change','new-file','history-change','context-change'] as const)test(`${kind}失败不发布成功或改变源`,async()=>{
 const f=await fixture(),write=f.target.writeTextAtomic.bind(f.target);let stale=false;
 f.target.writeTextAtomic=async(path,text)=>{if(path==='conversations/index.json'){
  if(kind==='write')throw Error('disk full');if(kind==='source-change')await f.source.writeTextAtomic('candidates/current.json','{"changed":true}');if(kind==='new-file')await f.source.writeTextAtomic('conversations/2026-09.jsonl','{}');if(kind==='history-change')f.input.readHistory=()=>null as any;if(kind==='context-change')stale=true;
 }return write(path,kind==='readback'&&path==='conversations/index.json'?'lost':text);};
 f.input.checkCurrent=()=>{if(stale)throw Error('stale workspace');};const r=await migrateProjectBundle(f.input);expect(r.ok).toBe(false);expect(r.backup).toBe(f.input.sourceJson);expect(await f.source.readText('conversations/2026-10.jsonl')).toBe(f.lines);
});
test('原生直接子项目录与浏览器扁平目录清单均能完整复制',async()=>{
 const f=await fixture(),actual=f.source.listDir.bind(f.source);f.source.listDir=async dir=>[...new Set((await actual(dir)).map(name=>name.split('/')[0]))];const r=await migrateProjectBundle(f.input);expect(r.ok).toBe(true);expect(await f.target.readText('deliveries/screen-abcdef01/delivery-removed-page.json')).toBe('{"deletedPage":true}');
});
test('文件数量预算在读写前拒绝，目标不产生主文档',async()=>{const f=await fixture();f.source.listDir=async()=>Array.from({length:5001},(_,i)=>`file${i}.png`);expect((await migrateProjectBundle(f.input)).ok).toBe(false);expect(await f.target.readText('project.json')).toBeNull();});

let restore:(()=>void)[]=[];afterEach(()=>{while(restore.length)restore.pop()!();});
async function workspace(){
 const project=useProjectStore.getState(),ws=useWorkspaceStore.getState(),hist=useHistoryStore.getState();restore.push(()=>{useProjectStore.setState(project,true);useWorkspaceStore.setState(ws,true);useHistoryStore.setState(hist,true);resumeHistoryPersistence();});resumeHistoryPersistence();
 const s=useProjectStore.getState(),id=s.initNewProject({name:'迁移工作区',deviceProfile:'mobile',designSystem:neutralModernTheme,createSpecimen:false});s.addScreen({name:'页面',htmlContent:'<main data-nid="root"><button>原文</button></main>'},'page');s.stageScreenChange('page','<main data-nid="root"><button>候选</button></main>','候选');await loadStagedCandidate(id);await s.saveProjectChecked();
 const target=fresh(),factory=storageModule.createProjectStorage,pick=spyOn(folder,'pickProjectFolder').mockResolvedValue('/virtual/bundle.aidesign'),runtime=spyOn(folder,'isDesktopRuntime').mockReturnValue(true),mock=spyOn(storageModule,'createProjectStorage').mockImplementation((projectId,path)=>path?target:factory(projectId));restore.push(()=>mock.mockRestore(),()=>runtime.mockRestore(),()=>pick.mockRestore());
 return {id,target,pick,source:factory(id)};
}
test('实际迁移保存候选后发布位置，后续修改写入目标且原备份保持',async()=>{
 const f=await workspace(),r=await useWorkspaceStore.getState().migrateProject(f.id);expect(r.ok).toBe(true);expect(listProjects().find(p=>p.id===f.id)?.folderPath).toBe('/virtual/bundle.aidesign');expect(useProjectStore.getState().folderPath).toBe('/virtual/bundle.aidesign');expect((await loadStagedCandidate(f.id,'/virtual/bundle.aidesign'))?.newHtml).toContain('候选');
 const backup=readProject(f.id);useProjectStore.getState().setName('迁移后');await useProjectStore.getState().saveProjectChecked();expect(readProject(f.id)).toBe(backup);expect(JSON.parse((await f.target.readText('project.json'))!).name).toBe('迁移后');
});
test('重复点击只选一次目录，选择期间切工作区不会写入或发布位置',async()=>{
 const f=await workspace();let release!:(path:string)=>void;f.pick.mockImplementation(()=>new Promise(resolve=>release=resolve));const job=useWorkspaceStore.getState().migrateProject(f.id);for(let i=0;i<30&&!release;i++)await new Promise(r=>setTimeout(r,1));
 expect((await useWorkspaceStore.getState().migrateProject(f.id)).ok).toBe(false);useWorkspaceStore.getState().backToManager();release('/virtual/bundle.aidesign');expect((await job).ok).toBe(false);expect(f.pick).toHaveBeenCalledTimes(1);expect(await f.target.readText('project.json')).toBeNull();expect(listProjects().find(p=>p.id===f.id)?.folderPath).toBeUndefined();
});
test('档案总字节按UTF8计算，过大单文件和中文History在复制前拒绝',async()=>{
 for(const kind of ['archive','history']){const f=await fixture();if(kind==='archive'){const read=f.source.readText.bind(f.source);f.source.readText=async path=>path==='candidates/current.json'?'x'.repeat(24*1024*1024+1):read(path);}else{f.input.historyRaw='汉'.repeat(9*1024*1024);f.input.readHistory=()=>f.input.historyRaw!;}
 const result=await migrateProjectBundle(f.input);expect(result.ok).toBe(false);expect(result.error).toContain('预算');expect(await f.target.readText('project.json')).toBeNull();}
});
test('源History起初不存在、复制期间出现也必须拒绝发布',async()=>{
 const f=await fixture();f.input.historyRaw=null;f.input.readHistory=()=>null as any;const write=f.target.writeTextAtomic.bind(f.target);f.target.writeTextAtomic=async(path,text)=>{if(path==='conversations/index.json')f.input.readHistory=()=>'new history';return write(path,text);};
 const result=await migrateProjectBundle(f.input);expect(result.ok).toBe(false);expect(result.error).toContain('源撤销历史已变化');
});
test('二进制目标回读不一致拒绝，源原始预览仍保留',async()=>{
 const f=await fixture(),write=f.target.writeBinary.bind(f.target);f.target.writeBinary=(path)=>write(path,'bG9zdA==');const result=await migrateProjectBundle(f.input);expect(result.ok).toBe(false);expect(result.error).toContain('读回不一致');expect(await f.source.readBinary('assets/images/attachment.png')).toBe('aW1hZ2U=');
});
test('目录选择期间修改源项目不写目标、不关联位置',async()=>{
 const f=await workspace();f.pick.mockImplementation(async()=>{useProjectStore.getState().setName('目录选择后改变');return '/virtual/bundle.aidesign';});const r=await useWorkspaceStore.getState().migrateProject(f.id);expect(r.ok).toBe(false);expect(r.message).toContain('源工程已变化');expect(await f.target.readText('project.json')).toBeNull();expect(listProjects().find(p=>p.id===f.id)?.folderPath).toBeUndefined();
});
test('复制期间切工作区拒绝发布，源备份与目标新工程上下文不混用',async()=>{
 const f=await workspace(),write=f.target.writeTextAtomic.bind(f.target);let switched=false;
 f.target.writeTextAtomic=async(path,text)=>{if(!switched){switched=true;useWorkspaceStore.getState().backToManager();}return write(path,text);};
 const r=await useWorkspaceStore.getState().migrateProject(f.id);expect(r.ok).toBe(false);expect(r.message).toContain('工作区已切换');expect(listProjects().find(p=>p.id===f.id)?.folderPath).toBeUndefined();expect(readProject(f.id)).not.toBeNull();
});
test('注册表吞掉写错误时读回不符必须失败，当前路由仍为原存储',async()=>{
 const f=await workspace(),upsert=registry.upsertMeta;const mock=spyOn(registry,'upsertMeta').mockImplementation(meta=>{if(meta.id===f.id&&meta.folderPath)return;upsert(meta);});restore.push(()=>mock.mockRestore());
 const result=await useWorkspaceStore.getState().migrateProject(f.id);expect(result.ok).toBe(false);expect(result.message).toContain('工程列表位置保存失败');expect(useProjectStore.getState().folderPath).toBeUndefined();expect(listProjects().find(p=>p.id===f.id)?.folderPath).toBeUndefined();expect(readProject(f.id)).not.toBeNull();
});
test('位置已核对发布后仅列表刷新失败不假报迁移失败',async()=>{
 const f=await workspace();useWorkspaceStore.setState({refresh:()=>{throw Error('refresh failed');}});const result=await useWorkspaceStore.getState().migrateProject(f.id);expect(result.ok).toBe(true);expect(listProjects().find(p=>p.id===f.id)?.folderPath).toBe('/virtual/bundle.aidesign');expect(useProjectStore.getState().folderPath).toBe('/virtual/bundle.aidesign');
});
