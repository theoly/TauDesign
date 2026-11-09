import {SvgMediaExternalizer} from '../../src/services/import/svgMediaExternalizer';
import {persistImportResources,importResourceAssets} from '../../src/services/import/importResources';
import {createRenderResourceSnapshot} from '../../src/services/storage/renderResourceSnapshot';
import {buildDesignProjectManifest} from '../../src/services/ai/projectManifest';
import {prepareBuiltinMediaAssets} from '../../src/services/ai/builtinMediaAssets';
import {resolveImportedResources} from '../../src/services/import/importResources';
import {DefaultAIEngineCore} from '../../src/services/ai/engine/core/aiEngineCore';
import {createDefaultTransport,type AITransport,type TransportRequest,type StreamEvent} from '../../src/services/ai/engine/transport';
import {PipelineExecutor} from '../../src/services/ai/engine/pipeline/executor';
import {executeStructuredEdit} from '../../src/services/ai/structuredEditExecutor';
import {CanvasToolExecutor} from '../../src/services/tools/canvasToolExecutor';
import {PageRenderCheck} from '../../src/services/ai/pageRenderCheck';
import {useProjectStore} from '../../src/stores/useProjectStore';
import {neutralModernTheme} from '../../src/utils/themePresets';
import {createProjectStorage} from '../../src/services/storage/projectStorage';
import {buildDesignTaskContract,contentFingerprint} from '../../src/services/ai/designWorkflow';
import {pageCreationContext} from '../../src/services/ai/pageCreationValidation';
import {checkGenerationSourceSafety} from '../../src/services/ai/generationQuality';
import {TaskBudget} from '../../src/services/ai/taskBudget';
import {createChatTaskBudget} from '../../src/services/ai/taskBudgetPolicy';
import {compileTokensToCss} from '../../src/utils/cssCompiler';
import {getBaseCss} from '../../src/styles/baseCss';
import {buildExportRenderDocument} from '../../src/utils/pngExporter';
import {buildStandaloneHtml} from '../../src/utils/exportRenderer';
import {resolveProjectViewport} from '../../src/utils/referenceDevice';
import {resolveThemeColors} from '../../src/utils/semanticColors';
import {renderEvidenceIdentity} from '../../src/services/ai/evidenceIdentity';
import {assertExperimentPlan,type ExperimentPlan,type ExperimentRun} from '../../src/services/ai/designKnowledge/experiment';
import {experimentCosts} from '../../src/services/ai/designKnowledge/experimentAccounting';
export {experimentCosts} from '../../src/services/ai/designKnowledge/experimentAccounting';
import type {AIProviderConfig} from '../../src/types/provider';
import type {Screen} from '../../src/types/project';
import type {RenderedQualityReport} from '../../src/utils/renderedQuality';

