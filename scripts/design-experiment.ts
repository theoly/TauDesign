import {mkdir,readFile,writeFile,copyFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {makeExperimentPlan,assertExperimentPlan,blindExperimentIndex,summarizeExperiment,type ExperimentIdentity,type ExperimentScenario,type ExperimentRun,type HumanReview,type ExperimentPlan} from '../src/services/ai/designKnowledge/experiment';
import {buildBlindReviewHtml} from '../src/services/ai/designKnowledge/experimentReview';
import {captureDesignInputs,sha256} from './lib/designEvidenceInputs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),[command,flag,folder,...args]=process.argv.slice(2);
if(!['prepare','bundle','summarize'].includes(command)||flag!=='--output'||!folder)throw Error('Usage: bun scripts/design-experiment.ts prepare|bundle|summarize --output directory [prepare: --seed number; summarize: review.json ...]; prepare reads sanitized identity JSON on stdin.');
const out=resolve(root,folder),read=async<T,>(path:string):Promise<T>=>JSON.parse(await readFile(path,'utf8'));
if(command==='prepare'){
 if(args.length!==2||args[0]!=='--seed')throw Error('prepare requires an explicit frozen --seed');
 let stdin='';for await(const chunk of process.stdin)stdin+=chunk;
 const identity=JSON.parse(stdin) as ExperimentIdentity;
 const inputs=await captureDesignInputs(root),sourceFingerprint=sha256(JSON.stringify(inputs));
 if(identity.sourceFingerprint!==sourceFingerprint)throw Error('Prepared runtime source fingerprint does not match current inputs.');
 const data=await read<{version:number;cases:ExperimentScenario[]}>(resolve(root,'test/fixtures/design-knowledge/generation-v1.json'));if(data.version!==1)throw Error('Unknown generation fixture version');
 const plan=makeExperimentPlan(data.cases,Number(args[1]),identity);await mkdir(out,{recursive:true});
 await writeFile(resolve(out,'input-manifest.json'),JSON.stringify({version:1,createdAt:new Date().toISOString(),sourceSha256:inputs,sourceFingerprint,planFingerprint:sha256(JSON.stringify(plan)),runtime:{bun:process.versions.bun,platform:process.platform,arch:process.arch}},null,2)+'\n',{flag:'wx'});
 await writeFile(resolve(out,'plan.json'),JSON.stringify(plan,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({planId:plan.id,pairs:plan.pairs.length,runs:plan.runs.length,sourceFingerprint}));
}else{
 const plan=await read<ExperimentPlan>(resolve(out,'plan.json'));assertExperimentPlan(plan);
 const manifest=await read<{planFingerprint:string}>(resolve(out,'input-manifest.json'));if(sha256(JSON.stringify(plan))!==manifest.planFingerprint)throw Error('Frozen plan hash changed');
 const runs:ExperimentRun[]=[];for(const run of plan.runs){try{runs.push(await read<ExperimentRun>(resolve(out,'runs',run.id,'record.json')));}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}}
 if(command==='summarize'){
  const reviews=await Promise.all(args.map(path=>read<HumanReview>(resolve(root,path)))),summary=summarizeExperiment(plan,runs,reviews);
  const file=resolve(out,'summary-'+Date.now()+'.json');await writeFile(file,JSON.stringify(summary,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({file,passed:summary.passed,groups:summary.groups,gates:summary.gates,preferenceRate:summary.preferenceRate}));if(!summary.passed)process.exitCode=1;
 }else{
  if(args.length)throw Error('bundle accepts no additional arguments');const index=blindExperimentIndex(plan),publicDir=resolve(out,'review');await mkdir(publicDir,{recursive:true});
  for(const run of plan.runs){const record=runs.find(r=>r.id===run.id);if(record?.imageReady&&record.finalPassed)await copyFile(resolve(out,'runs',run.id,'page.png'),resolve(publicDir,run.id+'.png'));
   else await writeFile(resolve(publicDir,run.id+'.svg'),'<svg xmlns="http://www.w3.org/2000/svg" width="390" height="180" viewBox="0 0 390 180"><rect width="390" height="180" fill="#f0f0f0"/><text x="195" y="90" text-anchor="middle" font-family="sans-serif" font-size="16" fill="#444">尚无可评阅页面预览</text></svg>');}

  // Missing/failed images remain visibly identified in the public index, never silently omitted.
  const publicIndex={...index,pairs:index.pairs.map(p=>({...p,left:runs.some(r=>r.id+'.png'===p.left&&r.imageReady&&r.finalPassed)?p.left:p.left.replace('.png','.svg'),right:runs.some(r=>r.id+'.png'===p.right&&r.imageReady&&r.finalPassed)?p.right:p.right.replace('.png','.svg'),leftAvailable:!!runs.some(r=>r.id+'.png'===p.left&&r.imageReady&&r.finalPassed),rightAvailable:!!runs.some(r=>r.id+'.png'===p.right&&r.imageReady&&r.finalPassed)}))};
  await writeFile(resolve(publicDir,'index.json'),JSON.stringify(publicIndex,null,2)+'\n');await writeFile(resolve(publicDir,'review.html'),buildBlindReviewHtml(publicIndex));
  console.log(JSON.stringify({review:resolve(publicDir,'review.html'),pairs:plan.pairs.length,recorded:runs.length,images:runs.filter(r=>r.imageReady).length,warning:'Serve only this review directory; keep private plan and run records away from reviewers.'}));
 }
}
