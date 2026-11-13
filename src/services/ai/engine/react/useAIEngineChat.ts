import {verifyGeneratedMediaAssets} from '../../generatedMedia';
import type {DraftRegionRequest} from '../../draftRegionRepair';
import {archiveFailedConversation,backfillFailedConversations,type FailureArchiveSource} from '../../failureConversationArchive';
import type {ConversationFailure} from '../../../storage/conversationFailure';
import {functionalRegionTarget} from '../../functionalRegionTarget';
import type {ReferenceEvidence} from '../../referenceEvidence';
import {prepareTreeTaskRecovery,treeRecoveryData} from '../../treeTaskRecovery';
import {prepareTaskRecovery,recoveryData,prepareRecoveryDraft,claimPreparedRecovery,type PreparedTaskRecovery,type PreparedDesignRecovery} from '../../designTaskRecovery';
import {explicitlyRequestsPageRedesign} from '../../pageRedesignSource';
import type {SavedDesignTask} from '../../../storage/designTaskRepository';
import {DesignTaskJournal} from '../../designTaskJournal';
import {createProjectStorage} from '../../../storage/projectStorage';
import {getProjectPublication} from '../../../storage/projectPublication';
import {prepareBuiltinMediaAssets} from '../../builtinMediaAssets';
import {requiresFunctionalPlanning,requiresElementStructure} from '../../functionalModification';
import {observeRequestActivity,initialRequestActivity,type ExecutionPhaseEvent,type PipelinePhase,type RequestActivity} from '../../requestActivity';
import {parseReferencedElement,extractCleanUserPrompt} from '../../chatReferencePrompt';
export {parseReferencedElement,extractCleanUserPrompt} from '../../chatReferencePrompt';
import type { ImageAttachment } from '../../../../types/referenceImage';
import type { SectionedCheckpoint } from '../../sectionedGeneration';
import {requiresPageVariantPlan,requiresMultiPagePlan,type MultiPageItem,type MultiPageReview} from '../../multiPageContract';
import {prepareMultiPagePlan,prepareRecoveredMultiPagePlan,executeMultiPagePlan,type PreparedMultiPagePlan} from '../../multiPageService';
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
import type {PageTaskSnapshot} from '../../pageTaskPlan';
import {capturePageTaskHistory,readPageTaskHistory,type PageTaskHistory} from '../../pageTaskHistory';
import {captureDesignGuidanceHistory,readDesignGuidanceHistory,type DesignGuidanceHistory} from '../../designKnowledge/history';
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
import type {TaskBudget} from '../../taskBudget';
import {createChatTaskBudget,createSingleRequestBudget} from '../../taskBudgetPolicy';
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
  executionEvents?:ExecutionPhaseEvent[];
  executionActivity?:RequestActivity;
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
  /** Session-only original generation inputs; never reconstructed from a reopened conversation. */
  generationInputFingerprint?: string;
  executionRecord?:import('../../designExecutionRecord').DesignExecutionRecord;
  structuredRetry?:{reviewId:string;selected:string[];extra:string;mode:'local'|'region'};
  historicalFailure?:ConversationFailure;historicalFailureRequest?:string;failureHistoryState?:'saved'|'failed';
  historicalPageTask?:PageTaskHistory;
  historicalPageTaskNotice?:string;
  historicalGuidance?:DesignGuidanceHistory;
  historicalGuidanceNotice?:string;
  designBrief?: DesignBrief;
  taskBudget?:import('../../taskBudget').TaskBudgetSnapshot;
  modificationReview?: ModificationReviewState;
  pagePlan?:MultiPageReview;
  pageTaskPlan?: PageTaskSnapshot;
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
  referenceEvidence?:ReferenceEvidence;referenceReused?:boolean;
  retryContext?:{version:1;projectContext:string;options:Pick<SendMessageOptions,'textReferences'|'writeStrategy'|'wholePageRedesign'|'referencedScreenId'|'activeScreenId'|'referencedElement'|'displayText'|'sectioned'>};
  originalReferencedScreenId?: string | null;
  usageNote?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface SendMessageOptions {
  /** Explicit recovery actions; private checkpoints stay outside persisted chat messages. */
  continuationMessageId?: string;
  recoverNewTask?:PreparedTaskRecovery;
  qualityRepair?: { value: SavedQualityDraft; labels: DraftLabel[];region?:DraftRegionRequest };
  splitSinglePage?: boolean;
  sectioned?: boolean;
  writeStrategy?:'auto'|'atomic'|'patch';
  wholePageRedesign?:boolean;
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
  /** 复用先前已梳理的功能规划快照，直接跳过 planning 阶段 */
  reusedPageTaskPlan?: PageTaskSnapshot;
  referenceEvidence?:ReferenceEvidence;
  reparseReference?:boolean;
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
  const submittedConversationRef=useRef(0);
  const failureArchivesRef=useRef(new Map<string,{source:FailureArchiveSource;claimed:boolean}>());
  const trackFailure=(id:string,request:string,source:{id:string;folderPath?:string},extra:Omit<FailureArchiveSource,'storage'|'request'|'startedAt'>={})=>{submittedConversationRef.current++;failureArchivesRef.current.set(id,{source:{...extra,storage:createProjectStorage(source.id,source.folderPath),request,startedAt:Date.now()},claimed:false});};
  const conversationKey = JSON.stringify([projectId, folderPath ?? null]);
  const [restoredHistoryKey, setRestoredHistoryKey] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [thinkingStage, setThinkingStage] = useState(0);
  const [unmatchedMentions, setUnmatchedMentions] = useState<string[]>([]);
  const [lastGuardOutput, setLastGuardOutput] = useState<PipelineOutput | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const activeMessageIdRef=useRef<string|null>(null);
  const engineCoreRef = useRef(createAIEngineCore());
  const operationLockRef = useRef(false);
  const mountedRef=useRef(true);
  useEffect(()=>{mountedRef.current=true;return()=>{mountedRef.current=false;};},[]);
  const pagePlansRef=useRef(new Map<string,{context:string;projectId:string;folderPath?:string;bindingCurrent:()=>boolean;prepared?:PreparedMultiPagePlan;controller?:AbortController}>());
  const continuationSessionsRef=useRef(new Map<string,{checkpoint?:ContinuationCheckpoint;sectionedCheckpoint?:SectionedCheckpoint;context:string;decision:ReturnType<typeof resolveGenerationTarget>;
    budget:TaskBudget;contract:DesignTaskContract;pageTaskPlan?:PageTaskSnapshot;approved?:{snapshot:ModificationSnapshot;decision:ReturnType<typeof resolveGenerationTarget>;receipt?:ModificationReviewReceipt;rulePreference?:boolean};textReferences:TextReference[]}>());
  const modificationPlansRef = useRef(new Map<string, {
    request: string; attachment?: ImageAttachment; options?: SendMessageOptions;
    snapshot: ModificationSnapshot; decision: ReturnType<typeof resolveGenerationTarget>; analysis?: ModificationAnalysis;rulePreference?:boolean;
  }>());
  const progressOwned=(controller:AbortController,current:()=>boolean)=>mountedRef.current&&abortControllerRef.current===controller&&!controller.signal.aborted&&current();
  const publishActivity=(id:string,controller:AbortController,current:()=>boolean,activity:RequestActivity)=>{
    if(progressOwned(controller,current))setMessages(prev=>prev.map(m=>m.id===id?{...m,executionActivity:activity}:m));
  };
  const publishPhase=(id:string,controller:AbortController,current:()=>boolean,phase:PipelinePhase)=>{
    if(progressOwned(controller,current))setMessages(prev=>prev.map(m=>m.id===id?{...m,executionEvents:m.executionEvents?.at(-1)?.phase===phase?m.executionEvents:[...(m.executionEvents??[]),{phase,at:Date.now()}].slice(-24)}:m));
  };
  const finishOperation=(id:string,controller:AbortController)=>{
    if(abortControllerRef.current!==controller)return;
    abortControllerRef.current=null;activeMessageIdRef.current=null;operationLockRef.current=false;
    if(mountedRef.current){setIsGenerating(false);setMessages(prev=>prev.map(m=>m.id===id?{...m,isGenerating:false,
      executionActivity:m.executionActivity?.active?{...m.executionActivity,active:0,status:'cancelled',lastActivityAt:Date.now()}:m.executionActivity}:m));}
  };

  useEffect(()=>{
    for(const message of messages){
      const entry=failureArchivesRef.current.get(message.id);
      if(!entry||entry.claimed||message.isGenerating||!(message.isError||message.isStopped||message.isGuardRejected))continue;
      entry.claimed=true;
      const reason=message.modificationReview?.summary??message.pagePlan?.message??message.text??'本次操作未完成。';
      void archiveFailedConversation(entry.source,{message:reason,status:message.isStopped?'cancelled':message.isGuardRejected?'rejected':'failed',contract:message.workflowContract,budget:message.taskBudget,activity:message.executionActivity,phase:message.executionEvents?.at(-1)?.phase}).then(saved=>{
        if(!mountedRef.current||failureArchivesRef.current.get(message.id)!==entry)return;
        failureArchivesRef.current.delete(message.id);setMessages(prev=>prev.map(m=>m.id===message.id?{...m,failureHistoryState:saved?'saved':'failed'}:m));
      });
    }
  },[messages,conversationKey]);

  useEffect(() => {
    let isCancelled = false;
    abortControllerRef.current?.abort();
    failureArchivesRef.current.clear();
    modificationPlansRef.current.clear();
    pagePlansRef.current.clear();
    for(const session of continuationSessionsRef.current.values())session.budget.close();
    continuationSessionsRef.current.clear();
    abortControllerRef.current=null;activeMessageIdRef.current=null;operationLockRef.current=false;setIsGenerating(false);
    setMessages([WELCOME_MESSAGE]);
    setRestoredHistoryKey(null);
    const submittedAtLoad=submittedConversationRef.current;
    const loadSaved = async () => {
      try {
        const convStore = getConversationStore();
        const attachmentStore = getAttachmentStore();
        let loadedTurns='';
        // Existing conversation opens immediately; validating old task archives is auxiliary work.
        for(let pass=0;pass<2&&!isCancelled;pass++){
        if(pass===1&&!await backfillFailedConversations(createProjectStorage(projectId,folderPath),projectId))break;
        const turns = await convStore.loadRecent(40),turnIdentity=JSON.stringify(turns.map(t=>t.turnId));
        if (!isCancelled && turns && turns.length > 0 && turnIdentity!==loadedTurns) {
          const restored: ChatMessageItem[] = [];
          for (const t of turns) {
            const rawUserText = t.user.text;
            const savedReference=t.user.reference;
            const validReference=savedReference&&[savedReference.screen?.id,savedReference.screen?.name]
              .every(v=>typeof v==='string'&&v.trim()&&v.length<=200);
            const validElement=validReference&&savedReference.element&&[savedReference.element.nid,savedReference.element.tagName].every(v=>typeof v==='string'&&v.trim()&&v.length<=200);
            const refElem = parseReferencedElement(rawUserText)??(validElement?{nid:savedReference.element!.nid,tagName:savedReference.element!.tagName,screenName:savedReference.screen.name}:null);
            const cleanText = extractCleanUserPrompt(rawUserText);
            let refScreen: { id: string; name: string } | undefined = undefined;
            if (t.changeSet?.screens && t.changeSet.screens.length > 0) {
              const rw = t.changeSet.screens.find((s) => s.action === 'rewritten') || t.changeSet.screens[0];
              if (rw) {
                refScreen = { id: rw.id, name: rw.name };
              }
            }
            if(!refScreen&&validReference)refScreen={id:savedReference.screen.id,name:savedReference.screen.name};

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
              displayText:t.user.reviewRequest?`${extractCleanUserPrompt(t.user.reviewRequest)}\n\n${cleanText}`:cleanText !== rawUserText ? cleanText : undefined,
              referencedElement: refElem || undefined,
              referencedScreen: refScreen,
              imageUrl,
              textFileNames: t.user.textFiles
            });
            const historicalPage=refScreen&&useProjectStore.getState().screens[refScreen.id];
            const creationEvidence=historicalPage?.metadata?.creationEvidence;
            const repairedTurn=t.assistant.text?.startsWith('已完成一次控件样式修复')&&isPageCreationEvidence(creationEvidence)&&creationEvidence.repair?.status==='repaired';
            const historicalPageTask=readPageTaskHistory(t.assistant.pageTaskHistory,rawUserText);
            const historicalGuidance=readDesignGuidanceHistory(t.assistant.designGuidanceHistory,rawUserText);
            restored.push({
              id: `ast_${t.turnId}`,
              sender: 'assistant',
              text: t.assistant.failure?.message || t.assistant.text || '已完成设计生成。',
              ...(t.assistant.failure?{historicalFailure:t.assistant.failure,historicalFailureRequest:rawUserText,isError:t.assistant.failure.status!=='cancelled',isStopped:t.assistant.failure.status==='cancelled'}:/^(?:生成失败|请求异常|局部修改未执行|区块修改未执行|本次结果未应用)/.test(t.assistant.text)?{historicalFailure:{version:1 as const,status:'failed' as const,message:t.assistant.text.slice(0,4000)},historicalFailureRequest:rawUserText,isError:true}:{}),
              checkpointId: t.changeSet?.checkpointId,
              ...(historicalGuidance?{historicalGuidance,historicalGuidanceNotice:'历史设计依据，仅供回溯；不代表当前页面通过，也不能直接采纳或续写。'}:
                Object.hasOwn(t.assistant,'designGuidanceHistory')?{historicalGuidanceNotice:'历史设计依据损坏或与本轮请求不匹配；会话正文仍可查看。'}:{}),
              ...(historicalPageTask?{historicalPageTask,historicalPageTaskNotice:'历史功能规划，仅供回溯；不代表当前页面已复验，也不能直接采纳或续写。'}:
                Object.hasOwn(t.assistant,'pageTaskHistory')?{historicalPageTaskNotice:'历史功能规划记录无效或与本轮请求不匹配；会话正文仍可查看。'}:{}),
              ...(repairedTurn?{creationRepairNotice:'此轮曾完成一次控件样式修复；历史结果不代表当前页面已复验。',htmlOutput:extractArtifact(t.assistant.text)?.html,screenId:refScreen!.id,screenName:refScreen!.name}:{}),
            });
          }
          if (!isCancelled&&submittedConversationRef.current===submittedAtLoad) {
            loadedTurns=turnIdentity;
            setMessages([WELCOME_MESSAGE, ...restored]);
          }
        }
        if(pass===0&&!isCancelled)setRestoredHistoryKey(conversationKey);
        }
        const drafts = await loadQualityDrafts(projectId, folderPath);
        if (!isCancelled && submittedConversationRef.current===submittedAtLoad && drafts.length) setMessages(prev=>[...prev,...drafts.map(value=>({id:value.id,sender:'assistant' as const,text:'页面草稿已恢复，尚未通过验收。',qualityDraft:value,qualityDraftSaved:true,
          workflowContract:value.draft.pageTaskSource??value.draft.guidanceSource,qualityReport:value.draft.quality,originalUserPrompt:value.request,originalReferencedScreenId:value.decision.targetScreenId,isError:true}))]);
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
      for(const session of continuationSessionsRef.current.values())session.budget.close();
      continuationSessionsRef.current.clear();
    };
  }, [conversationKey, getConversationStore, getAttachmentStore]);

  const abort = () => {
    if(getProjectPublication())return;
    if (abortControllerRef.current) {
      const targetId=activeMessageIdRef.current;
      abortControllerRef.current.abort();
      abortControllerRef.current=null;activeMessageIdRef.current=null;operationLockRef.current=false;
      setIsGenerating(false);
      setMessages((prev) =>
        prev.map((m, idx) =>
          (targetId?m.id===targetId:idx===prev.length-1&&m.sender==='assistant')
            ? {
                ...m,
                isStopped: true,
                isGenerating: false,
                qualityDraftBusy:false,
                qualityDraftNotice:m.qualityDraftBusy?'建议已取消，可手动填写文案。':m.qualityDraftNotice,
                executionActivity:m.executionActivity?{...m.executionActivity,status:'cancelled',active:0,lastActivityAt:Date.now()}:undefined,
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
    if(getProjectPublication())return;
    const session=pagePlansRef.current.get(id);if(session?.controller===abortControllerRef.current)abort();else session?.controller?.abort();pagePlansRef.current.delete(id);
    setMessages(prev=>prev.map(m=>m.id===id&&m.pagePlan?.status!=='complete'?{...m,pagePlan:{...m.pagePlan,status:'cancelled',message:session?.prepared?.plan.kind==='variants'?'方案任务已取消，未加入方案。':'多页面任务已取消，未加入页面。'}}:m));
  };
  const confirmPagePlan=async(id:string,pages:MultiPageItem[],generationTree?:{concurrency:1|2})=>{
    const session=pagePlansRef.current.get(id);if(!session?.prepared||isGenerating||operationLockRef.current)return;
    if(pageCreationContext(useProjectStore.getState())!==session.context||!session.bindingCurrent()){setMessages(prev=>prev.map(m=>m.id===id?{...m,pagePlan:{...m.pagePlan,status:'blocked',message:'工程或设计上下文已变化，请重新规划。'}}:m));return;}
    const controller=new AbortController();session.controller=controller;abortControllerRef.current=controller;activeMessageIdRef.current=id;operationLockRef.current=true;setIsGenerating(true);
    const current=()=>pagePlansRef.current.get(id)===session&&useProjectStore.getState().id===session.projectId&&useProjectStore.getState().folderPath===session.folderPath;
    const conversationStore=useProjectStore.getState().getConversationStore();
    try{
      setMessages(prev=>prev.map(m=>m.id===id?{...m,isGenerating:true,isError:false,isStopped:false,thinkingStage:1,executionActivity:undefined,executionEvents:[{phase:'preparing',at:Date.now()}],pagePlan:{...m.pagePlan,status:'running',message:session.prepared!.plan.kind==='variants'?'正在逐项生成并检查；全部通过后并排加入比较副本。':'正在逐页生成并检查；全部通过后一起加入画布。'}}:m));
      const result=await executeMultiPagePlan(session.prepared,pages,{generationTree,getState:()=>useProjectStore.getState(),commit:batch=>useProjectStore.getState().applyMultiPageCreation(batch,{isCurrent:()=>!controller.signal.aborted&&current()&&session.bindingCurrent()}),signal:controller.signal,isCurrent:()=>current()&&session.bindingCurrent(),onActivity:a=>publishActivity(id,controller,current,a),onPhase:p=>publishPhase(id,controller,current,p),
        onProgress:progress=>{if(progressOwned(controller,current))setMessages(prev=>prev.map(m=>m.id===id?{...m,pagePlan:{...m.pagePlan!,progress}}:m));}});
      if(result.status==='complete')publishPhase(id,controller,current,'created');
      if(current())setMessages(prev=>prev.map(m=>m.id===id?{...m,isGenerating:false,isError:result.status==='blocked',isStopped:result.status==='cancelled',pagePlan:{...m.pagePlan!,status:result.status,message:result.message}}:m));
      if(current())void conversationStore.appendTurn({turnId:id,ts:Date.now(),user:{text:session.prepared.plan.request},assistant:{text:result.message+'\n'+pages.map(p=>p.name).join('、'),aborted:result.status!=='complete'},intent:session.prepared.plan.kind==='variants'?'create_page_variants':'create_multiple_pages',changeSet:result.status==='complete'?{screens:result.screenIds.map((screenId,index)=>({id:screenId,name:pages[index].name,action:'created' as const}))}:undefined}).catch(error=>console.warn('[multi-page] 会话摘要保存失败',error));
      pagePlansRef.current.delete(id);
    }finally{finishOperation(id,controller);}
  };

  const sendMessage = async (
    rawPrompt: string,
    attachment?: ImageAttachment,
    options?: SendMessageOptions,
    approved?: { snapshot: ModificationSnapshot; decision: ReturnType<typeof resolveGenerationTarget>; receipt?: ModificationReviewReceipt;rulePreference?:boolean }
  ) => {
    const textToSend = rawPrompt.trim();
    const contextualGuidance=(approved?.rulePreference??useAIConfigStore.getState().autoReferenceDesignRules)?{}:undefined;
    if (!textToSend || isGenerating || operationLockRef.current) return;
    if (approved && !isModificationSnapshotCurrent(useProjectStore.getState(), approved.snapshot)) return;
    const resuming = options?.continuationMessageId ? continuationSessionsRef.current.get(options.continuationMessageId) : undefined;
    if(options?.continuationMessageId&&!resuming)return;
    const repairing = options?.qualityRepair;
    const textReferences = resuming?.textReferences || repairing?.value.textReferences || options?.textReferences || [];
    let requestState=useProjectStore.getState();
    const requestConversationStore=requestState.getConversationStore(),requestAttachmentStore=requestState.getAttachmentStore();
    let requestScreens=requestState.screens;
    let creationContext=pageCreationContext(requestState);
    const recovered=options?.recoverNewTask?recoveryData(options.recoverNewTask):undefined;
    const recoveryContext=()=>contentFingerprint(JSON.stringify([requestState.id,creationContext,requestState.settings,requestState.overrides,requestState.components]));
    if(repairing && (repairing.value.projectId!==requestState.id || repairing.value.projectContext!==recoveryContext() || repairing.value.status!=='blocked')) {
      setMessages(prev=>prev.map(m=>m.qualityDraft?.id===repairing.value.id?{...m,qualityDraftNotice:'工程、原页或设计约束已变化，请重新生成；旧草稿仅供查看。'}:m));return;
    }
    if(resuming&&resuming.context!==recoveryContext()){
      resuming.budget.close();
      continuationSessionsRef.current.delete(options!.continuationMessageId!);
      setMessages(prev=>prev.map(m=>m.id===options!.continuationMessageId?{...m,continuationAvailable:false,text:'工程、原页或设计约束已变化，旧片段不能继续使用；请重新生成。'}:m));return;
    }
    if(resuming&&!resuming.budget.canReserve(resuming.sectionedCheckpoint?4096:8192)){
      resuming.budget.close();continuationSessionsRef.current.delete(options!.continuationMessageId!);
      setMessages(prev=>prev.map(m=>m.id===options!.continuationMessageId?{...m,continuationAvailable:false,sectionedAvailable:false,taskBudget:resuming.budget.snapshot(),text:'原任务预算已耗尽、取消或超过时限，不能继续；请拆分设计或明确重新生成。'}:m));return;
    }
    if(resuming)approved=resuming.approved;

    // 生成目标单一裁决点 (BR-GT-06)：引用判定与动作判定只在这里做一次，
    // 下游 intentInterceptor / contextEnricher / toolResolver 全部消费该结果。
    const recoveryDecision:ReturnType<typeof resolveGenerationTarget>|undefined=recovered?{action:recovered.kind==='redesign'?'modify_screen':'create_screen',targetScreenId:recovered.kind==='redesign'?recovered.source.contract.target!.id:null,styleReferenceScreenId:recovered.source.contract.referencePageId??null,elementNid:null,referenceSource:null,reason:'用户明确选择以新任务恢复原范围的未完成设计'}:undefined;
    const decision = recoveryDecision??repairing?.value.decision ?? resuming?.decision ?? approved?.decision ?? resolveGenerationTarget({
      rawPrompt: textToSend,
      screens:requestScreens,
      referenceToggleScreenId:
        options && 'referencedScreenId' in options ? options.referencedScreenId : undefined,
      activeScreenId: options?.activeScreenId !== undefined ? options.activeScreenId : activeScreenId,
      elementRef: options?.referencedElement
        ? { nid: options.referencedElement.nid, screenName: options.referencedElement.screenName }
        : null
    });
    if(!resuming&&!repairing&&!approved&&!recovered&&decision.action==='modify_screen'&&decision.targetScreenId&&!decision.elementNid&&!options?.wholePageRedesign&&!explicitlyRequestsPageRedesign(textToSend)&&requiresFunctionalPlanning(textToSend)){const target=requestScreens[decision.targetScreenId];if(target){const nid=functionalRegionTarget(target.htmlContent,requestState.getProtectedNids(target.id));if(nid)decision.elementNid=nid;}}
    const sections=!repairing&&Boolean(options?.sectioned||resuming?.sectionedCheckpoint);
    if(sections&&((decision.action!=='create_screen'&&!(resuming?.contract.wholePageRedesign&&resuming.sectionedCheckpoint?.plan.version===2))||requiresMultiPagePlan(textToSend)||requiresPageVariantPlan(textToSend))){
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

    const referenceRole=attachment&&!isQuestion?(primaryRole&&supportsVision(primaryRole.provider,primaryRole.modelId)?primaryRole:getActiveProviderForRole('vision')):undefined;
    if(attachment&&!isQuestion&&primaryRole){activeRole=primaryRole;switchedToVision=false;}
    const referenceCurrent=()=>{if(!referenceRole)return true;const primary=getActiveProviderForRole('code')||getActiveProviderForRole('chat');const latest=primary&&supportsVision(primary.provider,primary.modelId)?primary:getActiveProviderForRole('vision');return !!latest&&continuationBindingKey({provider:latest.provider,model:latest.modelId})===continuationBindingKey({provider:referenceRole.provider,model:referenceRole.modelId});};

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

    if(decision.action==='create_screen'&&options?.writeStrategy&&!resuming&&!repairing&&!recovered&&!options?.splitSinglePage&&!requiresMultiPagePlan(textToSend)&&!requiresPageVariantPlan(extractCleanUserPrompt(textToSend))){
      const preparation=new AbortController();operationLockRef.current=true;abortControllerRef.current=preparation;activeMessageIdRef.current=null;setIsGenerating(true);
      try{await prepareBuiltinMediaAssets(preparation.signal);requestState=useProjectStore.getState();requestScreens=requestState.screens;creationContext=pageCreationContext(requestState);}
      catch(error){setMessages(prev=>[...prev,{id:'media-preflight-'+crypto.randomUUID(),sender:'assistant',isError:true,text:error instanceof Error?error.message:'独立素材准备失败，未调用模型。'}]);return;}
      finally{operationLockRef.current=false;if(abortControllerRef.current===preparation)abortControllerRef.current=null;setIsGenerating(false);}
      if(preparation.signal.aborted)return;
    }

    const knowledgeBundle = buildProjectKnowledgeBundle(useProjectStore.getState(), textToSend, (effectiveScreenId ?? decision.styleReferenceScreenId) ?? undefined);
    const projectKnowledge = [referenceDevicePrompt(settings), mobileNavigationPrompt(settings), knowledgeBundle.content].filter(Boolean).join('\n\n');

    if(resuming&&(resuming.checkpoint?.bindingKey??resuming.sectionedCheckpoint?.bindingKey)!==continuationBindingKey({provider:activeRole!.provider,model:activeRole!.modelId})){
      resuming.budget.close();
      setMessages(prev=>prev.map(m=>m.id===options!.continuationMessageId?{...m,continuationAvailable:false,text:'Provider或模型已变化，请重新生成；未使用旧续写片段。'}:m));continuationSessionsRef.current.delete(options!.continuationMessageId!);return;
    }
    if(repairing && repairing.value.draft.bindingKey!==continuationBindingKey({provider:activeRole.provider,model:activeRole.modelId})) {
      setMessages(prev=>prev.map(m=>m.qualityDraft?.id===repairing.value.id?{...m,qualityDraftNotice:'Provider或模型已变化，请重新生成；未使用旧草稿。'}:m));return;
    }
    if(resuming){continuationSessionsRef.current.delete(options!.continuationMessageId!);setMessages(prev=>prev.map(m=>m.id===options!.continuationMessageId?{...m,continuationAvailable:false}:m));}
    const variants=!options?.splitSinglePage&&!decision.elementNid&&requiresPageVariantPlan(extractCleanUserPrompt(textToSend));
    if(!repairing&&!resuming&&!approved&&decision.action==='create_screen'&&(options?.splitSinglePage||variants||requiresMultiPagePlan(textToSend))){
      const id=`multi_${crypto.randomUUID()}`,controller=new AbortController();
      const frozenBinding=continuationBindingKey({provider:activeRole.provider,model:activeRole.modelId});
      const session={context:creationContext,projectId:requestState.id,folderPath:requestState.folderPath,bindingCurrent:()=>{const latest=switchedToVision?getActiveProviderForRole('vision'):(getActiveProviderForRole('code')||getActiveProviderForRole('chat'));return referenceCurrent()&&Boolean(latest&&continuationBindingKey({provider:latest.provider,model:latest.modelId})===frozenBinding);},prepared:undefined as PreparedMultiPagePlan|undefined,controller};
      trackFailure(id,textToSend,requestState,{attachment,textReferences,model:activeRole.modelId,apiKey:activeRole.provider.apiKey});
      pagePlansRef.current.set(id,session);abortControllerRef.current=controller;activeMessageIdRef.current=id;operationLockRef.current=true;setIsGenerating(true);
      const current=()=>pagePlansRef.current.get(id)===session&&!controller.signal.aborted&&pageCreationContext(useProjectStore.getState())===creationContext&&session.bindingCurrent();
      setMessages(prev=>[...prev,{id:`usr_${id}`,sender:'user',text:textToSend,imageUrl:attachment?.dataUrl,textFileNames:textReferences.map(r=>r.name)},
        {id,sender:'assistant',text:'',isGenerating:true,thinkingStage:1,executionEvents:[{phase:'page-planning',at:Date.now()}],pagePlan:{status:'planning',message:variants?'正在整理同页方案差异；确认前不会生成或修改页面。':'正在整理页面清单；确认前不会生成或修改页面。'}}]);
      try{
        const prepared=await prepareMultiPagePlan({state:requestState,request:textToSend,provider:activeRole.provider,model:activeRole.modelId,core:engineCoreRef.current,onBudget:budget=>{if(pagePlansRef.current.get(id)===session)setMessages(prev=>prev.map(m=>m.id===id?{...m,taskBudget:budget}:m));},onActivity:activity=>publishActivity(id,controller,current,activity),
          referenceProcessing:attachment&&referenceRole?{binding:{provider:referenceRole.provider,model:referenceRole.modelId},storage:createProjectStorage(requestState.id,requestState.folderPath),cached:options?.referenceEvidence,force:options?.reparseReference}:undefined,attachment,textReferences,contextualGuidance,referencePageId:(variants?(decision.targetScreenId??decision.styleReferenceScreenId):decision.styleReferenceScreenId)??undefined,signal:controller.signal,isCurrent:current,splitFromSingle:options?.splitSinglePage});
        if(!current())throw Error('页面计划已取消或工程已变化，请重新规划。');session.prepared=prepared;publishPhase(id,controller,current,'page-plan-ready');
        setMessages(prev=>prev.map(m=>m.id===id?{...m,workflowContract:prepared.contract,pagePlan:{status:'ready',plan:prepared.plan,message:prepared.plan.summary}}:m));
      }catch(error){if(pagePlansRef.current.get(id)===session)setMessages(prev=>prev.map(m=>m.id===id?{...m,isError:!controller.signal.aborted,isStopped:controller.signal.aborted,pagePlan:{status:controller.signal.aborted?'cancelled':'blocked',message:error instanceof Error?error.message:'页面规划失败。'}}:m));}
      finally{finishOperation(id,controller);}
      return;
    }

    const modifiesExisting = (decision.action === 'modify_screen' || decision.action === 'patch_element') && effectiveScreenId;
    const modificationSnapshot = approved?.snapshot ?? (modifiesExisting
      ? captureModificationSnapshot(useProjectStore.getState(), effectiveScreenId!) : undefined);

    // 具体改法已由用户授权，直接生成；宽泛诉求才整理可选择的建议。
    const modificationEntryWorkflow = modifiesExisting
      ? selectModificationEntryWorkflow(extractCleanUserPrompt(textToSend), { hasElementReference: Boolean(decision.elementNid) }) : null;
    if (!repairing && !approved && !recovered && modifiesExisting && modificationEntryWorkflow?.id === 'review-page-modification') {
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
      const plan = { request: textToSend, attachment, options, snapshot, decision,rulePreference:Boolean(contextualGuidance), analysis: undefined as ModificationAnalysis | undefined };
      modificationPlansRef.current.set(reviewId, plan);
      const controller = new AbortController();
      abortControllerRef.current = controller;activeMessageIdRef.current=reviewId;
      operationLockRef.current = true;
      setIsGenerating(true);
      setMessages(prev => [...prev,
        { id: `usr_${reviewId}`, sender: 'user', text: textToSend, displayText: options?.displayText || extractCleanUserPrompt(textToSend), imageUrl: attachment?.dataUrl,
          referencedElement: options?.referencedElement || parseReferencedElement(textToSend) || undefined,
          referencedScreen: { id: effectiveScreenId, name: screen.name, viaActiveScreen: decision.referenceSource === 'active_screen' } },
        { id: reviewId, sender: 'assistant', text: '', workflowContract,isGenerating:true,thinkingStage:1,executionEvents:[{phase:'analyzing',at:Date.now()}],
          modificationReview: { status: 'analyzing', summary: '正在读取原页面，整理可选择的修改建议。', items: [] } }
      ]);
      trackFailure(reviewId,textToSend,current,{attachment,textReferences,reference:{screen:{id:screen.id,name:screen.name}},model:activeRole.modelId,apiKey:activeRole.provider.apiKey});
      const update = (review: ModificationReviewState) => setMessages(prev => prev.map(m => m.id === reviewId ? { ...m, modificationReview: review,isError:review.status==='error',isStopped:review.status==='cancelled' } : m));
      try {
        const analysis = await analyzeScreenModification(engineCoreRef.current, {
          onActivity:activity=>publishActivity(reviewId,controller,()=>isModificationSnapshotCurrent(useProjectStore.getState(),snapshot),activity),
          contextualGuidance,onContract:contract=>{const current=useProjectStore.getState();if(mountedRef.current&&current.id===requestState.id&&current.folderPath===requestState.folderPath)setMessages(prev=>prev.map(m=>m.id===reviewId?{...m,workflowContract:contract}:m));},
          provider: activeRole.provider, model: activeRole.modelId, signal: controller.signal,
          html: screen.htmlContent, name: screen.name, request: textToSend,
          isCurrent: () => referenceCurrent()&&isModificationSnapshotCurrent(useProjectStore.getState(), snapshot),
          useCustomNavigation: current.settings.useCustomNavigation,
          designSystem: current.designSystem, mode: current.settings.colorMode, elementNid: decision.elementNid,
          deviceProfile: current.settings.deviceProfile, frameWidth: current.settings.frameWidth,
          protectedNids: current.getProtectedNids(effectiveScreenId),
          referenceProcessing:attachment&&referenceRole?{binding:{provider:referenceRole.provider,model:referenceRole.modelId},storage:createProjectStorage(current.id,current.folderPath),onEvidence:(evidence,reused)=>{if(referenceCurrent())setMessages(prev=>prev.map(m=>m.id===reviewId?{...m,referenceEvidence:evidence,referenceReused:reused}:m));}}:undefined,attachment,
          imageUrl: attachment?.dataUrl,
          projectKnowledge,
          workflowContract,
          context: JSON.stringify({ scopedCss: screen.scopedCss,
            overrides: Object.entries(current.overrides).filter(([key]) => key.startsWith(`${effectiveScreenId}:`)),
            references: textReferences, decisions: Object.values(current.decisions).filter(d => d.active) })
        });
        if (!isModificationSnapshotCurrent(useProjectStore.getState(), snapshot)) throw new Error('原页面或工程已变化，请重新分析。');
        plan.analysis = analysis;publishPhase(reviewId,controller,()=>isModificationSnapshotCurrent(useProjectStore.getState(),snapshot),'review-ready');
        update({ ...analysis, status: 'ready' });
      } catch (error) {
        update({ status: controller.signal.aborted ? 'cancelled' : 'error', summary: error instanceof Error ? error.message : '分析失败，请重试。', items: [] });
      } finally {
        finishOperation(reviewId,controller);
      }
      return;
    }

    if (!repairing && !approved && modifiesExisting && decision.elementNid) {
      // Explicit reference authorizes this subtree only. Structural requests never choose an ancestor.
      const current = useProjectStore.getState();
      const screen = current.screens[effectiveScreenId!];
      const snapshot = modificationSnapshot!;
      const messageId = `element_${Date.now()}_${crypto.randomUUID()}`;
      const controller = new AbortController(); abortControllerRef.current = controller;activeMessageIdRef.current=messageId;
      operationLockRef.current = true; setIsGenerating(true);setLastGuardOutput(null);
      const canonicalRequest=extractCleanUserPrompt(textToSend),structural=requiresElementStructure(canonicalRequest);
      const elementCurrent=()=>{
        const latest=switchedToVision?getActiveProviderForRole('vision'):(getActiveProviderForRole('code')||getActiveProviderForRole('chat'));
        return referenceCurrent()&&!controller.signal.aborted&&isModificationSnapshotCurrent(useProjectStore.getState(),snapshot)&&Boolean(latest&&continuationBindingKey({provider:latest.provider,model:latest.modelId})===continuationBindingKey({provider:activeRole!.provider,model:activeRole!.modelId}));
      };
      const startedAt = Date.now();
      const conversationStore = current.getConversationStore(), attachmentStore = current.getAttachmentStore();
      trackFailure(messageId,textToSend,current,{attachment,textReferences,reference:{screen:{id:screen.id,name:screen.name},element:{nid:decision.elementNid!,tagName:options?.referencedElement?.tagName??'element'}},model:activeRole.modelId,apiKey:activeRole.provider.apiKey});
      setMessages(prev => [...prev,
        {id:`usr_${messageId}`,sender:'user',text:textToSend,displayText:options?.displayText || extractCleanUserPrompt(textToSend),imageUrl:attachment?.dataUrl,
          referencedElement:options?.referencedElement || parseReferencedElement(textToSend) || undefined,
          referencedScreen:{id:screen.id,name:screen.name},textFileNames:textReferences.map(file=>file.path || file.name)},
        {id:messageId,sender:'assistant',text:'',isGenerating:true,thinkingStage:1,executionEvents:[{phase:'preparing',at:Date.now()}],generationInputFingerprint:creationContext,
          preActionSnapshot:{screenId:screen.id,screenName:screen.name,htmlContent:screen.htmlContent},originalUserPrompt:textToSend,
          originalReferencedScreenId:screen.id,originalAttachment:attachment,
          retryContext:{version:1,projectContext:creationContext,options:{textReferences:structuredClone(textReferences),writeStrategy:options?.writeStrategy,referencedElement:options?.referencedElement,referencedScreenId:screen.id}},
          originalDecision:{action:'modify_screen',targetScreenId:screen.id,styleReferenceScreenId:null,elementNid:decision.elementNid}}
      ]);
      try {
        const workflowContract = buildDesignTaskContract({ intent: 'modify_screen', request: canonicalRequest,
          target: { id: screen.id, name: screen.name, htmlContent: screen.htmlContent }, elementNid: decision.elementNid,
          deviceProfile: current.settings.deviceProfile, frameWidth: current.settings.frameWidth,
          referenceDeviceName: current.settings.referenceDevice?.name, designSystem: current.designSystem,
          designSystemOrigin: current.designSystemOrigin, protectedNids: current.getProtectedNids(screen.id),
          knowledgeFingerprint: knowledgeBundle.fingerprint,
          knowledgeSources: [...knowledgeBundle.sources.map(source => ({ kind: source.kind === 'document' ? 'document' as const : 'page' as const, id: source.id,
            fingerprint: source.fingerprint ?? '', ...(source.stale ? { stale: true } : {}) })),
            ...textReferences.map(reference => ({ kind: 'text-reference' as const, id: reference.path ?? reference.name, fingerprint: contentFingerprint(reference.content) }))] });
        const candidate = await executeStructuredEdit(engineCoreRef.current,{
          contextualGuidance,
          mode:'element',binding:{provider:activeRole.provider,model:activeRole.modelId},signal:controller.signal,
          journal:new DesignTaskJournal({storage:createProjectStorage(current.id,current.folderPath),projectId:current.id,contextFingerprint:creationContext,provider:activeRole.provider,model:activeRole.modelId,attachment,textReferences,isCurrent:elementCurrent}),
          referenceProcessing:attachment&&referenceRole?{binding:{provider:referenceRole.provider,model:referenceRole.modelId},storage:createProjectStorage(current.id,current.folderPath),cached:options?.referenceEvidence??recovered?.source.contract.referenceImage?.evidence,force:options?.reparseReference,onEvidence:(evidence,reused)=>{if(elementCurrent())setMessages(prev=>prev.map(m=>m.id===messageId?{...m,referenceEvidence:evidence,referenceReused:reused}:m));}}:undefined,
          screen,styleOverrides:current.overrides,elementNid:decision.elementNid,request:canonicalRequest,settings:current.settings,contract:workflowContract,
          designSystem:current.designSystem,colorMode:current.settings.colorMode,protectedNids:current.getProtectedNids(screen.id),
          isCurrent:elementCurrent,
          imageUrl:attachment?.dataUrl,attachment,textReferences,projectKnowledge:[projectKnowledge,formatTextReferences(textReferences)].filter(Boolean).join('\n\n'),
          onActivity:a=>publishActivity(messageId,controller,elementCurrent,a),
          onPhase:phase=>{publishPhase(messageId,controller,elementCurrent,phase==='planning'?'planning':'generating');if(elementCurrent())setMessages(prev=>prev.map(m=>m.id===messageId?{...m,thinkingStage:phase==='planning'?1:2,generationProgress:phase==='planning'?'正在梳理所引用元素内的功能、信息与交互…':'正在生成所引用元素的副本修改…'}:m));},
        });
        if (controller.signal.aborted) return;
        setMessages(prev=>prev.map(m=>m.id===messageId?{...m,workflowContract:candidate.contract,taskBudget:candidate.taskBudget}:m));
        if (candidate.status!=='ready') throw new Error(candidate.message);
        if (!elementCurrent()) throw new Error('原页面、工程或模型已变化，本次未应用修改。');
        current.stageScreenChange(screen.id,candidate.html,`${screen.name}（${structural?'元素子树':'元素细节'}修改候选）`,textToSend,candidate.contract,
          candidate.executionRecord);
        current.panToScreen(screen.id);publishPhase(messageId,controller,elementCurrent,'candidate');
        const resultText = structural?'已在原页副本中修改所引用元素的内部结构，其他区域保留。请对比后采纳。':'已在原页副本中修改所引用元素的局部细节，其他内容保留。请对比后采纳。';
        setMessages(prev=>prev.map(m=>m.id===messageId?{...m,text:resultText,isGenerating:false,elapsedSeconds:Number(((Date.now()-startedAt)/1000).toFixed(1)),
          screenId:screen.id,screenName:screen.name,toolAction:'modified',htmlOutput:candidate.html,qualityReport:candidate.qualityReport,workflowContract:candidate.contract,taskBudget:candidate.taskBudget}:m));
        finishOperation(messageId,controller);
        try {
          const saved = attachment ? await attachmentStore.saveReference(attachment.name,attachment.dataUrl) : null;
          await conversationStore.appendTurn({turnId:messageId,ts:Date.now(),user:{text:textToSend,
            reference:{screen:{id:screen.id,name:screen.name},element:{nid:decision.elementNid!,tagName:options?.referencedElement?.tagName??parseReferencedElement(textToSend)?.tagName??'element'}},
            attachments:saved?[saved.relPath]:undefined,textFiles:textReferences.map(file=>file.path || file.name)},assistant:{text:resultText,pageTaskHistory:capturePageTaskHistory(candidate.contract,textToSend),designGuidanceHistory:captureDesignGuidanceHistory(candidate.contract,textToSend)}});
        } catch (error) { console.warn('Conversation save error:',error); }
      } catch (error) {
        if (!controller.signal.aborted) setMessages(prev=>prev.map(m=>m.id===messageId?{...m,isGenerating:false,isError:true,
          text:`局部修改未执行：${error instanceof Error ? error.message : String(error)}`} : m));
      } finally {
        finishOperation(messageId,controller);
      }
      return;
    }

    operationLockRef.current = true;
    const userMsgId = `usr_${Date.now()}`;
    const assistantMsgId = `ast_${Date.now()}`;
    trackFailure(assistantMsgId,textToSend,requestState,{attachment,textReferences,...(effectiveScreenId&&requestScreens[effectiveScreenId]?{reference:{screen:{id:effectiveScreenId,name:requestScreens[effectiveScreenId].name}}}:{}),model:activeRole.modelId,apiKey:activeRole.provider.apiKey});
    const startTime = Date.now();

    const controller = new AbortController();
    abortControllerRef.current = controller;activeMessageIdRef.current=assistantMsgId;

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

    // Frozen plans survive explicit continuation and local repair. Legacy tasks stay legacy.
    const inheritedTaskPlan=options?.reusedPageTaskPlan??resuming?.pageTaskPlan??repairing?.value.draft.pageTaskSource?.pageTaskPlan??recovered?.source.contract.pageTaskPlan;
    const wholePageRedesign=Boolean(resuming?.contract.wholePageRedesign||!repairing&&decision.action==='modify_screen'&&!decision.elementNid&&(options?.wholePageRedesign||explicitlyRequestsPageRedesign(cleanDisplayPrompt)));
    const planPageTask=Boolean(inheritedTaskPlan||(!resuming&&!repairing&&(decision.action==='create_screen'||(decision.action==='modify_screen'&&!decision.elementNid&&(wholePageRedesign||requiresFunctionalPlanning(cleanDisplayPrompt))))));

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
        generationInputFingerprint: creationContext,
        generationProgress:planPageTask?(inheritedTaskPlan?'已复用先前梳理的功能规划，正在生成页面…':'正在梳理用户任务、必要信息与交互状态…'):undefined,
        thinkingStage: 1, // 1: 分析需求
        executionEvents:[{phase:'preparing',at:Date.now()}],
        preActionSnapshot: preSnapshot,
        originalUserPrompt: textToSend,
        originalAttachment: attachment,
        referenceEvidence:options?.referenceEvidence,
        retryContext:{version:1,projectContext:creationContext,options:{textReferences:structuredClone(textReferences),writeStrategy:options?.writeStrategy??'auto',wholePageRedesign:options?.wholePageRedesign,referencedScreenId:options?.referencedScreenId,activeScreenId:options?.activeScreenId,referencedElement:options?.referencedElement,displayText:options?.displayText,sectioned:options?.sectioned}},
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

    const generationBudget=resuming?.budget??createChatTaskBudget(Boolean(sections||wholePageRedesign||decision.action==='create_screen'&&options?.writeStrategy==='auto'||options?.writeStrategy==='patch'));
    const bindingCurrent=()=>{
      const latest=switchedToVision?getActiveProviderForRole('vision'):(getActiveProviderForRole('code')||getActiveProviderForRole('chat'));
      return referenceCurrent()&&Boolean(latest&&continuationBindingKey({provider:latest.provider,model:latest.modelId})===continuationBindingKey({provider:activeRole!.provider,model:activeRole!.modelId}));
    };
    const progressCurrent=()=>mountedRef.current&&!controller.signal.aborted&&abortControllerRef.current===controller&&
      useProjectStore.getState().id===requestState.id&&useProjectStore.getState().folderPath===requestState.folderPath;
    const showPhase=(phase:PipelinePhase)=>{if(progressCurrent())setMessages(prev=>prev.map(m=>m.id===assistantMsgId?{...m,
      executionEvents:m.executionEvents?.at(-1)?.phase===phase?m.executionEvents:[...(m.executionEvents??[]),{phase,at:Date.now()}].slice(-24)}:m));};
    const taskJournal=(['create_screen','modify_screen'].includes(decision.action))&&!repairing?new DesignTaskJournal({storage:createProjectStorage(requestState.id,requestState.folderPath),projectId:requestState.id,contextFingerprint:creationContext,provider:activeRole.provider,model:activeRole.modelId,attachment,textReferences,originTaskId:recovered?.source.id,
      ...(recovered?{recovery:{version:1 as const,kind:recovered.kind,sourceFingerprint:contentFingerprint(JSON.stringify(recovered.source)),reusedStepIds:recovered.regions?.completed.map(part=>part.id)??[],ancestors:recovered.history}}:{}),isCurrent:()=>pageCreationContext(useProjectStore.getState())===creationContext&&bindingCurrent()}):undefined;
    let recoveryClaimed=false;
    let latestActivity:RequestActivity|undefined,repairActivity:ReturnType<typeof observeRequestActivity>|undefined;
    const reportActivity=(activity:RequestActivity)=>{if(progressCurrent()){latestActivity=activity;setMessages(prev=>prev.map(m=>m.id===assistantMsgId?{...m,executionActivity:activity,taskBudget:generationBudget.snapshot()}:m));}};
    try {
      const activeDecisionsList = Object.values(decisions)
        .filter((d) => d.active)
        .map((d) => ({
          id: d.id,
          rule: d.text,
          rationale: d.scope === 'global' ? '全局约定' : '画框局部约定'
        }));

      const output = await PipelineExecutor.execute({
        generatedMedia:{storage:createProjectStorage(requestState.id,requestState.folderPath),settings:requestState.settings,assets:Object.values(requestState.assets),isCurrent:()=>pageCreationContext(useProjectStore.getState())===creationContext&&bindingCurrent()},
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
        referenceProcessing:attachment&&!isQuestion&&referenceRole?{binding:{provider:referenceRole.provider,model:referenceRole.modelId},storage:createProjectStorage(requestState.id,requestState.folderPath),cached:options?.referenceEvidence??recovered?.source.contract.referenceImage?.evidence,force:options?.reparseReference,onEvidence:(evidence,reused)=>{if(progressCurrent())setMessages(prev=>prev.map(m=>m.id===assistantMsgId?{...m,referenceEvidence:evidence,referenceReused:reused,generationProgress:reused?'已复用图片解析结果，正在处理本轮要求…':'参考图解析已保存，后续仅传结构化证据…'}:m));}}:undefined,
        engineCore: taskJournal?taskJournal.wrapCore(engineCoreRef.current):engineCoreRef.current,taskBudget:generationBudget,
        onPhase:showPhase,
        onActivity:reportActivity,
        onTaskDraft:taskJournal?async update=>{
          await taskJournal.update(options?.recoverNewTask?prepareRecoveryDraft(options.recoverNewTask,update):update);
          if(options?.recoverNewTask&&!recoveryClaimed){
            try{await claimPreparedRecovery(createProjectStorage(requestState.id,requestState.folderPath),options.recoverNewTask,update.contract);recoveryClaimed=true;}
            catch(error){await taskJournal.update(prepareRecoveryDraft(options.recoverNewTask,{...update,phase:'result',result:{error:error instanceof Error?error.message:'恢复占用失败。'}}));throw error;}
          }
        }:undefined,
        recoveryData:recovered?{regions:recovered.regions,strategy:recovered.strategy,guidance:recovered.source.contract.designGuidance?.selection}:undefined,
        contextualGuidance:!resuming&&!repairing&&!recovered?contextualGuidance:undefined,
        pageTaskPlanning:planPageTask?{snapshot:inheritedTaskPlan}:undefined,
        wholePageRedesign,
        onTaskPlan:(taskPlan)=>{if(!controller.signal.aborted){setThinkingStage(2);setMessages(prev=>prev.map(m=>m.id===assistantMsgId?{...m,thinkingStage:2,pageTaskPlan:taskPlan,workflowContract:m.workflowContract?{...m.workflowContract,pageTaskPlan:taskPlan}:undefined,generationProgress:repairing?'原功能规划复核通过，正在定点修复已确认文案…':inheritedTaskPlan?'已复用已梳理的功能规划，正在生成页面…':'功能、信息与交互规划已完成，正在生成页面布局…'}:m));}},
        resume: resuming?.checkpoint,
        resumeContract:resuming?.contract,
        qualityRepair: repairing ? {draft:repairing.value.draft,labels:repairing.labels,region:repairing.region} : undefined,
        writeStrategy:!resuming?options?.writeStrategy:undefined,
        sectioned: sections ? {resume:resuming?.sectionedCheckpoint} : undefined,
        onSectionProgress: message=>{if(!controller.signal.aborted)setMessages(prev=>prev.map(m=>m.id===assistantMsgId?{...m,generationProgress:message}:m));},
        isCurrent: sections||planPageTask ? ()=>{
          const current=useProjectStore.getState();
          const latest=switchedToVision?getActiveProviderForRole('vision'):(getActiveProviderForRole('code')||getActiveProviderForRole('chat'));
          return !controller.signal.aborted&&current.folderPath===requestState.folderPath&&contentFingerprint(JSON.stringify([current.id,pageCreationContext(current),current.settings,current.overrides,current.components]))===recoveryContext()
            &&referenceCurrent()&&Boolean(latest&&continuationBindingKey({provider:latest.provider,model:latest.modelId})===continuationBindingKey({provider:activeRole!.provider,model:activeRole!.modelId}));
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
          if(!progressCurrent())return;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId
                ? { ...m, thinkingStage: 4, text: m.text + delta }
                : m
            )
          );
        },
        onReasoningDelta: (rDelta) => {
          if(!progressCurrent())return;
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
      const elapsedSeconds = Number(((Date.now() - startTime) / 1000).toFixed(1));

      // 失败和质量拒绝同样消耗模型用量；恢复请求的累计统计不能因早退而丢失。
      const stoppedBeforeHtml=planPageTask&&!inheritedTaskPlan&&!output.usage&&!output.rawResponse&&!output.omittedResponseChars;
      const promptTokens = stoppedBeforeHtml?0:output.usage?.inputTokens ?? Math.max(1, Math.round(textToSend.length / 3.5));
      const completionTokens = stoppedBeforeHtml?0:output.usage?.outputTokens ?? Math.max(1, Math.round((output.extractedHtml?.length || output.omittedResponseChars || output.rawResponse.length || 100) / 3.5));
      let turnUsage = { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens };
      setMessages(prev => prev.map(m => m.id === assistantMsgId ? {
        ...m, ...(output.warnings?.some(w=>w.startsWith('已自动将生成的SVG'))?{text:output.rawResponse}:{}),usage: turnUsage, usageNote:planPageTask&&!inheritedTaskPlan?'本行只含页面生成与修复；功能规划等步骤的累计用量见任务预算。':undefined, generationWarnings: output.warnings, elapsedSeconds,taskBudget:output.taskBudget,workflowContract:output.workflowContract,
        pageTaskPlan: output.workflowContract?.pageTaskPlan ?? m.pageTaskPlan
      } : m));
      if (controller.signal.aborted || useProjectStore.getState().id!==requestState.id || useProjectStore.getState().folderPath!==requestState.folderPath) return;
      if(!bindingCurrent()){
        setMessages(prev=>prev.map(m=>m.id===assistantMsgId?{...m,isGenerating:false,isError:true,continuationAvailable:false,sectionedAvailable:false,text:'Provider或模型在生成期间已变化，本次结果未应用。请重新发起任务。'}:m));return;
      }
      const resumable=Boolean((output.continuationCheckpoint||output.sectionedCheckpoint)&&output.workflowContract&&generationBudget.canReserve(output.sectionedCheckpoint?4096:8192)&&
        (!modificationSnapshot||isModificationSnapshotCurrent(useProjectStore.getState(),modificationSnapshot)));
      if(resumable){
        continuationSessionsRef.current.set(assistantMsgId,{checkpoint:output.continuationCheckpoint,sectionedCheckpoint:output.sectionedCheckpoint,context:recoveryContext(),decision:structuredClone(decision),budget:generationBudget,contract:structuredClone(output.workflowContract!),approved,textReferences:structuredClone(textReferences),pageTaskPlan:output.workflowContract?.pageTaskPlan?structuredClone(output.workflowContract.pageTaskPlan):undefined});
      }
      const budgetWarning=(output.continuationCheckpoint||output.sectionedCheckpoint)&&!resumable?'原任务剩余额度或时限不足以继续；请拆分设计或明确重新生成。':undefined;
      setMessages(prev=>prev.map(m=>m.id===assistantMsgId?{...m,sectionedMode:sections,sectionedAvailable:resumable&&!!output.sectionedCheckpoint,continuationAvailable:resumable,
        ...(budgetWarning?{generationWarnings:[...(m.generationWarnings??[]),budgetWarning]}:{}),
        executionRecord:output.executionRecord,outputLimitReached:!!output.continuationCheckpoint||isOutputLimit(output.executionRecord?.finishReason)}:m));

      if (modificationSnapshot && !isModificationSnapshotCurrent(useProjectStore.getState(), modificationSnapshot)) {
        setMessages(prev => prev.map(m => m.id === assistantMsgId ? { ...m, isGenerating: false, isError: true, text: '生成期间原页面或工程已变化，本次未应用修改，请重新分析。' } : m));
        return;
      }

      if (output.status === 'rejected_by_quality') {
        let value: SavedQualityDraft | undefined, saved=false, notice=repairing?.region?(output.errorMessage??''):'';
        if(output.failedDraft) {
          value={version:1,id:(repairing?.region?undefined:repairing?.value.id)??`draft-${Date.now().toString(36)}-${crypto.randomUUID()}`,projectId:requestState.id,createdAt:(repairing?.region?undefined:repairing?.value.createdAt)??Date.now(),
            ...(repairing?.region?{repairSource:{draftId:repairing.value.id,fingerprint:repairing.value.draft.fingerprint,...repairing.region}}:{}),draft:output.failedDraft,request:textToSend,projectContext:recoveryContext(),decision:structuredClone(decision),textReferences:structuredClone(textReferences),status:'blocked',
            aiAttempted:repairing?.value.aiAttempted,suggestions:repairing?.value.suggestions};
          try {
            if(attachment){const asset=await requestAttachmentStore.saveReference(attachment.name,attachment.dataUrl);if(!asset)throw Error('参考图未能落盘');value.attachment={name:attachment.name,relPath:asset.relPath,...(attachment.region?{region:attachment.region}:{})};}
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
          if(output.generatedAssets?.length){
            const state=useProjectStore.getState(),context=pageCreationContext(state);
            await verifyGeneratedMediaAssets(createProjectStorage(state.id,state.folderPath),output.generatedAssets,()=>{if(controller.signal.aborted||pageCreationContext(useProjectStore.getState())!==context)throw Error('生成媒体登记已取消或工程已变化。');});
            useProjectStore.getState().registerGeneratedAssets(output.generatedAssets,state.id,context);
          }
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
        generationBudget.assertActive();
        if(toolCall.tool==='create_screen')showPhase('rendering');
        toolAction =
          toolCall.tool === 'create_screen'
            ? 'created'
            : toolCall.tool === 'modify_screen'
            ? 'modified'
            : 'patched';

        if(toolCall.tool==='create_screen'&&output.executionRecord?.source==='model')repairActivity=observeRequestActivity(engineCoreRef.current,reportActivity,progressCurrent,latestActivity);
        const toolResult = await CanvasToolExecutor.executeAsync(toolCall.tool === 'modify_screen' ? { ...toolCall, params: { ...toolCall.params, modificationRequest: textToSend,
          workflowContract: output.workflowContract,executionRecord:output.executionRecord,generatedAssets:output.generatedAssets } } : toolCall.tool==='create_screen'?{...toolCall,params:{...toolCall.params,workflowContract:output.workflowContract,executionRecord:output.executionRecord,generatedAssets:output.generatedAssets}}:toolCall,
          {signal:controller.signal,taskBudget:generationBudget,isCurrent:()=>pageCreationContext(useProjectStore.getState())===creationContext&&bindingCurrent(),
            repair:toolCall.tool==='create_screen'&&output.executionRecord?.source==='model'?{core:repairActivity!.core,taskBudget:generationBudget,provider:activeRole.provider,model:activeRole.modelId,onPhase:phase=>{if(!controller.signal.aborted&&pageCreationContext(useProjectStore.getState())===creationContext)setMessages(prev=>prev.map(m=>m.id===assistantMsgId?{...m,text:phase==='repairing'?'检查发现控件渲染问题，正在尝试一次受控样式修复…':'修复指令已执行，正在重新检查全部门禁…'}:m));}}:undefined});
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
          showPhase(toolCall.tool==='create_screen'?'created':'candidate');
          createdScreenId = toolResult.screenId;
          finalScreenName = toolResult.screenName;
          checkpointId = toolResult.checkpointId;
          appliedHtml=toolResult.createdHtml;
          if(toolResult.repair)repairNotice='已完成一次控件样式修复，并重新通过全部交付检查。';
        }
      }

      if(output.status==='answered_question')showPhase('answered');
      const candidateDecision = detectCandidateDecision(textToSend);

      const defaultText =
        output.status==='answered_question'?output.rawResponse:toolAction === 'modified'
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

      if(taskJournal&&decision.action==='create_screen'){generationBudget.close();try{await taskJournal.markDelivered(generationBudget.snapshot());}catch{if(progressCurrent())setMessages(prev=>prev.map(m=>m.id===assistantMsgId?{...m,text:m.text+'\n页面已通过交付检查；任务完成标记保存失败，原草稿仍可在任务记录中查看。'}:m));}}
      finishOperation(assistantMsgId,controller);
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
          const saved = await requestAttachmentStore.saveReference(attachment.name, attachment.dataUrl);
          if (saved) {
            attachmentPath = saved.relPath;
          }
        }

        await requestConversationStore.appendTurn({
          turnId: `turn_${Date.now()}`,
          ts: Date.now(),
          user: {
            text: textToSend,
            textFiles: textReferences.map((file) => file.path || file.name),
            attachments: attachmentPath ? [attachmentPath] : undefined
          },
          assistant: {
            pageTaskHistory:capturePageTaskHistory(output.workflowContract,textToSend),
            designGuidanceHistory:captureDesignGuidanceHistory(output.workflowContract,textToSend),
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
      if(!progressCurrent())return;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId
            ? { ...m, isGenerating: false, isError: true, text: `请求异常: ${err?.message || '未知错误'}` }
            : m
        )
      );
    } finally {
      repairActivity?.stop();
      if(controller.signal.aborted)continuationSessionsRef.current.delete(assistantMsgId);
      if(continuationSessionsRef.current.get(assistantMsgId)?.budget!==generationBudget)generationBudget.close();
      if(mountedRef.current)setMessages(prev=>prev.map(m=>m.id===assistantMsgId?{...m,taskBudget:generationBudget.snapshot()}:m));
      finishOperation(assistantMsgId,controller);
    }
  };

  const confirmModification = async (messageId: string, selected: string[], extra: string, mode: ModificationMode = 'page', retryOptions?:{rePlan?:boolean;withoutAttachment?:boolean;ignoreReference?:boolean;reparseReference?:boolean}) => {
    const storedPlan = modificationPlansRef.current.get(messageId);
    const plan=storedPlan?{...storedPlan,...(retryOptions?.ignoreReference?{attachment:undefined}:{})}:undefined;
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
      const executionId=`${messageId}-${crypto.randomUUID()}`;
      const controller = new AbortController(); abortControllerRef.current = controller;activeMessageIdRef.current=messageId;
      operationLockRef.current = true; setIsGenerating(true);
      const priorExecution=messages.find(m=>m.id===messageId);
      setMessages(prev=>prev.map(m=>m.id===messageId?{...m,isGenerating:true,isError:false,isStopped:false,failureHistoryState:undefined,thinkingStage:1,executionActivity:undefined,executionEvents:[{phase:'preparing',at:Date.now()}]}:m)); setLastGuardOutput(null);
      const update = (review: ModificationReviewState) => setMessages(prev => prev.map(m => m.id === messageId ? { ...m, modificationReview: review } : m));
      update({ ...plan.analysis, status: 'submitted', summary: `正在复制原页面并应用已确认的${modeName}修改。` });
      try {
        const current = useProjectStore.getState();
        const screen = current.screens[plan.snapshot.screenId];
        const archiveBinding=getActiveProviderForRole('code')||getActiveProviderForRole('chat');
        trackFailure(messageId,scope,current,{reviewRequest:plan.request,attachment:plan.attachment,textReferences:plan.options?.textReferences,reference:{screen:{id:screen.id,name:screen.name}},model:archiveBinding?.modelId,apiKey:archiveBinding?.provider.apiKey});
        const conversationStore = current.getConversationStore();
        const attachmentStore = current.getAttachmentStore();
        const generationInputFingerprint=pageCreationContext(current);
        const confirmedBundle = buildProjectKnowledgeBundle(current, scope, screen.id);
        const confirmedKnowledge = [referenceDevicePrompt(current.settings), mobileNavigationPrompt(current.settings), confirmedBundle.content,
          formatTextReferences(plan.options?.textReferences ?? [])].filter(Boolean).join('\n\n');
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
        if(!retryOptions?.rePlan&&!retryOptions?.reparseReference&&!retryOptions?.ignoreReference&&priorExecution?.workflowContract?.request===scope&&!priorExecution.workflowContract.regionSubdivision)workflowContract.pageTaskPlan=priorExecution.workflowContract.pageTaskPlan;
        // A failed preflight is its own attempt, never the previous analysis/retry task.
        setMessages(prev=>prev.map(m=>m.id===messageId?{...m,workflowContract,taskBudget:undefined}:m));
        let binding: ReturnType<typeof getActiveProviderForRole> | undefined = undefined;
        if (mode === 'region' || extra.trim()) {
          binding = getActiveProviderForRole('code') || getActiveProviderForRole('chat');
          if (!binding?.provider || (!binding.provider.apiKey && binding.provider.protocol !== 'ollama_native')) throw new Error('请先配置可用的 AI Provider 以解析补充要求。');
        }
        const observer=plan.attachment&&binding?(supportsVision(binding.provider,binding.modelId)?binding:getActiveProviderForRole('vision')):undefined;
        if(plan.attachment&&binding&&!observer)throw Error('请配置可用的Vision档位以独立解析参考图。');
        const structuredCurrent=()=>{
          if(!isModificationSnapshotCurrent(useProjectStore.getState(),plan.snapshot))return false;
          if(!binding)return true;
          let latest=getActiveProviderForRole('code')||getActiveProviderForRole('chat');
          const latestObserver=latest&&supportsVision(latest.provider,latest.modelId)?latest:getActiveProviderForRole('vision');
          return Boolean(latest&&continuationBindingKey({provider:latest.provider,model:latest.modelId})===continuationBindingKey({provider:binding.provider,model:binding.modelId})&&(!observer||(latestObserver&&continuationBindingKey({provider:latestObserver.provider,model:latestObserver.modelId})===continuationBindingKey({provider:observer.provider,model:observer.modelId}))));
        };
        const candidate = await executeStructuredEdit(engineCoreRef.current,{
          contextualGuidance:(plan.rulePreference??useAIConfigStore.getState().autoReferenceDesignRules)?{}:undefined,
          mode,screen,styleOverrides:current.overrides,request:scope,contract:workflowContract,settings:current.settings,designSystem:current.designSystem,colorMode:current.settings.colorMode,
          signal:controller.signal,isCurrent:structuredCurrent,
          binding:binding ? {provider:binding.provider,model:binding.modelId} : undefined,
          journal:binding?new DesignTaskJournal({storage:createProjectStorage(current.id,current.folderPath),projectId:current.id,contextFingerprint:generationInputFingerprint,provider:binding.provider,model:binding.modelId,attachment:plan.attachment,textReferences:plan.options?.textReferences,isCurrent:structuredCurrent}):undefined,
          referenceProcessing:observer?{binding:{provider:observer.provider,model:observer.modelId},storage:createProjectStorage(current.id,current.folderPath),cached:priorExecution?.referenceEvidence??priorExecution?.workflowContract?.referenceImage?.evidence,force:retryOptions?.reparseReference,onEvidence:(evidence,reused)=>{if(structuredCurrent())setMessages(prev=>prev.map(m=>m.id===messageId?{...m,referenceEvidence:evidence,referenceReused:reused}:m));}}:undefined,
          local:localPlan ? {...localPlan,supplement:Boolean(extra.trim())} : undefined,regionNids:regionPlan?.targetNids,
          protectedNids:current.getProtectedNids(screen.id),imageUrl:plan.attachment?.dataUrl,attachment:plan.attachment,textReferences:plan.options?.textReferences,projectKnowledge:confirmedKnowledge,
          onActivity:a=>publishActivity(messageId,controller,structuredCurrent,a),
          onPhase:phase=>{publishPhase(messageId,controller,structuredCurrent,phase==='planning'?'planning':'generating');if(!controller.signal.aborted&&structuredCurrent())update({...plan.analysis!,status:'submitted',summary:phase==='planning'?'正在梳理已确认区块的功能、信息与交互…':'区块范围已确认，正在生成副本中的对应区块…'});}
        });
        if(!mountedRef.current||controller.signal.aborted||abortControllerRef.current!==controller)return;
        if(candidate.status!=='ready'){
          if(!controller.signal.aborted)setMessages(prev=>prev.map(m=>m.id===messageId?{...m,workflowContract:candidate.contract,taskBudget:candidate.taskBudget,originalUserPrompt:plan.request,originalReferencedScreenId:screen.id,originalAttachment:plan.attachment,structuredRetry:{reviewId:messageId,selected:[...selected],extra,mode},retryContext:{version:1,projectContext:generationInputFingerprint,options:{textReferences:plan.options?.textReferences}}}:m));
          throw new Error(candidate.message);
        }
        if(!structuredCurrent())throw new Error('原页面、工程或模型已变化，未暂存本次区块结果。');
        current.stageScreenChange(screen.id, candidate.html, `${screen.name}（${modeName}修改候选）`, scope, candidate.contract,
          candidate.executionRecord);
        current.panToScreen(screen.id);publishPhase(messageId,controller,structuredCurrent,'candidate');
        update({ ...plan.analysis, status: 'submitted' });
        setMessages(prev=>prev.map(m=>m.id===messageId?{...m,workflowContract:priorExecution?.workflowContract?.operation==='analyze'?priorExecution.workflowContract:undefined,taskBudget:undefined}:m));
        const resultText = `已在「${screen.name}」的副本上完成 ${mode === 'region' ? regionPlan!.targetNids.length : localPlan!.allowedNids.length} 个目标的${modeName}修改，原页面未替换。请对比后采纳或保留原版。`;
        setMessages(prev => {const execution=prev.find(m=>m.id===messageId);return [...prev.map(m=>m.id===messageId?{...m,isGenerating:false,executionEvents:priorExecution?.executionEvents,executionActivity:priorExecution?.executionActivity}:m),
          { id: `local_usr_${executionId}`, sender: 'user', text: scope },
          { id: `local_ast_${executionId}`, sender: 'assistant', text: resultText,thinkingStage:4,executionEvents:execution?.executionEvents,executionActivity:execution?.executionActivity, screenId: screen.id, screenName: screen.name,
            toolAction: 'modified', qualityReport: candidate.qualityReport, workflowContract:candidate.contract,taskBudget:candidate.taskBudget, htmlOutput: candidate.html, generationInputFingerprint, preActionSnapshot: { screenId: screen.id, screenName: screen.name, htmlContent: screen.htmlContent },
            structuredRetry:{reviewId:messageId,selected:[...selected],extra,mode},
            originalUserPrompt: `${plan.request}\n${scope}`, originalReferencedScreenId: screen.id, originalAttachment: plan.attachment,
            originalDecision: { action: 'modify_screen', targetScreenId: screen.id, styleReferenceScreenId: null, elementNid: null } }
        ];});
        finishOperation(messageId,controller);
        try {
          const savedAttachment = plan.attachment ? await attachmentStore.saveReference(plan.attachment.name, plan.attachment.dataUrl) : null;
          await conversationStore.appendTurn({ turnId: `local_${executionId}`, ts: Date.now(),
            user: { text:scope,reviewRequest:plan.request,attachments: savedAttachment ? [savedAttachment.relPath] : undefined,
              textFiles: plan.options?.textReferences?.map(file => file.path || file.name) }, assistant: { text:resultText,pageTaskHistory:capturePageTaskHistory(candidate.contract,scope),designGuidanceHistory:captureDesignGuidanceHistory(candidate.contract,scope) } });
        } catch (error) { console.warn('Conversation save error:', error); }
      } catch (error) {
        // A stopped execution can finish after a retry on the same review message.
        // Only its current owner may replace the message's status or summary.
        if(mountedRef.current&&abortControllerRef.current===controller){
          update({ ...plan.analysis, status: controller.signal.aborted ? 'cancelled' : 'ready', summary: `${modeName}修改未执行：${error instanceof Error ? error.message : String(error)}` });
          setMessages(prev=>prev.map(m=>m.id===messageId?{...m,isError:!controller.signal.aborted,isStopped:controller.signal.aborted}:m));
        }
      } finally {
        finishOperation(messageId,controller);
      }
      return;
    }
    modificationPlansRef.current.delete(messageId);
    setMessages(prev => prev.map(m => m.id === messageId ? { ...m, modificationReview: { ...plan.analysis!, status: 'submitted' } } : m));
    const prompt = `${plan.request}\n\n[本次确认修改范围，以此为准]\n${scope}`;
    await sendMessage(prompt, plan.attachment, { ...plan.options,wholePageRedesign:true, displayText: `${plan.options?.displayText || extractCleanUserPrompt(plan.request)}\n\n${scope}` }, { ...plan, receipt });
  };

  const cancelModification = (messageId: string) => {
    if(activeMessageIdRef.current===messageId)abort();
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
    executionOptions: {signal?:AbortSignal;isCurrent?:()=>boolean;taskBudget?:TaskBudget}={}
  ) => {
    executionOptions.taskBudget?.assertActive();
    if(executionOptions.signal?.aborted||executionOptions.isCurrent?.()===false)throw Error('复验已取消或原任务上下文已变化。');
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
          params: { screenId: target.id, title: target.name, html: htmlToApply, modificationRequest: userPrompt, workflowContract: msg?.workflowContract }
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
          params: { ...toolCall.params, modificationRequest: userPrompt, workflowContract: msg?.workflowContract }
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

  const forceApply = async (_specificHtml?: string, msgId?: string) => {
    const sourceMsg = msgId ? messages.find(m=>m.id===msgId) : [...messages].reverse().find(m=>m.isGuardRejected);
    const candidate=useProjectStore.getState().stagedScreen;
    if (!candidate || (msgId && (!sourceMsg?.workflowContract || sourceMsg.workflowContract.taskId!==candidate.workflowContract?.taskId))) {
      const notice='本次结果未应用：当前候选不存在或已被替换，不能从旧消息恢复执行权限；请重新发起修改。';
      if(sourceMsg)setMessages(prev=>prev.map(m=>m.id===sourceMsg.id?{...m,isError:true,text:notice}:m));
      return;
    }
    const projectId=useProjectStore.getState().id;
    if (!await forceAdoptStagedChange()) return;
    if (useProjectStore.getState().id!==projectId || useProjectStore.getState().stagedScreen) return;
    setLastGuardOutput(null);
    setMessages(prev=>prev.map(msg=>({...msg,isGuardRejected:false,structureDiff:undefined,
      text:msg.text?msg.text.replace('⚠️ 结构守卫拦截','✅ 结构差异已确认并通过交付检查'):msg.text})));
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
    const state=useProjectStore.getState(),context=pageCreationContext(state);
    if(target.generationInputFingerprint!==context){
      setMessages(prev=>prev.map(m=>m.id===msgId?{...m,isError:true,text:'本次结果未应用：原生成输入已变化或缺少原输入快照；请重新发起任务，旧结果仍可查看。'}:m));
      return;
    }
    const controller=new AbortController();
    const validationBudget=createSingleRequestBudget(1); // Independent zero-model verification, not renewed generation authority.
    abortControllerRef.current=controller;activeMessageIdRef.current=msgId;operationLockRef.current=true;setIsGenerating(true);
    const current=()=>pageCreationContext(useProjectStore.getState())===context;
    const sameProject=()=>useProjectStore.getState().id===state.id&&useProjectStore.getState().folderPath===state.folderPath;
    setMessages(prev=>prev.map(m=>m.id===msgId?{...m,isGenerating:true,isStopped:false,thinkingStage:1,executionEvents:[{phase:'rendering',at:Date.now()}],executionActivity:initialRequestActivity()}:m));
    try {
      // 先按该轮的引用画框与用户诉求裁决落点，仅无目标可循时才新建 (BR-GRM-02)
      const result = await applyHtmlToTarget(
        target,
        target.htmlOutput,
        null,
        target.screenName || '画框 (AI 补挂)',
        {signal:controller.signal,isCurrent:current,taskBudget:validationBudget}
      );
      if(!progressOwned(controller,sameProject))return;

      if(result&&!result.success){
        setMessages(prev=>prev.map(m=>m.id===msgId?{...m,isError:true,text:`本次结果未应用：${result.error}`}:m));return;
      }
      if (result?.success) {
        // The successful action changes the project context itself. Its completion
        // is bound to the operation/project owner, not the pre-write fingerprint.
        publishPhase(msgId,controller,sameProject,result.tool==='create_screen'?'created':'candidate');
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msgId
              ? {
                  ...m,
                  isGuardRejected: false,
                  isError:false,
                  text:result.status==='screen_staged'?`已重新检查并生成「${result.screenName||'页面'}」的修改候选，请对比后采纳。`:
                    result.tool==='create_screen'?`已重新检查并挂载「${result.screenName||'页面'}」。`:`已重新检查并更新「${result.screenName||'页面'}」。`,
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
    } catch(error){
      if(progressOwned(controller,sameProject))setMessages(prev=>prev.map(m=>m.id===msgId?{...m,isError:true,text:`本次结果未应用：${error instanceof Error?error.message:'重新检查失败。'}`}:m));
    } finally {
      validationBudget.close();
      finishOperation(msgId,controller);
    }
  };

  const retryTurn = (msgId: string, retryOptions?: { rePlan?: boolean; withoutAttachment?: boolean; reparseReference?:boolean; ignoreReference?:boolean;referenceCorrection?:string }) => {
    const target = messages.find((m) => m.id === msgId);
    if (!target?.originalUserPrompt || isGenerating || operationLockRef.current) return;
    if(target.retryContext&&target.retryContext.projectContext!==pageCreationContext(useProjectStore.getState())){
      setMessages(prev=>prev.map(m=>m.id===msgId?{...m,text:'工程、原页或设计规则已变化，不能按旧输入重试。请按当前页面重新发送要求。',isError:true}:m));return;
    }
    const hasEvidence=Boolean(target.referenceEvidence??target.workflowContract?.referenceImage?.evidence);
    const ignore=retryOptions?.ignoreReference||retryOptions?.withoutAttachment&&!hasEvidence;
    if(target.structuredRetry){const retry=target.structuredRetry;return confirmModification(retry.reviewId,retry.selected,[retry.extra,retryOptions?.referenceCorrection].filter(Boolean).join('\n'),retry.mode,{...retryOptions,ignoreReference:ignore});}
    let planToReuse = (retryOptions?.rePlan || retryOptions?.reparseReference || retryOptions?.referenceCorrection || ignore) ? undefined : (target.workflowContract?.pageTaskPlan ?? target.pageTaskPlan);
    const codeBinding=getActiveProviderForRole('code')||getActiveProviderForRole('chat');
    if(planToReuse&&(target.originalAttachment&&!hasEvidence||planToReuse.request.providerId!==codeBinding?.provider.id||planToReuse.request.model!==codeBinding?.modelId))planToReuse=undefined;
    const attachmentToUse = ignore ? undefined : target.originalAttachment;
    const original=target.retryContext?.options??{};
    return sendMessage(target.originalUserPrompt+(retryOptions?.referenceCorrection?'\n[用户对参考图解析的补充/更正]\n'+retryOptions.referenceCorrection.slice(0,2000):''), attachmentToUse, {
      ...original,writeStrategy:original.writeStrategy??'auto',
      sectioned:target.sectionedMode??original.sectioned,
      reusedPageTaskPlan: planToReuse,
      referenceEvidence:ignore?undefined:target.referenceEvidence??target.workflowContract?.referenceImage?.evidence,
      reparseReference:retryOptions?.reparseReference,
      ...(target.originalDecision?.elementNid?{referencedElement:original.referencedElement??{nid:target.originalDecision.elementNid,tagName:'element',screenName:target.preActionSnapshot?.screenName}}:{}),
      referencedScreenId:target.originalDecision?.action==='create_screen'?target.originalDecision.styleReferenceScreenId??original.referencedScreenId??null:target.originalReferencedScreenId??target.preActionSnapshot?.screenId??original.referencedScreenId??null
    });
  };

  const repairQualityTurn = async (msgId:string,labels:DraftLabel[],region?:DraftRegionRequest) => {
    const message=messages.find(m=>m.id===msgId),value=message?.qualityDraft;
    if(!value||value.status!=='blocked'||operationLockRef.current||isGenerating)return;
    const state=useProjectStore.getState();
    let attachment: ImageAttachment|undefined;
    try {
      if(value.attachment){const dataUrl=await state.getAttachmentStore().readDataUrl(value.attachment.relPath);if(!dataUrl)throw Error('原参考图文件缺失，请重新生成。');attachment={name:value.attachment.name,dataUrl,...(value.attachment.region?{region:value.attachment.region}:{})};}
      if(useProjectStore.getState().id!==state.id||useProjectStore.getState().folderPath!==state.folderPath)return;
      await sendMessage(value.request,attachment,{qualityRepair:{value,labels,region},displayText:region?value.request+'\n[草稿局部修复]\n'+region.instruction:undefined,reusedPageTaskPlan:value.draft.pageTaskSource?.pageTaskPlan,referenceEvidence:value.draft.referenceImage?.evidence,wholePageRedesign:Boolean((value.draft.pageTaskSource??value.draft.guidanceSource)?.wholePageRedesign),referencedScreenId:value.decision.targetScreenId});
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
    const controller=new AbortController();abortControllerRef.current=controller;activeMessageIdRef.current=msgId;operationLockRef.current=true;setIsGenerating(true);
    setMessages(prev=>prev.map(m=>m.id===msgId?{...m,qualityDraftBusy:true,qualityDraftNotice:'仅为报错操作生成一次文案建议，确认前不应用。'}:m));
    const suggestionBudget=createSingleRequestBudget(1800);
    const suggestionCurrent=()=>{
      if(suggestionBudget.signal.aborted||suggestionBudget.remainingMs()<=0)return false;
      const latest=useProjectStore.getState();
      let configured=getActiveProviderForRole('code')||getActiveProviderForRole('chat');
      if(value.attachment&&configured&&!supportsVision(configured.provider,configured.modelId))configured=getActiveProviderForRole('vision');
      return latest.id===state.id&&latest.folderPath===state.folderPath&&value.projectContext===contentFingerprint(JSON.stringify([latest.id,pageCreationContext(latest),latest.settings,latest.overrides,latest.components]))&&
        Boolean(configured&&continuationBindingKey({provider:configured.provider,model:configured.modelId})===value.draft.bindingKey);
    };
    const observer=observeRequestActivity(engineCoreRef.current,a=>publishActivity(msgId,controller,suggestionCurrent,a),()=>!controller.signal.aborted&&suggestionCurrent());
    let claimStarted=false;
    try {
      const {saved,result}=await suggestionBudget.run(async taskSignal=>{
      claimStarted=true;
      if(!await claimDraftSuggestion(value,state.folderPath))throw Error('此草稿已使用过AI建议，请手动填写文案。');
      const claimed={...value,aiAttempted:true};
      if(mountedRef.current&&useProjectStore.getState().id===state.id&&useProjectStore.getState().folderPath===state.folderPath)
        setMessages(prev=>prev.map(m=>m.id===msgId&&m.qualityDraft?.id===value.id?{...m,qualityDraft:{...m.qualityDraft,aiAttempted:true}}:m));
      if(!progressOwned(controller,suggestionCurrent))throw Error('工程、模型已变化或建议已取消，本次机会已记录。');
      const result=await suggestDraftLabels(observer.core,{provider:actual.provider,model:actual.modelId},value.request,targets,taskSignal,suggestionBudget);
      const current=useProjectStore.getState(),same=current.id===state.id&&current.folderPath===state.folderPath;
      const fresh=same&&suggestionCurrent();
      const saved={...claimed,suggestions:!result.error&&!controller.signal.aborted&&fresh?result.labels:undefined};
      await saveQualityDraft(saved,state.folderPath);
      // Disk I/O may finish after Stop, a model change or a newer manual repair.
      // Drop expired suggestions; the repository preserves an already resolved status.
      if(saved.suggestions&&(controller.signal.aborted||!suggestionCurrent())){
        saved.suggestions=undefined;await saveQualityDraft(saved,state.folderPath);
      }
      return {saved,result};
      },controller.signal);
      suggestionBudget.assertActive();
      if(progressOwned(controller,()=>useProjectStore.getState().id===state.id&&useProjectStore.getState().folderPath===state.folderPath))setMessages(prev=>prev.map(m=>m.id===msgId?{...m,qualityDraft:saved,qualityDraftNotice:!suggestionCurrent()?'工程或模型已变化，建议未采用。':result.error?`建议未采用：${result.error}；可手动填写。`:`建议已填入，确认或修改后再执行定点修复。${result.estimated?'本次用量为估算。':''}`,
        usage:result.usage?{promptTokens:(m.usage?.promptTokens??0)+result.usage.inputTokens,completionTokens:(m.usage?.completionTokens??0)+result.usage.outputTokens,totalTokens:(m.usage?.totalTokens??0)+result.usage.inputTokens+result.usage.outputTokens}:m.usage}:m));
    }catch(error){
      if(claimStarted&&suggestionBudget.signal.aborted)void saveQualityDraft({...value,aiAttempted:true,suggestions:undefined},state.folderPath).catch(()=>console.warn('[quality-draft] 清理过期建议失败'));
      if(progressOwned(controller,()=>useProjectStore.getState().id===state.id&&useProjectStore.getState().folderPath===state.folderPath))notice(String(error instanceof Error?error.message:error));
    }
    finally {
      suggestionBudget.close();
      observer.stop();
      if(mountedRef.current&&abortControllerRef.current===controller)setMessages(prev=>prev.map(m=>m.id===msgId?{...m,qualityDraftBusy:false}:m));
      finishOperation(msgId,controller);
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

  const prepareTaskRestore=async(task:SavedDesignTask)=>{
    if(isGenerating||operationLockRef.current)throw Error('请先停止当前任务再恢复草稿。');
    const state=useProjectStore.getState();let binding=getActiveProviderForRole('code')||getActiveProviderForRole('chat');
    if(task.inputs?.attachment&&!task.contract.referenceImage?.evidence&&binding&&!supportsVision(binding.provider,binding.modelId))binding=getActiveProviderForRole('vision');
    if(!binding||(!binding.provider.apiKey&&binding.provider.protocol!=='ollama_native'))throw Error('请先配置原任务使用的Provider与模型。');
    const handle=await (task.generationTree?prepareTreeTaskRecovery:prepareTaskRecovery)(createProjectStorage(state.id,state.folderPath),task.id,state,binding.provider,binding.modelId);
    if(isGenerating||operationLockRef.current)throw Error('另一个任务已经开始，未重复恢复。');
    if(pageCreationContext(useProjectStore.getState())!==pageCreationContext(state)||useProjectStore.getState().id!==state.id||useProjectStore.getState().folderPath!==state.folderPath)throw Error('准备恢复期间工程已变化，请重新查看记录。');return handle;
  };
  const startPreparedTaskRestore=async(handle:PreparedDesignRecovery)=>{
    if(handle.kind==='tree'){
      if(isGenerating||operationLockRef.current)throw Error('请先停止当前任务。');
      const data=treeRecoveryData(handle),state=useProjectStore.getState();let binding=getActiveProviderForRole('code')||getActiveProviderForRole('chat');
      const vision=Boolean(data.inputs.attachment&&!data.source.contract.referenceImage?.evidence&&binding&&!supportsVision(binding.provider,binding.modelId));if(vision)binding=getActiveProviderForRole('vision');
      if(!binding)throw Error('请先配置原任务的模型。');
      const key=continuationBindingKey({provider:binding.provider,model:binding.modelId});
      const observer=data.inputs.attachment?(supportsVision(binding.provider,binding.modelId)?binding:getActiveProviderForRole('vision')):undefined;
      if(data.inputs.attachment&&data.source.contract.referenceImage?.evidence&&!observer)throw Error('请配置原图片解析所需的视觉档位。');
      const observerKey=observer?continuationBindingKey({provider:observer.provider,model:observer.modelId}):undefined;
      const bindingCurrent=()=>{const primary=getActiveProviderForRole('code')||getActiveProviderForRole('chat'),current=vision?getActiveProviderForRole('vision'):primary,latestObserver=primary&&supportsVision(primary.provider,primary.modelId)?primary:getActiveProviderForRole('vision');return Boolean(current&&continuationBindingKey({provider:current.provider,model:current.modelId})===key&&(!observerKey||(latestObserver&&continuationBindingKey({provider:latestObserver.provider,model:latestObserver.modelId})===observerKey)));};
      const prepared=await prepareRecoveredMultiPagePlan(handle,state,binding.provider,binding.modelId,engineCoreRef.current,observer?{binding:{provider:observer.provider,model:observer.modelId},storage:createProjectStorage(state.id,state.folderPath),cached:data.source.contract.referenceImage?.evidence}:undefined);
      if(!mountedRef.current||isGenerating||operationLockRef.current||!bindingCurrent()||pageCreationContext(useProjectStore.getState())!==pageCreationContext(state)||useProjectStore.getState().id!==state.id||useProjectStore.getState().folderPath!==state.folderPath)throw Error('准备期间工程或其它任务已变化，请重新确认。');
      const id='tree-recovery-'+crypto.randomUUID();pagePlansRef.current.set(id,{context:pageCreationContext(state),projectId:state.id,folderPath:state.folderPath,bindingCurrent,prepared});
      setMessages(previous=>[...previous,{id:'user-'+id,sender:'user',text:`恢复多页设计（新任务）：${handle.request}\n复用${handle.parents}个共享父节点及${handle.leaves}个完整页面；历史已知请求${data.history.reduce((sum,row)=>sum+(row.budget?.requests??0),0)}次${data.history.some(row=>!row.budget)?'，另有历史用量未知':''}。`},{id,sender:'assistant',text:'',pagePlan:{status:'ready',plan:prepared.plan,message:'已确认新预算，正在恢复完整生成树。'}}]);
      void confirmPagePlan(id,prepared.plan.pages,{concurrency:handle.concurrency});return;
    }

    const data=recoveryData(handle),fresh=await prepareTaskRestore(data.source);
    if(fresh.kind==='tree')throw Error('恢复任务类型已变化，请重新选择。');
    if(contentFingerprint(JSON.stringify(recoveryData(fresh).source))!==contentFingerprint(JSON.stringify(data.source)))throw Error('预览后的原任务已变化，请重新确认恢复。');
    void sendMessage(data.source.request,data.attachment,{recoverNewTask:handle,textReferences:data.textReferences,writeStrategy:'auto',wholePageRedesign:data.kind==='redesign',referencedScreenId:data.kind==='redesign'?data.source.contract.target!.id:data.source.contract.referencePageId??null,activeScreenId:null,
      displayText:`恢复草稿（新任务）：${data.source.request}\n复用${handle.reusableRegions}个完整区域；已记录历史请求${data.history.reduce((sum,row)=>sum+(row.budget?.requests??0),0)}次${data.history.some(row=>!row.budget)?'（另有历史用量未知）':''}，过去消耗保留。`}).catch(error=>setMessages(prev=>[...prev,{id:'recovery-error-'+crypto.randomUUID(),sender:'assistant',isError:true,text:error instanceof Error?error.message:'新恢复任务未能启动。'}]));
  };
  const recoverTask=async(task:SavedDesignTask)=>startPreparedTaskRestore(await prepareTaskRestore(task));
  return {
    prepareTaskRestore,startPreparedTaskRestore,
    recoverTask,
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
