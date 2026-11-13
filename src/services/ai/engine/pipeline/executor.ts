import {createGeneratedMediaProcessor} from '../../generatedMedia';
import type {ProjectStorage} from '../../../storage/projectStorage';
import type {ProjectSettings} from '../../../../types/project';
import {repairDraftRegions,type DraftRegionRequest} from '../../draftRegionRepair';
import {prepareBusinessTextReview} from '../../businessTextReview';
import {renderExplicitUiRequirements} from '../../inlineFormContract';
import {prepareReferenceEvidence,renderReferenceEvidence,type ReferenceProcessing} from '../../referenceEvidence';
import {requestOutputCap} from '../../modelCapabilities';
import type {TaskDraftUpdate} from '../../designTaskJournal';
import {withTaskProvenance} from '../../taskProvenance';
import {choosePageWriteStrategy,estimatePageHtmlBytes,validPageWriteStrategy,type PageWriteStrategy} from '../../generationStrategy';
import {generateTaskPage} from '../../pageTaskGeneration';
import {requiresPageVariantPlan,requiresMultiPagePlan,validMultiPageScope,type MultiPageScope} from '../../multiPageContract';
import {referenceImageIdentity,recordReferenceInput,inspectCreationSources} from '../../workflowSources';
import type { StyleOverride, ReferenceDevice, DesignSystemOrigin,DesignLibraryBinding } from '../../../../types/project';
import { normalizeMobileNavigation, mobileNavigationPrompt } from '../../../../utils/mobileNavigation';
import { streamWithContinuation, type ContinuationResult } from '../../boundedContinuation';
import type { ContinuationCheckpoint } from '../../generationContinuation';
import { modelExecutionRecord,sanitizeExecutionMedia } from '../../designExecutionRecord';
import {embeddedMediaIssue,assertExternalMedia} from '../../externalMedia';
import {buildPageRedesignSource,mergeRedesignBody} from '../../pageRedesignSource';
import { buildDesignBrief, type DesignBrief } from '../../designBrief';
import {buildContextualCraft} from '../../designKnowledge/promptAdapter';
import {makeGuidancePacket,withGuidanceReceipts,guidancePacketIssue} from '../../designKnowledge/receipt';
import type {RuleFeature,RuleQuery} from '../../designKnowledge/types';
import {pageRuleFeatures,targetRuleFeatures} from '../../designKnowledge/targetFeatures';
import {TaskBudget,withTaskBudget} from '../../taskBudget';
import {createChatTaskBudget} from '../../taskBudgetPolicy';
import {inheritContinuationTask,continuationProof} from '../../continuationTask';
import {preparePageTaskPlan,pageTaskPlanIssue,bindConfirmedPageTaskPlan,type PageTaskSnapshot,type PageTaskPlan} from '../../pageTaskPlan';
import {artifactThinkingOptions} from '../../structuredRequestPolicy';
import { finalizeModelHtml } from '../../modelHtmlResult';
import { makeFailedPageDraft, repairDraftLabels, draftGuidanceIssue, type FailedPageDraft, type DraftLabel } from '../../qualityDraft';
import { continuationBindingKey } from '../../generationContinuation';
import { generateSectionedPage, type SectionedCheckpoint, type SectionedResult } from '../../sectionedGeneration';
import { AIEngineCore, type EngineMessage } from '../core/types';
import {observeRequestActivity,type RequestActivity,type PipelinePhase} from '../../requestActivity';
import { enrichContext } from '../context/contextEnricher';
import { analyzePipelineIntent } from './interceptors/intentInterceptor';
import { extractDeviationNote } from './interceptors/streamTransform';
import {extractArtifact} from './interceptors/streamTransform';
import { checkStructureIntegrity } from './interceptors/guardInterceptor';
import { applyGeneratedHtml } from './interceptors/applier';
import { PipelineInput, PipelineOutput, PipelineContext } from './types';
import { AIProviderConfig } from '../../../../types/provider';
import { PromptBuilder } from '../../promptBuilder';
import { DesignSystem } from '../../../../types/designSystem';
import { ComponentDefinition } from '../../../../types/project';
import { buildDesignTaskContract, contentFingerprint, renderDesignTaskContract, type KnowledgeSourceRef } from '../../designWorkflow';
import {resolveWorkflowValidation} from '../../workflowValidation';
import { buildDesignProjectManifest, renderProjectManifestContext, type DesignProjectManifest } from '../../projectManifest';

