import {requiresPageVariantPlan,requiresMultiPagePlan,validMultiPageScope,type MultiPageScope} from '../../multiPageContract';
import {referenceImageIdentity,recordReferenceInput,inspectCreationSources} from '../../workflowSources';
import type { StyleOverride, ReferenceDevice, DesignSystemOrigin,DesignLibraryBinding } from '../../../../types/project';
import { normalizeMobileNavigation, mobileNavigationPrompt } from '../../../../utils/mobileNavigation';
import { streamWithContinuation, type ContinuationResult } from '../../boundedContinuation';
import type { ContinuationCheckpoint } from '../../generationContinuation';
import { modelExecutionRecord } from '../../designExecutionRecord';
import { buildDesignBrief, type DesignBrief } from '../../designBrief';
import {buildContextualCraft} from '../../designKnowledge/promptAdapter';
import {makeGuidancePacket,withGuidanceReceipts,guidancePacketIssue} from '../../designKnowledge/receipt';
import type {RuleFeature,RuleQuery} from '../../designKnowledge/types';
import {pageRuleFeatures,targetRuleFeatures} from '../../designKnowledge/targetFeatures';
import {TaskBudget,withTaskBudget} from '../../taskBudget';
import {createChatTaskBudget} from '../../taskBudgetPolicy';
import {inheritContinuationTask,continuationProof} from '../../continuationTask';
import {preparePageTaskPlan,pageTaskPlanIssue,bindConfirmedPageTaskPlan,type PageTaskSnapshot,type PageTaskPlan} from '../../pageTaskPlan';
import { finalizeModelHtml } from '../../modelHtmlResult';
import { makeFailedPageDraft, repairDraftLabels, draftGuidanceIssue, type FailedPageDraft, type DraftLabel } from '../../qualityDraft';
import { continuationBindingKey } from '../../generationContinuation';
import { generateSectionedPage, type SectionedCheckpoint, type SectionedResult } from '../../sectionedGeneration';
import { AIEngineCore, type EngineMessage } from '../core/types';
import {observeRequestActivity,type RequestActivity,type PipelinePhase} from '../../requestActivity';
import { enrichContext } from '../context/contextEnricher';
import { analyzePipelineIntent } from './interceptors/intentInterceptor';
import { extractDeviationNote } from './interceptors/streamTransform';
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
  /** Functional planning rollout; callers pass the frozen snapshot when continuing an existing task. */
  pageTaskPlanning?:{snapshot?:PageTaskSnapshot;confirmed?:{plan:PageTaskPlan;request:PageTaskSnapshot['request']}};
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
  qualityRepair?: { draft: FailedPageDraft; labels: DraftLabel[] };
  onContinuation?: (attempt: number, mode: 'native' | 'portable') => void;
  sectioned?: {resume?:SectionedCheckpoint};
  isCurrent?:()=>boolean;
  onSectionProgress?:(message:string)=>void;
  onPhase?:(phase:PipelinePhase)=>void;
  onActivity?:(activity:RequestActivity)=>void;
}

