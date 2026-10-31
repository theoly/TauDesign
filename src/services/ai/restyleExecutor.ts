import type { AIEngineCore, StreamTextOptions } from './engine/core/types';
import type { QualityOptions } from './generationQuality';
import type { DesignTaskContract } from './designWorkflow';
import { streamWithContinuation } from './boundedContinuation';
import { finalizeModelHtml } from './modelHtmlResult';
import { modelExecutionRecord } from './designExecutionRecord';
import { acceptRestyleResult, type RestyleOutcome, type RestyleTarget } from './restyleService';
import {createRestylePatchPlan,executeRestylePatches,RESTYLE_PATCH_THRESHOLD} from './restylePatches';
import {TaskBudget,withTaskBudget} from './taskBudget';
import {buildContextualCraft,renderFrozenCraft} from './designKnowledge/promptAdapter';
import {renderCraftSection} from './craft';
import {selectTokenGuidance} from './designKnowledge/tokenWindow';
import {compileTokensToCss} from '../../utils/cssCompiler';
import {makeGuidancePacket,guidancePacketIssue,withGuidanceReceipts} from './designKnowledge/receipt';
import type {RuleFeature} from './designKnowledge/types';
import {resolveWorkflowValidation} from './workflowValidation';
import {pageRuleFeatures} from './designKnowledge/targetFeatures';

/** The UI assembles the task context; execution, stream failure and terminal HTML handling stay in services. */
async function executeTarget(core: AIEngineCore, options: {
  target: RestyleTarget; contract: DesignTaskContract; request: StreamTextOptions; quality: QualityOptions; onValidation?: () => void;
  patchContext?:string;onGroup?:(index:number,total:number)=>void;
  colorMode?:'light'|'dark';
  contextualGuidance?:{features?:RuleFeature[]};
  taskBudget?:TaskBudget;
}): Promise<RestyleOutcome> {
  const { target, contract: workflowContract, request, quality } = options;
  const protocol=target.html.length>RESTYLE_PATCH_THRESHOLD?'style-patch-json':'html';
  if(options.contextualGuidance||workflowContract.designGuidance){
    const validation=resolveWorkflowValidation(workflowContract,workflowContract.workflowId==='restyle-batch'?'batch':'candidate',{preflight:true});
    if(!validation.ok)throw Error(validation.message);
    if(workflowContract.operation!=='restyle'||workflowContract.target?.id!==target.id||workflowContract.device.profile!==(quality.deviceProfile??'pc')||
      JSON.stringify([...workflowContract.protectedNids].sort())!==JSON.stringify([...(target.protectedNids??[])].sort()))throw Error('重塑规则与原任务、设备或保护范围不匹配。');
    if(protocol==='style-patch-json'&&!quality.designSystem)throw Error('大页样式补丁缺少项目主题。');
    if(workflowContract.designGuidance&&(workflowContract.designGuidance.protocol??'html')!==protocol)throw Error('规则快照与本次重塑输出协议不匹配。');
    if(!workflowContract.designGuidance){
      const query={request:workflowContract.request,operation:workflowContract.operation,device:quality.deviceProfile??'pc',scope:'page' as const,features:options.contextualGuidance?.features??pageRuleFeatures(target.html),maxChars:10000};
      const selection=protocol==='html'?buildContextualCraft('modify_screen',query).selection:
        selectTokenGuidance(compileTokensToCss(quality.designSystem!.tokens,options.colorMode??'light',quality.deviceProfile??'pc'),query,'css');
      workflowContract.designGuidance=makeGuidancePacket(workflowContract,selection,protocol);
    }
    const issue=guidancePacketIssue(workflowContract,false);if(issue)throw Error(issue);
    if(protocol==='html'&&workflowContract.designGuidance.selection.body){
      const baseline=renderCraftSection('modify_screen'),body=renderFrozenCraft('modify_screen',workflowContract.designGuidance.selection);
      const candidates=request.messages.filter(m=>m.role==='system'&&m.content.includes(baseline));
      if(candidates.length!==1)throw Error('本次重塑缺少唯一可替换的工艺窗口，未请求模型。');
      candidates[0].content=candidates[0].content.replace(baseline,body);
    }
    core=withGuidanceReceipts(core,workflowContract,workflowContract.designGuidance);
  }
  // Denied reservations create neither a request receipt nor monitored model activity.
  if(options.taskBudget)core=withTaskBudget(core,options.taskBudget);
  const verifyGuidance=()=>{const issue=guidancePacketIssue(workflowContract);if(issue)throw Error(issue);};
  if(target.html.length>RESTYLE_PATCH_THRESHOLD){
    if(!quality.designSystem)throw new Error('大页样式补丁缺少项目主题。');
    const patched=await executeRestylePatches(core,{target,request,designSystem:quality.designSystem,deviceProfile:quality.deviceProfile??'pc',colorMode:options.colorMode,context:options.patchContext,onGroup:options.onGroup,guidanceSelection:workflowContract.designGuidance?.selection});
    verifyGuidance();
    options.onValidation?.();
    if(!patched.changed)return {target,status:'skipped_unchanged',message:'未发现需要修改的样式，原页面保持原样，可选择其他试跑目标。',workflowContract,
      executionRecord:{source:'model',rawResponse:patched.rawResponse,continuationCount:0,warnings:[]}};
    const outcome=acceptRestyleResult(target,patched.html,quality,workflowContract);
    return {...outcome,executionRecord:{source:'model',rawResponse:patched.rawResponse,continuationCount:0,warnings:[],
      ...(outcome.status==='applied'?{completeHtml:patched.html}:{errorMessage:outcome.message})}};
  }
  const result = await streamWithContinuation(core, request, { allowContinuation: true });
  if(!result.errorMessage)verifyGuidance();
  if(!result.errorMessage)options.onValidation?.();
  const finalized = finalizeModelHtml(result, { ...quality, baselineHtml: target.html, protectedNids: target.protectedNids,
    preserveNids: true, signal: request.signal, allowRawFragment: true });
  if (!finalized.html) {
    const detail = result.warnings.at(-1);
    const message = finalized.status === 'no_html' ? result.finishReason === 'length'
      ? `模型输出达到上限，页面 HTML 未完整返回；原页面未修改。${detail ? ` ${detail}` : ''}`
      : detail ? `未能提取完整 HTML：${detail}` : '模型未返回完整、有效的 HTML；原页面未修改。'
      : finalized.message;
    return { target, status: 'failed', message, workflowContract, qualityReport: finalized.qualityReport,
      executionRecord: modelExecutionRecord(result, { errorMessage: message, qualityReport: finalized.qualityReport }) };
  }
  const outcome = acceptRestyleResult(target, finalized.html, quality, workflowContract);
  return { ...outcome, executionRecord: modelExecutionRecord(result, {
    completeHtml: outcome.status === 'applied' ? finalized.html : undefined,
    errorMessage: outcome.status === 'applied' ? undefined : outcome.message, qualityReport: outcome.qualityReport
  }) };
}

