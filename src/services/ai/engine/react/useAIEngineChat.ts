import type { ImageAttachment } from '../../../../types/referenceImage';
import type { SectionedCheckpoint } from '../../sectionedGeneration';
import {requiresPageVariantPlan,requiresMultiPagePlan,type MultiPageItem,type MultiPageReview} from '../../multiPageContract';
import {prepareMultiPagePlan,executeMultiPagePlan,type PreparedMultiPagePlan} from '../../multiPageService';
import { buildConversationContext } from '../context/conversationContext';
import { referenceDevicePrompt } from '../../../../utils/referenceDevice';
import { normalizeMobileNavigation, mobileNavigationPrompt } from '../../../../utils/mobileNavigation';
import { buildProjectKnowledgeBundle, buildProjectKnowledgeContext } from '../../projectKnowledge';
import { buildDesignBrief, type DesignBrief } from '../../designBrief';
import type { QualityReport } from '../../generationQuality';
import { useState, useRef, useEffect } from 'react';
import { useProjectStore } from '../../../../stores/useProjectStore';
import { useAIConfigStore } from '../../../../stores/useAIConfigStore';
import { useHistoryStore } from '../../../../stores/useHistoryStore';
import { PipelineExecutor } from '../pipeline/executor';
import { buildDesignProjectManifest } from '../../projectManifest';
import { PipelineOutput } from '../pipeline/types';
import { createAIEngineCore, supportsVision } from '../core';
import { resolveGenerationTarget } from '../../generationTargetResolver';
import { StructureDiff } from '../../../../utils/structureGuard';
import { DeviationNote,extractArtifact } from '../pipeline/interceptors/streamTransform';
import { CanvasToolExecutor } from '../../../tools/canvasToolExecutor';
import { resolveToolFromAIResponse } from '../../../tools/toolResolver';
import { resolveApplyToolCall } from '../../../tools/applyTargetResolver';
import { ScreenAuditReport } from '../../../../utils/tokenLint';
import { NidEngine } from '../../../../utils/nidEngine';
import { formatTextReferences, type TextReference } from '../../textFileContext';
import { analyzeScreenModification, buildReviewedModificationRequest, buildModificationReviewReceipt, captureModificationSnapshot, isModificationSnapshotCurrent, getLocalModificationPlan, getRegionModificationPlan,
  type ModificationAnalysis, type ModificationMode, type ModificationReviewState, type ModificationSnapshot, type ModificationReviewReceipt } from '../../modificationReview';