export interface ExperimentRequestTrace {model:string;providerId:string;maxTokens:number;inputChars:number;rawResponse:string;messages:unknown[];usage?:{inputTokens:number;outputTokens:number};finishReason?:string;error?:string;httpStatus?:number;startedAt:number;finishedAt?:number}
export interface ExperimentProgress {phase:string;requests:number;receivedChars:number;lastActivityAt:number}
export function observeExperimentTransport(transport:AITransport,traces:ExperimentRequestTrace[],progress:()=>void):AITransport{
 return {id:'experiment-observed-'+transport.id,stream(request:TransportRequest,onEvent:(event:StreamEvent)=>void){
  const messages=structuredClone(request.messages??[]),entry:ExperimentRequestTrace={model:request.model??'',providerId:request.provider?.id??'',maxTokens:request.generationOptions?.maxTokens??8192,inputChars:messages.reduce((n,m)=>n+String(m.content??'').length,0),messages,rawResponse:'',startedAt:Date.now()};
  traces.push(entry);progress();
  try{const handle=transport.stream(request,event=>{
   if(event.type==='Delta')entry.rawResponse+=event.text;
   if(event.type==='Usage')entry.usage={inputTokens:event.input_tokens,outputTokens:event.output_tokens};
   if(event.type==='Done')entry.finishReason=event.finish_reason;
   if(event.type==='Error'){entry.error=event.message;if(event.http_status!==undefined)entry.httpStatus=event.http_status;}
   progress();onEvent(event);
  });return {abort:()=>handle.abort(),promise:handle.promise.finally(()=>{entry.finishedAt=Date.now();progress();})};}
  catch(error){entry.error=error instanceof Error?error.message:'Transport failed';entry.finishedAt=Date.now();progress();throw error;}
 }};
}
export function experimentRuntimeFacts(){
 const regular=createChatTaskBudget(true),sectioned=createChatTaskBudget(true);
 const result={themeJson:JSON.stringify(neutralModernTheme),checkerJson:JSON.stringify({mobile:renderEvidenceIdentity('mobile'),pc:renderEvidenceIdentity('pc'),userAgent:navigator.userAgent,dpr:devicePixelRatio}),
  budgetJson:JSON.stringify({workflow:'current-trae-v2-auto',contrast:'contextual-guidance-only',legacySvgPreparation:'external-files-v1',regular:regular.snapshot().limits,sectioned:sectioned.snapshot().limits,local:{maxRequests:2,maxRequestedOutputTokens:3848,maxDurationMs:900000,maxRequestDurationMs:900000}})};
 regular.close();sectioned.close();return result;
}
const severe=(report:RenderedQualityReport|undefined)=>report?.findings.filter(f=>f.severity==='error'&&['render_action_zero_size','render_action_invisible_label','render_compressed_body'].includes(f.code)).length??0;
const redact=(value:unknown,secret:string):any=>{
 if(typeof value==='string')return secret?value.split(secret).join('[REDACTED]'):value;
 if(Array.isArray(value))return value.map(v=>redact(v,secret));
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([k])=>!['apikey','authorization'].includes(k.toLowerCase())).map(([k,v])=>[k,redact(v,secret)]));
 return value;
};
let active=false;
/** Real application path. A test may explicitly inject a controlled transport; reports are never fabricated here. */
export async function runDesignExperimentTrial(plan:ExperimentPlan,runId:string,binding:{provider:AIProviderConfig;model:string},options:{transport?:AITransport;signal?:AbortSignal;onProgress?:(value:ExperimentProgress)=>void}={}){
 assertExperimentPlan(plan);if(active)throw Error('Another experiment trial is still active');
 const run=plan.runs.find(r=>r.id===runId);if(!run||binding.provider.id!==plan.identity.providerId||binding.model!==plan.identity.model)throw Error('Experiment model or run identity changed');
 active=true;const start=performance.now(),scenario=plan.scenarios.find(s=>s.id===run.scenarioId)!;
 const budget=scenario.kind==='local'?new TaskBudget({maxRequests:2,maxRequestedOutputTokens:3848,maxDurationMs:900000,maxRequestDurationMs:900000}):createChatTaskBudget(true);
 const traces:ExperimentRequestTrace[]=[],reports:Array<{screenId:string;report:RenderedQualityReport}>=[];let phase='preparing',lastActivityAt=Date.now();
 const progress=()=>{lastActivityAt=Date.now();try{options.onProgress?.({phase,requests:traces.length,receivedChars:traces.reduce((n,r)=>n+r.rawResponse.length,0),lastActivityAt});}catch{console.warn('[experiment] Progress observer failed');}};
 const setPhase=(value:string)=>{phase=value;progress();};
 const core=new DefaultAIEngineCore(observeExperimentTransport(options.transport??createDefaultTransport(),traces,progress));
 const oldInspect=PageRenderCheck.inspect;PageRenderCheck.inspect=async(...args)=>{setPhase('verifying');const report=await oldInspect(...args);reports.push({screenId:args[0].screen.id,report:structuredClone(report)});return report;};
 let firstPassed=false,finalPassed=false,repairAttempted=false,screen:Screen|undefined,result:unknown,errorMessage:string|undefined,renderDocument:string|undefined,standaloneHtml:string|undefined;
 let status:ExperimentRun['status']='failed',inputPreparation:unknown;
 const rawSecret=String(binding.provider.apiKey??''),secret=rawSecret.trim().replace(/^Bearer\s+/i,'');
 try{
  const store=useProjectStore.getState(),id=store.initNewProject({name:'实验 '+(scenario.title??scenario.id),deviceProfile:scenario.device,designSystem:structuredClone(neutralModernTheme),createSpecimen:false});
  if(scenario.kind==='local'){
   let baseline:Screen={id:'baseline',name:scenario.title??scenario.id,htmlContent:scenario.baselineHtml!,position:{x:0,y:0}};
   if(new DOMParser().parseFromString(baseline.htmlContent,'text/html').querySelector('svg')){
    const state=useProjectStore.getState(),storage=createProjectStorage(id),prepared=await SvgMediaExternalizer.prepare({screen:baseline,settings:state.settings,designSystem:state.designSystem,storage,signal:options.signal});
    if(prepared.removedNids.includes(scenario.targetNid!))throw Error('Frozen edit target was an inner graphic node; explicit reselection required');
    for(const file of prepared.resources.binaries){const old=await storage.readBinary(file.relPath);if(old!==null&&old!==file.base64)throw Error('Prepared baseline resource conflict');}
    await persistImportResources(prepared.resources,storage);
    const audit=createRenderResourceSnapshot(storage);for(const file of prepared.resources.binaries){if(await audit.storage.readBinary(file.relPath)!==file.base64)throw Error('Prepared baseline resource bytes differ');}
    for(const asset of importResourceAssets(prepared.resources))state.addAsset(asset);
    inputPreparation={version:1,kind:'externalize-legacy-svg',rawBaselineFingerprint:contentFingerprint(baseline.htmlContent),preparedBaselineFingerprint:contentFingerprint(prepared.screen.htmlContent),resourceFiles:await audit.files(),removedNids:prepared.removedNids};
    baseline=prepared.screen;
   }
   store.addScreen(baseline,'baseline');
  }
  if(scenario.kind==='create')await prepareBuiltinMediaAssets(options.signal);
  const initial=pageCreationContext(useProjectStore.getState()),current=()=>useProjectStore.getState().id===id&&pageCreationContext(useProjectStore.getState())===initial&&!options.signal?.aborted;
  const state=useProjectStore.getState(),storage=createProjectStorage(id,state.folderPath);
  await budget.run(async signal=>{
   if(scenario.kind==='create'){
    setPhase('generating');
    const output=await PipelineExecutor.execute({input:{rawPrompt:scenario.request,activeScreenId:null,decision:{intent:'create_screen',targetScreenId:null,reason:'冻结实验输入'}},provider:binding.provider,model:binding.model,engineCore:core,
     screens:{},deviceProfile:scenario.device,frameWidth:state.settings.frameWidth,referenceDevice:state.settings.referenceDevice,viewportGuideHeight:state.settings.viewportGuideHeight,
     projectManifest:buildDesignProjectManifest({projectId:id,projectName:state.name,deviceProfile:scenario.device,screens:Object.values(state.screens),assets:Object.values(state.assets),designSystem:state.designSystem}),
     designSystem:state.designSystem,colorMode:state.settings.colorMode,baseSystemPrompt:'',pageTaskPlanning:{},taskBudget:budget,signal,isCurrent:current,
     ...(run.mode==='contextual'?{contextualGuidance:{}}:{}),writeStrategy:scenario.sectioned?'patch':'auto',onPhase:setPhase});
    result={status:output.status,rawResponse:output.rawResponse,reasoningText:output.reasoningText,workflowContract:output.workflowContract,executionRecord:output.executionRecord,qualityReport:output.qualityReport,errorMessage:output.errorMessage,warnings:output.warnings};
    repairAttempted=Boolean(output.workflowContract?.pageTaskPlan?.request.formatRepair);
    if(output.extractedHtml)screen={id:'generated',name:scenario.title??output.artifactMetadata?.title??scenario.id,htmlContent:output.extractedHtml,position:{x:0,y:0}};
    if(output.status!=='applied'||!output.extractedHtml||!output.workflowContract){errorMessage=output.errorMessage??'Pipeline did not produce an accepted complete page';return;}
    if(secret&&output.extractedHtml.includes(secret))throw Error('Response contained a private configuration value; quarantined');
    const created=await CanvasToolExecutor.executeAsync({tool:'create_screen',params:{title:screen!.name,html:output.extractedHtml,workflowContract:output.workflowContract,executionRecord:output.executionRecord}},
     {signal,isCurrent:current,taskBudget:budget,repair:{core,provider:binding.provider,model:binding.model,taskBudget:budget,onPhase:setPhase}});
    repairAttempted=repairAttempted||!!created.repair;finalPassed=created.success;firstPassed=created.success&&!repairAttempted;result={generation:result,delivery:created};
    if(created.success&&created.screenId)screen=useProjectStore.getState().screens[created.screenId];else errorMessage=created.error;
   }else{
    const baseline=state.screens.baseline,contract=buildDesignTaskContract({intent:'modify_screen',request:scenario.request,target:baseline,elementNid:scenario.targetNid,deviceProfile:scenario.device,frameWidth:state.settings.frameWidth,designSystem:state.designSystem});
    setPhase('editing');
    const output=await executeStructuredEdit(core,{mode:'element',screen:baseline,request:scenario.request,contract,settings:state.settings,designSystem:state.designSystem,colorMode:state.settings.colorMode,
     elementNid:scenario.targetNid,binding,allowText:true,taskBudget:budget,signal,isCurrent:current,...(run.mode==='contextual'?{contextualGuidance:{}}:{}),onPhase:setPhase});
    result=output;if(output.status!=='ready'){errorMessage=output.message;return;}
    screen={...baseline,htmlContent:output.html};
    if(!current())throw Error('Trial project changed before staging');
    if(secret&&output.html.includes(secret))throw Error('Response contained a private configuration value; quarantined');
    store.stageScreenChange('baseline',output.html,scenario.title??scenario.id,scenario.request,output.contract,output.executionRecord);
    const check=async()=>{
     setPhase('verifying');const latest=useProjectStore.getState(),candidate=latest.stagedScreen!,key=latest.getStagedRenderContextKey()!;
     const report=await PageRenderCheck.inspect({screen:{...baseline,htmlContent:candidate.newHtml},contentTask:candidate.workflowContract,settings:latest.settings,designSystem:latest.designSystem,assets:Object.values(latest.assets),overrides:latest.overrides},storage,{signal});
     if(signal.aborted||!current()||useProjectStore.getState().stagedScreen?.candidateId!==candidate.candidateId)throw Error('Trial candidate changed during rendering');
     latest.setStagedRenderQuality(key,report);
     const until=performance.now()+10000;
     while(useProjectStore.getState().stagedAssetFiles===null&&performance.now()<until){budget.assertActive();if(!current())throw Error('Trial context changed during file audit');await new Promise(resolve=>setTimeout(resolve,20));}
     return useProjectStore.getState().getStagedDeliveryReport();
    };
    const first=await check();firstPassed=first.status==='ready';finalPassed=firstPassed;result={edit:output,first};
    if(!firstPassed&&useProjectStore.getState().getStagedRepairEligibility().allowed){
     repairAttempted=true;await store.repairStagedCandidate({core,provider:binding.provider,model:binding.model,taskBudget:budget,onPhase:setPhase},signal,current);
     const final=await check();finalPassed=final.status==='ready';result={...result as object,final,repair:useProjectStore.getState().stagedScreen?.repair};
    }
    screen={...baseline,htmlContent:useProjectStore.getState().stagedScreen!.newHtml};
    if(!finalPassed)errorMessage=useProjectStore.getState().getStagedDeliveryReport().checks.find(c=>c.status!=='passed')?.message;
   }
   if(!finalPassed)status='failed';else status='passed';
   if(screen&&checkGenerationSourceSafety(screen.htmlContent,{deviceProfile:scenario.device,designSystem:state.designSystem}).passed){
    const viewport=resolveProjectViewport(state.settings),styles={tokensCss:compileTokensToCss(state.designSystem.tokens,state.settings.colorMode),baseCss:getBaseCss(scenario.device),screenOverrides:'',deviceProfile:scenario.device,useCustomNavigation:state.settings.useCustomNavigation,viewportHeight:viewport.height};
    const resolved=await resolveImportedResources(screen.htmlContent,screen.scopedCss,storage,new Set(Object.values(useProjectStore.getState().assets).map(asset=>asset.relPath)));
    const exportScreen={...screen,...resolved};
    renderDocument=buildExportRenderDocument(exportScreen,{...styles,bgColor:resolveThemeColors(state.designSystem.tokens,state.settings.colorMode).values.background,width:viewport.width});standaloneHtml=buildStandaloneHtml(exportScreen,styles);
   }
  },options.signal);
 }catch(error){errorMessage=error instanceof Error?error.message:'Trial failed';status=options.signal?.aborted?'cancelled':/时限|超时|timeout/i.test(errorMessage)?'timeout':'failed';finalPassed=false;}
 finally{PageRenderCheck.inspect=oldInspect;budget.close();active=false;}
 if(!finalPassed){if(options.signal?.aborted)status='cancelled';else if(/时限|超时|timeout/i.test(errorMessage??''))status='timeout';}
 const record:ExperimentRun={id:runId,planId:plan.id,status,firstPassed,finalPassed,firstSevereLayoutIssues:severe(reports[0]?.report),finalSevereLayoutIssues:severe(reports.at(-1)?.report),durationMs:performance.now()-start,...experimentCosts(traces),imageReady:false,measurementComplete:true};
 setPhase('finished');
 let value:unknown=redact({record,requests:traces,reports,result,errorMessage,repairAttempted,inputPreparation,screen,renderDocument,standaloneHtml,budget:budget.snapshot(),scope:options.transport?'controlled-transport':'live-current-binding'},'');
 for(const valueToRemove of [rawSecret,secret].filter(Boolean))value=redact(value,valueToRemove);
 return value as {record:ExperimentRun;requests:ExperimentRequestTrace[];reports:typeof reports;result:unknown;errorMessage?:string;repairAttempted:boolean;inputPreparation?:unknown;screen?:Screen;renderDocument?:string;standaloneHtml?:string;budget:ReturnType<TaskBudget['snapshot']>;scope:string};
}
