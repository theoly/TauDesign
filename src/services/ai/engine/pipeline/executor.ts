import {requiresPageVariantPlan,requiresMultiPagePlan,validMultiPageScope,type MultiPageScope} from '../../multiPageContract';
import {referenceImageIdentity,recordReferenceInput,inspectCreationSources} from '../../workflowSources';
import type { StyleOverride, ReferenceDevice, DesignSystemOrigin,DesignLibraryBinding } from '../../../../types/project';
import { normalizeMobileNavigation, mobileNavigationPrompt } from '../../../../utils/mobileNavigation';
import { streamWithContinuation, type ContinuationResult } from '../../boundedContinuation';
import type { ContinuationCheckpoint } from '../../generationContinuation';
import { modelExecutionRecord } from '../../designExecutionRecord';
import { buildDesignBrief, type DesignBrief } from '../../designBrief';
import { finalizeModelHtml } from '../../modelHtmlResult';
import { makeFailedPageDraft, repairDraftLabels, type FailedPageDraft, type DraftLabel } from '../../qualityDraft';
import { continuationBindingKey } from '../../generationContinuation';
import { generateSectionedPage, type SectionedCheckpoint, type SectionedResult } from '../../sectionedGeneration';
import { AIEngineCore, type EngineMessage } from '../core/types';
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
  qualityRepair?: { draft: FailedPageDraft; labels: DraftLabel[] };
  onContinuation?: (attempt: number, mode: 'native' | 'portable') => void;
  sectioned?: {resume?:SectionedCheckpoint};
  isCurrent?:()=>boolean;
  onSectionProgress?:(message:string)=>void;
}