import { selectModificationEntryWorkflow } from '../../workflowCatalog';
import { executeStructuredEdit } from '../../structuredEditExecutor';
import {pageCreationContext,isPageCreationEvidence} from '../../pageCreationValidation';
import { isOutputLimit, continuationBindingKey, type ContinuationCheckpoint } from '../../generationContinuation';
import { buildDesignTaskContract, contentFingerprint, type DesignTaskContract } from '../../designWorkflow';
import { draftRepairTargets, suggestDraftLabels, type DraftLabel } from '../../qualityDraft';
import { saveQualityDraft, loadQualityDrafts, claimDraftSuggestion, type SavedQualityDraft } from '../../../storage/qualityDraftRepository';

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
  textFileNames?: string[];
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
  creationRepairNotice?:string;
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
  generationWarnings?: string[];
  generationProgress?: string;
  continuationAvailable?: boolean;
  sectionedMode?: boolean;
  sectionedAvailable?: boolean;
  outputLimitReached?: boolean;
  /** 本轮被结构守卫拦截，尚未落地任何画框 (BR-GRM-04) */
  isGuardRejected?: boolean;
  auditReport?: ScreenAuditReport;
  qualityReport?: QualityReport;
  qualityDraft?: SavedQualityDraft;
  qualityDraftSaved?: boolean;
  qualityDraftBusy?: boolean;
  qualityDraftNotice?: string;
  workflowContract?: DesignTaskContract;
  designBrief?: DesignBrief;
  modificationReview?: ModificationReviewState;
  pagePlan?:MultiPageReview;
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
  originalAttachment?: ImageAttachment;
  originalReferencedScreenId?: string | null;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface SendMessageOptions {
  /** Explicit recovery actions; private checkpoints stay outside persisted chat messages. */
  continuationMessageId?: string;
  qualityRepair?: { value: SavedQualityDraft; labels: DraftLabel[] };
  splitSinglePage?: boolean;
  sectioned?: boolean;
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
  textReferences?: TextReference[];
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
    id: projectId,
    folderPath,
    screens,
    activeScreenId,
    designSystem,
    components,
    setDesignSystem,
    decisions,
    settings,
    stageScreenChange,
    adoptStagedChange,
    forceAdoptStagedChange,
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
  const conversationKey = JSON.stringify([projectId, folderPath ?? null]);
  const [restoredHistoryKey, setRestoredHistoryKey] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [thinkingStage, setThinkingStage] = useState(0);
  const [unmatchedMentions, setUnmatchedMentions] = useState<string[]>([]);
  const [lastGuardOutput, setLastGuardOutput] = useState<PipelineOutput | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const engineCoreRef = useRef(createAIEngineCore());
  const operationLockRef = useRef(false);
  const pagePlansRef=useRef(new Map<string,{context:string;projectId:string;folderPath?:string;prepared?:PreparedMultiPagePlan;controller?:AbortController}>());
  const continuationSessionsRef=useRef(new Map<string,{checkpoint?:ContinuationCheckpoint;sectionedCheckpoint?:SectionedCheckpoint;context:string;decision:ReturnType<typeof resolveGenerationTarget>;
    approved?:{snapshot:ModificationSnapshot;decision:ReturnType<typeof resolveGenerationTarget>;receipt?:ModificationReviewReceipt};textReferences:TextReference[]}>());
  const modificationPlansRef = useRef(new Map<string, {
    request: string; attachment?: ImageAttachment; options?: SendMessageOptions;
    snapshot: ModificationSnapshot; decision: ReturnType<typeof resolveGenerationTarget>; analysis?: ModificationAnalysis;
  }>());

  useEffect(() => {
    let isCancelled = false;
    abortControllerRef.current?.abort();
    modificationPlansRef.current.clear();
    pagePlansRef.current.clear();
    continuationSessionsRef.current.clear();
    abortControllerRef.current=null;operationLockRef.current=false;setIsGenerating(false);
    setMessages([WELCOME_MESSAGE]);
    setRestoredHistoryKey(null);
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
              imageUrl,
              textFileNames: t.user.textFiles
            });
            const historicalPage=refScreen&&useProjectStore.getState().screens[refScreen.id];
            const creationEvidence=historicalPage?.metadata?.creationEvidence;
            const repairedTurn=t.assistant.text?.startsWith('已完成一次控件样式修复')&&isPageCreationEvidence(creationEvidence)&&creationEvidence.repair?.status==='repaired';
            restored.push({
              id: `ast_${t.turnId}`,
              sender: 'assistant',
              text: t.assistant.text || '已完成设计生成。',
              checkpointId: t.changeSet?.checkpointId,
              ...(repairedTurn?{creationRepairNotice:'此轮曾完成一次控件样式修复；历史结果不代表当前页面已复验。',htmlOutput:extractArtifact(t.assistant.text)?.html,screenId:refScreen!.id,screenName:refScreen!.name}:{}),
            });
          }
          if (!isCancelled) {
            setMessages([WELCOME_MESSAGE, ...restored]);
          }
        }
        const drafts = await loadQualityDrafts(projectId, folderPath);
        if (!isCancelled && drafts.length) setMessages(prev=>[...prev,...drafts.map(value=>({id:value.id,sender:'assistant' as const,text:'页面草稿已恢复，尚未通过验收。',qualityDraft:value,qualityDraftSaved:true,
          qualityReport:value.draft.quality,originalUserPrompt:value.request,originalReferencedScreenId:value.decision.targetScreenId,isError:true}))]);
      } catch (e) {
        console.warn('Load conversations error:', e);
      } finally {
        if (!isCancelled) setRestoredHistoryKey(conversationKey);
      }
    };
    loadSaved();
    return () => {
      isCancelled = true;
      abortControllerRef.current?.abort();
      continuationSessionsRef.current.clear();
    };
  }, [conversationKey, getConversationStore, getAttachmentStore]);

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
                pagePlan:m.pagePlan&&['planning','running'].includes(m.pagePlan.status)?{...m.pagePlan,status:'cancelled',message:'多页面生成已取消，未加入页面。'}:m.pagePlan,
                modificationReview: m.modificationReview ? { ...m.modificationReview, status: 'cancelled' } : undefined,
                text: m.text ? `${m.text}\n\n[用户已停止生成]` : '生成已由用户手动停止。'
              }
            : m
        )
      );
    }
  };

  const cancelPagePlan=(id:string)=>{
    const session=pagePlansRef.current.get(id);session?.controller?.abort();pagePlansRef.current.delete(id);
    setMessages(prev=>prev.map(m=>m.id===id&&m.pagePlan?.status!=='complete'?{...m,pagePlan:{...m.pagePlan,status:'cancelled',message:session?.prepared?.plan.kind==='variants'?'方案任务已取消，未加入方案。':'多页面任务已取消，未加入页面。'}}:m));
  };
  const confirmPagePlan=async(id:string,pages:MultiPageItem[])=>{
    const session=pagePlansRef.current.get(id);if(!session?.prepared||isGenerating||operationLockRef.current)return;
    if(pageCreationContext(useProjectStore.getState())!==session.context){setMessages(prev=>prev.map(m=>m.id===id?{...m,pagePlan:{...m.pagePlan,status:'blocked',message:'工程或设计上下文已变化，请重新规划。'}}:m));return;}
    const controller=new AbortController();session.controller=controller;abortControllerRef.current=controller;operationLockRef.current=true;setIsGenerating(true);
    const current=()=>pagePlansRef.current.get(id)===session&&useProjectStore.getState().id===session.projectId&&useProjectStore.getState().folderPath===session.folderPath;
    const conversationStore=useProjectStore.getState().getConversationStore();
    try{
      setMessages(prev=>prev.map(m=>m.id===id?{...m,pagePlan:{...m.pagePlan,status:'running',message:session.prepared!.plan.kind==='variants'?'正在逐项生成并检查；全部通过后并排加入比较副本。':'正在逐页生成并检查；全部通过后一起加入画布。'}}:m));
      const result=await executeMultiPagePlan(session.prepared,pages,{getState:()=>useProjectStore.getState(),commit:batch=>useProjectStore.getState().applyMultiPageCreation(batch),signal:controller.signal,isCurrent:current,
        onProgress:progress=>{if(current())setMessages(prev=>prev.map(m=>m.id===id?{...m,pagePlan:{...m.pagePlan!,progress}}:m));}});
      if(current())setMessages(prev=>prev.map(m=>m.id===id?{...m,pagePlan:{...m.pagePlan!,status:result.status,message:result.message}}:m));
      if(current())void conversationStore.appendTurn({turnId:id,ts:Date.now(),user:{text:session.prepared.plan.request},assistant:{text:result.message+'\n'+pages.map(p=>p.name).join('、'),aborted:result.status!=='complete'},intent:session.prepared.plan.kind==='variants'?'create_page_variants':'create_multiple_pages',changeSet:result.status==='complete'?{screens:result.screenIds.map((screenId,index)=>({id:screenId,name:pages[index].name,action:'created' as const}))}:undefined}).catch(error=>console.warn('[multi-page] 会话摘要保存失败',error));
      pagePlansRef.current.delete(id);
    }finally{if(abortControllerRef.current===controller){abortControllerRef.current=null;operationLockRef.current=false;setIsGenerating(false);}}
  };

  const sendMessage = async (
    rawPrompt: string,
    attachment?: ImageAttachment,
    options?: SendMessageOptions,
    approved?: { snapshot: ModificationSnapshot; decision: ReturnType<typeof resolveGenerationTarget>; receipt?: ModificationReviewReceipt }
  ) => {
    const textToSend = rawPrompt.trim();
    if (!textToSend || isGenerating || operationLockRef.current) return;
    if (approved && !isModificationSnapshotCurrent(useProjectStore.getState(), approved.snapshot)) return;
    const resuming = options?.continuationMessageId ? continuationSessionsRef.current.get(options.continuationMessageId) : undefined;
    if(options?.continuationMessageId&&!resuming)return;
    const repairing = options?.qualityRepair;
    const textReferences = resuming?.textReferences || repairing?.value.textReferences || options?.textReferences || [];
    const requestState=useProjectStore.getState();
    const requestScreens=requestState.screens;
    const creationContext=pageCreationContext(requestState);
    const recoveryContext=()=>contentFingerprint(JSON.stringify([requestState.id,creationContext,requestState.settings,requestState.overrides,requestState.components]));
    if(repairing && (repairing.value.projectId!==requestState.id || repairing.value.projectContext!==recoveryContext() || repairing.value.status!=='blocked')) {
      setMessages(prev=>prev.map(m=>m.qualityDraft?.id===repairing.value.id?{...m,qualityDraftNotice:'工程、原页或设计约束已变化，请重新生成；旧草稿仅供查看。'}:m));return;
    }
    if(resuming&&resuming.context!==recoveryContext()){
      continuationSessionsRef.current.delete(options!.continuationMessageId!);
      setMessages(prev=>prev.map(m=>m.id===options!.continuationMessageId?{...m,continuationAvailable:false,text:'工程、原页或设计约束已变化，旧片段不能继续使用；请重新生成。'}:m));return;
    }
    if(resuming)approved=resuming.approved;

    // 生成目标单一裁决点 (BR-GT-06)：引用判定与动作判定只在这里做一次，
    // 下游 intentInterceptor / contextEnricher / toolResolver 全部消费该结果。
    const decision = repairing?.value.decision ?? resuming?.decision ?? approved?.decision ?? resolveGenerationTarget({
      rawPrompt: textToSend,
      screens:requestScreens,
      referenceToggleScreenId:
        options && 'referencedScreenId' in options ? options.referencedScreenId : undefined,
      activeScreenId: options?.activeScreenId !== undefined ? options.activeScreenId : activeScreenId,
      elementRef: options?.referencedElement
        ? { nid: options.referencedElement.nid, screenName: options.referencedElement.screenName }
        : null
    });
    const sections=Boolean(options?.sectioned||resuming?.sectionedCheckpoint||repairing?.value.draft.generationMode==='sections');
    if(sections&&(decision.action!=='create_screen'||requiresMultiPagePlan(textToSend)||requiresPageVariantPlan(textToSend))){
      setMessages(prev=>[...prev,{id:`section_warn_${crypto.randomUUID()}`,sender:'assistant',text:'分区生成用于新建同一页。修改旧页请使用局部/区块修改；多页或多方案请关闭分区选项后单独规划。'}]);return;
    }

    // 明确要求修改却无处可落：停手并引导，绝不改第一个画框也绝不静默新建 (BR-GT-03)
    if (decision.action === 'needs_reference') {
      setMessages((prev) => [
        ...prev,
        { id: `usr_${Date.now()}`, sender: 'user', text: textToSend, imageUrl: attachment?.dataUrl },
        {
          id: `warn_${Date.now()}`,
          sender: 'assistant',
          text:
            `无法确定本轮操作对应的页面。${decision.reason}\n\n` +
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

    const knowledgeBundle = buildProjectKnowledgeBundle(useProjectStore.getState(), textToSend, (effectiveScreenId ?? decision.styleReferenceScreenId) ?? undefined);
    const projectKnowledge = [referenceDevicePrompt(settings), mobileNavigationPrompt(settings), knowledgeBundle.content].filter(Boolean).join('\n\n');

    if(resuming&&(resuming.checkpoint?.bindingKey??resuming.sectionedCheckpoint?.bindingKey)!==continuationBindingKey({provider:activeRole!.provider,model:activeRole!.modelId})){
      setMessages(prev=>prev.map(m=>m.id===options!.continuationMessageId?{...m,continuationAvailable:false,text:'Provider或模型已变化，请重新生成；未使用旧续写片段。'}:m));continuationSessionsRef.current.delete(options!.continuationMessageId!);return;
    }
    if(repairing && repairing.value.draft.bindingKey!==continuationBindingKey({provider:activeRole.provider,model:activeRole.modelId})) {
      setMessages(prev=>prev.map(m=>m.qualityDraft?.id===repairing.value.id?{...m,qualityDraftNotice:'Provider或模型已变化，请重新生成；未使用旧草稿。'}:m));return;
    }
    if(resuming){continuationSessionsRef.current.delete(options!.continuationMessageId!);setMessages(prev=>prev.map(m=>m.id===options!.continuationMessageId?{...m,continuationAvailable:false}:m));}
    const variants=!options?.splitSinglePage&&!decision.elementNid&&requiresPageVariantPlan(extractCleanUserPrompt(textToSend));
    if(!repairing&&!resuming&&!approved&&decision.action==='create_screen'&&(options?.splitSinglePage||variants||requiresMultiPagePlan(textToSend))){
      const id=`multi_${crypto.randomUUID()}`,controller=new AbortController();
      const session={context:creationContext,projectId:requestState.id,folderPath:requestState.folderPath,prepared:undefined as PreparedMultiPagePlan|undefined,controller};
      pagePlansRef.current.set(id,session);abortControllerRef.current=controller;operationLockRef.current=true;setIsGenerating(true);
      const current=()=>pagePlansRef.current.get(id)===session&&!controller.signal.aborted&&pageCreationContext(useProjectStore.getState())===creationContext;
      setMessages(prev=>[...prev,{id:`usr_${id}`,sender:'user',text:textToSend,imageUrl:attachment?.dataUrl,textFileNames:textReferences.map(r=>r.name)},
        {id,sender:'assistant',text:'',pagePlan:{status:'planning',message:variants?'正在整理同页方案差异；确认前不会生成或修改页面。':'正在整理页面清单；确认前不会生成或修改页面。'}}]);
      try{
        const prepared=await prepareMultiPagePlan({state:requestState,request:textToSend,provider:activeRole.provider,model:activeRole.modelId,core:engineCoreRef.current,
          attachment,textReferences,referencePageId:(variants?(decision.targetScreenId??decision.styleReferenceScreenId):decision.styleReferenceScreenId)??undefined,signal:controller.signal,isCurrent:current,splitFromSingle:options?.splitSinglePage});
        if(!current())throw Error('页面计划已取消或工程已变化，请重新规划。');session.prepared=prepared;
        setMessages(prev=>prev.map(m=>m.id===id?{...m,workflowContract:prepared.contract,pagePlan:{status:'ready',plan:prepared.plan,message:prepared.plan.summary}}:m));
      }catch(error){if(pagePlansRef.current.get(id)===session)setMessages(prev=>prev.map(m=>m.id===id?{...m,pagePlan:{status:controller.signal.aborted?'cancelled':'blocked',message:error instanceof Error?error.message:'页面规划失败。'}}:m));}
      finally{if(abortControllerRef.current===controller){abortControllerRef.current=null;operationLockRef.current=false;setIsGenerating(false);}}
      return;
    }

    const modifiesExisting = (decision.action === 'modify_screen' || decision.action === 'patch_element') && effectiveScreenId;
    const modificationSnapshot = approved?.snapshot ?? (modifiesExisting
      ? captureModificationSnapshot(useProjectStore.getState(), effectiveScreenId!) : undefined);

    // 具体改法已由用户授权，直接生成；宽泛诉求才整理可选择的建议。
    const modificationEntryWorkflow = modifiesExisting
      ? selectModificationEntryWorkflow(extractCleanUserPrompt(textToSend), { hasElementReference: Boolean(decision.elementNid) }) : null;
    if (!repairing && !approved && modifiesExisting && modificationEntryWorkflow?.id === 'review-page-modification') {
      const current = useProjectStore.getState();
      const screen = current.screens[effectiveScreenId];
      const snapshot = captureModificationSnapshot(current, effectiveScreenId);
      const workflowContract = buildDesignTaskContract({ intent: 'modify_screen', reviewRequired: true, request: textToSend,
        target: { id: screen.id, name: screen.name, htmlContent: screen.htmlContent }, elementNid: decision.elementNid,
        deviceProfile: current.settings.deviceProfile, frameWidth: current.settings.frameWidth,
        referenceDeviceName: current.settings.referenceDevice?.name, designSystem: current.designSystem,
        designSystemOrigin: current.designSystemOrigin, protectedNids: current.getProtectedNids(screen.id),
        knowledgeFingerprint: knowledgeBundle.fingerprint,
        knowledgeSources: [...knowledgeBundle.sources.map(source => ({ kind: source.kind === 'document' ? 'document' as const : 'page' as const, id: source.id,
          fingerprint: source.fingerprint ?? '', ...(source.stale ? { stale: true } : {}) })),
          ...textReferences.map(reference => ({ kind: 'text-reference' as const, id: reference.path ?? reference.name, fingerprint: contentFingerprint(reference.content) }))] });
      const reviewId = `review_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const plan = { request: textToSend, attachment, options, snapshot, decision, analysis: undefined as ModificationAnalysis | undefined };
      modificationPlansRef.current.set(reviewId, plan);
      const controller = new AbortController();
      abortControllerRef.current = controller;
      operationLockRef.current = true;
      setIsGenerating(true);
      setMessages(prev => [...prev,
        { id: `usr_${reviewId}`, sender: 'user', text: textToSend, displayText: options?.displayText || extractCleanUserPrompt(textToSend), imageUrl: attachment?.dataUrl,
          referencedElement: options?.referencedElement || parseReferencedElement(textToSend) || undefined,
          referencedScreen: { id: effectiveScreenId, name: screens[effectiveScreenId].name, viaActiveScreen: decision.referenceSource === 'active_screen' } },
        { id: reviewId, sender: 'assistant', text: '', workflowContract,
          modificationReview: { status: 'analyzing', summary: '正在读取原页面，整理可选择的修改建议。', items: [] } }
      ]);
      const update = (review: ModificationReviewState) => setMessages(prev => prev.map(m => m.id === reviewId ? { ...m, modificationReview: review } : m));
      try {
        const analysis = await analyzeScreenModification(engineCoreRef.current, {
          provider: activeRole.provider, model: activeRole.modelId, signal: controller.signal,
          html: screen.htmlContent, name: screen.name, request: textToSend,
          isCurrent: () => isModificationSnapshotCurrent(useProjectStore.getState(), snapshot),
          useCustomNavigation: current.settings.useCustomNavigation,
          designSystem: current.designSystem, mode: current.settings.colorMode, elementNid: decision.elementNid,
          deviceProfile: current.settings.deviceProfile, frameWidth: current.settings.frameWidth,
          protectedNids: current.getProtectedNids(effectiveScreenId),
          imageUrl: attachment?.dataUrl,
          projectKnowledge,
          workflowContract,
          context: JSON.stringify({ scopedCss: screen.scopedCss,
            overrides: Object.entries(current.overrides).filter(([key]) => key.startsWith(`${effectiveScreenId}:`)),
            references: textReferences, decisions: Object.values(current.decisions).filter(d => d.active) })
        });
        if (!isModificationSnapshotCurrent(useProjectStore.getState(), snapshot)) throw new Error('原页面或工程已变化，请重新分析。');
        plan.analysis = analysis;
        update({ ...analysis, status: 'ready' });
      } catch (error) {
        update({ status: controller.signal.aborted ? 'cancelled' : 'error', summary: error instanceof Error ? error.message : '分析失败，请重试。', items: [] });
      } finally {
        operationLockRef.current = false;
        setIsGenerating(false);
        if (abortControllerRef.current === controller) abortControllerRef.current = null;
      }
      return;
    }

    if (!repairing && !approved && modifiesExisting && decision.elementNid) {
      // 明确引用的具体要求只生成该子树的操作，禁止退回整页改写。
      const current = useProjectStore.getState();
      const screen = current.screens[effectiveScreenId!];
      const snapshot = modificationSnapshot!;
      const controller = new AbortController(); abortControllerRef.current = controller;
      operationLockRef.current = true; setIsGenerating(true); setLastGuardOutput(null);
      const messageId = `element_${Date.now()}`;
      const startedAt = Date.now();
      const conversationStore = current.getConversationStore(), attachmentStore = current.getAttachmentStore();
      setMessages(prev => [...prev,
        {id:`usr_${messageId}`,sender:'user',text:textToSend,displayText:options?.displayText || extractCleanUserPrompt(textToSend),imageUrl:attachment?.dataUrl,
          referencedElement:options?.referencedElement || parseReferencedElement(textToSend) || undefined,
          referencedScreen:{id:screen.id,name:screen.name},textFileNames:textReferences.map(file=>file.path || file.name)},
        {id:messageId,sender:'assistant',text:'',isGenerating:true,thinkingStage:2,
          preActionSnapshot:{screenId:screen.id,screenName:screen.name,htmlContent:screen.htmlContent},originalUserPrompt:textToSend,
          originalReferencedScreenId:screen.id,originalAttachment:attachment,
          originalDecision:{action:'modify_screen',targetScreenId:screen.id,styleReferenceScreenId:null,elementNid:decision.elementNid}}
      ]);
      try {
        const workflowContract = buildDesignTaskContract({ intent: 'modify_screen', request: textToSend,
          target: { id: screen.id, name: screen.name, htmlContent: screen.htmlContent }, elementNid: decision.elementNid,
          deviceProfile: current.settings.deviceProfile, frameWidth: current.settings.frameWidth,
          referenceDeviceName: current.settings.referenceDevice?.name, designSystem: current.designSystem,
          designSystemOrigin: current.designSystemOrigin, protectedNids: current.getProtectedNids(screen.id),
          knowledgeFingerprint: knowledgeBundle.fingerprint,
          knowledgeSources: [...knowledgeBundle.sources.map(source => ({ kind: source.kind === 'document' ? 'document' as const : 'page' as const, id: source.id,
            fingerprint: source.fingerprint ?? '', ...(source.stale ? { stale: true } : {}) })),
            ...textReferences.map(reference => ({ kind: 'text-reference' as const, id: reference.path ?? reference.name, fingerprint: contentFingerprint(reference.content) }))] });
        const candidate = await executeStructuredEdit(engineCoreRef.current,{
          mode:'element',binding:{provider:activeRole.provider,model:activeRole.modelId},signal:controller.signal,
          screen,elementNid:decision.elementNid,request:extractCleanUserPrompt(textToSend),settings:current.settings,contract:workflowContract,
          designSystem:current.designSystem,colorMode:current.settings.colorMode,protectedNids:current.getProtectedNids(screen.id),
          isCurrent:()=>isModificationSnapshotCurrent(useProjectStore.getState(),snapshot),
          imageUrl:attachment?.dataUrl,projectKnowledge:[projectKnowledge,formatTextReferences(textReferences)].filter(Boolean).join('\n\n'),
          context:JSON.stringify({scopedCss:screen.scopedCss,overrides:Object.entries(current.overrides).filter(([key])=>key.startsWith(`${screen.id}:`))})
        });
        if (controller.signal.aborted) return;
        if (candidate.status!=='ready') throw new Error(candidate.message);
        if (!isModificationSnapshotCurrent(useProjectStore.getState(),snapshot)) throw new Error('原页面或工程已变化，本次未应用修改。');
        current.stageScreenChange(screen.id,candidate.html,`${screen.name}（元素细节修改候选）`,textToSend,workflowContract,
          candidate.executionRecord);
        current.panToScreen(screen.id);
        const resultText = `已在原页副本中修改所引用元素的局部细节，其他内容保留。请对比后采纳。`;
        setMessages(prev=>prev.map(m=>m.id===messageId?{...m,text:resultText,isGenerating:false,elapsedSeconds:Number(((Date.now()-startedAt)/1000).toFixed(1)),
          screenId:screen.id,screenName:screen.name,toolAction:'modified',htmlOutput:candidate.html,qualityReport:candidate.qualityReport,workflowContract}:m));
        try {
          const saved = attachment ? await attachmentStore.save(attachment.name,attachment.dataUrl) : null;
          await conversationStore.appendTurn({turnId:messageId,ts:Date.now(),user:{text:textToSend,
            attachments:saved?[saved.relPath]:undefined,textFiles:textReferences.map(file=>file.path || file.name)},assistant:{text:resultText}});
        } catch (error) { console.warn('Conversation save error:',error); }
      } catch (error) {
        if (!controller.signal.aborted) setMessages(prev=>prev.map(m=>m.id===messageId?{...m,isGenerating:false,isError:true,
          text:`局部修改未执行：${error instanceof Error ? error.message : String(error)}`} : m));
      } finally {
        operationLockRef.current = false; setIsGenerating(false);
        if (abortControllerRef.current === controller) abortControllerRef.current = null;
      }
      return;
    }

    operationLockRef.current = true;
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
    const contextReferenceId=effectiveScreenId ?? decision.styleReferenceScreenId;
    const referencedScreen =
      contextReferenceId && requestScreens[contextReferenceId]
        ? {
            id: contextReferenceId,
            name: requestScreens[contextReferenceId].name,
            viaActiveScreen: decision.referenceSource === 'active_screen'
          }
        : undefined;
    const cleanDisplayPrompt =
      options?.displayText || extractCleanUserPrompt(textToSend);

    const taskBrief = decision.action === 'create_screen' ? buildDesignBrief({ request: cleanDisplayPrompt,
      designSystem, device: settings.deviceProfile, mode: settings.colorMode,
      globalDecisions: Object.values(decisions).filter(d => d.active && d.scope === 'global').map(d => d.text),
      components: Object.values(components), projectKnowledge }) : undefined;

    setMessages((prev) => [
      ...prev,
      {
        id: userMsgId,
        sender: 'user',
        text: textToSend,
        displayText: cleanDisplayPrompt !== textToSend ? cleanDisplayPrompt : undefined,
        referencedScreen,
        referencedElement,
        imageUrl: attachment?.dataUrl,
        textFileNames: textReferences.map((file) => file.path || file.name)
      },
      {
        id: assistantMsgId,
        sender: 'assistant',
        text: '',
        isGenerating: true,
        designBrief: taskBrief,
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
          textReferences,
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
        resume: resuming?.checkpoint,
        qualityRepair: repairing ? {draft:repairing.value.draft,labels:repairing.labels} : undefined,
        sectioned: sections ? {resume:resuming?.sectionedCheckpoint} : undefined,
        onSectionProgress: message=>{if(!controller.signal.aborted)setMessages(prev=>prev.map(m=>m.id===assistantMsgId?{...m,generationProgress:message}:m));},
        isCurrent: sections ? ()=>{
          const current=useProjectStore.getState();
          const latest=switchedToVision?getActiveProviderForRole('vision'):(getActiveProviderForRole('code')||getActiveProviderForRole('chat'));
          return !controller.signal.aborted&&current.folderPath===requestState.folderPath&&contentFingerprint(JSON.stringify([current.id,pageCreationContext(current),current.settings,current.overrides,current.components]))===recoveryContext()
            &&Boolean(latest&&continuationBindingKey({provider:latest.provider,model:latest.modelId})===continuationBindingKey({provider:activeRole!.provider,model:activeRole!.modelId}));
        } : undefined,
        onContinuation: (attempt) => {if(!controller.signal.aborted)setMessages(prev=>prev.map(m=>m.id===assistantMsgId?{...m,generationProgress:`页面较长，正在接续第 ${attempt} 段；保留已生成内容…`}:m));},
        screens:requestScreens,
        overrides:requestState.overrides,
        conversationHistory:buildConversationContext(messages),
        deviceProfile: settings.deviceProfile,
        useCustomNavigation: settings.useCustomNavigation,
        frameWidth: settings.frameWidth,
        referenceDevice: settings.referenceDevice,
        viewportGuideHeight: settings.viewportGuideHeight,
        baseSystemPrompt: '你是一名顶级前端与UI设计系统专家，负责输出高质感现代 Web 设计。',
        // ISSUE-015: 必须把完整设计系统与当前明暗模式交给管道，
        // 否则模型拿不到 Token 与类名白名单，只能自行发挥并写死颜色
        designSystem,
        designSystemOrigin: requestState.designSystemOrigin,
        designLibraryBinding:requestState.designLibraryBinding,
        designBrief: taskBrief,
        projectKnowledge,
        knowledgeSources: knowledgeBundle.sources.map(source => ({ kind: source.kind === 'document' ? 'document' : 'page', id: source.id,
          fingerprint: source.fingerprint ?? '', ...(source.stale ? { stale: true } : {}) })),
        knowledgeFingerprint: knowledgeBundle.fingerprint,
        colorMode: settings.colorMode,
        protectedNids: decision.targetScreenId ? useProjectStore.getState().getProtectedNids(decision.targetScreenId) : [],
        components: Object.values(components),
        projectManifest: buildDesignProjectManifest({
          projectId: requestState.id,
          projectName: requestState.name,
          deviceProfile: settings.deviceProfile,
          screens: Object.values(requestScreens),
          assets: Object.values(requestState.assets),
          components: Object.values(components),
          designSystem,
          designSystemOrigin: requestState.designSystemOrigin,
          designLibraryBinding: requestState.designLibraryBinding
        }),
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

      if (approved?.receipt && output.workflowContract) output.workflowContract = { ...output.workflowContract, modificationReview: structuredClone(approved.receipt) };
      clearTimeout(stageTimer1);
      clearTimeout(stageTimer2);
      const elapsedSeconds = Number(((Date.now() - startTime) / 1000).toFixed(1));

      // 失败和质量拒绝同样消耗模型用量；恢复请求的累计统计不能因早退而丢失。
      const promptTokens = output.usage?.inputTokens ?? Math.max(1, Math.round(textToSend.length / 3.5));
      const completionTokens = output.usage?.outputTokens ?? Math.max(1, Math.round((output.extractedHtml?.length || output.rawResponse.length || 100) / 3.5));
      let turnUsage = { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens };
      setMessages(prev => prev.map(m => m.id === assistantMsgId ? {
        ...m, usage: turnUsage, generationWarnings: output.warnings, elapsedSeconds
      } : m));
      if (controller.signal.aborted || useProjectStore.getState().id!==requestState.id || useProjectStore.getState().folderPath!==requestState.folderPath) return;
      if(output.continuationCheckpoint||output.sectionedCheckpoint){
        continuationSessionsRef.current.set(assistantMsgId,{checkpoint:output.continuationCheckpoint,sectionedCheckpoint:output.sectionedCheckpoint,context:recoveryContext(),decision:structuredClone(decision),approved,textReferences:structuredClone(textReferences)});
      }
      setMessages(prev=>prev.map(m=>m.id===assistantMsgId?{...m,sectionedMode:sections,sectionedAvailable:!!output.sectionedCheckpoint,continuationAvailable:!!output.continuationCheckpoint||!!output.sectionedCheckpoint,
        outputLimitReached:!!output.continuationCheckpoint||isOutputLimit(output.executionRecord?.finishReason)}:m));

      if (modificationSnapshot && !isModificationSnapshotCurrent(useProjectStore.getState(), modificationSnapshot)) {
        setMessages(prev => prev.map(m => m.id === assistantMsgId ? { ...m, isGenerating: false, isError: true, text: '生成期间原页面或工程已变化，本次未应用修改，请重新分析。' } : m));
        return;
      }

      if (output.status === 'rejected_by_quality') {
        let value: SavedQualityDraft | undefined, saved=false, notice='';
        if(output.failedDraft) {
          value={version:1,id:repairing?.value.id??`draft-${Date.now().toString(36)}-${crypto.randomUUID()}`,projectId:requestState.id,createdAt:repairing?.value.createdAt??Date.now(),
            draft:output.failedDraft,request:textToSend,projectContext:recoveryContext(),decision:structuredClone(decision),textReferences:structuredClone(textReferences),status:'blocked',
            aiAttempted:repairing?.value.aiAttempted,suggestions:repairing?.value.suggestions};
          try {
            if(attachment){const asset=await requestState.getAttachmentStore().save(attachment.name,attachment.dataUrl);if(!asset)throw Error('参考图未能落盘');value.attachment={name:attachment.name,relPath:asset.relPath,...(attachment.region?{region:attachment.region}:{})};}
            await saveQualityDraft(value,requestState.folderPath);saved=true;
          }catch(error){notice=`草稿仅保留于当前会话，保存失败：${error instanceof Error?error.message:String(error)}`;}
        }
        if(controller.signal.aborted || useProjectStore.getState().id!==requestState.id || useProjectStore.getState().folderPath!==requestState.folderPath)return;
        setMessages(prev => prev.map(m => m.id === assistantMsgId ? { ...m, isGenerating: false, isError: true, text: value?'页面已生成，暂未通过验收。原页面未改变。':`本次结果未应用：${output.errorMessage}`,
          qualityReport: output.qualityReport,qualityDraft:value,qualityDraftSaved:saved,qualityDraftNotice:notice } : m));
        return;
      }

      if (output.status === 'error' || output.status === 'no_html') {
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
              `${screenTitle} (AI 方案候选)`, textToSend, output.workflowContract, output.executionRecord
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
                  qualityReport: output.qualityReport,
                  workflowContract: output.workflowContract,
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
      let appliedHtml: string | undefined;
      let repairNotice: string | undefined;

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

        const toolResult = await CanvasToolExecutor.executeAsync(toolCall.tool === 'modify_screen' ? { ...toolCall, params: { ...toolCall.params, modificationRequest: textToSend,
          workflowContract: output.workflowContract,executionRecord:output.executionRecord } } : toolCall.tool==='create_screen'?{...toolCall,params:{...toolCall.params,workflowContract:output.workflowContract,executionRecord:output.executionRecord}}:toolCall,
          {signal:controller.signal,isCurrent:()=>pageCreationContext(useProjectStore.getState())===creationContext,
            repair:toolCall.tool==='create_screen'&&output.executionRecord?.source==='model'?{core:engineCoreRef.current,provider:activeRole.provider,model:activeRole.modelId,onPhase:phase=>{if(!controller.signal.aborted&&pageCreationContext(useProjectStore.getState())===creationContext)setMessages(prev=>prev.map(m=>m.id===assistantMsgId?{...m,text:phase==='repairing'?'检查发现控件渲染问题，正在尝试一次受控样式修复…':'修复指令已执行，正在重新检查全部门禁…'}:m));}}:undefined});
        if(toolResult.repair?.usage){
          const usage=toolResult.repair.usage;turnUsage={promptTokens:turnUsage.promptTokens+usage.inputTokens,completionTokens:turnUsage.completionTokens+usage.outputTokens,totalTokens:turnUsage.totalTokens+usage.inputTokens+usage.outputTokens};
          setMessages(prev=>prev.map(m=>m.id===assistantMsgId?{...m,usage:{...turnUsage},generationWarnings:[...(output.warnings??[]),...(toolResult.repair!.usageEstimated?['受控修复请求未返回用量，已估算计入本轮。']:[])]}:m));
        }
        if(controller.signal.aborted)return;
        if(!toolResult.success){
          setMessages(prev=>prev.map(m=>m.id===assistantMsgId?{...m,isGenerating:false,isError:true,text:`本次结果未应用：${toolResult.error??'画布执行失败。'}`,qualityReport:output.qualityReport,workflowContract:output.workflowContract,htmlOutput:output.extractedHtml}:m));
          return;
        }
        if (toolResult.success) {
          createdScreenId = toolResult.screenId;
          finalScreenName = toolResult.screenName;
          checkpointId = toolResult.checkpointId;
          appliedHtml=toolResult.createdHtml;
          if(toolResult.repair)repairNotice='已完成一次控件样式修复，并重新通过全部交付检查。';
        }
      }

      const candidateDecision = detectCandidateDecision(textToSend);

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
                elapsedSeconds:Number(((Date.now()-startTime)/1000).toFixed(1)),
                checkpointId,
                screenId: createdScreenId,
                screenName: finalScreenName,
                toolAction,
                htmlOutput: appliedHtml??output.extractedHtml,
                creationRepairNotice:repairNotice,
                candidateDecision,
                deviationNote: output.deviationNote,
                qualityReport: output.qualityReport,
                workflowContract: output.workflowContract,
                streamRecovered: Boolean(output.recoveredStreamError),
                usage: turnUsage,
                text: switchedToVision
                  ? `> 💡 **提示**: 当前主力模型为纯文本模型，已自动转由 Vision 档位 **${activeRole.provider.name} (${activeRole.modelId})** 解析参考图。\n\n${repairNotice?`${defaultText}\n${repairNotice}`:m.text || defaultText}`
                  : repairNotice?`${defaultText}\n${repairNotice}`:m.text || defaultText
              }
            : m
        )
      );

      if (repairing) {
        const resolved={...repairing.value,status:'resolved' as const};
        try { await saveQualityDraft(resolved,requestState.folderPath); }
        catch(error) { console.warn('[quality-draft] 修复完成状态保存失败',error); }
        if(useProjectStore.getState().id===requestState.id)setMessages(prev=>prev.map(m=>m.qualityDraft?.id===resolved.id?{...m,qualityDraft:resolved,qualityDraftNotice:'已完成定点修复并通过本轮交付检查；此处保留原失败草稿供追溯。'}:m));
      }

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
            textFiles: textReferences.map((file) => file.path || file.name),
            attachments: attachmentPath ? [attachmentPath] : undefined
          },
          assistant: {
            text: repairNotice&&appliedHtml?`${repairNotice}\n<artifact identifier="screen_new" type="screen" title="${(finalScreenName||'新设计页').replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;')}">${appliedHtml}</artifact>`:output.rawResponse
          },
          changeSet: {
            screens: repairNotice&&createdScreenId?[{id:createdScreenId,name:finalScreenName||'新设计页',action:'created'}]:output.changeSet?.screens as any,
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
      operationLockRef.current = false;
      setIsGenerating(false);
      abortControllerRef.current = null;
    }
  };

  const confirmModification = async (messageId: string, selected: string[], extra: string, mode: ModificationMode = 'page') => {
    const plan = modificationPlansRef.current.get(messageId);
    if (!plan?.analysis || operationLockRef.current || isGenerating) return;
    if (!isModificationSnapshotCurrent(useProjectStore.getState(), plan.snapshot)) {
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, modificationReview: { ...plan.analysis!, status: 'error', summary: '原页面或工程已变化，请重新分析。' } } : m));
      return;
    }
    let scope: string;
    let receipt: ModificationReviewReceipt;
    try {
      receipt = buildModificationReviewReceipt(plan.analysis, selected, extra, useProjectStore.getState().screens[plan.snapshot.screenId]);
      scope = buildReviewedModificationRequest(plan.analysis, selected, extra);
    } catch (error) {
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, modificationReview: { ...plan.analysis!, status: 'error', summary: error instanceof Error ? error.message : '分析证据无效，请重新分析。' } } : m));
      return;
    }
    if (mode === 'local' || mode === 'region') {
      const localPlan = getLocalModificationPlan(plan.analysis, selected);
      const regionPlan = getRegionModificationPlan(plan.analysis, selected);
      if (mode === 'local' ? !localPlan : !regionPlan) return;
      const modeName = mode === 'region' ? '完整区块' : '局部';
      const controller = new AbortController(); abortControllerRef.current = controller;
      operationLockRef.current = true; setIsGenerating(true); setLastGuardOutput(null);
      const update = (review: ModificationReviewState) => setMessages(prev => prev.map(m => m.id === messageId ? { ...m, modificationReview: review } : m));
      update({ ...plan.analysis, status: 'submitted', summary: `正在复制原页面并应用已确认的${modeName}修改。` });
      try {
        const current = useProjectStore.getState();
        const screen = current.screens[plan.snapshot.screenId];
        const conversationStore = current.getConversationStore();
        const attachmentStore = current.getAttachmentStore();
        const confirmedBundle = buildProjectKnowledgeBundle(current, scope, screen.id);
        const confirmedKnowledge = [referenceDevicePrompt(current.settings), mobileNavigationPrompt(current.settings), confirmedBundle.content,
          formatTextReferences(plan.options?.textReferences ?? [])].filter(Boolean).join('\n\n');
        let binding: ReturnType<typeof getActiveProviderForRole> | undefined = undefined;
        if (mode === 'region' || extra.trim()) {
          binding = getActiveProviderForRole('code') || getActiveProviderForRole('chat');
          if (plan.attachment && (!binding || !supportsVision(binding.provider, binding.modelId))) binding = getActiveProviderForRole('vision');
          if (!binding?.provider || (!binding.provider.apiKey && binding.provider.protocol !== 'ollama_native')) throw new Error('请先配置可用的 AI Provider 以解析补充要求。');
        }
        const workflowContract = buildDesignTaskContract({ intent: 'modify_screen', request: scope,
          target: { id: screen.id, name: screen.name, htmlContent: screen.htmlContent },
          deviceProfile: current.settings.deviceProfile, frameWidth: current.settings.frameWidth,
          referenceDeviceName: current.settings.referenceDevice?.name, designSystem: current.designSystem,
          designSystemOrigin: current.designSystemOrigin, protectedNids: current.getProtectedNids(screen.id),
          allowedChanges: (mode === 'region' ? regionPlan!.targetNids : localPlan!.allowedNids).map(nid => `element:${nid}`),
          knowledgeFingerprint: confirmedBundle.fingerprint,
          knowledgeSources: [...confirmedBundle.sources.map(source => ({ kind: source.kind === 'document' ? 'document' as const : 'page' as const, id: source.id,
            fingerprint: source.fingerprint ?? '', ...(source.stale ? { stale: true } : {}) })),
            ...(plan.options?.textReferences ?? []).map(reference => ({ kind: 'text-reference' as const, id: reference.path ?? reference.name, fingerprint: contentFingerprint(reference.content) }))] });
        workflowContract.modificationReview = receipt;
        const candidate = await executeStructuredEdit(engineCoreRef.current,{
          mode,screen,request:scope,contract:workflowContract,settings:current.settings,designSystem:current.designSystem,colorMode:current.settings.colorMode,
          signal:controller.signal,isCurrent:()=>isModificationSnapshotCurrent(useProjectStore.getState(),plan.snapshot),
          binding:binding ? {provider:binding.provider,model:binding.modelId} : undefined,
          local:localPlan ? {...localPlan,supplement:Boolean(extra.trim())} : undefined,regionNids:regionPlan?.targetNids,
          protectedNids:current.getProtectedNids(screen.id),imageUrl:plan.attachment?.dataUrl,projectKnowledge:confirmedKnowledge
        });
        if(candidate.status!=='ready')throw new Error(candidate.message);
        current.stageScreenChange(screen.id, candidate.html, `${screen.name}（${modeName}修改候选）`, scope, workflowContract,
          candidate.executionRecord);
        current.panToScreen(screen.id);
        modificationPlansRef.current.delete(messageId);
        update({ ...plan.analysis, status: 'submitted' });
        const resultText = `已在「${screen.name}」的副本上完成 ${mode === 'region' ? regionPlan!.targetNids.length : localPlan!.allowedNids.length} 个目标的${modeName}修改，原页面未替换。请对比后采纳或保留原版。`;
        setMessages(prev => [...prev,
          { id: `local_usr_${messageId}`, sender: 'user', text: scope },
          { id: `local_ast_${messageId}`, sender: 'assistant', text: resultText, screenId: screen.id, screenName: screen.name,
            toolAction: 'modified', qualityReport: candidate.qualityReport, workflowContract, htmlOutput: candidate.html, preActionSnapshot: { screenId: screen.id, screenName: screen.name, htmlContent: screen.htmlContent },
            originalUserPrompt: `${plan.request}\n${scope}`, originalReferencedScreenId: screen.id, originalAttachment: plan.attachment,
            originalDecision: { action: 'modify_screen', targetScreenId: screen.id, styleReferenceScreenId: null, elementNid: null } }
        ]);
        try {
          const savedAttachment = plan.attachment ? await attachmentStore.save(plan.attachment.name, plan.attachment.dataUrl) : null;
          await conversationStore.appendTurn({ turnId: `local_${messageId}`, ts: Date.now(),
            user: { text: `${plan.request}\n${scope}`, attachments: savedAttachment ? [savedAttachment.relPath] : undefined,
              textFiles: plan.options?.textReferences?.map(file => file.path || file.name) }, assistant: { text: resultText } });
        } catch (error) { console.warn('Conversation save error:', error); }
      } catch (error) {
        update({ ...plan.analysis, status: controller.signal.aborted ? 'cancelled' : 'ready', summary: `${modeName}修改未执行：${error instanceof Error ? error.message : String(error)}` });
      } finally {
        operationLockRef.current = false; setIsGenerating(false);
        if (abortControllerRef.current === controller) abortControllerRef.current = null;
      }
      return;
    }
    modificationPlansRef.current.delete(messageId);
    setMessages(prev => prev.map(m => m.id === messageId ? { ...m, modificationReview: { ...plan.analysis!, status: 'submitted' } } : m));
    const prompt = `${plan.request}\n\n[本次确认修改范围，以此为准]\n${scope}`;
    await sendMessage(prompt, plan.attachment, { ...plan.options, displayText: `${plan.options?.displayText || extractCleanUserPrompt(plan.request)}\n\n${scope}` }, { ...plan, receipt });
  };

  const cancelModification = (messageId: string) => {
    modificationPlansRef.current.delete(messageId);
    setMessages(prev => prev.map(m => m.id === messageId && m.modificationReview ? { ...m, modificationReview: { ...m.modificationReview, status: 'cancelled' } } : m));
  };

  const retryModificationAnalysis = async (messageId: string) => {
    const plan = modificationPlansRef.current.get(messageId);
    if (!plan || operationLockRef.current || isGenerating) return;
    const current = useProjectStore.getState();
    if (!current.screens[plan.snapshot.screenId] || JSON.stringify([current.id, current.folderPath ?? null]) !== plan.snapshot.projectKey) {
      setMessages(prev => prev.map(m => m.id === messageId && m.modificationReview ? { ...m, modificationReview: { ...m.modificationReview, status: 'error', summary: '原目标页面已不存在或工程已切换，请重新指定目标。' } } : m));
      return;
    }
    cancelModification(messageId);
    await sendMessage(plan.request, plan.attachment, { ...plan.options, referencedScreenId: plan.snapshot.screenId });
  };

  /** 裁决并落地一段已生成 HTML，目标画框由 resolveApplyToolCall 统一判定 (BR-GRM-02 / BR-GRM-03) */
  const applyHtmlToTarget = async (
    msg: ChatMessageItem | undefined,
    htmlToApply: string,
    fallbackScreenId?: string | null,
    createTitle?: string,
    forceInPlace?: boolean,
    executionOptions: {signal?:AbortSignal;isCurrent?:()=>boolean}={}
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
          params: { screenId: target.id, title: target.name, html: htmlToApply, forceInPlace, modificationRequest: userPrompt, workflowContract: msg?.workflowContract }
        });
      }
      if (decided.action === 'create_screen') {
        return CanvasToolExecutor.executeAsync({
          tool: 'create_screen',
          params: {
            title: createTitle || msg?.screenName || '新设计页',
            html: htmlToApply,
            referencedScreenId: decided.styleReferenceScreenId || undefined,
            workflowContract:msg?.workflowContract
          }
        },executionOptions);
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
          params: { ...toolCall.params, forceInPlace, modificationRequest: userPrompt, workflowContract: msg?.workflowContract }
        });
      }
      return CanvasToolExecutor.executeAsync(toolCall.tool==='create_screen'?{...toolCall,params:{...toolCall.params,workflowContract:msg?.workflowContract}}:toolCall,executionOptions);
    }
    return null;
  };

  const handleAdoptCandidate = async () => {
    const projectId = useProjectStore.getState().id;
    if (!await adoptStagedChange()) return;
    if (useProjectStore.getState().id !== projectId || useProjectStore.getState().stagedScreen) return;
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

  const handleKeepBothCandidates = async () => {
    const projectId = useProjectStore.getState().id;
    if (!await keepBothScreens()) return;
    if (useProjectStore.getState().id !== projectId || useProjectStore.getState().stagedScreen) return;
    setLastGuardOutput(null);
    setMessages((prev) =>
      prev.map((msg) => ({
        ...msg,
        isGuardRejected: false,
        structureDiff: undefined
      }))
    );
  };

  const forceApply = async (specificHtml?: string, msgId?: string) => {
    if (useProjectStore.getState().stagedScreen) {
      const projectId = useProjectStore.getState().id;
      if (!await forceAdoptStagedChange()) return;
      if (useProjectStore.getState().id !== projectId || useProjectStore.getState().stagedScreen) return;
      setLastGuardOutput(null);
      setMessages((prev) => prev.map((msg) => ({
        ...msg,
        isGuardRejected: false,
        structureDiff: undefined,
        text: msg.text ? msg.text.replace('⚠️ 结构守卫拦截', '✅ 结构守卫已强制放行并应用') : msg.text
      })));
      return;
    }

    const sourceMsg = msgId
      ? messages.find((m) => m.id === msgId)
      : [...messages].reverse().find((m) => m.isGuardRejected);
    const htmlToApply = specificHtml || sourceMsg?.htmlOutput || lastGuardOutput?.extractedHtml;
    if (!htmlToApply) return;

    const fallbackScreenId =
      activeScreenId || (Object.keys(screens).length > 0 ? Object.keys(screens)[0] : null);
    const result = await applyHtmlToTarget(sourceMsg, htmlToApply, fallbackScreenId, undefined, true);

    if(result?.tool==='create_screen'&&!result.success){
      if(sourceMsg)setMessages(prev=>prev.map(m=>m.id===sourceMsg.id?{...m,isError:true,text:`本次结果未应用：${result.error}`}:m));
      return;
    }
    if (!result || !result.success) {
      if (!fallbackScreenId) return;
      stageScreenChange(
        fallbackScreenId,
        htmlToApply,
        `${screens[fallbackScreenId]?.name || '画框'} (强制应用)`, sourceMsg?.originalUserPrompt, sourceMsg?.workflowContract
      );
    } else if (sourceMsg) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === sourceMsg.id
            ? {
                ...m,
                isGuardRejected: false,
                isError:false,
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

  const mountMessageHtml = async (msgId: string) => {
    const target = messages.find((m) => m.id === msgId);
    if (!target?.htmlOutput||operationLockRef.current||isGenerating) return;
    const controller=new AbortController(),context=pageCreationContext(useProjectStore.getState());
    abortControllerRef.current=controller;operationLockRef.current=true;setIsGenerating(true);
    try {
      // 先按该轮的引用画框与用户诉求裁决落点，仅无目标可循时才新建 (BR-GRM-02)
      const result = await applyHtmlToTarget(
        target,
        target.htmlOutput,
        null,
        target.screenName || '画框 (AI 补挂)',undefined,
        {signal:controller.signal,isCurrent:()=>pageCreationContext(useProjectStore.getState())===context}
      );
      if(controller.signal.aborted)return;

      if(result&&!result.success){
        setMessages(prev=>prev.map(m=>m.id===msgId?{...m,isError:true,text:`本次结果未应用：${result.error}`}:m));return;
      }
      if (result?.success) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msgId
              ? {
                  ...m,
                  isGuardRejected: false,
                  isError:false,
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
    } finally {
      operationLockRef.current=false;setIsGenerating(false);
      if(abortControllerRef.current===controller)abortControllerRef.current=null;
    }
  };

  const retryTurn = (msgId: string) => {
    const target = messages.find((m) => m.id === msgId);
    if (!target?.originalUserPrompt || isGenerating) return;
    sendMessage(target.originalUserPrompt, target.originalAttachment, {
      sectioned:target.sectionedMode,
      referencedScreenId: target.originalReferencedScreenId ?? target.preActionSnapshot?.screenId ?? null
    });
  };

  const repairQualityTurn = async (msgId:string,labels:DraftLabel[]) => {
    const message=messages.find(m=>m.id===msgId),value=message?.qualityDraft;
    if(!value||value.status!=='blocked'||operationLockRef.current||isGenerating)return;
    const state=useProjectStore.getState();
    let attachment: ImageAttachment|undefined;
    try {
      if(value.attachment){const dataUrl=await state.getAttachmentStore().readDataUrl(value.attachment.relPath);if(!dataUrl)throw Error('原参考图文件缺失，请重新生成。');attachment={name:value.attachment.name,dataUrl,...(value.attachment.region?{region:value.attachment.region}:{})};}
      if(useProjectStore.getState().id!==state.id||useProjectStore.getState().folderPath!==state.folderPath)return;
      await sendMessage(value.request,attachment,{qualityRepair:{value,labels},referencedScreenId:value.decision.targetScreenId});
    }catch(error){setMessages(prev=>prev.map(m=>m.id===msgId?{...m,qualityDraftNotice:String(error instanceof Error?error.message:error)}:m));}
  };

  const suggestQualityTurn = async (msgId:string) => {
    const message=messages.find(m=>m.id===msgId),value=message?.qualityDraft;
    if(!value||value.aiAttempted||!message.qualityDraftSaved||value.status!=='blocked'||operationLockRef.current||isGenerating)return;
    const state=useProjectStore.getState(),context=()=>contentFingerprint(JSON.stringify([state.id,pageCreationContext(state),state.settings,state.overrides,state.components]));
    const binding=getActiveProviderForRole('code')||getActiveProviderForRole('chat');
    const actual=value.attachment&&binding&&!supportsVision(binding.provider,binding.modelId)?getActiveProviderForRole('vision'):binding;
    const notice=(text:string)=>setMessages(prev=>prev.map(m=>m.id===msgId?{...m,qualityDraftNotice:text}:m));
    if(value.projectId!==state.id||value.projectContext!==context()||!actual||value.draft.bindingKey!==continuationBindingKey({provider:actual.provider,model:actual.modelId})) {notice('工程、原页或模型已变化，旧草稿仅供查看，请重新生成。');return;}
    const targets=draftRepairTargets(value.draft,value.decision.targetScreenId?state.screens[value.decision.targetScreenId]?.htmlContent:undefined);
    if(!targets.length){notice('没有可安全建议的文本目标，请查看检查详情。');return;}
    const controller=new AbortController();abortControllerRef.current=controller;operationLockRef.current=true;setIsGenerating(true);
    setMessages(prev=>prev.map(m=>m.id===msgId?{...m,qualityDraftBusy:true,qualityDraftNotice:'仅为报错操作生成一次文案建议，确认前不应用。'}:m));
    try {
      if(!await claimDraftSuggestion(value,state.folderPath))throw Error('此草稿已使用过AI建议，请手动填写文案。');
      const claimed={...value,aiAttempted:true};
      setMessages(prev=>prev.map(m=>m.id===msgId?{...m,qualityDraft:claimed}:m));
      if(controller.signal.aborted)throw Error('建议已取消，本次机会已记录。');
      const result=await suggestDraftLabels(engineCoreRef.current,{provider:actual.provider,model:actual.modelId},value.request,targets,controller.signal);
      const current=useProjectStore.getState(),same=current.id===state.id&&current.folderPath===state.folderPath;
      const fresh=same&&value.projectContext===contentFingerprint(JSON.stringify([current.id,pageCreationContext(current),current.settings,current.overrides,current.components]));
      const saved={...claimed,suggestions:!result.error&&!controller.signal.aborted&&fresh?result.labels:undefined};
      await saveQualityDraft(saved,state.folderPath);
      if(same)setMessages(prev=>prev.map(m=>m.id===msgId?{...m,qualityDraft:saved,qualityDraftNotice:controller.signal.aborted?'建议已取消，可手动填写文案。':!fresh?'工程已变化，建议未采用。':result.error?`建议未采用：${result.error}；可手动填写。`:`建议已填入，确认或修改后再执行定点修复。${result.estimated?'本次用量为估算。':''}`,
        usage:result.usage?{promptTokens:(m.usage?.promptTokens??0)+result.usage.inputTokens,completionTokens:(m.usage?.completionTokens??0)+result.usage.outputTokens,totalTokens:(m.usage?.totalTokens??0)+result.usage.inputTokens+result.usage.outputTokens}:m.usage}:m));
    }catch(error){if(useProjectStore.getState().id===state.id)notice(String(error instanceof Error?error.message:error));}
    finally {
      setMessages(prev=>prev.map(m=>m.id===msgId?{...m,qualityDraftBusy:false}:m));
      if(abortControllerRef.current===controller){abortControllerRef.current=null;operationLockRef.current=false;setIsGenerating(false);}
    }
  };

  const continueTurn = (msgId:string) => {
    const target=messages.find(m=>m.id===msgId);
    if(!target?.originalUserPrompt||isGenerating||operationLockRef.current||!continuationSessionsRef.current.has(msgId))return;
    void sendMessage(target.originalUserPrompt,target.originalAttachment,{referencedScreenId:target.originalReferencedScreenId,continuationMessageId:msgId});
  };
  const splitLargeTurn = (msgId:string) => {
    const target=messages.find(m=>m.id===msgId);
    if(!target?.originalUserPrompt||target.originalDecision?.action!=='create_screen'||isGenerating||operationLockRef.current)return;
    void sendMessage(`新建多个页面：将以下整体需求拆为2～4个职责清晰的页面，保留共同风格与功能要求。先给出可编辑计划，确认后逐页设计。\n原始需求：\n${target.originalUserPrompt}`,target.originalAttachment,{referencedScreenId:null,splitSinglePage:true});
  };
  const sectionLargeTurn = (msgId:string) => {
    const target=messages.find(m=>m.id===msgId);
    if(!target?.originalUserPrompt||target.originalDecision?.action!=='create_screen'||isGenerating||operationLockRef.current)return;
    void sendMessage(target.originalUserPrompt,target.originalAttachment,{referencedScreenId:target.originalDecision.styleReferenceScreenId,sectioned:true});
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
    restoredHistoryKey,
    isGenerating,
    thinkingStage,
    unmatchedMentions,
    lastGuardOutput,
    sendMessage: (prompt: string, attachment?: ImageAttachment, options?: SendMessageOptions) => sendMessage(prompt, attachment, options),
    confirmPagePlan,
    cancelPagePlan,
    confirmModification,
    cancelModification,
    retryModificationAnalysis,
    abort,
    forceApply,
    mountMessageHtml,
    retryTurn,
    repairQualityTurn,
    suggestQualityTurn,
    continueTurn,
    splitLargeTurn,
    sectionLargeTurn,
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
