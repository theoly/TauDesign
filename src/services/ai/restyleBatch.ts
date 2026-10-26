import type { Asset, DesignSystemOrigin } from '../../types/project';
import { knowledgeFingerprint, type KnowledgeState } from './projectKnowledge';
import { contentFingerprint } from './designWorkflow';
import type { RestyleOutcome, RestylePlan, RestyleTarget } from './restyleService';

/** Ignore canvas positions/measurement but include every input that can change the style/content task. */
export function restyleContextKey(state: KnowledgeState & { assets: Record<string, Asset>; designSystemOrigin?: DesignSystemOrigin }): string {
  return contentFingerprint(JSON.stringify([state.id, state.folderPath, knowledgeFingerprint(state), state.designSystemOrigin,
    state.projectDocuments, Object.entries(state.screens).sort(([a],[b])=>a.localeCompare(b)).map(([id,s])=>[id,s.metadata]),
    Object.entries(state.assets).sort(([a],[b])=>a.localeCompare(b))]));
}

export interface RestyleBatchResult {
  status: 'completed' | 'cancelled' | 'stale';
  outcomes: RestyleOutcome[];
  remaining: number;
  message?: string;
}

export interface RestyleApplicationResult {
  applied: boolean;
  message?: string;
  validation?: RestyleOutcome['validation'];
  delivery?: RestyleOutcome['delivery'];
  /** Exact context immediately after the synchronous commit, before asynchronous archive finalization. */
  appliedContextKey?: string;
}

/** Sequential, cancellable orchestration shared by the batch UI; model success alone never counts as application. */
export async function executeRestyleBatch(options: {
  plan: RestylePlan; dryRun: RestyleOutcome; confirmedContextKey: string;
  getContextKey: () => string; resolveTarget: (target: RestyleTarget) => RestyleTarget | null;
  generate: (target: RestyleTarget) => Promise<RestyleOutcome>;
  apply: (outcome: RestyleOutcome) => boolean | RestyleApplicationResult | Promise<boolean | RestyleApplicationResult>;
  signal?: AbortSignal; onProgress?: (outcomes: RestyleOutcome[]) => void;
}): Promise<RestyleBatchResult> {
  const plan = structuredClone(options.plan), dryRun = structuredClone(options.dryRun);
  const outcomes: RestyleOutcome[] = [];
  const batchId = `restyle-batch-${crypto.randomUUID()}`;
  let expected = options.confirmedContextKey;
  const stop = (): RestyleBatchResult | undefined => options.signal?.aborted
    ? {status:'cancelled',outcomes,remaining:plan.queue.length-outcomes.length,message:'批量重塑已停止，已应用的修改可通过历史撤销。'}
    : options.getContextKey() !== expected
      ? {status:'stale',outcomes,remaining:plan.queue.length-outcomes.length,message:'工程或任务上下文已变化，剩余重塑已停止；请重新试跑。'} : undefined;
  const invalid = stop(); if (invalid) return invalid;
  if (!plan.queue.length || dryRun.status !== 'applied' || !dryRun.html || dryRun.target.id !== plan.queue[0].id ||
    dryRun.target.kind !== plan.queue[0].kind || dryRun.target.html !== plan.queue[0].html) {
    return {status:'stale',outcomes,remaining:plan.queue.length,message:'缺少与确认队列对应的有效试跑结果，请重新试跑。'};
  }
  for (let index=0; index<plan.queue.length; index++) {
    const interrupted = stop(); if (interrupted) return interrupted;
    const target = options.resolveTarget(plan.queue[index]);
    if (!target || (index===0 && target.html !== dryRun.target.html)) return {status:'stale',outcomes,remaining:plan.queue.length-outcomes.length,message:'重塑目标已删除或试跑基线变化，请重新试跑。'};
    let outcome: RestyleOutcome;
    try { outcome = index===0 ? dryRun : await options.generate(structuredClone(target)); }
    catch (error) { outcome = {target,status:'failed',message:error instanceof Error ? error.message : '重塑执行失败'}; }
    const afterGeneration = stop(); if (afterGeneration) return afterGeneration;
    if (outcome.target.id !== target.id || outcome.target.kind !== target.kind || outcome.target.html !== target.html) {
      outcome = {target,status:'skipped_conflict',message:'结果与本轮目标或基线不匹配，未应用。'};
    } else if (outcome.status === 'applied') {
      outcome = {...outcome,batchId};
      try {
        const application = await options.apply(outcome);
        const result = typeof application === 'boolean' ? {applied:application} : application;
        if (result.validation) outcome = {...outcome,validation:result.validation};
        if (result.delivery) outcome = {...outcome,delivery:result.delivery};
        if (result.applied) expected = result.appliedContextKey ?? options.getContextKey();
        else outcome = {...outcome,status:'skipped_conflict',message:result.message ?? '结果未通过应用前复核，未修改目标。'};
      } catch (error) { outcome = {...outcome,status:'failed',message:error instanceof Error ? error.message : '应用失败'}; }
    }
    outcomes.push(outcome);
    options.onProgress?.([...outcomes]);
  }
  return stop() ?? {status:'completed',outcomes,remaining:0};
}
