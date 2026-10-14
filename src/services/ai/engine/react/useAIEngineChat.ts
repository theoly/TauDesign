import { useState, useRef, useEffect } from 'react';
import { useProjectStore } from '../../../../stores/useProjectStore';
import { useAIConfigStore } from '../../../../stores/useAIConfigStore';
import { useHistoryStore } from '../../../../stores/useHistoryStore';
import { PipelineExecutor } from '../pipeline/executor';
import { PipelineOutput } from '../pipeline/types';
import { createAIEngineCore, supportsVision } from '../core';
import { resolveGenerationTarget } from '../../generationTargetResolver';
import { StructureDiff } from '../../../../utils/structureGuard';
import { DeviationNote } from '../pipeline/interceptors/streamTransform';
import { CanvasToolExecutor } from '../../../tools/canvasToolExecutor';
import { resolveToolFromAIResponse } from '../../../tools/toolResolver';
import { resolveApplyToolCall } from '../../../tools/applyTargetResolver';
import { ScreenAuditReport } from '../../../../utils/tokenLint';
import { NidEngine } from '../../../../utils/nidEngine';

export interface ChatMessageItem {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  displayText?: string; // 净化后的展示文字，去除原始元素片段 HTML 源码
  referencedScreen?: {
    id: string;
    name: string;
    /** 目标并非用户显式引用，而是「明确要求修改」时落到的当前激活画框 (BR-GT-07) */
    viaActiveScreen?: boolean;
  };
  referencedElement?: {
    nid: string;
    tagName: string;
    screenName?: string;
  };
  imageUrl?: string;
  reasoningText?: string;
  thinkingStage?: number; // 1: 分析需求, 2: 规划布局, 3: 应用Token, 4: 渲染出图 (PRD §3.2.3)
  isGenerating?: boolean;
  isStopped?: boolean;
  elapsedSeconds?: number;
  checkpointId?: string;
  screenId?: string;
  screenName?: string;
  toolAction?: 'created' | 'modified' | 'patched';
  htmlOutput?: string;
  unmatchedMentions?: string[];
  structureDiff?: StructureDiff;
  pendingProposal?: any;
  candidateDecision?: string;
  decisionConfirmed?: boolean;
  /** 设计取舍披露 (doc/feature/deviation-note/spec.md)：真实冲突时模型附带的可选选择卡片 */
  deviationNote?: DeviationNote;
  /** 用户对 deviationNote 的裁决：'keep' 保持当前方案 / 'switch' 已填入参考图方案指令待发送 */
  deviationChoice?: 'keep' | 'switch';
  isError?: boolean;
  streamRecovered?: boolean;
  /** 本轮被结构守卫拦截，尚未落地任何画框 (BR-GRM-04) */
  isGuardRejected?: boolean;
  auditReport?: ScreenAuditReport;
  preActionSnapshot?: {
    screenId: string;
    screenName: string;
    htmlContent: string;
  };
  originalUserPrompt?: string;
  /** 本轮的生成目标裁决，挂载与强制放行复用它，避免二次推断 (BR-GT-06) */
  originalDecision?: {
    action: 'create_screen' | 'modify_screen' | 'patch_element';
    targetScreenId: string | null;
    styleReferenceScreenId: string | null;
    elementNid: string | null;
  };
  originalAttachment?: { name: string; dataUrl: string };
  originalReferencedScreenId?: string | null;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface SendMessageOptions {
  /** 引用开关点亮的画框；未点亮传 null (BR-GT-02) */
  referencedScreenId?: string | null;
  /** 画布激活画框；仅在用户明确说「修改」时才作为落点 (BR-GT-03) */
  activeScreenId?: string | null;
  referencedElement?: {
    nid: string;
    tagName: string;
    screenName?: string;
  };
  displayText?: string;
}

export function hasExplicitModifyIntent(text: string): boolean {
  const t = text.trim();
  // 显式要求创建新画框/页面时，不得认定为修改意图
  if (t.includes('新建') || t.includes('创建新') || t.includes('生成新') || t.includes('设计新') || t.includes('加一个页面')) {
    return false;
  }
  // 纯主题/配色调整诉求（如“把主题改成暗色”），不属于显式修改特定画框 (ISSUE-007 防护)
  if ((t.includes('主题') || t.includes('配色') || t.includes('风格')) && !t.includes('页面') && !t.includes('画框')) {
    return false;
  }
  return (
    t.includes('修改页面') ||
    t.includes('修改当前') ||
    t.includes('修改此') ||
    t.includes('修改该') ||
    t.includes('修改画框') ||
    t.includes('按附件图片精准修改') ||
    t.includes('按附件图片修改') ||
    t.includes('精准修改') ||
    t.includes('按图修改') ||
    t.includes('修改本页') ||
    t.includes('修改这一页') ||
    t.includes('替换当前') ||
    t.includes('更新当前') ||
    (t.includes('修改') && !t.includes('创建') && !t.includes('新建')) ||
    (t.includes('改成') && !t.includes('创建') && !t.includes('新建'))
  );
}

export function parseReferencedElement(text: string): {
  nid: string;
  tagName: string;
  screenName?: string;
} | null {
  const match = text.match(
    /\[引用元素\s+nid="([^"]+)"(?:\s+画框="([^"]*)")?(?:\s+标签=<([^>]+)>)?\]/
  );
  if (match) {
    return {
      nid: match[1],
      screenName: match[2] || undefined,
      tagName: match[3] || 'element'
    };
  }
  const fallbackMatch = text.match(/nid="([^"]+)"/);
  if (fallbackMatch && text.includes('元素片段:')) {
    return {
      nid: fallbackMatch[1],
      tagName: 'element'
    };
  }
  return null;
}

