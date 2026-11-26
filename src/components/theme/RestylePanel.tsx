import {userFacingMessage} from '../../utils/userFacingMessage';
import {UserFacingNotice} from '../common/UserFacingNotice';
import { referenceDevicePrompt } from '../../utils/referenceDevice';
import { normalizeMobileNavigation } from '../../utils/mobileNavigation';
import { buildProjectKnowledgeBundle, buildProjectKnowledgeContext } from '../../services/ai/projectKnowledge';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, Loader2, Sparkles, X } from 'lucide-react';
import { useProjectStore } from '../../stores/useProjectStore';
import { t as translate } from '../../i18n';
import { useLocaleStore, useT } from '../../stores/useLocaleStore';
import { useAIConfigStore } from '../../stores/useAIConfigStore';
import { buildPolishPrompt, describeTargetStyle } from '../../services/ai/polishPrompt';
import { acceptRestyleResult, summarizeOutcomes, type RestyleOutcome, type RestyleTarget } from '../../services/ai/restyleService';
import { executeRestyleBatch, restyleContextKey } from '../../services/ai/restyleBatch';
import type { RestylePlan } from '../../services/ai/restyleService';
import { createAIEngineCore } from '../../services/ai/engine/core';
import { assessRestyleTarget, restyleTargetKey, selectRestylePlan } from '../../services/ai/restyleAssessment';
import { executeRestyleTarget, type RestyleProgress } from '../../services/ai/restyleExecutor';
import { executeStructuredEdit } from '../../services/ai/structuredEditExecutor';
import { analyzeScreenModification, buildReviewedModificationRequest, buildModificationReviewReceipt, captureModificationSnapshot, isModificationSnapshotCurrent, getLocalModificationPlan,
  type ModificationMode, type ModificationReviewState, type ModificationSnapshot } from '../../services/ai/modificationReview';
import { ModificationReviewCard } from '../chat/ModificationReviewCard';
import {DesignGuidanceCard} from '../chat/DesignGuidanceCard';
import { buildDesignTaskContract, buildRestyleContract, renderDesignTaskContract } from '../../services/ai/designWorkflow';
import { RestyleDeliveryHistoryPanel } from '../inspector/RestyleDeliveryHistoryPanel';
import {artifactThinkingOptions as restyleThinkingOptions} from '../../services/ai/structuredRequestPolicy';
import {createRestylePatchPlan,RESTYLE_PATCH_THRESHOLD} from '../../services/ai/restylePatches';
import {TaskBudget} from '../../services/ai/taskBudget';
import {createRestyleBudget} from '../../services/ai/taskBudgetPolicy';
import {continuationBindingKey} from '../../services/ai/generationContinuation';
import {screenForAssetAudit} from '../../services/ai/projectAssetIntegrity';
import {prepareStagedMediaAssets} from '../../services/ai/generatedMedia';
import {createProjectStorage} from '../../services/storage/projectStorage';
import {pageCreationContext} from '../../services/ai/pageCreationValidation';

type RestyleBinding=ReturnType<ReturnType<typeof useAIConfigStore.getState>['getActiveProviderForRole']>;
interface RestyleOperation {controller:AbortController;projectKey:string;binding:RestyleBinding;bindingKey:string|null|undefined}
const bindingKey=(binding:RestyleBinding)=>binding?continuationBindingKey({provider:binding.provider,model:binding.modelId}):null;
const projectKey=()=>JSON.stringify([useProjectStore.getState().id,useProjectStore.getState().folderPath]);

/**
 * 批量风格重塑面板 (A3 / T-AE-27)。
 *
 * 用来处理「换主题回溯不到」的那部分：Token 能表达的差异切主题就生效了，
 * 类名选择与 DOM 结构不会回溯（spec §7.3），只能逐页重写。
 *
 * 三条保护是产品上的硬要求，不是可选项：
 *   1. **执行前展示预估消耗**——这是逐页 LLM 调用，用户有权先知道要花多少；
 *   2. **强制单页试跑**——未确认效果前不允许批量，唯一能防止
 *      「花 N 次调用把整个工程改丑」的机制；
 *   3. **结构守卫**——任何一页结构校验不过就跳过，不落盘不打 Checkpoint。
 */
interface RestylePanelProps {
  /** 'all' = 全工程批量重塑；否则为单个画框 id，即「质感润色」(T-AE-26) */
  scope: 'all' | string;
  onClose: () => void;
}

const restyleProgressPhaseKey: Record<RestyleProgress['phase'], `theme.restyleProgress${string}`> = {
  checking: 'theme.restyleProgressChecking',
  waiting: 'theme.restyleProgressWaiting',
  reasoning: 'theme.restyleProgressReasoning',
  receiving: 'theme.restyleProgressReceiving',
  continuing: 'theme.restyleProgressContinuing',
  validating: 'theme.restyleProgressValidating',
  complete: 'theme.restyleProgressComplete',
  failed: 'theme.restyleProgressFailed',
  cancelled: 'theme.restyleProgressCancelled',
};

