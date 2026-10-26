import React from 'react';
import { useProjectStore } from '../../stores/useProjectStore';
import { contentFingerprint } from '../../services/ai/designWorkflow';
import { StoredPagePreview } from './StoredPagePreview';

export function CandidatePreviewPanel({ active }: { active: boolean }) {
  const state = useProjectStore();
  const candidate = state.stagedScreen;
  if (!candidate?.candidateId) return null;
  const key = state.getStagedRenderContextKey();
  const preview = state.stagedPreview?.report ?? candidate.preview;
  const pending = state.stagedPreview?.key === key && state.stagedPreview.pending;
  const stale = preview && preview.contextFingerprint !== contentFingerprint(key);
  const fresh = state.stagedPreview?.key === key && !state.stagedPreview.pending && !stale;
  const canCapture = state.stagedAdoptionStatus !== 'saving' && state.stagedRenderQuality?.key === key &&
    state.stagedRenderQuality.report.status === 'complete';
  return <section aria-label="候选首屏预览" className="space-y-2 border-t border-slate-800 pt-3">
    <div className="flex items-center justify-between gap-2">
      <p className="font-semibold text-slate-300">候选首屏预览</p>
      <button type="button" disabled={!canCapture || pending} onClick={() => void state.captureStagedPreview(true)}
        className="shrink-0 rounded bg-slate-800 px-2 py-1 text-slate-300 disabled:opacity-50">重新生成预览</button>
    </div>
    {pending && <p role="status" className="text-slate-400">正在生成首屏预览，不影响本次采纳检查…</p>}
    {!canCapture && !pending && <p className="text-slate-500">当前 iframe 检查完成后生成新预览。</p>}
    {preview && <p className="text-amber-300">{stale ? '历史图片（上下文已变化，待重新生成）' : !fresh ? '历史图片（等待本次捕获）' : '最近捕获的外观快照'}；图片不用于本次采纳判定。</p>}
    <StoredPagePreview preview={preview} projectId={state.id} folderPath={state.folderPath}
      owner={{ kind: 'candidate', id: candidate.candidateId }} name={`${candidate.screenName} · 候选首屏预览`} active={active} />
  </section>;
}