export class PipelineExecutor {
  public static async execute(options: ExecutePipelineOptions): Promise<PipelineOutput> {
    const activity=options.onActivity?observeRequestActivity(options.engineCore,options.onActivity,()=>!options.signal?.aborted&&options.isCurrent?.()!==false):undefined;
    try{return await PipelineExecutor.executeTask({...options,engineCore:activity?.core??options.engineCore});}
    finally{activity?.stop();}
  }
  private static async executeTask(options:ExecutePipelineOptions):Promise<PipelineOutput>{
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
    if(options.sectioned&&(intentResult.intent!=='create_screen'||options.multiPage||requiresMultiPagePlan(input.rawPrompt)||requiresPageVariantPlan(input.rawPrompt)))return {status:'error',rawResponse:'',errorMessage:'分区生成仅支持新建同一页；修改旧页请用局部/区块修改，多页或多方案请单独规划。'};
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
    if((intentResult.intent==='create_screen'||(intentResult.intent==='modify_screen'&&options.pageTaskPlanning))&&input.attachment){
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
    if(options.sectioned)workflowContract.generationMode='sections';
    const taskBudget=options.taskBudget??(options.pageTaskPlanning?createChatTaskBudget(Boolean(options.sectioned)):
      options.contextualGuidance&&!options.qualityRepair?new TaskBudget({maxRequests:16,maxRequestedOutputTokens:32768,maxDurationMs:900000,maxRequestDurationMs:900000}):undefined);
    if(taskBudget&&!resuming&&!taskBudget.snapshot().closed&&!taskBudget.signal.aborted)taskBudget.registerTask(workflowContract.taskId);
    let generationResult: SectionedResult | undefined;
    const attachContract = (output: PipelineOutput): PipelineOutput => {
      if(taskBudget&&(generationResult?.checkpoint||generationResult?.sectionedCheckpoint))taskBudget.sealContinuation(workflowContract.taskId,continuationProof(workflowContract,generationResult.checkpoint,generationResult.sectionedCheckpoint));
      if(taskBudget&&!options.taskBudget)taskBudget.close();return ({ ...output, workflowContract,...(taskBudget?{taskBudget:taskBudget.snapshot()}:{}),
      ...(generationResult ? { continuationCheckpoint: generationResult.checkpoint, sectionedCheckpoint:generationResult.sectionedCheckpoint, executionRecord: { ...modelExecutionRecord(generationResult, {
        completeHtml: ['applied', 'staged_side_by_side', 'rejected_by_guard'].includes(output.status) ? output.extractedHtml : undefined,
        errorMessage: output.errorMessage,
        qualityReport: output.qualityReport,
        warnings: output.warnings
      }), ...(options.sectioned?{source:'sectioned-model' as const,rawResponse:'',sectioned:generationResult.sectioned}: {}) }, ...(options.qualityRepair ? {executionRecord:{source:'local-edit' as const,rawResponse:'',completeHtml:output.extractedHtml,continuationCount:0,warnings:output.warnings??[],qualityReport:output.qualityReport,
        localEdit:{mode:'local' as const,targetNids:options.qualityRepair.labels.map(l=>l.nid),operationCount:options.qualityRepair.labels.length},
        sectioned:options.qualityRepair.draft.sectioned,
        draftRepair:{sourceFingerprint:options.qualityRepair.draft.fingerprint,sourceTaskId:options.qualityRepair.draft.sourceTaskId,confirmedLabels:structuredClone(options.qualityRepair.labels),
          ...(options.qualityRepair.draft.pageTaskSource?{historicalPageTaskSource:structuredClone(options.qualityRepair.draft.pageTaskSource)}:{}),
          ...(options.qualityRepair.draft.guidanceSource?{historicalGuidanceSource:structuredClone(options.qualityRepair.draft.guidanceSource)}:{})}}} : {}) } : {}) });};

    // If change_theme, return early with proposal
    if (intentResult.intent === 'change_theme') {
      return attachContract({
        status: 'theme_proposed',
        rawResponse: '已识别主题调整意图',
        themeProposal: intentResult.themeProposal,
        changeSet: { theme: intentResult.themeProposal }
      });
    }

    if(options.pageTaskPlanning){
      phase('planning');
      try{
        if(!['create','modify'].includes(workflowContract.operation)||workflowContract.elementNid)throw Error('当前业务规划入口仅支持新建或已授权的页面功能修改。');
        if(options.pageTaskPlanning.snapshot&&options.pageTaskPlanning.confirmed)throw Error('业务规划不能同时指定续写快照和确认计划。');
        if((options.resume||options.sectioned?.resume||options.qualityRepair)&&!options.pageTaskPlanning.snapshot)throw Error('继续任务缺少原业务规划，请重新生成。');
        workflowContract.pageTaskPlan=options.pageTaskPlanning.snapshot?structuredClone(options.pageTaskPlanning.snapshot):options.pageTaskPlanning.confirmed?
          bindConfirmedPageTaskPlan(workflowContract,options.pageTaskPlanning.confirmed.plan,options.pageTaskPlanning.confirmed.request):await preparePageTaskPlan(engineCore,{
          contract:workflowContract,provider,model,budget:taskBudget!,projectKnowledge:options.projectKnowledge,baselineHtml:sourceTarget?.htmlContent,textReferences:input.textReferences,
          attachment:input.attachment,useCustomNavigation:options.useCustomNavigation,signal,
          isCurrent:()=>!signal?.aborted&&(options.isCurrent?.()??true)});
        const issue=pageTaskPlanIssue(workflowContract);if(issue)throw Error(issue);
        if(signal?.aborted||options.isCurrent?.()===false)throw Error('任务或工程已变化，未使用业务规划。');
        if(workflowContract.pageTaskPlan.request.providerId!==provider.id||workflowContract.pageTaskPlan.request.model!==model)throw Error('业务规划的 Provider 或模型已变化，请重新生成。');
        options.onTaskPlan?.(structuredClone(workflowContract.pageTaskPlan));
        if(workflowContract.pageTaskPlan.plan.questions.length)throw Error(`业务规划有待确认的问题：${workflowContract.pageTaskPlan.plan.questions.join('；')}`);
      }catch(error){return attachContract({status:'error',rawResponse:'',errorMessage:error instanceof Error?error.message:'业务规划失败，未生成页面。'});}
    }

    if(resuming){
      try{workflowContract=inheritContinuationTask(workflowContract,options.resumeContract!);}
      catch(error){return attachContract({status:'error',rawResponse:'',errorMessage:error instanceof Error?error.message:'原续写任务已失效。'});}
    }

    // 2. System Prompt 组装 (ISSUE-015)
    // 意图在第 1 步才确定，故 Prompt 必须在此处构建，才能保住 T-AE-10 的
    // 按意图条件注入粒度（Few-Shot 仅 create_screen、改主题/提问零美学层）。
    const designBrief = intentResult.intent === 'create_screen' && designSystem
      ? options.designBrief ?? buildDesignBrief({ request: input.rawPrompt, designSystem, device: deviceProfile, mode: colorMode ?? 'light',
          globalDecisions: decisions.map(d => d.rule), components: components ?? [], projectKnowledge: options.projectKnowledge }) : undefined;
    const guidanceQuery:RuleQuery|undefined=!resuming&&options.contextualGuidance&&designSystem&&!options.qualityRepair&&['create','modify'].includes(workflowContract.operation)
      ? {request:input.rawPrompt,operation:workflowContract.operation,device:deviceProfile,scope:workflowContract.elementNid?'element':'page',
        features:options.contextualGuidance.features??(workflowContract.operation==='modify'&&sourceTarget?(workflowContract.elementNid?targetRuleFeatures(sourceTarget.htmlContent,[workflowContract.elementNid]):pageRuleFeatures(sourceTarget.htmlContent)):undefined),maxChars:10000}:undefined;
    if(guidanceQuery&&!resuming){
      const prepared=buildContextualCraft(intentResult.intent,guidanceQuery);
      workflowContract.designGuidance=makeGuidancePacket(workflowContract,prepared.selection,'html');
    }
    const evidenceCore=workflowContract.designGuidance?withGuidanceReceipts(engineCore,workflowContract,workflowContract.designGuidance):engineCore;
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
          designRules,
          decisions,
          intent: intentResult.intent,
          hasAttachment: Boolean(input.attachment),
          componentRequest: input.rawPrompt,
          taskBrief: designBrief
        })
      : `${baseSystemPrompt}\n${mobileNavigationPrompt(navigationPolicy)}`;

