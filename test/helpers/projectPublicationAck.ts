import {ProjectRepository,ProjectPublicationUnconfirmedError} from '../../src/services/storage/projectRepository';
import type {ProjectStorage} from '../../src/services/storage/projectStorage';
import {createProjectAuthoringSession,projectAuthoringNotice} from '../../src/services/storage/projectAuthoring';
import {readHistoryArchive} from '../../src/services/storage/historyRepository';

/** Real storage first, synthetic response loss second. Only isolated fixtures may call this. */
export async function verifyPublicationAcknowledgements(storage:ProjectStorage){
 const requireThat=(condition:unknown,message:string)=>{if(!condition)throw Error(message);};
 const initial=(await new ProjectRepository(storage).load())!;
 const history=await readHistoryArchive(storage,initial.id,await storage.readText('history.json'));
 const checks=[];
 for(const fault of ['after-commit','before-commit','read-unavailable','third-version'] as const){
  const original=(await new ProjectRepository(storage).load())!,before=await storage.readManagedSnapshot!();
  const desired=structuredClone(original);desired.name='独立故障验证-'+fault;
  const author=createProjectAuthoringSession(storage,original),view=Object.create(storage) as ProjectStorage;
  let writes=0,lost=false;
  view.publishManagedSnapshot=async(expected,changes,resources)=>{
   writes++;if(fault==='before-commit')throw Error('synthetic failure before IO');
   await storage.publishManagedSnapshot!(expected,changes,resources);
   if(fault==='third-version')await storage.writeTextAtomic('screens/page.html','<main>独立故障夹具的第三版本</main>');
   lost=true;throw Error('synthetic dropped response after real storage IO');
  };
  view.readManagedSnapshot=async()=>{if(lost&&fault==='read-unavailable')throw Error('synthetic unavailable acknowledgement check');return storage.readManagedSnapshot!();};
  const repo=new ProjectRepository(view,author);let receipt,error;
  try{receipt=await repo.save(desired,{...(history?{history}:{})});}catch(cause){error=cause;}
  requireThat(writes===1,'A publication was replayed');
  const actual=await storage.readManagedSnapshot!();
  if(fault==='after-commit'){
   requireThat(!error&&receipt?.confirmation==='verified-after-ack-loss'&&receipt.identity===actual.identity,'Actual committed files were not confirmed');
   requireThat((await new ProjectRepository(storage).load())!.name===desired.name,'Confirmed name differs');
  }else if(fault==='before-commit'){
   requireThat(error instanceof Error&&error.message.includes('before IO')&&actual.identity===before.identity,'Definite precommit failure changed storage');
  }else{
   requireThat(error instanceof ProjectPublicationUnconfirmedError&&!!projectAuthoringNotice(author),'Ambiguous author was not suspended');
   requireThat((await new ProjectRepository(storage).load())!.name===desired.name,'Lost response discarded actual committed content');
   try{await repo.save(desired);throw Error('Suspended author saved again');}catch(cause){requireThat(cause instanceof Error&&cause.message.includes('尚未确认'),'Suspension was not enforced');}
   requireThat(writes===1&&(await storage.readManagedSnapshot!()).identity===actual.identity,'Suspended author rewrote storage');
  }
  // Explicit fresh source only; restore this isolated fixture for subsequent checks/restart.
  const fresh=(await new ProjectRepository(storage).load())!;
  await new ProjectRepository(storage,createProjectAuthoringSession(storage,fresh)).save(initial,{...(history?{history}:{})});
  requireThat((await new ProjectRepository(storage).load())!.name===initial.name,'Explicit reopen did not allow a fresh author');
  checks.push({fault,writes,realStorage:true,confirmation:receipt?.confirmation??'rejected',sourceFrozen:!!projectAuthoringNotice(author),explicitReopen:true});
 }
 return {checks,providerCalls:0};
}