export class PipelineExecutor {
  public static async execute(options: ExecutePipelineOptions): Promise<PipelineOutput> {
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
    if(intentResult.intent==='create_screen'&&input.attachment){
      try{referenceImage=referenceImageIdentity(input.attachment);}catch(error){return {status:'error',rawResponse:'',errorMessage:error instanceof Error?error.message:'参考图片无效。'};}
    }
    if(intentResult.intent==='create_screen'&&(((requiresMultiPagePlan(input.rawPrompt)||requiresPageVariantPlan(input.rawPrompt))&&!options.multiPage)||(options.multiPage&&!validMultiPageScope(options.multiPage))))return {status:'error',rawResponse:'',errorMessage:'多页面或多方案需求请先确认对应计划，再逐项生成。'};
    const workflowContract = buildDesignTaskContract({
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
    let generationResult: SectionedResult | undefined;
    const attachContract = (output: PipelineOutput): PipelineOutput => ({ ...output, workflowContract,
      ...(generationResult ? { continuationCheckpoint: generationResult.checkpoint, sectionedCheckpoint:generationResult.sectionedCheckpoint, executionRecord: { ...modelExecutionRecord(generationResult, {
        completeHtml: ['applied', 'staged_side_by_side', 'rejected_by_guard'].includes(output.status) ? output.extractedHtml : undefined,
        errorMessage: output.errorMessage,
        qualityReport: output.qualityReport,
        warnings: output.warnings
      }), ...(options.sectioned?{source:'sectioned-model' as const,rawResponse:'',sectioned:generationResult.sectioned}: {}) }, ...(options.qualityRepair ? {executionRecord:{source:'local-edit' as const,rawResponse:'',completeHtml:output.extractedHtml,continuationCount:0,warnings:output.warnings??[],qualityReport:output.qualityReport,
        localEdit:{mode:'local' as const,targetNids:options.qualityRepair.labels.map(l=>l.nid),operationCount:options.qualityRepair.labels.length},
        sectioned:options.qualityRepair.draft.sectioned,
        draftRepair:{sourceFingerprint:options.qualityRepair.draft.fingerprint,sourceTaskId:options.qualityRepair.draft.sourceTaskId,confirmedLabels:structuredClone(options.qualityRepair.labels)}}} : {}) } : {}) });

    // If change_theme, return early with proposal
    if (intentResult.intent === 'change_theme') {
      return attachContract({
        status: 'theme_proposed',
        rawResponse: '已识别主题调整意图',
        themeProposal: intentResult.themeProposal,
        changeSet: { theme: intentResult.themeProposal }
      });
    }

    // 2. System Prompt 组装 (ISSUE-015)
    // 意图在第 1 步才确定，故 Prompt 必须在此处构建，才能保住 T-AE-10 的
    // 按意图条件注入粒度（Few-Shot 仅 create_screen、改主题/提问零美学层）。
    const designBrief = intentResult.intent === 'create_screen' && designSystem
      ? options.designBrief ?? buildDesignBrief({ request: input.rawPrompt, designSystem, device: deviceProfile, mode: colorMode ?? 'light',
          globalDecisions: decisions.map(d => d.rule), components: components ?? [], projectKnowledge: options.projectKnowledge }) : undefined;
    const systemPrompt = designSystem
      ? PromptBuilder.buildSystemPrompt({
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
      const task=resolveWorkflowValidation(workflowContract,'create');
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

    const baseContextKey = contentFingerprint(JSON.stringify([input, Object.entries(sourceScreens).sort(([a],[b])=>a.localeCompare(b)).map(([id,s])=>[id,s.name,s.htmlContent,s.scopedCss]), options.overrides, deviceProfile, frameWidth, options.referenceDevice,
      options.useCustomNavigation, options.viewportGuideHeight, designSystem, options.designSystemOrigin, options.designLibraryBinding,
      projectManifest, protectedNids, components, designRules, decisions, options.projectKnowledge, options.knowledgeFingerprint, options.colorMode]));
    const contextKey = options.sectioned?contentFingerprint(`${baseContextKey}:sections-v1`):baseContextKey;
    const qualityOptions = {deviceProfile,useCustomNavigation:options.useCustomNavigation,designSystem,baselineHtml:enriched.targetScreen?screens[enriched.targetScreen.id]?.htmlContent:undefined,protectedNids,modificationRequest:input.rawPrompt};
    let recovered: SectionedResult;
    if (options.qualityRepair) {
      const {draft,labels} = options.qualityRepair;
      if (draft.contextKey !== contextKey || draft.bindingKey !== continuationBindingKey({provider,model})) return attachContract({status:'error',rawResponse:'',usage:{inputTokens:0,outputTokens:0},errorMessage:'草稿的工程、原页或模型上下文已变化，请重新生成。'});
      try {
        const html = repairDraftLabels(draft, labels, qualityOptions);
        const title = (draft.title??'修复后的页面').replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');
        recovered = {rawResponse:`<artifact type="screen" title="${title}">${html}</artifact>`,warnings:['已按用户确认文案定点修复，未重新请求整页生成。'],usage:{inputTokens:0,outputTokens:0},finishReason:'stop',continuationCount:0};
      } catch (error) { return attachContract({status:'rejected_by_quality',rawResponse:'',usage:{inputTokens:0,outputTokens:0},failedDraft:draft,qualityReport:draft.quality,errorMessage:String(error instanceof Error?error.message:error)}); }
    } else if(options.sectioned) {
      recovered=await generateSectionedPage(engineCore,{provider,model,messages:enriched.messages,signal},contextKey,
        {resume:options.sectioned.resume,isCurrent:options.isCurrent,onProgress:options.onSectionProgress,onRequest:messages=>{const issue=recordReferenceInput(workflowContract,messages,provider.id,model);if(issue)throw Error(issue);}});
    } else recovered = await streamWithContinuation(engineCore, {
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
      if(draft){draft.sourceTaskId=workflowContract.taskId;draft.referenceImage=workflowContract.referenceImage?structuredClone(workflowContract.referenceImage):undefined;if(options.sectioned){draft.generationMode='sections';draft.sectioned=generationResult.sectioned;}}
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