export interface ExecutePipelineOptions {
  generatedMedia?:{storage:ProjectStorage;settings:ProjectSettings;assets?:import('../../../../types/project').Asset[];isCurrent?:()=>boolean};
  referenceProcessing?:ReferenceProcessing;
  /** Functional planning rollout; callers pass the frozen snapshot when continuing an existing task. */
  pageTaskPlanning?:{snapshot?:PageTaskSnapshot;confirmed?:{plan:PageTaskPlan;request:PageTaskSnapshot['request']};maxTokens?:number};
  onTaskPlan?:(snapshot:PageTaskSnapshot)=>void;
  /** Reuse the same instance across parent-owned children; never put it in project state. */
  taskBudget?:TaskBudget;
  /** Internal pilot only; no user/project preference is enabled by default. */
  contextualGuidance?: {features?:RuleFeature[]};
  input: PipelineInput;
  provider: AIProviderConfig;
  model: string;
  engineCore: AIEngineCore;
  screens: Record<string, { id: string; name: string; htmlContent: string; scopedCss?: string }>;
  deviceProfile: 'pc' | 'mobile';
  useCustomNavigation?: boolean;
  frameWidth: number;
  referenceDevice?: ReferenceDevice;
  viewportGuideHeight?: number;
  baseSystemPrompt: string;
  designTokens?: any;
  overrides?:Record<string,StyleOverride>;
  conversationHistory?:EngineMessage[];
  /**
   * 完整设计系统 (ISSUE-015)。传入后由 PromptBuilder 组装带 Token / 类名白名单 /
   * DESIGN.md / Craft 的完整 System Prompt；缺省时退回 baseSystemPrompt 字面量。
   */
  designSystem?: DesignSystem;
  designSystemOrigin?: DesignSystemOrigin;
  designLibraryBinding?:DesignLibraryBinding;
  multiPage?:MultiPageScope;
  designProseMarkdown?: string;
  designBrief?: DesignBrief;
  projectKnowledge?: string;
  knowledgeSources?: KnowledgeSourceRef[];
  knowledgeFingerprint?: string;
  protectedNids?: string[];
  colorMode?: 'light' | 'dark';
  components?: ComponentDefinition[];
  projectManifest?: DesignProjectManifest;
  designRules?: string[];
  decisions?: Array<{ id: string; rule: string; rationale: string }>;
  onStreamDelta?: (text: string) => void;
  onReasoningDelta?: (reasoning: string) => void;
  signal?: AbortSignal;
  resume?: ContinuationCheckpoint;
  /** Same task and parent ledger as the checkpoint; never select a new rule packet. */
  resumeContract?: import('../../designWorkflow').DesignTaskContract;
  qualityRepair?: { draft: FailedPageDraft; labels: DraftLabel[]; region?:DraftRegionRequest };
  onContinuation?: (attempt: number, mode: 'native' | 'portable') => void;
  writeStrategy?:PageWriteStrategy['requested'];
  /** Explicit whole-page request or confirmed page mode, never inferred from a local edit. */
  wholePageRedesign?:boolean;
  sectioned?: {resume?:SectionedCheckpoint};
  isCurrent?:()=>boolean;
  onSectionProgress?:(message:string)=>void;
  onPhase?:(phase:PipelinePhase)=>void;
  onActivity?:(activity:RequestActivity)=>void;
  onTaskDraft?:(update:TaskDraftUpdate)=>Promise<void>;
  recoveryData?:{regions?:{plan:import('../../sectionedGeneration').SectionPlan;completed:Array<{id:string;html:string}>};strategy?:import('../../generationStrategy').PageWriteStrategy;guidance?:import('../../designKnowledge/types').RuleSelection};
}

