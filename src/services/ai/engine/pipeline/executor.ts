import type { ReferenceDevice } from '../../../../types/project';
import { normalizeMobileNavigation, mobileNavigationPrompt } from '../../../../utils/mobileNavigation';
import { streamWithContinuation } from '../../boundedContinuation';
import { buildDesignBrief, type DesignBrief } from '../../designBrief';
import { checkGenerationQuality, checkGenerationSourceSafety, qualitySummary } from '../../generationQuality';
import { AIEngineCore } from '../core/types';
import { enrichContext } from '../context/contextEnricher';
import { analyzePipelineIntent } from './interceptors/intentInterceptor';
import { extractArtifact, extractDeviationNote, extractHtmlFromResponse } from './interceptors/streamTransform';
import { checkStructureIntegrity } from './interceptors/guardInterceptor';
import { applyGeneratedHtml } from './interceptors/applier';
import { PipelineInput, PipelineOutput, PipelineContext } from './types';
import { AIProviderConfig } from '../../../../types/provider';
import { PromptBuilder } from '../../promptBuilder';
import { DesignSystem } from '../../../../types/designSystem';
import { ComponentDefinition } from '../../../../types/project';

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
  /**
   * 完整设计系统 (ISSUE-015)。传入后由 PromptBuilder 组装带 Token / 类名白名单 /
   * DESIGN.md / Craft 的完整 System Prompt；缺省时退回 baseSystemPrompt 字面量。
   */
  designSystem?: DesignSystem;
  designProseMarkdown?: string;
  designBrief?: DesignBrief;
  projectKnowledge?: string;
  protectedNids?: string[];
  colorMode?: 'light' | 'dark';
  components?: ComponentDefinition[];
  designRules?: string[];
  decisions?: Array<{ id: string; rule: string; rationale: string }>;
  onStreamDelta?: (text: string) => void;
  onReasoningDelta?: (reasoning: string) => void;
  signal?: AbortSignal;
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

    // If change_theme, return early with proposal
    if (intentResult.intent === 'change_theme') {
      return {
        status: 'theme_proposed',
        rawResponse: '已识别主题调整意图',
        themeProposal: intentResult.themeProposal,
        changeSet: { theme: intentResult.themeProposal }
      };
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

    // 3. Context Enrichment (ISSUE-011 + ISSUE-012 + D18 + D20)
    const enriched = enrichContext({
      rawPrompt: input.rawPrompt,
      intent: intentResult.intent,
      activeScreenId: input.activeScreenId,
      screens,
      deviceProfile,
      frameWidth,
      baseSystemPrompt: systemPrompt,
      attachment: input.attachment,
      textReferences: input.textReferences,
      projectKnowledge: options.projectKnowledge,
      designRules,
      decisions,
      projectProseMarkdown: designProseMarkdown,
      targetScreenOverride: input.decision ? { id: input.decision.targetScreenId } : undefined
    });

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
      warnings: enriched.warnings
    };

    // 3. Core Invocation
    const recovered = await streamWithContinuation(engineCore, {
      provider, model, messages: enriched.messages,
      maxTokens: intentResult.intent === 'modify_screen' && (enriched.targetScreen?.htmlContent.length ?? 0) > 12000 ? 16384 : 8192,
      signal
    }, { onText: onStreamDelta, onReasoning: onReasoningDelta, allowContinuation: intentResult.intent !== 'question' });
    const { rawResponse, reasoningText, usage, recoveredStreamError, finishReason } = recovered;
    const recoveryWarnings = recovered.warnings;
    if (recovered.errorMessage) return { status: 'error', rawResponse, reasoningText, usage, recoveredStreamError,
      warnings: recoveryWarnings, errorMessage: recovered.errorMessage };

    // If question intent, return directly
    if (intentResult.intent === 'question') {
      return {
        status: 'answered_question',
        rawResponse,
        reasoningText,
        recoveredStreamError,
        warnings: recoveryWarnings,
        usage
      };
    }

    // 4. Artifact Extraction
    const artifact = extractArtifact(rawResponse);
    if (!artifact || !artifact.html) {
      return {
        status: 'no_html',
        rawResponse,
        reasoningText,
        recoveredStreamError,
        warnings: recoveryWarnings,
        usage,
        errorMessage: '模型未输出有效的 HTML 代码块'
      };
    }
    const rawHtml = artifact.html;
    if (!artifact.isComplete) {
      const atLimit = /length|max[_-]?(?:output[_-]?)?tokens/i.test(finishReason ?? '');
      const message = atLimit ? '模型达到输出上限，页面未完整返回，原页面未修改。' : '模型输出未完整返回（页面产物未闭合），原页面未修改。';
      return { status: 'rejected_by_quality', rawResponse, reasoningText, usage, recoveredStreamError, warnings: recoveryWarnings,
        errorMessage: message, qualityReport: { passed: false, findings: [{ code: 'incomplete_artifact', severity: 'error', message,
          actual: finishReason ?? '未收到完整闭合产物', expected: '完整页面及闭合产物，不能将流式片段作为最终候选' }] } };
    }
    const deviationNote = extractDeviationNote(rawResponse);

    const artifactMeta = {
      identifier: artifact.identifier,
      type: artifact.type,
      title: artifact.title,
      isFallback: artifact.isFallback
    };

    // Never let DOMParser repair truncated or unsafe output before the quality gate.
    const rawQuality = checkGenerationSourceSafety(rawHtml, { deviceProfile, designSystem });
    if (!rawQuality.passed) return { status: 'rejected_by_quality', rawResponse, qualityReport: rawQuality,
      reasoningText, usage, recoveredStreamError, warnings: recoveryWarnings, errorMessage: qualitySummary(rawQuality) };
    const extractedHtml = normalizeMobileNavigation(rawHtml, navigationPolicy).html;
    const qualityReport = checkGenerationQuality(extractedHtml, {
      deviceProfile, useCustomNavigation: options.useCustomNavigation, designSystem, baselineHtml: enriched.targetScreen ? screens[enriched.targetScreen.id]?.htmlContent : undefined, protectedNids,
      modificationRequest: input.rawPrompt
    });
    if (!qualityReport.passed) return {
      status: 'rejected_by_quality', rawResponse, qualityReport, reasoningText, usage, recoveredStreamError, warnings: recoveryWarnings,
      errorMessage: qualitySummary(qualityReport)
    };

    // 5. Structure Guard Check
    const guardCheck = checkStructureIntegrity(pipelineContext, extractedHtml);
    if (!guardCheck.passed) {
      return {
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
      };
    }

    // 6. Applier (PRD D17 Side-by-side adoption)
    const applyRes = applyGeneratedHtml(pipelineContext, extractedHtml, {
      identifier: artifact.identifier,
      title: artifact.title
    });

    return {
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
    };
  }
}