export function extractCleanUserPrompt(rawText: string): string {
  if (!rawText.includes('引用元素') && !rawText.includes('元素片段:')) {
    return rawText;
  }
  let cleaned = rawText;
  cleaned = cleaned.replace(/^\[引用元素[^\]]*\]\s*/i, '');
  cleaned = cleaned.replace(/^元素片段:\s*<[\s\S]*?>[\s\S]*?(?=\n\n([^\n<])|$)/i, '');
  if (cleaned.startsWith('元素片段:')) {
    const parts = cleaned.split(/\n\n+/);
    if (parts.length > 1) {
      cleaned = parts.slice(1).join('\n\n');
    } else {
      cleaned = cleaned.replace(/^元素片段:[^\n]*\n?/, '');
    }
  }
  return cleaned.trim();
}

const WELCOME_MESSAGE: ChatMessageItem = {
  id: 'welcome',
  sender: 'assistant',
  text: '你好！我是 AI 原生设计助手。输入页面诉求或点击下方快捷模板，我将基于当前工程的 Design Tokens 为您生成规范的 UI 画框。支持上传参考图反推设计，输入 @ 可显式引用已有画框。'
};

function detectCandidateDecision(prompt: string): string | undefined {
  const match = prompt.match(/(?:统一|必须|默认|约定|全部|所有)(.+?(?:圆角|风格|色|间距|规范|字体|阴影|设计|边框|组件))/);
  if (match) {
    return prompt.trim();
  }
  return undefined;
}

