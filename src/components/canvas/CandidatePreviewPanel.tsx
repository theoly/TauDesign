import React from 'react';
import { useT } from '../../stores/useLocaleStore';
import { useProjectStore } from '../../stores/useProjectStore';
import { contentFingerprint } from '../../services/ai/designWorkflow';
import { StoredPagePreview } from './StoredPagePreview';

export function CandidatePreviewPanel({ active }: { active: boolean }) {
  const t = useT();
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
  const statusText = stale
    ? t('quality.candidatePreviewStale')
    : !fresh
      ? t('quality.candidatePreviewHistoryWait')
      : t('quality.candidatePreviewRecent');
  return <section aria-label={t('quality.candidatePreviewTitle')} className="space-y-2 border-t border-slate-800 pt-3">
    <div className="flex items-center justify-between gap-2">
      <p className="font-semibold text-slate-300">{t('quality.candidatePreviewTitle')}</p>
      <button type="button" disabled={!canCapture || pending} onClick={() => void state.captureStagedPreview(true)}
        className="shrink-0 rounded bg-slate-800 px-2 py-1 text-slate-300 disabled:opacity-50">{t('quality.candidatePreviewRegen')}</button>
    </div>
    {pending && <p role="status" className="text-slate-400">{t('quality.candidatePreviewPending')}</p>}
    {!canCapture && !pending && <p className="text-slate-500">{t('quality.candidatePreviewWaitRender')}</p>}
    {preview && <p className="text-amber-300">{statusText}{t('quality.candidatePreviewNotForAdopt')}</p>}
    <StoredPagePreview preview={preview} projectId={state.id} folderPath={state.folderPath}
      owner={{ kind: 'candidate', id: candidate.candidateId }} name={t('quality.candidatePreviewName', { name: candidate.screenName })} active={active} />
  </section>;
}
