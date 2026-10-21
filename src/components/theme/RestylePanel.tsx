import { referenceDevicePrompt } from '../../utils/referenceDevice';
import { normalizeMobileNavigation } from '../../utils/mobileNavigation';
import { buildProjectKnowledgeContext } from '../../services/ai/projectKnowledge';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, Loader2, Sparkles, X } from 'lucide-react';
import { useProjectStore } from '../../stores/useProjectStore';
import { useAIConfigStore } from '../../stores/useAIConfigStore';
import { AIService } from '../../services/ai/aiService';
import { buildPolishPrompt, describeTargetStyle } from '../../services/ai/polishPrompt';
import { acceptRestyleResult, summarizeOutcomes, type RestyleOutcome, type RestyleTarget } from '../../services/ai/restyleService';
import { useHistoryStore } from '../../stores/useHistoryStore';
import { createAIEngineCore } from '../../services/ai/engine/core';
import { analyzeScreenModification, buildReviewedModificationRequest, captureModificationSnapshot, isModificationSnapshotCurrent, getLocalModificationPlan,
  type ModificationMode, type ModificationReviewState, type ModificationSnapshot } from '../../services/ai/modificationReview';
import { applyLocalCopyEdits, generateSupplementedLocalEdits, mergeLocalEditOperations } from '../../services/ai/localCopyModification';
import { ModificationReviewCard } from '../chat/ModificationReviewCard';