    const routedSystemPrompt = `${systemPrompt}\n\n${renderProjectManifestContext(projectManifest)}\n\n${renderDesignTaskContract(workflowContract)}`;

    // 3. Context Enrichment (ISSUE-011 + ISSUE-012 + D18 + D20)
    const enriched = enrichContext({
      rawPrompt: input.rawPrompt,
      intent: intentResult.intent,
      activeScreenId: input.activeScreenId,
      screens,
      deviceProfile,
      frameWidth,
      baseSystemPrompt: routedSystemPrompt,
      attachment: input.attachment,
      textReferences: input.textReferences,
      projectKnowledge: options.projectKnowledge,
      designRules,
      decisions,
      projectProseMarkdown: designProseMarkdown,
      targetScreenOverride: input.decision ? { id: input.decision.targetScreenId } : undefined,
      referenceScreenId:input.decision?.styleReferenceScreenId ?? input.decision?.targetScreenId,
      overrides:options.overrides,
      conversationHistory:options.conversationHistory
    });

    if(enriched.referenceErrors.length)return attachContract({status:'error',rawResponse:'',errorMessage:enriched.referenceErrors.join('；')+'。本次未生成或修改任何页面。'});

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
      hasExplicitStructuralChangeIntent: intentResult.hasExplicitStructuralChangeIntent,
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
    const frozenSelection=workflowContract.designGuidance?.selection??options.qualityRepair?.draft.guidanceSource?.designGuidance?.selection;
    const baseContextKey = contentFingerprint(JSON.stringify([input, Object.entries(sourceScreens).sort(([a],[b])=>a.localeCompare(b)).map(([id,s])=>[id,s.name,s.htmlContent,s.scopedCss]), options.overrides, deviceProfile, frameWidth, options.referenceDevice,
      options.useCustomNavigation, options.viewportGuideHeight, designSystem, options.designSystemOrigin, options.designLibraryBinding,
      projectManifest, protectedNids, components, designRules, decisions, options.projectKnowledge, options.knowledgeFingerprint, options.colorMode,
      ...(workflowContract.pageTaskPlan?[workflowContract.pageTaskPlan]:[]),
      ...(frozenSelection?[frozenSelection.selected.map(s=>s.fingerprint),frozenSelection.body]:[])]));
    const contextKey = options.sectioned?contentFingerprint(`${baseContextKey}:sections-v1`):baseContextKey;
    if(resuming){
      if((options.resume?.contextKey??options.sectioned?.resume?.contextKey)!==contextKey)return attachContract({status:'error',rawResponse:'',errorMessage:'原续写上下文已变化，未发送请求。'});
      if(!taskBudget!.consumeContinuation(workflowContract.taskId,resumeProof!))return attachContract({status:'error',rawResponse:'',errorMessage:'本检查点已被其它续写使用，未重复发送请求。'});
    }
    const qualityOptions = {deviceProfile,useCustomNavigation:options.useCustomNavigation,designSystem,baselineHtml:enriched.targetScreen?screens[enriched.targetScreen.id]?.htmlContent:undefined,protectedNids,modificationRequest:input.rawPrompt};
    let recovered: SectionedResult;
    phase(options.qualityRepair?'local-repair':'generating');
    if (options.qualityRepair) {
      const {draft,labels} = options.qualityRepair;
      if (draft.contextKey !== contextKey || draft.bindingKey !== continuationBindingKey({provider,model})) return attachContract({status:'error',rawResponse:'',usage:{inputTokens:0,outputTokens:0},errorMessage:'草稿的工程、原页或模型上下文已变化，请重新生成。'});
      try {
        const html = repairDraftLabels(draft, labels, qualityOptions);
        const title = (draft.title??'修复后的页面').replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');
        recovered = {rawResponse:`<artifact type="screen" title="${title}">${html}</artifact>`,warnings:['已按用户确认文案定点修复，未重新请求整页生成。'],usage:{inputTokens:0,outputTokens:0},finishReason:'stop',continuationCount:0};
      } catch (error) { return attachContract({status:'rejected_by_quality',rawResponse:'',usage:{inputTokens:0,outputTokens:0},failedDraft:draft,qualityReport:draft.quality,errorMessage:String(error instanceof Error?error.message:error)}); }
    } else if(options.sectioned) {
      recovered=await generateSectionedPage(requestCore,{provider,model,messages:enriched.messages,signal},contextKey,
        {resume:options.sectioned.resume,isCurrent:options.isCurrent,onProgress:options.onSectionProgress,onRequest:messages=>{const issue=recordReferenceInput(workflowContract,messages,provider.id,model);if(issue)throw Error(issue);}});
    } else recovered = await streamWithContinuation(requestCore, {
      provider, model, messages: enriched.messages,
      maxTokens: intentResult.intent === 'modify_screen' && (enriched.targetScreen?.htmlContent.length ?? 0) > 12000 ? 16384 : 8192,
      signal
    }, { onText: onStreamDelta, onReasoning: onReasoningDelta, allowContinuation: intentResult.intent !== 'question',
      resume: options.resume, onContinuation: options.onContinuation,
      contextKey });
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
    const finalized = finalizeModelHtml(recovered, { deviceProfile, useCustomNavigation: options.useCustomNavigation, designSystem,
      baselineHtml: enriched.targetScreen ? screens[enriched.targetScreen.id]?.htmlContent : undefined,
      protectedNids, modificationRequest: input.rawPrompt, signal });
    if (finalized.status !== 'valid') {
      const draft = finalized.status==='rejected_by_quality' && finalized.html ? makeFailedPageDraft(finalized.html,contextKey,continuationBindingKey({provider,model}),qualityOptions,finalized.artifact?.title) : undefined;
      if(draft){draft.sourceTaskId=workflowContract.taskId;if(workflowContract.pageTaskPlan)draft.pageTaskSource=structuredClone(workflowContract);if(workflowContract.designGuidance)draft.guidanceSource=structuredClone(workflowContract);draft.referenceImage=workflowContract.referenceImage?structuredClone(workflowContract.referenceImage):undefined;if(options.sectioned){draft.generationMode='sections';draft.sectioned=generationResult.sectioned;}}
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
