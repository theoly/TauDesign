import {useProjectStore,waitForProjectSave} from '../../src/stores/useProjectStore';
import {useHistoryStore} from '../../src/stores/useHistoryStore';
import {TauriFolderStorage,type ProjectStorage} from '../../src/services/storage/projectStorage';
import {ProjectRepository} from '../../src/services/storage/projectRepository';
import {PageRenderCheck} from '../../src/services/ai/pageRenderCheck';
import {buildDesignTaskContract} from '../../src/services/ai/designWorkflow';
import {DeliveryRepository} from '../../src/services/storage/deliveryRepository';
import {getProjectPublication} from '../../src/services/storage/projectPublication';
import {readPublicationCommits,matchesPublicationCommit} from '../../src/services/storage/projectPublicationRecord';
import {parseHtmlCopy} from '../../src/utils/htmlDocument';
import {inspectText,setDirectText} from '../../src/utils/textNode';
import {saveDesignTask,readDesignTask,listDesignTaskIndex} from '../../src/services/storage/designTaskRepository';
import {saveStagedCandidate,loadStagedCandidate} from '../../src/services/storage/candidateRepository';

/** Actual native storage and render checker, on the runner's isolated root only. No Provider. */
export async function verifyNativeFinalPublication(storage:ProjectStorage,folder:string){
 const assert=(ok:unknown,message:string)=>{if(!ok)throw Error(message);};assert(storage.kind==='folder','Real native folder storage required');
 const doc=(await new ProjectRepository(storage).load())!;assert(useProjectStore.getState().loadProjectDocument(doc,folder),'Native final source did not install');
 const state=useProjectStore.getState(),before=state.screens.page.htmlContent,history=useHistoryStore.getState(),past=history.past.length,checkpoints=history.checkpoints.length;
 const parsed=parseHtmlCopy(before),heading=parsed.doc.querySelector('h1')!;assert(heading,'Source heading missing');setDirectText(heading,inspectText(heading).text+'，原生提交验证');const html=parsed.serialize();
 const contract=buildDesignTaskContract({intent:'modify_screen',request:'保留原文，在标题末尾增加“原生提交验证”',target:state.screens.page,deviceProfile:state.settings.deviceProfile,frameWidth:state.settings.frameWidth,designSystem:state.designSystem,allowedChanges:['screen:page']});
 state.stageScreenChange('page',html,'原生最终采纳',contract.request,contract);
 const candidate=useProjectStore.getState().stagedScreen!,at=Date.now();
 await saveDesignTask(storage,{version:1,id:contract.taskId,projectId:state.id,createdAt:at,updatedAt:at,state:'draft',request:contract.request,contextFingerprint:candidate.inputContextFingerprint!,binding:{providerId:'fixture',model:'synthetic-no-model',endpointIdentity:'fixture'},contract},[{stepId:'page-body',html:candidate.newHtml,complete:true}]);
 const report=await PageRenderCheck.inspect({screen:{...state.screens.page,htmlContent:html},designSystem:state.designSystem,settings:state.settings,assets:Object.values(state.assets),overrides:state.overrides,contentTask:contract},storage);
 assert(report.status==='complete'&&!report.findings.some(f=>f.severity==='error'),'Native real render failed: '+JSON.stringify(report));state.setStagedRenderQuality(state.getStagedRenderContextKey(),report);
 const deadline=Date.now()+10000;while(state.getStagedDeliveryReport().status==='pending'&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,10));
 assert(state.getStagedDeliveryReport().status==='ready','Native delivery gate failed: '+JSON.stringify(state.getStagedDeliveryReport()));
 const publish=TauriFolderStorage.prototype.publishManagedSnapshot;let commits=0,baselineKept=false,historyKept=false,editingBlocked=false;
 TauriFolderStorage.prototype.publishManagedSnapshot=async function(expected,changes,resources){
  if(this.scopeKey===storage.scopeKey){commits++;baselineKept=useProjectStore.getState().screens.page.htmlContent===before;historyKept=useHistoryStore.getState().past.length===past&&useHistoryStore.getState().checkpoints.length===checkpoints;assert(getProjectPublication(),'Native final commit window missing');try{useProjectStore.getState().setName('不得发布的迟到编辑');}catch{editingBlocked=true;}assert(baselineKept&&historyKept&&editingBlocked,'Native UI/History changed before IPC');}
  return publish.call(this,expected,changes,resources);
 };
 try{assert(await state.adoptStagedChange(),'Native adoption failed: '+useProjectStore.getState().stagedAdoptionError);}finally{TauriFolderStorage.prototype.publishManagedSnapshot=publish;}
 assert(commits===1&&getProjectPublication()===null,'Native result was not one ordered publication');
 const saved=(await new ProjectRepository(storage).load())!,archive=(await new DeliveryRepository(storage,state.id).listForScreen('page')).records[0],facts=await readPublicationCommits(storage,state.id);
 assert(saved.screens.page.htmlContent===html&&useProjectStore.getState().screens.page.htmlContent===html,'Native page differs from confirmed storage');
 assert(useHistoryStore.getState().past.length===past+1&&useHistoryStore.getState().checkpoints.length===checkpoints+1,'Native History was not installed once');
 assert(await matchesPublicationCommit(facts.find(row=>row.id===archive.id),{id:archive.id,kind:'candidate',screens:[archive.after]}),'Native durable fact missing');
 useHistoryStore.getState().undo();await waitForProjectSave(state.id,folder);assert((await new ProjectRepository(storage).load())!.screens.page.htmlContent===before,'Native final adoption Undo failed');
 assert((await new DeliveryRepository(storage,state.id).get('page',archive.id))!.status==='applied','Undo erased native historical commit');
 await saveStagedCandidate(state.id,folder,archive.candidate);
 const manifestPath=`tasks/${contract.taskId}/manifest.json`,raw=await storage.readText(manifestPath),savedTask=await readDesignTask(storage,state.id,contract.taskId);
 assert(savedTask?.task.state==='draft'&&savedTask.publication?.id===archive.id,'Native unfinished marker lost its real historical publication');
 assert((await listDesignTaskIndex(storage,state.id)).tasks.length===0&&await storage.readText(manifestPath)===raw,'Native historical scan mutated or revived a saved task');
 assert(await loadStagedCandidate(state.id,folder)===null&&await storage.exists('candidates/current.json'),'Native committed candidate sidecar restored twice or was deleted');
 return {commits,baselineKept,historyKept,editingBlocked,realRender:true,renderFindings:report.findings.length,preview:archive.preview?.status,publicationId:archive.id,taskId:contract.taskId,readOnlyFinalizationRecognition:true,pairedUndo:true,providerCalls:0};
}