export class PipelineExecutor {
  public static async execute(options: ExecutePipelineOptions): Promise<PipelineOutput> {
    if(options.qualityRepair)options={...options,qualityRepair:structuredClone(options.qualityRepair)};
    const activity=options.onActivity?observeRequestActivity(options.engineCore,options.onActivity,()=>!options.signal?.aborted&&options.isCurrent?.()!==false):undefined;
    try{
      const processor=options.generatedMedia&&options.designSystem?createGeneratedMediaProcessor({...options.generatedMedia,designSystem:options.designSystem,signal:options.signal,isCurrent:()=>options.isCurrent?.()!==false&&options.generatedMedia?.isCurrent?.()!==false,onProgress:options.onSectionProgress}):undefined;
      const output=await PipelineExecutor.executeTask({...options,prepareGeneratedHtml:processor?.prepare,engineCore:activity?.core??options.engineCore});
      if(processor&&output.extractedHtml){
        try{output.generatedAssets=await processor.collect(output.extractedHtml);}
        catch(error){output.status='error';output.errorMessage=error instanceof Error?error.message:String(error);delete output.extractedHtml;delete output.stagedScreen;
          if(output.executionRecord){output.executionRecord={...output.executionRecord,errorMessage:output.errorMessage};delete output.executionRecord.completeHtml;}}
      }
      if(output.workflowContract&&['create','modify'].includes(output.workflowContract.operation)&&options.onTaskDraft)await options.onTaskDraft({phase:'result',contract:output.workflowContract,budget:output.taskBudget,
        plan:output.sectionedCheckpoint?.plan,completed:output.sectionedCheckpoint?.completed,prefix:output.continuationCheckpoint?.prefix??output.sectionedCheckpoint?.active?.prefix,
        result:{html:output.extractedHtml,error:output.errorMessage,...(options.signal?.aborted?{cancelled:true}:{})}});
      return output;
    }finally{activity?.stop();}
  }
  private static async executeTask(options:ExecutePipelineOptions & {prepareGeneratedHtml?:import('../../generatedMedia').PrepareGeneratedHtml}):Promise<PipelineOutput>{
    const phase=(value:PipelinePhase)=>{if(!options.signal?.aborted&&options.isCurrent?.()!==false){try{options.onPhase?.(value);}catch{console.warn('[pipeline] 阶段显示回调失败');}}};
    phase('preparing');
    const {
      input,
      provider,
      model,
      engineCore,
      screens: sourceScreens,
      deviceProfile,
      frameWidth,
      baseSystemPrompt,
      designTokens,
      designSystem,
      colorMode,
      designProseMarkdown,
      protectedNids,
      components,
      designRules = [],
      decisions = [],
      onStreamDelta,
      onReasoningDelta,
      signal
    } = options;

    const navigationPolicy = { deviceProfile, useCustomNavigation: options.useCustomNavigation };
    const screens = Object.fromEntries(Object.entries(sourceScreens).map(([id, screen]) => [id, {
      ...screen, htmlContent: normalizeMobileNavigation(screen.htmlContent, navigationPolicy).html
    }]));

    // 1. Intent Analysis
    const intentResult = analyzePipelineIntent(input, designTokens);
    const resuming=Boolean(options.resume||options.sectioned?.resume);
    if((resuming&&(!options.resumeContract||!options.taskBudget))||(!resuming&&options.resumeContract))return {status:'error',rawResponse:'',errorMessage:'续写缺少原任务合同或原父预算，请重新生成。'};
    if(resuming&&!options.taskBudget!.hasTask(options.resumeContract!.taskId))return {status:'error',rawResponse:'',errorMessage:'当前账本不是原任务父预算，未发送续写请求。'};
    const resumeProof=resuming?continuationProof(options.resumeContract!,options.resume,options.sectioned?.resume):undefined;
    if(resuming&&!options.taskBudget!.matchesContinuation(options.resumeContract!.taskId,resumeProof!))return {status:'error',rawResponse:'',errorMessage:'原续写检查点或任务已变化、已使用，未发送请求。'};
    if(resuming&&!options.taskBudget!.canReserve(options.sectioned?4096:8192))return {status:'error',rawResponse:'',taskBudget:options.taskBudget!.snapshot(),errorMessage:'原任务预算已耗尽、取消或超过时限，不能继续；请拆分设计或明确重新生成。'};
    if(options.sectioned&&((intentResult.intent!=='create_screen'&&!(intentResult.intent==='modify_screen'&&options.wholePageRedesign&&options.sectioned.resume?.plan.version===2))||options.multiPage||requiresMultiPagePlan(input.rawPrompt)||requiresPageVariantPlan(input.rawPrompt)))return {status:'error',rawResponse:'',errorMessage:'分区生成仅支持新建同一页或继续已授权的V2整页重设计；局部修改与多页请使用对应流程。'};
    const sourceTarget = input.decision?.targetScreenId
      ? sourceScreens[input.decision.targetScreenId]
      : input.activeScreenId ? sourceScreens[input.activeScreenId] : undefined;
    const projectManifest = options.projectManifest ?? buildDesignProjectManifest({
      projectId: 'unknown', projectName: '当前工程（未提供项目元信息）', deviceProfile,
      screens: Object.values(sourceScreens).map(screen => ({ ...screen, position: { x: 0, y: 0 } })),
      assets: [], components, designSystem, designSystemOrigin: options.designSystemOrigin,designLibraryBinding:options.designLibraryBinding
    });
    const knowledgeSources: KnowledgeSourceRef[] = [
      ...(options.knowledgeSources ?? []),
      ...(options.projectKnowledge ? [{ kind: 'project-context' as const, id: 'assembled-project-context', fingerprint: contentFingerprint(options.projectKnowledge) }] : []),
      ...(input.textReferences ?? []).map(reference => ({ kind: 'text-reference' as const, id: reference.path ?? reference.name, fingerprint: contentFingerprint(reference.content) })),
      ...decisions.map(decision => ({ kind: 'decision' as const, id: decision.id, fingerprint: contentFingerprint(`${decision.rule}\n${decision.rationale}`) })),
      ...(designSystem ? [{ kind: 'design-system' as const, id: designSystem.id,
        fingerprint: options.designSystemOrigin?.tokenFingerprint ?? contentFingerprint(JSON.stringify(designSystem.tokens)) }] : [])
    ];
    let referenceImage:ReturnType<typeof referenceImageIdentity>|undefined;
    if((intentResult.intent==='create_screen'||(intentResult.intent==='modify_screen'&&(options.pageTaskPlanning||options.referenceProcessing)))&&input.attachment){
      try{referenceImage=referenceImageIdentity(input.attachment);}catch(error){return {status:'error',rawResponse:'',errorMessage:error instanceof Error?error.message:'参考图片无效。'};}
    }
    if(intentResult.intent==='create_screen'&&(((requiresMultiPagePlan(input.rawPrompt)||requiresPageVariantPlan(input.rawPrompt))&&!options.multiPage)||(options.multiPage&&!validMultiPageScope(options.multiPage))))return {status:'error',rawResponse:'',errorMessage:'多页面或多方案需求请先确认对应计划，再逐项生成。'};
    let workflowContract = buildDesignTaskContract({
      multiPage:options.multiPage,
      referenceImage,designLibraryBinding:options.designLibraryBinding,
      intent: intentResult.intent, request: input.rawPrompt,
      target: sourceTarget ? { id: sourceTarget.id, name: sourceTarget.name, htmlContent: sourceTarget.htmlContent } : undefined,
      referencePageId: input.decision?.styleReferenceScreenId, elementNid: input.decision?.elementNid,
      deviceProfile, frameWidth, referenceDeviceName: options.referenceDevice?.name, designSystem,
      designSystemOrigin: options.designSystemOrigin, projectManifest, protectedNids,
      knowledgeSources, knowledgeFingerprint: options.knowledgeFingerprint
    });
    const previousImage=options.resumeContract?.referenceImage??options.qualityRepair?.draft.referenceImage;
    if(previousImage?.evidence&&workflowContract.referenceImage?.fingerprint===previousImage.fingerprint)workflowContract.referenceImage.evidence=structuredClone(previousImage.evidence);
    if(options.sectioned)workflowContract.generationMode='sections';
    if(resuming&&options.resumeContract?.pageWriteStrategy)workflowContract.pageWriteStrategy=structuredClone(options.resumeContract.pageWriteStrategy);
    const taskBudget=options.taskBudget??((options.pageTaskPlanning||options.wholePageRedesign||options.referenceProcessing)?createChatTaskBudget(Boolean(options.sectioned||options.wholePageRedesign)):
      options.contextualGuidance&&!options.qualityRepair?new TaskBudget({maxRequests:16,maxRequestedOutputTokens:32768,maxDurationMs:900000,maxRequestDurationMs:900000}):undefined);
    if(taskBudget&&!resuming&&!taskBudget.snapshot().closed&&!taskBudget.signal.aborted)taskBudget.registerTask(workflowContract.taskId);
    let generationResult: SectionedResult | undefined;
    const attachContract = (output: PipelineOutput): PipelineOutput => {
      if(embeddedMediaIssue(output.rawResponse))output={...output,omittedResponseChars:output.rawResponse.length,rawResponse:'',errorMessage:output.errorMessage??'模型响应包含内嵌媒体，未保存页面或响应正文。'};
      if(taskBudget&&(generationResult?.checkpoint||generationResult?.sectionedCheckpoint))taskBudget.sealContinuation(workflowContract.taskId,continuationProof(workflowContract,generationResult.checkpoint,generationResult.sectionedCheckpoint));
      if(taskBudget&&!options.taskBudget)taskBudget.close();const delivered:PipelineOutput=({ ...output, workflowContract,...(taskBudget?{taskBudget:taskBudget.snapshot()}:{}),
      ...(generationResult ? { continuationCheckpoint: generationResult.checkpoint, sectionedCheckpoint:generationResult.sectionedCheckpoint, executionRecord: { ...modelExecutionRecord(generationResult, {
        completeHtml: ['applied', 'staged_side_by_side', 'rejected_by_guard'].includes(output.status) ? output.extractedHtml : undefined,
        errorMessage: output.errorMessage,
        qualityReport: output.qualityReport,
        warnings: output.warnings
      }), ...((options.sectioned||generationResult.sectioned)?{source:'sectioned-model' as const,rawResponse:'',sectioned:generationResult.sectioned}: {}) }, ...(options.qualityRepair&&!options.qualityRepair.region ? {executionRecord:{source:'local-edit' as const,rawResponse:'',completeHtml:output.extractedHtml,continuationCount:0,warnings:output.warnings??[],qualityReport:output.qualityReport,
        localEdit:{mode:'local' as const,targetNids:options.qualityRepair.labels.map(l=>l.nid),operationCount:options.qualityRepair.labels.length},
        sectioned:options.qualityRepair.draft.sectioned,
        draftRepair:{sourceFingerprint:options.qualityRepair.draft.fingerprint,sourceTaskId:options.qualityRepair.draft.sourceTaskId,confirmedLabels:structuredClone(options.qualityRepair.labels),
          ...(options.qualityRepair.draft.pageTaskSource?{historicalPageTaskSource:structuredClone(options.qualityRepair.draft.pageTaskSource)}:{}),
          ...(options.qualityRepair.draft.guidanceSource?{historicalGuidanceSource:structuredClone(options.qualityRepair.draft.guidanceSource)}:{})}}} : {}) } : {}) });
      if(delivered.executionRecord)delivered.executionRecord=sanitizeExecutionMedia(delivered.executionRecord);return delivered;
    };

    if(workflowContract.operation==='modify'&&sourceTarget){
      try{assertExternalMedia(sourceTarget.htmlContent,[sourceTarget.scopedCss??'',...Object.entries(options.overrides??{}).filter(([key])=>key.startsWith(sourceTarget.id+':')).flatMap(([,entry])=>Object.values(entry.declarations))].join('\n'));}
      catch(error){return attachContract({status:'error',rawResponse:'',errorMessage:(error instanceof Error?error.message:String(error))+' 请先在项目设置转换旧页面媒体。'});}
    }
    if(options.wholePageRedesign)try{
      if(workflowContract.operation!=='modify'||!sourceTarget||workflowContract.elementNid)throw Error('整页重设计需要明确的页面目标，不能用于局部引用。');
      const source=buildPageRedesignSource(sourceTarget.htmlContent,{deviceProfile,useCustomNavigation:options.useCustomNavigation,protectedNids});
      workflowContract.wholePageRedesign={version:1,sourceFingerprint:source.sourceFingerprint,inventoryFingerprint:contentFingerprint(JSON.stringify(source))};
      if(options.writeStrategy==='atomic')choosePageWriteStrategy({estimatedHtmlBytes:new TextEncoder().encode(sourceTarget.htmlContent).length,requested:'atomic'});
    }catch(error){return attachContract({status:'error',rawResponse:'',errorMessage:error instanceof Error?error.message:String(error)});}

    let explicitUiRequirements='';
    if(['create','modify'].includes(workflowContract.operation))try{explicitUiRequirements=renderExplicitUiRequirements(input.rawPrompt);}catch(error){return attachContract({status:'error',rawResponse:'',errorMessage:error instanceof Error?error.message:'明确UI要求存在冲突。'});}
    // If change_theme, return early with proposal
    if (intentResult.intent === 'change_theme') {
      return attachContract({
        status: 'theme_proposed',
        rawResponse: '已识别主题调整意图',
        themeProposal: intentResult.themeProposal,
        changeSet: { theme: intentResult.themeProposal }
      });
    }

    if(!resuming&&(['create','modify'].includes(workflowContract.operation)))await options.onTaskDraft?.({phase:'started',contract:workflowContract,budget:taskBudget?.snapshot()});

    if(input.attachment&&options.referenceProcessing&&!resuming&&!options.qualityRepair){
      try{
        phase('reference-observation');
        if(!taskBudget)throw Error('图片解析缺少父任务预算。');
        const evidence=await prepareReferenceEvidence(engineCore,{attachment:input.attachment,processing:options.referenceProcessing,budget:taskBudget,taskId:workflowContract.taskId,signal,isCurrent:options.isCurrent});
        if(!workflowContract.referenceImage)workflowContract.referenceImage=referenceImageIdentity(input.attachment);
        workflowContract.referenceImage.evidence=evidence;
      }catch(error){return attachContract({status:'error',rawResponse:'',errorMessage:error instanceof Error?error.message:'参考图解析失败。'});}
    }

    if(options.pageTaskPlanning||options.wholePageRedesign){
      const planning=options.pageTaskPlanning??{};
      if(!planning.snapshot)phase('planning');
      try{
        if(!['create','modify'].includes(workflowContract.operation)||workflowContract.elementNid)throw Error('当前业务规划入口仅支持新建或已授权的页面功能修改。');
        if(planning.snapshot&&planning.confirmed)throw Error('业务规划不能同时指定续写快照和确认计划。');
        if((options.resume||options.sectioned?.resume||options.qualityRepair)&&!planning.snapshot)throw Error('继续任务缺少原业务规划，请重新生成。');
        workflowContract.pageTaskPlan=planning.snapshot?structuredClone(planning.snapshot):planning.confirmed?
          bindConfirmedPageTaskPlan(workflowContract,planning.confirmed.plan,planning.confirmed.request):await preparePageTaskPlan(withTaskProvenance(engineCore,workflowContract.taskId,'functional-plan'),{
          contract:workflowContract,provider,model,budget:taskBudget!,projectKnowledge:options.projectKnowledge,baselineHtml:sourceTarget?.htmlContent,textReferences:input.textReferences,
          attachment:input.attachment,useCustomNavigation:options.useCustomNavigation,wholePageRedesign:options.wholePageRedesign,signal,
          maxTokens: planning.maxTokens ?? 3072,
          isCurrent:()=>!signal?.aborted&&(options.isCurrent?.()??true)});
        const issue=pageTaskPlanIssue(workflowContract);if(issue)throw Error(issue);
        if(signal?.aborted||options.isCurrent?.()===false)throw Error('任务或工程已变化，未使用业务规划。');
        if(workflowContract.pageTaskPlan.request.providerId!==provider.id||workflowContract.pageTaskPlan.request.model!==model)throw Error('业务规划的 Provider 或模型已变化，请重新生成。');
        options.onTaskPlan?.(structuredClone(workflowContract.pageTaskPlan));
        if(workflowContract.pageTaskPlan.plan.questions.length)throw Error(`业务规划有待确认的问题：${workflowContract.pageTaskPlan.plan.questions.join('；')}`);
      }catch(error){return attachContract({status:'error',rawResponse:'',errorMessage:error instanceof Error?error.message:'业务规划失败，未生成页面。'});}
    }

    if((options.writeStrategy||options.wholePageRedesign)&&(workflowContract.operation==='create'||options.wholePageRedesign)&&workflowContract.pageTaskPlan&&!resuming&&!options.qualityRepair){
      try{const estimatedHtmlBytes=Math.max(estimatePageHtmlBytes(input.rawPrompt,workflowContract.pageTaskPlan.plan),options.wholePageRedesign?new TextEncoder().encode(sourceTarget!.htmlContent).length:0),singleOutputCap=requestOutputCap(provider,model,8192);
       if(options.recoveryData?.strategy&&!validPageWriteStrategy(options.recoveryData.strategy))throw Error('恢复任务的冻结写入模式无效。');
       workflowContract.pageWriteStrategy=options.recoveryData?.strategy?structuredClone(options.recoveryData.strategy):choosePageWriteStrategy({plan:workflowContract.pageTaskPlan.plan,estimatedHtmlBytes,atomicFits:Math.ceil(estimatedHtmlBytes/3.5)<=singleOutputCap,requested:options.writeStrategy??'auto'});
       if(workflowContract.pageWriteStrategy.mode==='SectionedPatch')workflowContract.generationMode='sections';
       if(workflowContract.pageWriteStrategy.mode!=='SectionedPatch'&&taskBudget&&!options.multiPage&&taskBudget.snapshot().limits.maxRequests>4)taskBudget.narrowRequestLimit(4);
      }catch(error){return attachContract({status:'error',rawResponse:'',errorMessage:error instanceof Error?error.message:String(error)});}
    }

    if(resuming){
      try{workflowContract=inheritContinuationTask(workflowContract,options.resumeContract!);}
      catch(error){return attachContract({status:'error',rawResponse:'',errorMessage:error instanceof Error?error.message:'原续写任务已失效。'});}
    }

    if(['create','modify'].includes(workflowContract.operation))await options.onTaskDraft?.({phase:'started',contract:workflowContract,budget:taskBudget?.snapshot()});

    // 2. System Prompt 组装 (ISSUE-015)
    // 意图在第 1 步才确定，故 Prompt 必须在此处构建，才能保住 T-AE-10 的
    // 按意图条件注入粒度（Few-Shot 仅 create_screen、改主题/提问零美学层）。
    const designBrief = intentResult.intent === 'create_screen' && designSystem
      ? options.designBrief ?? buildDesignBrief({ request: input.rawPrompt, designSystem, device: deviceProfile, mode: colorMode ?? 'light',
          globalDecisions: decisions.map(d => d.rule), components: components ?? [], projectKnowledge: options.projectKnowledge }) : undefined;
    const guidanceQuery:RuleQuery|undefined=!resuming&&!options.recoveryData&&options.contextualGuidance&&designSystem&&!options.qualityRepair&&['create','modify'].includes(workflowContract.operation)
      ? {request:input.rawPrompt,operation:workflowContract.operation,device:deviceProfile,scope:workflowContract.elementNid?'element':'page',
        features:options.contextualGuidance.features??(workflowContract.operation==='modify'&&sourceTarget?(workflowContract.elementNid?targetRuleFeatures(sourceTarget.htmlContent,[workflowContract.elementNid]):pageRuleFeatures(sourceTarget.htmlContent)):undefined),maxChars:10000}:undefined;
    if(guidanceQuery&&!resuming){
      const prepared=buildContextualCraft(intentResult.intent,guidanceQuery);
      workflowContract.designGuidance=makeGuidancePacket(workflowContract,prepared.selection,'html');
    }
    if(options.recoveryData?.guidance)workflowContract.designGuidance=makeGuidancePacket(workflowContract,options.recoveryData.guidance,'html');
    const identityCore=withTaskProvenance(engineCore,workflowContract.taskId);
    const evidenceCore=workflowContract.designGuidance?withGuidanceReceipts(identityCore,workflowContract,workflowContract.designGuidance):identityCore;
    // Reserve before recording an actual core call. A denied reservation is not a failed dispatch.
    const requestCore=taskBudget?withTaskBudget(evidenceCore,taskBudget):evidenceCore;
    phase('assembling');
    const systemPrompt = designSystem
      ? PromptBuilder.buildSystemPrompt({
          contextualGuidance:guidanceQuery,
          frozenGuidance:workflowContract.designGuidance?.selection,
          designSystem,
          deviceProfile,
          useCustomNavigation: options.useCustomNavigation,
          frameWidth,
          referenceDevice: options.referenceDevice,
          viewportGuideHeight: options.viewportGuideHeight,
          colorMode,
          designProseMarkdown,
          components,
          mediaAssets:projectManifest.assets,
          designRules,
          decisions,
          intent: intentResult.intent,
          hasAttachment: Boolean(input.attachment),
          componentRequest: input.rawPrompt,
          taskBrief: designBrief
        })
      : `${baseSystemPrompt}\n${mobileNavigationPrompt(navigationPolicy)}`;

    const mediaContract=options.prepareGeneratedHtml?'\n[自动媒体编译阶段]优先复用已有独立图标。必要的新静态SVG图表/图标可完整输出，程序会安全检查并外置为独立文件，之后再验收；此条仅覆盖响应阶段内联SVG限制，最终页面仅保留独立引用。禁止data URL/base64/blob及编造素材路径；不将UI或图表当作整页位图。':'';
    const routedSystemPrompt = `${systemPrompt}${mediaContract}\n\n${renderProjectManifestContext(projectManifest)}\n\n${renderDesignTaskContract(workflowContract)}${explicitUiRequirements}`;

    // 3. Context Enrichment (ISSUE-011 + ISSUE-012 + D18 + D20)
    const enriched = enrichContext({
      rawPrompt: input.rawPrompt,
      intent: intentResult.intent,
      activeScreenId: input.activeScreenId,
      screens,
      deviceProfile,
      frameWidth,
      baseSystemPrompt: routedSystemPrompt,
      attachment: workflowContract.referenceImage?.evidence?undefined:input.attachment,
      textReferences: input.textReferences,
      projectKnowledge: options.projectKnowledge,
      designRules,
      decisions,
      projectProseMarkdown: designProseMarkdown,
      targetScreenOverride: input.decision ? { id: input.decision.targetScreenId } : undefined,
      referenceScreenId:input.decision?.styleReferenceScreenId ?? input.decision?.targetScreenId,
      overrides:options.overrides,
      conversationHistory:options.conversationHistory,
      wholePageRedesign:options.wholePageRedesign?{useCustomNavigation:options.useCustomNavigation,protectedNids}:undefined
    });

    if(enriched.referenceErrors.length)return attachContract({status:'error',rawResponse:'',errorMessage:enriched.referenceErrors.join('；')+'。本次未生成或修改任何页面。'});
    workflowContract.contextManifest=enriched.contextManifest;
    if(['create','modify'].includes(workflowContract.operation))await options.onTaskDraft?.({phase:'started',contract:workflowContract,budget:taskBudget?.snapshot()});

    if(workflowContract.referenceImage?.evidence){const last=enriched.messages.at(-1);if(!last||last.role!=='user')return attachContract({status:'error',rawResponse:'',errorMessage:'图片证据缺少当前用户请求。'});delete last.imageUrl;last.content+=renderReferenceEvidence(workflowContract.referenceImage.evidence);}
    const originalReference=options.qualityRepair?.draft.referenceImage;
    if(options.qualityRepair && workflowContract.referenceImage && originalReference?.inputReceipt && originalReference.fingerprint===workflowContract.referenceImage.fingerprint && options.qualityRepair.draft.sourceTaskId) {
      workflowContract.referenceImage.inputReceipt={...originalReference.inputReceipt,reusedFromTaskId:options.qualityRepair.draft.sourceTaskId};
    }
    const referenceError=options.qualityRepair ? (workflowContract.referenceImage&&!workflowContract.referenceImage.inputReceipt?'缺少草稿原始参考图输入记录，请重新生成。':undefined) : recordReferenceInput(workflowContract,enriched.messages,provider.id,model);
    if(referenceError)return attachContract({status:'error',rawResponse:'',errorMessage:referenceError});

    if(intentResult.intent==='create_screen'){
      const task=resolveWorkflowValidation(workflowContract,'create',{preflight:true});
      const sources=inspectCreationSources(workflowContract,{designLibraryBinding:options.designLibraryBinding,components:Object.fromEntries((components??[]).map(c=>[c.id,c]))},'');
      const issue=!task.ok?task.message:sources.issue??(projectManifest.designLibrary&&!options.designLibraryBinding?'缺少当前工程真实设计库绑定，请重新读取工程。':projectManifest.issues.find(i=>i.code==='invalid_library_reference')?.message);
      if(issue)return attachContract({status:'error',rawResponse:'',errorMessage:issue});
    }

    const pipelineContext: PipelineContext = {
      input,
      intent: intentResult.intent,
      intentReason: intentResult.reason,
      hasExplicitStructuralChangeIntent: intentResult.hasExplicitStructuralChangeIntent||Boolean(options.wholePageRedesign),
      wholePageRedesign:options.wholePageRedesign,
      targetScreen: enriched.targetScreen,
      referencedScreens: enriched.referencedScreens,
      unmatchedMentions: enriched.unmatchedMentions,
      activeRules: designRules,
      activeDecisions: decisions,
      assembledMessages: enriched.messages,
      estimatedChars: enriched.estimatedChars,
      isContextTrimmed: enriched.isContextTrimmed,
      warnings: enriched.warnings,
      workflowContract
    };

    if(options.qualityRepair){const issue=draftGuidanceIssue(options.qualityRepair.draft);if(issue)return attachContract({status:'error',rawResponse:'',errorMessage:issue});}
    if(options.qualityRepair){
      const origin=options.qualityRepair.draft.pageTaskSource??options.qualityRepair.draft.guidanceSource;
      if(origin?.pageWriteStrategy){workflowContract.pageWriteStrategy=structuredClone(origin.pageWriteStrategy);workflowContract.generationMode=origin.generationMode;}
    }
    const frozenSelection=workflowContract.designGuidance?.selection??options.qualityRepair?.draft.guidanceSource?.designGuidance?.selection;
    const artifactOptions=['create','modify'].includes(workflowContract.operation)?artifactThinkingOptions(provider,model):{};
    const baseContextKey = contentFingerprint(JSON.stringify([input, Object.entries(sourceScreens).sort(([a],[b])=>a.localeCompare(b)).map(([id,s])=>[id,s.name,s.htmlContent,s.scopedCss]), options.overrides, deviceProfile, frameWidth, options.referenceDevice,
      options.useCustomNavigation, options.viewportGuideHeight, designSystem, options.designSystemOrigin, options.designLibraryBinding,
      projectManifest, protectedNids, components, designRules, decisions, options.projectKnowledge, options.knowledgeFingerprint, options.colorMode,
      ...(workflowContract.pageTaskPlan?[workflowContract.pageTaskPlan]:[]),
      ...(artifactOptions.enableThinking!==undefined?['artifact-thinking',artifactOptions]:[]),
      ...(frozenSelection?[frozenSelection.selected.map(s=>s.fingerprint),frozenSelection.body]:[])]));
    const contextKey = workflowContract.pageWriteStrategy?.mode==='SectionedPatch'?contentFingerprint(`${baseContextKey}:section-patch-v2`):options.sectioned?contentFingerprint(`${baseContextKey}:sections-v1`):baseContextKey;
    if(resuming){
      if((options.resume?.contextKey??options.sectioned?.resume?.contextKey)!==contextKey)return attachContract({status:'error',rawResponse:'',errorMessage:'原续写上下文已变化，未发送请求。'});
      if(!taskBudget!.consumeContinuation(workflowContract.taskId,resumeProof!))return attachContract({status:'error',rawResponse:'',errorMessage:'本检查点已被其它续写使用，未重复发送请求。'});
    }
    const qualityOptions = {wholePageRedesign:workflowContract.wholePageRedesign,contentTask:workflowContract,deviceProfile,useCustomNavigation:options.useCustomNavigation,designSystem,baselineHtml:options.wholePageRedesign?sourceTarget?.htmlContent:enriched.targetScreen?screens[enriched.targetScreen.id]?.htmlContent:undefined,protectedNids,modificationRequest:input.rawPrompt};
    let recovered: SectionedResult;
    phase(options.qualityRepair?'local-repair':'generating');
    if (options.qualityRepair) {
      const {draft,labels} = options.qualityRepair;
      if (draft.contextKey !== contextKey || draft.bindingKey !== continuationBindingKey({provider,model})) return attachContract({status:'error',rawResponse:'',usage:{inputTokens:0,outputTokens:0},errorMessage:'草稿的工程、原页或模型上下文已变化，请重新生成。'});
      try {
        const previous=(draft.pageTaskSource??draft.guidanceSource)?.businessTextReview;
        const choices=options.qualityRepair.region?.textChanges??[];
        if(!Array.isArray(choices))throw Error('逐项文案确认格式无效。');
        if(previous||choices.length){
          if(!workflowContract.wholePageRedesign||!qualityOptions.baselineHtml)throw Error('业务文案逐项确认仅适用于当前整页重设计基线。');
          workflowContract.businessTextReview=prepareBusinessTextReview(buildPageRedesignSource(qualityOptions.baselineHtml,{deviceProfile,useCustomNavigation:options.useCustomNavigation,protectedNids}),qualityOptions.baselineHtml,draft,options.qualityRepair.region?.nids??[],choices,previous);
        }
        const html = options.qualityRepair.region ? await repairDraftRegions(requestCore,{provider,model,messages:enriched.messages,signal,...artifactOptions},draft,options.qualityRepair.region,protectedNids??[],messages=>{const issue=recordReferenceInput(workflowContract,messages,provider.id,model);if(issue)throw Error(issue);},qualityOptions.baselineHtml,workflowContract.businessTextReview,options.prepareGeneratedHtml) : repairDraftLabels(draft, labels, qualityOptions);
        const title = (draft.title??'修复后的页面').replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');
        recovered = {rawResponse:`<artifact type="screen" title="${title}">${html}</artifact>`,warnings:[options.qualityRepair.region?'已修复所选草稿区块，其他区域保留，仍须完整验收。':'已按用户确认文案定点修复，未重新请求整页生成。'],usage:options.qualityRepair.region?undefined:{inputTokens:0,outputTokens:0},finishReason:'stop',continuationCount:0};
      } catch (error) { return attachContract({status:'rejected_by_quality',rawResponse:'',usage:options.qualityRepair.region?undefined:{inputTokens:0,outputTokens:0},failedDraft:draft,qualityReport:draft.quality,errorMessage:String(error instanceof Error?error.message:error)}); }
    } else if(workflowContract.pageWriteStrategy&&workflowContract.pageTaskPlan&&!resuming){
      try{recovered=await generateTaskPage(requestCore,{provider,model,messages:enriched.messages,signal,...artifactOptions},{prepareGeneratedHtml:options.prepareGeneratedHtml,businessSource:options.wholePageRedesign&&sourceTarget?buildPageRedesignSource(sourceTarget.htmlContent,{deviceProfile,useCustomNavigation:options.useCustomNavigation,protectedNids}):undefined,referenceEvidence:workflowContract.referenceImage?.evidence,recovered:options.recoveryData?.regions,request:workflowContract.request,strategy:workflowContract.pageWriteStrategy,plan:workflowContract.pageTaskPlan.plan,device:deviceProfile,title:options.multiPage?.name??options.designBrief?.goal?.slice(0,20)??workflowContract.pageTaskPlan.plan.goal.slice(0,20),contextKey,budget:taskBudget!,isCurrent:options.isCurrent,onProgress:options.onSectionProgress,onRequest:messages=>{const issue=recordReferenceInput(workflowContract,messages,provider.id,model);if(issue)throw Error(issue);},onCheckpoint:options.onTaskDraft?async(plan,completed)=>{await options.onTaskDraft!({phase:'regions',contract:workflowContract,budget:taskBudget?.snapshot(),plan,completed});}:undefined});}
      catch(error){return attachContract({status:'error',rawResponse:'',errorMessage:error instanceof Error?error.message:String(error)});}
    } else if(options.sectioned) {
      recovered=await generateSectionedPage(requestCore,{provider,model,messages:enriched.messages,signal,...artifactOptions},contextKey,
        {prepareGeneratedHtml:options.prepareGeneratedHtml,...(taskBudget?{remainingOutputTokens:()=>{const s=taskBudget.snapshot();return s.limits.maxRequestedOutputTokens-s.requestedOutputTokens;},reservedOutputTokens:taskBudget.snapshot().limits.maxRequestedOutputTokens>=32768+1800?1800:0}:{}),resume:options.sectioned.resume,isCurrent:options.isCurrent,onProgress:options.onSectionProgress,onRequest:messages=>{const issue=recordReferenceInput(workflowContract,messages,provider.id,model);if(issue)throw Error(issue);},onCheckpoint:options.onTaskDraft?async(plan,completed)=>{await options.onTaskDraft!({phase:'regions',contract:workflowContract,budget:taskBudget?.snapshot(),plan,completed});}:undefined});
    } else recovered = await streamWithContinuation(requestCore, {
      provider, model, messages: enriched.messages,
      ...artifactOptions,
      maxTokens: intentResult.intent === 'modify_screen' && (enriched.targetScreen?.htmlContent.length ?? 0) > 12000 ? 16384 : 8192,
      signal
    }, { prepareGeneratedHtml:options.prepareGeneratedHtml,onText: onStreamDelta, onReasoning: onReasoningDelta, allowContinuation: intentResult.intent !== 'question',externalMediaOnly:intentResult.intent!=='question',
      resume: options.resume, onContinuation: options.onContinuation,canRequest:tokens=>taskBudget?.canReserve(tokens)??true,
      contextKey });
    if(options.wholePageRedesign&&sourceTarget&&!options.qualityRepair&&!recovered.errorMessage){
      const artifact=extractArtifact(recovered.rawResponse);
      if(artifact?.isComplete)try{
        const html=mergeRedesignBody(screens[sourceTarget.id].htmlContent,artifact.html),escape=(value:string)=>value.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');
        recovered={...recovered,rawResponse:`<artifact type="screen" identifier="${escape(sourceTarget.id)}" title="${escape(artifact.title??sourceTarget.name)}">${html}</artifact>`};
      }catch(error){recovered={...recovered,errorMessage:error instanceof Error?error.message:String(error)};}
    }
    generationResult = recovered;
    const { rawResponse, reasoningText, usage, recoveredStreamError, finishReason } = recovered;
    const recoveryWarnings = [...enriched.warnings,...recovered.warnings];
    if (recovered.errorMessage) return attachContract({ status: 'error', rawResponse, reasoningText, usage, recoveredStreamError,
      warnings: recoveryWarnings, errorMessage: recovered.errorMessage });
    phase('validating');
    const guidanceIssue=guidancePacketIssue(workflowContract);
    if(guidanceIssue)return attachContract({status:'error',rawResponse,reasoningText,usage,errorMessage:guidanceIssue,warnings:recoveryWarnings});

    // If question intent, return directly
    if (intentResult.intent === 'question') {
      return attachContract({
        status: 'answered_question',
        rawResponse,
        reasoningText,
        recoveredStreamError,
        warnings: recoveryWarnings,
        usage
      });
    }

    // 4. Shared HTML terminal checks (also used by polish/restyle).
    const finalized = finalizeModelHtml(recovered, {...qualityOptions,signal});
    if (finalized.status !== 'valid') {
      const draft = finalized.status==='rejected_by_quality' && finalized.html ? makeFailedPageDraft(finalized.html,contextKey,continuationBindingKey({provider,model}),qualityOptions,finalized.artifact?.title) : undefined;
      if(draft){draft.sourceTaskId=workflowContract.taskId;if(workflowContract.pageTaskPlan)draft.pageTaskSource=structuredClone(workflowContract);if(workflowContract.designGuidance)draft.guidanceSource=structuredClone(workflowContract);draft.referenceImage=workflowContract.referenceImage?structuredClone(workflowContract.referenceImage):undefined;if(options.sectioned||generationResult.sectioned){draft.generationMode='sections';draft.sectioned=generationResult.sectioned;}}
      return attachContract({ status: finalized.status, rawResponse, reasoningText, usage, failedDraft:draft,
        recoveredStreamError, warnings: recoveryWarnings, qualityReport: draft?.quality??finalized.qualityReport, errorMessage: finalized.message });
    }
    const artifact = finalized.artifact!;
    const extractedHtml = finalized.html!;
    const qualityReport = finalized.qualityReport!;
    const deviationNote = extractDeviationNote(rawResponse);
    const artifactMeta = { identifier: artifact.identifier, type: artifact.type, title: artifact.title, isFallback: artifact.isFallback };

    // 5. Structure Guard Check
    const guardCheck = checkStructureIntegrity(pipelineContext, extractedHtml);
    if (!guardCheck.passed) {
      return attachContract({
        status: 'rejected_by_guard',
        rawResponse,
        reasoningText,
        extractedHtml,
        qualityReport,
        structureDiff: guardCheck.structureDiff,
        errorMessage: guardCheck.reason,
        recoveredStreamError,
        usage,
        artifactMetadata: artifactMeta,
        warnings: [...recoveryWarnings, ...(artifact.warnings ?? [])]
      });
    }

    // 6. Applier (PRD D17 Side-by-side adoption)
    const applyRes = applyGeneratedHtml(pipelineContext, extractedHtml, {
      identifier: artifact.identifier,
      title: artifact.title
    });

    return attachContract({
      status: applyRes.status,
      qualityReport,
      rawResponse,
      reasoningText,
      extractedHtml,
      structureDiff: guardCheck.structureDiff,
      // 仅成功路径 (applied / staged_side_by_side) 挂载取舍披露 (BR-DN-05 / CHK-DN-05)
      deviationNote,
      stagedScreen: applyRes.stagedScreen,
      changeSet: applyRes.changeSet,
      recoveredStreamError,
      usage,
      artifactMetadata: artifactMeta,
      warnings: [...recoveryWarnings, ...(artifact.warnings ?? [])]
    });
  }
}
