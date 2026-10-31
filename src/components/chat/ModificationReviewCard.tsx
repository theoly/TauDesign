import React, { useId, useRef, useState } from 'react';
import { getLocalModificationPlan, getRegionModificationPlan, type ModificationMode, type ModificationReviewState } from '../../services/ai/modificationReview';

export const ModificationReviewCard: React.FC<{
  review: ModificationReviewState; disabled?: boolean;
  onConfirm: (selected: string[], extra: string, mode: ModificationMode) => void | Promise<void>;
  onCancel: () => void; onRetry?: () => void;
}> = ({ review, disabled, onConfirm, onCancel, onRetry }) => {
  const [selected, setSelected] = useState<string[]>([]);
  const [extra, setExtra] = useState('');
  const [requestedMode, setRequestedMode] = useState<'auto' | ModificationMode>('auto');
  const modeGroup = useId();
  const localPlan = getLocalModificationPlan(review, selected);
  const regionPlan = getRegionModificationPlan(review, selected);
  const recommendedMode: ModificationMode = localPlan ? 'local' : regionPlan ? 'region' : 'page';
  const mode: ModificationMode = requestedMode === 'auto' ? recommendedMode : requestedMode;
  const submitting = useRef(false);
  const [busy, setBusy] = useState(false);
  const ready = review.status === 'ready';
  const locked = disabled || busy || !ready;
  return <section data-testid="modification-review" className="p-3 border border-blue-500/30 bg-slate-950/70 rounded-xl space-y-3 text-xs text-slate-200">
    <h3 className="font-semibold">{review.status === 'analyzing' ? '正在分析原页面…' : '选择本次修改内容'}</h3>
    <p className="text-slate-400">{review.summary}</p>
    {review.evidence && <details className="space-y-1 text-[11px] text-slate-400">
      <summary className="cursor-pointer">查看分析检查记录</summary>
      <p className="break-all">任务 {review.evidence.taskId} · {review.evidence.analysisFingerprint}</p>
      <p>已检查输出格式，共请求 {review.evidence.attempts} 次{review.evidence.attempts > 1 ? '（含一次格式纠正）' : ''}。此记录不代表视觉验收通过。</p>
      {review.evidence.downgrades.map(item => <p key={item.id} className="text-amber-300">{review.items.find(s=>s.id===item.id)?.title ?? item.id}：{item.reason} 需由用户选择其它执行方式。</p>)}
    </details>}
    {ready && <>
      <p className="text-[11px] text-slate-400">基于页面结构与样式分析；勾选需要修改的项，也可只填写补充要求。</p>
      <div className="max-h-80 overflow-y-auto space-y-2">{review.items.map(item => <label key={item.id} className="flex items-start gap-2 p-2 rounded-lg border border-slate-700 cursor-pointer">
        <input type="checkbox" disabled={locked} checked={selected.includes(item.id)} className="mt-0.5" onChange={e => { setSelected(prev => e.target.checked ? [...prev, item.id] : prev.filter(id => id !== item.id)); setRequestedMode('auto'); }} />
        <span className="space-y-1 min-w-0"><strong className="block">{item.title}</strong><span className="block text-slate-400">{item.reason}</span><span className="block text-slate-300">建议：{item.change}</span><span className="block text-[10px] text-blue-300">{item.scope === 'local' ? '可局部修改' : item.scope === 'region' ? '可完整区块修改' : '整页调整'}</span></span>
      </label>)}</div>
      <textarea aria-label="补充修改要求" value={extra} disabled={locked} onChange={e => setExtra(e.target.value)} placeholder="补充具体要求，如保留现有配色，只调整信息层级…" className="w-full min-h-20 p-2 bg-slate-900 border border-slate-700 rounded-lg resize-y" />
      <fieldset className="space-y-2 border border-slate-700 p-2 rounded-lg">
        <legend className="px-1 text-slate-400">执行方式</legend>
        <label className="flex items-center gap-2"><input name={modeGroup} type="radio" checked={mode === 'local'} disabled={locked || !localPlan} onChange={() => setRequestedMode('local')} />复制后局部修改{localPlan ? '（推荐）' : ''}</label>
        <label className="flex items-center gap-2"><input name={modeGroup} type="radio" checked={mode === 'region'} disabled={locked || !regionPlan} onChange={() => setRequestedMode('region')} />复制后完整区块修改{recommendedMode === 'region' ? '（推荐）' : ''}</label>
        <label className="flex items-center gap-2"><input name={modeGroup} type="radio" checked={mode === 'page'} disabled={locked} onChange={() => setRequestedMode('page')} />整页改写</label>
        <p className="text-[11px] text-slate-400">{localPlan ? '推荐局部操作，仅修改已选节点。' : regionPlan ? '推荐完整区块修改，仅替换所选区块并保留其他区域。' : '当前选择缺少明确局部位置或改动范围较大，可明确选择整页改写。'}补充要求超出所选范围时会停下提示，不会自动整页改写。</p>
      </fieldset>
      <div className="flex gap-2">
        <button type="button" disabled={locked || (!selected.length && !extra.trim()) || (mode === 'local' && !localPlan) || (mode === 'region' && !regionPlan)} onClick={async () => {
          if (submitting.current) return;
          submitting.current = true; setBusy(true);
          try { await onConfirm(selected, extra, mode); } finally { submitting.current = false; setBusy(false); }
        }} className="px-3 py-2 bg-blue-600 rounded-lg disabled:opacity-40">按所选内容生成新版</button>
        <button type="button" disabled={disabled || busy} onClick={onCancel} className="px-2 py-2 text-slate-400">取消修改</button>
      </div>
    </>}
    {review.status === 'error' && <div className="flex gap-3">
      {onRetry && <button type="button" disabled={disabled} onClick={onRetry} className="text-blue-400">重新分析</button>}
      <button type="button" disabled={disabled} onClick={onCancel} className="text-slate-400">取消修改</button>
    </div>}
    {review.status === 'submitted' && <p className="text-blue-300">已确认修改内容，执行结果见后续消息。</p>}
    {review.status === 'cancelled' && <div className="space-y-2"><p className="text-slate-400">本次修改已取消。</p>
      {onRetry&&<button type="button" disabled={disabled} onClick={onRetry} className="text-blue-400">重新分析</button>}
    </div>}
  </section>;
};