export type RestylePhase = 'checking' | 'waiting' | 'reasoning' | 'receiving' | 'continuing' | 'validating' | 'complete' | 'failed' | 'cancelled';
export interface RestyleProgress {
  phase: RestylePhase; provider: string; model: string; targetName: string;
  elapsedMs: number; idleMs: number; textChars: number; reasoningChars: number; continuationCount: number;
  patchGroup?:number;patchGroups?:number;requestCount?:number;
}
const phaseLabel:Record<RestylePhase,string>={checking:'检查目标',waiting:'等待模型',reasoning:'接收推理',receiving:'接收正文',continuing:'续写',validating:'校验',complete:'完成',failed:'失败',cancelled:'取消'};
/** Counts stream text without exposing content; the deadline also covers stalled metadata. */
export async function executeRestyleTarget(core: AIEngineCore, options: Parameters<typeof executeTarget>[1] & {
  taskBudget?:TaskBudget;
  onProgress?: (progress: RestyleProgress) => void; totalTimeoutMs?: number; idleTimeoutMs?: number;
}): Promise<RestyleOutcome> {
  if(options.contextualGuidance||options.contract.designGuidance)options={...options,contract:structuredClone(options.contract),request:{...options.request,messages:structuredClone(options.request.messages)}};
  const controller = new AbortController(), started = Date.now();
  let lastActivity = started, stopped = false, calls = 0;
  const progress: RestyleProgress = {phase:'checking',provider:options.request.provider.name,model:options.request.model,
    targetName:options.target.name,elapsedMs:0,idleMs:0,textChars:0,reasoningChars:0,continuationCount:0};
  const emit = (phase = progress.phase) => { if(stopped)return; progress.phase=phase;
    options.onProgress?.({...progress,elapsedMs:Date.now()-started,idleMs:Date.now()-lastActivity}); };
  let stop!: (message: string, cancelled?: boolean) => void;
  const interrupted = new Promise<RestyleOutcome>(resolve => { stop = (message,cancelled=false) => {
    if(stopped)return; emit(cancelled?'cancelled':'failed'); stopped=true; controller.abort();
    resolve({target:options.target,status:'failed',message,workflowContract:options.contract,
      executionRecord:modelExecutionRecord({rawResponse:'',warnings:[],continuationCount:progress.continuationCount},{errorMessage:message})});
  }; });
  const abort = () => stop('重塑已取消；原页面未修改，可重新试跑。',true);
  options.request.signal?.addEventListener('abort',abort,{once:true});
  const total = Math.min(options.totalTimeoutMs ?? 600000,600000), idle = Math.min(options.idleTimeoutMs ?? 90000,90000);
  const deadline = setTimeout(()=>stop(`重塑在${phaseLabel[progress.phase]}阶段超过总时限；原页面未修改，可重试。`),total);
  let idleTimer: ReturnType<typeof setTimeout>;
  const armIdle = () => { clearTimeout(idleTimer); idleTimer=setTimeout(()=>stop(`重塑在${phaseLabel[progress.phase]}阶段无活动超时；原页面未修改，可重试。`),idle); };
  const tick = setInterval(()=>emit(),1000);
  const monitored: AIEngineCore = {...core,generateObject:(schema, request)=>core.generateObject(schema,request),streamText: request => {
    calls++;progress.requestCount=calls;progress.continuationCount=progress.patchGroups?0:calls-1;emit(!progress.patchGroups&&calls>1?'continuing':'waiting');
    const stream=core.streamText(request);
    const observe = async function* (source: AsyncIterable<string>,reasoning:boolean) {
      for await(const chunk of source){ if(stopped||controller.signal.aborted)return;
        lastActivity=Date.now();armIdle(); if(reasoning)progress.reasoningChars+=chunk.length;else progress.textChars+=chunk.length;
        emit(reasoning?'reasoning':'receiving');yield chunk;
      }
    };
    return {...stream,textStream:observe(stream.textStream,false),reasoningStream:observe(stream.reasoningStream,true)};
  }};
  emit();armIdle();
  if(options.request.signal?.aborted)abort();
  try {
    if(stopped)return await interrupted;
    if(options.target.html.length>RESTYLE_PATCH_THRESHOLD){const plan=createRestylePatchPlan(options.target,options.quality.deviceProfile??'pc');progress.patchGroups=plan.groups.length;}
    const work=executeTarget(monitored,{...options,request:{...options.request,signal:controller.signal},onGroup:(index,total)=>{progress.patchGroup=index;progress.patchGroups=total;emit('checking');options.onGroup?.(index,total);},
      onValidation:()=>emit('validating')});
    let outcome=await Promise.race([work,interrupted]);
    if(!stopped&&outcome.status==='failed'){
      const message=`重塑在${phaseLabel[progress.phase]}阶段失败；原页面未修改，可重试。${outcome.message??''}`;
      outcome={...outcome,message,executionRecord:outcome.executionRecord?{...outcome.executionRecord,errorMessage:message}:modelExecutionRecord({rawResponse:'',warnings:[],continuationCount:progress.continuationCount},{errorMessage:message})};
    }
    if(!stopped)emit(outcome.status==='applied'||outcome.status==='skipped_unchanged'?'complete':'failed');
    return outcome;
  } catch(error) {
    const failedPhase=phaseLabel[progress.phase];if(!stopped)emit('failed');
    const message=`重塑在${failedPhase}阶段失败；原页面未修改，可重试。${error instanceof Error?error.message:''}`;
    return {target:options.target,status:'failed',message,workflowContract:options.contract,executionRecord:modelExecutionRecord({rawResponse:'',warnings:[],continuationCount:progress.continuationCount},{errorMessage:message})};
  } finally { stopped=true;clearTimeout(deadline);clearTimeout(idleTimer!);clearInterval(tick);options.request.signal?.removeEventListener('abort',abort); }
}