/** 从流式输出中提取 ```html 代码块 */
function extractHtml(raw: string): string | null {
  const m = /```html\s*([\s\S]*?)```/i.exec(raw) ?? /```\s*([\s\S]*?)```/.exec(raw);
  const body = (m ? m[1] : raw).trim();
  return body.startsWith('<') ? body : null;
}

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
  const { designSystem, settings, buildRestylePlan, applyRestyleOutcome, screens, overrides } = useProjectStore();
  const { getActiveProviderForRole } = useAIConfigStore();
  const addCheckpoint = useHistoryStore((s) => s.addCheckpoint);

  const isSingle = scope !== 'all';
  // Polish 就是队列只含一项的 Restyle——同一套结构守卫与 Checkpoint 保护
  const plan = useMemo(
    () => {
      if (!isSingle) {
        const plan = buildRestylePlan();
        const queue = plan.queue.map(target => target.kind === 'screen' ? { ...target, html: normalizeMobileNavigation(target.html, settings).html } : target);
        return { ...plan, queue, dryRun: queue[0] ?? null };
      }
      const screen = screens[scope];
      const target: RestyleTarget | null = screen ? { kind: 'screen', id: scope, name: screen.name, html: normalizeMobileNavigation(screen.htmlContent, settings).html,
        protectedNids: useProjectStore.getState().getProtectedNids(scope) } : null;
      return { queue: target ? [target] : [], dryRun: target, estimatedCalls: target ? 1 : 0, naiveCalls: target ? 1 : 0 };
    },
    [buildRestylePlan, isSingle, scope, screens, overrides, settings.deviceProfile, settings.useCustomNavigation]
  );
  const [phase, setPhase] = useState<'plan' | 'analysis' | 'dryrun' | 'review' | 'batch' | 'done'>('plan');
  const [busy, setBusy] = useState(false);
  const [dryOutcome, setDryOutcome] = useState<RestyleOutcome | null>(null);
  const [outcomes, setOutcomes] = useState<RestyleOutcome[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<ModificationReviewState | null>(null);
  const snapshotRef = useRef<ModificationSnapshot | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const coreRef = useRef(createAIEngineCore());
  const busyRef = useRef(false);
  useEffect(() => () => { controllerRef.current?.abort(); }, []);

  const styleDirective = useMemo(() => describeTargetStyle(designSystem), [designSystem]);

  const runOne = async (target: RestyleTarget, confirmedScope?: string): Promise<RestyleOutcome> => {
    const binding = getActiveProviderForRole('code');
    if (!binding?.provider) return { target, status: 'failed', message: '未配置可用的 AI Provider' };

    if (target.kind === 'screen') target = { ...target, html: normalizeMobileNavigation(target.html, settings).html };
    const systemPrompt = buildPolishPrompt({
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
    });

    const projectKnowledge = [referenceDevicePrompt(settings), buildProjectKnowledgeContext(useProjectStore.getState(), confirmedScope || '仅润色当前页面UI，保留功能结构文案', target.id)].join('\n\n');
    if (confirmedScope) {
      const result = coreRef.current.streamText({ provider: binding.provider, model: binding.modelId,
        signal: controllerRef.current?.signal, messages: [
          { role: 'system', content: systemPrompt }, { role: 'user', content: `${projectKnowledge}\n\n仅按已确认范围润色，严格保持元素树与文案：\n${target.html}` }
        ] });
      return acceptRestyleResult(target, extractHtml(await result.textPromise), { designSystem, deviceProfile: settings.deviceProfile, useCustomNavigation: settings.useCustomNavigation });
    }
    let raw = '';
    const { promise } = AIService.stream(
      binding.provider,
      binding.modelId,
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `${projectKnowledge}\n\n重塑以下${target.kind === 'component' ? '组件' : '页面'}：\n\n${target.html}` }
      ],
      (ev) => {
        if (ev.type === 'Delta') raw += ev.text;
      }
    );
    await promise;
    return acceptRestyleResult(target, extractHtml(raw), { designSystem, deviceProfile: settings.deviceProfile, useCustomNavigation: settings.useCustomNavigation });
  };

  const analyzeSingle = async () => {
    if (busyRef.current || !plan.dryRun) return;
    busyRef.current = true; setBusy(true); setError(null); setPhase('analysis');
    setAnalysis({ status: 'analyzing', summary: '正在分析原页面的布局、配色和组件表现。', items: [] });
    const controller = new AbortController(); controllerRef.current = controller;
    try {
      const binding = getActiveProviderForRole('code');
      if (!binding?.provider || (!binding.provider.apiKey && binding.provider.protocol !== 'ollama_native')) throw new Error('请先配置可用的 AI Provider。');
      const current = useProjectStore.getState();
      const snapshot = captureModificationSnapshot(current, scope); snapshotRef.current = snapshot;
      const screen = current.screens[scope];
      const result = await analyzeScreenModification(coreRef.current, {
        provider: binding.provider, model: binding.modelId, signal: controller.signal, html: screen.htmlContent, name: screen.name,
        request: '分析可改善的视觉表现，仅建议调整已有节点的class；保持元素结构、文案、data-nid不变，不修改带手动样式覆盖的节点。',
        designSystem, mode: settings.colorMode, deviceProfile: settings.deviceProfile, useCustomNavigation: settings.useCustomNavigation, frameWidth: settings.frameWidth,
        protectedNids: current.getProtectedNids(scope), allowText: false,
        projectKnowledge: [referenceDevicePrompt(current.settings), buildProjectKnowledgeContext(current, '仅改善UI视觉表现', scope)].join('\n\n'),
        context: JSON.stringify({ scopedCss: screen.scopedCss, overrides: Object.entries(current.overrides).filter(([key]) => key.startsWith(`${scope}:`)) })
      });
      if (!isModificationSnapshotCurrent(useProjectStore.getState(), snapshot)) throw new Error('原页面或工程已变化，请重新分析。');
      if (!controller.signal.aborted) setAnalysis({ ...result, status: 'ready' });
    } catch (e) {
      if (!controller.signal.aborted) setAnalysis({ status: 'error', summary: e instanceof Error ? e.message : String(e), items: [] });
    } finally { busyRef.current = false; if (!controller.signal.aborted) setBusy(false); }
  };

  const confirmSingle = async (selected: string[], extra: string, mode: ModificationMode = 'page') => {
    if (!analysis || !snapshotRef.current || !plan.dryRun || busyRef.current) return;
    if (!isModificationSnapshotCurrent(useProjectStore.getState(), snapshotRef.current)) {
      setAnalysis({ ...analysis, status: 'error', summary: '原页面或工程已变化，请重新分析。' }); return;
    }
    const request = buildReviewedModificationRequest(analysis, selected, extra);
    busyRef.current = true; setBusy(true); setError(null);
    controllerRef.current = new AbortController();
    try {
      let outcome: RestyleOutcome;
      if (mode === 'region') throw new Error('纯润色不支持区块结构修改，请选择局部操作或整页润色。');
      if (mode === 'local') {
        const local = getLocalModificationPlan(analysis, selected);
        if (!local) throw new Error('当前选择不能安全局部修改，请重新分析。');
        let operations: unknown = local.operations;
        if (extra.trim()) {
          const binding = getActiveProviderForRole('code');
          if (!binding?.provider || (!binding.provider.apiKey && binding.provider.protocol !== 'ollama_native')) throw new Error('请先配置可用的 AI Provider。');
          operations = mergeLocalEditOperations(local.operations, await generateSupplementedLocalEdits(coreRef.current, {
            provider: binding.provider, model: binding.modelId, signal: controllerRef.current.signal,
            html: plan.dryRun.html, request, allowedNids: local.allowedNids, device: settings.deviceProfile, useCustomNavigation: settings.useCustomNavigation,
            designSystem, mode: settings.colorMode, allowText: false,
            projectKnowledge: [referenceDevicePrompt(useProjectStore.getState().settings), buildProjectKnowledgeContext(useProjectStore.getState(), request, scope)].join('\n\n')
          }));
        }
        const candidate = applyLocalCopyEdits(plan.dryRun.html, operations, { device: settings.deviceProfile, useCustomNavigation: settings.useCustomNavigation,
          allowedNids: local.allowedNids, protectedNids: plan.dryRun.protectedNids, allowText: false });
        outcome = acceptRestyleResult(plan.dryRun, candidate.html, { designSystem, deviceProfile: settings.deviceProfile, useCustomNavigation: settings.useCustomNavigation });
      } else outcome = await runOne(plan.dryRun, request);
      if (controllerRef.current?.signal.aborted) return;
      if (!isModificationSnapshotCurrent(useProjectStore.getState(), snapshotRef.current)) throw new Error('生成期间原页面或工程已变化，请重新分析。');
      if (outcome.status !== 'applied' || !outcome.html) throw new Error(outcome.message || '结构校验未通过，未修改原页面。');
      useProjectStore.getState().stageScreenChange(scope, outcome.html, `${plan.dryRun.name}（润色候选）`);
      useProjectStore.getState().panToScreen(scope); onClose();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { busyRef.current = false; setBusy(false); }
  };

  const doDryRun = async () => {
    if (!plan.dryRun) return;
    setBusy(true);
    setError(null);
    try {
      const o = await runOne(plan.dryRun);
      setDryOutcome(o);
      setPhase('review');
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const doBatch = async () => {
    setBusy(true);
    setPhase('batch');
    const results: RestyleOutcome[] = [];
    // 试跑结果先落地，避免重复调用
    if (dryOutcome?.status === 'applied') {
      snapshotAndApply(dryOutcome);
      results.push(dryOutcome);
    }
    for (const target of plan.queue.slice(1)) {
      const o = await runOne(target);
      if (o.status === 'applied') snapshotAndApply(o);
      results.push(o);
      setOutcomes([...results]);
    }
    setBusy(false);
    setPhase('done');
  };

  /** 每个目标落地前自动 Checkpoint，与 §6.4 Polish 保持一致，支持秒级回退 */
  const snapshotAndApply = (o: RestyleOutcome) => {
    if (o.target.kind === 'screen') {
      const sc = screens[o.target.id];
      if (sc) {
        addCheckpoint(`风格重塑前备份: ${sc.name}`, {
          screenId: sc.id,
          htmlContent: sc.htmlContent,
          scopedCss: sc.scopedCss
        });
      }
    }
    applyRestyleOutcome(o);
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
          <button onClick={onClose} disabled={busy && phase !== 'analysis'} className="text-slate-400 hover:text-slate-200 p-1 disabled:opacity-40">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3 overflow-y-auto text-xs">
          {/* 预估消耗：执行前必须让用户知道要花多少 */}
          <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
            <div className="flex items-center justify-between text-slate-300">
              <span className="font-semibold">执行计划</span>
              <span className="text-slate-400">
                预计 <span className="text-blue-400 font-semibold">{plan.estimatedCalls + (isSingle ? 1 : 0)}</span> 次 AI 调用
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
                    每个目标落地前自动创建 Checkpoint，可随时回退；结构被改动的结果会被直接拒绝，不会落盘。
                  </>
                )}
              </span>
            </div>
          )}

          {phase === 'analysis' && analysis && <ModificationReviewCard review={analysis} disabled={busy}
            onConfirm={confirmSingle} onCancel={onClose} onRetry={analyzeSingle} />}

          {phase === 'review' && dryOutcome && (
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
              <div className="font-semibold text-slate-200">试跑结果：{dryOutcome.target.name}</div>
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
              ) : (
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
                执行进度 {outcomes.length} / {plan.queue.length}
              </div>
              {summary && (
                <div className="text-slate-400 leading-relaxed">
                  已应用 {summary.applied}，结构被拒 {summary.structureRejected}，失败 {summary.failed}
                  {summary.textDrift > 0 && `，${summary.textDrift} 处文案变化待核对`}
                </div>
              )}
              {summary?.details.map((d, i) => (
                <div key={i} className="text-amber-300/90">• {d}</div>
              ))}
            </div>
          )}

          {error && <div className="text-rose-400">{error}</div>}
        </div>

        <div className="p-4 border-t border-slate-800 flex items-center justify-end gap-2">
          <button onClick={onClose} disabled={busy && phase !== 'analysis'} className="px-3 py-1.5 text-slate-300 hover:text-slate-100 text-xs disabled:opacity-40">
            {phase === 'done' ? '完成' : '取消'}
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
              <button onClick={() => setPhase('plan')} className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded-lg">
                重新试跑
              </button>
              <button
                onClick={doBatch}
                disabled={dryOutcome?.status !== 'applied'}
                title={dryOutcome?.status !== 'applied' ? '试跑未通过，不能批量执行' : undefined}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-medium rounded-lg"
              >
                确认效果，批量执行剩余 {plan.queue.length - 1} 项
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
