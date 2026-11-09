import {createProjectStorage,TauriFolderStorage,type ProjectStorage} from '../../src/services/storage/projectStorage';
import {ProjectRepository,type ProjectDocument} from '../../src/services/storage/projectRepository';
import {useProjectStore} from '../../src/stores/useProjectStore';
import {useHistoryStore} from '../../src/stores/useHistoryStore';
import {PageRenderCheck} from '../../src/services/ai/pageRenderCheck';
import {buildDesignTaskContract} from '../../src/services/ai/designWorkflow';
import {readPublicationCommits} from '../../src/services/storage/projectPublicationRecord';
import {resourcePNGs} from './resourcePng';

/** Actual WKWebView rendering and checked native publication on isolated nested test roots. */
export async function verifyNativeResourcePublication(owner:ProjectStorage,folder:string){
 const assert=(ok:unknown,message:string)=>{if(!ok)throw Error(message);},reports=[];
 const originalDocument=(await new ProjectRepository(owner).load())!;
 try{for(const change of ['replace','delete'] as const){
  const directory='resource-handoff-'+change;await owner.ensureDir(directory);const root=folder+'/'+directory,id='synthetic-resource-'+change,storage=createProjectStorage(id,root),repo=new ProjectRepository(storage),path='assets/images/proof.png';await storage.writeBinary(path,resourcePNGs.original);
  const baseline='<main class="col gap-4 p-4" data-nid="root0001"><h1 class="text-xl" data-nid="heading1">资源提交验证</h1><img class="icon" data-nid="picture1" src="'+path+'" alt="校验图片"><button class="btn btn-primary" data-nid="action01">提交资料</button></main>';
  const doc:ProjectDocument={id,name:'原生资源边界',createdAt:1,schemaVersion:1,settings:structuredClone(originalDocument.settings),designSystem:structuredClone(originalDocument.designSystem),screenOrder:['page'],screens:{page:{id:'page',name:'资源页',position:{x:0,y:0},htmlContent:baseline}},assets:{photo:{id:'photo',name:'校验图片',type:'image',mimeType:'image/png',source:'upload',relPath:path,refCount:1}},overrides:{},components:{}};
  await repo.save(doc,{history:{past:[],future:[],checkpoints:[]}});assert(useProjectStore.getState().loadProjectDocument((await repo.load())!,root),'Resource test source did not open');const state=useProjectStore.getState();
  const parsed=new DOMParser().parseFromString(baseline,'text/html');parsed.querySelector('main')!.classList.replace('p-4','p-6');const html=parsed.body.innerHTML,contract=buildDesignTaskContract({intent:'modify_screen',request:'增加页面留白',target:state.screens.page,deviceProfile:state.settings.deviceProfile,frameWidth:state.settings.frameWidth,designSystem:state.designSystem,allowedChanges:['screen:page']});state.stageScreenChange('page',html,'资源页候选',contract.request,contract);
  const report=await PageRenderCheck.inspect({screen:{...state.screens.page,htmlContent:html},settings:state.settings,designSystem:state.designSystem,assets:Object.values(state.assets),overrides:state.overrides,contentTask:contract},storage);assert(report.status==='complete'&&!report.findings.some(f=>f.severity==='error'),'Native resource render failed: '+JSON.stringify(report));assert(report.resourceFiles?.length===1,'Native resource proof missing');state.setStagedRenderQuality(state.getStagedRenderContextKey(),report);
  const deadline=Date.now()+10000;while(state.getStagedDeliveryReport().status==='pending'&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,10));assert(state.getStagedDeliveryReport().status==='ready','Native resource gate not ready: '+JSON.stringify(state.getStagedDeliveryReport()));
  const before=await storage.readManagedSnapshot!(),history=JSON.stringify({past:useHistoryStore.getState().past,checkpoints:useHistoryStore.getState().checkpoints}),publish=TauriFolderStorage.prototype.publishManagedSnapshot;let checkedCalls=0;
  TauriFolderStorage.prototype.publishManagedSnapshot=async function(expected,changes,resources){
   if(this.scopeKey===storage.scopeKey&&resources?.length){checkedCalls++;assert(resources.length===1&&resources[0].relPath===path,'Final native dependency scope is incomplete');const other=createProjectStorage(id,root);if(change==='replace')await other.writeBinary(path,resourcePNGs.replacement);else await other.remove(path);}
   return publish.call(this,expected,changes,resources);
  };
  try{assert(!await state.adoptStagedChange(),'Native stale resource was accepted');}finally{TauriFolderStorage.prototype.publishManagedSnapshot=publish;}
  assert(checkedCalls===1&&useProjectStore.getState().stagedAdoptionError?.includes(change==='replace'?'已变化':'不存在'),'Native checked rejection missing: '+useProjectStore.getState().stagedAdoptionError);
  assert(JSON.stringify(await storage.readManagedSnapshot!())===JSON.stringify(before),'Native resource failure changed project files');assert(useProjectStore.getState().screens.page.htmlContent===baseline&&JSON.stringify({past:useHistoryStore.getState().past,checkpoints:useHistoryStore.getState().checkpoints})===history,'Native stale resource changed live page or History');assert((await readPublicationCommits(storage,id)).length===0,'Native resource failure published a commit fact');
  await storage.writeBinary(path,resourcePNGs.original);assert(await state.adoptStagedChange(),'Explicit native retry failed: '+useProjectStore.getState().stagedAdoptionError);assert((await readPublicationCommits(storage,id)).length===1,'Explicit native retry was not one real publication');
  reports.push({change,checkedCalls,realRender:true,resourceFiles:report.resourceFiles.length,projectAndHistoryKeptOnFailure:true,explicitRetryPublished:true,providerCalls:0});
 }}finally{assert(useProjectStore.getState().loadProjectDocument((await new ProjectRepository(owner).load())!,folder),'Cannot return to original isolated project');}
 return reports;
}
