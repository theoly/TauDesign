/** Developer-only local evidence audit. No model/upload entry point; never changes user preferences. */
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {assertExperimentPlan,summarizeExperiment,type ExperimentPlan,type ExperimentRun,type HumanReview} from '../src/services/ai/designKnowledge/experiment';
import {experimentCosts,type ExperimentCostTrace} from '../src/services/ai/designKnowledge/experimentAccounting';
import {designRuleRolloutReadiness} from '../src/services/ai/designKnowledge/rollout';
import {offlinePartitionGates} from '../src/services/ai/designKnowledge/offlineEvaluation';
import {captureDesignInputs,sha256} from './lib/designEvidenceInputs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),args=process.argv.slice(2),paths:Record<string,string>={},reviews:string[]=[];
for(let i=0;i<args.length;i++){
 const key=args[i],value=args[++i];if(!value)throw Error('Missing argument');
 if(key==='--review')reviews.push(resolve(root,value));else if(['--experiment','--offline','--acceptance'].includes(key)&&!paths[key])paths[key]=resolve(root,value);else throw Error('Unknown or duplicate argument');
}
if(!paths['--experiment']||!paths['--offline']||!paths['--acceptance'])throw Error('Usage: bun scripts/check-design-rollout.ts --experiment DIR --offline DIR --acceptance DIR [--review FILE ...]');
const read=async<T=any>(path:string):Promise<T>=>JSON.parse(await readFile(path,'utf8'));
const optional=async(path:string)=>{try{return await read(path);}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return {};throw error;}};
const exp=paths['--experiment'],plan=await read<ExperimentPlan>(resolve(exp,'plan.json')),manifest=await read(resolve(exp,'input-manifest.json'));assertExperimentPlan(plan);
if(sha256(JSON.stringify(plan))!==manifest.planFingerprint)throw Error('Frozen plan changed');
const current=await captureDesignInputs(root),sourceFingerprint=sha256(JSON.stringify(current)),same=(value:unknown)=>JSON.stringify(value)===JSON.stringify(current);
if(sourceFingerprint!==plan.identity.sourceFingerprint||!same(manifest.sourceSha256))throw Error('Experiment executable inputs are stale');
const runs:ExperimentRun[]=[];let traceAccountingVerified=true;
for(const run of plan.runs){
 try{
  const record=await read<ExperimentRun>(resolve(exp,'runs',run.id,'record.json'));runs.push(record);
  const evidence=await read<{scope:string;record:ExperimentRun;requests:ExperimentCostTrace[]}>(resolve(exp,'runs',run.id,'evidence.json'));
  const cost=experimentCosts(evidence.requests);
  if(evidence.scope!=='live-current-binding'||JSON.stringify(evidence.record)!==JSON.stringify(record)||Object.entries(cost).some(([key,value])=>record[key as keyof ExperimentRun]!==value))traceAccountingVerified=false;
  if(record.imageReady){const png=await readFile(resolve(exp,'runs',run.id,'page.png')),image=await read(resolve(exp,'runs',run.id,'image.json'));
   if(png.length<24||!png.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||image.sha256!==sha256(png)||image.width!==png.readUInt32BE(16)||image.height!==png.readUInt32BE(20)||image.engine!=='playwright-chromium'||image.scope!=='browser-export-document')traceAccountingVerified=false;}
 }catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT'){traceAccountingVerified=false;continue;}throw error;}
}
const summary=summarizeExperiment(plan,runs,await Promise.all(reviews.map(path=>read<HumanReview>(path))));
const offline=await optional(resolve(paths['--offline'],'report.json')),offlineManifest=await optional(resolve(paths['--offline'],'input-manifest.json'));
// Only evaluator/selector runtime dependencies govern the original held-out result.
// Unused experiment/review modules may be developed afterward; never rerun or tune the held-out selector here.
const offlinePaths=['catalog','selector','safety','types','calibration','evaluation','offlineEvaluation'].map(name=>`src/services/ai/designKnowledge/${name}.ts`).concat(['scripts/evaluate-design-offline.ts','test/fixtures/design-knowledge/relevance-v1.json','package.json','bun.lock']);
let offlineCurrent=true;for(const path of offlinePaths){const actual=sha256(await readFile(resolve(root,path)));if(offline.sourceSha256?.[path]!==actual||offlineManifest.sourceSha256?.[path]!==actual)offlineCurrent=false;}
const cal=offline.calibration?.contextual,held=offline.heldOut?.contextual;
const offlinePassed=!!cal&&!!held&&Object.values(offlinePartitionGates(cal)).every(Boolean)&&Object.values(offlinePartitionGates(held)).every(Boolean)&&cal.rows.length===40&&held.rows.length===20&&cal.rows.every((r:any)=>r.correct)&&cal.negative.total+held.negative.total>=20&&held.negative.total>=10&&Object.values(offline.scope??{}).length===4&&Object.values(offline.scope).every((v:any)=>Array.isArray(v)&&v.length===0)&&offline.inputsUnchanged===true;
const acceptanceRoot=paths['--acceptance'],acceptance=await optional(resolve(acceptanceRoot,'result.json')),native=await optional(resolve(acceptanceRoot,'native/result.json'));
const finalAcceptanceCurrent=acceptance.inputsUnchanged===true&&same(acceptance.sourceInputs)&&JSON.stringify(acceptance.testInputs)===JSON.stringify(await captureDesignInputs(root,true)),nativeCurrent=native.inputsUnchanged===true&&same(native.sourceInputs);
const required=['unit','types','build','browser','native'];let finalAcceptancePassed=acceptance.status==='passed'&&acceptance.scope==='final-source-acceptance'&&Array.isArray(acceptance.commands)&&acceptance.commands.length===required.length;
for(const name of required){const command=acceptance.commands?.find((v:any)=>v.name===name);if(!command||command.exitCode!==0||command.log!==name+'.log'||sha256(await readFile(resolve(acceptanceRoot,command.log)))!==command.sha256)finalAcceptancePassed=false;}
const nativePassed=native.status==='passed'&&native.originalsUnchanged===true&&Array.isArray(native.phases)&&native.phases.length===2&&['save','reopen'].every(phase=>native.phases.some((p:any)=>p.phase===phase&&p.status==='passed'&&p.runtime==='real-tauri'&&['mobile','pc'].every(device=>p.projects.some((v:any)=>v.device===device))))&&native.images?.length>=4;
const decision=designRuleRolloutReadiness(summary,{offlineCurrent,offlinePassed,traceAccountingVerified,nativeCurrent,nativePassed,finalAcceptanceCurrent,finalAcceptancePassed});
const file=resolve(exp,'rollout-'+Date.now()+'.json');await writeFile(file,JSON.stringify({...decision,experiment:summary,artifacts:{offline:paths['--offline'],acceptance:acceptanceRoot},sourceFingerprint},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({file,eligible:decision.eligible,mode:decision.mode,blockers:decision.blockers,defaultEnabled:decision.defaultEnabled}));if(!decision.eligible)process.exitCode=1;
