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
  frameWidth: number;
  baseSystemPrompt: string;
  designTokens?: any;
  /**
   * 完整设计系统 (ISSUE-015)。传入后由 PromptBuilder 组装带 Token / 类名白名单 /
   * DESIGN.md / Craft 的完整 System Prompt；缺省时退回 baseSystemPrompt 字面量。
   */
  designSystem?: DesignSystem;
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
      screens,
      deviceProfile,
      frameWidth,
      baseSystemPrompt,
      designTokens,
      designSystem,
      colorMode,
      components,
      designRules = [],
      decisions = [],
      onStreamDelta,
      onReasoningDelta,
      signal
    } = options;

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
    const systemPrompt = designSystem
      ? PromptBuilder.buildSystemPrompt({
          designSystem,
          deviceProfile,
          frameWidth,
          colorMode,
          components,
          designRules,
          decisions,
          intent: intentResult.intent,
          hasAttachment: Boolean(input.attachment)
        })
      : baseSystemPrompt;

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
      designRules,
      decisions,
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
    const streamRes = engineCore.streamText({
      provider,
      model,
      messages: enriched.messages,
      signal
    });

    // Stream consumption loops
    (async () => {
      try {
        for await (const chunk of streamRes.textStream) {
          if (onStreamDelta) onStreamDelta(chunk);
        }
      } catch {}
    })();

    (async () => {
      try {
        for await (const rChunk of streamRes.reasoningStream) {
          if (onReasoningDelta) onReasoningDelta(rChunk);
        }
      } catch {}
    })();

    let rawResponse = '';
    try {
      rawResponse = await streamRes.textPromise;
    } catch (err: any) {
      return {
        status: 'error',
        rawResponse: '',
        errorMessage: err?.message || 'AI 生成异常中断'
      };
    }

    const reasoningText = await streamRes.reasoningPromise;
    const usage = await streamRes.usagePromise;
    const recoveredStreamError = await streamRes.recoveryPromise;

    // If question intent, return directly
    if (intentResult.intent === 'question') {
      return {
        status: 'answered_question',
        rawResponse,
        reasoningText,
        recoveredStreamError,
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
        usage,
        errorMessage: '模型未输出有效的 HTML 代码块'
      };
    }
    const extractedHtml = artifact.html;
    const deviationNote = extractDeviationNote(rawResponse);

    const artifactMeta = {
      identifier: artifact.identifier,
      type: artifact.type,
      title: artifact.title,
      isFallback: artifact.isFallback
    };

    // 5. Structure Guard Check
    const guardCheck = checkStructureIntegrity(pipelineContext, extractedHtml);
    if (!guardCheck.passed) {
      return {
        status: 'rejected_by_guard',
        rawResponse,
        reasoningText,
        extractedHtml,
        structureDiff: guardCheck.structureDiff,
        errorMessage: guardCheck.reason,
        recoveredStreamError,
        usage,
        artifactMetadata: artifactMeta,
        warnings: artifact.warnings
      };
    }

    // 6. Applier (PRD D17 Side-by-side adoption)
    const applyRes = applyGeneratedHtml(pipelineContext, extractedHtml, {
      identifier: artifact.identifier,
      title: artifact.title
    });

    return {
      status: applyRes.status,
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
      warnings: artifact.warnings
    };
  }
}
