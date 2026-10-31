import { referenceDevicePrompt } from '../../utils/referenceDevice';
import { normalizeMobileNavigation } from '../../utils/mobileNavigation';
import { buildProjectKnowledgeBundle, buildProjectKnowledgeContext } from '../../services/ai/projectKnowledge';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, Loader2, Sparkles, X } from 'lucide-react';
import { useProjectStore } from '../../stores/useProjectStore';
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
import {restyleThinkingOptions} from '../../services/ai/thinkingPolicy';
import {createRestylePatchPlan,RESTYLE_PATCH_THRESHOLD} from '../../services/ai/restylePatches';
import {TaskBudget} from '../../services/ai/taskBudget';
import {createRestyleBudget} from '../../services/ai/taskBudgetPolicy';
import {continuationBindingKey} from '../../services/ai/generationContinuation';

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

export const RestylePanel: React.FC<RestylePanelProps> = ({ scope, onClose }) => {
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
  const stop = () => { cancelOperation();setProgress(value=>value?{...value,phase:'cancelled'}:value);setAnalysis(value=>value?.status==='analyzing'?{...value,status:'cancelled',summary:'分析已停止，原页面未修改。'}:value);
    if(phase==='batch'){batchSnapshotRef.current=null;setDryOutcome(null);setPhase('plan');}setError('重塑已停止；未应用的页面保持原样，已应用项可撤销。'); };
  const close = () => { cancelOperation();onClose(); };
  const viewKey=JSON.stringify([projectId,folderPath,scope]),viewRef=useRef(viewKey),modelKey=bindingKey(getActiveProviderForRole('code'));
  useEffect(()=>{if(viewRef.current===viewKey)return;viewRef.current=viewKey;cancelOperation();snapshotRef.current=null;batchSnapshotRef.current=null;setAnalysis(null);setProgress(null);setDryOutcome(null);setOutcomes([]);setSelection(null);setPhase('plan');setError('工程或目标已变化，旧任务已停止，请重新试跑。');},[viewKey]);
  useEffect(()=>{const operation=operationRef.current;if(operation?.bindingKey!==undefined&&operation.bindingKey!==modelKey){cancelOperation();setProgress(value=>value?{...value,phase:'cancelled'}:value);setAnalysis(value=>value?.status==='analyzing'?{...value,status:'cancelled',summary:'模型已变化，请重新分析。'}:value);setError('模型已变化，旧任务已停止，请重新分析或试跑。');}
    if(batchSnapshotRef.current&&batchSnapshotRef.current.bindingKey!==modelKey){batchSnapshotRef.current=null;setDryOutcome(null);setPhase('plan');setError('模型已变化，请重新试跑后确认。');}},[modelKey]);

  useEffect(()=>{ if(!busyRef.current){if(batchSnapshotRef.current)setError('页面或工程已变化，请重新试跑。');batchSnapshotRef.current=null;setDryOutcome(null);setSelection(null);setPhase('plan'); } },[basePlan,projectId]);
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
    if(!isLive(operation))throw Error('工程、目标或模型已变化，未采用旧重塑结果。');
    const workflowContract = taskContract(target, confirmedScope);
    const binding = operation.binding;
    if (!binding?.provider) return { target, status: 'failed', message: '未配置可用的 AI Provider', workflowContract };

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
      quality: { designSystem, deviceProfile: settings.deviceProfile, useCustomNavigation: settings.useCustomNavigation },
      patchContext:[styleDirective,confirmedScope??'',projectKnowledge].join('\n'),
      colorMode:settings.colorMode,
      onProgress: value => { if(isLive(operation))setProgress(value); },
      request: { provider: binding.provider, model: binding.modelId, signal: operation.controller.signal, maxTokens: 16384,...restyleThinkingOptions(binding.provider,binding.modelId),
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userRequest }] }
    });if(!isLive(operation))throw Error('工程、目标或模型已变化，未采用旧重塑结果。');return outcome;}finally {if(!parentBudget)budget.close();}
  };

  const analyzeSingle = async () => {
    if (busyRef.current || !plan.dryRun) return;
    const operation=beginOperation(),controller=operation.controller;setError(null); setPhase('analysis');
    setAnalysis({ status: 'analyzing', summary: '正在分析原页面的布局、配色和组件表现。', items: [] });
    try {
      const binding = operation.binding;
      if (!binding?.provider || (!binding.provider.apiKey && binding.provider.protocol !== 'ollama_native')) throw new Error('请先配置可用的 AI Provider。');
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
      if (!isModificationSnapshotCurrent(useProjectStore.getState(), snapshot)) throw new Error('原页面或工程已变化，请重新分析。');
      if (isLive(operation)) setAnalysis({ ...result, status: 'ready' });
    } catch (e) {
      if (isOwner(operation)&&!controller.signal.aborted) setAnalysis(value=>({...value,status:'error',summary:e instanceof Error?e.message:String(e),items:[]}));
    } finally { finishOperation(operation); }
  };

  const confirmSingle = async (selected: string[], extra: string, mode: ModificationMode = 'page') => {
    if (!analysis || !snapshotRef.current || !plan.dryRun || busyRef.current) return;
    if (!isModificationSnapshotCurrent(useProjectStore.getState(), snapshotRef.current)) {
      setAnalysis({ ...analysis, status: 'error', summary: '原页面或工程已变化，请重新分析。' }); return;
    }
    let request: string, receipt: ReturnType<typeof buildModificationReviewReceipt>;
    try {
      receipt = buildModificationReviewReceipt(analysis, selected, extra, useProjectStore.getState().screens[scope]);
      request = buildReviewedModificationRequest(analysis, selected, extra);
    } catch (e) { setAnalysis({...analysis,status:'error',summary:e instanceof Error ? e.message : '分析证据无效，请重新分析。'}); return; }
    const snapshot=snapshotRef.current,operation=beginOperation(mode!=='local'||Boolean(extra.trim()));setError(null);
    try {
      let outcome: RestyleOutcome;
      if (mode === 'region') throw new Error('纯润色不支持区块结构修改，请选择局部操作或整页润色。');
      if (mode === 'local') {
        const local = getLocalModificationPlan(analysis, selected);
        if (!local) throw new Error('当前选择不能安全局部修改，请重新分析。');
        let binding: ReturnType<typeof getActiveProviderForRole> | undefined = undefined;
        if (extra.trim()) {
          binding = operation.binding;
          if (!binding?.provider || (!binding.provider.apiKey && binding.provider.protocol !== 'ollama_native')) throw new Error('请先配置可用的 AI Provider。');
        }
        const current = useProjectStore.getState();
        const candidate = await executeStructuredEdit(coreRef.current,{
          contextualGuidance,
          mode:'local',screen:current.screens[scope],request,contract:taskContract(plan.dryRun,request),settings:current.settings,
          designSystem:current.designSystem,colorMode:current.settings.colorMode,allowText:false,protectedNids:plan.dryRun.protectedNids,
          binding:binding ? {provider:binding.provider,model:binding.modelId} : undefined,
          local:{...local,supplement:Boolean(extra.trim())},signal:operation.controller.signal,
          isCurrent:()=>isLive(operation)&&isModificationSnapshotCurrent(useProjectStore.getState(),snapshot),
          projectKnowledge:[referenceDevicePrompt(current.settings),buildProjectKnowledgeContext(current,request,scope)].join('\n\n')
        });
        if(candidate.status!=='ready')throw new Error(candidate.message);
        outcome = acceptRestyleResult(plan.dryRun,candidate.html,{designSystem,deviceProfile:settings.deviceProfile,useCustomNavigation:settings.useCustomNavigation},candidate.contract);
        outcome.executionRecord=candidate.executionRecord;
      } else outcome = await runOne(plan.dryRun,operation,request);
      if (outcome.workflowContract) outcome.workflowContract = {...outcome.workflowContract,modificationReview:receipt};
      if (!isLive(operation)) return;
      if (!isModificationSnapshotCurrent(useProjectStore.getState(), snapshot)) throw new Error('生成期间原页面或工程已变化，请重新分析。');
      if (outcome.status !== 'applied' || !outcome.html) throw new Error(outcome.message || '结构校验未通过，未修改原页面。');
      useProjectStore.getState().stageScreenChange(scope, outcome.html, `${plan.dryRun.name}（润色候选）`, request, outcome.workflowContract, outcome.executionRecord);
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
      if (restyleContextKey(useProjectStore.getState()) !== snapshot.key) throw new Error('试跑期间工程已变化，请重新试跑。');
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
    if(snapshot.bindingKey!==bindingKey(useAIConfigStore.getState().getActiveProviderForRole('code'))){setError('模型已变化，请重新试跑。');return;}
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
        }, generate: (target,budget) => runOne(target,operation,undefined,budget), apply: outcome => useProjectStore.getState().applyRestyleOutcome(outcome,controller.signal,()=>isLive(operation)),
        onProgress: results => { if (isLive(operation)) setOutcomes(results); }
      });
      if (isLive(operation)) {
        setOutcomes(result.outcomes); setPhase('done');
        if (result.message) setError(`${result.message} 剩余 ${result.remaining} 项未执行。`);
      }
    } catch (error) {
      if (isOwner(operation)&&!controller.signal.aborted) { setError(error instanceof Error ? error.message : String(error)); setPhase('done'); }
    } finally { finishOperation(operation); }
  };

  const summary = outcomes.length > 0 ? summarizeOutcomes(outcomes) : null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 flex items-center justify-center p-6">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-full flex flex-col overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-blue-400" />
            <div>
              <h2 className="text-slate-100 font-semibold text-sm">
                {isSingle ? 'AI 质感润色' : '批量风格重塑'}
              </h2>
              <p className="text-slate-400 text-xs mt-0.5">
                {isSingle
                  ? '先分析并选择修改项，再生成候选方案对比'
                  : '把当前设计风格应用到已有页面中「换主题回溯不到」的部分'}
              </p>
            </div>
          </div>
          <button onClick={close} aria-label={busy ? '停止并关闭重塑' : '关闭重塑'} className="text-slate-400 hover:text-slate-200 p-1">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3 overflow-y-auto text-xs">
          {/* 预估消耗：执行前必须让用户知道要花多少 */}
          <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
            <div className="flex items-center justify-between text-slate-300">
              <span className="font-semibold">执行计划</span>
              <span className="text-slate-400">
                预计 <span className="text-blue-400 font-semibold">{requestEstimate + (isSingle ? 1 : 0)}</span> 次 AI 调用
                {isSingle && '（分析 + 生成）'}
              </span>
            </div>
            <div className="text-slate-500 leading-relaxed">
              队列：{plan.queue.filter((t) => t.kind === 'component').length} 个组件 +{' '}
              {plan.queue.filter((t) => t.kind === 'screen').length} 个画框。
              {plan.queue.some((t) => (t.protectedNids?.length ?? 0) > 0) && (
                <> 含手动样式覆盖的节点将保持不动（被 !important 挡住，改了也不生效）。</>
              )}
              {plan.naiveCalls > plan.estimatedCalls && (
                <>
                  {' '}
                  组件优先策略已省下 <span className="text-emerald-400">{plan.naiveCalls - plan.estimatedCalls}</span> 次调用
                  （组件只改定义，再走实例同步下发）。
                </>
              )}
            </div>
          </div>

          {!isSingle && <div className="space-y-2 text-slate-400">
            <p>本地预检：推荐 {assessments.filter(a=>a.assessment.recommended).length} 项，未选 {basePlan.queue.length-plan.queue.length} 项。仅检查主题绑定，不代表视觉美感已验证。</p>
            {assessments.map(({target,assessment})=><label key={restyleTargetKey(target)} className="flex gap-2 items-start">
              <input type="checkbox" disabled={busy||!assessment.selectable} checked={selected.includes(restyleTargetKey(target))}
                onChange={event=>changeSelection(restyleTargetKey(target),event.target.checked)}/>
              <span>{target.name}：{assessment.reason}</span>
            </label>)}
          </div>}
          {progress && <div role="status" className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-slate-300 space-y-1">
            <p>{progress.targetName} · {{checking:'检查目标',waiting:'等待模型',reasoning:'接收推理',receiving:'接收正文',continuing:'续写',validating:'校验',complete:'完成',failed:'失败',cancelled:'已取消'}[progress.phase]}</p>
            <p>{progress.provider} / {progress.model}</p>
            <p>耗时 {Math.floor(progress.elapsedMs/1000)} 秒 · 距最近活动 {Math.floor(progress.idleMs/1000)} 秒</p>
            <p>正文 {progress.textChars} 字符 · 推理 {progress.reasoningChars} 字符 · 续写 {progress.continuationCount} 次</p>
            {progress.patchGroups&&<p className="text-blue-300">样式补丁 {progress.patchGroup??0}/{progress.patchGroups} 组 · 已请求 {progress.requestCount??0} 次 · 保留原HTML，仅合并样式</p>}
          </div>}
          {phase === 'plan' && (
            <div className="p-3 bg-amber-950/30 border border-amber-800/40 rounded-xl text-amber-200 flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-400" />
              <span className="leading-relaxed">
                {isSingle ? (
                  <>
                    先分析「{plan.dryRun?.name ?? '—'}」，由你勾选改进项或补充要求，再调用一次生成候选。
                    结构校验通过后进入新旧对比，确认采纳前原页面保持不变。
                  </>
                ) : (
                  <>
                    将先对「{plan.dryRun?.name ?? '—'}」单独试跑一次供你确认效果，确认后才会批量执行。
                    应用前会检查实际渲染、资源与结构；组件会同时检查受影响页面。通过后创建备份，可通过撤销回退。
                  </>
                )}
              </span>
            </div>
          )}

          {phase === 'analysis' && analysis && <DesignGuidanceCard contract={analysis.workflowContract} />}
          {phase === 'analysis' && analysis && <ModificationReviewCard review={analysis} disabled={busy}
            onConfirm={confirmSingle} onCancel={onClose} onRetry={analyzeSingle} />}

          {phase === 'review' && dryOutcome && (
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
              <div className="font-semibold text-slate-200">试跑结果：{dryOutcome.target.name}</div>
              <DesignGuidanceCard contract={dryOutcome.workflowContract} />
              {dryOutcome.status === 'applied' ? (
                <>
                  <div className="flex items-center gap-1.5 text-emerald-400">
                    <Check className="w-3 h-3" />
                    <span>结构校验通过（节点增删为 0）</span>
                  </div>
                  {dryOutcome.message && <div className="text-amber-300">{dryOutcome.message}</div>}
                  <pre className="max-h-40 overflow-auto bg-slate-900 p-2 rounded-lg text-[10px] text-slate-400 whitespace-pre-wrap">
                    {dryOutcome.html?.slice(0, 800)}
                  </pre>
                </>
              ) : dryOutcome.status==='skipped_unchanged' ? <p className="text-slate-300">{dryOutcome.message}</p> : (
                <div className="text-rose-400 leading-relaxed">
                  {dryOutcome.message ?? '试跑未通过'}
                  <div className="text-slate-500 mt-1">结果已被拒绝，未做任何改动。</div>
                </div>
              )}
            </div>
          )}

          {(phase === 'batch' || phase === 'done') && (
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1.5">
              <div className="font-semibold text-slate-200">
                执行进度 {outcomes.length} / {batchSnapshotRef.current?.plan.queue.length ?? plan.queue.length}
              </div>
              {summary && (
                <div className="text-slate-400 leading-relaxed">
                  已应用 {summary.applied}，无需修改 {summary.unchanged}，结构被拒 {summary.structureRejected}，冲突跳过 {summary.conflicts}，失败 {summary.failed}
                  {summary.textDrift > 0 && `，${summary.textDrift} 处文案变化待核对`}
                </div>
              )}
              {summary?.details.map((d, i) => (
                <div key={i} className="text-amber-300/90">• {d}</div>
              ))}
              {outcomes.filter(outcome => outcome.validation).map(outcome => (
                <details key={`${outcome.target.kind}:${outcome.target.id}`} className="border-t border-slate-800 pt-2 text-slate-400">
                  <summary className="cursor-pointer">{outcome.target.name} · 验收{outcome.validation!.status === 'passed' ? '通过' : '未通过'}</summary>
                  {outcome.validation!.message && <p className="mt-1 text-amber-300">{outcome.validation!.message}</p>}
                  {outcome.delivery && <p className="mt-1 text-slate-500">{outcome.delivery.message ?? '交付档案已保存，可在重塑交付历史中查看。'}</p>}
                  {outcome.validation!.pages.map(page => <div key={page.id} className="mt-1">
                    <p>{page.name}：{page.render?.status === 'complete' ? `已检查 ${page.render.inspected} 个可见节点` : page.render?.reason ?? '未完成渲染检查'}</p>
                    {page.render?.findings.map((finding,index) => <p key={index} className="text-amber-300">{finding.message}</p>)}
                  </div>)}
                </details>
              ))}
            </div>
          )}

          {error && <div className="text-rose-400">{error}</div>}
          {!isSingle && <RestyleDeliveryHistoryPanel projectId={projectId} folderPath={folderPath} revision={deliveryArchiveRevision} notice={deliveryArchiveNotice}/>}
        </div>

        <div className="p-4 border-t border-slate-800 flex items-center justify-end gap-2">
          {busy && <button onClick={stop} className="px-3 py-1.5 text-amber-300 text-xs">停止重塑</button>}
          <button onClick={close} className="px-3 py-1.5 text-slate-300 hover:text-slate-100 text-xs">
            {phase === 'done' ? '完成' : busy ? '停止并关闭' : '取消'}
          </button>
          {phase === 'plan' && (
            <button
              onClick={isSingle ? analyzeSingle : doDryRun}
              disabled={busy || !plan.dryRun}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-medium rounded-lg flex items-center gap-1.5"
            >
              {busy && <Loader2 className="w-3 h-3 animate-spin" />}
              {isSingle ? '分析原页面' : '试跑单个目标'}
            </button>
          )}
          {phase === 'review' && (
            <>
              <button onClick={() => { batchSnapshotRef.current = null; setPhase('plan'); }} disabled={busy} className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded-lg disabled:opacity-40">
                重新试跑
              </button>
              <button
                onClick={doBatch}
                disabled={busy || dryOutcome?.status !== 'applied'}
                title={dryOutcome?.status !== 'applied' ? '试跑未通过，不能批量执行' : undefined}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-medium rounded-lg"
              >
                确认效果，批量执行剩余 {(batchSnapshotRef.current?.plan.queue.length ?? plan.queue.length) - 1} 项
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