export const RestylePanel: React.FC<RestylePanelProps> = ({ scope, onClose }) => {
  const t = useT();
  const uiT = (key: Parameters<typeof t>[0], params?: Parameters<typeof t>[1]) =>
    translate(key, params, useLocaleStore.getState().locale);
  const progressPhaseLabel = (phase: RestyleProgress['phase']) =>
    restyleProgressPhaseKey[phase] ? t(restyleProgressPhaseKey[phase]) : phase;
  const { id:projectId,folderPath,deliveryArchiveRevision,deliveryArchiveNotice,designSystem, designSystemOrigin, settings, buildRestylePlan, screens, overrides } = useProjectStore();
  const { getActiveProviderForRole } = useAIConfigStore();
  const contextualGuidance=useRef(useAIConfigStore.getState().autoReferenceDesignRules?{}:undefined).current;

  const isSingle = scope !== 'all';
  // Polish 就是队列只含一项的 Restyle——同一套结构守卫与 Checkpoint 保护
  const basePlan = useMemo(
    () => {
      if (!isSingle) {
        const plan = buildRestylePlan();
        const queue = plan.queue.map(target => target.kind === 'screen' ? { ...target, imported:!!screens[target.id]?.metadata?.importedHtml,html: normalizeMobileNavigation(target.html, settings).html } : target);
        return { ...plan, queue, dryRun: queue[0] ?? null };
      }
      const screen = screens[scope];
      const target: RestyleTarget | null = screen ? { kind: 'screen', id: scope, name: screen.name, imported:!!screen.metadata?.importedHtml, html: normalizeMobileNavigation(screen.htmlContent, settings).html,
        protectedNids: useProjectStore.getState().getProtectedNids(scope) } : null;
      return { queue: target ? [target] : [], dryRun: target, estimatedCalls: target ? 1 : 0, naiveCalls: target ? 1 : 0 };
    },
    [buildRestylePlan, isSingle, scope, screens, overrides, settings.deviceProfile, settings.useCustomNavigation]
  );
  const assessments = useMemo(() => basePlan.queue.map(target => ({target, assessment:assessRestyleTarget(target,{
    scopedCss:target.kind==='screen'?screens[target.id]?.scopedCss:undefined,
    imported:target.kind==='screen'&&Boolean(screens[target.id]?.metadata?.importedHtml),deviceProfile:settings.deviceProfile})})),[basePlan,screens,settings.deviceProfile]);
  const [selection,setSelection]=useState<string[]|null>(null);
  const selected=selection??assessments.filter(a=>a.assessment.recommended&&a.assessment.selectable).map(a=>restyleTargetKey(a.target));
  const plan=isSingle?basePlan:selectRestylePlan(basePlan,selected);
  const requestEstimate=useMemo(()=>plan.queue.reduce((count,target)=>{if(target.html.length<=RESTYLE_PATCH_THRESHOLD)return count+1;try{return count+createRestylePatchPlan(target,settings.deviceProfile).groups.length;}catch{return count;}},0),[basePlan,selected.join('|'),settings.deviceProfile]);
  const [progress,setProgress]=useState<RestyleProgress|null>(null);
  const [phase, setPhase] = useState<'plan' | 'analysis' | 'dryrun' | 'review' | 'batch' | 'done'>('plan');
  const [busy, setBusy] = useState(false);
  const [dryOutcome, setDryOutcome] = useState<RestyleOutcome | null>(null);
  const [outcomes, setOutcomes] = useState<RestyleOutcome[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<ModificationReviewState | null>(null);
  const snapshotRef = useRef<ModificationSnapshot | null>(null);
  const operationRef = useRef<RestyleOperation | null>(null);
  const coreRef = useRef(createAIEngineCore());
  const busyRef = useRef(false);
  const mountedRef = useRef(true);
  const batchSnapshotRef = useRef<{ plan: RestylePlan; key: string; bindingKey:string|null; outcome?: RestyleOutcome } | null>(null);
  const isOwner=(operation:RestyleOperation)=>mountedRef.current&&operationRef.current===operation;
  const isLive=(operation:RestyleOperation)=>isOwner(operation)&&!operation.controller.signal.aborted&&operation.projectKey===projectKey()&&
    (operation.bindingKey===undefined||operation.bindingKey===bindingKey(useAIConfigStore.getState().getActiveProviderForRole('code')));
  const beginOperation=(usesModel=true):RestyleOperation=>{
    const binding=usesModel?useAIConfigStore.getState().getActiveProviderForRole('code'):null;
    const operation={controller:new AbortController(),projectKey:projectKey(),binding,bindingKey:usesModel?bindingKey(binding):undefined};
    operationRef.current=operation;busyRef.current=true;setBusy(true);setProgress(null);return operation;
  };
  const finishOperation=(operation:RestyleOperation)=>{
    if(operationRef.current!==operation)return;operationRef.current=null;busyRef.current=false;if(mountedRef.current)setBusy(false);
  };
  const cancelOperation=()=>{const operation=operationRef.current;operationRef.current=null;busyRef.current=false;operation?.controller.abort();if(mountedRef.current)setBusy(false);};
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current=false;const operation=operationRef.current;operationRef.current=null;busyRef.current=false;operation?.controller.abort(); }; }, []);
  const stop = () => { cancelOperation();setProgress(value=>value?{...value,phase:'cancelled'}:value);setAnalysis(value=>value?.status==='analyzing'?{...value,status:'cancelled',summary:t('theme.restyleAnalysisCancelled')}:value);
    if(phase==='batch'){batchSnapshotRef.current=null;setDryOutcome(null);setPhase('plan');}setError(t('theme.restyleStopped')); };
  const close = () => { cancelOperation();onClose(); };
  const viewKey=JSON.stringify([projectId,folderPath,scope]),viewRef=useRef(viewKey),modelKey=bindingKey(getActiveProviderForRole('code'));
  useEffect(()=>{if(viewRef.current===viewKey)return;viewRef.current=viewKey;cancelOperation();snapshotRef.current=null;batchSnapshotRef.current=null;setAnalysis(null);setProgress(null);setDryOutcome(null);setOutcomes([]);setSelection(null);setPhase('plan');setError(uiT('theme.restyleProjectChanged'));},[viewKey]);
  useEffect(()=>{const operation=operationRef.current;if(operation?.bindingKey!==undefined&&operation.bindingKey!==modelKey){cancelOperation();setProgress(value=>value?{...value,phase:'cancelled'}:value);setAnalysis(value=>value?.status==='analyzing'?{...value,status:'cancelled',summary:uiT('theme.restyleModelChangedAnalysis')}:value);setError(uiT('theme.restyleModelChangedStop'));}
    if(batchSnapshotRef.current&&batchSnapshotRef.current.bindingKey!==modelKey){batchSnapshotRef.current=null;setDryOutcome(null);setPhase('plan');setError(uiT('theme.restyleModelChangedRetry'));}},[modelKey]);

  useEffect(()=>{ if(!busyRef.current){if(batchSnapshotRef.current)setError(uiT('theme.restylePageChanged'));batchSnapshotRef.current=null;setDryOutcome(null);setSelection(null);setPhase('plan'); } },[basePlan,projectId]);
  const changeSelection=(key:string,checked:boolean)=>{
    setSelection(checked?[...selected,key]:selected.filter(id=>id!==key));batchSnapshotRef.current=null;setDryOutcome(null);setPhase('plan');setProgress(null);
  };
  const styleDirective = useMemo(() => describeTargetStyle(designSystem), [designSystem]);

  const taskContract = (target: RestyleTarget, confirmedScope?: string) => {
    const state = useProjectStore.getState();
    const bundle = buildProjectKnowledgeBundle(state, confirmedScope || '仅润色当前页面UI，保留功能结构文案', target.id);
    return buildRestyleContract({
      scope: isSingle ? 'single' : 'batch', target: { id: target.id, name: target.name,
        html: target.kind === 'screen' ? state.screens[target.id]?.htmlContent ?? target.html : state.components[target.id]?.templateHtml ?? target.html },
      deviceProfile: settings.deviceProfile, frameWidth: settings.frameWidth, referenceDeviceName: settings.referenceDevice?.name,
      designSystem, designSystemOrigin, confirmedScope, protectedNids: target.protectedNids,
      knowledgeFingerprint: bundle.fingerprint,
      knowledgeSources: bundle.sources.map(source => ({ kind: source.kind === 'document' ? 'document' : 'page', id: source.id,
        fingerprint: source.fingerprint ?? '', ...(source.stale ? { stale: true } : {}) }))
    });
  };

  const runOne = async (target: RestyleTarget, operation:RestyleOperation,confirmedScope?: string,parentBudget?:TaskBudget): Promise<RestyleOutcome> => {
    if(!isLive(operation))throw Error(t('theme.restyleErrContextStale'));
    const workflowContract = taskContract(target, confirmedScope);
    const binding = operation.binding;
    if (!binding?.provider) return { target, status: 'failed', message: t('theme.restyleErrNoProvider'), workflowContract };

    if (target.kind === 'screen') target = { ...target, html: normalizeMobileNavigation(target.html, settings).html };
    const systemPrompt = `${buildPolishPrompt({
      designSystem,
      deviceProfile: settings.deviceProfile,
      useCustomNavigation: settings.useCustomNavigation,
      frameWidth: settings.frameWidth,
      referenceDevice: settings.referenceDevice,
      viewportGuideHeight: settings.viewportGuideHeight,
      colorMode: settings.colorMode,
      styleDirective: confirmedScope ? `${styleDirective}\n${confirmedScope}` : styleDirective,
      protectedNids: target.protectedNids,
      components: Object.values(useProjectStore.getState().components),
      decisions: Object.values(useProjectStore.getState().decisions).filter(d => d.active && (d.scope === 'global' || d.screenId === target.id))
    })}\n\n${renderDesignTaskContract(workflowContract)}`;

    const projectKnowledge = [referenceDevicePrompt(settings), buildProjectKnowledgeContext(useProjectStore.getState(), confirmedScope || '仅润色当前页面UI，保留功能结构文案', target.id)].join('\n\n');
    const userRequest = confirmedScope
      ? `${renderDesignTaskContract(workflowContract)}\n\n${projectKnowledge}\n\n仅按已确认范围润色，严格保持元素树与文案：\n${target.html}`
      : `${renderDesignTaskContract(workflowContract)}\n\n${projectKnowledge}\n\n重塑以下${target.kind === 'component' ? '组件' : '页面'}：\n\n${target.html}`;
    const budget=parentBudget??createRestyleBudget([target]);
    try {const outcome=await executeRestyleTarget(coreRef.current, { target, contract: workflowContract,taskBudget:budget,
      contextualGuidance,
      quality: { designSystem, deviceProfile: settings.deviceProfile, useCustomNavigation: settings.useCustomNavigation,
        mediaCss:target.kind==='screen'&&useProjectStore.getState().screens[target.id]?screenForAssetAudit(useProjectStore.getState().screens[target.id],useProjectStore.getState().overrides).scopedCss:undefined },
      patchContext:[styleDirective,confirmedScope??'',projectKnowledge].join('\n'),
      colorMode:settings.colorMode,
      onProgress: value => { if(isLive(operation)&&!budget.signal.aborted)setProgress(value); },
      request: { provider: binding.provider, model: binding.modelId, signal: operation.controller.signal, maxTokens: 16384,...restyleThinkingOptions(binding.provider,binding.modelId),
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userRequest }] }
    });if(!isLive(operation))throw Error(t('theme.restyleErrContextStale'));return outcome;}finally {if(!parentBudget)budget.close();}
  };

  const analyzeSingle = async () => {
    if (busyRef.current || !plan.dryRun) return;
    const operation=beginOperation(),controller=operation.controller;setError(null); setPhase('analysis');
    setAnalysis({ status: 'analyzing', summary: t('theme.restyleAnalyzingSummary'), items: [] });
    try {
      const binding = operation.binding;
      if (!binding?.provider || (!binding.provider.apiKey && binding.provider.protocol !== 'ollama_native')) throw new Error(t('theme.restyleErrConfigureProvider'));
      const current = useProjectStore.getState();
      const snapshot = captureModificationSnapshot(current, scope); snapshotRef.current = snapshot;
      const screen = current.screens[scope];
      const request = '分析可改善的视觉表现，仅建议调整已有节点的class；保持元素结构、文案、data-nid不变，不修改带手动样式覆盖的节点。';
      const bundle = buildProjectKnowledgeBundle(current, request, scope);
      const workflowContract = buildDesignTaskContract({ intent:'modify_screen',reviewRequired:true,request,target:screen,
        deviceProfile:current.settings.deviceProfile,frameWidth:current.settings.frameWidth,referenceDeviceName:current.settings.referenceDevice?.name,
        designSystem:{id:current.designSystem.id,name:current.designSystem.name},designSystemOrigin:current.designSystemOrigin,
        protectedNids:current.getProtectedNids(scope),knowledgeFingerprint:bundle.fingerprint,
        knowledgeSources:bundle.sources.map(source=>({kind:source.kind==='document'?'document':'page',id:source.id,fingerprint:source.fingerprint??''})) });
      const result = await analyzeScreenModification(coreRef.current, {
        contextualGuidance,
        onContract:contract=>{if(isLive(operation))setAnalysis(value=>value?{...value,workflowContract:contract}:value);},
        provider: binding.provider, model: binding.modelId, signal: controller.signal, html: screen.htmlContent, name: screen.name,
        request,workflowContract,isCurrent:()=>isLive(operation)&&isModificationSnapshotCurrent(useProjectStore.getState(),snapshot),
        designSystem:current.designSystem, mode: current.settings.colorMode, deviceProfile: current.settings.deviceProfile, useCustomNavigation: current.settings.useCustomNavigation, frameWidth: current.settings.frameWidth,
        protectedNids: current.getProtectedNids(scope), allowText: false,
        projectKnowledge: [referenceDevicePrompt(current.settings), buildProjectKnowledgeContext(current, '仅改善UI视觉表现', scope)].join('\n\n'),
        context: JSON.stringify({ scopedCss: screen.scopedCss, overrides: Object.entries(current.overrides).filter(([key]) => key.startsWith(`${scope}:`)) })
      });
      if (!isModificationSnapshotCurrent(useProjectStore.getState(), snapshot)) throw new Error(t('theme.restyleErrPageChangedReanalyze'));
      if (isLive(operation)) setAnalysis({ ...result, status: 'ready' });
    } catch (e) {
      if (isOwner(operation)&&!controller.signal.aborted) setAnalysis(value=>({...value,status:'error',summary:e instanceof Error?e.message:String(e),items:[]}));
    } finally { finishOperation(operation); }
  };

  const confirmSingle = async (selected: string[], extra: string, mode: ModificationMode = 'page') => {
    if (!analysis || !snapshotRef.current || !plan.dryRun || busyRef.current) return;
    if (!isModificationSnapshotCurrent(useProjectStore.getState(), snapshotRef.current)) {
      setAnalysis({ ...analysis, status: 'error', summary: t('theme.restyleErrPageChangedReanalyze') }); return;
    }
    const local = mode === 'local' ? getLocalModificationPlan(analysis, selected) : null;
    if (mode === 'local' && !local) {
      setAnalysis({ ...analysis, status: 'error', summary: t('theme.restyleErrLocalUnsafe') });
      return;
    }
    const authorizedSelected = mode === 'local' && local ? local.includedIds : selected;
    let request: string, receipt: ReturnType<typeof buildModificationReviewReceipt>;
    try {
      receipt = buildModificationReviewReceipt(analysis, authorizedSelected, extra, useProjectStore.getState().screens[scope]);
      request = buildReviewedModificationRequest(analysis, authorizedSelected, extra);
    } catch (e) { setAnalysis({...analysis,status:'error',summary:e instanceof Error ? e.message : t('theme.restyleErrInvalidEvidence')}); return; }
    const snapshot=snapshotRef.current,operation=beginOperation(mode!=='local'||Boolean(extra.trim()));setError(null);
    try {
      let outcome: RestyleOutcome;
      if (mode === 'region') throw new Error(t('theme.restyleErrRegionNotSupported'));
      if (mode === 'local') {
        let binding: ReturnType<typeof getActiveProviderForRole> | undefined = undefined;
        if (extra.trim()) {
          binding = operation.binding;
          if (!binding?.provider || (!binding.provider.apiKey && binding.provider.protocol !== 'ollama_native')) throw new Error(t('theme.restyleErrConfigureProvider'));
        }
        const current = useProjectStore.getState();
        const candidate = await executeStructuredEdit(coreRef.current,{
          contextualGuidance,
          mode:'local',screen:current.screens[scope],styleOverrides:current.overrides,request,contract:taskContract(plan.dryRun,request),settings:current.settings,
          designSystem:current.designSystem,colorMode:current.settings.colorMode,allowText:false,protectedNids:plan.dryRun.protectedNids,
          binding:binding ? {provider:binding.provider,model:binding.modelId} : undefined,
          local:{...local!,supplement:Boolean(extra.trim())},signal:operation.controller.signal,
          isCurrent:()=>isLive(operation)&&isModificationSnapshotCurrent(useProjectStore.getState(),snapshot),
          projectKnowledge:[referenceDevicePrompt(current.settings),buildProjectKnowledgeContext(current,request,scope)].join('\n\n')
        });
        if(candidate.status!=='ready')throw new Error(candidate.message);
        outcome = acceptRestyleResult(plan.dryRun,candidate.html,{designSystem,deviceProfile:settings.deviceProfile,useCustomNavigation:settings.useCustomNavigation},candidate.contract);
        outcome.executionRecord=candidate.executionRecord;
      } else outcome = await runOne(plan.dryRun,operation,request);
      if (outcome.workflowContract) outcome.workflowContract = {...outcome.workflowContract,modificationReview:receipt};
      if (!isLive(operation)) return;
      if (!isModificationSnapshotCurrent(useProjectStore.getState(), snapshot)) throw new Error(t('theme.restyleErrChangedDuringGen'));
      if (outcome.status !== 'applied' || !outcome.html) throw new Error(outcome.message || t('theme.restyleErrStructureRejected'));
      const latest=useProjectStore.getState(),stageContext=pageCreationContext(latest);
      const preparedHtml=await prepareStagedMediaAssets({
        html:outcome.html,
        scopedCss:latest.screens[scope]?.scopedCss,
        storage:createProjectStorage(latest.id,latest.folderPath),
        assets:Object.values(latest.assets),
        signal:operation.controller.signal,
        isCurrent:()=>isLive(operation)&&isModificationSnapshotCurrent(useProjectStore.getState(),snapshot)&&pageCreationContext(useProjectStore.getState())===stageContext,
        register:assets=>useProjectStore.getState().registerGeneratedAssets(assets,latest.id,stageContext)
      });
      useProjectStore.getState().stageScreenChange(scope, preparedHtml, `${plan.dryRun.name}（润色候选）`, request, outcome.workflowContract, outcome.executionRecord);
      useProjectStore.getState().panToScreen(scope); onClose();
    } catch (e) { if (isOwner(operation)&&!operation.controller.signal.aborted) setError(e instanceof Error ? e.message : String(e)); }
    finally { finishOperation(operation); }
  };

  const doDryRun = async () => {
    if (!plan.dryRun || busyRef.current) return;
    const operation=beginOperation();
    setError(null);
    setDryOutcome(null);
    const snapshot = { plan: structuredClone(plan), key: restyleContextKey(useProjectStore.getState()),bindingKey:bindingKey(operation.binding), outcome: undefined as RestyleOutcome | undefined };
    batchSnapshotRef.current = snapshot;
    try {
      const o = await runOne(snapshot.plan.dryRun!,operation);
      if (!isLive(operation)) return;
      if (restyleContextKey(useProjectStore.getState()) !== snapshot.key) throw new Error(t('theme.restyleErrDryRunContextChanged'));
      snapshot.outcome = structuredClone(o);
      setDryOutcome(o);
      setPhase('review');
    } catch (e) {
      if (isOwner(operation)&&!operation.controller.signal.aborted) setError(e instanceof Error ? e.message : String(e));
    } finally {
      finishOperation(operation);
    }
  };

  const doBatch = async () => {
    const snapshot = batchSnapshotRef.current;
    if (busyRef.current || !snapshot?.outcome || snapshot.outcome.status !== 'applied') return;
    if(snapshot.bindingKey!==bindingKey(useAIConfigStore.getState().getActiveProviderForRole('code'))){setError(t('theme.restyleModelChangedDryRun'));return;}
    const operation=beginOperation(),controller=operation.controller;
    setPhase('batch');
    setOutcomes([]); setError(null);
    try {
      const result = await executeRestyleBatch({ plan: snapshot.plan, dryRun: snapshot.outcome, confirmedContextKey: snapshot.key,
        getContextKey: () => isLive(operation)?restyleContextKey(useProjectStore.getState()):'operation-stale', signal: controller.signal,
        resolveTarget: target => {
          const state = useProjectStore.getState();
          const html = target.kind === 'component' ? state.components[target.id]?.templateHtml : state.screens[target.id]?.htmlContent;
          return html === undefined ? null : { ...target,
            html: target.kind === 'screen' ? normalizeMobileNavigation(html, state.settings).html : html,
            protectedNids: target.kind === 'screen' ? state.getProtectedNids(target.id) : target.protectedNids };
        }, generate: (target,budget) => runOne(target,operation,undefined,budget), apply: (outcome,lifetime) => useProjectStore.getState().applyRestyleOutcome(outcome,lifetime.signal,()=>isLive(operation)&&lifetime.isCurrent(),lifetime.onCommitted),
        onProgress: results => { if (isLive(operation)) setOutcomes(results); }
      });
      if (isLive(operation)) {
        setOutcomes(result.outcomes); setPhase('done');
        if (result.message) setError(t('theme.restyleBatchPartial', { message: result.message, remaining: result.remaining }));
      }
    } catch (error) {
      if (isOwner(operation)&&!controller.signal.aborted) { setError(error instanceof Error ? error.message : String(error)); setPhase('done'); }
    } finally { finishOperation(operation); }
  };

  const summary = outcomes.length > 0 ? summarizeOutcomes(outcomes) : null;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-6">
      <div className="bg-host-chrome text-host-primary border border-host-border-strong rounded-xl shadow-2xl w-full max-w-2xl max-h-full flex flex-col overflow-hidden">
        <div className="p-4 border-b border-host-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-host-brand" />
            <div>
              <h2 className="text-host-primary font-semibold text-sm">
                {isSingle ? t('theme.restylePolishTitle') : t('theme.restyleBatchTitle')}
              </h2>
              <p className="text-host-secondary text-xs mt-0.5">
                {isSingle ? t('theme.restylePolishHint') : t('theme.restyleBatchHint')}
              </p>
            </div>
          </div>
          <button onClick={close} aria-label={busy ? t('theme.restyleStopClose') : t('theme.restyleClose')} className="text-host-secondary hover:text-host-primary p-1">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3 overflow-y-auto text-xs">
          {/* 预估消耗：执行前必须让用户知道要花多少 */}
          <div className="p-3 bg-host-sunken border border-host-border rounded-xl space-y-2">
            <div className="flex items-center justify-between text-host-primary">
              <span className="font-semibold">{t('theme.restylePlan')}</span>
              <span className="text-host-secondary">
                {t('theme.restyleEstimateCalls', { count: requestEstimate + (isSingle ? 1 : 0) })}
                {isSingle && t('theme.restyleEstimateSingleExtra')}
              </span>
            </div>
            <div className="text-host-tertiary leading-relaxed">
              {t('theme.restyleQueue', {
                components: plan.queue.filter((item) => item.kind === 'component').length,
                screens: plan.queue.filter((item) => item.kind === 'screen').length,
              })}
              {plan.queue.some((item) => (item.protectedNids?.length ?? 0) > 0) && t('theme.restyleQueueProtected')}
              {plan.naiveCalls > plan.estimatedCalls &&
                t('theme.restyleQueueSavings', { saved: plan.naiveCalls - plan.estimatedCalls })}
            </div>
          </div>

          {!isSingle && <div className="space-y-2 text-host-secondary">
            <p>
              {t('theme.restylePreflight', {
                recommended: assessments.filter((a) => a.assessment.recommended).length,
                deselected: basePlan.queue.length - plan.queue.length,
              })}
            </p>
            {assessments.map(({target,assessment})=><label key={restyleTargetKey(target)} className="flex gap-2 items-start">
              <input type="checkbox" disabled={busy||!assessment.selectable} checked={selected.includes(restyleTargetKey(target))}
                onChange={event=>changeSelection(restyleTargetKey(target),event.target.checked)}/>
              <span>{target.name}：{userFacingMessage(assessment.reason)}</span>
            </label>)}
          </div>}
          {progress && <div role="status" className="p-3 bg-host-sunken border border-host-border rounded-xl text-host-primary space-y-1">
            <p>{progress.targetName} · {progressPhaseLabel(progress.phase)}</p>
            <p>{progress.provider} / {progress.model}</p>
            <p>
              {t('theme.restyleProgressTiming', {
                elapsed: Math.floor(progress.elapsedMs / 1000),
                idle: Math.floor(progress.idleMs / 1000),
              })}
            </p>
            <p>
              {t('theme.restyleProgressStats', {
                text: progress.textChars,
                reasoning: progress.reasoningChars,
                continuations: progress.continuationCount,
              })}
            </p>
            {progress.patchGroups && (
              <p className="text-host-brand">
                {t('theme.restyleProgressPatch', {
                  current: progress.patchGroup ?? 0,
                  total: progress.patchGroups,
                  requests: progress.requestCount ?? 0,
                })}
              </p>
            )}
          </div>}
          {phase === 'plan' && (
            <div className="p-3 bg-amber-950/30 border border-amber-800/40 rounded-xl text-amber-200 flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-host-warning" />
              <span className="leading-relaxed">
                {t(isSingle ? 'theme.restylePlanWarnSingle' : 'theme.restylePlanWarnBatch', {
                  name: plan.dryRun?.name ?? '—',
                })}
              </span>
            </div>
          )}

          {phase === 'analysis' && analysis && <DesignGuidanceCard contract={analysis.workflowContract} />}
          {phase === 'analysis' && analysis && <ModificationReviewCard review={analysis} disabled={busy}
            onConfirm={confirmSingle} onCancel={onClose} onRetry={analyzeSingle} />}

          {phase === 'review' && dryOutcome && (
            <div className="p-3 bg-host-sunken border border-host-border rounded-xl space-y-2">
              <div className="font-semibold text-host-primary">
                {t('theme.restyleDryRunResult', { name: dryOutcome.target.name })}
              </div>
              <DesignGuidanceCard contract={dryOutcome.workflowContract} />
              {dryOutcome.status === 'applied' ? (
                <>
                  <div className="flex items-center gap-1.5 text-host-success">
                    <Check className="w-3 h-3" />
                    <span>{t('theme.restyleStructurePassed')}</span>
                  </div>
                  {dryOutcome.message && <div className="text-host-warning"><UserFacingNotice message={dryOutcome.message??''}/></div>}
                  <pre className="max-h-40 overflow-auto bg-host-elevated p-2 rounded-lg text-[10px] text-host-secondary whitespace-pre-wrap">
                    {dryOutcome.html?.slice(0, 800)}
                  </pre>
                </>
              ) : dryOutcome.status==='skipped_unchanged' ? <div className="text-host-primary"><UserFacingNotice message={dryOutcome.message??''}/></div> : (
                <div className="text-host-danger leading-relaxed">
                  <UserFacingNotice message={dryOutcome.message ?? t('theme.restyleDryRunFailedShort')} />
                  <div className="text-host-tertiary mt-1">{t('theme.restyleResultRejected')}</div>
                </div>
              )}
            </div>
          )}

          {(phase === 'batch' || phase === 'done') && (
            <div className="p-3 bg-host-sunken border border-host-border rounded-xl space-y-1.5">
              <div className="font-semibold text-host-primary">
                {t('theme.restyleBatchProgress', {
                  done: outcomes.length,
                  total: batchSnapshotRef.current?.plan.queue.length ?? plan.queue.length,
                })}
              </div>
              {summary && (
                <div className="text-host-secondary leading-relaxed">
                  {t('theme.restyleBatchSummary', {
                    applied: summary.applied,
                    unchanged: summary.unchanged,
                    structureRejected: summary.structureRejected,
                    conflicts: summary.conflicts,
                    failed: summary.failed,
                  })}
                  {summary.textDrift > 0 && t('theme.restyleBatchSummaryTextDrift', { count: summary.textDrift })}
                </div>
              )}
              {summary?.details.map((d, i) => (
                <div key={i} className="text-host-warning">• {d}</div>
              ))}
              {outcomes.filter(outcome => outcome.validation).map(outcome => (
                <details key={`${outcome.target.kind}:${outcome.target.id}`} className="border-t border-host-border pt-2 text-host-secondary">
                  <summary className="cursor-pointer">
                    {outcome.target.name} · {t('theme.restyleAcceptance')}
                    {outcome.validation!.status === 'passed'
                      ? t('theme.restyleValidationPass')
                      : t('theme.restyleValidationFail')}
                  </summary>
                  {outcome.validation!.message && <div className="mt-1 text-host-warning"><UserFacingNotice message={outcome.validation!.message}/></div>}
                  {outcome.delivery && (
                    <p className="mt-1 text-host-tertiary">
                      {outcome.delivery.message ?? t('theme.restyleDeliverySaved')}
                    </p>
                  )}
                  {outcome.validation!.pages.map(page => <div key={page.id} className="mt-1">
                    <p>
                      {page.name}：
                      {page.render?.status === 'complete'
                        ? t('theme.restyleRenderChecked', { count: page.render.inspected })
                        : page.render?.reason ?? t('theme.restyleRenderIncomplete')}
                    </p>
                    {page.render?.findings.map((finding,index) => <div key={index} className="text-host-warning"><UserFacingNotice message={finding.message}/></div>)}
                  </div>)}
                </details>
              ))}
            </div>
          )}

          {error && <div className="text-host-danger"><UserFacingNotice message={error}/></div>}
          {!isSingle && <RestyleDeliveryHistoryPanel projectId={projectId} folderPath={folderPath} revision={deliveryArchiveRevision} notice={deliveryArchiveNotice}/>}
        </div>

        <div className="p-4 border-t border-host-border flex items-center justify-end gap-2">
          {busy && <button onClick={stop} className="px-3 py-1.5 text-host-warning text-xs">{t('theme.restyleStop')}</button>}
          <button onClick={close} className="px-3 py-1.5 text-host-secondary hover:text-host-primary text-xs">
            {phase === 'done' ? t('common.done') : busy ? t('theme.restyleStopClose') : t('theme.restyleClose')}
          </button>
          {phase === 'plan' && (
            <button
              onClick={isSingle ? analyzeSingle : doDryRun}
              disabled={busy || !plan.dryRun}
              className="px-4 py-1.5 bg-host-accent hover:bg-host-accent-hover disabled:opacity-40 text-host-on-accent text-xs font-medium rounded-lg flex items-center gap-1.5"
            >
              {busy && <Loader2 className="w-3 h-3 animate-spin" />}
              {isSingle ? t('theme.restyleAnalyze') : t('theme.restyleDryRun')}
            </button>
          )}
          {phase === 'review' && (
            <>
              <button onClick={() => { batchSnapshotRef.current = null; setPhase('plan'); }} disabled={busy} className="px-3 py-1.5 bg-host-elevated hover:bg-host-dialog border border-host-border text-host-primary text-xs rounded-lg disabled:opacity-40">
                {t('theme.restyleRetryDry')}
              </button>
              <button
                onClick={doBatch}
                disabled={busy || dryOutcome?.status !== 'applied'}
                title={dryOutcome?.status !== 'applied' ? t('theme.restyleDryRunFailed') : undefined}
                className="px-4 py-1.5 bg-host-accent hover:bg-host-accent-hover disabled:opacity-40 text-host-on-accent text-xs font-medium rounded-lg"
              >
                {t('theme.restyleConfirmBatch', {
                  count: (batchSnapshotRef.current?.plan.queue.length ?? plan.queue.length) - 1,
                })}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