export function useAIEngineChat() {
  const {
    screens,
    activeScreenId,
    designSystem,
    components,
    setDesignSystem,
    decisions,
    settings,
    stageScreenChange,
    adoptStagedChange,
    discardStagedChange,
    keepBothScreens,
    addScreen,
    addDecision,
    getConversationStore,
    getAttachmentStore
  } = useProjectStore();

  const { getActiveProviderForRole } = useAIConfigStore();
  const { addCheckpoint } = useHistoryStore();

  const [messages, setMessages] = useState<ChatMessageItem[]>([WELCOME_MESSAGE]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [thinkingStage, setThinkingStage] = useState(0);
  const [unmatchedMentions, setUnmatchedMentions] = useState<string[]>([]);
  const [lastGuardOutput, setLastGuardOutput] = useState<PipelineOutput | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const engineCoreRef = useRef(createAIEngineCore());

  useEffect(() => {
    let isCancelled = false;
    const loadSaved = async () => {
      try {
        const convStore = getConversationStore();
        const attachmentStore = getAttachmentStore();
        const turns = await convStore.loadRecent(40);
        if (!isCancelled && turns && turns.length > 0) {
          const restored: ChatMessageItem[] = [];
          for (const t of turns) {
            const rawUserText = t.user.text;
            const refElem = parseReferencedElement(rawUserText);
            const cleanText = extractCleanUserPrompt(rawUserText);
            let refScreen: { id: string; name: string } | undefined = undefined;
            if (t.changeSet?.screens && t.changeSet.screens.length > 0) {
              const rw = t.changeSet.screens.find((s) => s.action === 'rewritten') || t.changeSet.screens[0];
              if (rw) {
                refScreen = { id: rw.id, name: rw.name };
              }
            }

            let imageUrl: string | undefined = undefined;
            if (t.user.attachments && t.user.attachments.length > 0) {
              try {
                const loaded = await attachmentStore.readDataUrl(t.user.attachments[0]);
                if (loaded) {
                  imageUrl = loaded;
                }
              } catch (e) {
                console.warn('[chat] 读取历史附件缩略图失败:', t.user.attachments[0], e);
              }
            }

            restored.push({
              id: `usr_${t.turnId}`,
              sender: 'user',
              text: rawUserText,
              displayText: cleanText !== rawUserText ? cleanText : undefined,
              referencedElement: refElem || undefined,
              referencedScreen: refScreen,
              imageUrl
            });
            restored.push({
              id: `ast_${t.turnId}`,
              sender: 'assistant',
              text: t.assistant.text || '已完成设计生成。',
              checkpointId: t.changeSet?.checkpointId
            });
          }
          if (!isCancelled) {
            setMessages([WELCOME_MESSAGE, ...restored]);
          }
        }
      } catch (e) {
        console.warn('Load conversations error:', e);
      }
    };
    loadSaved();
    return () => {
      isCancelled = true;
    };
  }, [getConversationStore, getAttachmentStore]);

  const abort = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsGenerating(false);
      setMessages((prev) =>
        prev.map((m, idx) =>
          idx === prev.length - 1 && m.sender === 'assistant'
            ? {
                ...m,
                isStopped: true,
                isGenerating: false,
                text: m.text ? `${m.text}\n\n[用户已停止生成]` : '生成已由用户手动停止。'
              }
            : m
        )
      );
    }
  };

  const sendMessage = async (
    rawPrompt: string,
    attachment?: { name: string; dataUrl: string },
    options?: SendMessageOptions
  ) => {
    const textToSend = rawPrompt.trim();
    if (!textToSend || isGenerating) return;

    // 生成目标单一裁决点 (BR-GT-06)：引用判定与动作判定只在这里做一次，
    // 下游 intentInterceptor / contextEnricher / toolResolver 全部消费该结果。
    const decision = resolveGenerationTarget({
      rawPrompt: textToSend,
      screens,
      referenceToggleScreenId:
        options && 'referencedScreenId' in options ? options.referencedScreenId : undefined,
      activeScreenId: options?.activeScreenId !== undefined ? options.activeScreenId : activeScreenId,
      elementRef: options?.referencedElement
        ? { nid: options.referencedElement.nid, screenName: options.referencedElement.screenName }
        : null
    });

    // 明确要求修改却无处可落：停手并引导，绝不改第一个画框也绝不静默新建 (BR-GT-03)
    if (decision.action === 'needs_reference') {
      setMessages((prev) => [
        ...prev,
        { id: `usr_${Date.now()}`, sender: 'user', text: textToSend, imageUrl: attachment?.dataUrl },
        {
          id: `warn_${Date.now()}`,
          sender: 'assistant',
          text:
            '你要求修改页面，但当前既没有引用任何画框，也没有处于激活状态的画框。\n\n' +
            '为避免误改到不相干的页面，本次未做任何改动。请任选一种方式指明目标：\n' +
            '1. 在输入框下方点亮【引用画框】开关；\n' +
            '2. 在诉求里用 @画框名 指明目标；\n' +
            '3. 先在画布上点选要修改的画框。'
        }
      ]);
      return;
    }

    const effectiveScreenId = decision.targetScreenId;

    // 意图预判：问答咨询走 chat 模型，页面代码生成与修改走 code 模型
    const isQuestion = decision.action === 'question';
    const primaryRole = isQuestion
      ? getActiveProviderForRole('chat') || getActiveProviderForRole('code')
      : getActiveProviderForRole('code') || getActiveProviderForRole('chat');

    let activeRole: { provider: any; modelId: string } | null = null;
    let switchedToVision = false;

    if (attachment) {
      // 附带图片需求：多模态能力裁决 (BR-VR-01 & BR-VR-02)
      const primarySupports = primaryRole && supportsVision(primaryRole.provider, primaryRole.modelId);
      const isPrimaryUsable =
        primaryRole &&
        primaryRole.provider &&
        (primaryRole.provider.apiKey || primaryRole.provider.protocol === 'ollama_native');

      if (primarySupports && isPrimaryUsable) {
        // 当前主选模型原生支持识图，优先沿用
        activeRole = primaryRole;
      } else {
        // 主选模型不支持识图 (如 DeepSeek) 或不可用，尝试使用专门的 Vision 档位
        const visionRole = getActiveProviderForRole('vision');
        const isVisionUsable =
          visionRole &&
          visionRole.provider &&
          (visionRole.provider.apiKey || visionRole.provider.protocol === 'ollama_native');

        if (isVisionUsable) {
          activeRole = visionRole;
          switchedToVision = true;
        } else {
          // 纯文本模型且 Vision 档位尚未就绪 -> 友好拦截，不裸调底层
          const provName = primaryRole?.provider?.name || '当前';
          const modelName = primaryRole?.modelId || '模型';
          setMessages((prev) => [
            ...prev,
            { id: `user_${Date.now()}`, sender: 'user', text: textToSend, imageUrl: attachment.dataUrl },
            {
              id: `warn_${Date.now()}`,
              sender: 'assistant',
              text: `当前${isQuestion ? '对话' : '代码'}模型【${provName} (${modelName})】为纯文本模型，不支持多模态视觉识图。\n\n由于尚未配置可用的 Vision 视觉档位，无法解析上传的设计参考图。\n\n💡 解决方案：\n1. 点击右上角【Provider 配置】，为 Google Gemini、Claude 3.5 或 GPT-4o 等配置 API Key 并指派为 Vision 档；\n2. 或将当前模型切换为支持多模态的模型；\n3. 或移除参考设计图，仅发送文字需求。`
            }
          ]);
          return;
        }
      }
    } else {
      activeRole = primaryRole;
    }

    const isUsable =
      activeRole &&
      activeRole.provider &&
      (activeRole.provider.apiKey || activeRole.provider.protocol === 'ollama_native');

    if (!activeRole || !isUsable) {
      setMessages((prev) => [
        ...prev,
        { id: `user_${Date.now()}`, sender: 'user', text: textToSend },
        {
          id: `warn_${Date.now()}`,
          sender: 'assistant',
          text: '未检测到已配置或已启用的 AI Provider（或 API Key 为空）。请先在右上角【设置】中配置 Provider 凭证。'
        }
      ]);
      return;
    }

    const userMsgId = `usr_${Date.now()}`;
    const assistantMsgId = `ast_${Date.now()}`;
    const startTime = Date.now();

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const targetScreen = effectiveScreenId ? screens[effectiveScreenId] : undefined;
    const preSnapshot = targetScreen
      ? {
          screenId: targetScreen.id,
          screenName: targetScreen.name,
          htmlContent: targetScreen.htmlContent
        }
      : undefined;

    const referencedElement =
      options?.referencedElement || parseReferencedElement(textToSend) || undefined;
    // 徽章如实区分「用户引用」与「落到当前画框」，不再把自动落点谎报为引用 (BR-GT-07)
    const referencedScreen =
      effectiveScreenId && screens[effectiveScreenId]
        ? {
            id: effectiveScreenId,
            name: screens[effectiveScreenId].name,
            viaActiveScreen: decision.referenceSource === 'active_screen'
          }
        : undefined;
    const cleanDisplayPrompt =
      options?.displayText || extractCleanUserPrompt(textToSend);

    setMessages((prev) => [
      ...prev,
      {
        id: userMsgId,
        sender: 'user',
        text: textToSend,
        displayText: cleanDisplayPrompt !== textToSend ? cleanDisplayPrompt : undefined,
        referencedScreen,
        referencedElement,
        imageUrl: attachment?.dataUrl
      },
      {
        id: assistantMsgId,
        sender: 'assistant',
        text: '',
        isGenerating: true,
        thinkingStage: 1, // 1: 分析需求
        preActionSnapshot: preSnapshot,
        originalUserPrompt: textToSend,
        originalAttachment: attachment,
        originalReferencedScreenId: effectiveScreenId,
        originalDecision: {
          action: decision.action === 'create_screen' ? 'create_screen' : decision.action === 'patch_element' ? 'patch_element' : 'modify_screen',
          targetScreenId: decision.targetScreenId,
          styleReferenceScreenId: decision.styleReferenceScreenId,
          elementNid: decision.elementNid
        }
      }
    ]);

    setIsGenerating(true);
    setThinkingStage(1);
    setUnmatchedMentions([]);
    setLastGuardOutput(null);

    // Simulate progressive thinking stages per PRD §3.2.3
    const stageTimer1 = setTimeout(() => {
      setThinkingStage(2); // 2: 规划布局
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantMsgId ? { ...m, thinkingStage: 2 } : m))
      );
    }, 600);

    const stageTimer2 = setTimeout(() => {
      setThinkingStage(3); // 3: 应用Token
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantMsgId ? { ...m, thinkingStage: 3 } : m))
      );
    }, 1200);

    try {
      const activeDecisionsList = Object.values(decisions)
        .filter((d) => d.active)
        .map((d) => ({
          id: d.id,
          rule: d.text,
          rationale: d.scope === 'global' ? '全局约定' : '画框局部约定'
        }));

      const output = await PipelineExecutor.execute({
        input: {
          rawPrompt: textToSend,
          attachment,
          activeScreenId: effectiveScreenId,
          decision: {
            intent:
              decision.action === 'question' || decision.action === 'change_theme'
                ? decision.action
                : decision.action === 'create_screen'
                ? 'create_screen'
                : 'modify_screen',
            targetScreenId: decision.targetScreenId,
            styleReferenceScreenId: decision.styleReferenceScreenId,
            elementNid: decision.elementNid,
            reason: decision.reason
          }
        },
        provider: activeRole.provider,
        model: activeRole.modelId,
        engineCore: engineCoreRef.current,
        screens,
        deviceProfile: settings.deviceProfile,
        frameWidth: settings.frameWidth,
        baseSystemPrompt: '你是一名顶级前端与UI设计系统专家，负责输出高质感现代 Web 设计。',
        // ISSUE-015: 必须把完整设计系统与当前明暗模式交给管道，
        // 否则模型拿不到 Token 与类名白名单，只能自行发挥并写死颜色
        designSystem,
        colorMode: settings.colorMode,
        components: Object.values(components),
        designTokens: designSystem.tokens,
        designRules: activeDecisionsList.map((d) => d.rule),
        decisions: activeDecisionsList,
        onStreamDelta: (delta) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId
                ? { ...m, thinkingStage: 4, text: m.text + delta }
                : m
            )
          );
        },
        onReasoningDelta: (rDelta) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId
                ? { ...m, reasoningText: (m.reasoningText || '') + rDelta }
                : m
            )
          );
        },
        signal: controller.signal
      });

      clearTimeout(stageTimer1);
      clearTimeout(stageTimer2);
      const elapsedSeconds = Number(((Date.now() - startTime) / 1000).toFixed(1));

      if (output.status === 'error') {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? { ...m, isGenerating: false, isError: true, text: `生成失败: ${output.errorMessage}` }
              : m
          )
        );
        return;
      }

      if (output.status === 'rejected_by_guard') {
        setLastGuardOutput(output);
        const currentScreens = useProjectStore.getState().screens;
        const targetScreenId =
          decision.targetScreenId ||
          effectiveScreenId ||
          (Object.keys(currentScreens).length > 0 ? Object.keys(currentScreens)[0] : null);
        const targetScreen = targetScreenId ? currentScreens[targetScreenId] : null;
        const screenTitle = targetScreen?.name || '目标画框';

        if (targetScreenId && output.extractedHtml) {
          const formattedHtml = NidEngine.injectNids(output.extractedHtml);
          stageScreenChange(
            targetScreenId,
            formattedHtml,
            `${screenTitle} (AI 方案候选)`
          );
          useProjectStore.getState().panToScreen(targetScreenId);
        }

        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? {
                  ...m,
                  isGenerating: false,
                  elapsedSeconds,
                  structureDiff: output.structureDiff,
                  isGuardRejected: true,
                  htmlOutput: output.extractedHtml,
                  screenId: targetScreenId || undefined,
                  screenName: screenTitle,
                  toolAction: 'modified',
                  text: `⚠️ ${output.errorMessage}\n\n已在原页面右侧并排展示新版方案供观测对比。若确认符合预期，可点击【采纳新版 (替换原版)】放行更新。`
                }
              : m
          )
        );
        return;
      }

      if (output.status === 'theme_proposed') {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? {
                  ...m,
                  isGenerating: false,
                  elapsedSeconds,
                  pendingProposal: output.themeProposal,
                  text: '已生成设计系统 Token 变更提案，请在设计面板中确认采纳。'
                }
              : m
          )
        );
        return;
      }

      let checkpointId: string | undefined;
      let createdScreenId: string | undefined;
      let finalScreenName: string | undefined;

      // 使用统一画布工具执行器 (Canvas Tools / KISS 原则)
      const toolCall = resolveToolFromAIResponse({
        rawResponse: output.rawResponse,
        userPrompt: textToSend,
        activeScreenId: effectiveScreenId,
        screens: useProjectStore.getState().screens,
        extractedHtml: output.extractedHtml,
        artifactMetadata: output.artifactMetadata,
        decision: {
          intent: decision.action === 'create_screen' ? 'create_screen' : 'modify_screen',
          targetScreenId: decision.targetScreenId,
          styleReferenceScreenId: decision.styleReferenceScreenId,
          elementNid: decision.elementNid
        }
      });

      let toolAction: 'created' | 'modified' | 'patched' | undefined;
      if (toolCall) {
        toolAction =
          toolCall.tool === 'create_screen'
            ? 'created'
            : toolCall.tool === 'modify_screen'
            ? 'modified'
            : 'patched';

        const toolResult = CanvasToolExecutor.execute(toolCall);
        if (toolResult.success) {
          createdScreenId = toolResult.screenId;
          finalScreenName = toolResult.screenName;
          checkpointId = toolResult.checkpointId;
        }
      }

      const candidateDecision = detectCandidateDecision(textToSend);

      const fallbackPromptTokens = Math.max(1, Math.round(textToSend.length / 3.5));
      const fallbackCompletionTokens = Math.max(1, Math.round((output.extractedHtml?.length || output.rawResponse.length || 100) / 3.5));
      const promptTokens = output.usage?.inputTokens ?? fallbackPromptTokens;
      const completionTokens = output.usage?.outputTokens ?? fallbackCompletionTokens;
      const turnUsage = {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens
      };

      const defaultText =
        toolAction === 'modified'
          ? `已在右侧生成「${finalScreenName || '目标画框'}」的新版候选方案，请观测对比并选择替换或保留。`
          : toolAction === 'patched'
          ? `已对画框「${finalScreenName || '目标画框'}」局部节点完成针对性修改。`
          : '已根据指示生成高保真设计。';

      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId
            ? {
                ...m,
                isGenerating: false,
                elapsedSeconds,
                checkpointId,
                screenId: createdScreenId,
                screenName: finalScreenName,
                toolAction,
                htmlOutput: output.extractedHtml,
                candidateDecision,
                deviationNote: output.deviationNote,
                streamRecovered: Boolean(output.recoveredStreamError),
                usage: turnUsage,
                text: switchedToVision
                  ? `> 💡 **提示**: 当前主力模型为纯文本模型，已自动转由 Vision 档位 **${activeRole.provider.name} (${activeRole.modelId})** 解析参考图。\n\n${m.text || defaultText}`
                  : m.text || defaultText
              }
            : m
        )
      );

      // JSONL Conversation persistence
      try {
        let attachmentPath: string | undefined;
        if (attachment) {
          const saved = await getAttachmentStore().save(attachment.name, attachment.dataUrl);
          if (saved) {
            attachmentPath = saved.relPath;
          }
        }

        await getConversationStore().appendTurn({
          turnId: `turn_${Date.now()}`,
          ts: Date.now(),
          user: {
            text: textToSend,
            attachments: attachmentPath ? [attachmentPath] : undefined
          },
          assistant: {
            text: output.rawResponse
          },
          changeSet: {
            screens: output.changeSet?.screens as any,
            checkpointId
          }
        });
      } catch (storeErr) {
        console.warn('Conversation save error:', storeErr);
      }
    } catch (err: any) {
      clearTimeout(stageTimer1);
      clearTimeout(stageTimer2);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId
            ? { ...m, isGenerating: false, isError: true, text: `请求异常: ${err?.message || '未知错误'}` }
            : m
        )
      );
    } finally {
      setIsGenerating(false);
      abortControllerRef.current = null;
    }
  };

  /** 裁决并落地一段已生成 HTML，目标画框由 resolveApplyToolCall 统一判定 (BR-GRM-02 / BR-GRM-03) */
  const applyHtmlToTarget = (
    msg: ChatMessageItem | undefined,
    htmlToApply: string,
    fallbackScreenId?: string | null,
    createTitle?: string,
    forceInPlace?: boolean
  ) => {
    const userPrompt = msg?.originalUserPrompt || '';
    const storeScreens = useProjectStore.getState().screens;

    // 本轮已有裁决时直接沿用，挂载与强制放行都不得重新推断落点 (BR-GT-06)
    const decided = msg?.originalDecision;
    if (decided) {
      const target = decided.targetScreenId && storeScreens[decided.targetScreenId]
        ? storeScreens[decided.targetScreenId]
        : null;
      if (decided.action !== 'create_screen' && target) {
        return CanvasToolExecutor.execute({
          tool: 'modify_screen',
          params: { screenId: target.id, title: target.name, html: htmlToApply, forceInPlace }
        });
      }
      if (decided.action === 'create_screen') {
        return CanvasToolExecutor.execute({
          tool: 'create_screen',
          params: {
            title: createTitle || msg?.screenName || '新设计页',
            html: htmlToApply,
            referencedScreenId: decided.styleReferenceScreenId || undefined
          }
        });
      }
    }

    const toolCall = resolveApplyToolCall({
      html: htmlToApply,
      userPrompt,
      screens: storeScreens,
      referencedScreenId: msg?.originalReferencedScreenId,
      snapshotScreenId: msg?.preActionSnapshot?.screenId,
      fallbackScreenId,
      isGuardRejected: msg?.isGuardRejected,
      isModifyIntent: hasExplicitModifyIntent(userPrompt),
      createTitle
    });

    if (toolCall) {
      if (toolCall.tool === 'modify_screen') {
        return CanvasToolExecutor.execute({
          ...toolCall,
          params: { ...toolCall.params, forceInPlace }
        });
      }
      return CanvasToolExecutor.execute(toolCall);
    }
    return null;
  };

  const handleAdoptCandidate = () => {
    adoptStagedChange();
    setLastGuardOutput(null);
    setMessages((prev) =>
      prev.map((msg) => ({
        ...msg,
        isGuardRejected: false,
        structureDiff: undefined,
        text: msg.text ? msg.text.replace('⚠️ 结构守卫拦截', '✅ 结构守卫已放行并应用') : msg.text
      }))
    );
  };

  const handleDiscardCandidate = () => {
    discardStagedChange();
    setLastGuardOutput(null);
  };

  const handleKeepBothCandidates = () => {
    keepBothScreens();
    setLastGuardOutput(null);
    setMessages((prev) =>
      prev.map((msg) => ({
        ...msg,
        isGuardRejected: false,
        structureDiff: undefined
      }))
    );
  };

  const forceApply = (specificHtml?: string, msgId?: string) => {
    if (useProjectStore.getState().stagedScreen) {
      handleAdoptCandidate();
      return;
    }

    const sourceMsg = msgId
      ? messages.find((m) => m.id === msgId)
      : [...messages].reverse().find((m) => m.isGuardRejected);
    const htmlToApply = specificHtml || sourceMsg?.htmlOutput || lastGuardOutput?.extractedHtml;
    if (!htmlToApply) return;

    const fallbackScreenId =
      activeScreenId || (Object.keys(screens).length > 0 ? Object.keys(screens)[0] : null);
    const result = applyHtmlToTarget(sourceMsg, htmlToApply, fallbackScreenId, undefined, true);

    if (!result || !result.success) {
      if (!fallbackScreenId) return;
      stageScreenChange(
        fallbackScreenId,
        htmlToApply,
        `${screens[fallbackScreenId]?.name || '画框'} (强制应用)`
      );
    } else if (sourceMsg) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === sourceMsg.id
            ? {
                ...m,
                isGuardRejected: false,
                screenId: result.screenId,
                screenName: result.screenName,
                checkpointId: result.checkpointId,
                toolAction:
                  result.tool === 'create_screen'
                    ? 'created'
                    : result.tool === 'patch_element'
                    ? 'patched'
                    : 'modified'
              }
            : m
        )
      );
    }
    setLastGuardOutput(null);
    setMessages((prev) =>
      prev.map((msg) =>
        msg.structureDiff
          ? {
              ...msg,
              structureDiff: undefined,
              text: msg.text.replace('⚠️ 结构守卫拦截', '✅ 结构守卫已放行并应用')
            }
          : msg
      )
    );
  };

  const confirmDecision = (msgId: string, decisionText: string) => {
    addDecision(decisionText, 'global', undefined, { kind: 'auto_extracted', conversationId: msgId });
    setMessages((prev) => prev.map((m) => (m.id === msgId ? { ...m, decisionConfirmed: true } : m)));
  };

  const dismissDecision = (msgId: string) => {
    setMessages((prev) => prev.map((m) => (m.id === msgId ? { ...m, candidateDecision: undefined } : m)));
  };

  /**
   * 用户对设计取舍卡片的裁决 (doc/feature/deviation-note/spec.md BR-DN-05)。
   * 'keep' 仅标记已处理，不触发任何新生成；'switch' 的实际指令填入由 ChatDrawer
   * 侧调用既有 handleInsertQuickPrompt(note.alternativeInstruction) 完成，
   * 此处只负责记录裁决状态，不发明新的暂停/恢复生成机制。
   */
  const resolveDeviationChoice = (msgId: string, choice: 'keep' | 'switch') => {
    setMessages((prev) => prev.map((m) => (m.id === msgId ? { ...m, deviationChoice: choice } : m)));
  };

  const resolveProposal = (msgId: string, choice: 'applied' | 'once' | 'ignored') => {
    const targetMsg = messages.find((m) => m.id === msgId);
    const proposal = targetMsg?.pendingProposal;
    if (choice === 'applied' && proposal) {
      setDesignSystem({ ...designSystem, tokens: proposal.apply(designSystem.tokens) });
    }
    setMessages((prev) =>
      prev.map((m) =>
        m.id === msgId && m.pendingProposal
          ? { ...m, pendingProposal: { ...m.pendingProposal, resolved: choice } }
          : m
      )
    );
  };

  const mountMessageHtml = (msgId: string) => {
    const target = messages.find((m) => m.id === msgId);
    if (!target?.htmlOutput) return;

    // 先按该轮的引用画框与用户诉求裁决落点，仅无目标可循时才新建 (BR-GRM-02)
    const result = applyHtmlToTarget(
      target,
      target.htmlOutput,
      null,
      target.screenName || '画框 (AI 补挂)'
    );

    if (result?.success) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId
            ? {
                ...m,
                isGuardRejected: false,
                screenId: result.screenId,
                screenName: result.screenName,
                checkpointId: result.checkpointId,
                toolAction:
                  result.tool === 'create_screen'
                    ? 'created'
                    : result.tool === 'patch_element'
                    ? 'patched'
                    : 'modified'
              }
            : m
        )
      );
    }
  };

  const retryTurn = (msgId: string) => {
    const target = messages.find((m) => m.id === msgId);
    if (!target?.originalUserPrompt || isGenerating) return;
    sendMessage(target.originalUserPrompt, target.originalAttachment, {
      referencedScreenId: target.originalReferencedScreenId ?? target.preActionSnapshot?.screenId ?? null
    });
  };

  const rollbackAndRetryTurn = (msgId: string) => {
    const target = messages.find((m) => m.id === msgId);
    if (!target?.originalUserPrompt || isGenerating) return;

    // 清空当前的 Staging 状态
    discardStagedChange();

    // 如果记录了修改前画框快照，回滚至该版本
    if (target.preActionSnapshot) {
      const { screenId, htmlContent, screenName } = target.preActionSnapshot;
      useProjectStore.getState().updateScreenHtml(
        screenId,
        htmlContent,
        `回退至修改前版本: ${screenName}`
      );
    }

    // 重新发起请求
    sendMessage(target.originalUserPrompt, target.originalAttachment, {
      referencedScreenId: target.originalReferencedScreenId ?? target.preActionSnapshot?.screenId ?? null
    });
  };

  const postAuditMessage = async (report: ScreenAuditReport) => {
    const msgId = `audit_${Date.now()}`;
    const auditMsg: ChatMessageItem = {
      id: msgId,
      sender: 'assistant',
      text: `已完成「${report.screenName}」画框的 Token 规范评测。当前合规度为 ${report.complianceRate}%，检测到 ${report.issues.length} 处风格逃逸点。`,
      auditReport: report
    };
    setMessages((prev) => [...prev, auditMsg]);
    try {
      await getConversationStore().appendTurn({
        turnId: msgId,
        ts: Date.now(),
        user: { text: `[一键评测] 评估「${report.screenName}」页面 Token 规范合规度` },
        assistant: {
          text: auditMsg.text,
          model: 'token-lint-engine'
        },
        intent: 'question'
      });
    } catch (e) {
      console.warn('Failed to append audit turn to conversation:', e);
    }
  };

  return {
    messages,
    isGenerating,
    thinkingStage,
    unmatchedMentions,
    lastGuardOutput,
    sendMessage,
    abort,
    forceApply,
    mountMessageHtml,
    retryTurn,
    rollbackAndRetryTurn,
    confirmDecision,
    dismissDecision,
    resolveProposal,
    resolveDeviationChoice,
    adoptCandidate: handleAdoptCandidate,
    discardCandidate: handleDiscardCandidate,
    keepBothCandidates: handleKeepBothCandidates,
    postAuditMessage
  };
}
